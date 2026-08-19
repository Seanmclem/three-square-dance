# Asset facet filters (v4.65.0 + v4.66.0) — acceptance

Ran 2026-08-10 in **Chrome** (Claude extension) against the user's own project
(`Platfrom Obby` / `level_1`) on the running dev server at `localhost:7373`.
All clicks were real UI clicks; state read via `javascript_tool`.

Two changes, verified in one pass:

- **v4.65.0** — the Sounds panel gained the `Categories | Tags` facet switcher
  (`SoundDef.tags` was write-only: authored in the importer and the Edit Metadata
  dialog, reachable in the browser only through the free-text search).
- **v4.66.0** — `attribution.sourceName` (kit/pack) and `attribution.author` became
  facets in **all six** browsers, appearing only when they can split the library:
  **≥2 distinct values AND at least one value shared by ≥2 items**.

No world mutations were made, so `localStorage.setItem` was neutered immediately after
the snapshot instead of restoring at the end; the autosave was verified byte-identical
(158517 chars, `_ts` 1786381094932 unchanged) before closing the tab. `git status
public/games/` was clean.

## Expected facets per library (from today's manifests)

| Panel | n | Facets shown | Why the others are hidden |
|---|---|---|---|
| Models | 142 | Categories, Tags, **Pack** | Author: 139/142 are Quaternius → 1 distinct value |
| Sounds | 65 | Categories, Tags, **Author** | Pack: one kit ("Digital Audio") |
| Skyboxes | 8 | Categories, Tags, **Author** | Pack: one kit ("Skyboxes") |
| Materials | 9 | Categories | No `tags` field; `sourceName` is per-texture (all singletons); 1 author |
| Graphics | 5 | Categories | No `tags` field; 1 pack, 1 author |
| Decals | 9 | Categories | No `tags` field; no attribution filled in |

## Checks

| # | Check | Expected | Result |
|---|---|---|---|
| 1 | Sounds: switcher exists | `Categories \| Tags` segments render above the strip | ✅ (v4.65.0) |
| 2 | Sounds: tag chips | `#tag count`, frequency-ordered | ✅ `#kenney 62  #test 3  #loop 2  #ambience 1  #sfx 1` |
| 3 | Sounds: tag filters | Row count equals the manifest count | ✅ `#test` → 3 rows (Test Ambient / Test Blip / Test Music Loop) |
| 4 | Sounds: multi-tag **ANDs** | Intersection, not union | ✅ `#test`+`#loop` → 2 (both carry loop), segment reads `Tags 2` |
| 5 | Sounds: composes with category | Category **and** tags | ✅ `Music` + `#test`+`#loop` → 1 row; `Music ✕` chip surfaced while the tag strip showed |
| 6 | Sounds: `clear` | Resets every facet | ✅ all 65 back, badge and `clear` gone |
| 7 | Facet auto-hide | Only the qualifying facets render (table above) | ✅ Models `Categories\|Tags\|Pack`; Sounds/Skybox `Categories\|Tags\|Author` |
| 8 | Single-facet panels unchanged | No segmented control at all | ✅ Materials / Graphics / Decals show only their category pill row |
| 9 | Models: pack values + counts | The three real kits with counts, no `More ▾` | ✅ `Platformer Game Kit 107`, `Ultimate Furniture Pack 20`, `Ultimate Animated Animal Pack 12` |
| 10 | Models: pack filters | Tile count equals the kit's manifest count | ✅ 142 → **20** for Ultimate Furniture Pack; segment reads `Pack 1` |
| 11 | Cross-facet chip | A live pack surfaces while another facet's strip is showing | ✅ `Ultimate Furniture Pack ✕` chip in Tags mode, tiles still 20 |
| 12 | Pack ∩ tag is a real AND | Empty when the intersection is genuinely empty | ✅ pack + `#prop` → "No results." — 0 expected (no furniture item is tagged `prop`, checked against the manifest) |
| 13 | Empty-state "Clear filters" | Resets pack/author too, not just category+tags | ✅ 142 tiles back, all segments uncounted |
| 14 | Sounds: author facet | Values with counts, filters correctly | ✅ `Kenney 62` / `Synthesized fixture 3`; picking the latter → exactly the 3 fixtures |
| 15 | Skyboxes: tags render | Chips with counts | ✅ `#sky 3` + eight singletons |
| 16 | Materials: category still filters | Filtering works through the new facet state | ✅ `Ground` → 1 tile (Paving Stones - Tiny) |
| 17 | Category convention preserved | Sounds/skybox category pills stay **bare and alphabetical** | ✅ `All Ambient Music SFX` — no counts (per v4.48.1, the count is part of what marks a tag chip) |
| 18 | `MaterialCategoryPills` intact | Domain ordering + its own popout, not flattened to count order | ✅ passed as `categorySlot`, rendered outside the `overflow: auto` strip so the popout isn't clipped |
| 19 | No console errors | Clean console, no checker overlay | ✅ 0 errors; the `vite-plugin-checker-error-overlay` element exists but its shadow root holds only the style template (0 messages) |
| 20 | `npm run typecheck` | 0 errors | ✅ |

## Notes / gotchas hit

- **React batches, so two clicks in one `javascript_tool` call fail**: clicking
  `Categories` then reading for a `Music` button in the same snippet throws — the
  re-render hasn't happened yet (TESTING.md §3.8). One action per call.
- Facet **counts are computed over the whole library**, not the currently-filtered set
  (matching pre-existing AssetBrowser behaviour), so `#prop 51` still reads 51 while a
  pack filter has the grid down to 20. The count answers "how many carry this", not
  "how many would survive".
- The visibility rule means **importing content changes which controls exist**. If a
  panel "loses" a segment, the data no longer splits: e.g. delete every sound but
  Kenney's and the Author segment disappears on its own.

## Addendum (2026-08-19) — "(no pack)" bucket

User report: the Pack facet — the original ask's "source/kit" filter — was
invisible in the Sounds panel. Root cause: the library is 62 sounds from one
kit ("Digital Audio") + 3 unlabeled fixtures, and `buildFacets` dropped blanks,
so Pack had one distinct value and auto-hid. Fix: `FacetSpec.blankBucket` —
unlabeled items form a synthetic "(no pack)" chip, and "one real kit shared by
≥2 + ≥1 unlabeled item" now counts as a showable split. Verified in-browser:

| # | Check | Expected | Result |
|---|---|---|---|
| 21 | Sounds: Pack segment visible | Renders alongside Categories/Tags/Author | ✅ `Pack` segment appears |
| 22 | Sounds: pack chips | `Digital Audio 62` + `(no pack) 3` | ✅ both, count-ordered |
| 23 | `(no pack)` filters | Exactly the 3 synthesized fixtures | ✅ Test Ambient / Test Blip / Test Music Loop |
| 24 | `Digital Audio` filters | The 62 Kenney sounds, fixtures gone | ✅ |
| 25 | Skyboxes | Same rule applies: `Skyboxes 5` + `(no pack) 3` | ✅ Pack segment now shows (was hidden) |
| 26 | Materials/Graphics/Decals | Unchanged (singleton sourceNames still fail the shared-by-≥2 clause) | ✅ no Pack/Author segments |
| 27 | Models | Unchanged (Pack via 3 kits, no unlabeled → no synthetic chip) | ✅ Categories/Tags/Pack |
