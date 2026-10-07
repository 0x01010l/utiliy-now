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

1. Open `https://commerce.utiliy.com/wp-admin/install.php`.
2. Install and activate WooCommerce.
3. Activate **Utiliy Commerce**.
4. In WooCommerce settings, use USD, sell only to the United States, and
   disable taxes until the merchant's tax obligations are configured.
5. Open **WooCommerce → Utiliy Commerce** and save the live Stripe
   publishable key, secret key, and webhook signing secret.
6. In Stripe, register:
   `https://commerce.utiliy.com/wp-json/utiliy/v1/stripe/webhook`
   for `payment_intent.succeeded`, `payment_intent.payment_failed`, and
   `charge.refunded`.

## Public API

- `GET /wp-json/utiliy/v1/catalog`
- `POST /wp-json/utiliy/v1/checkout`
- `GET /wp-json/utiliy/v1/orders/{id}?key={order_key}`
- `POST /wp-json/utiliy/v1/stripe/webhook`

The browser never supplies an authoritative price. Checkout resolves every
SKU against WooCommerce and calculates the order total server-side.

## Fulfillment

Paid orders include a **Utiliy manual fulfillment** panel in WooCommerce with
the supplier, exact option, variation ID, current landed-cost snapshot, and
supplier link. Mark the order after placing it with the supplier.

AutoDS is optional. It can be activated later when an order for an AutoDS
private-supplier product makes the subscription worthwhile. AliExpress items
can be ordered directly from their stored supplier links.

## Operations

```sh
docker compose ps
docker compose logs --tail=200 wordpress
docker compose pull
docker compose up -d
```

Back up the MariaDB volume and WordPress uploads before upgrades. Never commit
`.env`, WordPress application passwords, Stripe keys, or AutoDS credentials.
