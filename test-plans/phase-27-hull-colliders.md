# Phase 27 — Convex Hull Colliders — Test Plan

Verified 2026-07-08 during implementation (v4.18.0) via Chrome MCP against real UI
paths. Re-run after changes to `ColliderBuilder._attachedDesc`,
`ObjectPlacer.getLocalHullPoints`, the ColliderEditor hull wireframe arm, or
`bakeShapes.shapeHullCollider`.

Ground-truth technique worth reusing: register the hull in Rapier, then raycast the
SAME points as a `ConvexGeometry` mesh with a THREE.Raycaster — physics and geometric
truth must agree to ~1e-3 at every probe. (Remember: fresh colliders answer queries
only after one `physicsWorld.step()`.)

## M1 — physics + bake presets

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | Bake emits hulls | plain + tilted (x:30,y:15) boxes → 2 colliders `shape:"hull"`, 8 points each, offset (0,0,0), size = points AABB | ✅ |
| 2 | Rapier vs THREE ground truth | vertical rays at 3 probe columns: 2.612 / 2.633 / 2.922 — **identical** to ConvexGeometry raycasts | ✅ exact |
| 3 | Tilted hull is not a box | ray at the tilted hull's AABB corner (where phase-26's box collided) → **no hit** in both physics and truth | ✅ |
| 4 | Attached via obj.colliders | `updateObject({ colliders })` re-registers; hull desc = convexHull((p+offset)·scale) at object translation+rotation | ✅ |

## M2 — editor UI

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | Auto-fit source | `getLocalHullPoints("rock_2" instance)` → 91 points; hull X-span == local AABB X-size (1.635) | ✅ |
| 2 | Real panel path | select rock → Colliders row → Customize → **hull** button (real clicks) → collider {shape:"hull", 91 points, offset zeroed} | ✅ |
| 3 | Wireframe | one hull wireframe in scene, ConvexGeometry hugging the rock's silhouette (screenshot) | ✅ |
| 4 | Panel card | "91 points · auto-fit from model" + Refit; size/rotationY fields hidden; offset fields + Move remain | ✅ |
| 5 | Shape-fit vs AABB | hull top 1.843 at center vs AABB top 1.961; AABB-corner ray passes clean through | ✅ |
| 6 | Switching away | hull → box converts via points-AABB size, `points` stripped | ✅ (reshapeCollider) |

## Regressions

- typecheck 0 errors; box/sphere/capsule paths untouched (hull is a new arm);
  existing assets/objects unaffected; user's world (3 shapes) preserved; cleanup
  autosave verified (no test_* entities persisted).

## Known v1 limits (by design)

- Hulls are convex — concavities fill (archways: keep manual boxes).
- Skinned models hull their rest pose.
- Flat/degenerate geometry → no hull (button no-ops; physics falls back to box).
- Old baked assets keep their stored box presets (data-driven); re-bake for hulls.
