import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "catalog/products.json");
const draftDir = path.join(root, "catalog/drafts");
const promptPath = path.join(root, "catalog/image-prompts.json");

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const files = (await readdir(draftDir)).filter((file) => file.endsWith(".json")).sort();
if (!files.length) throw new Error("No catalog draft files found.");

const incomingProducts = [];
const incomingPrompts = [];
for (const file of files) {
  const draft = JSON.parse(await readFile(path.join(draftDir, file), "utf8"));
  if (!Array.isArray(draft.products) || !Array.isArray(draft.prompts)) {
    throw new Error(`${file} must contain products and prompts arrays.`);
  }
  incomingProducts.push(...draft.products);
  incomingPrompts.push(...draft.prompts);
}

const duplicateValues = (values) => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
const draftSlugs = incomingProducts.map((product) => product.slug);
const draftSkus = incomingProducts.flatMap((product) =>
  product.variants?.length ? product.variants.map((variant) => variant.sku) : [product.sku]
);
const duplicateSlugs = duplicateValues(draftSlugs);
const duplicateSkus = duplicateValues(draftSkus);
if (duplicateSlugs.length || duplicateSkus.length) {
  throw new Error(`Duplicate draft values: slugs=${duplicateSlugs.join(",")} skus=${duplicateSkus.join(",")}`);
}

const incomingBySlug = new Map(incomingProducts.map((product) => [product.slug, product]));
catalog.products = [
  ...catalog.products.filter((product) => !incomingBySlug.has(product.slug)),
  ...incomingProducts
];

const allSkus = catalog.products.flatMap((product) =>
  product.variants?.length ? product.variants.map((variant) => variant.sku) : [product.sku]
);
const finalDuplicateSkus = duplicateValues(allSkus);
if (finalDuplicateSkus.length) throw new Error(`Duplicate catalog SKUs: ${finalDuplicateSkus.join(",")}`);

const prompts = Object.fromEntries(
  incomingPrompts.map((prompt) => [
    prompt.slug,
    {
      packshot: prompt.packshot,
      place: prompt.place,
      detail: prompt.detail
    }
  ])
);
for (const slug of draftSlugs) {
  if (!prompts[slug]?.packshot || !prompts[slug]?.place || !prompts[slug]?.detail) {
    throw new Error(`Missing image prompts for ${slug}`);
  }
}

await mkdir(path.dirname(promptPath), { recursive: true });
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
await writeFile(promptPath, `${JSON.stringify(prompts, null, 2)}\n`);
console.log(`Merged ${incomingProducts.length} pages and ${draftSkus.length} supplier SKUs from ${files.length} drafts.`);
