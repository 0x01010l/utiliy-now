"""Google ID token verification."""

from __future__ import annotations

import os

import httpx

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")


async def verify_google_id_token(id_token: str) -> dict:
    if not GOOGLE_CLIENT_ID:
        raise ValueError("Google sign-in is not configured.")

    async with httpx.AsyncClient(timeout=12.0) as client:
        resp = await client.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": id_token},
        )
    if resp.status_code != 200:
        raise ValueError("Invalid Google sign-in token.")

    data = resp.json()
    aud = data.get("aud", "")
    if aud != GOOGLE_CLIENT_ID:
        raise ValueError("Google token audience mismatch.")

    email = (data.get("email") or "").strip().lower()
    if not email:
        raise ValueError("Google account has no email.")
    if data.get("email_verified") not in ("true", True):
        raise ValueError("Google email is not verified.")

    return {
        "email": email,
        "google_id": data.get("sub", ""),
        "name": data.get("name", ""),
        "picture": data.get("picture", ""),
    }
