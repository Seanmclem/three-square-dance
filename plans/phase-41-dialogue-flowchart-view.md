# Phase 41 — Dialogue Flowchart View (secondary, docked beside the panel)

> Revives the superseded `plans/phase-40-dialogue-flowchart.md` in **modified
> form** (user request, 2026-07-21). The delta from that plan: no fullscreen
> modal with its own side pane — the **left panel stays open and stays the
> primary editor**; the flowchart is an optional secondary view that covers
> everything to the **right** of the panel. "The card stack is the primary one
> and has what it needs; the flowchart view is a great addition that can
> sometimes be used, but not primarily."

## What shipped

- **Flowchart** toggle button in the `DialogueEditor` header (next to ←).
- **`src/ui/DialogueFlowchart.tsx`** — overlay docked from the panel's right
  edge to the viewport edge (`position:fixed; top:48; right:0; bottom:0`,
  `left` tracks `#wb-leftpanel`'s live right edge via ResizeObserver, so it
  follows the panel resize drag). **Portaled to `<body>`** — rendered in
  place it inherits LeftPanel's stacking context (zIndex 9) and the
  PropertiesPanel (zIndex 10) draws over it. zIndex 55 (under modals at 60+).
- **Boxes**: id badge (`n1 · start`), effective speaker (node override ??
  dialogue speaker), a two-line preview of the node's lines, then one **port
  row per response** — its text plus a port dot on the right edge (blue =
  wired, grey = ends, red = dangling target).
- **Edges**: SVG cubic beziers from each port to the top of the destination
  box, arrowhead marker. Ending responses and option-less nodes get an
  **`end`** chip; a dangling `next` gets a red **`⚠ <id> missing`** chip;
  unreachable nodes get an **amber outline** (same walks the panel uses).
  No edge labels — the port rows already carry the response text (delta from
  the Phase 40 mockup).
- **Primary/secondary split**: clicking a box calls the panel's existing
  `jumpToNode` (scroll + WAAPI flash on `#wb-dlgnode-<id>`) — all editing
  happens in the panel; the chart redraws live because both render the same
  `dialogue` prop through the same `onChange` path.
- **Positions**: drag a box to write `DialogueNode.editorPos?: {x,y}` (new
  optional field — editor-only semantics, runtime ignores it, serializes
  with the zone like `PlatformDef.editorGhost`). Layered-BFS auto-layout is
  used for nodes without it; **Auto-arrange** recomputes and writes all
  positions. View auto-fits on open.
- **Navigation**: drag background to pan, scroll to zoom (0.4–1.6,
  cursor-anchored, native non-passive wheel listener), Esc / ✕ close.

## Implementation notes (gotchas hit)

- `createPortal` to `<body>` is required — see stacking-context note above.
- The drag commit **recomputes the final position from the pointerup event**
  rather than reading the `drag` state: state lags a render behind the
  event stream, which drops fast drags entirely.
- `left` is seeded **synchronously** in `useState(() => …)` so the
  mount-time auto-fit measures the real canvas width (a `useLayoutEffect`
  seed left the first fit measuring a full-viewport canvas).
- `setPointerCapture`/`releasePointerCapture` are wrapped in try/catch —
  synthetic pointer events (tests) have no live pointer and would throw.

## Out of scope (unchanged from Phase 40's list)

Drag-to-connect edge creation / retargeting; node creation from the chart
(the panel's "+ Add page node" and "＋ new page node…" cover it — the chart
shows a new node immediately); minimap; multi-select drag.

## Acceptance

`test-plans/phase-41-dialogue-flowchart-view.md`.
