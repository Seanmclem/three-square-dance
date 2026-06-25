# Testing Guide

How to test the World Editor — written so a future Claude session (or a human)
can pick it up cold and run an interactive pass.

> **Testing by hand through the UI?** See **`HUMAN_TESTING.md`** for click-by-click
> feature walkthroughs. This guide skews toward automation (Chrome MCP, dev globals,
> the `window.__test` harness). Per-phase acceptance checklists are in `test-plans/`.

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

**This project's setup (as of 2026-06-23):** the extension is installed on
**Chrome only**. It was removed from Edge because Edge was flaky. So
`list_connected_browsers` should show a **single** device — no browser picker,
no naming. Just use it. (If a second browser ever reappears, ask which to use.
Note: naming a browser via the `switch_browser` Connect-prompt does **not**
persist — it only labels the live connection; persistent device names must be set
in the extension popup, which Claude can't drive.)

---

## 2. Verifying WebGL canvas content

> **Update (2026-06-24):** the two big warnings below did **not** reproduce this
> session. `mcp__claude-in-chrome__computer` `screenshot` returned in ~1–2s and showed
> WebGL content correctly (magenta platforms, a red `fade_screen` overlay), and emitting
> on `window.__world._bus` *did* drive the live UI (group hide/show, fade, material swap
> all fired). So treat the "screenshots hang" / "synthetic emits no-op" notes as
> **intermittent / setup-dependent, not universal** — try the direct path first, fall
> back to the workarounds if it misbehaves. (`window.__bus` is now exposed if you want the
> exact rendered-App bus instance, removing any StrictMode ambiguity.)

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

⚠️ **Chrome-MCP screenshots hang on this app.** `mcp__claude-in-chrome__computer`
`screenshot` (and any extension action that waits for `document_idle`) blocks for
~45s and then times out with *"Page still loading (executeScript waited 45000ms
for document_idle)"*. This app **never reaches `document_idle`** — the RAF render
loop plus the Vite HMR websocket keep the page perpetually "busy". So do **not**
rely on screenshots here. When the extension's DOM-aware pipeline does return,
`gif_creator` / `browser_batch` screenshots show WebGL output correctly, but
expect the long wait and treat any picture as best-effort.

Prefer reading state programmatically (Section 2 snippets + DOM text via
`javascript_tool`) over taking pictures. `computer-use` screenshots are fine for
reading **UI chrome** but useless for 3D content (and also can't capture WebGL on
this Mac, per the note above).

### Dev globals (DEV mode only)

`App.tsx` exposes these on `window` in development:

| Global | Type | What it is |
|---|---|---|
| `window.__scene` | `THREE.Scene` | The active scene |
| `window.__camera` | `THREE.Camera` | The editor camera |
| `window.__renderer` | `THREE.WebGLRenderer` | The renderer |
| `window.__world` | `WorldState` | Zone/wall/floor data |
| `window.__zones` | `ZoneManager` | Loaded zone entries & meshes |
| `window.__bus` | `EventBus` | The **rendered** App's bus (use this to emit, not `__world._bus`) |
| `window.__scriptEngine` | `ScriptEngine` | Script index + dispatch |
| `window.__preview` | `PreviewController` | `enter("preview"\|"game")` / `exit()` |
| `window.__test` | object | Test harness — see Section 8 |

---

## 3. Chrome-MCP golden path (read this first)

The reliable, repeatable recipe. Skipping these steps is what makes a session
sputter — every failure mode below was hit and diagnosed in practice.

1. **Reuse the running dev server — do NOT start a second one.**
   The port is pinned to **7373** in `vite.config.ts` (`server.port`, `strictPort`).
   Check first: `lsof -ti:7373`. If the app is already up, use it. With `strictPort`,
   a second `npm run dev` while 7373 is taken **fails loudly** (rather than silently
   bumping to 7374) — so just reuse the running one.
2. **Reuse the existing World Editor tab; navigate once.** Get tabs with
   `tabs_context_mcp`, find the `localhost:<port>` tab, work in it. Wait for load
   with a **Bash `sleep`**, never an in-page await.
   - **Tag the tab so the user can find it.** First action: set
     `document.title = "🤖 CLAUDE TESTING — <Mon DD H:MMam>"` (timestamp from the
     system clock) via `javascript_tool`. If the app overwrites `document.title`
     on re-render, reapply it. A tabId is useless to the user — a labelled title
     is what they spot in the tab strip.
   - **Close the tab when done.** A new conversation always opens its own fresh
     tab, so leftover tabs pile up in the extension's tab group. Close yours at
     the end of the run (`tabs_close_mcp`).
3. **Drive via the real UI, not internals.** Select / click / type the way a user
   does. Do **not** emit bus events or call handlers on `window.__*` to *drive*
   state: `busRef = useRef(new EventBus())` + React **StrictMode** double-mount
   means `window.__world._bus` and the *rendered* App's listeners can be
   different instances — synthetic emits silently no-op against the live UI.
   `window.__*` globals are for **reading**, not driving.
4. **To select a 3D object, project its world position and click.** There are no
   DOM nodes for 3D objects, and screenshots hang (Section 2), so compute the
   pixel from the camera and `computer left_click` it (clicks work even when
   screenshots don't):
   ```js
   // javascript_tool — synchronous, returns instantly
   const cam = window.__camera, canvas = window.__renderer.domElement;
   const r = canvas.getBoundingClientRect();
   const p = new cam.position.constructor(wx, wy, wz); // THREE.Vector3 at world pos
   p.project(cam);                                     // → NDC
   const x = r.left + (p.x * 0.5 + 0.5) * r.width;
   const y = r.top  + (-p.y * 0.5 + 0.5) * r.height;
   JSON.stringify({ x: Math.round(x), y: Math.round(y) });
   ```
   Then `computer left_click` at `{x, y}`. (Reload before a coordinate-based
   click sequence — the editor camera is at a deterministic default on load, but
   any RMB-orbit / MMB-pan / scroll / WASD moves objects' screen positions.)
5. **Read results two ways, both via `javascript_tool` (synchronous only):**
   the PropertiesPanel DOM text (`document.body.innerText`) **and**
   `window.__world.toJSON()`. Either alone can mislead.
6. **Never block inside the page.** `javascript_tool` containing an in-page
   `await`/`setTimeout` times out (CDP `Runtime.evaluate`, ~45s). Keep page eval
   synchronous; put every wait *between* calls as a Bash `sleep`.

### Other lessons

- **Go slow.** One action → read state → verify → next action. Never batch
  clicks across unverified UI state — a wrong assumption compounds.
- **Watch for errors.** The vite-plugin-checker overlay (red, top of page) and
  the browser console (`read_console_messages`) surface TS / runtime errors. A
  clean run shows neither.

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

---

## 8. Driving preview mode & firing scripts (`window.__test`)

Scripts only run when the **ScriptEngine is active**, which happens on `preview:start`
(`App.tsx` → `scriptEngine.activate()`). Two ways in, both via `PreviewController.enter`:

| Mode | Call | Spawn | Notes |
|---|---|---|---|
| Preview | `__test.enterPreview()` | none needed — falls back to a floor point (`PreviewController.ts:39-47`) | walk-around test |
| Game | `__test.enterGame()` | uses `world.world.defaultSpawn` | also fires `on_game_start` |

To set a spawn for game mode without the SpawnPoint tool:
`__world.setDefaultSpawn({ position:{x:0,y:0,z:0}, facing:0 })`.

### The `__test` harness (DEV only — `src/dev/testHelpers.ts`)

Installed on `window.__test`. These are the shortcuts for things that are painful to
click from an automation tab (firing scripts, opening focus-gated panels, spawning
entities). All synchronous — safe to call from `javascript_tool`.

```js
// Spawn throwaway entities (ids are test_*/grp_* so cleanup() finds them)
__world.addGroup({ id: "grp_a", name: "A" });
__test.spawnObject({ id: "test_obj", x: 0, z: -3, groupIds: ["grp_a"] });
__test.spawnPlatform({ id: "test_plat", x: 3 });

// Fire script actions through the REAL dispatch (incl. _resolveTargets group expansion),
// no preview needed:
__test.runAction({ type: "despawn_object",  targetId: "grp_a" });               // hides all members
__test.runAction({ type: "move_object",     targetId: "test_obj", position:{x:5,y:0,z:0} });
__test.runAction({ type: "change_material", targetId: "test_obj", material: "brick" });

// Fire a trigger through the index (after entering preview + authoring a script):
__test.enterGame();
__test.fire("on_game_start");
__test.fire("on_interact", "test_obj");

__test.openPanel("groups");   // reliable replacement for the focus-gated `z` hotkey
__test.exitPreview();
__test.cleanup();             // remove all test_*/grp_* entities + groups
```

### Persisted vs runtime (important when validating script actions)

Script actions emit raw bus events and **never** touch `WorldState`, so they affect only
the live Three.js scene — `__world.toJSON()` is unchanged and a zone reload reverts them.
This is by design. To verify a script effect, **read the mesh**, not the JSON:

```js
// e.g. confirm despawn hid the member but not a non-member
let vis = {}; __scene.traverse(o => { if (o.userData?.editorId) vis[o.userData.editorId] ??= o.visible; });
```

Editor edits, by contrast, go through `WorldState.updateObject` → persisted + undoable.
