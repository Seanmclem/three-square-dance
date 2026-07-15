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
  category `Music`/`Ambient`/`SFX`, path, `loop`/`volume`/`spatial` flags), loaded by
  `AssetManager.initAudio()`. Three synthetic CC0 fixtures ship for testing: `music_test`,
  `ambient_test`, `blip_test`.
- **SOUNDS panel** (bottom-left toolbar, speaker icon): browse, ▶-preview, and **Manage →
  Delete**. **+ Import Sound** copies `.mp3` / `.wav` / `.ogg` files into `assets/audio`
  and appends to the manifest.
- The category picks which **mixer bus** a sound feeds (`Music`→music, `Ambient`→ambient,
  else `sfx`), except scene music/ambient which are forced onto their named buses.

## 2. Scene ambient + background music

Deselect everything → Properties **Audio** row → pick a **Background Music** track and an
**Ambient Loop**. Saved per-scene in `WorldConfig.audio`; they start on Preview/Play and
loop. Across levels, `load_scene` loads the next scene's own `audio` fresh.

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
