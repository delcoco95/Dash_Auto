import os
import uuid
from typing import List, Optional

from dotenv import load_dotenv
load_dotenv()

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import ai_agent, auth, crud, schemas, statistics
from .database import get_db, init_db

app = FastAPI(title="Dash Auto API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf',
                      '.doc', '.docx', '.xls', '.xlsx', '.csv'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


# ── Health ────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0"}


# ══════════════════════════════════════════════════════════════
# VEHICLES
# ══════════════════════════════════════════════════════════════

@app.post("/vehicles", response_model=schemas.VehicleRead, status_code=201)
def create_vehicle(v: schemas.VehicleCreate, db=Depends(get_db)):
    return crud.create_vehicle(db, v)


@app.get("/vehicles", response_model=List[schemas.VehicleRead])
def list_vehicles(
    skip: int = 0,
    limit: int = 200,
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    brand: Optional[str] = Query(None),
    fuel: Optional[str] = Query(None),
    sort: Optional[str] = Query(None),
    db=Depends(get_db),
):
    return crud.get_vehicles(
        db, skip=skip, limit=limit,
        search=search, status=status, brand=brand, fuel=fuel, sort=sort,
    )


@app.get("/vehicles/{vehicle_id}", response_model=schemas.VehicleRead)
def get_vehicle(vehicle_id: int, db=Depends(get_db)):
    veh = crud.get_vehicle(db, vehicle_id)
    if not veh:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    return veh


@app.put("/vehicles/{vehicle_id}", response_model=schemas.VehicleRead)
def update_vehicle(vehicle_id: int, data: schemas.VehicleUpdate, db=Depends(get_db)):
    veh = crud.update_vehicle(db, vehicle_id, data)
    if not veh:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    return veh


@app.delete("/vehicles/{vehicle_id}")
def delete_vehicle(vehicle_id: int, db=Depends(get_db)):
    if not crud.delete_vehicle(db, vehicle_id):
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    return {"message": "Véhicule supprimé"}


# ── Vehicle sub-resources ─────────────────────────────────────

@app.get("/vehicles/{vehicle_id}/charges", response_model=List[schemas.ChargeRead])
def get_vehicle_charges(vehicle_id: int, db=Depends(get_db)):
    return crud.get_charges_by_vehicle(db, vehicle_id)


@app.get("/vehicles/{vehicle_id}/documents", response_model=List[schemas.DocumentRead])
def get_vehicle_documents(vehicle_id: int, db=Depends(get_db)):
    return crud.get_documents_by_vehicle(db, vehicle_id)


@app.get("/vehicles/{vehicle_id}/interventions", response_model=List[schemas.InterventionRead])
def get_vehicle_interventions(vehicle_id: int, db=Depends(get_db)):
    return crud.get_interventions_by_vehicle(db, vehicle_id)


# ══════════════════════════════════════════════════════════════
# INTERVENTIONS
# ══════════════════════════════════════════════════════════════

@app.get("/interventions", response_model=List[schemas.InterventionRead])
def list_interventions(skip: int = 0, limit: int = 200, db=Depends(get_db)):
    return crud.get_interventions(db, skip, limit)

@app.post("/interventions", response_model=schemas.InterventionRead, status_code=201)
def create_intervention(i: schemas.InterventionCreate, db=Depends(get_db)):
    return crud.create_intervention(db, i)


@app.put("/interventions/{intervention_id}", response_model=schemas.InterventionRead)
def update_intervention(intervention_id: int, data: schemas.InterventionUpdate, db=Depends(get_db)):
    result = crud.update_intervention(db, intervention_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Intervention non trouvée")
    return result


@app.delete("/interventions/{intervention_id}")
def delete_intervention(intervention_id: int, db=Depends(get_db)):
    if not crud.delete_intervention(db, intervention_id):
        raise HTTPException(status_code=404, detail="Intervention non trouvée")
    return {"message": "Intervention supprimée"}


# ══════════════════════════════════════════════════════════════
# CHARGES
# ══════════════════════════════════════════════════════════════

@app.post("/charges", response_model=schemas.ChargeRead, status_code=201)
def create_charge(c: schemas.ChargeCreate, db=Depends(get_db)):
    return crud.create_charge(db, c)


@app.get("/charges", response_model=List[schemas.ChargeRead])
def list_charges(skip: int = 0, limit: int = 200, db=Depends(get_db)):
    return crud.get_charges(db, skip, limit)


@app.put("/charges/{charge_id}", response_model=schemas.ChargeRead)
def update_charge(charge_id: int, data: schemas.ChargeUpdate, db=Depends(get_db)):
    result = crud.update_charge(db, charge_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Charge non trouvée")
    return result


@app.delete("/charges/{charge_id}")
def delete_charge(charge_id: int, db=Depends(get_db)):
    if not crud.delete_charge(db, charge_id):
        raise HTTPException(status_code=404, detail="Charge non trouvée")
    return {"message": "Charge supprimée"}


# ══════════════════════════════════════════════════════════════
# VEHICLE IMAGES
# ══════════════════════════════════════════════════════════════

@app.post("/vehicles/{vehicle_id}/images", response_model=schemas.VehicleImageRead)
def upload_vehicle_image(
    vehicle_id: int,
    description: Optional[str] = None,
    file: UploadFile = File(...),
    db=Depends(get_db)
):
    content = file.file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 10 MB)")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in {'.jpg', '.jpeg', '.png', '.webp'}:
        raise HTTPException(status_code=400, detail=f"Extension non autorisée pour une image: {ext}")

    unique_name = f"img_{uuid.uuid4().hex}{ext}"
    with open(os.path.join(UPLOAD_DIR, unique_name), "wb") as f:
        f.write(content)

    image_data = schemas.VehicleImageCreate(
        vehicle_id=vehicle_id,
        url=f"/uploads/{unique_name}",
        description=description
    )
    return crud.create_vehicle_image(db, image_data)


@app.get("/vehicles/{vehicle_id}/images", response_model=List[schemas.VehicleImageRead])
def get_vehicle_images(vehicle_id: int, db=Depends(get_db)):
    return crud.get_vehicle_images(db, vehicle_id)


@app.delete("/images/{image_id}")
def delete_vehicle_image(image_id: int, db=Depends(get_db)):
    if not crud.delete_vehicle_image(db, image_id, UPLOAD_DIR):
        raise HTTPException(status_code=404, detail="Image non trouvée")
    return {"message": "Image supprimée"}


@app.put("/images/{image_id}/main", response_model=schemas.VehicleImageRead)
def set_main_image(image_id: int, vehicle_id: int, db=Depends(get_db)):
    img = crud.set_main_image(db, vehicle_id, image_id)
    if not img:
        raise HTTPException(status_code=404, detail="Image non trouvée")
    return img


# ══════════════════════════════════════════════════════════════
# DOCUMENTS
# ══════════════════════════════════════════════════════════════

@app.get("/documents", response_model=List[schemas.DocumentRead])
def list_all_documents(
    skip: int = 0,
    limit: int = 200,
    vehicle_id: Optional[int] = Query(None),
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    sort: Optional[str] = Query(None),
    db=Depends(get_db)
):
    return crud.get_documents(db, skip, limit, vehicle_id, category, status, search, sort)


@app.post("/documents/upload", response_model=schemas.DocumentRead)
def upload_document(
    vehicle_id: Optional[int] = None, # Peut être nul maintenant (Non classé)
    category: Optional[str] = None,
    name: Optional[str] = None,
    description: Optional[str] = None,
    doc_date: Optional[str] = None,
    expiration_date: Optional[str] = None,
    amount: Optional[float] = None,
    status: Optional[str] = 'valide',
    file: UploadFile = File(...),
    db=Depends(get_db),
):
    content = file.file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 10 MB)")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Extension non autorisée: {ext}")

    unique_name = f"doc_{uuid.uuid4().hex}{ext}"
    with open(os.path.join(UPLOAD_DIR, unique_name), "wb") as f:
        f.write(content)

    doc_data = schemas.DocumentCreate(
        name=name or file.filename,
        type=file.content_type or "application/octet-stream",
        url=f"/uploads/{unique_name}",
        vehicle_id=vehicle_id,
        category=category,
        description=description,
        amount=amount,
        status=status,
    )
    
    # Parse dates manually from Form strings (YYYY-MM-DD)
    from datetime import datetime
    if doc_date:
        try:
            doc_data.date = datetime.strptime(doc_date, "%Y-%m-%d").date()
        except:
            pass
    if expiration_date:
        try:
            doc_data.expiration_date = datetime.strptime(expiration_date, "%Y-%m-%d").date()
        except:
            pass

    return crud.create_document(db, doc_data)


@app.put("/documents/{document_id}", response_model=schemas.DocumentRead)
def update_document(document_id: int, data: schemas.DocumentUpdate, db=Depends(get_db)):
    doc = crud.update_document(db, document_id, data)
    if not doc:
        raise HTTPException(status_code=404, detail="Document non trouvé")
    return doc


@app.delete("/documents/{document_id}")
def delete_document(document_id: int, db=Depends(get_db)):
    if not crud.delete_document(db, document_id, UPLOAD_DIR):
        raise HTTPException(status_code=404, detail="Document non trouvé")
    return {"message": "Document supprimé"}


# ══════════════════════════════════════════════════════════════
# AUTH
# ══════════════════════════════════════════════════════════════

@app.post("/auth/register")
def register(email: str, password: str, name: str = None, db=Depends(get_db)):
    return auth.register_user(db, email=email, password=password, name=name)


@app.post("/auth/login")
def login(email: str, password: str, db=Depends(get_db)):
    return auth.authenticate_user(db, email=email, password=password)


# ══════════════════════════════════════════════════════════════
# STATS & AI
# ══════════════════════════════════════════════════════════════

@app.get("/stats")
def get_stats(db=Depends(get_db)):
    return statistics.compute_kpis(db)


@app.post("/ai/query")
def ai_query(payload: schemas.AIQueryRequest, db=Depends(get_db)):
    return ai_agent.handle_query(db, payload.query)

# ══════════════════════════════════════════════════════════════
# EVENTS (PLANNING)
# ══════════════════════════════════════════════════════════════

@app.get("/events", response_model=List[schemas.EventRead])
def list_events(skip: int = 0, limit: int = 200, start_date: str = None, end_date: str = None, db=Depends(get_db)):
    return crud.get_events(db, skip, limit, start_date, end_date)

@app.post("/events", response_model=schemas.EventRead, status_code=201)
def create_event(e: schemas.EventCreate, db=Depends(get_db)):
    return crud.create_event(db, e)

@app.put("/events/{event_id}", response_model=schemas.EventRead)
def update_event(event_id: int, data: schemas.EventUpdate, db=Depends(get_db)):
    result = crud.update_event(db, event_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Evénement non trouvé")
    return result

@app.delete("/events/{event_id}")
def delete_event(event_id: int, db=Depends(get_db)):
    if not crud.delete_event(db, event_id):
        raise HTTPException(status_code=404, detail="Evénement non trouvé")
    return {"message": "Evénement supprimé"}
