# Phase 42 — Toolbar ASSETS Flyout Group — Acceptance

Change: `src/ui/Toolbar.tsx` only. The Object and Decal tools left the tool list;
MATS/SOUNDS/SKYBOX buttons replaced by one ASSETS flyout button.
Plan: `plans/phase-42-toolbar-assets-menu.md`.

## Checklist

| # | Step | Expected | Verified (2026-07-21) |
|---|---|---|---|
| 1 | Load editor | Tool list is Select, Floor, Wall, Platform, Stair, Shape, Groups, Spawn, Trigger, Light (10); bottom cluster is ASSETS, SCRIPTS, divider, ▶ Play | ✅ screenshot |
| 2 | Click ASSETS | Flyout opens to the right, anchored to the button's bottom, fully on-screen: Models / Materials / Decals / Sounds / Skybox rows with icons + "Import & place assets — Esc closes." hint | ✅ |
| 3 | Flyout → Models | ASSETS (model browser) panel opens; object tool armed (Properties: "Choose an asset below, click to place"); ASSETS button highlighted with the Object icon | ✅ |
| 4 | Reopen flyout while assets panel open | Models row highlighted as the active entry | ✅ |
| 5 | Flyout → Materials | MATERIALS panel opens; ASSETS button icon swaps to the materials icon | ✅ |
| 6 | Flyout → Decals | DECALS panel opens; decal tool armed | ✅ |
| 7 | Flyout → Sounds | AUDIO panel opens | ✅ |
| 8 | Flyout → Skybox | SKYBOX panel opens; ASSETS button icon swaps to the skybox icon | ✅ |
| 9 | Esc with flyout open | Flyout closes; open panel stays | ✅ |
| 10 | Flyout → active entry again (Skybox picked twice) | Its panel toggles closed; ASSETS highlight clears | ✅ |
| 11 | Escape with a model tile armed | Placement disarmed ("Nothing selected"), no object placed | ✅ |
| 12 | Console | No errors during the whole pass | ✅ |
| 13 | `npm run typecheck` | 0 errors | ✅ |
| 14 | Trigger volume selection → SCRIPTS force-open | Unchanged (App.tsx coupling untouched) | ➖ not re-exercised (code untouched; volume was off-screen in the test viewport) |
| 15 | Digit1–4 select-mode hotkeys | Still work (handler untouched) | ➖ not re-exercised (code untouched) |

## Notes

- The user's autosave was snapshot-protected and verified byte-identical at session
  end; no world mutations were made (selection + panel toggles only).
- Known interaction quirk (pre-existing, whole toolbar): `computer`-driven clicks can
  be silently swallowed without a preceding screenshot (TESTING.md §3 gotcha 6) — not
  a regression, but it is why automated flyout clicks need the screenshot→click rhythm.
