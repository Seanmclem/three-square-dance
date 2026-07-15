# Phase 36 — Audio System (music, ambient, spatial, mixer)

## Context

The world editor has a partial audio *scaffold* but no actual sound: the `play_sound`
script action exists (`types.ts:940`), it emits `audio:play` (`ScriptEngine.ts:229`),
and the ScriptPanel shows a "Sound asset ID" text box (`ScriptPanel.tsx:1776`) — but
**nothing listens for `audio:play`** (grep confirms zero subscribers), there is no
audio asset manifest, and no `THREE.AudioListener`/`Audio` anywhere in `src/`. The
architecture doc lists a full "Audio system — sound asset manifest, positional audio,
ambient loops, music tracks, audio mixer" as the planned home for this
(`WORLD_EDITOR_ARCHITECTURE.md:6877`, and the `play_sound` stub is explicitly deferred
to the audio phase at line 6864).

This phase builds that system end-to-end, mirroring the existing model/material asset
pipeline and the world-lighting settings pattern so the new code reads like the code
around it.

### Decisions locked with the user
- **Full importer + browser** — a real `public/assets/audio/manifest.json`,
  `AssetManager.initAudio()`, an FSA-based `AudioImporterModal`, and an `AudioBrowser`
  picker, exactly mirroring models/materials.
- **Authored ambient/music live at scene level** (`WorldConfig.audio`). Per-room control
  is done the way the engine already does everything else: **trigger-volume scripts**
  firing `play_music`/`play_sound`. Extra authoring surfaces that genuinely add options
  are **per-object spatial emitters** and **script/trigger-driven** sounds.

  > **Correction (post-ship):** this doc originally justified the scene-level choice by
  > saying "each scene has exactly one zone, so scene-level *is* zone-level." That framing
  > wrongly implied a live multi-zone concept. In reality the multi-zone / sub-room layer
  > was **removed** — zone creation is dead code and there is no zone-transition system
  > (see the "zones" disclaimer in `WORLD_EDITOR_ARCHITECTURE.md`). Scene-level is simply
  > *the* level of audio config; the only other units are cross-level `load_scene` and
  > within-level trigger/script/object sounds. There was never a per-zone option to weigh.
- **Authored mix + player sliders** — four gain buses (master/music/sfx/ambient).
  Authored defaults in `WorldConfig.audio.mix` (editable in an editor "Audio" tool
  screen cloned from the Lights screen); player-facing volume sliders in the PauseMenu
  persisted to `localStorage` and multiplied over the authored mix.

### Backend
`THREE.AudioListener` + `THREE.Audio` (non-positional: music, ambient, UI one-shots) +
`THREE.PositionalAudio` (object emitters, positional `audio:play`). Buffers loaded via
`THREE.AudioLoader` and cached in `AssetManager` alongside textures/GLTF. No new deps.

---

## Architecture

A single new `AudioSystem` (`src/audio/AudioSystem.ts`) is the missing consumer. It is
constructed in **both** composition roots (editor `App.tsx`, runtime `RuntimeApp.tsx`),
takes `(bus, world, scene)`, and self-manages via the bus — same lifecycle contract as
`MoverSystem` (`src/world/MoverSystem.ts:52-53`):

- On **`preview:start`**: resume the `AudioContext` (the Play click is the required user
  gesture), attach its `AudioListener` to the active render camera
  (`scene.activeRenderCamera`, i.e. `CharacterController.camera`), start
  `world.audio.ambient` + `world.audio.music`, and build a `PositionalAudio` for every
  loaded-zone object that has a `.sound`.
- On **`preview:stop`**: stop/dispose all sounds, detach the listener.
- Subscribes to `audio:play` / `audio:stop` / `music:play` / `music:stop` /
  `world:audio` and to `object:added` / `object:updated` / `object:removed` (attach/
  update/detach positional emitters) — the same object events `ObjectPlacer`/`ZoneManager`
  already use.
- `update(dt)` only drives volume fades (crossfades on music change); listener + emitter
  transforms auto-follow their parent camera/mesh matrices, so no per-frame raycasts or
  allocations (respects TESTING.md §7 perf rules).

**Mixer math.** AudioSystem keeps active sounds tagged by category. Effective per-sound
volume = `soundBaseVolume × authoredMix[cat] × playerPrefs[cat]`; master =
`authoredMix.master × playerPrefs.master` via `listener.setMasterVolume`. On a
`world:audio` (authored) or player-slider change it re-applies to all live sounds.

---

## Data model — `src/types.ts`

```ts
// Asset manifest entry (mirrors AssetDef, types.ts:72)
export interface SoundDef {
  id: string; label: string; category: string;   // 'Music' | 'Ambient' | 'SFX' | free
  path: string; loop?: boolean; volume?: number; spatial?: boolean;
  tags: string[]; dateAdded: string; attribution?: Attribution;
}
export interface SoundManifest { version: string; sounds: SoundDef[]; }

// Scene-level authored audio — new optional field on WorldConfig (types.ts:496)
export interface AudioMix { master: number; music: number; sfx: number; ambient: number; }
export interface WorldConfig {
  /* ...existing... */
  audio?: {
    music?:   { soundId: string; volume?: number; loop?: boolean };
    ambient?: { soundId: string; volume?: number };
    mix?:     AudioMix;   // authored defaults; player prefs multiply over this
  };
}

// Per-object spatial emitter — new optional field on WorldObject (types.ts:826)
export interface WorldObject {
  /* ...existing... */
  sound?: { soundId: string; volume?: number; loop?: boolean;
            refDistance?: number; maxDistance?: number };
}

// Actions (types.ts:939) — keep play_sound, add:
type ActionType = /* ... */ | 'stop_sound' | 'play_music' | 'stop_music';
// ScriptAction (types.ts:1062) — sound? & position? already exist; add:
//   music?: string; volume?: number; loop?: boolean; fadeSeconds?: number;

// BusEvents (types.ts:136) — audio:play already exists; add:
//   "audio:stop":  { id?: string };
//   "music:play":  { soundId: string; volume?: number; loop?: boolean; fade?: number };
//   "music:stop":  { fade?: number };
//   "world:audio": { audio: WorldConfig["audio"] };   // mirrors "world:lighting"
//   "sounds:loaded": { sounds: SoundDef[] };
```

`WorldObject.sound` serializes automatically (zones dump wholesale). `WorldConfig.audio`
is a named field, so it **must** be added explicitly to `WorldState.toJSON()`
(`WorldState.ts:717`) and `loadFromJSON()` (`:728`), plus a default in the WorldState
config defaults.

---

## New files

- `src/audio/AudioSystem.ts` — the consumer described above. Exposes `getListener()`,
  `activate()/deactivate()` (bus-driven), `update(dt)`, `setPlayerMix(mix)`.
- `src/ui/AudioImporterModal.tsx` — clone of `ModelImporterModal.tsx`: `showOpenFilePicker`
  for `.mp3/.wav/.ogg`, `showDirectoryPicker` on `assets/audio`, copy files, build
  `SoundDef` (label from filename, category default `SFX`, `loop`/`spatial` toggles),
  dedupe-splice `manifest.json`, `onComplete → handleSoundsReload`. Inline `<audio>`
  preview player instead of a thumbnail render.
- `src/ui/AudioBrowser.tsx` — clone of `MaterialBrowser.tsx`: category pills + list, a
  ▶ preview button per row, select fires the picker callback.
- `src/ui/SoundPicker.tsx` — small reusable dropdown (list from `getSoundList()`) used by
  the ScriptPanel action editor and the object Sound section. (Analog: the animation-clip
  picker in PropertiesPanel.)

## Modified files

**Asset pipeline (mirror models):**
- `src/core/AssetManager.ts` — add `initAudio(opts?)`, `_soundRegistry`,
  `getSoundDef/getSoundList/updateSound/removeSounds/isSoundMissing`, and
  `loadSound(id) → AudioBuffer` via `THREE.AudioLoader` (cache + `_resolve` base-url like
  the other loaders).
- `src/App.tsx` — boot `initAudio()` → emit `sounds:loaded`; `sounds` React state;
  `handleSoundsReload()`; `audioDir` FSA handle state (persist via `fileHandleStore`);
  construct `AudioSystem` next to `PreviewController` (~`:250`) and register
  `scene.onUpdate(dt => audio.update(dt))`; delete/edit flows mirroring model delete
  (`:1734`).
- `src/runtime/RuntimeApp.tsx` — construct `AudioSystem` + `scene.onUpdate` in the runtime
  root (~`:79-90`); `initAudio()` in its boot path.

**World state / scripting:**
- `src/world/WorldState.ts` — `audio` in config defaults; serialize in `toJSON`/
  `loadFromJSON`; add `updateWorldAudio(patch)` emitting `world:audio` (non-journaled,
  copy of `updateWorldLighting` at `:495`).
- `src/scripting/ScriptEngine.ts` — in `_dispatch` (`:227`): keep `play_sound`; add
  `stop_sound` (`audio:stop`), `play_music` (`music:play`), `stop_music` (`music:stop`).
  Positional `play_sound` targeting an object/group resolves position via the existing
  `_resolveTargets` + `_resolveObjectPose` (`:449`, `:432`).

**Editor UI:**
- `src/ui/ScriptPanel.tsx` — add the three actions to `ACTION_TYPES` (`:139`); replace the
  `play_sound` free-text (`:1776`) with `SoundPicker`; add `play_music`/`stop_sound`/
  `stop_music` param editors.
- `src/ui/PropertiesPanel.tsx` — (a) a new `"audio"` `ScreenId` (`:162`) rendering an
  `AudioMixerSection` cloned from `WorldLightSection` (`:5018`): master/music/sfx/ambient
  sliders + ambient/music `SoundPicker`s, backed by `updateWorldAudio` → `world:audio`;
  reached from `ToolView` like `onOpenLights` (`:554`). (b) a **Sound** section in the
  object inspector (SoundPicker + loop/volume/radius) writing `selected.sound` via
  `WorldState.updateObject`.
- `src/types.ts` — `LeftPanelId` (`:54`) gains `'audio'`; `src/ui/LeftPanel.tsx` +
  `src/ui/Toolbar.tsx` register the AudioBrowser panel + a toolbar button (icons in
  `src/ui/icons.tsx`).

**Player controls:**
- `src/ui/PauseMenu.tsx` — add master/music/sfx/ambient sliders under Resume/Exit,
  reading/writing `localStorage` (`audio_mix`) and calling `audio.setPlayerMix` (via a
  bus event so RuntimeApp's AudioSystem gets it too). AudioSystem loads the stored player
  mix on `activate()`.

---

## Verification

Regression gates first: `npm run typecheck` → 0 errors; vite-plugin-checker overlay clean;
FPS counter steady (TESTING.md §7 — no per-frame allocs/raycasts in `AudioSystem.update`).

**Persistence safety (CLAUDE.md §5 + memory):** before any browser test that opens a
project, `git status` must be clean under `public/games/**` — commit first. Commit again
after the editor writes. Snapshot/restore `worldeditor_autosave` per TESTING.md §3.

End-to-end (Chrome-MCP golden path, TESTING.md §3 — reuse the 7373 tab, tag the title):
1. **Manifest/import** — seed `public/assets/audio/manifest.json` with 2–3 CC0 clips
   (music/ambient/sfx). Confirm `assetManager.getSoundList()` returns them after boot and
   the AudioBrowser lists them with working ▶ preview. Exercise the importer via the OPFS
   directory-handle stub (TESTING.md §9) — assert the manifest is dedupe-spliced and the
   file copied.
2. **Ambient + music** — set `world.audio.ambient`/`.music` via the editor Audio screen;
   enter preview (real Play button = the gesture that resumes the AudioContext); assert an
   `AudioContext` in `running` state and active `THREE.Audio` sources on the listener; exit
   preview → assert all stopped and listener detached (no leaked sources across
   enter/exit cycles).
3. **Spatial** — attach a `.sound` (loop) to an object; enter preview; walk toward/away
   (or `character:teleport`) and read the `PositionalAudio` gain/panner — attenuates with
   distance. Add/move/delete the object in preview → emitter attaches/follows/detaches.
4. **Script/trigger** — author `on_player_enter → play_music` on a trigger volume;
   `__test.enterGame()` + walk in → music starts; `stop_music` → stops. Also
   `__test.runAction({ type:'play_sound', sound:'sfx_x' })`.
5. **Mixer** — move authored sliders (Audio screen) → live gain change on playing sounds.
   Move PauseMenu player sliders → multiplies over authored, persists across reload
   (`localStorage.audio_mix`).
6. **Runtime shell** — `runtime.html?manifest=/games/pj-fixture/manifest.json`; confirm
   `AudioSystem` boots and plays there too (both roots wired).

## Docs & artifacts (per memory conventions)
- `test-plans/phase-36-audio.md` — acceptance checklist, committed.
- `WORLD_EDITOR_ARCHITECTURE.md` — add a **Phase 36 — Audio** section AND update the
  file-level sections it touches (AssetManager, WorldConfig/data model, EventBus table,
  ScriptEngine action table, PropertiesPanel, PreviewController), per the arch-doc-update
  rule. Move the `play_sound` stub row (`:5864`) to "implemented".
- Do **not** pin a target `vX.Y.Z` in any doc (parallel sessions race versions).
