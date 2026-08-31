# Phase 69 — Trigger-volume properties redesign (option A: accordions)

> User ask (2026-08-31): trigger properties "feel sloppy and cluttered … but
> they are all the kinds of things you might always want to see", so group into
> collapsible sections without sacrificing any functionality. Prototyped as
> `plans/mockups/trigger-panel-prototype.html` (options A/B/C); the user picked
> **A**: every field stays reachable, sections collapse with live summaries.

## Structure (TriggerVolumeView, PropertiesPanel.tsx)

The flat 12-block column becomes six accordion sections. PrefabSection stays
pinned above them (unchanged); ⬡ Create Prefab + Delete Volume stay pinned
below (unchanged).

| Section | Contents (all existing controls, none dropped) | Summary (collapsed) |
|---|---|---|
| Geometry | label, intro blurb behind ⓘ, SHAPE segs, EDIT MODE segs, POSITION XYZ, SIZE (per-shape), capsule warning, ROTATION Y | `box · 4×1×4` style |
| Scripts | + Enter / + Exit, ScriptListRows | `2 scripts` / `none` |
| State | EntityStateSection (restyled, below) | key names, `·`-joined |
| Attach | attached-to select + rest-pose hint | host label / `static` |
| Appearance | VISUAL (gradient fill …) + EDITOR SHADING | `gradient` / `custom color` / `none` |
| Groups | existing GroupsAccordion, unchanged | member count (already built in) |

- New local `Section` component: header button styled like GroupsAccordion's
  (ROW_BASE, 12px title, › chevron that rotates open) plus a right-aligned
  muted mono summary. Geometry + Scripts open by default, rest collapsed;
  open-state is per-session component state (resets on reselect is fine).
- Groups keeps its existing `groupsOpen`/`onToggleGroups` wiring — it already
  is an accordion; it just moves inside the stack visually.

## Rotation row (from the mockup iterations)

Numeric input at ~1/3 width, `-180…180 step 5` range slider beside it, and an
in-field × that resets to 0 (dimmed at 0). Input commits on blur/Enter as
today; the slider writes through the same debounced commit path as position.

## State section restyle (EntityStateSection — shared with object Scripts screen)

- Heading row: `THIS VOLUME ONLY` (or OBJECT) with a ⓘ toggle; the
  explainer paragraph only renders when ⓘ is open, at 11px (was always-on 10px).
- Each key becomes a card: top row = key name · live ▶ value · type segs
  (bool/num/text) · × remove; then **Starts** on its own line (switch for
  booleans); numbers get **Min + Max on a second line**. Same schema writes,
  same clamping, same live-value display.
- Object Scripts screen inherits the restyle for free (same component).

## Out of scope

- No data-model changes; purely presentational. B (drilldown) and C (dense)
  mockup panels stay in the prototype for reference.

## Verify

- Manual pass in the desktop shell per `test-plans/phase-69-trigger-panel.md`
  (written with this phase): every control from the old flat view reachable
  and functional inside its section; summaries update live; rotation slider +
  reset commit; state cards read/write schema incl. min/max clamp.
