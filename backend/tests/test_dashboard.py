"""Tableau de bord et associés — données de production du 15/10/2026.
Lancement (séparément de test_fiscal) : cd backend && python -m pytest -q tests/test_dashboard.py"""
import os, sys
from datetime import date

os.environ['DATABASE_URL'] = 'sqlite:///./test_dashboard.db'
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
if os.path.exists('test_dashboard.db'):
    os.remove('test_dashboard.db')

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app import models  # noqa: E402

D = lambda s: date.fromisoformat(s) if s else None  # noqa: E731
V = [[4,"Peugeot","207","GZ-976-RT","vendu",1145,3400,"2026-08-10","2026-09-14"],[5,"Peugeot","207","ES-032-NX","en stock",620,3400,"2026-08-31",None],[6,"Peugeot","108","DQ-595-BC","en stock",3312,4500,"2026-09-11",None],[7,"Citroën","C3","AV-176-HM","vendu",2384,5300,"2026-09-11","2026-10-10"],[9,"Citroën","C2","GD-427-PW","en stock",400,2100,"2026-07-20",None],[15,"Mercedes Benz","Class-C200","FP-926-RB","en stock",1500,7000,"2026-08-08",None],[16,"SUZUKI","Swift","BS-814-TL","vendu",2663,6000,"2026-06-15","2026-07-07"],[17,"RENAULT","CLIO IV","DP-493-FM","vendu",4567,4500,"2026-04-20","2026-05-29"],[18,"Renault","Clio III","2C-SS0-49","en stock",1075,None,"2026-02-09",None],[19,"Renault","Twingo III","DP-104-AF","vendu",2732,4100,"2026-06-08","2026-09-04"],[20,"Citroën","C3","EK-008-ZP","vendu",1408,1408,"2026-08-22","2026-08-25"],[21,"SUZUKI","Swift","EH-397-KY","en stock",1637,None,"2026-10-07",None]]
C = [[6,6,"Autre",25],[7,5,"Autre",25],[8,4,"Autre",25],[9,4,"Transport",188],[10,5,"Transport",100],[12,9,"Autre",56.56],[21,15,"Autre",25],[24,6,"Transport",180.3],[25,6,"Autre",64],[26,7,"Transport",107.7],[27,7,"Assurance",152],[28,19,"DA",25],[29,19,"Transport",472],[30,16,"DA",25],[33,7,"DA",13],[34,7,"Autre",186.76],[35,9,"Carburant",40],[36,20,"DA",25]]
I = [[5,4,"en cours",354.78,None],[10,5,"à prévoir",800,None],[11,5,"à prévoir",90,None],[12,5,"à prévoir",60,None],[8,4,"terminée",50,50],[6,4,"terminée",60,60],[14,6,"à prévoir",60,None],[18,9,"à prévoir",60,None],[25,15,"à prévoir",887.68,None],[26,15,"à prévoir",1000,None],[27,15,"à prévoir",70,None],[29,6,"à prévoir",197.25,197.25],[30,6,"à prévoir",200,None],[32,18,"à prévoir",None,150],[34,19,"terminée",1000,1000],[33,19,"terminée",390,390],[35,19,"terminée",70,None],[36,16,"terminée",170,170],[37,16,"terminée",650,650],[38,16,"terminée",70,70],[16,7,"terminée",800,850],[31,7,"terminée",200,60],[39,7,"terminée",50,50],[40,7,"terminée",33.75,33.75],[41,9,"terminée",945.4,None],[42,9,"terminée",65,None],[43,9,"terminée",100,None],[44,9,"terminée",50,None]]

db = SessionLocal()
for vid, b, m, reg, st, pb, ps, dbuy, dsell in V:
    db.add(models.Vehicle(id=vid, brand=b, model=m, registration=reg, status=st, price_buy=pb, price_sell=ps, date_buy=D(dbuy), date_sell=D(dsell)))
for cid, vid, cat, amt in C:
    db.add(models.Charge(id=cid, vehicle_id=vid, category=cat, amount=amt, date=date(2026, 9, 1)))
for iid, vid, st, ce, ca in I:
    db.add(models.Intervention(id=iid, vehicle_id=vid, title='t', status=st, cost_estimated=ce, cost_actual=ca, date_planned=date(2026, 9, 1)))
db.add(models.TaxSetting(key='excluded_vehicle_ids', value='15'))
db.commit(); db.close()
client = TestClient(app)


def test_cards_add_up():
    s = client.get('/stats').json()
    assert s['total_sell'] == 24708
    assert s['total_buy'] == 14899
    assert s['total_charges'] == 1219.46
    assert s['total_interventions'] == 3808.53
    assert s['total_profit'] == 4781.01
    assert round(s['total_sell'] - s['total_buy'] - s['total_charges'] - s['total_interventions'], 2) == s['total_profit']
    # stock hors Mercedes ; travaux « à prévoir » non comptés sauf coût réel
    assert s['stock_count'] == 5 and s['stock_buy'] == 7044
    assert s['stock_interventions'] == 197.25 + 150 + 945.4 + 65 + 100 + 50
    assert s['count_vehicles'] == 11


def test_partners_flow():
    assert client.get('/partners/list').json() == ['Nedj', 'Mams']
    assert client.put('/partners/vehicles/7', json={'bought_by': 'Mams', 'sold_by': 'Mams'}).status_code == 200
    r = client.post('/partners/commissions', json={'vehicle_id': 7, 'partner': 'Mams', 'invested': 2000, 'commission': 500, 'date': '2026-10-10'})
    assert r.status_code == 200
    s = client.get('/partners/summary').json()
    mams = next(p for p in s['by_partner'] if p['partner'] == 'Mams')
    assert mams == {'partner': 'Mams', 'bought': 1, 'sold': 1, 'invested': 2000, 'commission': 500, 'commission_paid': 0, 'commission_due': 500}
    cid = r.json()['id']
    client.put(f'/partners/commissions/{cid}', json={'partner': 'Mams', 'status': 'versée'})
    s = client.get('/partners/summary').json()
    assert next(p for p in s['by_partner'] if p['partner'] == 'Mams')['commission_paid'] == 500
    # les commissions n'affectent pas le profit
    assert client.get('/stats').json()['total_profit'] == 4781.01
