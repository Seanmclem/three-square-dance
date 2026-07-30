# Phase 52 — Re-origin models (v4.52.0) — acceptance checklist

Move a model's pivot from the asset browser: Manage mode → check exactly one
model → ⌖ → pick Base or Center → the `.gltf`/`.glb` is rewritten in place and
placed copies optionally shift to compensate.

Automated pass ran 2026-07-30 (this session) via the Chrome extension with the
TESTING.md §9 OPFS picker stub — all checks below passed unless marked human.

## Setup

- Editor at `localhost:7373`, autosave snapshotted (TESTING.md §3 protocol —
  60KB worlds need the localhost POST-receiver trick from §10, not chunked dumps).
- OPFS stub seeded with `manifest.json` + the target model file;
  `window.showDirectoryPicker = async () => opfs`.
- Test object: `__world.addObject("demo", { id: "test_reorigin_fruit",
  assetId: "fruit", position: {x:5,y:0,z:-5}, rotation: {x:0,y:90,z:0},
  scale: {x:2,y:2,z:2}, floor: 0, properties: { interactable: false } })` —
  the non-identity rotation + scale exercise the compensation math.
- `fruit.gltf` reference bounds: min Y −0.3317, center (0.1073, 0.0798, −0.0130).

## Checks

| # | Step | Expected | Result |
|---|---|---|---|
| 1 | Assets panel → Manage | ⌖ button appears between 📷 and Delete, disabled at 0 or 2+ checked | ✅ |
| 2 | Check one model → ⌖ | Modal opens: plain-language origin summary ("base is 0.33 below the origin, off-center sideways by X 0.11, Z −0.01") | ✅ |
| 3 | Mode radios | Base (default) / Center; shift line updates with the exact delta | ✅ |
| 4 | Placed copies line | "Move the 1 placed copy…" checkbox, default on; hidden when 0 placed | ✅ (1 copy) |
| 5 | Grant warning | Shown when `modelsDir` not yet granted | ✅ |
| 6 | Apply (Base) | File rewritten: new `__reorigin` node with translation exactly (−center.x, −min.y, −center.z) = [−0.10733, 0.33171, 0.01304]; `scenes[0].nodes` re-rooted onto it; original root becomes its child | ✅ |
| 7 | Compensation | Placed copy position = old − R·(S·delta): (4.97392, −0.66342, −5.21466) for yaw 90°, scale 2 — matched to 5 decimals | ✅ |
| 8 | Mesh rebuild | Placed copy's mesh replaced (tagged old mesh gone after `asset:model-updated`); collider auto-fit rebuilt with it | ✅ |
| 9 | Cache eviction | `evictModel` forces a fresh fetch (`?v=1`) — rebuild after eviction must re-load the file, second rebuild may hit the re-primed cache | ✅ (rebuilt from evicted cache) |
| 10 | No console errors | Clean during the whole flow | ✅ |
| 11 | Real folder untouched | `git status public/assets/models/` clean after the OPFS-stubbed run | ✅ |

## Not covered by the stub (one-click human checks)

- **Real FSA write:** run ⌖ on a real model with the actual folder grant and
  confirm the file on disk gains the `__reorigin` node and the viewport model
  drops/rises to its new pivot after the rebuild (the stub writes to OPFS, so
  the served file never changes and the visual shift can't be observed).
- **.glb container:** the GLB rewrite path (header/chunk/padding) is covered by
  unit-style logic only — re-origin one real `.glb` asset and confirm it still
  loads. (The library is currently all `.gltf`.)
- **Undo:** the compensation transaction ("re-origin placed copies") should
  restore old positions; the file itself intentionally stays re-origined.

## Known limitations (by design, stated in the modal)

- File rewrite is not undoable; copies in other scenes/projects shift on their
  next load.
- OBJ models are declined (GLTF/GLB only).
- Prefab *definition* copies (stored member data inside prefab instances) are
  not compensated — only placed world objects are.
