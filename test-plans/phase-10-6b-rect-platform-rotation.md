# Phase 10.6b — Rect Platform Rotation as a Mesh Transform — Test Plan

## Prerequisites
- `npm run build` / `npm run typecheck` pass with zero TypeScript errors.
- Dev server running: `npm run dev -- --port 7373` → app at `http://localhost:7373`.

> **Scope note.** This phase was narrowed from the original "local-space storage for
> platforms + polygon floors" spec after verifying against the code. Polygon
> floors/platforms are **node-backed** (`points[]` is a cache regenerated from world-space
> `zone.nodes` each build), so they never snap back and need no local-space conversion or
> `FloorDef.position`. The only genuine defect was the **rect platform**: its Y rotation was
> baked into geometry instead of `mesh.rotation`, and the collider ignored rotation. See
> `WORLD_EDITOR_ARCHITECTURE.md` Phase 10.6b for the full investigation.
>
> Acceptance is verified **programmatically via dev globals** (`window.__world`,
> `window.__zones`) — gizmo click-and-drag on the 3D canvas can't be reliably simulated, so
> we drive the real `updatePlatform` write path instead. Manual gizmo drag is an optional
> visual spot-check, not the gate.

---

## 0. Rotate-gizmo snap-back past 90°/180° (the bug that was actually reported) — MANUAL

This is the path that was broken: `GizmoManager._commitRotate` read `pivot.rotation.y`
(Euler), which gimbal-flips past ±90°, so the angle committed on release didn't match the
drag. **This must be checked by hand** — gizmo click-and-drag can't be scripted. Root cause
and fix are proven numerically in §1a below.

- [ ] Select a **rect platform**, press **R**, rotate ~**45°**, release → stays at ~45° (no snap).
- [ ] Same platform, rotate to ~**135°**, release → stays at ~135° (previously snapped to ~45°).
- [ ] Rotate to ~**180°**, release → stays at ~180° (previously snapped back to ~0°).
- [ ] Rotate a **polygon platform / room** past 90°/180°, release → orientation holds **and the
      shape is not distorted** (previously the AABB `size` recompute warped it).
- [ ] Repeated rotations accumulate correctly (rotate 90°, release, rotate another 90° → 180°).

### 1a. Gimbal root-cause / fix proof (scriptable)

```js
const o = window.__camera.clone();              // Object3D; quaternion<->rotation linked
const axisY = { x:0, y:1, z:0 };
[91,135,180,200].forEach(deg => {
  o.quaternion.setFromAxisAngle(axisY, deg*Math.PI/180);
  const q = o.quaternion;
  const eulerY = o.rotation.y*180/Math.PI;                                   // OLD (buggy) read
  const yaw = Math.atan2(2*(q.w*q.y+q.x*q.z), 1-2*(q.y*q.y+q.x*q.x))*180/Math.PI; // _pivotYaw()
  console.log(deg, 'euler=', eulerY.toFixed(0), 'pivotYaw=', yaw.toFixed(0));
});
// Expect: 135 -> euler=45 (wrong), pivotYaw=135 (right); 180 -> euler=0, pivotYaw=180
```

- [ ] `pivotYaw` matches the applied angle at 91/135/180/200°; `euler` does not.

---

## 1. Rect platform rotation is a mesh transform, not baked geometry (gate)

Run in the browser console (place a rect platform first via the Platform tool, or
`addPlatform` directly):

```js
const z = window.__world.activeZoneId;
const p = window.__world.zones.get(z).platforms[0];

// gizmo rotate write path
window.__world.updatePlatform(z, p.id, { rotation: { x: 0, y: 45, z: 0 } });
await new Promise(r => setTimeout(r, 50)); // let the async rebuild settle

let mesh = window.__zones._loadedZones.get(z).platformEntries.get(p.id).meshes[0];
console.log('after rotate:', mesh.rotation.y);   // ≈ 0.785 (π/4), NOT 0

// force a rebuild that is NOT a rotation change
window.__world.updatePlatform(z, p.id, { material: 'brick' });
await new Promise(r => setTimeout(r, 50));

mesh = window.__zones._loadedZones.get(z).platformEntries.get(p.id).meshes[0];
console.log('after material change:', mesh.rotation.y); // still ≈ 0.785 — no snap-back
```

- [ ] After rotate: `meshes[0].rotation.y ≈ 0.785` (rotation lives on the mesh transform).
- [ ] After the material-change rebuild: still `≈ 0.785` — does **not** snap back to 0.
- [ ] The cap geometry is **not** pre-rotated — local vertices are axis-aligned (spot-check
      `mesh.geometry.attributes.position`: corners at ±width/2, ±depth/2, not rotated values).

## 2. Move survives an unrelated rebuild

```js
const before = { ...p.position };
window.__world.updatePlatform(z, p.id, { position: { x: before.x + 3, y: before.y, z: before.z } });
window.__world.updatePlatform(z, p.id, { material: 'metal' });
await new Promise(r => setTimeout(r, 50));
const m = window.__zones._loadedZones.get(z).platformEntries.get(p.id).meshes[0];
console.log(m.position.x); // ≈ before.x + 3 — stays moved
```

- [ ] Position is preserved across the subsequent material-change rebuild.

## 3. Collider mirrors the rotation (the real physics bug)

```js
const entry = window.__zones._loadedZones.get(z).platformEntries.get(p.id);
const q = entry.collider.rotation();
console.log(q); // for 45°: y ≈ sin(π/8) ≈ 0.3827, w ≈ cos(π/8) ≈ 0.9239
```

- [ ] With `rotation.y = 45`, the collider quaternion is `{x:0, y:≈0.3827, z:0, w:≈0.9239}`
      (not identity). A rotated slab now has a rotated collider.
- [ ] With `rotation.y = 0`, the collider quaternion is identity `{x:0,y:0,z:0,w:1}`.

## 4. CSG-cut rect platform stays mesh/collider-consistent

Setup: a rect platform intersected by a stair (so it gets a CSG hole), with `rotation.y` set.

- [ ] The CSG platform's geometry is baked unrotated (pre-existing limitation — CSG platforms
      don't visually rotate), and its collider is **also** unrotated. Mesh and collider agree;
      no new mismatch was introduced (`registerPlatform(platform, false)` path).

## 5. Undo / redo

- [ ] Rotate a rect platform (gizmo), then **Undo** → rotation reverts; mesh + collider both
      return to the prior angle. **Redo** → re-applies. No snap-back, no orphaned collider.

## 6. Regression — node-backed polygon primitives unchanged

- [ ] Create a polygon platform and a polygon floor (Polygon tools). Move them (gizmo) and
      drag a corner node (NodeDragger) — geometry tracks the nodes, as before. No rotation
      gizmo on floors. Behavior identical to pre-10.6b (this phase did not touch them).

## 7. Always

- [ ] `npm run build` and `npm run typecheck` → 0 errors.
- [ ] Console clean; no Vite checker overlay.
