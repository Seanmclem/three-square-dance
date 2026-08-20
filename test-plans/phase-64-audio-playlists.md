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
