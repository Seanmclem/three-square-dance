# Phase 23 — Face/Vertex Sub-object Editing — Test Plan

Verified 2026-07-07 during implementation (v4.11.0) via Chrome MCP against real UI
paths. Re-run after changes to `brushOps`, the ShapeBuilder face path,
`registerShapeTrimesh`, SelectionManager modes, or the Brush* editor modules.

**Remote-testing gotcha hit twice this phase:** with a resized window the `computer`
tool's screenshot pixels ≠ CSS pixels — always scale computed coordinates by
`screenshotW / rect.width` (TESTING.md §3 lesson 1), and take a screenshot immediately
before precision drags (focus swallowing, lesson 6). Also: **fresh colliders answer
console ray/KCC queries only after one `physicsWorld.step()`** — the editor doesn't
step physics (preview does). Both false-alarmed as product bugs before being identified.

## M1 — faces data model + builder + trimesh

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | facesFromCloud(box corners) | 8 verts, 6 quad loops, validateMesh null | ✅ |
| 2 | Face-brush build | 1 mesh (single material), 12 tris, faceGroups(6), collider ShapeType 6 (TriMesh) | ✅ |
| 3 | Concave L (hand-authored 8 loops) | validateMesh null; renders concave | ✅ |
| 4 | Concave collision | Rays hit inner notch walls at exactly 1.0; KCC inside the notch blocked at ±0.69 (wall + capsule radius) — a hull would fill the notch | ✅ exact |
| 5 | Stand on trimesh top (real preview) | settles y = top + body offset, rock-stable | ✅ 2.92 |
| 6 | Faces survive save/load | autosave round-trip preserves mesh.faces | ✅ |
| 7 | FIX_INTERNAL_EDGES flag | works identically to flagless (early "dead shape" was the un-stepped query pipeline) | ✅ |

## M2 — select modes + picking + highlight

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | 1/2/3 hotkeys + Select variants popover | mode switches; icons; TOOL_INFO hints | ✅ |
| 2 | Face clicks resolve exact faces | top → normal (0,1,0), front → (0,0,1); overlay tracks | ✅ |
| 3 | Mode switch | clears sub-selection + overlay, keeps object selected, re-emits without faceIndex | ✅ |
| 4 | isSelectMode sweep | ~25 sites; plain Select behaviorally identical; typecheck-enforced entries | ✅ |

## M3 — gizmos + auto-bake

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | Cloud brush auto-bake | first face-mode selection bakes 6 faces (one undo entry; undo/redo cycled) | ✅ |
| 2 | Face TC drag (real mouse) | top face verts 2→3 (snap 0.25), faces intact, entity gizmo suspended | ✅ |
| 3 | Suspend race fix | attach() no longer overrides same-dispatch suspenders | ✅ (was 2 gizmos) |
| 4 | Vertex mode | handles vertex-mode-only; click → cyan + sub-select + corner TC | ✅ |
| 5 | Vertex TC drag | single corner 3→3.5 snapped, topology intact | ✅ |

## M4 — panel lists + per-face materials

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | FACES list (face mode) | 6 rows; selected row expanded (corners, material, TILE) | ✅ |
| 2 | Per-face material via row select | face → brick; mesh splits into 10+2-tri material groups (2 materials) | ✅ |
| 3 | CORNERS list (vertex mode) | selected row X/Y/Z inputs; Y edit moved exactly v5 → 3.5 | ✅ |
| 4 | Materials screen (face-brush) | per-face rows replace TOP/BOTTOM+SIDES; hover highlights | ✅ (render verified) |

## M5 — split + extrude

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | SPLIT ─ (panel button) | 6→7 faces, 8→10 verts, **2 neighbor pentagons** (T-junction propagation), validateMesh null, selection kept | ✅ |
| 2 | EXTRUDE | 7→11 faces (+4 sides), cap at exactly +0.25, manifold | ✅ |
| 3 | Undo chain | 2 undos → pristine 6-face/8-vert box, valid | ✅ |
| 4 | Visual seam | split+extruded step renders watertight (screenshot) | ✅ |
| 5 | Split on non-quads | buttons disabled + hint | ✅ (code-gated) |

## Regressions

- `npm run typecheck` 0 errors per milestone; vite overlay clean; user's world (3 shapes)
  byte-preserved through every session. ✅

## Known v1 limits (by design)

- Vertex delete / + Add corner disabled on face-brushes (split/extrude are the topology tools).
- Split is quads-only; no negative (inward) extrude.
- Non-planar quads (after corner drags) fold geometrically but shade flat.
- Sub-object UI is single-selection only.
- faceIndex may retarget to a different face after undo of a topology op (index reuse).
