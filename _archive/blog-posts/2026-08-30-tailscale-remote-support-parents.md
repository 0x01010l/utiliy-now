---
layout: post
title: "Tailscale for Remote Tech Support: How My Mom Accesses Her Files Without Port Forwarding"
subtitle: "WireGuard magic with a login button she actually understands."
date: 2026-08-30
categories: [Home Lab, Privacy]
description: "Setting up Tailscale on a Synology NAS so a non-technical parent can reach photos and documents remotely — no router config required."
read_time: "11 min"
toc: true
hero_tone: cool
tldr_label: "Why Tailscale"
tldr: "No port forwards. She taps an icon. I stopped reciting subnet masks on the phone."
---

Port forwarding to my parents' NAS was my nightmare — double NAT, dynamic IP, and the words "What's a subnet mask?" on every phone call.

**Tailscale** replaced the whole conversation. Mom taps an app, her laptop sees the NAS like it's on the couch. This is the setup I deployed last spring, still running unchanged.

<figure class="diagram">
  <img src="{{ '/assets/img/tailscale-path.svg' | relative_url }}" alt="Mom's laptop and phone connecting through Tailscale to a Synology NAS">
  <figcaption>The NAS never gets a public port. Tailscale punches the path.</figcaption>
</figure>

## Why not classic VPN here?

I run WireGuard on my Pi. Love it. But explaining **config files** to my mom ended two previous attempts.

Tailscale tradeoffs:

| Pro | Con |
|-----|-----|
| No port forwards | Control plane is Tailscale Inc. |
| SSO-style login | Free tier device limits (100 — fine for family) |
| MagicDNS names | Not fully self-hosted purist |

For **supporting parents**, convenience beat ideology.

## Architecture

```
[Mom's laptop] ──Tailscale──┐
[Mom's phone]  ──Tailscale──┼── [tailnet] ── [Synology DS220+] at parents' house
[My laptop]    ──Tailscale──┘         └── subnet router optional (not used)
```

Synology runs the Tailscale package from Package Center. Mom's devices run Tailscale from the Microsoft Store / App Store.

## Synology install (DSM 7.2)

1. Package Center → install **Tailscale**
2. Open Tailscale → **Sign in** with Google account I created for household tech (`chen-family-tech@gmail.com`)
3. Enable **Use Tailscale subnets** — OFF for us (only need NAS services)
4. Note MagicDNS name: `synology-parents.tailnet-name.ts.net`

Enable SMB or Synology Drive server as usual — bind to Tailscale interface only if paranoid; default worked.

## Mom's laptop setup (Windows 11)

1. Install Tailscale, sign in with same Google account
2. Pin Tailscale to taskbar
3. Open File Explorer → `\\synology-parents\photos`

I created a desktop shortcut to the mapped drive. Label: **Family Photos (Remote)**.

First successful test: she opened a PDF from `/documents/tax/2024` while I watched on FaceTime. No subnet math.

## ACLs (keep it boring)

Default tailnet ACLs allow all members to reach all devices. For two parents and me, fine.

If you add untrusted devices later, restrict in admin console:

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["group:family"],
      "dst": ["tag:nas:*"]
    }
  ]
}
```

## Exit nodes (optional travel security)

I marked my home Pi as an **exit node** for when Mom travels — her traffic exits through my house, gets Pi-hole filtering. She selects "Use exit node" in the menu when on hotel Wi-Fi.

Not default-on — streaming geo quirks.

## Support calls before vs after

**Before:** "Type 192.168… no, the other dot… open port 5001…"

**After:** "Open the little Tailscale icon. Green? Click the shortcut on your desktop."

Average support call dropped from 25 minutes to 6.

## When Tailscale isn't enough

- You need full LAN access to weird legacy devices → subnet router on a Raspberry Pi
- You refuse third-party control plane → Headscale (self-hosted coordination) — I run this experimentally, not for Mom

## Update log

- **Aug 30, 2026:** Published from the spring deployment notes
- **Aug 30, 2026:** Exit-node caveat kept after the Hulu complaint on hotel Wi-Fi
