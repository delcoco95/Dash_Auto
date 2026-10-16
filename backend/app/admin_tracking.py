"""Onglet Administratif — version simple :
- suivi des déclarations : à déposer / déposée (à payer) / payée — sans aucun calcul de TVA ;
- justificatifs : une pièce attendue par achat, vente, charge et travail payé, avec alerte si elle manque ;
- alertes (bandeau) : déclarations en retard ou proches, justificatifs manquants.
Les simulations (TVA / IS) sont faites côté navigateur, à partir des données du site.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from . import models
from .database import get_db
from .fiscal import MONTH_NAMES, get_settings, next_business_day, vat_due_date, vehicle_label
from .statistics import excluded_ids, intervention_spent, is_sold

router = APIRouter(prefix="/admin", tags=["administratif"])

# ── Déclarations ──────────────────────────────────────────────────────────

TODO, FILED, PAID, NOT_DUE = 'à déposer', 'déposée', 'payée', 'non due'
STATUSES = (TODO, FILED, PAID, NOT_DUE)
LEGACY = {'à faire': TODO, 'à rectifier': FILED, 'non dû': NOT_DUE}
FORMS = {'CA3': '3310-CA3', 'IS_ACOMPTE': '2571', 'IS_SOLDE': '2572', 'IS_RESULTAT': '2065', 'CFE': 'CFE', 'CVAE': '1329-AC', 'AUTRE': ''}
KIND_LABELS = {'CA3': 'TVA', 'IS_ACOMPTE': 'Acompte IS', 'IS_SOLDE': 'Solde IS', 'IS_RESULTAT': 'Liasse fiscale',
               'CFE': 'CFE', 'CVAE': 'CVAE', 'AUTRE': 'Autre'}


def norm_status(s: Optional[str]) -> str:
    s = (s or TODO).strip()
    return LEGACY.get(s, s if s in STATUSES else TODO)


def state_of(status: str, amount, due: Optional[date], today: date) -> str:
    """État lisible : en retard / à déposer / à payer / terminée / non due."""
    if status == NOT_DUE:
        return 'non due'
    if status == PAID:
        return 'terminée'
    if status == FILED:
        return 'à payer' if (amount or 0) > 0 else 'terminée'
    return 'en retard' if due and due < today else 'à déposer'


def _label(kind, period_start, due, notes=None):
    if kind == 'CA3' and period_start:
        return f"TVA {MONTH_NAMES[period_start.month - 1].lower()} {period_start.year}"
    if kind == 'IS_ACOMPTE' and due:
        n = {3: 1, 6: 2, 9: 3, 12: 4}.get(due.month)
        return f"Acompte IS n°{n} {due.year}" if n else f"Acompte IS {due.year}"
    if kind in ('IS_SOLDE', 'IS_RESULTAT') and due:
        return f"{KIND_LABELS[kind]} (exercice clos en {due.year - 1})"
    if kind == 'CFE' and due:
        return f"CFE {due.year}"
    return (notes or KIND_LABELS.get(kind, kind)).split(' — ')[0][:60]


def _decl_dict(d: models.TaxDeclaration, today: date):
    status = norm_status(d.status)
    return {'id': d.id, 'key': f"id:{d.id}", 'kind': d.kind, 'form': d.form or FORMS.get(d.kind, ''),
            'label': _label(d.kind, d.period_start, d.due_date, d.notes),
            'period_start': d.period_start, 'period_end': d.period_end, 'due_date': d.due_date,
            'status': status, 'state': state_of(status, d.amount_declared, d.due_date, today),
            'filed_date': d.filed_date, 'deposit_number': d.deposit_number,
            'amount': d.amount_declared, 'notes': d.notes, 'expected': False}


def expected_obligations(db: Session, year: int, today: date):
    """Échéances attendues de l'année (créées à la volée si elles n'existent pas encore)."""
    s = get_settings(db)
    out = []
    first = s.get('first_vat_month') or f"{year}-01"
    fy, fm = (int(x) for x in first.split('-')[:2])
    due_day = int(s.get('vat_due_day') or 24)
    for m in range(1, 13):
        if (year, m) < (fy, fm):
            continue
        start = date(year, m, 1)
        if start > today:
            break
        end = (date(year + 1, 1, 1) if m == 12 else date(year, m + 1, 1)) - timedelta(days=1)
        out.append({'kind': 'CA3', 'period_start': start, 'period_end': end, 'due_date': vat_due_date(year, m, due_day)})
    for mo in (3, 6, 9, 12):
        out.append({'kind': 'IS_ACOMPTE', 'period_start': date(year, 1, 1), 'period_end': date(year, 12, 31),
                    'due_date': next_business_day(date(year, mo, 15))})
    out.append({'kind': 'IS_SOLDE', 'period_start': date(year - 1, 1, 1), 'period_end': date(year - 1, 12, 31),
                'due_date': next_business_day(date(year, 5, 15))})
    out.append({'kind': 'IS_RESULTAT', 'period_start': date(year - 1, 1, 1), 'period_end': date(year - 1, 12, 31),
                'due_date': next_business_day(date(year, 5, 15))})
    out.append({'kind': 'CFE', 'period_start': date(year, 1, 1), 'period_end': date(year, 12, 31),
                'due_date': next_business_day(date(year, 12, 15))})
    start = date(fy, fm, 1)   # rien n'est attendu avant le début du suivi
    return [e for e in out if e['due_date'] >= start]


def _matches(e, d: models.TaxDeclaration):
    if d.kind != e['kind']:
        return False
    if e['kind'] == 'CA3':
        return d.period_start == e['period_start']
    if e['kind'] == 'IS_ACOMPTE':
        return bool(d.due_date) and d.due_date.year == e['due_date'].year and d.due_date.month == e['due_date'].month
    return bool(d.due_date) and d.due_date.year == e['due_date'].year


def declarations_for_year(db: Session, year: int, today: Optional[date] = None):
    today = today or date.today()
    rows = db.query(models.TaxDeclaration).all()
    used, out = set(), []
    for e in expected_obligations(db, year, today):
        found = next((d for d in rows if d.id not in used and _matches(e, d)), None)
        if found:
            used.add(found.id)
            out.append(_decl_dict(found, today))
        else:
            key = f"{e['kind']}:{e['due_date'].isoformat()}"
            out.append({'id': None, 'key': key, 'kind': e['kind'], 'form': FORMS[e['kind']],
                        'label': _label(e['kind'], e['period_start'], e['due_date']),
                        'period_start': e['period_start'], 'period_end': e['period_end'], 'due_date': e['due_date'],
                        'status': TODO, 'state': state_of(TODO, None, e['due_date'], today), 'filed_date': None,
                        'deposit_number': None, 'amount': None, 'notes': None, 'expected': True})
    for d in rows:  # déclarations saisies à la main sur l'année
        if d.id in used or not d.due_date or d.due_date.year != year:
            continue
        out.append(_decl_dict(d, today))
    out.sort(key=lambda x: (x['due_date'] or date.max, x['label']))
    return out


class DeclIn(BaseModel):
    kind: Optional[str] = None
    form: Optional[str] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    due_date: Optional[date] = None
    status: Optional[str] = None
    filed_date: Optional[date] = None
    deposit_number: Optional[str] = None
    amount: Optional[float] = None
    notes: Optional[str] = None


def _apply(d: models.TaxDeclaration, body: DeclIn):
    data = body.model_dump(exclude_unset=True)
    if 'status' in data:
        st = norm_status(data['status'])
        if data['status'] not in STATUSES and data['status'] not in LEGACY:
            raise HTTPException(400, 'Statut invalide')
        data['status'] = st
        if st in (FILED, PAID) and not d.filed_date and 'filed_date' not in data:
            data['filed_date'] = date.today()
    if 'amount' in data:
        data['amount_declared'] = data.pop('amount')
    for k, v in data.items():
        setattr(d, k, v)
    if d.kind and not d.form:
        d.form = FORMS.get(d.kind, '')


@router.get('/declarations')
def list_declarations(year: Optional[int] = None, db: Session = Depends(get_db)):
    return declarations_for_year(db, year or date.today().year)


@router.post('/declarations', status_code=201)
def create_declaration(body: DeclIn, db: Session = Depends(get_db)):
    if not body.kind:
        raise HTTPException(400, 'Type de déclaration requis')
    d = models.TaxDeclaration(status=TODO)
    _apply(d, body)
    db.add(d)
    db.commit()
    db.refresh(d)
    return _decl_dict(d, date.today())


@router.put('/declarations/{decl_id}')
def update_declaration(decl_id: int, body: DeclIn, db: Session = Depends(get_db)):
    d = db.get(models.TaxDeclaration, decl_id)
    if not d:
        raise HTTPException(404, 'Déclaration introuvable')
    _apply(d, body)
    db.commit()
    return _decl_dict(d, date.today())


@router.delete('/declarations/{decl_id}')
def delete_declaration(decl_id: int, db: Session = Depends(get_db)):
    d = db.get(models.TaxDeclaration, decl_id)
    if not d:
        raise HTTPException(404, 'Déclaration introuvable')
    db.delete(d)
    db.commit()
    return {'ok': True}


# ── Justificatifs ─────────────────────────────────────────────────────────

def _n(s: str) -> str:
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'\s+', ' ', s)


def _auto_doc(kind: str, label: str, docs: list):
    """Rattache automatiquement un document du véhicule quand son nom / sa catégorie correspond."""
    lab = _n(label)
    def first(pred):
        return next((d for d in docs if pred(_n(d.name), _n(d.category or ''))), None)
    if kind == 'achat':
        return first(lambda n, c: 'facture vehicule' in n or 'certificat de cession auto1' in n
                     or ('achat' in n and 'certificat de cession' in n) or 'facture d\'achat' in n)
    if kind == 'vente':
        return first(lambda n, c: c.startswith('dv') or n.startswith('vente'))
    if kind == 'charge':
        if lab.startswith('da') or ' da' in f" {lab}" or 'declaration d\'achat' in lab:
            return first(lambda n, c: 'declaration d\'achat' in n or 'recepisse' in n or '(da)' in n)
        if 'transport' in lab or 'livraison' in lab:
            return first(lambda n, c: 'facture transport' in n)
        if 'assurance' in lab:
            return first(lambda n, c: 'assurance' in n)
        if 'carte grise' in lab:
            return first(lambda n, c: 'certificat d\'immatriculation' in n or 'facture carte grise' in n)
        return None
    if kind == 'travaux':
        if lab.startswith('ct') or 'controle technique' in lab:
            return first(lambda n, c: 'controle technique' in n or c.startswith('controle'))
        return None
    return None


def build_justificatifs(db: Session):
    excl = excluded_ids(db)
    vehicles = {v.id: v for v in db.query(models.Vehicle).all() if v.id not in excl}
    docs_by_vehicle, docs = {}, {}
    for d in db.query(models.Document).all():
        docs[d.id] = d
        if d.vehicle_id:
            docs_by_vehicle.setdefault(d.vehicle_id, []).append(d)
    states = {s.key: s for s in db.query(models.ChecklistState).all()}
    items = []

    def add(key, kind, label, vehicle, amount, when):
        st = states.get(key)
        doc = docs.get(st.document_id) if st and st.document_id else None
        auto = False
        if st and st.status == 'non applicable':
            status = 'non applicable'
        elif doc:
            status = 'ok'
        else:
            doc = _auto_doc(kind, label, docs_by_vehicle.get(vehicle.id, []) if vehicle else [])
            auto = bool(doc)
            status = 'ok' if doc else 'manquant'
        items.append({'key': key, 'kind': kind, 'label': label, 'amount': round(amount or 0, 2),
                      'date': when, 'vehicle_id': vehicle.id if vehicle else None,
                      'vehicle': vehicle_label(vehicle) if vehicle else None,
                      'registration': vehicle.registration if vehicle else None,
                      'status': status, 'auto': auto, 'note': st.note if st else None,
                      'document': {'id': doc.id, 'name': doc.name, 'url': doc.url, 'type': doc.type} if doc else None})

    for v in vehicles.values():
        if v.price_buy:
            add(f"achat:{v.id}", 'achat', "Facture ou certificat d'achat du véhicule", v, v.price_buy, v.date_buy)
        if is_sold(v) and v.price_sell:
            add(f"vente:{v.id}", 'vente', 'Facture de vente / certificat de cession', v, v.price_sell, v.date_sell)
    for c in db.query(models.Charge).all():
        if c.vehicle_id in excl or not (c.amount or 0):
            continue
        v = vehicles.get(c.vehicle_id)
        label = ' · '.join(x for x in (c.category, c.description) if x and x != 'Autre') or (c.category or 'Charge')
        add(f"charge:{c.id}", 'charge', label, v, c.amount, c.date)
    for i in db.query(models.Intervention).all():
        if i.vehicle_id in excl:
            continue
        spent = intervention_spent(i)
        if not spent:
            continue
        add(f"travaux:{i.id}", 'travaux', i.title or 'Travaux', vehicles.get(i.vehicle_id), spent,
            getattr(i, 'date_done', None) or i.date_planned)

    items.sort(key=lambda x: (x['status'] != 'manquant', -(x['date'].toordinal() if x['date'] else 0)))
    missing = [x for x in items if x['status'] == 'manquant']
    totals = {'count': len(items), 'ok': sum(1 for x in items if x['status'] == 'ok'),
              'missing': len(missing), 'not_applicable': sum(1 for x in items if x['status'] == 'non applicable'),
              'missing_amount': round(sum(x['amount'] for x in missing), 2)}
    by_kind = {}
    for x in items:
        b = by_kind.setdefault(x['kind'], {'count': 0, 'ok': 0, 'missing': 0})
        b['count'] += 1
        b['ok' if x['status'] != 'manquant' else 'missing'] += 1
    return {'items': items, 'totals': totals, 'by_kind': by_kind}


@router.get('/justificatifs')
def get_justificatifs(vehicle_id: Optional[int] = None, db: Session = Depends(get_db)):
    data = build_justificatifs(db)
    if vehicle_id:
        data['items'] = [x for x in data['items'] if x['vehicle_id'] == vehicle_id]
    return data


class ProofIn(BaseModel):
    document_id: Optional[int] = None
    status: Optional[str] = None      # 'ok' (avec document) / 'non applicable' / 'manquant'
    note: Optional[str] = None


@router.put('/justificatifs/{key}')
def set_justificatif(key: str, body: ProofIn, db: Session = Depends(get_db)):
    if not re.fullmatch(r'(achat|vente|charge|travaux):\d+', key):
        raise HTTPException(400, 'Clé invalide')
    st = db.get(models.ChecklistState, key) or models.ChecklistState(key=key)
    data = body.model_dump(exclude_unset=True)
    if 'document_id' in data:
        if data['document_id'] and not db.get(models.Document, data['document_id']):
            raise HTTPException(404, 'Document introuvable')
        st.document_id = data['document_id']
        st.status = 'classé' if data['document_id'] else 'à trouver'
    if data.get('status') == 'non applicable':
        st.status, st.document_id = 'non applicable', None
    elif data.get('status') == 'manquant':
        st.status, st.document_id = 'à trouver', None
    if 'note' in data:
        st.note = data['note']
    db.merge(st)
    db.commit()
    return {'key': key, 'status': st.status, 'document_id': st.document_id}


# ── Alertes (bandeau + badge) ─────────────────────────────────────────────

@router.get('/alerts')
def alerts(days: int = 15, db: Session = Depends(get_db)):
    today = date.today()
    decls = []
    for y in sorted({today.year - 1, today.year}):
        decls += declarations_for_year(db, y, today)
    late = [d for d in decls if d['state'] == 'en retard']
    soon = [d for d in decls if d['state'] == 'à déposer' and d['due_date'] and (d['due_date'] - today).days <= days]
    unpaid = [d for d in decls if d['state'] == 'à payer']
    j = build_justificatifs(db)
    return {'late': late, 'due_soon': soon, 'unpaid': unpaid,
            'missing_proofs': j['totals']['missing'], 'missing_amount': j['totals']['missing_amount'],
            'count': len(late) + len(soon) + len(unpaid) + (1 if j['totals']['missing'] else 0)}
