# Phase 46 — Snapshot Prefabs: Capture From Selection (the door)

> Slice 4 of the prefab plan. Phases 44–45 built generator prefabs (Tiled
> Platform) with linked instances; this phase adds the user-authored kind:
> select a group of entities — a door model + its trigger + its open script —
> and save it as a reusable prefab whose instances each fire their own scripts.

## Capture (`captureSnapshotPrefab`, src/prefab/expand.ts)

- Input: the multi-selection refs. PREFABABLE members (object / trigger-volume /
  shape / stair / ladder) are deep-cloned; node-backed types (wall / floor /
  platform) are skipped with a console warning (shared-node re-expansion diffing
  is deferred).
- Template space: XZ pivot at the anchors' centroid, y = 0 at the lowest anchor
  (stairs contribute both start and end). Existing `prefab` stamps are stripped
  (capturing members of another instance yields an independent template).
- `memberKey` = the source entity id at capture time — deliberately the same key
  `remapScripts` uses at instantiation, so a script on the volume that targets
  the door's capture-time id remaps to each instance's own door id.
- Returns `{prefab, origin, captured, skipped}`; does not touch the world.

## Create-Prefab UX

- Multi-select Properties screen: **"⬡ Create Prefab"** button (≥1 capturable
  ref). Names the def `Prefab N` (rename inline in the Prefabs panel — the
  addGroup "New Group" precedent; no `prompt()`, which would eat the user
  activation).
- `handleCreatePrefab` (App): library add (not undoable — game-config precedent),
  then ONE undoable transaction: `removeEntities(originals)` +
  `instantiatePrefab(prefab, origin)` (joins the transaction) — the selection
  becomes the prefab's first linked instance in place. Prefabs panel opens.
- `TriggerVolumeView` renders the `PrefabSection` too (passed as a node prop —
  volumes root-render outside the generic isRoot path), so a door's volume
  member shows variables/unlink/etc. like its object members.

## Verification (2026-07-21, Chrome MCP, real UI)

Door rig: `door1` object + 3×3×2 trigger volume with an `on_player_enter` script
whose `move_object` targets the door (authored via `__world` mutators — the
TESTING.md §3 exception path; multi-select via the Groups panel "Select" button
because the extension's shift-modifier clicks don't reach the canvas).

- Create Prefab → library "Prefab 1" (snapshot, 2 template members); originals
  replaced by instance #1; the instance volume's script targets the NEW door id.
- Placed instance #2 → each volume targets its own instance's door
  (`targetIsOwnDoor: true` for both).
- Preview: walking into instance 2's trigger moved ONLY door 2 — door 1
  untouched. Per-instance script remap proven through the real TriggerSystem.
- Cleanup: instances + test group removed; autosave restored byte-identical.

## Caveat discovered (documented, deliberate v1)

Literal coordinate payloads inside captured actions (`move_object.position`)
are captured **verbatim** — NOT re-based per instance. Door 2 moved to the
template's absolute coordinates. Guidance: prefab scripts should use
relative/targeted actions (`open_door`, `play_animation`, `despawn_object`);
re-basing `position` payloads relative to the instance origin is a candidate
increment (it needs an "is this Vec3 world-space?" convention per action type).

Also noted this session: a hidden test tab freezes rAF, so TriggerSystem never
ticks — a screenshot (tab activation) resumes it; the teleport-then-frozen
player was the tell (TESTING.md §3 hidden-tab section applies to trigger tests).

## Deferred to phase 47+

- Isolated edit mode + propagation on prefab save (version bumps).
- "Select all members" button; real-mesh placement ghost.
