import type * as THREE from "three";

// ─── Material types ───────────────────────────────────────────────────────────

export interface MaterialMapConfig {
  enabled: boolean;
  path:    string;
}

export type MaterialCategory = 'Stone' | 'Wood' | 'Metal' | 'Fabric' | 'Ground' | 'Concrete' | 'Brick' | 'Plaster' | 'Other' | (string & {});

export interface MaterialDef {
  id:                string;
  label:             string;
  category?:         MaterialCategory;
  attribution?:      Attribution;
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

export interface MaterialOverrides {
  maps?:              Partial<Record<keyof MaterialDef['maps'], { enabled: boolean }>>;
  tileScale?:         number;
  tileScaleX?:        number;
  tileScaleY?:        number;
  offsetX?:           number;   // UV offset, repeat units (Phase 10.8)
  offsetY?:           number;
  roughnessVal?:      number;
  displacementScale?: number;
}

export type QualityScale = 'low' | 'medium' | 'high';

// ─── Asset types ──────────────────────────────────────────────────────────────

export type ColliderType  = 'box' | 'mesh' | 'none';
export type AssetCategory = 'Furniture' | 'Props' | 'Structures' | 'Lights' | 'Characters' | 'Vegetation' | 'Other' | (string & {});
export type LeftPanelId   = 'assets' | 'materials' | 'groups' | 'scripts' | null;

export interface GroupDef {
  id:   string;
  name: string;
}

export type LicenseId = 'CC0' | 'CC BY' | 'CC BY-SA' | 'CC BY-ND' | 'CC BY-NC' | 'CC BY-NC-SA' | 'Other';

export interface Attribution {
  author?:       string;
  sourceName?:   string;   // content pack / kit name
  patreonUrl?:   string;
  sourceUrl?:    string;   // source page / kit URL
  license?:      LicenseId;
  licenseOther?: string;   // free text when license === 'Other'
}

export interface AssetDef {
  id:           string;
  label:        string;
  category:     AssetCategory;
  path:         string;
  mtlPath?:     string;   // OBJ only — companion .mtl file path
  thumbnail?:   string;
  collidable:   boolean;
  colliderType: ColliderType;
  tags:         string[];
  dateAdded:    string;
  animations?:  string[];   // GLTF clip names, populated at import (Phase 10.7)
  attribution?: Attribution;
}

export interface AssetManifest {
  version: string;
  assets:  AssetDef[];
}

// ─── Primitive helpers ────────────────────────────────────────────────────────

export type ToolId = "select" | "floor" | "poly-floor" | "wall" | "platform" | "poly-platform" | "stair" | "object" | "zone" | "spawnpoint" | "trigger-volume";
export type ZoneType = "outdoor" | "indoor" | "dungeon";
export type OpeningType = "door" | "window" | "arch" | "passage";
export type StairStyle = "straight" | "l-shape" | "spiral";
export type CameraMode = "fps" | "thirdperson";
export type EditorObjectType = "wall" | "floor" | "platform" | "stair" | "object" | "terrain" | "trigger" | "trim" | "opening" | "spawn" | "trigger-volume";
export type TransitionEffect = "fade" | "none";

// ─── Vec / transform ─────────────────────────────────────────────────────────

export interface Vec2 { x: number; z: number }
export interface Vec3 { x: number; y: number; z: number }

export interface WallNode {
  id: string;
  x:  number;
  z:  number;
}
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
  "wall:updated":          { zoneId: string; wallId: string; changes: Partial<WallDef>; segmentOnly?: boolean };
  "wall:removed":          { zoneId: string; wallId: string };
  "wall:rebuilt":          { zoneId: string; wallId: string };
  "node:updated":          { zoneId: string; nodeId: string; pos: { x: number; z: number } };
  "floor:added":           { zoneId: string; floor: FloorDef };
  "floor:updated":         { zoneId: string; floorId: string; changes: Partial<FloorDef> };
  "floor:removed":         { zoneId: string; floorId: string };
  "floortool:suggest-auto-floor": { zoneId: string; level: number; points: Vec2[]; nodeIds: string[] };
  "platform:added":        { zoneId: string; platform: PlatformDef };
  "platform:updated":      { zoneId: string; id: string; changes: Partial<PlatformDef> };
  "platform:removed":      { zoneId: string; id: string };
  "platform:rebuilt":      { zoneId: string; platformId: string };
  "tool:placed":           { type: EditorObjectType; id: string; zoneId: string };
  "stair:added":           { zoneId: string; stair: StairDef };
  "stair:updated":         { zoneId: string; id: string; changes: Partial<StairDef> };
  "stair:removed":         { zoneId: string; id: string };
  "stair:rebuilt":         { zoneId: string; stairId: string };
  "floor:rebuilt":         { zoneId: string; floorId: string };
  "object:added":          { zoneId: string; object: WorldObject };
  "object:removed":        { zoneId: string; id: string };
  "animation:preview-start":     { objectId: string; clipName: string };
  "animation:preview-stop":      { objectId: string };
  "animation:auto-play-changed": { objectId: string; clipName: string | null };
  "zone:added":            { zone: ZoneDef };
  "zone:activated":        { zoneId: string };
  "zone:loaded":           { zoneId: string };
  "zone:enter":            { zoneId: string };
  "transition:added":      { transition: TransitionDef };
  "spawn:updated":         { position: Vec3 };
  "preview:start":         { mode: "preview" | "game" };
  "preview:stop":          Record<string, never>;
  "preview:zone-entered":  { zoneName: string };
  "gizmo:dragging":        { isDragging: boolean };
  "camera:jump":           { x: number; z: number };
  "camera:topdown":        Record<string, never>;
  "character:interact":       { objectId: string };
  "character:interact-range": { objectId: string; label: string } | null;
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
  "input:click":           { screenPos: ScreenPos; worldPos: Vec3; button: number; shift: boolean; ctrl: boolean; meta: boolean };
  "selection:changed":     { refs: SelectedRef[] };
  "selection:set":         { refs: SelectedRef[] };
  "input:dblclick":        { screenPos: ScreenPos; worldPos: Vec3 };
  "input:mousemove":       { screenPos: ScreenPos; worldPos: Vec3; delta: ScreenPos };
  "input:mousedown":       { button: number; screenPos: ScreenPos };
  "input:mouseup":         { button: number; screenPos: ScreenPos };
  "input:wheel":           { delta: number };
  "input:keydown":         { code: string; key: string; shift: boolean; ctrl: boolean; alt: boolean; meta: boolean };
  "input:keyup":           { code: string };
  "history:restore":       Record<string, never>;
  "assets:loaded":         { assets: AssetDef[] };
  "leftpanel:open":        { panelId: LeftPanelId };
  "leftpanel:close":       Record<string, never>;
  "zonetool:awaiting-name": { bounds: Bounds };
  "zonetool:name-confirmed": { name: string; type: ZoneType };
  "zone:jump":             { zoneId: string };
  "audio:play":            { id: string; position?: Vec3 };
  "dialogue:show":         { speaker: string; lines: string[]; portrait?: string };
  "object:despawn":        { id: string };
  "ui:show":               { elementId: string };
  "trigger:volume-enter":  { volumeId: string };
  "trigger:volume-exit":   { volumeId: string };
  "triggervolume:added":   { zoneId: string; volume: TriggerVolume };
  "triggervolume:updated": { zoneId: string; id: string; changes: Partial<TriggerVolume> };
  "triggervolume:removed": { zoneId: string; id: string };
  "triggervolume:hover":   { zoneId: string; id: string | null };
  "triggervolume:select":  { zoneId: string; id: string | null };
  "triggervolume:placed":  { vol: TriggerVolume };
  "group:added":           { group: GroupDef };
  "group:removed":         { id: string };
  "group:updated":         { id: string; name: string };
  "group:visibility":      { groupId: string; visible: boolean };
  "object:play-animation": { id: string; clipName: string; loop?: boolean; hold?: boolean; blend?: number };
}

export type BusEventName = keyof BusEvents;
export type BusCallback<K extends BusEventName> = (payload: BusEvents[K]) => void;

// ─── Selection ────────────────────────────────────────────────────────────────

/** Lightweight reference to a selected entity (multi-select set). */
export interface SelectedRef {
  id:        string;
  type:      EditorObjectType;
  zoneId:    string;
  memberIds?: string[]; // all wall ids when the ref is a multi-wall run (type === "wall")
}

export interface SelectedObjectPayload {
  id: string;
  type: EditorObjectType;
  zoneId: string;
  parentId?: string;   // wallId when type === "opening"
  position: Vec3;
  rotation: Euler3;
  scale: Scale3;
  data: WallDef | FloorDef | PlatformDef | StairDef | WorldObject | Opening | TriggerVolume | null;
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
  editorOnly?:             boolean;
  _hasCsgCuts?:            boolean;  // cap mesh with CSG-cut world-space geometry
}

// ─── Scene file data model ────────────────────────────────────────────────────

export interface SceneMetadata {
  name:         string;
  version:      string;
  author:       string;
  created:      string;
  lastModified: string;
  uvVersion?:   number;   // 1 = world-space ÷ UV convention (Phase 10.8); absent = legacy
}

export interface SpawnDef {
  position:  Vec3;
  facingDeg: number;
}

// Locomotion states the third-person animation state machine drives (intent strings).
export type LocomotionState = "idle" | "walk" | "jump" | "jump_idle" | "jump_land";

export interface PlayerSettings {
  cameraMode:          CameraMode;
  moveSpeed:           number;
  jumpHeight:          number;
  fov:                 number;
  thirdPersonDistance: number;
  thirdPersonHeight:   number;
  jumpAnimSpeed?:      number;            // playback multiplier for the jump animation (default 1)
  characterScale?:     number;            // uniform scale of the 3rd-person avatar + collision (default 1)
  // Per-character clip overrides. Key absent/undefined = Auto (name match); null = None
  // (play nothing); string = use that exact clip name.
  animClips?:          Partial<Record<LocomotionState, string | null>>;
  modelAssetId?:       string | null;
}

export interface WorldConfig {
  size:            { width: number; depth: number };
  ambientLight:    { color: string; intensity: number };
  sunLight:        { color: string; intensity: number; position: Vec3 };
  skybox:          string;
  fogColor:        string;
  fogDensity:      number;
  playerSettings:  PlayerSettings;
  defaultSpawn?:   SpawnDef;
  scripts?:        ScriptDef[];
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
  nodeIds?: string[];  // if set, points are derived from these wall nodes at build time
  material: string;
}

export interface FloorDef {
  id:                string;
  label?:            string;   // optional human-friendly name; falls back to id
  level:             number;
  elevation:         number;
  ceilingHeight:     number | null;
  floorMesh:         FloorMeshDef;
  materialOverrides?: MaterialOverrides;
  groupIds?:         string[];
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

export interface WallDef {
  id:                 string;
  label?:             string;   // optional human-friendly name; falls back to id
  startNodeId:        string;
  endNodeId:          string;
  floor:              number;
  elevation?:         number;   // Y offset from ground, default 0
  height:             number;
  thickness:          number;
  material:           string;
  exteriorMaterial:   string;
  openings:           Opening[];
  materialOverrides?: MaterialOverrides;
  groupIds?:         string[];
}

export interface PlatformDef {
  id:             string;
  label?:         string;     // optional human-friendly name; falls back to id
  position:       Vec3;
  size:           { width: number; depth: number };
  thickness:      number;
  material:       string;
  hasRailing:     boolean;
  railingHeight:  number;
  rotation?:      Vec3;       // degrees — Y is yaw around vertical axis
  floorLevel?:    number;
  points?:        Vec2[];
  nodeIds?:       string[];
  materialOverrides?:     MaterialOverrides;
  sideMaterial?:          string;
  sideMaterialOverrides?: MaterialOverrides;
  groupIds?:              string[];
}

export interface StairCutterDef {
  offset:      Vec3;
  width:       number;
  depth:       number;
  height:      number;
  rotation?:   Vec3;    // degrees (X/Y/Z); Y defaults to stair angle on enable
  innerTileH?: number;  // UV tiling along width/depth of inner faces
  innerTileV?: number;  // UV tiling along thickness of inner faces
}

export interface StairRailingDef {
  topRail:       boolean;   // top cap rail along the slope
  balusters:     boolean;   // vertical posts
  height:        number;    // rail height above the step nosings (m)
  stepInterval:  number;    // a baluster every N steps (>= 1)
  barThickness:  number;    // top-rail cross-section (m)
  postThickness: number;    // baluster cross-section (m)
  sideInset:     number;    // inward offset of the rail from the step's side edge (m)
  overhang:      number;    // how far the top rail extends past the end posts, each end (m)
}

export type StairUndersideMode = "open" | "diagonal" | "closed";
export interface StairUndersideDef {
  mode:      StairUndersideMode;  // open = stepped (current); diagonal = slanted soffit; closed = to floor
  thickness: number;              // diagonal only: clearance below the steps (stringer depth, m)
}

export interface StairDef {
  id:          string;
  label?:      string;   // optional human-friendly name; falls back to id
  start:       Vec3;
  end:         Vec3;
  width:       number;
  numSteps?:   number;
  style:       StairStyle;
  material:    string;
  hasRailing:  boolean;
  railing?:    StairRailingDef;   // railing config; absent → builder defaults
  underside?:  StairUndersideDef; // underside style; absent → "open" (current behavior)
  materialOverrides?:      MaterialOverrides;
  riserMaterial?:          string;
  riserMaterialOverrides?: MaterialOverrides;
  csgCutter?:              StairCutterDef;
  groupIds?:               string[];
}

export interface ObjectProperties {
  interactable:   boolean;
  interactLabel?: string;
  npcSpawn:       boolean;
  lootTableId:    string | null;
  triggerEventId: string | null;
}

export interface WorldObject {
  id:         string;
  label?:     string;   // optional human-friendly name; falls back to id
  assetId:    string;
  position:   Vec3;
  rotation:   Euler3;
  scale:      Scale3;
  floor:      number;
  zoneId?:    string;
  properties: ObjectProperties;
  scripts?:   ScriptDef[];
  groupIds?:  string[];
  autoPlayAnimation?: string | null;   // clip name that loops automatically (Phase 10.7)
  material?:  string;                  // registry material id; overrides baked GLTF materials (change_material)
}

export interface ZoneDef {
  id:              string;
  name:            string;
  type:            ZoneType;
  bounds:          Bounds;
  nodes:           WallNode[];
  floors:          FloorDef[];
  walls:           WallDef[];
  platforms:       PlatformDef[];
  stairs:          StairDef[];
  objects:         WorldObject[];
  scripts?:        ScriptDef[];
  triggerVolumes?: TriggerVolume[];
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
  groups?:     GroupDef[];
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

// ─── Scripting / Event System ─────────────────────────────────────────────────

export type TriggerType =
  | 'on_player_enter'
  | 'on_player_exit'
  | 'on_interact'
  | 'on_timer'
  | 'on_health_zero'
  | 'on_flag_set'
  | 'on_flag_cleared'
  | 'on_level_load'
  | 'on_game_start';

export type ConditionType =
  | 'flag_set'
  | 'flag_not_set'
  | 'player_has_item'
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
  | 'run_script';

export interface ScriptTrigger {
  type:       TriggerType;
  targetId?:  string;
  delay?:     number;
  repeat?:    boolean;
  interval?:  number;
}

export interface ScriptCondition {
  type:    ConditionType;
  flag?:   string;
  itemId?: string;
  npcId?:  string;
}

export interface DialogueDef {
  speaker:   string;
  lines:     string[];
  portrait?: string;
}

export interface ScriptAction {
  type:          ActionType;
  targetId?:     string;
  animation?:    string;
  animationLoop?: boolean;   // play_animation: loop the clip forever
  animationHold?: boolean;   // play_animation: freeze on the final frame (e.g. death)
  animationBlend?: number;   // play_animation: crossfade seconds into the clip (overrides default)
  sound?:        string;
  dialogue?:     DialogueDef;
  material?:     string;
  position?:     Vec3;
  flag?:         string;
  eventId?:      string;
  itemId?:       string;
  fadeColor?:    string;
  fadeDuration?: number;
  uiElementId?:  string;
  script?:       string;
}

export interface ScriptDef {
  id:         string;
  label:      string;
  zoneId:     string;
  enabled:    boolean;
  trigger:    ScriptTrigger;
  conditions: ScriptCondition[];
  actions:    ScriptAction[];
  oneShot:    boolean;
}

export interface TriggerVolume {
  id:       string;
  label:    string;
  position: Vec3;
  size:     Vec3;
  rotation?: Vec3;   // degrees, Y = yaw — applied to wireframe + sensor (axis-aligned when absent)
  zoneId:    string;
  scripts?:  ScriptDef[];
  groupIds?: string[];
}

export interface EntityCapabilities {
  emits:    TriggerType[];
  receives: ActionType[];
}
