# 3D World Editor — Full Project Architecture

> RPG/Exploration Game World Editor built with Vite + React + Three.js (no R3F)

---

## Vision

A browser-based 3D world editor for building explorable 3D spaces. The user constructs outdoor terrain, streets, and buildings with a floating editor camera, then enters buildings through zone transitions to place interior walls, floors, platforms, stairs, and props. The world is saved as a JSON scene file and can be previewed with a configurable first-person or third-person camera.

The world is designed from day one to support a full game runtime: playable characters, NPCs, and enemies. This means every wall, floor, platform, and stair built in the editor generates a proper Rapier physics collider alongside its visual mesh — not a raycast approximation added later. The physics world is always live and game-ready.

**Two tools, two jobs:**

- `three-mesh-bvh` — editor only: fast raycasting for object selection, tool snapping, and surface placement
- `@dimforge/rapier3d-compat` — runtime: rigid body physics, character capsule controller, NPC/enemy colliders

---

## Tech Stack

| Layer               | Library                    | Notes                                         |
| ------------------- | -------------------------- | --------------------------------------------- |
| Language            | TypeScript 5               | Strict mode, all files `.ts` / `.tsx`         |
| Build               | Vite + vite-plugin-checker | Fast HMR, TS type-checking in dev             |
| UI Shell            | React 18 + @types/react    | UI panels only — no Three.js inside React     |
| 3D Renderer         | Three.js + @types/three    | Initialized outside React in plain TS classes |
| CSG (wall openings) | three-bvh-csg              | Boolean mesh operations for doors/windows     |
| BVH Raycasting      | three-mesh-bvh             | Fast collision/selection raycasting           |
| Physics (Phase 3+)  | @dimforge/rapier3d-compat  | WASM — static colliders built with every mesh |
| Persistence         | JSON                       | Save/load scene files                         |

**Critical rule:** React never touches Three.js objects. Three.js never touches React state. They communicate only through an `EventBus` (custom event emitter). No exceptions.

---

## TypeScript Types & Interfaces

All shared types live in `src/types.ts` and are imported across every module. Never use `any`. Use `unknown` for truly dynamic payloads and narrow with type guards.

```ts
// src/types.ts

// ─── Primitive helpers ────────────────────────────────────────────────────────

export type ToolId =
  | "select"
  | "floor"
  | "wall"
  | "platform"
  | "stair"
  | "object"
  | "zone";
export type ZoneType = "outdoor" | "indoor" | "dungeon";
export type OpeningType = "door" | "window" | "arch" | "passage";
export type StairStyle = "straight" | "l-shape" | "spiral";
export type CameraMode = "fps" | "thirdperson";
export type EditorObjectType =
  | "wall"
  | "floor"
  | "platform"
  | "stair"
  | "object"
  | "terrain"
  | "trigger"
  | "trim";
export type TransitionEffect = "fade" | "none";

// ─── Vec / transform ─────────────────────────────────────────────────────────

export interface Vec2 {
  x: number;
  z: number;
}
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Euler3 {
  x: number;
  y: number;
  z: number;
} // degrees
export interface Scale3 {
  x: number;
  y: number;
  z: number;
}
export interface Bounds {
  x: number;
  z: number;
  width: number;
  depth: number;
}

// ─── EventBus typed map ───────────────────────────────────────────────────────

export interface BusEvents {
  "tool:select": { tool: ToolId };
  "floor:select": { level: number };
  "object:selected": SelectedObjectPayload;
  "object:deselected": Record<string, never>;
  "object:updated": {
    id: string;
    zoneId: string;
    changes: Partial<WorldObject>;
  };
  "asset:selected": { assetId: string };
  "asset:dropped": { assetId: string; screenPos: { x: number; y: number } };
  "wall:added": { zoneId: string; wall: WallDef };
  "wall:updated": { zoneId: string; wallId: string; changes: Partial<WallDef> };
  "wall:removed": { zoneId: string; wallId: string };
  "floor:added": { zoneId: string; floor: FloorDef };
  "floor:updated": {
    zoneId: string;
    level: number;
    changes: Partial<FloorDef>;
  };
  "platform:added": { zoneId: string; platform: PlatformDef };
  "platform:updated": {
    zoneId: string;
    id: string;
    changes: Partial<PlatformDef>;
  };
  "platform:removed": { zoneId: string; id: string };
  "stair:added": { zoneId: string; stair: StairDef };
  "stair:removed": { zoneId: string; id: string };
  "object:added": { zoneId: string; object: WorldObject };
  "object:removed": { zoneId: string; id: string };
  "zone:added": { zone: ZoneDef };
  "zone:activated": { zoneId: string };
  "zone:enter": { zoneId: string };
  "transition:added": { transition: TransitionDef };
  "preview:start": Record<string, never>;
  "preview:stop": Record<string, never>;
  "preview:zone-entered": { zoneName: string };
  "gizmo:dragging": { isDragging: boolean };
  "camera:jump": { x: number; z: number };
  "character:teleport": { position: Vec3; facing: number };
  "character:triggerdoor": { transitionId: string };
  "overlay:fade-in": { color: string; duration: number };
  "overlay:fade-out": { duration: number };
  "scene:save": Record<string, never>;
  "scene:load": { json: unknown };
  "scene:saved": { json: SceneFile };
  "scene:loaded": { metadata: SceneMetadata };
  "world:loaded": { metadata: SceneMetadata };
  "terrain:sculpt": { x: number; z: number; radius: number; delta: number };
  "input:click": { screenPos: Vec2; worldPos: Vec3; button: number };
  "input:dblclick": { screenPos: Vec2; worldPos: Vec3 };
  "input:mousemove": { screenPos: Vec2; worldPos: Vec3; delta: Vec2 };
  "input:mousedown": { button: number; screenPos: Vec2 };
  "input:mouseup": { button: number; screenPos: Vec2 };
  "input:wheel": { delta: number };
  "input:keydown": {
    code: string;
    key: string;
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
  };
  "input:keyup": { code: string };
}

export type BusEventName = keyof BusEvents;
export type BusCallback<K extends BusEventName> = (
  payload: BusEvents[K],
) => void;

// ─── Selection ────────────────────────────────────────────────────────────────

export interface SelectedObjectPayload {
  id: string;
  type: EditorObjectType;
  zoneId: string;
  position: Vec3;
  rotation: Euler3;
  scale: Scale3;
  data: WallDef | FloorDef | PlatformDef | StairDef | WorldObject | null;
}

// ─── userData on Three.js meshes ─────────────────────────────────────────────

export interface MeshUserData {
  editorId: string;
  editorType: EditorObjectType;
  zoneId: string;
  selectable: boolean;
  floorLevel: number;
  _ownsMaterial: boolean;
  _origEmissive?: number;
  _origEmissiveIntensity?: number;
  _hoverEmissive?: number;
  _parentId?: string; // set on child meshes of GLTF objects
  // trigger-specific
  triggerType?: "door";
  transitionId?: string;
  openingId?: string;
  // wall-specific
  wallId?: string;
  // object-specific
  assetId?: string;
}

// ─── Scene file data model ────────────────────────────────────────────────────

export interface SceneMetadata {
  name: string;
  version: string;
  author: string;
  created: string;
  lastModified: string;
}

export interface PlayerSettings {
  cameraMode: CameraMode;
  moveSpeed: number;
  jumpHeight: number;
  fov: number;
  thirdPersonDistance: number;
  thirdPersonHeight: number;
}

export interface SkyConfig {
  turbidity: number; // atmospheric haze, default 10
  rayleigh: number; // sky blueness, default 3
  mieCoefficient: number; // default 0.005
  mieDirectionalG: number; // default 0.7
  sunElevation: number; // degrees above horizon, default 25
  sunAzimuth: number; // degrees, default 180
}

export interface WorldConfig {
  size: { width: number; depth: number };
  ambientLight: { color: string; intensity: number };
  sunLight: { color: string; intensity: number }; // position derived from sky sun angles
  sky: SkyConfig;
  fogDensity: number; // fog color derived from sky at horizon, not hardcoded
  playerSettings: PlayerSettings;
}

export interface TerrainLayerMaterial {
  id: string;
  texture: string;
  tileScale: number;
  minHeight: number;
  maxHeight: number;
}

export interface TerrainDef {
  resolution: number;
  heightData: Float32Array | string; // Float32Array in memory, base64 string on disk
  maxHeight: number;
  layerMaterials: TerrainLayerMaterial[];
}

export interface FloorMeshDef {
  shape: "rect" | "polygon";
  points: Vec2[] | null;
  material: string;
}

export interface FloorDef {
  level: number;
  elevation: number;
  ceilingHeight: number | null;
  floorMesh: FloorMeshDef;
}

export interface Opening {
  id: string;
  type: OpeningType;
  offsetAlongWall: number;
  width: number;
  height: number;
  elevation: number;
  linkedZoneId: string | null;
  linkedTransitionId: string | null;
}

export interface WallDef {
  id: string;
  start: Vec2;
  end: Vec2;
  floor: number;
  height: number;
  thickness: number;
  material: string;
  exteriorMaterial: string;
  openings: Opening[];
}

export interface PlatformDef {
  id: string;
  position: Vec3;
  size: { width: number; depth: number };
  thickness: number;
  material: string;
  hasRailing: boolean;
  railingHeight: number;
  floorLevel?: number;
}

export interface StairDef {
  id: string;
  start: Vec3;
  end: Vec3;
  width: number;
  style: StairStyle;
  material: string;
  hasRailing: boolean;
}

export interface ObjectProperties {
  interactable: boolean;
  npcSpawn: boolean;
  lootTableId: string | null;
  triggerEventId: string | null;
}

export interface WorldObject {
  id: string;
  assetId: string;
  position: Vec3;
  rotation: Euler3;
  scale: Scale3;
  floor: number;
  zoneId?: string;
  properties: ObjectProperties;
}

export interface ZoneDef {
  id: string;
  name: string;
  type: ZoneType;
  bounds: Bounds;
  floors: FloorDef[];
  walls: WallDef[];
  platforms: PlatformDef[];
  stairs: StairDef[];
  objects: WorldObject[];
}

export interface TransitionDef {
  id: string;
  fromZone: string;
  toZone: string;
  triggerType: "door" | "volume" | "loading-zone";
  triggerOpeningId: string;
  effect: TransitionEffect;
  fadeColor: string;
  fadeDuration: number;
  spawnPoint: Vec3 & { facing: number };
}

export interface SceneFile {
  metadata: SceneMetadata;
  world: WorldConfig;
  terrain: TerrainDef | null;
  zones: ZoneDef[];
  transitions: TransitionDef[];
}

// ─── Physics ─────────────────────────────────────────────────────────────────

// Stored by ZoneManager alongside mesh groups — used to clean up Rapier on zone unload
export interface ZoneColliders {
  floors: import("@dimforge/rapier3d-compat").Collider[];
  walls: import("@dimforge/rapier3d-compat").Collider[][]; // per wall: segment colliders
  platforms: import("@dimforge/rapier3d-compat").Collider[];
  stairs: import("@dimforge/rapier3d-compat").Collider[][]; // per stair: step colliders
  sensors: import("@dimforge/rapier3d-compat").Collider[]; // door sensors
  terrain: import("@dimforge/rapier3d-compat").Collider | null;
}

// ─── Characters, NPCs, Enemies ───────────────────────────────────────────────

export interface CharacterDef {
  id: string;
  name: string;
  modelAssetId: string;
  capsuleRadius: number;
  capsuleHeight: number;
  moveSpeed: number;
  jumpHeight: number;
  cameraMode: CameraMode;
  thirdPersonOffset: Vec3;
  health?: number;
  maxHealth?: number;
  faction?: string;
}

export type NpcBehaviour = "idle" | "patrol" | "follow" | "guard";

export interface NpcDef {
  id: string;
  name: string;
  modelAssetId: string;
  spawnPosition: Vec3;
  faction: string;
  behaviour: NpcBehaviour;
  patrolPath?: Vec3[];
  dialogueId?: string | null;
  lootTableId?: string | null;
}

export interface EnemyDef extends NpcDef {
  attackRange: number;
  detectionRange: number;
  damage: number;
  attackCooldown: number;
}

// ─── Builder return types ─────────────────────────────────────────────────────

export interface WallBuildResult {
  mesh: THREE.Mesh;
  trimMeshes: THREE.Mesh[];
  collisionMeshes: THREE.Mesh[];
  triggerMeshes: THREE.Mesh[];
}

export interface FloorBuildResult {
  mesh: THREE.Mesh;
  collisionMesh: THREE.Mesh;
}

export interface PlatformBuildResult {
  meshes: THREE.Mesh[];
  collisionMesh: THREE.Mesh;
}

export interface StairBuildResult {
  meshes: THREE.Mesh[];
  collisionMesh: THREE.Mesh;
}

// ─── Module interfaces (lifecycle contract) ───────────────────────────────────

export interface IEditorModule {
  init(): void;
  update(dt: number): void;
  dispose(): void;
}
```

---

## Project Structure

```
world-editor/
├── index.html
├── vite.config.ts
├── package.json
├── WORLD_EDITOR_ARCHITECTURE.md
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── core/
│   │   ├── SceneManager.ts
│   │   ├── AssetManager.ts
│   │   ├── InputManager.ts
│   │   └── EventBus.ts
│   ├── world/
│   │   ├── WorldState.ts
│   │   ├── WorldLoader.ts
│   │   ├── WorldSerializer.ts
│   │   ├── ZoneManager.ts
│   │   ├── TransitionManager.ts
│   │   └── TerrainBuilder.ts
│   ├── builders/
│   │   ├── WallBuilder.ts
│   │   ├── FloorBuilder.ts
│   │   ├── PlatformBuilder.ts
│   │   ├── StairBuilder.ts
│   │   └── ObjectPlacer.ts
│   ├── editor/
│   │   ├── EditorCamera.ts
│   │   ├── SelectionManager.ts
│   │   ├── WallTool.ts
│   │   ├── FloorTool.ts
│   │   ├── PlatformTool.ts
│   │   ├── StairTool.ts
│   │   ├── ObjectTool.ts
│   │   ├── ZoneTool.ts
│   │   └── TransitionTool.ts
│   ├── physics/
│   │   ├── PhysicsWorld.ts         ← Rapier world singleton, step loop, debug draw
│   │   ├── ColliderBuilder.ts      ← mesh → Rapier collider (called by every builder)
│   │   └── CharacterBody.ts        ← Rapier KinematicCharacterController wrapper
│   ├── preview/
│   │   ├── PreviewController.ts
│   │   ├── CharacterController.ts  ← input + camera; delegates physics to CharacterBody
│   │   └── TriggerSystem.ts        ← door/zone trigger detection via Rapier sensors
│   ├── ui/
│   │   ├── EditorUI.tsx
│   │   ├── Toolbar.tsx
│   │   ├── PropertiesPanel.tsx
│   │   ├── FloorLevelSelector.tsx
│   │   ├── ZonePanel.tsx
│   │   ├── AssetBrowser.tsx
│   │   ├── SaveLoadPanel.tsx
│   │   └── PreviewHUD.tsx
│   ├── assets/
│   │   ├── textures/
│   │   ├── models/
│   │   └── icons/
│   └── utils/
│       ├── math.ts
│       ├── csg.ts
│       └── uuid.ts
```

---

## Core Principles

### React ↔ Three.js Boundary

The canvas is owned entirely by Three.js. React renders HTML overlaid on top via `position: absolute`. The two sides never share references.

```
App.tsx
  <div style="position:relative; width:100vw; height:100vh">
    <canvas ref={canvasRef} />           ← Three.js owns this
    <div style="position:absolute; inset:0; pointerEvents:none">
      <Toolbar pointerEvents="all" />    ← React UI overlay
      <PropertiesPanel pointerEvents="all" />
    </div>
  </div>
```

In `App.tsx` `useEffect`:

```js
const bus = new EventBus();
const sm = new SceneManager(canvasRef.current, bus);
// Expose bus to React via Context
```

React components call `bus.emit(...)` to send instructions to Three.js. Three.js calls `bus.emit(...)` to update React UI. React never holds a reference to any `THREE.*` object.

### Module Lifecycle

Every engine module implements this interface:

```js
class SomeModule {
  constructor(deps) {
    /* store deps, don't start yet */
  }
  init() {
    /* attach listeners, add objects to scene */
  }
  update(dt) {
    /* called every frame via SceneManager */
  }
  dispose() {
    /* remove listeners, dispose geometries/materials */
  }
}
```

SceneManager calls `update(dt)` on all registered modules each frame. Modules never start their own `requestAnimationFrame` loops.

### Coordinates & Units

- All world coordinates in **meters**
- Default wall height: **3.0m**
- Floor/platform slab thickness: **0.2m**
- Grid snap unit: **0.5m**
- One floor level (wall + slab): **3.2m**
- Y = 0 is ground plane, positive Y is up
- Positive Z is "south", positive X is "east"

---

## Data Model (SceneFile JSON)

The canonical save/load format. All builders read exclusively from this structure — never from the Three.js scene.

```jsonc
{
  "metadata": {
    "name": "My World",
    "version": "1.0",
    "author": "",
    "created": "2026-01-01T00:00:00Z",
    "lastModified": "2026-01-01T00:00:00Z",
  },
  "world": {
    "size": { "width": 200, "depth": 200 },
    "ambientLight": { "color": "#8899bb", "intensity": 0.6 },
    "sunLight": { "color": "#fff4e0", "intensity": 1.8 },
    "sky": {
      "turbidity": 10,
      "rayleigh": 3,
      "mieCoefficient": 0.005,
      "mieDirectionalG": 0.7,
      "sunElevation": 25,
      "sunAzimuth": 180,
    },
    "fogDensity": 0.012,
    "playerSettings": {
      "cameraMode": "fps",
      "moveSpeed": 5.0,
      "jumpHeight": 1.2,
      "fov": 75,
      "thirdPersonDistance": 4.0,
      "thirdPersonHeight": 1.8,
    },
  },
  "terrain": {
    "resolution": 64,
    "heightData": "<base64-encoded Float32Array, resolution×resolution floats 0..1>",
    "maxHeight": 10.0,
    "layerMaterials": [
      {
        "id": "grass",
        "texture": "grass_01.jpg",
        "tileScale": 4.0,
        "minHeight": 0.0,
        "maxHeight": 0.4,
      },
      {
        "id": "dirt",
        "texture": "dirt_01.jpg",
        "tileScale": 3.0,
        "minHeight": 0.3,
        "maxHeight": 0.7,
      },
      {
        "id": "rock",
        "texture": "rock_01.jpg",
        "tileScale": 2.0,
        "minHeight": 0.6,
        "maxHeight": 1.0,
      },
    ],
  },
  "zones": [
    {
      "id": "zone_001",
      "name": "Town Square",
      "type": "outdoor",
      "bounds": { "x": 0, "z": 0, "width": 50, "depth": 50 },
      "floors": [
        {
          "level": 0,
          "elevation": 0.0,
          "ceilingHeight": 3.0,
          "floorMesh": {
            "shape": "rect",
            "points": null,
            "material": "cobblestone",
          },
        },
        {
          "level": 1,
          "elevation": 3.2,
          "ceilingHeight": 3.0,
          "floorMesh": {
            "shape": "rect",
            "points": null,
            "material": "wood_planks",
          },
        },
      ],
      "walls": [
        {
          "id": "wall_001",
          "start": { "x": 0.0, "z": 0.0 },
          "end": { "x": 10.0, "z": 0.0 },
          "floor": 0,
          "height": 3.0,
          "thickness": 0.2,
          "material": "brick_01",
          "exteriorMaterial": "brick_exterior_01",
          "openings": [
            {
              "id": "opening_001",
              "type": "door",
              "offsetAlongWall": 4.0,
              "width": 1.2,
              "height": 2.2,
              "elevation": 0.0,
              "linkedZoneId": "zone_002",
              "linkedTransitionId": "trans_001",
            },
            {
              "id": "opening_002",
              "type": "window",
              "offsetAlongWall": 7.5,
              "width": 1.0,
              "height": 1.2,
              "elevation": 0.9,
              "linkedZoneId": null,
              "linkedTransitionId": null,
            },
          ],
        },
      ],
      "platforms": [
        {
          "id": "platform_001",
          "position": { "x": 5.0, "y": 3.2, "z": 5.0 },
          "size": { "width": 8.0, "depth": 6.0 },
          "thickness": 0.3,
          "material": "concrete_01",
          "hasRailing": true,
          "railingHeight": 1.0,
        },
      ],
      "stairs": [
        {
          "id": "stair_001",
          "start": { "x": 2.0, "y": 0.0, "z": 4.0 },
          "end": { "x": 2.0, "y": 3.2, "z": 8.0 },
          "width": 1.5,
          "style": "straight",
          "material": "concrete_01",
          "hasRailing": true,
        },
      ],
      "objects": [
        {
          "id": "obj_001",
          "assetId": "prop_bench_01",
          "position": { "x": 2.0, "y": 0.0, "z": 3.0 },
          "rotation": { "x": 0, "y": 45, "z": 0 },
          "scale": { "x": 1.0, "y": 1.0, "z": 1.0 },
          "floor": 0,
          "properties": {
            "interactable": false,
            "npcSpawn": false,
            "lootTableId": null,
            "triggerEventId": null,
          },
        },
      ],
    },
  ],
  "transitions": [
    {
      "id": "trans_001",
      "fromZone": "zone_001",
      "toZone": "zone_002",
      "triggerType": "door",
      "triggerOpeningId": "opening_001",
      "effect": "fade",
      "fadeColor": "#000000",
      "fadeDuration": 0.3,
      "spawnPoint": { "x": 1.0, "y": 0.0, "z": 1.0, "facing": 180 },
    },
  ],
}
```

---

## WorldState.ts

The in-memory mirror of the JSON. All tools write to WorldState; WorldState emits change events; builders/managers listen and rebuild geometry accordingly. Nothing writes directly to Three.js objects.

```js
class WorldState {
  constructor(bus) {
    this.bus = bus;
    this.metadata = {};
    this.world = {};
    this.terrain = null;
    this.zones = new Map(); // zoneId → ZoneData
    this.transitions = new Map(); // transitionId → TransitionData
    this.activeZoneId = null;
  }

  // --- Zone mutations ---
  addZone(zoneData) {
    this.zones.set(zoneData.id, zoneData);
    this.bus.emit("zone:added", { zone: zoneData });
  }
  setActiveZone(zoneId) {
    this.activeZoneId = zoneId;
    this.bus.emit("zone:activated", { zoneId });
  }

  // --- Wall mutations ---
  addWall(zoneId, wallData) {
    this.zones.get(zoneId).walls.push(wallData);
    this.bus.emit("wall:added", { zoneId, wall: wallData });
  }
  updateWall(zoneId, wallId, changes) {
    const wall = this.zones.get(zoneId).walls.find((w) => w.id === wallId);
    Object.assign(wall, changes);
    this.bus.emit("wall:updated", { zoneId, wallId, changes });
  }
  removeWall(zoneId, wallId) {
    const zone = this.zones.get(zoneId);
    zone.walls = zone.walls.filter((w) => w.id !== wallId);
    this.bus.emit("wall:removed", { zoneId, wallId });
  }
  addOpening(zoneId, wallId, openingData) {
    const wall = this.zones.get(zoneId).walls.find((w) => w.id === wallId);
    wall.openings.push(openingData);
    this.bus.emit("wall:updated", {
      zoneId,
      wallId,
      changes: { openings: wall.openings },
    });
  }

  // --- Floor mutations ---
  addFloor(zoneId, floorData) {
    this.zones.get(zoneId).floors.push(floorData);
    this.bus.emit("floor:added", { zoneId, floor: floorData });
  }
  updateFloor(zoneId, level, changes) {
    const floor = this.zones.get(zoneId).floors.find((f) => f.level === level);
    Object.assign(floor, changes);
    this.bus.emit("floor:updated", { zoneId, level, changes });
  }

  // --- Platform mutations ---
  addPlatform(zoneId, data) {
    /* push + emit 'platform:added' */
  }
  updatePlatform(zoneId, id, changes) {
    /* find + assign + emit 'platform:updated' */
  }
  removePlatform(zoneId, id) {
    /* filter + emit 'platform:removed' */
  }

  // --- Stair mutations ---
  addStair(zoneId, data) {
    /* push + emit 'stair:added' */
  }
  removeStair(zoneId, id) {
    /* filter + emit 'stair:removed' */
  }

  // --- Object mutations ---
  addObject(zoneId, data) {
    /* push + emit 'object:added' */
  }
  updateObject(zoneId, id, changes) {
    /* find + assign + emit 'object:updated' */
  }
  removeObject(zoneId, id) {
    /* filter + emit 'object:removed' */
  }

  // --- Transition mutations ---
  addTransition(transData) {
    this.transitions.set(transData.id, transData);
    this.bus.emit("transition:added", { transition: transData });
  }

  // --- Bulk load (called by WorldLoader) ---
  loadFromJSON(json) {
    this.metadata = json.metadata;
    this.world = json.world;
    this.terrain = json.terrain;
    this.zones.clear();
    this.transitions.clear();
    json.zones.forEach((z) => this.zones.set(z.id, z));
    json.transitions.forEach((t) => this.transitions.set(t.id, t));
    this.activeZoneId = json.zones[0]?.id || null;
    this.bus.emit("world:loaded", { metadata: json.metadata });
  }

  // --- Snapshot (called by WorldSerializer) ---
  toJSON() {
    return {
      metadata: { ...this.metadata, lastModified: new Date().toISOString() },
      world: this.world,
      terrain: this.terrain,
      zones: [...this.zones.values()],
      transitions: [...this.transitions.values()],
    };
  }
}
```

---

## userData Schema

Every Three.js mesh that participates in selection, raycasting, or collision **must** carry `userData`. Builders are responsible for setting this on every mesh they create.

```js
// Minimum required on ALL meshes
mesh.userData = {
  editorId: "wall_001", // matches data model id
  editorType: "wall", // "wall"|"floor"|"platform"|"stair"|"object"|"terrain"|"trigger"|"trim"
  zoneId: "zone_001",
  selectable: true, // false for triggers, trim, terrain, helpers
  floorLevel: 0, // which floor level (walls, floors, objects)
  _ownsMaterial: false, // true if this mesh cloned the material (must dispose it)
};

// Wall meshes add:
mesh.userData.wallId = "wall_001";

// Opening trigger volumes add:
mesh.userData.triggerType = "door";
mesh.userData.transitionId = "trans_001";
mesh.userData.openingId = "opening_001";
mesh.userData.selectable = false; // not selectable, only walkable trigger

// Object meshes add:
mesh.userData.assetId = "prop_bench_01";

// Child meshes of GLTF objects add:
mesh.userData._parentId = "obj_001"; // id of the root object group
```

Builders tag child meshes too — GLTF models have deep mesh hierarchies that raycasting will hit. Every child gets `_parentId` so SelectionManager can resolve to the root object.

---

## SelectionManager.ts

### Raycast Priority

When a click ray intersects multiple meshes, priority order (highest first):

1. `object` — props and furniture
2. `platform` — raised floor slabs
3. `wall` — wall segments
4. `floor` — floor planes
5. `terrain` — never selected directly (only for placement snapping)
6. `trigger` — never selectable

### Highlight Strategy

Use **emissive tint** (not outline post-process — that requires EffectComposer, Phase 12+).

On select:

```js
// Clone material if shared (never mutate a shared material)
if (!mesh.userData._ownsMaterial) {
  mesh.material = mesh.material.clone();
  mesh.userData._ownsMaterial = true;
}
mesh.userData._origEmissive = mesh.material.emissive.getHex();
mesh.userData._origEmissiveIntensity = mesh.material.emissiveIntensity;
mesh.material.emissive.set(0x3366ff);
mesh.material.emissiveIntensity = 0.25;
```

On deselect:

```js
mesh.material.emissive.set(mesh.userData._origEmissive ?? 0x000000);
mesh.material.emissiveIntensity = mesh.userData._origEmissiveIntensity ?? 0;
```

Hover highlight: lighter tint (`0x224488`, intensity `0.12`). Tracked separately from selection — `this._hoveredMesh` vs `this._selectedMesh`. If the hovered mesh is also selected, selection tint wins.

GLTF objects: apply highlight to ALL child meshes of the root group (traverse and tint each).

### Full Class

```js
class SelectionManager {
  constructor(scene, camera, domElement, worldState, bus) {
    this._scene = scene;
    this._camera = camera;
    this._dom = domElement;
    this._worldState = worldState;
    this._bus = bus;
    this._raycaster = new THREE.Raycaster();
    this._raycaster.firstHitOnly = true;
    this._mouse = new THREE.Vector2();
    this._selectedMesh = null;
    this._hoveredMesh = null;
    this._activeTool = "select";
  }

  init() {
    this._dom.addEventListener(
      "click",
      (this._onClick = this._onClick.bind(this)),
    );
    this._dom.addEventListener(
      "mousemove",
      (this._onMouseMove = this._onMouseMove.bind(this)),
    );
    this._bus.on("tool:select", ({ tool }) => {
      this._activeTool = tool;
    });
    this._bus.on("object:updated", ({ id, zoneId, changes }) =>
      this._onExternalUpdate(id, zoneId, changes),
    );
  }

  _onClick(e) {
    if (this._activeTool !== "select") return;
    const hits = this._castRay(e);
    const selectable = hits.filter((h) => h.object.userData.selectable);
    if (selectable.length === 0) {
      this._deselect();
      return;
    }
    const best = this._pickByPriority(selectable);
    // Resolve GLTF child to root group
    const root = this._resolveRoot(best.object);
    this._select(root);
  }

  _onMouseMove(e) {
    if (this._activeTool !== "select") return;
    const hits = this._castRay(e);
    const selectable = hits.filter((h) => h.object.userData.selectable);
    const hovered = selectable.length
      ? this._resolveRoot(this._pickByPriority(selectable).object)
      : null;
    if (hovered !== this._hoveredMesh) {
      if (this._hoveredMesh && this._hoveredMesh !== this._selectedMesh)
        this._clearHover(this._hoveredMesh);
      this._hoveredMesh = hovered;
      if (hovered && hovered !== this._selectedMesh) this._applyHover(hovered);
    }
  }

  _select(root) {
    if (this._selectedMesh === root) return;
    if (this._selectedMesh) this._clearSelect(this._selectedMesh);
    this._selectedMesh = root;
    this._applySelect(root);

    this._bus.emit("object:selected", {
      id: root.userData.editorId,
      type: root.userData.editorType,
      zoneId: root.userData.zoneId,
      position: root.position.clone(),
      rotation: {
        x: THREE.MathUtils.radToDeg(root.rotation.x),
        y: THREE.MathUtils.radToDeg(root.rotation.y),
        z: THREE.MathUtils.radToDeg(root.rotation.z),
      },
      scale: root.scale.clone(),
      data: this._getDataRecord(root),
    });
  }

  _deselect() {
    if (!this._selectedMesh) return;
    this._clearSelect(this._selectedMesh);
    this._selectedMesh = null;
    this._bus.emit("object:deselected", {});
  }

  _applySelect(root) {
    root.traverse((child) => {
      if (!child.isMesh) return;
      if (!child.userData._ownsMaterial) {
        child.material = child.material.clone();
        child.userData._ownsMaterial = true;
      }
      child.userData._origEmissive = child.material.emissive.getHex();
      child.userData._origEmissiveIntensity = child.material.emissiveIntensity;
      child.material.emissive.set(0x3366ff);
      child.material.emissiveIntensity = 0.25;
    });
  }

  _clearSelect(root) {
    root.traverse((child) => {
      if (!child.isMesh || !child.userData._ownsMaterial) return;
      child.material.emissive.set(child.userData._origEmissive ?? 0x000000);
      child.material.emissiveIntensity =
        child.userData._origEmissiveIntensity ?? 0;
    });
  }

  _applyHover(root) {
    root.traverse((child) => {
      if (!child.isMesh) return;
      if (!child.userData._ownsMaterial) {
        child.material = child.material.clone();
        child.userData._ownsMaterial = true;
      }
      child.userData._hoverEmissive = child.material.emissive.getHex();
      child.material.emissive.set(0x224488);
      child.material.emissiveIntensity = 0.12;
    });
  }

  _clearHover(root) {
    root.traverse((child) => {
      if (!child.isMesh || !child.userData._ownsMaterial) return;
      child.material.emissive.set(child.userData._hoverEmissive ?? 0x000000);
      child.material.emissiveIntensity = 0;
    });
  }

  _resolveRoot(mesh) {
    // Walk up until we find the mesh with a real editorId (not _parentId)
    if (mesh.userData._parentId) {
      let node = mesh;
      while (node.parent) {
        node = node.parent;
        if (node.userData.editorId && !node.userData._parentId) return node;
      }
    }
    return mesh;
  }

  _pickByPriority(hits) {
    const order = ["object", "platform", "wall", "floor"];
    for (const type of order) {
      const hit = hits.find((h) => h.object.userData.editorType === type);
      if (hit) return hit;
    }
    return hits[0];
  }

  _castRay(event) {
    const rect = this._dom.getBoundingClientRect();
    this._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._mouse, this._camera);
    return this._raycaster.intersectObjects(this._scene.children, true);
  }

  _getDataRecord(root) {
    const { editorType, editorId, zoneId } = root.userData;
    const zone = this._worldState.zones.get(zoneId);
    if (!zone) return null;
    switch (editorType) {
      case "wall":
        return zone.walls.find((w) => w.id === editorId);
      case "floor":
        return zone.floors.find((f) => f.level === root.userData.floorLevel);
      case "platform":
        return zone.platforms.find((p) => p.id === editorId);
      case "stair":
        return zone.stairs.find((s) => s.id === editorId);
      case "object":
        return zone.objects.find((o) => o.id === editorId);
      default:
        return null;
    }
  }

  _onExternalUpdate(id, zoneId, changes) {
    // React edited a field — apply transform changes directly to mesh if selected
    if (!this._selectedMesh || this._selectedMesh.userData.editorId !== id)
      return;
    if (changes.position)
      this._selectedMesh.position.set(
        changes.position.x,
        changes.position.y,
        changes.position.z,
      );
    if (changes.rotation)
      this._selectedMesh.rotation.set(
        THREE.MathUtils.degToRad(changes.rotation.x),
        THREE.MathUtils.degToRad(changes.rotation.y),
        THREE.MathUtils.degToRad(changes.rotation.z),
      );
    if (changes.scale)
      this._selectedMesh.scale.set(
        changes.scale.x,
        changes.scale.y,
        changes.scale.z,
      );
  }

  update(dt) {
    /* gizmo update in Phase 7 */
  }

  dispose() {
    this._dom.removeEventListener("click", this._onClick);
    this._dom.removeEventListener("mousemove", this._onMouseMove);
  }
}
```

### Transform Gizmos (Phase 7)

Use `THREE.TransformControls` from `three/addons/controls/TransformControls.js`:

```js
import { TransformControls } from "three/addons/controls/TransformControls.js";

this._gizmo = new TransformControls(camera, domElement);
scene.add(this._gizmo);

// Attach on select
this._gizmo.attach(selectedMesh);

// Key bindings
// G = translate, R = rotate (Y-axis only for objects), S = scale uniform
bus.on("input:keydown", ({ code }) => {
  if (!this._selectedMesh) return;
  if (code === "KeyG") this._gizmo.setMode("translate");
  if (code === "KeyR") this._gizmo.setMode("rotate");
  if (code === "KeyS") this._gizmo.setMode("scale");
});

// Suppress camera during drag
this._gizmo.addEventListener("dragging-changed", (e) => {
  bus.emit("gizmo:dragging", { isDragging: e.value });
});

// Write back to WorldState on drag end
this._gizmo.addEventListener("objectChange", () => {
  const mesh = this._selectedMesh;
  worldState.updateObject(mesh.userData.zoneId, mesh.userData.editorId, {
    position: mesh.position,
    rotation: {
      x: THREE.MathUtils.radToDeg(mesh.rotation.x),
      y: THREE.MathUtils.radToDeg(mesh.rotation.y),
      z: THREE.MathUtils.radToDeg(mesh.rotation.z),
    },
    scale: mesh.scale,
  });
});
```

---

## EventBus Contract

```js
class EventBus {
  on(event, callback)  // subscribe; returns unsubscribe fn
  off(event, callback) // unsubscribe
  emit(event, payload) // fire synchronously
}
```

### Full Event Table

| Event                  | Direction          | Payload                                                 |
| ---------------------- | ------------------ | ------------------------------------------------------- |
| `tool:select`          | React → Three.js   | `{ tool: string }`                                      |
| `floor:select`         | React → Three.js   | `{ level: number }`                                     |
| `object:selected`      | Three.js → React   | `{ id, type, zoneId, position, rotation, scale, data }` |
| `object:deselected`    | Three.js → React   | `{}`                                                    |
| `object:updated`       | React → Three.js   | `{ id, zoneId, changes }`                               |
| `asset:selected`       | React → Three.js   | `{ assetId }`                                           |
| `asset:dropped`        | React → Three.js   | `{ assetId, screenPos }`                                |
| `wall:added`           | internal           | `{ zoneId, wall }`                                      |
| `wall:updated`         | internal           | `{ zoneId, wallId, changes }`                           |
| `wall:removed`         | internal           | `{ zoneId, wallId }`                                    |
| `floor:added`          | internal           | `{ zoneId, floor }`                                     |
| `floor:updated`        | internal           | `{ zoneId, level, changes }`                            |
| `platform:added`       | internal           | `{ zoneId, platform }`                                  |
| `platform:updated`     | internal           | `{ zoneId, id, changes }`                               |
| `platform:removed`     | internal           | `{ zoneId, id }`                                        |
| `stair:added`          | internal           | `{ zoneId, stair }`                                     |
| `stair:removed`        | internal           | `{ zoneId, id }`                                        |
| `object:added`         | internal           | `{ zoneId, object }`                                    |
| `object:removed`       | internal           | `{ zoneId, id }`                                        |
| `zone:added`           | internal           | `{ zone }`                                              |
| `zone:activated`       | internal           | `{ zoneId }`                                            |
| `zone:enter`           | React → Three.js   | `{ zoneId }`                                            |
| `transition:added`     | internal           | `{ transition }`                                        |
| `preview:start`        | React → Three.js   | `{}`                                                    |
| `preview:stop`         | Three.js → React   | `{}`                                                    |
| `preview:zone-entered` | Three.js → React   | `{ zoneName }`                                          |
| `gizmo:dragging`       | internal           | `{ isDragging: bool }`                                  |
| `camera:jump`          | internal           | `{ x, z }`                                              |
| `character:teleport`   | internal           | `{ position, facing }`                                  |
| `overlay:fade-in`      | internal           | `{ color, duration }`                                   |
| `overlay:fade-out`     | internal           | `{ duration }`                                          |
| `scene:save`           | React → Three.js   | `{}`                                                    |
| `scene:load`           | React → Three.js   | `{ json }`                                              |
| `scene:saved`          | Three.js → React   | `{ json }`                                              |
| `scene:loaded`         | Three.js → React   | `{ metadata }`                                          |
| `world:loaded`         | internal           | `{ metadata }`                                          |
| `terrain:sculpt`       | internal           | `{ x, z, radius, delta }`                               |
| `input:click`          | InputManager → all | `{ screenPos, worldPos, button }`                       |
| `input:dblclick`       | InputManager → all | `{ screenPos, worldPos }`                               |
| `input:mousemove`      | InputManager → all | `{ screenPos, worldPos, delta }`                        |
| `input:mousedown`      | InputManager → all | `{ button, screenPos }`                                 |
| `input:mouseup`        | InputManager → all | `{ button, screenPos }`                                 |
| `input:wheel`          | InputManager → all | `{ delta }`                                             |
| `input:keydown`        | InputManager → all | `{ code, key, shift, ctrl, alt }`                       |
| `input:keyup`          | InputManager → all | `{ code }`                                              |

---

## InputManager.ts

Centralizes all DOM input so tools don't each add their own listeners. Tools subscribe to bus events instead of DOM events directly. InputManager can suppress all input during transitions by simply not emitting.

```js
class InputManager {
  constructor(domElement, camera, bus) {
    this._dom = domElement;
    this._camera = camera;
    this._bus = bus;
    this._keys = {};
    this._mousePos = new THREE.Vector2();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._raycaster = new THREE.Raycaster();
    this._suppress = false; // set true during transitions
  }

  init() {
    this._dom.addEventListener(
      "mousedown",
      (this._md = (e) => this._onMouseDown(e)),
    );
    this._dom.addEventListener(
      "mousemove",
      (this._mm = (e) => this._onMouseMove(e)),
    );
    this._dom.addEventListener(
      "mouseup",
      (this._mu = (e) => this._onMouseUp(e)),
    );
    this._dom.addEventListener("click", (this._mc = (e) => this._onClick(e)));
    this._dom.addEventListener(
      "dblclick",
      (this._dc = (e) => this._onDblClick(e)),
    );
    this._dom.addEventListener("wheel", (this._mw = (e) => this._onWheel(e)), {
      passive: false,
    });
    this._dom.addEventListener(
      "contextmenu",
      (this._cx = (e) => e.preventDefault()),
    );
    window.addEventListener("keydown", (this._kd = (e) => this._onKeyDown(e)));
    window.addEventListener("keyup", (this._ku = (e) => this._onKeyUp(e)));
    this._bus.on("overlay:fade-in", () => {
      this._suppress = true;
    });
    this._bus.on("overlay:fade-out", () => {
      this._suppress = false;
    });
  }

  get isShiftDown() {
    return !!(this._keys["ShiftLeft"] || this._keys["ShiftRight"]);
  }
  get isAltDown() {
    return !!(this._keys["AltLeft"] || this._keys["AltRight"]);
  }
  get isCtrlDown() {
    return !!(this._keys["ControlLeft"] || this._keys["ControlRight"]);
  }
  isKeyDown(code) {
    return !!this._keys[code];
  }

  _worldPos(event) {
    const rect = this._dom.getBoundingClientRect();
    this._mousePos.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._mousePos.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._mousePos, this._camera);
    const target = new THREE.Vector3();
    this._raycaster.ray.intersectPlane(this._groundPlane, target);
    return target;
  }

  _onMouseDown(e) {
    if (this._suppress) return;
    this._bus.emit("input:mousedown", {
      button: e.button,
      screenPos: { x: e.clientX, y: e.clientY },
    });
  }
  _onMouseMove(e) {
    if (this._suppress) return;
    const worldPos = this._worldPos(e);
    this._bus.emit("input:mousemove", {
      screenPos: { x: e.clientX, y: e.clientY },
      worldPos,
      delta: { x: e.movementX, y: e.movementY },
    });
  }
  _onMouseUp(e) {
    if (!this._suppress)
      this._bus.emit("input:mouseup", {
        button: e.button,
        screenPos: { x: e.clientX, y: e.clientY },
      });
  }
  _onClick(e) {
    if (!this._suppress)
      this._bus.emit("input:click", {
        screenPos: { x: e.clientX, y: e.clientY },
        worldPos: this._worldPos(e),
        button: e.button,
      });
  }
  _onDblClick(e) {
    if (!this._suppress)
      this._bus.emit("input:dblclick", {
        screenPos: { x: e.clientX, y: e.clientY },
        worldPos: this._worldPos(e),
      });
  }
  _onWheel(e) {
    e.preventDefault();
    if (!this._suppress) this._bus.emit("input:wheel", { delta: e.deltaY });
  }
  _onKeyDown(e) {
    this._keys[e.code] = true;
    if (!this._suppress)
      this._bus.emit("input:keydown", {
        code: e.code,
        key: e.key,
        shift: e.shiftKey,
        ctrl: e.ctrlKey,
        alt: e.altKey,
      });
  }
  _onKeyUp(e) {
    delete this._keys[e.code];
    if (!this._suppress) this._bus.emit("input:keyup", { code: e.code });
  }

  dispose() {
    this._dom.removeEventListener("mousedown", this._md);
    this._dom.removeEventListener("mousemove", this._mm);
    this._dom.removeEventListener("mouseup", this._mu);
    this._dom.removeEventListener("click", this._mc);
    this._dom.removeEventListener("dblclick", this._dc);
    this._dom.removeEventListener("wheel", this._mw);
    this._dom.removeEventListener("contextmenu", this._cx);
    window.removeEventListener("keydown", this._kd);
    window.removeEventListener("keyup", this._ku);
  }
}
```

---

## EditorCamera.ts

### Controls

| Input             | Action                                           |
| ----------------- | ------------------------------------------------ |
| Right-click drag  | Orbit around focus point                         |
| Middle-click drag | Pan focus point on XZ plane                      |
| WASD / Arrow keys | Pan focus point on XZ plane                      |
| Scroll wheel      | Zoom in/out                                      |
| Q / E             | Snap rotate 45° left / right                     |
| F                 | Frame selected object (focus on its AABB center) |
| `[` / `]`         | Previous / next floor level                      |
| P                 | Enter preview mode                               |
| Esc               | Exit preview                                     |
| Home              | Reset to default position                        |

### Implementation

Uses `THREE.Spherical` for orbit. All inputs write to `targetSpherical` / `targetFocus`. Each frame lerps actual values toward targets (factor 0.12) — gives smooth deceleration.

```js
update(dt) {
  // WASD pan
  if (this._keys['KeyW']) this.targetFocus.z -= panSpeed * dt * 60;
  // ...

  // Smooth lerp
  this.spherical.radius += (this.targetSpherical.radius - this.spherical.radius) * 0.12;
  this.spherical.theta  += (this.targetSpherical.theta  - this.spherical.theta)  * 0.12;
  this.spherical.phi    += (this.targetSpherical.phi    - this.spherical.phi)    * 0.12;
  this.focus.lerp(this.targetFocus, 0.12);

  // phi clamped: [0.05, PI/2 - 0.05] — prevents gimbal lock
  this.spherical.phi = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, this.spherical.phi));

  this._updateCameraPosition();
}
```

Disable all camera inputs when `gizmo:dragging` = true (subscribe to bus).

### Floor Clip Plane

When active floor level > 0:

```js
const clipY = zone.floors[level].elevation + zone.floors[level].ceilingHeight;
renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), clipY)];
```

When floor 0 is active: `renderer.clippingPlanes = []`.

Lower floor meshes: set `material.opacity = 0.2`, `material.transparent = true` on all meshes with `floorLevel < activeLevel`. Restore on floor change.

---

## Wall Generation System (WallBuilder.js)

### Algorithm

```
Input: WallDef { id, start{x,z}, end{x,z}, floor, height, thickness, material, exteriorMaterial, openings[] }
       zone (for floor elevation lookup)

Step 1: Geometry
  length    = hypot(end.x - start.x, end.z - start.z)
  angle     = atan2(end.z - start.z, end.x - start.x)
  midpoint  = { x: (start.x+end.x)/2, z: (start.z+end.z)/2 }
  elevation = zone.floors[wallDef.floor].elevation
  baseY     = elevation + height / 2

  geo = BoxGeometry(length, height, thickness)

Step 2: Positioning
  mesh = new Mesh(geo, material)
  mesh.position.set(midpoint.x, baseY, midpoint.z)
  mesh.rotation.y = -angle

Step 3: CSG Openings (sorted by offsetAlongWall asc)
  For each opening:
    cutterGeo = BoxGeometry(opening.width + 0.05, opening.height + 0.05, thickness + 0.1)
    posAlongWall = (opening.offsetAlongWall - length/2)  // local X offset
    cutterY = elevation + opening.elevation + opening.height/2
    Position cutter at wall-local offset, then transform to world space
    mesh = csgSubtract(mesh, cutter)

Step 4: UV
  u-repeat = length / materialDef.tileWidth  (default tileWidth = 1.0m)
  v-repeat = height / materialDef.tileHeight (default tileHeight = 1.0m)
  mesh.material.map.repeat.set(u-repeat, v-repeat)

Step 5: Trim (separate meshes, no CSG)
  baseboard: BoxGeometry(length, 0.1, thickness + 0.02) at floor level
  cornice:   BoxGeometry(length, 0.08, thickness + 0.02) at top
  For each door opening: door frame (4 thin boxes around perimeter)
  For each window: window frame (4 thin boxes)

Step 6: Collision (simplified, no CSG cost)
  Divide wall into segments separated by openings
  Each segment: BoxGeometry(segmentLength, height, thickness)
  These are invisible (visible = false) and used only by Rapier (registered via ColliderBuilder)

Step 7: Trigger volumes (doors only)
  For each door opening:
    triggerGeo = BoxGeometry(opening.width - 0.1, opening.height - 0.1, 0.8)
    Position centered in opening
    trigger.visible = false (shown as ghost wireframe in editor only)
    trigger.userData = { editorType: 'trigger', triggerType: 'door', transitionId, openingId, selectable: false }

Step 8: userData tagging on all meshes

Return {
  mesh,              // main wall mesh (CSG result if openings)
  trimMeshes[],
  collisionMeshes[],
  triggerMeshes[],
}
```

### Corner Joining

Adjacent walls sharing a corner must be trimmed to avoid overlap:

1. Query `worldState.zones.get(zoneId).walls` for other walls sharing `start` or `end` point
2. For each shared corner, shorten this wall by `thickness / 2` at that end
3. This produces a clean mitered visual join
4. Implemented by offsetting `start` and `end` inward before computing geometry

### Incremental Rebuild

When `wall:updated` fires on bus:

1. `ZoneManager` finds the existing mesh group for this wall
2. Calls `dispose()` on old meshes (geometry + owned materials)
3. Calls `WallBuilder.build(newWallDef, zone)` for fresh meshes
4. Adds new meshes to `wallsGroup`
5. Calls `ColliderBuilder.registerWallSegments()` to re-register Rapier colliders; old collider handles removed from ZoneManager first

---

## FloorBuilder.ts

```js
static build(floorDef, zoneBounds) {
  // floorDef: { level, elevation, ceilingHeight, floorMesh: { shape, points, material } }

  let geo;
  if (floorDef.floorMesh.shape === 'rect') {
    geo = new THREE.PlaneGeometry(zoneBounds.width, zoneBounds.depth, 1, 1);
  } else {
    // Polygon floor
    const shape = new THREE.Shape(floorDef.floorMesh.points.map(p => new THREE.Vector2(p.x, p.z)));
    geo = new THREE.ShapeGeometry(shape);
  }

  const mesh = new THREE.Mesh(geo, assetManager.getMaterial(floorDef.floorMesh.material));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(
    zoneBounds.x + zoneBounds.width / 2,
    floorDef.elevation,
    zoneBounds.z + zoneBounds.depth / 2
  );
  mesh.receiveShadow = true;

  // UV tiling
  const tileScale = MATERIAL_REGISTRY[floorDef.floorMesh.material]?.tileScale ?? 1.0;
  mesh.material.map?.repeat.set(zoneBounds.width / tileScale, zoneBounds.depth / tileScale);

  // Tag
  mesh.userData = {
    editorId: `floor_${floorDef.level}`,
    editorType: 'floor',
    zoneId: zoneBounds.zoneId,
    floorLevel: floorDef.level,
    selectable: true,
    _ownsMaterial: false,
  };

  // Collision mesh (same geometry)
  const collisionMesh = new THREE.Mesh(geo.clone());
  collisionMesh.rotation.x = -Math.PI / 2;
  collisionMesh.position.copy(mesh.position);
  collisionMesh.visible = false;
  collisionMesh.geometry.computeBoundsTree(); // three-mesh-bvh

  return { mesh, collisionMesh };
}
```

---

## PlatformBuilder.ts

```js
static build(platformDef) {
  const { position, size, thickness, material, hasRailing, railingHeight } = platformDef;
  const meshes = [];

  // Main slab
  const slabGeo = new THREE.BoxGeometry(size.width, thickness, size.depth);
  const slab = new THREE.Mesh(slabGeo, assetManager.getMaterial(material));
  slab.position.set(position.x, position.y + thickness / 2, position.z);
  slab.castShadow = true;
  slab.receiveShadow = true;
  slab.userData = { editorId: platformDef.id, editorType: 'platform', selectable: true, floorLevel: platformDef.floorLevel ?? 0 };
  meshes.push(slab);

  // Underside trim
  const trimGeo = new THREE.BoxGeometry(size.width + 0.05, 0.06, size.depth + 0.05);
  const trim = new THREE.Mesh(trimGeo, assetManager.getMaterial(material));
  trim.position.set(position.x, position.y, position.z);
  trim.userData = { editorType: 'trim', selectable: false };
  meshes.push(trim);

  // Railings (4 sides)
  if (hasRailing) {
    const railMat = assetManager.getMaterial(material);
    const rh = railingHeight ?? 1.0;
    const rt = 0.08; // railing thickness
    const sides = [
      { w: size.width, d: rt,        x: 0,                     z: -size.depth / 2 },  // north
      { w: size.width, d: rt,        x: 0,                     z:  size.depth / 2 },  // south
      { w: rt,         d: size.depth, x: -size.width / 2,       z: 0 },               // west
      { w: rt,         d: size.depth, x:  size.width / 2,       z: 0 },               // east
    ];
    for (const side of sides) {
      const rGeo = new THREE.BoxGeometry(side.w, rh, side.d);
      const r = new THREE.Mesh(rGeo, railMat);
      r.position.set(position.x + side.x, position.y + thickness + rh / 2, position.z + side.z);
      r.userData = { editorType: 'trim', selectable: false };
      meshes.push(r);
    }
  }

  // Collision (slab only)
  const collisionMesh = new THREE.Mesh(slabGeo.clone());
  collisionMesh.position.copy(slab.position);
  collisionMesh.visible = false;
  collisionMesh.geometry.computeBoundsTree();

  return { meshes, collisionMesh };
}
```

---

## StairBuilder.ts

```js
static build(stairDef) {
  const { start, end, width, style, material, hasRailing } = stairDef;
  const meshes = [];

  const heightDiff   = end.y - start.y;
  const horizDist    = Math.hypot(end.x - start.x, end.z - start.z);
  const angle        = Math.atan2(end.z - start.z, end.x - start.x);
  const stepHeight   = 0.2;
  const numSteps     = Math.max(1, Math.round(heightDiff / stepHeight));
  const stepDepth    = horizDist / numSteps;
  const mat          = assetManager.getMaterial(material);

  if (style === 'straight') {
    for (let i = 0; i < numSteps; i++) {
      const stepGeo = new THREE.BoxGeometry(width, stepHeight, stepDepth);
      const step = new THREE.Mesh(stepGeo, mat);
      const t = (i + 0.5) / numSteps;
      step.position.set(
        start.x + (end.x - start.x) * t,
        start.y + (i + 0.5) * stepHeight,
        start.z + (end.z - start.z) * t
      );
      step.rotation.y = -angle;
      step.castShadow = true;
      step.receiveShadow = true;
      step.userData = { editorId: stairDef.id, editorType: 'stair', selectable: i === 0, _parentId: i > 0 ? stairDef.id : undefined };
      meshes.push(step);
    }
  }

  if (style === 'spiral') {
    // Central pole
    const poleGeo = new THREE.CylinderGeometry(0.15, 0.15, heightDiff, 8);
    const pole = new THREE.Mesh(poleGeo, mat);
    pole.position.set(start.x, start.y + heightDiff / 2, start.z);
    meshes.push(pole);
    // Wedge steps rotating around pole
    for (let i = 0; i < numSteps; i++) {
      const angle = (i / numSteps) * Math.PI * 2 * (heightDiff / 4); // ~2 rotations per 4m
      const stepW = width;
      const stepGeo = new THREE.BoxGeometry(stepW, stepHeight, stepDepth);
      const step = new THREE.Mesh(stepGeo, mat);
      step.position.set(
        start.x + Math.cos(angle) * stepW / 2,
        start.y + i * stepHeight,
        start.z + Math.sin(angle) * stepW / 2
      );
      step.rotation.y = -angle;
      step.userData = { editorId: stairDef.id, editorType: 'stair', selectable: false, _parentId: stairDef.id };
      meshes.push(step);
    }
  }

  // Railings: two handrails running along each side
  if (hasRailing) {
    for (const side of [-1, 1]) {
      const railGeo = new THREE.BoxGeometry(0.05, 0.05, horizDist);
      const rail = new THREE.Mesh(railGeo, mat);
      // Position along stair run, offset to side, at handrail height (~0.9m from each step)
      rail.position.set(
        (start.x + end.x) / 2 + Math.cos(angle + Math.PI / 2) * (width / 2) * side,
        (start.y + end.y) / 2 + 0.9,
        (start.z + end.z) / 2 + Math.sin(angle + Math.PI / 2) * (width / 2) * side
      );
      rail.rotation.y = -angle;
      rail.rotation.z = Math.atan2(heightDiff, horizDist) * -1;
      rail.userData = { editorType: 'trim', selectable: false };
      meshes.push(rail);
    }
  }

  // Collision: single slanted box approximation
  const collisionGeo = new THREE.BoxGeometry(width, heightDiff, horizDist);
  const collision = new THREE.Mesh(collisionGeo);
  collision.position.set((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
  collision.rotation.y = -angle;
  collision.rotation.z = Math.atan2(heightDiff, horizDist) * -1;
  collision.visible = false;
  collision.geometry.computeBoundsTree();

  return { meshes, collisionMesh: collision };
}
```

---

## ObjectPlacer.ts

```js
class ObjectPlacer {
  constructor(scene, assetManager, worldState, bus) { ... }

  async place(objectDef, parentGroup) {
    const gltf = await this._assetManager.loadGLTF(objectDef.assetId);
    const root = gltf.scene.clone();

    root.position.set(objectDef.position.x, objectDef.position.y, objectDef.position.z);
    root.rotation.set(
      THREE.MathUtils.degToRad(objectDef.rotation.x ?? 0),
      THREE.MathUtils.degToRad(objectDef.rotation.y ?? 0),
      THREE.MathUtils.degToRad(objectDef.rotation.z ?? 0)
    );
    root.scale.set(objectDef.scale.x, objectDef.scale.y, objectDef.scale.z);

    root.userData = {
      editorId: objectDef.id,
      editorType: 'object',
      assetId: objectDef.assetId,
      zoneId: objectDef.zoneId,
      floorLevel: objectDef.floor,
      selectable: true,
    };

    root.traverse(child => {
      if (child.isMesh) {
        child.userData = {
          editorId: objectDef.id,
          editorType: 'object',
          selectable: true,
          _parentId: objectDef.id,
        };
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    (parentGroup || this._objectGroup).add(root);
    return root;
  }
}
```

---

## ZoneManager.ts

```js
class ZoneManager {
  constructor(scene, worldState, assetManager, bus) { ... }

  async loadZone(zoneId) {
    const zone = this._worldState.zones.get(zoneId);
    if (this._loadedZones.has(zoneId)) return; // already loaded

    const group        = new THREE.Group(); group.name = `zone_${zoneId}`;
    const floorsGroup  = new THREE.Group(); group.add(floorsGroup);
    const wallsGroup   = new THREE.Group(); group.add(wallsGroup);
    const platformsGroup = new THREE.Group(); group.add(platformsGroup);
    const stairsGroup  = new THREE.Group(); group.add(stairsGroup);
    const objectsGroup = new THREE.Group(); group.add(objectsGroup);
    const triggersGroup = new THREE.Group(); group.add(triggersGroup);

    for (const floor of zone.floors) {
      const r = FloorBuilder.build(floor, zone.bounds);
      floorsGroup.add(r.mesh);
      floorsGroup.add(r.collisionMesh);
    }

    for (const wall of zone.walls) {
      const r = WallBuilder.build(wall, zone);
      wallsGroup.add(r.mesh, ...r.trimMeshes, ...r.collisionMeshes);
      triggersGroup.add(...r.triggerMeshes);
    }

    for (const platform of zone.platforms) {
      const r = PlatformBuilder.build(platform);
      platformsGroup.add(...r.meshes, r.collisionMesh);
    }

    for (const stair of zone.stairs) {
      const r = StairBuilder.build(stair);
      stairsGroup.add(...r.meshes, r.collisionMesh);
    }

    for (const obj of zone.objects) {
      await this._objectPlacer.place(obj, objectsGroup);
    }

    this._scene.add(group);
    this._loadedZones.set(zoneId, { group, floorsGroup, wallsGroup, platformsGroup, stairsGroup, objectsGroup, triggersGroup });

    // Listen for incremental updates to this zone
    this._bus.on('wall:added',      ({ zoneId: zid, wall })       => { if (zid === zoneId) this._rebuildWall(zoneId, wall.id); });
    this._bus.on('wall:updated',    ({ zoneId: zid, wallId })      => { if (zid === zoneId) this._rebuildWall(zoneId, wallId); });
    this._bus.on('wall:removed',    ({ zoneId: zid, wallId })      => { if (zid === zoneId) this._removeWall(zoneId, wallId); });
    this._bus.on('platform:added',  ({ zoneId: zid, platform })    => { if (zid === zoneId) this._rebuildPlatform(zoneId, platform.id); });
    this._bus.on('platform:removed',({ zoneId: zid, id })          => { if (zid === zoneId) this._removePlatform(zoneId, id); });
    this._bus.on('floor:added',     ({ zoneId: zid, floor })       => { if (zid === zoneId) this._rebuildFloor(zoneId, floor.level); });
  }

  unloadZone(zoneId) {
    const entry = this._loadedZones.get(zoneId);
    if (!entry) return;
    this._scene.remove(entry.group);
    entry.group.traverse(child => {
      if (child.isMesh) {
        child.geometry.dispose();
        if (child.userData._ownsMaterial) child.material.dispose();
      }
    });
    this._loadedZones.delete(zoneId);
  }

  setActiveFloorLevel(level) {
    this._activeFloorLevel = level;
    this._loadedZones.forEach(({ floorsGroup, wallsGroup }) => {
      [...floorsGroup.children, ...wallsGroup.children].forEach(mesh => {
        if (!mesh.isMesh) return;
        const fl = mesh.userData.floorLevel ?? 0;
        if (!mesh.userData._ownsMaterial) {
          mesh.material = mesh.material.clone();
          mesh.userData._ownsMaterial = true;
        }
        mesh.material.transparent = fl !== level;
        mesh.material.opacity = fl === level ? 1.0 : 0.15;
      });
    });
  }

  _rebuildWall(zoneId, wallId) {
    const { wallsGroup, triggersGroup } = this._loadedZones.get(zoneId);
    // Remove old meshes tagged with this wallId
    const toRemove = [];
    wallsGroup.traverse(m => { if (m.userData.wallId === wallId) toRemove.push(m); });
    triggersGroup.traverse(m => { if (m.userData.wallId === wallId) toRemove.push(m); });
    toRemove.forEach(m => { m.geometry?.dispose(); if (m.userData._ownsMaterial) m.material?.dispose(); m.parent?.remove(m); });
    // Rebuild
    const wall = this._worldState.zones.get(zoneId).walls.find(w => w.id === wallId);
    const zone = this._worldState.zones.get(zoneId);
    const r = WallBuilder.build(wall, zone);
    wallsGroup.add(r.mesh, ...r.trimMeshes, ...r.collisionMeshes);
    triggersGroup.add(...r.triggerMeshes);
  }
}
```

---

## TransitionManager.ts

```js
class TransitionManager {
  constructor(worldState, zoneManager, bus) { ... }

  async trigger(transitionId) {
    if (this._transitioning) return;
    this._transitioning = true;
    const t = this._worldState.transitions.get(transitionId);

    if (t.effect === 'fade') {
      this._bus.emit('overlay:fade-in', { color: t.fadeColor ?? '#000000', duration: t.fadeDuration ?? 0.3 });
      await this._sleep((t.fadeDuration ?? 0.3) * 1000);
      await this._zoneManager.unloadZone(t.fromZone);
      await this._zoneManager.loadZone(t.toZone);
      this._worldState.setActiveZone(t.toZone);
      this._bus.emit('character:teleport', { position: t.spawnPoint, facing: t.spawnPoint.facing });
      this._bus.emit('overlay:fade-out', { duration: t.fadeDuration ?? 0.3 });
      await this._sleep((t.fadeDuration ?? 0.3) * 1000);
      const zoneName = this._worldState.zones.get(t.toZone).name;
      this._bus.emit('preview:zone-entered', { zoneName });
    }

    this._transitioning = false;
  }

  // Editor mode: jump without character, just camera
  async editorJump(transitionId) {
    const t = this._worldState.transitions.get(transitionId);
    this._bus.emit('overlay:fade-in', { color: '#000000', duration: 0.2 });
    await this._sleep(200);
    await this._zoneManager.unloadZone(t.fromZone);
    await this._zoneManager.loadZone(t.toZone);
    this._worldState.setActiveZone(t.toZone);
    const zone = this._worldState.zones.get(t.toZone);
    this._bus.emit('camera:jump', { x: zone.bounds.x + zone.bounds.width / 2, z: zone.bounds.z + zone.bounds.depth / 2 });
    this._bus.emit('overlay:fade-out', { duration: 0.2 });
  }

  _sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
}
```

---

## Editor Tool State Machines

### FloorTool.ts

```
States: IDLE → PLACING → IDLE

IDLE:
  Show 0.5m grid-snapped cursor square following mouse on ground plane
  On input:click (left): record snapToGrid(worldPos), enter PLACING

PLACING:
  Show semi-transparent preview PlaneGeometry from startPoint to mousePos (updated each input:mousemove)
  Preview color: rgba(80,140,255, 0.3)
  On input:mousemove: resize preview mesh
  On input:click (left): create floor
    bounds = normalizeRect(startPoint, endPoint)  // ensure positive width/depth
    if bounds.width < 0.5 or bounds.depth < 0.5: ignore
    floorDef = { level: activeLevel, elevation: activeFloor.elevation, shape: 'rect',
                 material: selectedMaterial, ... }
    worldState.addFloor(zoneId, floorDef)
    Remove preview mesh
    Return to IDLE
  On input:keydown Escape or input:mousedown right: remove preview, return to IDLE

Grid snap: Math.round(val / 0.5) * 0.5 on all x,z coordinates
```

### WallTool.ts

```
States: IDLE → DRAWING → DRAWING (chains)

IDLE:
  Show snapped dot at mouse world position
  On input:click: record startPoint (snapped), enter DRAWING

DRAWING:
  Ghost wall: thin BoxGeometry(currentLen, defaultHeight, 0.2), grey, 50% opacity
  Updated each input:mousemove (rebuild ghost each frame with new length/angle)
  Show floating text label with length in meters above midpoint
  Shift held: snap angle to nearest 45°

  On input:click:
    endPoint = snapped (or angle-snapped if Shift)
    if distance(start, end) < 0.5: ignore
    wallDef = { id: uuid(), start, end, floor: activeLevel, height: 3.0, thickness: 0.2,
                material: selectedMaterial, exteriorMaterial: selectedMaterial, openings: [] }
    worldState.addWall(zoneId, wallDef)
    startPoint = endPoint  ← chain continues
    Remain in DRAWING

  On input:dblclick or input:keydown Enter: finish chain, return to IDLE
  On input:keydown Escape or input:mousedown right: discard ghost, return to IDLE
```

### PlatformTool.ts

```
States: IDLE → PLACING → IDLE (same rect-drag as FloorTool)

Extra: scroll wheel during PLACING adjusts Y offset in 0.2m increments
Default Y = activeFloor.elevation + defaultWallHeight (sits at top of current floor walls)
Status label shows current Y elevation during PLACING
```

### StairTool.ts

```
States: IDLE → SET_BOTTOM → SET_TOP → IDLE

SET_BOTTOM:
  Raycast against floor meshes + platform meshes + ground (not walls)
  Cursor snaps to nearest floor surface hit
  On input:click: record bottomPoint, enter SET_TOP

SET_TOP:
  Show preview line from bottomPoint to mouse
  Cursor still snaps to floor surfaces
  Show angle label and height label
  Scroll wheel adjusts stair width (0.8m–4.0m, default 1.5m)

  On input:click:
    if topPoint.y <= bottomPoint.y: flash error "Top point must be higher", stay in SET_TOP
    stairDef = { id: uuid(), start: bottomPoint, end: topPoint, width, style, material, hasRailing: true }
    worldState.addStair(zoneId, stairDef)
    Return to IDLE

  On input:keydown Escape: return to IDLE
```

### ObjectTool.ts

```
Mode A — Placing (asset selected in AssetBrowser):
  Ghost model follows snapped mouse position on nearest floor/platform surface (raycast)
  On input:click: ObjectPlacer.place(assetId, position, floor, zoneId), stay in Mode A
  On Escape: deactivate asset selection, return to passive Mode B

Mode B — Transform (object selected via SelectionManager):
  G key: enter translate mode (object follows mouse XZ, Y locked to floor surface)
  R key: enter rotate mode (mouse X delta → Y rotation, 45° snap unless Alt held)
  S key: enter scale mode (mouse Y up = larger, Y down = smaller, uniform)
  In any transform mode: click confirms, Escape cancels (restores original transform)
  After confirm: worldState.updateObject(...)

Grid snap: 0.5m (disable with Alt key)
Rotation snap: 45° (disable with Alt key)
```

### ZoneTool.ts

```
States: IDLE → PLACING → NAMING → IDLE

IDLE:
  Draw dashed outlines of all existing zone boundaries
  On input:click in empty area (no zone hit): enter PLACING

PLACING:
  Drag to define zone rect (same as FloorTool)
  On input:click: capture bounds, enter NAMING

NAMING:
  Show input dialog (React UI, not canvas) for zone name and type
  Bus event 'zonetool:awaiting-name' → React shows modal
  React emits 'zonetool:name-confirmed' { name, type }
  ZoneTool creates zoneDef, calls worldState.addZone()
  Sets new zone as active zone
  Return to IDLE

Clicking inside an existing zone: set as active zone (no state change)
```

### TransitionTool.ts

```
Requires: a wall with a door opening already exists and is selected

Step 1: User selects wall via SelectTool → PropertiesPanel shows openings list
Step 2: User clicks "Link zone..." next to a door opening in PropertiesPanel
        → bus emits 'transitiontool:start' { wallId, openingId }
Step 3: ZonePanel highlights available destination zones
Step 4: User clicks a zone in ZonePanel
        → bus emits 'zonetool:zone-selected' { zoneId }
Step 5: TransitionTool computes default spawn point:
        1m inside destination zone from the direction the door faces
Step 6: Creates transitionDef, calls worldState.addTransition()
Step 7: WallBuilder rebuilds the wall (trigger volume now linked)
Step 8: Visual: dashed line drawn between source zone and destination zone
Step 9: Clicking a linked door opening in editor → TransitionManager.editorJump()
```

---

## AssetManager.ts

```js
class AssetManager {
  constructor() {
    this._textureCache = new Map();
    this._materialCache = new Map();
    this._gltfCache = new Map();
    this._textureLoader = new THREE.TextureLoader();
    this._gltfLoader = null;
  }

  async loadTexture(url) {
    if (this._textureCache.has(url)) return this._textureCache.get(url);
    const tex = await this._textureLoader.loadAsync(url);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    this._textureCache.set(url, tex);
    return tex;
  }

  async getMaterial(materialId) {
    if (this._materialCache.has(materialId))
      return this._materialCache.get(materialId);
    const def = MATERIAL_REGISTRY[materialId];
    if (!def) {
      console.warn(`Unknown material: ${materialId}, using default`);
      return new THREE.MeshStandardMaterial({ color: 0x888888 });
    }
    const mat = new THREE.MeshStandardMaterial({
      map: await this.loadTexture(def.texture),
      roughness: def.roughness ?? 0.8,
      metalness: def.metalness ?? 0.0,
    });
    if (def.normalMap) mat.normalMap = await this.loadTexture(def.normalMap);
    this._materialCache.set(materialId, mat);
    return mat;
  }

  async loadGLTF(assetId) {
    if (this._gltfCache.has(assetId)) return this._gltfCache.get(assetId);
    if (!this._gltfLoader) {
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      this._gltfLoader = new GLTFLoader();
    }
    const gltf = await this._gltfLoader.loadAsync(
      `/assets/models/${assetId}.glb`,
    );
    this._gltfCache.set(assetId, gltf);
    return gltf;
  }

  dispose() {
    this._textureCache.forEach((t) => t.dispose());
    this._materialCache.forEach((m) => m.dispose());
    this._textureCache.clear();
    this._materialCache.clear();
    this._gltfCache.clear();
  }
}

// Material registry — add entries as textures are added to /assets/textures/
const MATERIAL_REGISTRY = {
  brick_01: {
    texture: "/assets/textures/brick_01.jpg",
    tileWidth: 1.0,
    tileHeight: 1.0,
    roughness: 0.9,
  },
  brick_exterior_01: {
    texture: "/assets/textures/brick_ext_01.jpg",
    tileWidth: 1.0,
    tileHeight: 1.0,
    roughness: 0.85,
  },
  cobblestone: {
    texture: "/assets/textures/cobblestone_01.jpg",
    tileWidth: 1.0,
    tileHeight: 1.0,
    roughness: 0.95,
  },
  wood_planks: {
    texture: "/assets/textures/wood_planks_01.jpg",
    tileWidth: 0.8,
    tileHeight: 0.8,
    roughness: 0.7,
  },
  concrete_01: {
    texture: "/assets/textures/concrete_01.jpg",
    tileWidth: 2.0,
    tileHeight: 2.0,
    roughness: 0.8,
  },
};
```

---

## CollisionWorld.ts

> **Superseded by Rapier (Phase 3).** Replaced by `src/physics/PhysicsWorld.ts` + `src/physics/ColliderBuilder.ts`. `three-mesh-bvh`'s `computeBoundsTree()` is still called on visual meshes for **editor raycasting** (selection, snapping) — but all runtime collision is Rapier. See the **Physics Architecture** section for full implementation details.

## CharacterController.ts

```js
class CharacterController {
  constructor(scene, camera, collisionWorld, inputManager, bus, settings) {
    this._settings = settings; // from worldState.world.playerSettings
    this._velocity = new THREE.Vector3();
    this._position = new THREE.Vector3();
    this._yaw = 0;
    this._pitch = 0;
    this._grounded = false;
    this._active = false;
    this._capsuleRadius = 0.3;
    this._capsuleHeight = 1.8;
  }

  spawn(position) {
    this._position.copy(position);
    this._velocity.set(0, 0, 0);
    this._active = true;
    this._bus.on(
      "input:mousemove",
      (this._onMouseMove = ({ delta }) => {
        if (document.pointerLockElement) {
          this._yaw -= delta.x * 0.002;
          this._pitch = Math.max(
            -1.4,
            Math.min(1.4, this._pitch - delta.y * 0.002),
          );
        }
      }),
    );
  }

  despawn() {
    this._active = false;
    this._bus.off("input:mousemove", this._onMouseMove);
  }

  update(dt) {
    if (!this._active) return;

    // --- Input ---
    const s = this._settings;
    const fwd = new THREE.Vector3(
      -Math.sin(this._yaw),
      0,
      -Math.cos(this._yaw),
    );
    const right = new THREE.Vector3(
      -Math.cos(this._yaw),
      0,
      Math.sin(this._yaw),
    );
    const move = new THREE.Vector3();
    if (this._input.isKeyDown("KeyW")) move.add(fwd);
    if (this._input.isKeyDown("KeyS")) move.sub(fwd);
    if (this._input.isKeyDown("KeyA")) move.sub(right);
    if (this._input.isKeyDown("KeyD")) move.add(right);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(s.moveSpeed);

    this._velocity.x = move.x;
    this._velocity.z = move.z;

    // --- Gravity ---
    this._velocity.y -= 20 * dt;

    // --- Ground check ---
    const groundY = this._collisionWorld.getGroundHeight(
      this._position.x,
      this._position.z,
    );
    const feetY = this._position.y - this._capsuleHeight / 2;
    if (feetY <= groundY) {
      this._position.y = groundY + this._capsuleHeight / 2;
      this._velocity.y = Math.max(0, this._velocity.y);
      this._grounded = true;
    } else {
      this._grounded = false;
    }

    // --- Jump ---
    if (this._grounded && this._input.isKeyDown("Space")) {
      this._velocity.y = Math.sqrt(2 * 20 * s.jumpHeight);
    }

    // --- Apply velocity ---
    this._position.addScaledVector(this._velocity, dt);

    // --- Camera ---
    if (s.cameraMode === "fps") {
      this._camera.position.set(
        this._position.x,
        this._position.y + this._capsuleHeight * 0.4,
        this._position.z,
      );
      this._camera.rotation.order = "YXZ";
      this._camera.rotation.y = this._yaw;
      this._camera.rotation.x = this._pitch;
    } else {
      const offset = new THREE.Vector3(
        -Math.sin(this._yaw) * s.thirdPersonDistance,
        s.thirdPersonHeight,
        -Math.cos(this._yaw) * s.thirdPersonDistance,
      );
      this._camera.position.copy(this._position).add(offset);
      this._camera.lookAt(
        this._position.x,
        this._position.y + 1.0,
        this._position.z,
      );
    }

    // --- Trigger check ---
    const trigger = this._collisionWorld.checkTriggers(this._position);
    if (trigger?.triggerType === "door" && trigger.transitionId) {
      this._bus.emit("character:triggerdoor", {
        transitionId: trigger.transitionId,
      });
    }
  }
}
```

---

## PreviewController.ts

```js
class PreviewController {
  constructor(sceneManager, editorCamera, characterController, collisionWorld, worldState, bus) { ... }

  async enter() {
    this._bus.emit('preview:start', {});
    await document.body.requestPointerLock();
    this._collisionWorld.buildFromZone(this._worldState.activeZoneId);
    const spawnPos = this._editorCamera.focus.clone();
    spawnPos.y = this._collisionWorld.getGroundHeight(spawnPos.x, spawnPos.z) + 0.9;
    this._characterController.spawn(spawnPos);
    this._sceneManager.onUpdate(dt => this._characterController.update(dt));
    this._bus.on('character:triggerdoor', ({ transitionId }) => {
      this._transitionManager.trigger(transitionId);
    });
    this._bus.on('input:keydown', ({ code }) => { if (code === 'Escape') this.exit(); });
    document.addEventListener('pointerlockchange', this._onLockChange = () => {
      if (!document.pointerLockElement) this.exit();
    });
  }

  exit() {
    this._characterController.despawn();
    this._collisionWorld.clear();
    document.exitPointerLock();
    document.removeEventListener('pointerlockchange', this._onLockChange);
    this._bus.emit('preview:stop', {});
  }
}
```

---

## React UI Components

### PropertiesPanel.tsx

Subscribes to `object:selected` and `object:deselected` on the EventBus (via React context). Renders different fields based on `type`:

**wall**: height (number input), thickness (number input), material picker, exterior material picker, openings list (each with type/offset/width/height/elevation), "Add Opening" button, "Delete Wall" button.

**floor**: material picker, ceiling height (number input, for indoor zones).

**platform**: width, depth, thickness (number inputs), material picker, railing toggle, railing height.

**stair**: style selector (straight / l-shape / spiral), width, material, railing toggle.

**object**: position X/Y/Z (number inputs), rotation Y (number input), scale (uniform slider), assetId (read-only label), properties sub-section (interactable toggle, NPC spawn toggle).

**nothing selected**: shows active tool hint text.

Every input `onChange`: `bus.emit('object:updated', { id, zoneId, changes: { [field]: value } })`.

Debounce number inputs 150ms before emitting (avoid rebuilding geometry on every keystroke).

### ZonePanel.tsx

- Populates zone list from a `zones` state array
- Updated via bus events `zone:added` and `scene:loaded`
- Each row: zone name (editable inline), type badge (outdoor/indoor), "Enter ▶" button
- "Enter" emits `zone:enter { zoneId }`
- "+" button activates ZoneTool (emits `tool:select { tool: 'zone' }`)
- Active zone highlighted with accent border

### AssetBrowser.tsx

- Scrollable grid, assets grouped by category tabs: Furniture, Props, Structures, Lights
- Each asset: thumbnail (placeholder color block), name label
- Click: emits `asset:selected { assetId }`, sets ObjectTool to placement mode
- Draggable: `onDragStart` → `onDrop` on canvas fires `asset:dropped { assetId, screenPos }`
- Search input filters by asset name

### PreviewHUD.tsx

Visible only when `preview:start` event fires. Hidden on `preview:stop`.

- Centered crosshair: two 1px lines, 16px each, rgba(255,255,255,0.7)
- Bottom-center: zone name (fades in on `preview:zone-entered`, fades out after 3s)
- Top-left: current floor level indicator
- Bottom-right: "Esc to exit" hint, small monospace

### SaveLoadPanel.tsx (in TopBar)

- "Save" button: `bus.emit('scene:save', {})` → WorldSerializer downloads JSON
- "Load" button: `<input type="file" accept=".json">` hidden, triggered by button click
- On file selected: `FileReader.readAsText` → `bus.emit('scene:load', { json: parsed })`
- Bus listens for `scene:loaded` → shows toast "World loaded: [name]"

---

## WorldSerializer.js / WorldLoader.ts

### Serializer

```js
class WorldSerializer {
  serialize(worldState) {
    const state = worldState.toJSON();
    // Encode terrain heightData to base64
    if (state.terrain?.heightData instanceof Float32Array) {
      state.terrain.heightData = btoa(
        String.fromCharCode(...new Uint8Array(state.terrain.heightData.buffer)),
      );
    }
    return state;
  }

  download(worldState) {
    const json = JSON.stringify(this.serialize(worldState), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `${worldState.metadata.name || "world"}.json`,
    });
    a.click();
    URL.revokeObjectURL(url);
  }

  autoSave(worldState) {
    try {
      localStorage.setItem(
        "worldeditor_autosave",
        JSON.stringify(this.serialize(worldState)),
      );
      localStorage.setItem("worldeditor_autosave_time", Date.now());
    } catch (e) {
      console.warn("Auto-save failed (storage quota?)", e);
    }
  }
}
```

### Loader

```js
class WorldLoader {
  async load(json, worldState, zoneManager) {
    if (!json?.metadata?.version)
      throw new Error("Invalid or missing scene file version");

    // Unload all current zones
    for (const zoneId of worldState.zones.keys()) {
      zoneManager.unloadZone(zoneId);
    }

    // Decode terrain heightData base64 → Float32Array
    if (
      json.terrain?.heightData &&
      typeof json.terrain.heightData === "string"
    ) {
      const binary = atob(json.terrain.heightData);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      json.terrain.heightData = new Float32Array(bytes.buffer);
    }

    // Load state
    worldState.loadFromJSON(json);

    // Build first zone
    if (json.zones.length > 0) {
      await zoneManager.loadZone(json.zones[0].id);
    }

    this._bus.emit("scene:loaded", { metadata: json.metadata });
  }

  checkAutoSave() {
    const saved = localStorage.getItem("worldeditor_autosave");
    const time = localStorage.getItem("worldeditor_autosave_time");
    if (!saved || !time) return null;
    return { json: JSON.parse(saved), age: Date.now() - Number(time) };
  }
}
```

Auto-save: `setInterval(() => serializer.autoSave(worldState), 60_000)` started in `App.tsx` after scene loads. On startup, call `loader.checkAutoSave()` and if found within 24h, show restore prompt in React UI.

---

## TerrainBuilder.ts

```js
class TerrainBuilder {
  static build(terrainDef, worldSize) {
    const { resolution, heightData, maxHeight, layerMaterials } = terrainDef;
    const geo = new THREE.PlaneGeometry(
      worldSize,
      worldSize,
      resolution - 1,
      resolution - 1,
    );
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const h = heightData[i] ?? 0;
      pos.setY(i, h * maxHeight);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    // Multi-layer material — basic MeshStandardMaterial for now (Phase 11 adds shader blending)
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3a5c2a,
      roughness: 0.95,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.userData = { editorType: "terrain", selectable: false };

    // BVH for ground collision in preview mode
    geo.computeBoundsTree();

    return mesh;
  }

  // Sculpt: raise/lower vertices in a brush area
  static sculpt(mesh, worldX, worldZ, radius, delta) {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const worldSize = /* passed in */ 200;
    const resolution = Math.sqrt(pos.count);

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const dist = Math.hypot(vx - worldX, vz - worldZ);
      if (dist < radius) {
        const falloff = 1 - dist / radius;
        const newY = Math.max(0, pos.getY(i) + delta * falloff);
        pos.setY(i, newY);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundsTree(); // rebuild BVH after sculpt
  }
}
```

---

## utils/math.ts

```js
import * as THREE from "three";

export const snapToGrid = (val, unit = 0.5) => Math.round(val / unit) * unit;

export const snapVec3XZ = (v, unit = 0.5) =>
  new THREE.Vector3(snapToGrid(v.x, unit), v.y, snapToGrid(v.z, unit));

export const dist2D = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);

export const midpoint2D = (a, b) => ({
  x: (a.x + b.x) / 2,
  z: (a.z + b.z) / 2,
});

export const angleXZ = (a, b) => Math.atan2(b.z - a.z, b.x - a.x);

export const snapAngle = (radians, degrees = 45) => {
  const snap = degrees * (Math.PI / 180);
  return Math.round(radians / snap) * snap;
};

// Normalize a rect so width/depth are always positive
export const normalizeRect = (a, b) => ({
  x: Math.min(a.x, b.x),
  z: Math.min(a.z, b.z),
  width: Math.abs(b.x - a.x),
  depth: Math.abs(b.z - a.z),
});

// World position from mouse event, raycasted against a Y=planeY plane
export const screenToWorld = (event, camera, domElement, planeY = 0) => {
  const rect = domElement.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
  const target = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, target);
  return target;
};

// AABB center of a Three.js Object3D
export const getCenter = (object) => {
  const box = new THREE.Box3().setFromObject(object);
  return box.getCenter(new THREE.Vector3());
};

// Lerp a number
export const lerp = (a, b, t) => a + (b - a) * t;
```

---

## utils/uuid.ts

```js
export const uuid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
```

---

## utils/csg.ts

```js
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";

let _evaluator = null;
const getEvaluator = () => {
  if (!_evaluator) _evaluator = new Evaluator();
  return _evaluator;
};

// Returns a new mesh: A minus B
// Caller is responsible for positioning meshA and meshB before calling
export const csgSubtract = (meshA, meshB) => {
  const brushA = new Brush(meshA.geometry, meshA.material);
  brushA.position.copy(meshA.position);
  brushA.rotation.copy(meshA.rotation);
  brushA.scale.copy(meshA.scale);
  brushA.updateMatrixWorld();

  const brushB = new Brush(meshB.geometry, meshB.material);
  brushB.position.copy(meshB.position);
  brushB.rotation.copy(meshB.rotation);
  brushB.scale.copy(meshB.scale);
  brushB.updateMatrixWorld();

  const result = getEvaluator().evaluate(brushA, brushB, SUBTRACTION);
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
};
```

---

## Build Phases

### Phase 1 — Scene Foundation ✅

- Vite + React + TypeScript scaffold
- SceneManager (scene, renderer, RAF loop with registered update callbacks)
- EditorCamera (orbit, pan, zoom, smooth lerp, WASD)
- Ground grid + ground plane
- EventBus (fully typed via BusEvents map)
- React UI shell: Toolbar with SVG icons, PropertiesPanel stub, FloorLevelSelector, coordinate display

### Phase 2 — Selection System ✅

- InputManager (centralized events, suppress flag)
- `userData as MeshUserData` tagging on all demo meshes
- SelectionManager: BVH raycast, priority ordering, emissive highlight (select + hover), GLTF child resolution
- PropertiesPanel: shows position/rotation/scale of selected object (editable number inputs)
- `object:updated` → applies transform changes to mesh
- Deselect on empty click

### Phase 3 — Physics Foundation + Sky + Floor Tool

Rapier goes in here, not later. Every subsequent builder depends on it.

**Sky setup (SceneManager addition):**

- Import `Sky` from `three/addons/objects/Sky.js`
- Add `THREE.Sky` mesh to scene, scale to `450000`
- Expose `skyUniforms`: `turbidity`, `rayleigh`, `mieCoefficient`, `mieDirectionalG`, `sunPosition`
- Compute sun position from azimuth + elevation angles stored in `WorldConfig.sunLight.position`
- Link `THREE.Sky` sun position to the existing `DirectionalLight` position — they must always match
- `PMREMGenerator`: generate environment map from sky for realistic reflections on materials
- Update `renderer.toneMappingExposure` to complement sky brightness
- Sky parameters stored in `WorldConfig` and editable in PropertiesPanel (Phase 7+):
  ```ts
  // Add to WorldConfig in types.ts
  sky: {
    turbidity: number; // default 10 — atmospheric haze
    rayleigh: number; // default 3  — sky blueness
    mieCoefficient: number; // default 0.005
    mieDirectionalG: number; // default 0.7
    sunElevation: number; // degrees above horizon, default 25
    sunAzimuth: number; // degrees, default 180
  }
  ```
- When sky params change (editor scrubbing): rebuild PMREMGenerator env map, update `DirectionalLight` position to match new sun angles
- Remove the hardcoded `scene.background = new THREE.Color(0x1a1f2e)` and `scene.fog` from Phase 1 SceneManager — sky replaces background, fog color should be derived from sky

**Physics setup:**

- `npm install @dimforge/rapier3d-compat`
- `PhysicsWorld.ts`: init Rapier WASM, create world with gravity `(0, -9.81, 0)`, step in RAF loop after Three.js update
- `ColliderBuilder.ts`: utility that takes a Three.js mesh + type and registers a matching Rapier collider
  - Floor/platform → `ColliderDesc.cuboid(w/2, 0.01, d/2)` positioned at mesh world transform
  - Wall segment → `ColliderDesc.cuboid(len/2, h/2, t/2)` per collision segment (gaps at openings)
  - Stair step → `ColliderDesc.cuboid` per step
  - Terrain → `ColliderDesc.heightfield(resolution, resolution, heightData, scale)`
  - All static geometry → `RigidBodyDesc.fixed()`
- PhysicsWorld debug draw: optional wireframe overlay showing all colliders (toggle with `~` key in editor)
- Rapier world lives in `src/physics/PhysicsWorld.ts` — imported by builders, NOT by React components

**Floor Tool:**

- WorldState (floor mutations only)
- FloorBuilder: rect → PlaneGeometry + UV + `ColliderBuilder.registerFloor(mesh, floorDef)`
- AssetManager: texture loading, material cache, MATERIAL_REGISTRY
- FloorTool: click-drag state machine, preview rect, grid snap, Esc cancel
- ZoneManager: loadZone/unloadZone skeleton, floor rebuild on `floor:added` — old collider removed, new one registered
- PropertiesPanel: material picker for selected floor

**Collider lifecycle rule:** Every builder `build()` call returns collider handles alongside meshes. ZoneManager stores these. On rebuild or removal, ZoneManager calls `physicsWorld.removeCollider(handle)` before disposing the mesh.

### Phase 4 — Wall Tool

- WallBuilder: BoxGeometry, orientation, UV tiling, trim pieces, corner joining, `userData` tagging
- WallBuilder registers Rapier cuboid colliders per wall segment via `ColliderBuilder` (one per gap between openings — no collider where a door/window will be cut)
- WallTool: click-chain state machine, ghost wall, length label, angle snap (Shift)
- ZoneManager: wall rebuild on `wall:added`/`wall:updated`/`wall:removed` — removes old colliders, registers new ones
- PropertiesPanel: height, thickness, material → `object:updated` → ZoneManager rebuilds wall + re-registers colliders

### Phase 5 — Openings (Doors & Windows)

- CSG integration via `utils/csg.ts` (three-bvh-csg) — visual mesh only
- WallBuilder: CSG subtract openings from visual mesh; collision geometry is **separate** (no CSG on physics — split wall into segments around openings instead)
- "Add Opening" → `addOpening` → `wall:updated` → WallBuilder rebuilds visual + re-registers split collision segments
- Opening types: door, window, arch
- Door sensor volumes: Rapier `ColliderDesc.cuboid` with `setSensor(true)` — fires intersection events, doesn't block movement
- `TriggerSystem.ts`: polls Rapier intersection events each frame, emits `character:triggerdoor` on bus when character sensor overlaps door sensor
- TransitionTool skeleton: door openings show "Link zone..." option

### Phase 6 — Multi-Floor

- FloorLevelSelector fully functional (tabs G/1/2/3)
- ZoneManager: floor dimming (opacity 0.15 for non-active), clip plane for active floor
- PlatformTool + PlatformBuilder: slab + railings + `ColliderBuilder.registerPlatform()`
- StairTool + StairBuilder: straight style, per-step cuboid colliders registered via `ColliderBuilder`
- All new geometry assigned to active floor level, colliders positioned at correct world Y

### Phase 7 — Object Placement

- ObjectPlacer + GLTF loading via AssetManager
- Static prop objects get optional simplified Rapier colliders (box approximation from AABB) — toggled by a `collidable` flag in asset registry
- AssetBrowser: placeholder colored boxes as stand-in assets (real GLTFs in Phase 12)
- ObjectTool: place (Mode A), G/R/S transform (Mode B)
- TransformControls gizmo, `gizmo:dragging` suppresses camera
- On object move: collider position updated via `physicsWorld.setColliderTranslation(handle, newPos)`
- Objects stored in WorldState, selectable, editable in PropertiesPanel

### Phase 8 — Zones & Transitions

- ZoneTool: rect draw, naming dialog, zone list population
- ZonePanel UI fully functional
- ZoneManager: multi-zone load/unload — on unload, ALL colliders for that zone are removed from Rapier world
- TransitionTool: link door openings between zones
- TransitionManager: fade effect (CSS overlay + zone swap)
- Editor zone jump (camera teleport) on door click

### Phase 9 — Save / Load

- WorldSerializer: toJSON, download (colliders are not serialised — they are always rebuilt from geometry data on load)
- WorldLoader: JSON → WorldState → full mesh + collider rebuild
- SaveLoadPanel UI
- Auto-save to localStorage (60s interval), restore prompt on startup
- Encoding/decoding of Float32Array terrain data

### Phase 10 — Preview Mode (Character Controller)

The preview camera is for checking the space, not gameplay. The character controller is built on Rapier's `KinematicCharacterController` so it is immediately game-ready.

**`CharacterBody.ts`** — wraps Rapier KCC:

```ts
// Init
const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
this._body = world.createRigidBody(bodyDesc);
const colliderDesc = RAPIER.ColliderDesc.capsule(height / 2 - radius, radius);
this._collider = world.createCollider(colliderDesc, this._body);
this._kcc = world.createCharacterController(0.01); // 1cm offset
this._kcc.enableAutostep(0.5, 0.2, true); // max step height 0.5m
this._kcc.enableSnapToGround(0.3);
this._kcc.setSlideEnabled(true);

// Per frame
const corrected = this._kcc.computeColliderMovement(
  this._collider,
  desiredMovement,
);
const newPos = this._body.translation();
newPos.x += corrected.x;
newPos.y += corrected.y;
newPos.z += corrected.z;
this._body.setNextKinematicTranslation(newPos);
```

**`CharacterController.ts`** — input + camera, delegates to CharacterBody:

- Reads WASD + mouse look
- Computes `desiredMovement` vector (includes gravity accumulation)
- Passes to `CharacterBody.move(desiredMovement)`
- Reads corrected position back from `CharacterBody.position` and updates Three.js camera

**`TriggerSystem.ts`** — door detection:

- Each door opening has a Rapier sensor collider (registered in Phase 5)
- Each frame: `world.intersectionsWith(characterCollider, (other) => { ... })`
- When character sensor overlaps door sensor: emit `character:triggerdoor { transitionId }`

**`PreviewController.ts`**:

- `enter()`: pointer lock, spawn CharacterBody at editor camera focus, register update callback
- `exit()`: pointer lock release, remove CharacterBody from Rapier world, restore editor camera
- Camera modes (FPS / third-person) both read position from CharacterBody — configurable from `playerSettings`

**PreviewHUD**: crosshair, zone name toast, floor indicator, Esc hint

### Phase 11 — Terrain

- TerrainBuilder: heightmap → PlaneGeometry with `computeBoundsTree()` (BVH for editor raycasting)
- Terrain Rapier collider: `ColliderDesc.heightfield(res, res, heightData, { x: worldSize, y: maxHeight, z: worldSize })`
- Terrain sculpt tool: raise/lower brush, on stroke end rebuild both Three.js geometry AND Rapier heightfield collider
- Multi-layer material blending by height
- TerrainBuilder integrated into ZoneManager for outdoor zones
- Road tool: spline control points → flat corridor on terrain

### Phase 12 — Polish

- L-shape and spiral stair styles in StairBuilder (each with correct per-step colliders)
- Outline post-process selection highlight (EffectComposer + OutlinePass, replaces emissive tint)
- Wall exterior material (material array on BoxGeometry for inside/outside faces)
- Undo/redo stack (WorldState mutation log, last 50 operations — each undo removes/re-adds colliders correctly)
- Real GLTF prop assets in AssetBrowser with authored collision shapes in asset registry
- Skybox options
- Ambient/sun light controls in PropertiesPanel
- Export as self-contained HTML (bakes textures as base64 data URLs)

---

## Physics Architecture

### Two Tools, Two Jobs

| Tool                        | Used For                                                                                                       | Not Used For                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `three-mesh-bvh`            | Editor raycasting (selection, snapping, surface detection), terrain sculpt queries                             | Any runtime physics           |
| `@dimforge/rapier3d-compat` | All runtime: character movement, wall/floor collision, stair step-up, door sensors, future NPC/enemy colliders | Editor visual mesh generation |

These never replace each other. BVH makes the editor fast. Rapier makes the world physically correct at runtime.

### PhysicsWorld.ts

```ts
import RAPIER from "@dimforge/rapier3d-compat";

export class PhysicsWorld {
  private _world!: RAPIER.World;
  private _initialized = false;
  public debugDraw = false;

  async init(): Promise<void> {
    await RAPIER.init();
    this._world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this._initialized = true;
  }

  get world(): RAPIER.World {
    return this._world;
  }
  get initialized(): boolean {
    return this._initialized;
  }

  // Called by SceneManager RAF loop, after Three.js render
  step(dt: number): void {
    if (!this._initialized) return;
    this._world.timestep = Math.min(dt, 0.05); // cap at 50ms
    this._world.step();
  }

  createStaticCollider(desc: RAPIER.ColliderDesc): RAPIER.Collider {
    const body = this._world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    return this._world.createCollider(desc, body);
  }

  createSensorCollider(desc: RAPIER.ColliderDesc): RAPIER.Collider {
    desc.setSensor(true);
    const body = this._world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    return this._world.createCollider(desc, body);
  }

  removeCollider(collider: RAPIER.Collider): void {
    this._world.removeCollider(collider, true);
  }

  removeRigidBody(body: RAPIER.RigidBody): void {
    this._world.removeRigidBody(body);
  }

  dispose(): void {
    this._world.free();
  }
}

// Singleton — imported by builders and CharacterBody
export const physicsWorld = new PhysicsWorld();
```

### ColliderBuilder.ts

```ts
import RAPIER from "@dimforge/rapier3d-compat";
import { physicsWorld } from "./PhysicsWorld.ts";
import type {
  WallDef,
  FloorDef,
  PlatformDef,
  StairDef,
  Opening,
} from "../types.ts";

export class ColliderBuilder {
  // Floor slab — thin box at floor elevation
  static registerFloor(
    bounds: { x: number; z: number; width: number; depth: number },
    elevation: number,
  ): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(
      bounds.width / 2,
      0.05,
      bounds.depth / 2,
    ).setTranslation(
      bounds.x + bounds.width / 2,
      elevation - 0.05,
      bounds.z + bounds.depth / 2,
    );
    return physicsWorld.createStaticCollider(desc);
  }

  // Wall — split into segments around openings, one cuboid per solid segment
  // Returns one collider per segment (gaps at door/window positions have no collider)
  static registerWallSegments(
    wall: WallDef,
    elevation: number,
  ): RAPIER.Collider[] {
    const length = Math.hypot(
      wall.end.x - wall.start.x,
      wall.end.z - wall.start.z,
    );
    const angle = Math.atan2(
      wall.end.z - wall.start.z,
      wall.end.x - wall.start.x,
    );
    const midX = (wall.start.x + wall.end.x) / 2;
    const midZ = (wall.start.z + wall.end.z) / 2;

    // Build list of solid segments between openings
    const sorted: Opening[] = [...wall.openings].sort(
      (a, b) => a.offsetAlongWall - b.offsetAlongWall,
    );
    const segments: Array<{ start: number; end: number }> = [];
    let cursor = 0;
    for (const opening of sorted) {
      if (opening.offsetAlongWall > cursor)
        segments.push({ start: cursor, end: opening.offsetAlongWall });
      cursor = opening.offsetAlongWall + opening.width;
    }
    if (cursor < length) segments.push({ start: cursor, end: length });

    return segments.map((seg) => {
      const segLen = seg.end - seg.start;
      const segMid = seg.start + segLen / 2 - length / 2; // offset from wall center
      const wx = midX + Math.cos(angle) * segMid;
      const wz = midZ + Math.sin(angle) * segMid;
      const desc = RAPIER.ColliderDesc.cuboid(
        segLen / 2,
        wall.height / 2,
        wall.thickness / 2,
      )
        .setTranslation(wx, elevation + wall.height / 2, wz)
        .setRotation({
          x: 0,
          y: Math.sin(-angle / 2),
          z: 0,
          w: Math.cos(-angle / 2),
        });
      return physicsWorld.createStaticCollider(desc);
    });
  }

  // Platform slab
  static registerPlatform(platform: PlatformDef): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(
      platform.size.width / 2,
      platform.thickness / 2,
      platform.size.depth / 2,
    ).setTranslation(
      platform.position.x,
      platform.position.y + platform.thickness / 2,
      platform.position.z,
    );
    return physicsWorld.createStaticCollider(desc);
  }

  // Stairs — one cuboid per step
  static registerStairSteps(stair: StairDef): RAPIER.Collider[] {
    const heightDiff = stair.end.y - stair.start.y;
    const horizDist = Math.hypot(
      stair.end.x - stair.start.x,
      stair.end.z - stair.start.z,
    );
    const angle = Math.atan2(
      stair.end.z - stair.start.z,
      stair.end.x - stair.start.x,
    );
    const stepHeight = 0.2;
    const numSteps = Math.max(1, Math.round(heightDiff / stepHeight));
    const stepDepth = horizDist / numSteps;
    const colliders: RAPIER.Collider[] = [];

    for (let i = 0; i < numSteps; i++) {
      const t = (i + 0.5) / numSteps;
      const desc = RAPIER.ColliderDesc.cuboid(
        stair.width / 2,
        stepHeight / 2,
        stepDepth / 2,
      )
        .setTranslation(
          stair.start.x + (stair.end.x - stair.start.x) * t,
          stair.start.y + (i + 0.5) * stepHeight,
          stair.start.z + (stair.end.z - stair.start.z) * t,
        )
        .setRotation({
          x: 0,
          y: Math.sin(-angle / 2),
          z: 0,
          w: Math.cos(-angle / 2),
        });
      colliders.push(physicsWorld.createStaticCollider(desc));
    }
    return colliders;
  }

  // Door sensor — for transition detection
  static registerDoorSensor(
    wall: WallDef,
    opening: Opening,
    elevation: number,
  ): RAPIER.Collider {
    const angle = Math.atan2(
      wall.end.z - wall.start.z,
      wall.end.x - wall.start.x,
    );
    const length = Math.hypot(
      wall.end.x - wall.start.x,
      wall.end.z - wall.start.z,
    );
    const offset = opening.offsetAlongWall - length / 2;
    const desc = RAPIER.ColliderDesc.cuboid(
      (opening.width - 0.1) / 2,
      opening.height / 2,
      0.4,
    )
      .setTranslation(
        wall.start.x +
          Math.cos(angle) * (opening.offsetAlongWall + opening.width / 2),
        elevation + opening.elevation + opening.height / 2,
        wall.start.z +
          Math.sin(angle) * (opening.offsetAlongWall + opening.width / 2),
      )
      .setRotation({
        x: 0,
        y: Math.sin(-angle / 2),
        z: 0,
        w: Math.cos(-angle / 2),
      });
    return physicsWorld.createSensorCollider(desc);
  }

  // Terrain heightfield
  static registerTerrain(
    heightData: Float32Array,
    resolution: number,
    worldSize: number,
    maxHeight: number,
  ): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.heightfield(
      resolution - 1,
      resolution - 1,
      heightData,
      {
        x: worldSize,
        y: maxHeight,
        z: worldSize,
      },
    ).setTranslation(0, 0, 0);
    return physicsWorld.createStaticCollider(desc);
  }
}
```

### Collider Handle Storage in ZoneManager

ZoneManager stores collider references per zone so they can be cleaned up correctly:

```ts
interface ZoneColliders {
  floors: RAPIER.Collider[];
  walls: RAPIER.Collider[][]; // per wall: array of segment colliders
  platforms: RAPIER.Collider[];
  stairs: RAPIER.Collider[][]; // per stair: array of step colliders
  sensors: RAPIER.Collider[]; // door sensors
  terrain: RAPIER.Collider | null;
}

// On unloadZone:
for (const c of colliders.floors) physicsWorld.removeCollider(c);
for (const segs of colliders.walls)
  segs.forEach((c) => physicsWorld.removeCollider(c));
for (const c of colliders.platforms) physicsWorld.removeCollider(c);
for (const steps of colliders.stairs)
  steps.forEach((c) => physicsWorld.removeCollider(c));
for (const c of colliders.sensors) physicsWorld.removeCollider(c);
if (colliders.terrain) physicsWorld.removeCollider(colliders.terrain);
```

### CharacterBody.ts

```ts
import RAPIER from "@dimforge/rapier3d-compat";
import { physicsWorld } from "./PhysicsWorld.ts";
import * as THREE from "three";

export class CharacterBody {
  private _body!: RAPIER.RigidBody;
  private _collider!: RAPIER.Collider;
  private _kcc!: RAPIER.KinematicCharacterController;

  readonly capsuleRadius = 0.3;
  readonly capsuleHalfHeight = 0.6; // half of the cylinder part (total height ~1.5m + 2*radius)

  init(spawnPosition: THREE.Vector3): void {
    const bodyDesc =
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        spawnPosition.x,
        spawnPosition.y,
        spawnPosition.z,
      );
    this._body = physicsWorld.world.createRigidBody(bodyDesc);

    const collDesc = RAPIER.ColliderDesc.capsule(
      this.capsuleHalfHeight,
      this.capsuleRadius,
    );
    this._collider = physicsWorld.world.createCollider(collDesc, this._body);

    this._kcc = physicsWorld.world.createCharacterController(0.01);
    this._kcc.enableAutostep(0.5, 0.2, true); // step up to 0.5m, min width 0.2m
    this._kcc.enableSnapToGround(0.3); // snap down to ground within 0.3m
    this._kcc.setSlideEnabled(true);
    this._kcc.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    this._kcc.setMinSlopeSlideAngle((30 * Math.PI) / 180);
  }

  // Call each frame with the desired movement vector (gravity already included)
  move(desired: THREE.Vector3): void {
    this._kcc.computeColliderMovement(this._collider, {
      x: desired.x,
      y: desired.y,
      z: desired.z,
    });
    const mv = this._kcc.computedMovement();
    const pos = this._body.translation();
    this._body.setNextKinematicTranslation({
      x: pos.x + mv.x,
      y: pos.y + mv.y,
      z: pos.z + mv.z,
    });
  }

  get position(): THREE.Vector3 {
    const t = this._body.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  get isGrounded(): boolean {
    return this._kcc.computedGrounded();
  }

  dispose(): void {
    physicsWorld.world.removeCharacterController(this._kcc);
    physicsWorld.removeCollider(this._collider);
    physicsWorld.removeRigidBody(this._body);
  }
}
```

### TriggerSystem.ts

```ts
import RAPIER from "@dimforge/rapier3d-compat";
import { physicsWorld } from "./PhysicsWorld.ts";
import type { EventBus } from "../core/EventBus.ts";

export class TriggerSystem {
  private _characterCollider: RAPIER.Collider | null = null;
  // Map from Rapier collider handle → transition id
  private _sensorMap = new Map<number, string>();

  constructor(private readonly _bus: EventBus) {}

  setCharacterCollider(collider: RAPIER.Collider): void {
    this._characterCollider = collider;
  }

  registerSensor(collider: RAPIER.Collider, transitionId: string): void {
    this._sensorMap.set(collider.handle, transitionId);
  }

  unregisterSensor(collider: RAPIER.Collider): void {
    this._sensorMap.delete(collider.handle);
  }

  update(_dt: number): void {
    if (!this._characterCollider) return;
    physicsWorld.world.intersectionsWith(this._characterCollider, (other) => {
      const transitionId = this._sensorMap.get(other.handle);
      if (transitionId) {
        this._bus.emit("character:triggerdoor", { transitionId });
      }
    });
  }

  dispose(): void {
    this._sensorMap.clear();
  }
}
```

---

## Future: Characters, NPCs & Enemies

The physics foundation built in Phase 3–10 directly supports this. No rework needed.

### Playable Character (Phase 13+)

The preview `CharacterBody` + `CharacterController` become the base for the playable character. Additional layers:

```ts
interface CharacterDef {
  id: string;
  name: string;
  modelAssetId: string; // GLTF
  capsuleRadius: number;
  capsuleHeight: number;
  moveSpeed: number;
  jumpHeight: number;
  cameraMode: CameraMode;
  thirdPersonOffset: Vec3;
  // Game stats (Phase 13+)
  health?: number;
  maxHealth?: number;
  faction?: string;
}
```

- `CharacterDef` stored per zone in `WorldState` (placed by character spawn tool in editor)
- At runtime, spawns a `CharacterBody` + loads GLTF model + attaches animation mixer
- Camera controller reads from `CharacterBody.position` same as preview mode

### NPCs (Phase 14+)

Each NPC is a `CharacterBody` (Rapier KCC) driven by an AI controller instead of input:

```ts
interface NpcDef {
  id: string;
  name: string;
  modelAssetId: string;
  spawnPosition: Vec3;
  faction: string;
  behaviour: "idle" | "patrol" | "follow" | "guard";
  patrolPath?: Vec3[];
  dialogueId?: string;
  lootTableId?: string;
}
```

- `NpcController.ts` implements `IEditorModule` — replaces input with behaviour tree / simple state machine
- Pathfinding: Recast/Detour navmesh (built from walkable floor colliders) or simple waypoint following along `patrolPath`
- NPCs placed in editor via Object tool with NPC-type asset, stored in `zone.objects` with `properties.npcSpawn = true`

### Enemies (Phase 15+)

Same `CharacterBody` base, different controller:

```ts
interface EnemyDef extends NpcDef {
  attackRange: number;
  detectionRange: number;
  damage: number;
  attackCooldown: number;
}
```

- `EnemyController.ts`: perception (sphere cast for player detection), chase, attack state machine
- Combat uses Rapier raycasts for hit detection (not mesh raycasting — consistent with physics world)
- Faction system: enemies hostile to player faction, neutral to own faction

### Editor Support for Characters/NPCs/Enemies

These are added as editor tools in Phase 13:

- **Spawn Point Tool**: place a character spawn marker in a zone (`zone.objects` with `properties.characterSpawn = true`)
- **NPC Tool**: place NPC with behaviour config in PropertiesPanel
- **Enemy Tool**: place enemy with combat config
- **Nav Mesh Viewer**: toggle overlay showing walkable navmesh surface (built from Rapier floor colliders)

All definitions stored in `SceneFile` JSON and loaded by the game runtime, not just the editor.

---

## Setup Instructions for Claude Code

```bash
# 1. Scaffold with TypeScript React template
npm create vite@latest world-editor -- --template react-ts
cd world-editor

# 2. Three.js + utilities
npm install three three-mesh-bvh three-bvh-csg

# 3. Rapier physics (WASM)
npm install @dimforge/rapier3d-compat

# 4. Types + checker
npm install -D @types/three typescript vite-plugin-checker

# 5. Run
npm run dev
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src"]
}
```

### vite.config.ts

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";

export default defineConfig({
  plugins: [react(), checker({ typescript: true })],
});
```

### Prompt template for Claude Code

> "Read `WORLD_EDITOR_ARCHITECTURE.md` in the project root. Implement **Phase [N] — [Name]** exactly as specified. Rules:
>
> - **TypeScript only.** Every file is `.ts` or `.tsx`. No `.js` or `.jsx`. `strict: true`. No `any` — use `unknown` and narrow with type guards.
> - All shared types come from `src/types.ts`. Never redefine types locally if they already exist there.
> - `three` is only imported in `src/core/`, `src/world/`, `src/builders/`, `src/editor/`, `src/preview/`
> - React components in `src/ui/` never import from `three` — they communicate via EventBus only
> - Every engine module implements `IEditorModule`: `init()`, `update(dt: number): void`, `dispose(): void`
> - SceneManager owns the RAF loop — modules register via `sceneManager.onUpdate(cb: UpdateCallback)`
> - All `mesh.userData` must be typed as `MeshUserData` (from `src/types.ts`) via `mesh.userData as MeshUserData`
> - Materials are only created via `AssetManager.getMaterial()`, never inline
> - All world coordinates are in meters, grid unit 0.5m
> - Use `const` over `let` everywhere possible. Prefer `readonly` on class properties that don't change after construction.
> - **Physics:** `three-mesh-bvh` is for editor raycasting only. All runtime collision uses Rapier via `PhysicsWorld` singleton. Every builder that creates geometry must also register Rapier colliders via `ColliderBuilder` and return their handles. ZoneManager is responsible for removing colliders on unload.
> - Never create Rapier objects outside of `src/physics/`. Never import `@dimforge/rapier3d-compat` directly in builders — use `ColliderBuilder` methods."
