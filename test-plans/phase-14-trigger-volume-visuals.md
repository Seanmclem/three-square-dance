# Phase 14 — Trigger Volume Configurable Visuals ("warp box" fill) — Test Plan

## Prerequisites
- `npm run typecheck` passes with zero TypeScript errors.
- Dev server running on `http://localhost:7373`.

> **Scope.** Trigger volumes rendered only as an editor-only amber wireframe
> (`userData.hideInGame = true`). This phase adds an **optional** in-world gradient fill
> (`TriggerVolume.visual`, discriminated by `style: "gradient"`) that is **visible in
> preview AND game**, configurable per-volume (color / fade direction / opacity / gradient
> height / animation). Default is **off** — a new volume has no `visual` and behaves exactly
> as before. See `WORLD_EDITOR_ARCHITECTURE.md` v4.3.0.
>
> Data/mesh/shader acceptance is verified **programmatically** via `window.__world` /
> `window.__zones` / `window.__scene`. The panel render + one real click are verified through
> the UI. (RAF is throttled/paused when the automation tab is backgrounded — a `computer
> screenshot` forces frames; that's how `uTime` advancement is observed.)

---

## 1. Fill mesh builds alongside the wireframe (gate)

```js
const w = window.__world, zid = w.activeZoneId;
w.addTriggerVolume(zid, { id: "tv_test", label: "Test Warp",
  position:{x:3,y:0,z:-4}, size:{x:2,y:3,z:2},
  visual:{ enabled:true, style:"gradient", color:"#5a3d8f", fadeDir:"up", opacity:0.8, fadeHeight:1, animate:false } });
const r = [];
window.__scene.traverse(o => { if (o.userData?.editorId === "tv_test")
  r.push({ kind:o.type, mat:o.material?.type, hideInGame:!!o.userData.hideInGame }); });
console.log(r);
```

- [ ] Two meshes for `tv_test`: a `LineSegments` (`LineBasicMaterial`, `hideInGame:true`) and a
      `Mesh` (`ShaderMaterial`, `hideInGame:false`).
- [ ] The `ShaderMaterial` has uniforms `uColor/uOpacity/uFadeDir/uFadeHeight/uSizeY/uTime/uAnimate`.
- [ ] **Visual:** the box renders as a purple fill, opaque at the bottom fading to transparent
      at the top, with the amber wireframe around it.

## 2. Core check — fill visible in game, wireframe hidden

```js
window.__world.setDefaultSpawn({ position:{x:0,y:0,z:0}, facing:0 });
window.__test.enterGame();
// after ~400ms:
const r = []; window.__scene.traverse(o => { if (o.userData?.editorId === "tv_test")
  r.push({ kind:o.type, visible:o.visible }); });
console.log(r); // LineSegments visible:false, Mesh visible:true
```

- [ ] In game the wireframe `LineSegments` is `visible:false` while the fill `Mesh` stays
      `visible:true`. (Enter preview instead → **both** visible.)
- [ ] `window.__test.exitPreview()` restores the editor view.

## 3. All knobs drive the shader live + persist

```js
const w = window.__world, zid = w.activeZoneId;
w.updateTriggerVolume(zid, "tv_test", { visual:{ enabled:true, style:"gradient",
  color:"#33ffcc", fadeDir:"down", opacity:0.5, fadeHeight:0.6, animate:true } });
// after ~200ms, read the rebuilt fill material:
let mat=null; window.__scene.traverse(o=>{ if(o.userData?.editorId==="tv_test"&&o.material?.uniforms) mat=o.material; });
console.log('#'+mat.uniforms.uColor.value.getHexString(), mat.uniforms.uFadeDir.value,
  mat.uniforms.uOpacity.value, mat.uniforms.uFadeHeight.value, mat.uniforms.uAnimate.value);
```

- [ ] Uniforms reflect the edit: color `#33ffcc`, `uFadeDir = -1` (down), `uOpacity = 0.5`,
      `uFadeHeight = 0.6`, `uAnimate = 1`.
- [ ] **Visual:** now cyan/green, opaque at the **top** fading down (fade direction flipped),
      lower opacity.
- [ ] `window.__world.toJSON()` carries the full `visual` object on `tv_test`.

## 4. Animation ticks when frames run

```js
// material is in the animated set:
window.__zones._animatedVolumeMats.size;               // 1 (with animate:true)
window.__zones._animatedVolumeMats.has(mat);           // true
// manual advance proves the wiring:
const b = mat.uniforms.uTime.value; window.__zones.updateVolumeVisuals(0.5);
mat.uniforms.uTime.value > b;                           // true
```

- [ ] With `animate:true` the fill material is in `_animatedVolumeMats`; `updateVolumeVisuals(dt)`
      advances `uTime`.
- [ ] After a few real frames (take a `computer screenshot` to force RAF), `uTime` has advanced
      well past 0 — confirming the `scene.onUpdate` registration in `App.tsx` fires per frame.
- [ ] **Perf:** with no animated volumes, `updateVolumeVisuals` early-returns; the FPS counter's
      worst-ms stays flat.

## 5. Disable disposes the fill

```js
const w = window.__world, zid = w.activeZoneId;
w.updateTriggerVolume(zid, "tv_test", { visual:{ enabled:false, style:"gradient",
  color:"#33ffcc", fadeDir:"down", opacity:0.5, fadeHeight:0.6, animate:true } });
// after ~150ms:
let fills=0, wires=0; window.__scene.traverse(o=>{ if(o.userData?.editorId==="tv_test"){
  if(o.material?.uniforms) fills++; else if(o.type==="LineSegments") wires++; } });
console.log(fills, wires, window.__zones._animatedVolumeMats.size); // 0 1 0
```

- [ ] Fill mesh removed (0), wireframe retained (1), `_animatedVolumeMats` emptied (0).

## 6. Real UI path — panel renders + edit lands

- [ ] Switch to the **Trigger** tool, click an existing volume → PropertiesPanel shows a
      **VISUAL** section: *Show gradient fill* checkbox, then (when enabled) Color / Fade
      (up/down) / Opacity / Gradient height / Animate (pulse).
- [ ] Toggling **Show gradient fill** on seeds a default visual and the fill appears; toggling
      off removes it.
- [ ] Clicking the **Animate (pulse)** checkbox writes `visual.animate = true` into
      `world.zones.get(zid).triggerVolumes[…]` **and** `toJSON()` (real select→panel→data path).

## 7. Always

- [ ] `npm run typecheck` → 0 errors; no Vite checker overlay; console clean.
- [ ] A volume with **no** `visual` (or `enabled:false`) is fully invisible in game, unchanged
      from prior behavior.
