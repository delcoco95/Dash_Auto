"""Règles de calcul financier partagées (statistics.py et ai_agent.py),
pour éviter que le bénéfice affiché diverge entre le dashboard et l'assistant IA.
"""


def intervention_cost(status, cost_estimated, cost_actual):
    """Coût à imputer pour une intervention : le coût réel s'il est connu,
    sinon l'estimation ; un travail annulé ne coûte rien."""
    if status == 'annulée':
        return 0.0
    if cost_actual is not None:
        return cost_actual
    return cost_estimated or 0.0


def vehicle_profit(price_buy, price_sell, charges_total, interventions_total):
    """Bénéfice net d'un véhicule vendu : vente - achat - charges - travaux.
    None si le véhicule n'est pas (encore) vendu."""
    if price_sell is None or price_buy is None:
        return None
    return price_sell - price_buy - charges_total - interventions_total
