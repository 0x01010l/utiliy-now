import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const API_ROOT = "https://developers.cjdropshipping.com/api2.0/v1";
const DEFAULT_KEYWORDS = [
  "lift chair hand control",
  "recliner battery pack",
  "recliner power supply",
  "recliner linear actuator",
  "cabinet lift mechanism",
  "RV door latch replacement",
  "window crank replacement",
  "shower door bottom seal",
  "flush valve repair kit",
  "garbage disposal flange",
  "dishwasher rack adjuster",
  "marine ethernet cable",
  "transducer adapter cable",
  "radio programming cable",
  "90W PoE injector",
  "DIN rail USB serial",
  "active HDMI to DisplayPort",
];

function loadEnv(file) {
  if (!fs.existsSync(file)) return;

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const separator = trimmed.indexOf("=");
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestJson(url, options = {}) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => null);
    const rateLimited =
      response.status === 429 || /too many requests/i.test(body?.message || "");

    if (rateLimited && attempt < 3) {
      await sleep(1_250 * (attempt + 1));
      continue;
    }

    if (!response.ok || !body?.result) {
      const message = body?.message || `${response.status} ${response.statusText}`;
      throw new Error(`${url}: ${message}`);
    }

    return body.data;
  }

  throw new Error(`${url}: request retries exhausted`);
}

async function getAccessToken(apiKey) {
  const data = await requestJson(`${API_ROOT}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  return data.accessToken;
}

async function searchProducts(token, keyword) {
  const products = [];

  for (const page of [1]) {
    const params = new URLSearchParams({
      keyWord: keyword,
      page: String(page),
      size: "25",
      countryCode: "US",
      startSellPrice: "12",
      endSellPrice: "250",
      startWarehouseInventory: "5",
      verifiedWarehouse: "1",
      orderBy: "0",
      sort: "desc",
      features: "enable_category",
    });
    const data = await requestJson(`${API_ROOT}/product/listV2?${params}`, {
      headers: { "CJ-Access-Token": token },
    });

    products.push(
      ...(data.content || []).flatMap((group) =>
        (group.productList || []).map((product) => ({
          keyword,
          page,
          id: product.id,
          sku: product.sku,
          name: product.nameEn,
          price: Number(product.nowPrice || product.sellPrice),
          listed: Number(product.listedNum || 0),
          inventory: Number(product.totalVerifiedInventory || 0),
          freeShipping: product.addMarkStatus === 1,
          category: product.threeCategoryName,
          supplier: product.supplierName || null,
          productType: product.productType,
        })),
      ),
    );
    await sleep(1_100);
  }

  return products;
}

function opportunityScore(product) {
  const priceScore =
    product.price >= 35 && product.price <= 160
      ? 25
      : product.price >= 20 && product.price <= 220
        ? 12
        : 0;
  const listingScore =
    product.listed === 0
      ? 25
      : product.listed <= 10
        ? 20
        : product.listed <= 50
          ? 10
          : 0;
  const inventoryScore =
    product.inventory >= 100
      ? 20
      : product.inventory >= 25
        ? 12
        : 5;
  const specificityScore =
    /\b(replacement|compatible|adapter|control|actuator|kit|seal|latch|flange|injector)\b/i.test(
      product.name,
    )
      ? 20
      : 5;
  const shippingScore = product.freeShipping ? 10 : 0;

  return priceScore + listingScore + inventoryScore + specificityScore + shippingScore;
}

function keywordRelevance(product) {
  const ignored = new Set(["and", "for", "kit", "pack", "replacement", "the", "with"]);
  const terms = product.keyword
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((term) => term.length > 2 && !ignored.has(term)) || [];
  const name = product.name.toLowerCase();
  const matchedTerms = terms.filter((term) => name.includes(term));

  return {
    matchedTerms,
    relevant: matchedTerms.length >= Math.min(2, terms.length),
  };
}

loadEnv(path.resolve("backend/.env"));

const apiKey = process.env.CJ_API_KEY;
if (!apiKey) {
  throw new Error("CJ_API_KEY is missing from backend/.env");
}

const keywords = process.argv.slice(2).length
  ? process.argv.slice(2)
  : DEFAULT_KEYWORDS;
const token = await getAccessToken(apiKey);
await sleep(1_100);
const products = [];

for (const keyword of keywords) {
  try {
    const matches = await searchProducts(token, keyword);
    products.push(...matches);
    console.error(`${keyword}: ${matches.length} US verified-stock matches`);
  } catch (error) {
    console.error(`${keyword}: skipped (${error.message})`);
  }
  await sleep(1_100);
}

const deduplicated = [...new Map(products.map((product) => [product.id, product])).values()]
  .map((product) => ({ ...product, ...keywordRelevance(product) }))
  .filter((product) => product.relevant)
  .map((product) => ({
    ...product,
    score: opportunityScore(product) + product.matchedTerms.length * 5,
  }))
  .sort((a, b) => b.score - a.score || a.listed - b.listed || b.price - a.price);

process.stdout.write(`${JSON.stringify(deduplicated, null, 2)}\n`);
