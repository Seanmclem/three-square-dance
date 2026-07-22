# Phase 43 — Platformer-Kit Tile Assets (prefab plan, slice 1 of 6)

> User request (2026-07-21): reimplement the old ecctrl project's `DynamicPlatform`
> (a width×depth grass platform tiled from `Cube_Grass_Corner/Side/Center` GLTFs) in
> this editor, and build a general **prefab** system — reusable entity+script groupings
> with configurable variables, where placed instances stay linked to the source prefab.
> This phase is the asset groundwork; the prefab system itself lands in phases 44+.

## Decisions (made with the user)

- DynamicPlatform will be a **generator prefab** (params → grid of per-tile objects),
  not a new entity type — zero new ZoneManager machinery, and it exercises the prefab
  variable pipeline.
- Prefab library will live in **project `game.json`** (`GameConfig.prefabs`), with a
  localStorage fallback for no-project sessions.
- Import scope now: **platform tiles + the 3D Tall set** (19 assets). More kit content
  (Nature, Powerups, Enemies…) can come later through the normal Import Model UI.
- Prefab editing will use an **isolated edit mode** (Unity prefab-mode style).

## What this phase ships

19 models from `/Users/seanclements/Downloads/platformerkit/Modular Platforms/` copied
to `public/assets/models/<slug>.gltf` + manifest entries. **No src changes.**

| Family | Slugs |
|---|---|
| Single Height (6) | `platform_{grass,dirt}_{center,side,corner}` |
| Single Cube (2) | `platform_{grass,dirt}_single` |
| 3D Tall (11) | `platform_grass_{center,corner,side,bottom,corner_bottom,corner_center,side_bottom,side_center}_tall`, `platform_dirt_{center,corner,side}_tall` |

- Category **"Tiles"** (custom `AssetCategory` string → own pill in AssetBrowser),
  `collidable: true`, `colliderType: "box"`, tags `["platformer", "tile"]`.
- Attribution: Quaternius, *Ultimate Platformer Pack*, CC0 (matches the library's
  existing Quaternius entries; the download ships no license file — identified by the
  pack's folder/export conventions).
- `Cube_Dirt_Center_Tall.gltf` referenced an external 104-byte `.bin`; its buffer was
  **inlined to a base64 data URI** so every library gltf stays single-file (the
  importer/re-import flows assume that).
- Thumbnails deferred: entries ship without `thumbnail`, so AssetBrowser shows its
  3-letter fallback tiles. A browser re-stage session (Manage → 📷) generates the
  `_thumb.png`s later.

## Collider design (the non-obvious part)

Measured from the gltf accessors — the kit tiles are **shells, not solids**:

- Grass Single Height tiles are thin caps: top surface at y≈0.996 with a skirt down to
  y≈0.527 (and `Cube_Grass_Center` is a *completely flat plane* — an auto-box from its
  AABB would be zero-height). → All 3 get an explicit slab box `{2, 0.5, 2}` with the
  top at exactly y = 1 (offset y 0.75).
- Dirt Single Height + Single Cube pieces are full 2×2×2 solids → auto-box.
  Exception: `platform_grass_single`'s skirt overhangs to ±1.117, so it gets an
  explicit `{2,2,2}` cube to keep the collider at the logical footprint.
- Four Tall pieces are single flat planes: `platform_{grass,dirt}_center_tall` (y=+1),
  `platform_grass_bottom_tall` (y=−1), `platform_grass_side_center_tall` (z=+1).
  → thin boxes over their faces (`{2,0.1,2}` at y±0.95 / `{2,2,0.1}` at z 0.95).
- The remaining Tall pieces are full-height shells → auto-box (grass corner/side AABBs
  are ~±1.12 from skirts; the ~12cm oversize is accepted).

Tile geometry facts for the phase-44 generator: footprint 2×2 world units
(x/z ∈ [-1,1]), walkable top at **origin.y + 1**; Corner's outward skirt faces at
rotY 0 are −X/+Z; Side's outward face is +Z.

## Verification

- `npm run typecheck` clean (guard — manifest-only change).
- All 19 gltf files parse and every buffer uri starts with `data:` (scripted check).
- Browser pass (with the tiled-platform phase): Tiles pill appears, tiles place,
  slab/plane colliders walkable in preview.

Import script (repeatable): session scratchpad `import_tiles.py` (copies, inlines
external buffers, appends manifest entries with fresh collider ids; dedupes by id).
