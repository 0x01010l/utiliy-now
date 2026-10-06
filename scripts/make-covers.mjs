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
  ["home.jpg", "1536x1024", "A quiet white-tile shower corner with a stainless wire shelf, lots of pale gray space, premium home catalog."],
  ["bathroom.jpg", "1024x1024", "A stainless corner shelf on smooth white tile, seen from the side, empty of brands."],
  ["kitchen.jpg", "1024x1024", "An open white kitchen drawer with simple bamboo dividers, shot from above."],
  ["closet.jpg", "1024x1024", "A slim metal closet rod between two pale walls, a few light garments hanging."],
  ["furniture.jpg", "1024x1024", "The bottom of a wooden chair leg standing on a hardwood floor."],
  ["cable.jpg", "1024x1024", "A slim cord cover running along a white baseboard on a pale floor."],
  ["door.jpg", "1024x1024", "The bottom of a white door with a dark brush sweep meeting a light carpet."],
  ["checkout.jpg", "1536x1024", "A plain sealed parcel on a white table, no labels, no tape printing, quiet studio light."]
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
      quality: "medium",
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
