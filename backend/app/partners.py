"""Associés : qui a acheté / vendu chaque véhicule, et les commissions de chacun.

Ce suivi est volontairement indépendant du profit net, des charges et de la TVA.
"""
from __future__ import annotations

from datetime import date as _date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from . import models
from .database import get_db
from .fiscal import vehicle_label
from .statistics import excluded_ids, is_sold

router = APIRouter(prefix="/partners", tags=["partners"])

DEFAULT_PARTNERS = 'Nedj,Mams'
STATUSES = ('à verser', 'versée')


def _partners(db: Session):
    s = db.get(models.TaxSetting, 'partners')
    raw = (s.value if s and s.value else DEFAULT_PARTNERS)
    return [p.strip() for p in raw.split(',') if p.strip()]


class PartnerList(BaseModel):
    partners: list[str]


class DealIn(BaseModel):
    bought_by: Optional[str] = None
    sold_by: Optional[str] = None
    notes: Optional[str] = None


class CommissionIn(BaseModel):
    vehicle_id: Optional[int] = None
    partner: str
    invested: Optional[float] = None
    commission: Optional[float] = None
    date: Optional[_date] = None
    status: Optional[str] = 'à verser'
    notes: Optional[str] = None


def _c(c: models.PartnerCommission):
    return {'id': c.id, 'vehicle_id': c.vehicle_id, 'partner': c.partner, 'invested': c.invested,
            'commission': c.commission, 'date': c.date.isoformat() if c.date else None,
            'status': c.status or 'à verser', 'notes': c.notes}


@router.get('/list')
def get_list(db: Session = Depends(get_db)):
    return _partners(db)


@router.put('/list')
def put_list(body: PartnerList, db: Session = Depends(get_db)):
    names = [p.strip() for p in body.partners if p.strip()]
    if not names:
        raise HTTPException(400, 'Au moins un associé')
    s = db.get(models.TaxSetting, 'partners') or models.TaxSetting(key='partners')
    s.value = ','.join(names)
    db.merge(s)
    db.commit()
    return names


@router.get('/summary')
def summary(db: Session = Depends(get_db)):
    partners = _partners(db)
    excl = excluded_ids(db)
    vehicles = [v for v in db.query(models.Vehicle).all() if v.id not in excl]
    deals = {d.vehicle_id: d for d in db.query(models.VehicleDeal).all()}
    comms = db.query(models.PartnerCommission).order_by(models.PartnerCommission.date.desc().nullslast(),
                                                         models.PartnerCommission.id.desc()).all()

    by = {p: {'partner': p, 'bought': 0, 'sold': 0, 'invested': 0.0, 'commission': 0.0,
              'commission_paid': 0.0, 'commission_due': 0.0} for p in partners}

    def bucket(name):
        if name and name not in by:
            by[name] = {'partner': name, 'bought': 0, 'sold': 0, 'invested': 0.0, 'commission': 0.0,
                        'commission_paid': 0.0, 'commission_due': 0.0}
        return by.get(name)

    comms_by_vehicle = {}
    for c in comms:
        comms_by_vehicle.setdefault(c.vehicle_id, []).append(_c(c))
        b = bucket(c.partner)
        b['invested'] += c.invested or 0
        b['commission'] += c.commission or 0
        if (c.status or 'à verser') == 'versée':
            b['commission_paid'] += c.commission or 0
        else:
            b['commission_due'] += c.commission or 0

    rows = []
    for v in sorted(vehicles, key=lambda x: (x.date_buy or _date.min), reverse=True):
        d = deals.get(v.id)
        if d and d.bought_by:
            bucket(d.bought_by)['bought'] += 1
        if d and d.sold_by and is_sold(v):
            bucket(d.sold_by)['sold'] += 1
        vc = comms_by_vehicle.get(v.id, [])
        rows.append({'id': v.id, 'label': vehicle_label(v), 'brand': v.brand, 'model': v.model,
                     'registration': v.registration, 'sold': is_sold(v),
                     'price_buy': v.price_buy, 'price_sell': v.price_sell,
                     'date_buy': v.date_buy.isoformat() if v.date_buy else None,
                     'date_sell': v.date_sell.isoformat() if v.date_sell else None,
                     'bought_by': d.bought_by if d else None, 'sold_by': d.sold_by if d else None,
                     'notes': d.notes if d else None, 'commissions': vc,
                     'commission_total': round(sum(c['commission'] or 0 for c in vc), 2),
                     'invested_total': round(sum(c['invested'] or 0 for c in vc), 2)})

    for b in by.values():
        for k in ('invested', 'commission', 'commission_paid', 'commission_due'):
            b[k] = round(b[k], 2)

    vmap = {v.id: v for v in vehicles}
    recent = []
    for c in comms[:8]:
        item = _c(c)
        item['vehicle'] = vehicle_label(vmap.get(c.vehicle_id)) if c.vehicle_id in vmap else None
        recent.append(item)

    return {'partners': partners, 'by_partner': list(by.values()), 'vehicles': rows, 'recent': recent, 'unlinked': [_c(c) for c in comms if not c.vehicle_id],
            'unassigned': sum(1 for r in rows if not r['bought_by'] or (r['sold'] and not r['sold_by']))}


@router.put('/vehicles/{vehicle_id}')
def put_deal(vehicle_id: int, body: DealIn, db: Session = Depends(get_db)):
    if not db.get(models.Vehicle, vehicle_id):
        raise HTTPException(404, 'Véhicule introuvable')
    d = db.get(models.VehicleDeal, vehicle_id) or models.VehicleDeal(vehicle_id=vehicle_id)
    data = body.model_dump(exclude_unset=True)
    for k, val in data.items():
        setattr(d, k, (val or None) if isinstance(val, str) else val)
    db.merge(d)
    db.commit()
    return {'vehicle_id': vehicle_id, 'bought_by': d.bought_by, 'sold_by': d.sold_by, 'notes': d.notes}


@router.get('/commissions')
def list_commissions(vehicle_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.PartnerCommission)
    if vehicle_id:
        q = q.filter(models.PartnerCommission.vehicle_id == vehicle_id)
    return [_c(c) for c in q.order_by(models.PartnerCommission.id.desc()).all()]


@router.post('/commissions')
def create_commission(body: CommissionIn, db: Session = Depends(get_db)):
    if body.status and body.status not in STATUSES:
        raise HTTPException(400, 'Statut invalide')
    c = models.PartnerCommission(**body.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return _c(c)


@router.put('/commissions/{cid}')
def update_commission(cid: int, body: CommissionIn, db: Session = Depends(get_db)):
    c = db.get(models.PartnerCommission, cid)
    if not c:
        raise HTTPException(404, 'Commission introuvable')
    if body.status and body.status not in STATUSES:
        raise HTTPException(400, 'Statut invalide')
    for k, val in body.model_dump(exclude_unset=True).items():
        setattr(c, k, val)
    db.commit()
    return _c(c)


@router.delete('/commissions/{cid}')
def delete_commission(cid: int, db: Session = Depends(get_db)):
    c = db.get(models.PartnerCommission, cid)
    if not c:
        raise HTTPException(404, 'Commission introuvable')
    db.delete(c)
    db.commit()
    return {'ok': True}
