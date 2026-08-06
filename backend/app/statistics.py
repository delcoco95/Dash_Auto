from datetime import date
from sqlalchemy.orm import Session
from . import models
from collections import defaultdict


def compute_kpis(db: Session):
    # Basic KPIs computed from vehicles and charges
    vehicles = db.query(models.Vehicle).all()
    charges = db.query(models.Charge).all()

    total_buy = 0.0
    total_sell = 0.0
    total_charges = 0.0
    count_sold = 0
    durations = []
    profits = []
    by_category = defaultdict(float)

    veh_map = {v.id: v for v in vehicles}
    for v in vehicles:
        if v.price_buy:
            total_buy += v.price_buy
        if v.price_sell:
            total_sell += v.price_sell
            count_sold += 1
            # duration in days
            if v.date_buy and v.date_sell:
                durations.append((v.date_sell - v.date_buy).days)
            profit = 0.0
            if v.price_sell and v.price_buy:
                profit = v.price_sell - v.price_buy
            profits.append({"vehicle_id": v.id, "profit": profit})

    for c in charges:
        total_charges += c.amount
        by_category[c.category] += c.amount
        # attach to profits
        if c.vehicle_id in veh_map:
            for p in profits:
                if p['vehicle_id'] == c.vehicle_id:
                    p['profit'] -= c.amount

    avg_duration = sum(durations) / len(durations) if durations else None
    avg_profit = sum([p['profit'] for p in profits]) / len(profits) if profits else None
    total_profit = sum([p['profit'] for p in profits])

    top_vehicles = sorted(profits, key=lambda x: x['profit'], reverse=True)[:5]
    worst_vehicles = sorted(profits, key=lambda x: x['profit'])[:5]

    return {
        'total_buy': total_buy,
        'total_sell': total_sell,
        'total_charges': total_charges,
        'total_profit': total_profit,
        'avg_profit': avg_profit,
        'avg_duration_days': avg_duration,
        'top_vehicles': top_vehicles,
        'worst_vehicles': worst_vehicles,
        'expenses_by_category': dict(by_category),
        'count_vehicles': len(vehicles),
        'count_sold': count_sold
    }
