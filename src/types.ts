import type * as THREE from "three";

// ─── Material types ───────────────────────────────────────────────────────────

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

export interface MaterialManifest {
  version:   string;
  materials: MaterialDef[];
}

// ─── Primitive helpers ────────────────────────────────────────────────────────

export type ToolId = "select" | "floor" | "wall" | "platform" | "stair" | "object" | "zone";
export type ZoneType = "outdoor" | "indoor" | "dungeon";
export type OpeningType = "door" | "window" | "arch" | "passage";
export type StairStyle = "straight" | "l-shape" | "spiral";
export type CameraMode = "fps" | "thirdperson";
export type EditorObjectType = "wall" | "floor" | "platform" | "stair" | "object" | "terrain" | "trigger" | "trim";
export type TransitionEffect = "fade" | "none";

// ─── Vec / transform ─────────────────────────────────────────────────────────

export interface Vec2 { x: number; z: number }
export interface Vec3 { x: number; y: number; z: number }
export interface ScreenPos { x: number; y: number }
export interface Euler3 { x: number; y: number; z: number }
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
  "wall:updated":          { zoneId: string; wallId: string; changes: Partial<WallDef> };
  "wall:removed":          { zoneId: string; wallId: string };
  "wall:rebuilt":          { zoneId: string; wallId: string };
  "floor:added":           { zoneId: string; floor: FloorDef };
  "floor:updated":         { zoneId: string; level: number; changes: Partial<FloorDef> };
  "platform:added":        { zoneId: string; platform: PlatformDef };
  "platform:updated":      { zoneId: string; id: string; changes: Partial<PlatformDef> };
  "platform:removed":      { zoneId: string; id: string };
  "stair:added":           { zoneId: string; stair: StairDef };
  "stair:removed":         { zoneId: string; id: string };
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
  "terrain:sculpt":        { x: number; z: number; radius: number; delta: number };
  "input:click":           { screenPos: ScreenPos; worldPos: Vec3; button: number };
  "input:dblclick":        { screenPos: ScreenPos; worldPos: Vec3 };
  "input:mousemove":       { screenPos: ScreenPos; worldPos: Vec3; delta: ScreenPos };
  "input:mousedown":       { button: number; screenPos: ScreenPos };
  "input:mouseup":         { button: number; screenPos: ScreenPos };
  "input:wheel":           { delta: number };
  "input:keydown":         { code: string; key: string; shift: boolean; ctrl: boolean; alt: boolean };
  "input:keyup":           { code: string };
}

export type BusEventName = keyof BusEvents;
export type BusCallback<K extends BusEventName> = (payload: BusEvents[K]) => void;

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
}

// ─── Scene file data model ────────────────────────────────────────────────────

export interface SceneMetadata {
  name:         string;
  version:      string;
  author:       string;
  created:      string;
  lastModified: string;
}

export interface PlayerSettings {
  cameraMode:          CameraMode;
  moveSpeed:           number;
  jumpHeight:          number;
  fov:                 number;
  thirdPersonDistance: number;
  thirdPersonHeight:   number;
}

export interface WorldConfig {
  size:           { width: number; depth: number };
  ambientLight:   { color: string; intensity: number };
  sunLight:       { color: string; intensity: number; position: Vec3 };
  skybox:         string;
  fogColor:       string;
  fogDensity:     number;
  playerSettings: PlayerSettings;
}

export interface TerrainLayerMaterial {
  id:        string;
  texture:   string;
  tileScale: number;
  minHeight: number;
  maxHeight: number;
}

export interface TerrainDef {
  resolution:     number;
  heightData:     Float32Array | string;
  maxHeight:      number;
  layerMaterials: TerrainLayerMaterial[];
}

export interface FloorMeshDef {
  shape:    "rect" | "polygon";
  points:   Vec2[] | null;
  material: string;
}

export interface FloorDef {
  level:         number;
  elevation:     number;
  ceilingHeight: number | null;
  floorMesh:     FloorMeshDef;
}

export interface Opening {
  id:                 string;
  type:               OpeningType;
  offsetAlongWall:    number;
  width:              number;
  height:             number;
  elevation:          number;
  linkedZoneId:       string | null;
  linkedTransitionId: string | null;
}

export interface WallDef {
  id:               string;
  start:            Vec2;
  end:              Vec2;
  floor:            number;
  height:           number;
  thickness:        number;
  material:         string;
  exteriorMaterial: string;
  openings:         Opening[];
}

export interface PlatformDef {
  id:            string;
  position:      Vec3;
  size:          { width: number; depth: number };
  thickness:     number;
  material:      string;
  hasRailing:    boolean;
  railingHeight: number;
  floorLevel?:   number;
}

export interface StairDef {
  id:         string;
  start:      Vec3;
  end:        Vec3;
  width:      number;
  style:      StairStyle;
  material:   string;
  hasRailing: boolean;
}

export interface ObjectProperties {
  interactable:   boolean;
  npcSpawn:       boolean;
  lootTableId:    string | null;
  triggerEventId: string | null;
}

export interface WorldObject {
  id:         string;
  assetId:    string;
  position:   Vec3;
  rotation:   Euler3;
  scale:      Scale3;
  floor:      number;
  zoneId?:    string;
  properties: ObjectProperties;
}

export interface ZoneDef {
  id:        string;
  name:      string;
  type:      ZoneType;
  bounds:    Bounds;
  floors:    FloorDef[];
  walls:     WallDef[];
  platforms: PlatformDef[];
  stairs:    StairDef[];
  objects:   WorldObject[];
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

// ─── Builder return types ─────────────────────────────────────────────────────

export interface WallBuildResult {
  mesh:            THREE.Mesh;
  trimMeshes:      THREE.Mesh[];
  collisionMeshes: THREE.Mesh[];
  triggerMeshes:   THREE.Mesh[];
}

export interface FloorBuildResult {
  mesh:          THREE.Mesh;
  collisionMesh: THREE.Mesh;
}

export interface PlatformBuildResult {
  meshes:        THREE.Mesh[];
  collisionMesh: THREE.Mesh;
}

export interface StairBuildResult {
  meshes:        THREE.Mesh[];
  collisionMesh: THREE.Mesh;
}

// ─── Module lifecycle contract ────────────────────────────────────────────────

export interface IEditorModule {
  init():          void;
  update(dt: number): void;
  dispose():       void;
}
