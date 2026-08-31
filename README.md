# SquareDance

Build small 3D games by drawing them.

![status: alpha](https://img.shields.io/badge/status-alpha-orange)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Three.js](https://img.shields.io/badge/Three.js-r167-000000?logo=threedotjs&logoColor=white)
![Rapier3D](https://img.shields.io/badge/Rapier3D-WASM-8A2BE2)
![Deno](https://img.shields.io/badge/Deno-2.9%2B-70FFAF?logo=deno&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)

SquareDance is a desktop app for making explorable 3D worlds and small games without a big engine's learning curve. You draw walls and floors, raise platforms and stairs, drop in props and characters, and wire up behavior (triggers, scripts, dialogue, enemies, pickups) without writing code. Physics is live from the first wall you draw: press Play at any moment and walk through what you just built in first or third person. When a game is done, one menu click exports it as a plain folder of static files you can put on any web host.

Under the hood it's a hand-built Three.js scene (no react-three-fiber) with a React UI that talks to the engine only through a typed event bus. Every surface gets a real Rapier collider, wall openings are CSG-cut geometry, and the whole thing ships as a Deno-native desktop app (bundled-Chromium window served by the shell's own local server) with atomic saves, rotating backups, and trash-instead-of-delete.

> **Alpha.** This is an actively developed solo project. File formats can still change, installers are unsigned, and things break. Fun to poke at; don't ship your magnum opus on it yet.

---

## What's in the box

**Building**
- Walls (click to chain, auto-mitered corners), floors (rect or polygon), platforms, stairs with landings, ladders, primitive shapes
- Openings cut straight through walls (doors, windows, arches, passages), plus a stair cutter that punches through the floor above
- Multi-floor stacking with dimming, face/vertex/edge editing, brush inset & carve
- Decals, skyboxes, placeable lights, PBR material library with per-object overrides

**Assets & prefabs**
- Import GLTF/OBJ models: thumbnails, box colliders, and manifest entries are generated for you. Re-stage thumbnails, re-origin models, tag and filter the library
- Per-object collider editing: boxes, sensors, baked hull/trimesh
- Prefabs: turn anything into a reusable recipe; linked instances with per-instance overrides

**Behavior & characters**
- Per-object scripts in a card-based editor (actions, conditions, if/else branches), plus trigger volumes (box/sphere/cylinder/capsule, attachable to moving things)
- Movers (slide/spin, composable) and GLTF animation clip playback
- Branching dialogue trees with condition-gated options and a flowchart view
- Enemy AI: detect → chase → attack, leashes, free roam. The brain is a pure function with headless tests

**Game systems**
- Global + per-entity game state with a schema (defaults, clamps), inventory and items, checkpoints, hazards, death & respawn
- Custom HUDs and menus: health bars, counters, your own 2D graphics, driven from scripts
- Audio: spatial sounds, a 4-bus mixer, music and ambient playlists with silence gaps
- Multi-scene projects with portals between scenes, runtime saves, gamepad and touch controls, a pause menu

**Playing**
- Two ways to play: the bottom-left ▶ previews instantly in-editor (unsaved edits included); the top-bar **▶ Play** saves and opens the game in its own native runtime window with a title screen

---

## Run it locally

You'll need [Deno](https://deno.com) **2.9+** and Node 18+.

```bash
npm install
deno task desktop:dev
```

That opens the native editor window with the full dev loop: backend changes (`desktop/*.ts`) hot-reload, frontend changes (`src/**`) rebuild in ~3s, then click **↻** in the top bar to pick them up.

Worth knowing:

- `npm run typecheck` before committing: the build watcher doesn't typecheck.
- `npm run dev` serves the editor in a plain browser on :7373 with instant HMR, good for UI iteration, but nothing can save there; persistence goes through the desktop shell.
- In dev, the workspace is the repo itself: projects live in `public/games/`, state (autosave, backups, trash, exports) in `.worldbuilder/`. The packaged app uses `~/WorldBuilder`. Override either with `WORLDBUILDER_WORKSPACE=/some/path`.

**Basic workflow:** pick a tool from the left toolbar → click in the viewport to build → switch to Select and edit properties on the right → ▶ to walk around (**Esc** to come back) → **Save** in the top bar (the pill next to it shows save state).

**Camera** (the **?** button in the top bar has per-tool shortcuts too):
| Input | Action |
|---|---|
| Right-click drag | Orbit |
| Middle-click drag | Pan |
| Scroll or `+` / `-` | Zoom |
| WASD | Move the focus point |
| Up / Down arrows | Raise or lower the focus point |
| Left / Right arrows | Rotate around the focus point |

---

## Ship a game

In the top bar, click the project name and choose **Export game…** (it also lives in the **⋯** menu).

The export is a self-contained static bundle written to the workspace state folder's `exports/` (in dev: `.worldbuilder/exports/<project>-bundle/`; the app reveals the folder when it finishes): the runtime, your scenes, and only the assets your game actually references (a demo project came out at 68 files / ~11 MB). Drop the folder on any static host (GitHub Pages, Netlify, Cloudflare Pages, S3) and the game runs at its own URL. Test locally first with `python3 -m http.server` from inside the folder.

Details, hosting recipes, and caveats: [`PUBLISHING_GUIDE.md`](./PUBLISHING_GUIDE.md).

## Build the desktop app

```bash
deno task compile:all   # or compile:mac-arm64 / compile:mac-x64 / compile:win-x64
```

Outputs `build/SquareDance.app` (Apple Silicon), `build/SquareDance-intel.app`, and `build/SquareDance.msi`, each embedding the frontend build, all cross-compiled from one machine. Alpha caveat: builds are ad-hoc signed, so on macOS it's right-click → Open the first time. See [`DESKTOP_GUIDE.md`](./DESKTOP_GUIDE.md).

---

## Docs

| Doc | What's in it |
|---|---|
| [`WORLD_EDITOR_ARCHITECTURE.md`](./WORLD_EDITOR_ARCHITECTURE.md) | The canonical spec and changelog: every system, every phase |
| [`DESKTOP_GUIDE.md`](./DESKTOP_GUIDE.md) | Desktop shell, Deno backend, packaging |
| [`PUBLISHING_GUIDE.md`](./PUBLISHING_GUIDE.md) | Exporting and hosting games, releases |
| [`TESTING.md`](./TESTING.md) / [`HUMAN_TESTING.md`](./HUMAN_TESTING.md) | Automated + click-by-click testing |
| [`PROFILING.md`](./PROFILING.md) | Performance and framerate |
| [`OBJECT_SCRIPTS_GUIDE.md`](./OBJECT_SCRIPTS_GUIDE.md), [`DIALOGUES_GUIDE.md`](./DIALOGUES_GUIDE.md), [`PREFABS_GUIDE.md`](./PREFABS_GUIDE.md), [`GAMEPLAY_STATE.md`](./GAMEPLAY_STATE.md), [`STATE_ITEMS_GUIDE.md`](./STATE_ITEMS_GUIDE.md), [`HAZARDS_GUIDE.md`](./HAZARDS_GUIDE.md), [`GUI_GUIDE.md`](./GUI_GUIDE.md), [`AUDIO.md`](./AUDIO.md), [`COLLIDERS_GUIDE.md`](./COLLIDERS_GUIDE.md) | Per-feature guides |

## Project structure

```
src/
  core/         SceneManager, AssetManager, InputManager, EventBus
  world/        WorldState, ZoneManager, serialization, movers
  builders/     Wall/Floor/Platform/Stair/Shape geometry builders
  editor/       Tools, gizmos, history, thumbnails, baking
  physics/      PhysicsWorld, colliders, character body
  preview/      Character controller, enemy AI, object placement
  scripting/    Script engine + actions
  runtime/      Standalone game runtime (title screen, scene routing)
  project/      Multi-scene project management
  export/       Asset-reference scan for export (the bundler is desktop/export.ts)
  prefab/       Prefab recipes and instances
  audio/        Sound library, mixer, playlists
  assets/       Asset library and manifests
  input/        Control schemes (keyboard, gamepad, touch)
  ui/           React panels, talking to the engine only via the EventBus
desktop/        Deno shell: window, local server, persistence, packaging
```
