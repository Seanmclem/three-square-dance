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

## 5. Editor preview vs. a dedicated runtime

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

## 6. Prioritized checklist

1. **Zero-trade-off cleanups first (always).** Reuse per-frame allocations; no whole-scene or
   skinned raycasts in the loop; no per-frame `setState`. These never regress anything.
2. **Measure.** Reproduce, watch the counter's worst-ms, then record a DevTools Performance trace
   and identify the tall frames (GC? shadow? skinning? React?).
3. **Only then pull visual/behavior levers** — shadow quality, `castShadow` on characters,
   frustum culling with padded bounds — guided by what the profile actually showed. And compare
   against the **production build** before concluding the runtime is the problem.
