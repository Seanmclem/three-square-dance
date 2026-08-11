# Phase 55 — Deno desktop conversion B: shell + project persistence

> Continues phase-54 (spike). User decisions: desktop replaces web (FSA
> retired, not dual-tracked); content home is a visible workspace folder;
> work lands on branch `deno-desktop`.

## Why

The spike proved the shell; this phase makes the editor actually work inside
it. Everything project-shaped ran on the File System Access API, which does
not exist in the CEF webview — and which was the source of the app's worst
workarounds (handle persistence in IndexedDB, re-grant banners, HTTP-probe
Play, truncate-on-write saves).

## What ships

1. **Backend** (`desktop/`):
   - `workspace.ts` — workspace resolution (dev: content `<repo>/public` +
     state `<repo>/.worldbuilder` (gitignored); packaged: `~/WorldBuilder` +
     `.state`; `WORLDBUILDER_WORKSPACE` overrides), atomic writes
     (tmp + rename), rotating backups (10/scene, uuid-suffixed against
     same-ms collisions), trash-instead-of-delete, settings.json
     (lastSession + prefs).
   - `projects.ts` — the bindings: listProjects, createProject, saveScene,
     deleteScene, writeGameFile, writeProjectManifest, get/setLastSession,
     get/setPref, write/read/clearAutosave, writeExportFile. Primitives only:
     manifest semantics stay in the frontend ProjectStore. Path-safety
     asserts + JSON.parse guard on every write.
   - `serve.ts` — `/games/*` + `/assets/*` from the workspace (no-store),
     everything else from dist (disk in dev, VFS compiled).
   - `main.ts` — editor window, reusable runtime window
     (`openRuntimeWindow` — window.open is a no-op in the webview),
     `revealPath`, `getAppInfo`, spike diagnostics, dev boot-page override
     (`WORLDBUILDER_BOOT=spike|probe55`).
2. **Frontend seam**: `src/shared/desktopApi.ts` (typed bindings surface +
   `desktop()`/`isDesktop()`).
3. **`src/project/ProjectStore.ts` rewritten**: same public API, no
   FileSystemDirectoryHandle — reads via `fetch('/games/<id>/…')`
   (no-store), writes via bindings. Session persistence is a plain
   `{projectId, sceneId}` in workspace settings — `fileHandleStore`,
   `requestProjectPermission`, and the reopen-banner flow deleted.
4. **App.tsx**: autosave goes to a workspace file via the shell (localStorage
   only as the plain-browser fallback); boot restore reads it back; project
   restore opens by id with no permission dance; Play calls
   `openRuntimeWindow` (HTTP-probe deleted); single-file Save writes to the
   workspace exports dir + reveals it (Load uses TopBar's existing
   file-input fallback — `showOpenFilePicker` no longer exists).
5. **Modals**: `NewProjectModal` is name-only (workspace owns the location);
   new `OpenProjectModal` lists workspace projects via `listProjects`.
6. **Publish… removed from the PROJ menu** — the FSA folder-copy flow is
   gone; the export phase replaces it with a real self-contained bundle.

## Known holes (accepted, later phases)

- Asset importers + management handlers in App.tsx still call FSA — broken
  in the shell until phase C (asset library migration).
- Prefabs/session localStorage keys unchanged (work fine — CEF localStorage
  persists across relaunches, phase-54 verified).
- Plain-browser editing is retired per the user decision; the vite dev
  server still renders the editor read-only.
