from sqlalchemy import Column, Integer, String, Date, Float, ForeignKey, Text, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base


class Vehicle(Base):
    __tablename__ = 'vehicles'
    id = Column(Integer, primary_key=True, index=True)

    # ── Informations générales ──────────────────────────────
    brand = Column(String, index=True)
    model = Column(String, index=True)
    version = Column(String, nullable=True)          # finition
    year = Column(Integer, nullable=True)
    registration = Column(String, nullable=True, index=True)  # immatriculation
    vin = Column(String, nullable=True)
    type = Column(String, nullable=True)
    fuel = Column(String, nullable=True)              # essence, diesel, électrique…
    gearbox = Column(String, nullable=True)           # manuelle, automatique
    color = Column(String, nullable=True)
    doors = Column(Integer, nullable=True)
    seats = Column(Integer, nullable=True)

    # ── Informations financières ───────────────────────────
    km = Column(Integer, nullable=True)
    date_buy = Column(Date, nullable=True)
    price_buy = Column(Float, nullable=True)
    date_sell = Column(Date, nullable=True)
    price_sell = Column(Float, nullable=True)
    estimated_value = Column(Float, nullable=True)
    status = Column(String, default='en stock', index=True)

    # ── Informations techniques ────────────────────────────
    date_last_service = Column(Date, nullable=True)
    date_next_service = Column(Date, nullable=True)
    date_last_ct = Column(Date, nullable=True)
    date_next_ct = Column(Date, nullable=True)
    engine_state = Column(String, nullable=True)
    body_state = Column(String, nullable=True)
    tire_state = Column(String, nullable=True)
    interior_state = Column(String, nullable=True)

    # ── Notes ─────────────────────────────────────────────
    notes = Column(Text, nullable=True)
    internal_notes = Column(Text, nullable=True)
    custom_fields = Column(Text, nullable=True)  # JSON string {"key": "value"}

    # ── Timestamps ────────────────────────────────────────
    created_at = Column(DateTime, server_default=func.now())

    # ── Relations ─────────────────────────────────────────
    documents = relationship('Document', back_populates='vehicle', cascade='all, delete-orphan')
    charges = relationship('Charge', back_populates='vehicle', cascade='all, delete-orphan')
    interventions = relationship('Intervention', back_populates='vehicle', cascade='all, delete-orphan')
    images = relationship('VehicleImage', back_populates='vehicle', cascade='all, delete-orphan')

    @property
    def main_image_url(self):
        main_img = next((img for img in self.images if img.is_main), None)
        if main_img:
            return main_img.url
        elif self.images:
            return self.images[0].url
        return None


class VehicleImage(Base):
    __tablename__ = 'vehicle_images'
    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey('vehicles.id', ondelete='CASCADE'))
    url = Column(String)
    is_main = Column(Integer, default=0) # Boolean representation for SQLite
    position = Column(Integer, default=0)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    vehicle = relationship('Vehicle', back_populates='images')


class Intervention(Base):
    """Travaux et interventions à réaliser ou réalisés sur un véhicule."""
    __tablename__ = 'interventions'
    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey('vehicles.id', ondelete='CASCADE'))
    title = Column(String)
    description = Column(Text, nullable=True)
    category = Column(String, nullable=True)           # vidange, freins, CT, pneus…
    status = Column(String, default='à prévoir')       # à prévoir / en cours / terminée / annulée
    priority = Column(String, default='normale')       # haute / normale / basse
    date_planned = Column(Date, nullable=True)
    date_done = Column(Date, nullable=True)
    cost_estimated = Column(Float, nullable=True)
    cost_actual = Column(Float, nullable=True)
    comments = Column(Text, nullable=True)
    vehicle = relationship('Vehicle', back_populates='interventions')


class Charge(Base):
    __tablename__ = 'charges'
    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey('vehicles.id', ondelete='CASCADE'))
    category = Column(String, index=True)
    amount = Column(Float)
    date = Column(Date, nullable=True)
    description = Column(Text, nullable=True)
    vehicle = relationship('Vehicle', back_populates='charges')


class Document(Base):
    __tablename__ = 'documents'
    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey('vehicles.id', ondelete='CASCADE'), nullable=True)
    name = Column(String)
    type = Column(String)                              # MIME type
    url = Column(String)
    category = Column(String, nullable=True)           # photo / facture / CT / admin / devis
    date = Column(Date, nullable=True)                 # Date du document
    expiration_date = Column(Date, nullable=True)
    amount = Column(Float, nullable=True)
    description = Column(Text, nullable=True)
    status = Column(String, default='valide')          # valide, expiré, en attente, archivé
    created_at = Column(DateTime, server_default=func.now())
    uploaded_by = Column(String, nullable=True)
    vehicle = relationship('Vehicle', back_populates='documents')


class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    name = Column(String, nullable=True)
    role = Column(String, default='user')
