"""Flux métier de l'onglet Administratif :
- checklist des justificatifs (ce qu'il faut pouvoir présenter en cas de contrôle) ;
- achat d'un véhicule en une fois (véhicule + factures fiscales) ;
- vente d'un véhicule (acheteur, paiement, n° de facture « TVA sur marge ») ;
- prochaines échéances (bandeau d'alerte).
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import List, Optional
from datetime import date as _date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from . import models
from .database import get_db
from .fiscal import (MONTH_NAMES, _Data, compute_year, margin_base, vehicle_label, r2,
                     vat_due_date, DONE_STATUSES)

router = APIRouter(prefix="/fiscal", tags=["workflow"])

CHECK_STATUSES = ('à trouver', 'trouvé', 'classé', 'non applicable')


# ══════════════════════════════════════════════════════════════
# Checklist des justificatifs
# ══════════════════════════════════════════════════════════════

def _item(key, month, category, piece, priority, vehicle=None, **kw):
    return {'key': key, 'month': month, 'category': category, 'piece': piece, 'priority': priority,
            'vehicle_id': vehicle.id if vehicle else None,
            'vehicle': vehicle_label(vehicle) if vehicle else None,
            'registration': vehicle.registration if vehicle else None, **kw}


def build_checklist(db: Session, year: int) -> List[dict]:
    data = _Data(db)
    months = {m['month']: m for m in compute_year(db, year, data)}
    states = {s.key: s for s in db.query(models.ChecklistState).all()}
    docs = {d.id: d for d in db.query(models.Document).all()}
    sales = {s.vehicle_id: s for s in db.query(models.VehicleSale).all()}
    items: List[dict] = []

    for mnum in range(1, 13):
        m = months.get(mnum)
        if not m or m.get('not_tracked'):
            continue
        has_activity = bool(m.get('sales') or m.get('autoliquidations') or m.get('deductible')
                            or m.get('achats_vehicules') or m.get('sans_tva') or m.get('immobilisations'))
        decl = m.get('declaration')
        if decl or has_activity:
            items.append(_item(f"ca3_receipt:{year}-{mnum:02d}", mnum, 'Déclaration', 'Accusé de réception de la CA3',
                               'obligatoire', description=f"CA3 {MONTH_NAMES[mnum - 1]} {year}",
                               ref=(decl or {}).get('deposit_number'), where="Espace pro › Consulter › Déclarations",
                               auto_done=bool(decl and decl.get('deposit_number'))))
            due = (decl or {}).get('amount_declared') or m['lines'].get('TD') or 0
            if due:
                items.append(_item(f"ca3_payment:{year}-{mnum:02d}", mnum, 'Déclaration', 'Preuve du paiement de la TVA',
                                   'recommandé', amount=due, where='Relevé bancaire de la société'))

        for s in m.get('sales', []):
            v = data.veh.get(s['vehicle_id'])
            sale = sales.get(v.id)
            items.append(_item(f"sale_cession:{v.id}", mnum, 'Vente', 'Certificat de cession (cerfa 15776) signé',
                               'obligatoire', v, date=s['date'], amount=s['price_sell'], vat=s['vat'], case='A1 / E2 / 08',
                               where='Signé par l’acheteur le jour de la vente',
                               link='https://www.service-public.fr/particuliers/vosdroits/R20300'))
            items.append(_item(f"sale_payment:{v.id}", mnum, 'Vente', f"Preuve du paiement reçu ({s['price_sell']:.0f} €)",
                               'obligatoire', v, date=s['date'], amount=s['price_sell'], case='A1 / E2',
                               description=(f"{sale.payment_method or ''} {sale.payment_ref or ''}".strip() if sale else None),
                               where='Relevé bancaire, copie du chèque ou reçu signé (montant exact déclaré)'))
            items.append(_item(f"sale_invoice:{v.id}", mnum, 'Vente', 'Facture de vente « TVA sur marge »', 'recommandé', v,
                               date=s['date'], amount=s['price_sell'], ref=sale.invoice_number if sale else None,
                               where='Bouton « Vendre » de la fiche véhicule (génère la facture)'))

        def entry_items(rows, category, piece, priority, case, where):
            for r in rows:
                v = data.veh.get(r['vehicle_id']) if r.get('vehicle_id') else None
                ttc = r['amount_ht'] + (r['vat_amount'] if r['kind'] in ('achat_fr_tva', 'immobilisation') else 0)
                items.append(_item(f"entry:{r['id']}", mnum, category, piece, priority, v, date=r['date'],
                                   description=r['label'], supplier=r['supplier'], ref=r['invoice_ref'], amount=r2(ttc),
                                   vat=r['vat_amount'] or None, case=case, where=where, entry_id=r['id'],
                                   has_invoice=r['has_invoice']))

        entry_items(m.get('achats_vehicules', []), 'Achat véhicule', 'Facture d’achat du véhicule (TVA sur marge) ou certificat de cession du vendeur',
                    'obligatoire', 'Base de la marge', 'Auto1 › Mes commandes › Facture du véhicule')
        entry_items(m.get('autoliquidations', []), 'Frais UE (autoliquidation)', 'Facture HT du prestataire UE (Auto1 Berlin)',
                    'obligatoire', 'A3 / 08 / 20', 'Auto1 › Mes commandes › Facture de frais de services')
        entry_items(m.get('deductible', []), 'Facture avec TVA déduite', 'Facture au nom de la société avec TVA',
                    'obligatoire', '20', 'Fournisseur, centre CT, site d’achat (duplicata possible)')
        entry_items(m.get('immobilisations', []), 'Immobilisation', 'Facture au nom de la société avec TVA',
                    'obligatoire', '19', 'Fournisseur')
        entry_items(m.get('sans_tva', []), 'Dépense sans TVA (IS)', 'Justificatif de la dépense (reçu, note, contrat)',
                    'recommandé', '—', 'Reçu signé du prestataire, relevé bancaire')

    for it in items:
        st = states.get(it['key'])
        it['status'] = st.status if st else ('classé' if it.pop('auto_done', False) else 'à trouver')
        it.pop('auto_done', None)
        it['note'] = st.note if st else None
        it['document'] = None
        if st and st.document_id and st.document_id in docs:
            d = docs[st.document_id]
            it['document'] = {'id': d.id, 'name': d.name, 'url': d.url, 'type': d.type}
    return items


class ChecklistUpdate(BaseModel):
    status: Optional[str] = None
    document_id: Optional[int] = None
    note: Optional[str] = None


@router.get("/checklist")
def checklist(year: int, db: Session = Depends(get_db)):
    items = build_checklist(db, year)
    todo = [i for i in items if i['status'] == 'à trouver']
    return {
        'year': year, 'items': items,
        'totals': {
            'count': len(items), 'todo': len(todo),
            'todo_mandatory': sum(1 for i in todo if i['priority'] == 'obligatoire'),
            'vat_unjustified': r2(sum(i.get('vat') or 0 for i in todo if i['priority'] == 'obligatoire')),
            'done': sum(1 for i in items if i['status'] in ('trouvé', 'classé', 'non applicable')),
        },
    }


@router.put("/checklist/{key}")
def update_checklist(key: str, payload: ChecklistUpdate, db: Session = Depends(get_db)):
    data = payload.model_dump(exclude_unset=True)
    if 'status' in data and data['status'] not in CHECK_STATUSES:
        raise HTTPException(status_code=400, detail="Statut inconnu")
    st = db.query(models.ChecklistState).filter(models.ChecklistState.key == key).first()
    if not st:
        st = models.ChecklistState(key=key, status='à trouver')
        db.add(st)
    for k, v in data.items():
        setattr(st, k, v)
    if data.get('document_id') and 'status' not in data:
        st.status = 'classé'
    # Une facture rattachée à une pièce fiscale ⇒ la facture est « en main »
    if key.startswith('entry:') and st.status in ('trouvé', 'classé'):
        e = db.query(models.FiscalEntry).filter(models.FiscalEntry.id == int(key.split(':')[1])).first()
        if e:
            e.has_invoice = 1
            if st.document_id:
                e.document_id = st.document_id
    db.commit()
    return {'key': st.key, 'status': st.status, 'document_id': st.document_id, 'note': st.note}


# ══════════════════════════════════════════════════════════════
# Achat d'un véhicule (assistant)
# ══════════════════════════════════════════════════════════════

class PurchaseIn(BaseModel):
    vehicle: dict                          # champs du véhicule (brand, model, registration, …)
    supplier_type: str = 'auto1'           # auto1 / particulier / professionnel
    supplier_name: Optional[str] = None
    date_buy: _date
    car_price: float                       # prix du véhicule seul
    car_invoice_ref: Optional[str] = None
    fees_ht: Optional[float] = 0.0         # frais de services Auto1 (HT, Allemagne)
    fees_ref: Optional[str] = None
    transport_ht: Optional[float] = 0.0
    transport_ref: Optional[str] = None
    pro_vat: Optional[float] = 0.0         # TVA facturée par un professionnel français (régime normal)


VEHICLE_FIELDS = {c.name for c in models.Vehicle.__table__.columns} - {'id', 'created_at'}


@router.post("/purchase", status_code=201)
def purchase(p: PurchaseIn, db: Session = Depends(get_db)):
    vdata = {k: v for k, v in (p.vehicle or {}).items() if k in VEHICLE_FIELDS and v not in ('', None)}
    if not vdata.get('brand') or not vdata.get('model'):
        raise HTTPException(status_code=400, detail="Marque et modèle obligatoires")
    total = (p.car_price or 0) + (p.fees_ht or 0) + (p.transport_ht or 0) + (p.pro_vat or 0)
    vdata.update({'date_buy': p.date_buy, 'price_buy': round(total, 2)})
    vdata.setdefault('status', 'en stock')
    v = models.Vehicle(**vdata)
    db.add(v)
    db.flush()
    label = vehicle_label(v)
    created = {}

    def add(key, **kw):
        e = models.FiscalEntry(**kw)
        db.add(e)
        created[key] = e

    if p.supplier_type == 'professionnel' and p.pro_vat:
        add('car', vehicle_id=v.id, date=p.date_buy, kind='achat_fr_tva',
                                  label=f"Achat véhicule (TVA facturée) — {label}", supplier=p.supplier_name,
                                  country='FR', invoice_ref=p.car_invoice_ref, amount_ht=p.car_price,
                                  vat_rate=20, vat_amount=p.pro_vat, has_invoice=1,
                                  notes="Véhicule acheté avec TVA : la revente se fera avec TVA sur le prix total (pas sur la marge).")
    else:
        sup = p.supplier_name or ('AUTO1 European Cars B.V.' if p.supplier_type == 'auto1' else 'Particulier')
        add('car', vehicle_id=v.id, date=p.date_buy, kind='achat_vehicule_marge',
                                  label=f"Véhicule {label}", supplier=sup, country='FR',
                                  invoice_ref=p.car_invoice_ref, amount_ht=p.car_price, vat_rate=0, vat_amount=0,
                                  has_invoice=1 if p.car_invoice_ref else 0)
    if p.fees_ht:
        add('fees', vehicle_id=v.id, date=p.date_buy, kind='service_ue',
                                  label=f"Frais de services Auto1 {label}", supplier='AUTO1 Group Operations SE (Berlin)',
                                  country='DE', invoice_ref=p.fees_ref, amount_ht=p.fees_ht, vat_rate=20,
                                  has_invoice=1 if p.fees_ref else 0,
                                  notes='Prestation intracommunautaire HT — TVA autoliquidée')
    if p.transport_ht:
        add('transport', vehicle_id=v.id, date=p.date_buy, kind='service_ue',
                                  label=f"Transport Auto1 {label}", supplier='AUTO1 Group Operations SE (Berlin)',
                                  country='DE', invoice_ref=p.transport_ref, amount_ht=p.transport_ht, vat_rate=20,
                                  has_invoice=1 if p.transport_ref else 0,
                                  notes='Transport intracommunautaire HT — TVA autoliquidée')
    db.commit()
    db.refresh(v)
    return {'id': v.id, 'price_buy': v.price_buy, 'entries': {k: e.id for k, e in created.items()}}


# ══════════════════════════════════════════════════════════════
# Vente d'un véhicule
# ══════════════════════════════════════════════════════════════

class SaleIn(BaseModel):
    date_sell: _date
    price_sell: float
    buyer_type: Optional[str] = 'particulier'
    buyer_name: Optional[str] = None
    buyer_address: Optional[str] = None
    buyer_siret: Optional[str] = None
    payment_method: Optional[str] = None
    payment_ref: Optional[str] = None
    km_sale: Optional[int] = None
    notes: Optional[str] = None


def _sale_dict(s, v, db):
    data = _Data(db)
    base = margin_base(data, v)
    marge = (v.price_sell or 0) - base['amount']
    vat = max(0.0, marge) / 6
    return {c.name: getattr(s, c.name) for c in models.VehicleSale.__table__.columns} | {
        'vehicle': vehicle_label(v), 'registration': v.registration, 'vin': v.vin, 'date_sell': v.date_sell,
        'price_sell': v.price_sell, 'purchase_base': r2(base['amount']), 'purchase_estimated': base['estimated'],
        'margin_ttc': r2(marge), 'vat_margin': r2(vat), 'margin_ht': r2(max(0.0, marge) - vat),
    }


@router.get("/sales/{vehicle_id}")
def get_sale(vehicle_id: int, db: Session = Depends(get_db)):
    v = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    s = db.query(models.VehicleSale).filter(models.VehicleSale.vehicle_id == vehicle_id).first()
    if not s:
        return None
    return _sale_dict(s, v, db)


@router.post("/sales/{vehicle_id}")
def record_sale(vehicle_id: int, p: SaleIn, db: Session = Depends(get_db)):
    v = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    v.date_sell, v.price_sell, v.status = p.date_sell, p.price_sell, 'vendu'
    s = db.query(models.VehicleSale).filter(models.VehicleSale.vehicle_id == vehicle_id).first()
    if not s:
        prefix = f"NEB-{p.date_sell.year}-"
        nums = [int(x.invoice_number.split('-')[-1]) for x in db.query(models.VehicleSale).all()
                if x.invoice_number and x.invoice_number.startswith(prefix)]
        s = models.VehicleSale(vehicle_id=vehicle_id, invoice_number=f"{prefix}{(max(nums) + 1 if nums else 1):04d}")
        db.add(s)
    for k, val in p.model_dump(exclude={'date_sell', 'price_sell'}).items():
        setattr(s, k, val)
    db.commit()
    db.refresh(s)
    return _sale_dict(s, v, db)


# ══════════════════════════════════════════════════════════════
# Prochaines échéances (bandeau)
# ══════════════════════════════════════════════════════════════

@router.get("/upcoming")
def upcoming(days: int = 15, db: Session = Depends(get_db)):
    today = date.today()
    out = []
    for year in {today.year, (today - timedelta(days=60)).year}:
        for m in compute_year(db, year):
            if m.get('not_tracked') or m['status'] in DONE_STATUSES:
                continue
            if m['status'] in ('en retard', 'à rectifier') or (m['status'] == 'à faire' and (m['due_date'] - today).days <= days):
                out.append({'kind': 'CA3', 'year': year, 'month': m['month'], 'status': m['status'],
                            'label': f"TVA {MONTH_NAMES[m['month'] - 1].lower()} {year}", 'due_date': m['due_date'],
                            'days_left': (m['due_date'] - today).days, 'amount': m['lines'].get('TD', 0),
                            'rectification': m.get('rectification')})
    cfe = date(today.year, 12, 15)
    if 0 <= (cfe - today).days <= days:
        out.append({'kind': 'CFE', 'label': 'CFE', 'due_date': cfe, 'days_left': (cfe - today).days, 'status': 'à vérifier'})
    out.sort(key=lambda x: x['due_date'])
    return out
