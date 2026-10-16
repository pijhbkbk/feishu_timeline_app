from collections import Counter, defaultdict
import datetime as dt
import math
import re

def normalize_workbook(book, mapping):
    B=book
    SHA=B['sourceSha256']; SHEETS={s['name']:s for s in B['sheets']}
    CELLS={sn:{c['coordinate']:c for r in s['rows'] for c in r['cells']} for sn,s in SHEETS.items()}
    def number(v): return type(v) in (int,float) and math.isfinite(v)
    def raw(sn,coord): return CELLS[sn][coord]['value']['value']
    def field(sn,coord,merge=True):
        c=CELLS[sn][coord]; a=c['merge']['anchor'] if merge and c['merge'] else coord
        e=CELLS[sn][a]
        return {'cell':coord,'raw':c['value'],'blankKind':c['blankKind'],'numberFormat':c['numberFormat'],
                'sourceAnchor':a,'mergeRange':c['merge']['range'] if c['merge'] else None,
                'effectiveValue':e['value']['value'],'effectiveType':e['value']['type'],
                'formula':e['formula'],'cachedValue':e['cachedValue']}
    def ref(sn,rows): return {'sheet':sn,'rows':list(rows),'workbookSha256':SHA}
    def ident(kind,sn,row,extra=''):
        return f'{kind}-{B["sheetNames"].index(sn)+1:02d}-{row:04d}'+('-'+extra if extra else '')
    def date_value(f):
        v=f['effectiveValue']
        if v is None:return {'value':None,'status':'MISSING','raw':v}
        if f['effectiveType'] in ('date','datetime'):
            return {'value':v[:10],'sourceDateTime':v,'timezone':None,'status':'EXPLICIT_EXCEL_DATE','raw':v}
        m=re.fullmatch(r'(\d{4})[./-](\d{1,2})[./-](\d{1,2})',str(v))
        if m:
            try:return {'value':dt.date(*map(int,m.groups())).isoformat(),'status':'EXPLICIT_TEXT_DATE','raw':v}
            except ValueError:pass
        return {'value':None,'status':'PENDING_REVIEW','raw':v}
    def limit(v):
        if v is None:return {'kind':'MISSING','raw':None,'lower':None,'upper':None}
        if v=='/':return {'kind':'SOURCE_SLASH_MARKER','raw':v,'lower':None,'upper':None,'interpretation':'PENDING_REVIEW'}
        m=re.fullmatch(r'±(\d+(?:\.\d+)?)',str(v))
        if m and math.isfinite(float(m[1])):return {'kind':'SYMMETRIC_DELTA','raw':v,'lower':-float(m[1]),'upper':float(m[1])}
        m=re.fullmatch(r'≤(\d+(?:\.\d+)?)',str(v))
        if m and math.isfinite(float(m[1])):return {'kind':'MAX_INCLUSIVE','raw':v,'lower':None,'upper':float(m[1])}
        m=re.fullmatch(r'([+-]?\d+(?:\.\d+)?)~([+-]?\d+(?:\.\d+)?)',str(v))
        if m and all(math.isfinite(float(n)) for n in m.groups()) and float(m[1])<=float(m[2]):return {'kind':'DELTA_INTERVAL','raw':v,'lower':float(m[1]),'upper':float(m[2])}
        return {'kind':'PENDING_REVIEW','raw':v,'lower':None,'upper':None}
    
    
    CONFIG=mapping.get('baseSections',[])
    colors=[]; row_labels=defaultdict(list); issues=[]
    for cfg in CONFIG:
        sn=cfg['sheet']
        starts=[r for r in range(cfg['start'],cfg['end']+1) if any(raw(sn,col+str(r)) is not None for col in ('A','B','C'))]
        groups={}; covered=set()
        for n,r in enumerate(starts):
            end=r
            for col in ('B','A','C'):
                merged=CELLS[sn][col+str(r)]['merge']
                if merged and merged['anchor']==col+str(r):
                    end=int(re.search(r'\d+$',merged['range']).group())
                    break
            end=min(end,cfg['end'],starts[n+1]-1 if n+1<len(starts) else cfg['end'])
            groups[r]=range(r,end+1);covered.update(groups[r])
        orphan_rows=set()
        for r in range(cfg['start'],cfg['end']+1):
            if r not in covered and any(c['value']['value'] is not None for c in SHEETS[sn]['rows'][r-1]['cells']):
                groups[r]=range(r,r+1);orphan_rows.add(r)
        for r,rows in sorted(groups.items()):
            fs={k:field(sn,col+str(r)) for k,col in cfg['fields'].items()}
            vals={k:v['effectiveValue'] for k,v in fs.items()}
            rec={'id':ident('base-color',sn,r),'source':ref(sn,rows),'baseCode':cfg['base'],'productionBase':sn,
                 'sectionRaw':cfg['section'],'titleRaw':raw(sn,'A'+str(cfg['title'])),'reviewStatus':'UNREVIEWED',
                 **vals,'fieldProvenance':fs,'substrate':None,'substrateStatus':'NOT_PROVIDED_IN_WORKBOOK',
                 'issueDate':date_value(fs['issueDate']),
                 'expiryDate':date_value(fs['expiryDate']) if 'expiryDate' in fs else {'value':None,'status':'SOURCE_COLUMN_ABSENT','raw':None},
                 'measurementCondition':{'raw':raw(sn,cfg['angle']+str(cfg['header'])),'sourceCell':cfg['angle']+str(cfg['header']),'illuminant':'D65' if raw(sn,cfg['angle']+str(cfg['header']))=='D65/10°' else None,'observerDegrees':10 if raw(sn,cfg['angle']+str(cfg['header']))=='D65/10°' else None,'instrument':None,'method':None},
                 'measurements':[],'issues':[]}
            for rr in rows:
                af=field(sn,cfg['angle']+str(rr)); angle=af['effectiveValue']
                lf=[field(sn,col+str(rr)) for col in cfg['lab']]
                mf={k:field(sn,col+str(rr)) for k,col in cfg['limits'].items()}
                ma=re.fullmatch(r'(\d+(?:\.\d+)?)°',str(angle))
                m={'id':ident('measurement',sn,rr),'sourceRow':rr,'angleRaw':angle,'angleDegrees':float(ma[1]) if ma else None,
                   'l':lf[0]['effectiveValue'],'a':lf[1]['effectiveValue'],'b':lf[2]['effectiveValue'],
                   'fieldProvenance':{'angle':af,'l':lf[0],'a':lf[1],'b':lf[2],**mf},
                   'controlLimits':{k:limit(v['effectiveValue']) for k,v in mf.items()},
                   'qualityStatus':'RECORDED' if ma and all(number(x['effectiveValue']) for x in lf) else 'PENDING_REVIEW'}
                rec['measurements'].append(m);row_labels[(sn,rr)].append({'kind':'BASE_COLOR_MEASUREMENT','id':rec['id']})
            if r in orphan_rows:rec['issues'].append({'code':'UNASSIGNED_ROW_WITHOUT_MERGED_IDENTITY','row':r})
            for k in ('colorName','colorCode','manufacturer'):
                if vals.get(k) is None:rec['issues'].append({'code':'MISSING_'+k.upper(),'cell':fs[k]['cell']})
            if rec['issueDate']['value'] is None:rec['issues'].append({'code':'MISSING_ISSUE_DATE','cell':fs['issueDate']['cell']})
            if 'expiryDate' in fs and rec['expiryDate']['value'] is None:rec['issues'].append({'code':'MISSING_EXPIRY_DATE','cell':fs['expiryDate']['cell']})
            if 'boardQuantity' in fs and vals['boardQuantity'] is None:rec['issues'].append({'code':'MISSING_BOARD_QUANTITY','cell':fs['boardQuantity']['cell']})
            if any(m['qualityStatus']=='PENDING_REVIEW' for m in rec['measurements']):rec['issues'].append({'code':'MISSING_MEASUREMENT','rows':list(rows)})
            for m in rec['measurements']:
                if number(m['l']) and m['l']>100:rec['issues'].append({'code':'SOURCE_L_ABOVE_100_REVIEW_WITHOUT_CLAMPING','cell':m['fieldProvenance']['l']['cell']})
            if rec.get('remark') in mapping.get('lifecycleRemarkMarkers',[]):rec['issues'].append({'code':'STATUS_IS_SOURCE_REMARK_ONLY','cell':fs['remark']['cell']})
            if rec.get('remark') in mapping.get('crossBaseReferenceMarkers',[]):rec['issues'].append({'code':'CROSS_BASE_STANDARD_REFERENCE_UNRESOLVED','cell':fs['remark']['cell']})
            matches=[h for h in mapping.get('hueRules',[]) if h['exactName']==vals['colorName'] and sn in h['bases']]
            if len(matches)>1: raise ValueError('Ambiguous hue mapping configuration')
            rec['hueCandidateId']=matches[0]['id'] if matches else 'hue-isolated-'+rec['id']
            rec['hueMappingReason']='EXPLICIT_MAPPING_RULE' if matches else 'NO_AUTOMATIC_CROSS_RECORD_MERGE'
            colors.append(rec)

    # Auxiliary tables remain separate source facts; no directory or color identity joins.
    entities = defaultdict(list)
    for section_index, cfg in enumerate(mapping.get('entitySections', [])):
        sn = cfg['sheet']
        for r in range(cfg['start'], cfg['end'] + 1):
            fs = {k: field(sn, col + str(r)) for k, col in cfg['fields'].items()}
            rec = {'id': ident(cfg['kind'], sn, r, str(section_index)), 'source': ref(sn, [r]),
                   'sectionRaw': cfg.get('section'), 'fields': fs, 'reviewStatus': 'UNREVIEWED',
                   'linkStatus': 'PENDING_REVIEW', 'context': {k: field(sn, coord) for k, coord in cfg.get('contextCells', {}).items()},
                   'issues': list(cfg.get('reviewFlags', []))}
            rec['dates'] = {k: date_value(fs[k]) for k in cfg.get('dateFields', [])}
            for k in cfg.get('requiredSourceFields', []):
                if fs[k]['effectiveValue'] is None:
                    rec['issues'].append('MISSING_' + k.upper())
            if cfg.get('dateOrder'):
                first, last = cfg['dateOrder']
                if rec['dates'][first]['value'] and rec['dates'][last]['value'] and rec['dates'][last]['value'] < rec['dates'][first]['value']:
                    rec['issues'].append('SOURCE_DATE_ORDER_REQUIRES_REVIEW')
            entities[cfg['kind']].append(rec)
            row_labels[(sn, r)].append({'kind': cfg['kind'], 'id': rec['id']})

    production = []
    aggregates = []
    for cfg in mapping.get('productionSections', []):
        sn = cfg['sheet']; head = cfg['header']
        for r in range(cfg['start'], cfg['end'] + 1):
            name = raw(sn, cfg['nameColumn'] + str(r))
            rec = {'id': ident('production', sn, r), 'source': ref(sn, [r]), 'year': cfg['year'],
                   'baseCodeCandidate': cfg['base'], 'sectionLabelRaw': raw(sn, cfg['nameColumn'] + str(head)),
                   'colorNameRaw': name, 'reviewStatus': 'UNREVIEWED', 'joinStatus': 'PENDING_REVIEW',
                   'rowKind': 'NAMED_PRODUCTION' if name is not None else 'UNNAMED_SOURCE_ROW_PENDING_REVIEW',
                   'months': [{'monthPosition': i + 1, 'sourceHeader': field(sn, col + str(head)), **field(sn, col + str(r))}
                              for i, col in enumerate(cfg['monthColumns'])],
                   'reportedTotals': [{'sourceHeader': field(sn, col + str(head)), **field(sn, col + str(r))}
                                      for col in cfg['totalColumns']],
                   'exactLiteralNameBaseCandidates': [c['id'] for c in colors if c['baseCode'] == cfg['base'] and c['colorName'] == name],
                   'quantitySemantics': 'BLANK_UNKNOWN; ZERO_EXPLICIT; TOTALS_NOT_ADDED_TO_DETAIL'}
            production.append(rec)
            row_labels[(sn, r)].append({'kind': 'PRODUCTION_CANDIDATE', 'id': rec['id']})
        if cfg.get('totalRow'):
            r = cfg['totalRow']
            aggregates.append({'source': ref(sn, [r]), 'kind': 'AGGREGATE_DO_NOT_ADD_TO_DETAIL',
                               'headerRow': head, 'baseCodeCandidate': cfg['base'], 'year': cfg['year'],
                               'cells': {col: field(sn, col + str(r)) for col in [cfg['nameColumn'], *cfg['monthColumns'], *cfg['totalColumns']]}})
            row_labels[(sn, r)].append({'kind': 'PRODUCTION_AGGREGATE'})

    ledger = []
    for si, s in enumerate(B['sheets']):
        for r in s['rows']:
            nonempty = [c['coordinate'] for c in r['cells'] if c['value']['value'] is not None]
            ledger.append({'sheet': s['name'], 'row': r['row'], 'hidden': r['hidden'], 'nonemptyCells': nonempty,
                           'classifications': row_labels[(s['name'], r['row'])] or [{'kind': 'HEADER_NOTE_OR_UNMAPPED_NONEMPTY' if nonempty else 'BLANK_ROW_PRESERVED'}],
                           'rawRowLocation': f'rawWorkbook.sheets[{si}].rows[{r["row"]-1}]'})
    blank_kinds = Counter()
    for s in B['sheets']:
        blank_kinds.update(s['counts']['blankKinds'])
    measures = [m for c in colors for m in c['measurements']]
    base_counts = [{'base': sn, 'records': sum(c['productionBase'] == sn for c in colors),
                    'measurementRows': sum(len(c['measurements']) for c in colors if c['productionBase'] == sn)}
                   for sn in dict.fromkeys(c['productionBase'] for c in colors)]
    counts = {'sheets': len(B['sheets']), 'rowsPreserved': len(ledger), 'blankRowsPreserved': sum(not r['nonemptyCells'] for r in ledger),
              'rectangularCellsPreserved': sum(s['counts']['rectangularCells'] for s in B['sheets']),
              'nativeCellsPreserved': sum(s['counts']['xmlCells'] for s in B['sheets']), 'blankKinds': dict(blank_kinds),
              'formulas': sum(s['counts']['formulas'] for s in B['sheets']), 'sourceUnchanged': B['sourceSha256'] == B['sourceAfterSha256'],
              'baseColorCandidates': len(colors), 'baseCounts': base_counts, 'measurementRows': len(measures),
              'explicitAngleRows': sum(m['angleDegrees'] is not None for m in measures),
              'completeLabRows': sum(all(number(m[k]) for k in ('l', 'a', 'b')) for m in measures),
              'multiAngleRecords': sum(sum(m['angleDegrees'] is not None for m in c['measurements']) > 1 for c in colors),
              'productionRowsIncludingUnnamed': len(production), 'productionNamedRows': sum(p['colorNameRaw'] is not None for p in production),
              'productionMonthlyCellsIncludingMissing': sum(len(p['months']) for p in production),
              'productionAggregateRows': len(aggregates), 'entityCounts': {kind: len(records) for kind, records in entities.items()}}
    return {'schemaVersion': 'source-analysis-candidate-v2', 'status': 'PRIVATE_PROPOSAL_NOT_IMPORTED', 'sourceSha256': SHA,
            'rules': {'sourceCandidateKey': '(sourceSha256, candidate.id)', 'noAutomaticIdentityMerge': True,
                      'noBlankToZero': True, 'mergedValuesOnlyViaActualMergeRange': True, 'noForwardFillOutsideMerge': True,
                      'sourceDateTimesHaveNoTimezone': True, 'formulasNotCalculatedOrExecuted': True,
                      'allProductionJoinsPendingReview': True, 'sourceNotesAreDataNotInstructions': True},
            'counts': counts, 'rawWorkbook': B, 'sectionMappings': mapping, 'baseColorCandidates': colors,
            'hueMappings': [{'id': h['id'], 'name': h['exactName'], 'basis': 'EXPLICIT_MAPPING_RULE',
                             'baseColorCandidateIds': [c['id'] for c in colors if c['hueCandidateId'] == h['id']],
                             'doesNotUnifyCodesSuppliersVersionsOrLimits': True} for h in mapping.get('hueRules', [])],
            **entities, 'productionCandidates': production, 'productionAggregateEvidence': aggregates,
            'rowPreservationLedger': ledger}
