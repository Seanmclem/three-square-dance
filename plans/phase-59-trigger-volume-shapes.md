# Phase 59 — Trigger volume shapes (sphere, cylinder, capsule)

> User request (2026-08-14): "what about different trigger volume shapes. like
> we have with colliders. like cylinder, sphere or capsule. instead of just
> box?" Decision: all three.

## Why

Standalone trigger volumes were box-only — `TriggerVolume.size` fed a
`cuboid` sensor and a `BoxGeometry` wireframe. Attached colliders on placed
objects already speak `box | sphere | capsule | cylinder` (with `isSensor`),
so round detection regions existed *only* by hanging a sensor collider off an
object. A sight-radius around a point, a cylindrical pressure zone, or a
capsule corridor shouldn't require a host object.

## Design

- **`TriggerVolume.shape?: "box" | "sphere" | "cylinder" | "capsule"`** —
  absent = `"box"`, so every existing scene is untouched. Size encoding
  matches `AttachedCollider`: sphere `x` = radius (y/z unused);
  cylinder/capsule `x` = radius, `y` = full height. `position` stays the XZ
  center + Y BOTTOM for every shape (a sphere's bottom is center − r).
- **`src/world/volumeShape.ts`** (new): `volumeExtents(vol)` (shape-aware full
  extents) + `volumeGeometry(vol, inset)` (Box/Sphere/Cylinder/Capsule
  geometry, `inset` for the interior-fill z-fight guard). Shared by
  ZoneManager, TriggerVolumeTool, and anything needing true bounds.
- **Sensor** (`ColliderBuilder.registerVolumeSensor`): per-shape
  `cuboid`/`ball`/`cylinder`/`capsule` desc; capsule's cylindrical half-height
  clamps at `h/2 − r` (min 0.01) so `h < 2r` degrades to a sphere-ish capsule
  rather than NaN. Same center math on the static and mover-host paths, so
  Phase-53 attached volumes ride movers in any shape. Runtime parity is free
  (shared builder).
- **Editor visuals** (ZoneManager): wireframe `EdgesGeometry(volumeGeometry)`,
  interior fill inset 0.04, gradient fill (`visual`) uses the shape geometry
  with `uSizeY` = shape height; the front arrow offsets from the shape's true
  z extent.
- **Picking** (TriggerVolumeTool `_findVolumeAt`): the AABB test now uses
  `volumeExtents` — round shapes pick by their bounds (acceptable slop).
- **Resize handles** (TriggerVolumeResizer): all shapes, ColliderEditor
  semantics adapted to the Y-bottom convention — box keeps the six
  opposite-face-pinned handles; round shapes' side handles drag the RADIUS
  with the XZ center pinned; +Y drags height (on a sphere, the radius — its
  height IS 2r) with the bottom pinned; −Y drags the bottom with the top
  pinned, and is hidden on spheres. Handle set rebuilds on shape change
  (`triggervolume:updated` → `_sync`). *(First shipped box-only citing a
  stale COLLIDERS_GUIDE note claiming round colliders were numeric-only —
  user correction; the guide + the stale ColliderEditor header comment are
  fixed in this phase too.)*
- **Panel** (TriggerVolumeView): SHAPE row (BOX/SPHERE/CYL/CAPS); SIZE shows
  W/H/D (box), RADIUS (sphere), or RADIUS+HEIGHT (cylinder/capsule); radius
  floor 0.25 (box extents keep 0.5). Switching shape converts size — box→round
  inscribes the radius from min(W,D)/2; round→box circumscribes (2r). A hint
  appears when a capsule's height < 2r.

## Out of scope

- Placement-time shape choice — the tool still drags out a box footprint;
  shape is switched in the panel afterward.
- Non-yaw rotation (volumes stay yaw-only, all shapes).

## Files touched

`src/types.ts`, `src/world/volumeShape.ts` (new), `src/world/ZoneManager.ts`,
`src/physics/ColliderBuilder.ts`, `src/editor/TriggerVolumeTool.ts`,
`src/editor/TriggerVolumeResizer.ts`, `src/ui/PropertiesPanel.tsx`.

## Acceptance

See `test-plans/phase-59-trigger-volume-shapes.md` — includes a live sensor
proof: a player standing inside the old box AABB's corner but outside the
sphere (2.68 m from center, r = 2) does NOT fire `on_player_enter`; entering
the sphere does.
