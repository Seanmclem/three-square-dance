# Phase 57 test plan — game export bundle (executed 2026-08-11)

## Automated — scripted export (platfrom-obby, dev workspace, fresh build)

All assertions PASS:
- Bundle: `runtime.html` + redirecting `index.html` + `manifest.json`
  (`assetsBase: "./"`) + `game.json` + scenes + all 7 Vite chunks + pruned
  per-kind manifests (subset-verified) + all 50 resolved asset files.
- **68 files, 10.85 MB** — vs 151 MB full dist. Refs found: 39 models,
  1 material (all quality tiers), 2 sounds, 4 graphics.
- `missing` correctly reports one legitimately absent file
  (`concrete_01/metalness.jpg` — manifest lists it, file exists nowhere).
- `runtime.html`'s absolute `/assets/…` script refs rewritten to relative so
  the bundle works from any static-host subpath.

## Automated — the bundle actually plays

Served the bundle with a plain `python3 -m http.server`, loaded in Chrome:
- `index.html` redirects to `runtime.html?manifest=./manifest.json`.
- Title screen renders (game name + version + Start, canvas live, tab title
  from manifest).
- Pressed Start: **in-game** (HUD showing zone name + controls), 56 resources
  loaded, zero failed asset requests (only `favicon.ico` 404s — cosmetic).

## Automated (v4.83.2, executed 2026-09-20): no editor code in the bundle

Scripted `exportGameBundle` of platfrom-obby, then served with
`python3 -m http.server` and played in Chrome:
- Bundle `assets/*.js` is exactly `runtime`, `WorldLoader`, `GLTFLoader`,
  `OBJLoader`, `MTLLoader`, `RGBELoader`. **No `main-*.js` (the editor) and no
  `testHelpers-*.js`**, both of which the old copy-everything loop shipped
  (supersedes "all 7 Vite chunks" above).
- Title screen, Start, in-game all work; zero failed chunk requests (404s are
  only `favicon.ico` and the `/api/getAppInfo` desktop probe).
- Re-check after adding editor utilities: `ls <bundle>/assets/*.js` must not
  list `main-*`, and the editor utility's strings must not grep in any of them.

## Checks

`deno check` (main/export/deploy) clean; `tsc --noEmit` clean;
`npm run build` green.

## Manual (user)

- [ ] PROJ ▾ → ⋯ → "Export game…" in the shell: alert summary + Finder reveal
      of `.worldbuilder/exports/<id>-bundle/`
- [ ] Export a game that uses skyboxes/decals (platfrom-obby has none) and
      spot-check those land in the bundle
- [ ] Drop a bundle on a real static host and play it there

## Notes

- Walker coverage and resolver decisions (thumbnails excluded, all quality
  tiers shipped, disabled map slots shipped for per-instance re-enables,
  model-id fallback files) are documented in `src/export/assetRefs.ts`.
- Deploy providers: seam only (`desktop/deploy.ts`) — none wired, per the
  bundle-first decision.
