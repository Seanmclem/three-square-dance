# Audio — Reference

Everything the audio system does: a sound library, ambient + music, spatial/positional
audio, character locomotion sounds, script/trigger sound actions, and a volume mixer.
Written for humans clicking through the UI; the engine-level details live in
`WORLD_EDITOR_ARCHITECTURE.md` (Phase 36, v4.30.x). Click-by-click walkthroughs:
`HUMAN_TESTING.md` → "Workflow: sound & music".

> **Two rules that trip everyone up:**
> - Audio only plays in **Preview / Play**, never while editing.
> - Browsers block sound until a real click — pressing **▶ Preview** *is* that click. Set
>   everything up but hear nothing? Make sure you clicked Preview (a page reload alone
>   won't start audio).

---

## 1. The sound library

- Sounds live in `public/assets/audio/manifest.json` (`SoundDef` entries: id, label,
  category, path, `loop`/`volume`/`spatial` flags, tags), loaded by
  `AssetManager.initAudio()`. Three synthetic CC0 fixtures ship for testing: `music_test`,
  `ambient_test`, `blip_test`.
- **SOUNDS panel** (bottom-left toolbar, speaker icon): browse, ▶-preview, and **Manage →
  Edit / Delete**. **+ Import Sound** copies `.mp3` / `.wav` / `.ogg` files into
  `assets/audio` and appends to the manifest. The import metadata step matches the model
  importer: a **Set all to** category row (including **New category…**), per-sound category
  dropdowns with their own **New…** option, a **Tags** field applied to the whole batch,
  and per-sound `loop` / `spatial` checkboxes. Search in the panel matches labels *and* tags.
- Categories default to `SFX` / `Music` / `Ambient` but are free-form — a custom category
  (e.g. `Cave`) gets its own filter pill in the panel. The category picks which **mixer
  bus** a sound feeds (`Music`→music, `Ambient`→ambient, anything else→`sfx`), except scene
  music/ambient which are forced onto their named buses.
- **Metadata & attribution.** On import you can fill an **ATTRIBUTION** block (author,
  source / kit name + URL, patreon, license) — applied to every sound in the batch, same as
  models/materials — with an **AUTOFILL FROM LIBRARY** picker that pre-fills from packs /
  authors already attributed anywhere in the library (models included). **Manage → Edit**
  re-opens a dialog to rename, recategorize (existing + New…), retag, or change attribution
  on existing sounds (single or multi-select; bulk edits union tags in and only write the
  fields you tick "apply" on). Any sound with attribution is listed automatically in the
  **Credits** modal (Properties panel → CREDITS), grouped by author / pack with license
  badges and counts.

## 2. Scene ambient + background music

Deselect everything → Properties **Audio** row. The Audio screen is a menu of four
sub-pages — **Mixer**, **Background Music**, **Ambient**, **Character Sounds** — each row
showing a live summary (current track / playlist size / bus levels). Music and ambient are
saved per-scene in `WorldConfig.audio`; they start on Preview/Play and loop. Across levels,
`load_scene` loads the next scene's own `audio` fresh.

### Playlists (Phase 64) — composed clip sequences

Each slot has a **SINGLE ⇄ PLAYLIST** switch. Playlist mode is a script-actions-style
list: clip rows (sound picker + per-clip volume 0–1) and **SILENCE** rows (a gap of N
seconds), reordered one step at a time with ▲▼, removed with ✕, extended with
`+ clip` / `+ silence`. The sequence plays one entry at a time, in authored order, with
hard cuts — silence entries are the spacing tool. **LOOP** on repeats the whole
sequence; off plays it once per scene entry and then stays silent until the scene
reloads. Layer soundscapes by giving music AND ambient each their own playlist (they
run simultaneously on their own buses). All clips preload at scene start, so nothing
fetches or decodes mid-gameplay. A script `play_music` / `stop_music` takes the music
channel over from a running playlist. The demo: platfrom-obby's level_1 background
music is a 3-entry playlist (sax jingle → 2s silence → steel jingle at 0.5).

## 3. Positional / spatial audio (attached emitters)

A looping 3D sound anchored to an entity, attenuating with distance. Lives on the three
**movable** entity types — **objects, platforms, shapes** (the same set that supports
`mover`). Select one → Properties **Sound** drilldown → pick a sound, set loop / volume /
ref distance / max distance.

- The emitter is parented to the entity's mesh, so **a sound on a moving platform/shape
  rides its mover** (an engine hum on a lift, a whoosh on a spinning hazard).
- Static geometry (walls, floors, stairs) has no sound field — use a trigger + `play_sound`
  there instead.

## 4. Character locomotion sounds (footsteps / jump / land)

The player makes its own noise. Deselect everything → Properties **Audio** row →
**CHARACTER SOUNDS**: pick a **Footstep**, **Jump**, and/or **Land** sound, and a **Stride
Length** (metres between footsteps, default 1.8). Stored in `PlayerSettings`.

- Footsteps fire every stride-length of *actual* horizontal travel while grounded + moving
  (nothing in the air, standing still, or pushed against a wall).
- Jump fires on takeoff; land fires on touchdown. Both are **physics-driven** — they work
  even if the character has no animated model, and the land sound is gated on air-time so
  walking bumps never false-trigger it.
- These play on the **SFX** bus.

### Swapping the footstep sound at runtime (surfaces: wood → gravel)

The **`set_footstep`** script action overrides the live footstep sound. Empty = revert to
the authored default. The canonical pattern is a surface zone:

1. **Trigger** tool → draw a trigger volume over the gravel patch.
2. SCRIPTS → SELECTED → **+ New**, trigger `on_player_enter`, action **`set_footstep`** →
   pick the gravel sound.
3. **+ New**, trigger `on_player_exit`, action **`set_footstep`** → leave the sound
   **empty** (reverts to the authored default — the "wood").

Now walking onto the patch swaps footsteps to gravel; walking off reverts. The override is
runtime-only and resets when Preview restarts. (Only footsteps swap today; jump/land don't
have a per-surface override yet — easy to add if needed.)

## 5. Script / trigger sound actions

Author these like any script action (see `HUMAN_TESTING.md` → scripting). All are
runtime-only.

| Action | Does |
|---|---|
| `play_sound` | one-shot; set a **Target** object to play it **at** that position (spatial), else a flat one-shot |
| `stop_sound` | stop live one-shots of a sound id |
| `play_music` | start / swap the background music, optional crossfade (fade seconds) |
| `stop_music` | stop the music, optional fade-out |
| `set_footstep` | override the player's footstep sound; empty = revert (see §4) |

## 6. Volume mixer

Four gain buses: **Master / Music / SFX / Ambient**.

- **Authored levels** (per scene): the four sliders on the **Audio** screen — the baseline
  saved with the level.
- **Player levels** (the player's own preference): in **Preview / Play**, press **Enter**
  to open the **Pause** menu; its Master/Music/SFX/Ambient sliders persist to the browser
  (`localStorage`) and multiply *on top of* the authored levels.

---

## Not built yet: combat / death audio

There is **no player health, damage, or combat system**, so there are no built-in hit /
death sounds and no events to hang them on:

- **No damage source** — nothing reduces the player's health on its own (no enemies,
  projectiles, hazards, or attack input).
- **`on_health_zero` is a stub that never fires** — it's listed as a trigger but nothing in
  the engine ever raises it (the unbuilt "Phase 13" NPC/enemy system).
- **No attack/fight action** for the player, and **no built-in hit/death animation
  convention** (`play_animation` plays whatever clip name a model happens to ship).

**You can still script hit/death *reactions* today**, you just have to author the "damage"
yourself out of existing pieces:

- `health` is a real gameplay-state key (defaults to 100). A hazard trigger volume can do
  `adjust_number health −25` + `play_sound hit`.
- `on_state_changed` (on `health`) + a `compare_number health <= 0` condition → run
  `play_animation death` (with **animationHold** to freeze on the death pose) + a death
  `play_sound`.

What's missing is the combat *system* that would drive those automatically. Once real
`on_hit` / `on_death` events exist, wiring sounds to them is trivial — the same
`play_sound` pattern used everywhere above.
