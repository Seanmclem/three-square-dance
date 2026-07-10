# Phase 32 — Item Registry + Inventory (Bag) System

> **Status: IMPLEMENTED** — shipped 2026-07-10 (v4.26.0). Verified in-browser
> end-to-end; acceptance record in `test-plans/phase-32-inventory.md`.
> Deviations from plan: none material (App state named `worldItems` to avoid
> the asset-editor's existing `items` naming; bag toggle also suppressed in
> occlusion mode because Tab is the vantage-switch key there).


## Context

Phase 30 dialogue established "items = gameState counters" (`adjust_number coins +5`) — the mechanics work, but there's no item *identity* (raw key strings, typo-prone), no player-facing view of what they hold, and no typed editor UX. This phase adds the presentation/ergonomics layer **on top of** gameState, changing nothing underneath: an `ItemDef` registry over reserved `inv.<itemId>` keys, typed `give_item`/`take_item`/`has_item` with item-picker dropdowns, and a view-only bag overlay. Existing saves, `on_state_changed`, STATE-tab defaults, and dialogue-option effects keep working untouched.

Decisions confirmed with user:
- **Bag is view-only v1** (icon, name, count, description). Item *use*/consume/equip = later phase.
- **Bindings**: kbm `I`/`Tab` toggle, gamepad `Y` (button 3), touch 🎒 button.
- **Pickups = scripts only** (`on_interact` → `give_item` + `despawn_object`, oneShot) — document the recipe, no new object machinery.

Current head: v4.25.1 (Phase 31 movers). **Phase 32 is next free; do NOT pin a doc version** — the arch-doc changelog is missing v4.25.x entries (the mover session hasn't written them); re-read the changelog head at merge time.

## 1. Types (`src/types.ts`)

```ts
export interface ItemDef {
  id:          string;   // itm_<uuid8> — the inventory key is `inv.<id>`
  label:       string;
  icon?:       string;   // bare URL/path used as <img src> (DialogueDef.portrait precedent)
  description?: string;
  stackSize?:  number;   // max count; absent = unlimited
}
```

- `WorldConfig` (~types.ts:411-422): add `items?: ItemDef[]` beside `stateSchema`/`scripts`. Serializes free via `WorldState.toJSON()` (WorldState.ts:619-622).
- `ActionType` (~819-841): add `'give_item' | 'take_item'`. `ConditionType` (~813-817): add `'has_item'`.
- `ScriptAction`: add `itemId?: string; count?: number` (count default 1). `ScriptCondition`: add `itemId?: string; count?: number` (has_item: owned ≥ count, default 1).
- Bus events: `"bag:toggle": {}` (manager → shells), `"bag:show": {}` / `"bag:closed": {}` (shells → ControlSchemeManager, mirroring pause).
- `ActionState` (src/input/actions.ts): add one-frame edge `bagPressed: boolean` (+ zero in `zeroActionState`).

## 2. Engine (`src/scripting/ScriptEngine.ts`)

Key = `` `inv.${itemId}` ``. **Clamp inline, not via schema** — `gameState.adjust()` only clamps *registered* keys (GameState.ts:56-69, 83-89), and `inv.*` keys are unregistered:

- `give_item`: read registry (`this._state.world?.items`), `cur = Number(gameState.get(key) ?? 0)`, `gameState.set(key, Math.min(cur + count, item?.stackSize ?? Infinity))`. Unknown itemId → `console.warn`, still adds (authors may hand-type cross-world ids) — or warn + no-op; **recommend warn + still-add** so hand-authored ids work, matching the "(custom)" picker philosophy.
- `take_item`: `gameState.set(key, Math.max(cur - count, 0))` — floor at 0, no failure signaling; authors gate with `has_item`.
- `has_item` in `checkConditions`: `Number(gameState.get(key) ?? 0) >= (count ?? 1)`.
- Helper for the bag: `getOwnedItems(): { def: ItemDef | null; id: string; count: number }[]` — scan `gameState.snapshot()` for `inv.*` keys with count > 0, join against `world.items` (null def = deleted/unknown item → bag shows raw id fallback). Export from ScriptEngine or a small `src/scripting/inventory.ts` module (recommend the module: pure function `ownedItems(world, gameState)` usable by both shells without engine access).

Dialogue options need **zero work** — `DialogueOption.conditions/actions` are plain `ScriptCondition`/`ScriptAction` dispatched via `checkConditions`/`runActions` (DialogueRunner.ts:58, 75).

## 3. Input (bag toggle, third menu-mode client)

- **bindings.ts**: `kbm.bag: string[]` default `["KeyI", "Tab"]`; `gamepad.buttons.bag: [3]` (Y). Deep-merge in `loadBindings` (menuNav precedent v4.24.2 — nested kbm merge already exists; `buttons` spread covers gamepad).
- **KeyboardMouseSource**: queue `_bagQueued` on keydown like confirm; apply → `state.bagPressed`. **GamepadSource**: `_anyEdge(pad, b.buttons.bag)` → `state.bagPressed`. **TouchSource/TouchControlsOverlay**: 🎒 button (top-right, below ⚙, same `btnBase` style) sets `shared.bagQueued = true` on pointerup (the ⚙ `cancelQueued` pattern, TouchControlsOverlay.tsx:134-144); TouchSource.apply maps it to `bagPressed`.
- **ControlSchemeManager**: add `_bagOpen` + `bag:show`/`bag:closed` subscriptions (init(), lines 60-63 pattern); `_menuMode` getter becomes `_dialogueOpen || _pauseOpen || _bagOpen`. In `update()`: emit `bus.emit("bag:toggle", {})` on `state.bagPressed` edge — **before** menu-mode zeroing consumes it, and preserve `bagPressed` through the zero like `cancelPressed`/`menuNav` (lines 119-133) so the same key closes the bag. Manager stays dumb: it always emits the edge; the shells decide.
- **Shells own open/close state** (the `pauseOpen` pattern): `bagOpenRef` + `bagOpen` state in both App.tsx and RuntimeApp.tsx. `bag:toggle` handler cascade: **ignore while dialogue open or paused**; else toggle bag (emit `bag:show`/`bag:closed`). Extend the existing `action:cancel` cascade (App.tsx:457-471, RuntimeApp.tsx:143-155): bag open → close bag (before the pause branch). Clear bag state in the `preview:stop` handlers (where pause/dialogue already clear).

## 4. Bag UI (`src/ui/BagOverlay.tsx`, new) — built as container + swappable style renderer

**Future-proofing requirement (user):** other games may need custom/variant bag UIs (e.g. pick 1 of ~4 general styles later). Bake in the seam now, build only one style:

- **Three-layer split.** (a) *Data*: `ownedItems()` in `src/scripting/inventory.ts` — pure, UI-free (already planned). (b) *Container*: `BagOverlay` owns everything a variant must never reimplement — bus subscriptions (`menu:nav`, `action:confirm`, `state:changed` re-compute), highlight index state, close wiring, backdrop. (c) *Style renderer*: a purely presentational component receiving `{ items: OwnedItem[], selectedIndex, onSelect(i), onClose }` — no bus, no gameState.
- **Style registry**: `const BAG_STYLES: Record<string, ComponentType<BagStyleProps>> = { list: BagListStyle }` — container picks `BAG_STYLES[world.world?.playerSettings?.bagStyle ?? "list"] ?? BagListStyle`. `PlayerSettings` gains optional `bagStyle?: string` (world data — a game's identity, same home as `cameraMode`). **v1 ships exactly one entry** (`list`); no editor dropdown until a second style exists (a future phase adds a component + a record entry + a PlayerSettings select — zero plumbing changes).
- Input/menu-mode plumbing (§3) lives entirely outside the renderer, so any future style (grid, radial, hotbar, full-screen) inherits toggle keys, gamepad nav, and pause/dialogue cascades for free.

**The `list` style** copies the PauseMenu idiom (bus props, `menu:nav` highlight w/ wrap, re-subscribe-on-state effect; PauseMenu.tsx):
- Content: centered panel, "INVENTORY" header, rows = icon `<img>` (or placeholder square), label (fallback: raw `inv.` key id in dimmed style), count (`×3`), description under the highlighted row. Empty state: "Nothing yet."
- Data: `ownedItems(...)` computed on open + re-computed on bus `state:changed` while open (rev-bump subscription) — a `give_item` firing behind the bag updates live.
- `action:confirm` = close (view-only v1); click backdrop / row does nothing destructive (backdrop click closes, matching PauseMenu).
- `onClose` → shells clear state + emit `bag:closed`.
- Mount in **both** App.tsx (~2040-2067 overlay block) and RuntimeApp.tsx (~296-336).
- PreviewHUD (optional, cheap): extend `EXIT_HINT`-style scheme hints with a bag hint (`I · bag` / `Y · bag`; touch has the button) — PreviewHUD.tsx:7-17 pattern.

## 5. Editor (`src/ui/ScriptPanel.tsx` + threading)

- **ITEMS tab**: `TabId` gains `"items"` (6 tabs: LEVEL/SELECTED/DIALOGUE/STATE/ITEMS — check strip fit; label `ITEMS`). `ItemsEditor` mirrors `SchemaEditor` (ScriptPanel.tsx:434-468 add/remove/replace idiom): rows with icon thumb + label + id badge; `+ New` → `{ id: itm_<uuid8>, label: "New Item" }`; fields label / icon path / description / stackSize (number, blank = unlimited); delete with confirm (note: scripts referencing the id keep working via the "(custom)" preserved option — same philosophy as dialogue deletion).
- **Persistence = the stateSchema pattern, NOT the dialogues pattern** (items are world-level): App state `items`, `handleItemsChange` doing `world.transaction("edit items", () => { world.world!.items = items; })` + `syncHistory()` + `setIsDirty` (mirror `handleStateSchemaChange`, App.tsx:1792-1795); set from `world.world?.items ?? []` on `world:loaded`.
- **Threading**: `items` prop App → LeftPanel → ScriptPanel → ScriptEditor → ActionRow → ActionFields (the exact `zoneDialogues` chain, App.tsx:1905 etc.), **plus into `ConditionRow`** (new prop — currently self-contained, ScriptPanel.tsx:1327; two call sites: ScriptEditor conditions list and DialogueOptionRow "Show if").
- **Pickers**: `ActionFields` cases `give_item`/`take_item` = item `<select>` (copy the show_dialogue dropdown incl. "(custom)" preservation, ScriptPanel.tsx:1586-1608) + count number input. `ConditionRow` case `has_item` = item select + count input. Add to `ACTION_TYPES`/`CONDITION_TYPES` lists.

## 6. Implementation order

1. `src/types.ts` — ItemDef, WorldConfig.items, action/condition types+fields, bus events, ActionState.bagPressed → typecheck
2. `src/scripting/inventory.ts` (ownedItems helper) + ScriptEngine dispatch/condition cases — console-playable (give via `__test.runAction`, assert `__gameState.get("inv.x")`) → typecheck
3. Input: bindings.ts, KeyboardMouseSource, GamepadSource, TouchSource/TouchControlsOverlay 🎒, ControlSchemeManager third client + toggle emission
4. `src/ui/BagOverlay.tsx` + App.tsx/RuntimeApp.tsx wiring (bag:toggle cascade, preview:stop clear, mount) + PreviewHUD hint → typecheck
5. Editor: App items state/handler → LeftPanel → ScriptPanel ITEMS tab + pickers + ConditionRow prop → typecheck
6. Browser verification (below), docs, commit straight to main (stage only this feature's files — other sessions' worlds/*.json WIP must not be staged)

## 7. Verification (TESTING.md golden path, editor tab)

1. Snapshot `worldeditor_autosave` (dump in slices per §3) before mutating.
2. Author 2 items via the **real ITEMS tab UI** (one with stackSize 5 + icon path, one plain). Verify `__world.toJSON().world.items` round-trips.
3. Console: spawn interactable pickup object with `on_interact` → `give_item(item1, 2)` + `despawn_object` (oneShot). `__test.enterGame()`; fire interact → assert `inv.<id> === 2`, object hidden; re-fire (oneShot) → still 2.
4. Clamp: `__test.runAction({type:"give_item", itemId, count: 99})` → count caps at 5. `take_item 99` → floors at 0.
5. `has_item` gating: dialogue option "Show if has_item ≥1" hidden/shown around give/take (proves dialogue integration).
6. Bag: real `KeyboardEvent` `KeyI` on document + `__preview.input.update(1/60)` (hidden-tab manager stepping, v4.24.2 session precedent) → bag opens, DOM shows item rows with counts; `menu:nav` moves highlight; movement zeroed (menu mode); `KeyI` again closes; `Tab` also toggles; `action:cancel` closes; **remember: nav + confirm in the same synchronous snippet reads a stale React closure — drive keys in separate tool calls**.
7. Gamepad: stub `navigator.getGamepads` (button 3 edge) → bag toggles.
8. Cascades: bag toggle ignored while dialogue open and while paused; Esc during bag → preview exits and bag state cleared (preview:stop).
9. Live update: with bag open, `give_item` via `__test.runAction` → row count updates without reopen.
10. Runtime shell smoke: `runtime.html?manifest=/demo/manifest.json` — bag opens with `I`, shows nothing yet ("Nothing yet."), save/Continue round-trips an `inv.*` key.
11. Regressions: `npm run typecheck` clean; pause menu + dialogue nav unaffected; no console errors beyond known automation noise.

## 8. Docs (per PLAN_UPDATE_GUIDE.md — both new phase section AND file-level sections; re-read changelog head at merge, don't pin)

- **WORLD_EDITOR_ARCHITECTURE.md**: new phase section; update bus-event table (bag:*), ScriptPanel tabs description, src tree (BagOverlay.tsx, inventory.ts), WorldConfig field list, the "Future systems → Item system" row (~6758) → shipped-with-deltas note (no equip/consume yet), ControlSchemeManager menu-mode description (third client).
- **DIALOGUES.md**: rewrite the "give/receive items" callout — now `give_item`/`take_item`/`has_item` with pickers; keep the counters explanation as the underlying model.
- **GAMEPLAY_STATE.md**: note the reserved `inv.*` prefix + registry relationship (check current content first).
- **HUMAN_TESTING.md**: new workflow — author items, make a pickup, open the bag (all schemes).
- **plans/phase-32-inventory.md** + **test-plans/phase-32-inventory.md** (committed).

## 9. Edge cases (by design)

- Unknown `itemId` in give/take: warn, still operates on the raw key (matches "(custom)" picker philosophy).
- Item deleted from registry while player holds it: bag row falls back to the raw id, dimmed; count still shown.
- `stackSize` lowered below held count: no retro-clamp (clamp applies on next give); harmless.
- Count ≤ 0: hidden from bag (key may remain at 0 in state — fine).
- Starting inventory: author a `stateSchema` default for `inv.<id>` via the STATE tab (New Game reset re-seeds registered defaults; document, no new machinery).
- Bag during dialogue/pause: toggle ignored. Bag + preview exit: cleared on `preview:stop` like pause.
- `ui:show` stub: leave untouched (bag uses its own events; adopting the stub adds nothing).
- Future bag variants: adding a style = new presentational component + one `BAG_STYLES` entry + (once ≥2 exist) a `bagStyle` select in the player-settings panel. The container/input/data layers never change; `bagStyle` is already serialized via PlayerSettings.
