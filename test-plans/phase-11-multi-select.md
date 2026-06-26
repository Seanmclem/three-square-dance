# Phase 11 — Multi-select (group move + multi copy/paste/delete)

Shift/Cmd-click builds a multi-selection across mixed entity types. The selection can be
**moved together** (translate-only group gizmo, relative positions preserved), **copied**,
**pasted**, **duplicated**, and **deleted** as one undoable step. Rotate/scale remain
single-select only.

## What shipped

- **Click modifiers** — `input:click` now carries `shift`/`ctrl`/`meta` (`InputManager`).
- **Selection model** (`SelectionManager`) — keeps a primary `_selected` plus `_extraRefs`.
  Shift/Cmd-click toggles a picked entity in/out of the set; plain click replaces. All
  selected entities are tinted; extras re-tint after mesh rebuilds and are pruned on removal.
  Emits a new `selection:changed { refs: SelectedRef[] }` event on every set change while
  still emitting `object:selected`/`object:deselected` for the primary.
- **`SelectedRef`** gains `memberIds?` so a wall **run** carries all its segment ids.
- **Group gizmo** (`GizmoManager`) — on `selection:changed` with >1 ref, enters translate-only
  group mode: pivot at the centroid, tracks every selected mesh, ignores T/R/S switches.
  `_commitGroupTranslate` applies the shared delta per entity via `_translateRef`, deduping
  shared nodes (a corner shared by two selected walls moves exactly once). Re-tracks meshes
  after post-commit rebuilds.
- **Mixed-type clipboard** (`copyPaste.ts`) — `Clipboard.entities` is now a typed list;
  `copySelectionMulti` clones a multi-selection with one shared, deduped node list;
  `pasteClipboard` loops entities with a single shared `nodeMap` (shared corners stay shared)
  and returns all pasted refs.
- **App + PropertiesPanel** — `multiSelected` state from `selection:changed`; Copy / Paste /
  Duplicate / Delete operate on the whole set in one transaction when >1; an "N selected"
  panel view with bulk-action buttons.

## Out of scope (later)

Group rotate/scale, marquee drag-select, cross-zone multi-select.

## Verification (data layer + gizmo commit event)

Run in the editor console against the demo zone (`__world`, `__bus`, `__scene`, `__history`,
`__copyPaste`). All passed:

1. **Group translate** — built a mixed set (object + node-backed platform + two walls sharing a
   node) via `selection:changed`; moved the gizmo pivot and dispatched
   `dragging-changed{value:false}`:
   - every entity shifted by the same delta (relative positions preserved); Y unchanged on XZ move
   - the shared node moved **exactly once** (value = before + delta, not + 2·delta)
   - **one** `__history.undo()` reverted the whole move.
2. **Multi paste** — mixed clipboard (2 walls sharing a corner + an object) →
   `pasteClipboard`: 3 entities cloned with new ids, the shared corner cloned **once**
   (3 distinct nodes, 3 nodes added), originals untouched; one undo removed the whole paste.
3. **Multi delete** — selected 2 platforms + a stair, pressed **Delete** (real React keyboard
   path): all 3 removed; one undo restored all three.
4. No console errors throughout.

## Needs human confirmation (UI feel, can't be driven synthetically)

- Shift/Cmd-click picking and the tint on each selected entity.
- The actual mouse-drag of the group gizmo (commit path is verified; drag feel is not).
- The "N selected" panel buttons visually.
