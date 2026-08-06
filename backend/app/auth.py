from sqlalchemy.orm import Session
from . import models
from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta
import os

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_SECRET = os.getenv('JWT_SECRET', 'change-me')
JWT_ALGO = 'HS256'
JWT_EXPIRES_MINUTES = 60 * 24 * 7

def get_password_hash(password: str):
    return pwd_ctx.hash(password)

def verify_password(plain: str, hashed: str):
    return pwd_ctx.verify(plain, hashed)

def create_access_token(data: dict, expires_delta: int = JWT_EXPIRES_MINUTES):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=expires_delta)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGO)

# Registration
def register_user(db: Session, email: str, password: str, name: str = None):
    existing = db.query(models.User).filter(models.User.email == email).first()
    if existing:
        return {"error": "User already exists"}
    user = models.User(email=email, password_hash=get_password_hash(password), name=name)
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": str(user.id), "email": user.email})
    return {"access_token": token, "token_type": "bearer", "user": {"id": user.id, "email": user.email, "name": user.name}}

# Authentication
def authenticate_user(db: Session, email: str, password: str):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user or not verify_password(password, user.password_hash):
        return {"error": "Invalid credentials"}
    token = create_access_token({"sub": str(user.id), "email": user.email})
    return {"access_token": token, "token_type": "bearer", "user": {"id": user.id, "email": user.email, "name": user.name}}
