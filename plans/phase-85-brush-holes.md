# Phase 85 · Brush holes: cut a round or square hole through a flat part

> Status: **IMPLEMENTED**, shipped as v4.109.0 (2026-10-02); see
> `test-plans/phase-85-brush-holes.md`.

## Decided (2026-10-02, user)

- Placement: a see-through ghost of the cutter on the face ("a ghost cylinder to place
  and be like, cut"): it follows the mouse, a click drops it, CUT HOLE cuts. X / Y
  fields for exact spots.
- ROUND and SQUARE are enough for v1.
- Blind pockets (a DEPTH) are in v1.
- Holes stay re-editable in v1 (settings, PLACE to move, FILL), like curves: every
  hole face carries a `hole` record. A hole edited by hand can only be filled.

Today the only way to make an opening in a brush is INSET + RECESS, which digs a pocket
but never comes out the other side, and is square. This phase adds **HOLE**: pick a
face, place a circle (or rectangle) on it, and cut a tube straight through the brush to
the face on the far side, e.g. a round hole through the flat top of a plate. An optional
depth makes a blind pocket instead.

---

## 1. Scope

**In scope**

- Face mode, CUT group: **HOLE**. Opens a hole card for the selected face.
- Hole shape: **ROUND** (SIDES 6 to 64, default 24) or **SQUARE** (width × height).
  SIZE in meters (diameter, or W × H).
- Placement: a see-through ghost of the cutter starts in the middle of the face and
  follows the mouse; **a click drops it**; X / Y offset fields for exact values.
- Depth: **THROUGH** (default: out of the face on the far side) or a number (a blind
  pocket with a floor).
- One undo step. The result is ordinary faces, so ROUND can soften the rim, DISSOLVE
  can remove the cut lines, materials apply per face, and the collider follows.

**Out (later)**

- Holes that cross an edge or come out through more than one face.
- Cutting with any other brush or shape (general boolean subtract, §6).

---

## 2. Current state

| Piece | Today | This phase |
|---|---|---|
| `insetFace` / `extrudeFace` | A square-ish inner face + border; a pocket by RECESS | Reused ideas: the border between the face outline and the hole is built like INSET's border, but around an N-gon |
| Brush faces | One outline per face, no holes in a face | A face with a hole is split into several faces around it (a face can't hold a hole) |
| `src/utils/csg.ts` (three-bvh-csg) | Wall / floor openings at render time | Not used in v1 (its output is raw triangles; §6) |
| `validateMesh` | Every edge used twice, positive volume | Gates the result as for every op |

---

## 3. Design: the cut (`holeThrough` / `holePocket` in `brushOps.ts`)

Inputs: the mesh, the entry face, the hole centre (in the face plane), shape (N-gon from
ROUND + SIDES, or a rectangle), size, depth (THROUGH or metres).

1. **Hole outline** on the entry face: an N-gon (CCW about the face normal) around the
   centre. It must sit fully inside the face with a small margin, else refused ("the hole
   doesn't fit on this face").
2. **Exit (THROUGH):** cast from the hole centre along −normal through the brush; the
   first face hit is the exit face. The exit outline = the entry outline projected
   along −normal onto the exit face's plane (a slanted exit gives a stretched shape).
   It must lie fully inside the exit face, else refused ("the hole would come out
   across an edge").
3. **Faces around each outline** (a face can't have a hole, so the ring between the face
   outline and the hole becomes several faces): each outline corner gets a "spoke" to the
   hole corner nearest its direction from the centre that it can see; a run of corners
   on one hole corner shares a spoke; between two spokes one face runs along the outline
   and back along the hole: `[outline chain …, hole m(j2) … hole m(j1)]` (a rectangle
   gives 4 faces). Spokes crossing an edge are refused. Works for
   any face that every ray from the hole centre leaves once (rectangles, rounded
   rectangles, any convex face); other faces are refused in v1.
4. **The tube:** one wall quad per hole side, joining the entry and exit outlines,
   wound to face into the hole.
5. **Pocket (a depth):** no exit; the hole outline is copied `depth` back along −normal
   and closed with a floor face. A depth past the far side is refused.
6. Materials: the faces around the hole keep the face's material; tube walls and the
   pocket floor take it too.
7. `validateMesh` on the result; refusals leave the brush unchanged with a note.

## 4. Design: panel and preview

```
 HOLE                                   ← CUT group, selected face
 [ROUND] [SQUARE]   SIDES [24]
 SIZE [0.5] m   (W [0.5] × H [0.5] for SQUARE)
 DEPTH [THROUGH] [ 0.3 ] m
 X [0.00] Y [0.00]   click the face to place it
 [CUT HOLE]  [CANCEL]
```

- While the card is open, a see-through ghost of the cutter (orange, red where the hole
  can't go) sits on the face, drawn through the brush, from just above the face to just
  past the far side (THROUGH) or to DEPTH; it follows the mouse until a click drops it.
- Refusal notes in the card; the guide gets a "Holes" section with drawings and a
  `help-hole` anchor.

---

## 5. Edge cases (checklist)

- [ ] Round hole through the middle of a 2 m × 0.2 m plate: valid, watertight, the tube
      has SIDES walls, both faces now have rings of faces around the hole.
- [ ] Square hole: 4 walls; the ring is 4 faces per side.
- [ ] Off-centre placement near an edge: allowed while it fits; across the edge: refused.
- [ ] Exit face slanted: stretched exit outline, still valid.
- [ ] Rounded-rectangle face (after ROUND): the ring follows the curves.
- [ ] Pocket of depth 0.1 on a 0.2 plate: floor face, valid; depth 0.3: refused.
- [ ] ROUND on the hole's rim edges afterwards; DISSOLVE of a ring cut line.
- [ ] Undo restores the brush exactly; the collider gets the hole (walk through it).
- [ ] 3D print export of a holed plate stays watertight.

## 6. Later: subtract any shape

The general version (cut with any brush, across edges, partial overlaps) can use
`three-bvh-csg` on the triangle meshes and then rebuild brush faces from the result:
merge coplanar triangles into outlines, and split any outline with a hole by bridging
it to its border. More powerful, but the faces come out less tidy, so it fits as a
separate "SUBTRACT SHAPE" op after HOLE.

## 7. Implementation order (each step → verify)

1. `holeOutline`, the angular ring builder, `holeThrough`, `holePocket` in `brushOps.ts`
   → Node script on the real brushOps: the §5 cases, `validateMesh`, watertight check
   (the print-export `isWatertight`).
2. Panel card + preview + click placement → headless on the test harness (real clicks:
   place, cut, refusals, undo).
3. Guide section with drawings, `help-hole`, test plan, architecture doc.

## 8. Open questions

All answered; see "Decided" at the top.
