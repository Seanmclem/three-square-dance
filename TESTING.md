# Testing Guide

How to test the World Editor — written so a future Claude session (or a human)
can pick it up cold and run an interactive pass.

---

## 1. Tooling reality — how to drive the browser

The app is a browser canvas app, so testing means clicking inside a browser.

| Tool | Can it click the browser? | Notes |
|---|---|---|
| `computer-use` MCP | **No** | Browsers are granted at tier `"read"` — screenshots only. This is a hard harness rule, cannot be elevated via `request_access`. |
| Claude browser extension (`/chrome`) | **Yes** | The extension named **"Claude"** in the Chrome Web Store. Works in Edge too (Chromium). Exposes `mcp__claude-in-chrome__*` tools once connected. |
| Playwright | **Yes** | Headless, no tier limit. Not installed yet — fallback if the extension route fails. |

### Connecting the browser extension

1. Install the **"Claude"** extension (Chrome Web Store — works in Edge).
2. In the Claude Code session, run `/chrome` to connect (or start with
   `claude --chrome`). If it reports "extension not detected", restart the
   browser once and retry.
3. Verify it worked: `ToolSearch` for `chrome` should now return
   `mcp__claude-in-chrome__*` tools. If none appear, it is **not** connected —
   do not fall back to `computer-use` clicks, they will be blocked.

---

## 2. Verifying WebGL canvas content

**`mcp__computer-use__screenshot` cannot reliably capture the WebGL canvas on
this Mac.** On a Retina / Display P3 setup, the OS compositor screenshot shows
the canvas as uniformly dark even when the GL drawing buffer has bright content.
Do not trust computer-use screenshots to verify whether 3D geometry is rendering.

### What to use instead

**For geometry / logic correctness** (preferred — fast, reliable):

```js
// Triangle count confirms render calls happened
renderer.info.reset();
renderer.render(scene, camera);
console.log(renderer.info.render.triangles); // e.g. 26 = sky(12)+ground(2)+wall(12)

// Vertex positions confirm geometry is correct
const pos = mesh.geometry.attributes.position;
for (let i = 0; i < pos.count; i++)
  console.log(pos.getX(i), pos.getY(i), pos.getZ(i));

// Scene-graph state confirms ZoneManager built correctly
const entry = window.__zones._loadedZones.get('demo');
console.log(entry.wallsGroup.children.length); // mesh count
console.log([...new Set(entry.wallData.values())].map(r => r.wallIds)); // run groupings

// GL pixels confirm a specific world-space point rendered with color
const gl = renderer.domElement.getContext('webgl2');
renderer.render(scene, camera);
const px = new Uint8Array(4);
gl.readPixels(canvas.width/2, canvas.height/2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
console.log(px); // e.g. [143, 105, 88, 255] = brick color
```

**For visual screenshots** (when you actually need a picture):

Use the **Chrome MCP** `mcp__claude-in-chrome__gif_creator` or a
`browser_batch` containing a `screenshot` action — these capture the page via
the extension's DOM-aware pipeline and correctly show WebGL canvas output.

`computer-use` screenshots are fine for reading **UI chrome** (toolbar buttons,
PropertiesPanel text, coordinate readout) but useless for verifying 3D content.

### Dev globals (DEV mode only)

`App.tsx` exposes these on `window` in development:

| Global | Type | What it is |
|---|---|---|
| `window.__scene` | `THREE.Scene` | The active scene |
| `window.__camera` | `THREE.Camera` | The editor camera |
| `window.__renderer` | `THREE.WebGLRenderer` | The renderer |
| `window.__world` | `WorldState` | Zone/wall/floor data |
| `window.__zones` | `ZoneManager` | Loaded zone entries & meshes |

---

## 3. Strategies for visual-interactive testing (Chrome MCP)

Lessons for driving a 3D canvas app reliably:

- **Dev server:** `npm run dev -- --port 7373` → app at `http://localhost:7373`.
- **Go slow.** One action → screenshot → verify → next action. Never batch
  clicks across unverified UI state — a wrong assumption compounds.
- **Verify in two places.** After every interaction check *both* the 3D
  viewport (emissive glow on the mesh) *and* the PropertiesPanel DOM text.
  Either alone can mislead.
- **Use `zoom`** to read small text — PropertiesPanel values, the coordinate
  readout, the floor selector. The full-screen screenshot downscales them.
- **Canvas picks are pixel-based.** There are no DOM nodes for 3D objects.
  Read a target's screen pixel from a screenshot, click that pixel, screenshot
  again to confirm.
- **Camera state matters.** On load the editor camera is at a deterministic
  default, so object screen positions are predictable. If you orbit/pan/zoom
  (RMB / MMB / scroll / WASD), positions change — reload before any
  coordinate-based click sequence, or re-screenshot first.
- **Watch for errors.** The vite-plugin-checker overlay (red, top of page) and
  the browser console surface TS / runtime errors. A clean run shows neither.

---

## 4. Phase 4.7 — Merged Wall Runs test

After placing walls via `world.addWall(...)` or the Wall tool:

| Check | Command | Expected |
|---|---|---|
| No duplicate meshes | `entry.wallsGroup.children.length` | equals number of unique runs |
| Merge happened | `[...new Set(entry.wallData.values())].map(r=>r.wallIds)` | compatible adjacent walls share one entry |
| Miter vertex count | `mesh.geometry.attributes.position.count` | `nodeCount × 4` |
| T-junction not merged | add 3 walls at one node, check runIds | 3 separate runs |
| Race-free add | add w1+w2 synchronously, wait 800ms | exactly 1 child mesh |

---

## 5. Phase 2 — Selection System test plan

Reload `localhost:7373` before starting. Default tool is Select.

| # | Step | Expected result |
|---|---|---|
| 1 | Initial load | Demo scene lit; PropertiesPanel shows tool desc + "Nothing selected"; "PHASE 2 — SELECTION SYSTEM" bottom-right. |
| 2 | Click a building body | Building glows blue. Panel switches to transform view: id `building_N`, type `object`, Position/Rotation/Scale inputs. |
| 3 | Click a building **roof** | Selects the **whole building** (same `building_N`) — body + roof both glow. Confirms grouped-mesh root resolution. |
| 4 | Click the freestanding wall | Wall glows; panel shows `wall_demo`, type `wall`. |
| 5 | Click the raised platform | Platform glows; panel shows `platform_demo`, type `platform`. |
| 6 | Click the staircase | Whole stair (8 steps) glows; panel shows `stair_demo`, type `stair`. |
| 7 | Hover an unselected object | Faint blue tint appears; moving the cursor off clears it. |
| 8 | Hover the currently-selected object | Stays the brighter select tint (selection wins over hover). |
| 9 | Click empty ground | Deselects: glow clears, panel returns to "Nothing selected". |
| 10 | Select object, edit Position X | After ~150ms debounce the object moves in the viewport. |
| 11 | Edit, select another object, reselect the first | First object's edited transform is retained (mesh is source of truth). |
| 12 | Switch to Wall tool, click an object | No selection change — picking is gated to the Select tool. |
| 13 | RMB orbit / MMB pan / scroll / WASD | Camera still moves normally; selection unaffected. |

Priority ordering (object > platform > wall > floor): where two tagged objects
overlap on screen, the click selects the higher-priority type. Hard to stage in
the current demo layout — revisit when real geometry exists.

---

## 6. Phase 3 — Physics Foundation + Sky + Floor Tool

Reload `localhost:7373` before starting. Switch to the Floor tool.

| # | Step | Expected result |
|---|---|---|
| 1 | Initial load | Sky visible — blue gradient with sun, no solid background color. Atmospheric fog (lighter than before). Watermark reads "PHASE 3 — PHYSICS + FLOOR TOOL". |
| 2 | Select tool → click building | Building glows; PropertiesPanel shows transform (unchanged from Phase 2). |
| 3 | Switch to Floor tool | PropertiesPanel shows "Click and drag to paint a floor region." hint. |
| 4 | Left-click on ground, drag, release | Semi-transparent blue preview rect stretches from click point to mouse. |
| 5 | Left-click to commit floor | Preview disappears; a flat grey plane mesh appears where you dragged. |
| 6 | Place floor < 0.5m wide or deep | Nothing is placed (too small), tool returns to IDLE. |
| 7 | Escape during PLACING | Preview removed, returns to IDLE with no floor placed. |
| 8 | RMB during PLACING | Preview removed, returns to IDLE with no floor placed. |
| 9 | Click floor mesh (Select tool) | PropertiesPanel shows floor panel: id, "floor · level 0", material picker list. |
| 10 | Grid snap verification | Placed floor edges land exactly on 0.5m grid. |
| 11 | No console errors | Browser console clean on load, on floor placement, on selection. |
| 12 | Physics world initialized | No "PhysicsWorld init failed" error in console. |

---

## 7. Regression checks (every phase)

- `npm run typecheck` → 0 errors.
- vite-plugin-checker overlay clean (no red banner).
- No browser-console errors on load or interaction.
- StrictMode double-mount: editor still renders once, no duplicated canvases
  or leaked listeners after a hot reload.
