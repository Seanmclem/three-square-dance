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
export type LeftPanelId   = 'assets' | 'materials' | 'groups' | 'scripts' | 'decals' | 'audio' | 'skybox' | 'graphics' | 'prefabs' | null;

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
  // Asset-level preset colliders (Phase 26 baked assets: one box per source shape).
  // Placement preference: obj.colliders ?? def.colliders ?? auto box. Local space.
  colliders?:   AttachedCollider[];
}

export interface AssetManifest {
  version: string;
  assets:  AssetDef[];
}

// ─── Audio asset types (Phase 36) ─────────────────────────────────────────────
// Sound-library entries. Mirrors AssetDef/AssetManifest: one manifest at
// public/assets/audio/manifest.json, loaded by AssetManager.initAudio().
export type SoundCategory = 'Music' | 'Ambient' | 'SFX' | (string & {});

export interface SoundDef {
  id:           string;
  label:        string;
  category:     SoundCategory;   // also picks the mixer bus (Music/Ambient/SFX)
  path:         string;
  loop?:        boolean;         // default-loop hint (music/ambient); one-shots leave false
  volume?:      number;          // 0..1 authored base gain (default 1)
  spatial?:     boolean;         // true = suitable as a PositionalAudio emitter
  tags:         string[];
  dateAdded:    string;
  attribution?: Attribution;
}

export interface SoundManifest {
  version: string;
  sounds:  SoundDef[];
}

// ─── Skybox asset types (Phase 37) ────────────────────────────────────────────
// Equirectangular background/environment images. Mirrors SoundDef/SoundManifest:
// one manifest at public/assets/skyboxes/manifest.json, loaded by
// AssetManager.initSkyboxes(). The special WorldConfig.skybox value "sky" selects
// the built-in procedural Sky instead of any of these.
export type SkyboxCategory = 'Day' | 'Sunset' | 'Night' | 'Space' | 'Studio' | 'Other' | (string & {});

export interface SkyboxDef {
  id:           string;
  label:        string;
  category:     SkyboxCategory;
  path:         string;          // /assets/skyboxes/<file>.(jpg|png|hdr) — equirectangular
  format:       'ldr' | 'hdr';   // ldr = TextureLoader (jpg/png); hdr = RGBELoader
  thumbnail?:   string;
  tags:         string[];
  dateAdded:    string;
  attribution?: Attribution;
}

export interface SkyboxManifest {
  version:  string;
  skyboxes: SkyboxDef[];
}

// ─── 2D graphics asset types (Phase 48) ──────────────────────────────────────
// Flat images (icons, HUD art, UI graphics — PNG with transparency, jpg, webp).
// Mirrors SoundDef/SoundManifest: one manifest at public/assets/graphics/
// manifest.json, loaded by AssetManager.initGraphics(). Consumed as <img src>
// by item icons and custom GUI elements — never as scene textures.

export interface GraphicDef {
  id:           string;
  label:        string;
  category?:    string;   // pill filter — "Icons", "HUD", pack name…
  path:         string;   // /assets/graphics/<file>.(png|jpg|webp)
  width?:       number;   // intrinsic px, read at import via createImageBitmap
  height?:      number;
  attribution?: Attribution;
}

export interface GraphicsManifest {
  version:  string;
  graphics: GraphicDef[];
}

// ─── Primitive helpers ────────────────────────────────────────────────────────

export type ToolId = "select" | "select-face" | "select-vertex" | "select-edge" | "floor" | "poly-floor" | "wall" | "platform" | "poly-platform" | "stair" | "ladder" | "object" | "groups" | "spawnpoint" | "trigger-volume" | "decal" | "shape-cylinder" | "shape-wedge" | "shape-box" | "light-point" | "light-spot" | "light-directional" | "prefab";
export type ZoneType = "outdoor" | "indoor" | "dungeon";
export type OpeningType = "door" | "window" | "arch" | "passage";
export type StairStyle = "straight" | "l-shape" | "spiral";
export type CameraMode = "fps" | "thirdperson";
// Phase 28 — "occlusion" is New Game rendered from a detached editor-camera vantage
// (the character's camera keeps running as an unrendered "logic camera").
export type PreviewMode = "preview" | "game" | "occlusion";
/** Gameplay semantics (defaultSpawn, hide editor furniture, gizmo/node-dot lockout) — everything but plain preview. */
export const isGameplayMode = (m: PreviewMode): boolean => m !== "preview";
export type EditorObjectType = "wall" | "floor" | "platform" | "stair" | "ladder" | "object" | "terrain" | "trigger" | "trim" | "opening" | "spawn" | "trigger-volume" | "checkpoint" | "decal" | "shape" | "light" | "prefab-instance";
export type TransitionEffect = "fade" | "none";

// ─── Vec / transform ─────────────────────────────────────────────────────────

export interface Vec2 { x: number; z: number }
export interface Vec3 { x: number; y: number; z: number }

/** Editor orbit-camera pose, persisted per scene in SceneMetadata (Phase 33.x).
 *  Editor-only convenience data — the runtime ignores it. */
export interface EditorCameraPose {
  focus:  Vec3;
  radius: number;
  phi:    number;
  theta:  number;
}

export interface WallNode {
  id: string;
  x:  number;
  z:  number;
  /** Cross-floor corner link (copy-to-floor). Nodes sharing a linkId keep the
   *  same x/z — WorldState.updateNode propagates a move to every link-mate.
   *  Absent = unlinked. Nodes can't be *shared* between floors outright: a
   *  shared node would read as degree-4 in groupWallRuns' canMerge and shatter
   *  both runs' merged geometry. */
  linkId?: string;
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
  // ObjectTool announcing it disarmed itself (Escape / right-click / tool switch), so the
  // AssetBrowser highlight can follow. Without this the panel keeps showing an asset as
  // selected while the tool is idle, and the next click on that tile reads as "deselect".
  "objecttool:disarmed":   Record<string, never>;
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
  // Sub-object selection change (canvas face click, vertex-handle click, or a panel
  // row click). SelectionManager is the sink: it stores the sub-selection and
  // re-emits object:selected with faceIndex/vertexIndex/edgeVerts — one channel for
  // all consumers. null clears. Edges have no stored identity: an edge IS its
  // (unordered) vertex-index pair, valid while some face loop traverses it.
  "shape:sub-select":      { zoneId: string; shapeId: string; faceIndex: number | null; vertexIndex: number | null; edge?: [number, number] | null };
  // Panel face-row hover → canvas overlay (wall:segment-hover idiom; null clears).
  "shape:face-hover":      { zoneId: string; shapeId: string; faceIndex: number | null };
  "tool:placed":           { type: EditorObjectType; id: string; zoneId: string };
  "stair:added":           { zoneId: string; stair: StairDef };
  "stair:updated":         { zoneId: string; id: string; changes: Partial<StairDef> };
  "stair:removed":         { zoneId: string; id: string };
  "stair:rebuilt":         { zoneId: string; stairId: string };
  "ladder:added":          { zoneId: string; ladder: LadderDef };
  "ladder:updated":        { zoneId: string; id: string; changes: Partial<LadderDef> };
  "ladder:removed":        { zoneId: string; id: string };
  // Player capsule entered/left a ladder's climb sensor (TriggerSystem, preview/game only).
  "ladder:zone-enter":     { ladderId: string };
  "ladder:zone-exit":      { ladderId: string };
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
  "preview:start":         { mode: PreviewMode; resume?: boolean };
  "preview:stop":          Record<string, never>;
  "preview:zone-entered":  { zoneName: string };
  // Phase 28 — occlusion-test mode HUD state: which thing the mouse/keys drive
  // (Tab) and whether the cull-as-player render pass is on (C).
  "occlusion:state":       { subMode: "player" | "camera"; cullView: boolean };
  // Phase 24 — active control scheme label flipped (drives HUD prompts + touch overlay)
  "input:scheme-changed":  { scheme: "kbm" | "gamepad" | "touch" };
  // Phase 24 — scheme-agnostic menu actions from ControlSchemeManager (gamepad A/Start, touch tap/✕).
  // confirm fires only while a dialogue is open; cancel closes the dialogue or exits preview.
  "action:confirm":        Record<string, never>;
  "action:cancel":         Record<string, never>;
  // Phase 24 — App closed the dialogue overlay (menu-mode gate for ControlSchemeManager)
  "dialogue:closed":       Record<string, never>;
  // Phase 24b — pause menu open/close (second menu-mode gate) + d-pad menu navigation
  "pause:show":            Record<string, never>;
  "pause:closed":          Record<string, never>;
  // Phase 32 — inventory bag: toggle edge (manager → shells) + open/close gates
  // (shells → ControlSchemeManager, third menu-mode client after dialogue/pause)
  "bag:toggle":            Record<string, never>;
  "bag:show":              Record<string, never>;
  "bag:closed":            Record<string, never>;
  "menu:nav":              { dir: -1 | 1 };
  "gizmo:dragging":        { isDragging: boolean };
  // A ColliderEditor face handle is under the cursor — GizmoManager suspends
  // TransformControls so the handle wins the pick (its pickers overlap on small objects).
  "collider:handle-hover": { hovering: boolean };
  // Suspend/restore the object TransformControls. Sources are independent (panel
  // toggle, collider move gizmo) — the gizmo stays off while any source suspends.
  "gizmo:suspend":         { source: string; suspended: boolean };
  // Toggle the per-collider gizmo (null = off). Editor-session only. "resize"
  // shows the face drag-handles (box only) instead of a TransformControls.
  "collider:move":         { objectId: string; colliderId: string | null; mode?: "translate" | "rotate" | "resize" };
  // Per-collider editor visibility (hidden wireframes/handles). Editor-session only.
  "collider:hidden":       { objectId: string; hidden: string[] };
  "camera:jump":           { x: number; z: number };
  "camera:topdown":        Record<string, never>;
  "character:interact":       { objectId: string };
  "character:interact-range": { objectId: string; label: string } | null;
  "character:teleport":    { position: Vec3; facing?: number };
  "character:save-position": { key: string };
  "character:triggerdoor": { transitionId: string };
  // Damage flash. Deliberately NOT overlay:fade-in — that one animates to fully
  // opaque and makes InputManager/ControlSchemeManager suppress input, which would
  // freeze the player mid-fight. This peaks at `peak` opacity and releases itself.
  "overlay:flash":         { color: string; duration: number; peak: number };
  "character:flash":       { color: string; duration: number };   // tint the avatar (3rd-person) / screen-flash (FPS) — CharacterController picks, it owns cameraMode
  "overlay:fade-in":       { color: string; duration: number };
  "overlay:fade-out":      { duration: number };
  "scene:save":            Record<string, never>;
  "scene:load":            { json: unknown };
  "scene:saved":           { json: SceneFile };
  "scene:loaded":          { metadata: SceneMetadata };
  "scene:load-request":    { sceneId: string };   // load_scene action → runtime SceneRouter (no editor listener)
  "world:loaded":          { metadata: SceneMetadata };
  "materials:loaded":      { materials: MaterialDef[] };
  "quality:changed":       { quality: QualityScale };
  "terrain:sculpt":        { x: number; z: number; radius: number; delta: number };
  "input:click":           { screenPos: ScreenPos; worldPos: Vec3; surfacePos: Vec3 | null; button: number; shift: boolean; ctrl: boolean; meta: boolean };
  "selection:changed":     { refs: SelectedRef[] };
  "selection:set":         { refs: SelectedRef[] };
  // Additive-click toggle routed from tools whose entities SelectionManager can't
  // raycast itself (trigger volumes) — adds/removes one ref from the selection.
  "selection:toggle-ref":  { ref: SelectedRef };
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
  // A model FILE was rewritten in place (re-origin) — same assetId, new geometry.
  // ZoneManager rebuilds every placed copy so meshes/localAABB/colliders refresh.
  "asset:model-updated":   { assetId: string };
  "leftpanel:open":        { panelId: LeftPanelId };
  "leftpanel:close":       Record<string, never>;
  // Audio (Phase 36) — consumed by AudioSystem. `id` is a SoundDef id; a positional
  // one-shot passes `position`. `key` lets a looped emit be stopped later by audio:stop.
  "audio:play":            { id: string; position?: Vec3; entityId?: string; volume?: number; loop?: boolean; key?: string };
  "audio:stop":            { id?: string; key?: string };   // no id/key ⇒ stop all one-shots
  "music:play":            { soundId: string; volume?: number; loop?: boolean; fade?: number };
  "music:stop":            { fade?: number };
  // Override the live footstep sound (surface swap). Empty/absent = revert to the
  // authored PlayerSettings.footstepSound. Runtime-only, resets when preview restarts.
  "character:set-footstep": { sound?: string };
  // Authored scene mix / ambient / music changed (editor) — mirrors "world:lighting".
  "world:audio":           { audio: WorldAudio };
  // Player-preference mix from the PauseMenu sliders (multiplies over authored mix).
  "audio:player-mix":      { mix: AudioMix };
  "sounds:loaded":         { sounds: SoundDef[] };
  // Skybox (Phase 37) — `skybox` is a SkyboxDef id, or "sky" for the procedural sky.
  // Consumed by SceneManager (swaps scene.background + environment). Mirrors "world:lighting".
  "world:sky":             { skybox: string };
  "skyboxes:loaded":       { skyboxes: SkyboxDef[] };
  "dialogue:show":         { speaker: string; lines: string[]; portrait?: string;
                             // Branching trees: response options for the current node,
                             // pre-filtered by conditions. hasNext=false ⇒ selecting ends.
                             // picked=true ⇒ already chosen earlier in THIS conversation
                             // (loops) — overlays de-emphasize but still allow it.
                             options?: { text: string; hasNext: boolean; picked?: boolean }[] };
  // Overlay → DialogueRunner: player picked options[index] of the shown node
  "dialogue:choose":       { index: number };
  "object:despawn":        { id: string; fade?: number };   // fade = seconds to fade out (collider disables at fade end)
  // Editor-only: PropertiesPanel's Enemy AI screen toggling the viewport range
  // rings for one object; objectId null clears them. leash null = free roam.
  "ai:range-preview":      { objectId: string | null; ranges?: { detect: number; giveUp: number; attack: number; leash: number | null } };
  "object:spawn":          { id: string; fade?: number };   // re-show a despawned/hidden entity; fade = seconds to fade in
  "character:launch":      { speed: number; hSpeed?: number; dirDeg?: number; relativeToPlayer?: boolean };   // spring/bouncer impulse — vertical velocity + optional horizontal shove (dirDeg = spawn-facing compass; relativeToPlayer = CharacterController adds its own look yaw, which only it knows)
  // Custom GUI (Phase 49). Visibility itself lives in gameState (`__ui.<id>`) so
  // it survives scene transitions and saves; these events cover menu interaction:
  // overlay → engine on option select, and overlay → ControlSchemeManager for
  // menu-mode input routing while a GUI menu is up.
  "ui:menu-pick":          { elementId: string; optionId: string };
  "ui:menu-shown":         { elementId: string };
  "ui:menu-closed":        { elementId: string };
  "trigger:volume-enter":  { volumeId: string };
  "trigger:volume-stay":   { volumeId: string };   // per-frame while inside (v4.76.3 — mid-occupancy condition retry)
  "trigger:volume-exit":   { volumeId: string };
  "triggervolume:added":   { zoneId: string; volume: TriggerVolume };
  "triggervolume:updated": { zoneId: string; id: string; changes: Partial<TriggerVolume> };
  "triggervolume:removed": { zoneId: string; id: string };
  "triggervolume:hover":   { zoneId: string; id: string | null };
  "triggervolume:select":  { zoneId: string; id: string | null };
  "triggervolume:placed":  { vol: TriggerVolume };
  // Panel MOVE/RESIZE toggle → TriggerVolumeResizer (resize handles shown only when enabled).
  "trigger:resize-toggle": { enabled: boolean };
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
  "light:added":           { zoneId: string; light: LightDef };
  "light:updated":         { zoneId: string; id: string; changes: Partial<LightDef> };
  "light:removed":         { zoneId: string; id: string };
  "light:placed":          { zoneId: string; id: string };
  // light_on/light_off/toggle_light script actions → ZoneManager (targetId already
  // group-expanded). Runtime-only: drives intensity (never WorldState), so light
  // counts stay fixed — no shader recompiles; reset on preview:stop.
  "light:set":             { targetId: string; op: "on" | "off" | "toggle" };
  // World-level ambient/sun/environment changed (or loaded) — SceneManager applies it
  // (fill/rim directionals scale with sun intensity; envIntensity drives scene.environmentIntensity).
  "world:lighting":        { ambient: { color: string; intensity: number }; sun: { color: string; intensity: number }; envIntensity?: number; quality?: "fancy" | "fast" };
  "spawn:mode":            { mode: "initial" | "checkpoint" };
  "spawn:placed":          Record<string, never>;
  "group:added":           { group: GroupDef };
  "group:removed":         { id: string };
  "group:updated":         { id: string; name: string };
  "group:visibility":      { groupId: string; visible: boolean };
  "object:play-animation": { id: string; clipName: string; loop?: boolean; hold?: boolean; blend?: number };
  // play_animation with target "player" — a script clip overrides the avatar's locomotion
  // state machine until it ends (one-shot), is cleared ("__auto__"), or the player moves.
  "character:play-animation": { clipName: string; loop?: boolean; hold?: boolean };
  // start/stop/toggle_mover script actions → MoverSystem (targetId already group-expanded)
  "mover:set":             { targetId: string; op: "start" | "stop" | "toggle"; moverId?: string };
  "state:changed":         { key: string; value: JsonValue };
  // Prefabs (Phase 44). Instance records are pure metadata — no ZoneManager listener.
  "prefab:selected":       { prefab: PrefabDef };   // panel → PrefabTool: arm placement
  "prefabinstance:added":   { zoneId: string; record: PrefabInstanceRecord };
  "prefabinstance:updated": { zoneId: string; id: string; changes: Partial<PrefabInstanceRecord> };
  "prefabinstance:removed": { zoneId: string; id: string };
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
  data: WallDef | FloorDef | PlatformDef | StairDef | LadderDef | WorldObject | Opening | TriggerVolume | CheckpointDef | DecalDef | ShapeDef | LightDef | null;
  runWalls?: WallDef[]; // populated for multi-wall runs; undefined for single-wall selections
  // Sub-object selection (Phase 23, shapes only): which face/vertex/edge is selected
  // in the face/vertex/edge select modes. Clamped against the live mesh on every emit.
  faceIndex?:   number;
  vertexIndex?: number;
  edgeVerts?:   [number, number];   // unordered vertex-index pair (edges have no stored identity)
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
  editorCamera?: EditorCameraPose;  // last editor viewpoint — stamped on save, restored on load
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

// ─── Placed lights (Phase 35) ─────────────────────────────────────────────────

export type LightKind = "point" | "spot" | "directional";

export type LightFlickerStyle = "flame" | "electric";

/**
 * Authored flicker (Phase 35.2) — runs only while preview/game is active (mover
 * precedent), driven per-frame by ZoneManager.updateLights via the light's
 * INTENSITY only (no shader recompiles; frozen static shadows stay frozen).
 * flame: smooth layered-sine wobble, never fully off. electric: hard on/off at
 * random irregular intervals.
 */
export interface LightFlickerDef {
  style:  LightFlickerStyle;
  amount: number;   // 0..1 — flame: wobble depth; electric: how dark "off" is (1 = fully off)
  speed:  number;   // rate multiplier (default 1)
}

/**
 * A placeable scene light (per zone). Built by ZoneManager as a real THREE light
 * (so preview/game/runtime all get it) plus an editor-only marker for picking.
 * Spot/directional aim via pitch/yaw (degrees): yaw 0° = -Z (matches facingDeg),
 * pitch 90° = straight down.
 */
export interface LightDef {
  id:         string;
  label?:     string;
  kind:       LightKind;
  position:   Vec3;
  color:      string;   // hex, e.g. "#ffddaa"
  intensity:  number;   // candela-ish (physical units); directional in lux-like units
  range?:     number;   // point/spot falloff distance; 0 = unlimited
  angleDeg?:  number;   // spot cone half-angle (degrees)
  pitchDeg?:  number;   // spot/directional aim (90 = straight down)
  yawDeg?:    number;   // spot/directional aim (0 = -Z)
  castShadow: boolean;
  // Render the shadow map ONCE and freeze it (shadow.autoUpdate = false) — big per-frame
  // saving for lights over static geometry; moving objects won't update this shadow.
  // ZoneManager re-renders it when zone geometry rebuilds.
  staticShadow?: boolean;
  flicker?:      LightFlickerDef;
}

// Locomotion states the third-person animation state machine drives (intent strings).
export type LocomotionState = "idle" | "walk" | "jump" | "jump_idle" | "jump_land" | "climb";

export interface PlayerSettings {
  cameraMode:          CameraMode;
  moveSpeed:           number;
  jumpHeight:          number;
  fov:                 number;
  thirdPersonDistance: number;
  thirdPersonHeight:   number;
  // Starting camera tilt in degrees DOWN toward the character (default 0 = level).
  // Seeds the orbit pitch on spawn — the camera rises and aims down at the pivot;
  // players can still look around freely afterwards.
  thirdPersonPitch?:   number;
  jumpAnimSpeed?:      number;            // playback multiplier for the jump animation (default 1)
  climbSpeed?:         number;            // ladder climb speed m/s (default 2)
  // Character scale is PER CAMERA MODE (mode is a per-world author choice, so
  // collision never changes mid-game): characterScale applies in third-person
  // (avatar + capsule), fpsCharacterScale in FPS (capsule/eye; default 1).
  fpsCharacterScale?:  number;
  // FPS camera height above the FEET (m). Absent = derived from the capsule
  // (≈1.7 at characterScale 1), so it tracks Character Scale automatically.
  fpsEyeHeight?:       number;
  characterScale?:     number;            // uniform scale of the 3rd-person avatar + collision (default 1)
  // Per-character clip overrides. Key absent/undefined = Auto (name match); null = None
  // (play nothing); string = use that exact clip name.
  animClips?:          Partial<Record<LocomotionState, string | null>>;
  modelAssetId?:       string | null;
  bagStyle?:           string;             // BagOverlay style-registry key (default "list")
  // Character locomotion audio (Phase 36 follow-up) — SoundDef ids, played as SFX-bus
  // one-shots by CharacterController at the matching moment. Absent = silent.
  jumpSound?:          string;             // on jump takeoff
  landSound?:          string;             // on landing
  footstepSound?:      string;             // every footstepDistance metres while grounded + moving
  footstepDistance?:   number;             // stride length in metres (default 1.8)
  // Per-sound gain (default 1; >1 boosts, runtime-capped at 4).
  jumpVolume?:         number;
  landVolume?:         number;
  footstepVolume?:     number;
}

export interface WorldConfig {
  size:            { width: number; depth: number };
  ambientLight:    { color: string; intensity: number };
  sunLight:        { color: string; intensity: number; position: Vec3 };
  // Image-based-lighting (scene.environment) multiplier; absent = 1. At 0, standard
  // materials get no environment light — combined with ambient/sun 0 the scene goes
  // truly dark (fill/rim scale with sun automatically).
  envIntensity?:   number;
  // Lighting rig quality, saved with the scene and honored by published games:
  // "fancy" (default) = sun + fill + rim; "fast" = sun only (big-level framerate).
  lightingQuality?: "fancy" | "fast";
  /** Phase 68 Part 2 — true = this scene follows the game's lighting defaults
   *  (resolved in at load); editing any lighting value flips it off. */
  lightingFromGame?: boolean;
  skybox:          string;
  fogColor:        string;
  fogDensity:      number;
  playerSettings:  PlayerSettings;
  defaultSpawn?:   SpawnDef;
  scripts?:        ScriptDef[];
  stateSchema?:    Record<string, StateSchema>;   // authored gameplay-state keys (defaults + numeric clamp)
  items?:          ItemDef[];                     // item registry — inventory counts live at gameState `inv.<id>`
  audio?:          WorldAudio;                    // scene-level ambient/music + authored mix (Phase 36)
  uiElements?:     UiElementDef[];                // custom GUI registry — visibility lives at gameState `__ui.<id>` (Phase 49)
}

// ─── Audio (Phase 36) ─────────────────────────────────────────────────────────
// Four gain buses. Authored defaults live per-scene in WorldConfig.audio.mix;
// player-preference sliders (PauseMenu → localStorage) multiply over these.
export interface AudioMix {
  master:  number;   // 0..1
  music:   number;
  sfx:     number;
  ambient: number;
}

// Phase 64 — composed clip sequences. One entry is EITHER a clip (soundId +
// optional per-entry volume) or a silence gap (seconds). The sequence plays one
// entry at a time with hard cuts, in authored order, looping as configured.
export interface PlaylistEntry {
  soundId?: string;   // clip entry
  volume?:  number;   // 0..1 per-entry gain (default: SoundDef.volume ?? 1)
  silence?: number;   // silence entry: gap seconds (soundId absent)
}
export interface AudioPlaylist {
  entries: PlaylistEntry[];
  loop?:   boolean;   // default true — loop the whole composed sequence
}

/** Scene-level audio: a default ambient loop, a default music track, and the authored mix.
 *  Each slot can hold BOTH a single track (soundId) and a composed playlist (Phase 64) —
 *  the editor's SINGLE ⇄ PLAYLIST switch retains the inactive one. `mode` says which
 *  plays; absent = legacy semantics (the playlist, when it has entries). */
export interface WorldAudio {
  music?:   { soundId?: string; volume?: number; loop?: boolean; playlist?: AudioPlaylist; mode?: "single" | "playlist" };
  ambient?: { soundId?: string; volume?: number; playlist?: AudioPlaylist; mode?: "single" | "playlist" };
  mix?:     AudioMix;
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
  bottomMaterial?:          string;             // bottom cap; falls back to `material` (Phase 38 ceilings)
  bottomMaterialOverrides?: MaterialOverrides;
  // Editor-only see-through: renders as a translucent click-through ghost in the editor
  // (so rooms under a ceiling stay editable) but is fully solid in preview/game.
  editorGhost?:           boolean;
  groupIds?:              string[];
  mover?:                 MoverDef;      // legacy single mover (Phase 31) — read, never written
  movers?:                MoverDef[];    // Phase 67 — composed per frame (slides sum, spins multiply)
  sound?:                 AttachedSound;   // attached spatial emitter — follows the mesh (incl. movers) (Phase 36)
  startHidden?:           boolean;         // despawned at preview/game start — reveal with spawn_object
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
  balusters:     boolean;   // vertical posts (legacy master toggle — default for the per-side flags)
  balustersInner?:   boolean;  // posts on the inner/void side (default: balusters)
  balustersOuter?:   boolean;  // posts on the outer side (default: balusters)
  landingPerimeter?: boolean;  // rail the landing's outer perimeter edges (default: false — outer rails stop at the landing)
  // Per-edge rails on the TOP landing (flights > 1). The first three default
  // to landingPerimeter; `close` is the extra 4th rail across the stairwell
  // mouth (from the exit corner to the arriving flight's inner rail line).
  topLanding?: {
    sideArrive?: boolean;   // side edge along the arriving flight
    far?:        boolean;   // far edge
    sideExit?:   boolean;   // side edge opposite the arriving flight
    close?:      boolean;   // across the stairwell mouth (default: false)
  };
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

// ─── Stair landings + switchback stairwells (Phase 29) ──────────────────────
export type StairTurn = "left" | "right";
export interface StairLandingDef {
  depth:  number;   // meters along the flight's exit direction
  width?: number;   // lateral span override — honored only when flights === 1 (default: stair.width)
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
  landing?:    StairLandingDef;   // auto landing at the top of every flight; absent → none
  flights?:    number;            // switchback flight count (>= 1); absent → 1
  turn?:       StairTurn;         // switchback chirality; absent → "left"; meaningful only when flights > 1
  gap?:        number;            // clear void width between opposed flights (m); absent → 0.2
  materialOverrides?:      MaterialOverrides;
  riserMaterial?:          string;
  riserMaterialOverrides?: MaterialOverrides;
  riserUvJitter?:          number;              // 0–1: per-step random UV offset on riser faces; absent → 0 (uniform)
  treadUvJitter?:          number;              // 0–1: per-step random UV offset on tread (step-top) faces; absent → 0 (uniform)
  landingMaterial?:          string;            // landing slabs; absent → body material
  landingMaterialOverrides?: MaterialOverrides;
  railingMaterial?:          string;            // rails/posts; absent → built-in metal grey
  railingMaterialOverrides?: MaterialOverrides;
  csgCutter?:              StairCutterDef;
  groupIds?:               string[];
  prefab?:                 PrefabStamp;   // member of a placed prefab instance (Phase 44)
}

// ─── Ladders (Phase 34) ──────────────────────────────────────────────────────

// A vertical climbable: 2 rails + rungs, a thin solid collider, and an
// auto-built climb sensor (width × height+lip × depth on the climb side, plus a
// top-lip extension onto the platform for remount-from-top). The climb face
// normal is local +Z rotated by rotationY — the player climbs on that side.
export interface LadderDef {
  id:        string;      // ladder_<uuid8>
  label?:    string;
  position:  Vec3;        // FOOT center, floor level
  rotationY: number;      // degrees
  height:    number;      // meters, foot → top rung
  width:     number;      // default 0.7
  rungSpacing: number;    // default 0.35
  material:  string;
  materialOverrides?: MaterialOverrides;
  topDismountOffset?: number; // meters inward (−Z local) from the top onto the platform (default 0.6)
  promptRange?:   number;     // how far onto the platform the top "Climb down" prompt reaches (default 1.8)
  autoGrabRange?: number;     // how close to the lip walking-toward auto-mounts (default 0.7, clamped ≤ promptRange)
  // Invisible-climbable support (rock walls, vines): the ladder supplies the climb
  // volume while some other geometry supplies the look.
  invisible?:  boolean;       // editor-only rendering — mesh hidden in preview AND game
  noCollider?: boolean;       // skip the solid slab (the dressed geometry has its own collision)
  floorLevel?: number;
  groupIds?: string[];
  prefab?:   PrefabStamp;     // member of a placed prefab instance (Phase 44)
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
  mover?:  MoverDef;    // legacy single mover — read, never written
  movers?: MoverDef[];  // Phase 67
  sound?:  AttachedSound;       // attached spatial emitter — follows the mesh (incl. movers) (Phase 36)
  startHidden?: boolean;        // despawned at preview/game start — reveal with spawn_object
  prefab?: PrefabStamp;         // member of a placed prefab instance (Phase 44)
}

// ─── Movers — scripted geometry motion (Phase 31) ────────────────────────────

export type MoverKind = "slide" | "spin";

// Optional per-entity motion. The authored position/rotation is the rest pose;
// at runtime the MoverSystem drives the mesh + a kinematic Rapier body and never
// writes back to WorldState. Runs only in preview/game.
export interface MoverDef {
  id?:      string;              // mvr_<uuid8> — Phase 67: lets scripts target ONE of an entity's movers; editor-assigned
  enabled: boolean;
  kind:    MoverKind;
  axis:    "x" | "y" | "z";   // entity-local axis (rotated by entity rotation)
  // slide
  distance?: number;          // meters of travel from rest, default 2
  duration?: number;          // seconds per leg, default 2
  dwell?:    number;          // seconds paused at each end, default 0
  mode?:     "loop" | "once"; // loop = ping-pong forever; once = stop at far end (toggle reverses)
  phase?:    number;          // 0..1 initial cycle offset (loop only), default 0
  // spin
  speed?:    number;          // deg/sec, sign = direction, default 45
  autoStart?: boolean;        // default true; false = idle until start_mover/toggle_mover
}

export interface ObjectProperties {
  interactable:   boolean;
  interactLabel?: string;
  npcSpawn:       boolean;
  lootTableId:    string | null;
  triggerEventId: string | null;
}

export type AttachedColliderShape = "box" | "sphere" | "capsule" | "cylinder" | "hull" | "trimesh";

/** A collider attached to a placed object in the object's local space. */
export interface AttachedCollider {
  id:         string;                 // col_<uuid8> — stable handle for list edits + drag handles
  shape:      AttachedColliderShape;
  offset:     Vec3;                   // local, pre-scale, relative to object origin
  size:       Vec3;                   // box: full extents; sphere: x = radius; capsule/cylinder: x = radius, y = full height; hull: points AABB (display only)
  rotation?:  Vec3;                   // deg, local euler XYZ (box/capsule/cylinder; ignored for sphere/hull/trimesh)
  rotationY?: number;                 // legacy yaw-only rotation — read when `rotation` is absent; writers emit `rotation`
  isSensor:   boolean;                // sensor fires on_player_enter/on_player_exit; solid blocks movement
  // Hull/trimesh only (Phase 27/27b): vertices, object-local, pre-scale, relative
  // to the object origin + offset. Encodes shape AND orientation — exact under
  // full rotation and non-uniform scale (scale composes before object rotation).
  points?:    Vec3[];
  // Trimesh only (Phase 27b): triangle indices into points. Hollow-surface caveats
  // match live face-brush trimeshes (nothing inside gets pushed out).
  indices?:   number[];
}

// ─── Enemy AI (Phase 61) ──────────────────────────────────────────────────────

/**
 * Per-object enemy AI config (the panel's AI screen). The EnemyAI runtime
 * system reads this; every field except `enabled` is optional with the
 * defaults shown. Movement is kinematic: ground-snap ray + a forward wall
 * probe that STOPS at obstacles (no pathfinding / gap-jumping). Detection is
 * horizontal distance with a max vertical gap of 3m.
 */
export interface EnemyAIDef {
  enabled:         boolean;
  detectRadius?:   number;        // acquire the player within this (default 6)
  giveUpRadius?:   number;        // lose the player beyond this (default 1.5 × detectRadius)
  attackRange?:    number;        // start a bite within this (default 1.2)
  moveSpeed?:      number;        // m/s while chasing (default 2.5)
  attackDamage?:   number;        // subtracted from damageKey on a landed bite (default 1)
  damageKey?:      string;        // GLOBAL state key the bite adjusts (default "health"; the obby uses "Hearts")
  attackCooldown?: number;        // seconds between bites (default 1.5)
  damageMoment?:   number;        // seconds into the attack clip when the hit lands (default 0.4)
  variation?:      number;        // 0..1 movement variation: orbit drift + timing jitter + feints (default 0.5; 0 = beeline)
  leashRadius?:    number;        // max distance from the authored post before disengaging (default 12)
  freeRoam?:       boolean;       // true = no leash and no walk-home: chases anywhere, idles wherever it loses the player (default false)
  // Clip mapping — undefined = auto by name match (idle/walk/attack, case-
  // insensitive substring, same spirit as the player's animClips); null = none.
  idleClip?:       string | null;
  walkClip?:       string | null;
  attackClip?:     string | null;
  // Optional sounds (all spatial, following the enemy). Volumes override the
  // clip's manifest default (1 = clip level; >1 boosts, runtime-capped at 4).
  detectSound?:    string;        // once, on acquiring the player (alert/growl)
  detectVolume?:   number;
  walkSound?:      string;        // loops while actually moving (chase / walk home)
  walkVolume?:     number;
  attackSound?:    string;        // each bite start
  attackVolume?:   number;
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
  // Phase 60 — per-entity state keys (defaults + numeric clamp), authored in
  // the panel's STATE section. Values live namespaced in the global GameState
  // (`__ent.<id>.<key>` — see src/scripting/entityState.ts); this is only the
  // schema. Prefab templates carry it; every instance owns its own values.
  stateSchema?: Record<string, StateSchema>;
  // Phase 61 — basic enemy AI (detect → chase/circle → attack), driven by the
  // EnemyAI runtime system; authored in the panel's AI screen.
  ai?: EnemyAIDef;
  groupIds?:  string[];
  autoPlayAnimation?: string | null;   // clip name that loops automatically (Phase 10.7)
  material?:  string;                  // registry material id; overrides baked GLTF materials (change_material)
  // undefined → implicit auto-box from model bounds when asset.collidable; [] → explicitly none.
  colliders?: AttachedCollider[];
  mover?:     MoverDef;    // legacy single mover — read, never written
  movers?:    MoverDef[];  // Phase 67
  sound?:     AttachedSound;   // attached spatial emitter — a PositionalAudio that follows the mesh, incl. movers (Phase 36)
  startHidden?: boolean;       // despawned at preview/game start — reveal with spawn_object
  prefab?:    PrefabStamp;     // set when this object is a member of a placed prefab instance (Phase 44)
}

/**
 * Attached positional audio emitter (Phase 36). Plays in preview/game only. Lives on the
 * entity types that can move (`mover?`): WorldObject, PlatformDef, ShapeDef. The emitter
 * is parented to the entity's mesh, so it follows movers automatically.
 */
export interface AttachedSound {
  soundId:      string;
  volume?:      number;   // base gain (default 1; >1 boosts, runtime-capped at 4)
  loop?:        boolean;  // default true for an ambient emitter
  refDistance?: number;   // PositionalAudio reference distance (default 1)
  maxDistance?: number;   // PositionalAudio max distance (default 20)
}

// ─── Prefabs (Phase 44) ──────────────────────────────────────────────────────
// Reusable groupings of entities (+ scripts) placed as linked instances. Scenes
// always store the fully-EXPANDED entities plus light link metadata (the stamp
// on each member + a per-zone instance record) — the runtime renders expanded
// entities and ignores the metadata entirely.

export type PrefabVarValue = number | boolean | string;

export interface PrefabVariableDef {
  name:     string;                            // param key, e.g. "width"
  label?:   string;
  type:     'number' | 'boolean' | 'choice';
  default:  PrefabVarValue;
  min?:     number;                            // number
  max?:     number;
  step?:    number;
  options?: string[];                          // choice
}

/** One template member in prefab-local space (origin at the prefab pivot). */
export interface PrefabTemplateEntity {
  memberKey: string;         // stable role id — snapshot: source entity id at capture; generator: e.g. "tile_2_3"
  type:      EditorObjectType;
  def:       unknown;        // WorldObject | TriggerVolume | ShapeDef | StairDef | LadderDef
}

export interface PrefabDef {
  id:           string;                  // pfb_<uuid8>
  name:         string;
  kind:         'snapshot' | 'generator';
  version:      number;                  // ++ on every template/default edit — instance staleness check
  generatorId?: string;                  // kind === "generator": key into the GENERATORS registry
  variables:    PrefabVariableDef[];     // generator params (snapshot variables are a later increment)
  template?:    PrefabTemplateEntity[];  // kind === "snapshot" only
  dateAdded:    string;
}

/** Stamped on every expanded member entity. instanceId = PrefabInstanceRecord.id. */
export interface PrefabStamp {
  prefabId:   string;
  instanceId: string;
  memberKey:  string;
}

/** Per-zone instance record — the durable link (variables + origin + version).
 *  Keyed by `id` (pfi_<uuid8>) so the undo journal's generic by-id machinery applies. */
export interface PrefabInstanceRecord {
  id:        string;                            // pfi_<uuid8> — referenced by member stamps as instanceId
  prefabId:  string;
  version:   number;                            // PrefabDef.version at last expansion
  variables: Record<string, PrefabVarValue>;
  origin:    { position: Vec3; rotationY: number };  // degrees, matching entity rotation convention
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
  ladders?:        LadderDef[];
  objects:         WorldObject[];
  scripts?:        ScriptDef[];
  triggerVolumes?: TriggerVolume[];
  checkpoints?:    CheckpointDef[];
  decals?:         DecalDef[];
  shapes?:         ShapeDef[];
  dialogues?:      DialogueTreeDef[];
  lights?:         LightDef[];
  prefabInstances?: PrefabInstanceRecord[];   // Phase 44 — link records for placed prefab instances
}

/**
 * @vestigial Zone-to-zone transitions. The multi-zone-per-scene concept was removed and
 * superseded by scene-to-scene routing (`src/runtime/SceneRouter.ts`, Phase 25/33). No code
 * creates or consumes these at runtime — `world.transitions` is always empty and serializes
 * as `[]`. Retained only for save-format stability. Do not build new features on it; use
 * `load_scene` (cross-level) or trigger volumes + scripts (within-level) instead.
 */
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
  | 'on_state_equals'   // targetId = state key; fires when it TRANSITIONS to trigger.stateValue
  | 'on_level_load'
  | 'on_game_start'
  | 'on_dialogue_end'    // targetId = dialogue tree id
  // Phase 61 — fired by the EnemyAI system on the OWNING enemy (owner-stamped
  // like on_interact; "★ this object" works inside). A target-less zone/world
  // script with these fires for EVERY enemy (wildcard bucket).
  | 'on_player_detected' // enemy acquired the player (idle/return → chase)
  | 'on_player_lost'     // gave up (hysteresis radius / leash break)
  | 'on_enemy_attack';   // a bite LANDED — fires at the damage moment, after the damage write

export type ConditionType =
  | 'has_state'
  | 'state_equals'     // state's value === the authored value (booleans/strings/numbers; objects deep-equal)
  | 'compare_number'
  | 'has_item'
  | 'player_falling'   // airborne AND descending — the goomba-stomp gate (Phase 61.1)
  | 'npc_alive'
  | 'npc_dead';

export type ActionType =
  | 'play_sound'
  | 'stop_sound'
  | 'play_music'
  | 'stop_music'
  | 'set_footstep'
  | 'show_dialogue'
  | 'move_object'
  | 'play_animation'
  | 'spawn_npc'
  | 'despawn_object'
  | 'spawn_object'
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
  | 'launch_player'
  | 'respawn_player'
  | 'show_ui'
  | 'hide_ui'
  | 'run_script'
  | 'load_scene'
  | 'start_mover'
  | 'stop_mover'
  | 'toggle_mover'
  | 'flash_player'
  | 'light_on'
  | 'light_off'
  | 'toggle_light'
  | 'give_item'
  | 'take_item'
  | 'transfer_item';

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
  stateValue?: JsonValue;  // on_state_equals: fire when targetId (a state key) transitions to this value
  // Phase 60 — entity scope for the state triggers (on_state_changed /
  // on_state_equals): watch this ENTITY's key instead of the global one.
  // "self" = the owning entity (resolved at index time); absent = global.
  entityId?:  string;
}

export interface ScriptCondition {
  type:       ConditionType;
  not?:       boolean;     // "unless" — the condition must FAIL for the guard to pass
  npcId?:     string;
  stateKey?:  string;      // has_state / compare_number
  compareOp?: CompareOp;   // compare_number / has_item (has_item default ">=")
  stateValue?: JsonValue;  // compare_number (compared as number)
  itemId?:    string;      // has_item: ItemDef id (inventory key `inv.<id>`)
  count?:     number;      // has_item: owned <compareOp> count (defaults: ">=" 1)
  // Phase 60 — entity scope: evaluate stateKey / itemId against this ENTITY's
  // state instead of the global store. "self" = owning entity (index-time
  // rewrite for entity scripts; eval-time via ownerId for dialogue/menu
  // surfaces); absent = global. Single entities only — no groups.
  entityId?:  string;
}

// ─── Items / inventory (Phase 32) ────────────────────────────────────────────
// Items are an identity layer over the generic gameState store: the count for
// an item lives at key `inv.<id>`. give/take/has are thin wrappers over it, so
// saves, on_state_changed, and STATE-tab defaults all apply unchanged.

export interface ItemDef {
  id:           string;   // itm_<uuid8> — inventory key is `inv.<id>`
  label:        string;
  icon?:        string;   // bare URL/path used as <img src> (portrait precedent)
  description?: string;
  stackSize?:   number;   // max count clamped on give; absent = unlimited
  startCount?:  number;   // seeded into the player's inventory on New Game (default 0)
}

/**
 * Cross-scene shared game config (Phase 33) — `game.json` in a project folder,
 * linked from the runtime manifest (`RuntimeManifest.game`). Merged UNDER each
 * scene's own config at load time (scene wins on duplicate item id / schema key).
 */
export interface GameConfig {
  gameVersion:  1;
  /** Phase 68 — game-wide player-settings defaults; scenes override per page
   *  (their sparse WorldConfig.playerSettings layer wins per field). */
  playerSettings?: PlayerSettings;
  /** Phase 68 Part 2 — game-wide lighting/environment defaults; a scene with
   *  lightingFromGame follows these, editing any value overrides in place. */
  lighting?: {
    ambientLight: { color: string; intensity: number };
    sunLight:     { color: string; intensity: number; position: Vec3 };
    envIntensity?: number;
    skybox:       string;
    fogColor:     string;
    fogDensity:   number;
  };
  /** Phase 68 Part 2 — game-wide audio-mixer default (scene mix wins when present). */
  audio?: { mix?: AudioMix };
  items?:       ItemDef[];
  stateSchema?: Record<string, StateSchema>;
  lightingQuality?: "fancy" | "fast";   // game-wide default; a scene's own setting wins
  prefabs?:     PrefabDef[];   // cross-scene prefab library (Phase 44)
  uiElements?:  UiElementDef[]; // cross-scene custom GUI registry (Phase 49)
}

/** @deprecated legacy linear dialogue — migrated to DialogueTreeDef on load. */
export interface DialogueDef {
  speaker:   string;
  lines:     string[];
  portrait?: string;
}

// ─── Branching dialogue trees ────────────────────────────────────────────────

export interface DialogueOption {
  id:          string;             // stable key for the editor
  text:        string;
  conditions?: ScriptCondition[];  // ALL must pass or the option is hidden
  actions?:    ScriptAction[];     // run on select, through ScriptEngine dispatch
  next?:       string;             // DialogueNode id; undefined/'' or missing node = end
}

export interface DialogueNode {
  id:        string;
  lines:     string[];             // shown sequentially (confirm to advance) before options
  speaker?:  string;               // per-node override of tree speaker
  portrait?: string;               // per-node override
  options:   DialogueOption[];     // empty (or all condition-filtered) = ends after last line
  editorPos?: { x: number; y: number }; // flowchart-view box position (editor-only; runtime ignores)
}

export interface DialogueTreeDef {
  id:        string;               // dlg_<uuid8>
  label:     string;               // editor display name
  speaker:   string;
  portrait?: string;
  startNode: string;               // node id
  nodes:     DialogueNode[];
}

export interface ScriptAction {
  type:          ActionType;
  delay?:        number;     // seconds after the script's actions start before THIS action runs (0/absent = immediate)
  conditions?:   ScriptCondition[];   // LEGACY per-action guard (pre-Phase 65), evaluated AFTER the delay — still honoured; the editor migrates it into a block
  block?:        { id: string; branch: number };   // Phase 65 — this action belongs to ScriptDef.blocks[id], branch index (-1 = else)
  targetId?:     string;
  animation?:    string;
  animationLoop?: boolean;   // play_animation: loop the clip forever
  animationHold?: boolean;   // play_animation: freeze on the final frame (e.g. death)
  animationBlend?: number;   // play_animation: crossfade seconds into the clip (overrides default)
  sound?:        string;       // play_sound / stop_sound: SoundDef id
  music?:        string;       // play_music: SoundDef id
  volume?:       number;       // play_sound / play_music: 0..1 gain override
  loop?:         boolean;      // play_sound / play_music: loop override
  fadeSeconds?:  number;       // play_music / stop_music: crossfade / fade-out seconds
  dialogue?:     DialogueDef;  // @deprecated — legacy data only; read by migrateDialogues, never at runtime
  dialogueId?:   string;       // show_dialogue: DialogueTreeDef id (zone registry)
  material?:     string;
  moverId?:      string;       // start/stop/toggle_mover — Phase 67: one mover (by MoverDef.id); absent = all
  position?:     Vec3;
  positionKey?:  string;      // teleport_player: read destination Vec3 from this state key (overrides position)
  posSource?:    'player' | 'object' | 'coords';  // store_position: where the stored position comes from
  facing?:       number;      // degrees — store_position coords facing / teleport_player literal facing
  facingSource?: 'keep' | 'literal' | 'key';      // teleport_player: how to set look direction
  facingKey?:    string;      // teleport_player: read facing (number, or a pose's .facing) from this key
  launchSpeed?:  number;      // launch_player: upward velocity m/s (default 12; a jump is ~5)
  launchHSpeed?: number;      // launch_player: horizontal velocity m/s (0/absent = straight up)
  launchDirDeg?: number;      // launch_player: horizontal direction, degrees on the spawn-facing compass (0 = -Z)
  flashColor?:    string;     // flash_player: tint/overlay color (default "#ff0000")
  flashDuration?: number;     // flash_player: seconds the pulse lasts (default 1)
  launchRelative?: boolean;   // @deprecated launch_player — superseded by launchRelativeTo; still READ as a fallback (true = 'entity') so pre-v4.63.3 scenes keep working
  launchRelativeTo?: 'world' | 'entity' | 'player'; // launch_player: what launchDirDeg is measured from — world compass, the owning entity's Y rotation (0 = its front), or the player's facing (180 = always knocked backwards)
  // set_state / adjust_number / delete_state / store_position (destination key).
  // Phase 60: on the three state actions (and give_item/take_item), `targetId`
  // doubles as the ENTITY SCOPE — absent = global key; "self" = owning entity
  // (index-time rewrite); an entity or GROUP id fans the write out per member.
  stateKey?:     string;
  stateValue?:   JsonValue;   // set_state
  numberDelta?:  number;      // adjust_number
  eventId?:      string;
  fadeColor?:    string;
  fadeDuration?: number;
  uiElementId?:  string;
  script?:       string;
  sceneId?:      string;      // load_scene: runtime-manifest scene key (not validated in the editor)
  itemId?:       string;      // give_item / take_item / transfer_item: ItemDef id (inventory key `inv.<id>`)
  count?:        number;      // give_item / take_item / transfer_item: amount (default 1)
  // transfer_item (Phase 60): atomic, conserving move — min(count, source
  // balance, destination stack space). Endpoints are single scopes: absent =
  // the player's (global) inventory; "self" = owning entity; else an entity id.
  fromId?:       string;
  toId?:         string;
  restoreHealth?: boolean;    // respawn_player: re-seed 'health' to its schema default after the teleport
}

// Phase 65 — if-blocks. Actions stay a FLAT array (every consumer keeps working);
// a block is a per-script row, and an action opts in via its `block` tag. A
// block is evaluated ONCE when the script's actions start: the first branch
// whose conditions pass wins ([0] = if, [1..] = else if), otherwise the else
// branch (actions tagged branch -1) if `else` is set, otherwise nothing.
// "unless" is the per-condition `not` flag inside any branch. One level only.
export interface ScriptBranch  { conditions: ScriptCondition[] }
export interface ScriptIfBlock {
  id:       string;          // blk_<uuid8>, unique within the script
  branches: ScriptBranch[];
  else?:    boolean;
}

export interface ScriptDef {
  id:         string;
  label:      string;
  zoneId:     string;
  enabled:    boolean;
  trigger:    ScriptTrigger;
  conditions: ScriptCondition[];
  actions:    ScriptAction[];
  blocks?:    ScriptIfBlock[];   // Phase 65
  oneShot:    boolean;
}

// ─── Custom game GUI (Phase 49) ──────────────────────────────────────────────
// Author-defined HUD widgets + simple menus, rendered by GameGuiOverlay in both
// shells. A registry like items: scene-level defs in WorldConfig.uiElements,
// game-level in GameConfig.uiElements, merged by mergeUiElementDefs (scene wins
// on duplicate id). Visibility lives in gameState at `__ui.<id>` — set by the
// show_ui / hide_ui script actions — so it survives scene transitions, persists
// into the runtime save, and resets on New Game. Widgets bound to a stateKey
// re-render live via `state:changed`.

export type UiAnchor = 'top-left' | 'top-center' | 'top-right'
                     | 'bottom-left' | 'bottom-center' | 'bottom-right';

interface UiElementBase {
  id:            string;      // ui_<uuid8> — visibility key is `__ui.<id>`
  label:         string;      // editor display name
  anchor:        UiAnchor;
  offsetX?:      number;      // px inward from the anchored corner/edge (default 16)
  offsetY?:      number;
  startVisible?: boolean;     // shown without show_ui (default false)
  backdrop?:     boolean;     // translucent pill behind the element for contrast on bright scenes (menu ignores — it has its own box)
}

export interface UiBarElement extends UiElementBase {
  kind: 'bar';
  stateKey: string;           // numeric gameState key (e.g. "health")
  max?: number;               // full-bar value (default 100)
  width?: number;             // px, default 160
  height?: number;            // px, default 14
  color?: string;             // fill color, default "#e05555"
  graphicId?: string;         // optional GraphicDef icon left of the bar
}

export interface UiCounterElement extends UiElementBase {
  kind: 'counter';
  stateKey: string;           // any key incl. `inv.<itemId>`
  graphicId?: string;
  prefix?: string;            // shown before the number (default "×")
  size?: number;              // icon px (default 24)
}

// Repeated-icon meter (GTA stars / Zelda hearts): `count` icons, each worth one
// unit of the state value (scaled by `max` when set), drawn full / half / empty.
export interface UiIconsElement extends UiElementBase {
  kind: 'icons';
  stateKey:        string;  // numeric gameState key (e.g. "health")
  count?:          number;  // number of icons (default 3)
  max?:            number;  // state value at all-full (default = count → 1 unit per icon)
  fullGraphicId:   string;
  halfGraphicId?:  string;  // omit → values round to whole icons
  emptyGraphicId?: string;  // omit → the full graphic at 0.25 opacity
  size?:           number;  // icon px (default 24)
}

export interface UiLabelElement extends UiElementBase {
  kind: 'label';
  text: string;
  fontSize?: number;          // px, default 13
  color?: string;             // default "#dde3f0"
}

export interface UiImageElement extends UiElementBase {
  kind: 'image';
  graphicId: string;
  width?: number;             // px; absent = the graphic's intrinsic width (capped)
  height?: number;
  opacity?: number;           // 0..1, default 1
}

export interface UiMenuOption {
  id:          string;             // stable key for the editor
  text:        string;
  conditions?: ScriptCondition[];  // ALL must pass or the option is hidden (dialogue precedent)
  actions?:    ScriptAction[];     // run on pick, through ScriptEngine dispatch
  closeOnPick?: boolean;           // default true — hide the menu after picking
}

export interface UiMenuElement extends UiElementBase {
  kind: 'menu';
  title?: string;
  options: UiMenuOption[];
}

export type UiElementDef = UiBarElement | UiCounterElement | UiIconsElement
                         | UiLabelElement | UiImageElement | UiMenuElement;

export type TriggerVolumeShape = "box" | "sphere" | "cylinder" | "capsule";

export interface TriggerVolume {
  id:       string;
  label:    string;
  position: Vec3;
  size:     Vec3;
  // Sensor + wireframe shape (absent = "box", the classic behavior). Size
  // encoding matches AttachedCollider: sphere: x = radius (y/z unused);
  // cylinder/capsule: x = radius, y = full height. position stays the XZ
  // center + Y BOTTOM for every shape.
  shape?:   TriggerVolumeShape;
  rotation?: Vec3;   // degrees, Y = yaw — applied to wireframe + sensor (axis-aligned when absent)
  // Mover-enabled platform/shape/object id (same zone) this volume rides (Phase 53).
  // position/size stay the WORLD-SPACE rest pose (tools/panel unchanged); the
  // host-local conversion happens at collider build. Missing or mover-less host
  // → plain static sensor at the authored pose (fallback).
  attachTo?: string;
  zoneId:    string;
  scripts?:  ScriptDef[];
  // Phase 60 — per-entity state schema (see WorldObject.stateSchema).
  stateSchema?: Record<string, StateSchema>;
  groupIds?: string[];
  visual?:   TriggerVolumeVisual;   // optional in-world fill; absent/disabled = wireframe only
  // Editor-only shading override for this volume's wireframe + interior fill
  // (never rendered in game). Absent = the default amber.
  editorTint?: { color: string; opacity: number };
  prefab?:   PrefabStamp;           // member of a placed prefab instance (Phase 44)
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
