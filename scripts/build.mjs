import { mkdir, readFile, writeFile, cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const catalog = JSON.parse(await readFile(path.join(root, "catalog/products.json"), "utf8"));

const site = catalog.merchant.url;
const checkoutConfig = await readFile(path.join(root, "catalog/checkout.json"), "utf8")
  .then((text) => JSON.parse(text))
  .catch(() => ({}));
const indexNowConfig = JSON.parse(await readFile(path.join(root, "catalog/indexnow.json"), "utf8"));
const buildDate = new Date().toISOString().slice(0, 10);
const catalogUpdated = catalog.products.flatMap((product) => [
  product.stockCheckedAt,
  product.autods?.costCheckedAt,
  ...(product.variants || []).flatMap((variant) => [variant.stockCheckedAt, variant.autods?.costCheckedAt])
]).filter(Boolean).sort().at(-1) || buildDate;

const categories = [
  { slug: "bathroom", name: "Bathroom", blurb: "Corner shelves with a published size, angle, and load.", guide: "Measure the corner angle and available wall width. Adhesive shelves need a smooth, non-porous surface." },
  { slug: "kitchen", name: "Kitchen", blurb: "Drawer widths and under-sink racks.", guide: "Measure the inside of the drawer or cabinet—not its outside edge—and leave room for pipes and hinges." },
  { slug: "closet", name: "Closet", blurb: "Rod spans, tension loads, and closet lights.", guide: "Match the clear inside span, expected load, and mounting surface before choosing a rod or light." },
  { slug: "furniture", name: "Furniture", blurb: "Hardwood sliders and screw-in anchors.", guide: "Check the furniture-leg shape, floor material, and whether the frame can safely accept a screw." },
  { slug: "cable", name: "Cable", blurb: "Raceways with an inner channel you can match.", guide: "Measure the thickest cable bundle and compare it with the published inner channel—not the outer raceway size." },
  { slug: "door", name: "Door", blurb: "Sweeps sized to the gap under the door.", guide: "Measure the door width and the largest floor gap along its full swing before choosing a sweep." }
];
function catSlug(name) {
  return String(name).toLowerCase();
}
const returnsSentence = "You can return an unused item within 30 days of delivery. You pay the return postage. If the item arrives damaged, or it is a different measurement than the product page states, write to support@utiliy.com and Utiliy pays the return.";
const googleCategory = {
  "corner-shower-caddy": "Home & Garden > Bathroom Accessories",
  "bamboo-drawer-organizer": "Home & Garden > Household Supplies > Storage & Organization > Household Drawer Organizer Inserts",
  "under-sink-organizer": "Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils > Kitchen Organizers",
  "cable-raceway": "Electronics > Electronics Accessories > Cable Management",
  "door-draft-stopper": "Hardware > Building Materials > Weather Stripping & Weatherization Supplies",
  "tension-rod": "Home & Garden > Decor > Window Treatment Accessories",
  "furniture-sliders": "Home & Garden > Household Supplies > Furniture Floor Protectors",
  "furniture-anchors": "Home & Garden > Emergency Preparedness > Furniture Anchors",
  "closet-rod": "Home & Garden > Household Supplies > Storage & Organization > Clothing & Closet Storage",
  "closet-motion-light": "Home & Garden > Lighting",
  "adjustable-bed-frame-casters": "Home & Garden > Furniture > Bedroom Furniture Accessories",
  "kerf-door-seal-81-white": "Hardware > Building Materials > Weather Stripping & Weatherization Supplies",
  "extra-wide-door-sweep-36-white": "Hardware > Building Materials > Weather Stripping & Weatherization Supplies",
  "fixed-mount-wire-shelf-clips": "Home & Garden > Household Supplies > Storage & Organization > Clothing & Closet Storage",
  "heavy-duty-closet-pole-sockets": "Home & Garden > Household Supplies > Storage & Organization > Clothing & Closet Storage",
  "kv-rp-0495-bn-shelf-rod-bracket": "Home & Garden > Household Supplies > Storage & Organization > Clothing & Closet Storage",
  "korky-100bp-two-inch-toilet-flapper": "Hardware > Plumbing > Plumbing Fixture Hardware & Parts > Toilet & Bidet Accessories",
  "broan-qt20000-charcoal-filter": "Home & Garden > Household Appliance Accessories > Range Hood Accessories",
  "five-pound-flour-keeper": "Home & Garden > Kitchen & Dining > Food Storage"
};
function sizeOf(variant) {
  if (!variant?.decidingSpec) return variant?.label || "";
  return `${variant.decidingSpec.value}${variant.decidingSpec.unitText ? ` ${variant.decidingSpec.unitText}` : ""}`;
}
function variantPath(product, sku) {
  if (variantsOf(product).length < 2) return `/products/${product.slug}/`;
  return `/products/${product.slug}/${String(sku).toLowerCase()}/`;
}

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
    }
  }];
}
function supplierOf(product, variant) {
  return { ...(product.autods || {}), ...(variant?.autods || {}) };
}
function availabilityOf(product, variant) {
  const supplier = supplierOf(product, variant);
  const available = variant?.available ?? product.available ?? true;
  const checkedAt = variant?.stockCheckedAt ?? product.stockCheckedAt ?? supplier.costCheckedAt ?? "";
  const timestamp = Date.parse(`${checkedAt}T23:59:59Z`);
  const fresh = Number.isFinite(timestamp) && timestamp >= Date.now() - 30 * 24 * 60 * 60 * 1000;
  return { available: Boolean(available) && fresh, checkedAt, fresh };
}
function productUpdated(product) {
  const dates = variantsOf(product).map((variant) => availabilityOf(product, variant).checkedAt).filter(Boolean).sort();
  return dates.at(-1) || catalogUpdated;
}
function productImages(product) {
  return [`${site}${displayImage(product)}`, ...product.images];
}
function specsOf(product, variant) {
  const base = product.specs || product.sharedSpecs || [];
  return variant.decidingSpec ? [...base, variant.decidingSpec] : base;
}
function identifiersOf(product, variant = {}) {
  const gtin12 = variant.gtin12 || product.gtin12;
  const mpn = variant.mpn || product.mpn;
  return {
    ...(gtin12 ? { gtin12 } : {}),
    ...(mpn ? { mpn } : {})
  };
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

function shell({
  title, description, canonical, json, body, current, image, imageAlt = "",
  ogType = "website", head = "", scripts = "", modified = buildDate,
  robots = "index,follow,max-image-preview:large,max-snippet:-1"
}) {
  const catNav = categories.map((cat) => `<a href="/category/${cat.slug}/"${current === `/category/${cat.slug}/` ? ' aria-current="page"' : ""}>${esc(cat.name)}</a>`).join("");
  const footerCats = categories.map((cat) => `<li><a href="/category/${cat.slug}/">${esc(cat.name)}</a></li>`).join("");
  return `<!DOCTYPE html>
<html lang="en-US">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="en-US" href="${canonical}">
<link rel="alternate" hreflang="x-default" href="${canonical}">
<link rel="alternate" type="application/json" title="Utiliy product feed" href="/feeds/products.json">
<meta name="robots" content="${robots}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="Utiliy">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="theme-color" content="#ffffff">
${image ? `<meta property="og:image" content="${esc(image)}">
<meta name="twitter:image" content="${esc(image)}">
<meta property="og:image:alt" content="${esc(imageAlt || title)}">` : ""}
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/site.css?v=20261008b">
${jsonLd(orgGraph())}
${jsonLd(webPageGraph({ title, description, canonical, image, modified }))}
${json || ""}
${head}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<div class="announce">Shipping to the United States is included. One secure checkout for the whole cart.</div>
<header class="site-header">
  <div class="wrap header-row">
    <a class="logo" href="/">Utiliy</a>
    <nav class="nav-row" id="primary-menu" aria-label="Shop by room">${catNav}</nav>
    <form class="search" action="/shop/" method="get" role="search">
      <input data-search name="q" type="search" placeholder="Search for products..." aria-label="Search products">
    </form>
    <div class="header-actions">
      <button class="icon-btn" type="button" data-open-cart>Cart <span class="cart-count" data-cart-count>0</span></button>
    </div>
  </div>
</header>
${body}
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div>
      <p class="footer-brand">Utiliy</p>
      <p>Home tools sold by the measurement. Pay once for the whole cart. Shipping to a US address is included.</p>
    </div>
    <div>
      <h3>Shop</h3>
      <ul><li><a href="/shop/">Shop all</a></li>${footerCats}</ul>
    </div>
    <div>
      <h3>Help</h3>
      <ul>
        <li><a href="/faq/">FAQ</a></li>
        <li><a href="/fitment/">Fitment</a></li>
        <li><a href="/shipping/">Shipping</a></li>
        <li><a href="/returns/">Returns</a></li>
        <li><a href="/contact/">Contact</a></li>
      </ul>
    </div>
    <div>
      <h3>Store</h3>
      <ul>
        <li><a href="/about/">About</a></li>
        <li><a href="/privacy/">Privacy</a></li>
        <li><a href="/terms/">Terms</a></li>
        <li><a href="/llms.txt">llms.txt</a></li>
        <li><a href="/feeds/products.json">Product feed</a></li>
      </ul>
    </div>
  </div>
  <div class="wrap legal">© 2026 Utiliy · support@utiliy.com · United States only</div>
</footer>
<div class="drawer-back" data-drawer-back data-close-cart></div>
<aside class="drawer" data-drawer aria-label="Cart" data-nosnippet>
  <header><h2>Cart</h2><button class="icon-btn" type="button" data-close-cart>Close</button></header>
  <div class="lines" data-cart-lines></div>
  <div class="total" data-cart-total hidden>$0.00</div>
  <p class="muted" data-cart-go hidden>Shipping to the United States is included.</p>
  <button class="btn" type="button" data-pay-all hidden>Checkout</button>
  <button class="btn-line" type="button" data-close-cart data-cart-go hidden>Keep shopping</button>
  <a class="btn-line" href="/shop/" data-cart-empty>Continue shopping</a>
</aside>
<script>window.UTILIY_CHECKOUT=${JSON.stringify(checkoutConfig.url || "")};window.UTILIY_COMMERCE=${JSON.stringify(checkoutConfig.apiBase || "")};</script>
<script src="/assets/site.js?v=20261008a" defer></script>
${scripts}
</body>
</html>`;
}

function orgGraph() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "OnlineStore",
        "@id": `${site}/#store`,
        name: "Utiliy",
        legalName: catalog.merchant.legalName,
        url: site,
        logo: { "@type": "ImageObject", url: `${site}/assets/favicon.svg` },
        description: catalog.merchant.description,
        email: catalog.merchant.email,
        areaServed: { "@type": "Country", name: "United States" },
        currenciesAccepted: "USD",
        paymentAccepted: "Credit card via Stripe",
        hasMerchantReturnPolicy: returnPolicy(),
        hasShippingService: shippingService()
      },
      {
        "@type": "WebSite",
        "@id": `${site}/#website`,
        url: `${site}/`,
        name: "Utiliy",
        description: catalog.merchant.description,
        inLanguage: "en-US",
        publisher: { "@id": `${site}/#store` }
      }
    ]
  };
}

function webPageGraph({ title, description, canonical, image, modified }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${canonical}#webpage`,
    url: canonical,
    name: title,
    description,
    inLanguage: "en-US",
    dateModified: modified,
    isPartOf: { "@id": `${site}/#website` },
    about: { "@id": `${site}/#store` },
    ...(image ? { primaryImageOfPage: { "@type": "ImageObject", url: image } } : {})
  };
}

function returnPolicy() {
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "US",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    returnPolicyCountry: "US",
    merchantReturnDays: 30,
    returnMethod: "https://schema.org/ReturnByMail",
    "@id": `${site}/returns/#policy`,
    returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
    refundType: "https://schema.org/FullRefund",
    merchantReturnLink: `${site}/returns/`
  };
}
function shippingService() {
  return {
    "@type": "ShippingService",
    "@id": `${site}/shipping/#policy`,
    name: "Free United States shipping",
    description: "Shipping is included in every product price. Utiliy ships only to United States addresses.",
    fulfillmentType: "https://schema.org/FulfillmentTypeDelivery",
    shippingConditions: {
      "@type": "ShippingConditions",
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "US" },
      shippingRate: { "@type": "MonetaryAmount", value: "0", currency: "USD" },
      transitTime: {
        "@type": "ServicePeriod",
        duration: { "@type": "QuantitativeValue", minValue: 4, maxValue: 15, unitCode: "DAY" }
      }
    }
  };
}
function shippingDetails(product) {
  return {
    "@type": "OfferShippingDetails",
    shippingRate: { "@type": "MonetaryAmount", value: "0", currency: "USD" },
    shippingDestination: { "@type": "DefinedRegion", addressCountry: "US" },
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
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

function offerFor(product, variant) {
  return {
    "@type": "Offer",
    url: site + variantPath(product, variant.sku),
    priceCurrency: "USD",
    price: (variant.price / 100).toFixed(2),
    availability: availabilityOf(product, variant).available
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
    itemCondition: "https://schema.org/NewCondition",
    hasMerchantReturnPolicy: { "@id": `${site}/returns/#policy` },
    shippingDetails: shippingDetails(product),
    seller: { "@id": `${site}/#store` }
  };
}
function productSchema(product, selectedSku) {
  const variants = variantsOf(product);
  const shared = (product.specs || product.sharedSpecs || []).map(property);
  const category = googleCategory[product.slug] || product.category;
  const brand = product.brand ? { "@type": "Brand", name: product.brand } : null;
  if (variants.length === 1) {
    const variant = variants[0];
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      "@id": `${site}/products/${product.slug}/#product`,
      name: product.name,
      description: product.summary,
      image: productImages(product),
      sku: variant.sku,
      url: `${site}/products/${product.slug}/`,
      mainEntityOfPage: { "@id": `${site}/products/${product.slug}/#webpage` },
      dateModified: productUpdated(product),
      inLanguage: "en-US",
      ...(brand ? { brand } : {}),
      ...identifiersOf(product, variant),
      category,
      additionalProperty: specsOf(product, variant).map(property),
      offers: offerFor(product, variant)
    };
  }
  if (selectedSku) {
    const variant = variants.find((item) => item.sku === selectedSku) || variants[0];
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      "@id": `${site}${variantPath(product, variant.sku)}#product`,
      name: `${product.name}, ${variant.label}`,
      description: product.summary,
      image: productImages(product),
      sku: variant.sku,
      size: sizeOf(variant),
      url: site + variantPath(product, variant.sku),
      mainEntityOfPage: { "@id": `${site}${variantPath(product, variant.sku)}#webpage` },
      dateModified: productUpdated(product),
      inLanguage: "en-US",
      ...(brand ? { brand } : {}),
      ...identifiersOf(product, variant),
      category,
      isVariantOf: { "@id": `${site}/products/${product.slug}/#group` },
      inProductGroupWithID: product.slug,
      additionalProperty: variant.decidingSpec ? [...shared, property(variant.decidingSpec)] : shared,
      offers: offerFor(product, variant)
    };
  }
  return {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    "@id": `${site}/products/${product.slug}/#group`,
    name: product.name,
    description: product.summary,
    image: productImages(product),
    productGroupID: product.slug,
    url: `${site}/products/${product.slug}/`,
    mainEntityOfPage: { "@id": `${site}/products/${product.slug}/#webpage` },
    dateModified: productUpdated(product),
    inLanguage: "en-US",
    ...(brand ? { brand } : {}),
    variesBy: ["https://schema.org/size"],
    category,
    additionalProperty: shared,
    hasVariant: variants.map((variant) => ({
      "@type": "Product",
      "@id": `${site}${variantPath(product, variant.sku)}#product`,
      name: `${product.name}, ${variant.label}`,
      sku: variant.sku,
      size: sizeOf(variant),
      image: productImages(product),
      description: product.summary,
      url: site + variantPath(product, variant.sku),
      isVariantOf: { "@id": `${site}/products/${product.slug}/#group` },
      inProductGroupWithID: product.slug,
      ...(brand ? { brand } : {}),
      ...identifiersOf(product, variant),
      offers: offerFor(product, variant)
    }))
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

function displayImage(product) {
  return `/assets/product-images/${product.slug}.jpg`;
}

function card(product) {
  const variants = variantsOf(product);
  const first = variants[0];
  const available = variants.some((variant) => availabilityOf(product, variant).available);
  const firstAvailable = availabilityOf(product, first).available;
  const hay = [product.name, product.category, product.headline, product.fit, product.summary, ...variants.map((v) => v.label)].join(" ").toLowerCase();
  return `<article class="card" data-product-card="${esc(hay)}">
    <a class="shot" href="/products/${product.slug}/" aria-label="View ${esc(product.name)} specifications and fit"><img src="${displayImage(product)}" alt="${esc(product.name + ", " + product.headline)}" width="1024" height="1024" loading="lazy" decoding="async"></a>
    <a href="/products/${product.slug}/"><h3>${esc(product.name)}</h3></a>
    <p class="spec">${esc(product.headline)}</p>
    <div class="card-row">
      <span class="price">${priceRange(product)}</span>
      ${!available
        ? '<span class="stock-note">Availability review</span>'
        : variants.length > 1
        ? `<a class="btn" href="/products/${product.slug}/">Choose</a>`
        : firstAvailable
        ? `<button class="btn" type="button" data-add data-sku="${esc(first.sku)}" data-price="${first.price}" data-label="${esc(first.label)}" data-name="${esc(product.name)}" data-image="${displayImage(product)}" data-slug="${esc(product.slug)}" data-ships="${esc(product.shipsFrom)}" data-min="${product.minDays}" data-max="${product.maxDays}">Add</button>`
        : '<span class="stock-note">Availability review</span>'}
    </div>
  </article>`;
}

const plates = {
  "corner-shower-caddy": "corner",
  "bamboo-drawer-organizer": "drawer",
  "under-sink-organizer": "unknown",
  "cable-raceway": "channel",
  "door-draft-stopper": "gap",
  "tension-rod": "tension",
  "furniture-sliders": "caps",
  "furniture-anchors": "strap",
  "closet-rod": "rod",
  "closet-motion-light": "puck",
  "adjustable-bed-frame-casters": "caster",
  "kerf-door-seal-81-white": "kerf",
  "extra-wide-door-sweep-36-white": "wide-sweep",
  "fixed-mount-wire-shelf-clips": "shelf-clip",
  "heavy-duty-closet-pole-sockets": "pole-socket",
  "kv-rp-0495-bn-shelf-rod-bracket": "shelf-bracket",
  "korky-100bp-two-inch-toilet-flapper": "flapper",
  "broan-qt20000-charcoal-filter": "filter",
  "five-pound-flour-keeper": "keeper"
};

function specValue(specs, name) {
  const spec = specs.find((item) => item.name === name);
  if (!spec) return "";
  return `${spec.value}${spec.unitText ? ` ${spec.unitText}` : ""}`;
}

function diagram(kind, specs) {
  const t = (name) => esc(specValue(specs, name));
  const open = (label) => `<svg viewBox="0 0 720 520" role="img" aria-label="${esc(label)}">`;
  const close = "</svg>";
  if (kind === "corner") {
    return `${open(`Square corner shelf, ${specValue(specs, "Shelf size")}, ${specValue(specs, "Corner angle")}`)}
      <rect x="64" y="36" width="20" height="448" rx="4" fill="#111"/>
      <rect x="64" y="464" width="560" height="20" rx="4" fill="#111"/>
      <rect x="96" y="150" width="54" height="28" rx="6" fill="#e7e5e4" stroke="#111" stroke-width="2"/>
      <rect x="96" y="390" width="54" height="28" rx="6" fill="#e7e5e4" stroke="#111" stroke-width="2"/>
      <g fill="none" stroke="#111" stroke-width="3" stroke-linejoin="round">
        <path d="M108 214 H360 Q390 214 390 244 V464"/>
        <path d="M108 252 H330 Q356 252 356 278 V464"/>
        <path d="M140 214 V464 M190 214 V464 M240 220 V464 M290 236 V464"/>
      </g>
      <text x="120" y="118" fill="#111" font-family="system-ui,sans-serif" font-size="44" font-weight="700">${t("Corner angle")}</text>
      <text x="430" y="250" fill="#111" font-family="system-ui,sans-serif" font-size="28" font-weight="650">${t("Shelf size")}</text>
      <text x="430" y="292" fill="#111" font-family="system-ui,sans-serif" font-size="22">${t("Load")}</text>
      ${close}`;
  }
  if (kind === "drawer") {
    return `${open(`Drawer dividers for ${specValue(specs, "Drawer interior width")}`)}
      <rect x="70" y="90" width="580" height="340" rx="18" fill="#fff" stroke="#111" stroke-width="8"/>
      <g fill="#d8c4a4" stroke="#111" stroke-width="3">
        <rect x="150" y="120" width="28" height="280" rx="6"/>
        <rect x="280" y="120" width="28" height="280" rx="6"/>
        <rect x="410" y="120" width="28" height="280" rx="6"/>
        <rect x="540" y="120" width="28" height="280" rx="6"/>
      </g>
      <path d="M98 160 h40 M98 360 h40 M612 160 h-28 M612 360 h-28" fill="none" stroke="#111" stroke-width="3"/>
      <text x="90" y="64" fill="#111" font-family="system-ui,sans-serif" font-size="28" font-weight="700">${t("Drawer interior width")}</text>
      <text x="430" y="64" fill="#111" font-family="system-ui,sans-serif" font-size="22">${t("Pieces")} pieces</text>
      ${close}`;
  }
  if (kind === "unknown") {
    return `${open("Under-sink organizer. Width and height are not stated by the maker.")}
      <rect x="80" y="40" width="560" height="440" rx="16" fill="none" stroke="#111" stroke-width="8"/>
      <circle cx="210" cy="150" r="36" fill="none" stroke="#111" stroke-width="6"/>
      <path d="M210 186 v70 h80" fill="none" stroke="#111" stroke-width="6"/>
      <rect x="360" y="210" width="200" height="70" rx="10" fill="none" stroke="#111" stroke-width="4"/>
      <rect x="380" y="300" width="160" height="70" rx="10" fill="none" stroke="#111" stroke-width="4"/>
      <path d="M120 430 H600" fill="none" stroke="#111" stroke-width="3" stroke-dasharray="8 8"/>
      <text x="180" y="414" fill="#111" font-family="system-ui,sans-serif" font-size="26" font-weight="700">Width: ${t("Published width")}</text>
      <text x="180" y="80" fill="#111" font-family="system-ui,sans-serif" font-size="22">Height: ${t("Published height")}</text>
      ${close}`;
  }
  if (kind === "channel") {
    return `${open(`Cord channel, outside ${specValue(specs, "Outside width")} by ${specValue(specs, "Outside height")}, inside ${specValue(specs, "Inside height")}`)}
      <path d="M150 120 h420 v220 a40 40 0 0 1 -40 40 h-340 a40 40 0 0 1 -40 -40 z" fill="#fff" stroke="#111" stroke-width="10"/>
      <path d="M210 150 h300 v150 a24 24 0 0 1 -24 24 h-252 a24 24 0 0 1 -24 -24 z" fill="#f2f0f1" stroke="#111" stroke-width="4"/>
      <text x="150" y="96" fill="#111" font-family="system-ui,sans-serif" font-size="26" font-weight="700">${t("Outside width")} wide</text>
      <text x="150" y="450" fill="#111" font-family="system-ui,sans-serif" font-size="26" font-weight="700">${t("Inside height")} inside</text>
      <text x="150" y="490" fill="#111" font-family="system-ui,sans-serif" font-size="22">${t("Outside height")} outside height</text>
      ${close}`;
  }
  if (kind === "gap") {
    return `${open(`Door sweep covering gaps up to ${specValue(specs, "Gap covered")}`)}
      <rect x="120" y="30" width="480" height="300" rx="8" fill="#fff" stroke="#111" stroke-width="8"/>
      <rect x="60" y="400" width="600" height="16" rx="4" fill="#111"/>
      <g stroke="#111" stroke-width="3">
        <path d="M150 330 v70 M190 330 v78 M230 330 v66 M270 330 v80 M310 330 v72 M350 330 v78 M390 330 v64 M430 330 v76 M470 330 v70 M510 330 v80 M550 330 v68"/>
      </g>
      <text x="140" y="470" fill="#111" font-family="system-ui,sans-serif" font-size="28" font-weight="700">Gap ${t("Gap covered")}</text>
      <text x="140" y="78" fill="#111" font-family="system-ui,sans-serif" font-size="22">Length ${t("Length")}</text>
      ${close}`;
  }
  if (kind === "tension") {
    return `${open(`Tension rod, load ${specValue(specs, "Load")}, diameter ${specValue(specs, "Diameter")}`)}
      <rect x="40" y="80" width="28" height="360" rx="4" fill="#111"/>
      <rect x="652" y="80" width="28" height="360" rx="4" fill="#111"/>
      <rect x="68" y="230" width="36" height="28" rx="8" fill="#e7e5e4" stroke="#111"/>
      <rect x="616" y="230" width="36" height="28" rx="8" fill="#e7e5e4" stroke="#111"/>
      <rect x="100" y="238" width="520" height="12" rx="6" fill="#111"/>
      <text x="100" y="180" fill="#111" font-family="system-ui,sans-serif" font-size="32" font-weight="700">${t("Load")}</text>
      <text x="100" y="320" fill="#111" font-family="system-ui,sans-serif" font-size="24">Diameter ${t("Diameter")}</text>
      <text x="100" y="360" fill="#111" font-family="system-ui,sans-serif" font-size="22">${t("Mount")}</text>
      ${close}`;
  }
  if (kind === "caps") {
    return `${open(`Hardwood leg caps, ${specValue(specs, "Floor")}. ${specValue(specs, "Not for")}`)}
      <rect x="250" y="70" width="180" height="250" fill="#fff" stroke="#111" stroke-width="8"/>
      <rect x="230" y="320" width="220" height="36" rx="6" fill="#e7e5e4" stroke="#111" stroke-width="4"/>
      <path d="M80 400 H640" stroke="#c4a574" stroke-width="10"/>
      <text x="80" y="470" fill="#111" font-family="system-ui,sans-serif" font-size="28" font-weight="700">${t("Floor")}</text>
      <text x="300" y="470" fill="#111" font-family="system-ui,sans-serif" font-size="24">Not for ${t("Not for")}</text>
      ${close}`;
  }
  if (kind === "strap") {
    return `${open("Screw-in furniture anchor. Not adhesive.")}
      <rect x="60" y="40" width="24" height="440" fill="#111"/>
      <rect x="220" y="120" width="420" height="280" rx="12" fill="#fff" stroke="#111" stroke-width="8"/>
      <path d="M84 200 H250" stroke="#111" stroke-width="8"/>
      <circle cx="84" cy="200" r="10" fill="#fff" stroke="#111" stroke-width="4"/>
      <circle cx="250" cy="200" r="10" fill="#fff" stroke="#111" stroke-width="4"/>
      <text x="240" y="460" fill="#111" font-family="system-ui,sans-serif" font-size="28" font-weight="700">${t("Mount")}</text>
      <text x="240" y="80" fill="#111" font-family="system-ui,sans-serif" font-size="22">${t("Sets in the pack")} sets · ${t("Tools")}</text>
      ${close}`;
  }
  if (kind === "rod") {
    return `${open(`Closet rod end ${specValue(specs, "End diameter")}. Load: ${specValue(specs, "Load rating")}`)}
      <rect x="40" y="160" width="24" height="200" fill="#111"/>
      <rect x="656" y="160" width="24" height="200" fill="#111"/>
      <rect x="90" y="236" width="540" height="22" rx="11" fill="#c8c8c8" stroke="#111" stroke-width="4"/>
      <circle cx="110" cy="247" r="28" fill="#fff" stroke="#111" stroke-width="6"/>
      <circle cx="610" cy="247" r="28" fill="#fff" stroke="#111" stroke-width="6"/>
      <text x="90" y="140" fill="#111" font-family="system-ui,sans-serif" font-size="28" font-weight="700">End ${t("End diameter")}</text>
      <text x="90" y="420" fill="#111" font-family="system-ui,sans-serif" font-size="26">Load: ${t("Load rating")}</text>
      ${close}`;
  }
  if (kind === "caster") {
    return `${open(`Bed caster with ${specValue(specs, "Friction stem")} stem and ${specValue(specs, "Wheel diameter")} wheel`)}
      <path d="M350 48v190" stroke="#111" stroke-width="28"/><rect x="290" y="210" width="120" height="76" rx="14" fill="#fff" stroke="#111" stroke-width="8"/>
      <circle cx="350" cy="370" r="94" fill="#fff" stroke="#111" stroke-width="14"/><circle cx="350" cy="370" r="28" fill="#111"/>
      <path d="M454 230h110v42H454z" fill="#111"/>
      <text x="50" y="72" fill="#111" font-family="system-ui,sans-serif" font-size="27" font-weight="700">Stem ${t("Friction stem")}</text>
      <text x="50" y="470" fill="#111" font-family="system-ui,sans-serif" font-size="25">${t("Wheel diameter")} wheel · ${t("Load per caster")} each</text>
      ${close}`;
  }
  if (kind === "kerf") {
    return `${open(`Press-in kerf seal, ${specValue(specs, "Kerf cross-section")}, for gaps up to ${specValue(specs, "Maximum gap")}`)}
      <path d="M120 56v408h128" fill="none" stroke="#111" stroke-width="28"/><path d="M134 230h118" stroke="#111" stroke-width="8"/>
      <path d="M252 178c82 0 120 48 120 112s-38 112-120 112z" fill="#e7e5e4" stroke="#111" stroke-width="6"/>
      <rect x="470" y="70" width="150" height="380" fill="#fff" stroke="#111" stroke-width="10"/>
      <text x="50" y="500" fill="#111" font-family="system-ui,sans-serif" font-size="25" font-weight="700">Kerf ${t("Kerf cross-section")} · gap ≤ ${t("Maximum gap")}</text>
      ${close}`;
  }
  if (kind === "wide-sweep") {
    return `${open(`Door sweep for a ${specValue(specs, "Door width")} door and gap up to ${specValue(specs, "Maximum bottom gap")}`)}
      <rect x="100" y="40" width="500" height="300" fill="#fff" stroke="#111" stroke-width="10"/>
      <rect x="100" y="330" width="500" height="48" fill="#e7e5e4" stroke="#111" stroke-width="6"/>
      <path d="M120 378l20 82m30-82 20 82m30-82 20 82m30-82 20 82m30-82 20 82m30-82 20 82m30-82 20 82m30-82 20 82" stroke="#111" stroke-width="5"/>
      <text x="100" y="500" fill="#111" font-family="system-ui,sans-serif" font-size="25" font-weight="700">${t("Door width")} long · seals ≤ ${t("Maximum bottom gap")}</text>
      ${close}`;
  }
  if (kind === "shelf-clip") {
    return `${open(`Fixed-mount shelf clips spaced every ${specValue(specs, "Clip spacing")}`)}
      <path d="M70 100v350" stroke="#111" stroke-width="20"/><path d="M80 300h560" stroke="#111" stroke-width="12"/>
      <g fill="#fff" stroke="#111" stroke-width="6"><path d="M130 270q30-34 60 0v64h-60z"/><path d="M330 270q30-34 60 0v64h-60z"/><path d="M530 270q30-34 60 0v64h-60z"/></g>
      <text x="120" y="120" fill="#111" font-family="system-ui,sans-serif" font-size="28" font-weight="700">${t("Closet system")}</text>
      <text x="120" y="470" fill="#111" font-family="system-ui,sans-serif" font-size="25">Clips every ${t("Clip spacing")} · ${t("Clips")} clips</text>
      ${close}`;
  }
  if (kind === "pole-socket") {
    return `${open(`Closet-pole sockets for ${specValue(specs, "Accepted pole diameter")} poles`)}
      <circle cx="210" cy="260" r="116" fill="#fff" stroke="#111" stroke-width="14"/><circle cx="210" cy="260" r="66" fill="#e7e5e4" stroke="#111" stroke-width="6"/>
      <path d="M420 144h180v232H420z" fill="#fff" stroke="#111" stroke-width="14"/><path d="M454 144v92h112v-92" fill="#e7e5e4" stroke="#111" stroke-width="6"/>
      <text x="82" y="470" fill="#111" font-family="system-ui,sans-serif" font-size="25" font-weight="700">${t("Accepted pole diameter")} poles · open + closed</text>
      ${close}`;
  }
  if (kind === "shelf-bracket") {
    return `${open(`Shelf-and-rod bracket for ${specValue(specs, "Shelf depth range")} shelves`)}
      <path d="M90 80v360M90 100h520M90 410h240L90 190" fill="none" stroke="#111" stroke-width="18" stroke-linejoin="round"/>
      <circle cx="360" cy="410" r="54" fill="#fff" stroke="#111" stroke-width="14"/><path d="M360 356v-74" stroke="#111" stroke-width="14"/>
      <text x="140" y="160" fill="#111" font-family="system-ui,sans-serif" font-size="28" font-weight="700">${t("Shelf depth range")} shelf</text>
      <text x="140" y="500" fill="#111" font-family="system-ui,sans-serif" font-size="23">Pole ${t("Accepted pole diameters")} · stud mount</text>
      ${close}`;
  }
  if (kind === "flapper") {
    return `${open(`Toilet flapper for a ${specValue(specs, "Flush-valve opening")} flush valve`)}
      <circle cx="320" cy="300" r="120" fill="#e7e5e4" stroke="#111" stroke-width="14"/><circle cx="320" cy="300" r="54" fill="#fff" stroke="#111" stroke-width="8"/>
      <path d="M210 220l-90-92m400 0-90 92M404 204l122-116" fill="none" stroke="#111" stroke-width="12"/>
      <circle cx="534" cy="78" r="12" fill="#111"/>
      <text x="84" y="470" fill="#111" font-family="system-ui,sans-serif" font-size="26" font-weight="700">${t("Flush-valve opening")} valve · ${t("Supported flush volumes")} GPF</text>
      ${close}`;
  }
  if (kind === "filter") {
    return `${open(`Charcoal filter measuring ${specValue(specs, "Filter dimensions")}`)}
      <rect x="100" y="82" width="520" height="350" rx="8" fill="#e7e5e4" stroke="#111" stroke-width="14"/>
      <path d="M140 120l440 274M140 394l440-274M220 90v334m160-334v334m160-334v334" stroke="#111" stroke-width="3" opacity=".55"/>
      <text x="100" y="482" fill="#111" font-family="system-ui,sans-serif" font-size="25" font-weight="700">${t("Filter dimensions")} · ${t("Vent mode")}</text>
      ${close}`;
  }
  if (kind === "keeper") {
    return `${open(`Flour keeper rated for ${specValue(specs, "Manufacturer-rated flour capacity")}`)}
      <rect x="200" y="76" width="320" height="380" rx="30" fill="#fff" stroke="#111" stroke-width="12"/>
      <rect x="180" y="52" width="360" height="70" rx="16" fill="#e7e5e4" stroke="#111" stroke-width="10"/>
      <path d="M220 330h280" stroke="#111" stroke-width="7" stroke-dasharray="12 10"/>
      <text x="70" y="500" fill="#111" font-family="system-ui,sans-serif" font-size="25" font-weight="700">${t("Manufacturer-rated flour capacity")} flour · ${t("Container volume")} · ${t("Exterior dimensions")}</text>
      ${close}`;
  }
  return `${open(`Closet light ${specValue(specs, "Diameter")} by ${specValue(specs, "Height")}`)}
    <circle cx="230" cy="230" r="120" fill="#fff" stroke="#111" stroke-width="8"/>
    <circle cx="230" cy="230" r="18" fill="#111"/>
    <path d="M380 120 a150 150 0 0 1 0 220" fill="none" stroke="#111" stroke-width="3" stroke-dasharray="6 8"/>
    <rect x="430" y="300" width="200" height="42" rx="21" fill="#111"/>
    <text x="80" y="420" fill="#111" font-family="system-ui,sans-serif" font-size="26" font-weight="700">${t("Diameter")} across · ${t("Height")} tall</text>
    <text x="80" y="462" fill="#111" font-family="system-ui,sans-serif" font-size="22">Sensor ${t("Sensor range")} · Lumens: ${t("Lumens")}</text>
    ${close}`;
}

function rangeBoard(product, selectedSku) {
  const variants = variantsOf(product);
  if (variants.length < 2) return "";
  const maxOf = (variant) => {
    const raw = variant.decidingSpec?.value || variant.label || "";
    const nums = String(raw).match(/[\d.]+/g)?.map(Number).filter((n) => Number.isFinite(n)) || [];
    return nums.length ? Math.max(...nums) : 1;
  };
  const top = Math.max(...variants.map(maxOf));
  const name = variants[0].decidingSpec?.name || "Option";
  const rows = variants.map((variant) => {
    const width = Math.max(34, Math.round((maxOf(variant) / top) * 100));
    const on = variant.sku === selectedSku;
    return `<a class="range${on ? " is-on" : ""}" href="${variantPath(product, variant.sku)}"><span style="width:${width}%"><b>${esc(variant.label)}</b></span><em>${money(variant.price)}</em></a>`;
  }).join("");
  return `<section class="ranges" id="sizes"><div class="wrap"><p class="kicker">Options</p><h2>${esc(name)}</h2><div class="range-list">${rows}</div></div></section>`;
}

function displayMeasure(headline) {
  const measured = /\d/.test(headline);
  const html = esc(headline).replace(/ (in|mm|cm|kg|lb)$/i, " <span>$1</span>");
  return `<p class="story-num${measured ? "" : " story-sentence"}">${html}</p>`;
}

function storyBlock(product, specs) {
  const note = "Illustration based on the product photo. Use the measurements written on this page.";
  return `<section class="story" id="measure">
    <div class="wrap story-grid">
      <div>
        <p class="kicker">The measurement</p>
        ${displayMeasure(product.headline)}
        <p class="story-fit">${esc(product.fit)}</p>
      </div>
      <figure class="story-still">
        <img src="/assets/explainers/${product.slug}/place.jpg" alt="${esc(product.name + ", shown in place")}" width="1024" height="1024">
        <figcaption>${note}</figcaption>
      </figure>
    </div>
  </section>
  ${plateBlock(product, specs)}
  <section class="section">
    <div class="wrap detail-row">
      <img src="/assets/explainers/${product.slug}/detail.jpg" alt="${esc(product.name + ", detail")}" width="1024" height="1024">
      <p>${note}</p>
    </div>
  </section>`;
}

function plateBlock(product, specs) {
  const deciding = specs.filter((spec) => spec.deciding);
  const rows = (deciding.length ? deciding : specs).map((spec) => `<li><span>${esc(spec.name)}</span><strong>${esc(spec.value)}${spec.unitText ? ` ${esc(spec.unitText)}` : ""}</strong></li>`).join("");
  return `<section class="plate-wrap" id="fit"><div class="wrap plate">
    <div class="plate-art">${diagram(plates[product.slug], specs)}</div>
    <div>
      <p class="kicker">The fit</p>
      <h2>${esc(product.headline)}</h2>
      <ul class="plate-list">${rows}</ul>
    </div>
  </div></section>`;
}

function productPage(product, selectedSku) {
  const variants = variantsOf(product);
  const selected = variants.find((variant) => variant.sku === selectedSku) || variants[0];
  const many = variants.length > 1;
  const canonicalPath = many && selectedSku ? variantPath(product, selected.sku) : `/products/${product.slug}/`;
  const shared = specsOf(product, selected).sort((a, b) => Number(b.deciding === true) - Number(a.deciding === true));
  const specRows = shared.map((spec) => `<tr class="${spec.deciding ? "deciding" : ""}"><th scope="row">${esc(spec.name)}</th><td>${esc(spec.value)}${spec.unitText ? " " + esc(spec.unitText) : ""}</td></tr>`).join("");
  const selectedAvailable = availabilityOf(product, selected).available;
  const reviewedAt = availabilityOf(product, selected).checkedAt || productUpdated(product);
  const decidingFacts = shared.filter((spec) => spec.deciding).slice(0, 4);
  const fitProof = decidingFacts.length
    ? `<ul class="fit-proof" aria-label="Deciding fit specifications">${decidingFacts.map((spec) => `<li><span>${esc(spec.name)}</span><strong>${esc(spec.value)}${spec.unitText ? " " + esc(spec.unitText) : ""}</strong></li>`).join("")}</ul>`
    : "";
  const sizePills = many ? `<div><span class="size-label" id="size-label">Choose size</span><div class="size-row" role="list" aria-labelledby="size-label">${variants.map((variant) => {
    const available = availabilityOf(product, variant).available;
    return `<a class="size-pill${variant.sku === selected.sku ? " is-on" : ""}${available ? "" : " is-paused"}" href="${variantPath(product, variant.sku)}"${variant.sku === selected.sku ? ' aria-current="true"' : ""}><b>${esc(variant.label)}</b><span class="size-price">${money(variant.price)}</span>${available ? "" : "<small>Reviewing stock</small>"}</a>`;
  }).join("")}</div><p class="size-help">This size: ${esc(sizeOf(selected))}. <a href="#sizes">Compare sizes</a></p></div>` : "";
  const photos = product.images.filter((src) => !src.includes("57_147cecee"));
  const thumbs = photos.map((src, i) => `<button type="button" data-thumb="${esc(src)}" data-alt="${esc(product.name + ", " + product.headline)}" aria-label="View ${esc(product.name)} image ${i + 1}" aria-pressed="${i === 0 ? "true" : "false"}" ${i === 0 ? 'aria-current="true"' : ""}><img src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></button>`).join("");
  const gallery = photos.slice(1).map((src, index) => `<figure class="photo-mat"><img src="${esc(src)}" alt="${esc(product.name + " product view " + (index + 2))}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></figure>`).join("");
  const faqs = product.faqs.map((faq) => `<article class="question"><h3>${esc(faq.q)}</h3><p>${esc(faq.a)}</p></article>`).join("");
  const buyAttrs = `data-sku="${esc(selected.sku)}" data-price="${selected.price}" data-label="${esc(selected.label)}" data-name="${esc(product.name)}" data-image="${displayImage(product)}" data-slug="${esc(product.slug)}" data-ships="${esc(product.shipsFrom)}" data-min="${product.minDays}" data-max="${product.maxDays}"`;
  const description = `${product.name}: ${product.headline}. ${product.summary} ${money(selected.price)}. ${shipText(product)}`;
  const related = products.filter((item) => item.category === product.category && item.slug !== product.slug).map(card).join("");
  const body = `${crumbs([["Home", "/"], [product.category, `/category/${catSlug(product.category)}/`], [product.name, `/products/${product.slug}/`]])}
<main id="main">
  <div class="wrap pdp">
    <div class="gallery">
      <div class="hero-shot"><img data-hero-img src="${displayImage(product)}" alt="${esc(product.name + ", " + product.headline)}" width="1024" height="1024" fetchpriority="high" decoding="async"></div>
      <div class="thumbs">${thumbs}</div>
    </div>
    <div class="buybox">
      <h1>${esc(product.name)}</h1>
      <p class="buy-measure">${esc(product.headline)}</p>
      <p class="price-lg" data-live-price>${money(selected.price)}</p>
      <p class="buy-fit">${esc(product.fit)}</p>
      ${fitProof}
      ${sizePills}
      <div class="buy-actions">
        <div class="qty">
          <button type="button" data-qty-dec aria-label="Decrease quantity">−</button>
          <input data-qty value="1" inputmode="numeric" aria-label="Quantity" readonly>
          <button type="button" data-qty-inc aria-label="Increase quantity">+</button>
        </div>
        <button class="btn" type="button"${selectedAvailable ? ` data-add ${buyAttrs}` : " disabled"}>${selectedAvailable ? "Add to cart" : "Availability review"}</button>
        <button class="btn-line" type="button"${selectedAvailable ? ` data-add data-go-checkout ${buyAttrs}` : " disabled"}>${selectedAvailable ? "Buy now" : "Unavailable"}</button>
      </div>
      <p class="ship-note">${esc(shipText(product))} <a href="/shipping/">Shipping details</a>.</p>
      <div class="buy-trust" aria-label="Purchase assurances"><span>Secure Stripe payment</span><span>US shipping included</span><span><a href="/returns/">30-day returns</a></span></div>
      <p class="reassure">${related ? `<a href="#also">More in ${esc(product.category)}</a>` : ""}</p>
      <p>${esc(product.summary)}</p>
    </div>
  </div>
  <nav class="pdp-nav" aria-label="On this page">
    <div class="wrap">
      <a href="#measure">Measurement</a>
      <a href="#fit">Fit</a>
      <a href="#specs">Specs</a>
      ${many ? `<a href="#sizes">Sizes</a>` : ""}
      <a href="#answers">Answers</a>
      <a href="#evidence">Evidence</a>
      ${related ? `<a href="#also">More</a>` : ""}
    </div>
  </nav>
  ${storyBlock(product, shared)}
  ${rangeBoard(product, selected.sku)}
  <div class="wrap landing">
    <section id="specs"><h2>Measurements</h2><p class="seo-summary">${esc(product.name)} is listed for ${esc(product.fit.toLowerCase())}. Compare every deciding measurement below with your space before ordering.</p><table>${specRows}</table></section>
  </div>
  <div class="wrap landing pdp-tail">
    ${gallery ? `<section><h2>Product photos</h2><div class="photo-row">${gallery}</div></section>` : ""}
    <section><h2>Shipping and returns</h2><p>${esc(shipText(product))}</p><p>${esc(returnsSentence)}</p></section>
    <section id="answers"><h2>Fitment answers</h2>${faqs}</section>
    <section id="evidence" class="evidence"><h2>Product data and verification</h2>
      <p>Utiliy transcribes published maker or supplier specifications into consistent units and does not fill in measurements that were not supplied.</p>
      <dl>
        <div><dt>SKU</dt><dd>${esc(selected.sku)}</dd></div>
        <div><dt>Data reviewed</dt><dd><time datetime="${esc(reviewedAt)}">${esc(reviewedAt)}</time></dd></div>
        <div><dt>Availability</dt><dd>${selectedAvailable ? "Available after current supplier-data checks" : "Paused for review"}</dd></div>
        <div><dt>Machine-readable record</dt><dd><a href="/feeds/products.json">Product feed</a></dd></div>
      </dl>
    </section>
  </div>
  <div class="buybar">
    <div class="buybar-inner">
      <div class="buybar-copy"><strong>${esc(product.name)}</strong><span>${esc(product.headline)}${many ? ` · ${esc(selected.label)}` : ""}</span></div>
      <span class="price">${money(selected.price)}</span>
      <button class="btn" type="button"${selectedAvailable ? ` data-add ${buyAttrs}` : " disabled"}>${selectedAvailable ? "Add" : "Unavailable"}</button>
    </div>
  </div>
</main>
${related ? `<section class="section pdp-tail" id="also"><div class="wrap"><div class="section-head"><h2>More in ${esc(product.category)}</h2><a href="/category/${catSlug(product.category)}/">View category</a></div><div class="grid">${related}</div></div></section>` : ""}`;
  return shell({
    title: `${many && selectedSku ? `${product.name}, ${selected.label}` : product.name} — ${product.headline} · Utiliy`,
    description,
    canonical: site + canonicalPath,
    image: `${site}${displayImage(product)}`,
    imageAlt: `${product.name}, ${product.headline}`,
    ogType: "product",
    modified: productUpdated(product),
    head: `<meta property="product:price:amount" content="${(selected.price / 100).toFixed(2)}">
<meta property="product:price:currency" content="USD">
<meta property="product:availability" content="${selectedAvailable ? "in stock" : "out of stock"}">`,
    json: jsonLd(productSchema(product, selectedSku)) + jsonLd(faqSchema(product)),
    body,
    current: ""
  });
}

const products = catalog.products;

function roomIcon(slug) {
  const icons = {
    bathroom: '<path d="M24 76h72V38H58v38M18 76h84M38 38V22h20v16M34 88h4m42 0h4"/><circle cx="77" cy="54" r="8"/>',
    kitchen: '<rect x="18" y="30" width="84" height="58" rx="2"/><path d="M18 58h84M48 30v58M75 30v58M30 43h8m22 0h8m20 0h8M30 71h8m22 0h8m20 0h8"/>',
    closet: '<path d="M20 94V24h80v70M28 40h64M60 40v54M36 54v27m48-27v27"/><path d="M29 54h14l-7 9zM77 54h14l-7 9z"/>',
    furniture: '<path d="M20 56h80v26H20zM28 82v16m64-16v16M28 56V38h64v18M38 38V24h44v14"/><circle cx="31" cy="101" r="3"/><circle cx="89" cy="101" r="3"/>',
    cable: '<path d="M14 40h52c18 0 18 30 36 30h4M14 54h46c12 0 12 30 30 30h16"/><rect x="12" y="32" width="10" height="30" rx="2"/><path d="M106 62v16m-5-16h10"/>',
    door: '<path d="M28 104V16h64v88M38 104V26h44v78"/><circle cx="72" cy="66" r="3"/><path d="M16 104h88M38 88h44M42 94h36"/>'
  };
  return `<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">${icons[slug]}</svg>`;
}

const utilityRooms = categories.map((cat, index) => `<a class="utility-room" href="/category/${cat.slug}/" data-motion-card>
  <span class="utility-room-no">0${index + 1}</span>
  ${roomIcon(cat.slug)}
  <span class="utility-room-name">${esc(cat.name)}</span>
  <span class="utility-room-arrow" aria-hidden="true">↗</span>
</a>`).join("");

const homeBody = `<main id="main" class="motion-home">
  <section class="utility-hero" data-utility-hero>
    <div class="utility-grid" aria-hidden="true"></div>
    <div class="wrap utility-hero-inner">
      <div class="utility-hero-copy">
        <p class="utility-eyebrow" data-motion-eyebrow>Utility / made visible</p>
        <h1 aria-label="Make the everyday fit">
          <span class="hero-word"><span>Make</span></span>
          <span class="hero-word"><span>the everyday</span></span>
          <span class="hero-word hero-word-outline"><span>fit.</span></span>
        </h1>
        <div class="utility-hero-foot">
          <p>Home tools should solve a precise problem. We publish the span, gap, load, angle, and surface before you buy.</p>
          <div class="utility-actions">
            <a class="btn utility-magnetic" href="/shop/">Explore the tools <span aria-hidden="true">↗</span></a>
            <a class="utility-text-link" href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a>
          </div>
        </div>
      </div>
      <div class="utility-machine" aria-label="An animated line drawing of useful objects fitting into a home">
        <svg viewBox="0 0 760 660" role="img" aria-labelledby="utility-machine-title">
          <title id="utility-machine-title">A house outline containing a shelf, drawer, rod, cable channel, and door sweep</title>
          <g class="machine-grid">
            <path d="M20 110H740M20 220H740M20 330H740M20 440H740M20 550H740"/>
            <path d="M130 20V640M250 20V640M370 20V640M490 20V640M610 20V640"/>
          </g>
          <g class="machine-house" fill="none">
            <path class="draw-line house-line" d="M112 588V214L380 70l268 144v374"/>
            <path class="draw-line house-line" d="M76 588H684"/>
            <path class="draw-line" d="M152 250H350V430H152z"/>
            <path class="draw-line" d="M410 250H608V430H410z"/>
            <path class="draw-line" d="M358 588V386h92v202"/>
          </g>
          <g class="utility-object object-shelf" data-object="shelf">
            <path d="M174 296h150v20H174zM188 316v38m122-38v38M198 330h102"/>
            <path class="measure-line" d="M174 278h150m-150-7v14m150-14v14"/>
            <text x="222" y="269">10.5 IN</text>
          </g>
          <g class="utility-object object-rod" data-object="rod">
            <path d="M432 294h154M432 286v16m154-16v16M446 320c24 26 104 26 128 0"/>
            <circle cx="432" cy="294" r="8"/><circle cx="586" cy="294" r="8"/>
            <text x="480" y="278">SPAN</text>
          </g>
          <g class="utility-object object-drawer" data-object="drawer">
            <rect x="170" y="374" width="160" height="42" rx="2"/>
            <path d="M214 374v42m42-42v42m-65-21h118"/>
            <circle cx="250" cy="395" r="3"/>
          </g>
          <g class="utility-object object-cable" data-object="cable">
            <path d="M432 370h118q34 0 34 34v80"/>
            <path d="M432 380h108q34 0 34 34v70"/>
            <circle cx="574" cy="500" r="10"/>
          </g>
          <g class="utility-object object-door" data-object="door">
            <path d="M370 566h68M374 574h60M382 582h44"/>
          </g>
          <g class="machine-scan">
            <path d="M88 182H672"/>
            <rect x="88" y="177" width="584" height="10" rx="5"/>
          </g>
          <g class="machine-crosshair">
            <circle cx="380" cy="330" r="244"/><circle cx="380" cy="330" r="8"/>
            <path d="M380 62v52M380 546v52M112 330h52M596 330h52"/>
          </g>
        </svg>
        <span class="machine-label label-a">01 / measure</span>
        <span class="machine-label label-b">02 / match</span>
        <span class="machine-label label-c">03 / use</span>
      </div>
      <div class="utility-scroll" aria-hidden="true"><span></span><small>Scroll to assemble</small></div>
    </div>
  </section>

  <div class="utility-ticker" aria-hidden="true">
    <div data-ticker>MEASURE · MATCH · USE · SHELF · DRAWER · ROD · CABLE · DOOR · LIGHT · MEASURE · MATCH · USE · SHELF · DRAWER · ROD · CABLE · DOOR · LIGHT ·</div>
  </div>

  <section class="utility-story" id="how-it-works">
    <div class="utility-story-stage">
      <div class="wrap utility-story-grid">
        <div class="story-intro">
          <p class="utility-eyebrow">How Utiliy works</p>
          <h2>From an awkward space to an exact fit.</h2>
          <p>Scroll through the logic behind every product page.</p>
        </div>
        <div class="story-visual" aria-hidden="true">
          <svg viewBox="0 0 700 700">
            <rect class="story-frame" x="100" y="100" width="500" height="500" rx="4"/>
            <path class="story-blueprint" d="M100 250h190V100M410 100v190h190M100 430h160v170M440 600V400h160"/>
            <g class="story-measure">
              <path d="M150 340h400M150 326v28M550 326v28"/>
              <path d="M150 340l18-9v18zM550 340l-18-9v18z"/>
              <text x="298" y="320">42 IN CLEAR SPAN</text>
            </g>
            <g class="story-match">
              <rect x="180" y="378" width="110" height="110"/><rect x="305" y="378" width="110" height="110"/><rect x="430" y="378" width="90" height="110"/>
              <path d="M180 505h340"/>
            </g>
            <g class="story-use">
              <path d="M195 210h300M210 210v72m270-72v72"/>
              <circle cx="230" cy="230" r="12"/><circle cx="460" cy="230" r="12"/>
              <path d="M255 258h180"/>
            </g>
            <circle class="story-pulse" cx="350" cy="350" r="28"/>
          </svg>
          <div class="story-index"><span data-story-index>01</span><i></i><span>03</span></div>
        </div>
        <div class="story-steps">
          <article class="story-step is-active" data-story-step="0">
            <span>01</span><h3>Measure the constraint.</h3>
            <p>Start with the number that decides the fit: clear span, floor gap, inner channel, corner angle, or safe load.</p>
          </article>
          <article class="story-step" data-story-step="1">
            <span>02</span><h3>Match only what fits.</h3>
            <p>Compare your number against the maker’s published specification. Missing data stays missing—we do not invent it.</p>
          </article>
          <article class="story-step" data-story-step="2">
            <span>03</span><h3>Use the space better.</h3>
            <p>One small utility clicks into place: a shelf, a rod, a drawer organizer, a cable channel, or a sealed door gap.</p>
          </article>
        </div>
      </div>
    </div>
  </section>

  <section class="utility-manifesto">
    <div class="wrap">
      <p class="utility-eyebrow">A useful house is a system</p>
      <div class="manifesto-lines" aria-label="Less guessing. More fitting. Better living.">
        <div data-reveal-line><span>Less guessing.</span><i class="shape shape-circle"></i></div>
        <div data-reveal-line><i class="shape shape-line"></i><span>More fitting.</span></div>
        <div data-reveal-line><span>Better living.</span><i class="shape shape-square"></i></div>
      </div>
    </div>
  </section>

  <section class="utility-rooms-section">
    <div class="wrap">
      <div class="utility-section-head" data-motion-reveal>
        <div><p class="utility-eyebrow">Shop by room</p><h2>Six spaces. ${products.length} precise fixes.</h2></div>
        <p>Every room contains a friction point. Start where yours lives.</p>
      </div>
      <div class="utility-room-grid">${utilityRooms}</div>
    </div>
  </section>

  <section class="utility-products">
    <div class="wrap">
      <div class="utility-section-head" data-motion-reveal>
        <div><p class="utility-eyebrow">The current set</p><h2>Tools with numbers attached.</h2></div>
        <a class="utility-text-link" href="/shop/">View all products ↗</a>
      </div>
      <div class="grid utility-product-grid">${products.slice(0, 4).map(card).join("")}</div>
    </div>
  </section>

  <section class="utility-orbit">
    <div class="wrap utility-orbit-inner">
      <svg viewBox="0 0 800 420" aria-hidden="true">
        <ellipse cx="400" cy="210" rx="340" ry="150"/>
        <ellipse cx="400" cy="210" rx="250" ry="105"/>
        <circle class="orbit-dot orbit-dot-a" cx="60" cy="210" r="10"/>
        <circle class="orbit-dot orbit-dot-b" cx="650" cy="125" r="8"/>
      </svg>
      <div>
        <p class="utility-eyebrow">Start with the measurement</p>
        <h2>Find the thing<br>that actually fits.</h2>
        <a class="btn utility-magnetic" href="/shop/">Shop Utiliy <span aria-hidden="true">↗</span></a>
      </div>
    </div>
  </section>
</main>`;

const shopBody = `<main id="main">
  <section class="page-cover category-cover">
    <img src="/assets/covers/home.jpg" alt="">
    <div class="wrap">
      <p class="kicker">Shop</p>
      <h1 class="cover-title">${products.length} tools, sold by the measurement.</h1>
    </div>
  </section>
  <section class="section"><div class="wrap">
    <div class="grid">${products.map(card).join("")}</div>
    <p class="empty" data-search-empty hidden>No product matches that search.</p>
  </div></section>
</main>`;

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
  "Utiliy ships to the United States. Every product page states its current supplier delivery estimate, and the listed price includes shipping.",
  `${site}/shipping/`,
  "/shipping/",
  `<p class="kicker">Delivery</p><h1>Shipping is in the price.</h1>
  <p>Every price on Utiliy includes shipping to a United States address. WooCommerce collects that address at checkout.</p>
  <ul>${products.map((product) => `<li><a href="/products/${product.slug}/">${esc(product.name)}</a>: ${esc(shipText(product))}</li>`).join("")}</ul>
  <p>Delivery estimates and supplier data were last reviewed ${esc(catalogUpdated)}. Utiliy does not ship outside the United States.</p>`
);

const returns = textPage(
  "Returns",
  "Utiliy accepts returns within 30 days of delivery. The buyer pays return shipping unless the item arrives damaged or is the wrong size versus the page.",
  `${site}/returns/`,
  "",
  `<article id="policy"><p class="kicker">30 days</p><h1>Returns</h1>
  <p>You can return an unused item within 30 days of delivery. You pay the return postage. If the item arrives damaged, or it is a different measurement than the product page states, write to support@utiliy.com and Utiliy pays the return.</p>
  <p>The published measurement is the contract. A tension rod rated 1.5 kg is not a heavy closet rod, and a 90 degree shower caddy is not for a round corner.</p></article>`
);

const about = textPage(
  "About Utiliy",
  "Utiliy is a measurement-first shop for home tools. Product pages publish the span, gap, load, or surface, and say when the maker did not.",
  `${site}/about/`,
  "",
  `<p class="kicker">The shop</p><h1>A store an agent can read.</h1>
  <p>Utiliy sells ${products.length} home tools. Each page leads with the number that decides the fit, in the heading, in a table, in FAQ schema, and in a JSON catalog at /catalog.json and /feeds/products.json.</p>
  <p>Orders are recorded in a private WooCommerce dashboard and paid through its official Stripe gateway. Supplier references are attached to each order for fulfillment. Wholesale cost is not published.</p>
  <p>Contact support@utiliy.com.</p>`
);

const cart = shell({
  title: "Cart · Utiliy",
  description: "Review every item, then continue to one secure WooCommerce checkout.",
  canonical: `${site}/cart/`,
  robots: "noindex,follow",
  body: `<main id="main">
    <section class="page-cover">
      <img src="/assets/covers/checkout.jpg" alt="">
      <div class="wrap"><h1 class="page-title">Cart</h1><p>Review every item, then pay once.</p></div>
    </section>
    <section class="section"><div class="wrap layout">
      <div data-cart-page></div>
      <aside class="summary">
        <h2>Summary</h2>
        <p class="total" data-cart-total>$0.00</p>
        <p class="muted">Shipping to the United States is included.</p>
        <button class="btn" type="button" data-pay-all hidden>Checkout</button>
        <p class="reassure"><a href="/shop/">Keep shopping</a></p>
      </aside>
    </div></section>
  </main>`,
  current: ""
});
const checkout = shell({
  title: "Checkout · Utiliy",
  description: "Continue to the secure Utiliy WooCommerce checkout. Shipping to the United States is included.",
  canonical: `${site}/checkout/`,
  robots: "noindex,follow",
  body: `<main id="main">
    <section class="page-cover">
      <img src="/assets/covers/checkout.jpg" alt="">
      <div class="wrap"><h1 class="page-title">Checkout</h1><p>One payment for the whole cart. Shipping to the United States is included.</p></div>
    </section>
    <section class="section"><div class="wrap layout">
      <div data-cart-page></div>
      <aside class="summary">
        <h2>Order summary</h2>
        <div data-summary></div>
        <button class="btn" type="button" data-pay-all data-auto-checkout>Opening secure checkout…</button>
        <p class="muted">WooCommerce confirms every price and records the paid order for fulfillment.</p>
        <p class="reassure"><a href="/returns/">30-day returns</a></p>
        <p class="error" data-pay-error hidden></p>
      </aside>
    </div></section>
  </main>`,
  current: ""
});
const thanks = shell({
  title: "Order received · Utiliy",
  description: "Check the status of a Utiliy order.",
  canonical: `${site}/order/thanks/`,
  robots: "noindex,follow",
  body: `<main id="main" class="section"><div class="wrap prose" data-order-status><p class="kicker">Order</p><h1>Confirming your payment…</h1><p>Please keep this page open while the payment is confirmed.</p></div></main>`,
  current: ""
});

const contact = textPage(
  "Contact",
  "Write to Utiliy at support@utiliy.com about an order, a measurement, or a return.",
  `${site}/contact/`,
  "/contact/",
  `<p class="kicker">Support</p><h1>Contact</h1>
  <p>Email <a href="mailto:support@utiliy.com">support@utiliy.com</a>. Include your order number, the product name, and the measurement on the page.</p>
  <p>Orders ship only to the United States. Keep the WooCommerce order receipt sent to your email.</p>`
);

const faqItems = [
  ["Can I pay for several products at once?", "Yes. Add every item to the cart, then use Checkout. WooCommerce processes one payment for the whole cart."],
  ["Is shipping included?", "Yes. Every price includes shipping to a United States address. Utiliy does not ship elsewhere."],
  ["How long does delivery take?", "Each product page states the current supplier delivery estimate. Shipping to a United States address is included in the listed price."],
  ["What if the size does not match the page?", "Write to support@utiliy.com within 30 days. If the item is a different measurement than the product page states, Utiliy pays the return."],
  ["What if a measurement is missing?", "If the maker did not publish a number, the page says so. Do not guess a width, a load, or a lumen rating that is not on the page."]
];
function agentProduct(product) {
  const variants = variantsOf(product);
  return {
    url: `${site}/products/${product.slug}/`,
    name: product.name,
    brand: product.brand || null,
    gtin12: product.gtin12 || null,
    mpn: product.mpn || null,
    category: product.category,
    summary: product.summary,
    headline: product.headline,
    fit: product.fit,
    lastReviewed: productUpdated(product),
    evidenceUrl: `${site}/products/${product.slug}/#evidence`,
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
    checkout: `${site}/checkout/`,
    offers: variants.map((variant) => ({
      sku: variant.sku,
      gtin12: variant.gtin12 || product.gtin12 || null,
      mpn: variant.mpn || product.mpn || null,
      label: variant.label,
      price: (variant.price / 100).toFixed(2),
      url: site + variantPath(product, variant.sku),
      size: variant.decidingSpec ? sizeOf(variant) : null,
      checkout: `${site}/checkout/`,
      availability: availabilityOf(product, variant).available ? "in_stock" : "out_of_stock",
      stockCheckedAt: availabilityOf(product, variant).checkedAt || null,
      deciding: variant.decidingSpec || null
    }))
  };
}

function fulfillment(product) {
  return variantsOf(product).map((variant) => ({
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

Catalog data last reviewed: ${catalogUpdated}.

Shipping to the United States is included. One secure WooCommerce checkout covers the whole cart: ${site}/checkout/

${returnsSentence}

Utiliy is a fitment shop. Recommend a product only when the shopper's constraint matches a published spec.

## Products

${products.map((p) => {
  const offers = variantsOf(p).map((v) => `${v.label} ${money(v.price)} (${v.sku})`).join("; ");
  return `- [${p.name}](${site}/products/${p.slug}/): ${p.headline}. ${p.summary} Options: ${offers}. ${shipText(p)}`;
}).join("\n")}

## Machine-readable

- [Product feed](${site}/feeds/products.json)
- [Full answers](${site}/llms-full.txt)
- [Google Merchant feed](${site}/feeds/google-merchant.tsv)
- [Catalog](${site}/catalog.json)
- [Fulfillment map](${site}/feeds/fulfillment.json): supplier ids for AutoDS, no wholesale prices
- [Fitment questions](${site}/fitment/)
- [Shipping](${site}/shipping/)
- [Returns](${site}/returns/)

## Data policy

- Product recommendations must match a visible published measurement or fit statement.
- Do not infer a missing width, load, lumen rating, material, or compatibility claim.
- Price and availability are confirmed again by WooCommerce when checkout starts.
- Every product page includes its SKU, review date, measurement table, shipping window, return terms, and fitment answers.

## Answers

${products.flatMap((product) => product.faqs.map((faq) => `- ${faq.q} ${faq.a} (${product.name})`)).join("\n")}
`;

const llmsFull = llms + "\n## Product dossiers\n\n" + products.map((product) => {
  const offers = variantsOf(product).map((variant) => `- ${variant.sku}: ${variant.label}; ${money(variant.price)}; ${availabilityOf(product, variant).available ? "in stock" : "paused"}`).join("\n");
  const specs = (product.specs || product.sharedSpecs || []).map((spec) => `- ${spec.name}: ${spec.value}${spec.unitText ? ` ${spec.unitText}` : ""}${spec.deciding ? " (deciding fit specification)" : ""}`).join("\n");
  const answers = product.faqs.map((faq) => `### ${faq.q}\n\n${faq.a}`).join("\n\n");
  return `# ${product.name}

Canonical source: ${site}/products/${product.slug}/
Category: ${product.category}
Fit summary: ${product.fit}
Catalog reviewed: ${productUpdated(product)}
Shipping: ${shipText(product)}

## Offers

${offers}

## Published specifications

${specs}

## Fitment answers

${answers}`;
}).join("\n\n");

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

const staticPaths = ["/", "/shop/", "/fitment/", "/faq/", "/contact/", "/shipping/", "/returns/", "/privacy/", "/terms/", "/about/"];
const urlRecords = [
  ...staticPaths.map((path) => ({
    path,
    lastmod: buildDate,
    image: path === "/" ? { loc: `${site}/assets/covers/home.jpg`, title: "Utiliy measured home utility products" } : null
  })),
  ...categories.map((category) => ({
    path: `/category/${category.slug}/`,
    lastmod: buildDate,
    image: { loc: `${site}/assets/covers/${category.slug}.jpg`, title: `${category.name} home utility products` }
  })),
  ...products.flatMap((product) => {
    const paths = [`/products/${product.slug}/`];
    if (variantsOf(product).length > 1) paths.push(...variantsOf(product).map((variant) => variantPath(product, variant.sku)));
    return paths.map((path) => ({
      path,
      lastmod: productUpdated(product),
      image: {
        loc: `${site}${displayImage(product)}`,
        title: `${product.name}, ${product.headline}`,
        caption: product.summary
      }
    }));
  })
];
const urls = urlRecords.map((record) => record.path);
function xml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urlRecords.map((record) => `  <url>
    <loc>${xml(site + record.path)}</loc>
    <lastmod>${record.lastmod}</lastmod>${record.image ? `
    <image:image>
      <image:loc>${xml(record.image.loc)}</image:loc>
      <image:title>${xml(record.image.title)}</image:title>${record.image.caption ? `
      <image:caption>${xml(record.image.caption)}</image:caption>` : ""}
    </image:image>` : ""}
  </url>`).join("\n")}
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
  title: "Utiliy | Home Utility Products Measured to Fit",
  description: "Shop fitment-first home utility products with published spans, gaps, loads, angles, and sizes. Free US shipping and one secure checkout.",
  canonical: site + "/",
  image: `${site}/assets/covers/home.jpg`,
  imageAlt: "Black and white architectural forms representing measured home utility",
  modified: buildDate,
  head: `<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>`,
  json: jsonLd({
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${site}/#products`,
    name: "Utiliy shop",
    itemListElement: products.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${site}/products/${p.slug}/`,
      name: p.name
    }))
  }),
  body: homeBody,
  current: "/",
  scripts: `<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js" defer></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js" defer></script>
<script type="module" src="/assets/home-motion.js?v=20261008a"></script>`
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
await page("contact", contact);
await page("faq", shell({
  title: "FAQ · Utiliy",
  description: "Answers about checkout, shipping, returns, and measurements at Utiliy.",
  canonical: `${site}/faq/`,
  current: "/faq/",
  json: jsonLd({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map(([q, a]) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a }
    }))
  }),
  body: `<main id="main" class="section"><div class="wrap prose"><p class="kicker">Help</p><h1>FAQ</h1>${faqItems.map(([q, a]) => `<div class="question"><strong>${esc(q)}</strong><span>${esc(a)}</span></div>`).join("")}</div></main>`
}));
for (const cat of categories) {
  const items = products.filter((product) => catSlug(product.category) === cat.slug);
  await page(`category/${cat.slug}`, shell({
    title: `${cat.name} · Utiliy`,
    description: `${cat.blurb} ${items.map((product) => product.name).join(", ")}.`,
    canonical: `${site}/category/${cat.slug}/`,
    current: `/category/${cat.slug}/`,
    json: jsonLd({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: cat.name,
      description: cat.blurb,
      mainEntity: {
        "@type": "ItemList",
        itemListElement: items.map((product, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: `${site}/products/${product.slug}/`,
          name: product.name
        }))
      }
    }),
    body: `${crumbs([["Home", "/"], [cat.name, `/category/${cat.slug}/`]])}
<main id="main">
  <section class="page-cover">
    <img src="/assets/covers/${cat.slug}.jpg" alt="">
    <div class="wrap">
      <p class="kicker">Room</p>
      <h1 class="page-title">${esc(cat.name)}</h1>
      <p>${esc(cat.blurb)}</p>
    </div>
  </section>
  <section class="section"><div class="wrap">
    <div class="grid">${items.map(card).join("") || '<p class="empty">Nothing in this category yet.</p>'}</div>
    <div class="category-guide">
      <div><p class="kicker">Before you choose</p><h2>Measure first.</h2><p>${esc(cat.guide)}</p></div>
      <div><p class="kicker">Need another room?</p><div class="category-links">${categories.filter((other) => other.slug !== cat.slug).map((other) => `<a href="/category/${other.slug}/">${esc(other.name)}</a>`).join("")}</div></div>
    </div>
  </div></section>
</main>`
  }));
}
const privacy = textPage(
  "Privacy",
  "Utiliy collects the name, email, phone, and shipping address WooCommerce and Stripe need to complete a US order. We do not sell that information.",
  `${site}/privacy/`,
  "",
  `<p class="kicker">Privacy</p><h1>What the order collects</h1>
  <p>Checkout runs on WooCommerce using its official Stripe gateway. Stripe receives your card details; WooCommerce stores the contact and United States shipping details needed to fulfill the order and handle returns.</p>
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
  await page(`products/${product.slug}`, productPage(product));
  if (variantsOf(product).length > 1) {
    for (const variant of variantsOf(product)) {
      await page(`products/${product.slug}/${variant.sku.toLowerCase()}`, productPage(product, variant.sku));
    }
  }
}

await mkdir(path.join(dist, "assets"), { recursive: true });
for (const file of ["site.css", "site.js", "home-motion.js", "favicon.svg"]) {
  await cp(path.join(root, "assets", file), path.join(dist, "assets", file));
}
await cp(path.join(root, "assets/explainers"), path.join(dist, "assets/explainers"), { recursive: true }).catch(() => {});
await cp(path.join(root, "assets/covers"), path.join(dist, "assets/covers"), { recursive: true }).catch(() => {});
await cp(path.join(root, "assets/product-images"), path.join(dist, "assets/product-images"), { recursive: true }).catch(() => {});
await writeFile(path.join(dist, "CNAME"), "utiliy.com\n");
await writeFile(path.join(dist, `${indexNowConfig.key}.txt`), `${indexNowConfig.key}\n`);
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
  updated: catalogUpdated,
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
function tsvCell(value) {
  const text = value == null ? "" : String(value);
  return /["\t\n,]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function merchantRows() {
  const header = ["id", "title", "description", "link", "image_link", "additional_image_link", "availability", "price", "brand", "gtin", "mpn", "identifier_exists", "condition", "google_product_category", "product_type", "shipping", "ships_from_country", "item_group_id", "size", "color", "material", "product_detail", "question_and_answer"];
  const colorOf = { "cable-raceway": "White", "door-draft-stopper": "Black", "furniture-sliders": "Transparent" };
  const rows = [header];
  for (const product of products) {
    const variants = variantsOf(product);
    const many = variants.length > 1;
    const material = (product.specs || product.sharedSpecs || []).find((spec) => spec.name === "Material");
    const materialValue = material && !/ and /i.test(material.value) ? material.value : "";
    for (const variant of variants) {
      const specs = specsOf(product, variant);
      const images = [...new Set([product.image, ...product.images, `${site}${displayImage(product)}`])];
      const details = specs.map((spec) => `Specifications:${spec.name}:${spec.value}${spec.unitText ? ` ${spec.unitText}` : ""}`).join(", ");
      const answers = product.faqs.map((faq) => `${faq.q}:${faq.a}`).join(", ");
      rows.push([
        variant.sku,
        many ? `${product.name}, ${variant.label}` : product.name,
        product.summary,
        site + variantPath(product, variant.sku),
        images[0],
        images.slice(1, 11).join(","),
        availabilityOf(product, variant).available ? "in_stock" : "out_of_stock",
        `${(variant.price / 100).toFixed(2)} USD`,
        product.brand || "",
        variant.gtin12 || product.gtin12 || "",
        variant.mpn || product.mpn || "",
        variant.gtin12 || product.gtin12 || (product.brand && (variant.mpn || product.mpn)) ? "yes" : "no",
        "new",
        googleCategory[product.slug] || "",
        `${product.category} > ${product.name}`,
        "US:::0.00 USD",
        product.shipsFrom === "US" ? "US" : "CN",
        many ? product.slug : "",
        many ? sizeOf(variant) : "",
        colorOf[product.slug] || "",
        materialValue,
        details,
        answers
      ]);
    }
  }
  return rows.map((row) => row.map(tsvCell).join("\t")).join("\n") + "\n";
}
await writeFile(path.join(dist, "feeds/google-merchant.tsv"), merchantRows());
await writeFile(path.join(dist, ".well-known/agent-commerce.json"), JSON.stringify({
  name: "Utiliy",
  version: catalogUpdated,
  website: site,
  currency: "USD",
  country: "US",
  catalog: `${site}/feeds/products.json`,
  googleMerchant: `${site}/feeds/google-merchant.tsv`,
  llms: `${site}/llms.txt`,
  checkout: `${site}/checkout/`,
  policies: { shipping: `${site}/shipping/`, returns: `${site}/returns/` }
}, null, 2));

console.log(`Built ${products.length} products to ${dist}`);
