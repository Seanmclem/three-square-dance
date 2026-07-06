# Phase 19 — Floor Geometry Panel + Node-Link Visibility (v4.6.0)

Floors had no geometry properties in the panel, and wall↔floor node sharing (the
mechanism behind "moving a wall dragged my floor") was invisible. Now: a floor
Geometry screen (rect POSITION/SIZE, polygon vertex list, legacy points editor),
LINKED chips wherever a node is shared, and hover-highlighting of linked entities
(`node:link-hover` → SegmentHighlighter marker + boxes).

## Automated pass (done 2026-07-06, Chrome extension, real input paths)

- [x] `npm run typecheck` clean; no console errors
- [x] **Shared-node core assertion** (fill-run floor, nodes shared with 4-wall loop):
      floor Geometry shows V1–V4 rows, all with LINKED chips; editing V1 X 30→28
      through the real input moved the node, the wall run mesh (minX 29.85→27.79),
      AND the floor mesh; ONE Cmd+Z ("move floor vertex") reverted node + wall +
      floor with 0 orphan meshes
- [x] **Rect floor**: POSITION X/Z + SIZE W/D fields render (+ read-only corner
      rows + axis-aligned hint); SIZE W 6→8 updated all 4 nodes, `maxX−minX === 8`,
      centroid unchanged, still exactly 2 distinct X / 2 distinct Z; one undo
      ("update floor geometry") reverted all 4 nodes
- [x] **Hover highlight**: mouseover a linked vertex row → exactly 3 editor-only
      overlays (marker sphere + 2 wall boxes; source floor skipped); mouseout → 0
- [x] **Legacy floor** (points, no nodeIds): legacy hint shown, no chips; editing
      V2 X wrote a new `floorMesh.points` array (54→55) and one undo reverted it
- [x] **Wall Segments chips**: loop walls sharing nodes with the fill floor → all
      4 SEG rows chip LINKED; the user's east wall (coincident coordinates but
      separate node objects) correctly reports unlinked via getNodeLinks
- [x] Selected-floor payload refresh after node edits (floor:rebuilt → re-emit)

## Manual spot-checks (human)

- [ ] Drag a floor corner in-canvas (NodeDragger) with the Geometry screen open —
      POSITION/SIZE and vertex fields resync after the drag
- [ ] Rect floor: POSITION X shift moves the slab without resizing; walls snapped
      to its corners follow
- [ ] Hover a vertex shared by a floor AND a platform — both get boxes
- [ ] Degenerate input: SIZE 0 or negative is rejected (field snaps back on blur)
- [ ] Undo/redo across mixed edits (vertex edit, rect resize, material change)
      steps one logical change at a time

## Known follow-up (deferred by choice)

`WorldState.removeNode` guards walls only — deleting a wall whose nodes a floor
references orphans those nodes and the floor's vertices collapse to the origin
on rebuild (`resolveFloorMesh`). Guard should reuse the `getNodeLinks` /
`_pruneOrphanNodes` reference model.
