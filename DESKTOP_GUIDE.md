# Desktop Guide — running, testing, and releasing the Deno app

The World Builder is a Deno desktop app (Deno ≥ 2.9): one binary bundles your
code, the Deno runtime, and a Chromium (CEF) webview. This guide covers the
three ways to run it — dev, local prod ("staging"), and release — plus where
files live and how testing works in each. Deeper testing detail: TESTING.md §0.

---

## 1. Dev loop (day-to-day)

```bash
npm install            # once
npm run build          # build the frontend (the shell serves dist/)
deno task desktop:hmr  # launch the app window
```

- **Backend** changes (`desktop/*.ts`): hot-reload automatically — save the
  file, the shell restarts its module live. Nothing to do.
- **Frontend** changes (`src/**`): run `npm run build`, then click the **↻**
  button in the TopBar (next to Help). Unsaved work autosaves through the
  reload. (When Claude edits frontend code it normally rebuilds and restarts
  the shell for you — a fresh window = new code.)
- **Content** (scenes, `game.json`, assets): always live — served with
  `no-store`, so reopening a project or pressing a Play button picks up the
  latest files instantly.

**Where files live in dev:** content is the repo itself — projects in
`public/games/<id>/`, asset library in `public/assets/` (commit these before
and after sessions that save or import!). App state — autosave, rotating
backups, trash, exports, settings — lives in `.worldbuilder/` (gitignored).

**The window titles matter:** a plain **"World Builder"** title is your real
editor. **"TEST WORKSPACE (…)"** / **"PROBE (…)"** titles are throwaway
instances pointed at scratch workspaces (your projects don't exist there).
**"— Runtime"** is the play window the top ▶ opens.

**Two play buttons:**
- **Bottom-left green ▶** (and its ▾ options): editor preview/game — plays
  the current in-memory world *including unsaved edits*, writes nothing to
  disk, Esc returns to editing. Use for gameplay iteration.
- **Top ▶ (project row)**: saves the project to disk, then opens the native
  Runtime window on the saved files — the exact path a player gets (title
  screen, scene routing, runtime saves). Press ▶ again to re-save + reload it.

Plain-browser fallback: `npm run dev` (Vite, port 7373) still renders the
editor with HMR for pure UI work, but nothing can save there — persistence
needs the shell. A Chrome tab pointed at the *shell's* port (printed at
launch) IS fully functional — same server, same files as the window.

## 2. Local prod build ("staging")

Run the real compiled artifact — embedded VFS serving, packaged workspace
resolution — before calling anything done:

```bash
npm run build
deno task compile:mac-arm64        # → build/WorldBuilder-mac-arm64.app (~7s after first run)
open build/WorldBuilder-mac-arm64.app
```

- Packaged mode uses **`~/WorldBuilder/`** as the workspace (state in
  `~/WorldBuilder/.state/`), NOT the repo — your dev projects won't appear
  unless you copy them into `~/WorldBuilder/games/`.
- To stage against throwaway data instead:
  `WORLDBUILDER_WORKSPACE=/tmp/wb-stage build/WorldBuilder-mac-arm64.app/Contents/MacOS/laufey`
  (the window will title itself "TEST WORKSPACE").
- The stock asset library needs no copying ever — it ships inside the binary
  and the workspace overlays it (imports/edits shadow stock; deleting stock
  assets just removes manifest entries).
- Smoke checklist for a staging pass: launch → workspace created → create
  project → save → relaunch → restores → bottom-left ▶ plays → top ▶ opens
  the Runtime window → Export game… produces a bundle that plays when served
  by any static server.

## 3. Release

```bash
deno task compile:all   # vite build + all three targets, output in build/
```

| Artifact | Target | Size |
|---|---|---|
| `WorldBuilder-mac-arm64.app` | Apple Silicon | ~420 MB |
| `WorldBuilder-mac-x64.app` | Intel Mac | ~460 MB |
| `WorldBuilder-win-x64.msi` | Windows 10/11 x64 | ~270 MB |

(~300 MB of each is the fixed CEF framework; the rest is the app + the full
stock asset library.)

**Known release gaps** (tracked in `plans/phase-58-desktop-packaging.md`):
- Binaries are **ad-hoc signed** — other Macs need right-click → Open the
  first time (Gatekeeper). Proper signing/notarization is a follow-up.
- No app icon yet (`--icon` flag is ready when an `.icns` exists).
- Auto-update (`Deno.autoUpdate()`) not wired.
- The Intel and Windows artifacts cross-compile fine but haven't had a
  real-hardware smoke test.

**Releasing a GAME is separate from releasing the app:** PROJ ▾ → ⋯ →
**Export game…** emits a self-contained static bundle (runtime + only the
assets that game references — ~11 MB for platfrom-obby vs 150 MB of dist)
into the workspace `exports/` folder. Drop that folder on any static host
(see PUBLISHING_GUIDE.md §4 recipes); `index.html` redirects into the runtime
with `assetsBase` already relative.

## 4. Testing & debugging

Full detail in **TESTING.md §0**. The short version:

- Automated flows drive a Chrome tab on the shell's origin (full desktop
  mode + extension tooling).
- The shell self-reports: engine/boot checks via
  `WORLDBUILDER_BOOT=spike`, persistence e2e via `=probe55`, frame timing
  continuously to `<stateDir>/perf-report.jsonl` (how the window's
  performance is measured — CEF idles at the display cap when the machine is
  quiet).
- The api is curl-able (`POST /api/<method>` with a JSON array of args).
- Data safety is structural: atomic writes, 10-deep rotating backups
  (`<stateDir>/backups/`), trash instead of delete (`<stateDir>/trash/`).
