"""Synthetic OOXML fixtures only; no private workbook contents or paths."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from xml.sax.saxutils import escape

from io_utils import JsonOutputBudget, OutputLimitError
from parse_workbook import parse
from normalize_workbook import normalize_workbook

NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
RELS = 'http://schemas.openxmlformats.org/package/2006/relationships'
OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

def text_cell(coord, value):
    return f'<c r="{coord}" t="inlineStr"><is><t xml:space="preserve">{escape(value)}</t></is></c>'

def synthetic_source(path):
    headers = {'A1':'Sequence','B1':'Name','C1':'Code','D1':'Maker','E1':'Issued','F1':'Quantity','G1':'Coating','H1':'D65/10°','I1':'L*','J1':'a*','K1':'b*','L1':'Delta E'}
    rows = [f'<row r="1">{"".join(text_cell(k,v) for k,v in headers.items())}</row>']
    rows.append('<row r="2">' + text_cell('B2','Synthetic\nmetal') + text_cell('C2','FIX-A') + text_cell('D2','Fixture maker')
                + '<c r="E2" s="1"><v>45000.5</v></c><c r="F2"><v>0</v></c>' + text_cell('G2','Fixture coating')
                + text_cell('H2','25°') + '<c r="I2"><v>50</v></c><c r="J2"><v>-1</v></c><c r="K2"><v>2</v></c>'
                + text_cell('L2','/') + '<c r="N2"><f>SUM(F2:F3)</f><v>7</v></c></row>')
    rows.append('<row r="3">' + text_cell('H3','75°') + '<c r="I3"><v>30</v></c><c r="J3"><v>-2</v></c><c r="K3"><v>3</v></c><c r="L3"/></row>')
    rows.append('<row r="4">' + text_cell('B4','Synthetic incomplete') + text_cell('E4','2024.1.2') + text_cell('H4','45°')
                + '<c r="I4" t="b"><v>0</v></c><c r="J4"/></row>')
    rows.append('<row r="5" hidden="1">' + text_cell('B5','Synthetic complete') + text_cell('H5','45°')
                + '<c r="I5"><v>1</v></c><c r="J5"><v>0</v></c><c r="K5"><v>-1</v></c>' + text_cell('L5','≤1.5') + '</row>')
    sheet = f'<worksheet xmlns="{NS}"><dimension ref="A1:O5"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="15" max="15" hidden="1"/></cols><sheetData>{"".join(rows)}</sheetData><mergeCells count="1"><mergeCell ref="B2:B3"/></mergeCells></worksheet>'
    styles = f'<styleSheet xmlns="{NS}"><fonts count="1"><font><name val="Calibri"/><sz val="11"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
    parts = {
        '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
        '_rels/.rels': f'<Relationships xmlns="{RELS}"><Relationship Id="rId1" Type="{OFFICE}/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        'xl/workbook.xml': f'<workbook xmlns="{NS}" xmlns:r="{OFFICE}"><sheets><sheet name="Fixture" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': f'<Relationships xmlns="{RELS}"><Relationship Id="rId1" Type="{OFFICE}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="{OFFICE}/styles" Target="styles.xml"/></Relationships>',
        'xl/worksheets/sheet1.xml': sheet, 'xl/styles.xml': styles,
    }
    with ZipFile(path, 'w', compression=ZIP_DEFLATED) as archive:
        for name, contents in parts.items():
            archive.writestr(name, contents)

def synthetic_mapping():
    return {'schemaVersion':'color-register-source-map-v1', 'baseSections':[
        {'sheet':'Fixture','base':'FIXTURE','section':None,'title':1,'header':1,'start':2,'end':5,
         'fields':{'serial':'A','colorName':'B','colorCode':'C','manufacturer':'D','issueDate':'E','boardQuantity':'F','paintType':'G'},
         'angle':'H','lab':['I','J','K'],'limits':{'deltaE':'L'}, 'expectedHeaders':{'B1':'Name','H1':'D65/10°'}}],
        'hueRules':[], 'entitySections':[], 'productionSections':[]}

class ParserPreservationTests(unittest.TestCase):
    def test_raw_cells_missing_values_dates_formulas_and_merges_preserved(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);source=root/'fixture.xlsx';synthetic_source(source)
            mapping=root/'mapping.json';mapping.write_text(json.dumps(synthetic_mapping()))
            original=hashlib.sha256(source.read_bytes()).hexdigest()
            result=parse(source,root/'output',mapping)
            data=json.loads((root/'output/normalized-candidate.json').read_text())
            cells={c['coordinate']:c for r in data['rawWorkbook']['sheets'][0]['rows'] for c in r['cells']}
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),original)
            self.assertEqual(len(cells),75)
            self.assertEqual(cells['B3']['blankKind'],'merged-child')
            self.assertEqual(cells['J4']['blankKind'],'explicit-blank')
            self.assertEqual(cells['K4']['blankKind'],'implicit-blank')
            self.assertEqual(cells['N2']['value']['value'],'=SUM(F2:F3)')
            self.assertEqual(cells['N2']['cachedValue']['value'],7)
            self.assertEqual(cells['E2']['value']['value'],'2023-03-15T12:00:00')
            self.assertEqual(cells['E2']['xmlValue'],'45000.5')
            self.assertTrue(data['rawWorkbook']['sheets'][0]['rows'][4]['hidden'])
            self.assertTrue(data['rawWorkbook']['sheets'][0]['columnDimensions']['O']['hidden'])
            self.assertEqual(data['counts']['baseColorCandidates'],3)
            self.assertEqual(data['counts']['measurementRows'],4)
            self.assertEqual(data['counts']['completeLabRows'],3)
            records=data['baseColorCandidates']
            self.assertEqual(records[0]['colorName'],'Synthetic\nmetal')
            self.assertEqual(records[0]['boardQuantity'],0)
            self.assertEqual(records[0]['measurements'][0]['controlLimits']['deltaE']['kind'],'SOURCE_SLASH_MARKER')
            self.assertEqual(records[0]['measurements'][1]['controlLimits']['deltaE']['kind'],'MISSING')
            self.assertEqual(records[1]['colorCode'],None)
            self.assertEqual(records[1]['measurements'][0]['l'],False)
            self.assertEqual(records[1]['measurements'][0]['qualityStatus'],'PENDING_REVIEW')
            self.assertEqual(records[2]['measurements'][0]['a'],0)
            self.assertEqual(len({r['hueCandidateId'] for r in records}),3)
            self.assertEqual(data['hueMappings'],[])
            self.assertEqual(result['status'],'EXTRACTED_NOT_IMPORTED')
            self.assertEqual((root/'output').stat().st_mode & 0o777,0o700)
            self.assertEqual((root/'output/normalized-candidate.json').stat().st_mode & 0o777,0o600)

            # A populated row with no name must remain a candidate. Without a real
            # identity merge, its measurements cannot be attached to its predecessor.
            unmapped=data['rawWorkbook']
            for c in unmapped['sheets'][0]['rows'][3]['cells']:
                if c['coordinate']=='B4':
                    c['value']={'type':'NoneType','value':None};c['blankKind']='explicit-blank'
            revised=normalize_workbook(unmapped,synthetic_mapping())
            self.assertEqual(len(revised['baseColorCandidates']),3)
            orphan=next(c for c in revised['baseColorCandidates'] if c['source']['rows']==[4])
            self.assertIsNone(orphan['colorName'])
            self.assertIn('UNASSIGNED_ROW_WITHOUT_MERGED_IDENTITY',[i['code'] for i in orphan['issues']])
            self.assertEqual(revised['baseColorCandidates'][0]['source']['rows'],[2,3])

    def test_failure_removes_only_staging_and_does_not_change_source(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);source=root/'fixture.xlsx';synthetic_source(source)
            original=source.read_bytes(); m=synthetic_mapping();m['baseSections'][0]['expectedHeaders']['B1']='Wrong'
            mapping=root/'mapping.json';mapping.write_text(json.dumps(m))
            with self.assertRaises(ValueError):parse(source,root/'output',mapping)
            self.assertFalse((root/'output').exists())
            self.assertEqual(list(root.glob('.output-*')),[])
            self.assertEqual(source.read_bytes(),original)

    def test_existing_output_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);target=root/'output';target.mkdir();(target/'keep').write_text('unchanged')
            with self.assertRaises(ValueError):parse(root/'unused.xlsx',target,root/'unused.json')
            self.assertEqual((target/'keep').read_text(),'unchanged')

    def test_json_budget_is_combined_across_files(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);budget=JsonOutputBudget(max_bytes=5)
            budget.write(root/'one.json','x')
            with self.assertRaises(OutputLimitError):budget.write(root/'two.json','y')

if __name__ == '__main__':
    unittest.main()
