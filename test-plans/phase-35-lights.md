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

## Lights list (v4.29.1)

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 17 | List renders | nothing selected, any tool (v4.29.2) | LIGHTS IN THIS ZONE (n) whenever the zone has lights; row = color swatch + label/id + kind glyph (+ `☑︎sh` when shadow on); with zero lights the section (empty-state hint) appears only under the Light tool; WORLD LIGHT stays Light-tool-only |
| 18 | Row click selects | click a row | tool switches to Select; that light selected (LightView + gizmo) — next canvas click does NOT place |
| 19 | List is live | add/remove/edit lights | count and rows track `zone.lights` (light:added/updated/removed) and zone switches |

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
