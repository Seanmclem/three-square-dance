# Phase 10.9 — Group Functionality + Scripting Cleanup — Test Plan

## Prerequisites
- Phase 10.5/10.6b complete: scripting engine, trigger volumes, GroupPanel name-list
- `npm run build` / `npx tsc --noEmit` passes with zero TypeScript errors

> **Verified 2026-06-24 (Chrome, localhost:5173):** §2 accordion renders on a selected platform's
> root screen above Actions; checkbox assignment persisted to `groupIds` and the "Groups (N)" count
> updated. §3 emitting `group:visibility` (the eye-icon's payload) hid the member mesh and left a
> non-member visible; re-show restored it. §6 `overlay:fade-in` tinted the full viewport;
> `object:updated{material}` swapped a placed object's mesh material (uuid changed). No console
> errors. Not live-fired through preview: `_resolveTargets` group expansion (trivial pure fn,
> typecheck-passed; the events it emits are verified downstream) and `play_animation` visual
> (needs an animated GLB) — and the GroupPanel eye-button→App wiring (left panel didn't open via the
> `z` hotkey in the automation tab; the emitted event path is verified).
>
> **Status:** Groups assignment UI, group visibility toggle, group-targeted script actions,
> `change_material`, `play_animation`, and the `fade_screen` visual are now **implemented**
> (`on_timer` shipped earlier). **Bulk operations (§4) are deferred** to a follow-up phase —
> they need real multi-select in `SelectionManager`, which doesn't exist yet.

---

## 1. `on_timer` (implemented)

Setup: create a LEVEL script with trigger type `on_timer`, interval `2`, repeat `true`,
and an action that is observable (e.g. `set_flag` plus a chained `on_flag_set` script that
`show_dialogue`, or just an action that logs).

- [ ] Enter preview (**G**) — timer does not fire before preview starts
- [ ] After ~2s in preview — the action fires
- [ ] Action keeps firing roughly every 2s while in preview (repeat=true)
- [ ] Set repeat `false`, interval `3` — action fires exactly **once** ~3s after preview start
- [ ] Default interval: omit `interval` — fires at 5s
- [ ] `oneShot` script with repeating timer — fires only once even though interval recurs
- [ ] Conditions are honoured — a timer script with an unmet `flag_set` condition does not fire
- [ ] Exit preview (**G** / Start-Game stop) — timer stops; no further firing
- [ ] Re-enter preview — timer restarts cleanly (no duplicate/leaked intervals)

---

## 2. Groups — assignment UI (accordion)

Create ≥1 group first in the Groups panel (Z).

- [ ] Select an object — PropertiesPanel root shows a **Groups** accordion (collapsed by default), above the **Actions** accordion
- [ ] Expand it — lists all existing groups, each with a checkbox; header shows a count when ≥1 assigned
- [ ] Toggle a group on — object's `groupIds` gains the id; re-select shows it checked; verify it persists in saved JSON
- [ ] Toggle off — id removed
- [ ] Works for floors, walls, platforms, stairs **and trigger volumes** (trigger volumes show the accordion at the bottom of their dedicated view)
- [ ] No groups defined — accordion body shows "No groups yet — create one in the Groups panel"
- [ ] Assignment goes through undo/redo (Cmd+Z restores prior groupIds)

---

## 3. Groups — visibility toggle (editor-only)

- [ ] Eye icon (👁) per group in GroupPanel; click toggles to 🚫 when hidden
- [ ] Hiding a group hides every mesh whose entity is in that group (objects + floors/walls/platforms/stairs)
- [ ] A merged wall run hides only when *all* its walls are in the hidden group
- [ ] Showing re-displays them
- [ ] Visibility is editor-only — saved JSON unchanged; entering preview shows everything
- [ ] Deleting a hidden group makes its members reappear (no stuck-hidden meshes)

---

## 4. Groups — bulk operations (DEFERRED — not in this phase)

Needs `SelectionManager` multi-select, which doesn't exist yet. Tracked as a follow-up phase.

- [ ] (later) "Select all" / "Delete" / "Duplicate" / "Move" act on all members with correct undo/redo

---

## 5. Groups — scripting targets

- [ ] A script action with `targetId` = a group id resolves to all members in the active zone
- [ ] `despawn_object` on a group removes every member in preview
- [ ] `move_object` / `change_material` / `play_animation` apply per-member
- [ ] `targetId` = a single entity id still works (non-group fallback)
- [ ] (note) `show_ui` targets a UI element id, not entities — it is *not* group-resolved

---

## 6. Re-homed actions

Author these in the Scripts panel. `play_animation` and `change_material` now expose a second
input (clip name / material id) beside the target field.

- [ ] `play_animation` — plays the named clip on the object's mixer (one-shot via ObjectPlacer); group target plays on all members
- [ ] `change_material` — swaps the GLTF object's material to the registry material id (via `WorldObject.material`); group target swaps all members
- [ ] `fade_screen` — `<FadeOverlay>` (`src/preview/FadeOverlay.tsx`) fades the screen to `fadeColor` over `fadeDuration`, then clears
- [ ] An object saved with `material` set loads with that material applied (ObjectPlacer applies on build)

> **Test-tab note:** animated-GLB / async asset paths must run in a **foreground** Chrome tab —
> background tabs freeze `fetch`/timers (carried over from Phase 10.7).
