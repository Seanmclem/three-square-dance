# Phase 10.9 — Group Functionality + Scripting Cleanup — Test Plan

## Prerequisites
- Phase 10.5/10.6b complete: scripting engine, trigger volumes, GroupPanel name-list
- `npm run build` / `npx tsc --noEmit` passes with zero TypeScript errors

> **Status:** as of this commit, only **`on_timer`** is implemented in code. The remaining
> sections (Groups assignment/visibility/bulk/scripting-targets, `change_material`,
> `play_animation`, `fade_screen` visual) are **specced in `WORLD_EDITOR_ARCHITECTURE.md`
> Phase 10.9** but not yet built. Their checklists below are the acceptance criteria for
> when that work lands.

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

## 2. Groups — assignment UI (spec — not yet built)

- [ ] Select an object — PropertiesPanel shows a **GROUPS** section listing existing groups
- [ ] Toggle a group on — object's `groupIds` gains the id (verify in saved JSON)
- [ ] Toggle off — id removed
- [ ] Works for floors, walls, platforms, stairs, trigger volumes (not just objects)
- [ ] No groups defined — section shows an empty/“create a group first” state

---

## 3. Groups — visibility toggle (spec — not yet built)

- [ ] Eye icon per group in GroupPanel
- [ ] Hiding a group hides every mesh whose entity is in that group
- [ ] Showing re-displays them
- [ ] Visibility is editor-only — saved JSON unchanged; preview shows everything

---

## 4. Groups — bulk operations (spec — not yet built)

- [ ] "Select all" selects every member of the group (multi-select gizmo)
- [ ] "Delete" removes all members (single undo step)
- [ ] "Duplicate" / "Move" act on all members
- [ ] Undo/redo restores bulk operations correctly

---

## 5. Groups — scripting targets (spec — not yet built)

- [ ] A script action with `targetId` = a group id resolves to all members
- [ ] `despawn_object` on a group removes every member in preview
- [ ] `move_object` / `change_material` / `show_ui` apply per-member
- [ ] `targetId` = a single entity id still works (non-group fallback)

---

## 6. Re-homed actions (spec — not yet built)

- [ ] `change_material` — swaps the GLTF object's material at runtime (via `materialOverride`)
- [ ] `play_animation` — plays the named clip on the object's mixer
- [ ] `fade_screen` — `<FadeOverlay>` fades the screen to `fadeColor` over `fadeDuration`
