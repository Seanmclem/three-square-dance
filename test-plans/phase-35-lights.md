# Phase 35 — Light controls: acceptance test plan

Architecture: WORLD_EDITOR_ARCHITECTURE.md § "Light Controls — Phase 35".
Automation notes: TESTING.md §3 (autosave protocol, React input driving).
Demo entity: `light_c5f193e9` "Demo point light (phase 35)" at (−9.6, 2.5, 32.9),
warm `#ffd9a0` @ 60 cd, range 15 — visible glow pool on the concrete floor.

## Placed lights

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 1 | Toolbar variants | click Light (bulb, below Decal) | popover: ◉ Point / ◭ Spot / ☀ Directional; panel shows tool desc + WORLD LIGHT section |
| 2 | Place point | pick Point, click ground | light at click + 2.5y (warm, 30 cd, range 15, no shadow); glow pool visible; tool → Select; new light auto-selected |
| 3 | Panel view | (after 2) | LIGHT · POINT header, renameable; COLOR swatch, INTENSITY, RANGE (M) "0 = unlimited", CAST SHADOWS, POSITION, Delete Light |
| 4 | Intensity edit | type in INTENSITY, blur | THREE PointLight.intensity follows (debounced commit) |
| 5 | Color edit | color input | def + light + marker color update (marker rebuilt) |
| 6 | Shadow toggle | check CAST SHADOWS | `castShadow` true, 512² map, `shadow.camera.far = range`; perf warning appears |
| 7 | Spot aim | place Spot; edit AIM PITCH/YAW | default aims straight down (target 5m below); pitch/yaw drive `light.target` per `lightAimDir` (yaw 0 = −Z, pitch 90 = down); CONE ANGLE = THREE half-angle |
| 8 | Directional | place Directional | parallel-ray light; position cosmetic; ±20 ortho shadow box when enabled |
| 9 | Gizmo move | drag translate gizmo | marker AND light (+target) move live; commit writes `position` via updateLight |
| 10 | Undo/redo | edit intensity → Cmd+Z / redo | def AND scene light revert/reapply (the `_emitChange` "light" case — first build missed it and undo reverted data only) |
| 11 | Delete | Delete Light button / Delete key / multi-select delete | light + marker gone, physics untouched |
| 12 | Game mode hides markers | Start Game | all light markers invisible (`hideInGame`); lights still lit; markers restored on exit |
| 13 | Persistence | autosave → reload | `zones[].lights` round-trips; light + marker rebuilt on cold load; runtime shell renders lights (ZoneManager path) |

## World ambient/sun

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 14 | WORLD LIGHT edits | Light tool armed, edit AMBIENT/SUN color + intensity | scene AmbientLight + sun DirectionalLight follow live; saved in `world.ambientLight/sunLight`; NOT undoable (matches player settings) |
| 15 | Migration parity | load a pre-35 save (stored 1.2 / 3.0) | `migrateWorldLighting` rewrites to 0.5 / 2.0 — scene looks EXACTLY as before (those stored values were never applied); hand-edited values pass through untouched |
| 16 | Fresh session | no autosave, edit WORLD LIGHT | default WorldConfig seeded by `updateWorldLighting`; edit applies + persists |
| 16b | Fill/rim follow sun (v4.29.5) | set SUN intensity | fill = 0.3×sun, rim = 0.15×sun (0.6/0.3 at default sun 2.0 — unchanged look) |
| 16c | ENVIRONMENT row (v4.29.5) | edit ENVIRONMENT intensity | `scene.environmentIntensity` follows; saved as `WorldConfig.envIntensity` (absent = 1, no migration) |
| 16d | True darkness (v4.29.5) | ambient 0 + sun 0 + environment 0 | scene renders black except placed lights (and sky/fog); a placed point light lights its pool |

## Static shadows + script actions (v4.29.6)

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 22 | STATIC SHADOWS toggle | CAST SHADOWS on → check STATIC SHADOWS | `shadow.autoUpdate` false, one-shot `needsUpdate` render; hint explains the moving-object caveat; uncheck → live shadow again |
| 23 | Frozen-ness | move a caster mesh directly (mover-style) | shadow stays at the old spot; `needsUpdate = true` refreshes once |
| 24 | Editor WYSIWYG | move/edit geometry via the normal editor path | `*:rebuilt` (and object add/remove) re-poke frozen maps — shadow follows editor edits |
| 25 | light_off / light_on / toggle_light | author on a script (Lights optgroup in the target picker) or `__test.runAction` | intensity 0 ↔ authored value; off also freezes the shadow passes; light counts unchanged (no recompile hitch) |
| 26 | Preview restore | turn lights off in preview, exit | all lights reset to their defs (intensity + shadow mode) |
| 27 | Flicker (v4.29.7) | `on_timer` (repeat, ~0.4s) + `toggle_light` on a static-shadow light | intensity alternates every tick; `shadow.autoUpdate` stays false — ZERO shadow re-renders per blink (geometry pokes refresh off lights too); restored on exit. Hand-authored scripts MUST set `enabled: true` |
| 28 | Authored flicker (v4.29.8) | LightView FLICKER row: 🔥 Flame / ⚡ Electric + AMOUNT/SPEED | preview/game only (editor shows steady intensity). Flame: smooth wobble, never off. Electric: hard on/off, random irregular durations. Frozen static shadow stays frozen; `light_off` script pauses it; exit restores. Don't put a `toggle_light` timer script AND authored flicker on the same light |

## Lights list (v4.29.1)

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 17 | Lights category row | nothing selected, any tool (v4.29.3) | "Lights" CategoryRow with summary `sun + ambient · N placed` |
| 18 | Nested page | press the row | drilldown page (← Back, "Lights" header, WORLD SUN · AMBIENT · PLACED subtitle): WORLD LIGHT (ambient + sun) on top, PLACED LIGHTS (n) below (swatch + label/id + kind glyph + `☑︎sh`); Back returns to the tool view |
| 19 | Row click selects | click a placed-light row | tool switches to Select; that light selected (LightView + gizmo) — next canvas click does NOT place |
| 20 | List is live | add/remove/edit lights | count and rows track `zone.lights` (light:added/updated/removed) and zone switches |
| 21 | Tool switch resets | open Lights page, click another tool | panel shows the new tool's view (stack cleared) |

## Results (2026-07-12) — ALL PASS (real clicks + probes)

- Toolbar → Point → canvas click: placed at surface+2.5y, auto-selected, glow pool
  in screenshot. INTENSITY 30→80 and CAST SHADOWS via real inputs drove the THREE
  light (shadow far 15, map 512²).
- **Bug found & fixed during testing:** first undo reverted `castShadow` in the def
  but not the scene — `_applyChanges` replays per-kind events and `light` had no
  `_emitChange` case. After the fix: edit → undo → redo drove the scene light both
  ways (200 → 80 → 200). (Checkpoints have the same pre-existing gap — not touched.)
- Spot pitch 90 target exactly (x, y−5, z); directional pitch 50 / yaw 90 target
  (−0.643·5, −0.766·5, 0) offset — matches `lightAimDir`.
- `__test.enterGame()`: 3/3 markers hidden, lights visible; restored on exit.
- WORLD LIGHT ambient 0.5→1.0→0.5 through the real inputs (config + scene synced).
- User's world ("level-2") migration: stored 1.2/3.0 → 0.5/2.0, rendered look
  unchanged. Autosave reload rebuilt the light; demo light left in the world.
- Console: only the known pointer-lock automation artifact. `npm run typecheck` clean.
- **v4.29.1 (lights list), 2026-07-12:** list rendered via real toolbar clicks
  (LIGHTS IN THIS ZONE (1), demo light row with swatch + kind); row click selected
  the light (LIGHT · POINT view, Delete button present); count tracked add/remove
  live (1 → 2 → 1). Typecheck clean.
- **v4.29.3 (nested page), 2026-07-12:** "Lights" CategoryRow on the default Select
  view (`sun + ambient · 1 placed`); page shows ← Back + Lights header + WORLD LIGHT
  above PLACED LIGHTS (1) (screenshot-verified); Back → tool view; reopen → row click
  → LIGHT · POINT view. Console clean, typecheck clean.
- **v4.29.5 (true darkness), 2026-07-15:** on load fill/rim = 0.6/0.3 at sun 2
  (parity). All-zero via `updateWorldLighting`: dirs [0,0,0], env 0, center-floor
  pixel [32,42,50]→[5,8,9]; temp point light in the dark scene showed a clear glow
  pool (screenshot). ENVIRONMENT input through the real panel: 1→0.4→1, scene +
  config tracked each step. Original values restored pixel-exact; project scene
  files untouched (git clean). Console clean, typecheck clean.
- **v4.29.6 (static shadows + actions), 2026-07-15, in the user's level-2:** static
  spot built frozen (`autoUpdate` false, one-shot `needsUpdate` consumed after one
  render). Pixel-proofed in a darkened world: box shadow band 15 vs lit 50–63; box
  mesh moved mover-style → frozen shadow stayed (15); `needsUpdate` → refreshed
  (59); editor `updateShape` move → `shape:rebuilt` poke refreshed automatically.
  STATIC SHADOWS checkbox via real click flipped def + rebuilt light live. Actions
  via real dispatch: off/on/toggle drove intensity 0↔80 with `autoUpdate` managed;
  preview-exit restored. ScriptPanel: light_off/light_on/toggle_light in the type
  dropdown, Lights optgroup listed all 4 zone lights; test script deleted after.
  World lighting + scene restored exactly (project files git-clean). Console clean.
