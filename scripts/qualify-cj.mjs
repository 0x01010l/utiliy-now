import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const API_ROOT = "https://developers.cjdropshipping.com/api2.0/v1";

function loadEnv(file) {
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const separator = trimmed.indexOf("=");
    const key = trimmed.slice(0, separator).trim();
    if (!(key in process.env)) {
      process.env[key] = trimmed.slice(separator + 1).trim();
    }
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

    if (!response.ok || body?.result === false || body?.code !== 200) {
      throw new Error(body?.message || `${response.status} ${response.statusText}`);
    }

    return body.data;
  }

  throw new Error("Request retries exhausted");
}

async function getAccessToken(apiKey) {
  const data = await requestJson(`${API_ROOT}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  return data.accessToken;
}

loadEnv(path.resolve("backend/.env"));

const pids = process.argv.slice(2);
if (!process.env.CJ_API_KEY) throw new Error("CJ_API_KEY is missing");
if (!pids.length) throw new Error("Pass one or more CJ product IDs");

const token = await getAccessToken(process.env.CJ_API_KEY);
await sleep(1_100);
const headers = { "CJ-Access-Token": token };
const results = [];

for (const pid of pids) {
  await sleep(1_100);
  const params = new URLSearchParams({ pid, countryCode: "US" });
  const product = await requestJson(`${API_ROOT}/product/query?${params}`, {
    headers,
  });
  const variants = (product.variants || []).sort(
    (a, b) => Number(a.variantSellPrice) - Number(b.variantSellPrice),
  );
  const variant = variants[0];

  await sleep(1_100);
  const stock = await requestJson(
    `${API_ROOT}/product/stock/getInventoryByPid?${new URLSearchParams({ pid })}`,
    { headers },
  );
  const usInventory = (stock.inventories || []).find(
    (inventory) => inventory.countryCode === "US",
  );

  let freight = [];
  if (variant?.vid) {
    await sleep(1_100);
    freight = await requestJson(`${API_ROOT}/logistic/freightCalculate`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        startCountryCode: "US",
        endCountryCode: "US",
        zip: "10001",
        products: [{ quantity: 1, vid: variant.vid }],
      }),
    });
  }

  const freightPrices = (freight || [])
    .map((option) => Number(option.totalPostageFee ?? option.logisticPrice))
    .filter(Number.isFinite);
  const minFreight = freightPrices.length ? Math.min(...freightPrices) : null;
  const selectedFreight =
    (freight || []).find(
      (option) =>
        Number(option.totalPostageFee ?? option.logisticPrice) === minFreight,
    ) || null;
  const supplierTax = Number(selectedFreight?.taxesFee || 0);
  const unitCost = Number(variant?.variantSellPrice ?? product.sellPrice);

  results.push({
    pid,
    name: product.productNameEn,
    supplier: product.supplierName || null,
    productType: product.productType,
    listed: product.listedNum,
    freeShipping: product.addMarkStatus === 1,
    unitCost,
    minFreight,
    supplierTax,
    landedCost:
      minFreight === null ? null : unitCost + minFreight + supplierTax,
    selectedLogistics: selectedFreight?.logisticName || null,
    shippingAging: [...new Set((freight || []).map((option) => option.logisticAging))],
    shippingOptions: freight?.length || 0,
    usInventory: usInventory?.totalInventoryNum ?? null,
    usCjInventory: usInventory?.cjInventoryNum ?? null,
    variantCount: variants.length,
    selectedVariant: {
      vid: variant?.vid,
      sku: variant?.variantSku,
      name: variant?.variantNameEn,
      internalBarcode: variant?.barcode,
      weightGrams: variant?.variantWeight,
    },
    imageCount: product.productImageSet?.length || 0,
    identifierWarning: "CJ barcode is internal and is not verified as a GS1 GTIN",
  });
}

process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
