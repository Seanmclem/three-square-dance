# Phase 86 · Characters: a character editor, animation libraries, and characters as player, NPC or enemy

> Status: **PLANNED** (2026-10-03, revised after the user's answers). Not built. Built in
> three parts (A, B, C below), each shipped and tested on its own. Remaining questions at
> the end. Visual overview: the HTML page linked from the chat.

Today an animated model is treated like any other prop: its animations are whatever clips
are inside its own file, chosen by a name guess or by hand, separately for the player
(per game), for each enemy and for each script. That breaks down with packs like
Quaternius's **Universal Animation Library** 1 and 2 (CC0): two files with 120 and 134
clips, plus a **female mannequin** with no clips at all, all on one skeleton and meant to
be shared.

This phase makes a **character** its own saved thing, set up once in an isolated
**character editor** (like Edit Brush), and usable in any **role**: the player, an NPC or
an enemy.

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
  moving, land after a fall); you can add any others (wave, sit, cheer) for scripts and
  NPCs. This replaces the fixed "slots".
- **Role**: what drives a placed character: **Player** (the controls), **Enemy** (the
  existing enemy AI), **NPC** (stands, idles, looks at you, plays moves when scripts say
  so). One character can be used in any role, in any game.

## 3. Moves: modular instead of fixed slots

Each character has a list of moves. A move = `{ clip, loop, speed, blend }`.

| Move | Played by the engine when | Used by |
|---|---|---|
| idle | standing still | all roles |
| walk | moving | all roles |
| run | running (if the game has run on); falls back to walk | Player |
| jump · in air · land | takeoff · airborne · landing | Player |
| climb | on a ladder | Player |
| attack | an enemy bites / swings | Enemy |
| hit | taking damage | Player, Enemy, NPC (new trigger) |
| death | an enemy is defeated (stomped), or a script says so | Enemy, scripts |
| talk | an NPC is spoken to (dialogue open) | NPC |
| *any name you add* | a script's play-move action, or an NPC idle variation | scripts, NPC |

- The character editor shows which moves each role needs and marks the empty ones ("Enemy:
  attack missing").
- Engine code asks for a **move** ("walk"), never a clip name, so swapping a character's
  clips never touches the player code, the AI or scripts.
- Scripts: `play_animation` keeps working with clip names; a new **play move** action (and
  `play_animation` with a move name) plays the character's move, whatever clip it maps to.

## 4. Where characters are saved, and the obby's player

- Characters live in the **shared asset library next to the models**
  (`public/assets/characters/<id>.json` + a manifest), so every game can use them (the
  user's choice: "on the model"). Each model with a skeleton gets a default character the
  first time it's opened in the editor.
- They're authored data, not imported files, so they get their own **Characters** panel
  (left toolbar, beside Prefabs), not a place in the ASSETS flyout.
- **The obby's player** becomes a character too: "Obby Hero" = `character.gltf` + its
  current clip choices (today stored per game as `animClips`), made automatically on first
  load. The game's player settings then point at the character (`characterId`); the old
  fields are still read for games that haven't moved over. The character is edited and
  saved in isolation like any other, and other games or NPCs can use it.
- Gameplay numbers stay with the game, not the character: jump height, speed, run, and
  CHARACTER SCALE (it changes the collision capsule). The character's own size setting only
  makes the model the right height for its capsule.

## 5. The character editor (isolated, like Edit Brush)

Opened from the Characters panel (Edit / New from a model), from the player settings
("Edit character"), or from a placed NPC or enemy. The level is set aside; the character
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
  one on it), ▶, loop, speed. + ADD MOVE for custom ones. Role tabs (Player / Enemy / NPC)
  highlight what that role uses and what's missing. AUTO FILL guesses all moves from clip
  names (§6).
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

## 7. Placing characters as NPCs and enemies

- Drag a character from the Characters panel into the level: a placed character
  (`WorldObject` with `characterId`; the model comes from the character). Its panel has a
  ROLE choice: **NPC** (default) or **Enemy**.
- **Enemy** uses the existing enemy AI screen unchanged, except its clip pickers become
  the character's moves (idle / walk / attack, plus hit and death).
- **NPC** (new, deliberately small): idles (optionally cycling idle variations), turns
  toward the player within a radius, plays **talk** while a dialogue with it is open, and
  plays any move a script asks for. No walking routes in this phase.
- Prefabs can capture placed characters like any object (a "Shopkeeper" prefab = the NPC
  + its trigger + dialogue script).

## 8. Implementation order

**Part A: characters exist, the player uses them**
1. Import records each model's skeleton (bone names, an id from them, height); backfill
   existing models → check UAL1, UAL2, Mannequin_F, character.gltf.
2. Character files + manifest; clip resolver (own + borrowed files, loaded once and shared,
   KEEP IN PLACE) → script test on UAL1_RM: root travel 0 after pinning.
3. Moves and AUTO FILL scoring → script over every clip list in the repo + UAL1 / UAL2.
4. Player uses a character (`characterId`); "Obby Hero" made from today's settings;
   old fields still read → test harness: obby plays exactly as before; Mannequin_F as the
   player walks / jumps / lands on UAL1 clips.
5. Game export copies characters + the files their clips come from.

**Part B: the character editor**
6. Isolated session (the BrushEditSession pattern) + Characters panel (list, New, Edit,
   Duplicate, Delete).
7. Animations browser, player bar, preview, moves list with role tabs, character card
   (height / fit, keep in place, colors) → harness with real clicks.

**Part C: NPCs, enemies, try it**
8. Placing characters; ROLE: NPC / Enemy; enemy AI on moves (hit, death added); NPC role;
   play move action → harness: a mannequin zombie enemy (UAL2 zombie moves), a mannequin
   NPC that waves on a trigger.
9. TRY IT in the editor.
10. Guides (CHARACTER_GUIDE + an in-app page), test plans, architecture doc.

## 9. Not in this phase

- Mapping clips between **different skeletons** (UAL clips on `character.gltf`).
- NPC walking routes / schedules; crowds.
- Trimming unused clips from published games (each UAL file is about 21 MB).
- Facial animation, attachments (holding a sword in `hand_r`), ragdolls.

## 10. Questions still open

1. **Where characters are saved:** the shared asset library (every game sees them), as
   planned from "on the model", or per game like prefabs? The shared library means an
   edit changes that character in every game.
2. **The NPC role:** is "idle, look at the player, talk, scripted moves" the right first
   size, or do you want simple walking between points too?
3. **TRY IT** in part C, or not needed?
