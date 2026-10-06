const PRICES = {
  "UTY-LIGHT": "price_1UNXLZEdRiz3mn514tb86TaD",
  "UTY-CLOSET-110": "price_1UNXLWEdRiz3mn518Bu15QyL",
  "UTY-CLOSET-90": "price_1UNXLSEdRiz3mn51SOLB6avJ",
  "UTY-CLOSET-70": "price_1UNXLPEdRiz3mn51xa95Q7XZ",
  "UTY-CLOSET-50": "price_1UNXLLEdRiz3mn51hfOPWd5J",
  "UTY-CLOSET-35": "price_1UNXLHEdRiz3mn51RrEjkaad",
  "UTY-ANCHOR-6": "price_1UNXLEEdRiz3mn51DxBe2rHa",
  "UTY-SLIDE-XL": "price_1UNXLBEdRiz3mn51L3AtYEIL",
  "UTY-SLIDE-L": "price_1UNXL7EdRiz3mn51WZsqhAGQ",
  "UTY-SLIDE-S": "price_1UNXL3EdRiz3mn51blDGbk08",
  "UTY-ROD-60": "price_1UNXKzEdRiz3mn51H6lwozq8",
  "UTY-ROD-55": "price_1UNXKwEdRiz3mn51VZTdOdjO",
  "UTY-ROD-30": "price_1UNXKsEdRiz3mn51ioH2P7t7",
  "UTY-SWEEP-53": "price_1UNXKoEdRiz3mn5166xCaBM9",
  "UTY-SWEEP-25": "price_1UNXKlEdRiz3mn51d5DBEfWw",
  "UTY-RACE-8M": "price_1UNXKhEdRiz3mn51gvDEJYee",
  "UTY-RACE-6M": "price_1UNXKeEdRiz3mn51dXGqgSM9",
  "UTY-RACE-4M": "price_1UNXKaEdRiz3mn51Ja8XfhqQ",
  "UTY-SINK": "price_1UNXKXEdRiz3mn51M4RjjXCE",
  "UTY-DRAWER-4": "price_1UNXKTEdRiz3mn51FDmtRTsL",
  "UTY-CADDY": "price_1UNXJtEdRiz3mn511couVhoc"
};

const SHIPPING_RATE = "shr_1UNXJuEdRiz3mn51p6wWogb7";
const CLIENT_ID = "oacli_V18aOD6v0hs9CU";
const TOKEN_URL = "https://access.stripe.com/stripecli/oauth2/token";
const ACCOUNT = "acct_1LbgqpEdRiz3mn51";

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "https://utiliy.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

function allowedOrigin(origin) {
  return [
    "https://utiliy.com",
    "https://www.utiliy.com",
    "http://127.0.0.1:8765",
    "http://localhost:8765"
  ].includes(origin) ? origin : "https://utiliy.com";
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) }
  });
}

async function accessToken(env) {
  const cached = await env.TOKENS.get("session", "json");
  if (cached && cached.expires_at > Date.now() + 60_000) return cached.access_token;
  const refresh = (await env.TOKENS.get("refresh")) || env.STRIPE_REFRESH_TOKEN;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: CLIENT_ID
    })
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error("auth");
  const expires_at = Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000;
  await env.TOKENS.put("session", JSON.stringify({ access_token: data.access_token, expires_at }));
  if (data.refresh_token) await env.TOKENS.put("refresh", data.refresh_token);
  return data.access_token;
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request.headers.get("Origin") || "");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== "POST") return json({ error: "Use POST" }, 405, origin);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Cart could not be read." }, 400, origin); }
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return json({ error: "The cart is empty." }, 400, origin);
    if (items.length > 20) return json({ error: "The cart has too many lines." }, 400, origin);

    const merged = new Map();
    for (const item of items) {
      const sku = item && item.sku;
      const price = PRICES[sku];
      if (!price) return json({ error: "One of those products is not for sale." }, 400, origin);
      const qty = Math.min(10, Math.max(1, Math.floor(Number(item.qty) || 1)));
      merged.set(sku, Math.min(10, (merged.get(sku) || 0) + qty));
    }

    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("success_url", "https://utiliy.com/order/thanks/?session_id={CHECKOUT_SESSION_ID}");
    params.set("cancel_url", "https://utiliy.com/checkout/");
    params.set("billing_address_collection", "required");
    params.set("phone_number_collection[enabled]", "true");
    params.set("shipping_address_collection[allowed_countries][0]", "US");
    params.set("shipping_options[0][shipping_rate]", SHIPPING_RATE);
    [...merged.entries()].forEach(([sku, qty], index) => {
      params.set(`line_items[${index}][price]`, PRICES[sku]);
      params.set(`line_items[${index}][quantity]`, String(qty));
    });

    let token;
    try { token = await accessToken(env); }
    catch { return json({ error: "Checkout is temporarily unavailable." }, 503, origin); }

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Stripe-Context": ACCOUNT,
        "Stripe-Livemode": "true",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params
    });
    const data = await res.json();
    if (!res.ok || !data.url) return json({ error: "Stripe could not start the payment." }, 502, origin);
    return json({ url: data.url }, 200, origin);
  }
};
