"""Administratif simplifié : suivi des déclarations et justificatifs (données prod du 16/10/2026).
Lancement (séparément des autres fichiers) : cd backend && python -m pytest -q tests/test_admin.py"""
import os, sys
from datetime import date

os.environ['DATABASE_URL'] = 'sqlite:///./test_admin.db'
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
sys.path.insert(0, os.path.dirname(__file__))
if os.path.exists('test_admin.db'):
    os.remove('test_admin.db')

import test_dashboard as base  # noqa: E402  (véhicules, charges, travaux)
from app.database import SessionLocal  # noqa: E402
from app import models, admin_tracking  # noqa: E402

D = date.fromisoformat
DECL = [[13,"CA3","2026-09-01","2026-10-26","à rectifier","2026-10-14",179],[12,"CA3","2026-08-01","2026-09-24","à rectifier","2026-10-14",0],[11,"CA3","2026-07-01","2026-08-24","à rectifier","2026-10-14",46],[10,"CA3","2026-06-01","2026-07-24","déposée","2026-10-14",0],[9,"CA3","2026-05-01","2026-06-24","déposée","2026-10-14",11],[4,"CA3","2026-04-01","2026-05-26","déposée","2026-06-08",0],[3,"CA3","2026-03-01","2026-04-24","déposée","2026-04-29",0],[2,"CA3","2026-02-01","2026-03-24","déposée","2026-04-28",0],[1,"CA3","2026-01-01","2026-02-24","déposée","2026-04-28",0],[5,"IS_ACOMPTE","2026-01-01","2026-03-16","déposée","2026-05-23",0],[6,"IS_ACOMPTE","2026-01-01","2026-06-15","déposée","2026-05-23",0],[14,"IS_ACOMPTE","2026-01-01","2026-09-15","déposée","2026-10-15",0],[8,"IS_RESULTAT","2024-11-26","2026-05-20","déposée","2026-06-11",0],[7,"IS_SOLDE","2024-11-26","2026-05-15","déposée","2026-05-23",0]]
DOCS = [[40,7,"DA - Achat","Achat — Certificat de cession Auto1 → NEBAUTO — C3 AV-176-HM — 16/09/2026"],[37,4,"DV - Vente","Vente — Accusé ANTS déclaration de cession — 207 GZ-976-RT"],[36,7,"DA - Achat","Achat — Récépissé de déclaration d'achat (DA) — C3 AV-176-HM"],[35,20,"Contrôle technique","Procès-verbal de contrôle technique — C3 EK-008-ZP"],[33,20,"Facture","Achat — Facture véhicule Auto1 n°90012601128769 — C3 EK-008-ZP"],[30,19,"Contrôle technique","Procès-verbal de contrôle technique du 04/09/2025 — Twingo DP-104-AF"],[29,19,"Facture","Achat — Facture véhicule Auto1 n°90012601084769 — Twingo DP-104-AF"],[26,19,"Facture","Achat — Facture transport Auto1 n°10026010626581 — Twingo DP-104-AF"],[25,18,"Facture","Achat — Facture véhicule Auto1 n°90032601007116 — Clio III 2C-SS0-49"],[22,17,"DV - Vente","Vente — Certificat de cession NEBAUTO → acheteur — Clio IV DP-493-FM"],[20,16,"DV - Vente","Vente — Certificat de cession NEBAUTO → acheteur — Suzuki BS-814-TL"],[19,16,"DA - Achat","Achat — Certificat de cession Auto1 → NEBAUTO — Suzuki BS-814-TL — 15/06/2026"],[18,16,"DA - Achat","Achat — Déclaration d'achat (cerfa 13751) — Suzuki BS-814-TL"],[17,16,"Facture","Achat — Facture véhicule Auto1 n°90012601088398 — Suzuki BS-814-TL"],[12,9,"DA - Achat","Achat — Récépissé de déclaration d'achat (DA) — C2 GD-427-PW"],[10,4,"DA - Achat","Achat — Récépissé de déclaration d'achat (DA) — 207 GZ-976-RT"]]

db = SessionLocal()
for i, k, ps, due, st, fd, amt in DECL:
    db.add(models.TaxDeclaration(id=i, kind=k, period_start=D(ps), due_date=D(due), status=st, filed_date=D(fd), amount_declared=amt))
for i, vid, cat, name in DOCS:
    db.add(models.Document(id=i, vehicle_id=vid, category=cat, name=name, url='u', type='application/pdf'))
db.add(models.TaxSetting(key='first_vat_month', value='2026-01'))
db.get(models.Intervention, 35).title = 'CT'
db.commit(); db.close()
client = base.client
TODAY = date(2026, 10, 16)


def test_declarations_states():
    db = SessionLocal()
    rows = admin_tracking.declarations_for_year(db, 2026, TODAY)
    db.close()
    by = {r['label']: r for r in rows}
    assert by['TVA septembre 2026']['state'] == 'à payer'          # déposée, 179 € non marqués payés
    assert by['TVA août 2026']['state'] == 'terminée'              # déposée, rien à payer
    assert by['TVA octobre 2026']['state'] == 'à déposer'          # période en cours, échéance 24/11
    assert by['Acompte IS n°4 2026']['state'] == 'à déposer'
    assert by['CFE 2026']['state'] == 'à déposer'
    assert sum(1 for r in rows if r['state'] == 'en retard') == 0
    assert not any('2025' in r['label'] and r['kind'] == 'CA3' for r in rows)


def test_mark_paid_and_create_expected():
    r = client.put('/admin/declarations/13', json={'status': 'payée'})
    assert r.json()['state'] == 'terminée'
    r = client.post('/admin/declarations', json={'kind': 'CA3', 'period_start': '2026-10-01', 'period_end': '2026-10-31', 'due_date': '2026-11-24', 'status': 'déposée', 'amount': 0})
    assert r.status_code == 201 and r.json()['state'] == 'terminée'
    labels = [x['label'] for x in client.get('/admin/declarations?year=2026').json()]
    assert labels.count('TVA octobre 2026') == 1


def test_justificatifs():
    j = client.get('/admin/justificatifs').json()
    items = {x['key']: x for x in j['items']}
    assert items['achat:16']['status'] == 'ok' and items['achat:16']['auto']
    assert items['vente:16']['status'] == 'ok'
    assert items['charge:30']['status'] == 'ok'        # DA Suzuki → déclaration d'achat
    assert items['charge:29']['status'] == 'ok'        # transport Twingo → facture transport
    assert items['charge:36']['status'] == 'manquant'  # DA C3 EK-008-ZP : pas de récépissé
    assert items['travaux:35']['status'] == 'ok'       # CT Twingo
    assert 'travaux:10' not in items                   # travail « à prévoir » : pas encore de pièce
    assert j['totals']['count'] == j['totals']['ok'] + j['totals']['missing'] + j['totals']['not_applicable']
    # pas de facture pour la main-d'œuvre d'un particulier
    client.put('/admin/justificatifs/charge:36', json={'status': 'non applicable'})
    assert client.get('/admin/justificatifs').json()['totals']['not_applicable'] == 1
    client.put('/admin/justificatifs/charge:36', json={'document_id': 33})
    assert {x['key']: x for x in client.get('/admin/justificatifs').json()['items']}['charge:36']['status'] == 'ok'
    a = client.get('/admin/alerts').json()
    assert a['missing_proofs'] > 0 and 'late' in a
