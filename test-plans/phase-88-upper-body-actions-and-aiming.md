# Test plan · Phase 88 · Actions on a body part, and aiming (v4.119.0)

Throwaway harness only (`deno run -A scripts/test-harness.ts platfrom-obby level_3 <port>`).
Character: Mannequin Male (`chr_13e910a4`): shoot = `Pistol_Shoot`, plays on the upper body,
aims; AIM = `Pistol_Aim_Up` / `_Neutral` / `_Down`, upper body, reach 60° / 60°.

## Game (fixed 1/60 clock, D held)

- [x] Walking + shoot (play move, loop): the move stays `walk`, the legs keep moving (11
      different thigh rotations in 30 frames), the hand points straight ahead (0.04, −0.01, 1).
- [x] Camera 40° up from its start → hand 0.67 up; 30° down → 0.6 down.
- [x] play move shoot with Stop it → the action and its aiming end.
- [x] Bunny (no aim clips): aiming turns the head up (0.61) and down (−0.29).
- [x] Regression recording SAME on every frame (player + crab) after the change.

## Editor (all passed headless)

- [x] + ADD MOVE shoot, clip Pistol_Shoot, timeline: plays on upper body, aims.
- [x] ▶ PLAY over walk: `move:walk` with `action:shoot`.
- [x] AIM → PISTOL fills up / straight / down; preview slider: hand −0.01 / 0.79 / −0.85 at
      0 / 45 / −45°.
- [x] Save writes the move and the aim set.
- [x] TRY IT: script aim on / off toggles aiming; play move shoot plays as an action; Stop it
      ends it.

## By hand

- [ ] In Play: a script (E) starts shoot (loop), walk and run and jump while it plays, look
      up and down; another E with Stop it.
- [ ] A placed character with an upper-body action (scripts) keeps idling underneath.
- [ ] BOW quick pick with `Bow_Shoot` / `Bow_RapidShoot_Loop`.
- [ ] Arms-only and head-only actions.
