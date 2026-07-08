# Colliders Guide

How to make placed objects solid (or into script sensors), and where all the
collider tools live. Added v4.4.0–4.4.1.

---

## The short version

**You usually don't have to do anything.** Any placed object whose asset was
imported with **Collidable** checked automatically gets a box collider fitted
to the model's bounds. The player bumps into it in Preview and Game. Everything
below is for when you want to adjust that.

---

## 1. Import time

In the **Import Model** modal, the checkbox
**"Collidable (all) — auto box collider from model bounds"** decides whether
placed copies of these models get the automatic box. On by default.

## 2. The Colliders screen

Select a placed object (Select tool) → **Properties panel → Colliders** row
(shows `auto box`, `2 colliders`, or `none`).

Starting state for a collidable asset is the **auto box**:

- **Customize** — turns the auto box into an editable collider (same numbers).
- **Remove collision** — makes this one object walk-through (`colliders: []`).

Once customized, each collider is a card with:

| Control | What it does |
|---|---|
| **Box / Sphere / Capsule / Hull** | Shape. Switching keeps roughly the same size; **Hull** auto-fits a convex hull from the model's geometry (v4.18.0) — see below. |
| **OFFSET X/Y/Z** | Local position relative to the object's origin — moves/rotates/scales with the object. |
| **SIZE** | Box: W/H/D · Sphere: R · Capsule: R + H |
| **ROTATION (Y°)** | Local yaw (box only). |
| **Sensor** | Doesn't block — instead fires `on_player_enter` / `on_player_exit` scripts on this object. |
| **✕** | Remove this collider. |
| **+ Add collider** | Multiple colliders per object, for irregular shapes (e.g. desk top + legs, or a solid body + a larger sensor bubble). |

Everything is undoable (Cmd+Z) and saves with the scene.

## 3. Editing in the viewport

With the object selected, its colliders draw as wireframes:
**cyan = solid**, **amber = sensor**.

- **Box colliders get 6 face handles** (small axis-colored cubes floating just
  outside each face). Drag one to push/pull that face — the opposite face stays
  pinned. Snaps to the 0.5 grid; hold **Alt** for free movement; **Esc** cancels
  a drag. Grabbing the *auto* box converts it to a customized one on the spot.
- Numeric edits in the panel update the wireframe live, and vice versa.

### Decluttering (v4.4.1) — all in the Colliders screen

- **Hide object move gizmo while editing colliders** (checkbox at the top):
  temporarily removes the object's own move/rotate gizmo so it can't steal
  your clicks while you work on colliders.
- **Move** (per collider card): puts a small translate gizmo on that collider
  for exact placement. The object gizmo auto-hides while it's active. One
  collider at a time.
- **👁** (per collider card): hides that collider's wireframe + handles in the
  editor so overlapping colliders don't fight — the card dims to show it's
  hidden. Display only; the collider still works in game.

These three are workspace toggles — they reset when you close the screen or
select something else, and are never saved.

## 4. Sensors + scripts

1. Add a collider, check **Sensor** (often make it a bit bigger than the model).
2. Scripts panel (left) → **SELECTED** tab with the object selected → add a
   script with trigger `on_player_enter` or `on_player_exit`.
3. Walk in/out during Preview/Game — the script fires for this object.
   Works alongside solid colliders on the same object.

## 4b. Hull colliders (v4.18.0)

Switch any collider card to **hull** and it auto-fits a convex hull to the placed
model's geometry — the collider matches the model's silhouette instead of its
bounding box. **Refit** recomputes it (e.g. after swapping the asset). Static hulls
cost about the same as boxes at runtime, so use them freely.

- Best for **convex-ish props**: rocks, crates, statues, barrels.
- A hull can't be concave: around an arch it fills the doorway. For openings that
  matter, keep using 2–3 manual boxes.
- Offset + the **Move** gizmo still work; size/rotation fields don't apply (the
  points carry the shape). Hulls stay exact under any rotation and non-uniform scale.
- Flat/degenerate models can't produce a hull — the button just no-ops (and physics
  falls back to a box if points ever degenerate).

**Baked assets** (Bake → GLB) now ship one hull per source shape instead of boxes —
tilted shapes collide exactly. Note a concave *face-brush* source still contributes
its convex hull (its alcoves fill); bake concave structures from multiple convex
shapes if the cavity needs collision.

## 5. Tips & gotchas

- **Hollow or thin props** (arches, doorframes, shelves): the auto box is solid
  across the whole model — Customize and build it from 2–3 thin boxes instead.
- **Round things**: sphere/capsule are cheaper and smoother to slide along than
  a rotated box.
- Sphere/capsule are numeric-only for now (no drag handles) — use **Move** +
  the radius/height fields.
- Clicking an object selects it even through gaps in the model (between an
  animal's legs, under a table top) — the click counts anywhere inside the
  object's bounding box, unless something else is genuinely in front (v4.4.2).

## 6. Shape primitives (v4.9.0)

Shapes (cylinder / wedge / box from the **Shape** toolbar button) get their collider
automatically — an exact **convex hull** of the shape's geometry, mirrored to its
position/rotation. Nothing to configure:

- Any radial segment count collides exactly (a 3-seg prism is a triangle, not a cylinder).
- **Ramps/wedges**: the player can walk up slopes up to the character's 45° max-climb
  angle. Steeper wedges act as walls — that's the physics, not a bug. `atan(rise/depth)`:
  1.5 m over 2.5 m ≈ 31° (walkable), 3 m over 2.5 m ≈ 50° (blocks).
- Script `despawn_object` disables the collider too; `move_object` moves it (runtime-only).
- **Face-edited brushes** (v4.11.0 — split/extrude/face drags) switch to an exact
  **trimesh** collider so concave forms (alcoves, steps, dents) collide correctly.
  Trimeshes are hollow surfaces: something spawned *inside* one won't be pushed out,
  and paper-thin extrusions can be tunneled through at very high speed — give thin
  walls a little thickness.
