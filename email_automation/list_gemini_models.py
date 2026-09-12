"""Diagnostic : liste les modèles Gemini réellement disponibles pour GEMINI_API_KEY.

Google renomme/déprécie régulièrement ses modèles ; plutôt que de deviner un
identifiant dans process_emails.py, ce script interroge l'API elle-même pour
donner la liste exacte, à jour, utilisable dans GEMINI_MODEL.
"""
import os

import requests

r = requests.get(
    "https://generativelanguage.googleapis.com/v1beta/models",
    params={"key": os.environ["GEMINI_API_KEY"]},
    timeout=30,
)
r.raise_for_status()

print("Modèles supportant generateContent (utilisables comme GEMINI_MODEL) :\n")
for model in r.json().get("models", []):
    if "generateContent" in model.get("supportedGenerationMethods", []):
        name = model["name"].removeprefix("models/")
        print(f"  - {name}")
