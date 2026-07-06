# Phase 15 — Thumbnail Quality + Re-Stage Modal (v4.3.2)

Covers the `thumbnailRenderer.ts` rework (light rig, bounding-sphere camera fit,
shared offscreen renderer) and the new `ThumbnailStagerModal` (Manage → 📷).

## Automated pass (done 2026-07-05, Chrome extension)

- [x] `npx tsc --noEmit` clean
- [x] Assets panel → **Manage** shows the 📷 button; disabled at 0 or 2+ checked, enabled at exactly 1
- [x] 📷 on a pitch-black asset ("Sofa individual") opens the stager; model renders **clearly lit and centered** with the new rig (this alone proves the auto-gen improvement — same `DEFAULT_STAGE` path)
- [x] Drag on the preview orbits (yaw + pitch), scroll zooms, Light slider re-renders brighter — all live
- [x] Save chain verified against a `showDirectoryPicker` stub backed by OPFS (same File System Access API):
  - `sofa_individual_thumb.png` written, valid PNG signature, 14 KB
  - `manifest.json` `thumbnail` patched to the clean path (no `?v=`)
  - grid tile `<img>` src got `?v=<timestamp>` cache-buster from in-memory state
- [x] No console errors during the whole flow

## Manual pass (needs the native directory picker — human only)

- [ ] Manage → check one dark/bad asset → 📷 → stage a shot → **Save Thumbnail**
  - First save prompts for the `public/assets/models` folder; grant readwrite
  - Grid tile updates immediately (cache-busted), file on disk replaced
- [ ] Reload the page → tile still shows the new thumbnail (manifest path, no `?v=`)
- [ ] Asset with **no** thumbnail (◻ placeholder): stage + save → manifest gains a
  `thumbnail` field, tile shows the image
- [ ] Bulk import 10+ models in one go → **every** entry gets a thumbnail
  (regression for the WebGL-context-exhaustion failure; renderer is now shared
  and released once after the batch)
- [ ] Cancel / ✕ / overlay-click closes without writing anything

## Known limits

- Save requires Chrome/Edge (File System Access API), like all import flows.
- Thumbnails for skinned meshes frame the bind pose (`Box3.setFromObject`).
- Old thumbnails keep their filename — external caches see the same URL
  (in-app refresh relies on the `?v=` in-memory cache-buster).
