# Phase 37 — Skyboxes — Test Plan

Selectable/importable equirectangular image skyboxes, layered on top of the built-in
procedural sky. `WorldConfig.skybox` is `"sky"` (procedural, default) or a `SkyboxDef` id.

## What shipped

- **Manifest + loader** — `public/assets/skyboxes/manifest.json`
  (`{ version, skyboxes: SkyboxDef[] }`); `AssetManager.initSkyboxes()` /
  `getSkyboxList()` / `getSkyboxDef()` / `updateSkybox()` / `removeSkyboxes()` /
  **`loadSkybox()`** (equirect `THREE.Texture`, LDR via `TextureLoader`, HDR via a lazy
  `RGBELoader`; cached, disposed on `dispose`). Three procedural starter equirects ship:
  `clear_day`, `sunset`, `night_sky`.
- **Application** — `SceneManager._applySkybox(id)` on a `world:sky` subscription:
  `"sky"` → procedural `Sky` mesh + RoomEnvironment env; else → `scene.background = image`
  and `scene.environment = PMREM.fromEquirectangular(image)`. Stale-load guard
  (`_skyReqToken`). Both roots (editor App + RuntimeApp).
- **Data model** — `WorldConfig.skybox` (now honored), `WorldState.updateWorldSky()`
  (non-journaled), bus events `world:sky` + `skyboxes:loaded`. No migration (old saves =
  `"sky"` = default branch).
- **Editor UI** — SKYBOX toolbar panel (`IconSkybox`) → `SkyboxBrowser` (grid selector,
  Procedural-Sky tile + imports, Import/Manage/Edit/Delete) + `SkyboxImporterModal` (FSA
  `.jpg/.png/.hdr` import, manifest dedupe-splice), `EditMetadataDialog` (`noun`+=`skybox`).

## Regression gates

- `npm run typecheck` → 0 errors. ✅
- No skybox-related console errors on load / select / revert. ✅

## Acceptance checks (verified 2026-07-15, editor tab, real toolbar + panel clicks)

| # | Check | Expected | Result |
|---|---|---|---|
| 1 | Manifest loads | `getSkyboxList()` = clear_day / sunset / night_sky | ✅ |
| 2 | Baseline | `scene.background === null`, procedural `Sky` mesh visible, `skybox === "sky"` | ✅ |
| 3 | Select image (live) | `__world.updateWorldSky("sunset")` → `scene.background` = Texture (mapping 303 EquirectReflection, image `sunset.png`), `scene.environment` regenerated, `Sky` mesh hidden | ✅ |
| 4 | Persist | `__world.toJSON().world.skybox === "sunset"` | ✅ |
| 5 | Panel renders | SKYBOX panel shows "Procedural Sky · built-in" + 3 image tiles, active tile highlighted | ✅ |
| 6 | Real panel click | Clicking the "Clear Day" tile → `scene.background` = `clear_day.png`, persisted `"clear_day"` | ✅ |
| 7 | Revert | Clicking "Procedural Sky" → `background === null`, `Sky` mesh visible, env = RoomEnvironment, persisted `"sky"` | ✅ |
| 8 | Preview/game | Image skybox renders in preview mode with materials reflecting its IBL | ✅ (observed) |
| 9 | Import flow | Stub `showDirectoryPicker`/`showOpenFilePicker` (TESTING.md §9), import an equirect → manifest spliced + file written | ⏳ human/OPFS pass |

## Notes / deliberately out of scope

- **Fog** — `fogColor`/`fogDensity` remain dead fields; the hardcoded `FogExp2(0x87ceeb,
  0.006)` is unchanged. An image skybox does not restyle fog (a night skybox keeps the
  mild sky-blue fog). Future work if desired.
- **Cubemaps** — only equirectangular is supported; no 6-face `CubeTextureLoader` path.
- **HDR tiles** — an imported `.hdr` has no CSS-renderable thumbnail, so its grid tile
  shows the neutral placeholder (label still reads "HDR"). LDR imports and the starters
  show their image directly.
- **envIntensity** — the WORLD LIGHT ENVIRONMENT slider still multiplies the active env
  map (procedural or image); set to 0 to kill IBL from the skybox.
