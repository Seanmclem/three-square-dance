# Phase 38 — Ceilings — Test Plan

Platform `bottomMaterial` (separate top/bottom cap textures) + "Add ceiling (cap closed
loop)" on closed wall runs. A ceiling is a thin node-backed polygon platform — not a new
entity type.

## What shipped

- **Data model** — `PlatformDef.bottomMaterial?` / `bottomMaterialOverrides?` (additive,
  no migration; unset = bottom shares `material`).
- **Builder** — `PlatformBuilder` cap builders take `CapFaces = "both"|"top"|"bottom"`;
  the bottom cap splits into its own mesh **only when** `bottomMaterial`/overrides is set
  (unset = merged path unchanged, zero regression surface). Bottom mesh is
  `selectable: true`; CSG cuts run through a shared `cutWorldGeo` helper on both caps.
- **Panel** — platform material view: "TOP / BOTTOM" → "TOP", new "BOTTOM"
  `MaterialSection` (falls back to top's material), SIDES unchanged.
- **Auto-ceiling** — "Add ceiling (cap closed loop)" in the wall-run Actions accordion,
  gated by `isWallRunClosed()`. Creates a polygon platform reusing the run's node IDs at
  `position.y = wall.elevation + wall.height` (slab bottom flush with wall top — lid ON
  the walls), thickness 0.2, `concrete_01`.
- **Misc** — material-delete usage scan counts `bottomMaterial`.

## Regression gates

- `npm run typecheck` → 0 errors. ✅
- Console clean during the whole pass (only pointer-lock exceptions from entering preview
  in a hidden automation tab — environment artifact, not app code). ✅

## Acceptance checks (verified 2026-07-16, editor tab, real clicks where noted)

| # | Check | Expected | Result |
|---|---|---|---|
| 1 | Baseline polygon platform (no bottomMaterial) | 2 meshes: merged cap (up+down normals, one material) + sides | ✅ |
| 2 | `updatePlatform(…{ bottomMaterial })` | 3 meshes: top-only cap, bottom-only cap (distinct material, `selectable: true`), sides | ✅ |
| 3 | Rect platform + railing + bottomMaterial | 7 meshes: top, bottom, sides, 4 railings | ✅ |
| 4 | Persistence | `toJSON()` platform carries `bottomMaterial` | ✅ |
| 5 | Closed 4-wall loop → select run (real canvas click) | Panel Actions shows "Fill closed loop with floor" AND "Add ceiling (cap closed loop)" | ✅ |
| 6 | Click "Add ceiling" (real click) | Polygon platform created: y = elevation+height = 3, thickness 0.2, `nodeIds` = the run's 4 node IDs, bbox size | ✅ |
| 7 | Lid placement | Slab world-space bottom Y = 3.000, top Y = 3.200 (flush on wall top) | ✅ |
| 8 | Node-follow | `updateNode` moving a shared node → ceiling mesh rebuilds to the new footprint (maxX 16→18) | ✅ |
| 9 | Underside visible from below | Editor camera inside the room looking up: brick underside renders (top stays concrete) | ✅ |
| 10 | Collider | Preview: player teleported above the lid falls and settles standing on it (body y=4.11 ≈ slab top 3.2 + capsule offset; stepped manually — hidden tab) | ✅ |
| 11 | Select ceiling (real click on lid) | Panel header `PLATFORM · LEVEL 0` | ✅ |
| 12 | Material screen (real click) | Sections TOP, BOTTOM, SIDES; old "TOP / BOTTOM" label gone | ✅ |
| 13 | Cleanup | Test platforms/walls/nodes removed; zone back to baseline (0 platforms, 25 walls) | ✅ |

## Follow-up checks — v4.32.1 ghost ceilings + button gating (verified 2026-07-16, real clicks)

| # | Check | Expected | Result |
|---|---|---|---|
| 14 | Closed run, no fills | Actions shows BOTH "Fill closed loop with floor" and "Add ceiling" | ✅ |
| 15 | Click "Add ceiling" | Button disappears immediately, replaced by "Hide ceiling (ghost)"; Fill remains | ✅ |
| 16 | Reload (autosave round-trip) | Ceiling + gating state persist: Add still hidden, Hide shown | ✅ |
| 17 | Click "Hide ceiling (ghost)" | Both ceiling meshes → opacity 0.15, `ghostPick: true`; label flips to "Show ceiling (un-ghost)" | ✅ |
| 18 | Click through the ghost lid from above | Selects the object inside the room (`test_chair`), not the ceiling | ✅ |
| 19 | Enter preview with ghosted ceiling | Meshes solid (opacity 1, no ghostPick) | ✅ |
| 20 | Exit preview | Re-ghosted (0.15 + ghostPick); `editorGhost` persisted in the def | ✅ |
| 21 | Click "Show ceiling (un-ghost)" | Solid again, ghostPick cleared, label back to "Hide ceiling (ghost)" | ✅ |
| 22 | Click "Fill closed loop with floor" | Floor created; Fill button disappears immediately | ✅ |

Note: clicking at the room's center while the wall run is selected hits the run's
transform gizmo (pivot = run centroid) — deselect first when testing click-through there.

## Not covered this pass (manual follow-ups if suspicious)

- CSG stair-cut through a bottom-textured platform (helper is shared with the proven
  single-cap path; both caps get cut + `uv2`).
- Mover + bottomMaterial (movers iterate the `meshes` array wholesale; polygon platforms
  are mover-excluded anyway).
- Undo of "Add ceiling" (single `transaction("add ceiling")`, same pattern as the
  fill-floor button).

## Known accepted limitations (by design, parity with existing behavior)

- Collider is the AABB cuboid — concave loops have invisible collision inside the bbox at
  ceiling height (pre-existing polygon-platform limitation).
- Selecting the underside tints only the bottom mesh.
- BOTTOM can't be reset to "follow top" once set (parity with SIDES).
- Deleting the wall run deletes its nodes → ceiling keeps its last cached shape.
- Clicking "Add ceiling" twice stacks two lids (parity with the fill-floor button).
