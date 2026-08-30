# Phase 68 — Game-wide defaults with per-scene overrides

> User ask (2026-08-30, after the "what carries into a new scene?" question):
> promote player settings to game level with per-scene overrides — "a larger
> idea needs to be scoped… game-wide something or other." Decisions taken in
> that discussion: **per-PAGE override granularity** (not per-field — one
> "Override for this scene" switch per settings page; legible, ~20% of the
> per-field cost, and the data shape below still permits per-field later);
> **lighting and audio ship in the same phase, immediately after player
> settings** (same mechanism, second commit). The general rule this phase
> establishes (and that stateSchema / items / uiElements already follow):
> `game.json` holds the defaults; a scene stores only what it deliberately
> changes.

## The model

- **Resolution is a spread**: `effective = { ...game.playerSettings,
  ...scene.playerSettings }` — per field, so storage stays future-proof.
- **Override is per page, presence-based**: the scene object holds only the
  field groups of overridden pages (Movement / Camera / Character / Character
  Sounds / Controls — the existing spawn drilldown pages). Flipping a page's
  "Override for this scene" ON copies the current effective values of that
  page's fields into the scene layer (so nothing visibly changes at the
  moment of overriding); OFF deletes those fields (the page snaps to game
  defaults). No separate marker — a page is overridden iff any of its fields
  is present in the scene layer.
- **Migration is free and honest**: today's scene files carry FULL
  playerSettings → every page reads as overridden, which is exactly today's
  behaviour. New scenes write no playerSettings at all → inherit everything.

## Part 1 — player settings

- `types.ts`: `GameConfig.playerSettings?: PlayerSettings` (complete);
  `WorldConfig.playerSettings` becomes `Partial<PlayerSettings> | undefined`.
  A `PAGE_FIELDS` map (page id → PlayerSettings keys) is the single source of
  truth for the override groups — the spawn drilldown pages already partition
  the fields this way.
- Seeding: opening a project whose game.json has no `playerSettings` seeds it
  from the ENTRY scene's settings (the game already "feels" like that scene);
  written back immediately (applyPrefabs precedent: game.json writes on
  change, not on Save).
- `WorldState`: gains `gamePlayerSettings` (like gameItems/gameStateSchema);
  `playerSettings` reads as the RESOLVED merge (single choke point — the
  runtime consumers, PreviewController/CharacterController/BagOverlay/HUD,
  keep reading `world.playerSettings` untouched). Scene overrides live in a
  `scenePlayerSettings` field that toJSON persists.
- Editing: the spawn drilldown pages gain a scope banner — "Game default"
  (editing game.json) vs "Override for this scene" switch + fields. The
  no-selection panel keeps opening the scene view; a **Game Settings** entry
  (project ⋯ menu → "Game settings…") opens the same pages in game scope.
- One-click promotion: **"Make these the game defaults"** on the scene view —
  copies the scene's effective settings into game.json and clears every page
  override in this scene.
- Runtime save/export: game.json already ships; the runtime resolves the same
  way (shared helper in `src/shared/`).

## Part 2 — lighting + audio (same mechanism, second commit)

- **Lighting/environment page group**: ambientLight, sunLight, envIntensity,
  skybox, fogColor, fogDensity → `GameConfig.lighting?` defaults; the scene's
  existing fields become the override layer (presence-based, one "Override
  for this scene" switch on the Lights page's world section + Environment).
  `lightingQuality` already lives in GameConfig — folds into this group.
- **Audio mixer**: `WorldAudio.mixer` levels → game default with per-scene
  override (one switch on the Mixer page). Music/ambient tracks & playlists
  stay scene-only on purpose (they are level content, not game feel);
  character sounds are inside playerSettings and are already covered by
  Part 1's Sounds page.

## Out of scope

Per-field override UI (data shape permits it later); spawn point, scene
scripts, dialogues, entity content (they ARE the scene); cross-scene live
sync of currently-open editors.

## Verification

- `npx tsc --noEmit`.
- New scene in a project with tuned settings: character moves/looks/sounds
  identical to the entry scene (inherited); its Movement page shows "game
  default" with no override.
- Override Movement in scene 2 (switch ON → values editable, initially equal);
  change speed; scene 1 unaffected; switch OFF → snaps back to game default
  and the scene JSON loses those fields.
- "Make these the game defaults" from a tuned scene updates game.json and
  clears that scene's overrides; other scenes inherit the new defaults.
- Old project (full per-scene settings): every page reads overridden; play
  behaves byte-identically; game.json seeded from the entry scene.
- Part 2: new scene inherits lighting + mixer; a cave scene overrides
  lighting only; export bundle plays with the same resolution.

## Files

`src/types.ts`, `src/world/WorldState.ts`, project store (`game.json`
seed/write), `src/App.tsx` (scope plumbing, promotion action, ⋯ entry),
`src/ui/PropertiesPanel.tsx` (scope banner + override switches on the spawn/
lights/audio pages), `src/ui/TopBar.tsx` (⋯ "Game settings…"), runtime shell
resolution, `GAMEPLAY_STATE.md`/`AUDIO.md` notes, arch doc, test plan.
