---
layout: post
title: "Raspberry Pi Privacy Setup: Pi-hole, Unbound, and WireGuard Without the Reddit Rabbit Hole"
subtitle: "The minimum viable privacy stack I run at home — not every project on GitHub."
date: 2025-08-12
categories: [Privacy, Home Lab]
description: "A focused guide to building a Raspberry Pi privacy gateway: local DNS filtering, recursive resolver, and remote access VPN."
read_time: "14 min"
toc: true
hero_tone: cool
featured: true
---

I own four Raspberry Pis. Only one is dedicated to privacy.full stop. The others run Home Assistant and a print server. The privacy Pi handles **DNS filtering (Pi-hole)**, **recursive DNS (Unbound)**, and **WireGuard** for when I'm on airport Wi-Fi.

This guide is the trimmed path — no Docker swarm, no Grafana dashboards you'll never open.

## Hardware I used

| Part | Model | Cost (Aug 2025) |
|------|-------|-----------------|
| Board | Raspberry Pi 4, 2 GB | $45 |
| Storage | SanDisk Ultra 64 GB microSD | $11 |
| Case | Flirc passive aluminum | $16 |
| Power | Official 15W USB-C PSU | $8 |

You can do 1 GB RAM, but 2 GB headroom keeps Unbound comfortable during list updates.

## Network placement

The Pi sits in the networking closet on a **flat Ethernet run to the main switch**. Wi-Fi-only works for testing; wired is non-negotiable for always-on DNS.

Target IP: **192.168.1.53/24** (static DHCP reservation on the router — not set on the Pi interface until reservation exists).

## Step 1: Base OS

Flash **Raspberry Pi OS Lite (64-bit)** with Raspberry Pi Imager.

In imager advanced settings:

- Hostname: `pihole-gateway`
- Enable SSH, password auth OFF, paste your public key
- Set locale and timezone

First boot:

```bash
ssh pi@pihole-gateway.local
sudo apt update && sudo apt full-upgrade -y
sudo raspi-config
# Set static IP only if you can't do DHCP reservation
```

## Step 2: Pi-hole install

```bash
curl -sSL https://install.pi-hole.net | bash
```

Choices I made:

- Upstream DNS: **127.0.0.1#5335** (Unbound — configured next)
- Blocklists: default Steven Black + OISD
- Web admin: yes, password saved in Bitwarden

Point your router's DHCP DNS to `192.168.1.53`. Reboot a phone on Wi-Fi, visit `http://pi.hole/admin` — you should see queries.

## Step 3: Unbound (why bother?)

Without Unbound, Pi-hole forwards to Cloudflare/Google — fine, but they see every query. Unbound resolves recursively locally.

Install:

```bash
sudo apt install unbound
```

Minimal config at `/etc/unbound/unbound.conf.d/pi-hole.conf`:

```yaml
server:
  verbosity: 0
  interface: 127.0.0.1
  port: 5335
  do-ip6: no
  root-hints: "/var/lib/unbound/root.hints"
  auto-trust-anchor-file: "/var/lib/unbound/root.key"
  hide-identity: yes
  hide-version: yes
```

Test:

```bash
dig @127.0.0.1 -p 5335 cloudflare.com +short
sudo systemctl restart unbound
```

## Step 4: WireGuard via PiVPN

```bash
curl -L https://install.pivpn.io | bash
```

- Interface: `wg0`
- Port: **51820/UDP** forwarded on router
- DNS pushed to clients: `192.168.1.53` (so VPN traffic gets Pi-hole too)
- Client name: `mike-laptop`

Phone test on LTE: connect VPN, browse — Pi-hole dashboard should show client IP from the VPN pool.

## Failures I hit (save yourself)

1. **Double NAT at the rental (2023):** ISP modem routed `10.x`, my router did `192.168.x`. Pi got queries but upstream timed out. Fix: bridge mode on modem.
2. **Blocklist broke HBO Max:** Whitelisted `hbomax.com` and two CDN domains — see my [six-month Pi-hole data post](/blog/pihole-six-months-data/).
3. **Forgot to open UDP 51820:** WireGuard handshake never completed. Looked like "broken VPN," was just port forwarding.

## Security hardening (30 extra minutes)

```bash
sudo apt install fail2ban ufw
sudo ufw default deny incoming
sudo ufw allow ssh
sudo ufw allow 51820/udp
sudo ufw enable
```

Disable password SSH if you haven't. Enable unattended security upgrades:

```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

## Should you clone this exact stack?

**Yes if:** you want network-wide blocking + encrypted DNS + safe coffee-shop browsing.

**No if:** you won't maintain whitelists when streaming breaks. Use NextDNS with a config link instead — less control, less babysitting.

## Update log

- **Aug 12, 2025:** Initial publish from Pi 4 setup notes
- **Aug 15, 2025:** Added Unbound verbosity tweak after log disk usage scare
