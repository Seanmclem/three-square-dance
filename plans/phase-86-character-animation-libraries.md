# Phase 86 · Character models and animation libraries

> Status: **PLANNED** (2026-10-03). Not built. Open questions at the end.

Today a character's animations are whatever clips are inside its own model file, picked
by a name guess or by hand, separately for the player, each enemy and each script. That
breaks down with packs like Quaternius's **Universal Animation Library 2** (CC0): one file
holds 134 clips, and the **female mannequin** that goes with it has no clips at all,
because both mannequins share one skeleton and are meant to share the animations.

This phase lets a model **borrow clips from other files that use the same skeleton**
("animation libraries"), gives character models a **character setup** saved with the
model (its libraries, which clip plays for idle / walk / jump and so on, and keeping
clips in place), and makes the automatic clip choice much better.

---

## 1. What the files actually contain (checked 2026-10-03)

| File | Skeleton | Clips | Height |
|---|---|---|---|
| `UAL2.glb` (Unreal-Godot folder, 21 MB) | 65 bones: `root`, `pelvis`, `spine_01` to `spine_03`, `Head`, `hand_l`, `foot_r` … | 134 (`Walk_Fwd_Loop`, `NinjaJump_Start`, `Zombie_Bite`, `Sword_Light_A` …) | 1.83 m |
| `UAL2_RM.glb` | same | the same 134, with root motion baked in (the body travels) | 1.83 m |
| `Mannequin_F.glb` (1.4 MB) | the same 65 bone names | **0** | 1.81 m |
| our `character.gltf` (the obby's player) | 29 bones: `Torso`, `Abdomen`, `Foot.L`, `Ear1.L` … | 19 (`Idle`, `Jump`, `Jump_Idle` …) | about 1.8 m after its 0.48 scale fix |

What follows from that:

- Clips from `UAL2.glb` play on `Mannequin_F.glb` with **no conversion**: three.js plays
  a clip by bone name, and the names match exactly.
- They do **not** play on our current `character.gltf`: different skeleton, different
  names. Making them fit (retargeting between different skeletons) is a separate, much
  harder problem; out of this phase (§8).
- Both mannequins are already about the same height as our current character, so no
  rescaling is needed.
- UAL2 is the **second** pack: no plain idle, run or jump. The first Universal Animation
  Library is the likely place for those; it isn't downloaded, so its clips and skeleton
  are unchecked.

## 2. Current state

| Piece | Today | This phase |
|---|---|---|
| Model import (`ModelImporterModal`) | Saves the clip NAMES in the manifest (`AssetDef.animations`), tags "animated" | Also saves the skeleton: its bone names (and a short id made from them) and the model's height |
| Player (`CharacterController._loadModel`) | Clips = the model file's own (`gltf.animations`); slot → clip by `animClips` override or a name guess (`_clipFor`: exact, then "contains") | Clips = own + the model's libraries; Auto = the model's character setup, then a better guess |
| Enemies / placed objects (`ObjectPlacer._setupMixer`) | Own clips only; enemy `idleClip` / `walkClip` / `attackClip`, `autoPlayAnimation`, script `play_animation` by name | Same clip list as the player gets (own + libraries) |
| Slot pickers (player Character page, enemy AI screen, Animations tab) | A plain dropdown of the model's own clip names | Own + library clips, grouped by file |
| Root motion | Not handled; an `_RM` clip would drag the body away from the capsule | Kept in place by default (§5) |
| Game export (`exportGameBundle`) | Copies the assets the scenes reference | Also copies each used model's library files |

## 3. Design: animation libraries

- **A library is just a model asset with clips.** No new asset kind: `UAL2.glb` imports
  like any model (it even contains the male mannequin, so it can be placed too). A file
  with clips and no mesh must also import; check the importer and thumbnail for that.
- **Same skeleton = compatible.** At import, a skinned model records
  `rig: { id, bones: string[], height }` (`id` = a short hash of the sorted bone names).
  Libraries offered for a model are the assets with the same `id`; a library whose
  animated bones mostly exist in the model (90% or more) is offered with a note naming
  the missing bones. Existing models get the field from a one-off backfill.
- **Loaded once, shared.** A library file is parsed once per session; its clips are
  shared by every character and enemy that uses it (an `AnimationClip` can drive any
  number of mixers). Clip names that clash between files get the file's name in front
  in the lists ("UAL1 · Idle_Loop").

## 4. Design: the character setup (saved with the model)

A model in the Assets panel, Manage mode, gets a **CHARACTER** card (where the re-origin
tool lives):

```
 CHARACTER                      Mannequin_F · 65 bones · 1.81 m
 CLIPS FROM   [x] its own (0)
              [x] UAL2 (134)        same skeleton
              [ ] UAL1              same skeleton
              [+ add a file]
 IN PLACE     [x] keep clips in place (remove root travel)
 SLOTS        IDLE       [Idle_Loop         v]   ▶
              WALK       [Walk_Loop         v]   ▶
              RUN        [Sprint_Loop       v]   ▶
              JUMP       [Jump_Start        v]   ▶
              IN AIR     [Jump_Loop         v]   ▶
              LAND       [Jump_Land         v]   ▶
              CLIMB      [(none)            v]
              ATTACK     [Sword_Light_A     v]   (enemies)
```

- (Clip names in the sketch are examples; UAL1 isn't in the repo yet, so its real names
  are checked when it's imported.)
- Saved on the asset (`AssetDef.character = { clipSources, inPlace, slots }`), so the
  setup is done **once per model** and applies wherever it's used: as the player in any
  game, as an enemy, as a placed prop.
- The player's Character page and the enemy AI screen keep their per-use overrides.
  Their "Auto" now means "the model's setup, else the name guess", and shows which clip
  that is, as today.
- ▶ plays the clip on the model in a small preview, so picking among 134 names isn't
  guesswork (could move to a later phase, question 3).

## 5. Design: keeping clips in place

- A clip "travels" when its root bone (or the pelvis, when the root has no motion)
  moves more than 0.2 m sideways from its first frame to its last.
- With IN PLACE on (the default), the sideways part of that track is pinned to its first
  frame when the clip is loaded; height stays, so jumps and crouches still read. The
  engine moves the character; the clip only animates the body.
- The list marks clips that travel, so a user who picked `UAL2_RM.glb` can see why.

## 6. Design: a better automatic pick

The guess today takes the first clip whose name contains the slot word, which on UAL2
gives `Fish_Cast_Idle_Loop` for idle and `Walk_Bwd_L_Loop` for walk. Instead, score every
clip:

- split names into words (`Walk_Fwd_Loop` → walk, fwd, loop); a slot's words and
  synonyms must match a whole word (run: run / jog / sprint; in air: jump loop / fall /
  air; land: land);
- prefer `loop` for looping slots, `start` for JUMP;
- push down sideways and backward variants (`bwd`, `l`, `r`, `left`, `right`) and clips
  tied to a prop or style (`sword`, `shield`, `bow`, `gun`, `carry`, `lantern`,
  `zombie`, `fish`, `farm` …) unless the slot asks for one;
- ties go to the shorter name.

Tested on the real lists in the repo (`character`, `crab`, the animals) so nothing that
picks correctly today changes, and on UAL1 / UAL2.

## 7. Implementation order (each step → verify)

1. Import records `rig` (bones, id, height); backfill existing models → check the
   values for `UAL2.glb`, `Mannequin_F.glb`, `character.gltf`.
2. Clip resolver (own + libraries, shared cache, IN PLACE) used by the player, enemies,
   placed objects, scripts and the Animations tab → test harness: `Mannequin_F` as the
   player walking and jumping on UAL clips; a mannequin enemy with the zombie clips.
3. Better automatic pick → a script over the real clip lists (old picks kept, UAL picks
   sensible).
4. CHARACTER card in Manage mode (+ slot pickers grouped by file) → harness, real clicks.
5. Game export copies library files → export a game whose player borrows clips, run it.
6. CHARACTER_GUIDE, test plan, architecture doc.

## 8. Not in this phase

- **Different skeletons** (UAL clips on our current `character.gltf`): needs a bone map
  (`Torso` ↔ `spine_02` …) plus pose correction; results are often off. A later phase if
  wanted, and only after same-skeleton sharing works.
- **More gameplay slots** (hit, death, a separate fall): the engine would need moments to
  play them; see question 2.
- **Trimming unused clips** from a published game (UAL2 is 21 MB, mostly clips).

## 9. Open questions

1. **Where the setup lives:** on the model, so it applies in every game (recommended,
   above), or as a per-game "character" item (model + libraries + slots), more like a
   prefab?
2. **Extra slots now?** HIT (when damaged), DEATH, a separate FALL (walking off a ledge,
   not a jump)? Each needs the engine to know when to play it.
3. **Clip preview (▶)** in this phase, or a plain list first?
4. **UAL1:** can you download it (if it has the plain idle / run / jump set on the same
   skeleton, it's the natural default)? UAL2 alone gives a usable but odd set
   (folded-arms idle, ninja jump).
5. **The obby's player:** keep `character.gltf`, or switch to a mannequin once this works?
