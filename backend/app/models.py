from sqlalchemy import Column, Integer, String, Date, Float, ForeignKey, Text, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import datetime
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
    events = relationship('Event', back_populates='vehicle', cascade='all, delete-orphan')

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

class ProcessedEmail(Base):
    """Suivi des e-mails Gmail traités par l'automatisation (anti-doublon + journal)."""
    __tablename__ = 'processed_emails'
    id = Column(Integer, primary_key=True, index=True)
    gmail_message_id = Column(String, unique=True, index=True)
    status = Column(String, default='processing')  # processing, processed, needs_review, error, skipped
    vehicle_id = Column(Integer, ForeignKey('vehicles.id', ondelete='SET NULL'), nullable=True)
    event_type = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)
    extracted_json = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Event(Base):
    __tablename__ = 'events'
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(Text, nullable=True)
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    type = Column(String, default='rendez-vous') # rendez-vous, location, autre
    vehicle_id = Column(Integer, ForeignKey('vehicles.id', ondelete='SET NULL'), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    vehicle = relationship('Vehicle')



# ══════════════════════════════════════════════════════════════
# FISCALITÉ (TVA, IS, échéances)
# Tables nouvelles : créées automatiquement par init_db() (create_all),
# aucune modification des tables existantes.
# ══════════════════════════════════════════════════════════════

class FiscalEntry(Base):
    """Pièce fiscale : une facture d'achat (ou de frais) avec son traitement TVA.

    kind :
      - 'achat_vehicule_marge' : prix d'achat du véhicule d'occasion (régime de la marge,
        pas de TVA déductible) — sert de base au calcul de la marge à la revente.
      - 'service_ue'           : prestation facturée HT par un prestataire de l'UE
        (frais/transport Auto1 Berlin) → TVA autoliquidée (due + déductible).
      - 'achat_fr_tva'         : facture française avec TVA → TVA déductible (ligne 20).
      - 'immobilisation'       : bien durable (outillage, ordinateur…) → ligne 19.
      - 'sans_tva'             : dépense sans TVA (commission, particulier, frais admin).
    """
    __tablename__ = 'fiscal_entries'
    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey('vehicles.id', ondelete='SET NULL'), nullable=True, index=True)
    charge_id = Column(Integer, ForeignKey('charges.id', ondelete='SET NULL'), nullable=True)
    intervention_id = Column(Integer, ForeignKey('interventions.id', ondelete='SET NULL'), nullable=True)
    document_id = Column(Integer, ForeignKey('documents.id', ondelete='SET NULL'), nullable=True)
    date = Column(Date, index=True)                     # date de la FACTURE (décide du mois)
    kind = Column(String, index=True)
    label = Column(String, nullable=True)
    supplier = Column(String, nullable=True)
    country = Column(String, default='FR')              # FR / DE / … (pays du fournisseur)
    invoice_ref = Column(String, nullable=True)
    amount_ht = Column(Float, default=0.0)              # montant hors taxe (ou montant total si sans TVA)
    vat_rate = Column(Float, default=20.0)
    vat_amount = Column(Float, default=0.0)             # TVA facturée (achat_fr_tva / immobilisation)
    has_invoice = Column(Integer, default=1)            # 1 = facture en main
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    vehicle = relationship('Vehicle')


class TaxDeclaration(Base):
    """Suivi d'une déclaration (déposée ou non) : CA3, acomptes IS, CVAE, etc."""
    __tablename__ = 'tax_declarations'
    id = Column(Integer, primary_key=True, index=True)
    kind = Column(String, index=True)                   # CA3 / IS_ACOMPTE / IS_SOLDE / IS_RESULTAT / CVAE / CFE / AUTRE
    form = Column(String, nullable=True)                # 3310-CA3, 2571, 2572, 2065, 1329-AC…
    period_start = Column(Date, nullable=True)
    period_end = Column(Date, nullable=True)
    due_date = Column(Date, nullable=True)
    status = Column(String, default='à faire')          # à faire / déposée / payée / non due
    filed_date = Column(Date, nullable=True)
    deposit_number = Column(String, nullable=True)
    amount_declared = Column(Float, nullable=True)      # montant payé / TVA nette due déclarée
    credit_carried = Column(Float, nullable=True)       # ligne 27 déclarée (crédit à reporter)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class TaxSetting(Base):
    """Paramètres fiscaux de la société (clé / valeur)."""
    __tablename__ = 'tax_settings'
    key = Column(String, primary_key=True)
    value = Column(Text, nullable=True)


class ChecklistState(Base):
    """État d'un justificatif attendu (clé calculée : 'entry:12', 'sale_cession:7', 'ca3_receipt:2026-05'…)."""
    __tablename__ = 'checklist_states'
    key = Column(String, primary_key=True)
    status = Column(String, default='à trouver')          # à trouver / trouvé / classé / non applicable
    document_id = Column(Integer, ForeignKey('documents.id', ondelete='SET NULL'), nullable=True)
    note = Column(Text, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class VehicleSale(Base):
    """Informations de vente (acheteur, paiement, facture) — une ligne par véhicule vendu."""
    __tablename__ = 'vehicle_sales'
    vehicle_id = Column(Integer, ForeignKey('vehicles.id', ondelete='CASCADE'), primary_key=True)
    buyer_type = Column(String, default='particulier')    # particulier / professionnel
    buyer_name = Column(String, nullable=True)
    buyer_address = Column(Text, nullable=True)
    buyer_siret = Column(String, nullable=True)
    payment_method = Column(String, nullable=True)        # virement / chèque / espèces / carte / financement
    payment_ref = Column(String, nullable=True)
    invoice_number = Column(String, nullable=True, unique=True)
    km_sale = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
