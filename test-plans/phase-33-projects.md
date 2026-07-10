# Phase 33 — Projects — Test Plan

> **Acceptance record (2026-07-10):** every check below PASSED in-browser
> (Chrome MCP; FSA pickers stubbed with OPFS per TESTING.md §9 — `window.prompt`,
> `alert`, and `showDirectoryPicker` stubbed; autosave snapshot-restored per
> TESTING.md §3). `npm run typecheck` clean after every step gate.

## Runtime — manifest-linked game.json (committed fixture `public/games/pj-fixture/`)

| # | Check | Result |
|---|---|---|
| 1 | `runtime.html?manifest=/games/pj-fixture/manifest.json` boots; menu shows "Project Fixture" | PASS |
| 2 | game.json schema seeds `quest.stage === 0` on New Game; `world.gameItems` set (1 item) | PASS |
| 3 | Greeter trigger `give_item itm_key` → `inv.itm_key === 1`; re-give ×5 clamps to **1** (stackSize from game.json — proves the merged registry feeds ScriptEngine) | PASS |
| 4 | `ownedItems` resolves the shared def (`label "Fixture Key"`, not `def:null`) | PASS |
| 5 | `router.go("scene_02")`: value `quest.stage` **survives** (0), scene-2 schema **overrides** the default (5) and seeds its own `bonus = 7`, inventory + gameItems intact — scene-over-game spread exact | PASS |

## Editor — project lifecycle (OPFS-stubbed pickers, real UI clicks)

| # | Check | Result |
|---|---|---|
| 6 | PROJ ▾ → New Project… ("Test Game") → OPFS `test-game/` contains manifest.json (`manifestVersion 1`, id `test-game`, `assetsBase "/"`, `game "game.json"`, entryScene = adopted scene `new-world`), game.json (`gameVersion 1`), `scenes/new-world.json` **byte-equal** to `__world.toJSON()` | PASS |
| 7 | `+` add scene ("Arena") → manifest gains both keys, editor switches to the fresh scene | PASS |
| 8 | ITEMS tab with project open: added item lands in `world.gameItems` and **NOT** in the scene's `WorldConfig.items`; Save writes it to `game.json` | PASS |
| 9 | `load_scene` action editor renders a dropdown listing `new-world` + `arena` (free text without a project) | PASS |
| 10 | Scene switch back via TopBar select: leaving scene auto-saved (`arena.json` on disk), the user's world (stairs/movers) reloads, game items still merged | PASS |
| 11 | ⋯ → Publish… into a second OPFS dir: `manifest.json` + `game.json` + `scenes/{new-world,arena}.json` copied (4 files), alert includes the assets-not-copied warning | PASS |
| 12 | **Page reload** → project silently re-adopted from IDB (`queryPermission` granted for OPFS): TopBar shows name + scene select, `gameItems` restored, autosaved world untouched | PASS |
| 13 | ▶ Play on the non-served OPFS project → fallback alert ("isn't served … use Publish") ; positive path covered by check 1 (fixture URL) | PASS |
| 14 | ⋯ → Close project → PROJ button returns, `world.gameItems === undefined`, classic single-scene mode intact | PASS |

## Regressions

- No console errors across the whole run (fresh-load check included).
- Single-scene editing without a project untouched (all new paths gated on
  `project !== null`; merge is identity when `gameItems` is undefined).
- Autosave protocol respected (snapshot matched the previously-dumped copy;
  restored + `setItem` neutered before tab close; OPFS wiped).

## Human one-click checks (can't be automated — native pickers)

- PROJ ▾ → New Project with the **real** picker into `<repo>/public/games/`;
  Save; ▶ opens the runtime and the game plays.
- After a full browser restart, the amber REOPEN button prompts for folder
  access exactly once, then the project works as before.

## Manual walkthrough

HUMAN_TESTING.md → "Workflow: author a multi-scene project (Phase 33)".
