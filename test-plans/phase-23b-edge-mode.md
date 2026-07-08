# Phase 23b — Edge Select/Drag Mode — Test Plan

Verified 2026-07-08 during implementation (v4.14.0) via Chrome MCP against real UI
paths. Re-run after changes to SelectionManager edge resolution, BrushEdgeEditor,
or the BrushFaceHighlighter tube/outline arms.

Test subject: a console-spawned cloud brush (`addShape` with 8 box corners, no faces)
so the edge-mode auto-bake path is exercised too.

## Checks

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | Select popover + Digit4 | "╱ Edge (4)" variant; hotkey switches; TOOL_INFO hint | ✅ |
| 2 | First edge-mode click on a cloud brush | auto-bakes 6 faces (one "bake brush faces" undo entry); no edge selected yet (faceGroups didn't exist at click time — same as face mode) | ✅ |
| 3 | Second click near an edge | `object:selected.edgeVerts` = nearest boundary edge of the hit face (got [5,7], the top-back edge) | ✅ |
| 4 | Overlays | 1 blue tube on the selected edge + black outlines on all face boundaries; exactly 1 visible TransformControls (entity gizmo suspended via "edge-mode") | ✅ |
| 5 | Edge TC drag (real mouse, Y axis) | exactly the edge's 2 verts move by the same snapped delta (y 2 → 0.25); all other verts + x/z byte-stable; edge selection survives | ✅ |
| 6 | Undo | one Cmd+Z restores all 8 verts exactly | ✅ |
| 7 | Mode switch to 1 | tube + outlines cleared; sub-selection dropped | ✅ |
| 8 | Non-brush shapes in edge mode | plain object select (no faceGroups → no edge) | ✅ (code path shared with face mode) |

## Edge identity / clamp semantics

Edges have no stored identity — the selection is the unordered vertex-index pair.
`_emitSelected` drops the edge iff no face loop traverses the pair anymore, so it
survives ops that keep the edge and clears cleanly after topology changes/undo.

## Known v1 limits (by design)

- No edges list in the Geometry panel (canvas-only workflow; face/vertex lists exist).
- No edge hover highlight; no multi-edge selection.
- Same non-planar-quad folding note as face drags: dragging one edge of a quad face
  folds it geometrically (fan triangulation), shading stays flat.
