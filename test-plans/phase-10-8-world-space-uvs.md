# Phase 10.8 — World-Space UV Generation — Test Plan

## Prerequisites
- `npm run typecheck` and `npm run build` pass with zero errors.
- Dev server running: `npm run dev -- --port 7373` → app at `http://localhost:7373`.
- Browser driven via the **Claude** extension (`/chrome`); `computer-use` clicks are blocked
  on the canvas. Per `TESTING.md`, WebGL screenshots are unreliable on this Mac — **verify
  UVs from `geometry.attributes.uv`, not from pixels.**

> **Scope note — spec corrected to match code.** The original spec premise (Three.js `0→1`
> default UVs fixed via `texture.repeat`) was false: every builder already baked world-space
> UVs and none used `texture.repeat`. The real bug was an **inverted `tileScale` convention** —
> `WallBuilder` divided (`/tileScale`) while `FloorBuilder`/`PlatformBuilder`/`StairBuilder`
> multiplied (`·tileScale`), so the same value behaved oppositely on a wall vs a floor.
> Phase 10.8 unifies everything onto the ÷ ("meters per repeat") convention, adds UV offset,
> and resets legacy `tileScale` on load. See `WORLD_EDITOR_ARCHITECTURE.md` §10.8 (v4.0.0).

Dev globals (DEV build only): `window.__scene`, `__world`, `__zones`, `__renderer`, `__camera`.

```js
// Helper — paste once per session. Returns U/V repeat range for the first mesh with editorId.
window.__uvRange = (editorId) => {
  let m; window.__scene.traverse(o => { if (o.isMesh && o.userData?.editorId === editorId && !m) m = o; });
  if (!m) return "no mesh for " + editorId;
  const uv = m.geometry.attributes.uv; let uMin=1e9,uMax=-1e9,vMin=1e9,vMax=-1e9;
  for (let i=0;i<uv.count;i++){const u=uv.getX(i),v=uv.getY(i);uMin=Math.min(uMin,u);uMax=Math.max(uMax,u);vMin=Math.min(vMin,v);vMax=Math.max(vMax,v);}
  return { uSpan:+(uMax-uMin).toFixed(3), vSpan:+(vMax-vMin).toFixed(3) };
};
```

---

## 0. Convention unification — the core fix (gate)

Place a **wall** (~10m long) and a **rect floor** (~10m wide), assign both the **same material**.
Note each one's `editorId` (select it; `window.__world` exposes the active zone's entities).

- [ ] At `tileScale = 1.0` on both: `__uvRange(wallId).uSpan ≈ 10` and `__uvRange(floorId).uSpan ≈ 10`
      (≈ physical size — one repeat per meter on both).
- [ ] Set **both** materials to `tileScale = 2.0`. Re-read:
  - [ ] `wallId` uSpan ≈ **5** (halved — fewer repeats, bigger texture).
  - [ ] `floorId` uSpan ≈ **5** (**also halved** — same direction). *Pre-fix the floor would have
        gone to ≈ 20.* This divergence-vs-agreement is the bug being fixed.
- [ ] Set `tileScale = 0.5` on both → both uSpans ≈ **20** (denser). Wall and floor still agree.

Repeat the same `1.0 → 2.0` comparison for a **platform** (cap) and a **stair** (tread): each
surface's uSpan must **shrink** when tileScale grows, never grow.

---

## 1. Size independence (regression of the already-correct behavior)

- [ ] A **1m** floor and a **10m** floor at `tileScale = 1.0`: uSpan ≈ 1 and ≈ 10 respectively
      (density identical — same texture size per meter; this already held pre-phase and must
      still hold).

---

## 2. UV offset (new)

With a wall selected, open the Material screen → the **OFFSET X / Y** row appears below the
Tile / split X·Y controls.

- [ ] Set **OFFSET X = 0.5** → `__uvRange` uSpan is unchanged but every U value shifted +0.5;
      verify: `min U` increased by ~0.5 vs offset 0. Texture visibly slides half a tile sideways.
- [ ] Set **OFFSET Y = 0.5** → V values shift +0.5; texture slides vertically.
- [ ] **OFFSET X = 1.1** looks identical to **0.1** (wraps, `wrapS = RepeatWrapping`).
- [ ] **Negative** offset (e.g. −0.25) works (shifts the other way).
- [ ] **OFFSET X = 0, Y = 0** → no change vs a freshly-built mesh (helper early-returns).
- [ ] Offset persists through save → reload (`materialOverrides.offsetX/Y` round-trips).
- [ ] Offset applies on a wall **with a door/window opening** (CSG path) — the cut geometry's
      UVs are offset too (offset is baked before CSG).

---

## 3. Migration — `uvVersion`

- [ ] Load a **pre-10.8 scene** (no `metadata.uvVersion`) that used non-`1.0` tileScales.
      After load, console-check a few entities:
      `window.__world.zones.get([...window.__world.zones.keys()][0]).walls.map(w => w.materialOverrides?.tileScale)`
      → every present `tileScale`/`tileScaleX`/`tileScaleY` is now **1.0** (incl. platform
      `sideMaterialOverrides` and stair `riserMaterialOverrides`).
- [ ] **Save**, then inspect the written file → `metadata.uvVersion === 1`.
- [ ] **Reload** that saved file → tileScales are **preserved** (no second reset — already v1).
- [ ] A brand-new scene, saved → `metadata.uvVersion === 1` (stamped by `toJSON`).
- [ ] **Undo/redo** a transform after loading a legacy scene does **not** re-trigger the reset
      (HistoryManager restores via `loadFromJSON`, which migration deliberately does not touch).

---

## 4. Regression — every builder still textures correctly

Build one of each and confirm it renders with no console errors / no Vite overlay:

- [ ] Rect wall, wall **run** (multi-segment corner), wall with **door** + **window** (trim + reveal liner).
- [ ] Rect floor + **polygon** floor.
- [ ] Rect platform + **polygon** platform; platform with a **separate side material**; platform
      with a **CSG hole** (inner faces).
- [ ] Stairs, including a **separate riser material** and a **railing**.
- [ ] Each textured surface tiles seamlessly (no stretched/compressed patches at default scale).

---

## 5. Always
- [ ] `npm run typecheck` → 0 errors.
- [ ] `npm run build` → 0 errors.
- [ ] Console clean; no Vite checker overlay.
- [ ] Commit this test plan.
