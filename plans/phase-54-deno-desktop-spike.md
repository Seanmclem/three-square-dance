# Phase 54 — Deno desktop conversion: spike + webview compat verdict

> User request (2026-08-10, condensed): "Having this app which is a web app that
> could seemingly only run well locally, instead being a bundled deno app where
> it can more reliably handle the filesystem without kind of hackily leveraging
> the public-folder... make a plan to convert this web-app to a deno-app that
> can be distributed natively via this compile setup as mac and windows apps.
> Also perhaps it could more directly leverage apis to do deploys of its games."
> Follow-ups: do it on a feature branch (`deno-desktop`), and use the
> bundled-Chromium (CEF) backend from the start rather than as a fallback.

## Why

The editor's entire persistence layer is a stack of browser-sandbox
workarounds: Chromium-only File System Access API handles persisted in
IndexedDB, six session-only folder handles that die on reload, "grant this
folder again" UX, user-activation ordering in every dialog, an HTTP probe in
`handleProjectPlay` to guess whether a folder handle points inside
`public/games`, and truncate-on-write saves that have already destroyed a
level (CLAUDE.md §5). `deno desktop` (Deno ≥ 2.9) bundles our code, the Deno
runtime, and a Chromium (CEF) webview into one distributable binary per
platform, with an in-process `bindings` bridge for real filesystem access —
which deletes the whole workaround pile and unlocks a real export/deploy
pipeline.

This phase is the **de-risking spike**: prove the shell works with our real
build before any app code changes.

## Conversion roadmap (this phase = A)

- **A (this phase):** hello-shell + smoke checklist + decision gates.
- **B:** desktop backend (workspace, atomic writes/backups/trash, Deno.serve
  routes) + project persistence via bindings; `openRuntimeWindow` replaces
  `window.open`. Plain-browser editing breaks here (accepted — desktop
  replaces web).
- **C:** asset-library migration (five importers + ~40 App.tsx FSA handlers →
  `src/assets/assetLibrary.ts` + bindings) + first-run seeding of
  `~/WorldBuilder/assets` from the bundled library.
- **D:** `exportGameBundle` — self-contained static game bundle (runtime shell
  + game JSON + only referenced assets); deploy-provider seam, none wired.
- **E:** packaging matrix (mac arm64/x64, win x64, CEF), FSA code deletion,
  docs.

All phases commit to branch `deno-desktop` (user request — exception to the
straight-to-main convention). Dev-mode workspace stays `<repo>/public`, so the
commit-`public/games/**`-around-sessions safety rule continues unchanged.

## What ships (this phase)

1. **`deno.json`** — task skeleton: `desktop` (run the shell against built
   `dist/`), `desktop:hmr`, `desktop:compile` (CEF, `--include dist`).
2. **`desktop/main.ts`** — minimal backend: `Deno.serve` static handler for
   `dist/` (and `/games`, `/assets` from `public/` in dev), one
   `Deno.BrowserWindow` (CEF backend), spike bindings:
   - `spikeReport(results)` — harness posts structured pass/fail JSON; backend
     writes `desktop/spike-results.json` for inspection.
   - `spikeEchoBytes(bytes)` — Uint8Array round-trip for payload timing
     (~50 MB — the reorigin/import path moves GLBs this size).
3. **`desktop/spike.html`** — served harness page that auto-runs the checks
   below, renders them on-screen, posts them via `spikeReport`, and links to
   `/index.html` (editor) and `/runtime.html` for manual checks.
4. **`test-plans/phase-54-deno-desktop-spike.md`** — the checklist with
   recorded pass/fail + measurements.

## Smoke checklist (run under CEF)

Automated by the harness: WebGL2 context, Rapier WASM init, Gamepad API
presence, Web Audio context state, localStorage write→relaunch→read,
`window.open` behavior (expected: blocked/no-op → confirms the need for an
`openRuntimeWindow` binding), Uint8Array binding round-trip timing at 1 MB /
50 MB, `bindings` global presence.

Manual: editor page loads and renders a scene at usable FPS; pointer lock
enter/exit in preview; `<input type="file">` opens a native picker; compiled
binary (`--include dist`) size + cold-start time.

## Decision gates (recorded in the test-plan doc)

- (a) Bindings vs. an HTTP `POST /api/...` escape hatch for large asset
  payloads — decided by the 50 MB echo timing.
- (b) `--include public/assets` vs. `--self-extracting` vs. sidecar folder for
  the 132 MB asset library — decided by binary size + VFS read throughput.
- Non-gate (already decided): CEF backend on all platforms from the start.

## Explicitly out of scope

Any change to `src/` app code. The editor is expected to *render* in the
shell but saving/opening still uses FSA (absent in CEF) until Phase B.
