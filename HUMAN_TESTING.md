# Human Testing Guide

How to exercise features **by hand, through the UI** — no browser console, no dev
helpers. (For the automation/Claude-driven side — dev globals, the `window.__test`
harness, reading state programmatically — see `TESTING.md`. Per-phase acceptance
checklists live in `test-plans/`.)

## Launch

```bash
npm run dev          # then open the printed http://localhost:5173/
```

## Basics you'll reuse

- **Select** something: Select tool (V), click it. The right-hand **Properties** panel
  shows its `label · id` in the header. Rename with the ✎ pencil to give it a memorable
  label/id.
- **Left panels** (bottom-left buttons): **MATS** (materials), **SCRIPTS** (scripting),
  and the asset/groups panels. The Groups panel also opens when you pick the groups tool.
- **Play**: the green **▶ Preview** button bottom-left (hotkey **G**), or its dropdown
  caret → **Start Game**. Preview lets you walk around; Start Game also spawns you at the
  level's spawn point and fires `on_game_start`.

> **Persisted vs runtime:** editor edits (moving via gizmo, panel fields, group
> assignment) change the saved level. **Script actions are runtime-only** — they affect
> the live play session, not the saved file, and reset when you leave preview/reload.

---

## Workflow: author & run a script action

Use this to test `despawn_object`, `move_object`, `change_material`, `play_animation`,
`fade_screen`, etc.

> **How a script is put together — three independent parts:**
> 1. **Where it lives** — the tab (LEVEL vs SELECTED). Just storage; doesn't affect *when*
>    it runs.
> 2. **What fires it** — the **trigger** dropdown (`on_game_start`, `on_interact`, …).
> 3. **What it does** — the **actions** (despawn, move, …).
>
> **"trigger" ≠ "trigger volume".** A *trigger* is the firing event you pick in the
> dropdown. A *trigger volume* is an invisible region you place in the world; it's just
> *one source* of a trigger (it produces `on_player_enter` / `on_player_exit`). You do
> **not** need a trigger volume for most scripts — `on_game_start`, `on_interact`, and
> `on_timer` don't involve one.

1. **Note the target's id.** Select the object you want the script to affect; read its
   `id` from the Properties header (rename it for clarity if you like). For a **group**
   target, create the group in the Groups panel first and use the group's name/id.
2. **Open SCRIPTS** (bottom-left) and pick **where the script lives** (this is *not* the
   trigger — that's the next step):
   - **LEVEL** — the script belongs to the level. Use for `on_game_start`, `on_timer`,
     or anything not tied to one entity.
   - **SELECTED** — the script is attached to whatever object or trigger volume you have
     selected. Use for `on_interact` on that object, or `on_player_enter`/`exit` on that
     trigger volume.
3. **Add a script** (+ New) and choose **what fires it** — the **trigger** dropdown:
   - `on_game_start` — fires automatically on Start Game.
   - `on_interact` — pick the object from the target dropdown. **The object must be
     marked Interactable** (Properties) so you can press **E** on it in game.
   - `on_player_enter` / `on_player_exit` — fires when the player crosses a **trigger
     volume** (place one first with the trigger-volume tool, then select it and author
     under the SELECTED tab).
   - `on_timer` — set an interval (and repeat).
4. **Add the action** (action-type dropdown → **+ Add**) and fill its fields. The
   **Target** field is a dropdown of the zone's **Groups** and **Objects** (a group target
   fans out to every member):
   - `despawn_object` — pick a target.
   - `move_object` — pick a target + set the destination X/Y/Z.
   - `change_material` — pick a target + type a material id.
   - `play_animation` — pick a target + type a clip name (the object's asset must have it).
   - `fade_screen` — color + duration.
5. **Play** (▶ Preview / Start Game) and **trigger it**: press **E** on an interactable,
   walk into the trigger volume, wait for the timer, or let `on_game_start` fire.
6. **Leave preview** to reset — runtime script effects revert (the saved level is
   untouched).

### Do I need a trigger volume?

**Only for scenario C** below (`on_player_enter` / `on_player_exit`). `on_game_start`,
`on_interact`, and `on_timer` do **not** use one.

---

### Scenario A — `on_game_start`, no trigger volume (despawn a group)

1. Place two objects (drag from the Assets list). Open the **Groups** panel, **+ New** a
   group. Select each object → Properties → **Groups** accordion → check the group, so
   **both** are members.
2. Open **SCRIPTS** → **LEVEL** tab → **+ New**. Trigger = `on_game_start`.
   **+ Add** action → `despawn_object` → Target = your group (under the **Groups**
   heading in the dropdown).
3. Click the **▶ dropdown caret → Start Game** (`on_game_start` only fires in game mode).
4. **Expect:** both objects vanish immediately. **Leave preview** → they reappear (script
   effects are runtime-only).

### Scenario B — `on_interact`, no trigger volume (recolor an object with E)

1. Place one object. Select it → Properties → **Geometry** screen → check **Interactable**
   (optionally set a prompt label). Note a material id you want to swap to (any id from
   the Materials panel).
2. With the object still selected, open **SCRIPTS** → **SELECTED** tab → **+ New**.
   Trigger = `on_interact` (target is this object, implicit). **+ Add** → `change_material`
   → Target = the object, and type the material id.
3. Click **▶ Preview** (hotkey **G**). Walk up to the object (**WASD**, mouse to look);
   an **"Interact"** prompt appears within range. Press **E**.
4. **Expect:** the object's material swaps. Leave preview → reverts.

### Scenario C — `on_player_enter`, **with** a trigger volume (fade the screen)

1. Pick the **Trigger** tool (toolbar, hotkey **U**). **Click-drag on the floor** to draw
   the volume (scroll to adjust its height). It auto-selects and the **SCRIPTS** panel
   opens to **SELECTED**.
2. **+ New** script. Trigger = `on_player_enter` (fires when the player crosses this
   volume). **+ Add** → `fade_screen` → set a color (e.g. `#000000`) and duration (e.g.
   `1`).
3. Click **▶ Preview** (**G**). Walk into the volume's footprint.
4. **Expect:** the screen fades to your color as you cross the boundary. Leave preview to
   reset.

> Trigger volumes are invisible at runtime — in the editor they show as a wireframe box so
> you can see where to walk.

### Scenario D — branching dialogue tree (Phase 30)

> Full authoring guide (conditions, effects, items-as-counters, JSON format):
> **`DIALOGUES.md`**.

1. Open **SCRIPTS** → **DIALOGUE** tab → **+ New**. Set a Label and Speaker. Node `n1`
   is created for you — type its lines in the textarea (one per line).
2. **+ Add node** to create `n2`. On `n1`, under **Options → + Add**, type a response
   ("I'm new here."), set its next-node dropdown to `n2`, and under **On pick → + Add**
   add a `set_state` effect (e.g. key `met_npc`, value `true`).
3. Add a second option ("We've met — got my reward?") that **ends** the conversation
   (next = "— end conversation —"), gate it under **Show if → + Add** with
   `has_state met_npc`, and give it an On-pick `adjust_number` effect (e.g. `coins` +5) —
   that's the "give item" pattern (items are just state counters).
4. Place an object, mark it **Interactable**, and on its **SELECTED** tab add an
   `on_interact` script with a `show_dialogue` action → pick your dialogue from the
   dropdown.
5. **▶ Preview**, press **E** on the object. **Expect:** lines advance with **E**; on the
   last line the options appear — the gated option is hidden the first time. Pick
   "I'm new here." → node 2 plays. Talk again: the gated option is now visible
   (its flag was set); pick it and the dialogue ends. Arrow the highlight with the
   d-pad/menu-nav on gamepad, click rows with the mouse, tap them on touch.
6. Optional: a LEVEL script with trigger `on_dialogue_end` (target = your dialogue)
   fires whenever that conversation closes — including if the player cancels out.

---

## Workflow: stamp a decal (sticker / crack / paint)

1. Click the **Decal** tool in the left toolbar (bottom of the strip). The **DECALS**
   panel opens with a grid of decal textures (Overlay kind; Surface is a later phase).
2. Click a texture tile — it highlights, and the tool is armed.
3. Hover any wall, floor, platform, or stair: a translucent **ghost** of the decal sticks
   to the surface under the cursor, facing outward.
4. Adjust before stamping:
   - **Scroll** = bigger/smaller (camera zoom is suspended while the ghost is on a surface).
   - **Shift+scroll** (or `[` / `]`) = rotate around the surface normal.
5. **Click** to stamp. The tool stays armed — keep clicking to stamp more. **Esc** when done.
6. Edit later with the **Select** tool: click the decal (it wins the click over the wall
   behind it) → the panel shows texture swap, position, width/height, rotation, opacity,
   and **Delete Decal**. Drag the translate gizmo to move it — it re-projects onto the
   surface. Everything is undoable (Cmd+Z).

> Decals have no target — they re-project onto whatever is near their anchor. If you move
> or delete the wall under one, the decal keeps its data and simply renders nothing until
> geometry returns. Very large decals on thin walls can faintly bleed onto the back face —
> that's the projector depth; shrink the decal (or its `depth` field) if it matters.

**Surface decals (stains / weathering):** switch the DECALS panel to **Surface** and pick
a Weather texture (leak stain, moss, grime). Same stamp controls, but instead of a mesh
the effect is blended into the surface's own shader — no seam at the edges, and the
**TRIPLANAR** toggle (in the selected decal's panel) makes it wrap corners and edges.
**WET ROUGHNESS** glosses the stained area (leave blank to disable). Selecting one shows
a cyan rectangle outline (there's no mesh to highlight). Max 4 surface decals per
wall-run/floor mesh.

---

## Workflow: place a shape primitive (cylinder / wedge / box)

1. Click the **Shape** tool in the left toolbar (between Stair and Object). A popover
   opens beside it with **◍ Cylinder / ◺ Wedge / ▤ Box** — pick one (the button keeps
   your last choice on re-click).
2. Place it:
   - **Cylinder**: click where the **center** should be, move the mouse to grow the
     radius (a translucent blue ghost follows), click again to place.
   - **Wedge / Box**: click one corner of the footprint, move to the opposite corner,
     click to place. The wedge's high edge faces away (−Z) — rotate it after placing.
   The base sits on whatever you clicked (ground, a platform top, etc.).
3. The new shape auto-selects. In the **Geometry** screen you can tune everything:
   - Cylinder: radius top/bottom (top 0 = cone), height, **segments 3–64**
     (3 = triangular prism, 6 = hex pillar, 16+ = round; low counts render faceted).
   - Wedge: width/depth + height low/high (low 0 = a true ramp — walkable up to 45°).
   - Box: width/depth/height + **taper X/Z** (pyramid/trapezoid tops) and
     **shear X/Z** (leaning blocks).
   Plus position, full XYZ rotation, floor level; **Material** screen for the texture.
4. Gizmos: **T** translate, **R** rotate (all three rings work — tip a cylinder onto
   its side, lean a box). No scale gizmo — resize through the params or the
   **RESIZE HANDLES** checkbox in the Geometry screen: axis-colored cubes on each face;
   drag to push/pull (opposite face stays pinned, cylinder handles change the radius,
   the top handle changes height; Alt = no grid snap). Delete, copy/paste (Cmd+C/V),
   duplicate (Cmd+D), groups, and script despawn/move all work like other entities.
   Everything undoable.
5. Materials: the **Material** screen has separate **TOP / BOTTOM** and **SIDES**
   sections (like platforms) — e.g. brick sides with a concrete top.
6. **Brush editing (arbitrary convex solids):** in the Geometry screen press
   **Convert to Brush**. Amber spheres appear on every corner — drag one to reshape
   (the solid re-derives as a convex hull live; Alt = no snap), **right-click** a corner
   to delete it, **+ Add corner** then click anywhere on the brush to add one (it starts
   on the surface — drag it outward to grow a new point). **Revert to … params** goes
   back to the parametric shape. The solid always stays convex, and collision always
   matches exactly.
7. **Face, vertex & edge editing (Blender-style, v4.11.0 / v4.14.0):** the Select
   button has four modes — **◇ Object (1) / ▣ Face (2) / • Vertex (3) / ╱ Edge (4)**
   (popover or number keys).
   - **Face mode (2):** click any face of a brush — it highlights blue, a 3-axis gizmo
     appears on it (drag the whole face anywhere, Alt = no snap), and the Geometry
     screen lists every face with the selected one expanded: per-face **material +
     tile**, **SPLIT ─ / SPLIT │** (4-corner faces; neighbors gain the new corner
     automatically so nothing cracks), and **EXTRUDE** (pushes the face out 0.25 —
     then drag it wherever). The Materials screen lists **every face** with its own
     picker; hovering a row highlights that face in the canvas. Concave results are
     fine — collision follows exactly (walk into an alcove you cut).
   - **Vertex mode (3):** corner spheres show only in this mode; click one (cyan) for
     a 3-axis gizmo + an editable X/Y/Z row in the Geometry screen.
   - **Edge mode (4):** click a brush face near an edge — the closest edge lights up
     as a blue tube with a 3-axis gizmo at its midpoint; drag to move both endpoints
     together (fold a box top edge down and you've made a wedge). Face and edge modes
     also outline every brush edge in thin black lines so the targets are visible.
   - The first face/vertex/edge-mode click on an old convex-cloud brush upgrades it to
     faces automatically (one undo step, looks identical). On face-brushes, corner
     delete/add is disabled — use Split/Extrude instead.
8. **Bake to GLB (v4.17.0):** build a structure out of shapes, select them all
   (or one), then **Actions → Bake → GLB asset** (also on the multi-select panel
   when everything selected is a shape). Name it and pick outputs: *Add to asset
   library* (appears in the Asset Browser under "Baked" — place copies like any
   model) and/or *Save .glb file locally* (standard glTF binary, opens in
   Blender). Merging is by material, so a many-brush structure becomes ~one mesh
   per material per copy. Baked assets carry **preset colliders** — one box per
   source shape (tilted shapes get a slightly generous axis-aligned box) — and
   the Colliders screen shows `auto (N boxes)`; Customize edits a copy's own set.
   The original shapes are kept; re-baking with the same name replaces the asset.
   *(v4.18.0/v4.19.0: new bakes ship exact colliders per source shape — convex
   **hulls** for shapes/cloud brushes, **trimeshes** for face-brushes, so tilted
   shapes AND carved alcoves collide precisely in baked copies.)*
9. **Hull colliders (v4.18.0):** select any placed model → Colliders → Customize →
   switch the card to **hull**. The wireframe snaps to the model's silhouette
   (auto-fit convex hull, ~free at runtime). **Refit** recomputes it. Great for
   rocks/props; use manual boxes where a gap must stay walkable (hulls fill
   concavities like archways).

---

## Workflow: play with a gamepad or touchscreen (Phase 24)

Preview/game mode works with keyboard+mouse, a gamepad, or a touchscreen. The
active scheme switches to **whatever you touched last** — HUD prompts follow
(`[E]` / `[LB]` / `Tap ·` interact, `Esc` / `Start` exit hints).

**Gamepad** (standard mapping, e.g. Xbox/PS):

1. Connect the pad, enter preview (Play button or `P`), press any button — the
   HUD hints flip to gamepad.
2. **Left stick** walk (analog — half stick = half speed), **right stick** look,
   **RB** jump (A also works outside dialogue), **LB** interact, **Start** opens
   the **pause menu** (Resume / Exit — d-pad to highlight, A to pick; Start
   again also resumes). An open dialogue closes first.
3. In a dialogue: **A** advances lines / picks the highlighted response option
   (**d-pad** moves the highlight when options are shown). Movement is frozen
   while it's open.
4. Unplug mid-walk: the character stops immediately. Reconnect and press a
   button to resume.

**Touchscreen** (tablet/phone, or Chrome DevTools device emulation):

1. Enter preview — on a touch device the touch controls appear automatically
   (no pointer lock).
2. **Left area**: touch anywhere to spawn the joystick under your thumb; drag
   to walk. **Rest of the screen**: drag to look (both thumbs at once works).
3. **Tap** (don't drag) to interact when the prompt shows. **JUMP** button
   bottom-right, **⚙** top-right opens the pause menu (Resume / Exit — tap a
   button, or tap the backdrop to resume). An open dialogue closes first.
4. Tap the dialogue box itself to advance it; when response options appear,
   tap an option row to pick it.

On keyboard, **Enter** opens the same pause menu (Enter again = Resume);
**Esc** still exits instantly.

**Tuning:** select the **spawn point** → the panel's **CONTROLS (THIS DEVICE)**
section has mouse/gamepad/touch sensitivities, gamepad deadzone + invert-Y,
joystick size, and a left/right-handed jump-button layout. These are saved on
the device (not in the world) and apply the next time you press Play.

---

## Workflow: play a world in the standalone runtime (Phase 25)

The runtime shell plays worlds **without the editor** — it's a second page on
the same dev server.

1. Open **`http://localhost:7373/runtime.html?manifest=/demo/manifest.json`**.
   You get a main menu built from the manifest (title, description, Start).
   With no `?manifest=` param, the page shows a URL input instead — paste any
   manifest URL (remote origins work if the host sends CORS headers).
2. **Start** → you spawn in Level One. Controls are identical to editor
   preview (WASD/mouse, gamepad, touch — phase 24 works here unchanged).
3. Walk forward through the glowing **purple box** — that's a trigger volume
   with a `load_scene` action: fade to black, Level Two loads. The dialogue
   there only appears if you crossed the greeter volume in Level One first —
   game state carries across scenes.
4. The **green box** in Level Two portals back. **Enter** (or gamepad Start /
   touch ⚙) opens the pause menu; **Exit** (or Esc) returns to the main menu.
5. Progress auto-saves every 30s and on exit — the menu then shows
   **Continue** (resumes the exact scene, spot, and state, even after a full
   page reload) and **New Game** (starts clean).

**Authoring your own:** save a world normally (it must have a spawn point),
put the JSON somewhere fetchable, and hand-write a `manifest.json` like
`public/demo/manifest.json` (scene ids → URLs, `entryScene`, optional
`assetsBase`). Cross-scene portals are trigger volumes with a **load_scene**
action — the Scene id field must match a manifest key (the editor can't
validate it; a typo just logs an error in the runtime and stays put).
**Step-by-step local loop** (save into `public/my-game/`, iterate on the dev
server, no hosting needed): `PUBLISHING_GUIDE.md` §0. Remote hosting + CORS:
the rest of that guide.

---

## Adding more workflows

Keep this doc to **reusable, feature-level UI walkthroughs** (the steps a person clicks).
Put pass/fail acceptance checklists for a specific phase in `test-plans/phase-NN-*.md`
instead.
