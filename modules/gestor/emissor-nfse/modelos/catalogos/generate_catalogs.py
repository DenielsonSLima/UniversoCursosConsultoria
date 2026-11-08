#!/usr/bin/env python3
"""Build reviewed NFS-e production domain lists from official XLSX snapshots.

Use --source-dir with catalog-b.xlsx/catalog-c.xlsx, or download the pinned URLs.
Updating a snapshot requires reviewing its version, SHA-256 and expected counts.
The RTC correlation spreadsheet is deliberately not a classification rule.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT_URL = 'https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/'
SOURCES = {
    'b': {
        'url': ROOT_URL + 'documentacao-atual/anexo_b-nbs2-lista_servico_nacional-snnfse-v1-01-20260122.xlsx',
        'version': 'ANEXO_B v1.01 2026-01-22',
        'sha256': 'e74b0be8ad204e458932efb1716225a3fb5703a84e5475ce5c4c6789d1c61b1a',
    },
    'c': {
        'url': ROOT_URL + 'documentacao-atual/anexo-c-indop-ibscbs-snnfse-v1-01.xlsx',
        'version': 'ANEXO_C v1.01',
        'sha256': 'f59f066c5c3584ac26cc07d9b23f9fb6713e4bc9212b5e37fededf9244f29d15',
    },
}
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
RID = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'


def normalized(value):
    return re.sub(r'\s+', ' ', value).strip()


def read_source(key, directory):
    source = SOURCES[key]
    if directory:
        data = (directory / f'catalog-{key}.xlsx').read_bytes()
    else:
        with urllib.request.urlopen(source['url'], timeout=60) as response:
            data = response.read()
    digest = hashlib.sha256(data).hexdigest()
    if digest != source['sha256']:
        raise ValueError(f'Source {key} changed: review the official snapshot before updating its hash.')
    return data


def workbook(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        strings = [''.join(node.itertext()) for node in
                   ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si', NS)]
        relations = {node.attrib['Id']: node.attrib['Target'] for node in
                     ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        result = {}
        for sheet in ET.fromstring(archive.read('xl/workbook.xml')).find('m:sheets', NS):
            target = relations[sheet.attrib[RID]]
            path = target.lstrip('/') if target.startswith('/') else 'xl/' + target
            document = ET.fromstring(archive.read(path))
            cells = {}
            for cell in document.findall('.//m:sheetData/m:row/m:c', NS):
                value = cell.find('m:v', NS)
                value = '' if value is None else value.text or ''
                if cell.attrib.get('t') == 's' and value:
                    value = strings[int(value)]
                elif cell.attrib.get('t') == 'inlineStr':
                    value = ''.join(cell.find('m:is', NS).itertext())
                cells[cell.attrib['r']] = normalized(value)
            # Expand actual merged ranges only; never infer an unrelated row's classification.
            for merged in document.findall('m:mergeCells/m:mergeCell', NS):
                start, end = merged.attrib['ref'].split(':')
                first = re.fullmatch(r'([A-Z]+)(\d+)', start)
                last = re.fullmatch(r'([A-Z]+)(\d+)', end)
                if first[1] == last[1]:
                    for row in range(int(first[2]), int(last[2]) + 1):
                        cells[f'{first[1]}{row}'] = cells.get(start, '')
            rows = {}
            for address, value in cells.items():
                match = re.fullmatch(r'([A-Z]+)(\d+)', address)
                rows.setdefault(int(match[2]), {})[match[1]] = value
            result[sheet.attrib['name']] = [rows[key] for key in sorted(rows)]
        return result


def checked(rows, count, digits):
    if len(rows) != count or len({row['code'] for row in rows}) != count:
        raise ValueError(f'Unexpected catalog size or duplicate codes; expected {count}.')
    if any(not re.fullmatch(rf'\d{{{digits}}}', row['code']) or not row['description'] for row in rows):
        raise ValueError('Malformed catalog code or missing official description.')
    return sorted(rows, key=lambda row: row['code'])


def generate(directory):
    source_b, source_c = workbook(read_source('b', directory)), workbook(read_source('c', directory))
    services = [{'code': row['A'].zfill(6), 'description': row['E']}
                for row in source_b['LISTA.SERV.NAC.'] if re.fullmatch(r'\d{5,6}', row.get('A', ''))]
    nbs = [{'code': re.sub(r'\D', '', row['A']), 'description': row['B']}
           for row in source_b['LISTA.NBS_v2.0'] if len(re.sub(r'\D', '', row.get('A', ''))) == 9]
    empty_nbs = [row['code'] for row in nbs if not row['description']]
    if empty_nbs != ['999999999']:
        raise ValueError('Unexpected unlabelled NBS entries; review the official source.')
    nbs = [row for row in nbs if row['description']]
    operations = [{'code': row['G'], 'description': row['B'] + ' — ' + row['H']}
                  for row in source_c['IndOp'] if re.fullmatch(r'\d{6}', row.get('G', ''))]
    return {
        'provenance': {
            'schemaVersion': 1,
            'catalogVersion': 'production-2026-11-08',
            'verifiedAt': '2026-11-08',
            'generatedBy': 'modules/gestor/emissor-nfse/modelos/catalogos/generate_catalogs.py',
            'documentationUrl': ROOT_URL + 'documentacao-atual',
            'sources': [SOURCES['b'], SOURCES['c']],
            'nationalServicesSheet': 'LISTA.SERV.NAC.',
            'nbsSheet': 'LISTA.NBS_v2.0',
            'operationIndicatorsSheet': 'IndOp',
            'operationDescriptionColumns': ['Tipo de operação', 'Local do fornecimento a ser identificado no Dfe'],
            'operationNotes': [row['A'] for row in source_c['IndOp'] if re.match(r'^\([1-6]\)', row.get('A', ''))],
            'correlationsEnforced': False,
            'excludedEntries': [{'catalog': 'nbs', 'code': '999999999', 'reason': 'Official row has no description.'}],
        },
        'nationalServices': checked(services, 338, 6),
        'nbs': checked(nbs, 917, 9),
        'operationIndicators': checked(operations, 26, 6),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path)
    parser.add_argument('--output', type=Path, default=Path(__file__).parent / 'generated/nfse-fiscal-catalogs.json')
    parser.add_argument('--check', action='store_true', help='Fail if the checked-in artifact differs.')
    args = parser.parse_args()
    content = json.dumps(generate(args.source_dir), ensure_ascii=False, separators=(',', ':')) + '\n'
    if args.check:
        if args.output.read_text(encoding='utf-8') != content:
            raise ValueError('Generated catalog differs from the checked-in artifact.')
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(content, encoding='utf-8')
    print('NFS-e catalogs verified: 338 national services, 917 described NBS leaves, 26 operation indicators.')


if __name__ == '__main__':
    main()
