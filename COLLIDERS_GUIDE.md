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
| **Box / Sphere / Capsule** | Shape. Switching keeps roughly the same size. |
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

## 5. Tips & gotchas

- **Hollow or thin props** (arches, doorframes, shelves): the auto box is solid
  across the whole model — Customize and build it from 2–3 thin boxes instead.
- **Round things**: sphere/capsule are cheaper and smoother to slide along than
  a rotated box.
- Sphere/capsule are numeric-only for now (no drag handles) — use **Move** +
  the radius/height fields.
- If clicking an object keeps selecting a **trigger volume** instead, a large
  volume overlaps it (volume picking wins) — select the object through the
  Groups/Scripts lists or temporarily move the volume.
