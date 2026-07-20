# Phase 40 — Nested dialogue tree view (accordion responses)

> Supersedes `plans/phase-40-dialogue-flowchart.md` (fullscreen flowchart
> modal) — user decided a whole chart view isn't needed; the stack itself
> should *feel* nested instead.

## Context / problem

The DIALOGUE tab shows page nodes as a flat vertical stack; the routing lives
invisibly in each option's "Leads to" dropdown, so nothing about the layout
looks like branching. Requirement (user, 2026-07-19): render the target page
node **visually nested inside the response option that leads to it**, with
accordions to collapse, and **without continuously growing horizontal
padding** at depth (the panel is 320px wide).

Runtime untouched — pure editor rendering over the same `DialogueTreeDef`.
No new data fields (the flowchart plan's `editorPos` is dropped).

## Visual

```
START PAGE-NODE: [n1 — Halt! Who goes there?]

PAGE NODES                    [+ Add page node]

┌ n1 · start ──────────────────────────────┐
│ Halt! Who goes there?                    │
│ State your business.                     │
│ RESPONSE OPTIONS                  [+ Add]│
│                                          │
│ ▾ "I'm new here."             → n2     × │   ← accordion header (open)
│ ┃  Leads to [→ n2 — Welcome, stranger.]  │
│ ┃  Show if  (none — always shown) [+ Add]│
│ ┃  On pick  set_state met_npc     [+ Add]│
│ ┃ ┌ n2 ────────────────────────────────┐ │   ← the node it leads to,
│ ┃ │ Welcome, stranger.                 │ │     nested right here
│ ┃ │ RESPONSE OPTIONS            [+ Add]│ │
│ ┃ │ (no responses — ends)              │ │
│ ┃ └────────────────────────────────────┘ │
│                                          │
│ ▸ "We've met — got my reward?"  ⏹ ends × │   ← collapsed accordion
└──────────────────────────────────────────┘

⚠ Unreachable page nodes (nothing leads here):
┌ n3 ──────────────────────────────────────┐
│ …                                        │
└──────────────────────────────────────────┘
```

Rules that make a DAG render as a tree:

- The tree renders **from the start page-node down**: each option's body
  contains its own fields (Leads to / Show if / On pick) followed by the
  **full card of the node it leads to**, recursively.
- **A node is fully rendered only once** (first encounter, depth-first in
  option order). If another option leads to a node already rendered — a
  second parent, or a loop back — the option instead shows a jump chip:
  `↩ continues at n2 (shown above)` — clicking it scrolls to + flashes that
  card. No duplicates, no infinite recursion.
- Options that end show `⏹ ends` in their header (no nested card).
- **Unreachable nodes** (nothing points to them) render flat in a labeled
  section at the bottom — replacing today's ⚠ text warning with the actual
  cards, still editable, wire-able via any Leads to.

Depth / padding policy (the "no runaway indent" requirement):

- A nested node card is indented by a **thin 2px accent rail + 8px** relative
  to its parent option — 10px per level, **capped at 3 levels** (~30px max).
  Below the cap, deeper cards keep the same x; the rail color cycles through
  3 muted hues so adjacent depths still read as different levels.
- Option accordion headers keep today's full row width.

Accordion behavior (component state only, nothing persisted):

- Each **response option** is an accordion: header = ▸/▾ caret, response
  text (ellipsized), a route tag (`→ n2` / `⏹ ends` / `↩ n1`), and the
  existing × delete. Body = Leads to + Show if + On pick + the nested card.
- Default: options with a nested node start **open** down to depth 2, deeper
  starts collapsed; "ends" options start **collapsed** (their body is just
  the 3 fields).
- Node cards keep their existing anatomy (badge, lines textarea, per-node
  speaker) — no collapse on nodes themselves in v1; collapsing the option is
  enough.

Authoring flow bonus (cheap, high value): the **Leads to** dropdown gains a
final entry **"+ new page node…"** — picking it creates a node, wires the
option to it, and expands it nested in place. Writing a conversation becomes:
type response → "+ new page node" → type the reply → repeat. The top-level
"+ Add page node" button stays (creates an unreachable node at the bottom,
today's behavior).

## Implementation (all inside src/ui/ScriptPanel.tsx)

- **`DialogueEditor`** (~line 2519): replace the flat `dialogue.nodes.map(…)`
  with a recursive render: `renderNode(nodeId, depth, visited: Set<string>)`
  starting at `dialogue.startNode`, then the unreachable section (nodes not
  in `visited`, in array order). The existing unreachable computation
  (~line 2512) is reused; the ⚠ text row is replaced by the section header.
- **`DialogueNodeCard`**: stays the single source of node editing; gains
  `depth` + `renderNestedNode` props (a callback the option rows use), so
  recursion stays in DialogueEditor and the card stays dumb.
- **`DialogueOptionRow`**: becomes the accordion — `open` state
  (`useState`, seeded from the depth-2 default), header row (caret + text
  snippet + route tag + ×), body renders today's fields + `renderNestedNode
  (option.next)` (which returns the nested card, the `↩ continues at` chip,
  or null). The "+ new page node…" sentinel is added to the Leads to select
  (`value="__new__"` → create node `nX`, set `next`, open accordion).
- Scroll-to + flash for jump chips: `id={"wb-dlgnode-" + node.id}` on cards,
  `scrollIntoView({behavior:"smooth"})` + a brief outline animation (CSS
  keyframe injected like existing inline styles).
- Delete/start-node guards, dangling `(missing!)` handling, and all
  validation stay exactly as today (a dangling next renders a red note in
  the option body, no nested card).

## Docs

- **DIALOGUES_GUIDE.md**: rewrite "What that looks like in the editor"
  around the nested view (retake `dialogue-branching.png` — same Guard-intro
  content, now showing actual nesting); update the branch recipe ("+ new
  page node…" flow becomes step 1); JSON reference unchanged.
- **WORLD_EDITOR_ARCHITECTURE.md**: changelog entry (head+1 at merge, never
  pinned) + ScriptPanel file-section amendment; note the flowchart plan as
  superseded.
- **test-plans/phase-40-dialogue-nested-tree.md** with the feature.

## Verification (TESTING.md §3 protocol)

1. Commit/verify `public/games/**` clean first; snapshot + OPFS-stash the
   autosave.
2. Stage Guard intro (existing recipe): n2 renders nested inside option 1;
   option 2 shows `⏹ ends` collapsed; expand/collapse toggles.
3. Loop test: point n2's new option back at n1 → renders `↩ continues at n1`
   chip (no recursion); click chip → scrolls + flashes n1.
4. Diamond test: two options → same n2 → nested once, second shows the chip.
5. "+ new page node…" from an option → node created, wired, nested, open.
6. Depth cap: chain n1→n2→n3→n4→n5 → indent stops growing at level 3, rail
   hues still distinguish.
7. Unreachable section shows orphan cards; wiring one via Leads to moves it
   into the tree.
8. Scroll: deep tree still scrolls to the bottom (v4.33.10 fix intact).
9. `npm run typecheck` → 0; screenshots for the guide; cleanup per protocol
   (restore autosave, verify, close tab). No commits until user approves.

---

## Addendum (same session) — panel resize + design pass

User review of the first cut: functionally right, visually wrong ("no
separation, context, minimalism"; the Show if / On pick summary wrapped;
nesting still accumulated indent). Changes:

- **Resizable left panel** (`LeftPanel.tsx`): 6px drag strip on the right
  edge, pointer-captured, clamped 280–600px, persisted to
  `localStorage.wb_leftpanel_w`; width transition suspended while dragging.
- **Sibling nesting**: the nested node card renders BELOW the option well as
  a rail-connected sibling (fragment), not inside it — kills the box-in-box
  borders and makes the indent math exact: one inset at level 1, then
  **dead flat** (n1→n5 lefts 76/93/93/93/93, widths 295/269/269/269/269).
- **Option well design**: response text edits inline in the accordion
  header; route pills (blue `→ n2`/`↩ n1`, neutral `⏹ ends`, red `⚠`);
  LEADS TO micro-label; `▸ Show if / On pick · 1 cond · 2 effects` single
  no-wrap sub-row (collapsed by default) so the destination card sits
  directly under Leads to; ghost × / + Add buttons; RESPONSES header;
  8px spacing rhythm; single hairline borders.
