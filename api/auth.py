"""JWT authentication helpers."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import jwt

SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
ALGORITHM = "HS256"
EXPIRE_DAYS = 30


def create_token(user_id: str, email: str, plan: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "plan": plan,
        "exp": datetime.now(timezone.utc) + timedelta(days=EXPIRE_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, SECRET, algorithm=ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
