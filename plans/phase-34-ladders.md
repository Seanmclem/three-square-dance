# Phase 34 — Ladders (climbable entity + climb movement mode)

> **Status: IMPLEMENTED** — shipped 2026-07-11 (v4.28.0). All 11 automated
> scenarios + the real-click editor pass verified in-browser; acceptance record
> in `test-plans/phase-34-ladders.md`. Notable deviations from plan:
> - Top dismount is a **teleport to the fixed stand marker** (camera Y smoothing
>   masks the step), not a 0.15s lerp — simpler, and indistinguishable in practice.
> - `updateLadder` mid-climb force-exits but an instant remount of the rebuilt
>   ladder is allowed (cooldown applies only to jump-release) — continuing the
>   climb on the edited ladder is the desirable behavior.
> - The climb anim phase **self-heals** (`_updateAnim` retries the `climb` intent)
>   because a mount can beat the async avatar-model load.
> - LadderTool is part of the Stair toolbar button's variant popover (▤/☰), not a
>   standalone button.

Origin: user request — build ladders, informed by a cross-engine survey of
ladder mechanics (trigger-volume mounting, a locked climbing state, fixed
dismount markers, and the top-remount problem). The `Climb` animation clip
already exists in `character.gltf` (authored 2026-07-10, see
`.claude/skills/gltf-clip-authoring/`); this phase gives it a gameplay home.

Today the player is a Rapier KCC with exactly one movement regime
(`CharacterController.update`: gravity + KCC slide, 45° max slope) — a ladder
is unclimbable geometry. This phase adds a first-class **ladder entity**
(geometry + auto-managed climb sensor) and a **climb movement mode** in the
controller: enter via trigger overlap + intent check, position clamped to the
ladder line, W/S drives vertical motion synced to the Climb clip, exits via
top/bottom bounds, jump-release, or any control-stealing event.

## 1. Scope & decisions

**In scope**
- `LadderDef` on zones (like stairs/shapes): foot position, yaw, height,
  width, rung spacing, material. Built geometry (2 rails + rungs) via a new
  `LadderBuilder`, solid thin collider, plus an **auto-built climb sensor**
  that extends past the top lip (top-remount zone). No user-authored trigger
  volume needed — the sensor is internal to the entity.
- Climb movement mode in `CharacterController`/`CharacterBody`: no gravity,
  X/Z locked to the ladder centerline, Y clamped to [foot, top], W/S climbs,
  jump releases (with a short remount cooldown), Climb clip playback rate
  proportional to vertical speed (paused when holding still).
- **Bottom/mid mount**: automatic — inside sensor + moving toward the ladder
  plane (dot ≥ ~0.5), matching the survey's "walking face-first into a ladder
  is unambiguous."
- **Top mount (climbing back down)**: both survey patterns —
  (a) auto: top sensor zone extends ~0.9m onto the platform; standing in it
  and moving toward the ladder snaps position+facing and mounts;
  (b) interact prompt fallback ("Climb down") via the existing
  `character:interact-range` plumbing, so there is never a blind backward
  walk off the edge.
- **Top dismount**: climbing past the top bound lerps the player to a fixed
  stand marker (derived from the def: top + inward offset), never
  physics-derived.
- Editor: `ladder` tool (click to place on a floor/platform, yaw+height edited
  in the panel), LADDER section in PropertiesPanel, full persistence
  (save/load/autosave/undo), runtime-shell parity via the shared ZoneManager
  build path.
- `LocomotionState` gains `"climb"` (+ panel override slot), resolved through
  the existing `_clipFor` case-insensitive matching → finds `Climb`.

**Proposed defaults (flag if you disagree — otherwise treated as decided)**
- No interact prompt at the **bottom** (auto-mount only); prompt exists only
  at the top zone.
- W = up, S = down, always (not camera-relative). A/D do nothing while
  climbing (no lateral shimmy).
- Airborne grabs allowed (jump onto a ladder mid-flight grabs it if moving
  toward it), guarded by a 0.4s cooldown after a jump-release so you can't
  instantly re-grab.
- Ladder collider is solid (you can bonk into it / stand on its top edge);
  the climb sensor is a separate sensor collider.

**Out of scope**
- Ladders on movers; NPC/AI climbing; combat interactions; lateral shimmy /
  multi-player passing; mount/dismount transition *animations* (we lerp pose
  over ~0.15s instead — a dedicated grab clip could be authored later with
  the gltf-clip-authoring skill); slanted/curved ladders (vertical only).

## 2. Semantics — the climb state machine

```
normal ──(sensor overlap + intent dot ≥ 0.5, cooldown clear)──► mounting
mounting ──(0.15s lerp: snap X/Z to centerline, yaw to face ladder)──► climbing
climbing ──(W/S: y += climbSpeed·dt, clamped)
   ├─(y ≥ topBound while pushing up)──► topDismount (lerp to stand marker) ──► normal
   ├─(y ≤ footBound while pushing down AND grounded)──► normal
   ├─(jump pressed)──► normal (velY=0, falls; 0.4s remount cooldown)
   └─(force-exit: teleport, death/respawn, preview stop, zone transition,
      ladder entity deleted/rebuilt)──► normal   ← soft-lock guard, ALWAYS wins
```

- **Soft-lock discipline** (survey pitfall #1): every path that steals control
  registers its exit in one place — a single `_exitClimb()` that restores
  gravity/mode unconditionally; the `character:teleport` handler, `dispose()`,
  `preview:stop`, and ladder-rebuild events all call it. No transition may
  await an animation callback to hand control back.
- **While climbing, the KCC is bypassed**: `CharacterBody` gains
  `setClimbTranslation(pos)` that writes `setNextKinematicTranslation`
  directly (the ladder line is kept clear of geometry by construction, and
  the KCC's snap-to-ground/slope logic would fight the wall). Mover carry and
  push are skipped in climb mode.
- Anim: `_updateAnim` gets a `climb` phase — plays intent `"climb"` looping,
  `action.timeScale = |vy| / CLIMB_ANIM_REF_SPEED` (0 when idle on the
  ladder, so the character visibly hangs). On exit, normal ground/air phases
  resume.

## 3. Data model (`src/types.ts`)

```ts
export interface LadderDef {
  id:        string;      // ladder_<uuid8>
  label?:    string;
  position:  Vec3;        // FOOT center, floor level (like stair start)
  rotationY: number;      // degrees; climb face normal = local +Z rotated by yaw
  height:    number;      // meters, foot → top rung
  width:     number;      // default 0.7
  rungSpacing: number;    // default 0.35
  material:  string;      // default "metal_grate" or similar existing id
  materialOverrides?: MaterialOverrides;
  topDismountOffset?: number; // meters inward from top onto the platform (default 0.6)
  floorLevel?: number;
  groupIds?: string[];
}
// ZoneDef gains ladders?: LadderDef[]
// ToolId gains "ladder"; EditorObjectType gains "ladder"
// Bus events: ladder:added / ladder:updated / ladder:removed (mirror stair events)
// LocomotionState gains "climb"
// PlayerSettings gains climbSpeed?: number (default 2)
```

## 4. Build path

- `src/builders/LadderBuilder.ts` — merged box geometry: 2 side rails
  (full height) + rungs every `rungSpacing`, UV via `UVUtils`, material via
  the shared material registry. Follows `ShapeBuilder`'s shape: pure
  `buildLadder(def) → { geometry, colliderDescs }`.
- Colliders (`ColliderBuilder`): one thin solid box (rails+rungs envelope,
  ~0.15m deep) + one **sensor** box: width × (height + 1.0 above foot… to
  `height + 0.5`) × ~0.9m deep on the climb side, PLUS the top-lip extension:
  sensor reaches ~0.9m horizontally past the top edge onto the platform and
  ~1.2m above the top. Sensor handle registered in a `ladderSensors`
  map (handle → ladderId), passed to TriggerSystem like `volumeSensors`.
- `ZoneManager`: build/rebuild/despawn wiring — copy the stair entity
  lifecycle (`stair:added/updated/removed` handlers) verbatim.
- `WorldState`: `addLadder/updateLadder/removeLadder` mutators (undo-able,
  same command path as stairs), `toJSON`/load round-trip, `WorldLoader`
  parse. Runtime shell needs no extra work (shared ZoneManager).

## 5. Runtime

- `TriggerSystem`: add `_ladderSensors` map + `setLadderSensors()`; in the
  existing `intersectionPairsWith` loop emit `ladder:zone-enter/exit`
  `{ ladderId }` (same enter/exit set-swap pattern, zero new allocation).
- `CharacterController`:
  - listens for `ladder:zone-enter/exit`, keeps `_nearLadder: LadderDef|null`
    (defs resolved via WorldState by id — rebuilt defs re-resolve).
  - mount check each frame while `_nearLadder` set (dot(moveDir, toLadder)),
    top-zone variant checks the player is above `foot + height − 0.5`.
  - climb branch in `update()` before the normal move block; `_exitClimb()`
    per §2. Interact prompt: when in the top zone and not climbing, publish
    `character:interact-range` with label "Climb down"; `interactPressed`
    mounts (reuses the existing prompt UI untouched).
- Perf guardrails (TESTING.md §7): no per-frame allocations in the climb
  branch (reuse `_tmp*` scratch), no scene raycasts — everything is sensor
  events + def math.

## 6. Editor UI

- LeftPanel: Ladder tool button (icon: rungs), between Stair and Shape.
- `src/editor/LadderTool.ts`: click a floor/platform point → places a
  default ladder (h=3, yaw facing the camera); Escape/RMB cancels. (No
  drag-to-size v1 — height/yaw live in the panel, like shapes.)
- PropertiesPanel LADDER section: label, position, rotation Y, height, width,
  rung spacing, material picker, top dismount offset, groups. Player panel
  gains Climb Speed + the `climb` anim-override slot (falls out of the
  `animSlots` array).
- Selection: ladder meshes get `userData.editorType = "ladder"` — Select tool
  picking follows the existing tagged-root resolution for free.

## 7. Files

**New:** `src/builders/LadderBuilder.ts`, `src/editor/LadderTool.ts`,
`plans/phase-34-ladders.md` (this doc), `test-plans/phase-34-ladders.md`.

**Modified:** `src/types.ts`, `src/world/WorldState.ts`,
`src/world/ZoneManager.ts`, `src/world/WorldLoader.ts`,
`src/physics/ColliderBuilder.ts`, `src/preview/TriggerSystem.ts`,
`src/preview/CharacterController.ts`, `src/preview/CharacterBody.ts`,
`src/ui/PropertiesPanel.tsx`, `src/ui/LeftPanel.tsx`, `src/App.tsx`
(tool registration + sensor map plumbing), `WORLD_EDITOR_ARCHITECTURE.md`
(new phase section AND the touched file-level sections, per
PLAN_UPDATE_GUIDE.md).

## 8. Implementation order

1. Types + WorldState mutators + WorldLoader → verify: add a ladder via
   console `__world.addLadder(...)`, JSON round-trips, undo works.
2. LadderBuilder + ZoneManager + colliders (no sensor yet) → verify: mesh
   renders (§2 geometry probes), solid collider blocks walking through.
3. Editor tool + panel section → verify: place/select/edit via real clicks
   (the §3 golden path — panel commit via focusout, camera-projected clicks).
4. Sensor + TriggerSystem events → verify: `ladder:zone-enter/exit` fire in
   console while walking through (real keys or manual frame-stepping).
5. Climb mode in controller/body + anim intent → verify with the TESTING.md
   hidden-tab frame-stepping loop (`physicsWorld.step` + `c.update`,
   deterministic): mount, climb y-rate, top/bottom clamps, jump release,
   force-exit paths (teleport mid-climb MUST restore normal mode).
6. Top remount zone + interact prompt → verify both mount paths; walk-off-top
   dismount lands on the stand marker exactly.
7. Perf pass near the ladder (FpsCounter worst-ms), typecheck, arch doc,
   test plan, demo ladder left in the world (labeled), commit.

## 9. Acceptance

- Walk into ladder → mounts, snaps to centerline, Climb clip plays at
  input-proportional rate, hangs (paused clip) when idle.
- Climb to top pushing up → lands standing on the fixed marker, no clipping.
- From the platform top: both backing toward the ladder AND the "Climb down"
  prompt mount downward, facing correct.
- Jump mid-climb → falls, cannot re-grab for 0.4s.
- Teleport / preview-exit / scene transition mid-climb → control restored
  (no soft lock), verified explicitly.
- Ladder deletable/editable in the editor with live rebuild; save/load/undo
  round-trip; runtime shell behaves identically; 0 typecheck errors; no
  worst-ms regression standing next to a ladder.
