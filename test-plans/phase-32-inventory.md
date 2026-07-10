# Phase 32 — Item Registry + Inventory (Bag) — Test Plan

> **Acceptance record (2026-07-10):** every check below PASSED in-browser
> (Chrome MCP; editor tab + runtime shell at `localhost:7373`; autosave
> snapshot-dumped and restored per TESTING.md §3). `npm run typecheck` clean
> after each layer. Hidden-tab key tests drive real `KeyboardEvent`s on
> `document` + manually stepped `__preview.input.update(1/60)` (v4.24.2
> precedent).

## Registry + engine (editor tab)

| # | Check | Result |
|---|---|---|
| 1 | ITEMS tab present (LEVEL/SELECTED/DIALOGUE/STATE/ITEMS); 2 items authored via the real UI (label/stackSize 5/description via controlled inputs); `__world.toJSON().world.items` round-trips both | PASS |
| 2 | Pickup recipe: interactable object, `on_interact` → `give_item ×2` + `despawn_object`, oneShot → interact gives `inv.<id> = 2`, mesh hidden; re-fire stays 2 | PASS |
| 3 | `give_item ×99` clamps to stackSize (5); `take_item ×99` floors at 0 | PASS |
| 4 | `has_item` semantics: count 5 true at 5, count 6 false; false at 0 with default count | PASS |

## Bag overlay + input

| # | Check | Result |
|---|---|---|
| 5 | Real `KeyI` opens the bag: INVENTORY panel, icon/label/×count rows, highlighted item's description | PASS |
| 6 | Live refresh: `give_item` while the bag is open updates ×3→×4 without reopening | PASS |
| 7 | `menu:nav` moves the highlight (description follows); menu mode active while open (movement zeroed) | PASS |
| 8 | Real `Tab` closes; menu mode releases | PASS |
| 9 | Enter (menu-mode confirm) closes the view-only bag WITHOUT opening the pause menu behind it | PASS |
| 10 | Toggle suppressed while a dialogue is open and while paused | PASS |
| 11 | Stubbed gamepad Y (button 3) edge toggles open and closed | PASS |
| 12 | Bag state cleared on preview exit (`preview:stop`) | PASS |

## Runtime shell

| # | Check | Result |
|---|---|---|
| 13 | `runtime.html?manifest=/demo/manifest.json` → New Game → `I` opens the bag, "Nothing yet." empty state; HUD hint shows "I · bag" | PASS |
| 14 | Unregistered item id (`give_item demo_token` with no registry): warns, bag shows the dimmed raw-id fallback row ×2 live | PASS |

## Regressions

- Pause menu + dialogue nav unaffected (checks 9-10 exercise the cascades).
- Console: only known automation artifacts (pointer-lock exception, dummy-asset
  warning from `__test.spawnObject`).
- Occlusion mode: bag toggle is suppressed there by design (Tab = vantage
  switch) — covered by code guard in App's `bag:toggle` handler.

## Manual walkthrough

HUMAN_TESTING.md → "Workflow: items & the inventory bag (Phase 32)".
