# Phase 53 — on_state_equals · respawn_player · attachable volumes — acceptance

Shipped as v4.55.0 (parts 1+2) and v4.56.0 (part 3); plan in
`plans/phase-53-state-respawn-attach.md`. Automated passes ran 2026-07-31 via
the Chrome extension (autosave snapshot protocol; hidden-tab runs stepped
mover/physics/trigger/input manually per TESTING.md).

## Part 1 — on_state_equals (+ on_health_zero wired)

| # | Check | Expected | Result |
|---|---|---|---|
| 1 | Timer sets `k=5` every 1s; scripts on `k==5` and `k==7` | `k==5` fires, `k==7` never does | ✅ (`hit=1`, no `wrong`) |
| 2 | Transition-only | repeated `set k=5` emits ONE `state:changed`; no re-fire | ✅ (single `k=5` event over 4s) |
| 3 | on_health_zero | fires at health→0; NOT on re-set 0 / clamped over-damage; fires again after recovery→0 | ✅ (`dead=1` → no-ops → `dead=2`) |
| 4 | Panel fields | trigger in dropdown, state-key input (datalist), "Equals value" input; stateValue cleared on trigger-type change | ✅ |
| 5 | Entity-owned scripts | state-key input renders on a volume/object script (not "implicit target") | ✅ (bug found + fixed during guide capture) |

## Part 2 — respawn_player + fades

| # | Check | Expected | Result |
|---|---|---|---|
| 1 | fade_screen freeze regression | fade-out auto-emitted at fade end; overlay gone; input released | ✅ (fade-out exactly at +0.4s) |
| 2 | Respawn sequence | fade-in → teleport under cover → health restored → fade-out | ✅ (teleport at +0.3s, exact default-spawn coords, health=100) |
| 3 | Checkpoint destination | targetId resolves checkpoint position + facing | ✅ ((5,2,5) facing 90) |
| 4 | Cancellation | exit preview mid-fade: no late teleport, overlay cleared, editor alive | ✅ |
| 5 | Runtime transitions | router.go fades in → loads → fades out; input alive on arrival | ✅ (held-W ≈6 m/s after scene_01→scene_02) |

## Part 3 — attachable trigger volumes

| # | Check | Expected | Result |
|---|---|---|---|
| 1 | Attached sensor parenting | kinematic parent (bodyType 2) at converted world pose | ✅ |
| 2 | Orphan fallback | attachTo→missing host = fixed body at authored pose | ✅ |
| 3 | Lockstep | sensor + wireframe + fill track the platform through a full leg + ping-pong turn | ✅ (constant 0.95 offset every sample) |
| 4 | The crusher case | stationary player: enter → exit → enter as the sensor sweeps over | ✅ |
| 5 | Host rebuild | updatePlatform → still attached, still moving, no console errors | ✅ |
| 6 | Leak probe | collider/body counts flat across 3 rebuilds | ✅ (144/143 stable) |
| 7 | Preview stop | sensor + visuals restored to rest exactly | ✅ (5.25 rest) |
| 8 | Copy/paste remap | pasted host+volume pair: attachTo = pasted host's id | ✅ |
| 9 | Panel | ATTACHED TO select lists mover-enabled hosts; dangling id shown as static | ✅ (dropdown verified; dangling-option rendering by code review) |

## Not covered (known gaps)

- Prefab-expansion attachTo remap is logic-verified only (same idMap idiom as
  `remapScripts`); capture+place a prefab with a host+volume to confirm live.
- A yaw-rotated host (spin mover) carrying a volume — the quaternion math is
  shared with the verified slide path; a live spin ride is a one-look check.
- Real-input (visible-tab) crusher kill: the full chain ran with manual
  stepping because the tab was OS-hidden; a human run of the HAZARDS_GUIDE
  crusher recipe is the end-to-end confirmation.
