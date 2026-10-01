# Phase 82 · Brush soft falloff: nearby corners follow a drag part of the way

> Status: **IMPLEMENTED**, shipped as v4.100.0 (2026-10-01); see
> `test-plans/phase-82-brush-soft-falloff.md`. Drawings and a live demo:
> https://claude.ai/artifact/N2KRpg3q7tX4hXtWHVYntD

When a brush drag moves corners (one corner, an edge, a face, a face set, a corner set,
or a PUSH), only those corners move today, so a scaled ring makes a sharp ridge and a
pulled corner a spike. With **SOFT** on, the corners near the moved ones follow part of
the way, less the farther they are, so the same drags make rounded bulges, waists and
hills. Blender calls it proportional editing.

---

## 1. Scope

**In scope**

- One setting for every brush and every corner drag: **SOFT** on / off, a **radius** in
  meters, and a **slope** (Smooth / Linear / Sharp).
- A SOFT row at the top of the Geometry screen in face, vertex and edge modes; key **O**
  toggles it, **[** / **]** shrink / grow the radius (also mid-drag).
- While a soft drag runs, the following corners show as green dots, brighter the more
  they follow.
- One undo step per drag; Escape restores; corner-set drags still refuse a result that
  turns the brush inside out.

**Decided (2026-10-01)**

- Distance is measured **along the surface** (over the face edges), so corners that are
  close in a straight line but far round the shape stay put. User liked the three-button
  slope control from the drawings. Radius is one setting for every brush (remembered).

**Out**

- Scroll-wheel radius mid-drag (the wheel zooms the camera); [ ] does it instead.
- A straight-line distance option.

---

## 2. Design

`softDisplace(orig, next, sources, faces, radius, curve)` in `brushOps.ts` (pure):

1. `sources` = the corners the drag moves; `next` holds their final positions.
2. Multi-source Dijkstra over the face-loop edges from the ORIGINAL positions, carrying
   each corner's nearest source. Cloud brushes (no faces) use straight-line distance.
3. Every other corner within `radius` moves by `w × (displacement of its nearest
   source)`, `w = softWeight(d / radius, curve)`: smooth `1 − t²(3 − 2t)`, linear
   `1 − t`, sharp `(1 − t)²`.

Using the nearest source's displacement (not re-running the transform) makes one rule
work for move, rotate, scale and PUSH: a ring scaled outward pushes the ring beside it
outward by a fraction, which is the rounded bulge.

`src/editor/softFalloff.ts`: the settings (module state + localStorage,
`brush:soft-changed`), `applySoft()` (called by each drag editor before it writes, emits
`brush:soft-preview` with the following corners in world space), and
`SoftFalloffController` (O / [ ] keys, the green dots, cleared on `gizmo:dragging` false).

Drag editors: `BrushVertexEditor` (gizmo drag and free handle drag), `BrushEdgeEditor`,
`BrushFaceEditor` (move and PUSH), `BrushSetEditor`. Each re-applies on
`brush:soft-changed` while dragging, so [ ] updates the result live.

---

## 3. Edge cases

- [x] Radius 0 / SOFT off: byte-identical to before.
- [x] The far side of a ring (farther round the surface than the radius) stays put.
- [x] One undo restores the moved and the following corners together.
- [x] Escape mid-drag restores everything.
- [ ] Edge-mode drag with SOFT (same code path, not driven by mouse in the tests).
