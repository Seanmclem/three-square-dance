# 3D World Editor — Full Project Architecture
> Vite + React + TypeScript + Three.js (no R3F) — physics via Rapier3D

**Version 3.5.0** — last updated 2026-06-11
- v1.0 — Initial architecture, Phases 1–12
- v1.1 — TypeScript conversion, full type system, tsconfig
- v1.2 — Rapier physics integrated Phase 3+, sky system, character architecture
- v1.3 — Phase 4.5 material system, Phase 4.6 wall graph, ambientCG naming convention
- v1.4 — Dynamic asset manifest, Phase 7 model importer, Phase 9 persistence split, Phase 10.5 scripting/event system
- v1.5 — Default spawn system, Preview vs Start Game, SpawnPointTool, item/dialogue/quest/audio stubs in Phase 12
- v1.6 — Phase 6 fully specced: dynamic floor tabs, floor creation flow, derived elevation, PropertiesPanel floor view, ceiling toggle, no deletion
- v1.7 — Phase 4.7 merged corner geometry, Phase 4.8 complete wall interaction model (chain, loop close, node dragging)
- v1.8 — Phase 4.9 floor system: multi-floor bug fix, Z-fighting offset, auto-floor from loop, polygon floor tool, vertex editing
- v1.9 — Phase 6.1 transform gizmos: GizmoManager, resize handles, platform Y handle, wall segment move
- v2.0 — Phase 6.2 scene save/load, Phase 9 full persistence (game save, auto-save, preferences, startup flow), all object types covered
- v2.1 — **Sync to actual implementation:** wall node graph (startNodeId/endNodeId), wall runs/buildRun(), Rapier colliders replacing mesh colliders, polygon platforms, stair CSG cutter, per-material overrides, updated all builder signatures, ZoneManager internal patterns
- v2.1.1 — Restored orphaned Phase 7 header and content (was floating inside Phase 6.3)
- v2.2 — Phase 6.5 properties panel navigation redesign: drilldown stack, fixed header, per-type screen mapping
- v2.3 — Phase 6.5 refined: Actions as expanded-by-default accordion on root, Quality moved to Material screen, no Actions drilldown screen
- v2.2 — Phase 6.3 wall-run gizmo extensions + multi-floor wall elevation system
- v2.3 — Phase 6.4 delete support (Delete key + panel button) + copy-to-floor opening strip
- v2.4 — Phase 6.6 input UX & floor fixes: EditorCamera focus guard, universal live debounce hook, floor gizmo centroid, floor elevation default, wall-run stale rebuild fix
- v2.5 — Phase 6.7 snapshot-based undo/redo: HistoryManager, `history:restore` event, Cmd+Z/Cmd+Y shortcuts, toolbar buttons, all placement tools and App.tsx mutation handlers wrapped
- v2.6 — Phase 7 redesigned: LeftPanel generic slot system, AssetBrowser in left panel, Model Importer modal, manifest system, object placement wired to GizmoManager
- v2.7 — Phase 8 fully specced: zones vs floors guidance, stair zone links, ZonePanel always browse-only, transition linking in PropertiesPanel only, HelpTooltip component
- v2.9 — Phase 10 & 10.5 rewritten into uploaded doc: character model option, capsule-only mode, interact system, trigger volume editor, Script Panel full spec, all action implementations
- v3.0 — Phase 10.6 added: EntityRegistry, index-based ScriptEngine, ActionDispatcher, animation clip discovery, per-entity Scripts tab in PropertiesPanel
- v3.1 — Phase 10.7 added: Animations tab in PropertiesPanel, editor-mode clip preview, auto-play animation on placed objects, WorldObject.autoPlayAnimation field
- v3.2 — Phase 12 updated: Brush primitive stub with local-space architecture requirement and world-space anti-pattern warning
- v3.3 — Phase 10.8 added: world-space UV generation, UVUtils.ts, consistent texture density across all builders, uvVersion migration
- v3.4 — Three-level script architecture: object scripts on WorldObject, zone scripts on ZoneDef, world scripts on WorldConfig. ScriptEngine manages all three independently. Script Panel has World/Zone/Object tabs.
- v3.5 — **Phase 10.5 implemented:** ScriptEngine, GameStateManager, TriggerVolumeTool, ScriptPanel, DialogueOverlay, TriggerSystem volume sensors, ZoneManager volume wireframes + colliders, ColliderBuilder.registerVolumeSensor(), WorldState triggerVolume mutations, App.tsx fully wired.
- v2.8 — **Sync to actual implementation (Phases 6.8 + 8):** LevelStepper in PropertiesPanel (wall/platform/object/floor); AssetCategory widened to allow custom strings; OpeningDragHandler adds opening moves to undo history; SelectionManager clears selected on object:deselected (gizmo reattach fix); Phase 8 implemented: ZoneTool, ZonePanel, ZoneNamingDialog, HelpTooltip, zone:enter wired in ZoneManager, door opening zone-link picker in PropertiesPanel

---

## Vision

A browser-based 3D world editor for building explorable 3D spaces. The user constructs outdoor terrain, streets, and buildings with a floating editor camera, then enters buildings through zone transitions to place interior walls, floors, platforms, stairs, and props. The world is saved as a JSON scene file and can be previewed with a configurable first-person or third-person camera.

The world is designed from day one to support a full game runtime: playable characters, NPCs, and enemies. This means every wall, floor, platform, and stair built in the editor generates a proper Rapier physics collider alongside its visual mesh — not a raycast approximation added later. The physics world is always live and game-ready.

**Two tools, two jobs:**
- `three-mesh-bvh` — editor only: fast raycasting for object selection, tool snapping, and surface placement
- `@dimforge/rapier3d-compat` — runtime: rigid body physics, character capsule controller, NPC/enemy colliders

---

## Tech Stack

| Layer | Library | Notes |
|---|---|---|
| Language | TypeScript 5 | Strict mode, all files `.ts` / `.tsx` |
| Build | Vite + vite-plugin-checker | Fast HMR, TS type-checking in dev |
| UI Shell | React 18 + @types/react | UI panels only — no Three.js inside React |
| 3D Renderer | Three.js + @types/three | Initialized outside React in plain TS classes |
| CSG (wall openings) | three-bvh-csg | Boolean mesh operations for doors/windows |
| BVH Raycasting | three-mesh-bvh | Fast collision/selection raycasting |
| Physics (Phase 3+) | @dimforge/rapier3d-compat | WASM — static colliders built with every mesh |
| Persistence | JSON | Save/load scene files |

**Critical rule:** React never touches Three.js objects. Three.js never touches React state. They communicate only through an `EventBus` (custom event emitter). No exceptions.

---

## TypeScript Types & Interfaces

All shared types live in `src/types.ts` and are imported across every module. Never use `any`. Use `unknown` for truly dynamic payloads and narrow with type guards.

```ts
// src/types.ts

// ─── Primitive helpers ────────────────────────────────────────────────────────

export type ToolId = "select" | "floor" | "poly-floor" | "wall" | "platform" | "poly-platform" | "stair" | "object" | "zone";
export type ZoneType = "outdoor" | "indoor" | "dungeon";
export type OpeningType = "door" | "window" | "arch" | "passage";
export type StairStyle = "straight" | "l-shape" | "spiral";
export type CameraMode = "fps" | "thirdperson";
export type EditorObjectType = "wall" | "floor" | "platform" | "stair" | "object" | "terrain" | "trigger" | "trim" | "opening";
export type TransitionEffect = "fade" | "none";

// ─── Vec / transform ─────────────────────────────────────────────────────────

export interface Vec2 { x: number; z: number }
export interface Vec3 { x: number; y: number; z: number }
export interface Euler3 { x: number; y: number; z: number }   // degrees
export interface Scale3 { x: number; y: number; z: number }
export interface Bounds { x: number; z: number; width: number; depth: number }

// ─── EventBus typed map ───────────────────────────────────────────────────────

export interface BusEvents {
  "tool:select":           { tool: ToolId };
  "floor:select":          { level: number };
  "object:selected":       SelectedObjectPayload;
  "object:deselected":     Record<string, never>;
  "object:updated":        { id: string; zoneId: string; changes: Partial<WorldObject> };
  "asset:selected":        { assetId: string };
  "asset:dropped":         { assetId: string; screenPos: { x: number; y: number } };
  "wall:added":            { zoneId: string; wall: WallDef };
  "wall:updated":          { zoneId: string; wallId: string; changes: Partial<WallDef>; segmentOnly?: boolean };
  "wall:removed":          { zoneId: string; wallId: string };
  "wall:rebuilt":          { zoneId: string; wallId: string };
  "node:updated":          { zoneId: string; nodeId: string; pos: { x: number; z: number } };
  "floor:added":           { zoneId: string; floor: FloorDef };
  "floor:updated":         { zoneId: string; floorId: string; changes: Partial<FloorDef> };
  "floortool:suggest-auto-floor": { zoneId: string; level: number; points: Vec2[]; nodeIds: string[] };
  "platform:added":        { zoneId: string; platform: PlatformDef };
  "platform:updated":      { zoneId: string; id: string; changes: Partial<PlatformDef> };
  "platform:removed":      { zoneId: string; id: string };
  "tool:placed":           { type: EditorObjectType; id: string; zoneId: string };
  "stair:added":           { zoneId: string; stair: StairDef };
  "stair:updated":         { zoneId: string; id: string; changes: Partial<StairDef> };
  "stair:removed":         { zoneId: string; id: string };
  "stair:rebuilt":         { zoneId: string; stairId: string };
  "object:added":          { zoneId: string; object: WorldObject };
  "object:removed":        { zoneId: string; id: string };
  "zone:added":            { zone: ZoneDef };
  "zone:activated":        { zoneId: string };
  "zone:enter":            { zoneId: string };
  "transition:added":      { transition: TransitionDef };
  "preview:start":         Record<string, never>;
  "preview:stop":          Record<string, never>;
  "preview:zone-entered":  { zoneName: string };
  "gizmo:dragging":        { isDragging: boolean };
  "camera:jump":           { x: number; z: number };
  "camera:topdown":        Record<string, never>;
  "character:teleport":    { position: Vec3; facing: number };
  "character:triggerdoor": { transitionId: string };
  "overlay:fade-in":       { color: string; duration: number };
  "overlay:fade-out":      { duration: number };
  "scene:save":            Record<string, never>;
  "scene:load":            { json: unknown };
  "scene:saved":           { json: SceneFile };
  "scene:loaded":          { metadata: SceneMetadata };
  "world:loaded":          { metadata: SceneMetadata };
  "materials:loaded":      { materials: MaterialDef[] };
  "quality:changed":       { quality: QualityScale };
  "terrain:sculpt":        { x: number; z: number; radius: number; delta: number };
  "input:click":           { screenPos: ScreenPos; worldPos: Vec3; button: number };
  "input:dblclick":        { screenPos: ScreenPos; worldPos: Vec3 };
  "input:mousemove":       { screenPos: ScreenPos; worldPos: Vec3; delta: ScreenPos };
  "input:mousedown":       { button: number; screenPos: ScreenPos };
  "input:mouseup":         { button: number; screenPos: ScreenPos };
  "input:wheel":           { delta: number };
  "input:keydown":         { code: string; key: string; shift: boolean; ctrl: boolean; alt: boolean };
  "input:keyup":           { code: string };
  "assets:loaded":    { assets: AssetDef[] };        // implemented Phase 7
  "leftpanel:open":   { panelId: LeftPanelId };
  "leftpanel:close":  Record<string, never>;
  // ⏳ Phase 8: "script:trigger": { triggerId: string; context: ScriptContext };
  // ⏳ Phase 8: "flag:set": { flag: string; value: boolean };
  // ⏳ Phase 9: "spawn:set": { spawn: SpawnPoint };
}

export type BusEventName = keyof BusEvents;
export type BusCallback<K extends BusEventName> = (payload: BusEvents[K]) => void;

// ─── Selection ────────────────────────────────────────────────────────────────

export interface SelectedObjectPayload {
  id: string;
  type: EditorObjectType;
  zoneId: string;
  parentId?: string;   // wallId when type === "opening"
  position: Vec3;
  rotation: Euler3;
  scale: Scale3;
  data: WallDef | FloorDef | PlatformDef | StairDef | WorldObject | Opening | null;
  runWalls?: WallDef[]; // populated for multi-wall runs; undefined for single-wall selections
}

// ─── userData on Three.js meshes ─────────────────────────────────────────────

export interface MeshUserData {
  editorId:                string;
  editorType:              EditorObjectType;
  zoneId:                  string;
  selectable:              boolean;
  floorLevel:              number;
  _ownsMaterial:           boolean;
  _origEmissive?:          number;
  _origEmissiveIntensity?: number;
  _hoverEmissive?:         number;
  _parentId?:              string;
  triggerType?:            "door";
  transitionId?:           string;
  openingId?:              string;
  wallId?:                 string;
  assetId?:                string;
  editorOnly?:             boolean;  // hidden in preview mode (e.g. CSG cutter wireframes)
}

// ─── Scene file data model ────────────────────────────────────────────────────

export interface SceneMetadata {
  name:         string;
  version:      string;
  author:       string;
  created:      string;
  lastModified: string;
  uvVersion?:   number;   // 1 = world-space UVs (Phase 10.8+), absent = legacy tileScale behaviour
}

export interface PlayerSettings {
  cameraMode:           CameraMode;
  moveSpeed:            number;
  jumpHeight:           number;
  fov:                  number;
  thirdPersonDistance:  number;
  thirdPersonHeight:    number;
}

// ⏳ Phase 7 — not yet implemented
export interface SkyConfig {
  turbidity:        number;
  rayleigh:         number;
  mieCoefficient:   number;
  mieDirectionalG:  number;
  sunElevation:     number;
  sunAzimuth:       number;
}

// ⏳ Phase 9 — not yet implemented
export interface SpawnPoint {
  position:  Vec3;
  zoneId:    string;
  facing:    number;
}

export interface WorldConfig {
  size:           { width: number; depth: number };
  ambientLight:   { color: string; intensity: number };
  sunLight:       { color: string; intensity: number; position: Vec3 };
  skybox:         string;        // sky material id — sky: SkyConfig planned ⏳ Phase 7
  fogColor:       string;
  fogDensity:     number;
  playerSettings: PlayerSettings;
  // defaultSpawn: SpawnPoint — ⏳ Phase 9
}

export interface TerrainLayerMaterial {
  id:        string;
  texture:   string;
  tileScale: number;
  minHeight: number;
  maxHeight: number;
}

export interface TerrainDef {
  resolution:      number;
  heightData:      Float32Array | string;   // Float32Array in memory, base64 string on disk
  maxHeight:       number;
  layerMaterials:  TerrainLayerMaterial[];
}

export interface FloorMeshDef {
  shape:    "rect" | "polygon";
  points:   Vec2[] | null;
  nodeIds?: string[];  // if set, points are derived from these wall nodes at build time
  material: string;
}

export interface FloorDef {
  id:                string;
  level:             number;
  elevation:         number;
  ceilingHeight:     number | null;
  floorMesh:         FloorMeshDef;
  materialOverrides?: MaterialOverrides;
}

export interface Opening {
  id:                 string;
  type:               OpeningType;
  offsetAlongWall:    number;
  width:              number;
  height:             number;
  elevation:          number;
  trim?:              boolean;   // default true — false hides the jamb/header/sill
  innerTileH?:        number;    // tiling scale for top + bottom inner faces (sill/lintel)
  innerTileV?:        number;    // tiling scale for left + right inner faces (jambs)
  linkedZoneId:       string | null;
  linkedTransitionId: string | null;
}

export interface WallNode {
  id: string;
  x:  number;
  z:  number;
}

// WallDef references nodes by ID — coordinates come from ZoneDef.nodes at build time
export interface WallDef {
  id:                 string;
  startNodeId:        string;   // was start:{x,z} in early spec — now uses node graph
  endNodeId:          string;
  floor:              number;
  height:             number;
  thickness:          number;
  material:           string;
  exteriorMaterial:   string;
  openings:           Opening[];
  materialOverrides?: MaterialOverrides;
}

export interface PlatformDef {
  id:             string;
  position:       Vec3;
  size:           { width: number; depth: number };
  thickness:      number;
  material:       string;
  hasRailing:     boolean;
  railingHeight:  number;
  floorLevel?:    number;
  points?:        Vec2[];   // polygon platform — if set, size is ignored
  nodeIds?:       string[];
  materialOverrides?:     MaterialOverrides;
  sideMaterial?:          string;
  sideMaterialOverrides?: MaterialOverrides;
}

export interface StairCutterDef {
  offset:      Vec3;    // relative to stair.end
  width:       number;
  depth:       number;
  height:      number;
  rotation?:   Vec3;    // degrees (X/Y/Z); Y defaults to stair angle on enable
  innerTileH?: number;
  innerTileV?: number;
}

export interface StairOpening {
  linkedZoneId:        string | null;
  linkedTransitionId:  string | null;
}

export interface StairDef {
  id:          string;
  start:       Vec3;
  end:         Vec3;
  width:       number;
  numSteps?:   number;
  style:       StairStyle;
  material:    string;
  hasRailing:  boolean;
  materialOverrides?:      MaterialOverrides;
  riserMaterial?:          string;
  riserMaterialOverrides?: MaterialOverrides;
  csgCutter?:              StairCutterDef;  // defines a hole cut in the floor/platform above
  topOpening?:             StairOpening;    // optional zone link at top of stair
  bottomOpening?:          StairOpening;    // optional zone link at bottom of stair
}

export interface ObjectProperties {
  interactable:   boolean;
  npcSpawn:       boolean;
  lootTableId:    string | null;
  triggerEventId: string | null;
}

export interface WorldObject {
  id:                  string;
  assetId:             string;
  position:            Vec3;
  rotation:            Euler3;
  scale:               Scale3;
  floor:               number;
  zoneId?:             string;
  properties:          ObjectProperties;
  autoPlayAnimation?:  string | null;    // clip name to loop on load, null = none
  scripts:             ScriptDef[];      // scripts that belong to this object — loaded/unloaded with it
}

export interface ZoneDef {
  id:        string;
  name:      string;
  type:      ZoneType;
  bounds:    Bounds;
  nodes:     WallNode[];   // wall node graph — walls reference these by ID
  floors:    FloorDef[];
  walls:     WallDef[];
  platforms: PlatformDef[];
  stairs:    StairDef[];
  objects:   WorldObject[];
  // scripts: ScriptDef[]        — ⏳ Phase 8
  // triggerVolumes: TriggerVolume[] — ⏳ Phase 8
}

export interface TransitionDef {
  id:               string;
  fromZone:         string;
  toZone:           string;
  triggerType:      "door" | "volume" | "loading-zone";
  triggerOpeningId: string;
  effect:           TransitionEffect;
  fadeColor:        string;
  fadeDuration:     number;
  spawnPoint:       Vec3 & { facing: number };
}

export interface SceneFile {
  metadata:    SceneMetadata;
  world:       WorldConfig;
  terrain:     TerrainDef | null;
  zones:       ZoneDef[];
  transitions: TransitionDef[];
}

// ─── Physics ─────────────────────────────────────────────────────────────────

// Stored by ZoneManager alongside mesh groups — used to clean up Rapier on zone unload
export interface ZoneColliders {
  floors:    import("@dimforge/rapier3d-compat").Collider[];
  walls:     import("@dimforge/rapier3d-compat").Collider[][];   // per wall: segment colliders
  platforms: import("@dimforge/rapier3d-compat").Collider[];
  stairs:    import("@dimforge/rapier3d-compat").Collider[][];   // per stair: step colliders
  sensors:   import("@dimforge/rapier3d-compat").Collider[];     // door sensors
  terrain:   import("@dimforge/rapier3d-compat").Collider | null;
}

// ─── Characters, NPCs, Enemies ─────────────────── ⏳ Phase 10 ──────────────

export interface CharacterDef {
  id:                 string;
  name:               string;
  modelAssetId:       string;
  capsuleRadius:      number;
  capsuleHeight:      number;
  moveSpeed:          number;
  jumpHeight:         number;
  cameraMode:         CameraMode;
  thirdPersonOffset:  Vec3;
  health?:            number;
  maxHealth?:         number;
  faction?:           string;
}

export type NpcBehaviour = "idle" | "patrol" | "follow" | "guard";

export interface NpcDef {
  id:            string;
  name:          string;
  modelAssetId:  string;
  spawnPosition: Vec3;
  faction:       string;
  behaviour:     NpcBehaviour;
  patrolPath?:   Vec3[];
  dialogueId?:   string | null;
  lootTableId?:  string | null;
}

export interface EnemyDef extends NpcDef {
  attackRange:     number;
  detectionRange:  number;
  damage:          number;
  attackCooldown:  number;
}

// ─── Material system ─────────────────────────────────────────────────────────

export type QualityScale = 'low' | 'medium' | 'high';

export interface QualitySettings {
  textureScale:    QualityScale;
  shadowMapSize:   512 | 1024 | 2048;
  shadowsEnabled:  boolean;
  fogEnabled:      boolean;
  antialias:       boolean;
}

export interface MaterialMapConfig {
  enabled: boolean;
  path:    string;
}

export interface MaterialDef {
  id:                string;
  label:             string;
  tileScale:         number;
  roughnessVal:      number;
  metalnessVal:      number;
  displacementScale: number;
  maps: {
    albedo:       MaterialMapConfig;
    normal:       MaterialMapConfig;
    roughness:    MaterialMapConfig;
    metalness:    MaterialMapConfig;
    ao:           MaterialMapConfig;
    displacement: MaterialMapConfig;
  };
}

export interface MaterialOverrides {
  maps?:              Partial<Record<keyof MaterialDef['maps'], { enabled: boolean }>>;
  tileScale?:         number;
  tileScaleX?:        number;   // per-axis override (overrides tileScale)
  tileScaleY?:        number;
  offsetX?:           number;   // UV offset U axis (0.0–1.0, wraps) — shifts all maps together
  offsetY?:           number;   // UV offset V axis (0.0–1.0, wraps) — shifts all maps together
  roughnessVal?:      number;
  displacementScale?: number;
}

// ─── Asset registry ────────────────────────────────── ⏳ Phase 7 ───────────

export type ColliderType = 'box' | 'mesh' | 'none';
export type AssetCategory = 'Furniture' | 'Props' | 'Structures' | 'Lights' | 'Characters' | 'Vegetation' | 'Other';

export interface AssetDef {
  id:            string;
  label:         string;
  category:      AssetCategory;
  path:          string;                  // /assets/models/<id>.glb
  thumbnail?:    string;                  // /assets/models/thumbnails/<id>.png — auto-generated on import
  collidable:    boolean;
  colliderType:  ColliderType;
  tags:          string[];
  dateAdded:     string;                  // ISO timestamp
}

export interface AssetManifest {
  version:  string;
  assets:   AssetDef[];
}

// ─── Scripting / Event system ──────────────────────── ⏳ Phase 8 ───────────

export type TriggerType =
  | 'on_player_enter'   // player enters a trigger volume
  | 'on_player_exit'    // player leaves a trigger volume
  | 'on_interact'       // player presses interact key near object
  | 'on_timer'          // fires after N seconds
  | 'on_health_zero'    // NPC/enemy dies
  | 'on_flag_set'       // a game flag was set
  | 'on_flag_cleared'   // a game flag was cleared
  | 'on_zone_enter'     // player enters a zone
  | 'on_game_start';    // fires once on scene load

export type ConditionType =
  | 'flag_set'
  | 'flag_not_set'
  | 'player_has_item'
  | 'player_health_above'
  | 'player_health_below'
  | 'npc_alive'
  | 'npc_dead';

export type ActionType =
  | 'play_sound'
  | 'show_dialogue'
  | 'move_object'
  | 'play_animation'
  | 'spawn_npc'
  | 'despawn_object'
  | 'change_material'
  | 'open_door'
  | 'close_door'
  | 'set_flag'
  | 'clear_flag'
  | 'fire_event'
  | 'fade_screen'
  | 'teleport_player'
  | 'show_ui'
  | 'give_item'
  | 'run_script';        // JavaScript escape hatch

export interface ScriptTrigger {
  type:       TriggerType;
  targetId?:  string;        // object/zone/volume ID the trigger watches
  delay?:     number;        // seconds delay before firing (optional)
  repeat?:    boolean;       // for on_timer: repeat or one-shot
  interval?:  number;        // for on_timer: seconds between fires
}

export interface ScriptCondition {
  type:    ConditionType;
  flag?:   string;
  itemId?: string;
  value?:  number;
  npcId?:  string;
}

export interface ScriptAction {
  type:         ActionType;
  targetId?:    string;       // object to act on
  animation?:   string;       // animation clip name
  sound?:       string;       // sound asset id
  dialogue?:    DialogueDef;
  material?:    string;       // material id for change_material
  position?:    Vec3;         // for move_object, teleport_player, spawn_npc
  flag?:        string;       // for set_flag / clear_flag
  eventId?:     string;       // for fire_event
  itemId?:      string;       // for give_item
  fadeColor?:   string;
  fadeDuration?:number;
  uiElementId?: string;
  // JavaScript escape hatch — sandboxed, runs in a limited context
  script?:      string;       // JS function body as string — see ScriptContext
}

export interface DialogueDef {
  speaker:  string;
  lines:    string[];         // array of lines, player advances through them
  portrait?:string;           // asset id for speaker portrait image
}

export interface ScriptDef {
  id:          string;
  label:       string;        // human-readable name shown in Script Panel
  zoneId:      string;        // which zone this script belongs to
  enabled:     boolean;
  trigger:     ScriptTrigger;
  conditions:  ScriptCondition[];   // ALL must pass (AND logic)
  actions:     ScriptAction[];      // executed in order
  oneShot:     boolean;       // if true, disables itself after first successful fire
}

// Runtime context passed to sandboxed JS scripts
export interface ScriptContext {
  objectId:   string;         // ID of the object that triggered this
  playerId:   string;
  flags:      Record<string, boolean>;
  // Methods available to scripts:
  // setFlag(flag: string): void
  // clearFlag(flag: string): void
  // hasFlag(flag: string): boolean
  // playSound(id: string): void
  // showDialogue(speaker: string, lines: string[]): void
  // teleportPlayer(position: Vec3): void
  // despawnObject(id: string): void
  // fireEvent(eventId: string): void
}

// Trigger volume — placed in world, referenced by scripts
export interface TriggerVolume {
  id:       string;
  label:    string;
  position: Vec3;
  size:     Vec3;             // width, height, depth
  zoneId:   string;
}

// ─── Persistence ───────────────────────────────────── ⏳ Phase 9 ───────────

// Scene file: already implemented as SceneFile above.
// Game state and editor prefs: planned Phase 9.

export interface GameSave {
  version:        string;
  timestamp:      string;
  sceneName:      string;
  playerPosition: Vec3;
  playerZoneId:   string;
  playerFacing:   number;
  flags:          Record<string, boolean>;
  firedOneShots:  string[];               // script IDs that have fired and disabled
  inventory:      string[];               // item IDs
}

// Editor preferences — user settings, persisted to localStorage
export interface EditorPreferences {
  quality:          QualitySettings;
  lastOpenedScene:  string | null;
  gridVisible:      boolean;
  snapEnabled:      boolean;
  snapUnit:         number;
  cameraSpeed:      number;
  theme:            'dark';               // only dark for now
}

// ─── Entity / scripting infrastructure ────────────────────────────────────────

export interface EntityCapabilities {
  emits:    TriggerType[];
  receives: ActionType[];
}

// Added to AssetDef (Phase 10.6):
// animations?: string[];   // clip names discovered at import time

// ─── Builder return types ─────────────────────────────────────────────────────

// Actual builder output types (Rapier colliders, not mesh colliders):

export interface WallBuildOutput {
  mesh:       THREE.Mesh;
  colliders:  RAPIER.Collider[];  // Rapier physics — no separate collision mesh
  trimMeshes: THREE.Mesh[];       // door frames, liners, passage trim (includes trigger triggers)
}

export interface FloorBuildOutput {
  mesh:     THREE.Mesh;
  collider: RAPIER.Collider;
}

export interface PlatformBuildOutput {
  meshes:   THREE.Mesh[];  // [capMesh, sideMesh, ...innerFaces, ...railings]
  collider: RAPIER.Collider;
}

export interface StairBuildOutput {
  meshes:    THREE.Mesh[];
  colliders: RAPIER.Collider[];  // one per step
}

// ─── Module interfaces (lifecycle contract) ───────────────────────────────────

export interface IEditorModule {
  init():        void;
  update(dt: number): void;
  dispose():     void;
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
│   │   ├── HistoryManager.ts      ← snapshot-based undo/redo (Phase 6.7)
│   │   ├── SelectionManager.ts
│   │   ├── WallTool.ts
│   │   ├── FloorTool.ts
│   │   ├── PlatformTool.ts
│   │   ├── StairTool.ts
│   │   ├── ObjectTool.ts
│   │   ├── ZoneTool.ts
│   │   ├── SpawnPointTool.ts
│   │   ├── TriggerVolumeTool.ts    ← amber wireframe drag-to-size, IDLE→PLACING state machine
│   │   └── TransitionTool.ts
│   ├── physics/
│   │   ├── PhysicsWorld.ts         ← Rapier world singleton, step loop, debug draw
│   │   ├── ColliderBuilder.ts      ← mesh → Rapier collider (called by every builder)
│   │   └── CharacterBody.ts        ← Rapier KinematicCharacterController wrapper
│   ├── scripting/
│   │   ├── ScriptEngine.ts         ← Runtime: trigger index, condition eval, action dispatch, flag system
│   │   └── GameStateManager.ts     ← Item inventory singleton (give_item / player_has_item)
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
│   │   ├── ScriptPanel.tsx         ← World/Zone/Object tabs, script list + editor drill-down
│   │   ├── DialogueOverlay.tsx     ← in-game dialogue bar (speaker + lines, E to advance)
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
  constructor(deps) { /* store deps, don't start yet */ }
  init()            { /* attach listeners, add objects to scene */ }
  update(dt)        { /* called every frame via SceneManager */ }
  dispose()         { /* remove listeners, dispose geometries/materials */ }
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
    "lastModified": "2026-01-01T00:00:00Z"
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
      "sunAzimuth": 180
    },
    "fogDensity": 0.012,
    "playerSettings": {
      "cameraMode": "fps",
      "moveSpeed": 5.0,
      "jumpHeight": 1.2,
      "fov": 75,
      "thirdPersonDistance": 4.0,
      "thirdPersonHeight": 1.8
    },
    "defaultSpawn": {
      "position": { "x": 0, "y": 0, "z": 0 },
      "zoneId": "zone_001",
      "facing": 0
    }
  },
  "terrain": {
    "resolution": 64,
    "heightData": "<base64-encoded Float32Array, resolution×resolution floats 0..1>",
    "maxHeight": 10.0,
    "layerMaterials": [
      { "id": "grass", "texture": "grass_01.jpg", "tileScale": 4.0, "minHeight": 0.0, "maxHeight": 0.4 },
      { "id": "dirt",  "texture": "dirt_01.jpg",  "tileScale": 3.0, "minHeight": 0.3, "maxHeight": 0.7 },
      { "id": "rock",  "texture": "rock_01.jpg",  "tileScale": 2.0, "minHeight": 0.6, "maxHeight": 1.0 }
    ]
  },
  "zones": [
    {
      "id": "zone_001",
      "name": "Town Square",
      "type": "outdoor",
      "bounds": { "x": 0, "z": 0, "width": 50, "depth": 50 },
      "nodes": [
        { "id": "node_001", "x": 0.0, "z": 0.0 },
        { "id": "node_002", "x": 10.0, "z": 0.0 }
      ],
      "floors": [
        {
          "id": "floor_001",
          "level": 0,
          "elevation": 0.0,
          "ceilingHeight": 3.0,
          "floorMesh": { "shape": "rect", "points": null, "material": "cobblestone" }
        },
        {
          "id": "floor_002",
          "level": 1,
          "elevation": 3.2,
          "ceilingHeight": 3.0,
          "floorMesh": { "shape": "rect", "points": null, "material": "wood_planks" }
        }
      ],
      "walls": [
        {
          "id": "wall_001",
          "startNodeId": "node_001",
          "endNodeId":   "node_002",
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
              "linkedTransitionId": "trans_001"
            },
            {
              "id": "opening_002",
              "type": "window",
              "offsetAlongWall": 7.5,
              "width": 1.0,
              "height": 1.2,
              "elevation": 0.9,
              "linkedZoneId": null,
              "linkedTransitionId": null
            }
          ]
        }
      ],
      "platforms": [
        {
          "id": "platform_001",
          "position": { "x": 5.0, "y": 3.2, "z": 5.0 },
          "size": { "width": 8.0, "depth": 6.0 },
          "thickness": 0.3,
          "material": "concrete_01",
          "hasRailing": true,
          "railingHeight": 1.0
        }
      ],
      "stairs": [
        {
          "id": "stair_001",
          "start": { "x": 2.0, "y": 0.0, "z": 4.0 },
          "end":   { "x": 2.0, "y": 3.2, "z": 8.0 },
          "width": 1.5,
          "style": "straight",
          "material": "concrete_01",
          "hasRailing": true
        }
      ],
      "objects": [
        {
          "id": "obj_001",
          "assetId": "prop_bench_01",
          "position": { "x": 2.0, "y": 0.0, "z": 3.0 },
          "rotation": { "x": 0, "y": 45, "z": 0 },
          "scale":    { "x": 1.0, "y": 1.0, "z": 1.0 },
          "floor": 0,
          "properties": {
            "interactable": false,
            "npcSpawn": false,
            "lootTableId": null,
            "triggerEventId": null
          }
        }
      ]
    }
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
      "spawnPoint": { "x": 1.0, "y": 0.0, "z": 1.0, "facing": 180 }
    }
  ]
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
    this.zones = new Map();        // zoneId → ZoneData
    this.transitions = new Map();  // transitionId → TransitionData
    this.activeZoneId = null;
  }

  // --- Zone mutations ---
  addZone(zoneData) {
    this.zones.set(zoneData.id, zoneData);
    this.bus.emit('zone:added', { zone: zoneData });
  }
  setActiveZone(zoneId) {
    this.activeZoneId = zoneId;
    this.bus.emit('zone:activated', { zoneId });
  }

  // --- Wall mutations ---
  addWall(zoneId, wallData) {
    this.zones.get(zoneId).walls.push(wallData);
    this.bus.emit('wall:added', { zoneId, wall: wallData });
  }
  updateWall(zoneId, wallId, changes) {
    const wall = this.zones.get(zoneId).walls.find(w => w.id === wallId);
    Object.assign(wall, changes);
    this.bus.emit('wall:updated', { zoneId, wallId, changes });
  }
  removeWall(zoneId, wallId) {
    const zone = this.zones.get(zoneId);
    zone.walls = zone.walls.filter(w => w.id !== wallId);
    this.bus.emit('wall:removed', { zoneId, wallId });
  }
  addOpening(zoneId, wallId, openingData) {
    const wall = this.zones.get(zoneId).walls.find(w => w.id === wallId);
    wall.openings.push(openingData);
    this.bus.emit('wall:updated', { zoneId, wallId, changes: { openings: wall.openings } });
  }

  // --- Floor mutations ---
  addFloor(zoneId, floorData) {
    this.zones.get(zoneId).floors.push(floorData);
    this.bus.emit('floor:added', { zoneId, floor: floorData });
  }
  updateFloor(zoneId, level, changes) {
    const floor = this.zones.get(zoneId).floors.find(f => f.level === level);
    Object.assign(floor, changes);
    this.bus.emit('floor:updated', { zoneId, level, changes });
  }

  // --- Platform mutations ---
  addPlatform(zoneId, data)          { /* push + emit 'platform:added' */ }
  updatePlatform(zoneId, id, changes){ /* find + assign + emit 'platform:updated' */ }
  removePlatform(zoneId, id)         { /* filter + emit 'platform:removed' */ }

  // --- Node mutations ---
  addNode(zoneId, node)              { /* push to zone.nodes */ }
  updateNode(zoneId, nodeId, pos)    { /* find + update + emit 'node:updated' */ }
  removeNode(zoneId, nodeId)         { /* filter */ }
  getNode(zoneId, nodeId)            { /* find + return */ }
  getWallsAtNode(zoneId, nodeId)     { /* filter walls where startNodeId or endNodeId matches */ }

  // --- Wall mutations (extended) ---
  updateWallSegment(zoneId, wallId, changes) { /* same as updateWall but emits segmentOnly:true */ }
  updateOpening(zoneId, wallId, openingId, changes) { /* find opening + assign + emit 'wall:updated' */ }
  addOpening(zoneId, wallId, opening) { /* push opening + emit 'wall:updated' */ }
  removeOpening(zoneId, wallId, openingId) { /* filter opening + emit 'wall:updated' */ }

  // --- Stair mutations ---
  addStair(zoneId, data)             { /* push + emit 'stair:added' */ }
  updateStair(zoneId, id, changes)   { /* find + assign + emit 'stair:updated' */ }
  removeStair(zoneId, id)            { /* filter + emit 'stair:removed' */ }

  // --- Object mutations ---
  addObject(zoneId, data)            { /* push + emit 'object:added' */ }
  updateObject(zoneId, id, changes)  { /* find + assign + emit 'object:updated' */ }
  removeObject(zoneId, id)           { /* filter + emit 'object:removed' */ }

  // --- Transition mutations ---
  addTransition(transData) {
    this.transitions.set(transData.id, transData);
    this.bus.emit('transition:added', { transition: transData });
  }

  // --- Bulk load (called by WorldLoader) ---
  loadFromJSON(json) {
    this.metadata = json.metadata;
    this.world = json.world;
    this.terrain = json.terrain;
    this.zones.clear();
    this.transitions.clear();
    json.zones.forEach(z => this.zones.set(z.id, z));
    json.transitions.forEach(t => this.transitions.set(t.id, t));
    this.activeZoneId = json.zones[0]?.id || null;
    this.bus.emit('world:loaded', { metadata: json.metadata });
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
  editorId:    "wall_001",      // matches data model id
  editorType:  "wall",          // "wall"|"floor"|"platform"|"stair"|"object"|"terrain"|"trigger"|"trim"
  zoneId:      "zone_001",
  selectable:  true,            // false for triggers, trim, terrain, helpers
  floorLevel:  0,               // which floor level (walls, floors, objects)
  _ownsMaterial: false,         // true if this mesh cloned the material (must dispose it)
}

// Wall meshes add:
mesh.userData.wallId = "wall_001";

// Opening trigger volumes add:
mesh.userData.triggerType     = "door";
mesh.userData.transitionId    = "trans_001";
mesh.userData.openingId       = "opening_001";
mesh.userData.selectable      = false;         // not selectable, only walkable trigger

// Object meshes add:
mesh.userData.assetId         = "prop_bench_01";

// Child meshes of GLTF objects add:
mesh.userData._parentId       = "obj_001";    // id of the root object group
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
    this._activeTool = 'select';
  }

  init() {
    this._dom.addEventListener('click', this._onClick = this._onClick.bind(this));
    this._dom.addEventListener('mousemove', this._onMouseMove = this._onMouseMove.bind(this));
    this._bus.on('tool:select', ({ tool }) => { this._activeTool = tool; });
    this._bus.on('object:updated', ({ id, zoneId, changes }) => this._onExternalUpdate(id, zoneId, changes));
  }

  _onClick(e) {
    if (this._activeTool !== 'select') return;
    const hits = this._castRay(e);
    const selectable = hits.filter(h => h.object.userData.selectable);
    if (selectable.length === 0) { this._deselect(); return; }
    const best = this._pickByPriority(selectable);
    // Resolve GLTF child to root group
    const root = this._resolveRoot(best.object);
    this._select(root);
  }

  _onMouseMove(e) {
    if (this._activeTool !== 'select') return;
    const hits = this._castRay(e);
    const selectable = hits.filter(h => h.object.userData.selectable);
    const hovered = selectable.length ? this._resolveRoot(this._pickByPriority(selectable).object) : null;
    if (hovered !== this._hoveredMesh) {
      if (this._hoveredMesh && this._hoveredMesh !== this._selectedMesh)
        this._clearHover(this._hoveredMesh);
      this._hoveredMesh = hovered;
      if (hovered && hovered !== this._selectedMesh)
        this._applyHover(hovered);
    }
  }

  _select(root) {
    if (this._selectedMesh === root) return;
    if (this._selectedMesh) this._clearSelect(this._selectedMesh);
    this._selectedMesh = root;
    this._applySelect(root);

    this._bus.emit('object:selected', {
      id:       root.userData.editorId,
      type:     root.userData.editorType,
      zoneId:   root.userData.zoneId,
      position: root.position.clone(),
      rotation: { x: THREE.MathUtils.radToDeg(root.rotation.x), y: THREE.MathUtils.radToDeg(root.rotation.y), z: THREE.MathUtils.radToDeg(root.rotation.z) },
      scale:    root.scale.clone(),
      data:     this._getDataRecord(root),
    });
  }

  _deselect() {
    if (!this._selectedMesh) return;
    this._clearSelect(this._selectedMesh);
    this._selectedMesh = null;
    this._bus.emit('object:deselected', {});
  }

  _applySelect(root) {
    root.traverse(child => {
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
    root.traverse(child => {
      if (!child.isMesh || !child.userData._ownsMaterial) return;
      child.material.emissive.set(child.userData._origEmissive ?? 0x000000);
      child.material.emissiveIntensity = child.userData._origEmissiveIntensity ?? 0;
    });
  }

  _applyHover(root) {
    root.traverse(child => {
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
    root.traverse(child => {
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
    const order = ['object', 'platform', 'wall', 'floor'];
    for (const type of order) {
      const hit = hits.find(h => h.object.userData.editorType === type);
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
      case 'wall':     return zone.walls.find(w => w.id === editorId);
      case 'floor':    return zone.floors.find(f => f.level === root.userData.floorLevel);
      case 'platform': return zone.platforms.find(p => p.id === editorId);
      case 'stair':    return zone.stairs.find(s => s.id === editorId);
      case 'object':   return zone.objects.find(o => o.id === editorId);
      default:         return null;
    }
  }

  _onExternalUpdate(id, zoneId, changes) {
    // React edited a field — apply transform changes directly to mesh if selected
    if (!this._selectedMesh || this._selectedMesh.userData.editorId !== id) return;
    if (changes.position) this._selectedMesh.position.set(changes.position.x, changes.position.y, changes.position.z);
    if (changes.rotation) this._selectedMesh.rotation.set(
      THREE.MathUtils.degToRad(changes.rotation.x),
      THREE.MathUtils.degToRad(changes.rotation.y),
      THREE.MathUtils.degToRad(changes.rotation.z)
    );
    if (changes.scale) this._selectedMesh.scale.set(changes.scale.x, changes.scale.y, changes.scale.z);
  }

  update(dt) { /* gizmo update in Phase 7 */ }

  dispose() {
    this._dom.removeEventListener('click', this._onClick);
    this._dom.removeEventListener('mousemove', this._onMouseMove);
  }
}
```

### Transform Gizmos (Phase 7)

Use `THREE.TransformControls` from `three/addons/controls/TransformControls.js`:

```js
import { TransformControls } from 'three/addons/controls/TransformControls.js';

this._gizmo = new TransformControls(camera, domElement);
scene.add(this._gizmo);

// Attach on select
this._gizmo.attach(selectedMesh);

// Key bindings
// G = translate, R = rotate (Y-axis only for objects), S = scale uniform
bus.on('input:keydown', ({ code }) => {
  if (!this._selectedMesh) return;
  if (code === 'KeyG') this._gizmo.setMode('translate');
  if (code === 'KeyR') this._gizmo.setMode('rotate');
  if (code === 'KeyS') this._gizmo.setMode('scale');
});

// Suppress camera during drag
this._gizmo.addEventListener('dragging-changed', e => {
  bus.emit('gizmo:dragging', { isDragging: e.value });
});

// Write back to WorldState on drag end
this._gizmo.addEventListener('objectChange', () => {
  const mesh = this._selectedMesh;
  worldState.updateObject(mesh.userData.zoneId, mesh.userData.editorId, {
    position: mesh.position,
    rotation: { x: THREE.MathUtils.radToDeg(mesh.rotation.x), y: THREE.MathUtils.radToDeg(mesh.rotation.y), z: THREE.MathUtils.radToDeg(mesh.rotation.z) },
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

| Event | Direction | Payload |
|---|---|---|
| `tool:select` | React → Three.js | `{ tool: string }` |
| `floor:select` | React → Three.js | `{ level: number }` |
| `object:selected` | Three.js → React | `{ id, type, zoneId, position, rotation, scale, data }` |
| `object:deselected` | Three.js → React | `{}` |
| `object:updated` | React → Three.js | `{ id, zoneId, changes }` |
| `asset:selected` | React → Three.js | `{ assetId }` |
| `asset:dropped` | React → Three.js | `{ assetId, screenPos }` |
| `wall:added` | internal | `{ zoneId, wall }` |
| `wall:updated` | internal | `{ zoneId, wallId, changes }` |
| `wall:removed` | internal | `{ zoneId, wallId }` |
| `floor:added` | internal | `{ zoneId, floor }` |
| `floor:updated` | internal | `{ zoneId, level, changes }` |
| `platform:added` | internal | `{ zoneId, platform }` |
| `platform:updated` | internal | `{ zoneId, id, changes }` |
| `platform:removed` | internal | `{ zoneId, id }` |
| `stair:added` | internal | `{ zoneId, stair }` |
| `stair:removed` | internal | `{ zoneId, id }` |
| `object:added` | internal | `{ zoneId, object }` |
| `object:removed` | internal | `{ zoneId, id }` |
| `zone:added` | internal | `{ zone }` |
| `zone:activated` | internal | `{ zoneId }` |
| `zone:enter` | React → Three.js | `{ zoneId }` |
| `transition:added` | internal | `{ transition }` |
| `preview:start` | React → Three.js | `{}` |
| `preview:stop` | Three.js → React | `{}` |
| `preview:zone-entered` | Three.js → React | `{ zoneName }` |
| `gizmo:dragging` | internal | `{ isDragging: bool }` |
| `camera:jump` | internal | `{ x, z }` |
| `character:teleport` | internal | `{ position, facing }` |
| `overlay:fade-in` | internal | `{ color, duration }` |
| `overlay:fade-out` | internal | `{ duration }` |
| `scene:save` | React → Three.js | `{}` |
| `scene:load` | React → Three.js | `{ json }` |
| `scene:saved` | Three.js → React | `{ json }` |
| `scene:loaded` | Three.js → React | `{ metadata }` |
| `world:loaded` | internal | `{ metadata }` |
| `terrain:sculpt` | internal | `{ x, z, radius, delta }` |
| `input:click` | InputManager → all | `{ screenPos, worldPos, button }` |
| `input:dblclick` | InputManager → all | `{ screenPos, worldPos }` |
| `input:mousemove` | InputManager → all | `{ screenPos, worldPos, delta }` |
| `input:mousedown` | InputManager → all | `{ button, screenPos }` |
| `input:mouseup` | InputManager → all | `{ button, screenPos }` |
| `input:wheel` | InputManager → all | `{ delta }` |
| `input:keydown` | InputManager → all | `{ code, key, shift, ctrl, alt }` |
| `input:keyup` | InputManager → all | `{ code }` |
| `history:restore` | internal | `{}` — fired after undo/redo; ZoneManager reloads active zone |

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
    this._suppress = false;  // set true during transitions
  }

  init() {
    this._dom.addEventListener('mousedown',   this._md = e => this._onMouseDown(e));
    this._dom.addEventListener('mousemove',   this._mm = e => this._onMouseMove(e));
    this._dom.addEventListener('mouseup',     this._mu = e => this._onMouseUp(e));
    this._dom.addEventListener('click',       this._mc = e => this._onClick(e));
    this._dom.addEventListener('dblclick',    this._dc = e => this._onDblClick(e));
    this._dom.addEventListener('wheel',       this._mw = e => this._onWheel(e), { passive: false });
    this._dom.addEventListener('contextmenu', this._cx = e => e.preventDefault());
    window.addEventListener('keydown',        this._kd = e => this._onKeyDown(e));
    window.addEventListener('keyup',          this._ku = e => this._onKeyUp(e));
    this._bus.on('overlay:fade-in',  () => { this._suppress = true; });
    this._bus.on('overlay:fade-out', () => { this._suppress = false; });
  }

  get isShiftDown() { return !!(this._keys['ShiftLeft'] || this._keys['ShiftRight']); }
  get isAltDown()   { return !!(this._keys['AltLeft']   || this._keys['AltRight']); }
  get isCtrlDown()  { return !!(this._keys['ControlLeft'] || this._keys['ControlRight']); }
  isKeyDown(code)   { return !!this._keys[code]; }

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
    this._bus.emit('input:mousedown', { button: e.button, screenPos: { x: e.clientX, y: e.clientY } });
  }
  _onMouseMove(e) {
    if (this._suppress) return;
    const worldPos = this._worldPos(e);
    this._bus.emit('input:mousemove', {
      screenPos: { x: e.clientX, y: e.clientY },
      worldPos,
      delta: { x: e.movementX, y: e.movementY },
    });
  }
  _onMouseUp(e)    { if (!this._suppress) this._bus.emit('input:mouseup',   { button: e.button, screenPos: { x: e.clientX, y: e.clientY } }); }
  _onClick(e)      { if (!this._suppress) this._bus.emit('input:click',     { screenPos: { x: e.clientX, y: e.clientY }, worldPos: this._worldPos(e), button: e.button }); }
  _onDblClick(e)   { if (!this._suppress) this._bus.emit('input:dblclick',  { screenPos: { x: e.clientX, y: e.clientY }, worldPos: this._worldPos(e) }); }
  _onWheel(e)      { e.preventDefault(); if (!this._suppress) this._bus.emit('input:wheel', { delta: e.deltaY }); }
  _onKeyDown(e)    {
    this._keys[e.code] = true;
    if (!this._suppress) this._bus.emit('input:keydown', { code: e.code, key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey });
  }
  _onKeyUp(e)      { delete this._keys[e.code]; if (!this._suppress) this._bus.emit('input:keyup', { code: e.code }); }

  dispose() {
    this._dom.removeEventListener('mousedown',   this._md);
    this._dom.removeEventListener('mousemove',   this._mm);
    this._dom.removeEventListener('mouseup',     this._mu);
    this._dom.removeEventListener('click',       this._mc);
    this._dom.removeEventListener('dblclick',    this._dc);
    this._dom.removeEventListener('wheel',       this._mw);
    this._dom.removeEventListener('contextmenu', this._cx);
    window.removeEventListener('keydown',        this._kd);
    window.removeEventListener('keyup',          this._ku);
  }
}
```

---

## EditorCamera.ts

### Controls

| Input | Action |
|---|---|
| Right-click drag | Orbit around focus point |
| Middle-click drag | Pan focus point on XZ plane |
| WASD / Arrow keys | Pan focus point on XZ plane |
| Scroll wheel | Zoom in/out |
| Q / E | Snap rotate 45° left / right |
| F | Frame selected object (focus on its AABB center) |
| `[` / `]` | Previous / next floor level |
| P | Enter preview mode |
| Esc | Exit preview |
| Home | Reset to default position |

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

Both `_handleKeyDown` and `_handleKeyUp` also guard against input-field focus via `_isTypingTarget(e)` — identical to the same guard in `InputManager`. This prevents Arrow/WASD keys typed inside any `<input>`, `<select>`, or `<textarea>` from moving the camera.

### Floor Clip Plane

When active floor level > 0:
```js
const clipY = zone.floors[level].elevation + zone.floors[level].ceilingHeight;
renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), clipY)];
```
When floor 0 is active: `renderer.clippingPlanes = []`.

Lower floor meshes: set `material.opacity = 0.2`, `material.transparent = true` on all meshes with `floorLevel < activeLevel`. Restore on floor change.

---

## Wall Generation System (WallBuilder.ts)

### Signatures

```ts
// src/builders/WallBuilder.ts

static async build(
  wall:  WallDef,
  zoneId: string,
  zone:  ZoneDef,
  nodes: Map<string, WallNode>,
): Promise<WallBuildOutput>

static async buildRun(
  walls: WallDef[],   // connected chain, ordered start→end
  zoneId: string,
  zone:  ZoneDef,
  nodes: Map<string, WallNode>,
): Promise<WallBuildOutput>

export interface WallBuildOutput {
  mesh:       THREE.Mesh;
  colliders:  RAPIER.Collider[];
  trimMeshes: THREE.Mesh[];       // frames, liners, door jambs/headers, passage trim
}
```

### Algorithm

```
Input: WallDef { id, startNodeId, endNodeId, floor, height, thickness, material,
                 exteriorMaterial, openings[] }
       nodes Map<id, {x, z}>

Step 1: Resolve coordinates
  start = nodes.get(wall.startNodeId)
  end   = nodes.get(wall.endNodeId)
  length = hypot(end.x - start.x, end.z - start.z)
  angle  = atan2(end.z - start.z, end.x - start.x)
  elevation = zone.floors[wall.floor].elevation

Step 2: build() — single wall custom geometry
  Builds 6-face box geometry directly (not BoxGeometry) for interior + exterior
  material separation and UV tiling per face.

  buildRun() — merged run
  For a chain of walls sharing nodes, builds one merged mesh with:
  - Mitered corner joins (each shared node shortens both walls by thickness/2 on their
    shared end so they meet cleanly at 45°)
  - UV continuity across the full run length

Step 3: CSG Openings (sorted by offsetAlongWall asc)
  csgSubtract() from src/utils/csg.ts
  Cutter = BoxGeometry(width + 0.05, height + 0.05, thickness + 0.1)
  Applied to the merged-run mesh; interior + exterior CSG together.

Step 4: Trim meshes (added to trimMeshes[], never the main mesh)
  - Door/arch openings: jamb + header liner (passage-style inner face)
  - Window openings: sill + lintel liner, side jambs
  - Door trigger volumes: thin sensor mesh tagged { editorType:'trim', triggerType:'door' }
    (used by TriggerSystem in preview mode)

Step 5: Rapier colliders
  Wall segments between openings → ColliderBuilder.registerWallSegments()
  Returns RAPIER.Collider[] — no separate collision meshes

Step 6: userData tagging
  Main mesh: selectable: true, editorType: "wall", wallId
  Trim meshes: selectable: false, editorType: "trim" | "opening"
```

### Run System (ZoneManager)

ZoneManager groups connected walls (sharing a node) into `RunEntry`. All walls in a run
share one merged mesh. `buildRun()` handles corners; `build()` is the single-wall fallback.
When any wall in a run changes, the entire run is rebuilt atomically via `_rebuildWallBatch()`.
Queue coalescing (`_queueRebuild()`) prevents rebuild storms on multi-wall changes.

---

## FloorBuilder.ts

```ts
// src/builders/FloorBuilder.ts

static async build(
  floor: FloorDef,
  bounds: Bounds,
  zoneId: string,
  levelIndex = 0,
  cutterMeshes: THREE.Mesh[] = [],  // world-space CSG cutters from stair csgCutters
): Promise<FloorBuildOutput>

export interface FloorBuildOutput {
  mesh:     THREE.Mesh;
  collider: RAPIER.Collider;
}
```

**Algorithm:**
- Rect floor: `PlaneGeometry(bounds.width, bounds.depth)` rotated -90° to XZ plane
- Polygon floor: `ShapeGeometry` from `floor.floorMesh.points` (or derived from `nodeIds`)
- UV tiling: world-scale repeat using `materialDef.tileScale`
- CSG cuts: if `cutterMeshes.length > 0`, translates geo to world space, applies `csgSubtract()` per cutter, result stays in world space
- Collider: `ColliderBuilder.registerFloor(floor)` → Rapier trimesh (not a visible mesh)

---

## PlatformBuilder.ts

```ts
// src/builders/PlatformBuilder.ts

static async build(
  platform: PlatformDef,
  zoneId: string,
  cuts: CutInfo[] = [],  // stair CSG cutter data from ZoneManager
): Promise<PlatformBuildOutput>

export interface PlatformBuildOutput {
  meshes:   THREE.Mesh[];   // [capMesh, sideMesh, ...innerFaceMeshes, ...railings]
  collider: RAPIER.Collider;
}

export interface CutInfo {
  mesh:            THREE.Mesh;   // world-space BoxGeometry for csgSubtract
  worldX:          number;
  worldZ:          number;
  width:           number;
  depth:           number;
  rotX:            number;       // radians
  rotY:            number;
  rotZ:            number;
  innerTileH:      number;
  innerTileV:      number;
  innerFaceHeight: number;       // = platform.thickness
}
```

**Mesh breakdown:**
- **capMesh**: top + bottom faces only (custom geometry, not BoxGeometry). Polygon platforms use `ShapeGeometry`. Receives CSG cuts in world space.
- **sideMesh**: 4 vertical faces. Separate material (`sideMaterial` / `sideMaterialOverrides`).
- **innerFaceMeshes**: one per `CutInfo`. 4-sided open box covering the slab thickness at each hole — visible from inside. Inward normals so they're front-facing when viewed from the passage.
- **railings**: 4 `BoxGeometry` posts if `hasRailing: true`.

---

## StairBuilder.ts

```ts
// src/builders/StairBuilder.ts

static async build(stair: StairDef, zoneId: string): Promise<StairBuildOutput>

export interface StairBuildOutput {
  meshes:    THREE.Mesh[];
  colliders: RAPIER.Collider[];  // one per step — proper step-shaped colliders
}
```

**Mesh breakdown:**
- **bodyMesh**: single merged custom geometry for all step tops/sides/backs (one mesh per material — body material)
- **riserMesh**: single merged geometry for all step front faces (`riserMaterial` if set, else falls back to body material)
- **railing meshes** (2): `BoxGeometry` bars along each side if `hasRailing: true`
- **CSG cutter wireframe**: `LineSegments` (EdgesGeometry of cutter box) if `stair.csgCutter` is set. Tagged `editorOnly: true` — hidden in preview mode.

**Algorithm (straight style):**
```
numSteps  = stair.numSteps ?? round(heightDiff / 0.2)
stepRise  = heightDiff / numSteps
stepDepth = horizDist / numSteps
angle     = atan2(dz, dx)

For each step i:
  center = start + t*(end-start)  where t = (i + 0.5) / numSteps
  Build 6-face custom geometry rotated by angle in world space
  (body faces: top, bottom, left, right, back; riser: front face)
```

**Colliders:** `ColliderBuilder.registerStairSteps(stair)` → one box collider per step.

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

### Internal Entry Types

```ts
interface RunEntry {
  mesh:       THREE.Mesh;
  colliders:  RAPIER.Collider[];
  wallIds:    string[];     // all wall IDs in this merged run
  trimMeshes: THREE.Mesh[];
}

interface PlatformEntry {
  meshes:   THREE.Mesh[];
  collider: RAPIER.Collider;
}

interface StairEntry {
  group:     THREE.Group;
  meshes:    THREE.Mesh[];
  colliders: RAPIER.Collider[];
  def:       StairDef;      // kept to detect CSG cutter changes on rebuild
}

interface ZoneEntry {
  group:            THREE.Group;
  floorsGroup:      THREE.Group;
  wallsGroup:       THREE.Group;
  platformsGroup:   THREE.Group;
  stairsGroup:      THREE.Group;
  floorColliders:   Map<string, RAPIER.Collider>;   // floorId → collider
  wallData:         Map<string, RunEntry>;           // wallId → run (multiple IDs can map to same RunEntry)
  platformEntries:  Map<string, PlatformEntry>;
  stairEntries:     Map<string, StairEntry>;
}
```

### loadZone

```
1. Build floors (with CSG cuts from any existing stair cutters)
2. Group walls into runs (chains of walls sharing nodes)
   → buildRun() for each run, or build() for isolated walls
3. Build platforms (with CSG cuts)
4. Build stairs (including cutter wireframes)
5. Place objects (GLTF via ObjectPlacer)
6. Second pass: for each stair with csgCutter → _rebuildOverlapping()
   (needed because floors are built before stairs on initial load)
7. Apply floor dimming
```

### Key Patterns

**Wall run system**
Connected walls (sharing a node) → grouped into `RunEntry`. `wallData` maps every wallId in the run to the same `RunEntry`. On rebuild, the entire run is rebuilt atomically via `_rebuildWallBatch()`.

**Queue-based coalescing**
`_queueRebuild(zoneId, wallId)` and `_queuePlatformRebuild(zoneId, platformId)` batch changes via `Promise.resolve().then(...)` (microtask). Multiple rapid changes to the same zone merge into a single rebuild pass.

**Token-based staleness (platforms)**
Each platform rebuild increments a token. Async `PlatformBuilder.build()` captures the token; if it has changed by the time the result arrives, the result is discarded. Prevents stale async results from overwriting newer rebuilds.

**Wall-run stale rebuild fix**
`_removeWall` computes the surviving run synchronously, then calls `await WallBuilder.buildRun()`. After the await, it checks that at least one wall from the run still exists in `zone.walls`. If not (rapid multi-delete emptied the run), the freshly-built mesh and colliders are disposed immediately and discarded — no ghost mesh is added to the scene.

**Dimming system**
`_applyDimming()` clones materials for meshes whose `floorLevel` ≠ active level and sets reduced opacity. `_pruneDimMaterials()` disposes clones that are no longer in use. Materials at the active level are restored to full opacity.

**CSG cutter integration**
`stair:added/updated/removed` → `_rebuildOverlapping(zoneId, stair)` computes the cutter's world AABB and rebuilds any floor/platform whose bounds overlap.
- `_getStairCuttersForFloor(zoneId, floor)` → `THREE.Mesh[]` (plain cutter meshes for FloorBuilder)
- `_getStairCuttersForPlatform(zoneId, platform)` → `CutInfo[]` (includes tiling + inner face data for PlatformBuilder)

**Preview toggle**
`preview:start` → iterate all stairEntries, set `mesh.visible = false` for any mesh with `userData.editorOnly === true` (CSG wireframes etc.)
`preview:stop` → restore visibility

**History restore**
`history:restore` → `unloadZone(activeZoneId)` then `loadZone(activeZoneId)`. Called by ZoneManager after `HistoryManager` calls `world.loadFromJSON(snapshot)` to rebuild all scene geometry from the restored WorldState. Identical code path to `scene:load`, so it is proven and safe. Selection is cleared via `object:deselected` emitted immediately before `history:restore`.

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
    floorDef = { level: activeLevel, elevation: activeLevel * 3.0, shape: 'rect',
                 material: selectedMaterial, ... }
    // elevation always defaults to activeLevel * 3.0 — same formula as WallTool.
    // Never copied from an existing floor at that level (would inherit user overrides).
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
    Snap to nearby existing node if within snap radius (0.5m)
    If no existing node at start/end: worldState.addNode(zoneId, newNode)
    Detect loop close (endNode == chainStartNode) → emit 'floortool:suggest-auto-floor'
    wallDef = { id: uuid(), startNodeId, endNodeId, floor: activeLevel, height: 3.0,
                thickness: 0.2, material: selectedMaterial, exteriorMaterial: selectedMaterial, openings: [] }
    worldState.addWall(zoneId, wallDef)
    startNodeId = endNodeId  ← chain continues
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
    this._textureCache  = new Map();
    this._materialCache = new Map();
    this._gltfCache     = new Map();
    this._textureLoader = new THREE.TextureLoader();
    this._gltfLoader    = null;
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
    if (this._materialCache.has(materialId)) return this._materialCache.get(materialId);
    const def = MATERIAL_REGISTRY[materialId];
    if (!def) {
      console.warn(`Unknown material: ${materialId}, using default`);
      return new THREE.MeshStandardMaterial({ color: 0x888888 });
    }
    const mat = new THREE.MeshStandardMaterial({
      map:       await this.loadTexture(def.texture),
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
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      this._gltfLoader = new GLTFLoader();
    }
    const gltf = await this._gltfLoader.loadAsync(`/assets/models/${assetId}.glb`);
    this._gltfCache.set(assetId, gltf);
    return gltf;
  }

  dispose() {
    this._textureCache.forEach(t => t.dispose());
    this._materialCache.forEach(m => m.dispose());
    this._textureCache.clear();
    this._materialCache.clear();
    this._gltfCache.clear();
  }
}

// Material registry — add entries as textures are added to /assets/textures/
const MATERIAL_REGISTRY = {
  brick_01:          { texture: '/assets/textures/brick_01.jpg',      tileWidth: 1.0, tileHeight: 1.0, roughness: 0.9 },
  brick_exterior_01: { texture: '/assets/textures/brick_ext_01.jpg',  tileWidth: 1.0, tileHeight: 1.0, roughness: 0.85 },
  cobblestone:       { texture: '/assets/textures/cobblestone_01.jpg',tileWidth: 1.0, tileHeight: 1.0, roughness: 0.95 },
  wood_planks:       { texture: '/assets/textures/wood_planks_01.jpg',tileWidth: 0.8, tileHeight: 0.8, roughness: 0.7 },
  concrete_01:       { texture: '/assets/textures/concrete_01.jpg',   tileWidth: 2.0, tileHeight: 2.0, roughness: 0.8 },
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
    this._bus.on('input:mousemove', this._onMouseMove = ({ delta }) => {
      if (document.pointerLockElement) {
        this._yaw   -= delta.x * 0.002;
        this._pitch  = Math.max(-1.4, Math.min(1.4, this._pitch - delta.y * 0.002));
      }
    });
  }

  despawn() {
    this._active = false;
    this._bus.off('input:mousemove', this._onMouseMove);
  }

  update(dt) {
    if (!this._active) return;

    // --- Input ---
    const s = this._settings;
    const fwd  = new THREE.Vector3(-Math.sin(this._yaw), 0, -Math.cos(this._yaw));
    const right = new THREE.Vector3(-Math.cos(this._yaw), 0,  Math.sin(this._yaw));
    const move  = new THREE.Vector3();
    if (this._input.isKeyDown('KeyW')) move.add(fwd);
    if (this._input.isKeyDown('KeyS')) move.sub(fwd);
    if (this._input.isKeyDown('KeyA')) move.sub(right);
    if (this._input.isKeyDown('KeyD')) move.add(right);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(s.moveSpeed);

    this._velocity.x = move.x;
    this._velocity.z = move.z;

    // --- Gravity ---
    this._velocity.y -= 20 * dt;

    // --- Ground check ---
    const groundY = this._collisionWorld.getGroundHeight(this._position.x, this._position.z);
    const feetY = this._position.y - this._capsuleHeight / 2;
    if (feetY <= groundY) {
      this._position.y = groundY + this._capsuleHeight / 2;
      this._velocity.y = Math.max(0, this._velocity.y);
      this._grounded = true;
    } else {
      this._grounded = false;
    }

    // --- Jump ---
    if (this._grounded && this._input.isKeyDown('Space')) {
      this._velocity.y = Math.sqrt(2 * 20 * s.jumpHeight);
    }

    // --- Apply velocity ---
    this._position.addScaledVector(this._velocity, dt);

    // --- Camera ---
    if (s.cameraMode === 'fps') {
      this._camera.position.set(
        this._position.x,
        this._position.y + this._capsuleHeight * 0.4,
        this._position.z
      );
      this._camera.rotation.order = 'YXZ';
      this._camera.rotation.y = this._yaw;
      this._camera.rotation.x = this._pitch;
    } else {
      const offset = new THREE.Vector3(
        -Math.sin(this._yaw) * s.thirdPersonDistance,
        s.thirdPersonHeight,
        -Math.cos(this._yaw) * s.thirdPersonDistance
      );
      this._camera.position.copy(this._position).add(offset);
      this._camera.lookAt(this._position.x, this._position.y + 1.0, this._position.z);
    }

    // --- Trigger check ---
    const trigger = this._collisionWorld.checkTriggers(this._position);
    if (trigger?.triggerType === 'door' && trigger.transitionId) {
      this._bus.emit('character:triggerdoor', { transitionId: trigger.transitionId });
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

Subscribes to `object:selected` and `object:deselected`. Renders a view based on `selected.type`:

**OpeningView** — type (door/window/arch/passage), offset along wall, width, height, elevation, trim toggle, inner tiling (T+B, L+R). Changes emit `wall:updated`.

**WallView** — height, thickness, interior material + overrides, exterior material. Openings list (add/edit/remove). **SegmentsSection** (when `runWalls.length > 1`): expandable list of run-mate wall segments with per-segment material overrides. Changes emit `wall:updated` or `wall:updated` with `segmentOnly:true`.

**FloorView** — elevation, material, material overrides (tile scale, roughness, displacement, map toggles).

**PlatformView** — position XYZ, size (width/depth), thickness, railing toggle + height, two material sections: cap (top/bottom) and side, each with full overrides.

**StairView** — start/end vectors, step count, width, railing toggle, body material + overrides, riser material + overrides. **CUT BOX section**: enable/disable toggle; when enabled shows offset XYZ, rotation XYZ (deg), width/depth/height, inner tiling (T+B, L+R). Changes emit `stair:updated`.

**TransformView** — position XYZ, rotation XYZ, scale XYZ (for selected WorldObjects).

**ToolView** — active tool hint text.

All number inputs: local string state while typing, commit on blur/Enter. Changes emit the appropriate bus event (debounced where needed).

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
        String.fromCharCode(...new Uint8Array(state.terrain.heightData.buffer))
      );
    }
    return state;
  }

  download(worldState) {
    const json = JSON.stringify(this.serialize(worldState), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `${worldState.metadata.name || 'world'}.json` });
    a.click();
    URL.revokeObjectURL(url);
  }

  autoSave(worldState) {
    try {
      localStorage.setItem('worldeditor_autosave', JSON.stringify(this.serialize(worldState)));
      localStorage.setItem('worldeditor_autosave_time', Date.now());
    } catch (e) {
      console.warn('Auto-save failed (storage quota?)', e);
    }
  }
}
```

### Loader

```js
class WorldLoader {
  async load(json, worldState, zoneManager) {
    if (!json?.metadata?.version) throw new Error('Invalid or missing scene file version');

    // Unload all current zones
    for (const zoneId of worldState.zones.keys()) {
      zoneManager.unloadZone(zoneId);
    }

    // Decode terrain heightData base64 → Float32Array
    if (json.terrain?.heightData && typeof json.terrain.heightData === 'string') {
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

    this._bus.emit('scene:loaded', { metadata: json.metadata });
  }

  checkAutoSave() {
    const saved = localStorage.getItem('worldeditor_autosave');
    const time  = localStorage.getItem('worldeditor_autosave_time');
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
    const geo = new THREE.PlaneGeometry(worldSize, worldSize, resolution - 1, resolution - 1);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const h = heightData[i] ?? 0;
      pos.setY(i, h * maxHeight);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    // Multi-layer material — basic MeshStandardMaterial for now (Phase 11 adds shader blending)
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a5c2a, roughness: 0.95 });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.userData = { editorType: 'terrain', selectable: false };

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
        const falloff = 1 - (dist / radius);
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
import * as THREE from 'three';

export const snapToGrid = (val, unit = 0.5) => Math.round(val / unit) * unit;

export const snapVec3XZ = (v, unit = 0.5) =>
  new THREE.Vector3(snapToGrid(v.x, unit), v.y, snapToGrid(v.z, unit));

export const dist2D = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);

export const midpoint2D = (a, b) => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });

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
    ((event.clientX - rect.left) / rect.width)  * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
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
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

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
    turbidity:           number;  // default 10 — atmospheric haze
    rayleigh:            number;  // default 3  — sky blueness
    mieCoefficient:      number;  // default 0.005
    mieDirectionalG:     number;  // default 0.7
    sunElevation:        number;  // degrees above horizon, default 25
    sunAzimuth:          number;  // degrees, default 180
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

### Phase 4.5 — Material System

Sits between Phase 4 (walls working) and Phase 5 (openings). Once complete, every surface in the editor — walls, floors, platforms, stairs, and any future geometry — uses the same material pipeline. Nothing about this phase needs to be revisited later.

#### Applies To

Every builder that produces a visible mesh:
- `WallBuilder` — wall body, trim pieces
- `FloorBuilder` — floor slabs
- `PlatformBuilder` — platform slabs, railings
- `StairBuilder` — step meshes, railings
- `TerrainBuilder` (Phase 11) — terrain surface
- `ObjectPlacer` (Phase 7) — static prop surfaces where materials are overridable

#### File Naming Convention

All textures live in `public/assets/textures/<material_id>/`. Each map is a separate file named by suffix. This is the canonical naming spec — `AssetManager` derives all paths from the material ID and these suffixes automatically.

```
public/
  assets/
    textures/
      brick_01/
        albedo.jpg       ← base color / diffuse (required)
        normal.jpg       ← normal map (optional)
        roughness.jpg    ← roughness map (optional, grayscale)
        metalness.jpg    ← metalness map (optional, grayscale)
        ao.jpg           ← ambient occlusion (optional, grayscale)
        displacement.jpg ← displacement/height map (optional, grayscale)
      concrete_01/
        albedo.jpg
        normal.jpg
        roughness.jpg
        ao.jpg
      wood_planks_01/
        albedo.jpg
        normal.jpg
        roughness.jpg
      cobblestone_01/
        albedo.jpg
        normal.jpg
        roughness.jpg
        ao.jpg
```

**Where to get textures:** Polyhaven (polyhaven.com) — free CC0, download at 1K or 2K resolution, rename maps to match the convention above. Every Polyhaven material provides all six map types.

**Resolution guidance:**
- `1K` (1024×1024) — good default, fine for most surfaces at normal viewing distance
- `2K` (2048×2048) — use for hero surfaces seen up close (floors you walk on, walls at eye level)
- `4K` — avoid in the editor, too expensive for a tool

#### Updated MATERIAL_REGISTRY

```ts
// src/materials.ts

export interface MaterialMapConfig {
  enabled:  boolean;   // toggle in UI — disabled maps are not loaded
  path:     string;    // derived automatically: /assets/textures/<id>/<suffix>.jpg
}

export interface MaterialDef {
  id:            string;
  label:         string;         // display name in AssetBrowser / PropertiesPanel
  tileScale:     number;         // UV repeat per meter, default 1.0
  // PBR scalars (used when map is disabled or absent)
  roughnessVal:  number;         // 0–1
  metalnessVal:  number;         // 0–1
  displacementScale: number;     // meters, default 0.05 — only matters if displacement enabled
  // Per-map toggles
  maps: {
    albedo:      MaterialMapConfig;   // always enabled
    normal:      MaterialMapConfig;
    roughness:   MaterialMapConfig;
    metalness:   MaterialMapConfig;
    ao:          MaterialMapConfig;
    displacement:MaterialMapConfig;   // off by default — expensive
  };
}

export const MATERIAL_REGISTRY: Record<string, MaterialDef> = {
  brick_01: {
    id: 'brick_01', label: 'Brick',
    tileScale: 1.0, roughnessVal: 0.9, metalnessVal: 0.0, displacementScale: 0.03,
    maps: {
      albedo:      { enabled: true,  path: '/assets/textures/brick_01/albedo.jpg' },
      normal:      { enabled: true,  path: '/assets/textures/brick_01/normal.jpg' },
      roughness:   { enabled: true,  path: '/assets/textures/brick_01/roughness.jpg' },
      metalness:   { enabled: false, path: '/assets/textures/brick_01/metalness.jpg' },
      ao:          { enabled: true,  path: '/assets/textures/brick_01/ao.jpg' },
      displacement:{ enabled: false, path: '/assets/textures/brick_01/displacement.jpg' },
    },
  },
  concrete_01: {
    id: 'concrete_01', label: 'Concrete',
    tileScale: 2.0, roughnessVal: 0.85, metalnessVal: 0.0, displacementScale: 0.02,
    maps: {
      albedo:      { enabled: true,  path: '/assets/textures/concrete_01/albedo.jpg' },
      normal:      { enabled: true,  path: '/assets/textures/concrete_01/normal.jpg' },
      roughness:   { enabled: true,  path: '/assets/textures/concrete_01/roughness.jpg' },
      metalness:   { enabled: false, path: '/assets/textures/concrete_01/metalness.jpg' },
      ao:          { enabled: true,  path: '/assets/textures/concrete_01/ao.jpg' },
      displacement:{ enabled: false, path: '/assets/textures/concrete_01/displacement.jpg' },
    },
  },
  wood_planks_01: {
    id: 'wood_planks_01', label: 'Wood Planks',
    tileScale: 0.8, roughnessVal: 0.7, metalnessVal: 0.0, displacementScale: 0.01,
    maps: {
      albedo:      { enabled: true,  path: '/assets/textures/wood_planks_01/albedo.jpg' },
      normal:      { enabled: true,  path: '/assets/textures/wood_planks_01/normal.jpg' },
      roughness:   { enabled: true,  path: '/assets/textures/wood_planks_01/roughness.jpg' },
      metalness:   { enabled: false, path: '/assets/textures/wood_planks_01/metalness.jpg' },
      ao:          { enabled: false, path: '/assets/textures/wood_planks_01/ao.jpg' },
      displacement:{ enabled: false, path: '/assets/textures/wood_planks_01/displacement.jpg' },
    },
  },
  cobblestone_01: {
    id: 'cobblestone_01', label: 'Cobblestone',
    tileScale: 0.5, roughnessVal: 0.95, metalnessVal: 0.0, displacementScale: 0.04,
    maps: {
      albedo:      { enabled: true,  path: '/assets/textures/cobblestone_01/albedo.jpg' },
      normal:      { enabled: true,  path: '/assets/textures/cobblestone_01/normal.jpg' },
      roughness:   { enabled: true,  path: '/assets/textures/cobblestone_01/roughness.jpg' },
      metalness:   { enabled: false, path: '/assets/textures/cobblestone_01/metalness.jpg' },
      ao:          { enabled: true,  path: '/assets/textures/cobblestone_01/ao.jpg' },
      displacement:{ enabled: false, path: '/assets/textures/cobblestone_01/displacement.jpg' },
    },
  },
};
```

#### Updated AssetManager.getMaterial()

```ts
async getMaterial(
  materialId: string,
  overrides?: Partial<MaterialDef>,        // per-instance overrides from WorldState
  qualityScale?: QualityScale              // global quality setting
): Promise<THREE.MeshStandardMaterial> {

  const cacheKey = `${materialId}_${qualityScale ?? 'high'}`;
  if (this._materialCache.has(cacheKey)) return this._materialCache.get(cacheKey)!;

  const def = { ...MATERIAL_REGISTRY[materialId], ...overrides };
  if (!def) {
    console.warn(`Unknown material: ${materialId}`);
    return new THREE.MeshStandardMaterial({ color: 0x888888 });
  }

  const load = async (mapDef: MaterialMapConfig): Promise<THREE.Texture> => {
    const tex = await this._textureLoader.loadAsync(mapDef.path);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    // Quality scaling — downscale by halving anisotropy and capping resolution
    tex.anisotropy = qualityScale === 'low' ? 1 : qualityScale === 'medium' ? 4 : this._renderer.capabilities.getMaxAnisotropy();
    tex.minFilter = qualityScale === 'low' ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = qualityScale !== 'low';
    return tex;
  };

  const mat = new THREE.MeshStandardMaterial({
    roughness: def.roughnessVal,
    metalness: def.metalnessVal,
  });

  // Load only enabled maps
  if (def.maps.albedo.enabled)
    mat.map = await load(def.maps.albedo);

  if (def.maps.normal.enabled)
    mat.normalMap = await load(def.maps.normal);

  if (def.maps.roughness.enabled)
    mat.roughnessMap = await load(def.maps.roughness);

  if (def.maps.metalness.enabled)
    mat.metalnessMap = await load(def.maps.metalness);

  if (def.maps.ao.enabled)
    mat.aoMap = await load(def.maps.ao);

  if (def.maps.displacement.enabled) {
    mat.displacementMap = await load(def.maps.displacement);
    mat.displacementScale = def.displacementScale;
    // NOTE: displacement requires subdivided geometry to have any effect.
    // Builders must check if displacement is enabled and increase geometry
    // segments accordingly (see Displacement section below).
  }

  // UV tiling applied at geometry level via repeat — see builders
  this._materialCache.set(cacheKey, mat);
  return mat;
}
```

#### Displacement — Special Handling

Displacement actually moves vertices, so it requires subdivided geometry. Flat boxes with 1 segment per face show no effect.

When `displacement.enabled === true` for a material:
- `WallBuilder` uses `BoxGeometry(length, height, thickness, Math.ceil(length * 4), Math.ceil(height * 4), 1)` — 4 segments per meter
- `FloorBuilder` uses `PlaneGeometry(w, d, Math.ceil(w * 4), Math.ceil(d * 4))`
- `PlatformBuilder` same as floor
- `StairBuilder` — displacement disabled, steps are too small to subdivide usefully

**Default is off.** Displacement is the most expensive map. Enable only for hero surfaces where close-up detail matters. A normal map gives 90% of the visual benefit at a fraction of the cost.

#### Quality Scale System

```ts
// src/types.ts addition
export type QualityScale = 'low' | 'medium' | 'high';

export interface QualitySettings {
  textureScale:    QualityScale;   // controls anisotropy, mipmaps, filter mode
  shadowMapSize:   number;         // 512 | 1024 | 2048
  shadowsEnabled:  boolean;
  fogEnabled:      boolean;
  antialias:       boolean;        // set at renderer init — requires restart to change
}

export const QUALITY_PRESETS: Record<QualityScale, QualitySettings> = {
  low: {
    textureScale:  'low',
    shadowMapSize:  512,
    shadowsEnabled: false,
    fogEnabled:     false,
    antialias:      false,
  },
  medium: {
    textureScale:  'medium',
    shadowMapSize:  1024,
    shadowsEnabled: true,
    fogEnabled:     true,
    antialias:      false,
  },
  high: {
    textureScale:  'high',
    shadowMapSize:  2048,
    shadowsEnabled: true,
    fogEnabled:     true,
    antialias:      true,
  },
};
```

Quality settings stored in `WorldConfig` (not the scene file — it's a user preference, not world data). Persisted to `localStorage` independently of save/load.

When quality changes:
1. Clear `AssetManager` material cache
2. Reload all materials for the active zone at new quality level
3. Update `renderer.shadowMap.mapSize` (requires `renderer.shadowMap.needsUpdate = true`)
4. Toggle fog on scene
5. Antialias requires renderer recreation — warn user, offer page reload

#### Per-Surface Material Overrides

Each wall, floor, platform, stair in WorldState can carry per-instance map overrides:

```ts
// Addition to WallDef, FloorDef, PlatformDef, StairDef in types.ts
materialOverrides?: {
  maps?: Partial<Record<keyof MaterialDef['maps'], { enabled: boolean }>>;
  tileScale?:         number;
  roughnessVal?:      number;
  displacementScale?: number;
};
```

This lets you disable normal maps on a specific wall that's far away, or crank up tileScale on a large floor without touching the global registry.

#### PropertiesPanel — Material Section

When a wall, floor, platform, or stair is selected, the Properties Panel shows a **Material** section:

```
MATERIAL
┌─────────────────────────────────┐
│ [Brick ▾]          Tile: [1.0]  │  ← material picker + tile scale
├─────────────────────────────────┤
│ MAPS                            │
│ [✓] Albedo                      │
│ [✓] Normal                      │
│ [✓] Roughness      val: [0.9]   │  ← scalar shown when map disabled
│ [ ] Metalness      val: [0.0]   │
│ [✓] AO                          │
│ [ ] Displacement   val: [0.03]  │  ← scale shown when enabled
├─────────────────────────────────┤
│ QUALITY                         │
│ ○ Low  ● Medium  ○ High         │  ← global, not per-surface
└─────────────────────────────────┘
```

Toggling a map checkbox:
1. React emits `object:updated { id, zoneId, changes: { materialOverrides: { maps: { normal: { enabled: false } } } } }`
2. Three.js side calls `worldState.updateWall()` → `wall:updated` fires
3. ZoneManager detects material-only change → calls `AssetManager.getMaterial()` with new overrides → swaps material on mesh without full geometry rebuild
4. No flicker — material swap is instant

Changing the material picker (e.g. Brick → Concrete):
- Same flow but full material replacement
- If new material has displacement enabled and old didn't (or vice versa): geometry rebuild required (different segment count)
- Otherwise: material swap only

#### Performance Notes for Claude Code

- Never call `getMaterial()` inside the RAF loop — materials are loaded once and cached
- `aoMap` requires a second UV set (`uv2`) on the geometry — builders must call `geometry.setAttribute('uv2', geometry.attributes.uv)` when AO is enabled
- Displacement on walls with CSG openings: run CSG first on unsubdivided geometry, then subdivide the result — CSG on high-segment geometry is very slow
- Texture memory: a single 2K RGBA texture = ~16MB GPU memory. With 6 maps × 2K = ~96MB per material. Keep an eye on total materials loaded. The quality system's cache clear helps with this.
- `THREE.DefaultLoadingManager` can be used to show a loading indicator while textures load on zone switch

### Phase 4.6 — Wall Graph

Sits between Phase 4.5 (material system) and Phase 5 (openings). Retrofits a node-based connection system onto the wall data model so that walls can share corners, corner geometry trimming works reliably, and the foundation exists for rooms and connected wall manipulation later.

#### Why Before Phase 5

Openings (doors, windows) are placed at an offset along a wall. If walls are later restructured to use nodes, all opening offset calculations need revisiting. Better to have the correct data model in place before adding that complexity.

#### Data Model Changes

Replace raw `start`/`end` coordinates on `WallDef` with node ID references. Add a `nodes` array to `ZoneDef`.

```ts
// Addition to ZoneDef in types.ts
nodes: WallNode[];

// New type in types.ts
export interface WallNode {
  id:  string;
  x:   number;
  z:   number;
}

// WallDef — replace start/end with node references
// BEFORE:
// start: Vec2;
// end:   Vec2;
// AFTER:
startNodeId: string;
endNodeId:   string;
```

Two walls sharing a corner reference the same `WallNode` ID. No coordinate comparison needed — connection is explicit in the data.

#### WorldState Changes

```ts
// New mutations on WorldState
addNode(zoneId: string, node: WallNode): void
updateNode(zoneId: string, nodeId: string, pos: { x: number; z: number }): void
removeNode(zoneId: string, nodeId: string): void   // only if no walls reference it
getNode(zoneId: string, nodeId: string): WallNode
getWallsAtNode(zoneId: string, nodeId: string): WallDef[]  // all walls referencing this node

// updateNode emits 'node:updated' { zoneId, nodeId, pos }
// ZoneManager listens and rebuilds ALL walls referencing that node
```

#### WallTool — Endpoint Snapping

When placing a wall start or end point, check proximity to existing nodes:

```
On click (placing wall endpoint):
  1. Get all existing nodes in active zone
  2. Find closest node within snap radius (0.5m)
  3. If found:
       reuse that node's ID as startNodeId/endNodeId
       snap cursor position to that node's exact coordinates
  4. If not found:
       create new WallNode { id: uuid(), x: snapped.x, z: snapped.z }
       worldState.addNode(zoneId, newNode)
       use new node's ID

Visual feedback:
  - Existing nodes render as small dots (visible only when WallTool is active)
  - Dot highlights when cursor is within snap radius
  - Cursor snaps visually before click confirms
  - Snap radius indicator ring shown around highlighted node
```

Node dots are editor-only helpers — not selectable, not saved as geometry, invisible in preview mode.

#### WallBuilder Changes

WallBuilder no longer reads `wall.start` / `wall.end` directly. It receives node positions as resolved coordinates:

```ts
// WallBuilder.build() signature change
static build(
  wall:      WallDef,
  zone:      ZoneDef,        // used to resolve node positions
  nodes:     Map<string, WallNode>  // passed in, not looked up internally
): WallBuildResult

// Inside build():
const start = nodes.get(wall.startNodeId)!;
const end   = nodes.get(wall.endNodeId)!;
// rest of build logic unchanged
```

#### Corner Joining — Now Reliable

With shared node IDs, corner detection is exact:

```ts
// In WallBuilder, before computing geometry:
const connectedAtStart = zone.walls.filter(w =>
  w.id !== wall.id &&
  (w.startNodeId === wall.startNodeId || w.endNodeId === wall.startNodeId)
);
const connectedAtEnd = zone.walls.filter(w =>
  w.id !== wall.id &&
  (w.startNodeId === wall.endNodeId || w.endNodeId === wall.endNodeId)
);

// Shorten wall by thickness/2 at each connected end
// This eliminates visible overlap at corners — guaranteed to fire
// because connection is by ID, not by coordinate proximity
if (connectedAtStart.length > 0) startOffset += wall.thickness / 2;
if (connectedAtEnd.length > 0)   endOffset   += wall.thickness / 2;
```

No floating point comparison. No missed corners. Overlap at wall joins is eliminated.

#### ColliderBuilder Changes

Same as WallBuilder — resolves node positions from the nodes map before computing collider positions. No other changes needed.

#### WorldLoader — Migration

Old scene files store `start`/`end` as raw `Vec2`. WorldLoader detects and migrates on load:

```ts
// In WorldLoader, after parsing JSON:
for (const zone of json.zones) {
  if (!zone.nodes) zone.nodes = [];

  for (const wall of zone.walls) {
    // Detect old format
    if ('start' in wall && 'end' in wall) {
      // Find or create node for start position
      let startNode = zone.nodes.find(n =>
        Math.abs(n.x - (wall as any).start.x) < 0.001 &&
        Math.abs(n.z - (wall as any).start.z) < 0.001
      );
      if (!startNode) {
        startNode = { id: uuid(), x: (wall as any).start.x, z: (wall as any).start.z };
        zone.nodes.push(startNode);
      }

      // Find or create node for end position
      let endNode = zone.nodes.find(n =>
        Math.abs(n.x - (wall as any).end.x) < 0.001 &&
        Math.abs(n.z - (wall as any).end.z) < 0.001
      );
      if (!endNode) {
        endNode = { id: uuid(), x: (wall as any).end.x, z: (wall as any).end.z };
        zone.nodes.push(endNode);
      }

      wall.startNodeId = startNode.id;
      wall.endNodeId   = endNode.id;
      delete (wall as any).start;
      delete (wall as any).end;
    }
  }
}
```

Two old walls that happened to share the same coordinates get the same node — preserving any accidental connections from Phase 4 work.

#### What This Does NOT Include Yet

- Dragging a node to stretch connected walls (SelectionManager + node gizmo — Phase 12)
- Room detection from closed wall loops (Phase 12+)
- Any UI panel showing node data — nodes are invisible infrastructure
- Merging two nearby nodes that aren't exactly equal (snap-merge tool — Phase 12)

#### Summary of Changes

| File | Change |
|---|---|
| `src/types.ts` | Add `WallNode`, add `nodes` to `ZoneDef`, update `WallDef` |
| `src/world/WorldState.ts` | Add node mutations, `getWallsAtNode()` |
| `src/world/WorldLoader.ts` | Migration from old `start`/`end` format |
| `src/builders/WallBuilder.ts` | Resolve nodes from map, reliable corner joining |
| `src/physics/ColliderBuilder.ts` | Resolve nodes from map |
| `src/editor/WallTool.ts` | Snap detection, node creation/reuse, node dot rendering |



### Phase 4.7 — Merged Corner Geometry

Builds directly on the wall graph from Phase 4.6. Instead of two separate trimmed meshes at corners, compatible connected walls are merged into a single continuous extruded mesh with a clean mitered join.

#### Compatibility Rules for Merging

Two walls sharing a node are merged into one run only when ALL of the following are true:
- Same `material` and `exteriorMaterial`
- Same `height`
- The shared node has exactly **two** walls connected (no T-junctions or crossings)

If any condition fails, fall back to the existing trimmed separate mesh approach from 4.6.

#### WallBuilder — new `buildRun()` method

```ts
// Existing — builds one wall segment independently
static build(wall: WallDef, zone: ZoneDef, nodes: Map<string, WallNode>): WallBuildResult

// New — builds a continuous merged mesh from a sequence of compatible walls
static buildRun(walls: WallDef[], zone: ZoneDef, nodes: Map<string, WallNode>): WallBuildResult
```

The run is an ordered array of walls that form a connected chain. `buildRun()` traces the node sequence to get an ordered polyline of points, then extrudes a rectangular cross-section along it with proper mitered joins at each corner:

```ts
// Pseudocode for miter join at interior corner
// Given three consecutive points A → B → C:
// 1. Compute inward normals of AB and BC
// 2. Find miter direction (bisector of the two normals)
// 3. Compute miter length = thickness / 2 / sin(half-angle)
// 4. Offset corner vertex along miter direction
// This gives a clean sharp join regardless of angle
```

UV mapping along a run: U coordinate continues across the entire run length — so a brick texture flows continuously around a corner without restarting at the join.

**Openings on merged runs:** CSG cutouts still work per-opening. Each opening's position is computed as a world offset along the run's total length, same as before. The merged mesh is the base geometry; openings are subtracted from it.

**Collision geometry:** Still split into per-segment boxes around openings — same as before, not affected by visual merge.

#### ZoneManager — run grouping

Before building wall meshes for a zone, ZoneManager groups walls into runs:

```ts
function groupWallRuns(zone: ZoneDef, nodes: Map<string, WallNode>): WallDef[][] {
  // 1. Build adjacency: for each node, list connected walls
  // 2. Traverse connected walls, grouping compatible ones into runs
  // 3. A run ends when: node has >2 walls (T-junction), material/height differs, or no more connected walls
  // 4. Return array of runs (each run is an array of WallDef in connection order)
}
```

Single-wall runs (isolated walls, T-junction endpoints) → `WallBuilder.build()`
Multi-wall runs → `WallBuilder.buildRun()`

#### Incremental Rebuild

When a wall in a run changes (material, height, opening added):
1. Re-evaluate which run it belongs to
2. Dispose and rebuild the entire run's mesh
3. Adjacent runs that may have changed compatibility also rebuilt

This is slightly more expensive than rebuilding a single wall, but runs are typically short (2–6 walls) so it's fast in practice.

---

### Phase 4.8 — Wall Tool Interaction Model

Completes the wall drawing and editing experience. Builds on 4.6 (node graph) and 4.7 (merged geometry).

#### Wall Chain — Complete Spec

The WallTool already chains walls (set startPoint = endPoint after each click). Phase 4.8 fills in the gaps:

**Closing a loop:**
- While in DRAWING state, if the cursor snaps to the very first node of the current chain (the node where the chain started), clicking completes the loop
- Visual indicator: the first node pulses/highlights when the cursor is within snap radius of it
- On close: the final wall connects endNode back to the chain's startNode
- ZoneManager detects the closed loop — in Phase 12 this enables room auto-detection
- After closing: return to IDLE

**Starting from an existing node:**
- In IDLE state, clicking near an existing node (within snap radius) starts a new chain FROM that node
- Uses that node's ID as `startNodeId` of the first new wall
- Continuation feels natural — like picking up where you left off

**Escape behaviour:**
- Esc during DRAWING: discard only the current in-progress wall segment (the ghost), keep all previously placed walls in the chain
- Double-Esc or Esc from IDLE: do nothing (already idle)
- The chain is committed wall by wall — placing a wall is immediately written to WorldState, not held in a buffer

#### Node Dragging in Select Mode

When the Select tool is active and the user clicks/drags a wall node:

```
Detection:
  On mousemove (select tool active):
    Check proximity to all nodes in active zone (within 8px screen space)
    If near a node: show node highlight, cursor changes to move cursor

On mousedown near a node:
  Enter NODE_DRAG state
  Store original node position (for cancel)
  Suppress camera orbit during drag

During NODE_DRAG (mousemove):
  Update node position to snapped world position (0.5m grid, or free if Alt held)
  All walls referencing this node immediately rebuild their meshes (live preview)
  Rapier colliders update in real time

On mouseup:
  Confirm drag — node position written to WorldState via worldState.updateNode()
  All affected wall runs re-evaluated and rebuilt
  Return to normal select state

On Esc during drag:
  Restore node to original position
  Rebuild affected walls
  Return to normal select state
```

Node dragging is only available in Select mode — not while any other tool is active.

**Visual node indicators (Select mode):**
- All nodes in active zone shown as small square dots (4px, colour: `--text-dim`)
- Hovered node: larger dot (6px, colour: `--accent`)
- Dragging node: ring indicator showing original position as ghost
- Nodes only visible when Select tool OR Wall tool is active — hidden otherwise

#### WallTool Cursor States

| State | Cursor | Visual |
|---|---|---|
| IDLE, no node nearby | crosshair | snapped dot on ground |
| IDLE, near existing node | move | node highlight pulse |
| DRAWING, free space | crosshair | ghost wall + length label |
| DRAWING, near existing node | move | node highlight + snap indicator |
| DRAWING, near chain start node | pointer | chain-start node pulses green |

#### Updated WallTool State Machine

```
IDLE
  mousemove → check node proximity → highlight nearest node if within snap
  click (free space) → create new node → startNodeId = new node → enter DRAWING
  click (near existing node) → startNodeId = existing node → enter DRAWING

DRAWING
  mousemove → update ghost wall end position
             → check node proximity at end position
             → if near chain start node: highlight it green (loop close indicator)
  click (free space) → create new node → place wall → startNode = new node → stay DRAWING
  click (near existing node, not chain start) → reuse node → place wall → startNode = that node → stay DRAWING
  click (near chain start node) → close loop → place final wall → worldState → IDLE
  dblclick or Enter → finish chain open-ended → IDLE
  Esc → discard current ghost segment → IDLE (prior walls in chain already committed)
```

### Phase 4.9 — Floor System Improvements

Builds on Phase 3 (FloorTool, FloorBuilder) and Phase 4.8 (wall loop closing). Fixes the multiple floors bug, adds auto-floor from closed wall loops, a polygon floor tool, proper floor properties in PropertiesPanel, polygon vertex editing, and Z-fighting prevention.

#### Bug Fix — Multiple Floors Disappearing

**Root cause:** `floor:added` event causes ZoneManager to rebuild all floor meshes for the zone rather than appending the new one. Fix: ZoneManager listens to `floor:added` and only builds the new floor mesh, adding it to the existing `floorsGroup` without touching existing meshes.

```ts
// ZoneManager — fix floor:added handler
this._bus.on('floor:added', ({ zoneId, floor }) => {
  if (zoneId !== this._activeZoneId) return;
  const { floorsGroup } = this._loadedZones.get(zoneId)!;
  const result = FloorBuilder.build(floor, zone.bounds, zone.floors.indexOf(floor));
  floorsGroup.add(result.mesh, result.collisionMesh);
  this._zoneColliders.get(zoneId)!.floors.push(result.collider);
});
```

Each floor mesh is independently tracked in `floorsGroup` by its `editorId` — never wiped on subsequent adds.

#### Z-Fighting Prevention

Floor meshes at the same elevation (e.g. inner room floor on top of outer floor) Z-fight because the GPU can't determine draw order.

Fix: each floor mesh gets a tiny Y offset based on its index within the zone's floors array at the same level:

```ts
// In FloorBuilder.build() — floorIndex is the position in zone.floors filtered to this level
const Z_OFFSET = 0.001;
mesh.position.y = floorDef.elevation + (floorIndex * Z_OFFSET);
```

This is invisible at normal viewing distances but prevents flickering. A floor placed inside another floor will always sit fractionally higher, which is also physically correct. The Rapier collider uses the base elevation without the offset — physics doesn't need sub-millimeter precision here.

#### Auto-Floor from Closed Wall Loop (Phase 4.8 integration)

When `WallTool` closes a loop in Phase 4.8, after the final wall is committed:

```ts
// In WallTool, on loop close:
const loopNodes = this._getChainNodes(); // ordered WallNode[] forming the closed polygon
const points: Vec2[] = loopNodes.map(n => ({ x: n.x, z: n.z }));

// Check if a polygon floor already covers this area — skip if so
const exists = worldState.zones.get(zoneId)?.floors
  .some(f => f.floorMesh.shape === 'polygon' && polygonsOverlap(f.floorMesh.points!, points));

if (!exists) {
  this._bus.emit('floortool:suggest-auto-floor', { points, level: activeFloorLevel });
}
```

React receives `floortool:suggest-auto-floor` and shows a subtle non-blocking prompt (bottom of canvas, not a modal):

```
┌─────────────────────────────────────────────┐
│  Create floor for this room?  [Yes] [Dismiss]│
└─────────────────────────────────────────────┘
```

On "Yes":
1. `worldState.addFloor(zoneId, { shape: 'polygon', points, material: activeFloorMaterial, level: activeFloorLevel, ... })`
2. `FloorBuilder` builds `ShapeGeometry` from points
3. Rapier collider registered
4. Prompt dismisses

On "Dismiss": nothing happens, user can place a floor manually later.

#### Polygon Floor Tool

New tool: `PolygonFloorTool.ts`. Works like the WallTool — click to place vertices, close the loop to finish.

```
States: IDLE → DRAWING → IDLE

IDLE:
  Show snapped cursor dot on ground plane
  On click: place first vertex → enter DRAWING

DRAWING:
  Show placed vertices as dots connected by lines (preview polygon outline)
  Show ghost line from last vertex to current cursor position
  Show filled semi-transparent preview polygon as vertices are added (THREE.ShapeGeometry, 30% opacity)
  Minimum 3 vertices required before closing is allowed

  On click (free space): add new vertex, update preview
  On click (near first vertex, ≥3 vertices placed): close polygon → create floor → IDLE
  On click (near existing vertex, not first): snap to it, add as next vertex
  Esc: remove last placed vertex (step back one vertex)
  Double-Esc or Esc with only 1 vertex: discard entirely → IDLE

On close:
  worldState.addFloor(zoneId, {
    id: uuid(),
    level: activeFloorLevel,
    elevation: activeFloor.elevation,
    ceilingHeight: activeFloor.ceilingHeight,
    floorMesh: {
      shape: 'polygon',
      points: placedVertices,   // Vec2[] in order placed
      material: selectedMaterial,
    }
  })

Grid snap: 0.5m (disable with Alt)
Angle snap: hold Shift for 45° snapping from last vertex
```

Add `PolygonFloorTool` to the Toolbar as a sub-tool of the Floor tool — long press or dropdown on the Floor button shows Rect and Polygon options. Or a separate toolbar button if preferred.

Add to project structure: `src/editor/PolygonFloorTool.ts`

#### Polygon Vertex Editing (Select Mode)

Once a polygon floor exists, its vertices are editable in Select mode — same pattern as node dragging in Phase 4.8.

```
Detection (Select tool active):
  On mousemove over a polygon floor:
    Check proximity to each vertex point (within 8px screen space)
    If near a vertex: highlight it, cursor changes to move cursor

On mousedown near a polygon vertex:
  Enter VERTEX_DRAG state
  Store original vertex position
  Suppress camera orbit

During VERTEX_DRAG (mousemove):
  Update vertex position to snapped world position
  Rebuild floor ShapeGeometry live
  Update Rapier collider

On mouseup:
  Confirm — write updated points back to worldState.updateFloor()
  Return to normal select state

On Esc during drag:
  Restore original vertex position
  Rebuild floor
  Return to normal select state
```

Vertex dots rendered as small squares on polygon floors when Select tool is active — same visual style as wall node dots.

#### Floor PropertiesPanel

When a floor is selected, PropertiesPanel shows floor-appropriate properties:

```
FLOOR — Level G
┌─────────────────────────────────┐
│ Material   [Cobblestone      ▾] │
│ Shape      rect / polygon       │  ← read-only label
│ Level      G (0)                │  ← read-only
│ Elevation  0.00m                │  ← read-only, derived
└─────────────────────────────────┘
```

No position/rotation/scale — those don't apply to floors. Material change triggers mesh rebuild. Shape and level are informational only.

#### Floor Overlap Warning

Two polygon/rect floors at the same level that overlap produce a warning in the editor — a subtle orange outline on the overlapping meshes and a console warning. No hard prevention — the user may intentionally want layered floors with Z-offset. Just a visual hint.

#### FloorBuilder — polygon support confirmation

`FloorBuilder.build()` must handle both `shape: 'rect'` and `shape: 'polygon'`:

```ts
if (floorDef.floorMesh.shape === 'polygon' && floorDef.floorMesh.points) {
  const shape = new THREE.Shape(
    floorDef.floorMesh.points.map(p => new THREE.Vector2(p.x, p.z))
  );
  geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
} else {
  geo = new THREE.PlaneGeometry(zoneBounds.width, zoneBounds.depth);
  geo.rotateX(-Math.PI / 2);
}
```

If this isn't already implemented from Phase 3, it must be added here.



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

### Phase 6.1 — Transform Gizmos & Object Editing

Adds spatial editing gizmos to all editor objects. Builds on Phase 6 (platforms, stairs exist) and Phase 7 (TransformControls already used for props).

#### Scope

| Object | Translate | Rotate | Resize | Notes |
|---|---|---|---|---|
| Platform | XYZ | Y-axis only | width/depth edge handles | Y = change floor height |
| Stair | XZ only | Y-axis only | — | Resize via endpoint nodes |
| Placed object | XYZ | all axes | uniform scale | Confirmed from Phase 7 |
| Wall segment | XZ only | — | — | Moves whole wall, updates both nodes |
| Floor (rect) | XZ only | — | edge handles | Polygon floors via vertex drag (4.9) |

#### GizmoManager.ts (src/editor/)

Centralises all gizmo logic, replaces ad-hoc TransformControls from Phase 7:
- `init()` creates `TransformControls`, attaches to scene, subscribes to `object:selected` / `object:deselected`
- `_attach(id, type, zoneId)` — attaches gizmo to selected mesh, shows/hides axes based on type, attaches resize handles if applicable
- `_detach()` — detaches gizmo, disposes resize handles
- On `objectChange`: writes position/rotation back to WorldState (`updatePlatform`, `updateObject`, `updateNode` for walls, `updateFloor` for rect floors)
- For `"floor"` selections: gizmo is positioned at the **centroid of `floorMesh.points`** (Y = `elevation + 0.3`). Floor meshes sit at world origin in Three.js (geometry is world-space baked), so the mesh position cannot be used directly. Rect floors with no points fall back to the zone bounds center.
- Emits `gizmo:dragging` to suppress camera during drag

Key bindings (only active when something is selected):
- `G` — translate mode
- `R` — rotate mode (platforms, stairs, objects only)
- `S` — scale uniform (objects only)
- `Alt` + drag — disable snap
- `Esc` — deselect

#### ResizeHandleGroup.ts (src/editor/)

Four edge handles (N/S/E/W) as thin flat box meshes on platform and rect floor edges. N/S drag changes depth (opposite edge fixed), E/W drag changes width. Minimum 0.5m x 0.5m. On drag end: `worldState.updatePlatform()` or `updateFloor()` triggers mesh + collider rebuild.

#### Platform Y Handle

Vertical arrow handle above platform center. Drag up/down changes `platform.position.y` in 0.2m snap increments (Alt = free). Cleaner than scroll wheel which only works during initial placement.

#### Move Wall as Segment

`G` with a wall selected translates the whole wall — both endpoint nodes shift by the same XZ delta. Distinct from Phase 4.8 node dragging which moves one node and stretches. On translate end: `worldState.updateNode()` called for both `startNodeId` and `endNodeId`.

#### PropertiesPanel Live Fields

While a gizmo is active: X/Y/Z, rotation Y, width/depth (where applicable) update live as the gizmo moves. Typing a value snaps the gizmo to it. All inputs debounced 150ms before WorldState write.

All numeric inputs across every sub-component use the shared `useFieldDebounce` hook (300 ms, 150 ms for ObjectGeoView). The pattern is `onChange → schedule(commit)`, `onBlur/Enter → flush(commit)`. This ensures every field updates the canvas live while typing and commits immediately on blur or Enter. Covered components: WallGeoView, PlatformGeoView, StairGeoView, ObjectGeoView, VertScreen (elevation), MaterialSection (tile scale/X/Y, roughness, displacement), OpeningRow (offset/width/height/elevation, inner tiles H/V), WallSegmentRow (tile scale). Select elements commit immediately on `onChange` and are excluded.



### Phase 6.2 — Scene Save & Load

You've now built walls, floors, zones, platforms, stairs, and connected wall graphs. Losing all of that on every dev server restart is unacceptable. This phase adds the one thing that makes the editor actually usable day-to-day: save your scene to a JSON file and load it back.

This is intentionally narrow — just the scene file. Game saves, auto-save, editor preferences, and migration logic all stay in Phase 9 where they belong.

#### What Gets Saved

Everything in `WorldState` at the time of saving:
- All zones with their walls, floors, platforms, stairs, objects, scripts, trigger volumes
- Wall nodes
- Zone transitions
- World config (sky, lighting, player settings, default spawn)
- Terrain (if present — encoded as base64 Float32Array)

What does NOT get saved here:
- Game state (flags, player position, inventory) — Phase 9
- Editor preferences (quality, snap, grid) — Phase 9
- Asset/material manifests — those live on disk, not in the scene file

#### WorldSerializer.ts

```ts
export class WorldSerializer {
  serialize(worldState: WorldState): SceneFile {
    const raw = worldState.toJSON();
    // Encode terrain heightData Float32Array → base64 string for JSON
    if (raw.terrain?.heightData instanceof Float32Array) {
      raw.terrain.heightData = this._encodeHeightData(raw.terrain.heightData as Float32Array);
    }
    return raw as SceneFile;
  }

  download(worldState: WorldState): void {
    const json = JSON.stringify(this.serialize(worldState), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href:     url,
      download: `${worldState.metadata.name || 'world'}.json`,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private _encodeHeightData(data: Float32Array): string {
    return btoa(String.fromCharCode(...new Uint8Array(data.buffer)));
  }
}
```

#### WorldLoader.ts

```ts
export class WorldLoader {
  async load(
    json:         unknown,
    worldState:   WorldState,
    zoneManager:  ZoneManager,
    bus:          EventBus
  ): Promise<void> {
    // 1. Basic validation
    const file = json as Partial<SceneFile>;
    if (!file.metadata?.version) throw new Error('Invalid scene file — missing metadata.version');

    // 2. Unload all current zones and clear WorldState
    for (const zoneId of worldState.zones.keys()) {
      zoneManager.unloadZone(zoneId);
    }

    // 3. Decode terrain heightData base64 → Float32Array
    if (file.terrain?.heightData && typeof file.terrain.heightData === 'string') {
      file.terrain.heightData = this._decodeHeightData(file.terrain.heightData);
    }

    // 4. Field migration — add missing fields for older scene files
    this._migrate(file);

    // 5. Load into WorldState
    worldState.loadFromJSON(file as SceneFile);

    // 6. Build meshes for first zone
    const firstZone = file.zones?.[0];
    if (firstZone) await zoneManager.loadZone(firstZone.id);

    // 7. Notify UI
    bus.emit('scene:loaded', { metadata: file.metadata as SceneMetadata });
  }

  private _migrate(file: Partial<SceneFile>): void {
    // Ensure every zone has the fields added in later phases
    for (const zone of file.zones ?? []) {
      zone.nodes          ??= [];
      zone.scripts        ??= [];
      zone.triggerVolumes ??= [];
      // Migrate old wall start/end format → node IDs (Phase 4.6)
      for (const wall of zone.walls ?? []) {
        if ('start' in wall && !('startNodeId' in wall)) {
          const w = wall as any;
          const sNode = { id: uuid(), x: w.start.x, z: w.start.z };
          const eNode = { id: uuid(), x: w.end.x,   z: w.end.z   };
          zone.nodes.push(sNode, eNode);
          (wall as any).startNodeId = sNode.id;
          (wall as any).endNodeId   = eNode.id;
          delete w.start;
          delete w.end;
        }
      }
      // Ensure floors have id field (migration from pre-Phase-6 saves)
      for (const floor of zone.floors ?? []) {
        floor.id ??= uuid();
      }
    }
    // Ensure world config has defaultSpawn
    if (file.world && !file.world.defaultSpawn) {
      file.world.defaultSpawn = {
        position: { x: 0, y: 0, z: 0 },
        zoneId:   file.zones?.[0]?.id ?? '',
        facing:   0,
      };
    }
  }

  private _decodeHeightData(b64: string): Float32Array {
    const binary = atob(b64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Float32Array(bytes.buffer);
  }
}
```

#### SaveLoadPanel.tsx

Shown in the top bar, always visible:

```
┌──────────────────────────────────────────┐
│  [💾 Save]   [📂 Load]   My World  [✏️]  │
│                                          │
│  last saved: never                       │
└──────────────────────────────────────────┘
```

- **Save button** — calls `bus.emit('scene:save', {})` → Three.js side serializes and triggers download
- **Load button** — opens a hidden `<input type="file" accept=".json">`, on file selected reads text and calls `bus.emit('scene:load', { json: parsed })`
- **World name** — editable inline, updates `worldState.metadata.name`
- **Last saved** — updates to current time on each successful save (stored in component state, not WorldState)

On `scene:save` bus event:
```ts
// In SceneManager or a SaveLoadController
bus.on('scene:save', () => {
  serializer.download(worldState);
  bus.emit('scene:saved', { json: serializer.serialize(worldState) });
});
```

On `scene:load` bus event:
```ts
bus.on('scene:load', async ({ json }) => {
  try {
    await loader.load(json, worldState, zoneManager, bus);
  } catch (e) {
    bus.emit('scene:load-error', { message: (e as Error).message });
  }
});
```

On `scene:load-error`: React shows a brief error toast.

#### Keyboard Shortcut

`Cmd+S` / `Ctrl+S` → save. Intercept in `InputManager`:
```ts
if ((e.metaKey || e.ctrlKey) && e.code === 'KeyS') {
  e.preventDefault();
  bus.emit('scene:save', {});
}
```

#### Error Handling

- Save: only fails if `JSON.stringify` throws (shouldn't happen with valid WorldState). Wrap in try/catch, show error toast on failure.
- Load: validate version field, catch all errors, show descriptive error toast. Never partially apply a broken scene file — if migration or load throws, WorldState is not mutated.
- File too large (>50MB): warn before loading, don't block.

#### What This Unlocks

After 6.2 you can:
- Save your scene at the end of a session
- Load it back the next day and continue exactly where you left off
- Share scene files between machines
- Keep multiple scene files as named snapshots

#### New Bus Events

```ts
"scene:save-error": { message: string };
"scene:load-error": { message: string };
```
(Add these to BusEvents in types.ts)



### Phase 6.3 — Wall-Run Gizmo Extensions & Multi-Floor Wall Elevation

Extends the Phase 6.1 gizmo to fully support wall-runs as first-class spatial objects, and adds a working multi-floor wall elevation system.

#### Wall-Run Gizmo

`GizmoManager._wallRunIds` — tracks every wall ID in the selected run (not just nodes).

**Translate (G):**
- Y-axis enabled for walls; previously it was locked to XZ only.
- When the run is moved on Y, `updateWall` is called for every wall in the run with the new `elevation` value.
- Floors whose node IDs are entirely owned by the moved run are co-elevated (checked via `fIds.every(id => movedNodes.has(id))`).
- NodeDragger dots and floor edge lines both track elevation via a unified `nodeY` priority map (wall elevation → floor elevation → platform top-face).

**Rotate (R):**
- `R` key now enabled for walls (previously platforms/stairs only).
- Uses snapshot + `makeRotationY(deltaAngle)` pattern: node positions captured at drag start (`_wallDragSnapshot`), baked with THREE.js sign convention on release.
- `deltaAngle = pivot.rotation.y - _rotateStartAngle` — delta-based so repeated drags accumulate correctly.
- Floors reconstruct automatically because they reference the same nodeIds.

#### WallDef.elevation Field

```typescript
export interface WallDef {
  elevation?: number;   // Y offset from ground (default 0)
  // ... existing fields
}
```

`buildRun()` uses `walls[0].elevation ?? 0` as `runElevation`; all Y positions in the run mesh (body, liner, trim, collider) are offset by this value.

`canMerge()` in `wallRuns.ts` checks both `floor` and `elevation` before merging walls into a run — prevents cross-floor walls from merging into a single mesh that jumps between heights.

#### Multi-Floor Wall Placement

When drawing walls, `WallTool` derives elevation from the active floor's stored `elevation`, falling back to `activeLevel * wallHeight` (default 3.0m per floor, not 3.2m — no slab gap).

Same formula used for:
- Preview mesh Y position during draw
- Node dot Y position
- `WallDef.elevation` on commit
- `FloorTool` floor elevation fallback
- Auto-floor prompt elevation in App.tsx

This places floor-1 walls starting flush at Y=3.0 (the top of floor-0 walls) with no gap.

#### Wall-Run Properties Panel

Two new controls appear in the properties panel when a wall-run is selected:

**Fill closed loop with floor** — button appears only when the run's walls form a closed polygon (detected via `resolveRunNodeIds(runWalls)` — first and last node IDs are equal). Creates a polygon `FloorDef` from the run's node positions at the correct elevation. Equivalent to the auto-floor toast prompt but available at any time from the panel.

**Copy to Floor (0–3)** — row of buttons, current floor disabled. Duplicates the entire run (all walls + nodes, with new IDs) at the target floor's elevation. Openings are duplicated with fresh IDs. Useful for stacking identical floor plans.

### Phase 6.5 — Properties Panel Navigation Redesign

Replaces the flat vertical properties panel with a drilldown navigation system. The panel has a fixed header and a scrollable content area. The root screen shows a list of category rows. Tapping a row pushes a detail screen. A back button in the fixed header returns to the previous screen.

This phase touches only `src/ui/PropertiesPanel.tsx` and its sub-components. No Three.js, no WorldState, no bus events change. All existing data bindings remain — only the presentation layer changes.

---

#### Layout Structure

The panel is split into two parts:

**Fixed header** — never scrolls, always visible:
```
┌─────────────────────────────────┐
│ PROPERTIES              ← back  │  ← top bar: label left, back button right
├─────────────────────────────────┤
│ wall_91bfd929                   │  ← object name (updates per screen)
│ WALL · LEVEL 0                  │  ← object subtitle (updates per screen)
└─────────────────────────────────┘
```

**Scrollable body** — content area below the fixed header, `overflow-y: auto`, `max-height` fills remaining panel space.

The back button is hidden on the root screen and shown on all detail screens. It sits in the top bar row alongside the "PROPERTIES" label — label on the left, back button on the right.

---

#### Navigation Model

A `stack: string[]` state array drives all navigation. Each entry is a screen ID string.

```tsx
const [stack, setStack] = useState<string[]>([]);

const push = (screenId: string) =>
  setStack(prev => [...prev, screenId]);

const pop = () =>
  setStack(prev => prev.slice(0, -1));

const currentScreen = stack.length > 0 ? stack[stack.length - 1] : 'root';
const isRoot = stack.length === 0;
```

There is no animation — screens swap instantly on push/pop. The scroll position of the body resets to 0 on every navigation (use a `key` prop on the scrollable container or an effect).

---

#### Root Screen

A vertical list of category rows. Each row is a `<button>` spanning the full panel width:

```
Category name                  summary text  ›
```

- Left: category label — font-weight 500, full text color
- Right: summary string (compact one-liner of current values) — muted color, smaller size
- Rightmost: chevron-right icon
- Bottom border separating rows
- On click: `push(screenId)`

**Category rows and their summary strings:**

| Screen ID | Label | Summary string |
|---|---|---|
| `geo` | Geometry | `h {height} · t {thickness}` |
| `mat` | Material | `{materialName} · {n} maps` |
| `open` | Openings | `{count} openings` or `none` |
| `seg` | Segments | `{count} walls` |

Actions are **not** a drilldown screen. They render directly on the root screen as a collapsible accordion below the Segments row (see Actions Accordion section below).

Quality is **not** on the root screen. It renders at the bottom of the Material screen, below the Maps section, separated by a divider.

The summary string is computed from current props/state at render time. It is read-only — tapping the row opens the detail screen where values are edited.

Below the category rows, on the root screen only, render an **Actions accordion** — expanded by default, collapsible. Contains:
- Fill closed loop with floor (object-type-specific, shown when applicable)
- Copy to Floor (floor number buttons, current floor disabled)
- Delete button

The accordion header row follows the same style as the drilldown rows (label left, chevron right) but toggles instead of navigating. Chevron points down when expanded, right when collapsed. Content has `gap: 12px` between items and generous button padding (`9px`) so actions don't feel cramped.

The **Quality selector** lives inside the **Material screen**, below the Maps section, separated by a divider. It is not on the root screen.

---

#### Actions Accordion (Root Screen)

The Actions accordion sits on the root screen, below the last drilldown row, above nothing else. It is expanded by default on first render. The user can collapse it by clicking the header.

**Header row:** same visual style as drilldown rows — label "Actions" on the left, chevron on the right. Chevron rotates 180° when expanded. Does not navigate anywhere on click — toggles expanded state.

**Content** (when expanded, `gap: 12px` between items, `padding: 9px` on full-width buttons):
- Object-specific action buttons (e.g. "Fill closed loop with floor" for walls) — shown/hidden based on object type and current state
- "Copy to Floor" — label above a row of floor number buttons (G/1/2/3). Current floor is disabled/greyed
- "Delete" button — danger style, always last

**Collapsed state:** accordion header row only, content hidden. Chevron points right.
**Expanded state:** default. Chevron points down.

Accordion open/closed state is held in local React component state (`useState<boolean>(true)`). It resets to open whenever a new object is selected (i.e. when the panel receives a new `object:selected` event).

#### Detail Screens

Each screen ID maps to a dedicated sub-component:

```tsx
const SCREENS: Record<string, React.FC<DetailProps>> = {
  geo:  GeometryScreen,
  mat:  MaterialScreen,
  open: OpeningsScreen,
  seg:  SegmentsScreen,
  act:  ActionsScreen,
};
```

`DetailProps` is a subset of what `PropertiesPanel` already receives — whichever slice of the selected object's data that screen needs. Pass only what's needed, not the entire selection payload.

Each screen renders its own content freely — inputs, lists, toggles, buttons — with no awareness of the navigation wrapper.

---

#### Header Title Updates

The fixed header title and subtitle update based on current screen:

```tsx
const headerTitle    = isRoot ? selectedObject.id    : SCREEN_TITLES[currentScreen];
const headerSubtitle = isRoot ? objectTypeLabel      : SCREEN_SUBTITLES[currentScreen];
```

```tsx
const SCREEN_TITLES: Record<string, string> = {
  geo:  'Geometry',
  mat:  'Material',
  open: 'Openings',
  seg:  'Segments',
  act:  'Actions',
};

const SCREEN_SUBTITLES: Record<string, string> = {
  geo:  'HEIGHT · THICKNESS',
  mat:  'MATERIAL · MAPS',
  open: 'OPENINGS',
  seg:  'WALL SEGMENTS',
  act:  'ACTIONS',
};
```

---

#### Object Type → Screen Mapping

Different object types expose different screens. The root screen's category list is derived from a config map:

```tsx
type ScreenId = 'geo' | 'mat' | 'open' | 'seg' | 'act' | 'vert';

const OBJECT_SCREENS: Record<EditorObjectType, ScreenId[]> = {
  wall:     ['geo', 'mat', 'open', 'seg'],
  floor:    ['mat', 'vert'],           // vert = polygon vertex list
  platform: ['geo', 'mat'],
  stair:    ['geo', 'mat'],
  object:   ['geo', 'mat'],
  opening:  ['geo', 'mat'],
  terrain:  ['mat'],
  trigger:  [],
};
// Actions accordion always appears on root screen for all object types.
// Quality selector always appears at the bottom of the Material screen.
```

When `selectedObject` changes (bus event `object:selected`), reset `stack` to `[]` so the panel always opens at root for the new selection.

---

#### Scroll Reset

Reset scroll position when navigating:

```tsx
const bodyRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (bodyRef.current) bodyRef.current.scrollTop = 0;
}, [currentScreen]);
```

---

#### Component Structure

```
PropertiesPanel.tsx
  ├── PanelHeader.tsx          ← fixed header: back row (← Properties, detail screens only), title, subtitle
  ├── PanelRoot.tsx            ← root screen: drilldown rows + ActionsAccordion
  ├── ActionsAccordion.tsx     ← expanded-by-default collapsible: object actions + copy-to-floor + delete
  ├── screens/
  │   ├── GeometryScreen.tsx
  │   ├── MaterialScreen.tsx   ← includes Quality selector at bottom
  │   ├── OpeningsScreen.tsx
  │   └── SegmentsScreen.tsx
  └── CategoryRow.tsx          ← reusable row: label + summary + chevron
```

All existing form logic (inputs, material picker, map toggles, copy-to-floor buttons etc.) moves verbatim into the appropriate screen component. No logic changes — only restructuring into these files.

---

#### What Does Not Change

- The panel's position in the layout (right side, fixed height)
- All existing bus event subscriptions (`object:selected`, `object:deselected`, `object:updated`)
- How values are read from and written to the bus — all `onChange` handlers remain identical
- The Quality selector and Delete button behavior
- Any existing TypeScript types

---

#### Implementation Order

1. Create `PanelHeader.tsx` — static layout, back button hidden/shown via prop
2. Create `CategoryRow.tsx` — reusable row component
3. Create `PanelRoot.tsx` — assembles category rows from `OBJECT_SCREENS` config, renders quality + delete below
4. Move existing screen content into individual screen components under `screens/`
5. Rewrite `PropertiesPanel.tsx` to own the `stack` state, render `PanelHeader` + scrollable body that switches between `PanelRoot` and the active detail screen
6. Test: select each object type, verify correct screens appear, verify back navigation works, verify scroll resets, verify all existing inputs still write to bus correctly



### Phase 7 — Object Placement + Model Importer

#### Left Secondary Panel (new UI system)

The editor layout gains a **secondary panel** that slides in from the left, just to the right of the existing toolbar strip. It is dynamic — the panel slot is generic and can host any left-side sub-panel content. Phase 7 introduces it with the Asset Browser as its first occupant. Future phases can add other left panels (e.g. Zone list, Script list) by registering a new panel ID.

**Layout:**
```
┌──────┬──────────────┬───────────────────────────┬─────────────────┐
│      │              │                           │                 │
│Toolbar│ Left Panel  │       Canvas              │ Properties Panel│
│ 64px │  240px       │     (flex: 1)             │    280px        │
│      │ (when open)  │                           │                 │
└──────┴──────────────┴───────────────────────────┴─────────────────┘
```

The left panel has `width: 0` when closed and animates to `240px` when open (CSS transition). The canvas flex-shrinks naturally — no layout recalculation needed.

**`LeftPanelManager` (React state, owned by `App.tsx`):**
```tsx
type LeftPanelId = 'assets' | 'zones' | 'scripts' | null;

const [leftPanel, setLeftPanel] = useState<LeftPanelId>(null);

// Toggling the same tool closes the panel
// Switching to a different tool opens that panel
function setLeftPanelForTool(tool: ToolId): void {
  if (tool === 'object') setLeftPanel(prev => prev === 'assets' ? null : 'assets');
  else setLeftPanel(null);
}
```

Panel opens automatically when the Object tool is selected. Closes when any other tool is selected or when the user clicks the active tool button again.

**`LeftPanel.tsx`** — the generic shell component:
```tsx
interface LeftPanelProps {
  panelId: LeftPanelId;
  onClose: () => void;
}

// Renders the correct sub-panel based on panelId
// Handles open/close animation via CSS class
// Has a consistent header with title + close button
function LeftPanel({ panelId, onClose }: LeftPanelProps) {
  return (
    <div className={`left-panel ${panelId ? 'open' : ''}`}>
      <div className="left-panel-header">
        <span>{PANEL_TITLES[panelId ?? '']}</span>
        <button onClick={onClose}>✕</button>
      </div>
      <div className="left-panel-body">
        {panelId === 'assets' && <AssetBrowser />}
        {panelId === 'zones'  && <ZonePanel />}
        {/* future panels registered here */}
      </div>
    </div>
  );
}
```

**CSS:**
```css
.left-panel {
  width: 0;
  overflow: hidden;
  transition: width 0.2s ease;
  border-right: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  flex-direction: column;
}
.left-panel.open { width: 240px; }
```

---

#### Asset Browser (`src/ui/AssetBrowser.tsx`)

Lives inside the left panel when `panelId === 'assets'`.

**Layout:**
```
┌─────────────────────────────────────┐
│ [search…………………………] [+ Import]       │
├─────────────────────────────────────┤
│ All  Furniture  Props  Structures … │  ← category tabs
├─────────────────────────────────────┤
│ ┌────┐ ┌────┐ ┌────┐               │
│ │    │ │    │ │    │  3-col grid    │
│ └────┘ └────┘ └────┘               │
│  name   name   name                 │
│ ┌────┐ ┌────┐ ┌────┐               │
│ │    │ │    │ │    │               │
│ └────┘ └────┘ └────┘               │
└─────────────────────────────────────┘
```

- Search input filters by label and id, live
- Category tabs: All, Furniture, Props, Structures, Lights, Characters, Vegetation, Other — derived from manifest, not hardcoded
- Asset grid: 3 columns, thumbnail + name + file size, collidable badge when `collidable: true`
- Clicking an asset selects it (highlighted border) and puts `ObjectTool` into placement mode
- Clicking the selected asset again deselects, exits placement mode
- On `assets:loaded` bus event: re-render grid from `assetManager.getMaterialList()`

**Thumbnail:** auto-generated PNG at import time (`/assets/models/thumbnails/<id>.png`). If absent (e.g. first import), show a coloured SVG placeholder derived from the asset's category.

---

#### Model Manifest System

`public/assets/models/manifest.json` — same pattern as material manifest:

```json
{
  "version": "1.0",
  "assets": [
    {
      "id": "prop_bench_01",
      "label": "Wooden Bench",
      "category": "Furniture",
      "path": "/assets/models/prop_bench_01.glb",
      "thumbnail": "/assets/models/thumbnails/prop_bench_01.png",
      "collidable": true,
      "colliderType": "box",
      "tags": ["outdoor", "seating"],
      "dateAdded": "2026-01-01T00:00:00Z"
    }
  ]
}
```

`AssetManager.initAssets()` fetches this on startup, populates registry, emits `assets:loaded`. No hardcoded assets anywhere — if the file doesn't exist, the browser shows empty with only the Import button.

---

#### Model Importer Modal (`src/ui/ModelImporterModal.tsx`)

Opened by the "+ Import model" button in the AssetBrowser header. Uses File System Access API (`showOpenFilePicker`) — Chrome/Edge only, same as material importer. Shows a browser check on open.

**Three-step flow:**

**Step 1 — File pick:**
- Drop zone or click to browse — accepts `.glb`, `.gltf`
- On file selected: show filename, file size, enable Step 2

**Step 2 — Metadata:**
- Label (text input)
- ID (auto-derived from label, editable, monospace — `my label` → `my_label_01`)
- Category (dropdown)
- Collidable toggle (default on)
- Collider type: Box / Mesh hull / None
- Tags (chip input — type and press Enter)

**Step 3 — Import (on confirm):**
1. Copy `.glb` to `public/assets/models/<id>.glb`
2. Generate thumbnail: spawn offscreen `THREE.WebGLRenderer` (128×128), load model, orbit camera to frame it, render one frame, export as PNG → `public/assets/models/thumbnails/<id>.png`
3. Read existing manifest (or create empty), merge new entry, write back
4. Call `AssetManager.initAssets()` to reload — asset appears in browser immediately
5. Show success state with "Import another" / "Done" buttons

Progress log shows each step with status. On error: show message, allow retry.

---

#### Object Placement

- `ObjectPlacer` + GLTF loading via `AssetManager`
- `ObjectTool` Mode A (placing): ghost model follows mouse snapped to nearest floor/platform surface, click to place
- `ObjectTool` Mode B (transform): G/R/S keys, delegates to `GizmoManager` (Phase 6.1)
- Static props with `collidable: true` get Rapier box collider from AABB
- On object move: Rapier body translation updated
- Objects stored in `WorldState`, selectable, PropertiesPanel shows Geometry and Material screens
- Placed object thumbnail shown in PropertiesPanel header for quick identification

---

#### New Bus Events

```ts
"assets:loaded":    { assets: AssetDef[] };   // remove ⏳ marker — now implemented

"leftpanel:close":  Record<string, never>;
```

#### New Files

```
src/
  ui/
    LeftPanel.tsx           ← generic left panel shell with open/close animation
    AssetBrowser.tsx        ← asset grid, search, tabs, selection
    ModelImporterModal.tsx  ← file pick → metadata → import flow
```

#### Add to `src/types.ts`

```ts
export type LeftPanelId = 'assets' | 'zones' | 'scripts' | null;
```

#### Notes for Claude Code

- `LeftPanel` is the only component that knows about the open/close animation. `AssetBrowser` and other sub-panels have no knowledge of the panel system — they just render their content.
- The panel width (240px) is a CSS variable `--left-panel-w` so it can be adjusted without hunting through code.
- `ObjectTool` must listen to `assets:selected` bus event (emitted by `AssetBrowser` on asset click) to enter placement mode, and deactivate when `assets:deselected` is emitted.
- Thumbnail generation uses an offscreen renderer — never the main scene renderer. Dispose it after each thumbnail is generated.
- File System Access API availability check: `if (!('showOpenFilePicker' in window))` → show "Use Chrome or Edge" message, disable the import button.

### Phase 8 — Zones & Transitions

#### What Zones Are For

A zone is a self-contained region of the world. Think of it as a room, a building interior, an outdoor area, or a dungeon floor — any space that has its own walls, floors, objects, and scripts.

The practical reason zones exist is **performance and organisation**. Only one zone is loaded into the Three.js scene and Rapier physics world at a time. When you walk through a door into a building, the outdoor zone is unloaded (meshes disposed, colliders removed) and the indoor zone is loaded in its place. This means you can build a world with dozens of large detailed spaces without them all being in memory simultaneously.

Zones also define **transition boundaries**. A door opening linked to another zone is how the player moves between spaces — the door triggers a fade, the zone swap happens, and the player appears at a spawn point in the new zone. This is the same pattern used in classic RPGs, The Sims, and most games with interior/exterior spaces.

In the editor: zones are how you organise your work. You draw zone boundaries, name them, assign them a type (outdoor / indoor / dungeon), and switch between them using the Zone Panel. Everything you place — walls, floors, objects, scripts — belongs to whichever zone is currently active.

---

#### ZoneTool

Draws a new zone boundary rectangle on the ground plane:

```
IDLE:
  Show existing zone boundaries as dashed outlines on the canvas
  On click: record start point

PLACING:
  Drag to define rect
  On release: open New Zone dialog

New Zone dialog (modal):
  Name input (text)
  Type selector: outdoor / indoor / dungeon (pill buttons)
  Cancel / Create zone buttons

On Create:
  worldState.addZone(zoneDef)
  Set as active zone
  Zone appears in Zone Panel immediately
```

---

#### Zone Panel (`src/ui/ZonePanel.tsx`)

Lives in the left panel slot (`panelId === 'zones'`). Opens automatically when the Zone tool is active. This panel is for **world-level navigation** — seeing and switching between zones — not for inspecting a selected object (that belongs in the Properties Panel).

**Browse mode (default — always):**

```
┌──────────────────────────────────────┐
│ ZONES                        [+ New] │
├──────────────────────────────────────┤
│ Town Square              outdoor     │  ← active zone, blue tint, no Enter
│ editing                              │
├──────────────────────────────────────┤
│ Tavern Interior          indoor      │
│ 8 walls · 2 floors      [Enter ›]   │
├──────────────────────────────────────┤
│ Dungeon Level 1          dungeon     │
│ 12 walls · 1 floor      [Enter ›]   │
└──────────────────────────────────────┘
```

- Active zone: blue left border, blue name, "editing" label instead of Enter button
- Other zones: Enter button triggers `zone:enter { zoneId }` → ZoneManager swap with fade
- Type badges: outdoor (grey), indoor (blue), dungeon (red)
- "+ New" button opens New Zone dialog

**The Zone Panel never enters a "link picker" mode.** Transition linking is handled entirely inside the Properties Panel (see below). The Zone Panel always stays in browse mode.

---

#### Transition Linking — Properties Panel Flow

When a door opening is selected, the Properties Panel shows a "Zone link" row in the opening's root screen. The entire linking flow is a drill-down within the Properties Panel:

```
Opening root screen
  ├── Geometry  ›
  └── Zone link ›          ← shows "none" or "✓ Zone name"

Zone link screen (drill-down):
  LINKED ZONE
  [No zone linked]         ← or green pill showing linked zone name + unlink button
  
  [Spawn point]  x:1 · y:0 · z:1 · 180°   ← shown when linked
  [Effect]       Fade · 0.3s               ← shown when linked
  
  [Link to zone… / Change linked zone…]    ← button always present

Pick zone screen (drill-down from Link button):
  "Choose the zone this door leads to:"
  
  Town Square    outdoor   ← greyed out, "current zone — cannot link to itself"
  Tavern Interior indoor   ← clickable, selects and confirms immediately
  Dungeon Level 1 dungeon  ← clickable
```

Selecting a zone in the picker immediately confirms the link and navigates back to the Zone link screen showing the new linked zone. No separate confirm step needed — selection is confirmation.

The left Zone Panel is completely unaffected during this entire flow.

---

#### ZoneManager

Manages which zone's meshes and colliders are in the scene at any time:

- `loadZone(zoneId)` — builds all meshes and registers all Rapier colliders for a zone
- `unloadZone(zoneId)` — disposes all meshes, removes ALL Rapier colliders for that zone (walls, floors, platforms, stairs, sensors)
- Only one zone loaded at a time in play/preview mode
- In editor mode: active zone fully loaded, other zones shown as ghost outlines only (dashed boundary lines, no geometry)
- On `zone:enter { zoneId }`: ZoneManager triggers TransitionManager

---

#### TransitionManager

Handles the actual zone swap:

```
1. Fade screen to black (CSS overlay, 0.3s)
2. ZoneManager.unloadZone(fromZone)
3. ZoneManager.loadZone(toZone)
4. Teleport player/camera to transition.spawnPoint
5. Fade back in (0.3s)
6. Emit preview:zone-entered { zoneName }
```

In editor mode (no character): clicking a linked door opening in the Properties Panel triggers an editor jump — same fade, same zone swap, camera moves to the new zone center. No character involved.

---

#### New Bus Events

```ts
"zone:enter":       { zoneId: string };           // user clicks Enter in Zone Panel
"zone:jump":        { zoneId: string };            // editor camera jump (no character)
"transition:fired": { transitionId: string };      // character walked through door
```

---

#### Zones vs Floors — When to Use Each

Both zones and floors handle vertical multi-level spaces, but they serve different purposes:

**Use floors within a zone when:**
- The levels are always loaded together (a small 2-floor shop)
- The player can see between levels (open mezzanine, balcony)
- Performance is not a concern at that scale

**Use separate zones per level when:**
- The levels are large enough that you don't want them all in memory simultaneously (a 10-floor dungeon tower)
- Each level has a distinct feel that benefits from a full load/unload transition
- You want a loading screen / fade effect between floors

**Stair openings can link zones** the same way door openings do. A stair with a `linkedZoneId` triggers a zone transition when the player reaches the top or bottom — the current zone unloads, the destination zone loads, and the player spawns at the stair's arrival point in the new zone. This is identical to a door transition, just vertical.

In `StairDef`, openings at the top and bottom work the same as `Opening` on a wall:
```ts
// Addition to StairDef
topOpening?:    StairOpening;   // zone link at top of stair
bottomOpening?: StairOpening;   // zone link at bottom of stair

export interface StairOpening {
  linkedZoneId:       string | null;
  linkedTransitionId: string | null;
}
```

There is no right answer — it's a design decision per space. The editor supports both. The Zone Panel shows floor count per zone as a hint (`8 walls · 2 floors`) so you can see at a glance how a zone is structured.

---

#### Help Tooltips (`?` buttons)

Several places in the UI have concepts that benefit from a brief explanation. Add a small `?` button next to section headers or labels in these locations. Clicking it shows a non-blocking tooltip (not a modal — a small popover that dismisses on click-outside).

**Locations and copy:**

| Location | Trigger | Tooltip text |
|---|---|---|
| Zone Panel header | `?` next to "ZONES" label | "Zones are separate areas of your world — outdoor spaces, building interiors, dungeon floors. Only one zone is loaded at a time. Use the Floor selector inside a zone for multi-level spaces that should always be in memory together." |
| New Zone dialog title | `?` next to "New zone" | "Each zone is an independently loaded space. A small building might be one zone with multiple floors. A large dungeon tower might use one zone per floor so levels load and unload as the player moves through them." |
| Zone link screen in Properties Panel | `?` next to "LINKED ZONE" | "Linking a door or stair to another zone creates a transition — when the player walks through, the current zone unloads and the destination zone loads. Set the spawn point to where the player should appear in the new zone." |
| Floor level selector (G/1/2/3 tabs) | `?` next to "FLOOR" label | "Floors are levels within this zone. Use floors when the levels should always be loaded together. For large spaces where you want levels to load independently, create separate zones and link them via stair openings." |

**`HelpTooltip` component (`src/ui/HelpTooltip.tsx`):**

```tsx
interface HelpTooltipProps {
  text: string;
}

function HelpTooltip({ text }: HelpTooltipProps) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: 16, height: 16,
          borderRadius: '50%',
          border: '1px solid var(--border)',
          background: 'none',
          color: 'var(--muted)',
          fontSize: 10,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 600,
          lineHeight: 1,
        }}
        aria-label="Help"
      >?</button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 49 }}
          />
          <div style={{
            position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
            transform: 'translateX(-50%)',
            width: 220, padding: '8px 10px',
            background: 'var(--raised)', border: '1px solid var(--border)',
            borderRadius: 'var(--r)', fontSize: 11, lineHeight: 1.6,
            color: 'var(--muted)', zIndex: 50,
            boxShadow: '0 4px 12px rgba(0,0,0,.3)',
          }}>
            {text}
          </div>
        </>
      )}
    </div>
  );
}
```

Usage:
```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
  <span className="lp-title">ZONES</span>
  <HelpTooltip text="Zones are separate areas of your world..." />
</div>
```

---

#### New Files

```
src/
  ui/
    ZonePanel.tsx           ← zone list, browse mode only, lives in left panel slot
    ZoneNamingDialog.tsx    ← new zone modal (name + type)
    HelpTooltip.tsx         ← reusable ? popover component
  editor/
    ZoneTool.ts             ← rect draw on canvas → opens ZoneNamingDialog
```

### Phase 9 — Full Persistence

Scene save/load was handled in Phase 6.2. This phase adds everything else: game state persistence, editor preferences, auto-save, and a robust startup restore flow. By the end of this phase, nothing is ever lost.

#### What Phase 6.2 Already Covers (do not re-implement)
- `WorldSerializer.download()` and `WorldLoader.load()`
- `WorldLoader._migrate()` — field migration for old scene files
- Save/Load buttons in SaveLoadPanel, `Cmd+S` shortcut
- All `scene:*` bus events

#### Auto-Save (Scene File Backup)

A safety net — not a replacement for the explicit Save button:

```ts
setInterval(() => {
  const json = serializer.serialize(worldState);
  localStorage.setItem('worldeditor_autosave', JSON.stringify(json));
  localStorage.setItem('worldeditor_autosave_ts', Date.now().toString());
}, 60_000); // every 60 seconds
```

On startup: if autosave exists and is newer than last explicit save, show restore prompt — "Unsaved work found from [X minutes ago]. Restore?" Restore loads the autosave. Discard deletes it.

#### GameStateManager.ts (`src/scripting/`)

Owns all runtime game state — completely separate from the scene file:
- Tracks player position, current zone, facing, flags, fired one-shots, inventory
- Auto-saves to `localStorage` (`worldeditor_gamesave`) every 30 seconds during preview mode
- Also saves on every zone transition
- `load()` — restores from localStorage on Continue
- `clear()` — wipes save on New Game
- Syncs flags from `ScriptEngine` via `flag:set` bus event
- Syncs player position from `CharacterController` via `character:position-update`

#### PreferencesManager.ts (`src/core/`)

User-specific settings that never belong in the scene file:
- Quality (texture scale, shadow map size, shadows, fog, antialias)
- Grid visible, snap enabled, snap unit, camera speed
- Loaded on app boot before anything else
- Written to `localStorage` (`worldeditor_prefs`) immediately on every change — no Apply button
- Emits `prefs:changed` so React UI reflects current state

#### SaveLoadPanel — Full Version

Extends Phase 6.2 panel. Game save controls only visible in preview/play mode:

```
EDITOR MODE:
[💾 Save]  [📂 Load]   My World [✏️]   Last saved: 2 min ago   [● Auto-save]

PREVIEW MODE (additional row):
[▶ New Game]  [↺ Continue]  [✕ Clear Save]   Game save: 3 flags, Zone 2
```

#### Startup Flow

1. `preferencesManager.load()` — apply quality, snap, grid
2. Check autosave — if found and recent, show restore prompt
3. Otherwise start with empty scene or last opened (`preferences.lastOpenedScene`)

#### New Bus Events
```ts
"scene:autosave":            Record<string, never>;
"prefs:changed":             { prefs: EditorPreferences };
"script:load-save":          { flags: Record<string,boolean>; firedOneShots: string[] };
"character:position-update": { position: Vec3; zoneId: string; facing: number };
```

#### New Files
```
src/core/PreferencesManager.ts
src/scripting/GameStateManager.ts
```


### Phase 10 — Preview Mode + Character Controller

The world becomes walkable. The character is built on Rapier's `KinematicCharacterController` from day one — not a prototype, game-ready physics from the start.

---

#### Character Setup

The character has two valid configurations. Both use the same `CharacterBody` and `CharacterController` — only the visual representation differs.

**Option A — Capsule only (default)**
No mesh attached. The physics capsule moves through the world invisibly. The camera is attached directly to the capsule position. Good for FPS testing, top-down games, or when you just want to walk around without worrying about a character model.

**Option B — Capsule + GLTF model**
A GLTF model loaded via `AssetManager` is attached to the capsule as a child `THREE.Group`. The model follows the physics body. The camera is separate — it reads position from `CharacterBody` and applies its own offset (FPS: at eye level, third-person: behind/above). In FPS mode the model is hidden. In third-person the model is visible.

Both options set via `CharacterDef.modelAssetId`:
```ts
modelAssetId?: string | null;  // null = capsule only, no mesh
```

Character settings (accessible from SpawnPointTool properties in PropertiesPanel):
- Camera mode: FPS / Third-person
- Model: None (capsule) / asset picker from manifest
- Move speed, jump height, FOV (FPS), third-person distance

Stored in `worldConfig.playerSettings`, persists in scene file.

---

#### CharacterBody.ts

```ts
export class CharacterBody {
  readonly capsuleRadius     = 0.3;
  readonly capsuleHalfHeight = 0.6;

  init(spawnPosition: THREE.Vector3): void {
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(spawnPosition.x, spawnPosition.y, spawnPosition.z);
    this._body     = physicsWorld.world.createRigidBody(bodyDesc);
    this._collider = physicsWorld.world.createCollider(
      RAPIER.ColliderDesc.capsule(this.capsuleHalfHeight, this.capsuleRadius), this._body
    );
    this._kcc = physicsWorld.world.createCharacterController(0.01);
    this._kcc.enableAutostep(0.5, 0.2, true);
    this._kcc.enableSnapToGround(0.3);
    this._kcc.setSlideEnabled(true);
    this._kcc.setMaxSlopeClimbAngle(45 * Math.PI / 180);
  }

  move(desired: THREE.Vector3): void {
    this._kcc.computeColliderMovement(this._collider, desired);
    const mv  = this._kcc.computedMovement();
    const pos = this._body.translation();
    this._body.setNextKinematicTranslation({
      x: pos.x + mv.x, y: pos.y + mv.y, z: pos.z + mv.z
    });
  }

  get position(): THREE.Vector3 { ... }
  get isGrounded(): boolean { return this._kcc.computedGrounded(); }
  dispose(): void { ... }
}
```

---

#### CharacterController.ts

Reads input, computes movement, delegates physics to `CharacterBody`, updates camera and optional model mesh.

```ts
update(dt: number): void {
  // 1. Read WASD → local direction
  // 2. Rotate by yaw → world direction
  // 3. Apply move speed
  // 4. Accumulate gravity (velocity.y -= 20 * dt unless grounded)
  // 5. Jump (Space, grounded only)
  // 6. CharacterBody.move(desiredMovement)
  // 7. Update camera from CharacterBody.position
  // 8. If model attached: update model position/rotation
  // 9. Check interact ray (see Interact section)
  // 10. TriggerSystem.update()
}
```

**Mouse look** (pointer lock):
- `dx` → yaw, `dy` → pitch (clamped ±80°)
- FPS: camera rotation = yaw + pitch directly
- Third-person: camera orbits character at `thirdPersonDistance` + `thirdPersonHeight`

---

#### Character Model (Option B)

```ts
// On spawn:
const gltf = await assetManager.loadGLTF(modelAssetId);
this._modelRoot = gltf.scene.clone();
this._mixer     = new THREE.AnimationMixer(this._modelRoot);
scene.add(this._modelRoot);

// On update:
this._modelRoot.position.copy(feetPosition);  // body.position.y - capsuleHalfHeight - capsuleRadius
this._modelRoot.rotation.y = this._yaw;
this._modelRoot.visible = (settings.cameraMode === 'thirdperson');
```

**Animations** — play clips by convention name: `idle`, `walk`, `run`, `jump`.
- Crossfade with `mixer.clipAction(clip).fadeIn(0.15)`
- Missing clips silently skipped — not every model has all four
- Animation support is best-effort: if no animations exist, character still works

---

#### Interact System

Player presses `E` to interact with nearby objects — foundation for NPC conversations, item pickups, door triggers, levers.

**Detection:**
- Each frame: ray cast from camera in look direction, max 2.5m
- Hits mesh with `userData.interactable === true` → show HUD prompt `[E] {label}`
- On `E` press: `scriptEngine.fire('on_interact', hitMesh.userData.editorId, context)`

**Making an object interactable:**
- "Interactable" toggle in PropertiesPanel object properties
- Optional `interactLabel` field: "Open", "Talk", "Pick up" etc. — shown in HUD

```ts
// Additions to ObjectProperties
export interface ObjectProperties {
  interactable:    boolean;
  interactLabel?:  string;       // HUD prompt label, default "Interact"
  npcSpawn:        boolean;
  lootTableId:     string | null;
  triggerEventId:  string | null;
}
```

---

#### TriggerSystem.ts

Detects Rapier sensor overlaps each frame. Handles door sensors (Phase 5) and trigger volume sensors (Phase 10.5):

```ts
update(_dt: number): void {
  if (!this._characterCollider) return;
  this._currentOverlaps.clear();
  physicsWorld.world.intersectionsWith(this._characterCollider, (other) => {
    this._currentOverlaps.add(other.handle);
    // Door sensor
    const transitionId = this._doorSensorMap.get(other.handle);
    if (transitionId) bus.emit('character:triggerdoor', { transitionId });
    // Trigger volume — fire on_player_enter on first overlap
    const volumeId = this._volumeSensorMap.get(other.handle);
    if (volumeId && !this._activeVolumes.has(other.handle)) {
      this._activeVolumes.add(other.handle);
      scriptEngine.fire('on_player_enter', volumeId, {});
    }
  });
  // on_player_exit — was active, no longer overlapping
  for (const handle of this._activeVolumes) {
    if (!this._currentOverlaps.has(handle)) {
      this._activeVolumes.delete(handle);
      const volumeId = this._volumeSensorMap.get(handle);
      if (volumeId) scriptEngine.fire('on_player_exit', volumeId, {});
    }
  }
}
```

---

#### SpawnPointTool

- Arrow + character silhouette icon in editor, invisible in preview
- One per world — placing a new one moves the existing one
- Stored as `worldConfig.defaultSpawn`
- PropertiesPanel shows: position XYZ, facing (degrees), camera mode, model asset picker, move speed, jump height, FOV

---

#### Preview vs Start Game

| | Preview | Start Game |
|---|---|---|
| Spawn position | Editor camera focus | `worldConfig.defaultSpawn` |
| Game save | Ignored | Loaded if exists |
| Flags | Cleared | Restored |
| Scripts | Active | Active |
| Purpose | Quick geometry check | Full game flow test |

Play button: single click = Preview, long press / dropdown = Start Game.
`PreviewController.enter(mode: 'preview' | 'game')`

---

#### PreviewHUD

- Centred crosshair (FPS) or none (third-person)
- Interact prompt: `[E] {label}` — fades in when interactable in range, fades out when not
- Zone name toast: fades in on zone transition, fades out after 3s
- Top-left: current zone name
- Bottom-right: `Esc to exit`

---

#### New Files

```
src/
  preview/
    CharacterBody.ts        ← Rapier KCC wrapper
    CharacterController.ts  ← input + camera + model + interact ray
    TriggerSystem.ts        ← sensor overlap detection, enter/exit events
    PreviewController.ts    ← enter/exit preview mode, pointer lock
  ui/
    PreviewHUD.tsx          ← crosshair, interact prompt, zone toast, Esc hint
  editor/
    SpawnPointTool.ts       ← place/move default spawn marker
```

---


### Phase 10.5 — Scripting / Event System

Sits after Phase 10 because scripts need a character to trigger them.

---

#### Trigger Volumes — Editor Experience

**TriggerVolumeTool.ts** — state machine:

```
IDLE:
  Show existing trigger volumes as amber dashed wireframe boxes
  Label floats above each volume showing its name
  On click (free space): record start point → enter PLACING

PLACING:
  Drag to define box footprint (XZ, same as FloorTool)
  Scroll wheel: adjust height (default 2.5m)
  On release: create TriggerVolume → IDLE

Selected (Select tool):
  Solid amber wireframe + resize handles (same as PlatformTool)
  PropertiesPanel shows trigger volume properties
```

**Trigger volumes:**
- Editor mode: amber dashed wireframe, name label floating above
- Preview/game mode: invisible (`userData.editorOnly = true`)
- Selected: solid amber wireframe + resize handles

**Trigger volume PropertiesPanel:**

```
trigger_vol_a1b2
TRIGGER VOLUME

Name       [Entry Hall Trigger  ]
Size       W [4.0]  H [2.5]  D [3.0]
Position   X [0.0]  Y [0.0]  Z [0.0]

SCRIPTS USING THIS VOLUME
  on_enter: Play music            ›
  on_exit:  Stop music            ›
  [+ Add script using this volume]

[Delete]
```

"Scripts using this volume" lists any `ScriptDef` in the zone whose trigger references this volume ID. Clicking one navigates to it in the Script Panel.

---

#### Script Panel — Full Spec

Lives in left panel slot (`panelId === 'scripts'`). Opens via toolbar "Scripts" button or automatically when TriggerVolumeTool is active.

The Script Panel has three tabs reflecting the three script levels:

```
[World]  [Zone]  [Object]
```

- **World tab** — scripts on `worldConfig.scripts[]`. Always active. For quest logic, global timers, cross-zone reactions.
- **Zone tab** — scripts on the active `zone.scripts[]`. For room-specific logic, ambient triggers, zone-wide traps.
- **Object tab** — scripts on a selected object's `scripts[]`. Only shown when an object is selected. For per-object behaviour like interact responses, animations, dialogue.

Adding a script from any tab creates it in the correct collection. The PropertiesPanel Scripts screen (Phase 10.6) opens the Script Panel on the Object tab pre-filtered to the selected object.

**List view:**
```
┌─────────────────────────────────────┐
│ SCRIPTS                    [+ New]  │
├─────────────────────────────────────┤
│ Play entry music          enabled ● │
│ on_player_enter · 1 action      ›   │
├─────────────────────────────────────┤
│ Open gate when lever pulled   ● ›   │
│ on_interact · 2 conditions · 3 acts │
├─────────────────────────────────────┤
│ Boss spawn                disabled  │
│ on_flag_set · 1 action          ›   │
└─────────────────────────────────────┘
```

**Script editor (drill-down):**
```
← Scripts
Script: "Play entry music"

TRIGGER
  Type      [on_player_enter ▾]
  Target    [Entry Hall Trigger ▾]  ← picks from trigger volumes in zone
  Delay     [0s]
  One-shot  [□]

CONDITIONS  [+ Add]
  (none)

ACTIONS     [+ Add]
  1  play_sound
     Sound  [ambient_music_01 ▾]
     [×]

[Enable/Disable]  [Delete script]
```

`run_script` action shows a monospace textarea for the JS body.

---

#### ScriptEngine.ts

Key behaviours:
- `loadZone(zone)` called by ZoneManager on zone load
- `fire(triggerType, targetId, context)` called by TriggerSystem, CharacterController (interact), TransitionManager
- **Inactive in editor mode** — no triggers fire while editing
- **Active in preview/game mode**
- `on_game_start` fires once when `PreviewController.enter('game')` is called

---

#### Interact Trigger

`on_interact` fires when player presses E near an object with `interactable: true`. The `targetId` is the object's `editorId`. Scripts reference it by that ID in their trigger config.

---

#### Action Implementations

| Action | Implementation |
|---|---|
| `play_sound` | `bus.emit('audio:play', { id, position })` |
| `show_dialogue` | `bus.emit('dialogue:show', { speaker, lines })` |
| `move_object` | Find mesh by editorId, tween to target position |
| `play_animation` | Find mixer by editorId, play named clip |
| `spawn_npc` | `bus.emit('npc:spawn', { npcId, position })` — Phase 13 |
| `despawn_object` | `bus.emit('object:despawn', { id })` |
| `change_material` | `worldState.updateObject()` → ZoneManager rebuilds |
| `open_door` | Play open animation or remove door collider |
| `close_door` | Reverse of open_door |
| `set_flag` | `scriptEngine.setFlag(flag)` |
| `clear_flag` | `scriptEngine.clearFlag(flag)` |
| `fire_event` | `scriptEngine.fire('on_flag_set', eventId, {})` |
| `fade_screen` | `bus.emit('overlay:fade-in', { color, duration })` |
| `teleport_player` | `bus.emit('character:teleport', { position, facing })` |
| `show_ui` | `bus.emit('ui:show', { elementId })` |
| `give_item` | `gameStateManager.addItem(itemId)` |
| `run_script` | Sandboxed `new Function('ctx', body)(ctx)` |

---

#### New Files

```
src/
  scripting/
    ScriptEngine.ts         ← runtime execution, flag system
    GameStateManager.ts     ← game save, auto-save
  ui/
    ScriptPanel.tsx         ← script list + editor, in left panel slot
    DialogueOverlay.tsx     ← in-game dialogue display
  editor/
    TriggerVolumeTool.ts    ← place/resize trigger volumes
```

---

#### Updated Bus Events

```ts
// Phase 10
"character:interact":       { objectId: string };
"character:interact-range": { objectId: string; label: string } | null;

// Phase 10.5
"audio:play":               { id: string; position?: Vec3 };
"dialogue:show":            { speaker: string; lines: string[] };
"object:despawn":           { id: string };
"npc:spawn":                { npcId: string; position: Vec3 };
"ui:show":                  { elementId: string };
  "entity:registered":        { entityType: string; caps: EntityCapabilities };  // dev/debug only
```



#### Phase 10.5 — Stub / Planned-Phase Index

Actions and triggers that are registered but not yet implemented, and where they land:

| Stub | Status | Planned phase |
|---|---|---|
| `play_animation` | console.warn | Phase 10.6 (ActionDispatcher + animation clip discovery) |
| `on_timer` | never fires | Phase 10.6 (ScriptEngine timer loop) |
| `play_sound` | bus event only, no audio | Phase 12 (Audio system — sound asset manifest, positional audio) |
| `open_door` / `close_door` | console.warn | Phase 13 (NPC + door animation system) |
| `spawn_npc` | console.warn | Phase 13 (NPC system) |
| `on_health_zero` | never fires | Phase 13 (NPC/enemy health system) |
| `fade_screen` | bus event fires, no visual | Unassigned — needs a `<FadeOverlay>` React component listening to `overlay:fade-in` |
| `change_material` | console.warn | Unassigned — small (call `worldState.updateObject` with new material) |
| Branching dialogue | linear `lines[]` only | Phase 12 (Dialogue system redesign) |

---

### Phase 10.6 — Entity Event System

Sits immediately after Phase 10.5. Refactors `ScriptEngine` from a zone-level script runner into a proper entity-aware event router. No changes to the `ScriptDef` data format — scenes saved in 10.5 load correctly in 10.6. The change is entirely internal to the engine and the editor UI.

---

#### The Problem with 10.5's Approach

In Phase 10.5, `ScriptEngine` holds a flat list of scripts from the active zone and loops through them on every `fire()` call. This works for a small zone with a handful of scripts, but:

- Lookup is O(n) over all scripts every time any trigger fires
- New entity types (NPCs, enemies, items) require special-case handling in the engine
- The Script Panel is zone-level only — there's no way to see "what scripts affect this specific object" without reading through all of them
- Timer triggers require polling
- No entity knows what events it can emit or receive — action dropdowns are flat lists of all possible types regardless of what makes sense for the target

---

#### EntityRegistry

Every entity type registers its capabilities once, at startup:

```ts
interface EntityCapabilities {
  emits:    TriggerType[];    // events this entity type can fire
  receives: ActionType[];     // actions this entity type can handle
}

class EntityRegistry {
  private _caps: Map<EditorObjectType | 'player' | 'volume', EntityCapabilities> = new Map();

  register(type: string, caps: EntityCapabilities): void {
    this._caps.set(type, caps);
  }

  emits(type: string): TriggerType[]   { return this._caps.get(type)?.emits   ?? []; }
  receives(type: string): ActionType[] { return this._caps.get(type)?.receives ?? []; }
}

export const entityRegistry = new EntityRegistry();
```

Registrations happen in each system's `init()` — not hardcoded in the engine:

```ts
// In ObjectPlacer.init():
entityRegistry.register('object', {
  emits:    ['on_interact'],
  receives: ['play_animation', 'move_object', 'change_material', 'despawn_object', 'show_dialogue'],
});

// In TransitionManager.init():
entityRegistry.register('door', {
  emits:    ['on_interact', 'on_open', 'on_close'],
  receives: ['open_door', 'close_door', 'play_animation'],
});

// In CharacterController.init():
entityRegistry.register('player', {
  emits:    ['on_player_enter', 'on_player_exit', 'on_interact'],
  receives: ['teleport_player', 'give_item', 'fade_screen', 'show_dialogue', 'show_ui'],
});

// In TriggerVolumeTool / TriggerSystem:
entityRegistry.register('volume', {
  emits:    ['on_player_enter', 'on_player_exit'],
  receives: [],
});

// Phase 13 — NPC system registers itself:
entityRegistry.register('npc', {
  emits:    ['on_interact', 'on_health_zero', 'on_player_detected', 'on_dialogue_end'],
  receives: ['spawn_npc', 'despawn_object', 'play_animation', 'show_dialogue', 'move_object'],
});

// Phase 13 — Enemy:
entityRegistry.register('enemy', {
  emits:    ['on_health_zero', 'on_player_detected', 'on_attack'],
  receives: ['despawn_object', 'play_animation', 'move_object'],
});
```

New entity types in Phase 13+ just call `entityRegistry.register()` in their own `init()`. ScriptEngine does not change.

---

#### ScriptEngine — Index-Based Routing

Replace the flat script loop with a two-level index keyed by `(triggerType, targetId)`:

```ts
type ScriptIndex = Map<TriggerType, Map<string, ScriptDef[]>>;
//                       ↑               ↑
//                  trigger type     target entity ID

class ScriptEngine {
  private _index: ScriptIndex = new Map();
  private _timers: TimerEntry[] = [];

  loadZone(zone: ZoneDef): void {
    this._index.clear();
    this._timers = [];

    for (const script of zone.scripts.filter(s => s.enabled)) {
      // Index by trigger type + target ID
      const { type, targetId = '*' } = script.trigger;
      if (!this._index.has(type)) this._index.set(type, new Map());
      const byTarget = this._index.get(type)!;
      if (!byTarget.has(targetId)) byTarget.set(targetId, []);
      byTarget.get(targetId)!.push(script);

      // Register timer triggers
      if (type === 'on_timer') {
        this._timers.push({ script, elapsed: 0, interval: script.trigger.interval ?? 5 });
      }
    }
  }

  fire(triggerType: TriggerType, targetId: string, context: Partial<ScriptContext>): void {
    const byTarget = this._index.get(triggerType);
    if (!byTarget) return;

    // Scripts targeting this specific entity
    const specific = byTarget.get(targetId) ?? [];
    // Scripts targeting any entity of this trigger type (wildcard)
    const wildcard = byTarget.get('*') ?? [];

    for (const script of [...specific, ...wildcard]) {
      if (script.oneShot && this._firedOnce.has(script.id)) continue;
      if (!this._checkConditions(script.conditions)) continue;
      this._executeActions(script.actions, { ...context, objectId: targetId });
      if (script.oneShot) this._firedOnce.add(script.id);
    }
  }

  update(dt: number): void {
    // Timer triggers — priority queue would be ideal; array is fine for small counts
    for (const entry of this._timers) {
      entry.elapsed += dt;
      if (entry.elapsed >= entry.interval) {
        entry.elapsed = entry.script.trigger.repeat ? 0 : Infinity;
        this.fire('on_timer', entry.script.id, {});
      }
    }
  }
}
```

Lookup is now O(1) for specific-target scripts, O(k) where k is the number of matching scripts — not O(n) over all scripts in the zone.

---

#### Action Dispatch — Entity-Aware

Actions are dispatched through a typed handler registry, not a switch statement:

```ts
type ActionHandler = (action: ScriptAction, context: Partial<ScriptContext>) => void;

class ActionDispatcher {
  private _handlers: Map<ActionType, ActionHandler> = new Map();

  register(type: ActionType, handler: ActionHandler): void {
    this._handlers.set(type, handler);
  }

  dispatch(action: ScriptAction, context: Partial<ScriptContext>): void {
    const handler = this._handlers.get(action.type);
    if (!handler) { console.warn(`No handler for action: ${action.type}`); return; }
    handler(action, context);
  }
}

export const actionDispatcher = new ActionDispatcher();
```

Each system registers its own action handlers in `init()`:

```ts
// ObjectPlacer registers:
actionDispatcher.register('play_animation', (action, ctx) => {
  const mixer = this._mixers.get(action.targetId!);
  if (!mixer) return;
  const clip = this._clips.get(action.targetId!)?.get(action.animation!);
  if (!clip) return;
  mixer.clipAction(clip).reset().fadeIn(0.15).play();
});

actionDispatcher.register('move_object', (action, ctx) => {
  // tween object to action.position
});

// TransitionManager registers:
actionDispatcher.register('open_door', (action, ctx) => { ... });
actionDispatcher.register('close_door', (action, ctx) => { ... });

// CharacterController registers:
actionDispatcher.register('teleport_player', (action, ctx) => { ... });
actionDispatcher.register('give_item', (action, ctx) => {
  gameStateManager.addItem(action.itemId!);
});
```

ScriptEngine calls `actionDispatcher.dispatch(action, context)` — it has no knowledge of what any action does. Adding a new action type means registering a handler in the relevant system. No ScriptEngine changes ever.

---

#### Animation Clips — Stored at Import, Managed at Placement

**At import time** (`ModelImporterModal`):
```ts
// After loading GLTF to generate thumbnail:
const clips = gltf.animations.map(a => a.name);
manifestEntry.animations = clips;   // stored in manifest.json
```

**At placement time** (`ObjectPlacer.place()`):
```ts
const asset = assetManager.getAsset(assetId);
if (asset.animations?.length) {
  const mixer = new THREE.AnimationMixer(mesh);
  const clipMap = new Map<string, THREE.AnimationClip>();
  gltf.animations.forEach(clip => clipMap.set(clip.name, clip));
  this._mixers.set(editorId, mixer);
  this._clips.set(editorId, clipMap);
}
```

**In ScriptEngine update loop** — `ObjectPlacer.update(dt)` calls `mixer.update(dt)` for all active mixers.

**In the script action editor** — `play_animation` target picker shows objects in the zone. Once a target is selected, the clip name field becomes a dropdown populated from `assetDef.animations[]`. If the asset has no animations, the field shows "No animations available" and the action is disabled.

---

#### Per-Entity Scripts Tab in PropertiesPanel

Every entity in the Properties Panel gets a "Scripts" drilldown screen added to its `OBJECT_SCREENS` entry:

```ts
const OBJECT_SCREENS: Record<string, ScreenId[]> = {
  wall:     ['geo', 'mat', 'open', 'seg', 'scripts'],
  floor:    ['mat', 'vert', 'scripts'],
  platform: ['geo', 'mat', 'scripts'],
  object:   ['geo', 'mat', 'scripts'],
  door:     ['geo', 'mat', 'scripts'],
  volume:   ['scripts'],              // trigger volumes: scripts is the main screen
  npc:      ['geo', 'scripts'],       // Phase 13
  enemy:    ['geo', 'scripts'],       // Phase 13
};
```

**Scripts screen for a selected entity:**

```
← Properties
Scripts
OBJECT SCRIPTS  (stored on this object, travel with it)

  on_interact → Open gate    ›
  on_interact → Show hint    ›
  [+ Add object script]

ALSO TARGETING THIS OBJECT  (zone or world scripts that reference this object as a target)

  flag:gate_opened → Change material ›   (zone script)
  on_game_start → play_animation     ›   (world script)
```

"Add object script" creates a new `ScriptDef` in `WorldObject.scripts[]` — stored directly on the object, not on the zone. The trigger's `targetId` is pre-filled with this entity's `editorId`.

"Also targeting this object" is a read-only list of zone and world scripts that reference this object as an action target — useful for understanding what affects this object without having to search manually.

---

#### What This Enables for Phase 13+

When NPCs and enemies arrive, they call `entityRegistry.register('npc', caps)` and `actionDispatcher.register('...', handler)` in their own `init()`. The ScriptEngine, ActionDispatcher, PropertiesPanel Scripts tab, and Script Panel all work immediately with no changes. An NPC's `on_health_zero` trigger routes through the same index, fires the same condition checks, dispatches the same action handlers.

This is the expandability guarantee — new entity types are self-contained additions, not modifications to existing systems.

---

#### Files Modified / Added

```
src/
  scripting/
    ScriptEngine.ts         ← replace flat loop with index-based routing, add update() for timers
    ActionDispatcher.ts     ← new — typed handler registry, each system registers its own handlers
    EntityRegistry.ts       ← new — capability registration, drives UI dropdowns
  ui/
    screens/
      ScriptsScreen.tsx     ← new — per-entity Scripts tab content, used in PropertiesPanel
```

Files NOT changed: `ScriptDef`, `TriggerType`, `ActionType`, `ScriptPanel.tsx`, `TriggerVolumeTool.ts`. Data format is unchanged — existing scenes load correctly.



### Phase 10.7 — Object Animation Editor

Sits after Phase 10.6 (where mixers and clip discovery are built) and before Phase 11 (terrain). Adds editor-mode animation preview and auto-play configuration to placed objects that have animation clips.

---

#### What This Phase Adds

Two things missing from the animation system after 10.6:

1. **Editor-mode clip preview** — click a placed object, see its clips, hit play without entering preview mode
2. **Auto-play configuration** — specify which clip (if any) loops automatically when the object exists in the scene

---

#### Animations Screen in PropertiesPanel

Added to `OBJECT_SCREENS` for any object type whose asset has `animations.length > 0`:

```ts
const OBJECT_SCREENS: Record<string, ScreenId[]> = {
  object: ['geo', 'mat', 'scripts', 'animations'],  // animations only shown if asset has clips
  npc:    ['geo', 'scripts', 'animations'],          // Phase 13
  enemy:  ['geo', 'scripts', 'animations'],          // Phase 13
};
```

The `animations` screen ID is only added to the root screen's drilldown list if `assetDef.animations?.length > 0`. Objects with no clips show no Animations row.

**Animations screen layout:**

```
← Properties
Animations
CLIPS — prop_door_01

AUTO-PLAY
  [None ▾]     ← dropdown: None / idle / open / close / shake

CLIPS
  idle         [▶ Preview]   2.4s   loop
  open         [▶ Preview]   0.8s   once
  close        [▶ Preview]   0.8s   once
  shake        [▶ Preview]   1.2s   once
```

**Auto-play field:**
- Dropdown populated from `assetDef.animations[]`
- Default: None
- When set: stored as `WorldObject.autoPlayAnimation: string | null`
- When the object is placed or the scene loads, `ObjectPlacer` checks this field and starts the clip looping if set
- Changing it in the editor takes effect immediately on the mesh in the scene

**Preview buttons:**
- Clicking `▶ Preview` on a clip plays it once on the mesh in the editor scene — no preview mode needed
- While a clip is previewing: button changes to `■ Stop`, other clip buttons disabled
- On completion (or Stop): mesh returns to auto-play clip if one is set, or bind pose if none
- Only one clip previews at a time across all objects — previewing a clip on a second object stops any currently playing preview

---

#### WorldObject — New Field

```ts
// Addition to WorldObject in types.ts
export interface WorldObject {
  id:               string;
  assetId:          string;
  position:         Vec3;
  rotation:         Vec3;
  scale:            Vec3;
  materialOverrides?: MaterialOverrides;
  properties:       ObjectProperties;
  autoPlayAnimation?: string | null;    // ← new — clip name or null
}
```

---

#### ObjectPlacer — Auto-Play on Load

```ts
// In ObjectPlacer.place() and ObjectPlacer.loadFromWorldState():
if (object.autoPlayAnimation && asset.animations?.includes(object.autoPlayAnimation)) {
  const mixer  = this._mixers.get(object.id);
  const clipMap = this._clips.get(object.id);
  const clip   = clipMap?.get(object.autoPlayAnimation);
  if (mixer && clip) {
    mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
  }
}
```

Auto-play is active in both editor mode and preview/game mode. It is the "resting state" of the object.

---

#### Editor Preview — ObjectPlacer.previewClip()

```ts
previewClip(objectId: string, clipName: string): void {
  // Stop any currently previewing clip across all objects
  if (this._previewingId) this._stopPreview(this._previewingId);

  const mixer  = this._mixers.get(objectId);
  const clipMap = this._clips.get(objectId);
  const clip   = clipMap?.get(clipName);
  if (!mixer || !clip) return;

  this._previewingId = objectId;
  const action = mixer.clipAction(clip)
    .setLoop(THREE.LoopOnce, 1)
    .reset()
    .play();
  action.clampWhenFinished = true;

  // On finish: restore auto-play or bind pose
  mixer.addEventListener('finished', () => {
    this._stopPreview(objectId);
  });

  bus.emit('animation:preview-start', { objectId, clipName });
}

private _stopPreview(objectId: string): void {
  const mixer   = this._mixers.get(objectId);
  const obj     = worldState.getObject(objectId);
  if (!mixer) return;
  mixer.stopAllAction();
  // Restore auto-play if set
  if (obj?.autoPlayAnimation) {
    const clip = this._clips.get(objectId)?.get(obj.autoPlayAnimation);
    if (clip) mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
  }
  this._previewingId = null;
  bus.emit('animation:preview-stop', { objectId });
}
```

---

#### Manifest Migration (extends Phase 10.6 migration)

Phase 10.6 adds a migration pass to discover clips for existing manifest entries. Phase 10.7 adds `autoPlayAnimation` defaulting to `null` for all existing `WorldObject` entries in scene files that predate this field. `WorldLoader._migrate()` handles this:

```ts
// In WorldLoader._migrate():
for (const zone of file.zones ?? []) {
  for (const obj of zone.objects ?? []) {
    if (!('autoPlayAnimation' in obj)) {
      (obj as any).autoPlayAnimation = null;
    }
  }
}
```

---

#### New Bus Events

```ts
"animation:preview-start": { objectId: string; clipName: string };
"animation:preview-stop":  { objectId: string };
"animation:auto-play-changed": { objectId: string; clipName: string | null };
```

---

#### Files Modified

```
src/
  ui/
    screens/
      AnimationsScreen.tsx    ← new — clip list, auto-play picker, preview buttons
  preview/
    ObjectPlacer.ts           ← add autoPlayAnimation on load, previewClip(), _stopPreview()
  world/
    WorldLoader.ts            ← migration for autoPlayAnimation field
types.ts                      ← autoPlayAnimation on WorldObject
```

No changes to ScriptEngine, ActionDispatcher, or EntityRegistry.




### Phase 10.8 — World-Space UV Generation

Fixes texture density inconsistency across all builders. After this phase, the same `tileScale` value produces visually identical results on a 1m wall and a 10m wall — one texture repeat per meter at default scale, everywhere, on everything.

---

#### The Problem

Three.js geometry primitives (`PlaneGeometry`, `BoxGeometry`, `ExtrudeGeometry`) generate UVs from 0→1 across the entire face regardless of physical size. A 1m floor and a 10m floor both get UVs 0→1. When the same `tileScale` is applied to both via `texture.repeat`, the texture scales differently on each — larger surfaces look stretched or over-tiled compared to smaller ones. Every time you place a surface of a different size you have to manually tweak `tileScale` to compensate. This is the bug.

---

#### The Fix — World-Space UV Generation

Every builder generates UVs manually, proportional to the physical size of each face. The rule is simple:

```
UV coordinate = physical dimension (in meters) / tileScale
```

At `tileScale: 1.0` the texture repeats once per meter on every surface. At `tileScale: 0.5` it repeats twice per meter. At `tileScale: 2.0` it repeats once every two meters. The value is consistent and intuitive regardless of object size.

**Core utility function** — add to `src/builders/UVUtils.ts`:

```ts
/**
 * Generate world-space UVs for a flat rectangular face.
 * UVs are proportional to physical dimensions so texture density
 * is consistent regardless of face size.
 *
 * @param geometry  Target BufferGeometry (must have position attribute)
 * @param width     Physical width of the face in meters
 * @param height    Physical height of the face in meters
 * @param tileScaleX  Meters per texture repeat, U axis (default 1.0)
 * @param tileScaleY  Meters per texture repeat, V axis (default tileScaleX)
 */
export function applyWorldSpaceUVs(
  geometry:    THREE.BufferGeometry,
  width:       number,
  height:      number,
  tileScaleX = 1.0,
  tileScaleY = tileScaleX,
): void {
  const uRepeat = width  / tileScaleX;
  const vRepeat = height / tileScaleY;
  const uvAttr   = geometry.attributes.uv as THREE.BufferAttribute;

  // Standard quad vertex order: BL, BR, TL, TR
  uvAttr.setXY(0, 0,       0);
  uvAttr.setXY(1, uRepeat, 0);
  uvAttr.setXY(2, 0,       vRepeat);
  uvAttr.setXY(3, uRepeat, vRepeat);
  uvAttr.needsUpdate = true;
}

/**
 * Apply UV offset to all coordinates in a geometry.
 * Call after applyWorldSpaceUVs or applyProjectedUVs.
 * All maps (albedo, normal, roughness etc.) share UV channel 0
 * so offsetting once shifts everything in sync.
 *
 * @param offsetX  U axis shift (0.0–1.0, wraps)
 * @param offsetY  V axis shift (0.0–1.0, wraps)
 */
export function applyUVOffset(
  geometry: THREE.BufferGeometry,
  offsetX:  number,
  offsetY:  number,
): void {
  if (offsetX === 0 && offsetY === 0) return;
  const uvAttr = geometry.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uvAttr.count; i++) {
    uvAttr.setXY(i, uvAttr.getX(i) + offsetX, uvAttr.getY(i) + offsetY);
  }
  uvAttr.needsUpdate = true;
}

/**
 * Generate world-space UVs for arbitrary polygon geometry
 * by projecting vertex positions onto the XZ plane (for floors/caps)
 * or onto the wall plane (for vertical faces).
 *
 * Used for polygon floors, polygon platforms, wall runs, stair faces.
 */
export function applyProjectedUVs(
  geometry:    THREE.BufferGeometry,
  axis:        'xz' | 'xy' | 'zy',   // which plane to project onto
  tileScaleX = 1.0,
  tileScaleY = tileScaleX,
): void {
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const uvAttr    = geometry.attributes.uv as THREE.BufferAttribute;
  const count     = positions.count;

  for (let i = 0; i < count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    let u: number, v: number;
    if (axis === 'xz') { u = x / tileScaleX; v = z / tileScaleY; }
    else if (axis === 'xy') { u = x / tileScaleX; v = y / tileScaleY; }
    else                    { u = z / tileScaleX; v = y / tileScaleY; }
    uvAttr.setXY(i, u, v);
  }
  uvAttr.needsUpdate = true;
}
```

**UV offset** — after calling `applyWorldSpaceUVs` or `applyProjectedUVs`, each builder checks `materialOverrides.offsetX` / `offsetY` and calls `applyUVOffset(geometry, offsetX, offsetY)` if either is non-zero. One call covers all maps.

**Remove `texture.repeat` as the scaling mechanism.** After this phase, `texture.repeat` is always `(1, 1)`. All tiling is baked into UVs at build time. This is more correct — `texture.repeat` applies globally to the texture object which can cause conflicts when the same material is shared across surfaces of different sizes.

---

#### Builder Changes

**WallBuilder:**
- Rect wall faces: `applyWorldSpaceUVs(faceGeo, wallLength, wallHeight, tileScaleX, tileScaleY)`
- Wall run merged mesh: `applyProjectedUVs(runGeo, 'zy', tileScaleX, tileScaleY)` — projects along the wall plane so UV continuity is maintained around corners
- Trim meshes (door/window reveals): `applyWorldSpaceUVs` with reveal width × reveal height

**FloorBuilder:**
- Rect floor: `applyWorldSpaceUVs(geo, boundsWidth, boundsDepth, tileScaleX, tileScaleY)`
- Polygon floor: `applyProjectedUVs(geo, 'xz', tileScaleX, tileScaleY)` — projects down onto XZ plane

**PlatformBuilder:**
- Cap (top/bottom faces): `applyProjectedUVs(capGeo, 'xz', tileScaleX, tileScaleY)`
- Side faces: `applyWorldSpaceUVs(sideFaceGeo, edgeLength, platformHeight, tileScaleX, tileScaleY)` per edge
- Polygon platform sides: `applyProjectedUVs` along each edge's local plane

**StairBuilder:**
- Tread faces (horizontal): `applyWorldSpaceUVs(treadGeo, stairWidth, treadDepth, tileScaleX, tileScaleY)`
- Riser faces (vertical): `applyWorldSpaceUVs(riserGeo, stairWidth, riserHeight, tileScaleX, tileScaleY)`
- Railing faces: `applyWorldSpaceUVs` with physical railing dimensions

---

#### Future Builders — Required Convention

Any builder added after this phase **must** use `applyWorldSpaceUVs` or `applyProjectedUVs` from `UVUtils.ts`. Never use Three.js default UV generation for any textured face. Never use `texture.repeat` for tiling. This applies to:

- `BrushBuilder` (Phase 12) — use `applyProjectedUVs` per face based on face normal direction
- Any terrain geometry builder (Phase 11) — use `applyProjectedUVs('xz')` for the heightmap mesh
- Any future NPC/character mesh builder

**The rule stated plainly:** if a face is 3m wide and the tile scale is 1.0, the UV U range must be 0→3. Always. No exceptions.

---

#### tileScaleX / tileScaleY Split

`MaterialOverrides.tileScaleX` and `tileScaleY` already exist in `types.ts`. This phase makes them meaningful:

- `tileScaleX` controls horizontal repeat (U axis)
- `tileScaleY` controls vertical repeat (V axis)
- When `splitXY` is false: `tileScaleY = tileScaleX` (single uniform scale)
- When `splitXY` is true: X and Y scale independently — useful for brick textures where you want different horizontal and vertical density
- `offsetX` / `offsetY` shift all UV coordinates after scaling — moves the texture position on the face

The "Split X/Y" checkbox in the Material screen of PropertiesPanel was already specced in Phase 6.5. This phase makes it actually do something.

**Material screen layout addition** — below the Tile row:
```
TILE    [1.0]       SPLIT X/Y [□]
OFFSET  X [0.0]     Y [0.0]
```

Offset values from 0.0 to 1.0 represent one full texture width/height of shift. Values outside that range wrap — 1.1 is the same as 0.1. Negative values work. Default is 0.0 for both axes.

---

#### tileScale Meaning After This Phase

| Value | Effect |
|---|---|
| `1.0` (default) | One texture repeat per meter — consistent everywhere |
| `0.5` | One repeat per 0.5m — texture appears larger/more detailed |
| `2.0` | One repeat per 2m — texture appears smaller |
| `0.25` | One repeat per 0.25m — very large detailed texture |

The value is now physically meaningful and consistent. The same `tileScale: 1.0` on a 1m wall and a 20m wall produces the same brick size in both.

---

#### Migration

Existing scenes built before this phase will have `tileScale` values tuned to compensate for the old inconsistent behaviour. After this fix those values will produce different results. Two options:

1. **Reset all tileScale values to 1.0** in `WorldLoader._migrate()` for scenes missing a `uvVersion` field — accept that existing scenes need re-tweaking. Simple, clean.
2. **Leave existing values** and only apply world-space UVs to newly created surfaces — existing surfaces keep old behaviour. Complex, messy.

Option 1 is correct. Add `uvVersion: 1` to `SceneFile` metadata. `WorldLoader._migrate()` resets tileScale to 1.0 on any file without `uvVersion`. After this phase all new scenes get `uvVersion: 1` written automatically.

---

#### New File

```
src/
  builders/
    UVUtils.ts    ← applyWorldSpaceUVs(), applyProjectedUVs() — imported by all builders
```

#### Files Modified

```
src/builders/WallBuilder.ts
src/builders/FloorBuilder.ts
src/builders/PlatformBuilder.ts
src/builders/StairBuilder.ts
src/world/WorldLoader.ts    ← uvVersion migration
types.ts                    ← add uvVersion to SceneMetadata
```

### Phase 11 — Terrain
- TerrainBuilder: heightmap → PlaneGeometry with `computeBoundsTree()` (BVH for editor raycasting)
- Terrain Rapier collider: `ColliderDesc.heightfield(res, res, heightData, { x: worldSize, y: maxHeight, z: worldSize })`
- Terrain sculpt tool: raise/lower brush, on stroke end rebuild both Three.js geometry AND Rapier heightfield collider
- Multi-layer material blending by height
- TerrainBuilder integrated into ZoneManager for outdoor zones
- Road tool: spline control points → flat corridor on terrain

### Phase 12 — Polish + Future Systems

**Polish:**
- L-shape and spiral stair styles in StairBuilder (each with correct per-step colliders)
- Outline post-process selection highlight (EffectComposer + OutlinePass, replaces emissive tint)
- Wall exterior material (material array on BoxGeometry for inside/outside faces)
- ~~Undo/redo stack~~ — implemented as snapshot-based HistoryManager in **Phase 6.7**
- Real GLTF prop assets in AssetBrowser with authored collision shapes in asset registry
- Ambient/sun light controls in PropertiesPanel
- Node drag — select a wall node and drag to stretch all connected walls simultaneously
- Room detection — find closed wall loops, auto-label as rooms, apply room-level properties
- Snap-merge tool — merge two nearby nodes that aren't exactly equal

**Future systems (to be specced when needed):**

- **Brush primitive (BSP-style editable solid)** — A freeform convex solid with direct vertex/edge/face editing. Move top and bottom vertices independently to create diagonals and wedges. Split faces and extrude. Distinct from platforms which are parametric. Closer to UE5 Modeling Mode or Quake-style brush editing.

  **Critical architecture requirement:** Brush vertices must be stored in **local space** relative to the brush's own origin, not in world space. The brush has a `position`, `rotation`, and `scale` as a separate transform. Moving the brush updates `position` only — vertices don't change. Rotating updates `rotation` only — vertices don't change. Only vertex editing touches vertex data. `BrushBuilder` always builds geometry in local space, then Three.js applies the mesh transform on top. Rapier collider is rebuilt from final world-space positions (local vertices × transform) on any change.

  This is the correct architecture to avoid the rotation/move/corner-snapping bugs that affect the current platform and wall tools — those bugs happen because world-space coordinate storage means the mesh transform and the data get out of sync. Local-space storage keeps them permanently in sync. **Do not repeat the world-space storage pattern from platforms/floors/walls.**

  Collision: static Rapier convex hull or trimesh collider (player walks over it correctly, slopes handled by KCC max climb angle). Dynamic movement not supported — brushes are static scenery.

- **Item system** — `ItemDef` type, item registry/manifest, item pickup objects, inventory UI panel, equippable/consumable/stackable flags, item icons. Currently stubbed as string IDs in `GameSave.inventory` and script actions `give_item` / `player_has_item`.
- **Dialogue system** — branching dialogue trees, NPC conversation UI, dialogue editor panel. Currently stubbed as linear `lines[]` array in `DialogueDef`.
- **Quest system** — quest definitions, objectives, completion conditions, quest log UI.
- **Audio system** — sound asset manifest, positional audio, ambient loops, music tracks, audio mixer.
- **Navmesh** — walkable surface generation from Rapier floor colliders, NPC pathfinding via Recast/Detour.
- **Export** — export as self-contained playable HTML (bakes textures as base64, bundles scripts).
- **Multiplayer** — out of scope for now, noted for future.

---

## Physics Architecture

### Two Tools, Two Jobs

| Tool | Used For | Not Used For |
|---|---|---|
| `three-mesh-bvh` | Editor raycasting (selection, snapping, surface detection), terrain sculpt queries | Any runtime physics |
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

  get world(): RAPIER.World { return this._world; }
  get initialized(): boolean { return this._initialized; }

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
import type { WallDef, FloorDef, PlatformDef, StairDef, Opening } from "../types.ts";

export class ColliderBuilder {

  // Floor slab — thin box at floor elevation
  static registerFloor(bounds: { x: number; z: number; width: number; depth: number }, elevation: number): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc
      .cuboid(bounds.width / 2, 0.05, bounds.depth / 2)
      .setTranslation(
        bounds.x + bounds.width / 2,
        elevation - 0.05,
        bounds.z + bounds.depth / 2
      );
    return physicsWorld.createStaticCollider(desc);
  }

  // Wall — split into segments around openings, one cuboid per solid segment
  // Returns one collider per segment (gaps at door/window positions have no collider)
  static registerWallSegments(wall: WallDef, elevation: number): RAPIER.Collider[] {
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
    const angle  = Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);
    const midX   = (wall.start.x + wall.end.x) / 2;
    const midZ   = (wall.start.z + wall.end.z) / 2;

    // Build list of solid segments between openings
    const sorted: Opening[] = [...wall.openings].sort((a, b) => a.offsetAlongWall - b.offsetAlongWall);
    const segments: Array<{ start: number; end: number }> = [];
    let cursor = 0;
    for (const opening of sorted) {
      if (opening.offsetAlongWall > cursor) segments.push({ start: cursor, end: opening.offsetAlongWall });
      cursor = opening.offsetAlongWall + opening.width;
    }
    if (cursor < length) segments.push({ start: cursor, end: length });

    return segments.map(seg => {
      const segLen  = seg.end - seg.start;
      const segMid  = seg.start + segLen / 2 - length / 2; // offset from wall center
      const wx = midX + Math.cos(angle) * segMid;
      const wz = midZ + Math.sin(angle) * segMid;
      const desc = RAPIER.ColliderDesc
        .cuboid(segLen / 2, wall.height / 2, wall.thickness / 2)
        .setTranslation(wx, elevation + wall.height / 2, wz)
        .setRotation({ x: 0, y: Math.sin(-angle / 2), z: 0, w: Math.cos(-angle / 2) });
      return physicsWorld.createStaticCollider(desc);
    });
  }

  // Platform slab
  static registerPlatform(platform: PlatformDef): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc
      .cuboid(platform.size.width / 2, platform.thickness / 2, platform.size.depth / 2)
      .setTranslation(platform.position.x, platform.position.y + platform.thickness / 2, platform.position.z);
    return physicsWorld.createStaticCollider(desc);
  }

  // Stairs — one cuboid per step
  static registerStairSteps(stair: StairDef): RAPIER.Collider[] {
    const heightDiff  = stair.end.y - stair.start.y;
    const horizDist   = Math.hypot(stair.end.x - stair.start.x, stair.end.z - stair.start.z);
    const angle       = Math.atan2(stair.end.z - stair.start.z, stair.end.x - stair.start.x);
    const stepHeight  = 0.2;
    const numSteps    = Math.max(1, Math.round(heightDiff / stepHeight));
    const stepDepth   = horizDist / numSteps;
    const colliders: RAPIER.Collider[] = [];

    for (let i = 0; i < numSteps; i++) {
      const t = (i + 0.5) / numSteps;
      const desc = RAPIER.ColliderDesc
        .cuboid(stair.width / 2, stepHeight / 2, stepDepth / 2)
        .setTranslation(
          stair.start.x + (stair.end.x - stair.start.x) * t,
          stair.start.y + (i + 0.5) * stepHeight,
          stair.start.z + (stair.end.z - stair.start.z) * t
        )
        .setRotation({ x: 0, y: Math.sin(-angle / 2), z: 0, w: Math.cos(-angle / 2) });
      colliders.push(physicsWorld.createStaticCollider(desc));
    }
    return colliders;
  }

  // Door sensor — for transition detection
  static registerDoorSensor(
    wall: WallDef,
    opening: Opening,
    elevation: number
  ): RAPIER.Collider {
    const angle  = Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
    const offset = opening.offsetAlongWall - length / 2;
    const desc = RAPIER.ColliderDesc
      .cuboid((opening.width - 0.1) / 2, opening.height / 2, 0.4)
      .setTranslation(
        wall.start.x + Math.cos(angle) * (opening.offsetAlongWall + opening.width / 2),
        elevation + opening.elevation + opening.height / 2,
        wall.start.z + Math.sin(angle) * (opening.offsetAlongWall + opening.width / 2)
      )
      .setRotation({ x: 0, y: Math.sin(-angle / 2), z: 0, w: Math.cos(-angle / 2) });
    return physicsWorld.createSensorCollider(desc);
  }

  // Terrain heightfield
  static registerTerrain(
    heightData: Float32Array,
    resolution: number,
    worldSize: number,
    maxHeight: number
  ): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc
      .heightfield(resolution - 1, resolution - 1, heightData, {
        x: worldSize, y: maxHeight, z: worldSize,
      })
      .setTranslation(0, 0, 0);
    return physicsWorld.createStaticCollider(desc);
  }
}
```

### Collider Handle Storage in ZoneManager

ZoneManager stores collider references per zone so they can be cleaned up correctly:

```ts
interface ZoneColliders {
  floors:    RAPIER.Collider[];
  walls:     RAPIER.Collider[][];  // per wall: array of segment colliders
  platforms: RAPIER.Collider[];
  stairs:    RAPIER.Collider[][];  // per stair: array of step colliders
  sensors:   RAPIER.Collider[];    // door sensors
  terrain:   RAPIER.Collider | null;
}

// On unloadZone:
for (const c of colliders.floors)              physicsWorld.removeCollider(c);
for (const segs of colliders.walls)    segs.forEach(c => physicsWorld.removeCollider(c));
for (const c of colliders.platforms)           physicsWorld.removeCollider(c);
for (const steps of colliders.stairs)  steps.forEach(c => physicsWorld.removeCollider(c));
for (const c of colliders.sensors)             physicsWorld.removeCollider(c);
if (colliders.terrain)                         physicsWorld.removeCollider(colliders.terrain);
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
  readonly capsuleHalfHeight = 0.6;   // half of the cylinder part (total height ~1.5m + 2*radius)

  init(spawnPosition: THREE.Vector3): void {
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(spawnPosition.x, spawnPosition.y, spawnPosition.z);
    this._body = physicsWorld.world.createRigidBody(bodyDesc);

    const collDesc = RAPIER.ColliderDesc.capsule(this.capsuleHalfHeight, this.capsuleRadius);
    this._collider = physicsWorld.world.createCollider(collDesc, this._body);

    this._kcc = physicsWorld.world.createCharacterController(0.01);
    this._kcc.enableAutostep(0.5, 0.2, true);  // step up to 0.5m, min width 0.2m
    this._kcc.enableSnapToGround(0.3);          // snap down to ground within 0.3m
    this._kcc.setSlideEnabled(true);
    this._kcc.setMaxSlopeClimbAngle(45 * Math.PI / 180);
    this._kcc.setMinSlopeSlideAngle(30 * Math.PI / 180);
  }

  // Call each frame with the desired movement vector (gravity already included)
  move(desired: THREE.Vector3): void {
    this._kcc.computeColliderMovement(
      this._collider,
      { x: desired.x, y: desired.y, z: desired.z }
    );
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
  id:           string;
  name:         string;
  modelAssetId: string;         // GLTF
  capsuleRadius:    number;
  capsuleHeight:    number;
  moveSpeed:        number;
  jumpHeight:       number;
  cameraMode:       CameraMode;
  thirdPersonOffset:Vec3;
  // Game stats (Phase 13+)
  health?:      number;
  maxHealth?:   number;
  faction?:     string;
}
```

- `CharacterDef` stored per zone in `WorldState` (placed by character spawn tool in editor)
- At runtime, spawns a `CharacterBody` + loads GLTF model + attaches animation mixer
- Camera controller reads from `CharacterBody.position` same as preview mode

### NPCs (Phase 14+)

Each NPC is a `CharacterBody` (Rapier KCC) driven by an AI controller instead of input:

```ts
interface NpcDef {
  id:           string;
  name:         string;
  modelAssetId: string;
  spawnPosition:Vec3;
  faction:      string;
  behaviour:    "idle" | "patrol" | "follow" | "guard";
  patrolPath?:  Vec3[];
  dialogueId?:  string;
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
  attackRange:    number;
  detectionRange: number;
  damage:         number;
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
  plugins: [
    react(),
    checker({ typescript: true }),
  ],
});
```

### Phase 6.4 — Delete Support & Copy-to-Floor Cleanup

Adds the ability to delete any selected object and strips openings from copy-to-floor operations.

#### Scope

- `Delete` / `Backspace` keyboard shortcut deletes the currently selected object (guarded against input-field focus).
- "Delete" button rendered at the bottom of the Properties Panel for all selectable types.
- `removeFloor` added to WorldState / `floor:removed` event added to BusEvents (floor deletion was previously missing from the API).
- `ZoneManager._removeFloor` — removes mesh, disposes geometry/material, removes Rapier collider, re-runs `_applyDimming`.
- `SelectionManager` auto-deselects when the selected object's removal event fires.
- Copy-to-Floor: duplicated walls now start with `openings: []` (doors/windows are not copied).
- Wall deletion also removes orphaned nodes (nodes with no remaining walls) via `WorldState.removeNode`, which guards against removing nodes still referenced by walls.

#### New Event

```typescript
"floor:removed": { zoneId: string; floorId: string };
```

#### Delete Handler (App.tsx)

`handleDelete` branches on `selected.type`:
- `"wall"` — removes all walls in the run, then attempts `removeNode` for all their node IDs (safe: WorldState.removeNode no-ops if node still has walls).
- `"floor"` / `"platform"` / `"stair"` / `"object"` — direct removal via WorldState.
- `"opening"` — filters the opening from its parent wall's `openings` array via `updateWall`.

Keyboard listener uses `window.addEventListener("keydown")` with a `useCallback`/`useEffect` pair — re-binds when `selected` changes so the closure is always fresh.

#### PropertiesPanel

`onDelete?: () => void` prop. Rendered as a full-width red-tinted button directly above the Quality section, visible for all non-null selections.

---

### Phase 6.6 — Input UX & Floor Fixes

A collection of correctness and usability fixes applied after Phase 6.4.

#### 1. EditorCamera keyboard focus guard

**Problem:** Arrow keys typed inside any `<input>`, `<select>`, or `<textarea>` were still triggering camera movement because `EditorCamera._handleKeyDown/Up` had no focus guard. `InputManager` had an identical guard but `EditorCamera` is a separate listener on `window`.

**Fix:** Added `_isTypingTarget(e: KeyboardEvent): boolean` to `EditorCamera` (mirrors the identical method in `InputManager`). Both key handlers bail out early when the event target is an input-like element:

```typescript
private _handleKeyDown(e: KeyboardEvent): void {
  if (this._isTypingTarget(e)) return;
  this._keys[e.code] = true;
}
private _handleKeyUp(e: KeyboardEvent): void {
  if (this._isTypingTarget(e)) return;
  delete this._keys[e.code];
}
private _isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}
```

#### 2. Universal live-debounce hook in PropertiesPanel

**Problem:** Most `<input>` fields in `PropertiesPanel.tsx` committed their value only on `blur`. Only three components (WallGeoView, PlatformGeoView, ObjectGeoView) had any live update, and each rolled its own debounce timer independently.

**Fix:** Extracted a shared `useFieldDebounce` hook placed at module scope, before all component definitions:

```typescript
function useFieldDebounce(delayMs = 300) {
  const ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (ref.current !== null) clearTimeout(ref.current); }, []);
  const schedule = (fn: () => void) => {
    if (ref.current !== null) clearTimeout(ref.current);
    ref.current = setTimeout(() => { ref.current = null; fn(); }, delayMs);
  };
  const flush = (fn: () => void) => {
    if (ref.current !== null) { clearTimeout(ref.current); ref.current = null; }
    fn();
  };
  return { schedule, flush };
}
```

Every component that owns numeric inputs now calls `useFieldDebounce(300)` (ObjectGeoView uses 150 ms). The pattern applied to every field:

```tsx
// onChange: update local display state + schedule a deferred commit
onChange={e => { setVal(e.target.value); schedule(() => commitFoo(e.target.value)); }}
// onBlur: flush (cancel timer, commit immediately)
onBlur={e => flush(() => commitFoo(e.target.value))}
// onKeyDown Enter: same as blur
onKeyDown={e => { if (e.key === "Enter") flush(() => commitFoo(e.target.value)); }}
```

**Components updated:** WallGeoView, PlatformGeoView, StairGeoView, ObjectGeoView, VertScreen (elevation), MaterialSection (all five tiling/roughness/displacement fields), OpeningRow (offset/width/height/elevation + inner tile H/V), WallSegmentRow (tile scale).

`VertScreen` elevation input was also changed from `type="text" inputMode="decimal"` to `type="number" step={0.001}` so browser spinner arrows appear.

Select elements (`OpeningRow` type select, `WallSegmentRow` material select) commit immediately on `onChange` and require no debounce.

#### 3. Floor gizmo centroid

**Problem:** When a floor was selected, the transform gizmo appeared at world origin (0, 0.3, 0) because floor meshes have `position = (0,0,0)` in Three.js — their geometry vertices encode world coordinates directly (there is no mesh-level translation).

**Fix:** `GizmoManager._onSelect` now computes the gizmo position from the floor data for the `"floor"` selection type:

```typescript
} else if (type === "floor") {
  this._wallNodeIds = [];
  const floorDef = payload.data as FloorDef | null;
  if (floorDef) {
    py = floorDef.elevation + 0.3;
    const pts = floorDef.floorMesh.points;
    if (pts && pts.length > 0) {
      px = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      pz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
    } else {
      const zone = this._worldState.zones.get(payload.zoneId);
      if (zone) {
        px = zone.bounds.x + zone.bounds.width  / 2;
        pz = zone.bounds.z + zone.bounds.depth  / 2;
      }
    }
  }
}
```

- Polygon floors: centroid of `floorMesh.points` array.
- Rect floors (points may be empty): center of `zone.bounds`.
- Y: `floorDef.elevation + 0.3` so the gizmo floats just above the surface.

#### 4. Floor elevation default

**Problem:** Both `FloorTool` and `PolygonFloorTool` were deriving the new floor's elevation from the first existing floor at the active level. This caused a new floor to inherit any user-modified elevation instead of defaulting to the level's natural position.

**Fix:** Both tools now always use `this._activeLevel * 3.0` (same formula WallTool uses), with no reference to existing floors:

```typescript
// FloorTool._commit and PolygonFloorTool._commit
const elevation = this._activeLevel * 3.0;
```

Level 0 → elevation 0 m, Level 1 → 3 m, Level 2 → 6 m, etc. The user can then override elevation in the Properties Panel.

#### 5. ZoneManager wall-run stale rebuild fix

**Problem:** `ZoneManager._removeWall` computed a wall run synchronously (the set of walls that share the same run as the deleted wall), then called `await WallBuilder.buildRun()`. If the user deleted all walls in a run before the async build completed (e.g. rapid multi-delete), the newly-built mesh would be added to the scene even though none of its source walls still existed — leaving a ghost mesh.

**Fix:** After `await WallBuilder.buildRun()`, a stale check verifies that at least one wall from the rebuilt run still exists in `zone.walls`. If not, the output mesh and colliders are disposed and the loop continues without adding anything:

```typescript
if (!run.some(w => zone.walls.some(zw => zw.id === w.id))) {
  output.mesh.geometry.dispose();
  if ((output.mesh.userData as { _ownsMaterial?: boolean })._ownsMaterial)
    (output.mesh.material as THREE.Material).dispose();
  for (const tm of output.trimMeshes) tm.geometry.dispose();
  output.colliders.forEach(c => physicsWorld.removeCollider(c));
  continue;
}
```

---

### Phase 6.7 — Undo / Redo

Adds Cmd+Z / Cmd+Y keyboard shortcuts and two toolbar buttons (↩ / ↪) that undo and redo any WorldState mutation — placements, deletes, property edits, and everything that gets saved.

#### Approach: Snapshot-based HistoryManager

Before each logical action: deep-clone `world.toJSON()` → `before`.
After: deep-clone again → `after`.
Store `{ label, before, after }` on the undo stack (max 50 entries).

Undo: pop entry, call `world.loadFromJSON(entry.before)`, emit `history:restore`.
Redo: same with `entry.after`.

`history:restore` causes ZoneManager to do `unloadZone` + `loadZone` for the active zone — identical to the scene-load path. Selection is cleared automatically via `object:deselected` emitted just before `history:restore`.

No command pattern or inverse-method approach is needed. All WorldState mutations are synchronous, so before/after snapshots are always correct. Compound mutations (e.g. wall delete removes nodes too) are captured as a single step automatically.

#### HistoryManager API (`src/editor/HistoryManager.ts`)

```typescript
class HistoryManager {
  // Single-mutation actions
  record(label: string, fn: () => void): void
  // Multi-step batches (e.g. WallTool: addNode + addWall)
  beginBatch(label: string): void
  commitBatch(): void
  cancelBatch(): void   // for aborted operations
  // Undo / redo
  undo(): void
  redo(): void
  get canUndo(): boolean
  get canRedo(): boolean
  // Clear on scene:load / world:loaded
  clear(): void
}
```

`record()` is a no-op wrapper when `_batching` is true — inner tool calls during a batch just run their fn directly without capturing intermediate snapshots.

#### Integration points

**`src/types.ts`** — `BusEvents` gains:
```typescript
"history:restore": Record<string, never>;
```

**`src/world/ZoneManager.ts`** — in `init()`:
```typescript
this._bus.on("history:restore", () => {
  const zoneId = this._worldState.activeZoneId;
  if (!zoneId) return;
  this.unloadZone(zoneId);
  void this.loadZone(zoneId);
}),
```

**`src/App.tsx`**:
- `historyRef = useRef<HistoryManager | null>(null)` — holds the instance outside React state
- `const [canUndo, setCanUndo] = useState(false)` / `canRedo`
- `syncHistory()` helper calls `setCanUndo / setCanRedo` after every undo/redo/record
- `bus.on("scene:loaded", ...)` and `bus.on("world:loaded", ...)` → `history.clear(); syncHistory()`
- Cmd+Z and Cmd+Shift+Z / Cmd+Y intercepted in the keyboard `useEffect`
- `handleUndo` / `handleRedo` also emit `tool:select → "select"` to reset all tools before restoring
- `handleDelete` wrapped with `history.beginBatch(…)` / `history.commitBatch()`
- All branches of `handleObjectUpdate` wrapped with `history.record(…)`
- `handleSegmentUpdate`, `handleCopyRunToFloor`, `handleFillRunWithFloor`, auto-floor prompt wrapped

**Placement tools** — all receive `HistoryManager` as the 4th constructor argument:

| Tool | Pattern |
|---|---|
| `FloorTool` | `record("add floor", fn)` |
| `PolygonFloorTool` | `record("add floor", fn)` |
| `WallTool` | `beginBatch("add wall")` … `commitBatch()` (addNode + addWall) |
| `PlatformTool` | `record("add platform", fn)` |
| `PolygonPlatformTool` | `beginBatch("add platform")` … `commitBatch()` (addNodes + addPlatform) |
| `StairTool` | `record("add stair", fn)` |

**`src/ui/Toolbar.tsx`** — new props `onUndo`, `onRedo`, `canUndo`, `canRedo`. Two buttons above the tool list, disabled and visually dimmed when the corresponding stack is empty.

#### Behaviour guarantees

- Undo stack cleared on every `scene:load` — you cannot undo across scene loads.
- Max 50 undo entries; oldest are shifted off when the limit is reached.
- Redo stack is wiped whenever a new action is recorded.
- Batch `cancelBatch()` leaves WorldState unmodified and pushes nothing onto either stack.

---

### Prompt template for Claude Code

> "Read `WORLD_EDITOR_ARCHITECTURE.md` in the project root. Implement **Phase [N] — [Name]** exactly as specified. Rules:
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
> - Never create Rapier objects outside of `src/physics/`. Never import `@dimforge/rapier3d-compat` directly in builders — use `ColliderBuilder` methods.
> - **Assets:** No hardcoded asset or material registries. Both are loaded dynamically from `public/assets/textures/manifest.json` and `public/assets/models/manifest.json` via `AssetManager.initMaterials()` and `AssetManager.initAssets()` on startup.
> - **Scripting:** `ScriptEngine` is the only place scripts execute. No other module calls `new Function()` or `eval()`. Bus events are the only way scripts communicate with the rest of the engine.
> - **Persistence:** Three separate stores — scene file (explicit save/load), game save (localStorage, auto), editor preferences (localStorage, on change). Never mix them."
