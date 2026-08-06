import sqlite3
import os
import sys
from datetime import datetime

# Chemin vers la base de données SQLite
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'dash_auto.db')

def migrate_v3():
    if not os.path.exists(DB_PATH):
        print(f"Base de données introuvable à {DB_PATH}")
        sys.exit(1)

    print(f"Connexion à {DB_PATH}...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        print("1. Création de la table vehicle_images...")
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS vehicle_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vehicle_id INTEGER,
                url VARCHAR,
                is_main INTEGER DEFAULT 0,
                position INTEGER DEFAULT 0,
                description VARCHAR,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
            )
        ''')

        print("2. Extension de la table documents...")
        # Check existing columns in documents
        cursor.execute("PRAGMA table_info(documents)")
        existing_cols = [row[1] for row in cursor.fetchall()]

        new_columns = [
            ("expiration_date", "DATE"),
            ("amount", "FLOAT"),
            ("description", "TEXT"),
            ("status", "VARCHAR DEFAULT 'valide'"),
            ("created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
            ("uploaded_by", "VARCHAR")
        ]

        for col_name, col_type in new_columns:
            if col_name not in existing_cols:
                print(f"  -> Ajout de la colonne {col_name} a documents")
                cursor.execute(f"ALTER TABLE documents ADD COLUMN {col_name} {col_type}")

        conn.commit()
        print("Migration v3 terminee avec succes !")

    except Exception as e:
        conn.rollback()
        print(f"Erreur lors de la migration : {e}")
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_v3()
