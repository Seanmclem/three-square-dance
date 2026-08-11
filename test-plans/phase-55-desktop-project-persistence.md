# Phase 55 test plan — desktop project persistence (executed 2026-08-11)

## Automated — backend unit smoke (scratch workspace, `deno run`)

All PASS: workspace resolution; createProject + duplicate refusal; traversal
id refusal; non-JSON write refusal; backup on overwrite; atomic content;
backup rotation pruned to 10 (after fixing a same-millisecond filename
collision found by this test); listProjects; delete→trash; autosave round
trip + clear; session round trip; export file write.

## Automated — bindings e2e in the real shell (`WORLDBUILDER_BOOT=probe55`,
scratch workspace)

All 13 PASS: bindings present → fixture fetch → createProject → saveScene
(fresh, no backup) → writeGameFile/writeProjectManifest → **HTTP read-back
byte-identical** → manifest served → overwrite makes rotating backup →
listProjects → session round trip → autosave round trip + clear →
**openRuntimeWindow opened a second native window running the just-written
game** (pj-fixture scene).

## Typechecks

`tsc --noEmit` clean; `deno check desktop/main.ts` clean.

## Manual (user, `deno task desktop:hmr`)

- [ ] PROJ ▾ → New Project… (name only) → creates `public/games/<id>/`, editor
      adopts it; git diff shows clean pretty-printed JSON
- [ ] Save (⌘S) → scene/game/manifest written; `.worldbuilder/backups/…`
      rotates; autosave label updates
- [ ] PROJ ▾ → Open Project… lists platfrom-obby / pj-fixture / test-project2;
      opening one loads its entry scene
- [ ] Scene switch / add / delete (delete lands in `.worldbuilder/trash/`)
- [ ] ▶ Play → native runtime window (reused on second press)
- [ ] Quit + relaunch → last project + scene restored silently (no banner)
- [ ] Force-quit mid-edit → relaunch offers the autosaved world
- [ ] FILE Save with no project → file in `.worldbuilder/exports/`, revealed
      in Finder; FILE Load via file picker works
- [ ] Commit `public/games/**` after the session (dev workspace writes there)

## Notes

- Publish… no longer appears in the PROJ menu (returns as Export in phase D).
- Asset import/edit/delete flows are known-broken in the shell until phase C.
