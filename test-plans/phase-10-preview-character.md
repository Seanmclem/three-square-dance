# Phase 10 — Preview Mode + Character Controller Test Plan

## Features covered
- Play button → enter Preview Mode (capsule-only default)
- SpawnPointTool — place/move default spawn marker in editor
- `CharacterBody` — Rapier KCC capsule (move, gravity, autostep, snap-to-ground)
- `CharacterController` — WASD movement, mouse look (pointer lock), jump (Space)
- `PreviewHUD` — crosshair, Esc hint, zone name toast, interact prompt
- `TriggerSystem` — door sensor overlap → zone transition
- Interact system — raycast + E key → `scriptEngine.fire('on_interact', ...)`
- Esc → exit Preview and return to editor
- Preview vs Start Game spawn origin difference

---

## Testing approach

Use the Chrome MCP (`mcp__claude-in-chrome__*`) for UI interactions.  
Use `mcp__claude-in-chrome__javascript_tool` to read dev globals for geometry/state verification.  
Console globals: `window.__world`, `window.__zones`, `window.__scene`, `window.__renderer`.

---

## 1. SpawnPointTool (editor)

| # | Action | Expected |
|---|--------|----------|
| 1 | Open Toolbar — locate SpawnPoint tool | Icon visible (arrow/silhouette) |
| 2 | Select SpawnPoint tool, click in scene | Spawn marker arrow placed; PropertiesPanel shows Position XYZ, facing, camera mode, move speed, jump height, FOV |
| 3 | Click again elsewhere | Marker moves (only one allowed at a time) |
| 4 | Save scene, reload | Marker re-appears at saved position (`worldConfig.defaultSpawn` persisted) |

---

## 2. Enter Preview Mode

| # | Action | Expected |
|---|--------|----------|
| 5 | Click Play button (TopBar) | Pointer lock requested; browser shows "site wants pointer lock" prompt |
| 6 | Accept pointer lock | Editor UI hides; PreviewHUD appears (crosshair in FPS, "Esc to exit" bottom-right) |
| 7 | Check spawn position | Character spawns at editor camera focus (Preview mode, not `defaultSpawn`) |
| 8 | Check console: `window.__scene.children.length` | Capsule collider present in physics world; no console errors |

---

## 3. WASD movement & gravity

| # | Action | Expected |
|---|--------|----------|
| 9 | Press W | Character moves forward |
| 10 | Press S, A, D | Character moves backward/left/right |
| 11 | Move over a floor edge | Character falls; gravity applies (velocity.y grows until grounded) |
| 12 | Walk up stairs/platform with autostep | Character steps up without jumping (autostep 0.5m) |
| 13 | Press Space (grounded) | Character jumps |
| 14 | Press Space (in air) | No double-jump |

---

## 4. Mouse look

| # | Action | Expected |
|---|--------|----------|
| 15 | Move mouse left/right | Camera yaws smoothly |
| 16 | Move mouse up/down | Camera pitches; clamped at ±80° (can't flip over) |
| 17 | Move mouse rapidly | No jitter; consistent feel |

---

## 5. PreviewHUD

| # | Action | Expected |
|---|--------|----------|
| 18 | Enter Preview (FPS mode) | Centered crosshair visible |
| 19 | Enter Preview (third-person mode) | No crosshair |
| 20 | "Esc to exit" hint | Bottom-right, always visible in preview |
| 21 | Zone name toast | On zone transition: zone name fades in, held 3s, fades out |
| 22 | Top-left zone name | Shows current zone name at all times in preview |

---

## 6. Door / zone transition

Requires: two zones connected by a door opening with `linkedZoneId` set (see Phase 8).

| # | Action | Expected |
|---|--------|----------|
| 23 | Walk character through a linked door | `character:triggerdoor` fires; ZoneManager unloads current zone, loads linked zone |
| 24 | Zone name toast appears | Linked zone's name fades in |
| 25 | Character position is on the far side of the door | Spawn offset from door center, not at world origin |
| 26 | Walk back through the door | Returns to original zone |
| 27 | Walk toward unlinked door opening | Nothing happens (no `linkedZoneId`) |

---

## 7. Interact system

Requires: an object with `interactable: true` and an `interactLabel`.

| # | Action | Expected |
|---|--------|----------|
| 28 | Look at interactable object from >2.5m | No prompt |
| 29 | Move within 2.5m of interactable | HUD shows `[E] {label}` (fades in) |
| 30 | Move away | Prompt fades out |
| 31 | Press E while in range | `scriptEngine.fire('on_interact', objectId, context)` called; console logs if no script attached |
| 32 | Press E on non-interactable object | Nothing |

---

## 8. Exit Preview

| # | Action | Expected |
|---|--------|----------|
| 33 | Press Esc | Pointer lock released; PreviewHUD hides; editor UI reappears |
| 34 | Editor tool is still active | Previous tool and selection state restored |
| 35 | No console errors after exit | Clean teardown |
| 36 | Enter Preview again | Works without page reload |

---

## 9. Start Game vs Preview

| # | Action | Expected |
|---|--------|----------|
| 37 | Click Play (single click) | Spawn at editor camera focus (Preview mode) |
| 38 | Long press or dropdown → "Start Game" | Spawn at `worldConfig.defaultSpawn` position |

---

## 10. Regression

| # | Check |
|---|-------|
| 39 | `npm run typecheck` → 0 errors |
| 40 | Editor tools still work after exiting preview (select, place walls, etc.) |
| 41 | Undo/redo (Cmd+Z/Cmd+Y) still work in editor after a preview session |
| 42 | Scene save/load still works after preview |
| 43 | No memory leaks: enter/exit preview 5× in a row, check `renderer.info` — triangle count stable |
| 44 | No console errors on load, enter, or exit |
