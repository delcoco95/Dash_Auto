from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime


# ══════════════════════════════════════════════════════════════
# VEHICLE
# ══════════════════════════════════════════════════════════════

class VehicleBase(BaseModel):
    # Général
    brand: str
    model: str
    version: Optional[str] = None
    year: Optional[int] = None
    registration: Optional[str] = None
    vin: Optional[str] = None
    type: Optional[str] = None
    fuel: Optional[str] = None
    gearbox: Optional[str] = None
    color: Optional[str] = None
    doors: Optional[int] = None
    seats: Optional[int] = None
    # Financier
    km: Optional[int] = None
    date_buy: Optional[date] = None
    price_buy: Optional[float] = None
    date_sell: Optional[date] = None
    price_sell: Optional[float] = None
    estimated_value: Optional[float] = None
    status: Optional[str] = 'en stock'
    # Technique
    date_last_service: Optional[date] = None
    date_next_service: Optional[date] = None
    date_last_ct: Optional[date] = None
    date_next_ct: Optional[date] = None
    engine_state: Optional[str] = None
    body_state: Optional[str] = None
    tire_state: Optional[str] = None
    interior_state: Optional[str] = None
    # Notes
    notes: Optional[str] = None
    internal_notes: Optional[str] = None
    custom_fields: Optional[str] = None  # JSON string


class VehicleCreate(VehicleBase):
    pass


class VehicleUpdate(BaseModel):
    """Tous les champs optionnels pour mise à jour partielle."""
    brand: Optional[str] = None
    model: Optional[str] = None
    version: Optional[str] = None
    year: Optional[int] = None
    registration: Optional[str] = None
    vin: Optional[str] = None
    type: Optional[str] = None
    fuel: Optional[str] = None
    gearbox: Optional[str] = None
    color: Optional[str] = None
    doors: Optional[int] = None
    seats: Optional[int] = None
    km: Optional[int] = None
    date_buy: Optional[date] = None
    price_buy: Optional[float] = None
    date_sell: Optional[date] = None
    price_sell: Optional[float] = None
    estimated_value: Optional[float] = None
    status: Optional[str] = None
    date_last_service: Optional[date] = None
    date_next_service: Optional[date] = None
    date_last_ct: Optional[date] = None
    date_next_ct: Optional[date] = None
    engine_state: Optional[str] = None
    body_state: Optional[str] = None
    tire_state: Optional[str] = None
    interior_state: Optional[str] = None
    notes: Optional[str] = None
    internal_notes: Optional[str] = None
    custom_fields: Optional[str] = None


class VehicleRead(VehicleBase):
    id: int
    created_at: Optional[datetime] = None
    main_image_url: Optional[str] = None

    class Config:
        from_attributes = True


# ══════════════════════════════════════════════════════════════
# INTERVENTION
# ══════════════════════════════════════════════════════════════

class InterventionBase(BaseModel):
    vehicle_id: int
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = 'à prévoir'
    priority: Optional[str] = 'normale'
    date_planned: Optional[date] = None
    date_done: Optional[date] = None
    cost_estimated: Optional[float] = None
    cost_actual: Optional[float] = None
    comments: Optional[str] = None


class InterventionCreate(InterventionBase):
    pass


class InterventionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    date_planned: Optional[date] = None
    date_done: Optional[date] = None
    cost_estimated: Optional[float] = None
    cost_actual: Optional[float] = None
    comments: Optional[str] = None


class InterventionRead(InterventionBase):
    id: int

    class Config:
        from_attributes = True


# ══════════════════════════════════════════════════════════════
# CHARGE
# ══════════════════════════════════════════════════════════════

class ChargeBase(BaseModel):
    vehicle_id: int
    category: str
    amount: float
    date: Optional[date] = None
    description: Optional[str] = None


class ChargeCreate(ChargeBase):
    pass


class ChargeUpdate(BaseModel):
    category: Optional[str] = None
    amount: Optional[float] = None
    date: Optional[date] = None
    description: Optional[str] = None


class ChargeRead(ChargeBase):
    id: int

    class Config:
        from_attributes = True


# ══════════════════════════════════════════════════════════════
# VEHICLE IMAGE
# ══════════════════════════════════════════════════════════════

class VehicleImageBase(BaseModel):
    vehicle_id: int
    url: str
    is_main: Optional[bool] = False
    position: Optional[int] = 0
    description: Optional[str] = None


class VehicleImageCreate(VehicleImageBase):
    pass


class VehicleImageRead(VehicleImageBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ══════════════════════════════════════════════════════════════
# DOCUMENT
# ══════════════════════════════════════════════════════════════

class DocumentBase(BaseModel):
    vehicle_id: Optional[int] = None
    name: str
    type: Optional[str] = None
    url: Optional[str] = None
    category: Optional[str] = None
    date: Optional[date] = None
    expiration_date: Optional[date] = None
    amount: Optional[float] = None
    description: Optional[str] = None
    status: Optional[str] = 'valide'
    uploaded_by: Optional[str] = None


class DocumentCreate(DocumentBase):
    pass


class DocumentUpdate(BaseModel):
    vehicle_id: Optional[int] = None
    name: Optional[str] = None
    category: Optional[str] = None
    date: Optional[date] = None
    expiration_date: Optional[date] = None
    amount: Optional[float] = None
    description: Optional[str] = None
    status: Optional[str] = None


class DocumentRead(DocumentBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ══════════════════════════════════════════════════════════════
# AI
# ══════════════════════════════════════════════════════════════

class AIQueryRequest(BaseModel):
    query: str
