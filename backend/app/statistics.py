"""Indicateurs du tableau de bord.

Règles (pour que les cartes s'additionnent) :
- Profit net = Ventes − Achats − Charges − Travaux, calculés **sur les véhicules vendus**
  (+ les charges générales non rattachées à un véhicule).
- Les véhicules en stock sont présentés à part (« argent immobilisé ») : leur achat et
  leurs frais déjà payés ne sont pas une perte, ils seront récupérés à la vente.
- Un travail « à prévoir » sans coût réel n'est pas une dépense : il apparaît en « prévu ».
- Les véhicules exclus du suivi (réglage excluded_vehicle_ids, ex. achat futur) sont ignorés.
- Les commissions des associés ne sont pas prises en compte ici (suivi séparé).
"""
from collections import defaultdict
from sqlalchemy.orm import Session
from . import models
from .finance import vehicle_profit

SPENT_STATUSES = ('terminée', 'en cours')


def intervention_spent(i) -> float:
    """Montant réellement engagé pour un travail (0 s'il est seulement prévu ou annulé)."""
    if i.status == 'annulée':
        return 0.0
    if i.cost_actual is not None:
        return float(i.cost_actual)
    if i.status in SPENT_STATUSES:
        return float(i.cost_estimated or 0.0)
    return 0.0


def intervention_planned(i) -> float:
    if i.status == 'annulée' or intervention_spent(i):
        return 0.0
    return float(i.cost_estimated or 0.0)


def is_sold(v) -> bool:
    return bool(v.date_sell) or (v.status or '').lower() == 'vendu'


def excluded_ids(db: Session) -> set:
    s = db.query(models.TaxSetting).filter(models.TaxSetting.key == 'excluded_vehicle_ids').first()
    raw = (s.value if s else '') or ''
    return {int(x) for x in raw.replace(';', ',').split(',') if x.strip().isdigit()}


def compute_kpis(db: Session):
    excl = excluded_ids(db)
    vehicles = [v for v in db.query(models.Vehicle).all() if v.id not in excl]
    charges = [c for c in db.query(models.Charge).all() if c.vehicle_id not in excl]
    interventions = [i for i in db.query(models.Intervention).all() if i.vehicle_id not in excl]

    charges_by_vehicle = defaultdict(float)
    general_charges = 0.0
    by_category = defaultdict(float)
    for c in charges:
        by_category[c.category or 'Autre'] += c.amount or 0
        if c.vehicle_id:
            charges_by_vehicle[c.vehicle_id] += c.amount or 0
        else:
            general_charges += c.amount or 0

    spent_by_vehicle = defaultdict(float)
    planned_by_vehicle = defaultdict(float)
    for i in interventions:
        spent_by_vehicle[i.vehicle_id] += intervention_spent(i)
        planned_by_vehicle[i.vehicle_id] += intervention_planned(i)

    sold = {'sell': 0.0, 'buy': 0.0, 'charges': 0.0, 'works': 0.0, 'count': 0}
    stock = {'buy': 0.0, 'charges': 0.0, 'works': 0.0, 'planned': 0.0, 'target': 0.0, 'count': 0}
    durations, profits, per_vehicle = [], [], []

    for v in vehicles:
        ch, wk = charges_by_vehicle.get(v.id, 0.0), spent_by_vehicle.get(v.id, 0.0)
        if is_sold(v) and v.price_sell:
            sold['sell'] += v.price_sell
            sold['buy'] += v.price_buy or 0
            sold['charges'] += ch
            sold['works'] += wk
            sold['count'] += 1
            if v.date_buy and v.date_sell:
                durations.append((v.date_sell - v.date_buy).days)
            p = vehicle_profit(v.price_buy or 0, v.price_sell, ch, wk)
            profits.append({'vehicle_id': v.id, 'profit': round(p, 2)})
            per_vehicle.append({'vehicle_id': v.id, 'sold': True, 'sell': v.price_sell, 'buy': v.price_buy or 0,
                                'charges': round(ch, 2), 'works': round(wk, 2), 'profit': round(p, 2)})
        else:
            stock['buy'] += v.price_buy or 0
            stock['charges'] += ch
            stock['works'] += wk
            stock['planned'] += planned_by_vehicle.get(v.id, 0.0)
            stock['target'] += v.price_sell or 0
            stock['count'] += 1
            per_vehicle.append({'vehicle_id': v.id, 'sold': False, 'target': v.price_sell, 'buy': v.price_buy or 0,
                                'charges': round(ch, 2), 'works': round(wk, 2),
                                'planned': round(planned_by_vehicle.get(v.id, 0.0), 2)})

    total_charges = sold['charges'] + general_charges
    total_profit = sum(p['profit'] for p in profits) - general_charges
    stock_invested = stock['buy'] + stock['charges'] + stock['works']
    r = lambda x: round(x, 2)

    return {
        # Véhicules vendus — Profit = Ventes − Achats − Charges − Travaux
        'total_sell': r(sold['sell']),
        'total_buy': r(sold['buy']),
        'total_charges': r(total_charges),
        'general_charges': r(general_charges),
        'total_interventions': r(sold['works']),
        'total_profit': r(total_profit),
        'avg_profit': r(total_profit / len(profits)) if profits else None,
        'avg_duration_days': sum(durations) / len(durations) if durations else None,
        'count_sold': sold['count'],
        # Stock (argent immobilisé, pas une perte)
        'stock_count': stock['count'],
        'stock_buy': r(stock['buy']),
        'stock_charges': r(stock['charges']),
        'stock_interventions': r(stock['works']),
        'stock_invested': r(stock_invested),
        'stock_planned': r(stock['planned']),
        'stock_target': r(stock['target']),
        # Tout confondu
        'all_buy': r(sold['buy'] + stock['buy']),
        'all_charges': r(total_charges + stock['charges']),
        'all_interventions': r(sold['works'] + stock['works']),
        'cash_result': r(sold['sell'] - sold['buy'] - stock['buy'] - total_charges - stock['charges'] - sold['works'] - stock['works']),
        'top_vehicles': sorted(profits, key=lambda x: x['profit'], reverse=True)[:5],
        'worst_vehicles': sorted(profits, key=lambda x: x['profit'])[:5],
        'per_vehicle': per_vehicle,
        'expenses_by_category': dict(by_category),
        'count_vehicles': len(vehicles),
        'excluded_vehicle_ids': sorted(excl),
    }
