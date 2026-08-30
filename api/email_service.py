"""Transactional email via Azure Communication Services, Resend, or SMTP."""

from __future__ import annotations

import asyncio
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx

SITE_URL = os.getenv("SITE_URL", "https://utiliy.com")
LOGO_URL = os.getenv("EMAIL_LOGO_URL", f"{SITE_URL}/assets/img/utiliy-logo.svg")
FROM_EMAIL = os.getenv("EMAIL_FROM", "Utiliy <hello@utiliy.com>")

ACS_CONNECTION_STRING = os.getenv("AZURE_COMMUNICATION_CONNECTION_STRING", "")
ACS_SENDER_ADDRESS = os.getenv("ACS_SENDER_ADDRESS", "")
ACS_SENDER_DISPLAY_NAME = os.getenv("ACS_SENDER_DISPLAY_NAME", "Utiliy")

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")


def _base_template(title: str, body: str, cta_url: str, cta_label: str) -> str:
    year = __import__("datetime").datetime.now().year
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e5ea;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 12px;text-align:center;">
              <a href="{SITE_URL}" style="text-decoration:none;display:inline-block;">
                <img src="{LOGO_URL}" alt="Utiliy" width="148" height="36" style="display:block;margin:0 auto;border:0;">
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 0;">
              <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#1d1d1f;font-weight:700;">{title}</h1>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#6e6e73;">{body}</p>
              <a href="{cta_url}" style="display:inline-block;background:#0071e3;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:10px;">{cta_label}</a>
              <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#86868b;">Or copy this link into your browser:<br>
                <a href="{cta_url}" style="color:#0071e3;word-break:break-all;">{cta_url}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;border-top:1px solid #f0f0f2;background:#fafafa;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#86868b;text-align:center;">
                Sent by <strong style="color:#1d1d1f;">Utiliy</strong> · Fix Figures LLC<br>
                <a href="{SITE_URL}" style="color:#0071e3;text-decoration:none;">utiliy.com</a> ·
                <a href="mailto:contact@utiliy.com" style="color:#0071e3;text-decoration:none;">contact@utiliy.com</a>
              </p>
              <p style="margin:10px 0 0;font-size:11px;line-height:1.4;color:#aeaeb2;text-align:center;">© {year} Fix Figures LLC. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _send_via_acs(to: str, subject: str, html: str) -> None:
    if not ACS_CONNECTION_STRING or not ACS_SENDER_ADDRESS:
        raise RuntimeError("Azure Communication Services email is not configured.")

    from azure.communication.email import EmailClient
    from azure.core.pipeline.policies import RetryPolicy

    client = EmailClient.from_connection_string(
        ACS_CONNECTION_STRING,
        retry_policy=RetryPolicy(total_retries=1),
    )
    message = {
        "senderAddress": ACS_SENDER_ADDRESS,
        "content": {"subject": subject, "html": html},
        "recipients": {"to": [{"address": to, "displayName": to.split("@")[0]}]},
    }
    poller = client.begin_send(message)
    result = poller.result(timeout=30)
    status = getattr(result, "status", None) or (result.get("status") if isinstance(result, dict) else None)
    if status and str(status).lower() not in ("succeeded", "running", "notstarted"):
        raise RuntimeError(f"ACS email send failed with status: {status}")


async def send_email(to: str, subject: str, html: str) -> None:
    if ACS_CONNECTION_STRING and ACS_SENDER_ADDRESS:
        await asyncio.to_thread(_send_via_acs, to, subject, html)
        return

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

        def _smtp_send() -> None:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.sendmail(FROM_EMAIL.split("<")[-1].rstrip(">"), to, msg.as_string())

        await asyncio.to_thread(_smtp_send)
        return

    raise RuntimeError(
        "Email service is not configured. Set AZURE_COMMUNICATION_CONNECTION_STRING and ACS_SENDER_ADDRESS."
    )


async def send_verification_email(to: str, token: str) -> None:
    url = f"{SITE_URL}/verify-email/?token={token}"
    html = _base_template(
        "Verify your email",
        "Thanks for signing up for Utiliy. Confirm your email address to start auditing product pages and improving conversions.",
        url,
        "Verify email",
    )
    await send_email(to, "Verify your Utiliy account", html)


async def send_password_reset_email(to: str, token: str) -> None:
    url = f"{SITE_URL}/reset-password/?token={token}"
    html = _base_template(
        "Reset your password",
        "We received a request to reset your Utiliy password. This link expires in 1 hour. If you did not request this, you can ignore this email.",
        url,
        "Reset password",
    )
    await send_email(to, "Reset your Utiliy password", html)
