"""Module Fiscalité : TVA (CA3 mensuelle, régime de la marge + autoliquidation),
estimation IS, CVAE, calendrier des échéances.

Principes appliqués (marchand de véhicules d'occasion, régime réel normal mensuel) :
- Vente d'un VO acheté sans TVA récupérable → TVA sur la MARGE (art. 297 A CGI) :
  marge TTC = prix de vente - prix d'achat du véhicule (hors frais annexes),
  TVA = marge TTC x 20/120. Une marge négative = 0 (pas de report).
- Frais / transport facturés HT par un prestataire de l'UE (Auto1 Berlin) →
  autoliquidation : base en A3 + ligne 08, TVA redéduite ligne 20 (neutre).
- TVA française sur facture (pièces, garage…) → déductible ligne 20, SEULEMENT
  si la facture est en main.
- Les charges sans TVA (commissions, frais admin) ne changent rien à la TVA ; elles
  comptent pour l'IS.

Toutes les sorties sont des AIDES À LA SAISIE : rien n'est transmis à l'administration.
"""
import json
from collections import defaultdict
from datetime import date, timedelta
from datetime import date as _date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from . import models
from .database import get_db
from .finance import intervention_cost

router = APIRouter(prefix="/fiscal", tags=["fiscal"])

VAT_RATE = 20.0
ENTRY_KINDS = {
    'achat_vehicule_marge': "Achat véhicule (régime de la marge)",
    'service_ue': "Prestation UE — TVA autoliquidée",
    'achat_fr_tva': "Achat France avec TVA déductible",
    'immobilisation': "Immobilisation (TVA déductible ligne 19)",
    'sans_tva': "Dépense sans TVA",
}
DONE_STATUSES = ('déposée', 'payée', 'non due')

DEFAULT_SETTINGS = {
    'company_name': 'SAS NEBAUTO',
    'siren': '937 843 142',
    'sie': "SIE Val-d'Oise Est — 01 76 29 72 39",
    'vat_regime': 'Réel normal mensuel (CA3)',
    'vat_due_day': '24',            # échéance CA3 : le 24 du mois suivant (décalée si férié/week-end)
    'first_vat_month': '2026-01',   # premier mois de CA3 suivi
    'initial_vat_credit': '0',      # crédit de TVA (ligne 27) à l'entrée du premier mois suivi
    'is_reference_amount': '0',     # IS de l'exercice précédent (acomptes dus si > 3 000 €)
    'is_deficit_carryforward': '413',  # déficit reportable (exercice 2024-2025)
    'fiscal_year_end': '12-31',
}


# ══════════════════════════════════════════════════════════════
# Outils dates / arrondis
# ══════════════════════════════════════════════════════════════

def _easter(year: int) -> date:
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l_ = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l_) // 451
    month = (h + l_ - 7 * m + 114) // 31
    day = ((h + l_ - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def _holidays(year: int):
    e = _easter(year)
    return {
        date(year, 1, 1), date(year, 5, 1), date(year, 5, 8), date(year, 7, 14),
        date(year, 8, 15), date(year, 11, 1), date(year, 11, 11), date(year, 12, 25),
        e + timedelta(days=1), e + timedelta(days=39), e + timedelta(days=50),
    }


def next_business_day(d: date) -> date:
    while d.weekday() >= 5 or d in _holidays(d.year):
        d += timedelta(days=1)
    return d


def vat_due_date(year: int, month: int, due_day: int = 24) -> date:
    y, m = (year + 1, 1) if month == 12 else (year, month + 1)
    return next_business_day(date(y, m, due_day))


def month_bounds(year: int, month: int):
    start = date(year, month, 1)
    end = (date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)) - timedelta(days=1)
    return start, end


def r2(x: float) -> float:
    return round((x or 0.0) + 1e-9, 2)


def euros(x: float) -> int:
    """Arrondi à l'euro le plus proche (les cases CA3 se saisissent en euros)."""
    x = x or 0.0
    return int(x + 0.5) if x >= 0 else -int(-x + 0.5)


def in_month(d: Optional[date], year: int, month: int) -> bool:
    return bool(d) and d.year == year and d.month == month


# ══════════════════════════════════════════════════════════════
# Paramètres
# ══════════════════════════════════════════════════════════════

def get_settings(db: Session) -> dict:
    rows = {r.key: r.value for r in db.query(models.TaxSetting).all()}
    out = dict(DEFAULT_SETTINGS)
    out.update({k: v for k, v in rows.items() if v is not None})
    return out


def _f(settings: dict, key: str, default: float = 0.0) -> float:
    try:
        return float(str(settings.get(key, default)).replace(',', '.'))
    except (TypeError, ValueError):
        return default


# ══════════════════════════════════════════════════════════════
# Chargement des données (une seule fois par calcul)
# ══════════════════════════════════════════════════════════════

class _Data:
    def __init__(self, db: Session):
        self.vehicles = db.query(models.Vehicle).all()
        self.entries = db.query(models.FiscalEntry).all()
        self.charges = db.query(models.Charge).all()
        self.interventions = db.query(models.Intervention).all()
        self.declarations = db.query(models.TaxDeclaration).all()
        self.settings = get_settings(db)
        self.veh = {v.id: v for v in self.vehicles}
        self.entries_by_vehicle = defaultdict(list)
        for e in self.entries:
            if e.vehicle_id:
                self.entries_by_vehicle[e.vehicle_id].append(e)
        self.linked_charges = {e.charge_id for e in self.entries if e.charge_id}
        self.linked_interventions = {e.intervention_id for e in self.entries if e.intervention_id}

    def ca3_declaration(self, year: int, month: int):
        start, _ = month_bounds(year, month)
        for d in self.declarations:
            if d.kind == 'CA3' and d.period_start == start:
                return d
        return None


def vehicle_label(v) -> str:
    if not v:
        return 'Véhicule inconnu'
    name = f"{v.brand or ''} {v.model or ''}".strip() or 'Véhicule'
    return f"{name} - {v.registration}" if v.registration else name


def margin_base(data: _Data, v) -> dict:
    """Prix d'achat retenu pour la marge : facture 'achat_vehicule_marge' si saisie,
    sinon prix d'achat du dashboard (qui peut inclure les frais → base à vérifier)."""
    car_entries = [e for e in data.entries_by_vehicle.get(v.id, []) if e.kind == 'achat_vehicule_marge']
    if car_entries:
        return {'amount': sum(e.amount_ht or 0 for e in car_entries), 'source': 'facture', 'estimated': False}
    return {'amount': v.price_buy or 0.0, 'source': 'prix d\'achat dashboard', 'estimated': True}


# ══════════════════════════════════════════════════════════════
# Calcul CA3 d'un mois
# ══════════════════════════════════════════════════════════════

def _compute_month(data: _Data, year: int, month: int, credit_in: float) -> dict:
    start, end = month_bounds(year, month)
    alerts = []

    # ── Ventes sous régime de la marge ──
    sales = []
    for v in data.vehicles:
        if not (in_month(v.date_sell, year, month) and v.price_sell):
            continue
        base = margin_base(data, v)
        marge_ttc = (v.price_sell or 0) - base['amount']
        marge_ttc_pos = max(0.0, marge_ttc)
        tva = marge_ttc_pos * VAT_RATE / (100 + VAT_RATE)
        marge_ht = marge_ttc_pos - tva
        sales.append({
            'vehicle_id': v.id, 'vehicle': vehicle_label(v), 'date': v.date_sell,
            'price_sell': r2(v.price_sell), 'purchase_base': r2(base['amount']),
            'purchase_source': base['source'], 'estimated': base['estimated'],
            'margin_ttc': r2(marge_ttc), 'margin_ht': r2(marge_ht), 'vat': r2(tva),
            'non_taxable_part': r2((v.price_sell or 0) - marge_ttc_pos),
        })
        if base['estimated']:
            alerts.append({'level': 'warning', 'vehicle_id': v.id,
                           'message': f"{vehicle_label(v)} : prix d'achat du véhicule seul non saisi — "
                                      f"la marge est calculée sur {r2(base['amount'])} € (peut inclure les frais Auto1)."})
        if marge_ttc < 0:
            alerts.append({'level': 'info', 'vehicle_id': v.id,
                           'message': f"{vehicle_label(v)} : marge négative ({r2(marge_ttc)} €) → TVA sur marge = 0 (pas de report)."})

    # ── Pièces fiscales du mois ──
    month_entries = [e for e in data.entries if in_month(e.date, year, month)]
    autoliq, deductible, immob, no_vat, car_buys = [], [], [], [], []
    for e in month_entries:
        row = {
            'id': e.id, 'date': e.date, 'kind': e.kind, 'label': e.label, 'supplier': e.supplier,
            'country': e.country, 'invoice_ref': e.invoice_ref, 'amount_ht': r2(e.amount_ht),
            'vat_rate': e.vat_rate, 'vat_amount': r2(e.vat_amount), 'has_invoice': bool(e.has_invoice),
            'vehicle_id': e.vehicle_id, 'vehicle': vehicle_label(data.veh.get(e.vehicle_id)) if e.vehicle_id else None,
        }
        if e.kind == 'service_ue':
            row['vat_amount'] = r2((e.amount_ht or 0) * (e.vat_rate or VAT_RATE) / 100)
            autoliq.append(row)
        elif e.kind == 'achat_fr_tva':
            deductible.append(row)
            if not e.has_invoice:
                alerts.append({'level': 'danger', 'message': f"{e.label or e.supplier or 'Achat'} : TVA non déductible tant que la facture n'est pas en main."})
        elif e.kind == 'immobilisation':
            immob.append(row)
        elif e.kind == 'achat_vehicule_marge':
            car_buys.append(row)
        else:
            no_vat.append(row)

    # ── Charges / travaux du dashboard non qualifiés fiscalement ──
    unqualified = []
    for c in data.charges:
        if in_month(c.date, year, month) and c.id not in data.linked_charges:
            unqualified.append({'type': 'charge', 'id': c.id, 'date': c.date, 'vehicle_id': c.vehicle_id,
                                'vehicle': vehicle_label(data.veh.get(c.vehicle_id)),
                                'label': ' · '.join(filter(None, [c.category, c.description])), 'amount': r2(c.amount)})
    for i in data.interventions:
        d = i.date_done or i.date_planned
        if in_month(d, year, month) and i.id not in data.linked_interventions and i.status != 'annulée':
            unqualified.append({'type': 'travaux', 'id': i.id, 'date': d, 'vehicle_id': i.vehicle_id,
                                'vehicle': vehicle_label(data.veh.get(i.vehicle_id)), 'label': i.title,
                                'amount': r2(intervention_cost(i.status, i.cost_estimated, i.cost_actual))})
    for v in data.vehicles:
        if in_month(v.date_buy, year, month) and not any(
                e.kind == 'achat_vehicule_marge' for e in data.entries_by_vehicle.get(v.id, [])):
            alerts.append({'level': 'warning', 'vehicle_id': v.id,
                           'message': f"{vehicle_label(v)} acheté ce mois : factures d'achat (véhicule + frais) non saisies."})

    # ── Cases CA3 ──
    tva_marge = sum(s['vat'] for s in sales)
    a1 = sum(s['margin_ht'] for s in sales)
    e2 = sum(s['non_taxable_part'] for s in sales)
    a3 = sum(r['amount_ht'] for r in autoliq)
    tva_autoliq = sum(r['vat_amount'] for r in autoliq)
    l19 = sum(r['vat_amount'] for r in immob if r['has_invoice'])
    l20 = tva_autoliq + sum(r['vat_amount'] for r in deductible if r['has_invoice'])

    lines = {}
    lines['A1'] = euros(a1)
    lines['A3'] = euros(a3)
    lines['E2'] = euros(e2)
    lines['08_base'] = euros(a1 + a3)
    lines['08_tax'] = euros(tva_marge + tva_autoliq)
    lines['16'] = lines['08_tax']
    lines['19'] = euros(l19)
    lines['20'] = euros(l20)
    lines['22'] = euros(credit_in)
    lines['23'] = lines['19'] + lines['20'] + lines['22']
    diff = lines['16'] - lines['23']
    lines['TD'] = diff if diff > 0 else 0
    lines['25'] = -diff if diff < 0 else 0
    lines['27'] = lines['25']
    lines['28'] = lines['TD']
    lines['32'] = lines['TD']

    has_ops = bool(sales or autoliq or deductible or immob)
    neant = not has_ops and lines['22'] == 0

    decl = data.ca3_declaration(year, month)
    due = vat_due_date(year, month, int(_f(data.settings, 'vat_due_day', 24)))
    today = date.today()
    if decl and decl.status in DONE_STATUSES:
        status = decl.status
    elif today <= end:
        status = 'en cours'
    elif today > due:
        status = 'en retard'
    else:
        status = 'à faire'

    # Estimation pénalités (si en retard et TVA due) : majoration 10 % (art. 1728 CGI)
    # + intérêts de retard 0,20 %/mois (art. 1727). Estimation indicative.
    penalty = None
    if status == 'en retard' and lines['TD'] > 0:
        months_late = (today.year - due.year) * 12 + (today.month - due.month) + (1 if today.day >= due.day else 0)
        months_late = max(1, months_late)
        penalty = {
            'months': months_late,
            'majoration_10': r2(lines['TD'] * 0.10),
            'interets': r2(lines['TD'] * 0.002 * months_late),
        }
        penalty['total'] = r2(penalty['majoration_10'] + penalty['interets'])

    # Si une déclaration déposée indique un crédit reporté, on le prend pour le mois suivant.
    credit_out = lines['27']
    if decl and decl.status in DONE_STATUSES and decl.credit_carried is not None:
        credit_out = decl.credit_carried

    return {
        'year': year, 'month': month, 'period_start': start, 'period_end': end,
        'due_date': due, 'status': status, 'neant': neant,
        'declaration': _decl_dict(decl) if decl else None,
        'lines': lines,
        'exact': {'tva_marge': r2(tva_marge), 'tva_autoliquidee': r2(tva_autoliq), 'a1': r2(a1),
                  'a3': r2(a3), 'e2': r2(e2), 'l19': r2(l19), 'l20': r2(l20)},
        'sales': sales, 'autoliquidations': autoliq, 'deductible': deductible,
        'immobilisations': immob, 'sans_tva': no_vat, 'achats_vehicules': car_buys,
        'unqualified': unqualified, 'alerts': alerts, 'penalty': penalty,
        'credit_out': credit_out,
    }


def compute_year(db: Session, year: int, data: Optional[_Data] = None) -> List[dict]:
    data = data or _Data(db)
    first = str(data.settings.get('first_vat_month') or '2026-01')
    try:
        fy, fm = (int(x) for x in first.split('-')[:2])
    except ValueError:
        fy, fm = year, 1
    credit = _f(data.settings, 'initial_vat_credit', 0.0)
    results = []
    y, m = fy, fm
    while (y, m) <= (year, 12):
        res = _compute_month(data, y, m, credit)
        credit = res['credit_out'] or 0.0
        if y == year:
            results.append(res)
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    # mois de l'année antérieurs au premier mois suivi
    if year == fy and fm > 1:
        for mm in range(1, fm):
            start, end = month_bounds(year, mm)
            decl = data.ca3_declaration(year, mm)
            results.insert(mm - 1, {'year': year, 'month': mm, 'period_start': start, 'period_end': end,
                                    'due_date': vat_due_date(year, mm), 'status': decl.status if decl else 'hors suivi',
                                    'declaration': _decl_dict(decl) if decl else None, 'lines': {}, 'not_tracked': True})
    return results


# ══════════════════════════════════════════════════════════════
# IS / CVAE / autres échéances
# ══════════════════════════════════════════════════════════════

def compute_is(data: _Data, year: int, months: List[dict]) -> dict:
    sold = [v for v in data.vehicles if v.date_sell and v.date_sell.year == year and v.price_sell]
    sold_ids = {v.id for v in sold}
    tva_marge = sum(s['vat'] for m in months for s in m.get('sales', []))
    ca_ttc = sum(v.price_sell for v in sold)
    ca_ht = ca_ttc - tva_marge
    cost_sold = sum(v.price_buy or 0 for v in sold)   # prix payé (véhicule + frais Auto1)
    charges_y = [c for c in data.charges if c.date and c.date.year == year]
    commissions = sum(c.amount for c in charges_y if (c.category or '').lower().startswith('commission'))
    other_charges = sum(c.amount for c in charges_y) - commissions
    travaux = sum(intervention_cost(i.status, i.cost_estimated, i.cost_actual)
                  for i in data.interventions if i.vehicle_id in sold_ids)
    stock = [v for v in data.vehicles if v.date_buy and v.date_buy.year <= year and not (v.date_sell and v.date_sell.year <= year)]
    stock_value = sum(v.price_buy or 0 for v in stock)
    result = ca_ht - cost_sold - other_charges - commissions - travaux
    deficit = _f(data.settings, 'is_deficit_carryforward', 0.0)
    taxable = max(0.0, result - deficit)
    is_15 = min(taxable, 42500) * 0.15
    is_25 = max(0.0, taxable - 42500) * 0.25
    ref = _f(data.settings, 'is_reference_amount', 0.0)
    acomptes_dus = ref > 3000
    acompte_dates = [date(year, 3, 15), date(year, 6, 15), date(year, 9, 15), date(year, 12, 15)]
    return {
        'year': year,
        'ca_ttc': r2(ca_ttc), 'tva_marge': r2(tva_marge), 'ca_ht': r2(ca_ht),
        'cout_vehicules_vendus': r2(cost_sold), 'charges': r2(other_charges),
        'commissions': r2(commissions), 'travaux_vehicules_vendus': r2(travaux),
        'resultat_estime': r2(result), 'deficit_reportable': r2(deficit),
        'resultat_imposable': r2(taxable),
        'is_estime': r2(is_15 + is_25), 'is_15': r2(is_15), 'is_25': r2(is_25),
        'stock_fin': {'count': len(stock), 'value': r2(stock_value),
                      'vehicles': [vehicle_label(v) for v in stock]},
        'is_reference_amount': ref,
        'acomptes_dus': acomptes_dus,
        'acomptes': [{'num': i + 1, 'due_date': next_business_day(d),
                      'montant': r2(ref * 0.25) if acomptes_dus else 0.0} for i, d in enumerate(acompte_dates)],
        'solde_date': next_business_day(date(year + 1, 5, 15)),
        'liasse_date': next_business_day(date(year + 1, 5, 20)),
        'notes': [
            "Estimation : coût des véhicules vendus = prix payé (véhicule + frais). Les véhicules en stock au 31/12 ne sont pas une charge.",
            "Taux réduit 15 % jusqu'à 42 500 € de bénéfice (PME : CA < 10 M€, capital entièrement libéré, détenu à 75 % au moins par des personnes physiques), 25 % au-delà.",
            "Acomptes d'IS dus seulement si l'IS de l'exercice précédent dépasse 3 000 €.",
            "Commissions : déductibles si elles sont justifiées (facture / note) ; une commission versée au dirigeant est une rémunération (charges sociales possibles).",
        ],
    }


def compute_cvae(ca_ht: float) -> dict:
    return {
        'due': ca_ht >= 500000,
        'declaration_1330_required': ca_ht > 152500,
        'acompte_1329_ac_required': False,
        'message': ("CA HT inférieur à 500 000 € : aucune CVAE à payer, pas d'acompte 1329-AC."
                    + (" Déclaration 1330-CVAE à déposer en mai (CA > 152 500 €)." if ca_ht > 152500 else
                       " Pas de déclaration 1330-CVAE (CA ≤ 152 500 €).")) if ca_ht < 500000 else
                   "CA HT ≥ 500 000 € : CVAE due — vérifier les acomptes (1329-AC) si la CVAE N-1 dépasse 1 500 €.",
    }


def _decl_dict(d) -> dict:
    return {c.name: getattr(d, c.name) for c in models.TaxDeclaration.__table__.columns}


def _entry_dict(e, data: Optional[_Data] = None) -> dict:
    out = {c.name: getattr(e, c.name) for c in models.FiscalEntry.__table__.columns}
    if data and e.vehicle_id:
        out['vehicle'] = vehicle_label(data.veh.get(e.vehicle_id))
    return out


# ══════════════════════════════════════════════════════════════
# Schémas
# ══════════════════════════════════════════════════════════════

class EntryIn(BaseModel):
    vehicle_id: Optional[int] = None
    charge_id: Optional[int] = None
    intervention_id: Optional[int] = None
    document_id: Optional[int] = None
    date: Optional[_date] = None
    kind: str
    label: Optional[str] = None
    supplier: Optional[str] = None
    country: Optional[str] = 'FR'
    invoice_ref: Optional[str] = None
    amount_ht: Optional[float] = 0.0
    vat_rate: Optional[float] = VAT_RATE
    vat_amount: Optional[float] = 0.0
    has_invoice: Optional[bool] = True
    notes: Optional[str] = None


class EntryUpdate(BaseModel):
    vehicle_id: Optional[int] = None
    charge_id: Optional[int] = None
    intervention_id: Optional[int] = None
    document_id: Optional[int] = None
    date: Optional[_date] = None
    kind: Optional[str] = None
    label: Optional[str] = None
    supplier: Optional[str] = None
    country: Optional[str] = None
    invoice_ref: Optional[str] = None
    amount_ht: Optional[float] = None
    vat_rate: Optional[float] = None
    vat_amount: Optional[float] = None
    has_invoice: Optional[bool] = None
    notes: Optional[str] = None


class DeclarationIn(BaseModel):
    kind: str
    form: Optional[str] = None
    period_start: Optional[_date] = None
    period_end: Optional[_date] = None
    due_date: Optional[_date] = None
    status: Optional[str] = 'à faire'
    filed_date: Optional[_date] = None
    deposit_number: Optional[str] = None
    amount_declared: Optional[float] = None
    credit_carried: Optional[float] = None
    notes: Optional[str] = None


class DeclarationUpdate(BaseModel):
    kind: Optional[str] = None
    form: Optional[str] = None
    period_start: Optional[_date] = None
    period_end: Optional[_date] = None
    due_date: Optional[_date] = None
    status: Optional[str] = None
    filed_date: Optional[_date] = None
    deposit_number: Optional[str] = None
    amount_declared: Optional[float] = None
    credit_carried: Optional[float] = None
    notes: Optional[str] = None


def _clean_entry(payload: dict) -> dict:
    if 'kind' in payload and payload['kind'] not in ENTRY_KINDS:
        raise HTTPException(status_code=400, detail=f"Type inconnu : {payload['kind']}")
    if 'has_invoice' in payload and payload['has_invoice'] is not None:
        payload['has_invoice'] = 1 if payload['has_invoice'] else 0
    return payload


# ══════════════════════════════════════════════════════════════
# Routes
# ══════════════════════════════════════════════════════════════

@router.get("/meta")
def meta():
    return {'entry_kinds': ENTRY_KINDS, 'vat_rate': VAT_RATE}


@router.get("/settings")
def read_settings(db: Session = Depends(get_db)):
    return get_settings(db)


@router.put("/settings")
def write_settings(values: dict, db: Session = Depends(get_db)):
    for k, v in values.items():
        if k not in DEFAULT_SETTINGS:
            continue
        row = db.query(models.TaxSetting).filter(models.TaxSetting.key == k).first()
        if row:
            row.value = None if v is None else str(v)
        else:
            db.add(models.TaxSetting(key=k, value=None if v is None else str(v)))
    db.commit()
    return get_settings(db)


@router.get("/entries")
def list_entries(year: Optional[int] = None, month: Optional[int] = None,
                 vehicle_id: Optional[int] = None, db: Session = Depends(get_db)):
    data = _Data(db)
    rows = data.entries
    if vehicle_id:
        rows = [e for e in rows if e.vehicle_id == vehicle_id]
    if year:
        rows = [e for e in rows if e.date and e.date.year == year]
    if month:
        rows = [e for e in rows if e.date and e.date.month == month]
    rows = sorted(rows, key=lambda e: (e.date or date.min, e.id), reverse=True)
    return [_entry_dict(e, data) for e in rows]


@router.post("/entries", status_code=201)
def create_entry(payload: EntryIn, db: Session = Depends(get_db)):
    e = models.FiscalEntry(**_clean_entry(payload.model_dump()))
    db.add(e)
    db.commit()
    db.refresh(e)
    return _entry_dict(e)


@router.post("/entries/bulk", status_code=201)
def create_entries_bulk(payload: List[EntryIn], skip_duplicates: bool = True, db: Session = Depends(get_db)):
    """Import en masse. Doublon = même référence de facture + même type + même véhicule."""
    existing = {(e.invoice_ref, e.kind, e.vehicle_id) for e in db.query(models.FiscalEntry).all() if e.invoice_ref}
    created, skipped = [], 0
    for p in payload:
        if skip_duplicates and p.invoice_ref and (p.invoice_ref, p.kind, p.vehicle_id) in existing:
            skipped += 1
            continue
        e = models.FiscalEntry(**_clean_entry(p.model_dump()))
        db.add(e)
        created.append(e)
    db.commit()
    return {'created': len(created), 'skipped': skipped}


@router.put("/entries/{entry_id}")
def update_entry(entry_id: int, payload: EntryUpdate, db: Session = Depends(get_db)):
    e = db.query(models.FiscalEntry).filter(models.FiscalEntry.id == entry_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Pièce non trouvée")
    for k, v in _clean_entry(payload.model_dump(exclude_unset=True)).items():
        setattr(e, k, v)
    db.commit()
    db.refresh(e)
    return _entry_dict(e)


@router.delete("/entries/{entry_id}")
def delete_entry(entry_id: int, db: Session = Depends(get_db)):
    e = db.query(models.FiscalEntry).filter(models.FiscalEntry.id == entry_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Pièce non trouvée")
    db.delete(e)
    db.commit()
    return {"message": "Pièce supprimée"}


@router.get("/declarations")
def list_declarations(db: Session = Depends(get_db)):
    rows = db.query(models.TaxDeclaration).order_by(models.TaxDeclaration.period_start.desc()).all()
    return [_decl_dict(d) for d in rows]


@router.post("/declarations", status_code=201)
def create_declaration(payload: DeclarationIn, db: Session = Depends(get_db)):
    if payload.kind == 'CA3' and payload.period_start:
        existing = db.query(models.TaxDeclaration).filter(
            models.TaxDeclaration.kind == 'CA3',
            models.TaxDeclaration.period_start == payload.period_start).first()
        if existing:
            for k, v in payload.model_dump(exclude_unset=True).items():
                setattr(existing, k, v)
            db.commit()
            db.refresh(existing)
            return _decl_dict(existing)
    d = models.TaxDeclaration(**payload.model_dump())
    db.add(d)
    db.commit()
    db.refresh(d)
    return _decl_dict(d)


@router.put("/declarations/{decl_id}")
def update_declaration(decl_id: int, payload: DeclarationUpdate, db: Session = Depends(get_db)):
    d = db.query(models.TaxDeclaration).filter(models.TaxDeclaration.id == decl_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Déclaration non trouvée")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(d, k, v)
    db.commit()
    db.refresh(d)
    return _decl_dict(d)


@router.delete("/declarations/{decl_id}")
def delete_declaration(decl_id: int, db: Session = Depends(get_db)):
    d = db.query(models.TaxDeclaration).filter(models.TaxDeclaration.id == decl_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Déclaration non trouvée")
    db.delete(d)
    db.commit()
    return {"message": "Déclaration supprimée"}


@router.get("/vat")
def vat_month(year: int, month: int = Query(..., ge=1, le=12), db: Session = Depends(get_db)):
    months = compute_year(db, year)
    res = next((m for m in months if m['month'] == month), None)
    if not res:
        raise HTTPException(status_code=404, detail="Mois hors suivi")
    return res


@router.get("/overview")
def overview(year: int, db: Session = Depends(get_db)):
    data = _Data(db)
    months = compute_year(db, year, data)
    is_info = compute_is(data, year, months)
    cvae = compute_cvae(is_info['ca_ht'])
    today = date.today()

    deadlines = []
    for m in months:
        if m.get('not_tracked'):
            continue
        deadlines.append({'kind': 'CA3', 'label': f"TVA {m['month']:02d}/{year} (3310-CA3)", 'due_date': m['due_date'],
                          'status': m['status'], 'amount': m['lines'].get('TD', 0), 'month': m['month']})
    is_decls = [d for d in data.declarations if d.kind == 'IS_ACOMPTE' and d.period_start and d.period_start.year == year]
    for a in is_info['acomptes']:
        decl = next((d for d in is_decls if (d.notes or '').startswith(f"Acompte {a['num']}")), None)
        st = decl.status if decl else ('non dû' if not is_info['acomptes_dus'] else
                                       ('en retard' if today > a['due_date'] else 'à faire'))
        deadlines.append({'kind': 'IS_ACOMPTE', 'label': f"IS — acompte n°{a['num']} (2571)", 'due_date': a['due_date'],
                          'status': st, 'amount': a['montant']})
    deadlines.append({'kind': 'CVAE', 'label': 'CVAE — acompte (1329-AC)', 'due_date': next_business_day(date(year, 9, 15)),
                      'status': 'non dû' if not cvae['due'] else 'à vérifier', 'amount': 0})
    deadlines.append({'kind': 'CFE', 'label': 'CFE (avis dans l\'espace pro, paiement)', 'due_date': date(year, 12, 15),
                      'status': 'à vérifier', 'amount': None})
    deadlines.sort(key=lambda x: x['due_date'])

    tracked = [m for m in months if not m.get('not_tracked')]
    totals = {
        'tva_due': sum(m['lines'].get('TD', 0) for m in tracked),
        'tva_due_unpaid': sum(m['lines'].get('TD', 0) for m in tracked if m['status'] not in DONE_STATUSES),
        'late_count': sum(1 for d in deadlines if d['status'] == 'en retard'),
        'todo_count': sum(1 for d in deadlines if d['status'] in ('à faire', 'en retard')),
        'penalties_estimate': r2(sum((m.get('penalty') or {}).get('total', 0) for m in tracked)),
        'alerts': sum(len(m.get('alerts', [])) + len(m.get('unqualified', [])) for m in tracked),
    }
    summary = [{k: m.get(k) for k in ('month', 'status', 'due_date', 'neant', 'penalty', 'declaration', 'not_tracked')}
               | {'lines': m.get('lines', {}), 'sales_count': len(m.get('sales', [])),
                  'alerts_count': len(m.get('alerts', [])) + len(m.get('unqualified', []))} for m in months]
    return {'year': year, 'settings': data.settings, 'months': summary, 'is': is_info, 'cvae': cvae,
            'deadlines': deadlines, 'totals': totals, 'today': today}
