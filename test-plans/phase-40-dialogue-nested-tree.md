# Test plan — Phase 40: Nested dialogue tree view (accordion responses)

Feature: the DIALOGUE tab renders the tree as actual nesting — each response
option is an accordion, and the page node it leads to renders inside it.
All checks below were run in-browser on 2026-07-19 (Chrome MCP, TESTING.md §3
protocol: autosave snapshot → OPFS stash → in-memory staging only, never Save
→ verified restore → tab closed). Runtime untouched by this phase.

## Automated / scripted checks (all passed)

| # | Check | How | Result |
|---|---|---|---|
| 1 | Basic nesting | Stage n1, add response, Leads to → "＋ new page node…" | n2 created, wired, its card physically inside n1's option row (`n1card.contains(n2card)` true), 2px rail present |
| 2 | Route tags | Inspect option headers | `→ n2` on the hosted option, `⏹ ends` on a no-next option, `↩ n1` on a loop reference, red `⚠ … missing` styling path exists (dangling) |
| 3 | Diamond (two parents) | Second n1 response → n2 | n2's card rendered exactly once (first response hosts it); second shows `↩ continues at n2` chip |
| 4 | Loop | n2 response → n1 | `↩ continues at n1` chip, no infinite recursion, n1 rendered once |
| 5 | Jump chip | Click the `↩ continues at n1` chip | Scrolls to + flashes n1's card (WAAPI box-shadow pulse) |
| 6 | Chained authoring | n2 → new n3 → new n4 → new n5 via the sentinel | Each node created + wired + nested + open in one pick |
| 7 | Constant width at depth | Measure cards n1…n5 (final sibling layout) | Lefts 76/93/**93/93/93**, widths 295/269/**269/269/269** — dead flat after the single level-1 inset |
| 7b | Sibling layout | n2 vs option well DOM | n2's card is inside n1's card but NOT inside the option well (`well.contains(n2) === false`) — rail-connected sibling, no box-in-box |
| 7c | Panel resize | Real `left_click_drag` on the right-edge strip 381→500 | Panel width 320→436, `localStorage.wb_leftpanel_w` persisted; clamped 280–600 |
| 7d | No-wrap details row | Inspect `▸ Show if / On pick · …` | Single flex line, `nowrap` + ellipsis — cannot wrap at any panel width |
| 8 | Accordion collapse | Click ▾ on n1's hosted option | Option body AND nested subtree (n2 card) removed from DOM; ▸ re-expand restores it |
| 9 | Fresh option UX | + Add a response | Starts expanded, header text input ready to type (single input — no duplicate text row) |
| 9b | Details sub-row | Toggle `▸ Show if / On pick` | Collapsed by default with count summary ("(0 conditions · 1 effect)" / "(none — always shown, no effects)"); expanding shows the full Show if + On pick editors; nested card sits directly under Leads to either way |
| 9c | Sibling state isolation | Add an option, edit its text | Other options' open/closed state and the nested n2 card unaffected (an early automation artifact suggested otherwise; not reproducible with clean sequencing — two repro attempts) |
| 10 | Unreachable section | Top-level "+ Add page node" | n6 renders flat under "⚠ Unreachable page nodes (nothing leads here)", outside the tree |
| 11 | Scroll integrity | scrollTop → max on a tall tree | Editor's last button (Delete) fully visible — v4.33.10 fix intact |
| 12 | Console | read_console_messages | No errors from the new code (one pre-existing unrelated asset warning) |
| 13 | Typecheck | `npx tsc --noEmit` | 0 errors |

## Human one-click checks (recommended)

1. Open SCRIPTS → DIALOGUE → + New. Type a line, + Add a response, pick
   **＋ new page node…** in its Leads to — the next page should appear inside
   the response, ready to type. Chain 2-3 more.
2. Collapse/expand a few responses via the carets; confirm the tree stays
   readable and the route tags (`→` / `⏹` / `↩`) match where things go.
3. Point two responses at the same node — the second should become a
   `↩ continues at…` chip; click it.
4. Save, reload, reopen — the tree renders identically (no new data was
   added; layout is derived).

## Known limits (v1, by design)

- A jump chip whose target sits inside a *collapsed* ancestor scrolls to
  nothing (the card isn't in the DOM). Expand the branch first. Follow-up:
  auto-expand the path on jump.
- Accordion open/closed state is component-local — it resets when you leave
  the dialogue editor or the option is re-hosted elsewhere.
- Node cards themselves don't collapse (only responses do).
