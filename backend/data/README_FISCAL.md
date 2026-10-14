# Données fiscales initiales (module Fiscalité)

Fichiers à importer **une seule fois** dans la base de production, après le déploiement
du backend (les tables `fiscal_entries`, `tax_declarations` et `tax_settings` sont créées
automatiquement au démarrage).

| Fichier | Contenu | Source |
|---|---|---|
| `fiscal_entries_auto1.json` | 19 factures Auto1 (prix véhicule « TVA sur marge » + frais/transport Auto1 Berlin autoliquidés) de février à septembre 2026 | Factures téléchargées depuis Mes commandes Auto1 (14/10/2026) |
| `tax_declarations_history.json` | Déclarations déjà déposées : CA3 janvier→avril 2026, acomptes IS 1 et 2, 2572 et 2065 (exercice 2024-2025) | Accusés de réception du dossier « Déclaration impots » |

Import (l'import ignore les doublons de n° de facture) :

```bash
API=https://dash-auto.onrender.com
curl -X POST "$API/fiscal/entries/bulk" -H "Content-Type: application/json" --data @fiscal_entries_auto1.json
for row in $(jq -c '.[]' tax_declarations_history.json); do
  curl -X POST "$API/fiscal/declarations" -H "Content-Type: application/json" -d "$row"; done
```

Tests : `cd backend && python -m pytest -q tests` (les cas de février et avril retrouvent
exactement les montants déclarés : 90 € / 90 € et 144 € / 144 €).
