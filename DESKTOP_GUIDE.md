# Desktop Guide — running, testing, and releasing the Deno app

The World Builder is a Deno desktop app (Deno ≥ 2.9): one binary bundles your
code, the Deno runtime, and a Chromium (CEF) webview. This guide covers the
three ways to run it — dev, local prod ("staging"), and release — plus where
files live and how testing works in each. Deeper testing detail: TESTING.md §0.

## Command cheat-sheet

| Command | What it does |
|---|---|
| `npm install` | Install dependencies (once) |
| `deno task desktop:dev` | **Run the app** (dev, preferred): `desktop:hmr` + `vite build --watch` in one — `src/**` saves rebuild `dist/` automatically (~3s incremental), then ↻ in the TopBar |
| `npm run build` | One-shot frontend build into `dist/` (includes `tsc` typecheck, which the watcher skips) |
| `npm run build:watch` | Just the watcher half of `desktop:dev` — pair with an already-running shell |
| `deno task desktop:hmr` | Run the app without the frontend watcher; backend (`desktop/*.ts`) hot-reloads on save |
| `deno task desktop` | Same, without backend hot-reload |
| `npm run dev` | Vite only (port 7373): UI iteration with HMR, but **nothing can save** — no shell |
| `deno task compile:mac-arm64` | Compile `build/SquareDance.app` (Apple Silicon) |
| `deno task compile:mac-x64` | Compile `build/SquareDance-intel.app` (Intel Mac) |
| `deno task compile:win-x64` | Compile `build/SquareDance.msi` (Windows x64) |
| `deno task compile:all` | Frontend build + all three targets |
| `open build/SquareDance.app` | "Staging": run the packaged artifact you just compiled as a pre-release check (§2 checklist) |
| `deno task release vX.Y.Z` | Compile all targets, sign + notarize (once set up), and create a **draft** GitHub release (§3) |
| `WORLDBUILDER_WORKSPACE=/tmp/wb-test deno task desktop:hmr` | Run against a throwaway workspace (window titles itself "TEST WORKSPACE") |
| `WORLDBUILDER_BOOT=spike deno task desktop:hmr` | Self-test probe: engine + editor-boot checks → `.worldbuilder/spike-results.json` |
| `WORLDBUILDER_BOOT=probe55 deno task desktop:hmr` | Self-test probe: 13-step project-persistence e2e |

---

## 1. Dev loop (day-to-day)

```bash
npm install            # once
deno task desktop:dev  # launch the app window + frontend watcher
```

- **Backend** changes (`desktop/*.ts`): hot-reload automatically — save the
  file, the shell restarts its module live. Nothing to do.
- **Frontend** changes (`src/**`): the watcher rebuilds `dist/` on save
  (~3s incremental — wait for it); then click the **↻** button in the TopBar
  (next to Help). Unsaved work autosaves through the reload. No manual
  `npm run build` needed. Note the watcher is `vite build --watch` only — it
  does **not** typecheck; run `npm run typecheck` (or rely on the editor)
  before committing.
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
deno task compile:mac-arm64        # → build/SquareDance.app (~7s after first run)
open build/SquareDance.app
```

- Packaged mode uses **`~/WorldBuilder/`** as the workspace (state in
  `~/WorldBuilder/.state/`), NOT the repo — your dev projects won't appear
  unless you copy them into `~/WorldBuilder/games/`.
- To stage against throwaway data instead:
  `WORLDBUILDER_WORKSPACE=/tmp/wb-stage build/SquareDance.app/Contents/MacOS/laufey`
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
deno task release v0.1.0   # compile all targets, sign + notarize (if set up),
                           # zip, and create a DRAFT GitHub release
```

The draft release is created on the repo with all three artifacts attached —
review it on GitHub and press **Publish** yourself. To only build the
artifacts without releasing: `deno task compile:all`.

**One-time signing setup** (until done, the script warns and ships the mac
apps ad-hoc signed — they still work via right-click → Open):

1. Install a **Developer ID Application** certificate into your login
   Keychain: Xcode → Settings → Accounts → your team → Manage Certificates →
   **+** → Developer ID Application. (Needs the Account Holder role on the
   Apple Developer account.)
2. Store notarization credentials (uses an app-specific password from
   account.apple.com → Sign-In and Security):

   ```bash
   xcrun notarytool store-credentials squaredance-notary \
     --apple-id <your-apple-id-email> --team-id <TEAMID>
   ```

   Find your TEAMID at developer.apple.com → Membership. The command prompts
   for the app-specific password and stores it in the Keychain.

With both in place, `deno task release` signs every nested binary
(hardened runtime + `desktop/entitlements.plist` — CEF needs JIT), submits
both mac apps to Apple's notary service (a few minutes each), staples the
tickets, and zips with `ditto` (preserves framework symlinks). Recipients
then get no Gatekeeper friction at all.

> ⚠ **The signing/notarization path has never run for real** (written to
> Apple's current guidance, but no Developer ID cert has been installed to
> exercise it). Treat the first signed release as a shakedown: run it,
> and if notarization rejects the bundle the likely culprits are CEF's
> nested helper apps or a binary the inside-out signing loop missed —
> `xcrun notarytool log <submission-id> --keychain-profile
> squaredance-notary` lists the exact offending files. Verify a signed
> build on a second Mac (or a fresh user account) before publishing the
> draft.

| Artifact | Target | Size |
|---|---|---|
| `SquareDance.app` | Apple Silicon | ~420 MB |
| `SquareDance-intel.app` | Intel Mac | ~460 MB |
| `SquareDance.msi` | Windows 10/11 x64 | ~270 MB |

All carry the SquareDance icon (`desktop/icon/` — regenerate with the
overlapping-squares script if the brand changes).

(~300 MB of each is the fixed CEF framework; the rest is the app + the full
stock asset library.)

**Known release gaps** (tracked in `plans/phase-58-desktop-packaging.md`):
- Mac signing/notarization is wired into `deno task release` but **untested
  until the one-time setup above is done** (no Developer ID cert installed
  yet). Until then binaries ship ad-hoc signed — right-click → Open.
- The Windows `.msi` is unsigned (SmartScreen warns) — Windows code signing
  needs a separate certificate and is not wired.
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
- The shell window itself is drivable via the computer-use MCP (pixel-level
  clicks + screenshots) after a one-time rebrand of the cached CEF runtime —
  setup commands and caveats in TESTING.md §0.
- The shell self-reports: engine/boot checks via
  `WORLDBUILDER_BOOT=spike`, persistence e2e via `=probe55`, frame timing
  continuously to `<stateDir>/perf-report.jsonl` (how the window's
  performance is measured — CEF idles at the display cap when the machine is
  quiet).
- The api is curl-able (`POST /api/<method>` with a JSON array of args).
- Data safety is structural: atomic writes, 10-deep rotating backups
  (`<stateDir>/backups/`), trash instead of delete (`<stateDir>/trash/`).
