"""Tests du module fiscal sur un instantané des données de production (14/10/2026)
et des factures Auto1 réelles. Lancement : cd backend && python -m pytest -q tests"""
import json, os, sys
from datetime import date

os.environ['DATABASE_URL'] = 'sqlite:///./test_fiscal.db'
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
if os.path.exists('test_fiscal.db'):
    os.remove('test_fiscal.db')

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app import models  # noqa: E402

HERE = os.path.dirname(__file__)
D = lambda s: date.fromisoformat(s) if s else None  # noqa: E731


def _seed():
    snap = json.load(open(os.path.join(HERE, 'prod_snapshot_2026_10_14.json'), encoding='utf-8'))
    db = SessionLocal()
    for vid, b, m, reg, db_, pb, ds, ps, st in snap['v']:
        db.add(models.Vehicle(id=vid, brand=b, model=m, registration=reg, date_buy=D(db_), price_buy=pb,
                              date_sell=D(ds), price_sell=ps if ds else None, status=st))
    for cid, vid, cat, amt, d, desc in snap['c']:
        db.add(models.Charge(id=cid, vehicle_id=vid, category=cat, amount=amt, date=D(d), description=desc))
    for iid, vid, t, cat, st, dp, dd, ce, ca in snap['i']:
        db.add(models.Intervention(id=iid, vehicle_id=vid, title=t, category=cat, status=st, date_planned=D(dp),
                                   date_done=D(dd), cost_estimated=ce, cost_actual=ca))
    db.commit()
    db.close()


_seed()
client = TestClient(app)
data_dir = os.path.join(os.path.dirname(HERE), 'data')
r = client.post('/fiscal/entries/bulk', json=json.load(open(os.path.join(data_dir, 'fiscal_entries_auto1.json'), encoding='utf-8')))
assert r.status_code == 201, r.text
for d in json.load(open(os.path.join(data_dir, 'tax_declarations_history.json'), encoding='utf-8')):
    assert client.post('/fiscal/declarations', json=d).status_code == 201


def vat(m):
    r = client.get(f'/fiscal/vat?year=2026&month={m}')
    assert r.status_code == 200, r.text
    return r.json()


def test_bulk_dedup():
    r = client.post('/fiscal/entries/bulk', json=json.load(open(os.path.join(data_dir, 'fiscal_entries_auto1.json'), encoding='utf-8')))
    assert r.json() == {'created': 0, 'skipped': 22}


def test_feb_matches_filed_declaration():
    l = vat(2)['lines']
    assert l['A3'] == 448 and l['08_tax'] == 90 and l['20'] == 90 and l['TD'] == 0  # déclaré : 90 / 90


def test_april_matches_filed_declaration():
    l = vat(4)['lines']
    assert l['08_tax'] == 144 and l['20'] == 144  # déclaré : 144 / 144


def test_may_margin_clio():
    m = vat(5)
    s = m['sales'][0]
    assert s['purchase_base'] == 3845 and s['margin_ttc'] == 655
    assert m['lines']['TD'] == 109 and m['lines']['A1'] == 546


def test_june_autoliquidation_only():
    l = vat(6)['lines']
    assert l['A3'] == 2158 and l['08_tax'] == 432 and l['20'] == 432 and l['TD'] == 0


def test_july_suzuki():
    assert vat(7)['lines']['TD'] == 683


def test_august_and_september():
    a, s = vat(8)['lines'], vat(9)['lines']
    assert a['A3'] == 1221 and a['TD'] == 510   # Twingo 2291 + C3 EK 766 de marge
    assert s['A3'] == 2014 and s['TD'] == 509   # 207 GZ marge 3058 (cases arrondies une à une)


def test_status_and_overview():
    o = client.get('/fiscal/overview?year=2026').json()
    st = {m['month']: m['status'] for m in o['months']}
    assert st[1] == st[2] == st[3] == st[4] == 'déposée'
    assert st[5] == 'en retard' or date.today() < date(2026, 6, 25)
    assert o['cvae']['due'] is False and o['is']['acomptes_dus'] is False


def test_mark_filed_carries_credit():
    r = client.post('/fiscal/declarations', json={'kind': 'CA3', 'form': '3310-CA3', 'period_start': '2026-06-01',
                                                  'period_end': '2026-06-30', 'status': 'déposée', 'credit_carried': 50})
    assert r.status_code == 201
    assert vat(7)['lines']['22'] == 50 and vat(7)['lines']['TD'] == 633
    client.delete(f"/fiscal/declarations/{r.json()['id']}")
    assert vat(7)['lines']['22'] == 0


def test_entry_crud():
    r = client.post('/fiscal/entries', json={'date': '2026-07-10', 'kind': 'achat_fr_tva', 'label': 'Pièces',
                                             'amount_ht': 100, 'vat_amount': 20, 'has_invoice': True})
    eid = r.json()['id']
    assert vat(7)['lines']['20'] == 20 and vat(7)['lines']['TD'] == 663
    client.put(f'/fiscal/entries/{eid}', json={'has_invoice': False})
    assert vat(7)['lines']['20'] == 0
    assert client.delete(f'/fiscal/entries/{eid}').status_code == 200


def test_api_secret_protection(monkeypatch):
    import app.main as main
    monkeypatch.setattr(main, 'API_SECRET', 'secret-test')
    assert client.get('/vehicles').status_code == 401
    assert client.get('/vehicles', headers={'X-Api-Secret': 'mauvais'}).status_code == 401
    assert client.get('/vehicles', headers={'X-Api-Secret': 'secret-test'}).status_code == 200
    assert client.get('/health').status_code == 200


def test_excluded_vehicle():
    before = client.get('/fiscal/overview?year=2026').json()['is']['commissions']
    client.put('/fiscal/settings', json={'excluded_vehicle_ids': '15'})
    after = client.get('/fiscal/overview?year=2026').json()['is']
    assert after['commissions'] == before - 1758
    assert 'Mercedes Benz Class-C200 - FP-926-RB' not in after['stock_fin']['vehicles']
    client.put('/fiscal/settings', json={'excluded_vehicle_ids': ''})


def test_checklist_and_states():
    c = client.get('/fiscal/checklist?year=2026').json()
    keys = {i['key'] for i in c['items']}
    assert 'sale_cession:17' in keys and 'sale_payment:16' in keys and 'ca3_receipt:2026-02' in keys
    feb = next(i for i in c['items'] if i['key'] == 'ca3_receipt:2026-02')
    assert feb['status'] == 'classé'  # n° de dépôt connu
    r = client.put('/fiscal/checklist/sale_payment:16', json={'status': 'trouvé', 'note': 'virement'})
    assert r.status_code == 200
    c2 = client.get('/fiscal/checklist?year=2026').json()
    assert next(i for i in c2['items'] if i['key'] == 'sale_payment:16')['status'] == 'trouvé'
    assert client.put('/fiscal/checklist/x', json={'status': 'bidon'}).status_code == 400


def test_purchase_and_sale_flow():
    r = client.post('/fiscal/purchase', json={'vehicle': {'brand': 'Peugeot', 'model': '208', 'registration': 'AB-123-CD'},
                                              'supplier_type': 'auto1', 'date_buy': '2026-11-03', 'car_price': 2000,
                                              'car_invoice_ref': 'V1', 'fees_ht': 600, 'fees_ref': 'F1', 'transport_ht': 300})
    assert r.status_code == 201
    vid = r.json()['id']
    assert r.json()['price_buy'] == 2900 and set(r.json()['entries']) == {'car', 'fees', 'transport'}
    nov = vat(11)['lines']
    assert nov['A3'] == 900 and nov['TD'] == 0
    s = client.post(f'/fiscal/sales/{vid}', json={'date_sell': '2026-11-20', 'price_sell': 3200, 'buyer_name': 'Test',
                                                  'payment_method': 'virement'}).json()
    assert s['invoice_number'].startswith('NEB-2026-') and s['margin_ttc'] == 1200 and s['vat_margin'] == 200
    assert vat(11)['lines']['TD'] == 200
    s2 = client.post(f'/fiscal/sales/{vid}', json={'date_sell': '2026-11-20', 'price_sell': 3200}).json()
    assert s2['invoice_number'] == s['invoice_number']   # numéro stable
    client.delete(f'/vehicles/{vid}')


def test_rectification_status():
    d = client.post('/fiscal/declarations', json={'kind': 'CA3', 'period_start': '2026-07-01', 'period_end': '2026-07-31',
                                                  'status': 'à rectifier', 'amount_declared': 46}).json()
    m = vat(7)
    assert m['status'] == 'à rectifier' and m['rectification']['declared_due'] == 46
    assert m['rectification']['difference'] == m['lines']['TD'] - 46
    client.delete(f"/fiscal/declarations/{d['id']}")
