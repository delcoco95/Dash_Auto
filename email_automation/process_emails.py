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
  GEMINI_MODEL         - optionnel, défaut gemini-2.0-flash
  EMAIL_KEYWORDS       - optionnel, liste séparée par des virgules
"""
import base64
import email
import imaplib
import json
import os
import re
import sys
from email.header import decode_header
from urllib.parse import quote

import requests

GMAIL_ADDRESS = os.environ["GMAIL_ADDRESS"]
GMAIL_APP_PASSWORD = os.environ["GMAIL_APP_PASSWORD"]
API_BASE_URL = os.environ["DASH_API_BASE_URL"].rstrip("/")
API_KEY = os.environ["DASH_API_KEY"]
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
GEMINI_MODEL = os.getenv("GEMINI_MODEL") or "gemini-flash-latest"

DEFAULT_KEYWORDS = [
    "véhicule", "vehicule", "voiture", "achat", "entretien", "réparation", "reparation",
    "facture", "vidange", "contrôle technique", "controle technique", "assurance",
    "immatriculation", "vin", "garage", "révision", "revision",
]
KEYWORDS = [k.strip().lower() for k in os.getenv("EMAIL_KEYWORDS", "").split(",") if k.strip()] or DEFAULT_KEYWORDS

ALLOWED_ATTACHMENT_EXT = {".pdf", ".jpg", ".jpeg", ".png"}

EXTRACTION_PROMPT = """Tu analyses un e-mail concernant un véhicule automobile.

Objet : {subject}
Corps : {body}

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


def matches_keywords(subject: str, body: str) -> bool:
    haystack = f"{subject} {body}".lower()
    return any(kw in haystack for kw in KEYWORDS)


def already_processed(message_id: str) -> bool:
    r = requests.get(
        f"{API_BASE_URL}/automation/processed-emails/{quote(message_id, safe='')}",
        headers=api_headers(), timeout=20,
    )
    return r.status_code == 200


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


def extract_structured_data(subject: str, body: str) -> dict:
    r = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
        params={"key": GEMINI_API_KEY},
        json={
            "contents": [{"parts": [{"text": EXTRACTION_PROMPT.format(subject=subject, body=body[:6000])}]}],
            "generationConfig": {"response_mime_type": "application/json"},
        },
        timeout=30,
    )
    r.raise_for_status()
    text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(text)


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


def process_message(num: bytes, imap: imaplib.IMAP4_SSL):
    _, msg_data = imap.fetch(num, "(RFC822)")
    msg = email.message_from_bytes(msg_data[0][1])

    message_id = (msg.get("Message-ID") or "").strip()
    if not message_id:
        return  # rien de fiable pour l'anti-doublon, on ignore

    subject = decode_mime_words(msg.get("Subject", ""))
    body, attachments = extract_body_and_attachments(msg)

    if not matches_keywords(subject, body):
        return

    if already_processed(message_id):
        print(f"  [SKIP] déjà traité : {subject!r}")
        return

    print(f"  [TRAITEMENT] {subject!r}")
    create_log_entry(message_id)

    try:
        data = extract_structured_data(subject, body)
        vehicle_id, reason = find_or_create_vehicle(data.get("vehicle") or {})

        if reason:
            update_log_entry(message_id, status="needs_review", error_message=reason,
                              event_type=data.get("type"), extracted_json=json.dumps(data, ensure_ascii=False))
            print(f"    -> needs_review ({reason})")
            return

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

    except Exception as exc:  # noqa: BLE001 - on isole l'erreur par e-mail
        update_log_entry(message_id, status="error", error_message=str(exc)[:2000])
        print(f"    -> ERROR : {exc}")


def main():
    imap = imaplib.IMAP4_SSL("imap.gmail.com")
    imap.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
    imap.select("INBOX")

    _, data = imap.search(None, "UNSEEN")
    message_nums = data[0].split()
    print(f"{len(message_nums)} e-mail(s) non lu(s) à examiner")

    for num in message_nums:
        try:
            process_message(num, imap)
        finally:
            imap.store(num, "+FLAGS", "\\Seen")

    imap.close()
    imap.logout()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"Échec du script : {exc}", file=sys.stderr)
        sys.exit(1)
