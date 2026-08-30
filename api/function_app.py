import azure.functions as func
import json
import logging
import os

from analyzer.engine import run_audit

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

CORS_ORIGIN = os.getenv("CORS_ORIGIN", "https://utiliy.com")


def _cors_headers() -> dict[str, str]:
    return {
        "Access-Control-Allow-Origin": CORS_ORIGIN,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
    }


@app.route(route="health", methods=["GET", "OPTIONS"])
async def health(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse("", status_code=204, headers=_cors_headers())
    body = {"status": "ok", "service": "utiliy-audit-api"}
    return func.HttpResponse(json.dumps(body), status_code=200, headers=_cors_headers())


@app.route(route="audit", methods=["POST", "OPTIONS"])
async def audit(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse("", status_code=204, headers=_cors_headers())

    try:
        payload = req.get_json()
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid JSON body."}),
            status_code=400,
            headers=_cors_headers(),
        )

    url = (payload or {}).get("url", "").strip()
    if not url:
        return func.HttpResponse(
            json.dumps({"error": "url is required"}),
            status_code=400,
            headers=_cors_headers(),
        )

    use_ai = bool((payload or {}).get("use_ai", True))

    try:
        result = await run_audit(url, use_ai=use_ai)
        return func.HttpResponse(json.dumps(result), status_code=200, headers=_cors_headers())
    except ValueError as exc:
        return func.HttpResponse(json.dumps({"error": str(exc)}), status_code=400, headers=_cors_headers())
    except Exception as exc:  # noqa: BLE001
        logging.exception("Audit failed")
        return func.HttpResponse(
            json.dumps({"error": "Audit failed. Try another URL or try again later.", "detail": str(exc)[:200]}),
            status_code=500,
            headers=_cors_headers(),
        )
