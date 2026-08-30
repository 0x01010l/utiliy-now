"""SSRF-safe URL validation for the product page crawler."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

BLOCKED_HOSTS = {
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "metadata.google.internal",
}

BLOCKED_METADATA_IPS = {
    "169.254.169.254",
    "100.100.100.200",
    "fd00:ec2::254",
}


def _is_private_ip(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return True
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
        or str(ip) in BLOCKED_METADATA_IPS
    )


def validate_public_url(url: str) -> tuple[str, list[str]]:
    """Return normalized URL and errors. Raises nothing — returns errors list."""
    errors: list[str] = []
    parsed = urlparse(url.strip())

    if parsed.scheme not in {"http", "https"}:
        errors.append("Only http and https URLs are allowed.")
        return url, errors

    if not parsed.netloc:
        errors.append("URL must include a hostname.")
        return url, errors

    host = parsed.hostname or ""
    host_lower = host.lower()

    if host_lower in BLOCKED_HOSTS:
        errors.append("This hostname is not allowed.")
        return url, errors

    if host_lower.endswith(".local") or host_lower.endswith(".internal"):
        errors.append("Internal hostnames are not allowed.")
        return url, errors

    try:
        addr_info = socket.getaddrinfo(host, None)
    except socket.gaierror:
        errors.append("Could not resolve hostname.")
        return url, errors

    for info in addr_info:
        ip = info[4][0]
        if _is_private_ip(ip):
            errors.append("URL resolves to a private or restricted IP address.")
            break

    normalized = f"{parsed.scheme}://{parsed.netloc}{parsed.path or '/'}"
    if parsed.query:
        normalized += f"?{parsed.query}"
    return normalized, errors
