# Phase 86 · Characters: models, rigs and animation libraries, set up in a character editor

> Status: **PLANNED** (2026-10-03, revised after the user's answers). Not built. Built in
> three parts (A, B, C below), each shipped and tested on its own. Decisions at the end.
> Visual overview: the HTML page linked from the chat.

Today an animated model is treated like any other prop: its animations are whatever clips
are inside its own file, chosen by a name guess or by hand, separately for the player
(per game), for each enemy and for each script. That breaks down with packs like
Quaternius's **Universal Animation Library** 1 and 2 (CC0): two files with 120 and 134
clips, plus a **female mannequin** with no clips at all, all on one skeleton and meant to
be shared.

This phase is about the foundations: models, their skeletons (rigs) and their
animations. It makes a **character** its own saved thing, set up once in an isolated
**character editor** (like Edit Brush), and used by the player and by enemies. The
character doesn't know or care what uses it. NPC behaviour and a player attack come in
later phases on top of this.

---

## 1. What the files contain (checked 2026-10-03)

| File | Skeleton | Clips | Height |
|---|---|---|---|
| `UAL1.glb` (21 MB) | 65 bones: `root`, `pelvis`, `spine_01` to `spine_03`, `Head`, `hand_l`, `foot_r` … | 120: `Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop`, `Sprint_Loop`, `Jump_Start` / `_Loop` / `_Land`, `Climb_Up_Loop`, `Hit_Chest`, `Death01`, `Sitting_Idle_Loop`, `Dance_Loop` … | 1.83 m |
| `UAL2.glb` (21 MB) | **the same 65 bone names** | 134: `Walk_Fwd_Loop`, `NinjaJump_Start`, `Zombie_Bite`, `Sword_Light_A`, `Farm_Watering` … | 1.83 m |
| `Mannequin_F.glb` (1.4 MB) | **the same 65 bone names** | 0 | 1.81 m |
| `UAL1_RM.glb`, `UAL2_RM.glb` | same | same clips, but the `root` bone travels (Walk_Loop 1.3 m, Sprint_Loop 5.5 m per loop) | |
| our `character.gltf` (the obby's player) | 29 different bones: `Torso`, `Abdomen`, `Foot.L` … | 19: `Idle`, `Jump`, `Jump_Idle` … | about 1.8 m |

- Clips from either library play on either mannequin with **no conversion**: three.js
  plays a clip by bone name, and the names match exactly (checked: identical bone lists).
- They don't fit our current `character.gltf` (a different skeleton). That character keeps
  working with its own 19 clips; mapping clips between different skeletons is out of
  scope (§9).
- In the non-RM files the `root` bone stays put (0.00 m on Walk / Jog / Sprint); the pelvis
  still moves (0.35 m in `Jump_Start`), which is body motion and stays.

## 2. Words used in this plan

- **Model**: an imported 3D file (a body, a skeleton, maybe clips). Unchanged.
- **Animation file**: any imported file whose clips a character borrows (UAL1, UAL2). It's
  just a model with clips; no new import type.
- **Clip**: one animation in a file (`Walk_Loop`).
- **Character** (new, saved): *a model plus everything about how it moves*: which files its
  clips come from, which clip plays for each **move**, its size, keeping clips in place,
  and its colors. This is what the first plan called the "character setup". Made in the
  character editor; one model can have several characters (a mannequin "Hero" and a
  mannequin "Zombie").
- **Move**: a named moment the character can act out, with the clip that plays for it
  (and loop / speed). Some moves the engine plays by itself (idle when standing, walk when
  moving, land after a fall); you can add any others (wave, sit, cheer) for scripts.
  This replaces the fixed "slots".
- **Uses**: what drives a character in a game. In this phase: the **player** (the
  controls) and **enemies** (the existing enemy AI), plus scripts, which can play any move
  on either. A character is set up the same way whatever uses it.

## 3. Moves: modular instead of fixed slots

Each character has **one list of moves**. A move = `{ clip, loop, speed, blend }`. Every
move is available to whatever uses the character; scripts can play any of them. The only
difference between uses is which moves the engine plays **by itself**, because only those
have a moment in the game behind them:

| Move | Played automatically for the player | for an enemy |
|---|---|---|
| idle | standing still | waiting / lost the player |
| walk | moving | chasing, walking home |
| run | running (if the game has run on); falls back to walk | |
| jump · in air · land | takeoff · airborne · landing | |
| climb | on a ladder | |
| attack | (no player attack yet, see below) | biting / swinging |
| hit | taking damage (a health key goes down) | when damaged |
| death | before the respawn fade (`respawn_player`) | when defeated (stomped) |
| talk | while a dialogue is on screen (`dialogue:show` until `dialogue:closed`) | |
| *any name you add* | scripts | scripts |

- **Why the player has no automatic attack:** the engine has no player attack yet (no
  attack button, nothing that lands a hit on an enemy; enemies are beaten by stomping).
  The move can be set up and played by scripts now; an attack button that plays it and
  damages what's in front is a gameplay feature for a later phase.
- Player **death** and **talk** are new automatic moments: `respawn_player` plays death
  before it fades (if the character has one), and talk plays while a dialogue is open.

- The character editor has **no per-use views**: one moves list, and an empty move just
  has no clip. Where a character is used (the player settings, an enemy's AI screen), a
  note says if that use plays a move the character has no clip for ("attack has no
  clip").
- Engine code asks for a **move** ("walk"), never a clip name, so swapping a character's
  clips never touches the player code, the AI or scripts.
- Scripts: `play_animation` keeps working with clip names; a new **play move** action (and
  `play_animation` with a move name) plays the character's move, whatever clip it maps to.

## 4. Where characters are saved, and the obby's player

- Characters are saved **per game, like prefabs** (the user's choice, "for now"): in the
  game's `game.json` (`characters: CharacterDef[]`), so editing one never changes another
  game. Models and animation files stay in the shared asset library as today. Copying a
  character to another game (export / import, like prefabs) can come later.
- They're authored data, not imported files, so they get their own **Characters** panel
  (left toolbar, beside Prefabs), not a place in the ASSETS flyout.
- **The obby's player** becomes a character too: "Obby Hero" = `character.gltf` + its
  current clip choices (today stored per game as `animClips`), made automatically on first
  load and saved in platfrom-obby's `game.json`. The game's player settings then point at
  the character (`characterId`); the old fields are still read for games that haven't moved
  over. The character is edited and saved in isolation like any other, and enemies in that
  game can use it too.
- Gameplay numbers stay with the game, not the character: jump height, speed, run, and
  CHARACTER SCALE (it changes the collision capsule). The character's own size setting only
  makes the model the right height for its capsule.

## 5. The character editor (isolated, like Edit Brush)

Opened from the Characters panel (Edit / New from a model), from the player settings
("Edit character"), or from an enemy that uses it. The level is set aside; the character
stands alone on a grid. Save keeps editing; Close returns (and asks about unsaved
changes), exactly like Edit Brush.

- **View:** the character on a turntable grid, with its **collision capsule** drawn as a
  ghost, so size and feet-on-the-ground are visible; orbit all round (also from below);
  dark background like the brush view.
- **Left, ANIMATIONS:** every clip it can use, grouped by file (its own, UAL1, UAL2,
  + ADD FILE for any imported file with the same skeleton; others are greyed with the
  reason). Search box; filters (loops, one-shots, "moves the body"). Click a clip to play
  it on the character.
- **Bottom, PLAYER BAR:** play / pause, a scrub bar with the clip's length, speed, loop,
  and BLEND TEST (play move A, then blend into move B, to check a transition).
- **Right, CHARACTER:** model, height (with FIT TO CAPSULE), KEEP IN PLACE (on; pins the
  `root` bone's sideways travel, so `_RM` files behave), colors per material (the
  mannequin's `M_Main` / `M_Joints`), name.
- **Right, MOVES:** the moves list: each row = name, clip (pick from the left list or drop
  one on it), ▶, loop, speed. + ADD MOVE for custom ones. AUTO FILL guesses all moves
  from clip names (§6). One list for the character; nothing here depends on what will use
  it.
- **TRY IT:** walk the character around the grid with the real player controls (WASD,
  Space, Shift) to feel the moves together; Esc returns to editing. (Part C.)

## 6. Automatic guesses (AUTO FILL)

Today's guess takes the first clip whose name *contains* the move word, which on UAL2
gives `Fish_Cast_Idle_Loop` for idle. Instead each clip is scored: names split into words
(`Jog_Fwd_Loop` → jog, fwd, loop); a move's words and synonyms must match whole words (run:
run / jog / sprint; in air: jump + loop / fall; death: death / die); `loop` preferred for
looping moves, `start` for jump; backward / sideways variants and prop-specific clips
(`sword`, `pistol`, `zombie`, `fish` …) pushed down; ties to the shorter name. On UAL1 this
should give idle `Idle_Loop`, walk `Walk_Loop`, run `Jog_Fwd_Loop` or `Sprint_Loop`, jump
`Jump_Start`, in air `Jump_Loop`, land `Jump_Land`, climb `Climb_Up_Loop`, hit `Hit_Chest`,
death `Death01`. Tested on the real clip lists in the repo so today's picks don't change.

## 7. Characters in a level (enemies)

- A character can be placed like a model (drag it from the Characters panel): it's an
  object (`WorldObject` with `characterId`; the model comes from the character) that plays
  its idle move, and scripts can play any of its moves, just like animated objects today.
- Turning on enemy AI makes it an enemy. The enemy AI screen is unchanged, except its clip
  pickers become the character's moves (idle / walk / attack, plus hit and death), with the
  note from §3 when one has no clip.
- Prefabs capture placed characters like any object.
- No NPC behaviour (facing the player, talking, routes) in this phase; see §9.

## 8. Implementation order

**Part A: characters exist, the player uses them**
1. Import records each model's skeleton (bone names, an id from them, height); backfill
   existing models → check UAL1, UAL2, Mannequin_F, character.gltf.
2. `characters` in game.json; clip resolver (own + borrowed files, loaded once and shared,
   KEEP IN PLACE) → script test on UAL1_RM: root travel 0 after pinning.
3. Moves and AUTO FILL scoring → script over every clip list in the repo + UAL1 / UAL2.
4. Player uses a character (`characterId`); "Obby Hero" made from today's settings;
   old fields still read → test harness: obby plays exactly as before; Mannequin_F as the
   player walks / jumps / lands on UAL1 clips.
5. Game export copies the files the game's characters take clips from.

**Part B: the character editor**
6. Isolated session (the BrushEditSession pattern) + Characters panel (list, New, Edit,
   Duplicate, Delete).
7. Animations browser, player bar, preview, moves list, character card
   (height / fit, keep in place, colors) → harness with real clicks.

**Part C: enemies, scripts, try it**
8. Placing characters; enemy AI on moves (hit, death added); "play move" script action;
   the missing-move notes → harness: a mannequin zombie enemy (UAL2 zombie moves), a
   script that plays a custom move on the player.
9. TRY IT in the editor.
10. Guides (CHARACTER_GUIDE + an in-app page), test plans, architecture doc.

## 9. Not in this phase

- Mapping clips between **different skeletons** (UAL clips on `character.gltf`).
- **NPC behaviour** (facing the player, talking, walking routes): a later phase on top of
  characters. Placed characters can already idle and play moves from scripts.
- **A player attack** (a button that plays the attack move and hurts what's in front): a
  later phase. The attack move itself exists now and scripts can play it.
- Trimming unused clips from published games (each UAL file is about 21 MB).
- Facial animation, attachments (holding a sword in `hand_r`), ragdolls.

## 10. Decided (2026-10-03, user)

- Characters are saved per game, like prefabs, for now.
- One moves list per character; the editor doesn't care what uses the character.
- This phase is the foundation (models, rigs, animations, the editor, the player and
  enemies). NPC behaviour and a player attack are later phases.
- TRY IT is in part C.
- The obby's player becomes a character; switching it to a mannequin is optional, for
  testing.
