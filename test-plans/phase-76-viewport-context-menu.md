# Phase 76 test plan: viewport right-click menu ("Move initial spawn here")

Changelog: WORLD_EDITOR_ARCHITECTURE.md v4.86.0.

## How to use it

Select tool, **right-click without dragging** anywhere in the viewport (a right-DRAG
still orbits the camera). A small menu opens at the cursor showing the point you
clicked and one entry, **Move initial spawn here**. Click it: the spawn marker jumps
there, keeps the direction it was facing, and Cmd+Z puts it back. If the level has no
spawn yet the entry reads **Set initial spawn here**.

It lands on the surface you actually clicked (a platform top, a floor), not the ground
plane underneath.

The menu does NOT open when:

- you right-click a **wall** (that still splits the wall, as before),
- you right-click a **brush corner** while editing a brush (that still deletes the corner),
- a placement tool is armed (Floor, Wall, Spawn, ...: right-click cancels those),
- you are in preview.

It closes on a click elsewhere, Escape, a scroll, or switching tools.

## Checks run (isolated vite dev server, real right-click + left-click)

| # | Check | Result |
|---|---|---|
| 1 | Right-click the top of a test platform | menu at the cursor, header "AT -3.16, 0.40, -4.08" (y = the platform top) |
| 2 | Click the entry | spawn AND marker at that point, facing still 135, menu closed |
| 3 | Cmd+Z | spawn back at (2, 0, 2), facing 135 |
| 4 | 60px right-drag | 0 `input:rightclick` events (camera orbit), no menu |
| 5 | Still right-click on empty ground, then Escape | menu opened at the ground point, Escape closed it |
| 6 | Right-click a wall | wall split (1 to 2), event marked `handled`, no menu |
| 7 | Spawn tool armed, right-click | no menu |
| 8 | `npm run typecheck` | clean |

## Not covered

- Right-clicking a brush corner (the `handled` flag there is set the same way as the
  wall case, but was not exercised).
- The desktop shell window itself: tested in a Chrome tab on the plain vite server so
  a moved spawn could not reach your workspace autosave.
