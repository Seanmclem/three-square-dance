# Phase 59 — Trigger volume shapes — acceptance run (2026-08-14)

Run in a Chrome tab on the dev shell's origin (full harness + real backend,
TESTING.md §0), against the platfrom-obby level. All checks passed.

| # | Check | Method | Result |
|---|---|---|---|
| 1 | `npm run typecheck` | shell | ✅ 0 errors |
| 2 | Sphere wireframe renders + sits on bottom | `addTriggerVolume` shape:"sphere" r=2 at y 8.34; editor screenshot | ✅ lat/long ball, bottom at platform, arrow on front |
| 3 | Cylinder wireframe | `updateTriggerVolume` shape:"cylinder" r=1.5 h=5; screenshot | ✅ upright cylinder, correct height |
| 4 | Capsule wireframe | `updateTriggerVolume` shape:"capsule" (r=1.5 h=5); screenshot | ✅ pill, rounded caps |
| 5 | Shape change rebuilds live | each update above | ✅ mesh + collider re-add within a frame |
| 6 | **Sphere sensor fires on enter** | preview; `on_player_enter` → `set_state TestHit=1`; teleport into sphere | ✅ `TestHit` → 1 |
| 7 | **Sensor is spherical, not the old box** | reset; teleport to (−31.7, −77.7) — inside old box AABB, 2.68 m from center (r=2) | ✅ `TestHit` stays 0 |
| 8 | Existing box volumes unaffected | shape field absent → box paths byte-identical | ✅ (code default; box wireframes unchanged in level) |
| 9 | Resize handles box-only | shape guard in `TriggerVolumeResizer._sync` | ✅ handles cleared on round shapes; panel hides RESIZE + falls back to MOVE |

Not exercised (follow-ups if they matter): mover-attached (`attachTo`) round
volume riding a platform — same center math as box, but not live-verified;
gradient `visual` fill on round shapes (geometry swap, shader unchanged).

Cleanup: test volume removed; `worldeditor_gamesave` restored; the tab's
autosave (which captured the test volume mid-run) deleted from
`.worldbuilder/autosave/` — scene files were never written (`git status
public/` clean).
