"""Private read-only XLSX extraction and explicit-mapping normalization CLI."""
import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

from extract_workbook import extract_workbook
from io_utils import JsonOutputBudget
from normalize_workbook import normalize_workbook
from source_guard import SourceLimits

MAX_MAPPING_BYTES = 1024 * 1024

def load_mapping(path):
    with path.open('rb') as stream:
        data = stream.read(MAX_MAPPING_BYTES + 1)
    if len(data) > MAX_MAPPING_BYTES:
        raise ValueError('Mapping exceeds size limit')
    mapping = json.loads(data)
    if not isinstance(mapping, dict) or mapping.get('schemaVersion') != 'color-register-source-map-v1':
        raise ValueError('Unsupported mapping schema')
    return mapping, hashlib.sha256(data).hexdigest()

def validate_mapping(mapping, book):
    sheets = {s['name']: s for s in book['sheets']}
    sections = [*mapping.get('baseSections', []), *mapping.get('entitySections', []), *mapping.get('productionSections', [])]
    if len(sections) > 200:
        raise ValueError('Too many mapping sections')
    reserved = {'rawWorkbook', 'sourceSha256', 'counts', 'rules', 'baseColorCandidates', 'hueMappings', 'productionCandidates', 'productionAggregateEvidence', 'rowPreservationLedger', 'schemaVersion', 'status', 'sectionMappings'}
    for cfg in sections:
        if cfg.get('sheet') not in sheets:
            raise ValueError('Mapped sheet is absent')
        s = sheets[cfg['sheet']]
        if not all(type(cfg.get(k)) is int for k in ('start', 'end')) or not 1 <= cfg['start'] <= cfg['end'] <= s['maxRow']:
            raise ValueError('Mapping row range is outside source bounds')
        if cfg.get('kind') in reserved:
            raise ValueError('Mapping entity kind uses reserved field')
        cells = {c['coordinate']: c for r in s['rows'] for c in r['cells']}
        for coord, expected in cfg.get('expectedHeaders', {}).items():
            if coord not in cells or cells[coord]['value']['value'] != expected:
                raise ValueError('Source headers do not match mapping')
        for rkey in ('title', 'header', 'totalRow'):
            if rkey in cfg and (type(cfg[rkey]) is not int or not 1 <= cfg[rkey] <= s['maxRow']):
                raise ValueError('Mapping header or total row is outside source bounds')
        columns = [*cfg.get('fields', {}).values(), *cfg.get('lab', []), *cfg.get('limits', {}).values(), *cfg.get('monthColumns', []), *cfg.get('totalColumns', [])]
        columns += [cfg[k] for k in ('angle', 'nameColumn') if k in cfg]
        for col in columns:
            if not isinstance(col, str) or not re.fullmatch(r'[A-Z]{1,3}', col) or col + str(cfg['start']) not in cells:
                raise ValueError('Mapping column is outside source bounds')
        for coord in cfg.get('contextCells', {}).values():
            if coord not in cells:
                raise ValueError('Mapping context cell is outside source bounds')

def parse(input_path, output_dir, mapping_path):
    """Use a fresh private directory. On failure, remove only this call's staging output."""
    os.umask(0o077)
    source = Path(input_path).absolute()
    target = Path(output_dir).absolute()
    if target.exists() or target.is_symlink():
        raise ValueError('Output directory must not already exist')
    if not target.parent.is_dir():
        raise ValueError('Output parent directory must exist')
    mapping, mapping_hash = load_mapping(Path(mapping_path))
    stage = Path(tempfile.mkdtemp(prefix='.' + target.name + '-', dir=target.parent))
    stage.chmod(0o700)
    try:
        budget = JsonOutputBudget()
        book = extract_workbook(source, stage, SourceLimits(), budget.write)
        validate_mapping(mapping, book)
        candidate = normalize_workbook(book, mapping)
        candidate['mappingSha256'] = mapping_hash
        candidate['sourcePackage'] = {
            'root': str(target / 'source-ooxml'), 'partManifest': book['archiveParts'],
            'stylesXml': (stage / 'source-ooxml/xl/styles.xml').read_text(),
            'sharedStringsXml': (stage / 'source-ooxml/xl/sharedStrings.xml').read_text() if (stage / 'source-ooxml/xl/sharedStrings.xml').exists() else None,
            'workbookXml': (stage / 'source-ooxml/xl/workbook.xml').read_text(),
        }
        budget.write(stage / 'normalized-candidate.json', candidate)
        budget.write(stage / 'safe-counts.json', {'sourceSha256': book['sourceSha256'], **candidate['counts']})
        os.rename(stage, target)
        return {'status': 'EXTRACTED_NOT_IMPORTED', 'sourceSha256': book['sourceSha256'], 'mappingSha256': mapping_hash,
                'output': str(target), 'counts': candidate['counts'], 'combinedJsonBytes': budget.written_bytes}
    except BaseException:
        shutil.rmtree(stage)
        raise

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input', required=True, type=Path)
    p.add_argument('--output-dir', required=True, type=Path)
    p.add_argument('--mapping', required=True, type=Path)
    args = p.parse_args()
    try:
        result = parse(args.input, args.output_dir, args.mapping)
    except Exception as exc:
        # Source values and stack traces are intentionally absent from CLI failures.
        print(json.dumps({'status': 'REJECTED', 'errorType': type(exc).__name__}, ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
