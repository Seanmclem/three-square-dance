# Phase 57 — Deno desktop conversion D: self-contained game export

> Continues phase-56. Branch `deno-desktop`. Replaces the FSA "Publish…"
> folder-copy (removed in phase 55) with a real export.

## Why

Publishing a game today is the manual PUBLISHING_GUIDE recipe: build the app,
host all of dist (132 MB library included), hand-manage `assetsBase` and CORS.
The old in-app Publish only copied JSON between folders — assets deliberately
excluded, because the browser sandbox couldn't walk them. The desktop backend
can: walk the scene/game JSON for asset references and emit a bundle that
contains the runtime shell plus exactly the files the game uses.

## What ships

1. **`src/export/assetRefs.ts`** — reference walker + resolver:
   `collectAssetRefs(scenes, game)` covers every reference class (object
   assetIds, surface materials, terrain, decals, skybox, script audio,
   item/uiElement graphics, prefab contents); `resolveAssetFiles` maps ids →
   concrete files via the manifests (expanding `{quality}` texture tiers),
   returns pruned per-kind manifests and a `missing` list (reported, never
   fatal).
2. **`desktop/export.ts`** — `exportGameBundle({projectId})`: bundle under
   `stateDir/exports/<id>-bundle/` with `runtime.html` + its hashed chunks
   (depth-1 files of dist/assets — subdirs there are the copied asset
   library, skipped), a redirecting `index.html`, the game manifest with
   `assetsBase: "./"`, game.json + scenes, and the referenced asset subset
   (workspace-first, dist/VFS fallback — same overlay as serving).
3. **`desktop/deploy.ts`** — `DeployProvider` interface + empty registry
   (user decision: bundle-only first; provider uploads later).
4. **UI**: "Export game…" in the PROJ ▾ menu (desktop only) → alert with
   file count / size / missing refs + reveal in Finder.

## Verification

- `deno check` + `tsc` + `vite build` green.
- Scripted export of `platfrom-obby` from the dev workspace: bundle complete
  (shell + chunks + JSON + referenced assets, all resolved files present),
  size ≪ 132 MB, then serve the folder with a plain static server and play
  it in a browser.
