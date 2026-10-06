import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const catalog = JSON.parse(readFileSync("catalog/products.json", "utf8"));
const links = JSON.parse(readFileSync("catalog/stripe-links.json", "utf8"));
const shippingRate = "shr_1UNXJuEdRiz3mn51p6wWogb7";

function stripe(args) {
  const out = execFileSync("stripe", [...args, "--live"], { encoding: "utf8" });
  return JSON.parse(out.slice(out.indexOf("{")));
}

function skus() {
  const rows = [];
  for (const product of catalog.products) {
    const variants = product.variants?.length
      ? product.variants
      : [{ sku: product.sku, label: product.fit, price: product.price }];
    for (const variant of variants) {
      rows.push({
        sku: variant.sku,
        name: `Utiliy ${product.name}${product.variants ? ` — ${variant.label}` : ""}`,
        description: `${product.summary} Option: ${variant.label}. ${product.headline}.`,
        price: variant.price
      });
    }
  }
  return rows;
}

for (const row of skus()) {
  if (links[row.sku]) {
    console.log("skip", row.sku);
    continue;
  }
  const product = stripe([
    "products", "create",
    "-d", `name=${row.name.replaceAll(",", "")}`,
    "-d", "shippable=true",
    "-d", `description=${row.description.replaceAll(",", ";")}`,
    "-d", `metadata[sku]=${row.sku}`
  ]);
  const price = stripe([
    "prices", "create",
    "--product", product.id,
    "--unit-amount", String(row.price),
    "--currency", "usd",
    "-d", `metadata[sku]=${row.sku}`
  ]);
  const link = stripe([
    "payment_links", "create",
    "-d", `line_items[0][price]=${price.id}`,
    "-d", "line_items[0][quantity]=1",
    "-d", "line_items[0][adjustable_quantity][enabled]=true",
    "-d", "line_items[0][adjustable_quantity][minimum]=1",
    "-d", "line_items[0][adjustable_quantity][maximum]=10",
    "--after-completion.type", "redirect",
    "--after-completion.redirect.url", "https://utiliy.com/order/thanks/",
    "-d", "shipping_address_collection[allowed_countries][0]=US",
    "-d", "billing_address_collection=required",
    "-d", "phone_number_collection[enabled]=true",
    "-d", `shipping_options[0][shipping_rate]=${shippingRate}`,
    "-d", `metadata[sku]=${row.sku}`
  ]);
  links[row.sku] = link.url;
  writeFileSync("catalog/stripe-links.json", JSON.stringify(links, null, 2) + "\n");
  console.log(row.sku, link.url);
}
