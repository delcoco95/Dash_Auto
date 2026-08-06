import os
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
from . import models, schemas


# ══════════════════════════════════════════════════════════════
# VEHICLES
# ══════════════════════════════════════════════════════════════

def create_vehicle(db: Session, v: schemas.VehicleCreate):
    db_v = models.Vehicle(**v.model_dump())
    db.add(db_v)
    db.commit()
    db.refresh(db_v)
    return db_v


def get_vehicle(db: Session, vehicle_id: int):
    return db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()


def get_vehicles(
    db: Session,
    skip: int = 0,
    limit: int = 200,
    search: Optional[str] = None,
    status: Optional[str] = None,
    brand: Optional[str] = None,
    fuel: Optional[str] = None,
    sort: Optional[str] = None,
):
    q = db.query(models.Vehicle)

    if search:
        term = f"%{search}%"
        q = q.filter(or_(
            models.Vehicle.brand.ilike(term),
            models.Vehicle.model.ilike(term),
            models.Vehicle.registration.ilike(term),
            models.Vehicle.version.ilike(term),
            models.Vehicle.color.ilike(term),
            models.Vehicle.vin.ilike(term),
        ))
    if status:
        q = q.filter(models.Vehicle.status == status)
    if brand:
        q = q.filter(models.Vehicle.brand.ilike(f"%{brand}%"))
    if fuel:
        q = q.filter(models.Vehicle.fuel == fuel)

    # Sorting
    sort_map = {
        'brand':      models.Vehicle.brand,
        'year':       models.Vehicle.year,
        'price_buy':  models.Vehicle.price_buy,
        'km':         models.Vehicle.km,
        'date_buy':   models.Vehicle.date_buy,
        'created_at': models.Vehicle.created_at,
    }
    sort_col = sort_map.get(sort, models.Vehicle.id)
    q = q.order_by(sort_col.desc() if sort in ('date_buy', 'created_at', 'year', 'price_buy') else sort_col)

    return q.offset(skip).limit(limit).all()


def update_vehicle(db: Session, vehicle_id: int, data: schemas.VehicleUpdate):
    v = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not v:
        return None
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(v, key, val)
    db.commit()
    db.refresh(v)
    return v


def delete_vehicle(db: Session, vehicle_id: int) -> bool:
    v = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not v:
        return False
    db.delete(v)
    db.commit()
    return True


# ══════════════════════════════════════════════════════════════
# INTERVENTIONS
# ══════════════════════════════════════════════════════════════

def create_intervention(db: Session, i: schemas.InterventionCreate):
    db_i = models.Intervention(**i.model_dump())
    db.add(db_i)
    db.commit()
    db.refresh(db_i)
    return db_i


def get_interventions_by_vehicle(db: Session, vehicle_id: int):
    return (
        db.query(models.Intervention)
        .filter(models.Intervention.vehicle_id == vehicle_id)
        .order_by(models.Intervention.date_planned)
        .all()
    )


def update_intervention(db: Session, intervention_id: int, data: schemas.InterventionUpdate):
    i = db.query(models.Intervention).filter(models.Intervention.id == intervention_id).first()
    if not i:
        return None
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(i, key, val)
    db.commit()
    db.refresh(i)
    return i


def delete_intervention(db: Session, intervention_id: int) -> bool:
    i = db.query(models.Intervention).filter(models.Intervention.id == intervention_id).first()
    if not i:
        return False
    db.delete(i)
    db.commit()
    return True


# ══════════════════════════════════════════════════════════════
# CHARGES
# ══════════════════════════════════════════════════════════════

def create_charge(db: Session, c: schemas.ChargeCreate):
    db_c = models.Charge(**c.model_dump())
    db.add(db_c)
    db.commit()
    db.refresh(db_c)
    return db_c


def get_charges(db: Session, skip: int = 0, limit: int = 200):
    return db.query(models.Charge).offset(skip).limit(limit).all()


def get_charges_by_vehicle(db: Session, vehicle_id: int):
    return db.query(models.Charge).filter(models.Charge.vehicle_id == vehicle_id).all()


def update_charge(db: Session, charge_id: int, data: schemas.ChargeUpdate):
    c = db.query(models.Charge).filter(models.Charge.id == charge_id).first()
    if not c:
        return None
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(c, key, val)
    db.commit()
    db.refresh(c)
    return c


def delete_charge(db: Session, charge_id: int) -> bool:
    c = db.query(models.Charge).filter(models.Charge.id == charge_id).first()
    if not c:
        return False
    db.delete(c)
    db.commit()
    return True


# ══════════════════════════════════════════════════════════════
# VEHICLE IMAGES
# ══════════════════════════════════════════════════════════════

def create_vehicle_image(db: Session, image: schemas.VehicleImageCreate):
    db_img = models.VehicleImage(**image.model_dump())
    
    # Si c'est la première image, on la met en principale
    existing = db.query(models.VehicleImage).filter(models.VehicleImage.vehicle_id == image.vehicle_id).count()
    if existing == 0:
        db_img.is_main = 1

    db.add(db_img)
    db.commit()
    db.refresh(db_img)
    return db_img


def get_vehicle_images(db: Session, vehicle_id: int):
    return db.query(models.VehicleImage).filter(models.VehicleImage.vehicle_id == vehicle_id).order_by(models.VehicleImage.position, models.VehicleImage.created_at.desc()).all()


def delete_vehicle_image(db: Session, image_id: int, upload_dir: str) -> bool:
    img = db.query(models.VehicleImage).filter(models.VehicleImage.id == image_id).first()
    if not img:
        return False
    
    try:
        rel_path = img.url.lstrip('/')
        file_path = os.path.join(upload_dir, os.path.basename(rel_path))
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception:
        pass

    vehicle_id = img.vehicle_id
    was_main = img.is_main

    db.delete(img)
    db.commit()

    # Si on a supprimé l'image principale, on en définit une autre au hasard
    if was_main:
        next_img = db.query(models.VehicleImage).filter(models.VehicleImage.vehicle_id == vehicle_id).first()
        if next_img:
            next_img.is_main = 1
            db.commit()

    return True


def set_main_image(db: Session, vehicle_id: int, image_id: int):
    # Reset all
    db.query(models.VehicleImage).filter(models.VehicleImage.vehicle_id == vehicle_id).update({"is_main": 0})
    # Set the one
    img = db.query(models.VehicleImage).filter(models.VehicleImage.id == image_id, models.VehicleImage.vehicle_id == vehicle_id).first()
    if img:
        img.is_main = 1
    db.commit()
    return img


# ══════════════════════════════════════════════════════════════
# DOCUMENTS
# ══════════════════════════════════════════════════════════════

def create_document(db: Session, doc: schemas.DocumentCreate):
    db_d = models.Document(**doc.model_dump())
    db.add(db_d)
    db.commit()
    db.refresh(db_d)
    return db_d


def get_documents(
    db: Session,
    skip: int = 0,
    limit: int = 200,
    vehicle_id: Optional[int] = None,
    category: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    sort: Optional[str] = None,
):
    q = db.query(models.Document)

    if vehicle_id is not None:
        if vehicle_id == -1: # code spécial pour "non classés"
            q = q.filter(models.Document.vehicle_id == None)
        else:
            q = q.filter(models.Document.vehicle_id == vehicle_id)
            
    if category:
        q = q.filter(models.Document.category == category)
    if status:
        q = q.filter(models.Document.status == status)
    if search:
        q = q.filter(models.Document.name.ilike(f"%{search}%"))

    # Sorting
    if sort == 'date_asc':
        q = q.order_by(models.Document.date.asc())
    elif sort == 'date_desc':
        q = q.order_by(models.Document.date.desc())
    elif sort == 'created_desc':
        q = q.order_by(models.Document.created_at.desc())
    elif sort == 'amount_desc':
        q = q.order_by(models.Document.amount.desc())
    else:
        q = q.order_by(models.Document.created_at.desc())

    return q.offset(skip).limit(limit).all()


def get_documents_by_vehicle(db: Session, vehicle_id: int):
    return db.query(models.Document).filter(models.Document.vehicle_id == vehicle_id).order_by(models.Document.created_at.desc()).all()


def update_document(db: Session, document_id: int, data: schemas.DocumentUpdate):
    d = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not d:
        return None
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(d, key, val)
    db.commit()
    db.refresh(d)
    return d


def delete_document(db: Session, document_id: int, upload_dir: str) -> bool:
    d = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not d:
        return False
    # Supprime le fichier physique
    try:
        rel_path = d.url.lstrip('/')
        file_path = os.path.join(upload_dir, os.path.basename(rel_path))
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception:
        pass
    db.delete(d)
    db.commit()
    return True

