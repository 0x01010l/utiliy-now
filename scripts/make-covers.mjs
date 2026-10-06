import { mkdir, writeFile, rename } from "node:fs/promises";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/$/, "");
const key = process.env.AZURE_OPENAI_API_KEY || "";
if (!endpoint || !key) {
  console.error("Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY.");
  process.exit(1);
}

const mono = " Strictly black and white. Grayscale only. No color, no tint, no warmth. White, black, and gray only. Editorial photograph, soft gray light. No text, no letters, no numbers, no logos, no watermark.";

const covers = [
  ["home.jpg", "1536x1024", "Black and white architectural photograph, camera low and close, of a stainless corner shower shelf on glossy white subway tile. Hard window light, long sharp shadows, the wire grid filling most of the frame, empty shelves, no labeled bottles, gallery print, tack-sharp metal."],
  ["bathroom.jpg", "1024x1024", "Black and white close photograph of a two-tier stainless corner wire shelf on white tile, adhesive mounts visible, graphic geometry, hard sidelight, no product labels, museum catalog quality."],
  ["kitchen.jpg", "1024x1024", "Black and white overhead photograph of an open white kitchen drawer with exactly four bamboo dividers and simple utensils, strong graphic contrast, crisp edges, still-life lighting."],
  ["closet.jpg", "1024x1024", "Black and white photograph of one slim metal closet rod in a tall pale closet, a single white shirt on a hanger, vast empty wall, precise and quiet."],
  ["furniture.jpg", "1024x1024", "Black and white macro photograph of a wooden chair leg on a clear square slider over hardwood, raking light, rich grain, sharp focus, no logos."],
  ["cable.jpg", "1024x1024", "Black and white architectural photograph of a slim white cable cover running along a white baseboard, one clean leading line through a bright empty room."],
  ["door.jpg", "1024x1024", "Black and white close photograph of the bottom of a white door, a dark brush sweep touching a pale floor, graphic horizontal bands, sharp focus."],
  ["checkout.jpg", "1536x1024", "Black and white still life of a matte parcel on white stone, hard side light, one sculptural shadow, no tape printing, no labels, gallery lighting."]
];

async function post(url, options) {
  let last = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, options);
    if (res.status === 429 || res.status >= 500) {
      last = await res.text();
      const wait = Number(res.headers.get("retry-after") || 12) * 1000;
      console.log("retry", res.status, "in", wait);
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 240)}`);
    const b64 = JSON.parse(text).data?.[0]?.b64_json;
    if (!b64) throw new Error("empty image");
    return Buffer.from(b64, "base64");
  }
  throw new Error(last.slice(0, 200));
}

async function cover(file, size, prompt) {
  const out = path.join(root, "assets/covers", file);
  if (existsSync(out)) {
    console.log("skip", file);
    return;
  }
  const buf = await post(`${endpoint}/openai/deployments/gpt-image-2/images/generations?api-version=2025-04-01-preview`, {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      prompt: prompt + mono,
      n: 1,
      size,
      quality: "high",
      output_format: "jpeg",
      output_compression: 75
    })
  });
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, buf);
  console.log("wrote", file, buf.length);
}

async function monochrome(file) {
  const stamp = file + ".mono";
  if (existsSync(stamp)) {
    console.log("skip", path.basename(file));
    return;
  }
  const buf = readFileSync(file);
  const form = new FormData();
  form.append("prompt", "Turn this photograph into a black and white print. Keep the same objects and the same framing. Remove every color." + mono);
  form.append("size", "1024x1024");
  form.append("quality", "medium");
  form.append("n", "1");
  form.append("output_format", "jpeg");
  form.append("output_compression", "75");
  form.append("image", new Blob([buf], { type: "image/jpeg" }), "photo.jpg");
  const next = await post(`${endpoint}/openai/deployments/gpt-image-2/images/edits?api-version=2025-04-01-preview`, {
    method: "POST",
    headers: { "api-key": key },
    body: form
  });
  const tmp = file + ".next";
  await writeFile(tmp, next);
  await rename(tmp, file);
  await writeFile(stamp, "bw\n");
  console.log("mono", path.basename(path.dirname(file)), path.basename(file), next.length);
}

const explainers = readdirSync(path.join(root, "assets/explainers"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => ["place.jpg", "detail.jpg"].map((name) => path.join(root, "assets/explainers", entry.name, name)))
  .filter((file) => existsSync(file));

const jobs = [
  ...covers.map((item) => () => cover(...item)),
  ...explainers.map((file) => () => monochrome(file))
];
const queue = jobs.slice();
await Promise.all(Array.from({ length: 2 }, async () => {
  while (queue.length) {
    const job = queue.shift();
    await job();
  }
}));
console.log("covers done");
