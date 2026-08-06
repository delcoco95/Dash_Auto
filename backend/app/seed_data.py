from datetime import date

from .database import SessionLocal, init_db
from . import models


def seed():
    init_db()
    db = SessionLocal()
    try:
        has_data = db.query(models.Vehicle).count() > 0
        if has_data:
            return
        v1 = models.Vehicle(
            brand="Peugeot",
            model="208",
            year=2018,
            type="Citadine",
            km=85000,
            date_buy=date(2024, 1, 10),
            price_buy=7000.0,
            status="vendu",
            date_sell=date(2024, 3, 10),
            price_sell=9200.0,
        )
        v2 = models.Vehicle(
            brand="BMW",
            model="320d",
            year=2012,
            type="Berline",
            km=120000,
            date_buy=date(2025, 5, 1),
            price_buy=15000.0,
            status="en stock",
        )
        db.add_all([v1, v2])
        db.commit()
    finally:
        db.close()

