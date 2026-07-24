# Phase 49 — Custom Game GUI (script-driven HUD widgets + simple menus)

> User request (2026-07-24): a way for game creators to build custom in-game UI
> beyond the built-in PreviewHUD — health bars, shop menus, inventory screens,
> quest logs, dialogue boxes with custom styling; likely a ui:show-driven system
> where scripts can display and update configurable UI elements without writing
> code. v1 scope agreed: passive HUD widgets + simple clickable menus (full
> composed screens like multi-pane shops deferred).

## Decision & rationale

- **Activate the dead stub.** `show_ui` / `uiElementId` / `ui:show` already
  exist (ScriptEngine emits, nothing listens). We keep the action, add
  `hide_ui`, and delete the dead `ui:show` bus event rather than building on a
  second, lossier channel.
- **Visibility lives in GameState, not component state.** `show_ui`/`hide_ui`
  set a reserved key `__ui.<elementId>` (true/false). The overlay derives
  visibility from GameState and re-renders on `state:changed` — the same
  subscription that makes bars/counters live. For free: survives scene
  transitions (gameState survives `router.go()`), persists into the runtime
  save / restores on Continue, resets on New Game, no `ui:update` event needed.
  The `__` prefix hides it from the STATE tab (the `__runtime_pose` precedent).
- **Elements are a registry like items.** Authored in a new ScriptPanel **UI**
  tab; scene-scope defs in `WorldConfig.uiElements`, game-scope in
  `GameConfig.uiElements`, merged exactly like `mergeItemDefs`.
- **Menus reuse the dialogue grammar**: options with conditions, picked via the
  same confirm/menuNav control routing, actions run through the real
  ScriptEngine dispatch.

## Data shapes (`src/types.ts`)

```ts
export type UiAnchor = "top-left" | "top-center" | "top-right"
                     | "bottom-left" | "bottom-center" | "bottom-right";
interface UiElementBase {
  id: string;              // ui_<uuid8>
  label: string;           // editor name
  anchor: UiAnchor;
  offsetX?: number; offsetY?: number;   // px from anchor
  startVisible?: boolean;  // shown without show_ui (default false)
}
// kind: "bar"     — stateKey, max? (default 100), width/height?, color?, graphicId?
// kind: "counter" — stateKey (incl. inv.<itemId>), graphicId?, prefix?, size?
// kind: "label"   — text, fontSize?, color?
// kind: "image"   — graphicId, width?, height?, opacity?
// kind: "menu"    — title?, options: { id, text, conditions?, actions?, closeOnPick? }[]
export type UiElementDef = UiBarElement | UiCounterElement | UiLabelElement
                         | UiImageElement | UiMenuElement;
```

`ActionType` + `"hide_ui"`. Bus events: remove dead `"ui:show"`, add
`"ui:menu-pick" { elementId, optionId }`, `"ui:menu-shown"`, `"ui:menu-closed"`.

## Implementation

- **`src/scripting/uiElements.ts`** (mirrors inventory.ts): `UI_PREFIX="__ui."`,
  `uiKey(id)`, `mergeUiElementDefs(game, scene)`, `uiRegistry(world)`.
- **WorldState**: `gameUiElements?: UiElementDef[]` beside `gameItems` (session
  only, non-serialized). `WorldConfig.uiElements` serializes for free via
  `toJSON`. Scene-scope edits wrapped in a transaction like items (not
  journaled/undoable — matching items' reality, not "fixed" here).
- **ScriptEngine**: `show_ui` → `gameState.set(uiKey(id), true)`; new `hide_ui`
  → false. `activate()` subscribes `ui:menu-pick`: look up element via
  `uiRegistry`, re-check option conditions, `runActions(opt.actions)`, close
  unless `closeOnPick === false`. Extract `checkConditions` body into an
  exported pure function so the overlay filters options with the same rules.
- **ControlSchemeManager**: `_uiMenuOpen` flag driven by `ui:menu-shown` /
  `ui:menu-closed`, included in `_menuMode` — confirm/menuNav route to the bus
  while a GUI menu is up (dialogue precedent; no pointer-lock changes).
- **`src/ui/GameGuiOverlay.tsx`** (new): props `{ bus, world }`. Re-renders on
  `state:changed`. Anchored containers, `pointerEvents: "none"` except menus,
  zIndex below DialogueOverlay. Bar = track+fill (% of max), counter =
  icon+count, label/image direct; all graphic srcs via
  `assetManager.resolveUrl(getGraphicDef(id)?.path)`. Menu styled like
  DialogueOverlay option rows; listens confirm/menuNav only while a menu is
  visible AND no dialogue is open; emits ui:menu-shown/-closed/-pick. v1
  limitation (documented): one navigable menu at a time (first visible wins).
- **Shell mounts**: App.tsx beside PreviewHUD (preview only); RuntimeApp beside
  PreviewHUD under `shell === "playing"`. SceneRouter sets
  `world.gameUiElements` from `manifest.game?.uiElements`.
- **App plumbing**: mirror every `gameItems` / `worldItems` touch point for
  `gameUiElements` / `worldUiElements`; `handleUiElementsChange` mirrors
  `handleWorldItemsChange` (project → game.json store + session; else
  transaction on `world.world.uiElements`).
- **ScriptPanel UI tab**: `UiElementsEditor`/`UiElementRow` cloned from the
  ITEMS editors — + New with kind select, per-kind fields (stateKey inputs get
  the existing `wb-state-keys` datalist), anchor select, startVisible checkbox,
  `GraphicPickerPopover` (Phase 48) for graphicIds; menu options editor nests
  the existing condition + action editors (dialogue OPTIONS composition).
  `ActionFields` `show_ui`/`hide_ui` get a select over element labels
  (unknown ids preserved — show_dialogue precedent).

## Verification

- `npm run typecheck` → 0 errors.
- Editor pass: author bar (startVisible) + counter on `inv.<item>` + hidden
  menu (one condition-gated option, actions = set_state). Then:
  `__test.enterPreview()` → bar+counter in DOM, menu absent;
  `__test.runAction({type:"show_ui", uiElementId})` → menu appears;
  `__gameState.set("health", 50)` → fill width halves; give_item → counter
  updates; `menu:nav` + `action:confirm` emits pick, action ran, menu closed;
  `hide_ui` removes; gated option hidden until flag set; dialogue open while
  menu visible → confirm drives dialogue only.
- Runtime shell: published fixture — overlay renders while playing,
  `load_scene` keeps a shown element visible, Continue restores it, New Game
  clears it. Scene JSON round-trips `uiElements`; game.json scope persists via
  project Save.

## Docs

WORLD_EDITOR_ARCHITECTURE.md changelog + phase section + file-level sections
(ScriptEngine, ScriptPanel, WorldState, new files). HUMAN_TESTING walkthrough
for the UI tab. Acceptance checklist: `test-plans/phase-49-game-gui.md`.
