# Phase 64 — Music/ambient playlists (composed clip sequences)

> User ask (2026-08-19, grilled): background music and ambient currently play
> as ONE file each. Wanted: a composed-sequence editor per slot — a reorderable
> list of short clips and configurable silence gaps, "like a list of actions on
> a script", ▲▼ one-step reordering (no drag), the whole sequence looping as
> configured — so ambient soundscapes / music rotations are built from small
> files instead of one long pre-mixed track. Constraint: performant during
> gameplay. Grill decisions: inline per-slot (not named assets); one clip at a
> time per channel (layering = music + ambient channels each with a playlist);
> hard cuts (silence entries are the spacing tool); loop on/off only, authored
> order; per-entry volume; runs continuously within a session, scene load
> restarts; loop-off ends silent until reload; slot UI is a Single track ⇄
> Playlist mode switch; per-entry ▶ preview only. V2 (explicitly out): crossfade,
> shuffle, script actions targeting playlists, whole-sequence editor preview,
> save-file position persistence.

## Data (types.ts)

`WorldAudio`'s two slots each gain an optional playlist alternative — the slot
holds EITHER `soundId` (today's shape, untouched) OR `playlist`:

```ts
export interface PlaylistEntry {
  soundId?: string;   // clip entry (volume applies)
  volume?:  number;   // 0..1 per-entry gain (default: SoundDef.volume ?? 1)
  silence?: number;   // silence entry: gap seconds (soundId absent)
}
export interface AudioPlaylist { entries: PlaylistEntry[]; loop?: boolean }  // loop default true
// WorldAudio.music / .ambient: { soundId?: string; volume?: number; loop?: boolean; playlist?: AudioPlaylist }
```

## Runtime (AudioSystem)

- `activate()`: a slot with `playlist.entries.length` starts the sequencer on
  that channel instead of `_playMusic`/`_playAmbient`; ALL clip buffers in both
  playlists are preloaded (`assetManager.loadSound`, already permanently
  cached) so gameplay never fetches/decodes mid-sequence.
- Sequencer state per channel `{ entries, loop, idx, silenceLeft, sound }`,
  ticked from the existing `update(dt)` (already registered in both shells).
  Silence entries are dt-counted timers — the engine's only clip-end signal
  (`onEnded`) self-destructs the node, so gaps are never fake audio. Clip
  entries play non-looping through the channel's normal bus/mix path with the
  per-entry volume; `onEnded` advances. Loop wraps; loop-off parks the channel
  silent. Missing/deleted clips warn once and are skipped; a full pass that
  starts nothing stops (no spin).
- `deactivate()` clears sequencer state (scene load restarts — existing
  behavior). `music:play`/`music:stop` (script actions) kill the music
  sequencer before acting — scripts win, no fighting over the channel.
- `_reconcileAuthored` (live editor re-authoring): playlist JSON changed →
  restart that channel's sequencer.

## Editor UI (PropertiesPanel `AudioMixerSection`)

Each slot: Single track ⇄ Playlist mode switch. Playlist mode = script-action-
list style editor shared by both slots: clip rows (SoundPicker with its ▶ +
volume field) and silence rows (seconds field), ▲▼ one-step reorder, ✕ remove,
`+ clip` / `+ silence`, LOOP checkbox. House palette rungs.

## Export

`src/export/assetRefs.ts` collects every playlist `soundId` (music + ambient)
so published games ship the clips.

## Files touched

`src/types.ts`, `src/audio/AudioSystem.ts`, `src/ui/PropertiesPanel.tsx`,
`src/export/assetRefs.ts`, `AUDIO.md`, arch doc changelog + file sections.

## Verification

- `npm run typecheck`.
- Browser (shell tab): author a small jingle playlist through the REAL Audio
  screen UI (mode switch, + clip, + silence, reorder, volume) — scene JSON
  gains the right shape; single-file scenes byte-identical.
- Preview: sequencer starts entry 0, silence gaps advance under manual
  `update(dt)` stepping, clip end advances via real-time play, loop wraps,
  loop-off ends silent; per-entry volume audible in the mix math
  (inspectable via the sound's gain); `music:play` script action stops the
  music sequencer.
- Export scan includes playlist ids (unit-check via the collector on a test
  world object).
- Commit `public/games/**` before/after the authoring session.
