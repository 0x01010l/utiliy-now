# Utiliy commerce backend

Private WordPress/WooCommerce backend for the static storefront at
`https://utiliy.com`.

## VM requirements

- Ubuntu 24.04 LTS
- 2 GB RAM minimum (4 GB preferred)
- 32 GB persistent disk minimum
- Public ports 80 and 443
- SSH restricted to the administrator's IP
- No public database or Redis ports

## Install

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
sudo mkdir -p /opt/utiliy
sudo chown "$USER":"$USER" /opt/utiliy
```

Copy this directory to `/opt/utiliy/backend`, create `backend/.env` from
`.env.example`, replace all three passwords, and point
`commerce.utiliy.com` to the VM's static public IP.

```sh
cd /opt/utiliy/backend
cp .env.example .env
chmod 600 .env
docker compose up -d
```

The default stack publishes WordPress only on `127.0.0.1:8080`. Install
`nginx-commerce.conf` on the host and obtain a certificate with Certbot. On a
clean VM with no host proxy, `docker compose --profile caddy up -d` can instead
run the included Caddy service directly on ports 80 and 443.

## WordPress setup

Run the idempotent configuration script after the containers are healthy:

```sh
./scripts/configure-wordpress.sh
```

It installs WooCommerce, the official WooCommerce Stripe gateway, Redis,
Storefront, the Utiliy plugin, the US-only free-shipping zone, and the current
catalog. Connect Stripe through **WooCommerce → Settings → Payments → Stripe**.
The Utiliy plugin never stores separate Stripe API keys and never creates
PaymentIntents directly.

## Public API

- `GET /wp-json/utiliy/v1/catalog`
- `POST /wp-json/utiliy/v1/checkout-session`
- `GET /wp-json/utiliy/v1/orders/{id}?key={order_key}`

The checkout-session endpoint resolves every SKU, price, current supplier
review date, margin floor, and stock state in WooCommerce. It returns a
single-use cart URL that transfers the customer into the standard WooCommerce
checkout. Browser prices are never authoritative.

## Fulfillment

Paid orders include a **Utiliy manual fulfillment** panel in WooCommerce with
the supplier, exact option, variation ID, current landed-cost snapshot, and
supplier link. Mark the order after placing it with the supplier.

After the supplier ships, enter its carrier, tracking number, and tracking URL
in the same panel. Marking the order shipped completes it and triggers the
WooCommerce customer email through Azure Communication Services.

AutoDS is optional. It can be activated later when an order for an AutoDS
private-supplier product makes the subscription worthwhile. AliExpress items
can be ordered directly from their stored supplier links.

## Operations

```sh
docker compose ps
docker compose logs --tail=200 wordpress
docker compose pull
docker compose up -d
./scripts/configure-wordpress.sh
```

The last command is required after every catalog or plugin deployment. It is
safe to rerun: it refreshes every SKU, pauses stale/unavailable products,
drafts removed managed SKUs, and preserves existing orders.

Back up the MariaDB volume and WordPress uploads before upgrades. Never commit
`.env`, WordPress application passwords, ACS keys, Stripe keys, or AutoDS
credentials.
