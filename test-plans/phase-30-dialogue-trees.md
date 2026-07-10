# Phase 30 — Branching Dialogue Trees — Test Plan

> **Acceptance record (2026-07-09):** every check below PASSED in-browser
> (Chrome MCP, editor tab at `localhost:7373`, autosave snapshot-restored per
> TESTING.md §3). `npm run typecheck` clean after each layer.

## Automated golden path (console-driven, TESTING.md style)

Setup: author a 3-node tree on the active zone via `zone.dialogues = [...]`
(speaker "Guard"; `n1` has two lines and two options — A "I'm new here."
[effect `set_state met_npc=true`, next `n2`], B "We've met — got my reward?"
[condition `has_state met_npc`, effect `adjust_number coins +5`, end]);
`__test.spawnObject({ id: "test_npc" })` marked interactable with an
`on_interact` → `show_dialogue { dialogueId }` script; a zone script on
`on_dialogue_end` (target = the dialogue) setting `dlg_done`. Enter game via
`__test.enterGame()`; the preview:start handler re-indexes console-authored
scripts (App.tsx:424-427).

| # | Check | Result |
|---|---|---|
| 1 | `fire("on_interact")` → overlay shows speaker + node 1 line 1; `dialogue:show` payload carries pre-filtered `options` (gated option B **absent**, `hasNext:true` on A) | PASS |
| 2 | `action:confirm` advances to line 2 (last) → option list renders, gated option hidden, footer flips to "▶ E to choose" | PASS |
| 3 | Confirm selects option A → `met_npc === true`, node 2 renders (overlay state replaced by the runner's next `dialogue:show`) | PASS |
| 4 | End option on node 2 → overlay closes, `dlg_done === true` (`on_dialogue_end` fired), `coins` untouched | PASS |
| 5 | Re-interact → **both** options now visible (flag set); `menu:nav {dir:1}` moves highlight to B (`▸` marker) | PASS |
| 6 | Confirm on B → `coins === 5` (give-item-as-counter), dialogue ends (no `next`) | PASS |
| 7 | Legacy inline fallback: `__test.runAction({ type:"show_dialogue", dialogue:{ speaker, lines } })` plays linearly ("E to close", no options) | PASS *(fallback removed in v4.24.1 — inline data is now migration-only; rows 7-8 are historical)* |
| 8 | `action:cancel` on the legacy dialogue → closes, does **not** fire `on_dialogue_end` (tree id `""`) | PASS *(see row 7 note)* |
| 9 | `action:cancel` mid-tree-dialogue → closes, **does** fire `on_dialogue_end`; pause menu did NOT open behind it (Phase 24b invariant) | PASS |
| 10 | `__world.toJSON()` round-trips `zone.dialogues` (registry + 2 nodes) | PASS |
| 11 | `migrateDialogues` on a synthetic legacy file (object script + world script with inline `dialogue`) → registry entries created (world's parked in zones[0]), actions rewritten to `dialogueId`, inline field deleted | PASS |

## Editor UI (real clicks)

| # | Check | Result |
|---|---|---|
| 12 | SCRIPTS panel shows 4 tabs: LEVEL / SELECTED / DIALOGUE / STATE; DIALOGUE tab shows the blurb | PASS |
| 13 | + New creates a dialogue (default `n1` start node), opens the editor, persists to `zone.dialogues` via `handleZoneDialoguesChange` | PASS |
| 14 | + Add node creates `n2`; unreachable-node warning appears until an option points at it | PASS |
| 15 | Option next-node select writes `option.next`; deleting the target node shows the red dangling badge + `(missing!)` select entry | PASS |
| 16 | Start-node delete button is disabled (tooltip explains) | PASS |
| 17 | Option "Show if" + Add → `has_state` ConditionRow renders and lands in `option.conditions`; "On pick" + Add → `set_state` ActionRow renders and lands in `option.actions` | PASS |
| 18 | show_dialogue ActionFields is a dialogue-picker dropdown listing the zone's trees + "Manage dialogues in the DIALOGUE tab" hint; `on_dialogue_end` present in the trigger dropdown with a dialogue TargetPicker | PASS |

## Regressions

- Console: no errors from the feature (only test-harness artifacts: dummy
  asset id warning from `__test.spawnObject`, pointer-lock exception in the
  hidden automation tab).
- `npm run typecheck` → 0 errors.
- Known synthetic-test artifact (not a product bug): clicking two "+ Add"
  buttons of the same option in one `javascript_tool` tick clobbers the first
  add (stale-closure snapshot — same class of issue as the TESTING.md §3
  `useFieldDebounce` note). Real sequential clicks are fine.

## Manual walkthrough

See HUMAN_TESTING.md → "Workflow: author & run a script action" → **Scenario D
— branching dialogue tree**.
