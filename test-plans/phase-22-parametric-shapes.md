# Phase 22 — Parametric Shape Primitives — Test Plan

Verified 2026-07-07 during implementation (v4.9.0), via Chrome MCP against the real UI
paths (toolbar clicks, canvas placement clicks, gizmo drags, React panel inputs, preview
walks). Re-run after any change to `ShapeBuilder`, `ShapeTool`, `registerShape`, or the
ZoneManager shape lifecycle.

Console-driven setup helpers: `__test.spawnShape({ kind, x, z })`,
`__world.addShape/updateShape/removeShape("demo", ...)` (mutator methods rebuild AND
persist — TESTING.md §3).

## 1. Data model + builder (M1)

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | `addShape` cylinder (r1, h2, 6 seg) at y=0.5 | Mesh appears; 24 tris; world minY=0.5, maxY=2.5, maxR=1; userData `{editorType:"shape", selectable:true, floorLevel:0}` | ✅ exact |
| 2 | Flat vs smooth normals | 6 seg → 6 distinct flat side normals; 32 seg → 33 smooth dirs, frustum tilt ny=(rB−rT)/slant | ✅ tilt 0.33 exact |
| 3 | `updateShape` live rebuild | radiusTop/segments/rotation changes swap the mesh in ≤1 frame; exactly 1 mesh | ✅ |
| 4 | 8 rapid `updateShape` calls | Token pattern: exactly 1 mesh survives, tris match last edit | ✅ 144 tris (36 seg) |
| 5 | Wedge ramp (hL=0) | 8 tris; sloped top normal (0, d, rise)/‖·‖ | ✅ (0,.894,.447) exact |
| 6 | Flex box taper/shear | 12 tris; 6 planar quads; tilted side normals | ✅ |
| 7 | Serialization | shape in `toJSON().zones[0].shapes`; old saves without `shapes` load clean | ✅ |
| 8 | Undo/redo | Cmd+Z removes added shape (mesh+data); redo restores the transaction state | ✅ |
| 9 | Cleanup | `__test.cleanup()` removes `test_*` shapes | ✅ |

## 2. Colliders + preview (M2)

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | Ray down onto cylinder (r1 h2 at y0) | Hit at y=2.000 | ✅ exact |
| 2 | Ray into side | Hit at center + radius (x=3.000) | ✅ exact |
| 3 | 4-seg prism rotated 45° | Side hit at 2 + 1/√2 = 2.707 | ✅ exact |
| 4 | Walk into cylinder (preview, manual stepping) | Blocked at surface + capsule radius (z=6.31), holds 500 frames, no tunneling | ✅ |
| 5 | Teleport onto cylinder top | Stands stably (y = top + body offset) | ✅ 2.91 |
| 6 | Remove shape | Collider count −1 (no orphans) | ✅ |

## 3. Selection / gizmo / panel / delete (M3)

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | Click-select in viewport | Blue tint; panel header `CYLINDER · LEVEL 0`, Geometry `r 1 · 16 seg`, Material rows | ✅ |
| 2 | Geometry screen edit (SEGMENTS input, real React input+focusout) | Debounced `updateShape` → rebuild (16→6 seg, 24 tris) | ✅ |
| 3 | Gizmo translate (real drag on Y arrow) | Commits position delta; panel position field re-syncs | ✅ y 0→0.781 |
| 4 | Gizmo rotate (real ring drag past ±90°) | Commits absolute yaw gimbal-safe; mesh/data/panel all agree; X/Z preserved | ✅ −107.58° |
| 5 | Delete key | Mesh + collider + data removed, panel deselects | ✅ |
| 6 | Undo after delete | Shape restored with accumulated edits | ✅ |

## 4. Tool + toolbar + kinds (M4)

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | Shape toolbar button | Variants popover (Cylinder/Wedge/Box); hint text per kind | ✅ |
| 2 | Cylinder placement | Click center → ghost radius follows → click commits (snapped radius, base on clicked surface, auto-select) | ✅ |
| 3 | Wedge placement | Two-click footprint; hL=0/hH=1.5 defaults | ✅ 2×2.5 |
| 4 | Walk up ~31° ramp | Climbs to top (peak y ≈ 1.5 + body offset) and over | ✅ 2.41 |
| 5 | 50° wedge (hH=3) | NOT climbable — pinned at slope base (KCC 45° max) | ✅ |
| 6 | Box placement + taper/shear | Third variant places; params drive obelisk form | ✅ |
| 7 | UV density on slanted faces | Brick courses on tapered box match the wall behind (metric UVs) | ✅ visual |
| 8 | Escape mid-placement | Ghost removed, nothing added | ✅ |

## 5. Integrations (M5)

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | Cmd+C / Cmd+V | Pasted clone: new `shape_*` id, +1/+1 offset, groupIds cloned, mesh built | ✅ |
| 2 | Group hide/show (`group:visibility`) | All member shape meshes toggle | ✅ |
| 3 | Script `despawn_object` targeting a GROUP | Fan-out hides member shapes + disables colliders; restored on preview exit | ✅ |
| 4 | Script `move_object` on a shape | Mesh+collider move (runtime-only); `toJSON` data untouched | ✅ |
| 5 | Floor dimming | Shape on inactive level dims to 0.15 opacity; restores | ✅ |

## Regressions

- `npm run typecheck` → 0 errors after every milestone. ✅
- No new console errors (only pre-existing Toolbar style-shorthand warning + extension
  pointer-lock exceptions). ✅
- Existing content picks/undo/preview unaffected (shapes are additive arms everywhere;
  `removeShape` never touches `zone.nodes`). ✅

## 6. Phase 22b (v4.10.0) — brush editing · resize handles · cap/side materials

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | Shape with `sideMaterial` | 2 meshes (cap 4 tris + side 8 tris on a box), 2 distinct materials, BOTH selectable | ✅ |
| 2 | Convert to Brush (panel button) | `mesh.vertices` = 8 baked corners, hull mesh, 8 amber handles, panel switches to brush UI | ✅ |
| 3 | Drag a corner sphere | Hull morphs live; vertex snapped 0.25 local; one undo step | ✅ (1,2,−1)→(2,3,−2.25) |
| 4 | + Add corner → click a face | Vertex inserted at hit point (9 corners), selection kept | ✅ |
| 5 | Right-click a corner | Deleted (min 4 enforced) | ✅ 9→8 |
| 6 | RESIZE HANDLES checkbox | 5 axis-tinted face handles appear alongside the translate gizmo | ✅ |
| 7 | +Y handle drag | height 2→3.5 snapped, base pinned | ✅ |
| 8 | Radial handle drag (cylinder) | Both radii 1→2.25, center pinned | ✅ |
| 9 | ±X handle drag (box) | width grows, opposite face byte-stable (−X face at exactly 17.000) | ✅ |
| 10 | Console + vite overlay | clean | ✅ |

## Known limits (by design)

- `change_material` script action stays object-only (same as platforms/stairs).
- No scale gizmo — size lives in params (brush contract).
- ~~Gizmo rotate ring edits yaw only~~ — all three rings commit as of v4.9.2 (verified:
  X-ring −54.88° sticks; follow-up yaw drag composes; collider quaternion matches exactly).
- ~~Shapes are not decal targets~~ — decals stamp/project onto shapes as of v4.9.1
  (verified: projection, move-away skip, re-project on return).
