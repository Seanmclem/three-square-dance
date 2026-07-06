# Phase 16 — Skeleton-Safe loadModel (v4.3.3)

Bug: placing a freshly imported rigged .gltf animal showed a stuck "phantom"
copy (the ObjectTool ghost) that ignored the cursor; Esc removed it. Cause:
`AssetManager.loadModel` used plain `gltf.scene.clone()`, which leaves
SkinnedMeshes bound to the cached source scene's skeleton (bones never in the
render scene → never matrix-updated → mesh renders frozen at the source pose).
Static meshes (old furniture .glbs) were unaffected.

## Automated pass (done 2026-07-06, Chrome extension)

- [x] `npx tsc --noEmit` clean
- [x] Data check: `loadModel('horse')` (.gltf, 8 SkinnedMeshes) → all 8 cloned
      skeletons' bones are descendants of the returned root (pre-fix: 0 — bound
      to the GLTF cache)
- [x] UI check: Object tool → select Horse → translucent ghost renders **at the
      cursor** and follows hover moves
- [x] One click = exactly one placed horse (selected, gizmo, "13 clips" in
      Properties); ghost keeps tracking for continuous placement
- [x] Escape clears only the ghost; the placed horse stays and renders solid
- [x] Test object removed via Cmd+Z (zone back to pre-test contents)

## Manual spot-checks

- [ ] Place several different animals in a row — no phantom, each click = one animal
- [ ] Thumbnail re-stage (📷) on a rigged animal — model appears in the stager
      preview and orbits normally (same `loadModel` path)
- [ ] Static .obj / .glb props still place normally (plain-clone path)
