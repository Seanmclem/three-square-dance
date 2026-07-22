# Test Plan — Phase 46: Snapshot Prefabs (v4.40.0)

[x] = verified via Chrome MCP 2026-07-21 (real UI; `plans/phase-46-snapshot-prefabs.md`).

## Capture

- [x] Multi-select an object + trigger volume (Groups panel → Select) → the
      multi screen shows "⬡ Create Prefab".
- [x] Create Prefab → library gains a ⬡ snapshot def ("Prefab N", 2 template
      members); the ORIGINALS are gone, replaced by a stamped linked instance
      at the same spot (one undo step).
- [x] The instance volume's script `targetId` = the instance's own (new) door
      id — capture-time ids remapped.
- [ ] Undo after Create Prefab → originals return, instance gone (library def
      remains — library is not journaled, matches items).
- [ ] Capture with a wall/floor in the selection → those are skipped, console
      warns, the rest captures.
- [ ] Capture members of an EXISTING instance → new template has no stale
      stamps (independent prefab).

## Multi-instance behavior (the point of the feature)

- [x] Place a second instance → its volume targets ITS door
      (`targetIsOwnDoor` true for every instance).
- [x] Preview: enter instance 2's trigger → only door 2 moves; door 1 stays.
- [ ] on_interact scripts on a captured object fire per instance (owner-keyed
      trigger auto-targets — no explicit targetId to remap).
- [x] KNOWN CAVEAT: absolute `move_object.position` coords are captured
      verbatim (not re-based per instance) — use open_door/play_animation for
      real doors. Documented in plan + changelog.

## Instance panel on volumes

- [x] Selecting the instance's trigger volume shows the Prefab section
      (TriggerVolumeView passthrough).

## Regressions

- [x] `npm run typecheck` → 0 errors.
- [x] Cleanup left the user's scene intact (only pre-existing entities remain);
      autosave restored byte-identical.
- [ ] Bake button still appears for all-shape selections (Create Prefab button
      didn't displace it).
