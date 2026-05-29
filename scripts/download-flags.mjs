/**
 * Download all country-flag emoji PNGs from the Google emoji CDN
 * (same source used by emoji-picker-react in EmojiStyle.GOOGLE mode)
 * and save them to public/flag-emojis/{unified}.png
 *
 * Run once: node scripts/download-flags.mjs
 */
import { mkdirSync } from "node:fs";
import { writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(ROOT, "public", "flag-emojis");

mkdirSync(OUTPUT_DIR, { recursive: true });

// Load emoji-picker-react's own data to get the exact unified codes it uses
const emojiData = JSON.parse(
  await readFile(
    join(ROOT, "node_modules", "emoji-picker-react", "dist", "data", "emojis.json"),
    "utf8",
  ),
);

const FLAG_RE = /^1f1[0-9a-f]{2}-1f1[0-9a-f]{2}$/i;
// emojis.json is { categories: [...], emojis: { category: [...] } }
const allEmojis = Object.values(emojiData.emojis).flat();
const flagCodes = allEmojis
  .filter((e) => FLAG_RE.test(e.u))
  .map((e) => e.u);

const BASE_URL =
  "https://cdn.jsdelivr.net/npm/emoji-datasource-google/img/google/64/";

console.log(`Downloading ${flagCodes.length} flag emoji PNGs…`);

let ok = 0;
let fail = 0;

for (const unified of flagCodes) {
  const url = `${BASE_URL}${unified}.png`;
  const dest = join(OUTPUT_DIR, `${unified}.png`);
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`  ✗ ${unified}  HTTP ${resp.status}`);
      fail++;
      continue;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    await writeFile(dest, buf);
    ok++;
    process.stdout.write(`  ✓ ${unified}\n`);
  } catch (err) {
    console.error(`  ✗ ${unified}  ${err.message}`);
    fail++;
  }
}

console.log(`\nDone: ${ok} downloaded, ${fail} failed.`);
if (fail > 0) process.exit(1);
