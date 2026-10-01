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
  (`{ title, src, externalUrl }`); its header gets an "Open guide" button that shows the
  page in `DocViewerModal` (a frame over the editor; `window.open` does nothing in the
  desktop webview).
- **claude.ai copy**: the editable, commentable version can live as a claude.ai doc.
  Link it in the page header and as the guide's `externalUrl` (the modal's
  "Open on claude.ai" button uses `openExternal`, which accepts https only).
- **Prose**: plain words, no em dashes; each section opens with its point.
- **Keep it current**: when a guide's feature changes, update the page in the same
  commit (and the claude.ai copy if there is one).

## Guides

| Page | Covers | claude.ai copy |
|---|---|---|
| `brush-editing.html` | Brush select modes, every brush op, loop cut, vertex sets, folds | https://claude.ai/artifact/GSVFjgd2USHxAE5FjLUCF6 |
