#!/usr/bin/env node
// Phase 51 one-off: seed `tags` on the existing model manifest so the new tag
// filter isn't empty on day one. Everything is derived from data already in the
// manifest (category, animations, attribution) — nothing is invented.
//
// UNIONS into each asset's existing tags; never replaces. Re-running is a no-op.
//
//   node scripts/seed-asset-tags.mjs [--dry]

import { readFileSync, writeFileSync } from "node:fs";

const MANIFEST = "public/assets/models/manifest.json";
const dry = process.argv.includes("--dry");

// Category → what the thing is / where it came from. Categories currently mix
// both axes; tags let each asset carry the ones its category had to drop.
const BY_CATEGORY = {
  // `prop`, not `kit`: both of these categories come from the Platformer Game Kit
  // (provenance is already carried by the pack-name tag), so the useful distinction
  // is what they ARE — loose props vs modular terrain tiles.
  "Platform: Objects": ["platformer", "prop"],
  "Pieces":            ["platformer", "tile"],
  "Furniture":         ["furniture", "interior"],
  "Nature":            ["nature", "outdoor"],
  "Animals":           ["animal", "creature"],
  "Baked":             ["baked"],
};

const slug = s => s.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

const derive = a => {
  const out = [...(BY_CATEGORY[a.category] ?? [])];
  if (a.animations?.length) out.push("animated");
  if (a.attribution?.license)    out.push(slug(a.attribution.license));
  if (a.attribution?.sourceName) out.push(slug(a.attribution.sourceName));
  return out;
};

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
let changed = 0;

for (const asset of manifest.assets) {
  const before = asset.tags ?? [];
  const after  = [...new Set([...before, ...derive(asset)])];
  if (after.length !== before.length) {
    console.log(`  ${asset.id.padEnd(34)} +${after.filter(t => !before.includes(t)).join(" +")}`);
    changed++;
  }
  asset.tags = after;
}

const counts = {};
for (const a of manifest.assets) for (const t of a.tags) counts[t] = (counts[t] ?? 0) + 1;

console.log(`\n${changed}/${manifest.assets.length} assets gained tags. Resulting tag counts:`);
for (const [t, n] of Object.entries(counts).sort((x, y) => y[1] - x[1])) console.log(`  ${String(n).padStart(3)}  ${t}`);

if (dry) { console.log("\n--dry: nothing written."); process.exit(0); }
// No trailing newline — matches how the editor's FSA write-back formats the file.
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
console.log(`\nWrote ${MANIFEST}`);
