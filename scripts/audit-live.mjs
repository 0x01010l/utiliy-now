const site = "https://utiliy.com";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url, options = {}) {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      headers: { "User-Agent": "Googlebot/2.1 (+http://www.google.com/bot.html)", ...(options.headers || {}) },
      ...options
    }).catch(() => null);
    lastStatus = response?.status || 0;
    if (response?.ok) return response;
    await wait(5000);
  }
  throw new Error(`${url} returned HTTP ${lastStatus || "network error"}`);
}

const sitemapResponse = await fetchWithRetry(`${site}/map.xml?audit=${Date.now()}`);
const sitemap = await sitemapResponse.text();
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)]
  .map((match) => match[1].replaceAll("&amp;", "&"))
  .filter((url) => url.startsWith(`${site}/`));

const required = [
  `${site}/robots.txt`,
  `${site}/shipping/`,
  `${site}/returns/`,
  `${site}/privacy/`,
  `${site}/terms/`,
  `${site}/contact/`,
  `${site}/feeds/products.json`,
  `${site}/feeds/google-merchant.tsv`,
  `${site}/feeds/checkout-openapi.json`,
  `${site}/.well-known/agent-commerce.json`,
  `${site}/llms.txt`
];
const targets = [...new Set([...urls, ...required])];

for (let index = 0; index < targets.length; index += 8) {
  await Promise.all(targets.slice(index, index + 8).map(async (url) => {
    const response = await fetchWithRetry(`${url}${url.includes("?") ? "&" : "?"}audit=${Date.now()}`);
    if (url.endsWith("/")) {
      const html = await response.text();
      const canonical = html.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
      if (canonical !== url) throw new Error(`${url} canonical is ${canonical || "missing"}`);
      if (/name="robots" content="noindex/.test(html)) throw new Error(`${url} is unexpectedly noindex`);
    }
  }));
}

const missingUrl = `${site}/definitely-not-a-real-utiliy-page-${Date.now()}/`;
const missing = await fetch(missingUrl, {
  cache: "no-store",
  redirect: "manual",
  headers: { "User-Agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" }
});
if (missing.status !== 404) throw new Error(`Unknown URL returned HTTP ${missing.status}, expected 404`);
const missingHtml = await missing.text();
if (!/name="robots" content="noindex,follow"/.test(missingHtml)) throw new Error("Live 404 response is missing noindex,follow");
if (/rel="canonical"|hreflang=/.test(missingHtml)) throw new Error("Live 404 response must not declare canonical or hreflang URLs");

const checkoutOptions = await fetch("https://commerce.utiliy.com/wp-json/utiliy/v1/checkout-session", {
  method: "OPTIONS",
  headers: {
    Origin: site,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "content-type"
  }
});
if (!checkoutOptions.ok) throw new Error(`Checkout API preflight returned HTTP ${checkoutOptions.status}`);
if (checkoutOptions.headers.get("access-control-allow-origin") !== site) throw new Error("Checkout API does not allow the storefront origin");
if (!checkoutOptions.headers.get("allow")?.includes("POST")) throw new Error("Checkout API does not advertise POST");

const merchantCheckout = await fetchWithRetry("https://commerce.utiliy.com/checkout/?merchant_id=UTY-CJ-KIT-5067266");
const merchantCheckoutHtml = await merchantCheckout.text();
if (!merchantCheckoutHtml.includes("UTY-CJ-KIT-5067266") || !merchantCheckoutHtml.includes("Dual%20Joint%20Pot%20Filler%20Faucet")) {
  throw new Error("Merchant checkout template did not preload the requested product");
}

console.log(`Live audit passed: ${targets.length} public URLs returned 200, canonicals matched, the 404 was correct, and both checkout paths passed.`);
