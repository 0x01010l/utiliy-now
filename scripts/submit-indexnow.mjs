import { readFile } from "node:fs/promises";

const site = "https://utiliy.com";
const { key } = JSON.parse(await readFile(new URL("../catalog/indexnow.json", import.meta.url), "utf8"));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPublished(path, expected) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await fetch(`${site}${path}?indexnow=${Date.now()}`, { cache: "no-store" }).catch(() => null);
    if (response?.ok) {
      const text = await response.text();
      if (!expected || text.trim() === expected) return text;
    }
    await wait(5000);
  }
  throw new Error(`The deployed file was not ready: ${path}`);
}

await fetchPublished(`/${key}.txt`, key);
const sitemap = await fetchPublished("/sitemap.xml");
const urlList = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)]
  .map((match) => match[1].replaceAll("&amp;", "&"))
  .filter((url) => url.startsWith(`${site}/`));

if (!urlList.length) throw new Error("No URLs were found in the deployed sitemap.");

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    host: "utiliy.com",
    key,
    keyLocation: `${site}/${key}.txt`,
    urlList
  })
});

if (![200, 202].includes(response.status)) {
  throw new Error(`IndexNow rejected the submission with HTTP ${response.status}: ${await response.text()}`);
}
console.log(`IndexNow accepted ${urlList.length} URLs with HTTP ${response.status}.`);
