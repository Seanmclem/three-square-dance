# Phase 51 — Asset tags (models)

> User request (2026-07-27): for assets that get imported, like models, they
> have main categories — it might be nice to add additional "tags" to each for
> better filtering and metadata. How convoluted would having both be?

## Why

Imported models are filed under a single exclusive **category**, and that one
field is doing three unrelated jobs. Live distribution across the 111 assets in
`public/assets/models/manifest.json`:

| Category | Count | What it actually records |
|---|---|---|
| `Platform: Objects` | 44 | which pack it came from |
| `Furniture` | 20 | what the thing is |
| `Pieces` | 19 | which pack it came from |
| `Nature` | 13 | what the thing is |
| `Animals` | 12 | what the thing is |
| `Baked` | 2 | how it was made |
| `Other` | 1 | — |

Three different questions in one single-select shelf, so answering one loses
the others. Visible in the live data:

- Four door assets — `Door1/2/3` under `Furniture`, `Door` under
  `Platform: Objects`. Same kind of object, different shelf, purely because
  they shipped in different packs.
- `Rock 2` sits under `Nature` but its pack is `Ultimate Furniture Pack`. Its
  category records what it is, so where it came from is lost; for `Cannonball`
  the category records the pack, so what it is is lost.
- All 12 `Animals` are animated and 4 `Nature` items are not — nothing in the
  browser can filter on that.

So the panel can't answer "every door", "everything from the platformer kit",
or "every animated CC0 prop".

**The feature is mostly already built and was never finished:**
`AssetDef.tags: string[]` has existed since the original manifest
(`src/types.ts:81`), is serialized, and `AssetBrowser.tsx:96` already matches
search text against it. Missing: authoring (the importer writes `tags: []`),
editing (no field in the metadata dialog), filtering (search-only, no chips).
Only 21 of 111 assets carry tags today (`baked` ×2, `platformer`/`tile` ×19).

**Outcome:** category stays the one exclusive shelf; tags carry everything else
(the pack, what the thing is, the license, `animated`). Categories are left
alone — the platformer `Door` keeps `Platform: Objects` and gains
`platformer`, `prop`, `cc0`, `platformer-game-kit`; `Door1` keeps `Furniture`
and gains `furniture`, `interior`, `cc0`, `ultimate-furniture-pack`. Now
"everything from the platformer kit" and "every CC0 animated asset" both work,
and each asset still has exactly one shelf.

## Decisions

1. **No type change.** `AssetDef.tags` already exists and is required — every
   manifest entry already has the key. Zero migration, zero runtime impact
   (tags are library metadata, never referenced by placed entities).
2. **Bulk edit is add-only.** Single-asset edit replaces the whole list (you
   can see every chip you're removing). Multi-select edit only *unions in* new
   tags — a "replace" across a selection would silently destroy tags that
   aren't visible in the dialog. Two explicit patch fields, one per UI.
3. **Tag chips behind a `#` toggle**, swapping the existing pill strip between
   category and tag mode. The panel header already carries search + strip +
   `More ▾` + Import/Manage; a permanent second row costs grid height every
   session for a filter used occasionally.
4. **Category and tag filters compose** — selecting a category doesn't clear
   active tags and vice-versa; the predicate ANDs them.
5. **Normalize on entry:** trim, lowercase, spaces → `-`, dedupe. Stops
   `CC0`/`cc0`/`cc 0` fragmenting the chip strip.

**Scope:** models only. `SoundDef`/`SkyboxDef` already carry the same
`tags: string[]` field and can follow later for free; `MaterialDef` has no tags
field and is out.

## Implementation

### `src/ui/TagInput.tsx` (new)

Chip list + text input. Enter or comma commits, `✕` per chip, Backspace on an
empty input pops the last chip, `<datalist>` suggestions from a `suggestions`
prop, `disabled` for the bulk apply-checkbox gate.

```ts
const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "-");
```

Shared by the edit dialog and the importer; matches the existing `INPUT` /
`CAT_BTN` palette in those files.

### `src/ui/EditMetadataDialog.tsx`

```ts
export interface EditPatch {
  label?:       string;
  category?:    string;
  attribution?: Partial<Attribution>;
  tags?:        string[];   // single edit — full replacement
  tagsAdd?:     string[];   // bulk edit — union into each selected asset
}
```

`initial` gains `tags`; new **optional** `tagSuggestions` prop, passed only
from the asset call site so the sound/skybox/material call sites are untouched
and the field simply doesn't render for them. TAGS block sits between CATEGORY
and ATTRIBUTION using the existing `S.label` / `ApplyBox` idiom; in bulk mode
it reads "add tags to all N" and is gated by an `ApplyBox`, mirroring
`applyCategory`.

### `src/App.tsx` — `handleConfirmAssetEdit`

`patchEntry` is a generic shallow spread shared by the sound/skybox/material
edit paths — **not widened**; arrays need explicit merge semantics and only
assets are in scope. Tags resolve per-id in the asset handler, for both the
manifest write and the registry update:

```ts
const resolveTags = (a: AssetDef): string[] =>
  patch.tagsAdd ? [...new Set([...a.tags, ...patch.tagsAdd])]
                : (patch.tags ?? a.tags);
```

`tagsAdd` is not an `AssetDef` field and must never reach `updateAsset` — strip
it when building the partial. `tagSuggestions` = the union of all tags across
`assets`.

### `src/ui/ModelImporterModal.tsx`

Shared-batch `TagInput` under the existing "Set all to" category block,
labelled "Tags (optional — applies to all)", mirroring how `AttributionFields`
is already batch-shared. Feeds the asset literal, replacing `tags: []`. No
per-entry tag editing in v1 — packs share tags, same reasoning as attribution.

### `src/ui/AssetBrowser.tsx`

- Generalize the existing recent/strip/overflow machinery over a string list —
  reused verbatim for tags.
- State: `filterMode: "cat" | "tag"`, `activeTags: Set<string>`.
- Tag list derived from `assets`, sorted by frequency desc then alpha
  (frequency, unlike the category strip's recency, is the useful default when
  there may be dozens).
- `#` button on the pill row, showing `#N` when N tags are active so the filter
  stays visible from category mode. Tag chips are **multi-select toggles**,
  unlike the exclusive category pills.
- Predicate: `matchCat && matchTags && matchQ`, where
  `matchTags = activeTags.size === 0 || [...activeTags].every(t => a.tags.includes(t))`.
- Empty result with filters active → "No models match" + Clear, so an
  accidental 2-tag AND doesn't read as a broken panel.

### `scripts/seed-asset-tags.mjs` (one-off backfill)

**Unions** derived tags into each `tags` array — never replaces, so the 19
tiles keep `platformer`/`tile`. Same 2-space JSON formatting, prints a
per-asset summary. Everything derived from data already in the manifest:

| Source | Tags |
|---|---|
| `category: "Platform: Objects"` | `platformer`, `prop` |
| `category: "Pieces"` | `platformer`, `tile` |
| `category: "Furniture"` | `furniture`, `interior` |
| `category: "Nature"` | `nature`, `outdoor` |
| `category: "Animals"` | `animal`, `creature` |
| `category: "Baked"` | `baked` |
| `animations?.length` | `animated` |
| `attribution.license` | slug (`cc0`, `cc-by`, …) |
| `attribution.sourceName` | slug of the pack name |

Manifest committed on its own so a bad derivation is one `git revert` away.

## Acceptance

`test-plans/phase-51-asset-tags.md` — browser pass per `TESTING.md` §3 (golden
path, autosave snapshot/restore) with the §9 OPFS `showDirectoryPicker` stub
for the three checks that write the manifest through the File System Access
API.

## Out of scope

- Sounds / skyboxes (field exists; trivial follow-up).
- Materials (`MaterialDef` has no `tags` field).
- Per-entry tag editing in the importer (batch-shared only, like attribution).
- Tag rename/merge management UI.
