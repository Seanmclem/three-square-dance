# Phase 31 — Moving Geometry / Animated World Objects

Origin: user request — "Moving geometry / animated world objects — basic
scripted movement for placed objects and platforms; rising/falling platforms,
spinning walls, sliding doors, oscillating hazards; Rapier kinematic bodies
updated each frame to match mesh position."

Today `move_object` is a one-shot teleport (`ScriptEngine`), object animation
is GLTF-clip playback only (`ObjectPlacer`), and every world collider is a
static fixed body (`ColliderBuilder` → `physicsWorld.createStaticCollider`).
This phase adds authored, scripted movement with Rapier kinematic bodies
updated each frame to match the mesh, plus player translation-carry so moving
platforms are rideable. Greenfield — no prior planned-feature entry in
WORLD_EDITOR_ARCHITECTURE.md.

## 1. Scope & decisions

**In scope**
- Optional `mover?: MoverDef` on **WorldObject, PlatformDef, ShapeDef** (all
  have `position` + `rotation`).
- Two motion kinds: **slide** (linear oscillation/travel along an axis) and
  **spin** (continuous rotation about an axis). These cover all four requested
  archetypes: rising platform = slide y, sliding door = triggered slide,
  oscillating hazard = looping slide, spinning wall = spin on a box
  shape/platform.
- Kinematic physics: mover-enabled entities get colliders parented to one
  `kinematicPositionBased` body; `setNextKinematicTranslation/Rotation` each
  frame **before** `physicsWorld.step`.
- **Player translation carry**: player standing on a moving kinematic body
  inherits its per-frame translation delta (rides risers and sliders).
- Script actions **`start_mover` / `stop_mover` / `toggle_mover`** (triggered
  doors).
- MOTION section in PropertiesPanel for the three entity types.
- Movers animate **only in preview/game**; editor shows the authored rest
  pose; poses + physics reset on `preview:stop`.
- Works identically in the editor app and the standalone runtime shell
  (`runtime.html`).

**Decided (with user, do not relitigate)**
- Translation carry only — a spinning platform does **not** rotate/orbit the
  player (deferred).
- Wall entities (node-backed, merged runs, CSG openings) excluded — spinning
  walls/door panels are authored as box shapes or platforms.
- Script start/stop/toggle IS in this phase.

**Out of scope**
- Rotation carry; movers on walls/floors/stairs/trigger volumes; waypoint
  paths/splines; easing curve editor; editor-time animation; ghost-preview of
  travel endpoints (possible follow-up).

## 2. Semantics

- The entity's authored `position`/`rotation` is the **rest pose** (slide
  start / spin zero). WorldState is never touched at runtime — movers mutate
  mesh + kinematic body only (same "runtime-move, no rebuild, WorldState
  untouched" design as the shape branch of `object:updated` in ZoneManager).
- **slide**: travels `distance` meters along `axis` in the entity's **local**
  frame (rotated by entity rotation — a rotated door slides along its own
  width); one leg takes `duration` seconds with sinusoidal ease-in-out;
  optional `dwell` pause at each end.
  - `mode: "loop"` — ping-pongs forever (hazards, elevators).
  - `mode: "once"` — travels to the far end and stops; `toggle_mover` sends it
    back (doors: far end = open).
- **spin**: rotates about local `axis` at `speed` deg/sec, continuous, linear.
- `autoStart` (default true): false = mover idles at rest until
  `start_mover`/`toggle_mover`.
- `phase` (0..1, slide loop only): initial offset into the cycle, for
  staggering multiple hazards.
- Selecting/gizmo-editing an entity is unaffected: movers don't run in editor
  mode.

## 3. Schema (`src/types.ts`)

```ts
export type MoverKind = "slide" | "spin";

export interface MoverDef {
  enabled: boolean;
  kind: MoverKind;
  axis: "x" | "y" | "z";
  // slide
  distance?: number;      // meters, default 2
  duration?: number;      // seconds per leg, default 2
  dwell?: number;         // seconds paused at each end, default 0
  mode?: "loop" | "once"; // default "loop"
  phase?: number;         // 0..1 cycle offset, default 0 (loop only)
  // spin
  speed?: number;         // deg/sec, sign = direction, default 45
  autoStart?: boolean;    // default true
}
// + mover?: MoverDef on WorldObject, PlatformDef, ShapeDef
```

Purely additive optional field → no migration, no world-format bump (phase-29
precedent). `toJSON` spreads zone arrays, so it auto-serializes. Mutators
(`updateObject`/`updatePlatform`/`updateShape`) are shallow `Object.assign` —
no changes needed, but the panel must always write the **whole `mover`
object** (same nested-object shallow-merge hazard as `ShapeDef.mesh`).

Also: `mover:set { targetId, op: "start" | "stop" | "toggle" }` bus event, and
`'start_mover' | 'stop_mover' | 'toggle_mover'` added to `ActionType`.

## 4. Physics — kinematic body path

- `PhysicsWorld.createKinematicBody()` — `RigidBodyDesc.kinematicPositionBased()`.
- `PhysicsWorld.createColliderOn(body, desc)` — attach a collider to a given
  body.
- `ColliderBuilder` methods bake world-space translations into each
  `ColliderDesc` and call `createStaticCollider` (one fixed body per
  collider). For mover entities: **one kinematic body per entity** at the
  entity origin; that entity's collider(s) attach with **body-relative
  offsets** (multi-collider objects all parent to the same body so one
  `setNextKinematicTranslation` moves them together). Threaded as an optional
  body parameter / parallel path — the static path used by everything else is
  untouched.
- Removal: kinematic body removed when its colliders go (mirror the existing
  empty-fixed-body cleanup in `removeCollider`).
- Sensors on movers are out of scope (no trigger volumes move).

## 5. MoverSystem — new `src/world/MoverSystem.ts`

ZoneManager registers/unregisters movers (it owns both mesh maps and collider
maps):

- `register(zoneId, entityId, { meshes, body, def, restPos, restQuat })` from
  the object/platform/shape build paths when `def.mover?.enabled`;
  `unregister` from remove paths and `unloadZone`. Registration lives inside
  the build functions so the destroy+recreate rebuild flow
  (`_rebuildPlatform`/`_rebuildShape`, pending-rebuild coalescing)
  re-registers automatically.
- `update(dt)`: no-op unless active (preview/game). Per mover: cycle time →
  pose offset (slide: eased scalar × local axis vector rotated by restQuat;
  spin: quaternion from axis-angle) → set `mesh.position/quaternion` **and**
  `body.setNextKinematicTranslation/Rotation`. **Zero per-frame allocations**
  — module-level scratch objects (`_tmp*` pattern from CharacterController).
- Lifecycle: `preview:start` → activate, t=0; `preview:stop` → deactivate +
  reset every mesh and body to rest pose (the `_restoreDespawned` pattern).
- Script control: subscribes `mover:set`; per-entity `running` seeded from
  `autoStart`; `toggle` on a `mode:"once"` slide reverses direction.
- Carry support: `Map<bodyHandle, frameDelta>` (translation applied this
  frame) read by CharacterController.

**Registration order:** `moverSystem.update` runs **before**
`physicsWorld.step(dt)` so the step consumes fresh kinematic targets —
registered ahead of the step callback in both `App.tsx` and
`RuntimeApp.tsx` (runtime parity is a core requirement). `window.__movers`
DEV global exposed alongside the others.

## 6. Player carry (`src/preview/CharacterController.ts`)

Translation-only, each frame before computing the player's own movement:
1. Find the collider the player stands on (KCC computed-collision output or a
   single short downward Rapier query — never per-frame scene raycasts), only
   when grounded.
2. If its parent body is a registered mover, add the mover's `frameDelta` to
   the desired movement passed to `computeColliderMovement` (KCC still
   resolves walls/obstacles while carried).
3. No rotation carry — drifting off a spinning platform is accepted v1
   behavior.

## 7. Scripting

- Three `_dispatch` cases (the `load_scene` precedent): loop
  `_resolveTargets(action.targetId)` (group fan-out for free) → emit
  `mover:set { targetId, op }`.
- ScriptPanel: the three actions need only a Target field — reuse
  `ActionTargetPicker` with objects + the already-threaded platform/shape
  optgroups (the `despawn_object` widening precedent, v4.3.1).

## 8. Editor UI (`src/ui/PropertiesPanel.tsx`)

MOTION section in `ObjectGeoView`, `PlatformGeoView`, and the shape view,
copying the LANDING & FLIGHTS pattern: borderTop divider → "Motion" enable
checkbox (seeds a default `MoverDef`) → nested indented block with:
- KIND segmented buttons (slide / spin); AXIS segmented buttons (X / Y / Z).
- slide: distance / duration / dwell inputs (`useFieldDebounce` idiom), MODE
  segmented (loop / once), phase input (loop only).
- spin: speed input.
- AUTO-START checkbox.
Every commit writes the complete `mover` object via
`onObjectUpdate({ mover: {...} })` → existing `handleObjectUpdate`
transaction path (undo/redo + autosave for free).

## 9. Files

| File | Change |
|---|---|
| `src/types.ts` | `MoverDef`, `mover?` on WorldObject/PlatformDef/ShapeDef, `ActionType` additions, `mover:set` bus event |
| `src/physics/PhysicsWorld.ts` | `createKinematicBody`, `createColliderOn`, kinematic-body-aware removal |
| `src/physics/ColliderBuilder.ts` | optional kinematic-body parent path with body-relative collider offsets |
| `src/world/MoverSystem.ts` | NEW — registry, per-frame kinematic update, preview lifecycle + reset, `mover:set`, carry deltas |
| `src/world/ZoneManager.ts` | build/remove/rebuild paths register/unregister movers; kinematic collider path for mover entities |
| `src/preview/CharacterController.ts` | ground-body detection + translation carry |
| `src/scripting/ScriptEngine.ts` | 3 dispatch cases → `mover:set` |
| `src/ui/ScriptPanel.tsx` | action editors for the 3 new actions (target picker only) |
| `src/ui/PropertiesPanel.tsx` | MOTION section × 3 views |
| `src/App.tsx`, `src/runtime/RuntimeApp.tsx` | instantiate MoverSystem; register `update` before `physicsWorld.step`; `window.__movers` |
| `WORLD_EDITOR_ARCHITECTURE.md` | per PLAN_UPDATE_GUIDE.md: new phase section + every touched file-level section; version bump + changelog + date |
| `test-plans/phase-31-moving-geometry.md` | acceptance record |

## 10. Verification

1. `npm run typecheck` → 0 errors; checker overlay clean.
2. Console/data pass (TESTING.md golden path — running tab on :7373,
   localStorage snapshot protocol, `__world.update*` mutator-driving
   exception):
   - Slide platform: enter preview (real Play button), sample
     `mesh.position.y` over time → oscillates through
     `rest.y → rest.y + distance`; kinematic `body.translation()` tracks the
     mesh each sample.
   - Spin shape: quaternion advances; collider rotation matches.
   - Hidden-tab deterministic alternative: manual stepping must call
     `__movers.update(dt)` + `physicsWorld.step(dt)` + `controller.update(dt)`
     (RAF-registered systems don't run under manual stepping).
   - `preview:stop` → mesh and body back at rest pose exactly.
   - `mode:"once"` + `autoStart:false` door:
     `__test.runAction({ type: "toggle_mover", targetId })` opens; toggle
     again closes. Group target fans out.
   - Carry: teleport player onto a sliding platform, sample player position →
     tracks the platform; rising platform carries without jitter.
   - Editor edit → rebuild → mover re-registers (move platform, re-enter
     preview, still animates).
   - `__world.toJSON()` round-trips `mover`; runtime shell animates the same
     world identically; collider/body-leak probe
     (`physicsWorld.world.bodies.len()`) stable across scene revisits.
3. Real UI pass at least once: select a platform, enable Motion, set fields
   via real input events → `mover` lands in `toJSON`.
4. Perf: FPS counter worst-ms steady with ~5 concurrent movers; no allocation
   churn in `MoverSystem.update`.
5. Acceptance record in `test-plans/phase-31-moving-geometry.md`.
