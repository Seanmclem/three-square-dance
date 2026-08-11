# Phase 56 test plan — desktop asset library (executed 2026-08-11)

## Automated — asset routes, live shell, empty scratch workspace

All PASS (curl against the running shell):
- Overlay: `GET /assets/models/manifest.json` → 200 from dist fallthrough
  (workspace empty — stock assets need no seeding).
- `POST /api-file/models/probe-test.glb` (raw bytes) → written into the
  workspace; immediately served back at `/assets/models/probe-test.glb`
  (workspace shadows stock).
- `POST /api/writeAssetManifest` → read-back returns the workspace manifest.
- `POST /api/deleteAssetFiles` with one real + one VFS-only name →
  `{trashed: 1}`; the real file appears timestamped in `.state/trash/`;
  the stock-only name is skipped silently (manifest-entry removal is its
  deletion).
- Path traversal in the upload rel → refused (500).

## Automated — frontend migration

- `tsc --noEmit` clean; `npm run build` green.
- FSA grep: **zero** `showDirectoryPicker` / `showSaveFilePicker` /
  `showOpenFilePicker` call sites left in `src/` (types in `fsa.d.ts` remain
  until phase E).
- `assetLibraryWriter` absorbed into `src/assets/assetLibrary.ts` (old file
  deleted, zero references).
- Editor boot probe in the shell after the migration: 1 canvas, UI up,
  0 errors. Net diff: −481 lines.

## Manual (user, `deno task desktop:hmr` — dev workspace = public/)

- [ ] Import one of each: model (GLB, check thumbnail), audio, skybox,
      graphic, material (source folder via the native folder-file input)
- [ ] Edit metadata on an imported + a stock asset (tags/name persist)
- [ ] Delete an imported asset → file lands in `.worldbuilder/trash/`;
      delete a stock asset → manifest-only, asset disappears from browser
- [ ] Thumbnail re-stage, icon save, model re-origin (⌖), bake-to-library
- [ ] Bake "save a copy" — verify CEF surfaces the anchor download (known
      open question; if not, a binary export route is the fix)
- [ ] Relaunch: imports persist
- [ ] Commit `public/**` after the session (imports write into public/assets)

## Notes

- First-run seeding was dropped in favor of the VFS overlay (see the phase-56
  plan doc): stock library lives in the binary, workspace holds user content
  only.
