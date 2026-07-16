# Phase 37 — Skyboxes (selectable/importable image backgrounds)

## Context

The world's sky was **fully hardcoded** in `SceneManager._setupSky()`: a
`three/addons/objects/Sky.js` mesh with fixed turbidity/rayleigh/sun-angle,
`scene.environment` from `RoomEnvironment` (not the sky), and hardcoded fog.
`WorldConfig.skybox` existed but was **dead data** (always `"sky"`, read by nothing), and
the arch doc's "Phase 7 `SkyConfig`" scrubbing UI was never built.

This phase makes `WorldConfig.skybox` real: per scene, users pick the procedural sky
(default) **or** an imported equirectangular image. Selecting an image swaps
`scene.background` and rebuilds `scene.environment` from it (materials reflect/receive its
light), keeping the procedural sky as the default. Mirrors the Audio (Phase 36) and Decal
(Phase 20) asset pipelines.

### Decisions (locked with the user)
- **Per-world / per-scene** — on the existing `WorldConfig.skybox` field (no `ZoneDef`).
- **Equirectangular JPG/PNG + HDR** — LDR via `TextureLoader`, HDR via `RGBELoader` (lazy
  dynamic import). No cubemaps.
- **Background + IBL** — image drives both `scene.background` and `scene.environment`
  (`PMREMGenerator.fromEquirectangular`); `envIntensity` still multiplies.
- **Ship 3 procedural starter equirects** + keep "Procedural Sky" as the default.

## Design

`WorldConfig.skybox` is a discriminated string: `"sky"` = procedural; any other value = a
`SkyboxDef` id. New `world:sky { skybox }` event; `SceneManager` applies it live (editor +
runtime — both build a `SceneManager`). Everything else clones the audio pattern.

## Implementation (shipped)

- **types.ts** — `SkyboxDef`/`SkyboxManifest`/`SkyboxCategory`; `LeftPanelId` += `"skybox"`;
  bus events `world:sky`, `skyboxes:loaded`. `WorldConfig.skybox` stays `string` (no migration).
- **AssetManager** — `initSkyboxes()`, `getSkyboxList/getSkyboxDef/isSkyboxMissing`,
  `updateSkybox`, `removeSkyboxes`, `loadSkybox(id)` (LDR TextureLoader / HDR lazy RGBELoader,
  `EquirectangularReflectionMapping`, cached in `_skyboxTextureCache`, disposed on `dispose`
  only — quality-independent, so NOT cleared in `setQuality`).
- **SceneManager** — keep procedural `Sky` (stored as `_sky`) + RoomEnvironment env
  (`_roomEnvMap`); `_applySkybox(id)` toggles procedural vs image (background + regenerated
  PMREM env, `_skyboxEnvMap` disposed on swap), `_skyReqToken` stale-load guard; `world:sky`
  ctor subscription, unsub in `dispose`.
- **WorldState** — `updateWorldSky(skybox)` (non-journaled, emits `world:sky`); emit
  `world:sky` in `loadFromJSON`'s re-emit block.
- **App.tsx / RuntimeApp.tsx** — `initSkyboxes` (awaited before scene load in both, so the
  registry is ready when the loaded scene's `world:sky` fires); `worldSkybox` state synced
  from `world:sky`; `handleWorldSkyChange`, `handleDeleteSkyboxes`, `handleRequestSkyboxEdit`/
  `handleConfirmSkyboxEdit` (mirror the sound handlers); render `SkyboxImporterModal` +
  `EditMetadataDialog`.
- **UI** — `SkyboxBrowser.tsx` (grid: Procedural-Sky tile + image tiles, Import/Manage),
  `SkyboxImporterModal.tsx` (FSA import, manifest dedupe-splice); `IconSkybox`, Toolbar
  SKYBOX button, LeftPanel `"skybox"` case; `EditMetadataDialog` `noun` += `"skybox"`.
- **Assets** — `public/assets/skyboxes/manifest.json` + `clear_day`/`sunset`/`night_sky`
  equirect PNGs (+ thumbnails), generated with a zero-dep PNG encoder.

## Deliberately out of scope
- `fogColor`/`fogDensity` (still dead — hardcoded sky-blue fog); 6-face cubemaps.

## Verification
See `test-plans/phase-37-skyboxes.md`. Verified in-browser end-to-end (real toolbar/tile
clicks): live apply + persist + preview render + revert; `npm run typecheck` clean; zero
console errors. Import flow leaves an OPFS-stubbed / human folder-grant pass.
