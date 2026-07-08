# Phase 27b — Trimesh Attached Colliders (exact concave baked brushes)

> Status: **PLANNED** — target v4.19.0. Follow-up to phase 27: a baked concave
> face-brush contributed its convex hull (alcoves filled), while its live source
> collides exactly via trimesh. Close the gap so baked copies collide
> byte-identically to their sources.

## Design

- `AttachedColliderShape` += `"trimesh"`; `AttachedCollider.indices?: number[]`
  (triangle indices into `points` — reused as the vertex array).
- `ColliderBuilder._attachedDesc` trimesh arm: `(p+offset)·scale` verts +
  `ColliderDesc.trimesh(v, i, FIX_INTERNAL_EDGES)` at the object's
  translation/rotation (same math as the hull arm; registerShapeTrimesh's flags).
  Degenerate → points-AABB box fallback.
- **Bake rule** (`bakeShapes`): face-brush sources → trimesh (parity with their
  live collider — no convexity detection needed); parametric/cloud → hull as in
  phase 27. Vertices/indices come from `ShapeBuilder.localTrimesh`, vertices
  carried through the shape's full rotation into asset space.
- ColliderEditor: trimesh wireframe from points+indices (hull idiom, no handles).
- Panel: trimesh is NOT a switchable option (no auto-fit from render meshes v1 —
  that's the future detail-slider phase); a trimesh card (from a baked preset via
  Customize) shows "N tris · exact from bake", converts away via its AABB like hull.

## Verify

Hand-author a concave L-prism face-brush (phase 23 idiom), bake, attach preset to a
test object: ray in the notch column → NO hit (hull would hit); ray over the solid
arm → exact top. Trimesh caveats (hollow interior) unchanged from live face-brushes.

## Files

types.ts · ColliderBuilder.ts · bakeShapes.ts · ColliderEditor.ts ·
PropertiesPanel.tsx (card display + reshape-away) · docs (v4.19.0).
