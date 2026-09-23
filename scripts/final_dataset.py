"""Build the map exclusively from final-dataset.xlsx; never infer missing coordinates.

Read-only workbook extraction. Public building lookups contain only street/house,
never subscriber names, phone numbers, account numbers, or module IDs.
"""
import argparse
import collections
import concurrent.futures
import datetime
import hashlib
import json

import sino_addresses as addresses

ROOT = addresses.ROOT
SOURCE = ROOT / 'final-dataset.xlsx'
WORK = ROOT / '.final-work'


def read_records():
    import openpyxl
    book = openpyxl.load_workbook(SOURCE, read_only=True, data_only=True)
    records = []
    for sheet in book:
        for number, row in enumerate(sheet.values, 1):
            if not row or not isinstance(row[0], (int, float)):
                continue
            address, raw = str(row[2] or '').strip(), str(row[4] or '').strip()
            ids, remainder = addresses.parse_ids(raw)
            declared = int(row[10] or 0)
            parsed = addresses.parse_address(address)
            records.append({'sheet': sheet.title, 'row': number, 'address': address,
                            'rawModule': raw, 'declaredCount': declared, 'ids': ids,
                            'remainder': remainder, **parsed})
    book.close()
    return records


def groups_for(records):
    return {r['key']: {k: r[k] for k in ('key', 'street', 'house', 'quarter', 'block', 'passage', 'query')}
            for r in records}


def fetch(records):
    addresses.CACHE.mkdir(exist_ok=True, parents=True)
    queries = sorted({g['query'] for g in groups_for(records).values() if g['street'] and g['house']})
    errors = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for i, result in enumerate(pool.map(addresses.fetch_query, queries), 1):
            if result.get('error'):
                errors.append(result)
            if i % 50 == 0 or i == len(queries):
                print(json.dumps({'checked': i, 'total': len(queries), 'errors': len(errors)}), flush=True)
    WORK.mkdir(exist_ok=True)
    (WORK / 'fetch-errors.json').write_text(json.dumps(errors, ensure_ascii=False, indent=2))


def match_building(group, entities):
    # Reuse strict street, house and passage matching. Scope is the full register,
    # so validate city membership instead of discarding other Dushanbe districts.
    status, found = addresses.match_building(group, entities, [], citywide=True)
    return ('not_found' if status == 'outside_sino' else status), found


def build(records):
    previous = json.loads((ROOT / 'sino-data.js').read_text().split(' = ', 1)[1].rstrip(';\n'))
    assignment_path = ROOT / 'data/gateway-modules.json'
    gateway = {mid: i for i, ids in enumerate(json.loads(assignment_path.read_text())) for mid in ids}
    buildings, catalog = {}, {}
    for key, group in sorted(groups_for(records).items()):
        path = addresses.cache_path(group['query'])
        result = json.loads(path.read_text()) if path.exists() else {'entities': []}
        status, entity = match_building(group, result['entities'])
        b = {'key': key, 'street': group['street'] or group['query'] or key.replace('unknown|', ''),
             'house': group['house'], 'status': status}
        if entity:
            b.update(lat=entity['point']['lat'], lng=entity['point']['lon'],
                     mapAddress=entity['name'], buildingId=entity['id'],
                     url='https://2gis.tj/ru/dushanbe/geo/' + entity['id'])
        buildings[key] = b
        catalog[key] = {'query': group['query'], 'checked': result.get('checked'), 'status': status,
                        'candidates': [{k: v for k, v in e.items() if k != 'geometry'}
                                       for e in result['entities'] if e['type'] == 'building']}
    by_id = collections.defaultdict(list)
    issues = []
    for r in records:
        source = {k: r[k] for k in ('sheet', 'row', 'address')}
        source['file'] = 0
        for mid in r['ids']:
            by_id[mid].append(r)
        if r['remainder'] or len(r['ids']) != r['declaredCount'] or not r['ids']:
            issues.append({**source, 'rawModule': r['rawModule'], 'declaredCount': r['declaredCount'],
                           'recognizedCount': len(r['ids'])})
    modules = []
    for mid, occurrences in sorted(by_id.items()):
        keys = {r['key'] for r in occurrences}
        key = next(iter(keys)) if len(keys) == 1 else ''
        status = buildings[key]['status'] if key else 'id_conflict'
        modules.append({'id': mid, 'key': key, 'status': status, 'gateway': gateway.get(mid, -1),
                        'sources': [{'file': 0, **{k: r[k] for k in ('sheet', 'row', 'address')}} for r in occurrences]})
    mapped = sum(m['status'] == 'matched' for m in modules)
    occurrences = sum(len(r['ids']) for r in records)
    declared = sum(r['declaredCount'] for r in records)
    summary = {'modules': len(modules), 'mapped': mapped, 'pending': len(modules) - mapped,
               'idIssues': len(issues), 'sourceRecords': len(records), 'declaredModules': declared,
               'recognizedOccurrences': occurrences, 'duplicateOccurrences': occurrences - len(modules),
               'unrecognizedModules': declared - occurrences,
               'buildings': len({buildings[m['key']]['buildingId'] for m in modules if m['status'] == 'matched'})}
    data = {'version': 2, 'checkedDate': datetime.date.today().isoformat(), 'files': [SOURCE.name],
            'sourceHashes': {SOURCE.name: hashlib.sha256(SOURCE.read_bytes()).hexdigest()},
            'district': previous['district'], 'buildings': list(buildings.values()), 'modules': modules,
            'idIssues': issues, 'summary': summary}
    (ROOT / 'data/sino-address-catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    # Atomic replacement also keeps an open local browser from reading half a file.
    temporary = ROOT / 'sino-data.js.tmp'
    temporary.write_text('/* Generated from final-dataset.xlsx by scripts/final_dataset.py. No subscriber details. */\nconst SINO_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    temporary.replace(ROOT / 'sino-data.js')
    print(json.dumps(summary), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--fetch', action='store_true')
    parser.add_argument('--build', action='store_true')
    args = parser.parse_args()
    records = read_records()
    if args.fetch:
        fetch(records)
    if args.build:
        build(records)
