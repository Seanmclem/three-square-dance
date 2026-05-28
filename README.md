# Three Square Dance

A browser-based 3D world editor for building explorable spaces — rooms, buildings, dungeons, whatever. You draw walls, lay floors, raise platforms, place stairs, and then walk through it all in first or third person. Physics are live from day one, so what you build is what you'd actually collide with in a game.

Built with Vite + React + Three.js (no R3F), Rapier3D for physics, and `three-bvh-csg` for boolean geometry (wall openings, stair cutouts, etc.).

---

## What's working

**World building tools**
- Wall tool — click to chain walls, walls snap to nodes, closed loops prompt auto-floor creation
- Floor tool — rectangular drag or polygon (click to place vertices, click the first point to close)
- Platform tool — rectangular or polygon, draggable nodes, sits at the right height automatically
- Stair tool — click a bottom point, click a top point, stairs generate with correct step geometry
- Select tool — click to select any object, properties panel updates on the right

**Geometry details**
- Connected walls merge into a single mesh with proper mitered corners and UV continuity
- Per-wall-segment material overrides — different materials on each wall in a run
- Walls support openings: doors, windows, arches, passages — all CSG-cut with proper inner face trim
- Stairs have separate body and riser materials
- Platforms have separate cap and side materials, polygon shapes, optional railings
- Stair CSG cutter — enable a cut box on any stair to punch a hole through the floor/platform above it, with visible inner faces at the opening

**Multi-floor**
- Floors are stacked by level with correct elevations
- Non-active floors dim down so you can see what you're working on
- Platforms and stairs carry `floorLevel` tags so dimming applies correctly

**Materials**
- PBR materials loaded from a manifest (albedo, normal, roughness, metalness, AO, displacement)
- Per-object material overrides: tile scale X/Y, roughness, displacement, map toggles
- Low/medium/high quality setting controls texture resolution

**Preview mode**
- Press P to enter first/third-person preview using the Rapier character controller
- Walk up stairs, collide with walls, trigger door transitions between zones
- Esc to return to editor

**Save / Load**
- Saves the full world to a JSON file (download)
- Load any previously saved JSON back in

---

## What's next

- **Phase 7 — Asset browser & model importer**: place GLTF props in the world, thumbnail generation, asset manifest
- **Phase 8 — Scripting & triggers**: trigger volumes, event scripts (on_enter, on_interact, etc.), flag system, dialogue
- **Phase 9 — Persistence**: game save/load separate from world save, editor preferences, auto-save, default spawn points
- **Phase 10 — NPCs & enemies**: patrol paths, faction system, basic combat
- **Phase 11 — Terrain**: height sculpting, multi-layer material blending shader
- **Phase 12 — Polish**: post-processing, inventory UI, quest stubs, audio

---

## Getting started

**Requirements:** Node 18+

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev
```

Open `http://localhost:5173`. The editor loads with an empty zone ready to build in.

**Basic workflow:**
1. Pick a tool from the toolbar (Wall, Floor, Platform, Stair)
2. Click in the viewport to place things
3. Select tool → click an object → edit properties on the right panel
4. Press **P** to walk around in preview mode, **Esc** to come back
5. Save/Load buttons in the top bar — saves as a `.json` file you can reload later

**Camera controls:**
| Input | Action |
|---|---|
| Right-click drag | Orbit |
| Middle-click drag | Pan |
| Scroll | Zoom |
| WASD | Pan |
| Q / E | Rotate 45° |
| F | Frame selected object |

---

## Tech

| Thing | What it's for |
|---|---|
| Three.js | 3D rendering, all geometry built by hand (no R3F) |
| Rapier3D (WASM) | Physics — every surface generates a real collider |
| three-bvh-csg | Boolean mesh ops for wall openings and stair cutouts |
| three-mesh-bvh | Fast raycasting for editor selection and snapping |
| React | UI panels only — React never touches Three.js objects |
| Vite | Build tooling + HMR |

React and Three.js communicate exclusively through a typed `EventBus`. No shared references, no exceptions.

---

## Project structure

```
src/
  core/         SceneManager, AssetManager, InputManager, EventBus
  world/        ZoneManager, WorldState, WorldSerializer, WorldLoader
  builders/     WallBuilder, FloorBuilder, PlatformBuilder, StairBuilder
  editor/       Tool implementations (WallTool, FloorTool, etc.)
  physics/      PhysicsWorld, ColliderBuilder, CharacterBody
  preview/      PreviewController, CharacterController, TriggerSystem
  ui/           React components (Toolbar, PropertiesPanel, ZonePanel, etc.)
  utils/        csg.ts, math.ts, uuid.ts
```

Full architecture notes in [`WORLD_EDITOR_ARCHITECTURE.md`](./WORLD_EDITOR_ARCHITECTURE.md).
