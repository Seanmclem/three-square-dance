# Test Plan — Phase 49: Custom Game GUI (v4.44.0)

[x] = verified via Chrome MCP 2026-07-24 (`plans/phase-49-game-gui.md`;
editor preview on the open project + runtime shell on the committed
pj-fixture). ⚠ Preview exit writes `worldeditor_gamesave` even in plain
preview mode — automation must snapshot/restore it (bit this session).

## Authoring (SCRIPTS → UI tab)

- [x] UI tab renders (6th tab); kind select + New; empty-state hint.
- [x] + New (bar) → row with kind badge, label, anchor select, x/y offsets,
      "visible at start", stateKey (wb-state-keys datalist), max, w/h, color
      swatch, icon Pick.
- [x] Edits flow through handleUiElementsChange → `world.gameUiElements`
      (project mode: game.json store in memory, saved on Save).
- [ ] Menu options editor: + Add option, text/close checkbox, nested
      conditions (ConditionRow) + actions (ActionRow) — authored via clicks.
- [ ] show_ui / hide_ui action fields list elements by label (custom id
      preserved).
- [ ] Scene-scope (no project): elements round-trip scene JSON
      (`WorldConfig.uiElements` via toJSON).

## Editor preview runtime

- [x] startVisible bar + counter + label render at their anchors; menu hidden.
- [x] `show_ui` (via `__test.runAction`) shows the menu; `hide_ui` hides a
      startVisible element.
- [x] Live binding: set_state health 100→50 halves the bar fill;
      adjust_number coins +7 → counter "×7" — no ui:update event, just
      state:changed.
- [x] Menu: condition-gated option hidden until its flag is set, appears the
      moment a pick sets it (same open menu).
- [x] Pick runs the option's actions through real ScriptEngine dispatch;
      closeOnPick:false keeps the menu, default closes it (`__ui.<id>` false).
- [x] menu:nav moves the highlight; confirm picks. (Synthetic nav+confirm in
      ONE javascript_tool call picks the pre-nav option — stale closure; use
      separate calls. Real inputs arrive in separate frames.)
- [x] Dialogue precedence: with a dialogue open over a visible menu, confirm
      drives the dialogue only.

## Runtime shell (pj-fixture)

- [x] game.json-level element renders while playing (manifest.game.uiElements
      → SceneRouter → gameUiElements; initGraphics booted).
- [x] Visibility survives scene transitions: hidden via `__ui` key before
      `router.go("scene_02")` → still hidden after; show → visible.
- [ ] Continue restores shown/hidden state (in the runtime save snapshot);
      New Game resets it.
- [ ] Touch/gamepad menu nav (ControlSchemeManager `_uiMenuOpen` routes
      confirm/menuNav in menu mode — kbm path verified via bus).

## Regressions

- [x] `npm run typecheck` → 0 errors.
- [x] Autosave hash byte-identical at session end; editor + runtime gamesaves
      snapshot-restored; temp UI element deleted through the real UI.
- [x] Dead `ui:show` bus event removed (only show_ui/hide_ui actions remain).
