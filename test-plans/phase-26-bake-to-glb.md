# Phase 26 — Bake Shapes to GLB — Test Plan

Verified 2026-07-08 during implementation (v4.17.0) via Chrome MCP against real UI
paths where automatable. Re-run after changes to `bakeShapes`, `ShapeBuilder.buildMeshes`,
`assetLibraryWriter`, the `AssetDef.colliders` preference chain, or BakeDialog.

**Automation limits (by design, not gaps):** `showDirectoryPicker` / `showSaveFilePicker`
are native OS dialogs — un-automatable and they freeze the tab for MCP. The FSA write
paths reuse ModelImporterModal's proven pattern; the data path was verified by writing
the baked GLB + manifest entry into `public/assets/models/` directly (Bash) and
round-tripping through `initAssets`. First human bake should sanity-check both pickers.

Test subject: 3 console-spawned boxes — two sharing the registry "concrete" material,
one with a color override (distinct material instance) + rotation (x:30, y:15), plus
one yaw-only (y:45).

## M1 — bake core

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | GLB binary | magic "glTF", version 2 (decoded from the ArrayBuffer) | ✅ |
| 2 | Merge by material | 3 shapes (6 build meshes) → **2 meshes / 2 materials** (shared-material shapes collapse; override stays separate) | ✅ |
| 3 | Textures | images embedded; samplers wrapS/T = 10497 REPEAT (metric UV tiling survives) | ✅ |
| 4 | Pivot | merged geometry bbox: minY = 0, centerX/Z = 0 exactly (tilted shape's dip defines the base) | ✅ |
| 5 | Colliders | plain box → exact 2×2×2; yaw-45 → exact + `rotationY:45`; tilted → conservative AABB (2.45×2.96×3.12), no rotationY | ✅ |
| 6 | No physics leakage | `buildMeshes` contains no ColliderBuilder calls (build() composes it + registers) | ✅ code-level |

## M2 — outputs + integration

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | Manifest round-trip | entry with `colliders[3]` loads through initAssets | ✅ |
| 2 | Placed copies | 2 copies render **2 meshes each** (vs 6 shape-meshes per source copy) | ✅ |
| 3 | Preset collider raycasts | after one `physicsWorld.step()`: plain box top **2.6124** exact; 45°-yaw box hit at x-offset 1.2 (outside an unrotated box, inside the diamond) top 2.6124; corner probe outside diamond → no hit; AABB box top **2.9568** exact | ✅ mm-exact |
| 4 | Bake button (single shape) | Actions → "Bake → GLB asset" opens BakeDialog (name, 2 checkboxes, keeps-sources note) | ✅ |
| 5 | Multi-select gating | all-shapes selection shows the button; mixed (shape+object) hides it | ✅ |
| 6 | Colliders screen | placed baked copy summary = `auto (3 boxes)`; Customize seeds from the preset | ✅ (summary verified; seeding code-shared) |
| 7 | Save-locally path | showSaveFilePicker (.glb) + anchor fallback; cancel skips file, library write proceeds | ⚠ human check (native dialog) |
| 8 | Library write via FSA | writeAssetToLibrary glb+thumb+manifest splice | ⚠ human check (native dialog) |

## Regressions

- `npm run typecheck` 0 errors; existing assets unaffected (`def.colliders` undefined →
  auto-box fallthrough byte-identical); user's world (3 shapes) preserved; manifest
  restored byte-exact after testing (git-clean).

## Known v1 limits (by design)

- Baked copies are frozen — no face/vertex/edge editing; re-bake the sources instead
  (same name replaces the asset).
- Tilted source shapes get conservative AABB preset boxes (`"hull"` reserved).
- Displacement maps dropped on export (no glTF 2.0 slot; normal maps carry relief).
- No "replace selection with baked copy" one-click swap yet.
