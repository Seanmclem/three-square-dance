# Phase 17 — Attached Colliders on Placed Objects (v4.4.0)

Objects were never solid — `AssetDef.collidable` was a dead manifest field. Now:
implicit auto-box from model bounds for collidable assets, explicit
`WorldObject.colliders[]` (box/sphere/capsule, offset/size/rotY, isSensor),
Colliders screen in the PropertiesPanel, wireframes + box face handles
(`ColliderEditor`), and sensors firing `on_player_enter/exit` keyed to the object.

## Automated pass (done 2026-07-06, Chrome extension + frame-stepping)

- [x] `npx tsc --noEmit` + `npm run build` clean
- [x] Placing a collidable asset (desk.obj) registers exactly one auto-box collider
      with correct AABB fit (half-extents 0.91×0.46×0.42, resting on the platform)
- [x] **Blocking:** held-W character clamps at the box face (z=5.614 = face 5.39 +
      capsule radius) and stays pinned; `colliders: []` walks straight through
- [x] **Sensors:** sensor collider doesn't block; `on_player_enter` set state=true
      walking in, `on_player_exit` set state=false walking out (scripts keyed to the
      object id via the extended loadZone normalization)
- [x] Colliders panel: row summary "1 collider", screen shows shape buttons /
      OFFSET / SIZE / ROT / Sensor; typing W=3 updated data + wireframe live
- [x] Wireframe + 6 face handles render on selection (cyan solid / amber sensor)
- [x] Handle drag (module handler chain): +X face 1.82→3.5 snapped to 0.5 grid,
      offset shifted +0.84 so the opposite face stayed pinned; one Cmd+Z restored
- [x] `collider:handle-hover` suspends TransformControls (without it, TC's pickers
      steal every grab on small objects — reproduced live)
- [x] Object removal / zone unload returns the Rapier collider count to baseline

## Manual spot-checks (human)

- [ ] Enter game near existing furniture — character now bumps into props;
      Manage-imported animals block too (they're collidable by default)
- [ ] Colliders screen on an untouched object shows "auto box" + Customize /
      Remove collision; Customize materializes the same numbers the auto box used
- [ ] Drag a face handle with the mouse — handle highlights white on hover, the
      move gizmo does NOT grab while hovering a handle, Alt disables snapping,
      Escape mid-drag cancels cleanly
- [ ] Sphere/capsule shapes: switch shape, edit radius/height numerically,
      confirm blocking feels right in preview
- [ ] Sensor + solid on the same object (2 colliders) both work
- [ ] Save → reload: explicit colliders persist in the scene JSON; implicit
      auto-box objects stay implicit (no colliders field in JSON)

## Known limits / pre-existing quirks

- Auto-box is solid across the model's full bounds — hollow/thin props (arches,
  shelves) need a customized collider set.
- Non-uniform scale + collider rotY ≠ 0 is an approximation (extents scaled in
  the collider's local frame).
- Clicking "through" a scene-spanning trigger volume (e.g. a death floor) selects
  the volume, not the object behind it — pre-existing TriggerVolumeTool click
  priority, unchanged by this feature.
- Hidden-tab automation note: single synthetic mousemoves raycast against stale
  matrices (no rAF). Drive the module via bus events after
  `scene.updateMatrixWorld(true)` (see this phase's verification) or test in a
  foreground tab.

## v4.4.1 addendum — editing UX toggles (verified 2026-07-06)

- [x] "Hide object move gizmo while editing colliders" checkbox suspends
      TransformControls (viewport arrows disappear; restored on screen close)
- [x] Per-collider **Move** button shows a smaller translate gizmo on that
      collider; real mouse drag moved offset.y 0.46→1.688 with the OBJECT
      position untouched; one Cmd+Z reverted; object gizmo auto-suspended
      while the collider gizmo is active
- [x] Per-collider **👁** hides only that collider's wireframe + handles
      (card dims; physics unaffected); hiding the move-focused collider also
      drops its gizmo
- [x] All three reset on screen close / selection change (React cleanup +
      ColliderEditor._resetPanelState)

Manual: with two overlapping colliders, hide one, resize the other via
handles, then swap — no cross-grabbing.
