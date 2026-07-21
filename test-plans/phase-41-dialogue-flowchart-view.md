# Phase 41 — Dialogue Flowchart View — acceptance record

Verified 2026-07-21 in Chrome (extension MCP), against the user's real
6-node "Blue Bunny Talk" tree in the autosaved world. Autosave protocol
observed: pre-session snapshot + OPFS stash, restore verified at session end
(`editorPos`-free value byte-identical), backup deleted only after the
verify, `localStorage.setItem` neutered before tab close.

| # | Check | How | Result |
|---|---|---|---|
| 1 | Open via real UI | real mouse click on **Flowchart** in the dialogue header | ✅ overlay opens, toggle highlights |
| 2 | Docking | overlay rect vs `#wb-leftpanel` rect | ✅ left edge = panel right edge (622px), top 48, to viewport edge |
| 3 | Covers the right side | portal + zIndex | ✅ portaled to `<body>`; covers canvas **and** PropertiesPanel (first cut rendered UNDER the PropertiesPanel — LeftPanel stacking context, fixed with `createPortal`) |
| 4 | Graph correctness | DOM counts vs tree data | ✅ 6 boxes, 8 edges (5 wired + 2 ending responses + 1 option-less node), 3 `end` chips — exact match |
| 5 | Auto-layout | screenshot + box rects | ✅ layered: start on top, branches fan downward, all boxes inside the overlay after the synchronous-`left` fit fix |
| 6 | Click box → panel jump | real click on n3's box | ✅ blue selection outline; `#wb-dlgnode-n3` scrolled into view + WAAPI flash |
| 7 | Drag box persists | real `left_click_drag` on n5 (−60, −69) | ✅ box landed within 1px; `editorPos` committed through `onChange` (visible in `__world` zone data) |
| 8 | Fast/synthetic drag | dispatched pointerdown/move/up | ✅ after the recompute-from-event fix (state-lag bug found here: first cut dropped the whole drag) |
| 9 | Close/reopen keeps positions | ✕ then Flowchart | ✅ dragged n2 stayed at its `editorPos` |
| 10 | Auto-arrange | toolbar button | ✅ every node got `editorPos`, layered layout, view refit |
| 11 | Live redraw + unreachable | panel "+ Add page node" while chart open | ✅ 7th box appeared instantly with amber outline + unreachable tooltip; card × deleted it and the box vanished |
| 12 | Pan / zoom | real background drag + scroll | ✅ transform tracked drag; zoom 1→1.26 anchored at cursor |
| 13 | Esc closes | window keydown | ✅ (capture listener; editor unaffected) |
| 14 | Console clean | `read_console_messages` after clear | ✅ no errors from any flowchart interaction (only pre-existing `nonexistent_model` warning on load) |
| 15 | Typecheck | `npm run typecheck` | ✅ 0 errors |

Not exercised in-browser: the red dangling-target chip/dot — the editor UI
can't author a dangling `next` (the dropdown only lists real nodes; dangling
arises from node deletion). The render path is the same loop as the verified
`end` chips (`o.next && !byId.has(o.next)` branch); code-inspected only.

Screenshot for the guide: `docs/images/dialogue-flowchart.png` (auto-arranged
Blue Bunny Talk, n3 selected).
