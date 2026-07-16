# Phase 38 — Ceilings (platform bottom material + "Add ceiling" on closed wall runs)

## Context

Closed wall runs need lids: a ceiling surface at the top of the walls, visible from below,
with a different texture on top vs bottom. Floors can't do this — `FloorBuilder` produces
single-sided zero-thickness planes (`PlaneGeometry`/`ShapeGeometry` rotated to face +Y
only). Face-brushes could, but they're local-space vertex clouds with no node-backing and
heavy editing.

### Decisions (locked with the user)
- **A ceiling is NOT a new entity** — it's a **thin polygon platform**. Polygon platforms
  already build a top cap, a bottom cap visible from below, perimeter sides with a separate
  `sideMaterial`, thickness, node-backed points that auto-follow wall-node drags, and a
  collider. The only gap was top/bottom sharing one material.
- **Trigger UX**: an "Add ceiling" button in the wall run's Actions accordion, next to
  "Fill closed loop with floor", gated by the same `isWallRunClosed()` check. No new tool,
  no prompt-on-loop-close.
- **Placement**: lid ON TOP of the walls — slab bottom face flush with the wall top
  (`wall.elevation + wall.height`), thickness 0.2 m. Interior ceiling height = full wall
  height; the slab is walkable as a roof.
- Manual placement anywhere = the existing poly-platform tool (which gains the
  bottom-material ability for free).

## Design

Two independent parts:

**Part A — `bottomMaterial` on platforms** (rect + polygon). New optional
`PlatformDef.bottomMaterial` + `bottomMaterialOverrides`. The bottom cap splits into its
own mesh **only when one of them is set** — otherwise the merged top+bottom cap path is
byte-for-byte unchanged (same mesh count/draw calls/single CSG pass), so existing worlds
have zero regression surface. Multi-material via multiple meshes sharing
`userData.editorId` is the established pattern (cap+side; stairs body/riser/landing/rail).

**Part B — auto-ceiling**: `handleAddCeilingToRun` mirrors `handleFillRunWithFloor`
(`resolveRunNodeIds`, closed-loop check, points from `zone.nodes`) but adds a node-backed
polygon `PlatformDef` with the exact field set/defaults of `PolygonPlatformTool._commit`.
It **reuses the run's existing node IDs** — no node duplication — so ZoneManager's
node-move rebuild keeps the ceiling glued to wall edits. Runs merge only with uniform
elevation/height, so reading them off `selected.data` is safe.

## Implementation (shipped)

- **types.ts** — `PlatformDef.bottomMaterial?` / `bottomMaterialOverrides?`.
- **PlatformBuilder.ts** — `CapFaces = "both"|"top"|"bottom"` param on `buildSlabCapGeo`
  (gates the ±Y quads) and `buildPolygonCapGeo` (early-returns one cap before the merge);
  `build()` resolves `botMat`/`botTileScale` mirroring the sides block (overrides-only
  falls back to the top material id), builds a separate `bottomGeo` when splitting, applies
  bottom UV offsets with side-style fallback to cap overrides, CSG cut loop extracted into
  a `cutWorldGeo` helper applied to both caps, and pushes a `selectable: true` bottom mesh
  (ceilings are clicked from below).
- **PropertiesPanel.tsx** — platform material view: "TOP / BOTTOM" renamed "TOP"; new
  "BOTTOM" `MaterialSection` (value falls back to `material`) wired like SIDES; new
  optional `onAddCeilingToRun` prop threaded into `ActionsAccordion`, rendering an
  "Add ceiling (cap closed loop)" button after the fill-floor button.
- **App.tsx** — `handleAddCeilingToRun` (next to `handleFillRunWithFloor`); passed as
  `onAddCeilingToRun={isWallRunClosed() ? ... : undefined}`; material-delete usage scan
  counts `p.bottomMaterial`.

## Accepted edge cases (documented, not fixed)

- Collider stays the AABB cuboid → a ceiling over a concave loop has invisible collision
  inside its bbox at ceiling height (pre-existing polygon-platform limitation).
- Selecting the underside tints only the bottom mesh (same cosmetic asymmetry as
  sides/railings today).
- BOTTOM section can't be reset to "follow top" once set (parity with SIDES).
- Deleting the wall run deletes its nodes; the ceiling falls back to cached `points` and
  keeps its last shape (parity with node-backed floors from "Fill closed loop with floor").
- Double-clicking "Add ceiling" stacks two ceilings (parity with the fill-floor button).

## Verification

1. `npm run typecheck` → 0 errors; checker overlay clean.
2. Browser (TESTING.md §3 golden path): existing platforms unchanged; BOTTOM material
   retextures only the underside (orbit below); node drags rebuild all caps; CSG stair cut
   punches both caps; closed run → "Add ceiling" → slab bottom at `elevation + height`,
   visible looking up in preview, collider blocks jumps; open run → button absent; undo
   removes the ceiling, walls intact; save/reload persists. See
   `test-plans/phase-38-ceilings.md`.
