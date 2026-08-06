import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

# En production sur Render, on utilise le disque persistant '/data'
if os.getenv('RENDER'):
    db_path = '/data/dash_auto.db'
    DATABASE_URL = f"sqlite:///{db_path}"
else:
    DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./dash_auto.db')


engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith('sqlite') else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    # Import models here to ensure they are registered on Base
    from . import models
    Base.metadata.create_all(bind=engine)
