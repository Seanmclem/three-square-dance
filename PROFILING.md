# Profiling & Performance Tuning

How to find and fix frame-time dips in the World Editor / preview runtime. Written after a
session chasing "dips I feel even though FPS reads 120" — the process and the specific culprits
are worth keeping.

> TL;DR order of operations: **(1) do zero-trade-off cleanups, always. (2) Measure — counter ms,
> then DevTools. (3) Only then pull visual/behavior levers (shadows, culling), guided by the
> profile.** Don't reach for shadow/quality knobs before you've profiled.

---

## 1. Quick gauge — the in-app counter

`src/ui/FpsCounter.tsx` draws a small readout top-left of the canvas: **avg FPS** and the
**worst single-frame time (ms)** over each 0.5s window.

**Watch the ms, not the FPS.** Average FPS over 500ms hides brief hitches (a couple of long
frames barely move the average), and it's capped at the display refresh (120Hz here) — so a
stutter you *feel* can sit at a steady "120 FPS". The worst-ms surfaces it:

- **~8.3ms** @120Hz (or ~16.7ms @60Hz) = every frame on time.
- A spike to **17ms+** = at least one dropped frame — that's the dip.
- Colors: green ≤12ms, amber ≤24ms, red above.

Reproduce the thing that feels bad (walk through the trigger, stand near the NPC) and watch the
ms. If it stays ~8 and it *still* feels off, it's probably not a render-rate issue (input
latency, animation timing) — look elsewhere.

> **Automation caveat:** a backgrounded tab freezes `requestAnimationFrame`, so the counter (and
> any rAF-based measurement) reads ~0 / a huge ms gap. **Profile in a focused, foreground
> window.**

---

## 2. Real profiling — Chrome DevTools › Performance

The definitive tool. The counter tells you *that* there's a hitch; this tells you *what*.

1. Open **DevTools → Performance**. Tick **Memory** (to see allocation → GC), optionally set
   **CPU: 4×–6× slowdown** to exaggerate spikes.
2. Click **Record**, reproduce the dip for ~3s (e.g. walk through the trigger), **Stop**.
3. Read the **Main** thread track. Tall/long frames overran their budget. Colors:
   - **Yellow (Scripting)** — JS: skinning setup, React re-renders, script fires, our `update()`
     loops.
   - **Purple/Green (Rendering/Painting)** — layout + GPU submit: draw calls, the **shadow pass**.
   - **Grey (Idle)** — waiting (good).
4. Look for the tell-tales:
   - **GC / Minor GC** entries in Main = allocation pauses (the classic "micro-stutter at high
     FPS"). Confirm with the **Memory** graph's sawtooth — steep saws = lots of per-frame garbage.
   - A repeating **long "Animation" / skinning / render** block each frame = GPU/skinning bound.
5. Select a long frame → **Bottom-Up** or **Call Tree** to find the exact hot function, then map
   it to §3.

---

## 3. This app's per-frame hot paths (where to look)

The RAF loop is `SceneManager._loop` (`src/core/SceneManager.ts`), each frame:

- `editorCamera.update(dt)` (editor only)
- every registered `onUpdate(dt)` callback:
  - `physicsWorld.step(dt)` and `objectPlacer.update(dt)` — `src/App.tsx:287,289`
  - in preview/game also `controller.update(dt)` + `triggers.update()` — the `updateFn`
    registered in `src/preview/PreviewController.ts:65`
- `renderer.render(...)` — **plus a full shadow-map pass** (re-renders every shadow caster,
  re-skinning every skinned character, every frame)

So the usual suspects live in: `CharacterController.update`, `ObjectPlacer.update` (animation
mixers), `TriggerSystem.update`, `PhysicsWorld.step`, and the render/shadow pass.

---

## 4. Known culprits & fixes (catalog from this codebase)

- **Per-frame allocations in update loops** → GC scavenge pauses = the classic hitch while FPS
  reads high. Reuse scratch objects instead of `new`-ing each frame. Examples already done:
  `CharacterController`'s `_tmp*` vectors + a reused `_ray`; `SceneManager._loopBound` (bind
  once). Still open: the `new Set()` per frame in `TriggerSystem.update`.

- **Per-frame full-scene raycasts, especially against skinned meshes** — `intersectObjects(scene,
  true)` CPU-skins every vertex of an animated mesh when the ray points at it. The interact
  system used to do this (tanked FPS near the NPC) and now uses a cheap proximity + facing scan
  (`CharacterController`). Don't reintroduce whole-scene / skinned raycasts in the loop.

- **Shadow pass re-skinning characters** — the shadow map re-renders every frame; each skinned
  character is skinned twice (shadow + main). Levers, cheapest first:
  - shadow map size + filter — currently **1024² + PCF** (`src/core/SceneManager.ts`); was
    2048² + PCFSoft.
  - `castShadow = false` on the skinned character meshes → removes them from the shadow pass
    entirely (**biggest remaining win**; trade-off: characters don't drop a shadow).
  - `renderer.shadowMap.autoUpdate = false` + manual `needsUpdate` — only for *static* scenes;
    not viable with moving animated characters unless combined with the above.
  - tighten the sun's shadow-camera frustum (`sun.shadow.camera` bounds) — quality, not cost.

- **Frustum culling forced off on skinned meshes** (`frustumCulled = false` in `ObjectPlacer`
  and the avatar loader). Reason: three.js culls by `geometry.boundingSphere`, computed from the
  **bind pose** — it doesn't follow animated bones, so a large animation (a fall, a reach) can
  push verts outside it and the mesh gets wrongly culled and pops out of view. **Fix:** inflate
  the bounding sphere (e.g. `mesh.geometry.boundingSphere.radius *= 2`, or set a generous manual
  sphere) to cover the animation range, then re-enable `frustumCulled = true`. Keeps the perf win
  (skip off-screen characters in render *and* shadow pass) without the pop.

- **Trigger / script fires** — firing a script on `on_player_enter`/`on_player_exit` is cheap and
  happens once per crossing. Watch for: non-`oneShot` scripts re-firing if the sensor overlap
  flickers at the boundary, and heavy actions — `change_material` / `move_object` emit
  `object:updated` which rebuilds/re-tags the target mesh (a one-time hitch).

- **React re-renders inside the frame loop** — never `setState` per frame. Drive Three.js
  directly; only push to React on discrete events. (The FPS counter's 2/second `setState` is
  fine; per-frame is not.)

---

## 5. Draw calls, batching & material sharing

The GPU-side cost is roughly *draw calls × per-draw overhead*. Two common asks — "share materials"
and "instance repeated objects" — map onto how geometry/materials are already built here.

**Materials are already shared (nothing to do).** `AssetManager.getMaterial(id)`
(`src/core/AssetManager.ts`) returns **one cached `MeshStandardMaterial`** per `id:quality`,
reused by every wall/floor/platform/stair with that material. Textures are cached by URL
(`loadTexture`), so even different materials sharing a texture upload it once. Tiling is baked
into **UV coordinates** (`src/builders/UVUtils.ts`), *not* `texture.repeat`, so one shared
material serves surfaces of any size/tiling. A distinct ("owned") material is created only for
genuine per-instance state:
- a `MaterialOverrides` object on that surface (`getMaterialWithOverrides` — uncached), or
- copy-on-write clones for the selection/hover tint (`SelectionManager`) and inactive-floor
  dimming (`ZoneManager`) — they `.clone()` so they never corrupt the shared cache.

The `_ownsMaterial` userData flag marks owned vs shared, and disposal respects it (shared cache
materials are freed by the cache, not the mesh). *(Tiny gap: `getMaterialWithOverrides` isn't
cached, so two surfaces with identical overrides make two materials — rarely hit.)*

**Draw-call structure today.** Walls are merged into **one mesh per run** (`groupWallRuns` +
`WallBuilder.buildRun`); floors are **one mesh each**; platforms/stairs are a few meshes each;
each **placed object is its own `Object3D`** (`ObjectPlacer.build`). Identical placed assets
already **share `BufferGeometry`** (GLTF cache + `SkeletonUtils.clone` / `Object3D.clone`) — good
for memory/uploads — but they are **not batched**, so N copies = N draw calls.

**When `InstancedMesh` would help (future, not currently warranted).** It collapses many copies of
the *same* geometry into **one draw call**, but only fits **many identical *static* props**:
same asset + material, **no overrides**, **not skinned/animated**, **no CSG cut**. Excluded:
- skinned/animated objects (per-instance bone matrices — would need instanced skinning),
- override / CSG-cut meshes (unique geometry per instance),
- walls/floors/stairs (already unique or merged).

The real cost of adopting it isn't the batching — it's **editor integration**: instanced picking
& selection (by `instanceId`), per-instance transforms/edits, add/remove rebuilds. So treat it as
a **"reach for it when a scene actually has hundreds of repeated static props"** optimization,
decided by the draw-call number below — not a speculative rewrite. (A scene of walls/floors + a
skinned character gains nothing.)

**Measure draw calls** (per `TESTING.md §2`):

```js
const r = window.__renderer;
r.info.reset();
r.render(window.__scene, window.__camera);
console.log(r.info.render.calls, r.info.render.triangles); // draw calls, triangles
// mesh counts per zone:
const e = window.__zones._loadedZones.get('demo');
console.log(e.wallsGroup.children.length, e.floorsGroup.children.length, e.objectsGroup.children.length);
```

---

## 6. Editor preview vs. a dedicated runtime

Running the game *inside the editor* does add overhead: React reconciliation, live editor
managers, the Vite HMR websocket, and — in **development only** — React **StrictMode
double-mounts** the App, so two live instances exist (this is the "split-brain" that makes
`window.__*` debugging flaky; see `TESTING.md §3`).

But most of that is dev-only or small. The dominant costs — skinning, the shadow pass, draw
calls — are identical whether you run in the editor or a stripped standalone runtime.

**So measure the production build first:**

```
npm run build && npm run preview
```

That serves a minified build with **no StrictMode double-mount, no HMR, no dev checks** — it's
the true perf floor and is already noticeably faster than `npm run dev`. If it's smooth in the
prod build, the "dips" were dev overhead. A separate runtime would shave the remaining
editor/React margin, but it's a modest, later optimization — not where the big wins are.

---

## 7. "Stutter" that is NOT frame rate: camera-motion judder

Learned in the 2026-07-05 session (subway stairs / obby platform jump): both "it stutters
there" reports reproduced with a **perfect frame profile** (median 8.6ms @120Hz, zero dropped
frames at the spot). The stutter was *camera motion*, not render rate:

- **Stairs (FPS + third person):** the capsule climbs steps in per-frame *pulses* (2–3 flat
  frames, then a ~0.05–0.1m snap; descending = repeated micro-falls). A camera rigidly locked
  to the body Y turns that into visible judder. **Fix (in place):** the camera height follows a
  smoothed body Y — `CAM_Y_RATE_GROUND/AIR` + `CAM_Y_MAX_LAG` in `CharacterController` —
  heavy smoothing grounded, near-rigid airborne, snap on teleport.
- **Spring-arm occlusion (third person):** applying the occlusion raycast distance instantly
  teleports the camera meters in one frame when the ray grazes a platform edge (measured
  4.0→0.6→4.0m across single frames during a platform jump). **Fix (in place):** asymmetric
  smoothing — `ARM_RATE_IN` (fast, walls still can't clip through) / `ARM_RATE_OUT` (slow
  release) in `CharacterController`.

**Triage rule:** if the counter's worst-ms stays green at the "stuttery" spot, record
`body.position.y` and `camera.position` per frame and diff them — pulsed body dy with rigid
camera = judder, not perf. (Per-frame recorder snippets: TESTING.md §2.)

Related, found the same session: **major-GC pause trains** are the only real frame drops in
small levels — a burst of 3–7 consecutive 15–37ms frames every ~60–90s, *identical in the
production build* (so not dev overhead; heap sawtooth ~55KB/s → periodic major GC). Small,
unavoidable baseline; keep per-frame allocation discipline so it doesn't get worse.

## 8. Baseline numbers (known-good reference levels, 2026-07-05)

Measured in "New Game" mode, dev build, 120Hz Retina MacBook, DPR capped at 2:

| Level | draw calls | triangles | median frame | p99 | notes |
|---|---|---|---|---|---|
| `subway1.json` (6 walls, 2 floors, 2 stairs+railings, 1 platform) | 14–15 | 250–850 | 8.6ms | 12ms | FPS mode, zero dropped frames incl. look-around sweeps |
| `Obby1.json` (4 platforms, 2 trigger volumes, animated warp box, skinned avatar) | ~15 | ~1k | 8.7ms | 12ms | third person; GC bursts only (see §7) |
| `test-project2/level-2.json` (41 walls incl. a two-storey stack, 2 floors, 2 platforms, 1 stair, 2 NPCs) — measured 2026-07-19 | 29–32 | ~4k | 8.4ms | 17.9ms | first person, walking; 2177-frame sample. Median sits on the 120Hz vsync floor, so the scene is not GPU-bound; the p99 includes automation/CDP hitches |

**Flat wall normals (v4.33.14) — measured cost.** `WallBuilder` unshares wall vertices
(`toNonIndexed`) to get true per-face normals. What that does and doesn't cost:

- **Triangles: unchanged. Draw calls: unchanged.** Only the vertex count rises — same
  triangles, just unshared. In the level above, walls went ~290 → 1440 verts, i.e. **5.3%**
  of the scene's 27.3k verts (~+4% scene-wide). Unmeasurable against the vsync floor.
- **Build cost is editor-only** (walls build once at scene load). Timed per run:
  `toNonIndexed` + `computeVertexNormals` adds **~0.1ms** to a 22-point run (0.4ms total)
  and ~0.2ms to a synthetic 200-point run — versus **2.6ms** for a single CSG'd door
  opening in the same run. Normals are not the term that matters in a rebuild.
- **Scaling caveat:** cost is linear in wall count, so a level with 10× the walls carries
  ~+11.5k verts. Still small, but if wall geometry ever dominates a scene, the cheaper fix
  is to emit per-face vertices directly in the builder instead of converting after.

The FpsCounter (top-left) now shows **draw calls · triangles** alongside FPS/worst-ms — compare
any future level against these; draw calls are the number that compounds with level size (§5).

## 9. Prioritized checklist

1. **Zero-trade-off cleanups first (always).** Reuse per-frame allocations; no whole-scene or
   skinned raycasts in the loop; no per-frame `setState`. These never regress anything.
2. **Measure.** Reproduce, watch the counter's worst-ms, then record a DevTools Performance trace
   and identify the tall frames (GC? shadow? skinning? React?).
3. **Only then pull visual/behavior levers** — shadow quality, `castShadow` on characters,
   frustum culling with padded bounds — guided by what the profile actually showed. And compare
   against the **production build** before concluding the runtime is the problem.
