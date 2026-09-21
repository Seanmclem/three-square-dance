# Test Plan — Phase 44: Prefab Core + Tiled Platform (v4.38.0)

Automated checks marked [x] were run via Chrome MCP on 2026-07-21 (see
`plans/phase-44-prefab-core.md` §Verification). Unchecked boxes = human/manual.

## Data layer (console, `__world`)

- [x] Place a Tiled Platform → active zone gains 1 `prefabInstances` record
      (`pfi_`, `variables {width:3, depth:3, tileSet:"grass"}`, origin at click)
      and 9 objects with `prefab: {prefabId, instanceId, memberKey "tile_i_j"}`.
- [x] Member layout: 2m pitch centered on origin; corner assets at the 4 grid
      corners (rotY 0/90/180/−90), sides on edges, center inside.
- [x] One Cmd+Z removes ALL members + the record; Cmd+Shift+Z restores them with
      the SAME record id (journal round-trip). Undo again → clean.
- [ ] Reload the tab → placed instances + library survive (autosave round-trip).
- [ ] With a project open: place → Save → `game.json` contains `prefabs[]` and
      the scene file contains `prefabInstances` + stamped members; runtime
      (`runtime.html`) loads the scene and renders/collides the platform with no
      prefab code.

## UI flow

- [x] ASSETS flyout shows a Prefabs row; clicking opens the PREFABS panel.
- [x] BUILT-IN GENERATORS lists "ƒ Tiled Platform"; Place creates the library
      def (list moves it to the library section with count 0) and arms placement.
- [x] Green extents ghost (6×6 for 3×3) follows the cursor, lands on surfaces.
- [x] Click places; ghost persists for continuous placement; Esc stops.
- [ ] R rotates the ghost 90° and the placed members follow the rotation.
- [x] Panel instance count updates on place/undo (0 ↔ 1).
- [x] Delete (×) is disabled while instances exist (tooltip explains).
- [ ] Rename a prefab → sticks (and persists via game.json/session store).
- [ ] No project open: place a platform, reload → library entry present
      (localStorage `worldeditor_prefabs`); then open a project → prefab is
      promoted into game.json (console info logs it) and the session key clears.

## Physics / rendering

- [x] Preview: character stands at y ≈ 1.91 on the center tile (flat-plane mesh,
      slab preset collider) and on a corner tile — uniform height, no seams.
- [x] Platform renders seamless: skirts face outward on all 4 sides, corners
      rounded — matches the old DynamicPlatform look.
- [ ] Walk across the whole platform and off an edge (falls; no invisible walls
      from the ±1.117 skirt overhang).
- [ ] FpsCounter: ~10 platforms of 4×4 — draw calls rise as expected, worst-ms
      stays at baseline (PROFILING.md §8).

## Regressions

- [x] `npm run typecheck` → 0 errors.
- [x] Console clean of prefab-related errors during the whole flow.
- [ ] Object/Decal placement, groups, copy/paste unaffected (spot-check).

## Rounded corners (v4.88.0)

Checked without the editor (script output + an isolated three.js viewer on the
real generator output and files):

- [x] `node scripts/make-round-corners.mjs` twice gives identical bytes.
- [x] Every triangle's winding agrees with its normals; both end rings of each
      round corner equal its side tile's profile exactly.
- [x] All four checkboxes off: output identical to the previous generator.
- [x] All 16 corner combinations, both tile sets, heights 1/2/3/5: every emitted
      asset id exists in the manifest; one round tile per ticked corner per layer.
- [x] By eye: 2 x 2 all-round is a circle (1 and 4 layers); 4 x 3 with two
      opposite corners rounded sits cleanly beside two square corners; dirt set
      matches; stripes and grass lip continuous through the seams.

Still to do in the editor:

- [ ] Select an existing Tiled Platform: the four "Round ... corner" checkboxes
      show, all unticked, and the platform is unchanged.
- [ ] Tick each one: the matching corner (and only it) goes round on every
      layer; untick restores it; each is one undo step.
- [ ] Preview: walk the curved edge. You stay on over the curve and fall where
      the square tip used to be (no invisible floor at the diagonal).
- [ ] Rotate the instance 90 degrees: the rounded corners turn with it.
- [ ] Asset browser: the six `... Corner Round` pieces are listed under Pieces;
      re-stage a thumbnail for each (Manage mode, camera button).
