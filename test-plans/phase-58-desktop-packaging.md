# Phase 58 test plan — packaging + cleanup (executed 2026-08-11)

## Automated

- `deno task compile:mac-arm64 / mac-x64 / win-x64` — all three build from
  this one Mac: **421 MB .app (arm64), 458 MB .app (x64), 273 MB .msi
  (win)**. (~300 MB per artifact is the CEF framework floor; payload is the
  113 MB embedded dist incl. the full stock asset library.)
- **Packaged-mode launch** (arm64 .app binary, empty scratch workspace):
  `dev=false`, dist served from the embedded VFS, editor html + app bundle +
  stock-assets-manifest all 200, editor window opens.
- After cleanup: `tsc --noEmit` clean, `npm run build` green; zero
  references to `fsa.d.ts` / `fileHandleStore` / `onLoadFSA` /
  reopen-banner / Publish props remain in `src/`.

## Manual (user)

- [ ] Double-click `build/WorldBuilder-mac-arm64.app` — first launch creates
      `~/WorldBuilder`, editor opens, create + save + play a project there
- [ ] mac-x64 .app on an Intel Mac (or Rosetta) — boots
- [ ] `WorldBuilder-win-x64.msi` on a Windows machine — installs + boots
      (WebView is CEF, not WebView2 — same engine as mac)
- [ ] Gatekeeper: right-click → Open needed on other Macs (ad-hoc signature;
      notarization is a known follow-up)

## Conversion acceptance (end-to-end, any time)

Fresh workspace (`WORLDBUILDER_WORKSPACE` at an empty dir or a fresh
machine): launch binary → editor with full stock asset library (no seeding —
served from inside the binary) → create project → build a level → save →
relaunch → project restores → ▶ Play in the native runtime window →
Export game… → serve the bundle folder anywhere → plays in a plain browser.
