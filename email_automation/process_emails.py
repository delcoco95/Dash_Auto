"""Traite les e-mails véhicules de nedjpro06@gmail.com et alimente Dash Auto.

Remplace le flux Power Automate (qui exige une licence premium pour l'action
HTTP) par un script Python, gratuit, exécuté périodiquement par GitHub Actions.
Il parle exclusivement aux routes /automation/* déjà déployées sur le
dashboard — aucune modification backend n'est nécessaire pour faire tourner ce
script.

Variables d'environnement attendues (voir .github/workflows/process-emails.yml) :
  GMAIL_ADDRESS        - nedjpro06@gmail.com
  GMAIL_APP_PASSWORD   - mot de passe d'application Gmail (16 caractères)
  DASH_API_BASE_URL    - ex. https://dash-auto.onrender.com
  DASH_API_KEY         - la clé AUTOMATION_API_KEY du backend
  GEMINI_API_KEY       - clé Google AI Studio, gratuite (aistudio.google.com/apikey)
  GEMINI_MODEL         - optionnel, défaut gemini-flash-latest

Pas de filtre par mots-clés : les objets réels (juste un nom de véhicule, une
note perso abrégée...) sont trop imprévisibles pour ça. Chaque e-mail non lu
est envoyé tel quel à Gemini (texte + pièces jointes PDF/image, qu'il sait
lire nativement), qui décide lui-même de la pertinence via son champ
"confidence" et des champs vehicle/event laissés à null.
"""
import base64
import email
import imaplib
import json
import os
import re
import sys
import time
from email.header import decode_header
from urllib.parse import quote

import requests

GMAIL_ADDRESS = os.environ["GMAIL_ADDRESS"]
GMAIL_APP_PASSWORD = os.environ["GMAIL_APP_PASSWORD"]
API_BASE_URL = os.environ["DASH_API_BASE_URL"].rstrip("/")
API_KEY = os.environ["DASH_API_KEY"]
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
GEMINI_MODEL = os.getenv("GEMINI_MODEL") or "gemini-flash-latest"
GEMINI_FALLBACK_MODEL = os.getenv("GEMINI_FALLBACK_MODEL") or "gemini-flash-lite-latest"
# Optionnel : dernier filet de secours, chez un fournisseur différent de Google
# (donc un quota séparé). Si absent, ce palier est simplement ignoré.
GROQ_API_KEY = os.getenv("GROQ_API_KEY") or None
GROQ_MODEL = os.getenv("GROQ_MODEL") or "openai/gpt-oss-20b"

ALLOWED_ATTACHMENT_EXT = {".pdf", ".jpg", ".jpeg", ".png"}
GEMINI_INLINE_MIME = {
    "application/pdf": "application/pdf",
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/png": "image/png",
}
MAX_INLINE_ATTACHMENT_BYTES = 15 * 1024 * 1024

EXTRACTION_PROMPT = """Tu analyses un e-mail reçu dans la boîte d'une personne qui achète, entretient
et revend des véhicules d'occasion. Le mail peut être une vraie facture, une
notification d'un garage/assureur, une note personnelle abrégée, ou n'avoir
aucun rapport avec un véhicule.

Objet : {subject}
Corps : {body}

Des pièces jointes (PDF/image) sont éventuellement fournies avec ce message :
utilise-les pour compléter les informations si le corps du mail est vide ou
incomplet.

Réponds UNIQUEMENT avec un objet JSON respectant exactement ce schéma :
{{
  "type": "purchase|maintenance|repair|inspection|insurance|document|other",
  "vehicle": {{
    "registration": string|null,
    "vin": string|null,
    "brand": string|null,
    "model": string|null,
    "year": number|null
  }},
  "event": {{
    "date": "YYYY-MM-DD"|null,
    "mileage": number|null,
    "description": string|null,
    "garage": string|null,
    "amount": number|null
  }},
  "costs": [{{"label": string, "amount": number, "kind": "intervention|charge"}}],
  "sale": {{"date": "YYYY-MM-DD"|null, "amount": number|null}},
  "estimated_resale_value": number|null,
  "confidence": number
}}

Règles strictes :
- N'invente et ne déduis JAMAIS une valeur absente : mets null (ou [] pour "costs" s'il n'y a aucun coût annexe).
- "event.amount" est le montant principal du mail : prix d'achat pour un achat,
  montant facturé pour un entretien/réparation/assurance/contrôle technique...
- "costs" liste les coûts annexes en plus du montant principal, avec leur libellé
  tel qu'écrit dans le mail (ex. "Mécanique", "Dossier administratif", "Contrôle
  technique" pour une note d'achat qui détaille les frais de remise en état).
  Ne remets JAMAIS dans "costs" le montant déjà utilisé dans "event.amount".
- Pour chaque élément de "costs", "kind" vaut :
  - "intervention" pour tout ce qui relève d'un travail mécanique/technique sur le
    véhicule : réparation, mécanique, contrôle technique, vidange, entretien,
    nettoyage, carrosserie, pneus...
  - "charge" pour tout ce qui est administratif/financier : transport, carburant/
    essence, dossier administratif (DA), carte grise, assurance, taxe, commission...
- "sale" décrit une vente déjà réalisée (date et montant), à ne pas confondre avec
  "estimated_resale_value" qui est une estimation/espérance de revente, pas une
  vente effective.
- Si le mail n'a manifestement aucun rapport avec un véhicule (spam, newsletter,
  correspondance personnelle...), laisse tous les champs vehicle/event/sale à null,
  "costs" à [], "estimated_resale_value" à null, et mets "confidence" proche de 0.
- "confidence" reflète ta certitude globale entre 0 et 1.
- Aucun champ supplémentaire, aucun commentaire, aucun texte hors JSON.
"""


def api_headers():
    return {"X-API-Key": API_KEY, "Content-Type": "application/json"}


def decode_mime_words(value: str) -> str:
    parts = decode_header(value or "")
    return "".join(
        chunk.decode(enc or "utf-8", errors="replace") if isinstance(chunk, bytes) else chunk
        for chunk, enc in parts
    )


def strip_html(html: str) -> str:
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def extract_body_and_attachments(msg: email.message.Message):
    body_text, html_fallback, attachments = "", "", []
    for part in msg.walk():
        content_type = part.get_content_type()
        disposition = str(part.get("Content-Disposition") or "")

        if "attachment" in disposition or (part.get_filename() and content_type != "text/plain"):
            filename = decode_mime_words(part.get_filename() or "")
            payload = part.get_payload(decode=True)
            if filename and payload:
                attachments.append({
                    "name": filename,
                    "content_type": content_type,
                    "content": payload,
                })
            continue

        if content_type == "text/plain" and not body_text:
            charset = part.get_content_charset() or "utf-8"
            body_text = part.get_payload(decode=True).decode(charset, errors="replace")
        elif content_type == "text/html" and not html_fallback:
            charset = part.get_content_charset() or "utf-8"
            html_fallback = part.get_payload(decode=True).decode(charset, errors="replace")

    return (body_text or strip_html(html_fallback)), attachments


def has_relevant_signal(data: dict) -> bool:
    vehicle, event, sale = data.get("vehicle") or {}, data.get("event") or {}, data.get("sale") or {}
    return any(vehicle.get(k) for k in ("registration", "vin", "brand", "model", "year")) or \
        any(event.get(k) for k in ("date", "mileage", "description", "garage", "amount")) or \
        bool(data.get("costs")) or data.get("estimated_resale_value") is not None or \
        any(sale.get(k) for k in ("date", "amount"))


# Catégories réellement proposées dans le menu déroulant "Documents" du dashboard
# (frontend/components/DocumentUploadForm.js) — on y reste pour que les documents
# déposés automatiquement s'affichent avec une catégorie cohérente.
DOCUMENT_CATEGORY_MAP = {
    "purchase": "DA - Achat",
    "sale": "DV - Vente",
    "maintenance": "Facture",
    "repair": "Facture",
    "inspection": "Contrôle technique",
    "insurance": "Assurance",
    "document": "Autre",
    "other": "Autre",
}


def build_financial_extras(data: dict, event: dict, event_type: str) -> dict:
    """Champs véhicule qu'un mail permet de renseigner (prix/date d'achat et de
    vente, kilométrage, valeur de revente estimée) — utilisés à la création d'un
    véhicule, ou pour compléter un véhicule existant SANS écraser une valeur déjà
    présente (voir enrich_existing_vehicle)."""
    extras = {}
    if event.get("mileage") is not None:
        extras["km"] = event["mileage"]
    if event_type == "purchase":
        if event.get("amount") is not None:
            extras["price_buy"] = event["amount"]
        if event.get("date"):
            extras["date_buy"] = event["date"]
    sale = data.get("sale") or {}
    if sale.get("amount") is not None:
        extras["price_sell"] = sale["amount"]
    if sale.get("date"):
        extras["date_sell"] = sale["date"]
    if data.get("estimated_resale_value") is not None:
        extras["estimated_value"] = data["estimated_resale_value"]
    return extras


FINAL_STATUSES = {"processed", "needs_review", "skipped"}


def existing_log_status(message_id: str):
    r = requests.get(
        f"{API_BASE_URL}/automation/processed-emails/{quote(message_id, safe='')}",
        headers=api_headers(), timeout=20,
    )
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.json()["status"]


def create_log_entry(message_id: str):
    requests.post(
        f"{API_BASE_URL}/automation/processed-emails",
        headers=api_headers(),
        json={"gmail_message_id": message_id, "status": "processing"},
        timeout=20,
    ).raise_for_status()


def update_log_entry(message_id: str, **fields):
    requests.put(
        f"{API_BASE_URL}/automation/processed-emails/{quote(message_id, safe='')}",
        headers=api_headers(), json=fields, timeout=20,
    ).raise_for_status()


def _call_gemini(model: str, parts: list) -> dict:
    r = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        params={"key": GEMINI_API_KEY},
        json={
            "contents": [{"parts": parts}],
            "generationConfig": {"response_mime_type": "application/json"},
        },
        timeout=60,
    )
    r.raise_for_status()
    text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(text)


def _call_groq(subject: str, body: str) -> dict:
    """Dernier filet de secours chez un fournisseur différent de Google (quota
    séparé). Texte seul : contrairement à Gemini, les pièces jointes PDF/image
    ne sont pas lues à ce palier — mieux vaut une extraction partielle que rien."""
    r = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
        json={
            "model": GROQ_MODEL,
            "messages": [{"role": "user", "content": EXTRACTION_PROMPT.format(subject=subject, body=body[:6000])}],
            "response_format": {"type": "json_object"},
        },
        timeout=60,
    )
    r.raise_for_status()
    return json.loads(r.json()["choices"][0]["message"]["content"])


def extract_structured_data(subject: str, body: str, attachments: list) -> dict:
    parts = [{"text": EXTRACTION_PROMPT.format(subject=subject, body=body[:6000])}]
    for att in attachments:
        mime = GEMINI_INLINE_MIME.get(att["content_type"])
        if mime and len(att["content"]) <= MAX_INLINE_ATTACHMENT_BYTES:
            parts.append({"inline_data": {"mime_type": mime, "data": base64.b64encode(att["content"]).decode("ascii")}})

    # 3 essais sur le modèle principal (503 = surcharge, 429 = quota atteint,
    # tous deux courants sur le niveau gratuit), un essai sur un second modèle
    # Gemini (quota séparé), puis en dernier recours un fournisseur totalement
    # différent (Groq, si configuré) avant d'abandonner pour ce passage (le
    # mail restera non lu et sera retenté au prochain cron).
    attempts = [(GEMINI_MODEL, 0), (GEMINI_MODEL, 3), (GEMINI_MODEL, 8), (GEMINI_FALLBACK_MODEL, 5)]
    last_exc = None
    for model, delay in attempts:
        if delay:
            print(f"    (Gemini indisponible, nouvel essai dans {delay}s sur {model}...)")
            time.sleep(delay)
        try:
            return _call_gemini(model, parts)
        except requests.HTTPError as exc:
            last_exc = exc
            status = exc.response.status_code if exc.response is not None else None
            if status not in (429, 500, 502, 503, 504):
                raise  # erreur définitive (clé invalide, requête malformée...) : inutile de retenter

    if GROQ_API_KEY:
        print(f"    (Gemini indisponible après tous les essais, bascule sur Groq/{GROQ_MODEL}...)")
        return _call_groq(subject, body)
    raise last_exc


def find_or_create_vehicle(data: dict, event_type: str):
    """Retourne (vehicle_id, needs_review_reason, was_created).

    Un véhicule tout juste créé ici (jamais vu avant) n'a aucune donnée
    existante à protéger : son kilométrage est enregistré dans tous les cas,
    et pour un mail de type "purchase", son prix/date d'achat et sa valeur de
    revente estimée le sont aussi. Un véhicule déjà existant n'est en revanche
    jamais modifié de cette façon (voir create_event / needs_review)."""
    vehicle, event = data.get("vehicle") or {}, data.get("event") or {}
    registration, vin = vehicle.get("registration"), vehicle.get("vin")
    if not registration and not vin:
        return None, "ni immatriculation ni VIN identifiés", False

    lookup = requests.post(
        f"{API_BASE_URL}/automation/vehicles/lookup",
        headers=api_headers(), json={"registration": registration, "vin": vin}, timeout=20,
    )
    lookup.raise_for_status()
    lookup_data = lookup.json()
    if lookup_data["exists"]:
        return lookup_data["vehicle_id"], None, False

    if not vehicle.get("brand") or not vehicle.get("model"):
        return None, "véhicule inconnu et marque/modèle manquants pour le créer", False

    payload = {
        "brand": vehicle["brand"], "model": vehicle["model"], "year": vehicle.get("year"),
        "registration": registration, "vin": vin,
    }
    payload.update(build_financial_extras(data, event, event_type))

    created = requests.post(f"{API_BASE_URL}/automation/vehicles", headers=api_headers(), json=payload, timeout=20)
    created.raise_for_status()
    return created.json()["id"], None, True


def _is_empty(value) -> bool:
    return value is None or value == ""


def enrich_existing_vehicle(vehicle_id: int, candidates: dict):
    """Complète un véhicule déjà existant, mais UNIQUEMENT les champs qu'il n'a
    pas déjà (prix/date d'achat ou de vente, km, valeur estimée) — jamais
    d'écrasement d'une donnée déjà présente, potentiellement saisie à la main."""
    candidates = {k: v for k, v in candidates.items() if not _is_empty(v)}
    if not candidates:
        return

    current = requests.get(f"{API_BASE_URL}/vehicles/{vehicle_id}", headers=api_headers(), timeout=20)
    current.raise_for_status()
    existing = current.json()
    to_write = {k: v for k, v in candidates.items() if _is_empty(existing.get(k))}
    if to_write:
        requests.put(
            f"{API_BASE_URL}/vehicles/{vehicle_id}", headers=api_headers(), json=to_write, timeout=20,
        ).raise_for_status()
        print(f"    (véhicule {vehicle_id} complété : {', '.join(to_write)})")


def route_costs(vehicle_id: int, registration: str | None, costs: list, date: str | None):
    """Chaque coût annexe devient soit une intervention (Travaux — travail
    mécanique/technique), soit une charge (administratif/financier), selon le
    "kind" renvoyé par l'IA. Le libellé affiché reprend la convention déjà
    utilisée manuellement dans le dashboard : "<catégorie> - <immatriculation>"."""
    for cost in costs or []:
        label, amount, kind = cost.get("label"), cost.get("amount"), cost.get("kind")
        if not label or amount is None:
            continue
        name = f"{label} - {registration}" if registration else label

        if kind == "intervention":
            requests.post(
                f"{API_BASE_URL}/interventions", headers=api_headers(),
                json={
                    "vehicle_id": vehicle_id, "title": name, "category": label,
                    "status": "terminée", "cost_actual": amount, "date_done": date,
                }, timeout=20,
            ).raise_for_status()
        else:
            requests.post(
                f"{API_BASE_URL}/charges", headers=api_headers(),
                json={"vehicle_id": vehicle_id, "category": label, "amount": amount, "date": date, "description": name},
                timeout=20,
            ).raise_for_status()


def create_event(vehicle_id: int, event_type: str, event: dict) -> dict:
    r = requests.post(
        f"{API_BASE_URL}/automation/vehicles/{vehicle_id}/events",
        headers=api_headers(),
        json={"type": event_type, **event}, timeout=20,
    )
    r.raise_for_status()
    return r.json()


def upload_attachments(vehicle_id: int, event_type: str, registration: str | None, attachments: list):
    category = DOCUMENT_CATEGORY_MAP.get(event_type, "Autre")
    for att in attachments:
        ext = os.path.splitext(att["name"])[1].lower()
        if ext not in ALLOWED_ATTACHMENT_EXT:
            continue
        name = f"{category} - {registration}{ext}" if registration else att["name"]
        requests.post(
            f"{API_BASE_URL}/automation/vehicles/{vehicle_id}/documents",
            headers=api_headers(),
            json={
                "name": name, "type": att["content_type"], "category": category,
                "content_base64": base64.b64encode(att["content"]).decode("ascii"),
            }, timeout=60,
        ).raise_for_status()


def process_message(num: bytes, imap: imaplib.IMAP4_SSL) -> bool:
    """Retourne True si le mail peut être marqué comme lu (statut définitif
    atteint), False s'il doit rester non lu pour être retenté au prochain
    passage (ex. erreur transitoire de l'API IA ou du dashboard)."""
    _, msg_data = imap.fetch(num, "(RFC822)")
    msg = email.message_from_bytes(msg_data[0][1])

    message_id = (msg.get("Message-ID") or "").strip()
    if not message_id:
        print("  [IGNORÉ] mail sans Message-ID exploitable")
        return True  # rien de fiable pour l'anti-doublon, inutile de retenter

    subject = decode_mime_words(msg.get("Subject", ""))
    body, attachments = extract_body_and_attachments(msg)

    status = existing_log_status(message_id)
    if status in FINAL_STATUSES:
        print(f"  [SKIP] déjà traité ({status}) : {subject!r}")
        return True

    print(f"  [TRAITEMENT] {subject!r}" + (" (nouvel essai)" if status else ""))
    if status is None:
        create_log_entry(message_id)
    else:
        update_log_entry(message_id, status="processing", error_message=None)

    try:
        data = extract_structured_data(subject, body, attachments)

        if not has_relevant_signal(data):
            update_log_entry(message_id, status="skipped", event_type=data.get("type"),
                              extracted_json=json.dumps(data, ensure_ascii=False))
            print("    -> skipped (aucune information véhicule détectée)")
            return True

        event_type = data.get("type") or "other"
        event = data.get("event") or {}
        vehicle = data.get("vehicle") or {}
        registration = vehicle.get("registration")
        vehicle_id, reason, was_created = find_or_create_vehicle(data, event_type)

        if reason:
            update_log_entry(message_id, status="needs_review", error_message=reason,
                              event_type=event_type, extracted_json=json.dumps(data, ensure_ascii=False))
            print(f"    -> needs_review ({reason})")
            return True

        update_log_entry(message_id, vehicle_id=vehicle_id)
        if not was_created:
            # Le véhicule existait déjà : on ne fait que compléter ses champs vides
            # (prix/date d'achat ou de vente, km, valeur estimée), jamais les écraser.
            enrich_existing_vehicle(vehicle_id, build_financial_extras(data, event, event_type))
        route_costs(vehicle_id, registration, data.get("costs"), event.get("date"))
        upload_attachments(vehicle_id, event_type, registration, attachments)

        has_primary_event = event.get("amount") is not None or bool(event.get("description"))
        if event_type == "purchase" or (not has_primary_event and (data.get("costs") or data.get("sale"))):
            # Achat, ou mail qui ne contenait que des coûts annexes/une vente déjà
            # traités ci-dessus : rien de plus à créer comme événement séparé.
            update_log_entry(message_id, status="processed", event_type=event_type,
                              extracted_json=json.dumps(data, ensure_ascii=False))
            print(f"    -> processed (véhicule {vehicle_id})")
            return True

        result = create_event(vehicle_id, event_type, event)

        if result["handled"] or event_type == "document":
            update_log_entry(message_id, status="processed", event_type=event_type,
                              extracted_json=json.dumps(data, ensure_ascii=False))
            print(f"    -> processed (véhicule {vehicle_id})")
        else:
            update_log_entry(message_id, status="needs_review", error_message=result.get("reason"),
                              event_type=event_type, extracted_json=json.dumps(data, ensure_ascii=False))
            print(f"    -> needs_review ({result.get('reason')})")
        return True

    except Exception as exc:  # noqa: BLE001 - on isole l'erreur par e-mail
        update_log_entry(message_id, status="error", error_message=str(exc)[:2000])
        print(f"    -> ERROR (nouvel essai au prochain passage) : {exc}")
        return False


def main():
    imap = imaplib.IMAP4_SSL("imap.gmail.com")
    imap.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
    imap.select("INBOX")

    _, data = imap.search(None, "UNSEEN")
    message_nums = data[0].split()
    print(f"{len(message_nums)} e-mail(s) non lu(s) à examiner")

    for num in message_nums:
        if process_message(num, imap):
            imap.store(num, "+FLAGS", "\\Seen")

    imap.close()
    imap.logout()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"Échec du script : {exc}", file=sys.stderr)
        sys.exit(1)
