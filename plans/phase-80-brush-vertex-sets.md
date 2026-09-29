# Phase 80 · Brush vertex sets: loop select, then move / rotate / scale them together

> Status: **PLANNED**. Follow-up to Phase 79 (loop cut); numbered 80 on the
> assumption 79 ships first. Renumber if something else lands in between.

Phase 79 adds a ring of new vertices around a brush, but the editor selects one vertex,
edge or face at a time, so shaping that ring (a bulge, a waist, a tilted rim) means
dragging each vertex by hand. This phase lets you **select several vertices at once**
(by Shift-click, or a whole **edge loop** in one go) and **move, rotate or scale them
together** with one gizmo. Blender equivalents: Alt-click loop select, then G / R / S.
User request (2026-09-29): "yes prepare the follow up" to the Phase 79 plan's open
question 1.

---

## 1. Scope

**In scope**

- A **vertex set** selection in vertex mode (select-vertex, key 3):
  - click a corner = select just it (today's behavior);
  - **Shift-click** a corner = add it to / remove it from the set.
- **Loop select**: from a selected edge in edge mode, select every vertex along its
  edge loop (the ring a Phase 79 loop cut makes, or any existing one, e.g. a cube's
  middle after SPLITs all the way round).
- After a Phase 79 loop cut, a **SELECT RING** button in its result note selects the
  ring that was just made.
- One gizmo for the set, parked at the set's center, with **move / rotate / scale**
  modes (T / R / S keys, like the object gizmo, plus panel buttons). A drag is one
  undo step; Escape cancels it.
- Selected corners and the edges between them are highlighted, so a selected loop
  reads as a loop.

**Out of scope (see §10)**

- Selecting several faces or edges; soft (proportional) falloff; box/lasso select;
  numeric scale fields.

---

## 2. Current state

| Piece | Today | This phase |
|---|---|---|
| `SelectionManager` sub-selection | One of `_subFace`, `_subVertex`, `_subEdge` (a single index or pair), re-emitted on `object:selected` as `faceIndex` / `vertexIndex` / `edgeVerts`, clamped against the live mesh on every emit. | Adds `_subVertices: number[]` (emitted as `vertexSet`), same clamp. `vertexIndex` stays: it's the last-clicked ("active") corner. |
| `shape:sub-select` event | `{ faceIndex, vertexIndex, edge? }` | Gains `vertexSet?: number[]`. |
| `BrushVertexEditor` | Amber handle per corner, cyan for the one selected; click a handle selects it; drag or its TransformControls moves that one corner in one transaction. | Shift-click toggles the set; cyan for every set member; the single-corner gizmo hands over to the set gizmo when the set has 2+ corners. |
| `BrushEdgeEditor` | TransformControls on a proxy at the edge midpoint; the drag moves a **set of vertex indices** (`moving = new Set(edge)`) by the world delta rotated into shape space. One transaction, Escape restores. | The pattern this phase generalizes: same proxy + transaction + cancel, with any index set and rotate/scale too. |
| `GizmoManager` | T / R / S switch the object gizmo's mode (bare keys, not with Cmd/Ctrl). | Same keys drive the set gizmo while it's active. |
| `input:mousedown` event | `{ button, screenPos }`: **no modifier keys**. | Gains `shift` (and `ctrl` / `meta` for symmetry with `input:click`), so the vertex editor can see Shift-click. |
| Validation during drags | Face / edge / vertex drags never call `validateMesh`. | Set **scale** and **rotate** can turn a brush inside out, so their commit validates (§6). |

---

## 3. Design: the vertex set

- `SelectionManager` owns `_subVertices: number[]` (ordered by selection; order
  doesn't matter for transforms). Rules:
  - Plain click on a corner: set = `[that]`, active = that (today's result).
  - Shift-click on a corner: toggle it in the set; active = it when added, else the
    previous last member.
  - Clicking empty space / another object / leaving vertex mode: set cleared
    (same moments `_subVertex` is cleared today).
  - Liveness clamp on every emit: indices `>= vertices.length` dropped (undo can
    remove vertices).
- `object:selected` carries `vertexSet` (length 1 when it's a single corner, so old
  readers of `vertexIndex` keep working unchanged).
- `shape:sub-select` accepts `vertexSet` so panels and loop select can set it in one
  emit.
- **Shift-click must not also toggle the object.** Today Shift-click on the canvas is
  the additive *object* toggle in `SelectionManager._onClick`. When the vertex editor
  consumes a mousedown on a handle it sets a "handled" flag (the existing
  `_suppressNextClick` idiom), so the following `input:click` is ignored.

---

## 4. Design: loop select

`edgeLoop(mesh, [a, b]) → { verts: number[]; closed: boolean }` (new, pure, in
`brushOps.ts`)

- Build, from the face loops: each vertex's neighbours, and each edge's two faces.
- Walk from `b` away from `a`. At each vertex, continue only if it's a **regular
  4-way junction**: exactly 4 neighbours, and all 4 faces around it four-cornered
  (`quadCorners` non-null). The next edge is the one of the other three that shares
  **no face** with the edge we arrived on (the "straight ahead" edge). Anything else
  (3 or 5+ neighbours, a triangle or n-gon, a straight-through point from an old
  split) ends the loop there.
- Walk the other way from `a` the same way. If a walk comes back to its start, the
  loop is **closed**.
- This is Blender's rule. On a Phase 79 ring every new vertex has exactly the ring
  neighbours plus one up and one down, so the ring always selects whole.

Entry points:

- Edge mode panel: **SELECT LOOP** next to SPLIT EDGE / LOOP CUT.
- Edge mode: **double-click** an edge = select its loop (Blender uses Alt-click, but
  Alt is this editor's "turn snapping off" key).
- Phase 79 result note: **SELECT RING** after a loop cut (`loopCut` returns the new
  vertex indices, so no walk is needed).

All three switch the tool to **vertex mode** with the loop as the vertex set, since
that's where the set gizmo lives (§10 Q1).

---

## 5. Design: the set gizmo

A new module `BrushSetEditor` (sibling of `BrushEdgeEditor`, same shape), active in
vertex mode when the set has **2 or more** corners (a single corner keeps today's
`BrushVertexEditor` gizmo, untouched).

- **Pivot**: the set's centroid, in world space. The proxy's rotation = the shape's
  rotation, so the gizmo's axes are the brush's own axes (a rotated cylinder scales
  along its own height, not world Y).
- **Modes**: T = move, R = rotate, S = scale (TransformControls modes; its center
  handle does uniform scale). Mode also switchable from the panel (§7). Default
  mode when the set is made: move.
- **Drag**: on drag start, snapshot `origVertices` and `beginTransaction`. Each
  change recomputes every set member from its *original* position:
  - move: `v + Δ` (world Δ rotated into shape space, as `BrushEdgeEditor` does);
  - rotate: `pivot + q · (v − pivot)` with the drag rotation in shape space;
  - scale: `pivot + s ⊙ (v − pivot)` per axis in shape space.

  Non-members untouched. `updateShape(... { mesh: { ...mesh, vertices } })` (keeps
  faces, per the WorldState shallow-merge note).
- **Snap** (Alt = free, as elsewhere): move 0.25 m, rotate 15°, scale 0.1.
- **Escape** mid-drag restores `origVertices` and aborts the transaction.
- Suspends the entity gizmo while active (`gizmo:suspend`, own source id), like the
  face/edge editors.

---

## 6. Design: keeping the brush valid

- **Scale factor floor**: each axis's factor is clamped to ≥ 0.05, so a drag can't
  collapse the set flat or mirror it through the pivot.
- **On drag end** (rotate and scale; move is as safe as today's single-corner drag),
  run `validateMesh`. If it fails (inside-out or zero volume), restore
  `origVertices`, abort the transaction, and show the reason in the panel note
  ("That would turn the brush inside out"). Nothing half-applied reaches undo.
- Non-planar faces are expected and fine: they fold per v4.93.0's rule.

---

## 7. Design: panel and highlights

**Vertex mode, set of 2+** (replaces the single-vertex card while the set exists):

```
 VERTICES  ·  16 selected (loop)
 [ MOVE ]  [ ROTATE ]  [ SCALE ]     ← mirrors T / R / S; active one highlighted
 center  (0.00, 1.00, 0.00)
 CLEAR SELECTION
 Shift-click a corner to add or remove it.
```

- "(loop)" appears when the set came from loop select / SELECT RING.
- The mode buttons are the visible signal of the current mode (the gizmo's handle
  shapes change too, but the panel says it in words).

**Canvas**: set members use the existing selected-corner cyan; `BrushFaceHighlighter`
adds a thin cyan line over every edge whose **both** ends are in the set, so a loop
shows as a ring, not a scatter of dots.

**Help (`HelpButton`)**: rows for Shift-click, double-click edge, T / R / S on a set.

---

## 8. Events & types

| Addition | Where |
|---|---|
| `SelectedObjectPayload.vertexSet?: number[]` | `src/types.ts` |
| `"shape:sub-select"` gains `vertexSet?: number[]` | EventBus table, `src/types.ts` |
| `"input:mousedown"` gains `shift: boolean; ctrl: boolean; meta: boolean` | EventBus table + the emitter in the input layer |
| `edgeLoop(mesh, edge)` | `src/editor/brushOps.ts` |
| `BrushSetEditor` (IEditorModule) | `src/editor/BrushSetEditor.ts`, registered beside the other brush editors |

No saved-data changes: the selection is editor state, the result is ordinary vertex
positions.

---

## 9. Edge cases (checklist)

- [ ] Plain click behavior unchanged (single corner, single-corner gizmo).
- [ ] Shift-click adds / removes; Shift-click on the last member leaves an empty set
      (no gizmo, panel shows the hint).
- [ ] Shift-click on a handle does NOT toggle the object in the object selection.
- [ ] Loop select on a Phase 79 cylinder ring: all N corners, closed.
- [ ] Loop select on a cube's middle ring (after 4 SPLITs): closed, 4 corners.
- [ ] Loop select ending at a cap / triangle / straight-through point: open loop,
      stops there.
- [ ] Double-click in edge mode doesn't also start an edge drag.
- [ ] Rotated brush: scale / rotate follow the brush's own axes.
- [ ] Scale to the floor (0.05) holds; a drag that would invert the brush is undone
      on release with the panel message.
- [ ] Escape mid-drag restores exactly (compare vertex arrays).
- [ ] One undo step per drag; undo that removes corners clamps the set.
- [ ] Switching to face / edge / object mode clears the set.
- [ ] Isolated brush editor (Phase 78): works the same, Save keeps the result.
- [ ] Play/preview hides the gizmo (`preview:start`), as the other brush editors do.

---

## 10. Open questions (defaults chosen, none blocking)

1. **Where loop select lands.** Blender keeps you in edge mode with the loop's edges
   selected. *Default: switch to vertex mode with the loop as a vertex set*, because
   one kind of set (vertices) serves move / rotate / scale for everything, and edge
   sets would double the selection work. Revisit if staying in edge mode feels
   important.
2. **Pivot.** *Default: the set's center.* Alternatives later: the brush's center (to
   scale a ring relative to the whole shape) or the active corner.
3. **Soft falloff** ("proportional editing": neighbours follow with a falloff so a
   ring pull makes a smooth bulge instead of a sharp one). *Default: later phase*;
   the biggest step toward organic shaping after this one.
4. **Box / lasso select** of corners. *Default: later*; Shift-click + loop select
   cover the loop-cut workflow.
5. **Numeric entry** (type "120%" or a move distance). *Default: later*; snap covers
   most cases.

---

## 11. Implementation order (each step → verify)

1. **`edgeLoop`** in `brushOps.ts`. → Scratch Node script (esbuild bundle of the real
   `brushOps`, as in the Phase 79 spike): cylinder ring after a loop cut (closed, N),
   cube middle ring, stops at a cap / straight-through point.
2. **Selection plumbing**: `input:mousedown` modifiers, `_subVertices`, `vertexSet` on
   both events, clamp, clear rules. → In the app: Shift-click builds a set (read
   `vertexSet` off `object:selected`), object selection untouched, plain click
   unchanged.
3. **Highlights**: cyan set members + cyan set edges. → Screenshot a selected ring.
4. **`BrushSetEditor`**: move / rotate / scale, snap, Escape, one transaction,
   validate-on-release. → On a loop-cut cylinder: scale the ring 1.5× (all ring
   corners' distance from the axis ×1.5, others unchanged), rotate 15°, move up
   0.25; Escape restores; one undo each; an inverting scale is refused.
5. **Panel + loop select entry points** (vertex-set card, SELECT LOOP, double-click,
   Phase 79 SELECT RING). → Real clicks through the panel and canvas, both main
   editor and isolated brush editor.
6. **Docs.** → `HelpButton` rows, `TOOL_INFO` copy for vertex / edge modes,
   architecture doc (changelog + SelectionManager / BrushVertexEditor /
   BrushFaceHighlighter / brushOps / new BrushSetEditor sections),
   `test-plans/phase-80-brush-vertex-sets.md`, and a labelled demo: a cylinder with
   a loop-cut ring scaled out into a bulge.
