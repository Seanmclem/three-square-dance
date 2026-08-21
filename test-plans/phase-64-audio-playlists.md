# Phase 64 — Music/ambient playlists (acceptance)

Verified 2026-08-19 against `plans/phase-64-audio-playlists.md`, in a shell tab
on platfrom-obby through the real Audio-screen UI plus manual sequencer probes
(`__audio._playlists`, `__audio.update(dt)`).

## Authoring (real UI path)

- [x] Both slots show a SINGLE ⇄ PLAYLIST mode switch (4 mode buttons total);
      flipping BACKGROUND MUSIC to PLAYLIST writes
      `{ playlist: { entries: [], loop: true } }` and shows the empty-state hint.
- [x] `+ clip` ×2 with picker selections + `+ silence` builds
      `[{sax00}, {steel03}, {silence: 2}]`; ▲ on the silence row reorders to
      `[{sax00}, {silence: 2}, {steel03}]`; the volume field writes
      `volume: 0.5` on the steel clip. Screenshot: numbered rows, per-row
      ▶/volume/▲▼/✕, + clip / + silence, LOOP checked; AMBIENT stays SINGLE.
- [x] Save button persists `world.audio.music.playlist` to level_1.json
      (world-audio edits are autosave-carried and reach disk on Save — same
      pre-existing behavior as the single-track picker).

## Runtime sequencer

- [x] Preview start: entry 0 (`jingles_sax00`) playing on the music channel,
      per-entry base gain 1.
- [x] Clip 1 end → enters the 2s silence gap (idx 1, silenceLeft 2.0);
      `update(1.0)` counts to 1.0; crossing zero starts entry 2
      (`jingles_steel03`) with **base 0.5** — per-entry volume flows into the
      normal bus/mix gain math.
- [x] Loop ON: last entry's end wraps to entry 0.
- [x] Loop OFF: sequence end parks it (`done: true`, channel null) — silent
      until scene reload.
- [x] Live re-authoring: unchanged JSON does NOT restart (reconcile compares
      authored JSON); a real change (loop toggled) restarts fresh from entry 0
      with the new config.
- [x] Script takeover: `music:play` kills the music playlist and plays its own
      track (`_musicId: "highup"`); `preview:stop` clears all sequencer state.
- [x] Preload: `_startPlaylist` fires `loadSound` for every clip id up front
      (permanently cached buffers — no mid-gameplay fetch/decode).

## Regression

- [x] `npm run typecheck` clean; single-track slots byte-identical in data and
      behavior (playlist code paths gate on `playlist.entries.length`).
- [x] Export scan (`assetRefs`) collects playlist entry soundIds for both slots.
- [x] Character-sound pickers untouched (a mis-targeted select during testing
      was caught and reverted before any commit).

## Left in the level (demo content)

platfrom-obby level_1 BACKGROUND MUSIC = the 3-entry demo playlist
(sax00 → 2s silence → steel03 @ 0.5, loop on). Edit or remove freely.

## Addendum (2026-08-19) — clip-advance bug: onEnded must be wired BEFORE play()

User report from real preview gameplay: the 2nd sound after the silence gap
never played. Root cause: THREE.Audio binds `onEnded` onto the WebAudio buffer
source AT `play()` time — the sequencer assigned its advance callback to the
`.onEnded` property AFTER play, so the real clip-end fired _makeSound's
original self-destruct instead and the sequence stalled with `st.sound`
pointing at a disposed sound. The original acceptance run masked it by
invoking `st.sound.onEnded()` (the property — i.e. the override itself)
instead of the source-bound callback. Fix: `_makeSound` takes an `onDone`
callback baked into the pre-play onEnded. Re-verified via the REAL wiring
(`st.sound.source.onended()` — the exact function WebAudio invokes):

| # | Check | Result |
|---|---|---|
| A1 | Real clip-end advances into the silence gap | ✅ idx 0 → 1, silenceLeft 2.0 |
| A2 | Silence ticks into clip 3 | ✅ steel03 playing |
| A3 | Real clip-end on the last entry wraps (loop on) | ✅ back to sax00 |

Lesson: when a system hands a callback to an engine, verify by firing the
engine's captured reference, not the property you assigned.

## Regression fix (2026-08-20, v4.79.7) — mode flips retain both sides

User report: PLAYLIST → SINGLE "kind of deleted the playlist down to a single
item. with no going back." It did — the slot held either `soundId` or
`playlist`, and `toSingle` kept only the first clip. Slots now hold both plus
`mode: "single" | "playlist"`; flips set the mode and preserve the inactive
representation (first flip into an empty mode still seeds from the other).
Runtime picks via `activePlaylist()` at both decision sites; absent mode =
legacy playlist-wins, so existing scenes are unaffected.

Verified in-browser with real button clicks on the Background Music page:

| Check | Result |
|---|---|
| SINGLE flip keeps the 3-entry demo playlist in data, seeds sax00 as the track | ✅ |
| Single track changed to steel09, then PLAYLIST → SINGLE round-trip | ✅ both sides untouched |
| Game entry, mode single | ✅ plays steel09, `_playlists` empty |
| Game entry, mode playlist | ✅ music sequencer running, `_musicId` null (sequencer owns the channel) |
| Menu summary respects mode | ✅ parked playlist reads as the track label |

The user's collapsed demo playlist (autosave had the 1-entry remnant) was
restored from the committed scene file — git as the safety net, working as
intended.

## Feature (2026-08-20, v4.79.9) — whole-sequence preview in the panel

The parked "whole-sequence editor preview" V2 item, shipped: **▶ preview** in
the playlist controls plays the composed sequence once (per-clip volumes, real
silence gaps, playing row highlighted, auto-stop), ⏹ stops. Plain editor-side
`HTMLAudioElement` — `AudioSystem` untouched, and `dist/assets/runtime-*.js`
verified to contain none of the code, per the constraint that exported games
carry no editor-preview audio.

Verified in a foreground Chrome tab on the demo playlist: row 1 (sax 0.39s) →
SILENCE highlighted ~2s → row 3 (steel ~2.5s) → auto-stop, button back to
▶ preview. Edits/mode-flips/row-▶ during preview all stop it (shared element +
token guard).

**Environment gotcha for future sessions:** Chrome defers media-element loading
in hidden tabs — play() never settles and no request is issued (loadstart →
stalled), which looks exactly like a stuck sequencer. Foreground the tab before
testing any editor audio (same family as the rAF pause noted in v4.79.5's run).

## Regression fix (2026-08-21, v4.79.10) — gapless panel preview

User report: the panel preview had 1–2s gaps between clips (none in gameplay).
Cause: the v4.79.9 preview swapped `src` on one `<audio>` element per entry —
a fetch+decode on every transition. Now `startSeq` preloads every clip via
`assetManager.loadSound` (gameplay's own buffer cache) and schedules all
sources up front on an editor-side AudioContext — sample-accurate cuts.

Verified on the reporting user's 5-clip, no-silence pizzi playlist: measured
row boundaries 0.60/0.61/1.36/0.61/1.21s vs afinfo clip durations
0.57/0.57/1.32/0.69/1.15s (150ms sampling), total 4.55s vs 4.38s theoretical —
no gaps. Bonus: buffer loads are plain fetches, so the hidden-tab
media-element deferral gotcha from v4.79.9 no longer applies to the sequence
preview (row-highlight timers still throttle in background tabs).
