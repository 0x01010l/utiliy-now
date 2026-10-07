import { readFile } from "node:fs/promises";

const catalog = JSON.parse(await readFile(new URL("../catalog/products.json", import.meta.url), "utf8"));
const targetMargin = 0.30;
const stripeRate = 0.029;
const stripeFixed = 30;
const rows = [];
let failed = false;

for (const product of catalog.products) {
  const variants = product.variants?.length
    ? product.variants.map((variant) => ({
        ...variant,
        autods: { ...product.autods, ...variant.autods }
      }))
    : [{ sku: product.sku, price: product.price, autods: product.autods }];

  for (const variant of variants) {
    const cost = Number(variant.autods.cost);
    const shipping = Number(variant.autods.shippingCost);
    const price = Number(variant.price);
    const minimum = Math.ceil((cost + shipping + stripeFixed) / (1 - targetMargin - stripeRate));
    const fee = Math.round(price * stripeRate + stripeFixed);
    const profit = price - cost - shipping - fee;
    const margin = profit / price;
    const valid = Number.isFinite(cost) && Number.isFinite(shipping) && price >= minimum;
    failed ||= !valid;
    rows.push({
      sku: variant.sku,
      price: `$${(price / 100).toFixed(2)}`,
      landed: `$${((cost + shipping) / 100).toFixed(2)}`,
      minimum: `$${(minimum / 100).toFixed(2)}`,
      margin: `${(margin * 100).toFixed(1)}%`,
      result: valid ? "PASS" : "FAIL"
    });
  }
}

console.table(rows);
if (failed) {
  console.error("A SKU is missing cost data or falls below the 30% post-Stripe margin floor.");
  process.exitCode = 1;
}
