import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
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

const tail = " Photoreal catalog photo, soft daylight, pale neutral interior. Keep this exact product from the reference photo: same parts, same shape, same color. Do not add extra shelves, tiers, tools, or accessories that are not in the reference. No text, no letters, no numbers, no logos, no watermark.";

const jobs = [
  ["corner-shower-caddy", "place.jpg", "Place this exact corner shower caddy in a square white-tile shower corner. Show the adhesive pads on the tile."],
  ["corner-shower-caddy", "detail.jpg", "Close-up of one clear adhesive pad holding this exact metal caddy to smooth white tile. No drill, no screws."],
  ["bamboo-drawer-organizer", "place.jpg", "Show exactly four of these bamboo drawer dividers installed in an open white kitchen drawer."],
  ["bamboo-drawer-organizer", "detail.jpg", "Close-up of the foam end of one bamboo divider pressed against the inside wall of a drawer."],
  ["under-sink-organizer", "place.jpg", "Place this exact under-sink organizer in a cabinet beside plumbing pipes, with empty space around it. Containers must be plain and unlabeled. No brand names, no logos, no readable labels."],
  ["under-sink-organizer", "detail.jpg", "Close-up of the baskets, painted metal frame, and side hooks of this exact organizer."],
  ["cable-raceway", "place.jpg", "Show this exact white cord cover adhered along a white baseboard, covering one thin cable."],
  ["cable-raceway", "detail.jpg", "Close-up of the open white channel of this exact cord cover, with a single thin cable inside."],
  ["door-draft-stopper", "place.jpg", "Show this exact black brush door sweep stuck to the bottom of a white interior door, just above carpet."],
  ["door-draft-stopper", "detail.jpg", "Close-up of the brush on this exact sweep meeting a carpet."],
  ["tension-rod", "place.jpg", "Show this exact thin tension rod spanning a narrow opening, holding only a light fabric curtain. No screws."],
  ["tension-rod", "detail.jpg", "Close-up of the plastic end of this exact rod pressed to a painted wall. No screws."],
  ["furniture-sliders", "place.jpg", "Show these exact square clear caps on wooden chair legs standing on a hardwood floor. No carpet."],
  ["furniture-sliders", "detail.jpg", "Close-up of one square transparent cap on the bottom of a square wooden furniture leg."],
  ["furniture-anchors", "place.jpg", "Show these exact metal anti-tip straps screwed into the back of a dresser and into the wall. A drill may sit nearby. Not adhesive pads."],
  ["furniture-anchors", "detail.jpg", "Close-up of one metal strap and its screws from this exact anchor set."],
  ["closet-rod", "place.jpg", "Show this exact stainless closet rod with round ends fixed between two closet walls. A few light garments may hang. No weight labels."],
  ["closet-rod", "detail.jpg", "Close-up of the round end of this exact closet rod against the closet wall."],
  ["closet-motion-light", "place.jpg", "Show this exact small round puck light stuck by its magnet inside a closet, glowing softly. No icons, no wifi mark, no printed graphics."],
  ["closet-motion-light", "detail.jpg", "Close-up of this exact thin round light, showing how flat it is against a closet shelf. No icons, no wifi mark, no printed graphics."],
  ["adjustable-bed-frame-casters", "place.jpg", "Install these exact Shepherd 9532 casters on the two visible corners of a plain metal bed frame. Show the raised under-bed clearance and both wheel brakes."],
  ["adjustable-bed-frame-casters", "detail.jpg", "Close-up of one exact Shepherd 9532 caster installed in a bed-frame socket, showing the friction stem, height adjustment, soft wheel, and foot brake."],
  ["kerf-door-seal-81-white", "place.jpg", "Show this exact white Frost King DS7W/25 seal pressed into the kerf around a white exterior door jamb. Keep the sealing face visible where it meets the closed door."],
  ["kerf-door-seal-81-white", "detail.jpg", "Macro close-up of this exact white seal's press-in fin seated inside a matching door-frame kerf and its foam face touching the door."],
  ["extra-wide-door-sweep-36-white", "place.jpg", "Mount this exact white Frost King A82/36W sweep across the bottom interior face of a 36-inch white door, with the flexible blade closing a large floor gap."],
  ["extra-wide-door-sweep-36-white", "detail.jpg", "Close-up of the exact white aluminum carrier and extra-wide flexible vinyl blade meeting a smooth threshold."],
  ["fixed-mount-wire-shelf-clips", "place.jpg", "Show these exact ClosetMaid 7561 clips correctly fastening a white fixed-mount wire shelf to a painted closet wall."],
  ["fixed-mount-wire-shelf-clips", "detail.jpg", "Close-up of one exact ClosetMaid 7561 clip around the rear wire of a shelf with its fastener seated in the wall."],
  ["heavy-duty-closet-pole-sockets", "place.jpg", "Install the exact brushed-nickel open and closed Knape & Vogt sockets on opposite closet walls with a matching round pole between them."],
  ["heavy-duty-closet-pole-sockets", "detail.jpg", "Close-up of the exact open-lip brushed-nickel socket holding a correctly sized round closet pole."],
  ["kv-rp-0495-bn-shelf-rod-bracket", "place.jpg", "Install this exact brushed-nickel Slide-Thru bracket into a wall stud beneath a 12-inch closet shelf, supporting a matching round closet pole with hangers passing the center support."],
  ["kv-rp-0495-bn-shelf-rod-bracket", "detail.jpg", "Close-up of this exact bracket's snap-in Slide-Thru pole hook and shelf-support geometry, correctly installed."],
  ["korky-100bp-two-inch-toilet-flapper", "place.jpg", "Install this exact red Korky 100BP flapper inside a clean white toilet tank on a standard two-inch flush valve, with its chain connected."],
  ["korky-100bp-two-inch-toilet-flapper", "detail.jpg", "Close-up of this exact red Korky flapper seated over a two-inch flush-valve opening, showing the adjustment control and chain."],
  ["broan-qt20000-charcoal-filter", "place.jpg", "Show this exact Broan BPQTF charcoal filter being fitted into the underside of a compatible non-ducted range hood. Keep the filter rectangular and unchanged."],
  ["broan-qt20000-charcoal-filter", "detail.jpg", "Close-up of this exact charcoal filter's frame, dark media, and thickness beside the compatible range-hood filter slot."],
  ["five-pound-flour-keeper", "place.jpg", "Place this exact Progressive DKS-100 flour keeper in a bright pantry, filled with flour to a realistic level and closed with its fitted lid."],
  ["five-pound-flour-keeper", "detail.jpg", "Close-up of this exact flour keeper's lid seal and included leveling edge, with no labels or invented accessories."]
];

const generatedPromptPath = path.join(root, "catalog/image-prompts.json");
if (existsSync(generatedPromptPath)) {
  const generatedPrompts = JSON.parse(readFileSync(generatedPromptPath, "utf8"));
  for (const [slug, prompts] of Object.entries(generatedPrompts)) {
    jobs.push([slug, "place.jpg", prompts.place], [slug, "detail.jpg", prompts.detail]);
  }
}

async function one(slug, file, prompt) {
  const outDir = path.join(root, "assets/explainers", slug);
  const out = path.join(outDir, file);
  if (existsSync(out)) {
    console.log("skip", slug, file);
    return;
  }
  const product = catalog.products.find((item) => item.slug === slug);
  const imgRes = await fetch(product.image);
  if (!imgRes.ok) throw new Error(`download ${slug} ${imgRes.status}`);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const type = product.image.includes(".png") ? "image/png" : "image/jpeg";
  const form = new FormData();
  form.append("prompt", prompt + tail);
  form.append("size", "1024x1024");
  form.append("quality", "medium");
  form.append("n", "1");
  form.append("output_format", "jpeg");
  form.append("output_compression", "72");
  form.append("image", new Blob([buf], { type }), type === "image/png" ? "product.png" : "product.jpg");
  const url = `${endpoint}/openai/deployments/gpt-image-2/images/edits?api-version=2025-04-01-preview`;
  let last = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { method: "POST", headers: { "api-key": key }, body: form });
    if (res.status === 429 || res.status >= 500) {
      last = await res.text();
      const wait = Number(res.headers.get("retry-after") || 12) * 1000;
      console.log("retry", slug, file, res.status, "in", wait);
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`${slug} ${file} ${res.status} ${text.slice(0, 300)}`);
    const b64 = JSON.parse(text).data?.[0]?.b64_json;
    if (!b64) throw new Error(`${slug} ${file} empty`);
    await mkdir(outDir, { recursive: true });
    await writeFile(out, Buffer.from(b64, "base64"));
    console.log("wrote", slug, file, b64.length);
    return;
  }
  throw new Error(`${slug} ${file} gave up ${last.slice(0, 200)}`);
}

const requested = new Set(process.argv.slice(2));
const queue = jobs.filter(([slug]) => requested.size === 0 || requested.has(slug));
const workers = Array.from({ length: 2 }, async () => {
  while (queue.length) {
    const job = queue.shift();
    await one(...job);
  }
});
await Promise.all(workers);
console.log("scenes done");
