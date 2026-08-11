# Phase 56 — Deno desktop conversion C: asset library off FSA

> Continues phase-55 (project persistence). Same branch (`deno-desktop`),
> same decisions: desktop replaces web, HTTP api transport (bindings bridge
> deadlocks per-launch — phase-55 incident log).

## Why

Every asset-management flow — five importer modals plus the delete / edit /
thumbnail / icon / reorigin / bake handlers in App.tsx — still calls the File
System Access API, which doesn't exist in the shell's webview. These flows
also carry the worst of the browser-sandbox residue: six session-only
directory handles that die on reload, the `ensureDir` re-grant dance, and
`needsFolderGrant`/`folderHint` UI threaded through the delete dialogs.

## Design change vs. the original plan: overlay, not seeding

The original phase C called for copying the bundled 132 MB asset library into
the workspace on first run. The serve layer now makes that unnecessary:
`/assets/*` (and `/games/*`) serve **workspace-first with fallthrough to the
built dist** (on disk in dev, embedded VFS in the compiled binary). So:

- Stock assets ship inside the binary and are never copied out.
- Imports/edits write real files into `workspace/assets/<kind>/…`, shadowing
  the stock copy on the same URLs.
- Deleting a stock asset = removing its manifest entry (the VFS file becomes
  unreachable); deleting an imported asset moves the real file to trash.
- `~/WorldBuilder` stays lean: user content only. No seed-version bookkeeping,
  no 132 MB first-run copy.

## What ships

1. **Backend** (`desktop/assets.ts` + routes in `main.ts`):
   - `POST /api/writeAssetManifest` — atomic + rotating backup (kills the
     manifest-truncation failure mode).
   - `POST /api/deleteAssetFiles` — workspace files → trash; VFS-only files
     silently skipped.
   - `POST /api-file/<kind>/<rel…>` — raw-bytes upload (JSON api can't carry
     binary; the bindings bridge choked on Uint8Array anyway). Subdir rels
     supported for texture quality tiers; per-segment path-safety asserts.
   - Frontend client additions in `src/shared/desktopApi.ts`
     (`writeAssetManifest`, `deleteAssetFiles`, `uploadAssetFile`).
2. **`src/assets/assetLibrary.ts`** — single owner of asset-library
   mutations; absorbs `src/core/assetLibraryWriter.ts` and the manifest-splice
   logic previously duplicated across modals and App.tsx handlers.
3. **Five importer modals** on `<input type="file">` (webkitdirectory for the
   material source-folder scan) + assetLibrary — destination pickers and
   folder-grant UI deleted.
4. **App.tsx asset handlers** rerouted; six dir-handle states, `ensureDir`,
   and the folder-grant props deleted end-to-end.

Target: zero `showDirectoryPicker`/`showSaveFilePicker`/`showOpenFilePicker`
call sites left in `src/`.

## Verification

- `tsc --noEmit` + `npm run build` green; zero-FSA grep.
- In the shell (dev workspace = `public/`): import one of each asset kind,
  edit metadata, delete (imported → `.worldbuilder/trash/`, stock →
  manifest-only), reorigin a model, bake a shape to the library; relaunch and
  confirm persistence. Commit `public/**` before/after the session.
- Overlay check with `WORLDBUILDER_WORKSPACE` pointing at an empty dir:
  stock assets appear (VFS fallthrough), an import shadows correctly.
