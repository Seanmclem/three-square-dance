# Phase 27 — Convex Hull Colliders (objects + baked assets)

> Status: **PLANNED** — target v4.18.0. (27 is the next free slot: 24/24b/25/26 taken.)

Fill the reserved `"hull"` slot in `AttachedColliderShape`: an opt-in per-collider
shape in the Colliders menu that auto-fits a convex hull from the placed model's
geometry, plus exact hull presets for baked assets (replacing phase 26's box
presets — fixes the tilted-shape AABB compromise, since hull points encode the
full rotation). **Not applied to anything by default**: existing objects keep the
auto box; hull happens only when a user switches a collider card to Hull or a new
bake ships hull presets. Runtime cost of static convex hulls ≈ boxes (user-settled:
performance was never the obstacle).

## Design

### Data (`src/types.ts`)

- `AttachedColliderShape` += `"hull"`.
- `AttachedCollider.points?: Vec3[]` — hull only; **object-local, pre-scale**,
  relative to the object origin plus `offset`. `size` keeps the points' AABB for
  the panel summary; `rotationY` is ignored for hulls (points encode orientation).

### Physics (`src/physics/ColliderBuilder.ts` registerAttachedColliders)

Hull arm: `RAPIER.ColliderDesc.convexHull(new Float32Array((p+offset)·scale …))`
+ `setTranslation(obj.position)` / `setRotation(objQuat)` — scale applied before
rotation matches mesh TRS composition exactly, so hulls stay exact under
non-uniform scale (rotated boxes can't). Fallback to the AABB cuboid + warn if
convexHull returns null (degenerate points).

### Auto-fit source (`src/preview/ObjectPlacer.ts`)

`getLocalHullPoints(objectId): Vec3[] | null` (getLocalAABB's analog): gather
mesh vertex positions in object-local space (child matrices composed, stride-
subsample huge geometries to ~2k input points), reduce via three's ConvexGeometry,
dedupe vertices → typically well under 100 points.

### Editor UI

- **Colliders card shape picker** gains **Hull**: switching computes points via a
  new `hullPointsFor(objectId)` App prop (ObjectPlacer helper above). Hull cards
  show `N points · auto-fit from model` + a **Refit** button (recompute after
  swapping the asset), offset X/Y/Z (Move gizmo works — offset composes into the
  point transform); size/rotationY fields hidden.
- **ColliderEditor wireframes**: hull arm renders a ConvexGeometry wireframe from
  the scaled points at the object's transform (same cyan/amber). No face handles.

### Baked assets (`src/editor/bakeShapes.ts`)

`shapeBoxCollider` → `shapeHullCollider`: points = `ShapeBuilder.localHullPoints`
transformed by the shape's FULL rotation + position − pivot (asset space),
offset (0,0,0), size = points AABB. Exact for tilted shapes; concave face-brushes
get their convex hull (strictly better fit than the old box). Existing baked
assets keep their stored box presets (data-driven, untouched).

## Files

| File | Change |
|---|---|
| `src/types.ts` | `"hull"` shape + `points?` field |
| `src/physics/ColliderBuilder.ts` | convexHull arm |
| `src/preview/ObjectPlacer.ts` | `getLocalHullPoints` |
| `src/editor/ColliderEditor.ts` | hull wireframe arm, no handles |
| `src/ui/PropertiesPanel.tsx` | Hull option, refit, field visibility |
| `src/editor/bakeShapes.ts` | hull presets replace box presets |
| `src/App.tsx` | `hullPointsFor` prop |

## Milestones

1. **M1 — physics + bake**: types, convexHull arm, bake emission. Verify: re-run the
   phase-26 raycast battery — the tilted shape now collides EXACTLY (ray at its true
   rotated top, misses where the old AABB used to over-collide).
2. **M2 — editor UI**: ObjectPlacer helper, panel Hull option + refit, wireframes.
   Verify on a real imported asset: switch a card to Hull → wireframe hugs the model,
   raycast hits the hull surface not the AABB, Move gizmo offsets it, save/reload.
3. **M3 — docs** (v4.18.0): arch changelog, COLLIDERS_GUIDE §, HUMAN_TESTING,
   test-plans/phase-27, status flip.

## Risks

1. ConvexGeometry on degenerate/flat models (a plane prop) → hull build can fail:
   guard + fall back to the AABB box with a panel hint.
2. Huge skinned models: sample rest-pose geometry only (attribute read, no skinning
   eval) — hulls around T-poses are acceptable v1; documented.
3. `colliderWorldTransform` callers must not receive hulls unaware — audit call
   sites; hull handled in dedicated arms (physics + wireframe).

## Out of scope

Trimesh-for-objects with a decimation detail slider (the knob that actually buys
performance) — future phase if concave imports demand it. VHACD decomposition.
