"""Azure Table Storage for users and usage tracking."""

from __future__ import annotations

import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from azure.core.exceptions import ResourceNotFoundError
from azure.data.tables import TableServiceClient

_conn: TableServiceClient | None = None
FREE_AUDIT_LIMIT = 1
PRO_AUDIT_LIMIT = 80
BUSINESS_AUDIT_LIMIT = 250
TOKEN_TABLE = "tokens"


def plan_limit(plan: str) -> int:
    if plan == "pro":
        return PRO_AUDIT_LIMIT
    if plan == "business":
        return BUSINESS_AUDIT_LIMIT
    return FREE_AUDIT_LIMIT


def _current_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _conn_str() -> str:
    cs = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
    if not cs:
        raise RuntimeError("AZURE_STORAGE_CONNECTION_STRING is not configured")
    return cs


def _client() -> TableServiceClient:
    global _conn
    if _conn is None:
        _conn = TableServiceClient.from_connection_string(_conn_str())
        for name in ("users", "usage", TOKEN_TABLE):
            try:
                _conn.create_table_if_not_exists(name)
            except Exception:
                pass
    return _conn


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    if not hashed:
        return False
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _is_email_verified(entity: dict) -> bool:
    if "email_verified" not in entity:
        return True
    return entity.get("email_verified") in (True, "true", "True", 1, "1")


def _user_public(entity: dict) -> dict:
    email = entity.get("PartitionKey", "")
    return {
        "user_id": entity.get("user_id", ""),
        "email": email,
        "plan": entity.get("plan", "free"),
        "email_verified": entity.get("email_verified", False) in (True, "true", "True", 1, "1"),
        "auth_provider": entity.get("auth_provider", "email"),
    }


def create_user(email: str, password: str, *, auth_provider: str = "email", google_id: str = "", email_verified: bool = False) -> dict:
    client = _client()
    email_l = email.strip().lower()
    table = client.get_table_client("users")
    try:
        table.get_entity(partition_key=email_l, row_key=email_l)
        raise ValueError("An account with this email already exists.")
    except ResourceNotFoundError:
        pass

    user_id = str(uuid.uuid4())
    entity = {
        "PartitionKey": email_l,
        "RowKey": email_l,
        "user_id": user_id,
        "password_hash": hash_password(password) if password else "",
        "plan": "free",
        "stripe_customer_id": "",
        "auth_provider": auth_provider,
        "google_id": google_id,
        "email_verified": email_verified or auth_provider == "google",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    table.upsert_entity(entity)
    return _user_public(entity)


def create_or_get_google_user(email: str, google_id: str) -> dict:
    existing = get_user_by_email(email)
    if existing:
        if existing.get("google_id") and existing.get("google_id") != google_id:
            raise ValueError("This email is registered with a different sign-in method.")
        client = _client()
        table = client.get_table_client("users")
        entity = table.get_entity(email, email)
        entity["auth_provider"] = "google"
        entity["google_id"] = google_id
        entity["email_verified"] = True
        if not entity.get("password_hash"):
            entity["password_hash"] = ""
        table.update_entity(entity, mode="merge")
        return _user_public(entity)

    return create_user(email, "", auth_provider="google", google_id=google_id, email_verified=True)


def get_user_by_email(email: str) -> dict | None:
    client = _client()
    email_l = email.strip().lower()
    try:
        entity = client.get_table_client("users").get_entity(email_l, email_l)
        return dict(entity)
    except Exception:
        return None


def get_user_by_id(user_id: str) -> dict | None:
    client = _client()
    table = client.get_table_client("users")
    for entity in table.list_entities():
        if entity.get("user_id") == user_id:
            return dict(entity)
    return None


def mark_email_verified(email: str) -> None:
    client = _client()
    email_l = email.strip().lower()
    table = client.get_table_client("users")
    entity = table.get_entity(email_l, email_l)
    entity["email_verified"] = True
    table.update_entity(entity, mode="merge")


def update_password(email: str, password: str) -> None:
    client = _client()
    email_l = email.strip().lower()
    table = client.get_table_client("users")
    entity = table.get_entity(email_l, email_l)
    entity["password_hash"] = hash_password(password)
    table.update_entity(entity, mode="merge")


def set_user_plan(email: str, plan: str, stripe_customer_id: str = "") -> None:
    client = _client()
    email_l = email.strip().lower()
    table = client.get_table_client("users")
    entity = table.get_entity(email_l, email_l)
    entity["plan"] = plan
    if stripe_customer_id:
        entity["stripe_customer_id"] = stripe_customer_id
    table.update_entity(entity, mode="merge")


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_auth_token(token_type: str, email: str, hours: int) -> str:
    client = _client()
    raw = secrets.token_urlsafe(32)
    table = client.get_table_client(TOKEN_TABLE)
    expires = datetime.now(timezone.utc) + timedelta(hours=hours)
    table.upsert_entity({
        "PartitionKey": token_type,
        "RowKey": _token_hash(raw),
        "email": email.strip().lower(),
        "expires_at": expires.isoformat(),
        "used": False,
    })
    return raw


def consume_auth_token(token_type: str, raw_token: str) -> str | None:
    client = _client()
    table = client.get_table_client(TOKEN_TABLE)
    row_key = _token_hash(raw_token)
    try:
        entity = table.get_entity(token_type, row_key)
    except Exception:
        return None

    if entity.get("used"):
        return None
    expires = datetime.fromisoformat(entity["expires_at"])
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        return None

    entity["used"] = True
    table.update_entity(entity, mode="merge")
    return entity.get("email", "")


def _usage_key(kind: str, value: str) -> str:
    return f"{kind}:{value}"


def get_audit_count_for_key(key: str) -> int:
    client = _client()
    month = _current_month()
    try:
        entity = client.get_table_client("usage").get_entity(key, month)
        return int(entity.get("audit_count", 0))
    except Exception:
        return 0


def increment_audit_count_for_key(key: str) -> int:
    client = _client()
    month = _current_month()
    table = client.get_table_client("usage")
    try:
        entity = table.get_entity(key, month)
        count = int(entity.get("audit_count", 0)) + 1
    except Exception:
        entity = {"PartitionKey": key, "RowKey": month, "audit_count": 0}
        count = 1
    entity["audit_count"] = count
    table.upsert_entity(entity)
    return count


def ip_hash(ip: str) -> str:
    return hashlib.sha256(ip.strip().encode()).hexdigest()[:32]


def get_usage_stats(user_id: str | None, client_id: str, ip: str, plan: str) -> dict:
    limit = plan_limit(plan)
    month = _current_month()
    client_key = _usage_key("client", client_id)
    ip_key = _usage_key("ip", ip_hash(ip))
    user_key = _usage_key("user", user_id) if user_id else None

    client_count = get_audit_count_for_key(client_key)
    ip_count = get_audit_count_for_key(ip_key)
    user_count = get_audit_count_for_key(user_key) if user_key else 0

    if plan == "free":
        used = 1 if max(client_count, ip_count, user_count) >= FREE_AUDIT_LIMIT else 0
        remaining = max(0, FREE_AUDIT_LIMIT - used)
    else:
        used = user_count
        remaining = max(0, limit - used)

    return {
        "plan": plan,
        "used": used if plan == "free" else user_count,
        "limit": limit,
        "remaining": remaining,
        "period": month,
        "tracked": {
            "client": client_count,
            "ip": ip_count,
            "account": user_count,
        },
    }


def increment_audit_usage(user_id: str | None, client_id: str, ip: str, plan: str) -> dict:
    client_key = _usage_key("client", client_id)
    ip_key = _usage_key("ip", ip_hash(ip))

    if plan == "free":
        increment_audit_count_for_key(client_key)
        increment_audit_count_for_key(ip_key)
        if user_id:
            increment_audit_count_for_key(_usage_key("user", user_id))
    elif user_id:
        increment_audit_count_for_key(_usage_key("user", user_id))

    return get_usage_stats(user_id, client_id, ip, plan)


def can_run_audit(user_id: str | None, client_id: str, ip: str, plan: str) -> tuple[bool, str]:
    stats = get_usage_stats(user_id, client_id, ip, plan)
    if stats["remaining"] <= 0:
        if plan == "free":
            return False, "Your free audit is used. Upgrade to Pro for 80 audits per month."
        if plan == "pro":
            return False, f"Pro plan includes {PRO_AUDIT_LIMIT} audits per month. You've reached your limit."
        return False, f"You've reached your monthly audit limit ({stats['limit']})."
    return True, ""


def ip_fingerprint(ip: str, ua: str) -> str:
    raw = f"{ip}|{ua[:80]}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]
