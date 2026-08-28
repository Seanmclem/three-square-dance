# Phase 65 — Script if-blocks (shared conditions, else / else-if)

> User ask (2026-08-28): "what if script action-if-blocks could have 2 or more
> actions that could be done under the same condition? … currently I need to do
> the same if-block twice for 2 separate actions. Also I want an else/else-if,
> in addition to an unless." Decisions from the assessment: an if-block is a
> real thing in the actions list holding 2+ actions; **else if** chain + one
> optional **else**; "unless" stays the per-condition `not` flag inside any
> branch; ONE level (no blocks in blocks); a block is evaluated ONCE when the
> script's actions start (after the trigger delay, before per-action delays) —
> the first passing branch wins, the others never run; the existing per-action
> ONLY IF (evaluated after the action's own delay) is migrated into
> single-action blocks and its UI retired — one construct, not two. Actions in
> a branch still dispatch in parallel with their own delays (ordered actions
> remain a separate, compatible phase). Out of scope: nested blocks, drag-and-
> drop between branches, blocks in dialogue-option / menu-option action lists.

## Data (types.ts)

Actions stay a FLAT array — every existing consumer of `actions[]` (export
asset collection, world loader, instanced pool, prefab target remap, dialogue
runner) keeps working untouched and cannot silently miss a nested action. A
block is a row in a per-script table; an action opts into a block by tag:

```ts
export interface ScriptBranch  { conditions: ScriptCondition[] }
export interface ScriptIfBlock {
  id:       string;          // blk_<uuid8>, unique within the script
  branches: ScriptBranch[];  // [0] = if, [1..] = else if — first passing branch wins
  else?:    boolean;         // an else branch exists (its actions are tagged branch -1)
}
// ScriptAction.block?: { id: string; branch: number }   // -1 = else
// ScriptDef.blocks?:   ScriptIfBlock[]
```

Actions without a tag are top-level (today's behaviour). Array order is
display order only (dispatch is parallel).

## Runtime (ScriptEngine)

- `selectBlockActions(script, ownerId)` (exported, pure): for each block pick
  the first branch whose conditions pass (`checkScriptConditions`, so entity
  scopes / "unless" / state_equals all apply), else the `else` branch if it
  exists, else nothing; return the actions whose tag matches (untagged = always;
  a tag pointing at a missing block = treated as untagged — lenient).
- `_runActions` calls it before `runActions` — i.e. after the trigger delay,
  before per-action delays. Timers/oneShot/enable semantics unchanged.
- `_ownedScript` also rewrites `"self"` → owner in block conditions.
- Legacy `action.conditions` keep evaluating in `_dispatch` (old scenes run
  unchanged); the editor migrates them on view (below).

## Editor (ScriptPanel)

- `migrateActionGuards(script)`: each action carrying `conditions` becomes a
  one-branch block (no else) tagged onto that action; pure, identity when
  nothing to migrate. `ScriptEditor` edits the migrated VIEW, so the first
  edit persists the new shape; untouched scripts stay byte-identical.
- Actions section renders groups in order of first appearance: plain
  `ActionRow`s and **if-block cards**. A card = per branch a label (IF /
  ELSE IF / ELSE), the same `ConditionRow`s as script-level conditions
  (same scope → ★ this object, entity keys, unless), `+ condition`, that
  branch's actions, `+ action here`; footer `+ else if`, `+ else` (when
  absent), `unwrap` (block removed, its actions become top-level — never
  deletes actions). Empty blocks render after the actions list until they
  get one.
- `ActionRow`: the `if` button now WRAPS the action in a new block (one
  blank condition) instead of adding a per-action guard; a `move to`
  select relocates the action (top level / IF #n / ELSE IF #n.m / ELSE #n);
  the ONLY IF sub-block UI is removed.
- `ScriptList` summary adds `· N if`. `harvestRefs` includes block
  conditions (key suggestions).

## Portability

`remapScripts` (prefab expansion, capture, copy/paste) remaps `entityId` /
`npcId` inside block conditions like script-level ones; block ids are
script-local so structuredClone keeps them valid.

## Files touched

`src/types.ts`, `src/scripting/ScriptEngine.ts`, `src/prefab/expand.ts`,
`src/ui/ScriptPanel.tsx`, `OBJECT_SCRIPTS_GUIDE.md` (per-action section →
if-blocks), arch doc changelog + ScriptEngine/ScriptPanel file sections,
`test-plans/phase-65-script-if-blocks.md`.

## Verification

- `npx tsc --noEmit`.
- Engine (shell tab, `__test`/`__scriptEngine`): a script with block
  {if A: [x, y], else if B: [z], else: [w]} — exactly the winning branch's
  actions dispatch for each state; a block with no else and all-fail runs
  nothing; top-level actions always run; a legacy per-action guard still
  evaluates after its delay (unchanged data).
- Editor: `if` on an action wraps it; `+ action here` adds into the branch;
  `+ else if` / `+ else`; `move to` relocates; `unwrap` keeps actions;
  a legacy script opens showing its guard as a block and saves the new
  shape on first edit. Screenshot for legibility.
- Prefab: capture an entity whose script has a block with a ★/entity-scoped
  condition, place a copy → the condition's entityId is remapped to the copy's
  member.
