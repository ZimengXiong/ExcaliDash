import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function buildGallery(directory, captures) {
  const images = [];
  for (const name of captures) {
    const bytes = await readFile(resolve(directory, `${name}.png`));
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
    const file = `${name}-${hash}.png`;
    await writeFile(resolve(directory, file), bytes);
    images.push(
      `<a href="${file}"><img src="${file}" alt="${name}" loading="lazy"></a>`,
    );
  }
  await writeFile(
    resolve(directory, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ExcaliDash captures</title><link rel="license" href="CREDITS.txt"><style>body{margin:0;padding:24px;background:#111;display:grid;gap:24px}a{display:block;margin:auto;max-width:1600px;width:100%}img{display:block;width:100%;height:auto}a[href*="mobile"]{max-width:430px}</style></head><body>${images.join("")}<!-- Source licenses and attribution: CREDITS.txt and sources.json. --></body></html>`,
  );
}
