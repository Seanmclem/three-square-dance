# Phase 51 — Asset tags: acceptance

Ran 2026-07-27 in **Chrome** (Claude extension) against the user's own project
(`Platfrom Obby` / `level_1`) on the running dev server at `localhost:7373`.
All clicks were real UI clicks; state read via `javascript_tool`.

Checks 8–10 write `manifest.json` through the File System Access API, which no
automation tier can click, so they used the `TESTING.md` §9 **OPFS picker
stub** (`showDirectoryPicker` *and* `showOpenFilePicker` overridden to OPFS
handles seeded from the served manifest / a real `.gltf`). The dialog's
"Saving needs file access" hint confirmed `modelsDir` was ungranted, so every
write went to OPFS — the real `public/assets/models/manifest.json` was verified
byte-unchanged by `git diff --quiet` afterwards.

| # | Check | Expected | Result |
|---|---|---|---|
| 1 | Backfill loaded | 111 assets, none untagged, 19 tiles keep `platformer`+`tile`, counts match the script summary | ✅ 0 untagged; counts exact (cc0 96, platformer 63, platformer-game-kit 63, prop 44, …) |
| 2 | `#` toggle swaps the strip | Chips become tags, frequency-ordered; toggling back keeps the category selection | ✅ `[cc0][platformer][platformer-game-kit][prop]` + `More ▾`; category state preserved both ways |
| 3 | Tag filter narrows | Tile count equals the manifest count for that tag | ✅ `platformer` → 63 shown = 63 expected |
| 4 | Multi-tag **ANDs** | Intersection, not union | ✅ `platformer`+`prop` → 44 (AND) not 63 (OR); toggle reads `#2`; active chips pinned to the strip front |
| 5 | Composes with a category | Count equals assets matching category **and** tag | ✅ `Nature` + `cc0` → exactly 1 tile, **Rock 2** — strictly fewer than both 13 Nature and 96 cc0 |
| 6 | Search still matches tags | Non-zero results for a tag substring absent from every label | ✅ `creature` → 12 shown, 0 label matches, 12 tag matches (regression on `AssetBrowser.tsx:96`) |
| 7 | Empty state | "No results." + working **Clear filters** | ✅ `Nature`+`cc0`+`prop` → empty + Clear; Clear reset category *and* tags (111 back, `#` uncounted) |
| 8 | Single edit **replaces** | Removed chip gone, new chip present, siblings untouched | ✅ `closet`: `interior` removed, `tall-wardrobe` added → `[furniture, cc0, ultimate-furniture-pack, tall-wardrobe]`; `sofa3` untouched |
| 9 | Bulk edit **unions** | Each item keeps its own tags **plus** the new one | ✅ 3 items with different tag sets each gained `bulk-test` and kept everything else — `closet` even retained `tall-wardrobe` from check 8 |
| 10 | Import writes tags | New manifest entry carries the batch tags | ✅ `phase51_tagtest` → `["import-test","foliage"]`, category `Props`, thumbnail written, asset count 111 → 112 |

**Normalization** was exercised inside checks 8 and 10 rather than separately:
`Tall Wardrobe` → `tall-wardrobe` (capitals + space), `Foliage` → `foliage`,
and `import-test,Foliage` committed as two chips on the comma.

**Tag-mode category pill:** with a category active, tag mode renders a
clearable `Nature ✕` pill, so the hidden category filter can't be mistaken for
"the tag filter found nothing". Verified in check 7.

## Regressions (`TESTING.md` §7)

- `npm run typecheck` → 0 errors.
- vite-plugin-checker overlay clean — the custom element is registered but
  renders no error window (`windowRendered: false`, host height 0), matching
  every screenshot.
- Console: **not a clean-load assertion.** `read_console_messages` only starts
  tracking when first called, which was after page load, so it returned no
  messages. No errors surfaced during the interactive run, but a cold-load
  console check would need a reload — deliberately avoided (see below).

## Session hygiene

- Tab titled `🤖 CLAUDE TESTING — Jul 27 4:23pm`, closed at the end.
- Autosave (58 KB) + gamesave snapshotted to an **OPFS backup file** rather
  than 58 slice-dumps into the conversation, and verified byte-identical on
  read-back before any mutation.
- **No reload at any point** and no WorldState mutation — this phase touches
  only the asset library. End-of-session check: autosave had not drifted
  (`autosaveDriftedDuringSession: false`), restore verified, and no test ids
  (`phase51|test_|bulk-test|tagtest`) appear anywhere in the autosave.
- `localStorage.setItem` neutered before closing; OPFS cleaned of this
  session's files only (two prior sessions' backups left alone).
