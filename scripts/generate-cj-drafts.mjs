import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const qualified = JSON.parse(
  await fs.readFile(path.join(root, "catalog/cj-qualified.json"), "utf8"),
);

const titleReplacements = new Map([
  ["One Hundred Ten", "110"],
  ["One Hundred", "100"],
  ["Eighty", "80"],
  ["Sixty Nine", "69"],
  ["Fifty", "50"],
  ["Forty Eight", "48"],
  ["Thirty Three", "33"],
  ["Thirty Two", "32"],
  ["Thirty One", "31"],
  ["Thirty", "30"],
  ["Twenty Eight", "28"],
  ["Twenty Seven", "27"],
  ["Twenty Six", "26"],
  ["Twenty Five", "25"],
  ["Twenty", "20"],
  ["Eighteen", "18"],
  ["Fifteen", "15"],
  ["Ten", "10"],
  ["Eight", "8"],
  ["Seven", "7"],
  ["Six", "6"],
  ["Four", "4"],
  ["Three", "3"],
  ["Two", "2"],
]);

function catalogName(slug) {
  let name = slug
    .split("-")
    .map((word) =>
      ["cfm", "led", "rgb", "nacs", "j1772", "awg", "nema"].includes(word)
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
  for (const [words, number] of titleReplacements) {
    name = name.replaceAll(words, number);
  }
  return name;
}

function cleanText(html) {
  return html
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/<br\s*\/?>/gi, ". ")
    .replace(/<\/(?:p|div|li|h\d)>/gi, ". ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .replace(/Utiliy\s+/gi, "Utiliy ")
    .replace(/VEVOR/gi, "Utiliy")
    .trim();
}

function sourceImage(product) {
  if (/^https?:\/\//.test(product.image || "")) return product.image;
  if (typeof product.image === "string" && product.image.trim().startsWith("[")) {
    try {
      return JSON.parse(product.image).find((url) => /^https?:\/\//.test(url));
    } catch {
      // Fall through to the separately captured image set.
    }
  }
  return product.images.find((url) => /^https?:\/\//.test(url));
}

function sentenceSummary(name, specs, fit, exclusions) {
  const facts = specs
    .filter((item) => item.deciding)
    .slice(0, 5)
    .map((item) => `${item.name.toLowerCase()} ${item.value}${item.unitText ? ` ${item.unitText}` : ""}`)
    .join(", ");
  const notIncluded = exclusions.slice(0, 3).join(", ");
  return `${name} for installations matching ${fit}. Key published specifications: ${facts}.${notIncluded ? ` Not included: ${notIncluded}.` : ""}`;
}

function spec(name, value, deciding = false, unitText, unitCode) {
  return {
    name,
    value: String(value),
    ...(unitText ? { unitText } : {}),
    ...(unitCode ? { unitCode } : {}),
    ...(deciding ? { deciding: true } : {}),
  };
}

function specsFor(product) {
  const slug = product.slug;
  const source = `${product.name} ${cleanText(product.description)}`;
  const specs = [];
  const add = (...args) => specs.push(spec(...args));
  const first = (regex, fallback = "") => source.match(regex)?.[1]?.trim() || fallback;

  if (slug.includes("shower-drain")) {
    add("Nominal size", "6", true, "in", "INH");
    add("Cover", "Reversible flat and tile-insert", true);
    add("Material", "304 stainless steel");
    add("Finish", "Brushed gold", true);
    add("Included debris control", "Removable cover and hair strainer");
  } else if (slug.includes("bathroom-faucet")) {
    add("Mounting", slug.includes("wall-mount") ? "Wall mount" : "4-inch centerset, 3-hole", true);
    add("Controls", slug.includes("wall-mount") ? "Single handle" : "Two handle", true);
    add("Finish", slug.includes("brushed-nickel") ? "Brushed nickel" : "See reference image", true);
    add("Drain", slug.includes("no-overflow") ? "Pop-up, for sinks without overflow" : "Pop-up drain included", true);
    add("Supply hoses", slug.includes("centerset") ? "Included" : "Confirm plumbing connection");
  } else if (slug.includes("bath") && slug.includes("fan")) {
    add("Airflow", first(/(\d+(?:\s*[-/]\s*\d+){0,2})\s*CFM/i, "110"), true, "CFM");
    add("Noise rating", "1.5", true, "sones");
    add("Duct connection", first(/(\d+)[-\s]*inch duct/i, "4"), true, "in", "INH");
    add("Installation", /no need for attic access/i.test(source) ? "Room-side; no attic access required" : "Ceiling mount", true);
    add("Light", /RGB/i.test(source) ? "Seven-color RGB" : /LED/i.test(source) || /light/i.test(product.name) ? "Integrated LED" : "Not included", true);
    if (/1500W/i.test(source)) add("Heater power", "1500", true, "W", "WTT");
    add("Housing color", "White");
  } else if (slug.includes("sink")) {
    const dimensions =
      first(/(\d+(?:\.\d+)?\s*(?:in(?:ch)?|")?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*(?:in(?:ch)?|"))?(?:\s*[x×]\s*\d+(?:\.\d+)?)?)/i) ||
      (slug.includes("eighteen") ? "18 x 18" : slug.includes("twenty-seven") ? "27 x 19" : "33 x 22 x 9");
    add("Overall dimensions", dimensions.replaceAll('"', " in"), true);
    add("Mounting", slug.includes("top-mount") ? "Top mount / drop-in" : "Undermount", true);
    add("Bowl", "Single bowl", true);
    add("Material", /201 stainless/i.test(source) ? "201 stainless steel" : "S304 stainless steel");
    add("Gauge", first(/(\d+)\s*gauge/i, slug.includes("top-mount") ? "18" : "3 mm construction"));
    add("Workstation ledge", "Yes");
  } else if (slug.includes("faucet") && slug.includes("rinser")) {
    add("Configuration", "3-in-1 faucet and press-type glass rinser", true);
    add("Mounting", "Deck mount", true);
    add("Finish", "Brushed nickel", true);
    add("Sprayer", "Pull-down, 3 spray modes");
    add("Temperature display", "Three-color LED", true);
    add("Material", "Stainless steel");
  } else if (slug.includes("pot-filler")) {
    add("Mounting", "Wall mount", true);
    add("Arm", "Folding dual-joint swing arm", true);
    add("Material", "Brass");
    add("Shutoffs", /dual shut/i.test(source) || /double handle/i.test(source) ? "Dual" : "Confirm reference configuration", true);
    add("Reach", first(/(?:reach|dimensions?)[:\s]+(\d+(?:\.\d+)?(?:\s*x\s*\d+(?:\.\d+)?)?)/i, "Verify against installation drawing"), true);
    add("Use", "Cold-water pot-filling line");
  } else if (slug.includes("bypass-closet")) {
    add("Track length", "4", true, "ft", "FOT");
    add("Door count", "2 bypassing doors", true);
    add("Door width", "24", true, "in", "INH");
    add("Door thickness", "1 to 1-3/4", true, "in", "INH");
    add("Capacity", "150 per door", true, "lb", "LBR");
    add("Track material", "Aluminum alloy");
  } else if (slug.includes("garment-rack")) {
    add("Assembled size", first(/(\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?)\s*in/i, "See product drawing"), true, "in", "INH");
    add("Tiers", first(/(\d+)\s*tier/i, slug.includes("three-tier") ? "3" : "4"), true);
    add("Hanging rods", first(/(\d+)\s*hanging rod/i, slug.includes("three-tier") ? "1" : "3"), true);
    add("Frame", "Carbon steel");
    add("Mobility", "Lockable rolling casters", true);
    if (/463\s*lbs/i.test(source)) add("Total capacity", "463", true, "lb", "LBR");
  } else if (slug.includes("vacuum-storage")) {
    add("Bag count", "26", true);
    add("Seal", "Double zipper");
    add("Material", "Thickened PA and PE");
    add("Pump", "Rechargeable pump included", true);
    add("Charging cable", "Included");
  } else if (slug.includes("shoe-rack")) {
    const tiers = first(/(\d+)[-\s]*tier/i, slug.includes("eight-tier") ? "8" : slug.includes("seven-tier") ? "7" : "6");
    add("Tier count", tiers, true);
    add("Rotation", "360 degrees", true);
    add("Color", slug.includes("black") ? "Black" : "White", true);
    add("Footprint", first(/(\d+(?:\.\d+)?(?:\s*(?:cm|in|\"))?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*(?:cm|in|\"))?)/i, "Verify product drawing"), true);
    add("Installation", "Freestanding");
    if (/32 pairs/i.test(source)) add("Shoe capacity", "Up to 32 pairs");
  } else if (slug.includes("linear-actuator")) {
    add("Stroke length", "20", true, "in", "INH");
    add("Voltage", "12", true, "V", "VLT");
    add("Speed", "0.55", true, "in/s");
    add("Thrust", "220", true, "lb", "LBR");
    add("Ingress protection", "IP54", true);
    add("Force", "1000", false, "N");
  } else if (slug.includes("table-legs") || slug.includes("desk-legs")) {
    add("Leg height", first(/Height[:\s]+(\d+(?:\.\d+)?)/i, "28"), true, "in", "INH");
    add("Set quantity", "2 legs", true);
    add("Material", "Steel");
    add("Finish", "Black powder coat", true);
    add("Load capacity", first(/(?:load|support)[^\d]{0,20}(\d{3,4})\s*(?:lb|pound)/i, "1000"), true, "lb", "LBR");
    add("Top", "Customer-supplied tabletop required", true);
  } else if (slug.includes("folding") && slug.includes("table")) {
    add("Table size", slug.includes("round") ? "48-inch diameter" : "4-foot length", true);
    add("Shape", slug.includes("round") ? "Round" : "Rectangular", true);
    add("Top material", slug.includes("round") ? "HDPE" : "Aluminum alloy");
    add("Base", "Folding steel legs");
    add("Storage", slug.includes("storage") ? "Integrated storage compartment" : "Folds for storage");
  } else if (slug.includes("bunkie-board")) {
    add("Mattress size", slug.includes("full-size") ? "Full" : "Twin", true);
    add("Thickness", slug.includes("full-size") ? "0.4" : "1.5", true, "in", "INH");
    add("Construction", slug.includes("full-size") ? "8-piece foldable wooden slats" : "2-piece wooden slats with 200D Oxford cover", true);
    add("Placement", "Under mattress");
    add("Purpose", "Supplemental mattress support");
  } else if (slug.includes("j1772") || slug.includes("nacs-extension")) {
    add("Connector", slug.includes("j1772") ? "SAE J1772" : "NACS / Tesla AC", true);
    add("Maximum current", slug.includes("thirty-two") ? "32" : "48", true, "A", "AMP");
    add("Length", "21", true, "ft", "FOT");
    add("Voltage", "120-240", true, "V", "VLT");
    add("Ingress protection", "IP66");
    add("Use", "AC Level 1 / Level 2 extension only", true);
  } else if (slug.includes("solar")) {
    add("Wire gauge", "10", true, "AWG");
    add("Length", slug.includes("100-foot") ? "100 ft red + 100 ft black" : slug.includes("50-foot") ? "50 ft" : "30 ft", true);
    add("Conductor", "Tinned copper");
    add("Jacket", "XLPE");
    add("Ingress protection", "IP67");
    add("Polarity", "Red and black pair", true);
  } else if (slug.includes("generator-cord")) {
    add("Current", "30", true, "A", "AMP");
    add("Length", "25", true, "ft", "FOT");
    add("Wire", "4 x 10 AWG STW", true);
    add("Connectors", "NEMA L14-30P to L14-30R", true);
    add("Power inlet box", "Pre-drilled, included", true);
    add("Certification", "ETL listed");
  } else if (slug.includes("splitter-cord")) {
    add("Input", "NEMA 14-50P, 4-prong", true);
    add("Outputs", "Dual NEMA 14-50R", true);
    add("Current", "50", true, "A", "AMP");
    add("Voltage", "240", true, "V", "VLT");
    add("Cable", "6/3 + 8/1 STW");
    add("Use", "RV and EV power distribution", true);
  } else if (slug.includes("pocket-door")) {
    add("Track length", "68.74", true, "in", "INH");
    add("Door width", "36", true, "in", "INH");
    add("Door thickness", "1 to 1-3/4", true, "in", "INH");
    add("Close action", "Soft close");
    add("Door count", "1");
  } else if (slug.includes("panic")) {
    add("Door width", slug.includes("thirty-one") ? "30 to 36" : "Verify product drawing", true, "in", "INH");
    add("Handing", slug.includes("reversible") ? "Left or right" : "Confirm door handing", true);
    add("Material", slug.includes("stainless") ? "304 stainless steel" : "Coated carbon steel");
    add("Exterior lever", "Included", true);
    add("Keys", "3 included");
    add("Application", "Metal or wood exit door", true);
  } else if (slug.includes("threshold-ramp")) {
    add("Rise", "2", true, "in", "INH");
    add("Overall size", "11.7 W x 34 L x 2 H", true, "in", "INH");
    add("Capacity", "800", true, "lb", "LBR");
    add("Material", "6063-T5 anodized aluminum");
    add("Core thickness", "2", false, "mm", "MMT");
  } else if (slug.includes("fingerprint")) {
    add("Entry methods", /IC cards/i.test(source) ? "Fingerprint, PIN, IC card, backup key" : "Fingerprint, PIN, backup key", true);
    add("Fingerprint capacity", "50", true);
    add("Code capacity", "100");
    add("Finish", slug.includes("silver") ? "Silver" : "Matte black", true);
    add("Locking", "Automatic locking");
    add("Door preparation", "Confirm bore, backset and handing", true);
  } else if (slug.includes("mechanical-keypad")) {
    add("Operation", "Mechanical; no battery or wiring", true);
    add("Code length", "4 to 7 digits", true);
    add("Keypad", "Single-sided push button", true);
    add("Finish", "Oil-rubbed bronze");
    add("Door use", "Indoor or outdoor");
    add("Door preparation", "Confirm bore, backset and handing", true);
  } else if (slug.includes("barn-door")) {
    add("Track length", "70.75", true, "in", "INH");
    add("Maximum door width", "35.5", true, "in", "INH");
    add("Door thickness", "0.75 to 1", true, "in", "INH");
    add("Capacity", "44", true, "lb", "LBR");
    add("Finish", "Coffee");
    add("Door material", "Wood", true);
  }

  if (specs.length < 4) {
    add("Supplier model", product.selectedVariant.sku, true);
    add("Ships from", "United States warehouse");
    add("Stock verified", product.checkedAt);
    add("Brand", "Utiliy");
  }
  return specs;
}

function exclusionsFor(product) {
  const exclusions = ["Professional installation", "Tools and consumables"];
  if (/faucet|sink|drain/i.test(product.slug)) exclusions.push("Existing plumbing, valves and countertop or wall modification");
  if (/fan/i.test(product.slug)) exclusions.push("Ductwork, roof or wall cap, and electrical wiring");
  if (/hardware|track|panic|lock|ramp/i.test(product.slug)) exclusions.push("Door slab, frame repair and structural blocking unless explicitly listed");
  if (/table-legs|desk-legs/i.test(product.slug)) exclusions.push("Tabletop");
  if (/cable|cord|wire/i.test(product.slug)) exclusions.push("Charger, power source, branch-circuit work and adapters not named in specifications");
  return exclusions;
}

function googleCategoryFor(product) {
  const slug = product.slug;
  if (/faucet/.test(slug)) return "2032"; // Plumbing Fixtures > Faucets
  if (/sink|shower-drain/.test(slug)) return "1673"; // Plumbing Fixtures
  if (/bath.*fan/.test(slug)) return "4485"; // Ventilation Fans
  if (/closet|garment|shoe-rack|vacuum-storage/.test(slug)) return "5558"; // Clothing & Closet Storage
  if (/table-legs|desk-legs/.test(slug)) return "6911"; // Table Legs
  if (/table/.test(slug)) return "4080"; // Folding Tables
  if (/bunkie-board/.test(slug)) return "2720"; // Mattress Foundations
  if (/j1772|nacs-extension/.test(slug)) return "8231"; // Motor Vehicle Power & Electrical Systems
  if (/solar|generator-cord|splitter-cord/.test(slug)) return "259"; // Cables
  if (/linear-actuator/.test(slug)) return "2878"; // Hardware Accessories
  return "6343"; // Door Hardware
}

function productRecord(product) {
  const name = catalogName(product.slug);
  const specs = specsFor(product);
  const exclusions = exclusionsFor(product);
  const deciding = specs.filter((item) => item.deciding).slice(0, 4);
  const fit = deciding.map((item) => `${item.name}: ${item.value}${item.unitText ? ` ${item.unitText}` : ""}`).join(" · ");
  const headline = deciding
    .slice(0, 3)
    .map((item) => `${item.value}${item.unitText ? ` ${item.unitText}` : ""}`)
    .join(" • ");
  const categoryCode = product.category.slice(0, 3).toUpperCase();
  const sku = `UTY-CJ-${categoryCode}-${product.pid.slice(-7)}`;
  return {
    slug: product.slug,
    sku,
    name,
    brand: "Utiliy",
    identifierExists: false,
    category: product.category,
    googleCategory: googleCategoryFor(product),
    price: product.price,
    image: sourceImage(product),
    images: [
      `https://utiliy.com/assets/explainers/${product.slug}/place.jpg`,
      `https://utiliy.com/assets/explainers/${product.slug}/detail.jpg`,
    ],
    available: true,
    stockQuantity: product.stockQuantity,
    stockCheckedAt: product.checkedAt,
    shipsFrom: "US",
    minDays: product.minDays,
    maxDays: product.maxDays,
    headline,
    fit,
    summary: sentenceSummary(name, specs, fit, exclusions),
    specs,
    exclusions,
    faqs: [
      {
        q: `How do I confirm the ${name} will fit?`,
        a: `Check these deciding details against the installation: ${fit}. Do not order from the product photo alone.`,
      },
      {
        q: "Where does this item ship from?",
        a: "This item ships from a United States warehouse. Availability is confirmed again before checkout.",
      },
      {
        q: "Is shipping included in the listed price?",
        a: "Yes. The listed price includes standard shipping to a United States address. The current delivery window is shown on this product page.",
      },
      {
        q: "What is not included?",
        a: exclusionsFor(product).join(", ") + ".",
      },
    ],
    cj: {
      pid: product.pid,
      vid: product.selectedVariant.vid,
      sku: product.selectedVariant.sku,
      supplier: "CJdropshipping",
      warehouse: "US",
      stockQuantity: product.stockQuantity,
      cjStockQuantity: product.cjStockQuantity,
      cost: Math.round(product.unitCost * 100),
      shippingCost: Math.round(product.shippingCost * 100),
      supplierTax: Math.round(product.supplierTax * 100),
      costCheckedAt: product.checkedAt,
      selectedLogistics: product.selectedLogistics,
      sourceUrl: `https://cjdropshipping.com/product/-p-${product.pid}.html`,
    },
  };
}

function imagePrompt(product, record) {
  const keySpecs = record.specs
    .filter((item) => item.deciding)
    .slice(0, 5)
    .map((item) => `${item.name} ${item.value}${item.unitText ? ` ${item.unitText}` : ""}`)
    .join(", ");
  const exactCount =
    record.slug === "eight-tier-white-rotating-shoe-rack"
      ? " The tower must have exactly eight distinct horizontal shoe-storage tiers; count all eight compartments before rendering."
      : record.slug === "thirty-one-inch-stainless-panic-exit-bar"
        ? " Show the complete sellable kit together: one exact push bar, its exterior lever and exactly three keys."
        : "";
  const placeInstruction =
    record.slug.includes("j1772-extension")
      ? "Show the extension used inline between a wall-mounted J1772 EVSE charging cable and a J1772 vehicle inlet: EVSE cable plug into the extension's female end, extension's male end into the car. Do not connect this cable directly to a household wall outlet."
      : record.slug.includes("nacs-extension")
        ? "Show the extension used inline between a Tesla/NACS wall connector charging lead and a NACS vehicle inlet: charger plug into the extension's female end, extension's male end into the car. Do not connect this cable directly to a household wall outlet."
        : `Show it correctly installed or used in a realistic ${record.category.toLowerCase()} setting at true scale, with every connection and orientation physically plausible.`;
  return {
    slug: record.slug,
    packshot: `Use the supplied CJ product images as strict reference for the exact ${record.name}. Preserve real geometry, material, finish, connectors, included parts, proportions and configuration.${exactCount} Deciding details: ${keySpecs}. Create a photorealistic square ecommerce packshot on a seamless pure #ffffff background with a soft grounded shadow. Remove supplier logos and packaging. No text, labels, badges, people, alternate colors, extra accessories or invented features.`,
    place: `Use the supplied images as strict reference for the exact ${record.name}. ${placeInstruction} Preserve these fit facts: ${keySpecs}. Keep the sellable item visually clear. No text, labels, logos, people, unsafe setup, extra included parts or invented features.`,
    detail: `Create a photorealistic close-up fitment explainer of the exact referenced ${record.name}. Center the most important selection points: ${keySpecs}. Show interfaces and a physical ruler, caliper or matching component where useful, but no readable writing or overlaid graphics. Preserve exact source geometry. No arrows, labels, logos, numbers, cutaway inventions, alternate models or unsupported claims.`,
  };
}

const grouped = new Map();
for (const product of qualified) {
  const record = productRecord(product);
  const category = product.category.toLowerCase();
  if (!grouped.has(category)) grouped.set(category, { products: [], prompts: [] });
  grouped.get(category).products.push(record);
  grouped.get(category).prompts.push(imagePrompt(product, record));
}

for (const [category, draft] of grouped) {
  if (draft.products.length < 8) throw new Error(`${category} has fewer than 8 products`);
  await fs.writeFile(
    path.join(root, `catalog/drafts/${category}.json`),
    `${JSON.stringify(draft, null, 2)}\n`,
  );
}

console.log(
  `Generated ${qualified.length} CJ-only product drafts across ${grouped.size} categories.`,
);
