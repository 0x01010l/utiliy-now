import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(path.join(root, "catalog/products.json"), "utf8"));
const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/$/, "");
const key = process.env.AZURE_OPENAI_API_KEY || "";
if (!endpoint || !key) {
  console.error("Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY.");
  process.exit(1);
}

const instructions = {
  "corner-shower-caddy": "Isolate the exact two-tier stainless corner wire caddy and its clear adhesive mounts.",
  "bamboo-drawer-organizer": "Show exactly four separate bamboo spring-loaded drawer dividers. Keep their foam ends.",
  "under-sink-organizer": "Isolate the exact black two-tier pull-out organizer with its frame, baskets, sliding base, and four hooks. Remove all bottles.",
  "cable-raceway": "Isolate only the exact white flexible cable raceway: one neat coil and one short cross-section showing the hollow channel. Remove cables, plugs, tape liner, tools, and all other accessories.",
  "door-draft-stopper": "Isolate one exact black TPE brush door sweep, shown straight and uncut.",
  "tension-rod": "Isolate one exact thin metal spring tension rod with both plastic end caps. Show it diagonally so its full length is visible.",
  "furniture-sliders": "Show one exact transparent square silicone furniture-leg cap by itself, turned slightly to reveal its square opening and clear sides. Do not show a furniture leg or imply a pack count.",
  "furniture-anchors": "Show the exact six detachable metal anti-tip strap sets with their screws, arranged neatly.",
  "closet-rod": "Isolate one exact stainless telescopic closet rod with both large round rubber ends. Show the complete rod diagonally.",
  "closet-motion-light": "Isolate one exact round rechargeable puck light, front and slight side view. Preserve its plain face and do not add icons.",
  "adjustable-bed-frame-casters": "Show exactly the two Shepherd 9532 gold-tone adjustable locking bed-frame casters from the reference, including their threaded adjustment stems and black wheels.",
  "kerf-door-seal-81-white": "Show one complete Frost King DS7W/25 white vinyl-clad foam kerf seal, loosely curved so the full strip and its press-in kerf fin are visible.",
  "extra-wide-door-sweep-36-white": "Show one complete Frost King A82/36W white aluminum-and-vinyl door sweep, straight and horizontal, with the wide flexible white sealing blade visible.",
  "fixed-mount-wire-shelf-clips": "Show exactly the ClosetMaid 7561 fixed-mount wire-shelf clips and their included fasteners from the reference, arranged neatly without changing the pack quantity.",
  "heavy-duty-closet-pole-sockets": "Show exactly one open-lip and one closed Knape & Vogt CD-0010-BN brushed-nickel closet-pole socket with the included mounting screws.",
  "kv-rp-0495-bn-shelf-rod-bracket": "Show one exact Knape & Vogt RP-0495-BN brushed-nickel steel Slide-Thru shelf-and-rod bracket, with the shelf support and snap-in pole hook clearly visible.",
  "korky-100bp-two-inch-toilet-flapper": "Show one exact red Korky 100BP adjustable two-inch toilet flapper with its stainless-steel chain, preserving the adjustment dial and rubber shape.",
  "broan-qt20000-charcoal-filter": "Show one exact rectangular Broan-NuTone BPQTF charcoal range-hood filter, front and slight edge view, preserving its dark filter media and frame.",
  "five-pound-flour-keeper": "Show one exact Progressive Prepworks DKS-100 five-pound flour keeper with its fitted lid and included leveler, empty, closed, and upright."
};

const exact = " Preserve the product's real construction, proportions, number of parts, materials, color, and included hardware from the reference. Do not redesign it, add features, invent accessories, or add/remove tiers. A centered premium ecommerce packshot on pure white (#ffffff), all edges fully visible with generous even margin, soft grounded shadow, even studio light, high detail, natural material texture. No room scene, props, hands, packaging, text, letters, numbers, dimensions, logos, badges, borders, collage, watermark, or color cast.";

async function request(url, options, label) {
  let last = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, options);
    if (res.status === 429 || res.status >= 500) {
      last = await res.text();
      const wait = Number(res.headers.get("retry-after") || 15) * 1000;
      console.log("retry", label, res.status, "in", wait);
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`${label} ${res.status} ${text.slice(0, 240)}`);
    const b64 = JSON.parse(text).data?.[0]?.b64_json;
    if (!b64) throw new Error(`${label} empty image`);
    return Buffer.from(b64, "base64");
  }
  throw new Error(`${label} gave up ${last.slice(0, 180)}`);
}

async function productPhoto(product) {
  const imgRes = await fetch(product.image);
  if (!imgRes.ok) throw new Error(`download ${product.slug} ${imgRes.status}`);
  const source = Buffer.from(await imgRes.arrayBuffer());
  const type = imgRes.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  const form = new FormData();
  form.append("prompt", instructions[product.slug] + exact);
  form.append("size", "1024x1024");
  form.append("quality", "high");
  form.append("n", "1");
  form.append("output_format", "jpeg");
  form.append("output_compression", "88");
  form.append("image", new Blob([source], { type }), `reference.${type.includes("png") ? "png" : "jpg"}`);
  const image = await request(
    `${endpoint}/openai/deployments/gpt-image-2/images/edits?api-version=2025-04-01-preview`,
    { method: "POST", headers: { "api-key": key }, body: form },
    product.slug
  );
  const out = path.join(root, "assets/product-images", `${product.slug}.jpg`);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, image);
  console.log("wrote", product.slug, image.length);
}

async function homeCover() {
  const prompt = "A striking abstract black-and-white architectural still life for a premium utility home-goods store. No recognizable retail product. Interlocking white planes, a single brushed-steel arc, translucent glass, precise slots and openings suggesting fit, measurement, and organization without depicting a tool. Gallery installation, hard directional sunlight, crisp geometric shadows, deep black negative space, tactile materials, sophisticated editorial photography, asymmetrical composition with quiet open space for a small headline in the lower left. Strict grayscale only. No room scene, furniture, shelf, organizer, cable, rod, lamp, door, parcel, text, letters, numbers, logo, badge, or watermark.";
  const image = await request(
    `${endpoint}/openai/deployments/gpt-image-2/images/generations?api-version=2025-04-01-preview`,
    {
      method: "POST",
      headers: { "api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        prompt,
        n: 1,
        size: "1536x1024",
        quality: "high",
        output_format: "jpeg",
        output_compression: 88
      })
    },
    "home-cover"
  );
  await writeFile(path.join(root, "assets/covers/home.jpg"), image);
  console.log("wrote home-cover", image.length);
}

const requested = new Set(process.argv.slice(2));
const all = requested.size === 0;
const queue = [
  ...catalog.products
    .filter((product) => all || requested.has(product.slug))
    .map((product) => () => productPhoto(product)),
  ...(all || requested.has("home") ? [homeCover] : [])
];
await Promise.all(Array.from({ length: 2 }, async () => {
  while (queue.length) await queue.shift()();
}));
console.log("product photos done");
