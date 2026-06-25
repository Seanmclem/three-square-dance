# Human Testing Guide

How to exercise features **by hand, through the UI** — no browser console, no dev
helpers. (For the automation/Claude-driven side — dev globals, the `window.__test`
harness, reading state programmatically — see `TESTING.md`. Per-phase acceptance
checklists live in `test-plans/`.)

## Launch

```bash
npm run dev          # then open the printed http://localhost:5173/
```

## Basics you'll reuse

- **Select** something: Select tool (V), click it. The right-hand **Properties** panel
  shows its `label · id` in the header. Rename with the ✎ pencil to give it a memorable
  label/id.
- **Left panels** (bottom-left buttons): **MATS** (materials), **SCRIPTS** (scripting),
  and the asset/groups panels. The Groups panel also opens when you pick the groups tool.
- **Play**: the green **▶ Preview** button bottom-left (hotkey **G**), or its dropdown
  caret → **Start Game**. Preview lets you walk around; Start Game also spawns you at the
  level's spawn point and fires `on_game_start`.

> **Persisted vs runtime:** editor edits (moving via gizmo, panel fields, group
> assignment) change the saved level. **Script actions are runtime-only** — they affect
> the live play session, not the saved file, and reset when you leave preview/reload.

---

## Workflow: author & run a script action

Use this to test `despawn_object`, `move_object`, `change_material`, `play_animation`,
`fade_screen`, etc.

1. **Note the target's id.** Select the object you want the script to affect; read its
   `id` from the Properties header (rename it for clarity if you like). For a **group**
   target, create the group in the Groups panel first and use the group's name/id.
2. **Open SCRIPTS** (bottom-left). Pick a tab:
   - **LEVEL** — level-wide scripts. Best for `on_game_start` (one-time setup) and
     `on_timer`.
   - **SELECTED** — scripts on the currently-selected object or trigger volume.
3. **Add a script** (+ New) and choose its **trigger** from the dropdown:
   - `on_game_start` — fires automatically on Start Game.
   - `on_interact` — pick the object from the target dropdown. **The object must be
     marked Interactable** (Properties) so you can press **E** on it in game.
   - `on_player_enter` / `on_player_exit` — pick a **trigger volume** (place one first
     with the trigger-volume tool).
   - `on_timer` — set an interval (and repeat).
4. **Add the action** (action-type dropdown → **+ Add**) and fill its fields. The
   **Target** field is a dropdown of the zone's **Groups** and **Objects** (a group target
   fans out to every member):
   - `despawn_object` — pick a target.
   - `move_object` — pick a target + set the destination X/Y/Z.
   - `change_material` — pick a target + type a material id.
   - `play_animation` — pick a target + type a clip name (the object's asset must have it).
   - `fade_screen` — color + duration.
5. **Play** (▶ Preview / Start Game) and **trigger it**: press **E** on an interactable,
   walk into the trigger volume, wait for the timer, or let `on_game_start` fire.
6. **Leave preview** to reset — runtime script effects revert (the saved level is
   untouched).

### Quick smoke test (despawn via a group)

1. Place two objects; create a group in the Groups panel; assign **both** to it
   (Properties → **Groups** accordion → check the group).
2. LEVEL tab → new script, trigger `on_game_start`, action `despawn_object`,
   Target = the group (under the **Groups** heading in the dropdown).
3. **Start Game** → both objects vanish. Leave preview → they're back.

---

## Adding more workflows

Keep this doc to **reusable, feature-level UI walkthroughs** (the steps a person clicks).
Put pass/fail acceptance checklists for a specific phase in `test-plans/phase-NN-*.md`
instead.
