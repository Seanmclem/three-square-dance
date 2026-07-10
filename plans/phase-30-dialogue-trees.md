# Phase 30 — Branching Dialogue Trees

> **Status: IMPLEMENTED** — shipped 2026-07-09 (v4.24.0). Verified in-browser
> end-to-end; acceptance record in `test-plans/phase-30-dialogue-trees.md`.

Origin: user request — "better NPC interaction, most specifically dialogue:
proper branching conversation system — multiple response options, conditional
branches based on flags, dialogue that can set flags or give/receive items,
replacing the current linear `lines[]` stub in `DialogueDef`." The architecture
doc had this parked as "Branching dialogue → Phase 12 (Dialogue system
redesign)".

## 1. Scope & decisions

**Decided (with user, do not relitigate)**
- **Items = gameState counters** via existing `adjust_number` / `set_state`
  actions — no new inventory system (matches the v4.1 generic-state design).
- **Storage = zone-level registry** (`ZoneDef.dialogues`); the `show_dialogue`
  action references a `dialogueId`. Legacy inline `dialogue` migrates on load.
- **Editor UI = ScriptPanel nested lists** (new DIALOGUE tab imitating the
  ConditionRow/ActionRow patterns) — no graph/modal editor.

**Reuse, don't reinvent**: option conditions are `ScriptCondition[]`
(`has_state`, `compare_number`); option effects are `ScriptAction[]` dispatched
through the ScriptEngine. Flags persist for free via the gameState save
snapshot.

## 2. Data model (`src/types.ts`)

```ts
DialogueOption { id, text, conditions?: ScriptCondition[],  // ALL must pass or hidden
                 actions?: ScriptAction[],                  // run on pick
                 next?: string }                            // node id; absent/missing = end
DialogueNode   { id, lines: string[], speaker?, portrait?, options: DialogueOption[] }
DialogueTreeDef{ id: "dlg_<uuid8>", label, speaker, portrait?, startNode, nodes }
```

- Branching only via options — nodes have no own `next`. A node with zero
  visible options (authored none, or all condition-filtered) ends after its
  last line. Legacy linear dialogue = one node, all lines, no options.
- `ZoneDef.dialogues?: DialogueTreeDef[]`; `ScriptAction.dialogueId?` (the
  deprecated `dialogue?: DialogueDef` is kept as a runtime fallback).
- `TriggerType` += `on_dialogue_end` (targetId = dialogue id; cancel counts).
- Bus: `dialogue:show` += `options?: { text, hasNext }[]` (pre-filtered;
  `hasNext` computed against existing nodes so a dangling `next` degrades to
  "end"); new `dialogue:choose { index }`.

## 3. Runtime — DialogueRunner owns the walk

New `src/scripting/DialogueRunner.ts`, owned by ScriptEngine (attach/detach in
`activate`/`deactivate`). Rationale: option effects/conditions need engine
internals (guards made public as `checkConditions`/`runActions`), both shells
(App + RuntimeApp) reuse it with zero composition wiring, and `on_dialogue_end`
needs `engine.fire`.

- `show_dialogue` dispatch: resolve `dialogueId` via `findDialogue(id)` (scans
  all zones — tiny data, cross-zone/world-script safe) → `runner.start(tree)`;
  else legacy inline `dialogue` → `wrapLegacyDialogue` (single-node tree, id
  `""` → no end trigger); else warn.
- Per node: filter options by conditions, emit `dialogue:show`. Conditions are
  re-checked on every node display, so an option effect (set flag) immediately
  gates later options in the same conversation.
- On `dialogue:choose {index}`: run the option's actions through `_dispatch`;
  advance to `next` if it exists (a `show_dialogue` inside the effects restarts
  the runner — last-writer-wins, guarded so the old tree isn't stepped).
- Close ownership stays with the overlay/shells exactly as before: end-option
  or last-line advance → `onClose()` → shell emits `dialogue:closed` → runner
  fires `on_dialogue_end`. Bus emits are synchronous, so choose (effects)
  always precedes closed (trigger). No new `dialogue:hide` event.
- **Zero input-layer work**: ControlSchemeManager's dialogue menu-mode already
  emits `action:confirm` + `menu:nav` for kbm/gamepad/touch. RuntimeApp needed
  no change (types dialogue state off `DialogueOverlayProps["dialogue"]`).

**DialogueOverlay**: options render once the last line is displayed; `menu:nav`
moves the highlight (wrap), confirm/row-click emits `dialogue:choose`,
`hasNext:false` selection also closes; box-click advance is disabled while
options are up.

## 4. Migration (`src/world/WorldLoader.ts`)

`migrateDialogues(file)` called beside `migrateUVs` at both pipeline sites
(App.tsx load, SceneRouter) — never inside `loadFromJSON` (undo snapshots reuse
it). Guard = per-action shape (`dialogue && !dialogueId`), no version bump
(parallel-session race; matches the `migrateWallNodes` precedent). Wraps each
legacy inline dialogue into a single-node tree in the owning zone; world-script
dialogues park in `zones[0]`.

## 5. Editor (`src/ui/ScriptPanel.tsx`)

- 4th tab **DIALOGUE**; `DialogueList`/`DialogueEditor` mirror
  ScriptList/ScriptEditor. Persistence mirrors the *scripts* pattern (App
  `zoneDialogues` state + `handleZoneDialoguesChange` direct mutation +
  `setIsDirty`, threaded through LeftPanel; serialization free via `toJSON()`)
  — no WorldState mutators, no undo journal.
- Node cards: id badge (`n1 · start`), lines textarea, speaker override,
  delete disabled on the start node. Per-node OptionRows: response text,
  next-node dropdown ("— end conversation —" + nodes w/ first-line preview,
  red `(missing!)` preservation), nested **Show if** (reuses `ConditionRow`)
  and **On pick** (reuses `ActionRow`, so an option can run any script action).
- Validation is render-time only (dangling-`next` badge + warning, unreachable
  -nodes footer note) — runtime degrades gracefully, saves never block.
- `show_dialogue` ActionFields → dialogue-picker dropdown (custom id
  preserved); `on_dialogue_end` in TRIGGER_TYPES + a dialogue TargetPicker case.

## 6. Files touched

| File | Work |
|---|---|
| `src/types.ts` | tree types, `ZoneDef.dialogues`, `dialogueId`, `on_dialogue_end`, bus events |
| `src/world/WorldLoader.ts` | `migrateDialogues` |
| `src/scripting/ScriptEngine.ts` | public `checkConditions`/`runActions`, `findDialogue`, new `show_dialogue` case, owns the runner |
| `src/scripting/DialogueRunner.ts` | new — tree walk, option filtering, choose handling, `on_dialogue_end` |
| `src/ui/DialogueOverlay.tsx` | option list, `menu:nav` highlight, `dialogue:choose` emit |
| `src/App.tsx` | migration call, `zoneDialogues` state + handler, props |
| `src/runtime/SceneRouter.ts` | migration call |
| `src/ui/LeftPanel.tsx` | prop threading |
| `src/ui/ScriptPanel.tsx` | DIALOGUE tab, Dialogue{List,Editor,NodeCard,OptionRow}, picker, trigger |

## 7. Edge cases (by design)

All options filtered out → ends after lines. Dangling `next` → `hasNext:false`
ends gracefully (editor badge warns). Legacy inline data (unmigrated,
hand-authored JSON) still plays via the runtime fallback but fires no
`on_dialogue_end`. Save games unchanged — flags/counters ride the existing
gameState snapshot; mid-dialogue UI state deliberately not saved.
