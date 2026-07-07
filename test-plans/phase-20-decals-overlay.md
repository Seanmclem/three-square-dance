# Phase 20 — Overlay Decals (DecalGeometry stamping) — Test Plan

## Prerequisites
- `npm run typecheck` passes with zero TypeScript errors.
- Dev server running on `http://localhost:7373`.
- A wall and a floor in the active zone (the demo/autosave level works).

> **Scope.** New `decal` entity type: stickers/cracks/paint/signs projected onto static
> geometry via `three/addons` `DecalGeometry`. A decal stores a **free-floating world-space
> anchor + normal** (no target entity id) and re-projects onto whatever wall/floor/platform/
> stair its projector box intersects — so it survives wall-run merges/splits/rebuilds.
> Placement is click-to-stamp with a quad ghost (scroll = size, shift+scroll = rotate).
> Surface-effect (in-shader) decals are Phase 21. See `WORLD_EDITOR_ARCHITECTURE.md` v4.7.0
> and `aplans/decals-plan.md`.
>
> All checks below were run 2026-07-07 via Chrome MCP (real toolbar/tile/canvas clicks +
> `window.__*` reads) and passed with zero console errors.

---

## 1. Panel + tool arming (gate)

1. Click the **Decal** toolbar button (bottom of the tool strip, shortcut label K).
- [ ] The **DECALS** left panel opens: Overlay/Surface toggle (Surface disabled, "(soon)"),
      category pills (All/Damage/Paint/Signs/Weather), 7 overlay tiles with checkerboard
      backdrops, hint text.
- [ ] PropertiesPanel shows the decal tool desc ("Pick a decal, hover a surface, scroll =
      size…").
2. Click a tile (e.g. Graffiti Arrow).
- [ ] Tile highlights blue; hovering a wall now shows a translucent ghost of the texture,
      oriented flat against the surface. Moving off any surface hides the ghost.

## 2. Wheel gating — size / rotate / zoom

With the ghost over a surface (real wheel events; the extension's `scroll` action does NOT
reach the canvas — dispatch `WheelEvent` on `__renderer.domElement` when automating):

```js
const canvas = window.__renderer.domElement;
const r0 = window.__editorCamera.targetSpherical.radius;
canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, bubbles: true, cancelable: true }));
// ghost scale grew (exp(0.4) ≈ 1.49×), radius unchanged
canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -300, shiftKey: true, bubbles: true, cancelable: true }));
// ghost quaternion changed (roll), radius still unchanged
```

- [ ] Scroll = ghost grows/shrinks (clamped 0.1–8 m); camera radius pinned (zoom-lock).
- [ ] Shift+scroll = ghost rolls around the surface normal (`[`/`]` = ±15° too).
- [ ] Move the cursor over empty sky → ghost hides, scroll zooms the camera again.

## 3. Stamp (gate)

Hover a wall (a real `mousemove` must precede the click — a bare `left_click` without a
preceding hover has no surface hit and no-ops), then click.

```js
window.__world.toJSON().zones[0].decals   // one DecalDef: anchor on the wall face,
                                          // unit normal, roll°, size, textureId
let m=[]; __scene.traverse(o => { if (o.userData?.editorType === "decal") m.push(o) });
// one mesh; world-space geometry conforming to the wall; userData._decalTargets lists
// the wall id(s) it projected onto; renderOrder 10; _ownsMaterial true
```

- [ ] Def + exactly one decal mesh; texture renders on the wall with no z-fighting.
- [ ] Tool stays armed — another click stamps another decal (delete the extra after).

## 4. Undo / redo

- [ ] Cmd+Z after a stamp removes the def AND the mesh.
- [ ] Cmd+Shift+Z restores both (redo goes through `history:restore` → full `loadZone`,
      which proves the cold-load decal build path).

## 5. Rebuild survival (gate)

Move a node of the target wall (drag in Select mode, or `updateNode` in a transaction):

```js
// after ~1s: still exactly one decal mesh, NEW uuid, verts on the MOVED face
```

- [ ] Decal mesh regenerated (new uuid), exactly one, no orphans in the zone group.
- [ ] The projection sits on the wall's new position (vertex X/Z match the moved face).
- [ ] Undo the node move → decal re-projects back. (The `_decalTargets` record also
      catches the "wall moved away" case — the stale mesh is removed, def kept.)

## 6. Selection + panel editing

1. Select tool → click the decal (it is coplanar with the wall — priority must win).
- [ ] PropertiesPanel shows the **DecalView**: label, "DECAL" type, id, texture-swap grid,
      POSITION X/Y/Z, WIDTH/HEIGHT, ROTATION, OPACITY, Delete Decal.
2. Edit WIDTH to 2 (debounced 300 ms).
- [ ] Def updates, mesh rebuilds at the new size (e.g. 2 m at 30° roll ⇒ ~2.48 m span).
3. Translate gizmo (T) works; R does nothing (decals are translate-only by design).
4. Click **Delete Decal**.
- [ ] Def + mesh removed, panel back to "Nothing selected". Cmd+Z restores.

## 7. Persistence

- [ ] `toJSON()` carries `zones[].decals`; save → load round-trips the decal (mesh
      re-renders). Old saves without `decals` load unchanged (optional array, no migration).

## 8. Regression checks

- [ ] `npm run typecheck` → 0 errors; console clean throughout.
- [ ] Trigger-volume height-scroll and camera zoom still work (zoom-lock only engages
      while the decal ghost is on a surface).
- [ ] Draw calls: +1 per placed decal, nothing per-frame (decals are event-driven).

## Known caveats (by design / documented)

- **Thin-wall back-face bleed:** the default projector depth (`max(w,h)·0.5`) can exceed a
  0.2 m wall's thickness, so a large decal may faintly mirror onto the wall's back face —
  classic DecalGeometry behavior. Fix per decal by setting `depth` (data field) smaller.
- Decal meshes participate in floor-level dimming like level-0 geometry (`floorLevel: 0`).
- Copy/paste and group bulk operations don't cover decals yet (deferred to Phase 21 polish).
