# Phase 48 — 2D Graphics Assets (icons / UI images)

> User request (2026-07-24): menu items, HUD, etc. will need assets that are
> basically 2D images — items currently accept a hand-typed icon URL; we should
> be able to pick an uploaded 2D asset (PNG with transparency), import 2D UI/icon
> asset packs (e.g. Kenney's UI packs) into a dedicated graphics manifest, and
> also make an icon *from* a 3D model (the thumbnail renderer already exists).

## Decision & rationale

A new **Graphics** asset type, parallel to models/materials/decals/sounds/skybox:

- Own manifest `public/assets/graphics/manifest.json`, own browser panel, own
  entry in the ASSETS toolbar flyout — graphics are imported files, so they
  belong in the ASSETS grammar (unlike prefabs, which are authored data).
- `ItemDef.icon` **stays a bare URL string**. The new picker is sugar that
  writes the chosen graphic's `path` into it — zero data migration, the URL
  input remains as a fallback, BagOverlay/portrait rendering unchanged.
- Icon-from-3D reuses the existing ThumbnailStager (orbit/zoom/light staging is
  exactly what an icon shot needs) with a transparent-background render mode,
  saving into the graphics manifest instead of overwriting the model thumbnail.

## Data shapes (`src/types.ts`)

```ts
export interface GraphicDef {
  id: string;            // slug from label (audio-importer precedent)
  label: string;
  category?: string;     // pill filter — "Icons", "HUD", pack name…
  path: string;          // /assets/graphics/<file>.png|.jpg|.webp
  width?: number;        // intrinsic px, read at import via createImageBitmap
  height?: number;
  attribution?: Attribution;
}
export interface GraphicsManifest { version: string; graphics: GraphicDef[]; }
```

`LeftPanelId` gains `"graphics"`.

## Implementation

- **Manifest seed**: commit `public/assets/graphics/manifest.json` with an empty
  `graphics` array. Editor-written via FSA (dedupe-splice) like the others.
- **AssetManager**: `initGraphics()` cloned from `initDecals`;
  `getGraphicDef(id)` / `getGraphicList()`; plus a **public**
  `resolveUrl(path)` delegating to the private `_resolve` so `<img src>`
  consumers respect the runtime `assetsBase` (BagOverlay has this latent gap
  today).
- **Toolbar**: `IconGraphic` glyph + a Graphics `ASSET_ENTRIES` row
  (`kind: "panel"`, panel `"graphics"`). `assetEntryActive` covers highlight.
- **GraphicsBrowser** (new): DecalBrowser's grid + checkerboard-tile CSS (the
  transparency-visible backdrop), search input (packs are large), category
  pills, "+ Import Graphics" button. No manage/delete mode in v1.
- **GraphicPickerPopover** (new, shared): checkerboard mini-grid over
  `GraphicDef[]` with `onPick` — used by the ITEMS tab now, by the Phase 49 UI
  tab next.
- **GraphicsImporterModal** (new): clone of AudioImporterModal — bulk
  `showOpenFilePicker` (png/jpg/webp), per-entry label edit, one shared
  Category input for the batch (packs share a category), shared attribution,
  grant `public/assets/graphics`, copy files + splice manifest; `width/height`
  read via `createImageBitmap` during import.
- **App wiring**: `graphics` / `graphicsDir` / importer-open state mirroring the
  audio trio; boot `initGraphics`; reload on import complete; props threaded to
  LeftPanel → GraphicsBrowser and ScriptPanel (picker).
- **ITEMS tab picker**: `ItemRow` gets a "Pick" button beside the Icon URL input
  opening `GraphicPickerPopover`.
- **Icon-from-3D**: `thumbnailRenderer` constructed with `alpha: true` (opaque
  scene background keeps existing thumbnails pixel-identical); `render` gains a
  `transparent` option (background null + clear alpha 0, restored after).
  ThumbnailStagerModal gets an "Icon (transparent background)" checkbox —
  checked: checkerboard preview, save button becomes "Save Icon" →
  `App.handleSaveIcon` writes `<assetId>_icon.png` + a manifest entry into
  graphics (separate FSA grant from models — the hint must say so).
- **resolveUrl touch-ups**: BagOverlay icon `<img>` and the ItemRow preview wrap
  src in `assetManager.resolveUrl(...)`. (DialogueOverlay portraits share the
  gap — out of scope, noted.)

## Verification

- `npm run typecheck` → 0 errors.
- Browser pass (TESTING.md §9 OPFS picker stub): stub `showOpenFilePicker` /
  `showDirectoryPicker`, import 2 small PNGs through the real modal UI, assert
  OPFS manifest has both entries with width/height and the files copied.
  (OPFS writes are invisible to the HTTP re-fetch — assert on OPFS + the
  modal's done list, not the refreshed grid.)
- With real committed files: panel grid shows checkerboard tiles; ITEMS Pick
  popover writes `icon`; 24px preview renders.
- Icon mode: stager checkerboard preview; decode the data URL into a canvas and
  assert a corner pixel has alpha 0. One existing model thumbnail re-rendered
  and eyeballed (alpha:true regression check).

## Docs

WORLD_EDITOR_ARCHITECTURE.md changelog + phase section + file-level sections
(AssetManager, Toolbar, LeftPanel, thumbnailRenderer, new files).
Acceptance checklist: `test-plans/phase-48-graphics-assets.md`.
