# Audio import/edit metadata parity — acceptance

Brings the sound importer + edit flow up to the model importer's metadata UX:
bulk/per-entry **custom categories**, **tags**, and **attribution autofill**.
(Un-numbered follow-up to Phase 36 audio, v4.59.x line.)

Files: `src/ui/AudioImporterModal.tsx`, `src/ui/AudioBrowser.tsx`, `src/App.tsx`
(importer props, sound-edit `categoryOptions`/`tagSuggestions`, tag merge in
`handleConfirmSoundEdit`), docs `AUDIO.md` + `HUMAN_TESTING.md`.

All checks below were run 2026-08-02 in Chrome via the TESTING.md §9 OPFS picker
stub (real `public/assets/audio` untouched; autosave snapshot-restored).

## Import (bulk)

- [x] SOUNDS panel → + Import Sound → Browse files… (2 files) shows the model-style
      meta step: "2 SOUNDS", **← Change files**, footer **Import all 2**.
- [x] **Set all to** category row lists SFX/Music/Ambient + **New category…**;
      picking New shows a name input; typing `Cave` applies to every entry.
- [x] Per-entry category select keeps its own **New…** option and can override the
      bulk value (second entry set to Music while the first stayed Cave).
- [x] **Tags** field (applies to all): `cave ambience` normalizes to a
      `cave-ambience` chip.
- [x] **Attribution** block shows **AUTOFILL FROM LIBRARY** listing packs/authors
      from BOTH sounds and models (Quaternius packs + "Synthesized fixture");
      picking the author preset fills AUTHOR + LICENSE.
- [x] Folder-grant UX matches models: amber "not set" note on the pick step, red
      inline **Set folder…** on the meta step, Import disabled until granted.
- [x] Manifest result: both files copied; entries carry the custom category, the
      per-entry override, shared tags, and shared attribution; the 3 existing
      fixture sounds untouched; `loop`/`spatial` flags preserved per entry.
- [x] Unknown categories are safe at runtime: `catToBus` routes anything that
      isn't Music/Ambient to the **sfx** bus (no code change needed).

## Edit (single)

- [x] Manage → Edit (1) now shows **TAGS** seeded with the sound's existing tags
      (previously invisible) and the CATEGORY select with **New…**.
- [x] New category `Stingers` + added tag `edited` → manifest entry updated,
      existing tags preserved (replacement semantics, field was pre-seeded).

## Edit (bulk)

- [x] Edit (3): CATEGORY options include the custom `Stingers` (derived from the
      live registry); **ADD TAGS TO ALL** + per-field attribution "apply" toggles.
- [x] Applied tag `bulk-pass` + author only: tag **unioned** into each sound's
      existing tags (nothing removed), author overwritten on all 3, license and
      categories untouched (apply off).

## Browser

- [x] Panel search matches tags as well as labels (mirrors AssetBrowser).
- [x] A custom category gets its own filter pill (pills were already derived
      from the sound list).

## Regression

- [x] `npm run typecheck` clean; no console errors during the whole pass.
