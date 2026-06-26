# Phase 12 — Group Bulk Operations

The Groups left panel is now an **accordion**. Each group expands to show its members plus an
action bar: **Add selected**, **Select** (all members), **Duplicate**, **Delete**. Members can be
removed individually (`×`). Builds on the existing multi-select (`phase-11-multi-select`) and adds
one new engine event, `selection:set`, for programmatic selection.

> Closes the bulk-operations work deferred in Phase 10.9. Architecture: see **Phase 10.9b — Group
> Bulk Operations** in `WORLD_EDITOR_ARCHITECTURE.md`.

## What shipped

- **`src/editor/groupMembers.ts`** (new) — `membersByGroup(world)` (one O(entities) sweep →
  `Map<groupId, GroupMember[]>`), `entityGroupIds(world, ref)`, `writeGroupIds(world, ref, ids)`
  (type→mutator dispatch).
- **`selection:set`** bus event — `SelectionManager._setSelection(refs)` replaces the whole
  selection from a ref list: resolves to live meshes (skips missing, dedups walls sharing a run
  mesh), first = primary / rest = extras, tints all, emits `object:selected` + `selection:changed`.
  Empty list → `object:deselected`.
- **`GroupPanel.tsx`** — accordion with chevron, member-count badge, action bar, per-member remove.
- **`App.tsx`** — `membershipRev` counter (bumped on `*:updated` w/ `changes.groupIds`, all
  `*:removed`, and `*:added` carrying `groupIds`) drives a memoised `groupMembers`. Handlers:
  add-selected, remove-member, select-members; `deleteRefs`/`duplicateRefs` extracted from the
  multi-select delete/duplicate paths and reused for group Delete/Duplicate.

## Automated checks (Chrome MCP, dev globals)

Run on `localhost:7373`. `window.__bus` is the rendered App bus; `selection:set` reaches
`SelectionManager` through it.

### 1. `selection:set` engine event

```js
const bus = window.__bus, scene = window.__scene;
const refs = [{ id:'<objId>', type:'object', zoneId:'demo' }, { id:'<platId>', type:'platform', zoneId:'demo' }];
let changed=null, primary=null;
const o1=bus.on('selection:changed',p=>changed=p.refs.map(r=>r.id));
const o2=bus.on('object:selected',p=>primary=p.id);
bus.emit('selection:set',{refs});
// changed === both ids; primary === refs[0].id; both roots tinted emissive 0x3366ff
bus.emit('selection:set',{refs:[]}); // → object:deselected; changed === []
o1(); o2();
```

Expected: both entities selected + tinted, primary is the first ref, empty list deselects.

### 2. UI flow (real clicks)

| # | Step | Expected |
|---|---|---|
| 1 | Open Groups panel, expand a group | Chevron rotates; action bar + member list appear; badge shows member count |
| 2 | Member rows | `type` prefix + `label ?? id`; per-member `×` |
| 3 | Click **Select** | All members tint/select; PropertiesPanel shows "N selected" + group gizmo |
| 4 | Multi-select 2 non-members, watch **+ Add selected (2)** | Button enables and shows the count |
| 5 | Click **+ Add selected (2)** | Both join the group; badge + member list update **live** (no reload) |
| 6 | Click a member's `×` | Removed from group; badge decrements live; entity not deleted |
| 7 | Click **Duplicate** | Each member cloned (+1 per type); clones keep `groupIds` so badge ~doubles live |
| 8 | Click **Delete** | All members' entities removed; badge → 0 live; non-members untouched |
| 9 | Undo (Ctrl+Z / toolbar) after Delete | Entities restored; badge restored live |

Verify counts/membership via `window.__world.zones.get('demo')` collections filtered by
`groupIds.includes(<gid>)`, and the badge via the panel DOM text.

## Regression

- `npm run typecheck` → 0 errors.
- No console errors during any group operation.
- Plain multi-select (shift-click), group move gizmo, copy/paste/duplicate/delete still work
  (Phase 11 unaffected — Delete/Duplicate share the extracted `deleteRefs`/`duplicateRefs`).

## Verified 2026-06-26

All of the above exercised via the Claude Chrome extension on the running dev server: `selection:set`
(multi-select + primary + tint + empty-deselect), accordion expand + badge, Select-all (tinted 3
members), Add-selected (3→5 live), remove-member (5→4 live), Duplicate (+1 each type; badge stale at
4 until the `*:added` membership bump was added, then correct at 8 after reload and live on undo),
Delete (8→0 live, non-members survived), undo (restored to 8 live). Console clean; typecheck clean.

> **Note:** the `demo` scene is the shared scratch level. This test left 4 duplicate entities in it
> (the Duplicate step, autosaved before a mid-test reload — past the undo horizon). Nothing was
> lost; reset via the toolbar **New** button if a pristine demo is wanted.
