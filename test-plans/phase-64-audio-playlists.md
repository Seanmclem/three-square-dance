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

## Feature (2026-08-25, v4.79.11) — multi-select `+ clip`

User request: check multiple clips in the ADD CLIPS modal and have them added
to the playlist in the order checked, on close.

Steps (all through the real UI, level_1 music playlist):

1. Background Music → PLAYLIST → `+ clip` → modal titled ADD CLIPS with an
   empty check box per row and a disabled `CHECK CLIPS TO ADD` footer button.
2. Check rows OUT of list order (HIT03, HIT00, HIT05) → badges read 1, 2, 3
   in pick order; footer reads `ADD 3 CLIPS`.
3. Uncheck HIT00 → HIT03 stays 1, HIT05 renumbers 3→2, footer `ADD 2 CLIPS`.
4. Re-check HIT00 (rejoins at 3) and click `ADD 3 CLIPS` → modal closes,
   playlist rows 4/5/6 are HIT03, HIT05, HIT00 — the check order, one undo step.
5. ✕ and overlay-click close paths commit the same way (shared `finish()`);
   with nothing checked every close path is a plain cancel.

Row-replacement (clicking a clip row's name) and all single sound fields still
use single-pick — one click picks and closes, no check boxes.

## Feature (2026-08-25, v4.79.12) — row duplicate + insert-at-position

User request: a duplicate option and an insert-here option on each playlist item.

1. Playlist row button cluster is now ▲ ▼ ⧉ ✕ (silence rows included). ⧉ on
   row 1 → an identical copy appears directly above (rows 1+2 match, rest shift
   down). One undo step.
2. A slim dashed `+ insert here` strip sits below every row. Clicking the one
   below row 2 opens the multi-select picker titled INSERT CLIPS; checking
   highUp then highDown and closing put them at rows 3 and 4 — at the insert
   point, in check order (verified via the overlay-click close path).
3. The strip below the last row appends — same result as `+ clip`.

## Polish (2026-08-25, v4.79.13) — row appear/disappear animation

1. Duplicate (⧉), + silence, ADD CLIPS, and INSERT CLIPS: the new row(s) fade
   in with a small slide-down (0.25s, `wb-row-in`).
2. ✕ delete: the row fades/shrinks out (0.15s, `wb-row-out`) and is removed
   from the data when the animation ends; a second ✕ during that window is
   ignored.
3. Verified with `document.getAnimations()`: wb-row-in active after ⧉,
   wb-row-out active while the row is still in the DOM, count drops after.

Probe gotcha (cost a playlist entry, restored from git): clicking two
state-coupled buttons in the same synchronous JS tick runs the second
handler against a stale render. Always `await` ≥50ms between programmatic
clicks and reads.

## Revision (2026-08-25, v4.79.14) — expand/collapse replaces the fade

User feedback: in a list of identical rows a fade is imperceptible — the
signal must be neighbours moving.

1. Add (⧉ / + silence / ADD CLIPS / INSERT CLIPS): the new row slot expands
   down from 0 height over 0.25s, pushing rows below it down.
2. Delete (✕): the row slot collapses up to 0 over 0.2s — rows below slide up
   the full distance before the data write; no residual seam (row spacing
   lives inside the animated wrapper, the list container has no gap).
3. Verified by seeking the animations (hidden-tab timelines freeze, so
   sample via `anim.currentTime = t`): grow 0/35/72/87/88 px, shrink
   88/53/18/4/0 px. Row counts and names net-zero after the probe.

Hidden-tab lore for future probes: CSS animation clocks pin at 0 and page
timers stretch to ~1s in background tabs — seek the Web Animations API
instead of sampling wall-clock, or test in the visible desktop shell.

## Tweak (2026-08-25, v4.79.15) — duplicate grows in BELOW the clicked row

⧉ now splices the copy at i+1 and animates that slot: the clicked card stays
put and the duplicate expands beneath it. (Before, the slot at the clicked
index animated, which with identical rows read as "the card above expanded".)
Check: click ⧉ on any row → the row itself doesn't move; a twin grows in
directly below it.

## Tweak (2026-08-25, v4.79.16) — toolbar at the top

The `+ clip / + silence / ▶ preview / LOOP` row now sits above the entry
list, directly under the SINGLE/PLAYLIST switch. `+ clip` / `+ silence`
still append at the end; positional adds remain the `+ insert here` strips.
Verified via screenshot against the live shell.

## Tweak (2026-08-25, v4.79.17) — insert silence between rows

The strip below each entry is now two buttons: `+ insert here` (multi-select
clip picker, as before) and `+ silence` (inserts a 2s SILENCE row right there,
no modal — adjust the seconds on the row afterwards). Both grow the new slot
in below the row.

## Feature (2026-08-26, v4.79.18) — volume boost >1 + character sound VOL

1. Attached emitter (object/platform/shape → Sound): VOLUME above 1 now
   actually boosts (was silently clamped to 1). Final gain caps at 4.
2. Character Sounds: FOOTSTEP / JUMP / LAND each gained a VOL field
   (empty = 1; >1 boosts, cap 4), passed through audio:play.
3. Probed on the live shell via _onPlay + setVolume capture: base 3 →
   1.5 applied (× the scene's 0.5 MUSIC mix), base 9 → 4 (cap), base 1 → 0.5.

Probe gotcha: THREE's getVolume() reads the setTargetAtTime ramp, which is
frozen while the AudioContext is suspended (hidden tab) — it reports 1
no matter what was set. Capture the setVolume argument instead.

## Fix (2026-08-26, v4.79.24) — positional play_sound falloff

Script play_sound with a target/"Play at" now uses the emitter falloff
(linear, ref 1 → max 20) instead of WebAudio's inverse default (~1/d, which
made positional one-shots ~4× quieter at the 3rd-person camera's distance).
Probe: panner reads linear/1/20 on a positional one-shot. Residual gap vs
the flat editor ▶ preview is the camera-as-listener distance — documented
in AUDIO.md §3.
