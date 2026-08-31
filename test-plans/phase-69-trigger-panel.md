# Phase 69 — Trigger-volume properties redesign (option A accordions)

Setup: open a project with at least one trigger volume that has a script and a
custom editor tint (Platfrom Obby / level_1 works: the kill-floor volume).

## Sections + summaries

1. Select a trigger volume. The properties panel shows (top to bottom):
   Prefab row (if a member), **Geometry**, **Scripts**, **State**, **Attach**,
   **Appearance**, **Groups**, then ⬡ Create Prefab + Delete Volume.
2. Geometry + Scripts start open; State/Attach/Appearance/Groups start closed.
3. Collapse Geometry: header shows a live summary like `box · 122.2×2.5×137.2`
   (adds `· 45°` when rotated). Collapse Scripts: `1 script`. State: key names
   or `none`. Attach: host label or `static`. Appearance: `gradient`,
   `custom color`, both, or `none`.
4. Every control from the old flat view is present inside its section: label,
   shape segs, edit mode, position, size (per-shape fields + capsule warning),
   rotation, attach select + rest-pose hint, state keys, visual fill controls,
   editor shading, + Enter / + Exit, script rows.

## Rotation row

5. In Geometry, ROTATION (Y°) is a ~1/3-width input with a slider to its
   right (−180…180, 5° steps). Dragging the slider rotates the volume live;
   typing a value still works (debounced, Enter commits).
6. The input has an in-field ×: dimmed at 0°, red otherwise; pressing it
   resets the volume to 0° and the slider recenters.

## ⓘ explainers

7. The LABEL row (Geometry) has a ⓘ — pressing it opens the trigger-volume
   description at 11px; pressing again hides it.
8. The State section heading reads THIS VOLUME ONLY with its own ⓘ; the
   "keys this volume tracks for itself…" explainer only shows when pressed.

## State cards (shared with the object Scripts screen)

9. Each state key renders as a card: name · live ▶ value (while playing) ·
   bool/num/text segmented type picker · × remove.
10. Booleans: STARTS row with a checkbox + true/false text. Numbers: STARTS
    on its own line, MIN + MAX together on the line below (clamping intact).
    Strings: STARTS text field.
11. Select an object with state (spike cube) → Scripts screen: same card
    styling, heading `STATE (this object only)` with the ⓘ.

## Regression

12. + Enter / + Exit still add scripts; script rows still toggle/delete/open.
13. Groups accordion still toggles membership and offers Select group.
14. ⬡ Create Prefab (non-member volumes) and Delete Volume still work.
15. Gizmo/face-handle edits update the open Geometry fields live (position,
    size, rotation resync).
