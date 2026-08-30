import json
import logging
import os
import secrets
from urllib.parse import urlparse

import azure.functions as func
import httpx
import stripe

from analyzer.engine import run_audit
from auth import create_token, decode_token
from email_service import send_password_reset_email, send_verification_email
from google_auth import verify_google_id_token
from storage import (
    can_run_audit,
    consume_auth_token,
    create_auth_token,
    create_or_get_google_user,
    create_user,
    get_usage_stats,
    get_user_by_email,
    get_user_by_id,
    increment_audit_usage,
    mark_email_verified,
    set_user_plan,
    update_password,
    verify_password,
    _is_email_verified,
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


def _resolve_plan(auth: dict | None) -> str:
    if not auth:
        return "free"
    user = get_user_by_id(auth.get("sub", ""))
    if user and user.get("plan"):
        return user["plan"]
    return auth.get("plan", "free")


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
        token = create_auth_token("verify_email", email, hours=48)
        try:
            await send_verification_email(email, token)
        except Exception as e:
            logging.exception("verification email failed")
            return func.HttpResponse(json.dumps({"error": "Account created but verification email could not be sent. Try resend or contact support."}), status_code=503, headers=_cors_headers())
        return func.HttpResponse(json.dumps({
            "message": "Check your email to verify your account before signing in.",
            "email": user["email"],
            "verification_required": True,
        }), status_code=200, headers=_cors_headers())
    except ValueError as e:
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=400, headers=_cors_headers())
    except Exception as e:
        logging.exception("register failed")
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500, headers=_cors_headers())


@app.route(route="auth/verify-email", methods=["GET", "POST", "OPTIONS"])
async def verify_email(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse("", status_code=204, headers=_cors_headers())
    try:
        token = req.params.get("token", "")
        if req.method == "POST":
            body = req.get_json() or {}
            token = body.get("token", token)
        if not token:
            return func.HttpResponse(json.dumps({"error": "Verification token required."}), status_code=400, headers=_cors_headers())
        email = consume_auth_token("verify_email", token)
        if not email:
            return func.HttpResponse(json.dumps({"error": "Invalid or expired verification link."}), status_code=400, headers=_cors_headers())
        mark_email_verified(email)
        user = get_user_by_email(email)
        if not user:
            return func.HttpResponse(json.dumps({"error": "User not found."}), status_code=404, headers=_cors_headers())
        jwt_token = create_token(user["user_id"], email, user.get("plan", "free"))
        return func.HttpResponse(json.dumps({
            "message": "Email verified successfully.",
            "token": jwt_token,
            "user": {"email": email, "plan": user.get("plan", "free"), "email_verified": True},
        }), status_code=200, headers=_cors_headers())
    except Exception as e:
        logging.exception("verify email failed")
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500, headers=_cors_headers())


@app.route(route="auth/resend-verification", methods=["POST", "OPTIONS"])
async def resend_verification(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse("", status_code=204, headers=_cors_headers())
    try:
        body = req.get_json() or {}
        email = (body.get("email") or "").strip()
        user = get_user_by_email(email)
        if not user:
            return func.HttpResponse(json.dumps({"message": "If that email exists, a verification link was sent."}), status_code=200, headers=_cors_headers())
        if user.get("email_verified") in (True, "true", "True", 1, "1"):
            return func.HttpResponse(json.dumps({"message": "Email is already verified."}), status_code=200, headers=_cors_headers())
        token = create_auth_token("verify_email", email, hours=48)
        await send_verification_email(email, token)
        return func.HttpResponse(json.dumps({"message": "Verification email sent."}), status_code=200, headers=_cors_headers())
    except Exception as e:
        logging.exception("resend verification failed")
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500, headers=_cors_headers())


@app.route(route="auth/forgot-password", methods=["POST", "OPTIONS"])
async def forgot_password(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse("", status_code=204, headers=_cors_headers())
    try:
        body = req.get_json() or {}
        email = (body.get("email") or "").strip()
        user = get_user_by_email(email)
        if user and user.get("auth_provider", "email") == "email" and user.get("password_hash"):
            token = create_auth_token("reset_password", email, hours=1)
            await send_password_reset_email(email, token)
        return func.HttpResponse(json.dumps({"message": "If that email exists, a reset link was sent."}), status_code=200, headers=_cors_headers())
    except Exception as e:
        logging.exception("forgot password failed")
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500, headers=_cors_headers())


@app.route(route="auth/reset-password", methods=["POST", "OPTIONS"])
async def reset_password(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse("", status_code=204, headers=_cors_headers())
    try:
        body = req.get_json() or {}
        token = (body.get("token") or "").strip()
        password = (body.get("password") or "")
        if not token or len(password) < 8:
            return func.HttpResponse(json.dumps({"error": "Token and password (8+ chars) required."}), status_code=400, headers=_cors_headers())
        email = consume_auth_token("reset_password", token)
        if not email:
            return func.HttpResponse(json.dumps({"error": "Invalid or expired reset link."}), status_code=400, headers=_cors_headers())
        update_password(email, password)
        user = get_user_by_email(email)
        jwt_token = create_token(user["user_id"], email, user.get("plan", "free"))
        return func.HttpResponse(json.dumps({
            "message": "Password updated.",
            "token": jwt_token,
            "user": {"email": email, "plan": user.get("plan", "free"), "email_verified": True},
        }), status_code=200, headers=_cors_headers())
    except Exception as e:
        logging.exception("reset password failed")
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500, headers=_cors_headers())


@app.route(route="auth/google", methods=["POST", "OPTIONS"])
async def google_login(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse("", status_code=204, headers=_cors_headers())
    try:
        body = req.get_json() or {}
        credential = (body.get("credential") or body.get("id_token") or "").strip()
        if not credential:
            return func.HttpResponse(json.dumps({"error": "Google credential required."}), status_code=400, headers=_cors_headers())
        profile = await verify_google_id_token(credential)
        user = create_or_get_google_user(profile["email"], profile["google_id"])
        token = create_token(user["user_id"], user["email"], user["plan"])
        return func.HttpResponse(json.dumps({"token": token, "user": user}), status_code=200, headers=_cors_headers())
    except ValueError as e:
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=400, headers=_cors_headers())
    except Exception as e:
        logging.exception("google login failed")
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
        if not user or not verify_password(password, user.get("password_hash", "")):
            return func.HttpResponse(json.dumps({"error": "Invalid email or password."}), status_code=401, headers=_cors_headers())
        if user.get("auth_provider") == "google" and not user.get("password_hash"):
            return func.HttpResponse(json.dumps({"error": "This account uses Google sign-in."}), status_code=400, headers=_cors_headers())
        if not _is_email_verified(user):
            return func.HttpResponse(json.dumps({
                "error": "Please verify your email before signing in.",
                "verification_required": True,
                "email": user["PartitionKey"],
            }), status_code=403, headers=_cors_headers())
        token = create_token(user["user_id"], user["PartitionKey"], user.get("plan", "free"))
        return func.HttpResponse(json.dumps({"token": token, "user": {"email": user["PartitionKey"], "plan": user.get("plan", "free"), "email_verified": True}}), status_code=200, headers=_cors_headers())
    except Exception as e:
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500, headers=_cors_headers())


@app.route(route="usage", methods=["GET", "OPTIONS"])
async def usage(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse("", status_code=204, headers=_cors_headers())

    auth = _get_auth(req)
    client_id = req.headers.get("X-Client-Id", "") or secrets.token_hex(8)
    ip = req.headers.get("X-Forwarded-For", "").split(",")[0].strip() or "0.0.0.0"
    user_id = auth["sub"] if auth else None
    plan = _resolve_plan(auth)

    stats = get_usage_stats(user_id, client_id, ip, plan)
    return func.HttpResponse(json.dumps(stats), status_code=200, headers=_cors_headers())


@app.route(route="auth/me", methods=["GET", "OPTIONS"])
async def me(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse("", status_code=204, headers=_cors_headers())
    payload = _get_auth(req)
    if not payload:
        return func.HttpResponse(json.dumps({"error": "Unauthorized"}), status_code=401, headers=_cors_headers())
    client_id = req.headers.get("X-Client-Id", "") or ""
    ip = req.headers.get("X-Forwarded-For", "").split(",")[0].strip() or "0.0.0.0"
    plan = _resolve_plan(payload)
    usage_stats = get_usage_stats(payload["sub"], client_id or "unknown", ip, plan)
    return func.HttpResponse(json.dumps({
        "email": payload["email"],
        "plan": plan,
        "email_verified": True,
        "usage": usage_stats,
    }), status_code=200, headers=_cors_headers())


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
            cancel_url=os.getenv("STRIPE_CANCEL_URL", "https://utiliy.com/pricing/?canceled=1"),
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


@app.route(route="img", methods=["GET", "OPTIONS"])
async def image_proxy(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse("", status_code=204, headers={**_cors_headers(), "Access-Control-Allow-Origin": "*"})

    raw_url = req.params.get("url", "").strip()
    if not raw_url:
        return func.HttpResponse("Missing url", status_code=400)

    parsed = urlparse(raw_url)
    if parsed.scheme not in {"http", "https"}:
        return func.HttpResponse("Invalid url", status_code=400)

    host = (parsed.hostname or "").lower()
    allowed = (
        "cdn.shopify.com",
        "shopifycdn.com",
        "skims.com",
        "allbirds.com",
    )
    if not any(host == a or host.endswith("." + a) for a in allowed) and "shopify" not in host:
        return func.HttpResponse("Host not allowed", status_code=403)

    try:
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
            resp = await client.get(raw_url, headers={"User-Agent": "UtiliyBot/1.0", "Accept": "image/*"})
        if resp.status_code != 200:
            return func.HttpResponse("Upstream error", status_code=502)
        ctype = resp.headers.get("content-type", "image/jpeg")
        headers = {
            "Content-Type": ctype,
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
        }
        return func.HttpResponse(resp.content, status_code=200, headers=headers)
    except Exception:
        return func.HttpResponse("Proxy failed", status_code=502)


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

    user_id = auth["sub"] if auth else None
    plan = _resolve_plan(auth)

    allowed, reason = can_run_audit(user_id, client_id, ip, plan)
    if not allowed:
        usage_stats = get_usage_stats(user_id, client_id, ip, plan)
        return func.HttpResponse(
            json.dumps({"error": reason, "paywall": True, "upgrade_url": "/pricing/", "usage": usage_stats}),
            status_code=402,
            headers=_cors_headers(),
        )

    use_ai = bool((body or {}).get("use_ai", True))

    try:
        result = await run_audit(url, use_ai=use_ai)
        usage_stats = increment_audit_usage(user_id, client_id, ip, plan)
        result["usage"] = usage_stats
        return func.HttpResponse(json.dumps(result), status_code=200, headers=_cors_headers())
    except ValueError as exc:
        return func.HttpResponse(json.dumps({"error": str(exc)}), status_code=400, headers=_cors_headers())
    except Exception as exc:
        logging.exception("Audit failed")
        return func.HttpResponse(json.dumps({"error": "Audit failed.", "detail": str(exc)[:200]}), status_code=500, headers=_cors_headers())
