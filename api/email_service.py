"""Transactional email via Resend API or SMTP."""

from __future__ import annotations

import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx

FROM_EMAIL = os.getenv("EMAIL_FROM", "Utiliy <hello@utiliy.com>")
SITE_URL = os.getenv("SITE_URL", "https://utiliy.com")
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")


def _base_template(title: str, body: str, cta_url: str, cta_label: str) -> str:
    return f"""<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;background:#fafafa;padding:32px;">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:32px;">
  <p style="font-weight:700;font-size:18px;margin:0 0 8px;">Utiliy</p>
  <h1 style="font-size:22px;margin:0 0 12px;">{title}</h1>
  <p style="color:#71717a;line-height:1.6;">{body}</p>
  <p style="margin:24px 0;"><a href="{cta_url}" style="display:inline-block;background:#09090b;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">{cta_label}</a></p>
  <p style="color:#a1a1aa;font-size:12px;">Or copy this link:<br><a href="{cta_url}">{cta_url}</a></p>
</div></body></html>"""


async def send_email(to: str, subject: str, html: str) -> None:
    if RESEND_API_KEY:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
                json={"from": FROM_EMAIL, "to": [to], "subject": subject, "html": html},
            )
            if resp.status_code >= 400:
                logging.error("Resend error: %s", resp.text)
                raise RuntimeError("Failed to send email")
        return

    if SMTP_HOST and SMTP_USER and SMTP_PASSWORD:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = FROM_EMAIL
        msg["To"] = to
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(FROM_EMAIL.split("<")[-1].rstrip(">"), to, msg.as_string())
        return

    raise RuntimeError("Email service is not configured. Set RESEND_API_KEY or SMTP credentials.")


async def send_verification_email(to: str, token: str) -> None:
    url = f"{SITE_URL}/verify-email/?token={token}"
    html = _base_template(
        "Verify your email",
        "Thanks for signing up. Confirm your email to start auditing product pages.",
        url,
        "Verify email",
    )
    await send_email(to, "Verify your Utiliy account", html)


async def send_password_reset_email(to: str, token: str) -> None:
    url = f"{SITE_URL}/reset-password/?token={token}"
    html = _base_template(
        "Reset your password",
        "We received a request to reset your password. This link expires in 1 hour.",
        url,
        "Reset password",
    )
    await send_email(to, "Reset your Utiliy password", html)
