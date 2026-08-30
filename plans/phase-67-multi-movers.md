# Phase 67 — Multiple movers per entity (spin + bob)

> User ask (2026-08-30): "what if an object could have 2 movers. like one to
> spin and one to bob up and down." Assessment agreed: the runtime already
> composes `position = origin + slideOffset` and `rotation = originRot ×
> spinRot` per frame — with one mover one term is always zero. This phase makes
> the terms sums/products over N movers.

## Data (types.ts)

- `movers?: MoverDef[]` joins `mover?: MoverDef` on the three carriers
  (WorldObject, PlatformDef, ShapeDef). `mover` becomes the legacy single
  form: read forever, written never again by the editor (first edit in the
  Motion section migrates to `movers` — the per-action-guard → block pattern).
- `MoverDef.id?: string` (`mvr_<uuid8>`) — assigned by the editor so scripts
  can target one mover; legacy defs without ids get one on first edit.
- `ScriptAction.moverId?: string`; bus `mover:set` gains `moverId?`.
- Helper `entityMovers(e)` (types-adjacent, used everywhere):
  `e.movers ?? (e.mover ? [e.mover] : [])`; `hasEnabledMover(e)` derives.

## Runtime (MoverSystem)

- `register(entityId, defs: MoverDef[], …)`; entry holds `subs:
  [{ def, running, t, progress, dir, angle }]` (per-mover clocks — each keeps
  its own duration/dwell/phase/mode; `running` starts from each def's
  autoStart; AI-host entries register with `subs: []`, unchanged semantics).
- `_applyPose`: sum every running-or-parked slide's local offset (axis ×
  eased distance), rotate the SUM by originQuat once; multiply every spin's
  quaternion in list order. Everything downstream (kinematic body pose, mesh
  orbiting, carry delta, attach-to riders) is untouched — it consumes the one
  composed pose exactly as today.
- `mover:set {targetId, op, moverId?}`: no id = every sub (today's
  behaviour); id = that sub only. The "once-slide toggle reverses" rule is
  per sub. `anyRunning`/reset per sub.

## Builders / ZoneManager / pool

Every `x.mover?.enabled` gate goes through the helper: ShapeBuilder /
PlatformBuilder (create the kinematic moverBody), ZoneManager's object path
(incl. the AI-host branch), `_syncPlatformMover` / `_syncShapeMover` (pass
the array), rebuild-trigger check (`changes.movers` too), attach-to host
filters in PropertiesPanel, InstancedObjectPool's pooling exclusion.

## Editor

- `MoverSection` → a MOTION list: each mover is a row (auto-label "Spin Y" /
  "Slide X") with the existing editor fields (kind/axis, distance/duration/
  dwell/mode/phase or speed, auto-start) and ✕; "+ motion" appends
  (spin Y 45°/s default for the second one). Enabled checkbox per mover.
  Commit always writes `movers` (ids ensured) and clears legacy `mover`.
- Script actions start/stop/toggle_mover gain a "Which mover" select
  (all · each of the target's movers by label) writing `moverId`; shown when
  the resolved target has 2+ movers.

## Verification

- `npx tsc --noEmit`.
- Live: give a shape a Spin Y + Slide Y (bob); preview: it spins while
  bobbing; carry still works standing on it; stop_mover with "Which mover:
  Slide" freezes the bob but keeps the spin; preview exit resets pose.
- A legacy single-mover platform (untouched data) still moves; editing its
  Motion section migrates the JSON to `movers`.
- Attach-to volume list still offers mover hosts.

## Files

`src/types.ts`, `src/world/MoverSystem.ts`, `src/world/ZoneManager.ts`,
`src/builders/{Shape,Platform}Builder.ts`, `src/world/InstancedObjectPool.ts`,
`src/ui/PropertiesPanel.tsx`, `src/ui/ScriptPanel.tsx`,
`src/scripting/ScriptEngine.ts`, arch doc, test plan.
