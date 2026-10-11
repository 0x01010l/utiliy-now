import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const API_ROOT = "https://developers.cjdropshipping.com/api2.0/v1";
const root = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(root, "catalog/cj-opportunities.json");
const outputPath = path.join(root, "catalog/cj-qualified.json");

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function loadEnv(file) {
  const text = await fs.readFile(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const separator = trimmed.indexOf("=");
    const key = trimmed.slice(0, separator).trim();
    if (!(key in process.env)) process.env[key] = trimmed.slice(separator + 1).trim();
  }
}

async function requestJson(url, options = {}) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => null);
    if (
      (response.status === 429 || /too many requests/i.test(body?.message || "")) &&
      attempt < 3
    ) {
      await sleep(1_250 * (attempt + 1));
      continue;
    }
    if (!response.ok || body?.result === false || body?.code !== 200) {
      throw new Error(body?.message || `${response.status} ${response.statusText}`);
    }
    return body.data;
  }
  throw new Error("CJ request retries exhausted");
}

function imageUrls(product) {
  const urls = Array.isArray(product.productImageSet) ? product.productImageSet : [];
  if (typeof product.productImage === "string" && product.productImage.trim().startsWith("[")) {
    try {
      urls.unshift(...JSON.parse(product.productImage));
    } catch {
      // Fall through to the structured image set.
    }
  } else if (product.productImage) {
    urls.unshift(product.productImage);
  }
  return [...new Set(urls.filter((url) => /^https?:\/\//.test(url)))];
}

await loadEnv(path.join(root, "backend/.env"));
if (!process.env.CJ_API_KEY) throw new Error("CJ_API_KEY is missing");

const selections = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const auth = await requestJson(`${API_ROOT}/authentication/getAccessToken`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ apiKey: process.env.CJ_API_KEY }),
});
const headers = { "CJ-Access-Token": auth.accessToken };
const qualified = [];

for (const [index, selection] of selections.entries()) {
  await sleep(1_100);
  const product = await requestJson(
    `${API_ROOT}/product/query?${new URLSearchParams({
      pid: selection.pid,
      countryCode: "US",
    })}`,
    { headers },
  );
  const variants = (product.variants || []).sort(
    (a, b) => Number(a.variantSellPrice) - Number(b.variantSellPrice),
  );
  const variant = variants[0];
  if (!variant?.vid) throw new Error(`${selection.pid} has no orderable variant`);

  await sleep(1_100);
  const stock = await requestJson(
    `${API_ROOT}/product/stock/getInventoryByPid?${new URLSearchParams({
      pid: selection.pid,
    })}`,
    { headers },
  );
  const usInventory = (stock.inventories || []).find(
    (inventory) => inventory.countryCode === "US",
  );

  await sleep(1_100);
  const freight = await requestJson(`${API_ROOT}/logistic/freightCalculate`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      startCountryCode: "US",
      endCountryCode: "US",
      zip: "10001",
      products: [{ quantity: 1, vid: variant.vid }],
    }),
  });
  const selectedFreight = (freight || [])
    .filter((option) =>
      Number.isFinite(Number(option.totalPostageFee ?? option.logisticPrice)),
    )
    .sort(
      (a, b) =>
        Number(a.totalPostageFee ?? a.logisticPrice) -
        Number(b.totalPostageFee ?? b.logisticPrice),
    )[0];
  if (!selectedFreight) throw new Error(`${selection.pid} has no US freight option`);

  const unitCost = Number(variant.variantSellPrice ?? product.sellPrice);
  const shippingCost = Number(
    selectedFreight.totalPostageFee ?? selectedFreight.logisticPrice,
  );
  const supplierTax = Number(selectedFreight.taxesFee || 0);
  const landed = unitCost + shippingCost + supplierTax;
  const stripeFee = selection.price / 100 * 0.029 + 0.3;
  const margin = (selection.price / 100 - landed - stripeFee) / (selection.price / 100);
  const aging = String(selectedFreight.logisticAging || "3-7")
    .match(/\d+/g)
    ?.map(Number) || [3, 7];

  const images = imageUrls(product);
  qualified.push({
    ...selection,
    name: product.productNameEn,
    description: product.description || "",
    images,
    image: images[0],
    supplier: product.supplierName || "CJdropshipping",
    listed: Number(product.listedNum || 0),
    variantCount: variants.length,
    selectedVariant: {
      vid: variant.vid,
      sku: variant.variantSku,
      name: variant.variantNameEn || "",
      weightGrams: Number(variant.variantWeight || 0),
    },
    stockQuantity: Number(usInventory?.totalInventoryNum || 0),
    cjStockQuantity: Number(usInventory?.cjInventoryNum || 0),
    unitCost,
    shippingCost,
    supplierTax,
    landedCost: landed,
    selectedLogistics: selectedFreight.logisticName || "",
    minDays: Math.min(...aging),
    maxDays: Math.max(...aging),
    margin: Number(margin.toFixed(4)),
    marginPass: margin >= 0.15,
    checkedAt: new Date().toISOString().slice(0, 10),
  });
  console.log(
    `${index + 1}/${selections.length} ${selection.slug}: ${(
      margin * 100
    ).toFixed(1)}% margin, ${usInventory?.totalInventoryNum || 0} US`,
  );
}

await fs.writeFile(outputPath, `${JSON.stringify(qualified, null, 2)}\n`);
const failed = qualified.filter(
  (product) => !product.marginPass || product.stockQuantity <= 0,
);
if (failed.length) {
  console.error(
    `Qualification failed: ${failed.map((product) => product.slug).join(", ")}`,
  );
  process.exitCode = 1;
} else {
  console.log(`Qualified ${qualified.length} CJ products to ${outputPath}`);
}
