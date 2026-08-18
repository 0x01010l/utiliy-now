---
layout: post
title: "Should You Pay for a VPN in 2026? I Cancelled NordVPN and Kept WireGuard"
subtitle: "Marketing says everyone needs one. My threat model says otherwise."
date: 2026-08-18
categories: [Privacy]
description: "A nuanced take on paid VPNs versus self-hosted WireGuard — when $60/year helps, when it doesn't, and what I use daily."
read_time: "9 min"
toc: true
hero_tone: cool
tldr_label: "My answer"
tldr: "Pay if you travel on hotel Wi-Fi and will not maintain a server. I cancelled Nord and kept WireGuard to home."
---

VPN ads promise anonymity in thirty seconds. I paid for **NordVPN for two years**, used it heavily for six months, then cancelled and kept a **$5/month VPS running WireGuard** instead.

Neither choice is universal. Here's how I think about it.

## What a VPN actually does

A VPN encrypts traffic between your device and an exit server. Your ISP sees encrypted blobs to one IP — not which sites you visit. The VPN provider sees your traffic unless you add HTTPS (which most sites already use).

It does **not**:

- Make you invisible to sites you log into
- Stop cookies or browser fingerprinting
- Automatically improve speed

## When paying makes sense

| Scenario | Paid VPN? | Why |
|----------|-----------|-----|
| Coffee shop / hotel Wi-Fi | **Yes** | Untrusted network, easy win |
| Streaming geo-restricted content | Maybe | Violates ToS; reliability varies |
| Torrenting (legal Linux ISOs) | Maybe | ISP throttling avoidance |
| Hiding from ISP sale of browsing | **Partial** | DNS + HTTPS already help a lot |
| Evading nation-state surveillance | **Wrong tool** | Need Tor + opsec, not consumer VPN |

For my parents, I installed a **paid VPN on their laptops only** — they travel and click things. For my house, I run **WireGuard to home** so I get Pi-hole filtering on the road.

## Why I cancelled NordVPN

Nothing "wrong" with the product. Three reasons:

1. **I rarely needed 5,000 exit countries.** I used US-West and occasionally UK.
2. **WireGuard to home gave me ad blocking on mobile** without double subscription.
3. **Renewal price jumped** after intro deal — $99/year vs $60 VPS that also hosts other experiments.

I kept the account through the billing cycle; no drama.

## Self-hosted WireGuard on a $6 VPS

Hetzner CX22 in Falkenstein:

```ini
# /etc/wireguard/wg0.conf (server excerpt)
[Interface]
Address = 10.8.0.1/24
ListenPort = 51820
PrivateKey = <server-private>

[Peer]
PublicKey = <laptop-public>
AllowedIPs = 10.8.0.2/32
```

Phone connects, DNS set to my home Pi-hole via split tunneling. Coffee shop browsing feels like home network — minus LAN device access unless I widen `AllowedIPs`.

**Tradeoff:** You maintain the box. Updates, keys, uptime — on you.

## The checklist I give friends

**Pay for a reputable VPN if:**

- You won't maintain a server
- You need one-click apps on every platform yesterday
- You travel monthly on public Wi-Fi

**Skip paid VPN if:**

- You already run WireGuard/Tailscale to home
- You mostly browse HTTPS sites on trusted home Wi-Fi
- You expect "complete anonymity" from a $4/month app

## Providers I'd still recommend (affiliate-free)

I've personally used:

- **Mullvad** — anonymous account numbers, no upsell dark patterns
- **IVPN** — similar ethos, good transparency reports

Pick based on jurisdiction and audit history, not YouTube sponsor reads.

## Update log

- **Aug 18, 2026:** Published; NordVPN pricing from my last renewal
