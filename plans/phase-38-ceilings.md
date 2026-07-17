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

## Follow-up (v4.32.1): ghost ceilings + loop-fill button gating

A capped room was un-editable from outside (the lid occluded view and clicks), and the
fill/ceiling buttons could stack duplicates. Shipped (user-approved design):

- **`PlatformDef.editorGhost?: boolean`** — the platform renders as a translucent (0.15)
  **click-through** ghost in the editor but is solid in preview/game/runtime.
  Implementation: `ZoneManager._applyGhosts()`, an editor-only material-swap pass mirroring
  `_applyDimming` (chained from its tail; disjoint mesh sets via skip-guards); sets
  `userData.ghostPick` so the existing hidden-wall pick rule provides click-through while
  the ghost stays selectable on empty space. `enableEditorGhosts()` is called only by
  App.tsx (runtime never ghosts); `preview:start/stop` toggle `_ghostsSolid`.
- **Toggles**: wall-run Actions button "Hide ceiling (ghost)" / "Show ceiling (un-ghost)"
  (shown when a node-set-matched ceiling exists) + a GHOST IN EDITOR checkbox on the
  platform Geometry screen (covers hand-placed ceilings).
- **Gating**: "Fill closed loop with floor" hides when a floor with the run's exact node
  set exists at the run's level; "Add ceiling" hides when a matching platform exists
  (replaced by the ghost toggle). Detection: `getRunLoopNodeIds()` + order-insensitive
  node-set compare (App.tsx). Deleting the fill/ceiling brings the button back.
- **Gotcha fixed**: the mutating handlers must bump `setSelected(s => ({...s}))` — 
  `syncHistory()` alone doesn't re-render App when `canUndo` was already true, leaving the
  buttons stale until the next selection change.

## Follow-up (v4.32.2): ceilings follow vertical wall-run moves

GizmoManager's wall Y-move commit elevated walls and node-matched **floors** but had no
platform equivalent — a ceiling followed the run horizontally (node-derived polygon) but
stayed at its old height on a vertical move. Fixed by mirroring the floor loop: node-backed
platforms whose `nodeIds` are entirely within the moved node set get
`position.y += delta.y` (`GizmoManager.ts`, wall case). Verified with a real gizmo drag —
wall/floor/ceiling all moved by the identical delta.

## Accepted edge cases (documented, not fixed)

- Collider stays the AABB cuboid → a ceiling over a concave loop has invisible collision
  inside its bbox at ceiling height (pre-existing polygon-platform limitation).
- Selecting the underside tints only the bottom mesh (same cosmetic asymmetry as
  sides/railings today).
- BOTTOM section can't be reset to "follow top" once set (parity with SIDES).
- Deleting the wall run deletes its nodes; the ceiling falls back to cached `points` and
  keeps its last shape (parity with node-backed floors from "Fill closed loop with floor").
- A ghosted ceiling over a fully-floored room can be hard to click directly (something
  solid is always behind it) — un-ghost it from the wall run, or use the platform panel
  checkbox after selecting it from an angle with sky behind.
- A dimmed (inactive-level) ceiling is left to the dimming system rather than ghosted —
  visually identical opacity; picking follows the level rules.

## Verification

1. `npm run typecheck` → 0 errors; checker overlay clean.
2. Browser (TESTING.md §3 golden path): existing platforms unchanged; BOTTOM material
   retextures only the underside (orbit below); node drags rebuild all caps; CSG stair cut
   punches both caps; closed run → "Add ceiling" → slab bottom at `elevation + height`,
   visible looking up in preview, collider blocks jumps; open run → button absent; undo
   removes the ceiling, walls intact; save/reload persists. See
   `test-plans/phase-38-ceilings.md`.
