# Phase 28 — Occlusion Test Mode — Test Plan

Verified 2026-07-09 during implementation (v4.21.0) via Chrome MCP. Re-run after
changes to `SceneManager._loop` / the cull-override pass, `PreviewController`'s
occlusion branch or pointer-lock predicate, or the mode-string branches
(`isGameplayMode`).

Entry points: `__test.enterOcclusion()` (synthetic) or Toolbar ▶-caret →
"Occlusion Test" (real path; also grants pointer-lock activation, which the
synthetic path can't). Autosave snapshot/restore protocol (TESTING.md §3) was
followed; the user's world dump is in the session transcript.

## Checks

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | Enter | `__preview.mode === "occlusion"`, `isActive`, subMode `player`, cullView `false` | ✅ |
| 2 | Rendered camera | `__sceneManager.activeRenderCamera === __camera` (editor cam), NOT the controller camera | ✅ |
| 3 | Frustum helper | exactly one `CameraHelper` in `__scene`; visible from the vantage (screenshot) | ✅ |
| 4 | Cull view default | `cullStats === null` until C/`setCullView(true)` | ✅ |
| 5 | Cull responds to facing | teleport facing away from a spawned `test_` shape → `cullStats.hidden` rises (8 vs 6 in the demo world) | ✅ |
| 6 | Restore invariant | culled mesh's `visible` reads `true` between frames (hidden only inside the render bracket) | ✅ |
| 7 | Script state respected | `despawn_object` a mesh while cull view is on → stays hidden across frames; restored by the normal zone restore on exit, not by the cull pass | ✅ |
| 8 | Tab → camera | subMode `camera`, HUD badge flips, pointer lock released; held W moves the **editor camera** (405u) and the player **0** | ✅ |
| 9 | Tab → player | subMode `player`; held W moves the **player** and the editor camera **0**; vantage frozen (EditorCamera.update gates on `enabled` — console reframes only apply in camera sub-mode) | ✅ |
| 10 | C toggle | real keypress flips cullView, `cullStats` nulls, HUD badge updates | ✅ |
| 11 | Game semantics | grid/`hideInGame` hidden while active, restored on exit; editor chrome (Toolbar) hidden and restored | ✅ |
| 12 | Esc exit | mode null, cull off, helper removed+disposed, listeners gone | ✅ |
| 13 | Save gating | `localStorage` gamesave keys byte-identical before/after the occlusion run | ✅ |
| 14 | HUD | amber badge `OCCLUSION TEST — CONTROLLING: … · CULL VIEW …`; crosshair absent in occlusion, present in preview; Tab/C hints shown | ✅ |

## Regressions

- typecheck 0 errors.
- Plain Preview: renders the controller camera, `cullStats === null`, crosshair
  present, no badge. ✅
- New Game: renders the controller camera, `cullStats === null`, no badge. ✅
- Runtime shell untouched (PreviewHUD `mode` prop optional; occlusion guarded
  behind `editorCamera` presence — code-gated).
- Console: no new errors. Pre-existing under automation: `WrongDocumentError`
  pointer-lock rejections (synthetic entry has no user activation — same for
  `enterPreview`/`enterGame`) and the Toolbar border/borderLeft React warning.

## Known limits (by design)

- FPS camera mode hides the avatar model, so from the vantage the player is
  marked by the frustum helper, not a visible body (third-person mode shows it).
- Cull-as-player is a faithful reproduction of the renderer's
  bounding-sphere-vs-frustum test, not the renderer's own code path — hence
  opt-in (C) and labeled in the HUD. Culled meshes skip that frame's shadow map.
- The vantage camera is frozen while controlling the player (Tab to camera
  sub-mode to move it) — intentional, so the view holds still during a run.
