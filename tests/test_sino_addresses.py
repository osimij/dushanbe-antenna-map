"""Guard against wrong buildings, fabricated IDs, and dropped source records."""
import collections
import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('addresses', ROOT / 'scripts/sino_addresses.py')
addresses = importlib.util.module_from_spec(spec)
spec.loader.exec_module(addresses)


class AddressParsing(unittest.TestCase):
    def test_house_is_separate_from_apartment(self):
        for raw in ['кучаи Хиебони Сино дом136/2кв59', 'к. Сино дом-136/2 кв-59']:
            self.assertEqual(addresses.parse_address(raw)['house'], '136/2')
        self.assertEqual(addresses.parse_address('к. Мухаммадиев - 34х-64')['house'], '34')

    def test_quarter_and_passage_are_preserved(self):
        self.assertEqual(addresses.parse_address('к. Испечак - 2 М 25 дом-5 х-57')['house'], '5-М25')
        passage = addresses.parse_address('к. Хувайдуллоев дом-2пр7 х-12')
        self.assertEqual((passage['house'], passage['passage']), ('7', '2'))
        self.assertIn('проезд 2', passage['key'])
        self.assertTrue(addresses.parse_address('кучаи Хиебони Сино Б-1-А дом54 кв7')['block'])

    def test_missing_house_is_not_fabricated(self):
        self.assertEqual(addresses.parse_address('Чагатай-Шодоб -2 дом б/р')['house'], '')
        self.assertEqual(addresses.parse_address('к. Испечак - 2')['house'], '')

    def test_ids_are_normalized_without_guessing_missing_digits(self):
        self.assertEqual(addresses.parse_ids('2026-03036652'), (['3036652'], ''))
        self.assertEqual(addresses.parse_ids('О304052703040528'), (['3040527', '3040528'], ''))
        self.assertEqual(addresses.parse_ids('03-04-10-01'), (['3041001'], ''))
        self.assertEqual(addresses.parse_ids('03036688/6702'), (['3036688'], '6702'))
        self.assertEqual(addresses.parse_ids('О30365433'), ([], '30365433'))


class Matching(unittest.TestCase):
    ring = [[68,38], [69,38], [69,39], [68,39], [68,38]]

    def candidate(self, number='24', street='улица Фазлиддина Мухаммадиева', lon=68.5, identity='1'):
        return {'id': identity, 'type':'building', 'name':f'{street}, {number}',
                'point':{'lon':lon,'lat':38.5}, 'adm_div':[{'id':addresses.DISTRICT}],
                'address':{'components':[{'street':street,'number':number}]}}

    def test_exact_street_house_and_boundary_are_required(self):
        group = addresses.parse_address('к. Мухаммадиев - 24 х-1')
        self.assertEqual(addresses.match_building(group,[self.candidate()],self.ring)[0], 'matched')
        self.assertEqual(addresses.match_building(group,[self.candidate('24/2')],self.ring)[0], 'not_found')
        self.assertEqual(addresses.match_building(group,[self.candidate(street='улица Маяковского')],self.ring)[0], 'not_found')
        self.assertEqual(addresses.match_building(group,[self.candidate(lon=70)],self.ring)[0], 'outside_sino')
        self.assertEqual(addresses.match_building(group,[self.candidate(),self.candidate(identity='2')],self.ring)[0], 'ambiguous')


class DeliveredData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data=json.loads((ROOT/'sino-data.js').read_text().split(' = ',1)[1].rstrip(';\n'))
        cls.buildings={b['key']:b for b in cls.data['buildings']}

    def test_ids_counts_and_review_entries(self):
        modules=self.data['modules']; summary=self.data['summary']
        self.assertEqual(len({m['id'] for m in modules}),len(modules))
        self.assertEqual(summary['modules'],len(modules))
        self.assertEqual(summary['mapped'],sum(m['status']=='matched' for m in modules))
        self.assertEqual(summary['pending']+summary['mapped'],summary['modules'])
        self.assertEqual(summary['idIssues'],len(self.data['idIssues']))
        self.assertTrue(all(m['sources'] for m in modules))

    def test_every_mapped_building_is_in_sino_and_has_evidence(self):
        catalog=json.loads((ROOT/'data/sino-address-catalog.json').read_text())
        for m in self.data['modules']:
            if m['status']!='matched': continue
            b=self.buildings[m['key']]
            self.assertEqual(b['status'],'matched')
            self.assertTrue(addresses.inside_polygon({'lon':b['lng'],'lat':b['lat']},self.data['district']['ring']))
            evidence=next(e for e in catalog[m['key']]['candidates'] if e['id']==b['buildingId'])
            self.assertEqual(evidence['point'],{'lat':b['lat'],'lon':b['lng']})
            self.assertTrue(any(d['id']==addresses.DISTRICT for d in evidence['adm_div']))

    def test_unresolved_groups_have_no_fake_coordinates(self):
        for b in self.buildings.values():
            if b['status']!='matched':
                self.assertNotIn('lat',b);self.assertNotIn('lng',b)
        for m in self.data['modules']:
            if m['status']=='id_conflict':self.assertEqual(m['key'],'')

    def test_gateway_relationships_preserve_actual_ids(self):
        old=json.loads((ROOT/'assignment-data.js').read_text().split(' = ',1)[1].rstrip(';\n'))
        gateway={mid:i for i,ids in enumerate(old['gatewayModules']) for mid in ids}
        for m in self.data['modules']:self.assertEqual(m['gateway'],gateway.get(m['id'],-1))

    def test_regression_sino_130_4_is_at_the_catalog_building(self):
        b=self.buildings['Абуали ибн Сино|130/4']
        self.assertEqual((b['lat'],b['lng']),(38.562246,68.75741))
        self.assertEqual(b['buildingId'],'70030077017040685')

    def test_source_reconciliation_when_workbooks_are_present(self):
        prepared=ROOT/'.address-work/records.json'
        if not prepared.exists():self.skipTest('Source workbooks are local only')
        raw=json.loads(prepared.read_text());by_id=collections.defaultdict(list)
        for r in raw:
            for mid in r['ids']:by_id[mid].append(r)
        for m in self.data['modules']:
            self.assertIn(m['id'],by_id)
            expected={(r['file'],r['sheet'],r['row'],r['address']) for r in by_id[m['id']]}
            actual={(self.data['files'][s['file']],s['sheet'],s['row'],s['address']) for s in m['sources']}
            self.assertEqual(expected,actual)
        explicit_ids={mid for r in raw if r['sourceSino'] for mid in r['ids']}
        self.assertTrue(explicit_ids.issubset({m['id'] for m in self.data['modules']}))


if __name__=='__main__':unittest.main()
