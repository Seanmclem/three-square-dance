# In-app HTML guides

User-facing guides for the editor live here as self-contained HTML pages, so they ship
with the app (Vite copies `public/` into `dist/`) and open inside the editor.

## Convention (set 2026-09-30 with `brush-editing.html`)

- **One page per guide**: `public/docs/<topic>.html`. Inline `<style>` and inline
  `<svg>` diagrams, no scripts, no external CSS or fonts, so it works offline, in the
  desktop shell and as a plain file.
- **Images** beside it in `public/docs/img/<topic>/` (real editor screenshots).
- **Colors**: the editor's dark palette. Body text near-white (`#dde3f0` / `#c2cadb`),
  never grey on grey. Diagram SVGs use `var(--d-*)` tokens defined in the page's `:root`.
- **Opened from the ? menu**: give the section in `src/ui/HelpButton.tsx` a `guide`
  (`{ title, src }`); its header gets an "Open guide" button that shows the page in
  `DocViewerModal` (a frame over the editor; `window.open` does nothing in the desktop
  webview). The viewer has a find box (Cmd/Ctrl+F, Enter / Shift+Enter).
- **Right-click help** (2026-10-02): a UI element with `data-help="<id>"` opens the brush
  guide at `#<id>` on right-click (HelpButton's capture listener). Every `data-help`
  value must exist as an `id` in the guide; the page flashes the `:target`. Check with
  `grep -o 'data-help="[a-z-]*"' src/ui/*.tsx` against the guide's `id="help-…"`.
- **This file is the guide**: no claude.ai copy to keep in sync (the brush guide's copy
  drifted, so it was dropped from the app on 2026-10-02). Decision pages drawn on claude.ai
  while designing a feature get folded in here as a section once the feature ships:
  the agreed result, redrawn as inline SVG, plus a table-of-contents entry.
- **Prose**: plain words, no em dashes; each section opens with its point.
- **Keep it current**: when a guide's feature changes, update the page in the same
  commit, including its table of contents and the `help-…` anchor for any new button.

## Guides

| Page | Covers |
|---|---|
| `brush-editing.html` | Brush select modes, every brush op, loop cut, face and corner sets, outer walls, soft falloff, ROUND and editable curves, texture wrapping, folds, the brush editor; `help-…` anchors for right-click help |
| `model-to-fire-button.html` | Walkthrough tying it together: files → character (moves, timeline, upper-body shoot, aim poses) → player → Controls (Fire / Aim) → scripts, with a "where each thing lives" table |
| `controls.html` | The game's Controls page (Phase 89): every action per device, Xbox / PlayStation names, touch layout, your own buttons and what they do, the button script trigger, feel defaults, players' own changes in the pause menu |
| `characters.html` | Characters (Phase 86): the Characters panel, the character editor, moves and what plays when, borrowing clips from files with the same skeleton, keep in place, using characters as the player, enemies and in scripts |
