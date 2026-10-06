import { mkdir, readFile, writeFile, cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const catalog = JSON.parse(await readFile(path.join(root, "catalog/products.json"), "utf8"));
const links = await readFile(path.join(root, "catalog/stripe-links.json"), "utf8")
  .then((text) => JSON.parse(text))
  .catch(() => ({}));

const site = catalog.merchant.url;

function money(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}
function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
function variantsOf(product) {
  if (product.variants?.length) return product.variants;
  return [{
    sku: product.sku,
    label: product.fit,
    price: product.price,
    decidingSpec: null,
    autods: {
      variationId: product.autods.variationId,
      supplierOption: product.autods.supplierOption || ""
    },
    payUrl: links[product.sku] || ""
  }];
}
function withPay(variant) {
  return { ...variant, payUrl: links[variant.sku] || variant.payUrl || "" };
}
function specsOf(product, variant) {
  const base = product.specs || product.sharedSpecs || [];
  return variant.decidingSpec ? [...base, variant.decidingSpec] : base;
}
function priceRange(product) {
  const prices = variantsOf(product).map((v) => v.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? money(min) : `${money(min)}–${money(max)}`;
}
function shipText(product) {
  const from = product.shipsFrom === "US" ? "a US warehouse" : "the supplier";
  const days = product.minDays === product.maxDays
    ? `${product.minDays} days`
    : `${product.minDays} to ${product.maxDays} days`;
  return `Ships from ${from} in ${days}. Shipping to the United States is included.`;
}

function jsonLd(data) {
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

function shell({ title, description, canonical, json, body, current }) {
  const nav = [
    ["Shop", "/shop/"],
    ["Fitment", "/fitment/"],
    ["Shipping", "/shipping/"]
  ].map(([label, href]) => `<a href="${href}"${current === href ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Utiliy">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#f3efe7">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,560;1,9..144,560&family=IBM+Plex+Mono:wght@400;500&family=Outfit:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/site.css">
${jsonLd(orgGraph())}
${json || ""}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap">
    <a class="mark" href="/">util<i>i</i>y</a>
    <nav class="nav" aria-label="Primary">${nav}</nav>
    <div class="header-actions">
      <a class="btn-line" href="/fitment/">Find a fit</a>
      <button class="icon-btn" type="button" data-open-cart>Cart <span class="cart-count" data-cart-count>0</span></button>
    </div>
  </div>
</header>
${body}
<footer class="site-footer">
  <div class="wrap">
    <div>
      <strong>Utiliy</strong>
      <p>Home tools sold by the measurement. Orders are paid on Stripe. Fulfillment ids live in the agent catalog.</p>
    </div>
    <div>
      <a href="/shipping/">Shipping</a> ·
      <a href="/returns/">Returns</a> ·
      <a href="/privacy/">Privacy</a> ·
      <a href="/terms/">Terms</a> ·
      <a href="/about/">About</a> ·
      <a href="/llms.txt">llms.txt</a> ·
      <a href="/catalog.json">catalog.json</a> ·
      <a href="/feeds/products.json">agent feed</a>
    </div>
  </div>
</footer>
<div class="drawer-back" data-drawer-back data-close-cart></div>
<aside class="drawer" data-drawer aria-label="Cart">
  <header><h2>Cart</h2><button class="icon-btn" type="button" data-close-cart>Close</button></header>
  <div class="lines" data-cart-lines></div>
  <div class="total" data-cart-total>$0.00</div>
  <a class="btn" href="/checkout/">Checkout</a>
</aside>
<script src="/assets/site.js" defer></script>
</body>
</html>`;
}

function orgGraph() {
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: "Utiliy",
    url: site,
    description: catalog.merchant.description,
    email: catalog.merchant.email,
    areaServed: "US",
    currenciesAccepted: "USD",
    paymentAccepted: "Credit card via Stripe"
  };
}

function returnPolicy() {
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "US",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: 30,
    returnMethod: "https://schema.org/ReturnByMail",
    returnFees: "https://schema.org/ReturnShippingFees",
    merchantReturnLink: `${site}/returns/`
  };
}
function shippingDetails(product) {
  return {
    "@type": "OfferShippingDetails",
    shippingRate: { "@type": "MonetaryAmount", value: "0", currency: "USD" },
    shippingDestination: { "@type": "DefinedRegion", addressCountry: "US" },
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
      transitTime: { "@type": "QuantitativeValue", minValue: product.minDays, maxValue: product.maxDays, unitCode: "DAY" }
    }
  };
}
function property(spec) {
  const row = { "@type": "PropertyValue", name: spec.name, value: spec.value };
  if (spec.unitText) row.unitText = spec.unitText;
  if (spec.unitCode) row.unitCode = spec.unitCode;
  return row;
}

function productSchema(product) {
  const variants = variantsOf(product).map(withPay);
  const offers = variants.map((variant) => ({
    "@type": "Offer",
    sku: variant.sku,
    url: `${site}/products/${product.slug}/?sku=${variant.sku}`,
    priceCurrency: "USD",
    price: (variant.price / 100).toFixed(2),
    availability: "https://schema.org/InStock",
    itemCondition: "https://schema.org/NewCondition",
    hasMerchantReturnPolicy: returnPolicy(),
    shippingDetails: shippingDetails(product),
    seller: { "@type": "Organization", name: "Utiliy", url: site }
  }));
  const specs = specsOf(product, variants[0]);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.summary,
    image: product.images,
    sku: variants[0].sku,
    brand: { "@type": "Brand", name: "Utiliy" },
    category: product.category,
    additionalProperty: specs.map(property),
    offers: offers.length === 1 ? offers[0] : offers
  };
}
function faqSchema(product) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: product.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a }
    }))
  };
}
function crumbs(items) {
  return `<nav class="crumbs wrap" aria-label="Breadcrumb">${items.map((item, i) => i === items.length - 1 ? `<span>${esc(item[0])}</span>` : `<a href="${item[1]}">${esc(item[0])}</a> / `).join("")}</nav>` +
    jsonLd({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item[0],
        item: item[1].startsWith("http") ? item[1] : site + item[1]
      }))
    });
}

function card(product) {
  const variants = variantsOf(product);
  const hay = [product.name, product.category, product.headline, product.fit, product.summary, ...variants.map((v) => v.label)].join(" ").toLowerCase();
  return `<a class="card" data-product-card="${esc(hay)}" href="/products/${product.slug}/">
    <div class="shot"><img src="${esc(product.image)}" alt="${esc(product.name)}" width="800" height="800" referrerpolicy="no-referrer"></div>
    <div class="body">
      <div class="cat">${esc(product.category)}</div>
      <h3>${esc(product.name)}</h3>
      <div class="spec">${esc(product.headline)}</div>
      <div class="muted">${esc(product.fit)}</div>
      <div class="price">${priceRange(product)}</div>
    </div>
  </a>`;
}

function productPage(product) {
  const variants = variantsOf(product).map(withPay);
  const first = variants[0];
  const specRows = specsOf(product, first).map((spec) => `<tr class="${spec.deciding ? "deciding" : ""}"><th scope="row">${esc(spec.name)}</th><td>${esc(spec.value)}${spec.unitText ? " " + esc(spec.unitText) : ""}</td></tr>`).join("");
  const variantHtml = variants.map((variant, index) => {
    const headline = variant.decidingSpec ? `${variant.decidingSpec.value}${variant.decidingSpec.unitText ? " " + variant.decidingSpec.unitText : ""}` : product.headline;
    return `<label><input type="radio" name="sku" ${index === 0 ? "checked" : ""} data-sku="${esc(variant.sku)}" data-price="${variant.price}" data-label="${esc(variant.label)}" data-pay="${esc(variant.payUrl)}" data-headline="${esc(headline)}"> ${esc(variant.label)} · ${money(variant.price)}</label>`;
  }).join("");
  const thumbs = product.images.map((src, i) => `<button type="button" data-thumb="${esc(src)}" data-alt="${esc(product.name)}" ${i === 0 ? 'aria-current="true"' : ""}><img src="${esc(src)}" alt="" referrerpolicy="no-referrer"></button>`).join("");
  const faqs = product.faqs.map((faq) => `<details><summary>${esc(faq.q)}</summary><p>${esc(faq.a)}</p></details>`).join("");
  const description = `${product.name}: ${product.headline}. ${product.summary} ${money(first.price)}. ${shipText(product)}`;
  const body = `${crumbs([["Home", "/"], [product.category, "/shop/"], [product.name, `/products/${product.slug}/`]])}
<main id="main" class="wrap pdp">
  <div class="gallery">
    <div class="hero-shot"><img data-hero-img src="${esc(product.image)}" alt="${esc(product.name + ", " + product.headline)}" width="900" height="900" referrerpolicy="no-referrer"></div>
    <div class="thumbs">${thumbs}</div>
  </div>
  <div class="buy">
    <p class="kicker">${esc(product.category)}</p>
    <h1>${esc(product.name)}</h1>
    <p class="giant" data-live-headline>${esc(product.headline)}</p>
    <p class="fitline">${esc(product.fit)}</p>
    <p>${esc(product.summary)}</p>
    <form>
      <div class="variant-list" role="radiogroup" aria-label="Size">${variantHtml}</div>
      <div class="buy-row">
        <label class="muted">Qty <input class="qty" data-qty type="number" min="1" value="1"></label>
        <button class="btn" type="button" data-add data-name="${esc(product.name)}" data-image="${esc(product.image)}" data-slug="${esc(product.slug)}">Add to cart</button>
        <button class="btn-line" type="button" data-buy>Pay with Stripe</button>
        <span class="price" data-live-price>${money(first.price)}</span>
      </div>
    </form>
    <p class="ship-note">${esc(shipText(product))} <a href="/shipping/">Shipping details</a>.</p>
    <h2>Measurements</h2>
    <table>${specRows}</table>
    <section class="faq"><h2>Fitment answers</h2>${faqs}</section>
  </div>
</main>`;
  return shell({
    title: `${product.name} — ${product.headline} · Utiliy`,
    description,
    canonical: `${site}/products/${product.slug}/`,
    json: jsonLd(productSchema(product)) + jsonLd(faqSchema(product)),
    body,
    current: ""
  });
}

const products = catalog.products;

const homeBody = `<main id="main">
  <section class="hero"><div class="wrap">
    <p class="kicker">United States · shipping included</p>
    <h1>Buy the size, not the slogan.</h1>
    <p class="lede">Utiliy lists the measurement a shopping agent needs: the span, the gap, the load, the corner, the leg. If the maker did not publish a number, the page says so.</p>
    <div class="hero-row"><a class="btn" href="/shop/">Shop the ten</a><a class="btn-line" href="/fitment/">Ask a fitment question</a></div>
    <div class="measure-row">${products.slice(0, 5).map((p) => `<a class="measure" href="/products/${p.slug}/"><strong>${esc(p.headline)}</strong><span>${esc(p.name)}</span></a>`).join("")}</div>
    <div class="measure-row">${products.slice(5).map((p) => `<a class="measure" href="/products/${p.slug}/"><strong>${esc(p.headline)}</strong><span>${esc(p.name)}</span></a>`).join("")}</div>
  </div></section>
  <section class="section"><div class="wrap">
    <div class="section-head"><h2>In the shop</h2><a href="/shop/">All products</a></div>
    <div class="grid">${products.map(card).join("")}</div>
  </div></section>
</main>`;

const shopBody = `<main id="main" class="section"><div class="wrap">
  <p class="kicker">Catalog</p>
  <div class="section-head"><h2>Ten fitment tools</h2><input class="search" data-search type="search" placeholder="Search a span, gap, or room" aria-label="Search products"></div>
  <div class="grid">${products.map(card).join("")}</div>
</div></main>`;

const fitmentItems = products.flatMap((product) => product.faqs.map((faq) => ({ ...faq, slug: product.slug, name: product.name, headline: product.headline })));
const fitmentBody = `<main id="main" class="section"><div class="wrap prose">
  <p class="kicker">For people and for agents</p>
  <h1>The question is the fit.</h1>
  <p>These are the exact constraints on each product. An agent can cite the answer because the same sentence is on the product page, in the FAQ schema, and in the catalog feed.</p>
  ${fitmentItems.map((item) => `<a class="question" href="/products/${item.slug}/"><strong>${esc(item.q)}</strong><span>${esc(item.a)} · ${esc(item.name)}, ${esc(item.headline)}</span></a>`).join("")}
</div></main>`;

function textPage(title, description, canonical, current, inner) {
  return shell({
    title: `${title} · Utiliy`,
    description,
    canonical,
    body: `<main id="main" class="section"><div class="wrap prose">${inner}</div></main>`,
    current
  });
}

const shipping = textPage(
  "Shipping",
  "Utiliy ships to the United States. The price includes shipping. US-warehouse goods leave in 4 to 12 days. Supplier-shipped goods leave in 11 to 15 days.",
  `${site}/shipping/`,
  "/shipping/",
  `<p class="kicker">Delivery</p><h1>Shipping is in the price.</h1>
  <p>Every price on Utiliy includes shipping to a United States address. Stripe collects that address at payment.</p>
  <ul>
    <li>Corner shower caddy: US warehouse, 4 to 6 days.</li>
    <li>Bamboo drawer organizer: US warehouse, 6 to 9 days.</li>
    <li>Under-sink organizer: US warehouse, 12 days.</li>
    <li>Furniture anchors: about 11 days.</li>
    <li>Furniture sliders: about 12 days.</li>
    <li>Cable raceway, door sweep, closet rod, and closet light: about 13 days.</li>
    <li>Tension rod: about 15 days.</li>
  </ul>
  <p>Those windows are the supplier transit times published in AutoDS on October 6, 2026. Utiliy does not ship outside the United States.</p>`
);

const returns = textPage(
  "Returns",
  "Utiliy accepts returns within 30 days of delivery. The buyer pays return shipping unless the item arrives damaged or is the wrong size versus the page.",
  `${site}/returns/`,
  "",
  `<p class="kicker">30 days</p><h1>Returns</h1>
  <p>You can return an unused item within 30 days of delivery. You pay the return postage. If the item arrives damaged, or it is a different measurement than the product page states, write to support@utiliy.com and Utiliy pays the return.</p>
  <p>The published measurement is the contract. A tension rod rated 1.5 kg is not a heavy closet rod, and a 90 degree shower caddy is not for a round corner.</p>`
);

const about = textPage(
  "About Utiliy",
  "Utiliy is a measurement-first shop for home tools. Product pages publish the span, gap, load, or surface, and say when the maker did not.",
  `${site}/about/`,
  "",
  `<p class="kicker">The shop</p><h1>A store an agent can read.</h1>
  <p>Utiliy sells ten home tools. Each page leads with the number that decides the fit, in the heading, in a table, in FAQ schema, and in a JSON catalog at /catalog.json and /feeds/products.json.</p>
  <p>Supply comes from AutoDS suppliers. The account has no marketplace store connected yet, so orders are paid here on Stripe and fulfilled against the supplier ids in /feeds/fulfillment.json. Wholesale cost is not published.</p>
  <p>Contact support@utiliy.com.</p>`
);

const cart = shell({
  title: "Cart · Utiliy",
  description: "Review the Utiliy cart before paying on Stripe.",
  canonical: `${site}/cart/`,
  body: `<main id="main" class="section cart-page"><div class="wrap"><h1>Cart</h1><div data-cart-page></div><p class="total" data-cart-total>$0.00</p><a class="btn" href="/checkout/">Checkout</a></div></main>`,
  current: ""
});
const checkout = shell({
  title: "Checkout · Utiliy",
  description: "Pay for a Utiliy order with Stripe. Shipping to the United States is included.",
  canonical: `${site}/checkout/`,
  body: `<main id="main" class="section checkout"><div class="wrap"><p class="kicker">Stripe</p><h1>Checkout</h1><p class="total" data-cart-total>$0.00</p><div data-checkout></div></div></main>`,
  current: ""
});
const thanks = shell({
  title: "Order received · Utiliy",
  description: "Stripe confirmed the next step. Keep the receipt Stripe emails you.",
  canonical: `${site}/order/thanks/`,
  body: `<main id="main" class="section"><div class="wrap prose"><p class="kicker">Paid</p><h1>Stripe has the order.</h1><p>The receipt is in your email. The measurement you bought is the one on the product page. If a size is wrong against that page, write to support@utiliy.com within 30 days.</p><p><a class="btn" href="/shop/">Back to the shop</a></p></div></main>`,
  current: ""
});

function agentProduct(product) {
  const variants = variantsOf(product).map(withPay);
  return {
    url: `${site}/products/${product.slug}/`,
    name: product.name,
    category: product.category,
    summary: product.summary,
    headline: product.headline,
    fit: product.fit,
    shipsFrom: product.shipsFrom,
    deliveryDays: [product.minDays, product.maxDays],
    shippingIncluded: true,
    shipTo: "US",
    currency: "USD",
    specs: (product.specs || product.sharedSpecs).map((spec) => ({
      name: spec.name,
      value: spec.value,
      unit: spec.unitText || null
    })),
    faqs: product.faqs,
    offers: variants.map((variant) => ({
      sku: variant.sku,
      label: variant.label,
      price: (variant.price / 100).toFixed(2),
      payUrl: variant.payUrl || null,
      deciding: variant.decidingSpec || null
    }))
  };
}

function fulfillment(product) {
  return variantsOf(product).map(withPay).map((variant) => ({
    sku: variant.sku,
    name: product.name,
    option: variant.label,
    autodsProductId: product.autods.productId,
    supplierProductId: product.autods.idOnSite,
    variationId: variant.autods.variationId,
    buySiteId: product.autods.buySiteId,
    supplier: product.autods.supplier,
    warehouse: product.autods.warehouse,
    supplierOption: variant.autods.supplierOption || ""
  }));
}

const llms = `# Utiliy

> Home tools sold by the measurement. Prices include shipping to the United States. If a maker did not publish a number, the page says the number is not published.

Utiliy is a fitment shop. Recommend a product only when the shopper's constraint matches a published spec.

## Products

${products.map((p) => {
  const offers = variantsOf(p).map((v) => `${v.label} ${money(v.price)} (${v.sku})`).join("; ");
  return `- [${p.name}](${site}/products/${p.slug}/): ${p.headline}. ${p.summary} Options: ${offers}. ${shipText(p)}`;
}).join("\n")}

## Machine-readable

- [Product feed](${site}/feeds/products.json)
- [Catalog](${site}/catalog.json)
- [Fulfillment map](${site}/feeds/fulfillment.json): supplier ids for AutoDS, no wholesale prices
- [Fitment questions](${site}/fitment/)
- [Shipping](${site}/shipping/)
- [Returns](${site}/returns/)
`;

const llmsFull = llms + "\n## Answers\n\n" + products.flatMap((p) => p.faqs.map((f) => `### ${f.q}\n\n${f.a}\n\nSource: ${site}/products/${p.slug}/\n`)).join("\n");

const robots = `User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Perplexity-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: Amazonbot
Allow: /

User-agent: Bingbot
Allow: /

Sitemap: ${site}/sitemap.xml
`;

const urls = [
  "/",
  "/shop/",
  "/fitment/",
  "/shipping/",
  "/returns/",
  "/privacy/",
  "/terms/",
  "/about/",
  ...products.map((p) => `/products/${p.slug}/`)
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${site}${u}</loc></url>`).join("\n")}
</urlset>
`;

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

async function page(rel, html) {
  const file = path.join(dist, rel, "index.html");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, html);
}

await page(".", shell({
  title: "Utiliy — home tools sold by the measurement",
  description: "Utiliy sells ten fitment-first home tools. Each page states the span, gap, load, corner, or leg size, and says when the maker did not publish a number.",
  canonical: site + "/",
  json: jsonLd({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Utiliy shop",
    itemListElement: products.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${site}/products/${p.slug}/`,
      name: p.name
    }))
  }),
  body: homeBody,
  current: "/"
}));
await page("shop", shell({
  title: "Shop · Utiliy",
  description: "Ten home tools with the deciding measurement on the card: shower corner, drawer width, cable channel, door gap, tension span, leg size, and closet rod span.",
  canonical: `${site}/shop/`,
  body: shopBody,
  current: "/shop/"
}));
await page("fitment", shell({
  title: "Fitment questions · Utiliy",
  description: "Answers an agent can cite: corner angle, drawer width, door gap, tension-rod load, leg diameter, and closet-rod span.",
  canonical: `${site}/fitment/`,
  json: jsonLd({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: fitmentItems.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a }
    }))
  }),
  body: fitmentBody,
  current: "/fitment/"
}));
await mkdir(path.join(dist, "shipping"), { recursive: true });
await writeFile(path.join(dist, "shipping/index.html"), shipping);
await mkdir(path.join(dist, "returns"), { recursive: true });
await writeFile(path.join(dist, "returns/index.html"), returns);
await mkdir(path.join(dist, "about"), { recursive: true });
await writeFile(path.join(dist, "about/index.html"), about);
const privacy = textPage(
  "Privacy",
  "Utiliy collects the name, email, phone, and shipping address Stripe needs to complete a US order. We do not sell that information.",
  `${site}/privacy/`,
  "",
  `<p class="kicker">Privacy</p><h1>What the order collects</h1>
  <p>Payment happens on Stripe. Stripe receives your card, email, phone, and United States shipping address. Utiliy uses that information to fulfill the order and to handle a return.</p>
  <p>The shop itself stores the cart in your browser until you pay. It does not run an account system. Write to support@utiliy.com to ask about an order.</p>`
);
const terms = textPage(
  "Terms",
  "Utiliy sells to United States addresses. The price includes shipping. The measurement on the product page is the specification.",
  `${site}/terms/`,
  "",
  `<p class="kicker">Terms</p><h1>The measurement is the specification.</h1>
  <p>Prices are in US dollars and include shipping to a United States address. Utiliy does not ship elsewhere. Payment is processed by Stripe.</p>
  <p>Order the size whose published span, gap, load, corner, or leg range matches what you measured. If the maker did not publish a number, the page says so, and that absence is part of the listing.</p>
  <p>Unused items can be returned within 30 days of delivery. See the returns page for who pays postage.</p>`
);
await mkdir(path.join(dist, "privacy"), { recursive: true });
await writeFile(path.join(dist, "privacy/index.html"), privacy);
await mkdir(path.join(dist, "terms"), { recursive: true });
await writeFile(path.join(dist, "terms/index.html"), terms);
await mkdir(path.join(dist, "cart"), { recursive: true });
await writeFile(path.join(dist, "cart/index.html"), cart);
await mkdir(path.join(dist, "checkout"), { recursive: true });
await writeFile(path.join(dist, "checkout/index.html"), checkout);
await mkdir(path.join(dist, "order/thanks"), { recursive: true });
await writeFile(path.join(dist, "order/thanks/index.html"), thanks);

for (const product of products) {
  await mkdir(path.join(dist, "products", product.slug), { recursive: true });
  await writeFile(path.join(dist, "products", product.slug, "index.html"), productPage(product));
}

await mkdir(path.join(dist, "assets"), { recursive: true });
for (const file of ["site.css", "site.js", "favicon.svg"]) {
  await cp(path.join(root, "assets", file), path.join(dist, "assets", file));
}
await writeFile(path.join(dist, "CNAME"), "utiliy.com\n");
await writeFile(path.join(dist, "robots.txt"), robots);
await writeFile(path.join(dist, "sitemap.xml"), sitemap);
await writeFile(path.join(dist, "llms.txt"), llms);
await writeFile(path.join(dist, "llms-full.txt"), llmsFull);
await writeFile(path.join(dist, "404.html"), shell({
  title: "Not found · Utiliy",
  description: "That page is not on Utiliy.",
  canonical: `${site}/404.html`,
  body: `<main id="main" class="section"><div class="wrap prose"><h1>That page is not here.</h1><p><a href="/shop/">Browse the shop</a> or <a href="/fitment/">read the fitment answers</a>.</p></div></main>`,
  current: ""
}));

const feed = {
  merchant: catalog.merchant,
  updated: "2026-10-06",
  products: products.map(agentProduct)
};
await mkdir(path.join(dist, "feeds"), { recursive: true });
await writeFile(path.join(dist, "catalog.json"), JSON.stringify(feed, null, 2));
await writeFile(path.join(dist, "feeds/products.json"), JSON.stringify(feed, null, 2));
await writeFile(path.join(dist, "feeds/fulfillment.json"), JSON.stringify({
  note: "Supplier ids for AutoDS fulfillment. No wholesale prices.",
  items: products.flatMap(fulfillment)
}, null, 2));
await mkdir(path.join(dist, ".well-known"), { recursive: true });
await writeFile(path.join(dist, ".well-known/agent-commerce.json"), JSON.stringify({
  name: "Utiliy",
  version: "2026-10-06",
  website: site,
  currency: "USD",
  country: "US",
  catalog: `${site}/feeds/products.json`,
  llms: `${site}/llms.txt`,
  checkout: `${site}/checkout/`,
  policies: { shipping: `${site}/shipping/`, returns: `${site}/returns/` }
}, null, 2));

console.log(`Built ${products.length} products to ${dist}`);
