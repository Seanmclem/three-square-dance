# Phase 18 — Wall Segment Tools (v4.5.0)

Three wall/room connectivity upgrades: right-click on a wall inserts a vertex
(splits into two connected segments), per-segment visibility (`WallDef.hidden` —
editor ghost, no collider, no openings, still in the run so room configuration /
floor fills / zone membership are unaffected), and segment-row hover highlighting
the segment in the canvas (`wall:segment-hover` → `SegmentHighlighter` overlay box).

## Automated pass (done 2026-07-06, Chrome extension, real input paths)

- [x] `npm run typecheck` clean; no new console errors (only the known
      pointer-lock exception from automated preview entry)
- [x] Baseline: 3-wall open run (concrete, (10,0)→(16,0)→(16,6)→(10,6)) merges to
      1 mesh, 3 colliders, 28 tris (3×8 faces + 2 endcaps — cap-rule regression ✓)
- [x] **Split via real right-click** (`computer right_click` at projected coords →
      InputManager `input:rightclick` → WallSplitter): new node landed exactly
      on the wall axis (13.20, z=0), wall_t1 re-pointed to it, new `wall_*` half
      added; run re-merged to 1 mesh / 4 walls / 4 colliders / 36 tris
- [x] Split is one `"split wall"` undo entry; run auto-selected (`tool:placed`),
      panel Segments shows "4 walls"
- [x] **Hover highlight:** mouseover on SEG 2 row → translucent box at the
      segment's midpoint (correct length/rot/inflate); mouseout clears it
- [x] **Eye toggle** (real panel click): `hidden:true` in data; run STAYS merged
      (4 wallIds — room config intact); colliders 4→3; main mesh 32 tris
      (24 faces + 4 boundary caps); 12-tri ghost (8 faces + 2 caps) at opacity
      0.12 in `trimMeshes`; row dims + HIDDEN badge
- [x] Screenshot: visible gap in the front wall with capped ends, ghost faintly
      visible in the opening
- [x] **Preview:** real Play button → ghost `visible:false`; Escape → restored
- [x] **Ghost-fallback picking:** empty-ground click deselects, then a click on
      the gap (nothing solid behind) re-selects the run via the ghost
- [x] Unhide round-trip: back to 36 tris / 4 colliders / no ghost / no badge

## v4.5.1 follow-up — undo-race fix (done 2026-07-06)

User-reported: split×N → undo×N left a flickering duplicate (z-fighting) wall;
moving it appeared to fail; undoing the move left walls in both positions.
Root cause: `wall:updated` + `wall:removed` from one undo tick ran
`_rebuildWallBatch` and `_removeWall` concurrently — both rebuilt the same
surviving run, adding a tracked mesh AND an untracked orphan. Fixed by
serializing all wall mesh ops through `ZoneManager._wallOpChain`.

- [x] split×2 then Cmd+Z×2 back-to-back: 0 orphan meshes (every wallsGroup
      child tracked by a RunEntry), data reverted, run re-merged, colliders correct
- [x] node move + undo: 0 orphans, node position restored
- [x] WallSplitter flashes the new half (segment-highlight box, 700ms) so a
      split is visible even though the run re-merges seamlessly

## Manual spot-checks (human)

- [ ] Right-click split feel: RMB-orbit never splits (only a stationary RMB tap
      does); splitting within ~0.15m of a corner is refused
- [ ] Drag the new vertex with the node dragger — both halves follow, miters stay
      flush
- [ ] Split a wall that has a door/window: openings stay put visually; an opening
      past the split point now belongs to the second half (check Openings screen)
- [ ] Hide a segment of a closed room, Fill-with-floor still offered/works
      (loop unaffected); walk through the gap in game mode (no invisible wall)
- [ ] Hide ALL segments of a run — ghosts remain clickable in the editor to
      re-show; in preview the whole run is gone
- [ ] Undo/redo across split + hide + material edits interleaved — one logical
      change at a time
- [ ] Group hide/show on a run containing a hidden segment behaves sanely
      (ghost tracks the group visibility in the editor)
