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
const checkoutEndpoint = await readFile(path.join(root, "catalog/checkout.json"), "utf8")
  .then((text) => JSON.parse(text).url || "")
  .catch(() => "");

const categories = [
  { slug: "bathroom", name: "Bathroom", blurb: "Corner shelves with a published size, angle, and load." },
  { slug: "kitchen", name: "Kitchen", blurb: "Drawer widths and under-sink racks." },
  { slug: "closet", name: "Closet", blurb: "Rod spans, tension loads, and closet lights." },
  { slug: "furniture", name: "Furniture", blurb: "Hardwood sliders and screw-in anchors." },
  { slug: "cable", name: "Cable", blurb: "Raceways with an inner channel you can match." },
  { slug: "door", name: "Door", blurb: "Sweeps sized to the gap under the door." }
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
  "closet-motion-light": "Home & Garden > Lighting"
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

function shell({ title, description, canonical, json, body, current, image, robots = "index,follow,max-image-preview:large,max-snippet:-1" }) {
  const catNav = categories.map((cat) => `<a href="/category/${cat.slug}/"${current === `/category/${cat.slug}/` ? ' aria-current="page"' : ""}>${esc(cat.name)}</a>`).join("");
  const footerCats = categories.map((cat) => `<li><a href="/category/${cat.slug}/">${esc(cat.name)}</a></li>`).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="${robots}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Utiliy">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ffffff">
${image ? `<meta property="og:image" content="${esc(image)}">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<link href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&f[]=clash-display@500,600,700&display=swap" rel="stylesheet">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/site.css?v=20261006j">
${jsonLd(orgGraph())}
${json || ""}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<div class="announce">Shipping to the United States is included. One Stripe checkout for the whole cart.</div>
<header class="site-header">
  <div class="wrap header-row">
    <button class="icon-btn menu-btn" type="button" data-menu aria-label="Menu">Menu</button>
    <a class="logo" href="/">Utiliy</a>
    <nav class="nav-row" aria-label="Primary">
      <a href="/shop/"${current === "/shop/" ? ' aria-current="page"' : ""}>Shop</a>
      <a href="/fitment/">Fitment</a>
    </nav>
    <form class="search" action="/shop/" method="get" role="search">
      <input data-search name="q" type="search" placeholder="Search for products..." aria-label="Search products">
    </form>
    <div class="header-actions">
      <button class="icon-btn" type="button" data-open-cart>Cart <span class="cart-count" data-cart-count>0</span></button>
    </div>
  </div>
  <div class="wrap rooms-wrap">
    <nav class="rooms" aria-label="Rooms">${catNav}</nav>
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
      <ul>${footerCats}</ul>
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
<aside class="drawer" data-drawer aria-label="Cart">
  <header><h2>Cart</h2><button class="icon-btn" type="button" data-close-cart>Close</button></header>
  <div class="lines" data-cart-lines></div>
  <div class="total" data-cart-total hidden>$0.00</div>
  <p class="muted" data-cart-go hidden>Shipping to the United States is included.</p>
  <a class="btn" href="/checkout/" data-cart-go hidden>Checkout</a>
  <a class="btn-line" href="/cart/" data-cart-go hidden>Review cart</a>
  <button class="btn-line" type="button" data-close-cart data-cart-go hidden>Keep shopping</button>
  <a class="btn-line" href="/shop/" data-cart-empty>Continue shopping</a>
</aside>
<script>window.UTILIY_CHECKOUT=${JSON.stringify(checkoutEndpoint)};</script>
<script src="/assets/site.js?v=20261006j" defer></script>
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
    "@id": `${site}/returns/#policy`,
    returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
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
    availability: "https://schema.org/InStock",
    itemCondition: "https://schema.org/NewCondition",
    hasMerchantReturnPolicy: { "@id": `${site}/returns/#policy` },
    shippingDetails: shippingDetails(product),
    seller: { "@type": "Organization", name: "Utiliy", url: site }
  };
}
function productSchema(product, selectedSku) {
  const variants = variantsOf(product).map(withPay);
  const shared = (product.specs || product.sharedSpecs || []).map(property);
  const category = googleCategory[product.slug] || product.category;
  const brand = { "@type": "Brand", name: "Utiliy" };
  if (variants.length === 1) {
    const variant = variants[0];
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      description: product.summary,
      image: product.images,
      sku: variant.sku,
      url: `${site}/products/${product.slug}/`,
      brand,
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
      name: `${product.name}, ${variant.label}`,
      description: product.summary,
      image: product.images,
      sku: variant.sku,
      size: sizeOf(variant),
      url: site + variantPath(product, variant.sku),
      brand,
      category,
      isVariantOf: { "@id": `${site}/products/${product.slug}/#group` },
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
    image: product.images,
    productGroupID: product.slug,
    url: `${site}/products/${product.slug}/`,
    brand,
    variesBy: ["https://schema.org/size"],
    category,
    additionalProperty: shared,
    hasVariant: variants.map((variant) => ({
      "@type": "Product",
      name: `${product.name}, ${variant.label}`,
      sku: variant.sku,
      size: sizeOf(variant),
      image: product.images,
      description: product.summary,
      url: site + variantPath(product, variant.sku),
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

function card(product) {
  const variants = variantsOf(product);
  const first = variants[0];
  const hay = [product.name, product.category, product.headline, product.fit, product.summary, ...variants.map((v) => v.label)].join(" ").toLowerCase();
  return `<article class="card" data-product-card="${esc(hay)}">
    <a class="shot" href="/products/${product.slug}/"><img src="${esc(product.image)}" alt="${esc(product.name)}" width="600" height="600" referrerpolicy="no-referrer"></a>
    <a href="/products/${product.slug}/"><h3>${esc(product.name)}</h3></a>
    <p class="spec">${esc(product.headline)}</p>
    <div class="card-row">
      <span class="price">${priceRange(product)}</span>
      ${variants.length > 1
        ? `<a class="btn" href="/products/${product.slug}/">Choose</a>`
        : `<button class="btn" type="button" data-add data-sku="${esc(first.sku)}" data-price="${first.price}" data-label="${esc(first.label)}" data-name="${esc(product.name)}" data-image="${esc(product.image)}" data-slug="${esc(product.slug)}" data-ships="${esc(product.shipsFrom)}" data-min="${product.minDays}" data-max="${product.maxDays}">Add</button>`}
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
  "closet-motion-light": "puck"
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
  const variants = variantsOf(product).map(withPay);
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
  const variants = variantsOf(product).map(withPay);
  const selected = variants.find((variant) => variant.sku === selectedSku) || variants[0];
  const many = variants.length > 1;
  const canonicalPath = many && selectedSku ? variantPath(product, selected.sku) : `/products/${product.slug}/`;
  const shared = specsOf(product, selected).sort((a, b) => Number(b.deciding === true) - Number(a.deciding === true));
  const specRows = shared.map((spec) => `<tr class="${spec.deciding ? "deciding" : ""}"><th scope="row">${esc(spec.name)}</th><td>${esc(spec.value)}${spec.unitText ? " " + esc(spec.unitText) : ""}</td></tr>`).join("");
  const sizePills = many ? `<div><span class="size-label">Choose size</span><div class="size-row">${variants.map((variant) => `<a class="size-pill${variant.sku === selected.sku ? " is-on" : ""}" href="${variantPath(product, variant.sku)}"><b>${esc(variant.label)}</b><span class="size-price">${money(variant.price)}</span></a>`).join("")}</div><p class="size-help">This size: ${esc(sizeOf(selected))}. <a href="#sizes">Compare sizes</a></p></div>` : "";
  const photos = product.images.filter((src) => !src.includes("57_147cecee"));
  const thumbs = photos.map((src, i) => `<button type="button" data-thumb="${esc(src)}" data-alt="${esc(product.name + ", " + product.headline)}" ${i === 0 ? 'aria-current="true"' : ""}><img src="${esc(src)}" alt="" referrerpolicy="no-referrer"></button>`).join("");
  const gallery = photos.slice(1).map((src) => `<figure class="photo-mat"><img src="${esc(src)}" alt="${esc(product.name)}" referrerpolicy="no-referrer"></figure>`).join("");
  const faqs = product.faqs.map((faq) => `<article class="question"><h3>${esc(faq.q)}</h3><p>${esc(faq.a)}</p></article>`).join("");
  const buyAttrs = `data-sku="${esc(selected.sku)}" data-price="${selected.price}" data-label="${esc(selected.label)}" data-name="${esc(product.name)}" data-image="${esc(product.image)}" data-slug="${esc(product.slug)}" data-ships="${esc(product.shipsFrom)}" data-min="${product.minDays}" data-max="${product.maxDays}"`;
  const description = `${product.name}: ${product.headline}. ${product.summary} ${money(selected.price)}. ${shipText(product)}`;
  const related = products.filter((item) => item.category === product.category && item.slug !== product.slug).map(card).join("");
  const body = `${crumbs([["Home", "/"], [product.category, `/category/${catSlug(product.category)}/`], [product.name, `/products/${product.slug}/`]])}
<main id="main">
  <div class="wrap pdp">
    <div class="gallery">
      <div class="hero-shot"><img data-hero-img src="${esc(product.image)}" alt="${esc(product.name + ", " + product.headline)}" width="900" height="900" referrerpolicy="no-referrer"></div>
      <div class="thumbs">${thumbs}</div>
    </div>
    <div class="buybox">
      <h1>${esc(product.name)}</h1>
      <p class="buy-measure">${esc(product.headline)}</p>
      <p class="price-lg" data-live-price>${money(selected.price)}</p>
      <p class="buy-fit">${esc(product.fit)}</p>
      ${sizePills}
      <div class="buy-actions">
        <div class="qty">
          <button type="button" data-qty-dec aria-label="Decrease quantity">−</button>
          <input data-qty value="1" inputmode="numeric" aria-label="Quantity" readonly>
          <button type="button" data-qty-inc aria-label="Increase quantity">+</button>
        </div>
        <button class="btn" type="button" data-add ${buyAttrs}>Add to cart</button>
        <button class="btn-line" type="button" data-add data-go-checkout ${buyAttrs}>Buy now</button>
      </div>
      <p class="ship-note">${esc(shipText(product))} <a href="/shipping/">Shipping details</a>.</p>
      <p class="reassure"><a href="/returns/">30-day returns</a>${related ? ` · <a href="#also">More in ${esc(product.category)}</a>` : ""}</p>
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
      ${related ? `<a href="#also">More</a>` : ""}
    </div>
  </nav>
  ${storyBlock(product, shared)}
  ${rangeBoard(product, selected.sku)}
  <div class="wrap landing">
    <section id="specs"><h2>Measurements</h2><table>${specRows}</table></section>
  </div>
  <div class="wrap landing pdp-tail">
    ${gallery ? `<section><h2>Product photos</h2><div class="photo-row">${gallery}</div></section>` : ""}
    <section><h2>Shipping and returns</h2><p>${esc(shipText(product))}</p><p>${esc(returnsSentence)}</p></section>
    <section id="answers"><h2>Fitment answers</h2>${faqs}</section>
  </div>
  <div class="buybar">
    <div class="buybar-inner">
      <div class="buybar-copy"><strong>${esc(product.name)}</strong><span>${esc(product.headline)}${many ? ` · ${esc(selected.label)}` : ""}</span></div>
      <span class="price">${money(selected.price)}</span>
      <button class="btn" type="button" data-add ${buyAttrs}>Add</button>
    </div>
  </div>
</main>
${related ? `<section class="section pdp-tail" id="also"><div class="wrap"><div class="section-head"><h2>More in ${esc(product.category)}</h2><a href="/category/${catSlug(product.category)}/">View category</a></div><div class="grid">${related}</div></div></section>` : ""}`;
  return shell({
    title: `${many && selectedSku ? `${product.name}, ${selected.label}` : product.name} — ${product.headline} · Utiliy`,
    description,
    canonical: site + canonicalPath,
    image: product.image,
    json: jsonLd(productSchema(product, selectedSku)) + jsonLd(faqSchema(product)),
    body,
    current: ""
  });
}

const products = catalog.products;

const styleCards = categories.map((cat) => `<a class="style-card" href="/category/${cat.slug}/"><img src="/assets/covers/${cat.slug}.jpg" alt=""><span>${esc(cat.name)}</span></a>`).join("");
const homeBody = `<main id="main">
  <section class="hero">
    <div class="hero-grid">
      <div class="hero-copy">
        <h1>Find the size that actually fits.</h1>
        <p class="lede">Every product leads with the span, gap, load, corner, or leg that decides the fit. If the maker did not publish a number, the page says so.</p>
        <div class="hero-actions"><a class="btn" href="/shop/">Shop Now</a></div>
        <div class="stats">
          <div><strong>10</strong><span>Fitment tools</span></div>
          <i></i>
          <div><strong>$0</strong><span>US shipping</span></div>
          <i></i>
          <div><strong>30</strong><span>Day returns</span></div>
        </div>
      </div>
      <a class="hero-visual" href="/shop/"><img src="/assets/covers/home.jpg" alt="Black and white photograph of a fitted corner shelf" width="1536" height="1024"></a>
    </div>
  </section>
  <section class="section"><div class="wrap">
    <h2 class="section-title">Ten tools</h2>
    <div class="grid">${products.map(card).join("")}</div>
    <p class="empty" data-search-empty hidden>No product matches that search.</p>
  </div></section>
  <section class="section"><div class="wrap">
    <div class="style-panel">
      <h2 class="section-title">Rooms</h2>
      <div class="style-grid">${styleCards}</div>
    </div>
  </div></section>
</main>`;

const shopBody = `<main id="main">
  <section class="page-cover">
    <img src="/assets/covers/home.jpg" alt="">
    <div class="wrap">
      <p class="kicker">Shop</p>
      <h1 class="cover-title">Ten tools, sold by the measurement.</h1>
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
  <p>Utiliy sells ten home tools. Each page leads with the number that decides the fit, in the heading, in a table, in FAQ schema, and in a JSON catalog at /catalog.json and /feeds/products.json.</p>
  <p>Supply comes from AutoDS suppliers. The account has no marketplace store connected yet, so orders are paid here on Stripe and fulfilled against the supplier ids in /feeds/fulfillment.json. Wholesale cost is not published.</p>
  <p>Contact support@utiliy.com.</p>`
);

const cart = shell({
  title: "Cart · Utiliy",
  description: "Review every item, then pay for the whole cart in one Stripe checkout.",
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
        <a class="btn" href="/checkout/" data-cart-go hidden>Checkout</a>
        <p class="reassure"><a href="/shop/">Keep shopping</a></p>
      </aside>
    </div></section>
  </main>`,
  current: ""
});
const checkout = shell({
  title: "Checkout · Utiliy",
  description: "Pay for every item in the Utiliy cart with one Stripe checkout. Shipping to the United States is included.",
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
        <button class="btn" type="button" data-pay-all>Pay with Stripe</button>
        <p class="muted">One payment covers every product and quantity in this cart.</p>
        <p class="reassure"><a href="/returns/">30-day returns</a></p>
        <p class="error" data-pay-error hidden></p>
      </aside>
    </div></section>
  </main>`,
  current: ""
});
const thanks = shell({
  title: "Order received · Utiliy",
  description: "Stripe confirmed the next step. Keep the receipt Stripe emails you.",
  canonical: `${site}/order/thanks/`,
  robots: "noindex,follow",
  body: `<main id="main" class="section"><div class="wrap prose"><p class="kicker">Paid</p><h1>Stripe has the order.</h1><p>The receipt is in your email. The measurement you bought is the one on the product page. If a size is wrong against that page, write to support@utiliy.com within 30 days.</p><p><a class="btn" href="/shop/">Back to the shop</a></p></div></main>`,
  current: ""
});

const contact = textPage(
  "Contact",
  "Write to Utiliy at support@utiliy.com about an order, a measurement, or a return.",
  `${site}/contact/`,
  "/contact/",
  `<p class="kicker">Support</p><h1>Contact</h1>
  <p>Email <a href="mailto:support@utiliy.com">support@utiliy.com</a>. Include the email you used at Stripe, the product name, and the measurement on the page.</p>
  <p>Orders ship only to the United States. Payment questions go to the receipt Stripe sent you.</p>`
);

const faqItems = [
  ["Can I pay for several products at once?", "Yes. Add every item to the cart, then use Checkout. Stripe charges one payment for the whole cart."],
  ["Is shipping included?", "Yes. Every price includes shipping to a United States address. Utiliy does not ship elsewhere."],
  ["How long does delivery take?", "US-warehouse goods leave in 4 to 12 days. Supplier-shipped goods leave in 11 to 15 days. The product page states the window."],
  ["What if the size does not match the page?", "Write to support@utiliy.com within 30 days. If the item is a different measurement than the product page states, Utiliy pays the return."],
  ["What if a measurement is missing?", "If the maker did not publish a number, the page says so. Do not guess a width, a load, or a lumen rating that is not on the page."]
];
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
    checkout: `${site}/checkout/`,
    offers: variants.map((variant) => ({
      sku: variant.sku,
      label: variant.label,
      price: (variant.price / 100).toFixed(2),
      url: site + variantPath(product, variant.sku),
      size: variant.decidingSpec ? sizeOf(variant) : null,
      checkout: `${site}/checkout/`,
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

Shipping to the United States is included. One Stripe checkout covers the whole cart: ${site}/checkout/

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

## Answers

${products.flatMap((product) => product.faqs.map((faq) => `- ${faq.q} ${faq.a} (${product.name})`)).join("\n")}
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
  "/faq/",
  "/contact/",
  "/shipping/",
  "/returns/",
  "/privacy/",
  "/terms/",
  "/about/",
  ...categories.map((cat) => `/category/${cat.slug}/`),
  ...products.flatMap((product) => {
    const paths = [`/products/${product.slug}/`];
    if (variantsOf(product).length > 1) paths.push(...variantsOf(product).map((variant) => variantPath(product, variant.sku)));
    return paths;
  })
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
  </div></section>
</main>`
  }));
}
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
  await page(`products/${product.slug}`, productPage(product));
  if (variantsOf(product).length > 1) {
    for (const variant of variantsOf(product)) {
      await page(`products/${product.slug}/${variant.sku.toLowerCase()}`, productPage(product, variant.sku));
    }
  }
}

await mkdir(path.join(dist, "assets"), { recursive: true });
for (const file of ["site.css", "site.js", "favicon.svg"]) {
  await cp(path.join(root, "assets", file), path.join(dist, "assets", file));
}
await cp(path.join(root, "assets/explainers"), path.join(dist, "assets/explainers"), { recursive: true }).catch(() => {});
await cp(path.join(root, "assets/covers"), path.join(dist, "assets/covers"), { recursive: true }).catch(() => {});
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
function tsvCell(value) {
  const text = value == null ? "" : String(value);
  return /["\t\n,]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function merchantRows() {
  const header = ["id", "title", "description", "link", "image_link", "additional_image_link", "availability", "price", "brand", "identifier_exists", "condition", "google_product_category", "product_type", "shipping", "ships_from_country", "item_group_id", "size", "color", "material", "product_detail", "question_and_answer"];
  const colorOf = { "cable-raceway": "White", "door-draft-stopper": "Black", "furniture-sliders": "Transparent" };
  const rows = [header];
  for (const product of products) {
    const variants = variantsOf(product);
    const many = variants.length > 1;
    const material = (product.specs || product.sharedSpecs || []).find((spec) => spec.name === "Material");
    const materialValue = material && !/ and /i.test(material.value) ? material.value : "";
    for (const variant of variants) {
      const specs = specsOf(product, variant);
      const images = [...new Set(product.images)];
      const details = specs.map((spec) => `Specifications:${spec.name}:${spec.value}${spec.unitText ? ` ${spec.unitText}` : ""}`).join(", ");
      const answers = product.faqs.map((faq) => `${faq.q}:${faq.a}`).join(", ");
      rows.push([
        variant.sku,
        many ? `${product.name}, ${variant.label}` : product.name,
        product.summary,
        site + variantPath(product, variant.sku),
        images[0],
        images.slice(1, 11).join(","),
        "in_stock",
        `${(variant.price / 100).toFixed(2)} USD`,
        "Utiliy",
        "no",
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
  version: "2026-10-06",
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
