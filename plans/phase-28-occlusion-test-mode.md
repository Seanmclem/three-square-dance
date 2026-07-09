# Phase 28 — Occlusion Test Mode (detached debug vantage)

> **Status: IMPLEMENTED** — shipped as v4.21.0 (2026-07-09). Verified in-browser
> end-to-end; acceptance record in `test-plans/phase-28-occlusion-test-mode.md`.
> Notable deviations from the original request:
> - Game saves are deliberately **not** written by an occlusion run (New Game
>   writes them) — a debug session must not clobber the user's Continue save.
> - The cull-as-player view shipped **toggleable and default-OFF** (user chose
>   "keep it, toggleable" after the tradeoff was surfaced — it's a faithful
>   reproduction of the renderer's culling test, not the renderer's own code
>   path, so it's opt-in and labeled in the HUD).

Origin: user request — "a play preview mode that behaves basically like the New
Game option except… a secondary debug camera, decoupled from the player's actual
view, that lets you control the character's position and facing while observing
the scene from a different vantage point. Used to verify geometry occlusion,
frustum culling, and zone dimming/hiding are behaving correctly."

## 1. Scope & assumptions

**In scope**
- Third `PreviewMode` `"occlusion"`: New Game gameplay semantics (defaultSpawn,
  `on_game_start`, hideInGame furniture hidden, gizmo/node-dot lockout, editor
  chrome hidden) rendered from the editor orbit camera.
- Tab toggle between controlling the player (pointer lock, normal game input)
  and the vantage camera (editor orbit controls); the uncontrolled thing holds
  still.
- Always-on `THREE.CameraHelper` visualizing the player's logic camera.
- Opt-in (C key) cull-as-player render pass with exact visibility restore.
- HUD badge + hints; Toolbar menu item; dev/test hooks.

**Out of scope**
- Runtime shell support (guarded fallback to `"game"` — the runtime SceneManager
  has no editor camera).
- Avatar visibility in FPS mode (unchanged: FPS hides the model; the frustum
  helper marks the player).
- Any change to CharacterController (none was needed — movement/facing derive
  from its internal `_yaw`/`_pitch`, not the rendered camera).

**Key architectural insight** — `SceneManager._loop()` renders
`_previewCamera ?? camera`; occlusion mode simply never calls
`setPreviewCamera()`, so the editor camera keeps rendering and orbit-updating
while the character camera runs unrendered as the "logic camera" (spring-arm
occlusion pull-in included).

## 2. Types (`src/types.ts`)

- `PreviewMode = "preview" | "game" | "occlusion"`;
  `isGameplayMode(m) => m !== "preview"`.
- `"preview:start"` payload widened to `{ mode: PreviewMode; resume?: boolean }`.
- New event `"occlusion:state": { subMode: "player" | "camera"; cullView: boolean }`.

## 3. SceneManager cull override (`src/core/SceneManager.ts`)

`setCullOverrideCamera(cam | null)` + `_applyCullOverride()` /
`_restoreCullOverride()` bracketing `renderer.render` in `_loop`. Apply:
Frustum from `projectionMatrix × matrixWorldInverse`; traverse meshes with
`userData.editorId` (skip `hideInGame`/`editorOnly`, already-hidden — script
state respected — and `frustumCulled === false`); world-space bounding-sphere
test; hide failures, recording exactly what was hidden. Restore flips only
those back right after render. Preallocated scratch (Frustum/Matrix4/Sphere/
array). Getters: `cullStats { tested, hidden } | null`, `activeRenderCamera`.
Accepted side effect: hidden meshes skip that frame's shadow map. With the
override off, `_loop` differs from the previous version by one null check.

## 4. PreviewController (`src/preview/PreviewController.ts`)

- `enter(mode: PreviewMode)`; spawn gate `isGameplayMode(mode) && defaultSpawn`;
  runtime guard: occlusion without `editorCamera` → warn + `"game"`.
- Occlusion branch: skip `setPreviewCamera`; `editorCamera.enabled = false`
  (initial sub-mode `player`); CameraHelper (frustumCulled=false, plain
  userData) added; updateFn variant zeroes the merged `ActionState`
  (`zeroActionState`) in camera sub-mode *after* `input.update` — solves the
  double-drive problem (KeyboardMouseSource listens on `document` regardless of
  pointer lock) — and refreshes `controller.camera.matrixWorld` + helper.
- Window keydown (capture): Tab → `preventDefault()` + `_setSubMode` toggle;
  C → `setCullView(!cullView)` (typing-target guarded).
- `_setSubMode`: player = editorCamera disabled + `requestPointerLock()`
  (synchronous inside the real keydown = valid activation); camera = exit lock +
  editorCamera enabled. Emits `occlusion:state`.
- All three pointer-lock re-lock sites (enter, `pause:closed`, canvas
  mousedown) share `_wantsLock(): mode !== "occlusion" || subMode === "player"`.
- `exit()`: cull override off, helper disposed, listener removed, state reset;
  the existing `setPreviewCamera(null)` restores editorCamera.enabled + aspect.
- Esc: no new code — App's window-keydown handler exits, same as game mode.

## 5. Gameplay-semantics flips + save gating

- `ZoneManager.ts` / `NodeDragger.ts` / `GizmoManager.ts` / `App.tsx setIsGame`:
  `mode === "game"` → `isGameplayMode(mode)` (identical booleans for the two
  existing modes).
- `App.tsx`: no 30s `saveGame` interval for occlusion; `preview:stop` save
  skipped when the session mode was occlusion (`previewModeRef`).

## 6. UI + hooks

- `Toolbar.tsx`: `onOcclusionTest` prop + "▶ Occlusion Test" menu item.
- `App.tsx`: `handleOcclusionTest` (mirrors `handleNewGame` incl.
  `onGameStart()`); `previewMode` state → PreviewHUD.
- `PreviewHUD.tsx`: optional `mode` prop (default `"game"` — RuntimeApp
  untouched); amber badge from `occlusion:state` (local default matches enter
  state, so the post-mount subscription misses nothing); crosshair hidden in
  occlusion; `Tab · player/camera   C · cull view` hints.
- Dev: `window.__sceneManager`; `__test.enterOcclusion() / occlusionState() /
  setCullView(on) / teleport(x,y,z,facing)`.

## 7. Verification

`npx tsc --noEmit` clean. Browser pass (TESTING.md §3 golden path, autosave
snapshot/restore protocol followed): see the acceptance record —
`test-plans/phase-28-occlusion-test-mode.md`. Notable findings during testing:
- `EditorCamera.update()` gates on `enabled`, so the vantage is *frozen* in
  player sub-mode — desired behavior, but console reframes (TESTING.md §3.5)
  only apply in camera sub-mode.
- Synthetic `requestPointerLock` from CDP produces `WrongDocumentError`
  unhandled rejections — pre-existing for `enterPreview`/`enterGame` automation
  too; real toolbar/keydown entry locks fine.
