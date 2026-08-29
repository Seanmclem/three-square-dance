# Prefabs — Authoring Guide

How to create, place, configure, and edit reusable prefabs in the World Editor.
Written for humans clicking through the UI; the JSON reference at the end is for
hand-authoring or debugging. (Shipped across Phases 43–47 / v4.37.0–v4.42.x —
the architecture doc has the engine-level details.)

---

## The mental model

A **prefab** is a reusable recipe for a group of world things — objects,
triggers, scripts — that you place as many times as you like. Every placed copy
(an **instance**) stays **linked** to the recipe: change the recipe and every
copy updates. Each copy also keeps its **own settings** (like a platform's
width) and its own position.

```
  PREFAB (the recipe)                INSTANCES (placed copies)
  ┌─────────────────────┐            ┌─────────────┐  ┌─────────────┐
  │ Tiled Platform      │  ──place─▶ │ 4×3, grass  │  │ 6×6, dirt   │
  │ width / depth /     │            │ at (-26,-16)│  │ at (10, 40) │
  │ tileSet parameters  │  ◀─linked─ │             │  │             │
  └─────────────────────┘            └─────────────┘  └─────────────┘
```

Two kinds of prefab:

| Kind | Where it comes from | What it contains |
|---|---|---|
| **Generator** (ƒ) | Built into the editor (currently: **Tiled Platform**) | Code that builds pieces from parameters — width/depth/height/tile-set in, a box of kit tiles out. Height (layers) grows *downward* — the walk surface stays put and extra 2m bands stack below it (repeating middle pieces + a bottom cap). |
| **Snapshot** (⬡) | **You**, by capturing a selection | A frozen copy of the entities you selected — models, trigger volumes, shapes, stairs, ladders, with their scripts. The door case: model + trigger + open script, captured once, placed everywhere. |

Under the hood an instance is real entities plus a small link record — the
runtime plays scenes with zero prefab machinery, and deleting a prefab never
breaks the worlds that used it (see **Orphans** below).

---

## Creating

![The Prefabs toolbar panel — the library list with Place (and Edit on snapshot prefabs)](docs/images/prefabs-panel.png)

**A generator prefab** — open the **Prefabs** toolbar panel. Built-in
generators are always listed; the first time you hit **Place** on one, it
becomes a library entry (stored in your project's `game.json` immediately).

**A snapshot prefab** — build the thing once in the world (say a door model,
a trigger volume around it, and an `on_player_enter` script on the volume that
targets the door). Multi-select all its parts — shift-click, or put them in a
group and use the Groups panel's **Select** — then press **⬡ Create Prefab**
in the properties panel. The selection is captured as the template and replaced,
in place, by the prefab's first linked instance (one undo step). Rename it in
the Prefabs panel. **The original build IS an instance now** — its pieces show a
prefab line in their properties header (below), and it counts toward the
library's instance badge.

What can be captured: objects, trigger volumes, shapes, stairs, ladders.
Walls, floors, and platforms are skipped (they're corner-node-based; a console
warning lists anything skipped).

**Script gotcha:** scripts inside a captured prefab are re-targeted per
instance — each placed door's trigger opens *its own* door. But literal
**coordinates** inside actions (a `move_object` position) are captured verbatim
and NOT shifted per instance. Prefer relative/targeted actions (`open_door`,
`play_animation`, `despawn_object`) in prefab scripts.

## Placing

![Placement armed — the green ghost footprint follows the cursor](docs/images/prefab-ghost.png)

Prefabs panel → **Place** → click in the viewport. The green ghost box shows
the footprint; **R** rotates 90°, **Esc** stops, and placement stays armed for
repeated clicks. For platform tiles, the walkable top sits **1m above** where
you click.

## Selecting & configuring an instance

Click any piece of a placed instance and the **whole instance** selects — one
gizmo moves it all, and the properties panel shows the **Prefab section**:

![A selected Tiled Platform instance — whole-instance highlight, group gizmo, and the Prefab section with settings, position, and actions](docs/images/prefab-instance.png)

- **Settings** (generator parameters like width/depth/height/tile-set): per-instance,
  applied live as you type (short debounce) or step the arrows. These are
  *yours per copy* and **never reset** — not by prefab edits, not by Reset.
- **Position** (X/Y/Z/ROT°): moves the whole instance; equivalent to dragging
  the gizmo.
- **Save to prefab** (v4.79.46, snapshot prefabs only): the reverse of Reset.
  This copy's pieces — as you've moved, re-tuned, or deleted them — become the
  prefab's recipe (version +1), and every other placed copy rebuilds to match
  (their own hand-edits are discarded; their settings and positions are kept).
  Pieces you deleted here are removed from every copy; the confirm says how
  many. Things you placed *next to* the copy aren't members and don't come
  along — capture a new prefab for that. Rebuilding the copies is one undo
  step; the recipe change itself isn't undoable (same as Edit prefab → Save).
- **Reset from prefab**: rebuilds every piece from the recipe. Settings and
  position are kept; the only thing it discards is hand-edits to individual
  pieces. If you never shift-click into an instance's guts, it's a no-op.
- **Unlink**: detaches the pieces into plain, independent entities. Prefab
  updates stop affecting them forever. Do this when you want a one-off you can
  sculpt freely.
- **Delete instance**: removes every piece and the link.
- **⛶ Select all N** (single-piece view) and **Edit prefab** (snapshot kind)
  sit at the front of the same button row (v4.79.29) — the section offers the
  full set of instance actions wherever it appears.

**Every member wears its membership** (v4.79.25): select any single piece and
the properties header shows a prefab line right under the name — `⬡ {name}` for
snapshot prefabs (click it to jump into prefab editing), `ƒ {name}` for
generators, `⚠ … definition missing` for orphans. Next to the name, **⛶ all N**
(v4.79.27) re-selects the entire instance — the way back from a shift-clicked
single piece to moving object + trigger + everything with one gizmo — and a
**⋯ menu** (v4.79.28) with every instance action (Edit prefab / Select all / Reset from prefab / Save to prefab / Unlink /
Delete instance). All three ask for confirmation from either entry point;
they're still one-step undoable afterwards.

When a **single piece** is selected, the Prefab section sits at the top of its
properties list, collapsed (v4.79.30) — expand it for the full action row; the
whole-instance view keeps it expanded.

**Shift-click** a piece to select *just it* — the escape hatch for tweaking a
single piece. Know the rule: piece-level tweaks are **not** part of the recipe
or the instance's settings, so they're overwritten the next time the pieces
rebuild (any settings change, prefab edit, or Reset). Unlink first if you want
piece tweaks to stick. Copy/paste/duplicate of pieces always produces unlinked
copies.

## Editing a prefab (snapshot prefabs)

Prefabs panel → **Edit** (amber, snapshot prefabs only — a generator's
parameters *are* its interface). The world temporarily disappears and the
prefab's pieces appear alone at the origin. Use all the normal tools: move
things, add objects, edit scripts, delete pieces.

![Isolated edit mode — just the prefab's pieces on an empty grid, with the amber Save/Cancel bar](docs/images/prefab-edit-mode.png)

- **Save** (amber top bar): the recipe updates and **every placed instance in
  the scene rebuilds to match** — one undo step. Other scenes in the project
  catch up when next opened.
- **Cancel**: discards the editing session; nothing changes.

While editing: project save, scene switching, and Play are disabled, and the
autosave is suspended (the editing sandbox can never leak into your world).
Heads-up: the world's undo history is cleared when entering and leaving edit
mode.

## Where prefabs live

- **Project open**: in the project's `game.json`, written **immediately** on
  every create/rename/edit (like model imports) — shared by all the project's
  scenes.
- **No project**: in a browser-local session library, automatically promoted
  into `game.json` the next time you open a project.

Instances themselves live in the scene file as ordinary entities plus a small
`prefabInstances` record per zone — scenes are always playable stand-alone.

## Deleting a prefab

The library ×'s rule is simple: a prefab with **zero placed instances** deletes
immediately; one with instances opens a review dialog (v4.79.25) listing every
instance — zone, position, piece count — with **Go to** (selects the instance
and glides the camera to it) and **Delete** per row (each row-delete is one undo
step). Once the list is empty the dialog's **Delete prefab** button unlocks.
Rows shown as **empty record (leftover)** are ghost bookkeeping — instances
whose pieces were all deleted; just Delete them (rare: since v4.79.25 deleting
an instance's **last piece** removes its record too, in the same undo step, and
any pre-existing ghosts are swept automatically on scene load).

## Orphans (⚠ definition missing)

If an instance's prefab definition is gone (deleted, or created before
definitions were written immediately), the instance keeps working — its pieces
are real entities. Selecting it shows a **⚠ definition missing** panel with the
operations that still make sense: **Unlink** or **Delete instance**.
Generator instances are better than that: they **auto-heal on scene load** —
the editor re-infers the generator from the instance's settings and relinks
(recreating the library entry if needed).

## Kit-tile fine print (Tiled Platform)

The platformer-kit tiles are **hollow, double-sided shells** (grass lid + dirt
skirt, no bottom or interior), and interior tiles are a flat sheet. Flush, a
platform looks solid. If you pull a piece out (or float the platform and look
up at it), you'll see into the hollows — which reads as weird melted/draped
geometry. That's the asset pack, not a bug. Collision is a solid slab with the
walkable top at origin+1m regardless.

---

## Authoring a new generator (code)

Unlike snapshots, generators aren't made in the editor — each one is a small
**TypeScript module** compiled into the app. There's no text-script or DSL:
you write a function that takes the parameter values and returns the pieces.

Two steps:

**1. Write the module** — `src/prefab/generators/<yourName>.ts`, exporting a
`PrefabGenerator`:

```ts
import type { PrefabTemplateEntity, PrefabVarValue, WorldObject } from "@/types";
import type { PrefabGenerator } from "@/prefab/generators";

export const fenceRow: PrefabGenerator = {
  id:    "fence-row",              // stable key — instance records reference it forever
  label: "Fence Row",              // what the Prefabs panel shows
  variables: [
    { name: "count",   label: "Posts",   type: "number", default: 4, min: 2, max: 40, step: 1 },
    { name: "spacing", label: "Spacing", type: "number", default: 2, min: 1, max: 8,  step: 0.5 },
  ],
  expand(vars: Record<string, PrefabVarValue>): PrefabTemplateEntity[] {
    const n = Math.max(2, Math.min(40, Math.round(Number(vars.count ?? 4))));
    const gap = Number(vars.spacing ?? 2);
    const out: PrefabTemplateEntity[] = [];
    for (let i = 0; i < n; i++) {
      const def: WorldObject = {
        id: `post_${i}`,                    // template-local — replaced with a real id at placement
        assetId: "platform_dirt_single",    // any id from the model library
        position: { x: (i - (n - 1) / 2) * gap, y: 0, z: 0 },  // PREFAB-LOCAL space
        rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
        floor: 0,
        properties: { interactable: false, npcSpawn: false, lootTableId: null, triggerEventId: null },
      };
      out.push({ memberKey: `post_${i}`, type: "object", def });
    }
    return out;
  },
};
```

**2. Register it** — add one line to the `GENERATORS` record in
`src/prefab/generators/index.ts`:

```ts
export const GENERATORS: Record<string, PrefabGenerator> = {
  [tiledPlatform.id]: tiledPlatform,
  [fenceRow.id]:      fenceRow,
};
```

That's everything. It appears under **BUILT-IN GENERATORS** in the Prefabs
panel; the first Place creates its library entry, and its variables show up as
the instance settings automatically.

**Rules the pipeline relies on:**

- **Pure and deterministic.** Same variable values in → identical pieces out,
  every time. No randomness, no reading outside state — rebuilds (settings
  changes, Reset, load-time refresh) regenerate from scratch and must
  reproduce exactly.
- **`memberKey` is each piece's identity.** Use stable role-style keys
  (`tile_2_3`, `post_0`) — rebuilds diff old vs new pieces by key, which is
  what keeps surviving pieces' entity ids (and external references to them)
  intact when a parameter changes.
- **Prefab-local space.** Emit positions relative to the placement point
  (the pipeline applies the instance's position + rotation). For the Tiled
  Platform convention, y=0 at the origin with walkable surfaces above it.
- **Allowed piece types:** object, trigger-volume, shape, stair, ladder —
  same set as snapshot capture. `assetId`s must exist in the model library
  (missing ones render as fallback boxes).
- **Clamp your inputs.** The panel enforces min/max, but hand-edited JSON
  reaches `expand` too — clamp defensively like the example.
- **Keep the variable-name set unique per generator.** Orphaned instances
  auto-heal by matching their saved variable names against registered
  generators — two generators with identical `{count, spacing}`-style
  signatures would be ambiguous.

Generators never ship to the runtime — scenes store the expanded pieces, so a
published game needs none of this code.

---

## JSON reference (debugging / hand-authoring)

**Library** (`game.json`):

```jsonc
{ "prefabs": [{
    "id": "pfb_5a31a5da",
    "name": "Tiled Platform",
    "kind": "generator",            // or "snapshot"
    "version": 3,                    // ++ on every template/default edit
    "generatorId": "tiled-platform", // generator only
    "variables": [ { "name": "width", "type": "number", "default": 3, "min": 2, "max": 32, "step": 1 }, … ],
    "template": [ … ]                // snapshot only: [{ memberKey, type, def }] in prefab-local space
}]}
```

**Per-zone instance record** (scene file, `zone.prefabInstances`):

```jsonc
{ "id": "pfi_f65c07d1", "prefabId": "pfb_5a31a5da",
  "version": 3,                                  // recipe version last built against
  "variables": { "width": 4, "depth": 3, "height": 2, "tileSet": "grass" },
  "origin": { "position": { "x": -26, "y": 0, "z": -16.5 }, "rotationY": 0 } }
```

**Per-piece stamp** (on each member entity):

```jsonc
{ "prefab": { "prefabId": "pfb_…", "instanceId": "pfi_…", "memberKey": "tile_1_2" } }
```

`memberKey` is the piece's stable role — rebuilds match pieces by it, which is
why surviving pieces keep their entity ids (and external script references to
them keep working) across width changes and prefab edits. Scenes whose records
carry an older `version` than the library's rebuild automatically at load.

Engine details (expansion pipeline, edit-mode staging zone, undo journal
wiring): `WORLD_EDITOR_ARCHITECTURE.md` changelog v4.37.0–v4.42.x and
`plans/phase-43…47-*.md`.
