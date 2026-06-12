# Phase 10.5 — Scripting / Event System — Test Plan

## Prerequisites
- Phase 10 complete: character controller, door sensors, interact system
- `npm run build` passes with zero TypeScript errors

---

## 1. Trigger Volume Placement

- [ ] Press **U** — active tool changes to trigger-volume, Scripts panel opens
- [ ] Hover over the floor — cursor shows expected grid-snapped coordinates
- [ ] Click and drag on the floor — amber wireframe box preview appears
- [ ] Drag larger — preview grows
- [ ] Scroll wheel during drag — height adjusts
- [ ] Release mouse — volume is placed; amber wireframe persists in editor
- [ ] Single click (no drag) — no volume created (minimum size guard)
- [ ] Undo (Cmd+Z) — placed volume removed
- [ ] Redo (Cmd+Y) — volume reappears
- [ ] Save and reload scene — volume is present after load (check `triggerVolumes` in JSON)

---

## 2. Script Panel UI

- [ ] Press S or click Scripts button in toolbar — Scripts panel opens (amber active state)
- [ ] Three tabs visible: **World**, **Zone**, **Object**
- [ ] Object tab is disabled when no object is selected
- [ ] Click **+ New** in Zone tab — new script row appears with default label
- [ ] Click a script row — drill-down editor opens
- [ ] Label text input works — change and see updated label in list
- [ ] Trigger type dropdown — all TriggerType values are listed
- [ ] Selecting `on_player_enter` trigger type — target dropdown shows placed trigger volumes
- [ ] Selecting `on_interact` trigger type — target dropdown shows zone objects
- [ ] Conditions: click **+ Add** — new condition row added; type dropdown works; remove (×) works
- [ ] Actions: click **+ Add** — new action row added; `show_dialogue` action shows speaker + lines fields
- [ ] `set_flag` / `clear_flag` actions — flag name input appears
- [ ] One-shot checkbox visible and toggles
- [ ] Delete button removes the script after confirmation
- [ ] Back button returns to script list

---

## 3. Script Persistence

- [ ] Create a script with `on_player_enter` trigger + `show_dialogue` action
- [ ] Save scene to JSON
- [ ] Inspect JSON: zone has `scripts` array and `triggerVolumes` array with correct data
- [ ] Reload scene — scripts and volumes are present
- [ ] Old scenes (without scripts/triggerVolumes fields) load without error

---

## 4. Runtime: Trigger Volume → Dialogue

- [ ] Place a trigger volume
- [ ] Create a zone script: trigger = `on_player_enter`, target = the volume's ID, action = `show_dialogue` with speaker "NPC" and line "Hello!"
- [ ] Enter preview mode (G or Preview button)
- [ ] Walk the character into the trigger volume
- [ ] Dialogue overlay appears at the bottom of the screen
- [ ] Speaker name shown in amber, line text shown in white
- [ ] Press **E** — dialogue advances or closes
- [ ] Click — same as E (advance/close)
- [ ] Multi-line dialogue: all lines cycle correctly; line counter (e.g. 1/3) is shown
- [ ] After last line — dialogue closes, overlay disappears
- [ ] Walk out of volume, then back in — dialogue fires again (not one-shot)
- [ ] Make script one-shot — dialogue fires only once per preview session
- [ ] Exit preview (Esc) — dialogue overlay gone

---

## 5. Flag Chain

- [ ] Create script A: trigger = `on_player_enter` → action = `set_flag "door_open"`
- [ ] Create script B: trigger = `on_flag_set`, target = "door_open" → action = `show_dialogue` "Door is open!"
- [ ] Enter preview, walk into volume — both scripts fire, dialogue shows

---

## 6. Start Game (on_game_start)

- [ ] Create a world script: trigger = `on_game_start` → action = `show_dialogue` "Welcome!"
- [ ] Use Start Game (dropdown ▾ → Start Game) — dialogue appears immediately

---

## 7. Volume Sensor in Physics

- [ ] In preview, multiple volumes in the scene — entering each fires its own event (no cross-talk)
- [ ] Leaving a volume fires `on_player_exit` (if a script is wired to it)
- [ ] Volume sensor does not create visible physics collision (character passes through freely)

---

## 8. Edge Cases

- [ ] No active zone — trigger volume tool gracefully does nothing
- [ ] Script with empty actions list — fires without error
- [ ] Script with `run_script` action and JS body — executes without crashing
- [ ] Very large number of scripts (50+) — panel scrolls, no performance cliff
- [ ] Switching zones — zone scripts and volumes update to the new active zone
