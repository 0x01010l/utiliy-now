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

const sitemapResponse = await fetchWithRetry(`${site}/sitemap.xml?audit=${Date.now()}`);
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

console.log(`Live audit passed: ${targets.length} public URLs returned 200, canonicals matched, and an unknown URL returned 404.`);
