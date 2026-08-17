---
layout: post
title: "The Home Network Diagram I Actually Use (And What Each VLAN Is For)"
subtitle: "No textbook OSI wall. Just the boxes, cables, and why my printer can't see the IoT cameras."
date: 2025-08-16
categories: [Networking, Home Lab]
description: "A plain-language walkthrough of a real home network: ISP handoff, router, switch, Pi-hole, VLANs, and where Wi-Fi access points sit."
read_time: "12 min"
toc: true
hero_tone: warm
---

Network diagrams in certification books are clean. Mine has a label maker tag that says **"DO NOT UNPLUG — MIKE"** on the Pi-hole Ethernet cable.

This is the layout running in my Portland townhouse as of August 2025.

## Physical map

```
[ISP Fiber ONT]
      │
      ▼
[Ubiquiti UDM-SE] ──gateway 192.168.1.1 ── Wi-Fi (Primary SSID)
      │
      ├── LAN port 3 ── [TP-Link SG108E switch] ── wired devices
      │                      │
      │                      ├── Pi 4 (Pi-hole) .53
      │                      ├── Dell OptiPlex (Proxmox) .10
      │                      ├── Synology NAS .20
      │                      └── Office AP (Omada EAP650) .5
      │
      └── LAN port 5 ── [IoT VLAN trunk to garage AP]
```

Internet enters at the ONT in the garage. One Cat6 run to the office closet where everything noisy lives.

## VLAN breakdown

| VLAN | ID | Subnet | Purpose |
|------|-----|--------|---------|
| Default | 1 | 192.168.1.0/24 | Trusted laptops, phones, consoles |
| IoT | 20 | 192.168.20.0/24 | Cameras, plugs, thermostat |
| Guest | 30 | 192.168.30.0/24 | Visitors, isolated |
| Lab | 40 | 192.168.40.0/24 | Proxmox VMs, throwaway experiments |

Firewall rules (simplified):

- **IoT → Internet:** allow
- **IoT → Default:** deny (except mDNS reflector for Home Assistant)
- **Guest → anything internal:** deny
- **Lab → Default:** deny except DNS to Pi-hole

The rule that saved my sanity: **IoT can't initiate connections to trusted VLAN.** Cameras stay cameras.

## DNS: one Pi-hole, many VLANs

Pi-hole at `.53` listens on all interfaces. DHCP on each VLAN points DNS to `.53`. Pi-hole forwards through Unbound locally.

When a guest connects, they get filtering without me installing anything on their phone.

## Wi-Fi: two APs, not mesh marketing

- **Office EAP650** — covers living areas
- **Garage EAP225** — covers yard and driveway cam

Controller runs on Proxmox LXC. I tried standalone AP mode first; centralized config won when I added VLAN SSID mapping.

## What I'd simplify if starting over

1. **One switch with enough ports** — I daisy-chained early; regretted it
2. **Run two Cat6 drops to living room** before drywall closed — wife approved one; I wanted two
3. **Skip smart plugs that need cloud accounts** — VLAN 20 is half devices I'd never buy again

## Copy-paste starter (single router, no VLANs)

Not ready for VLANs? Minimum sane layout:

1. ISP modem in bridge mode
2. Your router as sole DHCP server
3. Pi-hole IP as DNS in DHCP
4. Guest network enabled
5. Anything wired: switch behind router LAN

That alone beats 80% of default installs I walk into.

## Tools to document your own setup

- **Draw.io** — free diagrams for insurance/disaster recovery
- **phpIPAM or NetBox** — overkill for home until you hit ~30 static IPs
- **Spreadsheet** — device name, MAC, IP, VLAN, physical port. Boring, priceless when troubleshooting at 11 p.m.

## Update log

- **Aug 16, 2025:** Initial diagram from UniFi export + label maker photos
