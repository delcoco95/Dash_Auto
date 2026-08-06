import os
from . import models
from openai import OpenAI
from sqlalchemy.orm import Session

OPENAI_KEY = os.getenv('OPENAI_API_KEY')
_client = OpenAI(api_key=OPENAI_KEY) if OPENAI_KEY else None

SYSTEM_PROMPT = (
    "You are an expert automotive trading advisor. Use provided structured data to answer the user's question. "
    "Always justify recommendations with numeric data from the inventory, charges, and computed KPIs. If external market data is requested and OPENAI web access is not available, be explicit that external data was not fetched."
)


def gather_context(db: Session, query: str):
    # Collect recent vehicles, top/worst, and expenses
    vehicles = db.query(models.Vehicle).limit(200).all()
    charges = db.query(models.Charge).limit(500).all()

    veh_summaries = []
    for v in vehicles:
        veh_summaries.append({
            'id': v.id,
            'brand': v.brand,
            'model': v.model,
            'year': v.year,
            'km': v.km,
            'status': v.status,
            'price_buy': v.price_buy,
            'price_sell': v.price_sell
        })

    charge_summaries = []
    for c in charges:
        charge_summaries.append({'vehicle_id': c.vehicle_id, 'category': c.category, 'amount': c.amount})

    return {
        'query': query,
        'vehicles': veh_summaries,
        'charges': charge_summaries
    }


def local_analysis(context: dict):
    # Simple heuristics: identify vehicles with negative profit, high charges relative to buy price
    vehicles = context['vehicles']
    charges = context['charges']
    charge_by_vehicle = {}
    for c in charges:
        charge_by_vehicle.setdefault(c['vehicle_id'], 0.0)
        charge_by_vehicle[c['vehicle_id']] += c['amount']

    analysis = []
    for v in vehicles:
        buy = v.get('price_buy') or 0
        sell = v.get('price_sell') or 0
        profit_if_sold = (sell - buy) - charge_by_vehicle.get(v['id'], 0.0)
        analysis.append({'vehicle_id': v['id'], 'brand': v['brand'], 'model': v['model'], 'profit_if_sold': profit_if_sold, 'charges': charge_by_vehicle.get(v['id'], 0.0)})

    # examples: best opportunity = high positive profit and currently in stock
    opportunities = [a for a in analysis if a['profit_if_sold'] > 0 and any((veh for veh in vehicles if veh['id']==a['vehicle_id'] and veh['status']=='en stock'))]
    opportunities = sorted(opportunities, key=lambda x: x['profit_if_sold'], reverse=True)[:5]
    costly = sorted(analysis, key=lambda x: x['charges'], reverse=True)[:5]

    return {'opportunities': opportunities, 'high_costs': costly, 'raw': analysis}


def handle_query(db: Session, query: str):
    context = gather_context(db, query)
    local = local_analysis(context)

    # If OpenAI available, call it with data appended; otherwise return local analysis
    if OPENAI_KEY and _client:
        prompt = SYSTEM_PROMPT + "\n\nUser query:\n" + query + "\n\nContext (vehicles list, limited):\n" + str(context['vehicles'][:25]) + "\nCharges (limited):\n" + str(context['charges'][:50]) + "\n\nLocal analysis summary:\n" + str(local)
        try:
            resp = _client.chat.completions.create(
                model=os.getenv('OPENAI_MODEL', 'gpt-4o-mini'),
                messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
                max_tokens=800
            )
            content = resp.choices[0].message.content
            return {'answer': content, 'local_analysis': local}
        except Exception as e:
            return {'error': 'OpenAI call failed: ' + str(e), 'local_analysis': local}
    else:
        return {'note': 'OPENAI_API_KEY not configured; returning local analysis only.', 'local_analysis': local}
