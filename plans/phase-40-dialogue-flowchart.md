# Phase 40 — Dialogue Flowchart View (visual branching editor)

## Context / problem

The DIALOGUE tab edits a branching tree, but the editor shows a **vertical
stack of page-node cards** — the routing lives invisibly inside each response
option's "Leads to" dropdown. The data is a graph; the UI is a list. User
feedback (2026-07-19): the nodes don't *feel* nested or branching — the editor
should be able to look like the flowchart the guide draws in ASCII.

Scope decided with the user: **fullscreen flowchart overlay + side-pane
editing** — auto-layout, draggable node boxes with persisted positions, click
a node to edit it with the full existing card UI in a side pane. The
drag-to-connect "full graph editor" tier (create/retarget options by dragging
arrows) is explicitly deferred; this design can grow into it.

The runtime is untouched — this is pure editor UI over the same
`DialogueTreeDef`.

## Visual — what the overlay looks like

```
┌──────────────────────────────────────────────────────────────┬───────────────────────┐
│ FLOWCHART — Guard intro    [+ Add page node] [Auto-arrange]  │ EDIT PAGE NODE        │
│                                                          [✕] │ ┌───────────────────┐ │
│                                                              │ │ n1 · start        │ │
│              ┏━━━━━━━━━━━━━━━━━━━━━━┓                        │ │ [Speaker for…]  × │ │
│              ┃ n1 · start           ┃  ← selected:           │ ├───────────────────┤ │
│              ┃ "Halt! Who goes…"    ┃    blue outline        │ │ Halt! Who goes    │ │
│              ┃──────────────────────┃                        │ │ there?            │ │
│              ┃ ▸ I'm new here.     ●┃──┐                     │ │ State your busi…  │ │
│              ┃ ▸ We've met — got…  ●┃─┐│                     │ ├───────────────────┤ │
│              ┗━━━━━━━━━━━━━━━━━━━━━━┛ ││                     │ │ RESPONSE OPTIONS  │ │
│                                       ││                     │ │ ┌───────────────┐ │ │
│                 "We've met — got…"    ││  "I'm new here."    │ │ │ I'm new here. │ │ │
│                          ┌────────────┘│                     │ │ │ Leads to [→n2]│ │ │
│                          ▼             │                     │ │ │ Show if  …    │ │ │
│                       ╭─────╮          │                     │ │ │ On pick  …    │ │ │
│                       ╰ end ╯          ▼                     │ │ └───────────────┘ │ │
│                                 ┏━━━━━━━━━━━━━━━┓            │ │ ┌───────────────┐ │ │
│                                 ┃ n2            ┃            │ │ │ We've met —…  │ │ │
│   (pan: drag background)        ┃ "Welcome,     ┃            │ │ │ …             │ │ │
│   (zoom: scroll wheel)          ┃  stranger."   ┃            │ │ └───────────────┘ │ │
│   (move node: drag its box)     ┗━━━━━━━━━━━━━━━┛            │ │ [Set as start]    │ │
│                                                              │ └───────────────────┘ │
└──────────────────────────────────────────────────────────────┴───────────────────────┘
```

Anatomy:

- Each **page node = a box**: id badge on top (blue `n1 · start`, same as the
  panel badge), the NPC's first line(s), then one **port row per response
  option** (▸ its text, with a ● port on the right edge where its arrow
  leaves).
- **Arrows** curve from an option's port to the top of the node it leads to,
  labeled with the option text. Options that end the conversation get a short
  arrow into a rounded **end** chip instead.
- **Click a box** → blue outline + its full existing edit card (lines,
  RESPONSE OPTIONS with Leads to / Show if / On pick) loads in the right
  pane; edits redraw the graph live (retarget a Leads to and the arrow
  moves).
- **Drag a box** to rearrange (position saved); **Auto-arrange** re-lays out
  layer by layer from the start node — start on top, branches fanning
  downward, like the guide's chart.
- Red arrow + `(missing!)` chip for dangling targets; amber outline for
  unreachable nodes — the same validations the card stack shows today.

## Data (src/types.ts)

`DialogueNode.editorPos?: { x: number; y: number }` — optional, editor-only
semantics but serialized with the zone (precedent: `PlatformDef.editorGhost`).
The runtime ignores it. Auto-layout is used when absent.

## New component: src/ui/DialogueFlowchart.tsx

Fullscreen overlay per the established modal idiom (`position:fixed, inset:0,
zIndex:100, rgba(0,0,0,0.6)` — see `ModelImporterModal.tsx`, `BakeDialog.tsx`).

Layout: toolbar (title "FLOWCHART — {label}", **+ Add page node**,
**Auto-arrange**, **✕ Close** / Esc) · left = pannable canvas · right = side
pane (~340px).

**Canvas** (hand-rolled, no new dependencies):

- Node boxes = absolutely-positioned HTML divs inside a transformed container
  (pan = drag on background with pointer capture; zoom = wheel, clamped
  ~0.5–1.5×).
- Edges = one underlying `<svg>` with cubic beziers + arrowhead markers, each
  leaving its option's port row and entering the target box top; label =
  option text snippet at the midpoint. End terminals per the mockup.
- Click node → select; click canvas → deselect. Drag node header → move;
  commit `editorPos` on pointerup via the tree `onChange` (nodes.map).
- **Auto-layout**: layered BFS from `startNode` (layer = BFS depth;
  unreachable nodes in trailing layers); y = layer spacing, x = centered
  within layer. Used for nodes without `editorPos`; **Auto-arrange**
  recomputes and writes all positions. A newly added node is placed below the
  deepest layer and selected.

**Side pane**: renders the existing **`DialogueNodeCard`** for the selected
node (full editing — zero duplicated UI), plus a "Set as start page-node"
button when the selected node isn't the start. Empty state: "Click a page
node to edit it here."

## Wiring (src/ui/ScriptPanel.tsx)

- `DialogueEditor` header gains a **Flowchart** button (next to ←):
  `showFlowchart` state → renders `<DialogueFlowchart …/>` with the props
  DialogueEditor already holds (dialogue, onChange, worldItems,
  projectSceneIds, all zone entity lists for ActionRow pickers).
- Export `DialogueNodeCard` from ScriptPanel.tsx so the new file can reuse it
  (ScriptPanel is ~3.2k lines — don't grow it further).
- All edits flow through the existing `onChange(dialogue)` path — same
  persistence behavior as panel edits.

## Docs

- **DIALOGUES_GUIDE.md**: update "What that looks like in the editor" ("the
  editor doesn't draw the flowchart" → "…unless you open the **Flowchart**
  view"); new "The flowchart view" subsection with a real screenshot
  (`docs/images/dialogue-flowchart.png`) of the Guard-intro graph; JSON
  reference notes `editorPos` (editor-only).
- **WORLD_EDITOR_ARCHITECTURE.md**: changelog entry (version = head+1 at
  merge — never pinned in this doc); Phase 40 section + ScriptPanel/types
  file-level amendments per PLAN_UPDATE_GUIDE.
- **test-plans/phase-40-dialogue-flowchart.md** committed with the feature.

## Verification (TESTING.md §3 protocol throughout)

1. Commit any dirty `public/games/**` first; snapshot + OPFS-stash the
   autosave before mutating.
2. Stage the Guard-intro tree (staging recipe from the v4.33.10/11 sessions),
   open Flowchart: assert DOM — 2 node boxes, 2 edges (one to n2, one to an
   end terminal), labels correct. Temporarily stage a 3rd orphan node and a
   dangling `next` to verify amber/red states.
3. Drag n2 (dispatch pointerdown/move/up on its header): box moves; close +
   reopen → position kept; `editorPos` present in the tree data.
4. Side pane: edit a line, add an option, retarget its Leads to — the card
   stack in the panel reflects it after close; Set-as-start swaps the badge.
5. Auto-arrange after scattering nodes → layered layout, no overlaps for the
   demo graphs (level_01's `dlg_l1_welcome` included).
6. Esc and ✕ both close; no console errors; `npm run typecheck` → 0.
7. Screenshot for the guide (modal is viewport-sized — single capture).
8. Cleanup per protocol (restore autosave, verify no staged ids, delete the
   OPFS backup only after verifying, neuter `localStorage.setItem`, close the
   tab). Commit straight to main + push.

## Out of scope (recorded follow-ups)

Drag-to-connect edge creation / retargeting by dragging arrowheads /
double-click-canvas node creation (the "full graph editor" tier); minimap;
multi-select drag.
