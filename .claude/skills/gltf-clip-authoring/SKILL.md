---
name: gltf-clip-authoring
description: Procedurally author a new animation clip (climb, swim, dance, custom pose loops) into a GLTF model in public/assets/models/ — rig inspection, two-bone IK posing, baking accessors into the embedded buffer, numeric flip-detection, and the browser review/iterate loop. Use when asked to add, fix, or tune an animation on an imported character/creature model that doesn't ship the clip.
---

# Authoring animation clips into GLTF assets

Proven workflow from adding the `Climb` clip to `character.gltf` (2026-07-10). No
Blender, no Mixamo — pure-Python keyframe synthesis baked into the asset, discovered
by the editor like any stock clip. **Iterate WITH the user watching the editor tab —
their live feedback ("feet go through knees") beats screenshots.**

## Where things live

- Source of truth: `public/assets/models/<model>.gltf` (`dist/` is stale build output — never edit).
- `public/assets/models/manifest.json`: each asset entry has an `animations: [...]`
  name list — the Animations tab reads this. **Add the new clip name there too.**
- Player locomotion consumes clips by name via case-insensitive *contains* match
  (`CharacterController._clipFor`), plus per-character overrides in
  `PlayerSettings.animClips` keyed by `LocomotionState` (`src/types.ts`). A new
  locomotion intent (e.g. "climb") = extend that union + the state machine in
  `CharacterController._updateAnim`.

## Scripts in this skill dir (proven working)

- `author_climb.py` — the full generator: tiny vec/quat lib, FK, two-bone IK,
  swing-from-rest bone aiming, keyframe build, flip diagnostic, glTF baking
  (accessors/bufferViews/base64 buffer append), manifest update. **Copy and adapt
  the "climb cycle parameters" + keyframe-build section for a new clip; the math
  and baking sections are clip-agnostic.** Run from the repo root.
- `analyze_clip.py` — FK-samples an existing clip and prints joint world positions
  over time. Use it to steal pose vocabulary from stock clips (e.g. Jump_Idle
  showed this rig folds legs heel-back, foot 0.47m from hip — not frog-style).

## The workflow

1. **Inspect the rig** (json + struct over the base64 data-URI buffer): node
   hierarchy, skin joints, rest TRS per joint, and one stock clip's channel layout.
   Quaternius rigs: `Idle` t=0 == rest pose; every clip keys ALL joints
   (translation+rotation; static bones get 2-key channels — mimic this exactly).
2. **Watch for baked-IK satellite bones.** On character.gltf, `Foot.L/R` and
   `PoleTarget.L/R` are children of **Root**, not the leg chain. Feet carry the foot
   mesh → you must key foot translations to the leg-chain FK end every frame, and
   verify: `|legChainEnd − footBonePos| == 0` (the script asserts this).
3. **Author via targets + two-bone IK**, not hand-tuned local rotations. Pick
   world-space hand/foot targets per phase, solve elbow/knee with a pole vector,
   convert to local quaternions with **swing-from-rest** (shortest-arc from the
   rest-pose bone direction — preserves skinning twist without knowing bone axes).
4. **Bake**: append float32 accessors (times need min/max; 4-byte align) to the
   embedded buffer, re-base64, append the animation object. Regenerate from a
   `.pristine` copy every run so iteration never stacks clips (don't commit the
   `.pristine`; delete it when done).
5. **Review in the browser with the user**, tune numbers, repeat (below).

## Hard-won gotchas (each cost a debugging round)

- **IK singularity = "leg flops/twists unnaturally mid-cycle."** If a target path
  passes near the chain root (foot ≈ hip), the IK collapses to its minimum fold and
  the joint direction flips ~160° in one frame. Keep every target ≥ ~45% of chain
  length from the root, through the whole path. The script's **flip diagnostic**
  (max adjacent-key rotation step per bone; assert < 60°, normal is < 40°) catches
  this numerically — trust it over screenshots.
- **Quaternion hemisphere continuity**: after generating keys, flip any key with
  negative dot vs its predecessor, or LINEAR interpolation takes the long way.
- **Perfect loop**: force `lastKey = firstKey` per channel.
- **Animate end-effector orientation with its phase** (foot pitch ~flat planted,
  toes trailing mid-swing) — a fixed orientation while the bone translates reads as
  the mesh folding into itself.
- **Steal proportions from stock clips** via `analyze_clip.py` before inventing
  poses — chunky rigs (giant head: face front z≈0.55, half-width ≈0.45 on
  character.gltf; hands must stay wide/forward of that) break humanoid intuition.
- Model faces **+Z**; `MODEL_FORWARD_OFFSET` in CharacterController is π.
- In-place clip: vertical progress comes from the controller later; the clip climbs
  in place (stance phase slides limbs down, swing reaches back up).

## Browser review / iterate loop (specifics beyond TESTING.md §3)

Follow TESTING.md §3 (port 7373, autosave snapshot protocol, tab tagging). Extra
lessons specific to animation review:

- `__world.updateObject(zone, id, { autoPlayAnimation: "Climb" })` **persists but
  does NOT hot-apply** — ObjectPlacer's `object:updated` handler ignores that field;
  it only takes effect on zone build. After regenerating the gltf you reload anyway,
  which picks up both. (Live switch without reload = the Animations tab UI, which
  calls `setAutoPlay`.)
- **Hidden tab ⇒ RAF frozen ⇒ the clip looks static** and two bone samples compare
  equal. Confirm playback by sampling a bone's `getWorldPosition` twice with a Bash
  `sleep` between calls — but only while the tab is visible (ask the user, or a
  `computer screenshot` refocuses).
- Frame with `__editorCamera` (TESTING.md §3.5). For an object at rotation.y=0:
  `theta ≈ 5.5` = front three-quarter, `1.57` = side profile, `2.4–2.6` = rear.
- Iteration cadence that worked: edit params → run generator (~1s, diagnostic
  gates the write) → reload tab → user watches live → next tweak. ~30s per round.
