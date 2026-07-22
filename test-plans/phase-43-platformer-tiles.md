# Test Plan — Phase 43: Platformer-Kit Tile Assets (v4.37.0)

Manifest-only change: 19 Quaternius platform tiles added to `public/assets/models/`
under new category "Tiles". No src changes.

## Automated / console checks (done at import time)

- [x] `npm run typecheck` → 0 errors.
- [x] All 19 `platform_*.gltf` files parse as JSON and every `buffers[].uri` is a
      `data:` URI (incl. the inlined `platform_dirt_center_tall`).
- [x] `manifest.json` has 19 `category: "Tiles"` entries (67 assets total), each with
      `collidable: true`, attribution Quaternius/CC0; the 8 shell/plane pieces carry
      explicit `colliders[]` (3 slab, 1 cube, 4 thin-plane).

## Browser pass (Chrome MCP or human — folded into the phase-44 session)

Setup: TESTING.md §3 golden path (snapshot autosave, tag tab title, close tab after).

- [ ] AssetBrowser (ASSETS → Models) shows a **Tiles** category pill; selecting it
      lists 19 entries with 3-letter fallback tiles (no thumbnails yet).
- [ ] Place `platform_grass_center`: ghost previews, commits on click, mesh is a flat
      green cap ~2×2 at the placed spot.
- [ ] Select the placed tile → Colliders screen shows the preset box (not "auto box"):
      slab `2 × 0.5 × 2`.
- [ ] Enter preview near the tile (place it at y=0): character can stand on top at
      y≈1; walking off the edge falls (slab, not a full-height wall).
- [ ] Place `platform_grass_side` and `platform_grass_corner` beside it — skirts face
      outward consistently when rotated with R.
- [ ] Place `platform_dirt_single`: full 2×2×2 cube, blocks walking at its sides.
- [ ] Place `platform_grass_center_tall` (flat plane): visible as a flat green sheet;
      collider is the thin top box — standing on it works, no fall-through.
- [ ] `platform_dirt_center_tall` renders (inlined buffer loads — not the orange
      fallback box).
- [ ] Console clean (no gltf load errors, no missing-file warnings for Tiles).
- [ ] FpsCounter sanity with ~20 tiles placed: draw calls rise modestly, worst-ms
      stays at baseline (PROFILING.md §8).

## Follow-up (separate session)

- [ ] Thumbnail re-stage for all 19 tiles (AssetBrowser Manage → 📷, or TESTING.md §9
      OPFS stub), then verify `_thumb.png`s appear in the grid.
