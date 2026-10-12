import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const site = "https://utiliy.com";
const failures = [];
const fail = (message) => failures.push(message);

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  }))).flat();
}

function routeFor(file) {
  const rel = path.relative(dist, file).replaceAll(path.sep, "/");
  if (rel === "index.html") return "/";
  if (rel === "404.html") return "/404.html";
  return `/${rel.replace(/index\.html$/, "")}`;
}

function localFile(urlPath) {
  const pathname = decodeURIComponent(urlPath.split(/[?#]/, 1)[0]);
  if (pathname === "/") return path.join(dist, "index.html");
  const candidate = path.join(dist, pathname);
  return path.extname(pathname) ? candidate : path.join(candidate, "index.html");
}

function parseTsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted && char === '"' && text[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === "\t") {
      row.push(cell);
      cell = "";
    } else if (!quoted && char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  return rows.filter((item) => item.some(Boolean));
}
function splitEscaped(value, delimiter) {
  const parts = [];
  let part = "";
  let escaped = false;
  for (const char of value) {
    if (escaped) {
      part += char === delimiter ? char : `\\${char}`;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === delimiter) {
      parts.push(part);
      part = "";
    } else {
      part += char;
    }
  }
  parts.push(part);
  return parts;
}

const requiredRoutes = [
  "/", "/shop/", "/about/", "/contact/", "/faq/", "/fitment/",
  "/shipping/", "/returns/", "/privacy/", "/terms/", "/robots.txt",
  "/sitemap.xml", "/feeds/products.json", "/feeds/google-merchant.tsv",
  "/feeds/checkout-openapi.json",
  "/.well-known/agent-commerce.json", "/llms.txt", "/llms-full.txt"
];
for (const route of requiredRoutes) {
  await stat(localFile(route)).catch(() => fail(`Missing required output: ${route}`));
}

const allFiles = await filesUnder(dist);
const htmlFiles = allFiles.filter((file) => file.endsWith(".html"));
const canonicalOwners = new Map();
for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  const route = routeFor(file);
  const canonicals = [...html.matchAll(/<link rel="canonical" href="([^"]+)">/g)].map((match) => match[1]);
  const expectedCanonicalCount = route === "/404.html" ? 0 : 1;
  if (canonicals.length !== expectedCanonicalCount) fail(`${route} has ${canonicals.length} canonical tags`);
  if (route !== "/404.html") {
    const expected = `${site}${route}`;
    if (canonicals[0] !== expected) fail(`${route} canonical is ${canonicals[0] || "missing"}, expected ${expected}`);
    if (canonicalOwners.has(canonicals[0])) fail(`Duplicate canonical on ${route} and ${canonicalOwners.get(canonicals[0])}`);
    canonicalOwners.set(canonicals[0], route);
  }
  if ((html.match(/<title>/g) || []).length !== 1) fail(`${route} must have one title`);
  if ((html.match(/<meta name="description"/g) || []).length !== 1) fail(`${route} must have one meta description`);
  const title = html.match(/<title>(.*?)<\/title>/)?.[1] || "";
  const description = html.match(/<meta name="description" content="([^"]*)">/)?.[1] || "";
  if (!/name="robots" content="noindex/.test(html) && title.length > 70) fail(`${route} title is ${title.length} characters`);
  if (!/name="robots" content="noindex/.test(html) && description.length > 170) fail(`${route} meta description is ${description.length} characters`);
  if ((html.match(/<h1[\s>]/g) || []).length !== 1) fail(`${route} must have one h1`);
  if (route === "/404.html" && !/<meta name="robots" content="noindex,follow">/.test(html)) fail("404 page must be noindex,follow");
  for (const match of html.matchAll(/<(?:a|link|img|script)[^>]+(?:href|src)="([^"]+)"/g)) {
    const value = match[1];
    if (!value.startsWith("/") || value.startsWith("//")) continue;
    const target = localFile(value);
    await stat(target).catch(() => fail(`${route} links to missing ${value}`));
  }
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(match[1]);
    } catch (error) {
      fail(`${route} has invalid JSON-LD: ${error.message}`);
    }
  }
}

const sitemap = await readFile(path.join(dist, "sitemap.xml"), "utf8");
const sitemapUrls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1].replaceAll("&amp;", "&"));
const sitemapSet = new Set(sitemapUrls);
if (sitemapSet.size !== sitemapUrls.length) fail("Sitemap contains duplicate URLs");
for (const url of sitemapUrls) {
  if (!url.startsWith(`${site}/`)) fail(`Sitemap URL is off-domain: ${url}`);
  const file = localFile(new URL(url).pathname);
  const html = await readFile(file, "utf8").catch(() => "");
  if (!html) fail(`Sitemap URL has no generated page: ${url}`);
  if (/name="robots" content="noindex/.test(html)) fail(`Sitemap contains noindex URL: ${url}`);
}
for (const file of htmlFiles) {
  const route = routeFor(file);
  const html = await readFile(file, "utf8");
  if (route !== "/404.html" && !/name="robots" content="noindex/.test(html) && !sitemapSet.has(`${site}${route}`)) {
    fail(`Indexable page is absent from sitemap: ${route}`);
  }
}

const rows = parseTsv(await readFile(path.join(dist, "feeds/google-merchant.tsv"), "utf8"));
const header = rows[0];
const records = rows.slice(1).map((row) => Object.fromEntries(header.map((name, index) => [name, row[index] ?? ""])));
const ids = new Set();
const approvedGoogleCategories = new Set([
  "115", "259", "574", "594", "636", "1425", "1489", "1673", "1771", "1867",
  "2032", "2463", "2626", "2691", "2720", "2878", "2886", "2948", "3328", "3443",
  "3848", "4080", "4437", "4485", "4491", "503730", "505295", "5558", "6254", "6343",
  "6446", "6747", "6911", "7214", "8058", "8087", "8231", "499933", "499981"
]);
for (const [index, row] of records.entries()) {
  if (rows[index + 1].length !== header.length) fail(`Merchant row ${index + 2} has ${rows[index + 1].length} columns, expected ${header.length}`);
  if (!row.id || ids.has(row.id)) fail(`Merchant offer id is missing or duplicated: ${row.id}`);
  ids.add(row.id);
  if (!row.title || row.title.length > 150) fail(`${row.id} title length is invalid`);
  if (!row.short_title || row.short_title.length > 65) fail(`${row.id} short_title length is invalid`);
  if (!row.description || row.description.length > 5000) fail(`${row.id} description length is invalid`);
  if (!/^https:\/\/utiliy\.com\//.test(row.link) || row.canonical_link !== row.link) fail(`${row.id} has an invalid product link`);
  if (!/^https:\/\//.test(row.image_link)) fail(`${row.id} image_link must use HTTPS`);
  if (!/^\d+$/.test(row.google_product_category)) fail(`${row.id} Google category must be an official numeric ID`);
  if (!approvedGoogleCategories.has(row.google_product_category)) fail(`${row.id} uses an unreviewed Google category ${row.google_product_category}`);
  if (!/^\d+\.\d{2} USD$/.test(row.price)) fail(`${row.id} has invalid price ${row.price}`);
  if (!["in_stock", "out_of_stock"].includes(row.availability)) fail(`${row.id} has invalid availability`);
  if (!["yes", "no"].includes(row.identifier_exists)) fail(`${row.id} has invalid identifier_exists`);
  if (row.identifier_exists === "yes" && !row.gtin && !(row.brand && row.mpn)) fail(`${row.id} claims identifiers without GTIN or brand plus MPN`);
  if (/Google Shopping|identifier_exists|supplier's internal/i.test(row.question_and_answer)) fail(`${row.id} exposes implementation language in Q&A`);
  for (const detail of splitEscaped(row.product_detail, ",")) {
    if (splitEscaped(detail, ":").length !== 3) fail(`${row.id} has malformed product_detail grouped attributes`);
  }
  for (const answer of splitEscaped(row.question_and_answer, ",")) {
    if (answer && splitEscaped(answer, ":").length !== 2) fail(`${row.id} has malformed question_and_answer grouped attributes`);
  }
}

const feed = JSON.parse(await readFile(path.join(dist, "feeds/products.json"), "utf8"));
const offerCount = feed.products.reduce((total, product) => total + product.offers.length, 0);
if (offerCount !== records.length) fail(`JSON feed has ${offerCount} offers but Merchant feed has ${records.length}`);
if (allFiles.some((file) => file.endsWith("/feeds/fulfillment.json"))) fail("Public supplier fulfillment map must not be generated");
const checkoutOpenApi = JSON.parse(await readFile(path.join(dist, "feeds/checkout-openapi.json"), "utf8"));
if (!checkoutOpenApi.paths?.["/wp-json/utiliy/v1/checkout-session"]?.post) fail("Checkout OpenAPI contract is missing its POST operation");
for (const file of allFiles.filter((item) => /\.(?:html|json|txt|tsv|xml)$/.test(item))) {
  const text = await readFile(file, "utf8");
  if (/AutoDS/i.test(text)) fail(`Deprecated supplier name leaked into ${path.relative(dist, file)}`);
}

if (failures.length) {
  console.error(`Build audit failed with ${failures.length} issue(s):`);
  for (const issue of failures) console.error(`- ${issue}`);
  process.exit(1);
}
console.log(`Build audit passed: ${htmlFiles.length} HTML pages, ${sitemapUrls.length} sitemap URLs, ${records.length} Merchant offers.`);
