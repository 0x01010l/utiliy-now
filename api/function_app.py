import json
import logging
import os
import secrets

import azure.functions as func
import stripe

from analyzer.engine import run_audit
from auth import create_token, decode_token
from storage import (
    can_run_audit,
    create_user,
    get_user_by_email,
    increment_audit_count,
    ip_fingerprint,
    set_user_plan,
    verify_password,
)

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

CORS_ORIGIN = os.getenv("CORS_ORIGIN", "https://utiliy.com")
stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_PRICE_PRO = os.getenv("STRIPE_PRICE_PRO", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")


def _cors_headers() -> dict[str, str]:
    return {
        "Access-Control-Allow-Origin": CORS_ORIGIN,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Id",
        "Content-Type": "application/json",
    }


def _get_auth(req: func.HttpRequest) -> dict | None:
    auth = req.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return decode_token(auth[7:])
    return None


@app.route(route="health", methods=["GET", "OPTIONS"])
async def health(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse("", status_code=204, headers=_cors_headers())
    return func.HttpResponse(json.dumps({"status": "ok", "service": "utiliy-audit-api"}), status_code=200, headers=_cors_headers())


@app.route(route="auth/register", methods=["POST", "OPTIONS"])
async def register(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse("", status_code=204, headers=_cors_headers())
    try:
        body = req.get_json()
        email = (body or {}).get("email", "").strip()
        password = (body or {}).get("password", "")
        if not email or len(password) < 8:
            return func.HttpResponse(json.dumps({"error": "Valid email and password (8+ chars) required."}), status_code=400, headers=_cors_headers())
        user = create_user(email, password)
        token = create_token(user["user_id"], user["email"], user["plan"])
        return func.HttpResponse(json.dumps({"token": token, "user": user}), status_code=200, headers=_cors_headers())
    except ValueError as e:
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=400, headers=_cors_headers())
    except Exception as e:
        logging.exception("register failed")
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500, headers=_cors_headers())


@app.route(route="auth/login", methods=["POST", "OPTIONS"])
async def login(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse("", status_code=204, headers=_cors_headers())
    try:
        body = req.get_json()
        email = (body or {}).get("email", "").strip()
        password = (body or {}).get("password", "")
        user = get_user_by_email(email)
        if not user or not verify_password(password, user["password_hash"]):
            return func.HttpResponse(json.dumps({"error": "Invalid email or password."}), status_code=401, headers=_cors_headers())
        token = create_token(user["user_id"], user["PartitionKey"], user.get("plan", "free"))
        return func.HttpResponse(json.dumps({"token": token, "user": {"email": user["PartitionKey"], "plan": user.get("plan", "free")}}), status_code=200, headers=_cors_headers())
    except Exception as e:
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500, headers=_cors_headers())


@app.route(route="auth/me", methods=["GET", "OPTIONS"])
async def me(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse("", status_code=204, headers=_cors_headers())
    payload = _get_auth(req)
    if not payload:
        return func.HttpResponse(json.dumps({"error": "Unauthorized"}), status_code=401, headers=_cors_headers())
    return func.HttpResponse(json.dumps({"email": payload["email"], "plan": payload.get("plan", "free")}), status_code=200, headers=_cors_headers())


@app.route(route="billing/checkout", methods=["POST", "OPTIONS"])
async def checkout(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse("", status_code=204, headers=_cors_headers())
    if not stripe.api_key or not STRIPE_PRICE_PRO:
        return func.HttpResponse(json.dumps({"error": "Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_PRO."}), status_code=503, headers=_cors_headers())

    payload = _get_auth(req)
    body = req.get_json() or {}
    email = payload["email"] if payload else body.get("email", "")
    if not email:
        return func.HttpResponse(json.dumps({"error": "Sign in or provide email."}), status_code=400, headers=_cors_headers())

    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            customer_email=email,
            line_items=[{"price": STRIPE_PRICE_PRO, "quantity": 1}],
            success_url=os.getenv("STRIPE_SUCCESS_URL", "https://utiliy.com/?upgraded=1"),
            cancel_url=os.getenv("STRIPE_CANCEL_URL", "https://utiliy.com/pricing/"),
            metadata={"email": email},
        )
        return func.HttpResponse(json.dumps({"url": session.url}), status_code=200, headers=_cors_headers())
    except Exception as e:
        logging.exception("checkout failed")
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500, headers=_cors_headers())


@app.route(route="billing/webhook", methods=["POST"])
async def stripe_webhook(req: func.HttpRequest) -> func.HttpResponse:
    payload = req.get_body()
    sig = req.headers.get("Stripe-Signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except Exception:
        return func.HttpResponse("Invalid signature", status_code=400)

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        email = session.get("customer_email") or session.get("metadata", {}).get("email", "")
        customer_id = session.get("customer", "")
        if email:
            set_user_plan(email, "pro", customer_id)
    return func.HttpResponse(json.dumps({"received": True}), status_code=200)


@app.route(route="audit", methods=["POST", "OPTIONS"])
async def audit(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse("", status_code=204, headers=_cors_headers())

    try:
        body = req.get_json()
    except ValueError:
        return func.HttpResponse(json.dumps({"error": "Invalid JSON body."}), status_code=400, headers=_cors_headers())

    url = (body or {}).get("url", "").strip()
    if not url:
        return func.HttpResponse(json.dumps({"error": "url is required"}), status_code=400, headers=_cors_headers())

    auth = _get_auth(req)
    client_id = req.headers.get("X-Client-Id", "") or (body or {}).get("client_id", "") or secrets.token_hex(8)
    ip = req.headers.get("X-Forwarded-For", "").split(",")[0].strip() or "0.0.0.0"
    fingerprint = ip_fingerprint(ip, req.headers.get("User-Agent", ""))

    user_id = auth["sub"] if auth else None
    plan = auth.get("plan", "free") if auth else "free"

    allowed, reason = can_run_audit(user_id, client_id or fingerprint, plan)
    if not allowed:
        return func.HttpResponse(
            json.dumps({"error": reason, "paywall": True, "upgrade_url": "/pricing/"}),
            status_code=402,
            headers=_cors_headers(),
        )

    use_ai = bool((body or {}).get("use_ai", True))

    try:
        result = await run_audit(url, use_ai=use_ai)
        increment_audit_count(user_id, client_id or fingerprint)
        result["usage"] = {"audits_used": 1, "plan": plan, "client_id": client_id}
        return func.HttpResponse(json.dumps(result), status_code=200, headers=_cors_headers())
    except ValueError as exc:
        return func.HttpResponse(json.dumps({"error": str(exc)}), status_code=400, headers=_cors_headers())
    except Exception as exc:
        logging.exception("Audit failed")
        return func.HttpResponse(json.dumps({"error": "Audit failed.", "detail": str(exc)[:200]}), status_code=500, headers=_cors_headers())
