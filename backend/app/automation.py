"""Routes dédiées aux automatisations externes (ex. flux Power Automate / Gmail).

Ce module est volontairement séparé des routes principales (`main.py`) pour ne
rien changer au comportement du frontend existant : toutes les routes ici sont
protégées par une clé API (`auth.require_api_key`), alors que les routes de
`main.py` restent ouvertes comme aujourd'hui.
"""
import base64
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException

from . import auth, crud, schemas
from .database import get_db

router = APIRouter(
    prefix="/automation",
    tags=["automation"],
    dependencies=[Depends(auth.require_api_key)],
)

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'uploads')
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf',
                      '.doc', '.docx', '.xls', '.xlsx', '.csv'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


# ══════════════════════════════════════════════════════════════
# VEHICLES
# ══════════════════════════════════════════════════════════════

@router.post("/vehicles/lookup", response_model=schemas.VehicleLookupResponse)
def lookup_vehicle(payload: schemas.VehicleLookupRequest, db=Depends(get_db)):
    """Correspondance EXACTE (insensible à la casse) par immatriculation ou VIN.

    Contrairement à `GET /vehicles?search=`, ne renvoie jamais de faux positif
    partiel : un flux d'automatisation ne doit agir que sur une identification
    certaine.
    """
    if not payload.registration and not payload.vin:
        raise HTTPException(status_code=400, detail="registration ou vin requis")
    vehicle = crud.find_vehicle_exact(db, registration=payload.registration, vin=payload.vin)
    if vehicle:
        return {"exists": True, "vehicle_id": vehicle.id}
    return {"exists": False, "vehicle_id": None}


@router.post("/vehicles", response_model=schemas.VehicleRead, status_code=201)
def create_vehicle(v: schemas.VehicleCreate, db=Depends(get_db)):
    return crud.create_vehicle(db, v)


# ══════════════════════════════════════════════════════════════
# EVENTS (routage par type vers l'entité réelle du dashboard)
# ══════════════════════════════════════════════════════════════

@router.post("/vehicles/{vehicle_id}/events", response_model=schemas.AutomationEventResult)
def create_vehicle_event(vehicle_id: int, e: schemas.AutomationEventCreate, db=Depends(get_db)):
    if not crud.get_vehicle(db, vehicle_id):
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")

    if e.type in ("maintenance", "repair", "inspection", "other"):
        intervention = crud.create_intervention(db, schemas.InterventionCreate(
            vehicle_id=vehicle_id,
            title=(e.description or e.type.capitalize())[:200],
            description=e.description,
            category=e.type,
            status='terminée' if e.date else 'à prévoir',
            date_done=e.date,
            cost_actual=e.amount,
            comments=e.garage,
        ))
        return {"handled": True, "entity": "intervention", "entity_id": intervention.id, "reason": None}

    if e.type == "insurance":
        if e.amount is None:
            return {"handled": False, "entity": "none", "entity_id": None,
                    "reason": "montant manquant : impossible de créer une charge assurance sans amount"}
        charge = crud.create_charge(db, schemas.ChargeCreate(
            vehicle_id=vehicle_id,
            category="assurance",
            amount=e.amount,
            date=e.date,
            description=e.description,
        ))
        return {"handled": True, "entity": "charge", "entity_id": charge.id, "reason": None}

    if e.type == "purchase":
        return {"handled": False, "entity": "none", "entity_id": None,
                "reason": "les événements d'achat modifient le véhicule lui-même (date_buy/price_buy) : "
                          "à valider manuellement plutôt qu'en écriture automatique"}

    # "document" ou type inconnu : rien à créer ici, le document est rattaché séparément
    return {"handled": False, "entity": "none", "entity_id": None,
            "reason": f"aucune entité événement pour le type '{e.type}' — document seul le cas échéant"}


# ══════════════════════════════════════════════════════════════
# DOCUMENTS (upload base64 — plus simple à produire qu'un multipart
# depuis une action HTTP Power Automate)
# ══════════════════════════════════════════════════════════════

@router.post("/vehicles/{vehicle_id}/documents", response_model=schemas.DocumentRead, status_code=201)
def upload_vehicle_document(vehicle_id: int, payload: schemas.AutomationDocumentCreate, db=Depends(get_db)):
    if not crud.get_vehicle(db, vehicle_id):
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")

    ext = os.path.splitext(payload.name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Extension non autorisée: {ext}")

    try:
        content = base64.b64decode(payload.content_base64, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="content_base64 invalide")

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 10 MB)")

    unique_name = f"doc_{uuid.uuid4().hex}{ext}"
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    with open(os.path.join(UPLOAD_DIR, unique_name), "wb") as f:
        f.write(content)

    doc = crud.create_document(db, schemas.DocumentCreate(
        vehicle_id=vehicle_id,
        name=payload.name,
        type=payload.type,
        url=f"/uploads/{unique_name}",
        category=payload.category,
        date=payload.date,
        amount=payload.amount,
        description=payload.description,
        uploaded_by="automation",
    ))
    return doc


# ══════════════════════════════════════════════════════════════
# PROCESSED EMAILS (anti-doublon + journal)
# ══════════════════════════════════════════════════════════════

@router.get("/processed-emails/{gmail_message_id}", response_model=schemas.ProcessedEmailRead)
def get_processed_email(gmail_message_id: str, db=Depends(get_db)):
    entry = crud.get_processed_email(db, gmail_message_id)
    if not entry:
        raise HTTPException(status_code=404, detail="E-mail non encore traité")
    return entry


@router.post("/processed-emails", response_model=schemas.ProcessedEmailRead, status_code=201)
def create_processed_email(payload: schemas.ProcessedEmailCreate, db=Depends(get_db)):
    if crud.get_processed_email(db, payload.gmail_message_id):
        raise HTTPException(status_code=409, detail="Cet e-mail est déjà enregistré")
    return crud.create_processed_email(db, payload)


@router.put("/processed-emails/{gmail_message_id}", response_model=schemas.ProcessedEmailRead)
def update_processed_email(gmail_message_id: str, payload: schemas.ProcessedEmailUpdate, db=Depends(get_db)):
    entry = crud.update_processed_email(db, gmail_message_id, payload)
    if not entry:
        raise HTTPException(status_code=404, detail="E-mail non trouvé")
    return entry
