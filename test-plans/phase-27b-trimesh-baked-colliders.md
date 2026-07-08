# Phase 27b — Trimesh Attached Colliders — Test Plan

Verified 2026-07-08 during implementation (v4.19.0) via Chrome MCP. Re-run after
changes to the `_attachedDesc` trimesh arm, the bake collider rule, or the
ColliderEditor `_pointsGeometry` path.

Test subject: hand-authored concave L-prism face-brush (L footprint CCW from above,
extruded y 0→2; 12 verts, 8 face loops — phase 23's concave idiom), baked, preset
attached to a placed test object via `updateObject({ colliders })`.

## Checks

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | Bake rule | face-brush source → `shape:"trimesh"`, 12 points, 20 tris (4+4 caps + 6×2 sides), size = AABB | ✅ |
| 2 | Solid arms | vertical rays over both L arms hit at exactly **2** | ✅ |
| 3 | Concavity preserved | ray in the carved notch quadrant → **no hit** (phase-27 hull reported 2 there) | ✅ |
| 4 | Inner wall | horizontal ray inside the notch hits the inner wall at exactly **0.9** | ✅ |
| 5 | Panel card | "20 tris · exact from bake"; no Refit (hull-only); shape buttons convert away via points-AABB | ✅ |
| 6 | Wireframe | one trimesh wireframe rendered from points+indices | ✅ |
| 7 | Non-face-brush sources | still hull (phase 27 battery unchanged) | ✅ (code-gated: `isFaceBrush` branch) |

## Regressions

- typecheck 0 errors; hull/box/sphere/capsule arms untouched; user's world (3 shapes)
  preserved; cleanup autosave verified (no test_* entities persisted).

## Known limits (by design)

- Trimesh is not user-switchable on arbitrary objects (no auto-fit from render
  meshes; that's the future decimation-slider phase). It arrives via bake presets.
- Hollow surface: nothing spawned inside a trimesh gets depenetrated; thin extrusions
  can tunnel at extreme speeds (same as live face-brushes).
