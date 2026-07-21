# Phase 42 — Toolbar ASSETS Flyout Group

> User request (2026-07-21): the left toolbar is running out of vertical space
> (12 tool buttons + 4 panel buttons + Play row overflow on shorter windows).
> Group everything asset-import/usage related under one button.

## Decision & rationale

One **ASSETS** button replaces the MATS / SOUNDS / SKYBOX panel buttons, and the
**Object** and **Decal** tools move into it too. Discussed with the user:

- Object and Decal are *already* two-step tools — clicking Object today just opens
  the model browser and you must pick a model before placing anything (Decal
  likewise force-opens the decal browser). The flyout adds one click to *entering
  the mode*, not to each placement.
- Menu-first two-click selection is already the toolbar's grammar (Floor,
  Platform, Stair, Shape, Light are all variant groups).
- It matches the mental model: everything "import and use an asset" — models,
  materials, decals, sounds, skybox — in one place.
- SCRIPTS stays its own amber button: gameplay logic, not an asset library.

Net reclaim ≈ 170px (two 48px tool slots + reduction of three 36px buttons to one).

## Target layout

- Tool list (10): Select, Floor, Wall, Platform, Stair, Shape, Groups, Spawn,
  Trigger, Light.
- Bottom cluster: **ASSETS** (flyout: Models / Materials / Decals / Sounds /
  Skybox) → SCRIPTS → divider → Play row.

## Implementation

`src/ui/Toolbar.tsx` is the only functional change — App.tsx's
`handleToolSelect` already couples `object` → assets panel and `decal` → decals
panel, so the flyout entries just call the existing `onToolSelect` /
`onPanelToggle` props.

- Remove `object` and `decal` from `TOOLS`.
- Replace the three MATS/SOUNDS/SKYBOX button blocks with one ASSETS button
  toggling a flyout via the existing `openMenu` state (sentinel key
  `"assets-menu"`; state type widens to `ToolId | "assets-menu" | null`).
- Flyout reuses the variant-popover styling, anchored `bottom: 0` (button sits
  near the bottom of the bar; a top-anchored menu could clip below the viewport).
  Entries:
  - **Models** → `onToolSelect("object")` (arms tool; App opens `assets` panel)
  - **Materials** → `onPanelToggle("materials")`
  - **Decals** → `onToolSelect("decal")` (arms tool; App opens `decals` panel)
  - **Sounds** → `onPanelToggle("audio")`
  - **Skybox** → `onPanelToggle("skybox")`
  Rows use the real icon components (`TOOL_ICONS.object/decal`, `IconMaterial`,
  `IconAudio`, `IconSkybox`), 12px monospace, active row highlighted like
  variant rows.
- ASSETS button highlight: `openPanel ∈ {assets, materials, decals, audio,
  skybox}` or `activeTool ∈ {object, decal}` or its menu is open. Icon/label
  swap to the active entry (variant-group precedent) so the armed mode stays
  glanceable.
- Existing Esc/any-click close effect covers the new menu.

## Verification

- `npm run typecheck` → 0 errors.
- Browser pass (TESTING.md §3 golden path): each flyout entry opens the right
  panel / arms the right tool; place a model + pick a decal to confirm the
  placement paths; trigger-volume still force-opens SCRIPTS; Esc/click-away
  closes the menu; menu fully on-screen; Digit1-4 hotkeys unaffected.
- Vertical fit at a short window height (the original complaint).

## Docs

WORLD_EDITOR_ARCHITECTURE.md: changelog entry + phase section + file-level
`### src/ui/Toolbar.tsx` update. HUMAN_TESTING.md walkthroughs referencing the
old MATS/SOUNDS/SKYBOX buttons or the Object/Decal toolbar buttons updated.
Acceptance checklist: `test-plans/phase-42-toolbar-assets-menu.md`.
