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
  color?:             string;   // hex "#rrggbb" — flat-color mode, skips all texture maps
}

export type QualityScale = 'low' | 'medium' | 'high';

// ─── Asset types ──────────────────────────────────────────────────────────────

export type ColliderType  = 'box' | 'mesh' | 'none';
export type AssetCategory = 'Furniture' | 'Props' | 'Structures' | 'Lights' | 'Characters' | 'Vegetation' | 'Other' | (string & {});
export type LeftPanelId   = 'assets' | 'materials' | 'groups' | 'scripts' | 'decals' | null;

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

export type ToolId = "select" | "floor" | "poly-floor" | "wall" | "platform" | "poly-platform" | "stair" | "object" | "zone" | "spawnpoint" | "trigger-volume" | "decal" | "shape-cylinder" | "shape-wedge" | "shape-box";
export type ZoneType = "outdoor" | "indoor" | "dungeon";
export type OpeningType = "door" | "window" | "arch" | "passage";
export type StairStyle = "straight" | "l-shape" | "spiral";
export type CameraMode = "fps" | "thirdperson";
export type EditorObjectType = "wall" | "floor" | "platform" | "stair" | "object" | "terrain" | "trigger" | "trim" | "opening" | "spawn" | "trigger-volume" | "checkpoint" | "decal" | "shape";
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
  // Panel segment-row hover → canvas highlight (null wallId clears it).
  "wall:segment-hover":    { zoneId: string; wallId: string | null };
  // Panel vertex-row hover → highlight everything sharing the node (null clears).
  // sourceId: the selected entity emitting the hover — the highlighter skips it.
  "node:link-hover":       { zoneId: string; nodeId: string | null; sourceId?: string };
  "floor:added":           { zoneId: string; floor: FloorDef };
  "floor:updated":         { zoneId: string; floorId: string; changes: Partial<FloorDef> };
  "floor:removed":         { zoneId: string; floorId: string };
  "floortool:suggest-auto-floor": { zoneId: string; level: number; points: Vec2[]; nodeIds: string[] };
  "platform:added":        { zoneId: string; platform: PlatformDef };
  "platform:updated":      { zoneId: string; id: string; changes: Partial<PlatformDef> };
  "platform:removed":      { zoneId: string; id: string };
  "platform:rebuilt":      { zoneId: string; platformId: string };
  "shape:added":           { zoneId: string; shape: ShapeDef };
  "shape:updated":         { zoneId: string; id: string; changes: Partial<ShapeDef> };
  "shape:removed":         { zoneId: string; id: string };
  "shape:rebuilt":         { zoneId: string; shapeId: string };
  // Geometry-panel toggle → ShapeResizer face handles (per current selection).
  "shape:resize-toggle":   { enabled: boolean };
  // Geometry-panel "add corner" arm → BrushVertexEditor (next click on the brush inserts a vertex).
  "shape:add-corner":      { armed: boolean };
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
  "preview:start":         { mode: "preview" | "game"; resume?: boolean };
  "preview:stop":          Record<string, never>;
  "preview:zone-entered":  { zoneName: string };
  "gizmo:dragging":        { isDragging: boolean };
  // A ColliderEditor face handle is under the cursor — GizmoManager suspends
  // TransformControls so the handle wins the pick (its pickers overlap on small objects).
  "collider:handle-hover": { hovering: boolean };
  // Suspend/restore the object TransformControls. Sources are independent (panel
  // toggle, collider move gizmo) — the gizmo stays off while any source suspends.
  "gizmo:suspend":         { source: string; suspended: boolean };
  // Toggle the per-collider translate gizmo (null = off). Editor-session only.
  "collider:move":         { objectId: string; colliderId: string | null };
  // Per-collider editor visibility (hidden wireframes/handles). Editor-session only.
  "collider:hidden":       { objectId: string; hidden: string[] };
  "camera:jump":           { x: number; z: number };
  "camera:topdown":        Record<string, never>;
  "character:interact":       { objectId: string };
  "character:interact-range": { objectId: string; label: string } | null;
  "character:teleport":    { position: Vec3; facing?: number };
  "character:save-position": { key: string };
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
  "input:click":           { screenPos: ScreenPos; worldPos: Vec3; surfacePos: Vec3 | null; button: number; shift: boolean; ctrl: boolean; meta: boolean };
  "selection:changed":     { refs: SelectedRef[] };
  "selection:set":         { refs: SelectedRef[] };
  "input:dblclick":        { screenPos: ScreenPos; worldPos: Vec3; surfacePos: Vec3 | null };
  // Stationary right-click (RMB press+release under the drag threshold — orbit drags never fire this).
  "input:rightclick":      { screenPos: ScreenPos; worldPos: Vec3; surfacePos: Vec3 | null };
  "input:mousemove":       { screenPos: ScreenPos; worldPos: Vec3; surfacePos: Vec3 | null; delta: ScreenPos };
  "input:mousedown":       { button: number; screenPos: ScreenPos };
  "input:mouseup":         { button: number; screenPos: ScreenPos };
  "input:wheel":           { delta: number; shift: boolean; ctrl: boolean; alt: boolean; meta: boolean };
  // Suspend EditorCamera wheel-zoom while a tool consumes the scroll (e.g. decal resize).
  // Sources are independent — zoom stays locked while any source holds a lock.
  "camera:zoom-lock":      { source: string; locked: boolean };
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
  "decal:added":           { zoneId: string; decal: DecalDef };
  "decal:updated":         { zoneId: string; id: string; changes: Partial<DecalDef> };
  "decal:removed":         { zoneId: string; id: string };
  "decal:rebuilt":         { zoneId: string; decalId: string };
  "decal:placed":          { zoneId: string; id: string };
  // Decal picker → tool: arm the DecalTool with a texture (null disarms).
  "decaltool:texture":     { textureId: string | null; kind: DecalKind };
  "checkpoint:added":      { zoneId: string; checkpoint: CheckpointDef };
  "checkpoint:updated":    { zoneId: string; id: string; changes: Partial<CheckpointDef> };
  "checkpoint:removed":    { zoneId: string; id: string };
  "checkpoint:placed":     { zoneId: string; id: string };
  "spawn:mode":            { mode: "initial" | "checkpoint" };
  "spawn:placed":          Record<string, never>;
  "group:added":           { group: GroupDef };
  "group:removed":         { id: string };
  "group:updated":         { id: string; name: string };
  "group:visibility":      { groupId: string; visible: boolean };
  "object:play-animation": { id: string; clipName: string; loop?: boolean; hold?: boolean; blend?: number };
  "state:changed":         { key: string; value: JsonValue };
}

export type BusEventName = keyof BusEvents;
export type BusCallback<K extends BusEventName> = (payload: BusEvents[K]) => void;

// ─── Selection ────────────────────────────────────────────────────────────────

/** Ids of every entity referencing a wall node (see WorldState.getNodeLinks). */
export interface NodeLinks {
  wallIds:     string[];
  floorIds:    string[];
  platformIds: string[];
}

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
  data: WallDef | FloorDef | PlatformDef | StairDef | WorldObject | Opening | TriggerVolume | CheckpointDef | DecalDef | ShapeDef | null;
  runWalls?: WallDef[]; // populated for multi-wall runs; undefined for single-wall selections
  // Walls are node-backed (no stored position/rotation on WallDef itself), so the panel
  // needs the run's current XZ centroid + orientation computed from live node positions.
  // Populated only for type === "wall"; position.y (elevation) is already meaningful.
  wallRunCenter?:   Vec2;
  wallRunAngleDeg?: number;
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
  faceGroups?:             FaceGroup[];  // face-brush meshes: triangle range → face (Phase 23)
  editorOnly?:             boolean;
  _hasCsgCuts?:            boolean;  // cap mesh with CSG-cut world-space geometry
  // Hidden-wall ghost: picked only when nothing solid is under the cursor, hidden in preview/game.
  ghostPick?:              boolean;
  hiddenWall?:             boolean;
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

/**
 * A named, inert position+facing marker (per zone). Renders a spawn-style indicator in a
 * distinct color. Does nothing on its own — scripts reference it (e.g. store_position with
 * posSource "object" → save its pose to a state key that teleport_player reads) to turn it
 * into a checkpoint/respawn.
 */
export interface CheckpointDef {
  id:        string;
  label?:    string;
  position:  Vec3;
  facingDeg: number;
  groupIds?: string[];
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
  stateSchema?:    Record<string, StateSchema>;   // authored gameplay-state keys (defaults + numeric clamp)
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
  // Hidden segments render as a translucent editor-only ghost, get no colliders, and are
  // invisible in preview/game — but stay in zone.walls/runs (room loops, floor fills).
  hidden?:            boolean;
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

// ─── Parametric shape primitives (Phase 22) ─────────────────────────────────

export type ShapeKind = "cylinder" | "wedge" | "box";

/**
 * One polygonal face of a face-brush (Phase 23): an ordered loop of indices into
 * ShapeBrushMesh.vertices, CCW when viewed from OUTSIDE the solid (Newell normal
 * points outward). Faces tile the full boundary; every undirected edge appears in
 * exactly two loops (opposite directions).
 */
export interface BrushFace {
  verts: number[];                       // ≥ 3, CCW outward loop
  material?: string;                     // absent → shape.material
  materialOverrides?: MaterialOverrides; // per-face tile/offset/maps
}

/**
 * Brush mode (v4.10.0): a LOCAL-space vertex cloud that supersedes the kind params
 * when present. Without `faces`, geometry + collider are the convex hull of the
 * points (any arrangement stays a valid solid). With `faces` (Phase 23 — created by
 * Convert to Brush / face-mode auto-bake), the loops are authoritative: geometry is
 * their fan triangulation (concave solids allowed) and the collider is a trimesh.
 * NOTE: WorldState.updateShape shallow-merges, so `changes.mesh` REPLACES this whole
 * object — writers must always send BOTH `vertices` and `faces`.
 */
export interface ShapeBrushMesh {
  vertices: Vec3[];      // local space (same contract as generated geometry)
  faces?:   BrushFace[]; // absent → legacy convex-cloud behavior (unchanged)
}

/** userData.faceGroups on a built face-brush mesh: triangle range → logical face. */
export interface FaceGroup {
  start:     number;   // first triangle index in this mesh
  count:     number;   // triangles in the face's fan
  faceIndex: number;   // index into ShapeBrushMesh.faces
}

/**
 * A parametric solid (cylinder/cone, wedge/ramp, flexible box). Geometry is ALWAYS
 * generated in LOCAL space — footprint centered on the XZ origin, base at local
 * y = 0 (position.y = bottom, the platform convention). `position`/`rotation` are
 * applied as mesh.position/mesh.rotation and mirrored onto the collider, never
 * baked into vertices — the local-space contract the Phase-12 brush stub requires.
 * Per-kind params are flat optional scalars (WorldState.updateShape shallow-merges);
 * defaults + clamping live in ShapeBuilder.resolveShapeParams.
 */
export interface ShapeDef {
  id:        string;            // shape_<uuid8>
  label?:    string;            // optional human-friendly name; falls back to id
  kind:      ShapeKind;
  position:  Vec3;
  rotation:  Euler3;            // degrees XYZ
  material:  string;            // caps (top/bottom faces)
  materialOverrides?: MaterialOverrides;
  sideMaterial?:          string;             // side faces; absent → same as material
  sideMaterialOverrides?: MaterialOverrides;
  floorLevel?: number;
  groupIds?:   string[];
  mesh?:     ShapeBrushMesh;    // brush mode — supersedes the kind params below
  // cylinder / cone
  radiusTop?:      number;      // default 1; 0 → cone (no top cap)
  radiusBottom?:   number;      // default 1
  height?:         number;      // cylinder AND box; default 2
  radialSegments?: number;      // 3–64, default 16 (3 = tri prism, 6 = hex pillar)
  // wedge / ramp
  width?:      number;          // wedge AND box footprint X; default 2
  depth?:      number;          // wedge AND box footprint Z; default 2
  heightLow?:  number;          // default 0.1 — front edge (+Z); 0 = true ramp
  heightHigh?: number;          // default 1.5 — back edge (−Z)
  // flexible box extras
  taperX?: number;              // top-face scale factor, default 1 (min 0.01)
  taperZ?: number;
  shearX?: number;              // top-face offset in meters, default 0
  shearZ?: number;
}

export interface ObjectProperties {
  interactable:   boolean;
  interactLabel?: string;
  npcSpawn:       boolean;
  lootTableId:    string | null;
  triggerEventId: string | null;
}

export type AttachedColliderShape = "box" | "sphere" | "capsule";  // "hull" reserved for later

/** A collider attached to a placed object in the object's local space. */
export interface AttachedCollider {
  id:         string;                 // col_<uuid8> — stable handle for list edits + drag handles
  shape:      AttachedColliderShape;
  offset:     Vec3;                   // local, pre-scale, relative to object origin
  size:       Vec3;                   // box: full extents; sphere: x = radius; capsule: x = radius, y = full height
  rotationY?: number;                 // deg, local yaw (box/capsule; ignored for sphere)
  isSensor:   boolean;                // sensor fires on_player_enter/on_player_exit; solid blocks movement
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
  // undefined → implicit auto-box from model bounds when asset.collidable; [] → explicitly none.
  colliders?: AttachedCollider[];
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
  checkpoints?:    CheckpointDef[];
  decals?:         DecalDef[];
  shapes?:         ShapeDef[];
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
  | 'on_state_changed'
  | 'on_level_load'
  | 'on_game_start';

export type ConditionType =
  | 'has_state'
  | 'compare_number'
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
  | 'set_state'
  | 'adjust_number'
  | 'delete_state'
  | 'store_position'
  | 'fire_event'
  | 'fade_screen'
  | 'teleport_player'
  | 'show_ui'
  | 'run_script';

// ─── Generic gameplay state ───────────────────────────────────────────────────

/** Any JSON-serializable value the GameState store can hold. */
export type JsonValue =
  | number | boolean | string | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Optional schema for a registered state key — drives defaults + numeric clamping. */
export interface StateSchema {
  type:     'number' | 'boolean' | 'string' | 'object';
  default?: JsonValue;
  min?:     number;
  max?:     number;
}

export type CompareOp = '>=' | '<=' | '>' | '<' | '==' | '!=';

export interface ScriptTrigger {
  type:       TriggerType;
  targetId?:  string;
  delay?:     number;
  repeat?:    boolean;
  interval?:  number;
}

export interface ScriptCondition {
  type:       ConditionType;
  npcId?:     string;
  stateKey?:  string;      // has_state / compare_number
  compareOp?: CompareOp;   // compare_number
  stateValue?: JsonValue;  // compare_number (compared as number)
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
  positionKey?:  string;      // teleport_player: read destination Vec3 from this state key (overrides position)
  posSource?:    'player' | 'object' | 'coords';  // store_position: where the stored position comes from
  facing?:       number;      // degrees — store_position coords facing / teleport_player literal facing
  facingSource?: 'keep' | 'literal' | 'key';      // teleport_player: how to set look direction
  facingKey?:    string;      // teleport_player: read facing (number, or a pose's .facing) from this key
  stateKey?:     string;      // set_state / adjust_number / delete_state / store_position (destination key)
  stateValue?:   JsonValue;   // set_state
  numberDelta?:  number;      // adjust_number
  eventId?:      string;
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
  visual?:   TriggerVolumeVisual;   // optional in-world fill; absent/disabled = wireframe only
}

// Optional decorative fill for a trigger volume (a "warp box"). Rendered in preview AND
// game (the debug wireframe stays editor-only). `style` is a discriminator so more fill
// styles can be added later.
export interface TriggerVolumeVisual {
  enabled:    boolean;
  style:      "gradient";        // only value for now
  color:      string;            // hex, e.g. "#5a3d8f"
  fadeDir:    "up" | "down";     // up = opaque at bottom, fades toward top
  opacity:    number;            // 0..1 max alpha
  fadeHeight: number;            // 0..1 fraction of box height the gradient spans (1 = full)
  animate:    boolean;           // subtle pulse
}

// ─── Decals (Phase 20/21) ────────────────────────────────────────────────────

export type DecalKind = "overlay" | "surface";

// A decal is a free-floating world-space stamp — it stores NO target entity id.
// Wall runs merge/split and their meshes are disposed wholesale on rebuild, so a
// stored wallId would dangle; instead the decal re-projects at build time onto
// whatever static geometry its projector box intersects. If geometry moves away,
// the def is kept and the mesh is simply skipped.
export interface DecalDef {
  id:        string;          // dec_<uuid8>
  label?:    string;
  kind:      DecalKind;       // overlay = DecalGeometry mesh; surface = in-shader projection (Phase 21)
  textureId: string;          // id in the decals manifest registry
  position:  Vec3;            // world-space anchor ON the surface
  normal:    Vec3;            // unit world normal captured at placement
  rotation:  number;          // degrees, roll around normal
  size:      { width: number; height: number };  // meters
  depth?:    number;          // overlay projector depth; default max(w,h)*0.5, min 0.2
  opacity:   number;          // 0..1 (surface kind: blend strength)
  triplanar?: boolean;        // surface kind only — corner-wrapping projection
  roughnessMod?: number;      // surface kind only — roughness where alpha>0 (wet look)
  groupIds?: string[];
}

export interface DecalTexDef {
  id:          string;
  label:       string;
  category?:   string;
  path:        string;        // /assets/decals/<file>.png (albedo, transparent)
  maps?:       { normal?: string; roughness?: string };  // optional PBR maps (overlay kind)
  kinds:       DecalKind[];   // which modes this texture supports
  attribution?: Attribution;
}

export interface DecalManifest {
  version: string;
  decals:  DecalTexDef[];
}

export interface EntityCapabilities {
  emits:    TriggerType[];
  receives: ActionType[];
}
