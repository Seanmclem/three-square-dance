# Phase 36 — Audio System — Test Plan

Music, ambient, positional/spatial audio, sound-asset manifest, and a 4-bus mixer
(master/music/sfx/ambient) with authored + player levels.

## What shipped

- **Manifest + loader** — `public/assets/audio/manifest.json` (`{ version, sounds: SoundDef[] }`);
  `AssetManager.initAudio()` / `getSoundList()` / `getSoundDef()` / `updateSound()` /
  `removeSounds()` / `loadSound()` (decode → cached `AudioBuffer` via `THREE.AudioLoader`).
  Three synthetic CC0 fixtures ship: `music_test`, `ambient_test`, `blip_test`.
- **AudioSystem** (`src/audio/AudioSystem.ts`) — the consumer for `audio:play` / `audio:stop`
  / `music:play` / `music:stop` / `world:audio` / `audio:player-mix`, plus object
  lifecycle events. `THREE.AudioListener` rides the active render camera; plays only
  between `preview:start` and `preview:stop`. Constructed in **both** roots (`App.tsx`,
  `RuntimeApp.tsx`).
- **Data model** — `WorldConfig.audio` (scene ambient/music + authored `mix`),
  `WorldObject.sound` (spatial emitter), `WorldState.updateWorldAudio()`.
- **Script actions** — `play_sound` (positional when it has a target), `stop_sound`,
  `play_music`, `stop_music`.
- **Editor UI** — SOUNDS toolbar panel (`AudioBrowser` + `AudioImporterModal`),
  `SoundPicker`, Properties **Audio** mixer screen, object **Sound** drilldown.
- **Player controls** — PauseMenu master/music/sfx/ambient sliders → `localStorage`
  (`audio_mix`) → `audio:player-mix`.

## Regression gates

- `npm run typecheck` → 0 errors. ✅
- `npm run build` → succeeds. ✅
- No audio-related console errors on load / preview / exit. ✅ (only unrelated
  pointer-lock `WrongDocumentError` from automated preview — a harness artifact.)

## Acceptance checks (verified 2026-07-15 in the editor tab)

Setup: `assetManager.getSoundList()` → 3 sounds (music/ambient/sfx). Authored via
`__world.updateWorldAudio({ music, ambient, mix })`.

| # | Check | Expected | Result |
|---|---|---|---|
| 1 | Manifest loads | `getSoundList()` = 3 entries with category/loop/spatial | ✅ |
| 2 | Enter preview | `__audio._active` true, listener added to `activeRenderCamera` | ✅ |
| 3 | Ambient + music start | 2 `THREE.Audio` on scene, buffers loaded, `isPlaying`, buses `music`/`ambient` | ✅ |
| 4 | **Gesture → context** | after real Play-button click, `context.state === "running"` and gains converge to authored `music 0.8`, `ambient 0.6` | ✅ |
| 5 | Player-mix live | `setPlayerMix({music:0.5})` → music gain `0.3` (= base·authored·player), ambient unchanged | ✅ |
| 6 | `music:play` swap | emitting `music:play` stops the old track, starts the new one (count stays 2) | ✅ |
| 7 | `music:stop` | `_musicId` → null, track removed | ✅ |
| 8 | Positional one-shot | `audio:play` with `position` creates a `PositionalAudio`; a non-loop one auto-cleans on end | ✅ |
| 9 | Object emitter | `updateObject({ sound })` attaches a `PositionalAudio` **parented to the object mesh**, `refDistance`/`maxDistance` applied, gain = base·buses | ✅ |
| 9b | Platform/shape emitter (v4.30.1) | `updatePlatform`/`updateShape` `{ sound }` attaches a `PositionalAudio` parented to the platform/shape mesh; **rides the mover** — demo ferry emitter world-pos tracks the slide (−5.369→−4.771 X) and stays locked to the mesh; **Sound** drilldown shows on both inspectors | ✅ |
| 9c | Character locomotion audio (v4.30.2) | `PlayerSettings` footstep/jump/land sounds emit SFX-bus one-shots. Deterministic frame-stepping: **footsteps** 4 over 6.9 m (1.5 m stride); **0 false lands while walking** (air-time gate); **jump** + **land** each fire once per hop; both work with no animated model (physics-based land). CHARACTER SOUNDS section renders on the Audio screen | ✅ |
| 9d | Runtime footstep swap (v4.30.3) | `set_footstep` action overrides the live footstep sound; empty reverts. Through the real dispatch (`__test.runAction`): default `blip_test`×4 → `set_footstep music_test` → `music_test`×4 → `set_footstep` (empty) → `blip_test`×4. `on_player_enter`/`exit` surface-zone pattern | ✅ |
| 10 | Teardown | `exitPreview()` → `_active` false, `_all.size` 0, listener detached (no leaks across enter/exit) | ✅ |
| 11 | Editor UI present | SOUNDS toolbar panel + Properties "Audio · mixer · ambient · music" row render | ✅ |

## Notes / gotchas

- **Suspended-context artifact.** `THREE.Audio.setVolume` uses `setTargetAtTime`, which
  is frozen while the `AudioContext` is `suspended` (autoplay policy) — so `gain.value`
  reads its default `1` until a real user gesture resumes the context. Do **not**
  `await context.resume()` from automation (it never resolves without a gesture and hangs
  the CDP eval). Enter preview via the real Play button, then read gains.
- The mixer bus for a sound is derived from its `SoundDef.category`
  (`Music`→music, `Ambient`→ambient, else `sfx`); scene music/ambient are forced onto
  their named buses.

## Not covered / future

- Metadata editing of existing sounds (only import + delete today; models/materials have
  an edit dialog).
- Occlusion mode attaches the listener to the rendered vantage, not the logic camera.

### Units of audio change (avoid the "zone" trap)

There is **no working multi-zone / sub-room concept** in the current engine — every
scene is a single zone, zone creation is dead code, and there is no zone-transition
system (see the "zones" disclaimer in `WORLD_EDITOR_ARCHITECTURE.md`). So the real
places audio changes are:

- **Across levels** — the `load_scene` action routes to another scene via the runtime
  `SceneRouter`; the new scene's `WorldConfig.audio` (ambient/music/mix) loads fresh.
- **Within a level** — trigger volumes + scripts (`play_music` / `play_sound` /
  `stop_music`) and per-object `sound` emitters. That's the whole toolkit; there are no
  sub-zones to crossfade between.
