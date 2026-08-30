---
layout: post
title: "Five Router Settings I Change on Every Home Network — Including My Own"
subtitle: "Ten minutes, no command line, disproportionate risk reduction."
date: 2026-08-17
categories: [Networking, Security]
description: "Default router configs favor convenience over safety. These five changes are the first things I do on any home network."
read_time: "7 min"
toc: true
hero_tone: warm
featured: true
tldr_label: "Do these five"
tldr: "New admin password, firmware, WPA3 or WPA2-AES, guest network, DNS that is not your ISP. Ten minutes."
---

I've logged into maybe 200 consumer routers for friends and family. Five settings account for the majority of avoidable problems — and none require buying new hardware.

## 1. Admin password and remote management

Default credentials for ISP routers live in PDFs online. Change the admin password to **20+ random characters** in a password manager.

Then find **Remote Management / WAN Admin / Web Access from Internet** and disable it. If you need remote access later, use Tailscale on a internal device — not an exposed router login.

On a Arris NV4551, this hides under **Firewall → Remote Admin**.

## 2. Firmware (check monthly, not yearly)

Router exploits don't wait for you. Log in, open **System → Firmware**, click check.

Schedule a calendar reminder. Many breaches in consumer routers are patched months before people update.

## 3. Wi-Fi encryption: WPA3 or WPA2-AES only

| Setting | Use |
|---------|-----|
| WPA3-Personal | Best if all devices support it |
| WPA2-AES | Safe fallback for mixed households |
| WPA/WPA2 mixed | Avoid — keeps legacy modes alive |
| WEP / Open | Never |

Disable **WPS**. The physical button is convenient; the protocol isn't.

## 4. Guest network with client isolation

Create `YourName-Guest`. Enable **AP isolation** so guests can't see Chromecasts, NAS boxes, or your work laptop.

Move smart devices here when they're chatty or cheap — see my [parents' Wi-Fi case study](/blog/fix-parents-wifi-without-mesh/).

## 5. DNS that isn't your ISP's default

Set router DNS to **1.1.1.1** and **1.0.0.1** (Cloudflare) or **9.9.9.9** (Quad9). Faster lookups, slightly better privacy posture.

For filtering, point DNS to a Pi-hole IP instead — but only after Pi-hole is stable.

## Bonus: things I don't bother with on stock routers

- **MAC filtering:** Spoofing is trivial; maintenance burden high
- **Hidden SSID:** Makes client setup annoying, not security
- **Manual port forwards for games:** UPnP on, but logged — whole separate post

## The honest ceiling

These changes remove **low-hanging fruit**. They won't stop a targeted attack from a skilled adversary. They stop drive-by scans and nosy neighbors — which is the actual threat model for most homes.

## Update log

- **Aug 17, 2026:** Published from field notes I still use on family routers
