# Phase 58 — Deno desktop conversion E: packaging matrix + FSA cleanup

> Final phase of the conversion (54 spike → 55 persistence → 56 assets →
> 57 export). Branch `deno-desktop`.

## What ships

1. **Compile matrix** (`deno.json` tasks, all cross-compiled from one
   machine, output gitignored under `build/`):
   - `compile:mac-arm64` → `WorldBuilder-mac-arm64.app`
   - `compile:mac-x64` → `WorldBuilder-mac-x64.app`
   - `compile:win-x64` → `WorldBuilder-win-x64.msi`
   - `compile:all` → `vite build` + all three.
   All use the CEF backend, `--include dist` (stock asset library ships
   embedded — the overlay model), `--exclude node_modules
   --exclude-unused-npm` (the backend needs none of it; saves 110 MB).
2. **FSA remnants deleted**: `src/fsa.d.ts`, `src/lib/fileHandleStore.ts`,
   TopBar's `onLoadFSA` branch, the dead reopen-banner
   (`projectPendingName`/`onProjectReopen`) and Publish
   (`onProjectPublish`) props/blocks.
3. **Docs**: README leads with the desktop app + dev loop + compile tasks;
   PUBLISHING_GUIDE §0 rewritten around Export game…;
   WORLD_EDITOR_ARCHITECTURE.md updated per PLAN_UPDATE_GUIDE (phase section
   + file-level sections).

## Out of scope (follow-ups)

- Code signing / notarization (binaries are ad-hoc signed; Gatekeeper will
  warn on other machines).
- `Deno.autoUpdate()` wiring.
- Deploy providers (seam exists in `desktop/deploy.ts`).
- App icon (`--icon` flag ready when an .icns/.png exists).
- Real-hardware smoke on mac-x64 / Windows.
