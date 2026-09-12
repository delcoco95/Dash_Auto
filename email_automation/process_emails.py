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
  "confidence": number
}}

Règles strictes :
- N'invente et ne déduis JAMAIS une valeur absente : mets null.
- Si le mail n'a manifestement aucun rapport avec un véhicule (spam, newsletter,
  correspondance personnelle...), laisse tous les champs vehicle/event à null
  et mets "confidence" proche de 0.
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
    vehicle, event = data.get("vehicle") or {}, data.get("event") or {}
    return any(vehicle.get(k) for k in ("registration", "vin", "brand", "model", "year")) or \
        any(event.get(k) for k in ("date", "mileage", "description", "garage", "amount"))


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


def extract_structured_data(subject: str, body: str, attachments: list) -> dict:
    parts = [{"text": EXTRACTION_PROMPT.format(subject=subject, body=body[:6000])}]
    for att in attachments:
        mime = GEMINI_INLINE_MIME.get(att["content_type"])
        if mime and len(att["content"]) <= MAX_INLINE_ATTACHMENT_BYTES:
            parts.append({"inline_data": {"mime_type": mime, "data": base64.b64encode(att["content"]).decode("ascii")}})

    last_exc = None
    for attempt, delay in enumerate((0, 3, 8)):
        if delay:
            print(f"    (Gemini indisponible, nouvel essai dans {delay}s...)")
            time.sleep(delay)
        try:
            r = requests.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
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
        except requests.HTTPError as exc:
            last_exc = exc
            if exc.response is None or exc.response.status_code < 500:
                raise  # erreur définitive (clé invalide, requête malformée...) : inutile de retenter
    raise last_exc


def find_or_create_vehicle(vehicle: dict):
    """Retourne (vehicle_id, needs_review_reason)."""
    registration, vin = vehicle.get("registration"), vehicle.get("vin")
    if not registration and not vin:
        return None, "ni immatriculation ni VIN identifiés"

    lookup = requests.post(
        f"{API_BASE_URL}/automation/vehicles/lookup",
        headers=api_headers(), json={"registration": registration, "vin": vin}, timeout=20,
    )
    lookup.raise_for_status()
    data = lookup.json()
    if data["exists"]:
        return data["vehicle_id"], None

    if not vehicle.get("brand") or not vehicle.get("model"):
        return None, "véhicule inconnu et marque/modèle manquants pour le créer"

    created = requests.post(
        f"{API_BASE_URL}/automation/vehicles", headers=api_headers(),
        json={
            "brand": vehicle["brand"], "model": vehicle["model"], "year": vehicle.get("year"),
            "registration": registration, "vin": vin,
        }, timeout=20,
    )
    created.raise_for_status()
    return created.json()["id"], None


def create_event(vehicle_id: int, event_type: str, event: dict) -> dict:
    r = requests.post(
        f"{API_BASE_URL}/automation/vehicles/{vehicle_id}/events",
        headers=api_headers(),
        json={"type": event_type, **event}, timeout=20,
    )
    r.raise_for_status()
    return r.json()


def upload_attachments(vehicle_id: int, category: str, attachments: list):
    for att in attachments:
        ext = os.path.splitext(att["name"])[1].lower()
        if ext not in ALLOWED_ATTACHMENT_EXT:
            continue
        requests.post(
            f"{API_BASE_URL}/automation/vehicles/{vehicle_id}/documents",
            headers=api_headers(),
            json={
                "name": att["name"], "type": att["content_type"], "category": category,
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

        vehicle_id, reason = find_or_create_vehicle(data.get("vehicle") or {})

        if reason:
            update_log_entry(message_id, status="needs_review", error_message=reason,
                              event_type=data.get("type"), extracted_json=json.dumps(data, ensure_ascii=False))
            print(f"    -> needs_review ({reason})")
            return True

        update_log_entry(message_id, vehicle_id=vehicle_id)

        event_type = data.get("type") or "other"
        result = create_event(vehicle_id, event_type, data.get("event") or {})
        upload_attachments(vehicle_id, event_type, attachments)

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
