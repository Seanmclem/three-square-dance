# Test Plan — Phase 48: 2D Graphics Assets (v4.43.0)

[x] = verified via Chrome MCP 2026-07-24 (`plans/phase-48-graphics-assets.md`;
FSA pickers stubbed with OPFS per TESTING.md §9 — real-folder grant is the
remaining one-click human check).

## Panel + flyout

- [x] ASSETS flyout lists Graphics (IconGraphic) after Skybox; clicking opens
      the GRAPHICS panel (search, All pill, + Import Graphics, hint, empty
      state).
- [ ] With real files committed: grid shows checkerboard tiles, labels,
      dimension tooltips; search + category pills filter.

## Bulk import (OPFS-stubbed)

- [x] + Import Graphics → Choose image files… (2 PNGs) → meta phase lists both
      with auto-labels, one shared Category ("Icons"), attribution block,
      grant button.
- [x] Import 2 graphics → files copied into the graphics dir, manifest.json
      dedupe-spliced with both entries **including width/height** (decoded
      from the copied bytes — decoding the source File can hit an invalidated
      snapshot; found live when source and dest were the same OPFS file).
- [x] Re-import same ids → entries replaced, not duplicated.
- [ ] jpg/webp accepted; non-image files filtered out of the pick.

## ITEMS tab icon picker

- [x] ItemRow gains a Pick button beside Icon URL; popover renders (search +
      checkerboard mini-grid; correct empty state pointing at Assets →
      Graphics).
- [ ] Picking a graphic writes its path into the Icon URL field and the 24px
      preview renders (needs real files).
- [x] Icon previews (ItemRow + BagOverlay) go through
      `assetManager.resolveUrl` + `objectFit: contain`.

## Icon-from-3D (transparent renders)

- [x] Models panel → Manage → ☑ one asset → 📷 opens the stager; normal mode
      renders identically to before (alpha:true regression check — opaque
      background unchanged).
- [x] "Icon (transparent background)" checkbox → checkerboard preview, grant
      hint switches to public/assets/graphics, button becomes Save Icon.
- [x] Preview pixel probe: corner alpha 0, model center opaque.
- [x] Save Icon → `<assetId>_icon.png` written (valid PNG, RGBA color type 6)
      + graphics manifest entry (`<assetId>_icon`, Icons, 256×256).

## Regressions

- [x] `npm run typecheck` → 0 errors.
- [x] Console clean on load (initGraphics quiet with the empty manifest).
- [x] Autosave hash byte-identical at session end; no world mutations.
