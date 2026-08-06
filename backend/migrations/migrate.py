"""
Script de migration SQLite — Dash Auto v2
Ajoute les nouvelles colonnes et tables sans perte de données.
Usage : python -m migrations.migrate
"""
import sqlite3
import os
import sys


def get_db_path():
    """Trouve le chemin de la base SQLite."""
    # Relatif au dossier backend/
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(base, 'dash_auto.db')
    return path


def get_columns(cursor, table: str) -> set:
    cursor.execute(f"PRAGMA table_info({table})")
    return {row[1] for row in cursor.fetchall()}


def table_exists(cursor, table: str) -> bool:
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
    )
    return cursor.fetchone() is not None


def run(db_path: str = None):
    if db_path is None:
        db_path = get_db_path()

    if not os.path.exists(db_path):
        print(f"  [INFO] Base de données non trouvée : {db_path}")
        print("  Elle sera créée au premier démarrage du backend.")
        return

    print(f"  Migration de : {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # ── Table vehicles : nouvelles colonnes ─────────────────
    if table_exists(cursor, 'vehicles'):
        existing = get_columns(cursor, 'vehicles')
        new_cols = [
            ("version",            "TEXT"),
            ("registration",       "TEXT"),
            ("vin",                "TEXT"),
            ("fuel",               "TEXT"),
            ("gearbox",            "TEXT"),
            ("color",              "TEXT"),
            ("doors",              "INTEGER"),
            ("seats",              "INTEGER"),
            ("estimated_value",    "REAL"),
            ("date_last_service",  "DATE"),
            ("date_next_service",  "DATE"),
            ("date_last_ct",       "DATE"),
            ("date_next_ct",       "DATE"),
            ("engine_state",       "TEXT"),
            ("body_state",         "TEXT"),
            ("tire_state",         "TEXT"),
            ("interior_state",     "TEXT"),
            ("internal_notes",     "TEXT"),
            ("custom_fields",      "TEXT"),
            ("created_at",         "DATETIME DEFAULT CURRENT_TIMESTAMP"),
        ]
        for col, col_type in new_cols:
            if col not in existing:
                try:
                    cursor.execute(f"ALTER TABLE vehicles ADD COLUMN {col} {col_type}")
                    print(f"  [+] vehicles.{col}")
                except Exception as e:
                    print(f"  [!] vehicles.{col} — {e}")
    else:
        print("  [SKIP] Table 'vehicles' inexistante, sera créée par init_db().")

    # ── Table interventions (nouvelle) ─────────────────────
    if not table_exists(cursor, 'interventions'):
        cursor.execute("""
            CREATE TABLE interventions (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                vehicle_id      INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
                title           TEXT NOT NULL,
                description     TEXT,
                category        TEXT,
                status          TEXT DEFAULT 'à prévoir',
                priority        TEXT DEFAULT 'normale',
                date_planned    DATE,
                date_done       DATE,
                cost_estimated  REAL,
                cost_actual     REAL,
                comments        TEXT
            )
        """)
        print("  [+] Table 'interventions' créée")
    else:
        print("  [OK] Table 'interventions' déjà présente")

    # ── Table documents : colonne category ─────────────────
    if table_exists(cursor, 'documents'):
        doc_cols = get_columns(cursor, 'documents')
        if 'category' not in doc_cols:
            cursor.execute("ALTER TABLE documents ADD COLUMN category TEXT")
            print("  [+] documents.category")

    # ── Table charges : rendre date nullable ─────────────────
    # SQLite ne supporte pas ALTER COLUMN — rien à faire, la contrainte
    # était déjà nullable dans les faits.

    conn.commit()
    conn.close()
    print("  [OK] Migration terminee sans perte de donnees.")


if __name__ == "__main__":
    run()
