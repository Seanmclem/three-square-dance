# Phase 39 acceptance — brush inset / edge split / recess

Setup: place a **box** shape, select it, Geometry → **Convert to Brush**
(8 verts / 6 faces). Manifold probe (console, after every op — every undirected
edge must be traversed exactly twice):

```js
const S = () => __world.toJSON().zones[0].shapes.find(s => s.mesh?.faces && s.id === "<id>");
const manifold = m => { const c = new Map(); for (const f of m.faces) for (let i = 0; i < f.verts.length; i++) { const a = f.verts[i], b = f.verts[(i+1)%f.verts.length]; const k = a < b ? a+"_"+b : b+"_"+a; c.set(k, (c.get(k) ?? 0) + 1); } return [...c.values()].every(n => n === 2); };
```

| # | Step | Expected |
|---|---|---|
| 1 | Face mode (2), select the top face, click **INSET** | verts 8→12, faces 6→10; manifold ✓; selected face is now the 4-corner **inner** face at the same index; inner loop is the top shrunk by exactly 0.25 on every side |
| 2 | Click **RECESS** (inner face still selected) | verts 16, faces 14; manifold ✓; cap verts sit exactly 0.25 below the top plane — a square pit with uniform borders |
| 3 | Keep clicking **INSET** on the shrinking pit floor | Two more insets land; further clicks abort with `brushOps.insetFace: inner loop collapsed (margin too large)` warn, state unchanged |
| 4 | Click **EXTRUDE** | Cap moves +0.25 outward (regression: outward extrude unchanged); manifold ✓ |
| 5 | Click **SPLIT ─** on a quad face | +2 verts (edge midpoints), +1 face; manifold ✓ (regression: spliceMidpoint refactor) |
| 6 | Edge mode (4), click a brush face near an edge | Panel shows the **EDGE** card: `EDGE Va – Vb` + endpoint coords + SPLIT EDGE button |
| 7 | Click **SPLIT EDGE** | +1 vert at the exact midpoint, face count unchanged, both adjacent loops gain a corner (quads → pentagons); manifold ✓; the panel card + edge gizmo now show the surviving **sub-edge** `[a, mid]` (selection survived the re-emit) |
| 8 | Cmd+Z repeatedly | Exactly one op undone per press, every intermediate state manifold |
| 9 | INSET on an elongated face (e.g. 6×2.5) | Border is visually uniform 0.25 on ALL sides (miter offset, not centroid scale) |
| 10 | Console | No errors; warns only when ops legitimately abort |
| 11 | `npm run typecheck` | 0 errors |

Verified 2026-07-17 (in-browser, real panel buttons, Chrome MCP): all rows pass.
Demo left in level-2: `demo_p39_carved_wall` — window recess + end boss + split-edge
roof peak, brick, at (40, 0, 24).
