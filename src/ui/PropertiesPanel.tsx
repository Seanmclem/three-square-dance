import { useEffect, useRef, useState } from "react";
import type {
  ToolId, SelectedObjectPayload, SelectedRef, WorldObject, Vec3,
  FloorDef, WallDef, Opening, MaterialDef, MaterialOverrides, QualityScale,
  PlatformDef, StairDef, StairRailingDef, StairUndersideMode, StairTurn, LadderDef, ZoneDef, ZoneType, PlayerSettings, LocomotionState, AssetDef, TriggerVolume, TriggerVolumeShape, TriggerVolumeVisual, CheckpointDef, StateSchema, EnemyAIDef, ScriptDef, MoverDef, LightDef,
  GroupDef, AttachedCollider, AttachedColliderShape, NodeLinks, WallNode, Vec2,
  DecalDef, DecalTexDef, ShapeDef, ShapeBrushMesh, BrushFace, WorldAudio, AudioPlaylist, PlaylistEntry, AttachedSound, AudioMix, SoundDef,
  PrefabDef, PrefabInstanceRecord, PrefabVariableDef, PrefabVarValue,
} from "@/types";
import { SoundPicker } from "@/ui/SoundPicker";
import { SoundPickerModal } from "@/ui/SoundPickerModal";
import { resolveShapeParams, isBrush, ShapeBuilder } from "@/builders/ShapeBuilder";
import { facesFromCloud, splitFaceQuad, extrudeFace, insetFace, splitEdge } from "@/editor/brushOps";
import type { EventBus } from "@/core/EventBus";
import { MaterialCategoryPills, orderedMaterialCategories, materialSwatchUrl } from "@/ui/materialCategories";
import { HelpTooltip } from "@/ui/HelpTooltip";
import { ControlsSection } from "@/ui/ControlsSection";
import { CreditsModal } from "@/ui/CreditsModal";
import { GENERATORS } from "@/prefab/generators";
import { gameState } from "@/scripting/GameState";
import { assetManager } from "@/core/AssetManager";
import { entKey } from "@/scripting/entityState";

// Preview swatch size in the material picker rows — tweak to taste.
const PICKER_SWATCH = 26;

// ── Shared styles ─────────────────────────────────────────────────────────────

const PANEL_STYLE: React.CSSProperties = {
  position: "absolute", right: 0, top: 0, bottom: 0, width: 280,
  background: "rgba(28,28,28,0.97)", borderLeft: "1px solid rgba(255,255,255,0.08)",
  display: "flex", flexDirection: "column", zIndex: 10,
};

const NUM_INPUT: React.CSSProperties = {
  width: "100%", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4,
  background: "rgba(46,46,46,0.9)", color: "#c0c0c0", fontSize: 11,
  fontFamily: "monospace", padding: "4px 8px", outline: "none",
};

const LABEL: React.CSSProperties = {
  color: "#c2cadb", fontSize: 11, letterSpacing: 1, marginBottom: 4,
};

const ROW_BASE: React.CSSProperties = {
  width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "10px 16px", background: "none", border: "none",
  borderBottom: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", textAlign: "left",
};

// ── Tool info ─────────────────────────────────────────────────────────────────

interface ToolInfo { desc: string; hint: string }

const TOOL_INFO: Record<ToolId, ToolInfo> = {
  select:      { desc: "Click any object to select it. Use gizmos to transform.",  hint: "Nothing selected" },
  "select-face":   { desc: "Face mode: click a brush face to select it (other objects select normally). 1-4 switch modes.", hint: "Click a brush face" },
  "select-vertex": { desc: "Vertex mode: click a brush corner sphere to select it. 1-4 switch modes.", hint: "Click a brush corner" },
  "select-edge":   { desc: "Edge mode: click a brush face near an edge to select that edge (other objects select normally). Split the selected edge from the panel. 1-4 switch modes.", hint: "Click near a brush edge" },
  floor:       { desc: "Click and drag to paint a rectangular floor region.",      hint: "Click to place floor origin" },
  "poly-floor": { desc: "Click to place vertices. Enter or click first dot to close.", hint: "Click to add first vertex" },
  wall:        { desc: "Click to set wall start, click again to set end.",         hint: "Click to place wall start" },
  platform:         { desc: "Click and drag to define a freestanding platform.",        hint: "Click to place platform" },
  "poly-platform":  { desc: "Click to place vertices. Enter or click first dot to close.", hint: "Click to add first vertex" },
  stair:       { desc: "Click bottom point, then top point of staircase.",         hint: "Click bottom of stair" },
  ladder:      { desc: "Click to place a ladder foot. Height and facing are edited in the panel.", hint: "Click to place ladder" },
  object:      { desc: "Choose an asset below, click to place.",                   hint: "Select an asset first" },
  groups:      { desc: "Toggle the Groups panel to organize objects into groups.",  hint: "Groups are managed in the left panel" },
  spawnpoint:       { desc: "Click to place the player spawn point.",                   hint: "Click to set spawn location" },
  "trigger-volume": { desc: "Click and drag to place a trigger volume.",               hint: "Click to set volume start" },
  decal:            { desc: "Pick a decal, hover a surface, scroll = size, shift+scroll = rotate, click to stamp.", hint: "Select a decal texture in the Decals panel first" },
  "shape-cylinder": { desc: "Click to set the center, move to set the radius, click to place.", hint: "Click to place cylinder center" },
  "shape-wedge":    { desc: "Click and drag a footprint. High edge faces away; rotate after placing.", hint: "Click to place wedge corner" },
  "shape-box":      { desc: "Click and drag a footprint. Taper/shear in the panel after placing.",     hint: "Click to place box corner" },
  "light-point":       { desc: "Click to place a point light (glows in all directions).",              hint: "Click to place light" },
  "light-spot":        { desc: "Click to place a spot light (cone, aims straight down; adjust aim in the panel).", hint: "Click to place light" },
  "light-directional": { desc: "Click to place a directional light (parallel rays, like an extra sun).", hint: "Click to place light" },
  prefab:      { desc: "Click to place the picked prefab. R rotates 90°, Esc stops.", hint: "Pick a prefab in the Prefabs panel" },
};


// ── Transform helpers ─────────────────────────────────────────────────────────

const AXES = [
  { axis: "x", color: "#ff6b6b" },
  { axis: "y", color: "#6bff8a" },
  { axis: "z", color: "#6b8aff" },
] as const;

type GroupKey = "position" | "rotation" | "scale";
const GROUPS: Array<{ key: GroupKey; label: string; step: number }> = [
  { key: "position", label: "Position", step: 0.5 },
  { key: "rotation", label: "Rotation (deg)", step: 15 },
  { key: "scale",    label: "Scale",    step: 0.1 },
];
type AxisStr = { x: string; y: string; z: string };
type Draft = Record<GroupKey, AxisStr>;
const toStr = (v: Vec3): AxisStr => ({ x: String(v.x), y: String(v.y), z: String(v.z) });
const toNum = (s: string): number => { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };

// ── Material maps ─────────────────────────────────────────────────────────────

type MapKey = keyof MaterialDef["maps"];

const MAP_ROWS: Array<{ key: MapKey; label: string }> = [
  { key: "albedo",       label: "Albedo" },
  { key: "normal",       label: "Normal" },
  { key: "roughness",    label: "Roughness" },
  { key: "metalness",    label: "Metalness" },
  { key: "ao",           label: "AO" },
  { key: "displacement", label: "Displacement" },
];

// ── Stair helpers ─────────────────────────────────────────────────────────────

const STAIR_STEP_H = 0.2;

function effectiveSteps(stair: StairDef): number {
  return stair.numSteps ?? Math.max(1, Math.round((stair.end.y - stair.start.y) / STAIR_STEP_H));
}

// Height / horizontal length / bearing (deg) derived from the start→end vector.
// These drive the alternate dimension inputs; `end` remains the stored source of truth.
function stairDims(start: Vec3, end: Vec3): { height: number; length: number; rotation: number } {
  const dx = end.x - start.x, dz = end.z - start.z;
  return {
    height:   +(end.y - start.y).toFixed(3),
    length:   +Math.hypot(dx, dz).toFixed(3),
    rotation: +(Math.atan2(dz, dx) * 180 / Math.PI).toFixed(2),
  };
}

// ── Shared debounce hook ──────────────────────────────────────────────────────

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

// ── LevelStepper ─────────────────────────────────────────────────────────────

const STEP_BTN: React.CSSProperties = {
  width: 22, height: 22, border: "1px solid rgba(255,255,255,0.10)", borderRadius: 3,
  background: "rgba(46,46,46,0.9)", color: "#909090", fontSize: 14, lineHeight: 1,
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  flexShrink: 0,
};

function LevelStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button style={STEP_BTN} onClick={() => onChange(value - 1)}>−</button>
      <span style={{ minWidth: 24, textAlign: "center", fontFamily: "monospace", fontSize: 12, color: "#c0c0c0" }}>{value}</span>
      <button style={STEP_BTN} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

// ── Screen config ─────────────────────────────────────────────────────────────

type ScreenId = "geo" | "mat" | "open" | "seg" | "vert" | "animations" | "colliders" | "lights" | "sound" | "audio"
  | "audio-mixer" | "audio-music" | "audio-ambient" | "audio-character" | "scripts" | "ai"
  | "spawn-movement" | "spawn-camera" | "spawn-character" | "spawn-sounds" | "spawn-controls";

const SCREEN_LABELS: Record<ScreenId, string> = {
  geo: "Geometry", mat: "Material", open: "Openings", seg: "Segments", vert: "Vertices",
  animations: "Animations", colliders: "Colliders", lights: "Lights", sound: "Sound", audio: "Audio",
  "audio-mixer": "Mixer", "audio-music": "Background Music", "audio-ambient": "Ambient", "audio-character": "Character Sounds",
  scripts: "Scripts",
  ai: "Enemy AI",
  "spawn-movement": "Movement", "spawn-camera": "Camera", "spawn-character": "Character",
  "spawn-sounds": "Character Sounds", "spawn-controls": "Controls",
};

const SCREEN_SUBTITLES: Record<ScreenId, string> = {
  geo:  "HEIGHT · THICKNESS",
  mat:  "MATERIAL · MAPS",
  open: "OPENINGS",
  seg:  "WALL SEGMENTS",
  vert: "ELEVATION",
  animations: "CLIPS · AUTO-PLAY",
  colliders: "SHAPE · OFFSET · SENSOR",
  lights: "WORLD SUN · AMBIENT · PLACED",
  sound: "SPATIAL EMITTER",
  audio: "MIXER · AMBIENT · MUSIC",
  "audio-mixer": "MASTER · MUSIC · SFX · AMBIENT",
  "audio-music": "TRACK OR PLAYLIST",
  "audio-ambient": "LOOP OR PLAYLIST",
  "audio-character": "FOOTSTEP · JUMP · LAND",
  scripts: "TRIGGERS · ACTIONS",
  ai: "DETECT · CHASE · ATTACK",
  "spawn-movement": "SPEED · JUMP · CLIMB",
  "spawn-camera": "MODE · FOV · DISTANCE · ANGLE",
  "spawn-character": "MODEL · SCALE · ANIMATIONS",
  "spawn-sounds": "FOOTSTEP · JUMP · LAND",
  "spawn-controls": "THIS DEVICE · SENSITIVITY",
};

const GEO_SUBTITLES: Partial<Record<string, string>> = {
  wall:     "HEIGHT · THICKNESS",
  floor:    "POSITION · SIZE · VERTICES",
  platform: "POSITION · SIZE",
  stair:    "POINTS · STEPS",
  ladder:   "TRANSFORM · RUNGS",
  object:   "TRANSFORM",
  opening:  "DIMENSIONS",
  shape:    "TRANSFORM · PARAMS",
};

const OBJECT_SCREENS: Record<string, ScreenId[]> = {
  wall:     ["geo", "mat", "open", "seg"],
  floor:    ["geo", "mat", "vert"],
  platform: ["geo", "mat", "sound"],
  stair:    ["geo", "mat"],
  ladder:   ["geo", "mat"],
  object:   ["geo", "mat", "colliders", "sound", "scripts", "ai"],
  opening:  ["geo"],
  shape:    ["geo", "mat", "sound"],
};

// ── Summary helpers ───────────────────────────────────────────────────────────

function getMaterialLabel(id: string, list: MaterialDef[]): string {
  return list.find(m => m.id === id)?.label ?? id;
}

function getActiveMapCount(overrides: MaterialOverrides | undefined, baseDef: MaterialDef | undefined): number {
  return MAP_ROWS.filter(({ key }) => {
    const ov = overrides?.maps?.[key]?.enabled;
    return ov !== undefined ? ov : (baseDef?.maps[key]?.enabled ?? false);
  }).length;
}

function summaryFor(s: ScreenId, selected: SelectedObjectPayload, materialList: MaterialDef[], assets: AssetDef[]): string {
  const { type } = selected;
  const wallData  = type === "wall"     ? selected.data as WallDef     : null;
  const floorData = type === "floor"    ? selected.data as FloorDef    : null;
  const platData  = type === "platform" ? selected.data as PlatformDef : null;
  const stairData = type === "stair"    ? selected.data as StairDef    : null;
  const ladderData = type === "ladder"  ? selected.data as LadderDef   : null;
  const shapeData = type === "shape"    ? selected.data as ShapeDef    : null;

  switch (s) {
    case "geo":
      if (wallData)  return `h ${wallData.height} · t ${wallData.thickness}`;
      if (floorData) return floorData.floorMesh.shape === "rect"
        ? "rect"
        : `${(floorData.floorMesh.nodeIds ?? floorData.floorMesh.points ?? []).length} verts`;
      if (platData)  return `${platData.size.width}×${platData.size.depth}`;
      if (stairData) return `${effectiveSteps(stairData)} steps`;
      if (ladderData) return `h ${ladderData.height} · ${Math.floor((ladderData.height - 0.05) / ladderData.rungSpacing)} rungs`;
      if (shapeData) {
        if (isBrush(shapeData)) return `brush · ${shapeData.mesh!.vertices.length} corners`;
        const p = resolveShapeParams(shapeData);
        if (shapeData.kind === "cylinder") return `r ${p.radiusBottom} · ${p.radialSegments} seg`;
        if (shapeData.kind === "wedge")    return `${p.width}×${p.depth} · h ${p.heightHigh}`;
        return `${p.width}×${p.depth}×${p.height}`;
      }
      return "geometry";
    case "mat": {
      let matId: string | undefined;
      let overrides: MaterialOverrides | undefined;
      if (wallData)  { matId = wallData.material;            overrides = wallData.materialOverrides; }
      if (floorData) { matId = floorData.floorMesh.material; overrides = floorData.materialOverrides; }
      if (platData)  { matId = platData.material;            overrides = platData.materialOverrides; }
      if (stairData) { matId = stairData.material;           overrides = stairData.materialOverrides; }
      if (ladderData) { matId = ladderData.material;         overrides = ladderData.materialOverrides; }
      if (shapeData) { matId = shapeData.material;           overrides = shapeData.materialOverrides; }
      if (!matId) return "";
      const baseDef = materialList.find(m => m.id === matId);
      const n = getActiveMapCount(overrides, baseDef);
      return `${getMaterialLabel(matId, materialList)} · ${n} map${n !== 1 ? "s" : ""}`;
    }
    case "open": {
      const allWalls = selected.runWalls ?? (wallData ? [wallData] : []);
      const count = allWalls.reduce((sum, w) => sum + (w.openings?.length ?? 0), 0);
      return count === 0 ? "none" : `${count} opening${count !== 1 ? "s" : ""}`;
    }
    case "seg": {
      const count = selected.runWalls?.length ?? 1;
      return `${count} wall${count !== 1 ? "s" : ""}`;
    }
    case "vert":
      return `elev ${floorData?.elevation ?? 0}`;
    case "animations": {
      const assetId = (selected.data as WorldObject | null)?.assetId;
      const n = assets.find(a => a.id === assetId)?.animations?.length ?? 0;
      return `${n} clip${n !== 1 ? "s" : ""}`;
    }
    case "colliders": {
      const obj = selected.data as WorldObject | null;
      if (obj?.colliders !== undefined) {
        const n = obj.colliders.length;
        return n === 0 ? "none" : `${n} collider${n !== 1 ? "s" : ""}`;
      }
      const def = assets.find(a => a.id === obj?.assetId);
      if (def?.colliders?.length) return `auto (${def.colliders.length} preset${def.colliders.length !== 1 ? "s" : ""})`;
      return def?.collidable ? "auto box" : "none";
    }
    case "sound": {
      const snd = (selected.data as { sound?: { soundId?: string } } | null)?.sound;
      return snd?.soundId ? snd.soundId : "none";
    }
    case "scripts": {
      const n = (selected.data as { scripts?: ScriptDef[] } | null)?.scripts?.length ?? 0;
      return n === 0 ? "none" : `${n} script${n !== 1 ? "s" : ""}`;
    }
    case "ai": {
      const ai = (selected.data as WorldObject | null)?.ai;
      return ai?.enabled ? `on · detect ${ai.detectRadius ?? 6}m` : "off";
    }
    case "lights":
    case "audio":
    case "audio-mixer":
    case "audio-music":
    case "audio-ambient":
    case "audio-character":
    case "spawn-movement":
    case "spawn-camera":
    case "spawn-character":
    case "spawn-sounds":
    case "spawn-controls":
      return "";   // non-object screens — never listed for a selected object (spawn rows build their own summaries)
  }
}

function objectTypeLabel(selected: SelectedObjectPayload): string {
  const { type } = selected;
  if (type === "wall") {
    const d = selected.data as WallDef | null;
    return `WALL · LEVEL ${d?.floor ?? 0}`;
  }
  if (type === "floor") {
    const d = selected.data as FloorDef | null;
    return `${(d?.floorMesh.shape ?? "rect").toUpperCase()} FLOOR · LEVEL ${d?.level ?? 0}`;
  }
  if (type === "platform") {
    const d = selected.data as PlatformDef | null;
    return `PLATFORM · LEVEL ${d?.floorLevel ?? 0}`;
  }
  if (type === "stair") {
    const d = selected.data as StairDef | null;
    return `STAIR · ${(d?.style ?? "").toUpperCase()}`;
  }
  if (type === "ladder") {
    const d = selected.data as LadderDef | null;
    return `LADDER · LEVEL ${d?.floorLevel ?? 0}`;
  }
  if (type === "opening") {
    const d = selected.data as Opening | null;
    return `${(d?.type ?? "").toUpperCase()} OPENING`;
  }
  if (type === "trigger-volume") return "TRIGGER VOLUME";
  if (type === "light") {
    const d = selected.data as LightDef | null;
    return `LIGHT · ${(d?.kind ?? "").toUpperCase()}`;
  }
  if (type === "shape") {
    const d = selected.data as ShapeDef | null;
    const kind = d && isBrush(d) ? "brush" : (d?.kind ?? "shape");
    return `${kind.toUpperCase()} · LEVEL ${d?.floorLevel ?? 0}`;
  }
  return type.toUpperCase();
}

function getSubtitle(screen: ScreenId, type: string): string {
  if (screen === "geo") return GEO_SUBTITLES[type] ?? "GEOMETRY";
  return SCREEN_SUBTITLES[screen];
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface PropertiesPanelProps {
  activeTool:               ToolId;
  selected:                 SelectedObjectPayload | null;
  materialList:             MaterialDef[];
  quality:                  QualityScale;
  onObjectUpdate:           (changes: Partial<WorldObject>) => void;
  onSegmentUpdate:          (wallId: string, changes: Partial<WallDef>) => void;
  onFloorNodesUpdate?:      (updates: Array<{ nodeId: string; x: number; z: number }>, label?: string) => void;
  getNodeLinks?:            (zoneId: string, nodeId: string) => NodeLinks;
  onImportMaterial:         () => void;
  onQualityChange:          (q: QualityScale) => void;
  onCopyRunToFloor?:        (targetLevel: number) => void;
  onFillRunWithFloor?:      () => void;
  onAddCeilingToRun?:       () => void;
  onToggleCeilingGhost?:    () => void;
  runCeilingGhosted?:       boolean;
  onUnlinkRunCorners?:      () => void;
  runLinkedFloors?:         number[];
  onDelete?:                () => void;
  onVolumeScriptsChange?:   (scripts: ScriptDef[]) => void;
  // Row click on a script list → open that script's editor in the Scripts panel.
  onEditScript?:            (scriptId: string) => void;
  zones?:                   ZoneDef[];
  groups?:                  GroupDef[];
  activeZoneId?:            string | null;
  playerSettings?:          PlayerSettings;
  assets?:                  AssetDef[];
  sounds?:                  SoundDef[];
  onPlayerSettingsChange?:  (s: Partial<PlayerSettings>) => void;
  onSpawnPositionChange?:   (pos: Vec3) => void;
  // World-level ambient/sun/environment lighting (Lights drilldown page).
  worldLighting?:           { ambient: { color: string; intensity: number }; sun: { color: string; intensity: number }; envIntensity?: number; quality?: "fancy" | "fast" };
  onWorldLightingChange?:   (changes: { ambient?: Partial<{ color: string; intensity: number }>; sun?: Partial<{ color: string; intensity: number }>; envIntensity?: number; quality?: "fancy" | "fast" }) => void;
  worldAudio?:              WorldAudio;
  onWorldAudioChange?:      (changes: Partial<WorldAudio>) => void;
  // Active zone's placed lights + row-click selection (LIGHTS list under the Light tool).
  zoneLights?:              LightDef[];
  onSelectLight?:           (id: string) => void;
  bus?:                     EventBus;
  onPreviewClip?:           (objectId: string, clipName: string) => void;
  onStopPreview?:           (objectId: string) => void;
  onAutoPlayChange?:        (objectId: string, clipName: string | null) => void;
  decalTextures?:           DecalTexDef[];
  multiSelected?:           SelectedRef[];
  onCopy?:                  () => void;
  onDuplicate?:             () => void;
  // Put the whole current selection into a brand-new group (also Cmd/Ctrl+G).
  onGroupSelected?:         () => void;
  // Select every member of a group the current entity belongs to.
  onSelectGroup?:           (groupId: string) => void;
  // Bake the given shape refs to a GLB asset (Phase 26) — opens the bake dialog.
  onBake?:                  (refs: SelectedRef[]) => void;
  // Auto-fit box from the placed model's local AABB (null until the mesh is built).
  defaultColliderFor?:      (objectId: string) => AttachedCollider | null;
  onSaveCollidersToAsset?:  (objectId: string, assetId: string, colliders: AttachedCollider[]) => void;
  // Auto-fit convex hull points from the model's geometry (Phase 27; null = unavailable).
  hullPointsFor?:           (objectId: string) => Vec3[] | null;
  // Prefab instance (Phase 45): set when the selection is a member of a placed
  // prefab instance — renders the Prefab section on the root screen. prefab is
  // null when the instance's definition is missing from the library (orphan) —
  // the section degrades to Unlink / Delete instance.
  prefabInfo?:              { prefab: PrefabDef | null; record: PrefabInstanceRecord; memberCount?: number } | null;
  onEditPrefab?:            (prefabId: string) => void;   // header prefab-name link (snapshot kind only)
  onSelectInstance?:        () => void;                   // header "all N" — select the whole instance
  // Capture the multi-selection as a snapshot prefab (Phase 46).
  onCreatePrefab?:          (refs: SelectedRef[]) => void;
  onPrefabVariablesChange?: (vars: Record<string, PrefabVarValue>) => void;
  onPrefabOriginChange?:    (origin: { position: Vec3; rotationY: number }) => void;
  onPrefabReexpand?:        () => void;
  onPrefabUnlink?:          () => void;
  onPrefabDeleteInstance?:  () => void;
  // Global editor overlay toggles (EDITOR section, nothing-selected view).
  showPerfCounter?:         boolean;
  onTogglePerfCounter?:     () => void;
  showCrosshair?:           boolean;
  onToggleCrosshair?:       () => void;
  showGridFloor?:           boolean;
  onToggleGridFloor?:       () => void;
}

// ── PropertiesPanel ───────────────────────────────────────────────────────────

export function PropertiesPanel({
  activeTool, selected, materialList, quality, onObjectUpdate, onSegmentUpdate,
  onFloorNodesUpdate, getNodeLinks,
  onImportMaterial, onQualityChange, onCopyRunToFloor, onFillRunWithFloor, onAddCeilingToRun,
  onToggleCeilingGhost, runCeilingGhosted, onUnlinkRunCorners, runLinkedFloors, onDelete,
  onVolumeScriptsChange,
  onEditScript,
  zones = [], groups = [], activeZoneId, playerSettings, assets = [], sounds = [], onPlayerSettingsChange, onSpawnPositionChange,
  worldLighting, onWorldLightingChange, worldAudio, onWorldAudioChange, zoneLights = [], onSelectLight,
  bus, onPreviewClip, onStopPreview, onAutoPlayChange,
  decalTextures = [], multiSelected = [], onCopy, onDuplicate, onGroupSelected, onSelectGroup, onBake, defaultColliderFor, onSaveCollidersToAsset, hullPointsFor,
  prefabInfo, onEditPrefab, onSelectInstance, onPrefabVariablesChange, onPrefabOriginChange, onPrefabReexpand, onPrefabUnlink, onPrefabDeleteInstance,
  onCreatePrefab,
  showPerfCounter, onTogglePerfCounter, showCrosshair, onToggleCrosshair,
  showGridFloor, onToggleGridFloor,
}: PropertiesPanelProps) {
  const [stack, setStack]           = useState<ScreenId[]>([]);
  const [actionsOpen, setActionsOpen] = useState(true);
  const [groupsOpen, setGroupsOpen]   = useState(false);
  const [labelDraft, setLabelDraft]   = useState("");
  const [editingLabel, setEditingLabel] = useState(false);
  const [prefabMenuOpen, setPrefabMenuOpen] = useState(false);   // header ⋯ instance-actions menu
  const [showCredits, setShowCredits] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStack([]); setActionsOpen(true); setGroupsOpen(false);
    setEditingLabel(false); setPrefabMenuOpen(false);
    setLabelDraft((selected?.data as { label?: string } | null)?.label ?? "");
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [stack.length]);

  // Tool switch with nothing selected: drop any open no-selection screen (Lights)
  // so the panel shows the newly armed tool's own view.
  useEffect(() => {
    if (!selected) setStack([]);
  }, [activeTool]); // eslint-disable-line react-hooks/exhaustive-deps

  const push = (s: ScreenId) => setStack(prev => [...prev, s]);
  const pop  = ()            => setStack(prev => prev.slice(0, -1));

  const currentScreen = stack.length > 0 ? stack[stack.length - 1] : null;
  const isRoot        = !currentScreen;
  const objAssetId    = selected?.type === "object" ? (selected.data as WorldObject | null)?.assetId : undefined;
  const hasClips      = !!assets.find(a => a.id === objAssetId)?.animations?.length;
  const screens: ScreenId[] = selected
    ? [...(OBJECT_SCREENS[selected.type] ?? []), ...(hasClips ? ["animations" as ScreenId] : [])]
    : [];

  // Committed label (if any). The root header shows it in place of the id;
  // the id then appears underneath so it's never lost.
  const currentLabel   = ((selected?.data as { label?: string } | null)?.label ?? "").trim();
  const headerTitle    = !selected ? (currentScreen ? SCREEN_LABELS[currentScreen] : "") : selected.id === "__spawn__" ? (isRoot ? "Spawn Point" : SCREEN_LABELS[currentScreen!]) : isRoot ? (currentLabel || selected.id) : SCREEN_LABELS[currentScreen!];
  const headerSubtitle = !selected ? (currentScreen ? SCREEN_SUBTITLES[currentScreen] : "") : selected.id === "__spawn__" ? (isRoot ? "player settings" : SCREEN_SUBTITLES[currentScreen!]) : isRoot ? objectTypeLabel(selected) : getSubtitle(currentScreen!, selected.type);

  const canRename = !!selected && isRoot && selected.id !== "__spawn__"
    && ["object", "wall", "floor", "platform", "stair", "trigger-volume", "checkpoint", "decal", "shape", "light"].includes(selected.type as string);
  const startEdit  = (): void => { setLabelDraft(currentLabel); setEditingLabel(true); };
  const cancelEdit = (): void => { setLabelDraft(currentLabel); setEditingLabel(false); };
  const commitLabel = (): void => {
    setEditingLabel(false);
    if (!selected) return;
    const trimmed = labelDraft.trim();
    if (trimmed === currentLabel) return;
    onObjectUpdate({ label: trimmed || undefined } as Partial<WorldObject>);
  };

  // Multi-select: a compact "N selected" view with bulk actions (move is via the group gizmo).
  if (multiSelected.length > 1) {
    const counts = multiSelected.reduce<Record<string, number>>((acc, r) => {
      acc[r.type] = (acc[r.type] ?? 0) + 1; return acc;
    }, {});
    const summary = Object.entries(counts)
      .map(([t, n]) => `${n} ${t}${n > 1 ? "s" : ""}`)
      .join(" · ");
    const ACTION_BTN: React.CSSProperties = {
      width: "100%", padding: "9px 0", marginBottom: 8, borderRadius: 5,
      border: "1px solid rgba(255,255,255,0.12)", background: "rgba(46,46,46,0.9)",
      color: "#c0c0c0", fontSize: 12, fontFamily: "monospace", cursor: "pointer",
    };
    return (
      <div style={PANEL_STYLE}>
        <div style={{ flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ padding: "11px 16px 6px" }}>
            <span style={{ color: "#80aaff", fontSize: 11, letterSpacing: 2 }}>PROPERTIES</span>
          </div>
          <div style={{ padding: "0 16px 10px" }}>
            <div style={{ color: "#c0c0c0", fontSize: 14, fontFamily: "monospace" }}>
              {multiSelected.length} selected
            </div>
            <div style={{ color: "#98a2b8", fontSize: 11, fontFamily: "monospace", marginTop: 2 }}>{summary}</div>
          </div>
        </div>
        {/* Whole prefab instance selected (click-on-any-member expands to all):
            show its controls; the generic Delete yields to Delete-instance. */}
        {prefabInfo && (
          <PrefabSection
            info={prefabInfo}
            onVariablesChange={onPrefabVariablesChange}
            onOriginChange={onPrefabOriginChange}
            onReexpand={onPrefabReexpand}
            onUnlink={onPrefabUnlink}
            onDeleteInstance={onPrefabDeleteInstance}
            onEdit={prefabInfo.prefab && onEditPrefab ? () => onEditPrefab(prefabInfo.prefab!.id) : undefined}
          />
        )}
        <div style={{ padding: 16 }}>
          <div style={{ color: "#98a2b8", fontSize: 11, fontFamily: "monospace", marginBottom: 12, lineHeight: 1.5 }}>
            {prefabInfo
              ? "Drag the gizmo to move the whole instance. Shift-click a member to select just it."
              : "Drag the gizmo to move all together (translate only). Rotate/scale need a single selection."}
          </div>
          {onDuplicate && <button style={ACTION_BTN} onClick={onDuplicate}>Duplicate</button>}
          {onCopy      && <button style={ACTION_BTN} onClick={onCopy}>Copy</button>}
          {onGroupSelected && !prefabInfo && (
            <button
              style={{ ...ACTION_BTN, color: "#9db8e8", borderColor: "rgba(80,140,255,0.3)" }}
              title="Put these in a brand-new group (Cmd/Ctrl+G)"
              onClick={onGroupSelected}
            >⊞ Group Selected</button>
          )}
          {onBake && multiSelected.every(r => r.type === "shape") && (
            <button style={ACTION_BTN} onClick={() => onBake(multiSelected)}>Bake → GLB asset</button>
          )}
          {onCreatePrefab && !prefabInfo && multiSelected.some(r => ["object", "trigger-volume", "shape", "stair", "ladder"].includes(r.type)) && (
            <button
              style={{ ...ACTION_BTN, color: "#9db8e8", borderColor: "rgba(80,140,255,0.3)" }}
              title="Save this selection as a reusable prefab; the selection becomes its first linked instance"
              onClick={() => onCreatePrefab(multiSelected)}
            >⬡ Create Prefab</button>
          )}
          {onDelete && !prefabInfo && (
            <button
              style={{ ...ACTION_BTN, color: "#ff6b6b", borderColor: "rgba(255,107,107,0.3)", marginBottom: 0 }}
              onClick={onDelete}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={PANEL_STYLE}>
      {/* Fixed header */}
      <div style={{ flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ padding: "11px 16px 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#80aaff", fontSize: 11, letterSpacing: 2 }}>PROPERTIES</span>
          {!isRoot && (
            <button onClick={pop} style={{ background: "none", border: "none", color: "#4a9eff", fontSize: 11, cursor: "pointer", padding: "2px 0", fontFamily: "monospace" }}>
              ← Back
            </button>
          )}
        </div>
        {(selected || currentScreen === "lights" || currentScreen?.startsWith("audio")) && (
          <div style={{ padding: "0 16px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {canRename && editingLabel ? (
                <input
                  autoFocus
                  value={labelDraft}
                  placeholder={selected.id}
                  onChange={e => setLabelDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") commitLabel(); else if (e.key === "Escape") cancelEdit(); }}
                  style={{ flex: 1, minWidth: 0, boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, background: "rgba(40,40,40,0.9)", color: "#c0c0c0", fontSize: 13, fontFamily: "monospace", padding: "3px 6px", outline: "none" }}
                />
              ) : (
                <div style={{ flex: "0 1 auto", minWidth: 0, color: "#c0c0c0", fontSize: 13, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {headerTitle}
                </div>
              )}
              {canRename && (
                <button
                  onClick={editingLabel ? commitLabel : startEdit}
                  title={editingLabel ? "Save name" : "Rename"}
                  style={{ flexShrink: 0, background: "none", border: "none", color: "#4a9eff", fontSize: 13, lineHeight: 1, cursor: "pointer", padding: "2px 4px" }}
                >
                  {editingLabel ? "✓" : "✎"}
                </button>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 3, fontSize: 10, overflow: "hidden" }}>
              <span style={{ color: "#98a2b8", letterSpacing: 1, whiteSpace: "nowrap", flexShrink: 0 }}>{headerSubtitle}</span>
              {canRename && (currentLabel || editingLabel) && (
                <span style={{ color: "#98a2b8", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {selected.id}</span>
              )}
            </div>
            {/* Prefab membership — right under the name, so "this entity IS a placed
                prefab instance" is never a surprise (creating a prefab from a selection
                makes that selection the first instance). Snapshot names link to edit. */}
            {prefabInfo && isRoot && (
              // No overflow:hidden here — it would clip the ⋯ dropdown (absolute child).
              // Long names still ellipsize via their own overflow styles + minWidth 0.
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3, fontSize: 10, minWidth: 0 }}>
                {prefabInfo.prefab === null ? (
                  <span style={{ color: "#e0a050", fontFamily: "monospace", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    ⚠ Prefab · {prefabInfo.record.prefabId} · definition missing
                  </span>
                ) : prefabInfo.prefab.kind === "snapshot" ? (
                  <>
                    <span style={{ color: "#80aaff", flexShrink: 0 }}>⬡</span>
                    <button onClick={() => onEditPrefab?.(prefabInfo.prefab!.id)}
                      title="Edit prefab — saving updates every placed instance"
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                        color: "#4a9eff", fontSize: 10, fontFamily: "monospace", minWidth: 0,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {prefabInfo.prefab.name} ✎
                    </button>
                  </>
                ) : (
                  <span style={{ color: "#7fb069", fontFamily: "monospace", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    ƒ {prefabInfo.prefab.name}
                  </span>
                )}
                {/* This header only renders for a SINGLE selected piece, so "all N"
                    is the way back to whole-instance selection (one gizmo moves
                    object + trigger + everything, like a plain viewport click). */}
                {(prefabInfo.memberCount ?? 0) > 1 && onSelectInstance && (
                  <button onClick={onSelectInstance}
                    title={`Select all ${prefabInfo.memberCount} pieces of this instance — move them together with one gizmo`}
                    style={{ flexShrink: 0, padding: "0 6px", fontSize: 9, letterSpacing: 0.5,
                      lineHeight: "14px", borderRadius: 3, cursor: "pointer",
                      background: "rgba(80,140,255,0.12)", border: "1px solid rgba(80,140,255,0.3)",
                      color: "#80aaff", fontFamily: "monospace" }}>
                    ⛶ all {prefabInfo.memberCount}
                  </button>
                )}
                {/* ⋯ menu: the Prefab section's instance actions, reachable from the
                    header too. Each action confirms (App wraps the handlers). */}
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <button onClick={() => setPrefabMenuOpen(v => !v)} title="Instance actions"
                    style={{ padding: "0 5px", fontSize: 9, lineHeight: "14px", borderRadius: 3,
                      cursor: "pointer", background: prefabMenuOpen ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.12)", color: "#8b94a8", fontFamily: "monospace" }}>
                    ⋯
                  </button>
                  {prefabMenuOpen && (
                    <>
                      <div style={{ position: "fixed", inset: 0, zIndex: 40 }}
                        onClick={() => setPrefabMenuOpen(false)} />
                      <div style={{ position: "absolute", right: 0, top: 18, zIndex: 41, width: 150,
                        background: "rgba(28,28,28,0.99)", border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 4, boxShadow: "0 6px 20px rgba(0,0,0,0.5)", padding: 3,
                        display: "flex", flexDirection: "column" }}>
                        {([
                          ...(prefabInfo.prefab !== null
                            ? [["Reset from prefab", onPrefabReexpand, "#c2cadb"] as const] : []),
                          ["Unlink", onPrefabUnlink, "#c2cadb"] as const,
                          ["Delete instance", onPrefabDeleteInstance, "#cc6666"] as const,
                        ]).map(([label, fn, color]) => (
                          <button key={label}
                            onClick={() => { setPrefabMenuOpen(false); fn?.(); }}
                            style={{ textAlign: "left", padding: "5px 8px", borderRadius: 3,
                              cursor: "pointer", background: "none", border: "none",
                              color, fontSize: 10, fontFamily: "monospace" }}
                            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "none"; }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scrollable body */}
      <div ref={bodyRef} style={{ flex: 1, overflowY: "auto" }}>
        {selected?.id === "__spawn__" && playerSettings && onPlayerSettingsChange ? (
          <SpawnSettingsView
            settings={playerSettings} assets={assets} onChange={onPlayerSettingsChange}
            position={selected.position} onPositionChange={onSpawnPositionChange}
            screen={currentScreen} onOpen={push}
          />
        ) : !selected ? (
          currentScreen === "lights" ? (
            <>
              {worldLighting && onWorldLightingChange && (
                <LightingQualitySection
                  quality={worldLighting.quality ?? "fancy"}
                  onChange={q => onWorldLightingChange({ quality: q })}
                />
              )}
              {worldLighting && onWorldLightingChange && (
                <WorldLightSection lighting={worldLighting} onChange={onWorldLightingChange} />
              )}
              <LightListSection lights={zoneLights} onSelect={onSelectLight} />
            </>
          ) : currentScreen === "audio" ? (
            <AudioMenuSection audio={worldAudio} playerSettings={playerSettings} onOpen={push} />
          ) : currentScreen === "audio-mixer" ? (
            onWorldAudioChange ? <AudioMixerPage audio={worldAudio} onChange={onWorldAudioChange} /> : null
          ) : currentScreen === "audio-music" ? (
            onWorldAudioChange ? <AudioSlotPage kind="music" audio={worldAudio} onChange={onWorldAudioChange} /> : null
          ) : currentScreen === "audio-ambient" ? (
            onWorldAudioChange ? <AudioSlotPage kind="ambient" audio={worldAudio} onChange={onWorldAudioChange} /> : null
          ) : currentScreen === "audio-character" ? (
            playerSettings && onPlayerSettingsChange
              ? <CharacterSoundsPage playerSettings={playerSettings} onPlayerSettingsChange={onPlayerSettingsChange} />
              : null
          ) : (
            <ToolView activeTool={activeTool} onShowCredits={() => setShowCredits(true)}
              lightCount={zoneLights.length} onOpenLights={() => push("lights")}
              onOpenAudio={() => push("audio")}
              showPerfCounter={showPerfCounter} onTogglePerfCounter={onTogglePerfCounter}
              showCrosshair={showCrosshair} onToggleCrosshair={onToggleCrosshair}
              showGridFloor={showGridFloor} onToggleGridFloor={onToggleGridFloor} />
          )
        ) : selected.type === "trigger-volume" ? (
          <TriggerVolumeView
            selected={selected}
            onDelete={onDelete}
            onScriptsChange={onVolumeScriptsChange}
            onEditScript={onEditScript}
            groups={groups}
            groupsOpen={groupsOpen}
            onToggleGroups={() => setGroupsOpen(v => !v)}
            onObjectUpdate={onObjectUpdate}
            onSelectGroup={onSelectGroup}
            bus={bus}
            zone={zones?.find(z => z.id === selected.zoneId)}
            prefabSection={prefabInfo ? (
              <PrefabSection
                key={prefabInfo.record.id}
                info={prefabInfo}
                defaultOpen={false}
                onVariablesChange={onPrefabVariablesChange}
                onOriginChange={onPrefabOriginChange}
                onReexpand={onPrefabReexpand}
                onUnlink={onPrefabUnlink}
                onDeleteInstance={onPrefabDeleteInstance}
                onSelectAll={onSelectInstance}
                onEdit={prefabInfo.prefab && onEditPrefab ? () => onEditPrefab(prefabInfo.prefab!.id) : undefined}
              />
            ) : null}
          />
        ) : selected.type === "checkpoint" ? (
          <CheckpointView selected={selected} onDelete={onDelete} onObjectUpdate={onObjectUpdate} />
        ) : selected.type === "light" ? (
          <LightView selected={selected} onDelete={onDelete} onObjectUpdate={onObjectUpdate} />
        ) : selected.type === "decal" ? (
          <DecalView selected={selected} onDelete={onDelete} onObjectUpdate={onObjectUpdate} decalTextures={decalTextures} />
        ) : isRoot ? (
          <>
            {/* Prefab membership first (collapsed) — the "this is part of something
                bigger" context belongs above the entity's own category rows. */}
            {prefabInfo && (
              <PrefabSection
                key={prefabInfo.record.id}
                info={prefabInfo}
                defaultOpen={false}
                onVariablesChange={onPrefabVariablesChange}
                onOriginChange={onPrefabOriginChange}
                onReexpand={onPrefabReexpand}
                onUnlink={onPrefabUnlink}
                onDeleteInstance={onPrefabDeleteInstance}
                onSelectAll={onSelectInstance}
                onEdit={prefabInfo.prefab && onEditPrefab ? () => onEditPrefab(prefabInfo.prefab!.id) : undefined}
              />
            )}
            {screens.map(s => (
              <CategoryRow
                key={s}
                label={SCREEN_LABELS[s]}
                summary={summaryFor(s, selected, materialList, assets)}
                onPress={() => push(s)}
              />
            ))}
            <GroupsAccordion
              open={groupsOpen}
              onToggle={() => setGroupsOpen(v => !v)}
              selected={selected}
              groups={groups}
              onObjectUpdate={onObjectUpdate}
              onSelectGroup={onSelectGroup}
            />
            <ActionsAccordion
              open={actionsOpen}
              onToggle={() => setActionsOpen(v => !v)}
              selected={selected}
              groups={groups}
              onSelectGroup={onSelectGroup}
              onCopyRunToFloor={onCopyRunToFloor}
              onFillRunWithFloor={onFillRunWithFloor}
              onAddCeilingToRun={onAddCeilingToRun}
              onToggleCeilingGhost={onToggleCeilingGhost}
              runCeilingGhosted={runCeilingGhosted}
              onUnlinkRunCorners={onUnlinkRunCorners}
              runLinkedFloors={runLinkedFloors}
              onDelete={onDelete}
              onBake={onBake}
              onCreatePrefab={onCreatePrefab}
              isPrefabMember={!!prefabInfo}
            />
          </>
        ) : currentScreen === "geo" ? (
          <GeoScreen selected={selected} onObjectUpdate={onObjectUpdate} onSegmentUpdate={onSegmentUpdate} onFloorNodesUpdate={onFloorNodesUpdate} getNodeLinks={getNodeLinks} zones={zones} bus={bus} activeTool={activeTool} materialList={materialList} />
        ) : currentScreen === "mat" ? (
          <MatScreen
            selected={selected}
            materialList={materialList}
            onObjectUpdate={onObjectUpdate}
            onAddMaterial={onImportMaterial}
            quality={quality}
            onQualityChange={onQualityChange}
            bus={bus}
          />
        ) : currentScreen === "open" ? (
          <OpeningsScreen selected={selected} onSegmentUpdate={onSegmentUpdate} zones={zones} activeZoneId={activeZoneId ?? null} />
        ) : currentScreen === "seg" ? (
          <SegmentsScreen selected={selected} materialList={materialList} onAddMaterial={onImportMaterial} onSegmentUpdate={onSegmentUpdate} bus={bus} getNodeLinks={getNodeLinks} />
        ) : currentScreen === "animations" ? (
          <AnimationsScreen
            selected={selected}
            assets={assets}
            bus={bus}
            onPreviewClip={onPreviewClip}
            onStopPreview={onStopPreview}
            onAutoPlayChange={onAutoPlayChange}
          />
        ) : currentScreen === "vert" ? (
          <VertScreen selected={selected} onObjectUpdate={onObjectUpdate} />
        ) : currentScreen === "colliders" ? (
          <CollidersScreen
            selected={selected}
            assets={assets}
            onObjectUpdate={onObjectUpdate}
            defaultColliderFor={defaultColliderFor}
            onSaveCollidersToAsset={onSaveCollidersToAsset}
            hullPointsFor={hullPointsFor}
            bus={bus}
          />
        ) : currentScreen === "sound" ? (
          <EntitySoundScreen selected={selected} onObjectUpdate={onObjectUpdate} />
        ) : currentScreen === "scripts" ? (
          <ObjectScriptsScreen selected={selected} onScriptsChange={onVolumeScriptsChange} onEditScript={onEditScript} onObjectUpdate={onObjectUpdate} bus={bus} />
        ) : currentScreen === "ai" ? (
          <EnemyAIScreen selected={selected} assets={assets} onObjectUpdate={onObjectUpdate} bus={bus} />
        ) : null}
      </div>

      {showCredits && (
        <CreditsModal materials={materialList} assets={assets} sounds={sounds} onClose={() => setShowCredits(false)} />
      )}
    </div>
  );
}

// ── CategoryRow ───────────────────────────────────────────────────────────────

function CategoryRow({ label, summary, onPress }: { label: string; summary: string; onPress: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onPress}
      style={{ ...ROW_BASE, background: hovered ? "rgba(255,255,255,0.03)" : "none" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ color: "#d8d8d8", fontSize: 12, fontWeight: 500 }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace" }}>{summary}</span>
        <span style={{ color: "#505060", fontSize: 14, lineHeight: 1 }}>›</span>
      </span>
    </button>
  );
}

// ── ActionsAccordion ──────────────────────────────────────────────────────────

function ActionsAccordion({ open, onToggle, selected, groups = [], onSelectGroup, onCopyRunToFloor, onFillRunWithFloor, onAddCeilingToRun, onToggleCeilingGhost, runCeilingGhosted, onUnlinkRunCorners, runLinkedFloors, onDelete, onBake, onCreatePrefab, isPrefabMember }: {
  open:               boolean;
  onToggle:           () => void;
  selected:           SelectedObjectPayload;
  groups?:            GroupDef[];
  onSelectGroup?:     (groupId: string) => void;
  onCopyRunToFloor?:  (level: number) => void;
  onFillRunWithFloor?: () => void;
  onAddCeilingToRun?: () => void;
  onToggleCeilingGhost?: () => void;
  runCeilingGhosted?: boolean;
  onUnlinkRunCorners?: () => void;
  runLinkedFloors?:   number[];
  onDelete?:          () => void;
  onBake?:            (refs: SelectedRef[]) => void;
  onCreatePrefab?:    (refs: SelectedRef[]) => void;
  isPrefabMember?:    boolean;
}) {
  const wallData = selected.type === "wall" ? selected.data as WallDef : null;
  const [hovered, setHovered] = useState(false);
  // Groups this entity actually belongs to, resolved to defs for their names.
  const joinedGroups = ((selected.data as { groupIds?: string[] } | null)?.groupIds ?? [])
    .map(id => groups.find(g => g.id === id))
    .filter((g): g is GroupDef => !!g);

  return (
    <div>
      <button
        onClick={onToggle}
        style={{ ...ROW_BASE, background: hovered ? "rgba(255,255,255,0.03)" : "none", borderBottom: open ? "none" : "1px solid rgba(255,255,255,0.05)" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span style={{ color: "#d8d8d8", fontSize: 12, fontWeight: 500 }}>Actions</span>
        <span style={{ color: "#505060", fontSize: 14, lineHeight: 1, display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>›</span>
      </button>

      {open && (
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          {/* One button per group this entity belongs to — named only when it's
              in more than one, so the common case stays a plain "Select group". */}
          {onSelectGroup && joinedGroups.map(g => (
            <button
              key={g.id}
              onClick={() => onSelectGroup(g.id)}
              title={`Select every member of “${g.name}”`}
              style={{
                width: "100%", padding: "9px 0", borderRadius: 4, cursor: "pointer",
                background: "rgba(80,140,255,0.1)", border: "1px solid rgba(80,140,255,0.3)",
                color: "#80aaff", fontSize: 11, fontFamily: "monospace",
              }}
            >{joinedGroups.length > 1 ? `Select group: ${g.name}` : "Select group"}</button>
          ))}

          {onFillRunWithFloor && (
            <button
              onClick={onFillRunWithFloor}
              style={{
                width: "100%", padding: "9px 0", borderRadius: 4, cursor: "pointer",
                background: "rgba(60,180,100,0.1)", border: "1px solid rgba(60,180,100,0.35)",
                color: "#6bc88a", fontSize: 11, fontFamily: "monospace",
              }}
            >Fill closed loop with floor</button>
          )}

          {onAddCeilingToRun && (
            <button
              onClick={onAddCeilingToRun}
              style={{
                width: "100%", padding: "9px 0", borderRadius: 4, cursor: "pointer",
                background: "rgba(60,180,100,0.1)", border: "1px solid rgba(60,180,100,0.35)",
                color: "#6bc88a", fontSize: 11, fontFamily: "monospace",
              }}
            >Add ceiling (cap closed loop)</button>
          )}

          {onToggleCeilingGhost && (
            <button
              onClick={onToggleCeilingGhost}
              title={runCeilingGhosted
                ? "Ceiling is ghosted (see-through, click-through in the editor; solid in game)"
                : "Ghost the ceiling so you can see and click into the room; stays solid in game"}
              style={{
                width: "100%", padding: "9px 0", borderRadius: 4, cursor: "pointer",
                background: "rgba(60,180,100,0.1)", border: "1px solid rgba(60,180,100,0.35)",
                color: "#6bc88a", fontSize: 11, fontFamily: "monospace",
              }}
            >{runCeilingGhosted ? "Show ceiling (un-ghost)" : "Hide ceiling (ghost)"}</button>
          )}

          {onUnlinkRunCorners && runLinkedFloors && runLinkedFloors.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontFamily: "monospace", color: "#98a2b8", marginBottom: 6 }}>
                ⛓ Corners linked to: {runLinkedFloors.map(l => (l === 0 ? "G" : String(l))).join(", ")}
              </div>
              <button
                onClick={onUnlinkRunCorners}
                title="Stop this run's corners from following the other floors' — each floor moves on its own afterward. The other floors stay linked to each other."
                style={{
                  width: "100%", padding: "9px 0", borderRadius: 4, cursor: "pointer",
                  background: "rgba(80,140,255,0.1)", border: "1px solid rgba(80,140,255,0.3)",
                  color: "#80aaff", fontSize: 11, fontFamily: "monospace",
                }}
              >Unlink corners from other floors</button>
            </div>
          )}

          {onCopyRunToFloor && (
            <div>
              <div style={{ ...LABEL, marginBottom: 6 }}>COPY TO FLOOR</div>
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 1, 2, 3].map(level => {
                  const isCurrent = level === (wallData?.floor ?? 0);
                  return (
                    <button
                      key={level}
                      disabled={isCurrent}
                      onClick={() => onCopyRunToFloor(level)}
                      style={{
                        flex: 1, padding: "5px 0", borderRadius: 4,
                        cursor: isCurrent ? "default" : "pointer",
                        fontFamily: "monospace", fontSize: 11, border: "none",
                        background: isCurrent ? "rgba(46,46,46,0.4)" : "rgba(80,140,255,0.1)",
                        color: isCurrent ? "#98a2b8" : "#80aaff",
                        outline: isCurrent ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(80,140,255,0.3)",
                      }}
                    >{level === 0 ? "G" : String(level)}</button>
                  );
                })}
              </div>
            </div>
          )}

          {onBake && selected.type === "shape" && (
            <button
              onClick={() => onBake([{ id: selected.id, type: "shape", zoneId: selected.zoneId }])}
              style={{
                width: "100%", padding: "9px 0", borderRadius: 4, cursor: "pointer",
                background: "rgba(80,140,255,0.1)", border: "1px solid rgba(80,140,255,0.3)",
                color: "#80aaff", fontSize: 11, fontFamily: "monospace",
              }}
            >Bake → GLB asset</button>
          )}

          {/* Single-entity prefab capture (the multi-select view has its own button).
              Scripts on the entity ride along into the prefab definition. */}
          {onCreatePrefab && !isPrefabMember
            && ["object", "trigger-volume", "shape", "stair", "ladder"].includes(selected.type as string) && (
            <button
              onClick={() => onCreatePrefab([{ id: selected.id, type: selected.type, zoneId: selected.zoneId } as SelectedRef])}
              title="Save this entity (scripts included) as a reusable prefab; it becomes the first linked instance"
              style={{
                width: "100%", padding: "9px 0", borderRadius: 4, cursor: "pointer",
                background: "rgba(80,140,255,0.1)", border: "1px solid rgba(80,140,255,0.3)",
                color: "#9db8e8", fontSize: 11, fontFamily: "monospace",
              }}
            >⬡ Create Prefab</button>
          )}

          {onDelete && (
            <button
              onClick={onDelete}
              style={{
                width: "100%", padding: "9px 0", borderRadius: 4, cursor: "pointer",
                background: "rgba(200,60,60,0.1)", border: "1px solid rgba(200,60,60,0.35)",
                color: "#e88", fontSize: 11, fontFamily: "monospace",
              }}
            >Delete</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── GroupsAccordion ───────────────────────────────────────────────────────────

// ── PrefabSection (Phase 45) ─────────────────────────────────────────────────
// Shown on a member's root screen. Variable edits and origin edits commit an
// update-record + re-expand transaction upstream; the section's values come
// from the live PrefabInstanceRecord, so it survives re-expansion.

function PrefabVarField({ def, value, onCommit }: {
  def: PrefabVariableDef; value: PrefabVarValue; onCommit: (v: PrefabVarValue) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const debounceRef = useRef<number | null>(null);
  useEffect(() => { setDraft(String(value)); }, [value]);
  useEffect(() => () => { if (debounceRef.current != null) window.clearTimeout(debounceRef.current); }, []);

  if (def.type === "boolean") {
    return (
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={value === true} onChange={e => onCommit(e.target.checked)} />
        <span style={{ color: "#c2cadb", fontSize: 11, fontFamily: "monospace" }}>{def.label ?? def.name}</span>
      </label>
    );
  }
  if (def.type === "choice") {
    return (
      <div>
        <div style={LABEL}>{(def.label ?? def.name).toUpperCase()}</div>
        <select
          value={String(value)}
          onChange={e => onCommit(e.target.value)}
          style={{ ...NUM_INPUT, color: "#dde3f0" }}
        >
          {(def.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }
  const commitNumber = (raw: string): void => {
    const n = Number(raw);
    if (!Number.isFinite(n)) { setDraft(String(value)); return; }
    const step = def.step ?? 1;
    let v = Math.round(n / step) * step;
    if (def.min !== undefined) v = Math.max(def.min, v);
    if (def.max !== undefined) v = Math.min(def.max, v);
    setDraft(String(v));
    if (v !== value) onCommit(v);
  };
  // Live commit, debounced: spinner arrows / typed digits apply without needing a
  // blur, but a half-typed "1" (min-clamped to 2) gets 600ms to become "12" first.
  // Blur / Enter still commit immediately.
  const queueCommit = (raw: string): void => {
    setDraft(raw);
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => { debounceRef.current = null; commitNumber(raw); }, 600);
  };
  const flushCommit = (raw: string): void => {
    if (debounceRef.current != null) { window.clearTimeout(debounceRef.current); debounceRef.current = null; }
    commitNumber(raw);
  };
  return (
    <div>
      <div style={LABEL}>{(def.label ?? def.name).toUpperCase()}</div>
      <input
        type="number" value={draft} min={def.min} max={def.max} step={def.step ?? 1}
        onChange={e => queueCommit(e.target.value)}
        onBlur={e => flushCommit(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") flushCommit((e.target as HTMLInputElement).value); }}
        style={{ ...NUM_INPUT, color: "#dde3f0" }}
      />
    </div>
  );
}

function PrefabSection({ info, onVariablesChange, onOriginChange, onReexpand, onUnlink, onDeleteInstance, onSelectAll, onEdit, defaultOpen = true }: {
  info:               { prefab: PrefabDef | null; record: PrefabInstanceRecord; memberCount?: number };
  onVariablesChange?: (vars: Record<string, PrefabVarValue>) => void;
  onOriginChange?:    (origin: { position: Vec3; rotationY: number }) => void;
  onReexpand?:        () => void;
  onUnlink?:          () => void;
  onDeleteInstance?:  () => void;
  onSelectAll?:       () => void;   // select every piece (passed only where the selection ISN'T already the whole instance)
  onEdit?:            () => void;   // enter prefab edit (snapshot kind only)
  defaultOpen?:       boolean;      // single-entity views start collapsed; the whole-instance view starts open
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [hovered, setHovered] = useState(false);
  const { prefab, record } = info;
  // Generator prefabs render the REGISTRY's variable schema, not the def's
  // stored copy — library defs snapshot variables at creation and go stale
  // when a generator gains one (e.g. tiled-platform "height", v4.44.4).
  const varDefs = (prefab?.kind === "generator" && prefab.generatorId && GENERATORS[prefab.generatorId]?.variables) || prefab?.variables || [];

  // Orphaned instance: the definition is gone from the library (deleted, or a
  // game.json that never got it). Variables/re-expansion are impossible; the
  // members are still real entities — offer the operations that don't need the def.
  if (!prefab) {
    return (
      <div>
        <div style={{ ...ROW_BASE, cursor: "default", borderBottom: "none" }}>
          <span style={{ color: "#d8d8d8", fontSize: 12, fontWeight: 500 }}>
            <span style={{ color: "#e0a050", marginRight: 6 }}>⚠</span>
            Prefab instance · definition missing
          </span>
        </div>
        <div style={{ padding: "0 16px 12px", display: "flex", flexDirection: "column", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ color: "#c2cadb", fontSize: 10, fontFamily: "monospace", lineHeight: 1.5 }}>
            These pieces belong to a prefab whose definition isn't in this project's
            library ({record.prefabId}) — it was deleted, or the session that created
            it never saved. The pieces themselves are fine. Unlink to keep them as
            plain objects, or delete the whole instance.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            <PrefabBtn label="Unlink" title="Detach the members into plain, independent entities" onClick={onUnlink} />
            <PrefabBtn label="Delete instance" title="Remove every member and the prefab link" onClick={onDeleteInstance} danger />
          </div>
        </div>
      </div>
    );
  }

  const originField = (label: string, value: number, apply: (v: number) => void) => (
    <OriginNumField key={label} label={label} value={value} onCommit={apply} />
  );

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ ...ROW_BASE, background: hovered ? "rgba(255,255,255,0.03)" : "none", borderBottom: open ? "none" : "1px solid rgba(255,255,255,0.05)" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span style={{ color: "#d8d8d8", fontSize: 12, fontWeight: 500 }}>
          <span style={{ color: prefab.kind === "generator" ? "#7fb069" : "#80aaff", marginRight: 6 }}>
            {prefab.kind === "generator" ? "ƒ" : "⬡"}
          </span>
          Prefab · {prefab.name}
        </span>
        <span style={{ color: "#505060", fontSize: 14, lineHeight: 1, display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>›</span>
      </button>

      {open && (
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          {varDefs.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {varDefs.map(v => (
                <PrefabVarField
                  key={v.name}
                  def={v}
                  value={record.variables[v.name] ?? v.default}
                  onCommit={val => onVariablesChange?.({ [v.name]: val })}
                />
              ))}
            </div>
          )}

          <div>
            <div style={LABEL}>POSITION</div>
            <div style={{ display: "flex", gap: 6 }}>
              {originField("X", record.origin.position.x, v => onOriginChange?.({ ...record.origin, position: { ...record.origin.position, x: v } }))}
              {originField("Y", record.origin.position.y, v => onOriginChange?.({ ...record.origin, position: { ...record.origin.position, y: v } }))}
              {originField("Z", record.origin.position.z, v => onOriginChange?.({ ...record.origin, position: { ...record.origin.position, z: v } }))}
              {originField("ROT°", record.origin.rotationY, v => onOriginChange?.({ ...record.origin, rotationY: v }))}
            </div>
            <div style={{ color: "#8a92a6", fontSize: 9, fontFamily: "monospace", marginTop: 4 }}>
              Platform tiles are walked on 1m above Y.
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {onSelectAll && (info.memberCount ?? 0) > 1 && (
              <PrefabBtn label={`⛶ Select all ${info.memberCount}`}
                title="Select every piece of this instance — move them together with one gizmo" onClick={onSelectAll} />
            )}
            {onEdit && prefab.kind === "snapshot" && (
              <PrefabBtn label="Edit prefab" amber
                title="Edit the prefab in isolation — saving updates every placed instance" onClick={onEdit} />
            )}
            <PrefabBtn label="Reset from prefab" title="Rebuild all pieces from the prefab. Settings and position keep their values; hand-edits to individual pieces are discarded" onClick={onReexpand} />
            <PrefabBtn label="Unlink" title="Detach into plain, independent objects — prefab updates stop affecting them" onClick={onUnlink} />
            <PrefabBtn label="Delete instance" title="Remove every piece and the prefab link" onClick={onDeleteInstance} danger />
          </div>
          <div style={{ color: "#8a92a6", fontSize: 9, fontFamily: "monospace", lineHeight: 1.5 }}>
            The settings and position above are saved per placed copy and never reset.
            Only hand-edits to individual pieces (shift-click) are overwritten when the
            pieces rebuild — Unlink first if you want to keep those.
          </div>
        </div>
      )}
    </div>
  );
}

function OriginNumField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(Math.round(value * 100) / 100));
  useEffect(() => { setDraft(String(Math.round(value * 100) / 100)); }, [value]);
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...LABEL, marginBottom: 2, fontSize: 9 }}>{label}</div>
      <input
        type="number" value={draft} step={0.5}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { const n = Number(draft); if (Number.isFinite(n) && n !== value) onCommit(n); else setDraft(String(Math.round(value * 100) / 100)); }}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        style={{ ...NUM_INPUT, color: "#dde3f0", padding: "4px 6px" }}
      />
    </div>
  );
}

function PrefabBtn({ label, title, onClick, danger, amber }: { label: string; title: string; onClick?: () => void; danger?: boolean; amber?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={!onClick}
      style={{
        background: "transparent",
        border: `1px solid ${danger ? "rgba(180,90,90,0.3)" : amber ? "rgba(240,192,96,0.3)" : "rgba(80,140,255,0.25)"}`,
        borderRadius: 3, cursor: "pointer",
        color: danger ? "#c98080" : amber ? "#f0c060" : "#9db8e8",
        fontSize: 9, padding: "3px 8px", fontFamily: "monospace", letterSpacing: 0.3,
      }}
    >{label}</button>
  );
}

function GroupsAccordion({ open, onToggle, selected, groups, onObjectUpdate, onSelectGroup }: {
  open:           boolean;
  onToggle:       () => void;
  selected:       SelectedObjectPayload;
  groups:         GroupDef[];
  onObjectUpdate: (changes: Partial<WorldObject>) => void;
  onSelectGroup?: (groupId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const memberIds = (selected.data as { groupIds?: string[] } | null)?.groupIds ?? [];

  const toggleGroup = (id: string): void => {
    const next = memberIds.includes(id)
      ? memberIds.filter(g => g !== id)
      : [...memberIds, id];
    onObjectUpdate({ groupIds: next });
  };

  return (
    <div>
      <button
        onClick={onToggle}
        style={{ ...ROW_BASE, background: hovered ? "rgba(255,255,255,0.03)" : "none", borderBottom: open ? "none" : "1px solid rgba(255,255,255,0.05)" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span style={{ color: "#d8d8d8", fontSize: 12, fontWeight: 500 }}>
          Groups{memberIds.length > 0 ? ` (${memberIds.length})` : ""}
        </span>
        <span style={{ color: "#505060", fontSize: 14, lineHeight: 1, display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>›</span>
      </button>

      {open && (
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          {groups.length === 0 ? (
            <div style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace", lineHeight: 1.5 }}>
              No groups yet — create one in the Groups panel.
            </div>
          ) : groups.map(g => {
            const checked = memberIds.includes(g.id);
            return (
              // Row is a div, not a button — the per-group "Select" action below
              // can't legally nest inside the membership toggle.
              <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  onClick={() => toggleGroup(g.id)}
                  style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, textAlign: "left",
                           background: "none", border: "none", cursor: "pointer", padding: "3px 0" }}
                >
                  <span style={{ width: 14, height: 14, flexShrink: 0, borderRadius: 3,
                                 border: checked ? "1px solid rgba(80,140,255,0.6)" : "1px solid rgba(255,255,255,0.15)",
                                 background: checked ? "rgba(80,140,255,0.7)" : "transparent",
                                 color: "#fff", fontSize: 10, lineHeight: "13px", textAlign: "center" }}>
                    {checked ? "✓" : ""}
                  </span>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4d6fa8", flexShrink: 0 }} />
                  <span style={{ flex: 1, color: "#b0b0c0", fontSize: 11, fontFamily: "monospace",
                                 overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.name}
                  </span>
                </button>
                {checked && onSelectGroup && (
                  <button
                    onClick={() => onSelectGroup(g.id)}
                    title={`Select every member of “${g.name}”`}
                    style={{ flexShrink: 0, background: "transparent", border: "1px solid rgba(80,140,255,0.25)",
                             borderRadius: 3, cursor: "pointer", color: "#9db8e8",
                             fontSize: 9, padding: "2px 6px", fontFamily: "monospace", letterSpacing: 0.3 }}
                  >Select group</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── GeoScreen ─────────────────────────────────────────────────────────────────

function GeoScreen({ selected, onObjectUpdate, onSegmentUpdate, onFloorNodesUpdate, getNodeLinks, zones, bus, activeTool, materialList }: {
  selected:        SelectedObjectPayload;
  onObjectUpdate:  (changes: Partial<WorldObject>) => void;
  onSegmentUpdate: (wallId: string, changes: Partial<WallDef>) => void;
  onFloorNodesUpdate?: (updates: Array<{ nodeId: string; x: number; z: number }>, label?: string) => void;
  getNodeLinks?:   (zoneId: string, nodeId: string) => NodeLinks;
  zones?:          ZoneDef[];
  bus?:            EventBus;
  activeTool?:     ToolId;
  materialList?:   MaterialDef[];
}) {
  if (selected.type === "wall")     return <WallGeoView     selected={selected} onObjectUpdate={onObjectUpdate} />;
  if (selected.type === "floor")    return <FloorGeoView    selected={selected} zones={zones} bus={bus} onObjectUpdate={onObjectUpdate} onFloorNodesUpdate={onFloorNodesUpdate} getNodeLinks={getNodeLinks} />;
  if (selected.type === "platform") return <PlatformGeoView selected={selected} onObjectUpdate={onObjectUpdate} />;
  if (selected.type === "stair")    return <StairGeoView    selected={selected} onObjectUpdate={onObjectUpdate} />;
  if (selected.type === "ladder")   return <LadderGeoView   selected={selected} onObjectUpdate={onObjectUpdate} />;
  if (selected.type === "object")   return <ObjectGeoView   selected={selected} onObjectUpdate={onObjectUpdate} />;
  if (selected.type === "opening")  return <OpeningGeoView  selected={selected} onObjectUpdate={onObjectUpdate} />;
  if (selected.type === "shape")    return <ShapeGeoView    selected={selected} onObjectUpdate={onObjectUpdate} bus={bus} activeTool={activeTool} materialList={materialList} />;
  return null;
}

// ── FloorGeoView ──────────────────────────────────────────────────────────────

function FloorGeoView({ selected, zones, bus, onObjectUpdate, onFloorNodesUpdate, getNodeLinks }: {
  selected:            SelectedObjectPayload;
  zones?:              ZoneDef[];
  bus?:                EventBus;
  onObjectUpdate:      (changes: Partial<WorldObject>) => void;
  onFloorNodesUpdate?: (updates: Array<{ nodeId: string; x: number; z: number }>, label?: string) => void;
  getNodeLinks?:       (zoneId: string, nodeId: string) => NodeLinks;
}) {
  const floor = selected.data as FloorDef | null;
  const zone  = zones?.find(z => z.id === selected.zoneId);

  // Node positions read live from the zones prop (WorldState mutates zones in place;
  // floor:rebuilt re-emits selection → re-render picks up fresh positions).
  const nodeIds  = floor?.floorMesh.nodeIds ?? [];
  const resolved = nodeIds.map(id => zone?.nodes.find(n => n.id === id));
  const nodesOk  = nodeIds.length >= 3 && resolved.every(n => !!n);
  const nodes    = nodesOk ? (resolved as WallNode[]) : [];
  const isRect   = floor?.floorMesh.shape === "rect" && nodesOk && nodes.length === 4;

  const isLinked = (nodeId: string): boolean => {
    if (!getNodeLinks || !floor) return false;
    const l = getNodeLinks(selected.zoneId, nodeId);
    return l.wallIds.length > 0 || l.platformIds.length > 0 || l.floorIds.some(id => id !== floor.id);
  };

  if (!floor) return null;

  // Legacy floors (no nodeIds) — and node-backed floors whose nodes went missing
  // (edit would otherwise write through resolveFloorMesh's {0,0} collapse): edit
  // floorMesh.points directly. Commits build a NEW points array (never mutate in
  // place — _touch snapshots the entity before updateFloor merges) and detach any
  // broken nodeIds so points become authoritative again.
  if (!nodesOk) {
    const points = floor.floorMesh.points ?? [];
    const detach = nodeIds.length > 0;
    const commitPoint = (idx: number, x: number, z: number) => {
      const next: Vec2[] = points.map((p, i) => i === idx ? { x, z } : { ...p });
      onObjectUpdate({ floorMesh: { points: next, ...(detach ? { nodeIds: undefined } : {}) } } as unknown as Partial<WorldObject>);
    };
    return (
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div style={LABEL}>VERTICES</div>
          {points.map((p, i) => (
            <FloorVertexRow
              key={i} index={i + 1} nodeId={null} x={p.x} z={p.z}
              zoneId={selected.zoneId} sourceId={floor.id} linked={false}
              onCommit={(x, z) => commitPoint(i, x, z)} bus={bus}
            />
          ))}
        </div>
        <div style={{ color: "#98a2b8", fontSize: 9 }}>
          {detach
            ? "This floor's nodes are missing — edits detach it to plain points."
            : "Legacy floor — vertices are not linked to wall nodes."}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      {isRect && <RectFloorFields floor={floor} nodes={nodes} onFloorNodesUpdate={onFloorNodesUpdate} />}
      <div>
        <div style={LABEL}>VERTICES</div>
        {nodes.map((n, i) => (
          <FloorVertexRow
            key={n.id} index={i + 1} nodeId={n.id} x={n.x} z={n.z}
            zoneId={selected.zoneId} sourceId={floor.id} linked={isLinked(n.id)}
            readOnly={isRect}
            onCommit={isRect ? undefined : (x, z) => onFloorNodesUpdate?.([{ nodeId: n.id, x, z }])}
            bus={bus}
          />
        ))}
        {isRect && (
          <div style={{ color: "#98a2b8", fontSize: 9, marginTop: 4 }}>
            Rect corners stay axis-aligned — edit via POSITION/SIZE or drag in the canvas.
          </div>
        )}
      </div>
    </div>
  );
}

// POSITION (centroid) + SIZE fields for a rect floor — commits recompute all 4 node
// positions by min/max membership (nodeIds order is never reshuffled: NodeDragger's
// rect-corner constraints depend on it) in ONE batched update = one undo step.
function RectFloorFields({ floor, nodes, onFloorNodesUpdate }: {
  floor:               FloorDef;
  nodes:               WallNode[];
  onFloorNodesUpdate?: (updates: Array<{ nodeId: string; x: number; z: number }>, label?: string) => void;
}) {
  const minX = Math.min(...nodes.map(n => n.x)), maxX = Math.max(...nodes.map(n => n.x));
  const minZ = Math.min(...nodes.map(n => n.z)), maxZ = Math.max(...nodes.map(n => n.z));
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const w  = maxX - minX,       d  = maxZ - minZ;

  const [posStr,  setPosStr]  = useState({ x: String(cx), z: String(cz) });
  const [sizeStr, setSizeStr] = useState({ w: String(w), d: String(d) });
  const { schedule, flush } = useFieldDebounce(300);

  // Re-sync whenever the derived geometry changes (canvas node drags, undo, …).
  useEffect(() => {
    setPosStr({ x: String(cx), z: String(cz) });
    setSizeStr({ w: String(w), d: String(d) });
  }, [floor.id, cx, cz, w, d]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (ncx: number, ncz: number, nw: number, nd: number) => {
    if (!Number.isFinite(ncx) || !Number.isFinite(ncz)) return;
    if (!Number.isFinite(nw) || !Number.isFinite(nd) || nw <= 0 || nd <= 0) return;
    const midX = cx, midZ = cz;
    const updates = nodes.map(n => ({
      nodeId: n.id,
      x: n.x < midX ? ncx - nw / 2 : ncx + nw / 2,
      z: n.z < midZ ? ncz - nd / 2 : ncz + nd / 2,
    }));
    onFloorNodesUpdate?.(updates, "update floor geometry");
  };

  const commitPos  = (axis: "x" | "z", val: string) => {
    const n = parseFloat(val);
    commit(axis === "x" ? n : parseFloat(posStr.x), axis === "z" ? n : parseFloat(posStr.z), parseFloat(sizeStr.w), parseFloat(sizeStr.d));
  };
  const commitSize = (dim: "w" | "d", val: string) => {
    const n = parseFloat(val);
    commit(parseFloat(posStr.x), parseFloat(posStr.z), dim === "w" ? n : parseFloat(sizeStr.w), dim === "d" ? n : parseFloat(sizeStr.d));
  };

  return (
    <>
      <div>
        <div style={LABEL}>POSITION</div>
        <div style={{ display: "flex", gap: 4 }}>
          {([["x", "#ff6b6b"], ["z", "#6b8aff"]] as const).map(([axis, color]) => (
            <div key={axis} style={{ flex: 1, display: "flex", gap: 4, alignItems: "center", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 6px" }}>
              <span style={{ color, fontSize: 9 }}>{axis.toUpperCase()}</span>
              <input type="number" step={0.5} value={posStr[axis]}
                onChange={e => { setPosStr(p => ({ ...p, [axis]: e.target.value })); schedule(() => commitPos(axis, e.target.value)); }}
                onBlur={e => flush(() => commitPos(axis, e.target.value))}
                onKeyDown={e => { if (e.key === "Enter") flush(() => commitPos(axis, (e.target as HTMLInputElement).value)); }}
                style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace" }}
              />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div style={LABEL}>SIZE</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          {([["W", "w"], ["D", "d"]] as const).map(([lbl, dim]) => (
            <div key={dim}>
              <div style={{ ...LABEL, marginBottom: 2 }}>{lbl}</div>
              <input type="number" step={0.5} min={0.5} value={sizeStr[dim]}
                style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                onChange={e => { setSizeStr(p => ({ ...p, [dim]: e.target.value })); schedule(() => commitSize(dim, e.target.value)); }}
                onBlur={e => flush(() => commitSize(dim, e.target.value))}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── FloorVertexRow ────────────────────────────────────────────────────────────

function FloorVertexRow({ index, nodeId, x, z, zoneId, sourceId, linked, readOnly, onCommit, bus }: {
  index:     number;
  nodeId:    string | null;   // null = legacy point (no node, no hover highlight)
  x:         number;
  z:         number;
  zoneId:    string;
  sourceId:  string;          // the selected floor — highlighter skips it
  linked:    boolean;
  readOnly?: boolean;
  onCommit?: (x: number, z: number) => void;
  bus?:      EventBus;
}) {
  const [xStr, setXStr] = useState(String(x));
  const [zStr, setZStr] = useState(String(z));
  const hoveringRef = useRef(false);
  const { schedule, flush } = useFieldDebounce(300);

  useEffect(() => { setXStr(String(x)); setZStr(String(z)); }, [nodeId, x, z]);

  // Clear the canvas highlight if this row unmounts while hovered.
  useEffect(() => () => {
    if (hoveringRef.current) bus?.emit("node:link-hover", { zoneId, nodeId: null });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (xv: string, zv: string) => {
    const nx = parseFloat(xv), nz = parseFloat(zv);
    if (Number.isFinite(nx) && Number.isFinite(nz)) onCommit?.(nx, nz);
  };

  const field = (lbl: string, val: string, setter: (v: string) => void, other: () => string) => (
    <div style={{ flex: 1, display: "flex", gap: 4, alignItems: "center", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 6px", opacity: readOnly ? 0.5 : 1 }}>
      <span style={{ color: lbl === "X" ? "#ff6b6b" : "#6b8aff", fontSize: 9 }}>{lbl}</span>
      <input type="number" step={0.5} value={val} disabled={readOnly}
        onChange={e => { setter(e.target.value); schedule(() => (lbl === "X" ? commit(e.target.value, other()) : commit(other(), e.target.value))); }}
        onBlur={e => flush(() => (lbl === "X" ? commit(e.target.value, other()) : commit(other(), e.target.value)))}
        onKeyDown={e => { if (e.key === "Enter") flush(() => { const v = (e.target as HTMLInputElement).value; if (lbl === "X") commit(v, other()); else commit(other(), v); }); }}
        style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace" }}
      />
    </div>
  );

  return (
    <div
      style={{ background: "rgba(20,30,45,0.6)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 4, padding: "6px 8px", marginBottom: 4 }}
      onMouseEnter={nodeId ? () => { hoveringRef.current = true;  bus?.emit("node:link-hover", { zoneId, nodeId, sourceId }); } : undefined}
      onMouseLeave={nodeId ? () => { hoveringRef.current = false; bus?.emit("node:link-hover", { zoneId, nodeId: null }); } : undefined}
    >
      <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
        <span style={{ color: "#8b94a8", fontSize: 9, letterSpacing: 1 }}>V{index}</span>
        {linked && <span style={{ color: "#4d8cff", fontSize: 8, letterSpacing: 1, marginLeft: 6 }}>LINKED</span>}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {field("X", xStr, setXStr, () => zStr)}
        {field("Z", zStr, setZStr, () => xStr)}
      </div>
    </div>
  );
}

// ── WallGeoView ───────────────────────────────────────────────────────────────

function WallGeoView({ selected, onObjectUpdate }: { selected: SelectedObjectPayload; onObjectUpdate: (c: Partial<WorldObject>) => void }) {
  const wallData = selected.data as WallDef | null;
  const [height,    setHeight]    = useState(String(wallData?.height    ?? 3));
  const [thickness, setThickness] = useState(String(wallData?.thickness ?? 0.2));
  const [floorLvl,  setFloorLvl]  = useState(wallData?.floor ?? 0);
  const [posStr,    setPosStr]    = useState({
    x: String(selected.wallRunCenter?.x ?? 0),
    y: String(selected.position.y ?? 0),
    z: String(selected.wallRunCenter?.z ?? 0),
  });
  const [rotYStr,   setRotYStr]   = useState(String(selected.wallRunAngleDeg ?? 0));
  const { schedule, flush } = useFieldDebounce(300);

  useEffect(() => {
    setHeight(String(wallData?.height ?? 3));
    setThickness(String(wallData?.thickness ?? 0.2));
    setFloorLvl(wallData?.floor ?? 0);
  }, [selected.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Position/rotation are derived from live node positions (walls have no stored
  // transform), so re-sync whenever the run's centroid/angle changes — not just on
  // reselect — to reflect gizmo drags, node drags, or another panel edit.
  useEffect(() => {
    setPosStr({
      x: String(selected.wallRunCenter?.x ?? 0),
      y: String(selected.position.y ?? 0),
      z: String(selected.wallRunCenter?.z ?? 0),
    });
    setRotYStr(String(selected.wallRunAngleDeg ?? 0));
  }, [selected.id, selected.wallRunCenter?.x, selected.wallRunCenter?.z, selected.position.y, selected.wallRunAngleDeg]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (field: "height" | "thickness", val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n <= 0) return;
    onObjectUpdate({ [field]: n } as unknown as Partial<WorldObject>);
  };

  const commitPos = (axis: "x" | "y" | "z", val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n)) return;
    const cur = {
      x: selected.wallRunCenter?.x ?? 0,
      y: selected.position.y ?? 0,
      z: selected.wallRunCenter?.z ?? 0,
    };
    onObjectUpdate({ position: { ...cur, [axis]: n } } as unknown as Partial<WorldObject>);
  };

  const commitRotY = (val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n)) return;
    onObjectUpdate({ rotation: { x: 0, y: n, z: 0 } } as unknown as Partial<WorldObject>);
  };

  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={LABEL}>POSITION</div>
        <div style={{ display: "flex", gap: 4 }}>
          {([["x","#ff6b6b"],["y","#6bff8a"],["z","#6b8aff"]] as const).map(([axis, color]) => (
            <div key={axis} style={{ flex: 1, display: "flex", gap: 4, alignItems: "center", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 6px" }}>
              <span style={{ color, fontSize: 9 }}>{axis.toUpperCase()}</span>
              <input type="number" step={0.5} value={posStr[axis]}
                onChange={e => { setPosStr(p => ({ ...p, [axis]: e.target.value })); schedule(() => commitPos(axis, e.target.value)); }}
                onBlur={e => flush(() => commitPos(axis, e.target.value))}
                onKeyDown={e => { if (e.key === "Enter") flush(() => commitPos(axis, (e.target as HTMLInputElement).value)); }}
                style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace" }}
              />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div style={LABEL}>ROTATION Y (deg)</div>
        <div style={{ display: "flex", gap: 4, alignItems: "center", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 6px", width: "fit-content" }}>
          <span style={{ color: "#6bff8a", fontSize: 9 }}>Y</span>
          <input type="number" step={15} value={rotYStr}
            onChange={e => { setRotYStr(e.target.value); schedule(() => commitRotY(e.target.value)); }}
            onBlur={e => flush(() => commitRotY(e.target.value))}
            onKeyDown={e => { if (e.key === "Enter") flush(() => commitRotY((e.target as HTMLInputElement).value)); }}
            style={{ width: 70, minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace" }}
          />
        </div>
      </div>
      <div>
        <div style={LABEL}>HEIGHT</div>
        <input type="number" value={height} step={0.5} min={0.5} style={NUM_INPUT}
          onChange={e => { setHeight(e.target.value); schedule(() => commit("height", e.target.value)); }}
          onBlur={e => flush(() => commit("height", e.target.value))}
        />
      </div>
      <div>
        <div style={LABEL}>THICKNESS</div>
        <input type="number" value={thickness} step={0.1} min={0.1} style={NUM_INPUT}
          onChange={e => { setThickness(e.target.value); schedule(() => commit("thickness", e.target.value)); }}
          onBlur={e => flush(() => commit("thickness", e.target.value))}
        />
      </div>
      <div>
        <div style={LABEL}>FLOOR LEVEL</div>
        <LevelStepper value={floorLvl} onChange={n => {
          setFloorLvl(n);
          onObjectUpdate({ floor: n } as unknown as Partial<WorldObject>);
        }} />
      </div>
    </div>
  );
}

// ── PlatformGeoView ───────────────────────────────────────────────────────────

// ── MoverSection (Phase 31) ───────────────────────────────────────────────────
// Shared MOTION block for platform / shape / object views. Always commits the
// COMPLETE mover object (updateObject/updatePlatform/updateShape shallow-merge
// nested fields wholesale — same hazard as ShapeDef.mesh). Movers run only in
// preview/game; the editor shows the rest pose.

const MOVER_DEFAULTS: Required<MoverDef> = {
  enabled: true, kind: "slide", axis: "y",
  distance: 2, duration: 2, dwell: 0, mode: "loop", phase: 0,
  speed: 45, autoStart: true,
};

const MOVER_SEG_BTN = (active: boolean): React.CSSProperties => ({
  flex: 1, padding: "4px 0", borderRadius: 4,
  cursor: active ? "default" : "pointer",
  fontFamily: "monospace", fontSize: 10, border: "none",
  background: active ? "rgba(80,140,255,0.18)" : "rgba(46,46,46,0.6)",
  color: active ? "#80aaff" : "#9a9a9a",
  outline: active ? "1px solid rgba(80,140,255,0.4)" : "1px solid rgba(255,255,255,0.06)",
});

function MoverSection({ entityId, mover, onCommit }: {
  entityId: string;
  mover: MoverDef | undefined;
  onCommit: (m: MoverDef) => void;
}) {
  const cur: Required<MoverDef> = { ...MOVER_DEFAULTS, ...mover };
  const enabled = mover?.enabled ?? false;
  const [distStr,  setDistStr]  = useState(String(cur.distance));
  const [durStr,   setDurStr]   = useState(String(cur.duration));
  const [dwellStr, setDwellStr] = useState(String(cur.dwell));
  const [phaseStr, setPhaseStr] = useState(String(cur.phase));
  const [speedStr, setSpeedStr] = useState(String(cur.speed));
  const { schedule, flush } = useFieldDebounce(300);

  useEffect(() => {
    const c = { ...MOVER_DEFAULTS, ...mover };
    setDistStr(String(c.distance)); setDurStr(String(c.duration));
    setDwellStr(String(c.dwell));   setPhaseStr(String(c.phase));
    setSpeedStr(String(c.speed));
  }, [entityId]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (changes: Partial<MoverDef>) => onCommit({ ...cur, ...changes });
  const commitNum = (field: "distance" | "duration" | "dwell" | "phase" | "speed", val: string) => {
    const n = parseFloat(val);
    if (Number.isFinite(n)) commit({ [field]: n });
  };
  const numField = (label: string, val: string, setter: (v: string) => void, field: "distance" | "duration" | "dwell" | "phase" | "speed", step: number, min?: number, help?: string) => (
    <div>
      <div style={{ ...LABEL, marginBottom: 2, display: "flex", alignItems: "center", gap: 4 }}>
        {label}{help && <HelpTooltip text={help} />}
      </div>
      <input type="number" step={step} min={min} value={val} style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
        onChange={e => { setter(e.target.value); schedule(() => commitNum(field, e.target.value)); }}
        onBlur={e => flush(() => commitNum(field, e.target.value))}
        onKeyDown={e => { if (e.key === "Enter") flush(() => commitNum(field, (e.target as HTMLInputElement).value)); }}
      />
    </div>
  );

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={enabled} onChange={e => commit({ enabled: e.target.checked })} style={{ accentColor: "#4d8cff", cursor: "pointer" }} />
        <span style={{ color: enabled ? "#9ab" : "#8b94a8", fontSize: 10, letterSpacing: 1 }}>MOTION</span>
      </label>
      {enabled && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 22, borderLeft: "1px solid rgba(255,255,255,0.06)", marginLeft: 6 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ ...LABEL, marginBottom: 2 }}>KIND</div>
              <div style={{ display: "flex", gap: 4 }}>
                {([["slide", "Slide"], ["spin", "Spin"]] as const).map(([k, lbl]) => (
                  <button key={k} disabled={k === cur.kind} onClick={() => commit({ kind: k })} style={MOVER_SEG_BTN(k === cur.kind)}>{lbl}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ ...LABEL, marginBottom: 2 }}>AXIS (local)</div>
              <div style={{ display: "flex", gap: 4 }}>
                {(["x", "y", "z"] as const).map(a => (
                  <button key={a} disabled={a === cur.axis} onClick={() => commit({ axis: a })} style={MOVER_SEG_BTN(a === cur.axis)}>{a.toUpperCase()}</button>
                ))}
              </div>
            </div>
          </div>
          {cur.kind === "slide" ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {numField("DISTANCE (m)", distStr, setDistStr, "distance", 0.5)}
                {numField("DURATION (s)", durStr, setDurStr, "duration", 0.5, 0.05)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ ...LABEL, marginBottom: 2 }}>MODE</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {([["loop", "Loop"], ["once", "Once"]] as const).map(([m, lbl]) => (
                      <button key={m} disabled={m === cur.mode} onClick={() => commit({ mode: m })} style={MOVER_SEG_BTN(m === cur.mode)}>{lbl}</button>
                    ))}
                  </div>
                </div>
                {numField("DWELL (s)", dwellStr, setDwellStr, "dwell", 0.25, 0)}
              </div>
              {cur.mode === "loop" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {numField("PHASE (0–1)", phaseStr, setPhaseStr, "phase", 0.1, 0,
                    "Where in the loop this platform starts. 0 = beginning of the cycle, 0.5 = half a cycle behind (starts at the far end). Use it to desync identical movers — e.g. one platform up while another is down. Loop mode only.")}
                </div>
              )}
            </>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {numField("SPEED (deg/s)", speedStr, setSpeedStr, "speed", 15)}
            </div>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={cur.autoStart} onChange={e => commit({ autoStart: e.target.checked })} style={{ accentColor: "#4d8cff", cursor: "pointer" }} />
            <span style={{ color: "#9a9a9a", fontSize: 10 }}>Auto-start (off = wait for script)</span>
          </label>
          <div style={{ color: "#98a2b8", fontSize: 9 }}>Runs in preview/game only · editor shows the rest pose</div>
        </div>
      )}
    </div>
  );
}

function PlatformGeoView({ selected, onObjectUpdate }: { selected: SelectedObjectPayload; onObjectUpdate: (c: Partial<WorldObject>) => void }) {
  const plat = selected.data as PlatformDef | null;
  const [posStr,   setPosStr]   = useState({ x: String(plat?.position.x ?? 0), y: String(plat?.position.y ?? 0), z: String(plat?.position.z ?? 0) });
  const [rotYStr,  setRotYStr]  = useState(String(plat?.rotation?.y ?? 0));
  const [sizeStr,  setSizeStr]  = useState({ w: String(plat?.size.width ?? 2), d: String(plat?.size.depth ?? 2) });
  const [thickStr, setThickStr] = useState(String(plat?.thickness ?? 0.3));
  const [railH,    setRailH]    = useState(String(plat?.railingHeight ?? 1.0));
  const [hasRail,  setHasRail]  = useState(plat?.hasRailing ?? false);
  const [floorLvl, setFloorLvl] = useState(plat?.floorLevel ?? 0);
  const [ghost,    setGhost]    = useState(plat?.editorGhost ?? false);
  const { schedule, flush } = useFieldDebounce(300);

  // Value deps (not just selected.id): undo/gizmo commits refresh selected.data
  // under the same id, and the drafts must follow (RectFloorFields precedent).
  useEffect(() => {
    setPosStr({ x: String(plat?.position.x ?? 0), y: String(plat?.position.y ?? 0), z: String(plat?.position.z ?? 0) });
    setRotYStr(String(plat?.rotation?.y ?? 0));
    setSizeStr({ w: String(plat?.size.width ?? 2), d: String(plat?.size.depth ?? 2) });
    setThickStr(String(plat?.thickness ?? 0.3));
    setRailH(String(plat?.railingHeight ?? 1.0));
    setHasRail(plat?.hasRailing ?? false);
    setFloorLvl(plat?.floorLevel ?? 0);
    setGhost(plat?.editorGhost ?? false);
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    selected.id, plat?.position.x, plat?.position.y, plat?.position.z, plat?.rotation?.y,
    plat?.size.width, plat?.size.depth, plat?.thickness, plat?.railingHeight,
    plat?.hasRailing, plat?.floorLevel, plat?.editorGhost,
  ]);

  const commitPos   = (axis: "x" | "y" | "z", val: string) => { const n = parseFloat(val); if (!Number.isFinite(n)) return; onObjectUpdate({ position: { ...(plat?.position ?? { x: 0, y: 0, z: 0 }), [axis]: n } } as unknown as Partial<WorldObject>); };
  const commitRotY  = (val: string) => { const n = parseFloat(val); if (Number.isFinite(n)) onObjectUpdate({ rotation: { x: 0, y: n, z: 0 } } as unknown as Partial<WorldObject>); };
  const commitSize  = (dim: "width" | "depth", val: string) => { const n = parseFloat(val); if (Number.isFinite(n) && n > 0) onObjectUpdate({ size: { ...(plat?.size ?? { width: 2, depth: 2 }), [dim]: n } } as unknown as Partial<WorldObject>); };
  const commitThick = (val: string) => { const n = parseFloat(val); if (Number.isFinite(n) && n > 0) onObjectUpdate({ thickness: n } as unknown as Partial<WorldObject>); };
  const commitRailH = (val: string) => { const n = parseFloat(val); if (Number.isFinite(n) && n > 0) onObjectUpdate({ railingHeight: n } as unknown as Partial<WorldObject>); };
  const toggleRail  = (checked: boolean) => { setHasRail(checked); onObjectUpdate({ hasRailing: checked } as unknown as Partial<WorldObject>); };
  const toggleGhost = (checked: boolean) => { setGhost(checked); onObjectUpdate({ editorGhost: checked } as unknown as Partial<WorldObject>); };

  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Position */}
      <div>
        <div style={LABEL}>POSITION</div>
        <div style={{ display: "flex", gap: 4 }}>
          {([["x","#ff6b6b"],["y","#6bff8a"],["z","#6b8aff"]] as const).map(([axis, color]) => (
            <div key={axis} style={{ flex: 1, display: "flex", gap: 4, alignItems: "center", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 6px" }}>
              <span style={{ color, fontSize: 9 }}>{axis.toUpperCase()}</span>
              <input type="number" step={0.5} value={posStr[axis]}
                onChange={e => { setPosStr(p => ({ ...p, [axis]: e.target.value })); schedule(() => commitPos(axis, e.target.value)); }}
                onBlur={e => flush(() => commitPos(axis, e.target.value))}
                onKeyDown={e => { if (e.key === "Enter") flush(() => commitPos(axis, (e.target as HTMLInputElement).value)); }}
                style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace" }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Rotation Y */}
      <div>
        <div style={LABEL}>ROTATION Y (deg)</div>
        <div style={{ display: "flex", gap: 4, alignItems: "center", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 6px", width: "fit-content" }}>
          <span style={{ color: "#6bff8a", fontSize: 9 }}>Y</span>
          <input type="number" step={15} value={rotYStr}
            onChange={e => { setRotYStr(e.target.value); schedule(() => commitRotY(e.target.value)); }}
            onBlur={e => flush(() => commitRotY(e.target.value))}
            onKeyDown={e => { if (e.key === "Enter") flush(() => commitRotY((e.target as HTMLInputElement).value)); }}
            style={{ width: 70, minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace" }}
          />
        </div>
      </div>

      {/* Size */}
      <div>
        <div style={LABEL}>SIZE</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          {([["W","width",sizeStr.w,(v: string) => setSizeStr(p => ({ ...p, w: v })),"width"],
             ["D","depth", sizeStr.d,(v: string) => setSizeStr(p => ({ ...p, d: v })),"depth"]] as const).map(([lbl,,val,setter,dim]) => (
            <div key={dim}>
              <div style={{ ...LABEL, marginBottom: 2 }}>{lbl}</div>
              <input type="number" step={0.5} min={0.5} value={val}
                style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                onChange={e => { setter(e.target.value); schedule(() => commitSize(dim as "width" | "depth", e.target.value)); }}
                onBlur={e => flush(() => commitSize(dim as "width" | "depth", e.target.value))}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Thickness */}
      <div>
        <div style={LABEL}>THICKNESS</div>
        <input type="number" step={0.05} min={0.05} value={thickStr} style={{ ...NUM_INPUT, width: 90 }}
          onChange={e => { setThickStr(e.target.value); schedule(() => commitThick(e.target.value)); }}
          onBlur={e => flush(() => commitThick(e.target.value))}
        />
      </div>

      {/* Railing */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={hasRail} onChange={e => toggleRail(e.target.checked)} style={{ accentColor: "#4d8cff", cursor: "pointer" }} />
          <span style={{ color: "#8b94a8", fontSize: 10, letterSpacing: 1 }}>RAILING</span>
        </label>
        {hasRail && (
          <div>
            <div style={{ ...LABEL, marginBottom: 2 }}>RAILING HEIGHT</div>
            <input type="number" step={0.1} min={0.3} value={railH} style={{ ...NUM_INPUT, width: 90 }}
              onChange={e => { setRailH(e.target.value); schedule(() => commitRailH(e.target.value)); }}
              onBlur={e => flush(() => commitRailH(e.target.value))}
            />
          </div>
        )}
      </div>

      {/* Floor level */}
      <div>
        <div style={LABEL}>FLOOR LEVEL</div>
        <LevelStepper value={floorLvl} onChange={n => {
          setFloorLvl(n);
          onObjectUpdate({ floorLevel: n } as unknown as Partial<WorldObject>);
        }} />
      </div>

      {/* Editor ghost (Phase 38 — see-through ceilings) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={ghost} onChange={e => toggleGhost(e.target.checked)} style={{ accentColor: "#4d8cff", cursor: "pointer" }} />
          <span style={{ color: "#8b94a8", fontSize: 10, letterSpacing: 1 }}>GHOST IN EDITOR</span>
        </label>
        <span style={{ color: "#98a2b8", fontSize: 9, paddingLeft: 21 }}>
          See-through & click-through while editing (for ceilings) — solid in preview / game
        </span>
      </div>

      <div style={{ marginTop: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={plat?.startHidden ?? false}
            onChange={e => onObjectUpdate({ startHidden: e.target.checked || undefined } as unknown as Partial<WorldObject>)}
            style={{ accentColor: "#4d8cff", cursor: "pointer" }}
          />
          <span style={{ color: "#8b94a8", fontSize: 10, letterSpacing: 1 }}>START HIDDEN</span>
        </label>
        <span style={{ color: "#98a2b8", fontSize: 9, paddingLeft: 21 }}>
          Despawned at preview/game start — reveal with spawn_object (secret bridges)
        </span>
      </div>

      {/* Motion (Phase 31) — polygon platforms bake world-space geometry and can't animate */}
      {plat && !plat.points?.length && (
        <MoverSection entityId={selected.id} mover={plat.mover}
          onCommit={m => onObjectUpdate({ mover: m } as unknown as Partial<WorldObject>)} />
      )}
    </div>
  );
}

// ── ShapeGeoView ──────────────────────────────────────────────────────────────

// Per-kind param fields for parametric shapes. Field values resolve through
// resolveShapeParams so a sparse def shows its effective (defaulted) numbers.
const SHAPE_PARAM_FIELDS: Record<ShapeDef["kind"], Array<{ key: keyof ShapeDef; label: string; step: number; min?: number; max?: number; int?: boolean }>> = {
  cylinder: [
    { key: "radiusBottom",   label: "RADIUS BOTTOM", step: 0.25, min: 0.05 },
    { key: "radiusTop",      label: "RADIUS TOP",    step: 0.25, min: 0 },
    { key: "height",         label: "HEIGHT",        step: 0.5,  min: 0.05 },
    { key: "radialSegments", label: "SEGMENTS",      step: 1,    min: 3, max: 64, int: true },
  ],
  wedge: [
    { key: "width",      label: "WIDTH",       step: 0.5,  min: 0.05 },
    { key: "depth",      label: "DEPTH",       step: 0.5,  min: 0.05 },
    { key: "heightLow",  label: "HEIGHT LOW",  step: 0.25, min: 0 },
    { key: "heightHigh", label: "HEIGHT HIGH", step: 0.25, min: 0.05 },
  ],
  box: [
    { key: "width",  label: "WIDTH",   step: 0.5,  min: 0.05 },
    { key: "depth",  label: "DEPTH",   step: 0.5,  min: 0.05 },
    { key: "height", label: "HEIGHT",  step: 0.5,  min: 0.05 },
    { key: "taperX", label: "TAPER X", step: 0.1,  min: 0.01 },
    { key: "taperZ", label: "TAPER Z", step: 0.1,  min: 0.01 },
    { key: "shearX", label: "SHEAR X", step: 0.25 },
    { key: "shearZ", label: "SHEAR Z", step: 0.25 },
  ],
};

function ShapeGeoView({ selected, onObjectUpdate, bus, activeTool, materialList }: { selected: SelectedObjectPayload; onObjectUpdate: (c: Partial<WorldObject>) => void; bus?: EventBus; activeTool?: ToolId; materialList?: MaterialDef[] }) {
  const shape  = selected.data as ShapeDef | null;
  const brush  = !!shape && isBrush(shape);
  const faceBrush = !!shape?.mesh?.faces?.length;
  const fields = SHAPE_PARAM_FIELDS[shape?.kind ?? "box"];
  const resolved = shape ? resolveShapeParams(shape) : null;
  const [resizeOn, setResizeOn] = useState(false);

  // Resize handles are per-selection editor state.
  useEffect(() => {
    setResizeOn(false);
  }, [selected.id]);

  const toggleResize = (on: boolean) => { setResizeOn(on); bus?.emit("shape:resize-toggle", { enabled: on }); };
  const convertToBrush = () => {
    if (!shape) return;
    const pts = ShapeBuilder.localHullPoints(shape);
    const cloud: Vec3[] = [];
    for (let i = 0; i < pts.length; i += 3) {
      cloud.push({ x: +pts[i]!.toFixed(3), y: +pts[i + 1]!.toFixed(3), z: +pts[i + 2]!.toFixed(3) });
    }
    // Phase 23: bake explicit face loops (seeded so cap/side materials keep looking
    // the same). Degenerate hull → fall back to the plain convex cloud.
    const faced = facesFromCloud(cloud, {
      sideMaterial: shape.sideMaterial,
      sideMaterialOverrides: shape.sideMaterialOverrides,
    });
    onObjectUpdate({ mesh: faced ?? { vertices: cloud } } as unknown as Partial<WorldObject>);
  };
  const revertToParams = () => onObjectUpdate({ mesh: undefined } as unknown as Partial<WorldObject>);

  const paramStrs = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const f of fields) out[f.key] = String((resolved as unknown as Record<string, number>)?.[f.key] ?? 0);
    return out;
  };
  const [posStr,   setPosStr]   = useState({ x: String(shape?.position.x ?? 0), y: String(shape?.position.y ?? 0), z: String(shape?.position.z ?? 0) });
  const [rotStr,   setRotStr]   = useState({ x: String(shape?.rotation.x ?? 0), y: String(shape?.rotation.y ?? 0), z: String(shape?.rotation.z ?? 0) });
  const [params,   setParams]   = useState<Record<string, string>>(paramStrs);
  const [floorLvl, setFloorLvl] = useState(shape?.floorLevel ?? 0);
  const { schedule, flush } = useFieldDebounce(300);

  useEffect(() => {
    setPosStr({ x: String(shape?.position.x ?? 0), y: String(shape?.position.y ?? 0), z: String(shape?.position.z ?? 0) });
    setRotStr({ x: String(shape?.rotation.x ?? 0), y: String(shape?.rotation.y ?? 0), z: String(shape?.rotation.z ?? 0) });
    setParams(paramStrs());
    setFloorLvl(shape?.floorLevel ?? 0);
  }, [selected.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Gizmo commits re-emit object:selected with the same id — re-sync transform fields by value.
  useEffect(() => {
    setPosStr({ x: String(shape?.position.x ?? 0), y: String(shape?.position.y ?? 0), z: String(shape?.position.z ?? 0) });
  }, [shape?.position.x, shape?.position.y, shape?.position.z]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setRotStr({ x: String(shape?.rotation.x ?? 0), y: String(shape?.rotation.y ?? 0), z: String(shape?.rotation.z ?? 0) });
  }, [shape?.rotation.x, shape?.rotation.y, shape?.rotation.z]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitPos = (axis: "x" | "y" | "z", val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n)) return;
    onObjectUpdate({ position: { ...(shape?.position ?? { x: 0, y: 0, z: 0 }), [axis]: n } } as unknown as Partial<WorldObject>);
  };
  const commitRot = (axis: "x" | "y" | "z", val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n)) return;
    onObjectUpdate({ rotation: { ...(shape?.rotation ?? { x: 0, y: 0, z: 0 }), [axis]: n } } as unknown as Partial<WorldObject>);
  };
  const commitParam = (f: (typeof fields)[number], val: string) => {
    let n = parseFloat(val);
    if (!Number.isFinite(n)) return;
    if (f.int) n = Math.round(n);
    if (f.min !== undefined) n = Math.max(f.min, n);
    if (f.max !== undefined) n = Math.min(f.max, n);
    onObjectUpdate({ [f.key]: n } as unknown as Partial<WorldObject>);
  };

  if (!shape) return null;

  // Sub-object modes (Phase 23): face/vertex lists replace the param view.
  if (faceBrush && activeTool === "select-face") {
    return <FacesList selected={selected} shape={shape} bus={bus} materialList={materialList ?? []} onObjectUpdate={onObjectUpdate} />;
  }
  if (faceBrush && activeTool === "select-vertex") {
    return <VerticesList selected={selected} shape={shape} bus={bus} onObjectUpdate={onObjectUpdate} />;
  }
  if (faceBrush && activeTool === "select-edge") {
    return <EdgesList selected={selected} shape={shape} bus={bus} onObjectUpdate={onObjectUpdate} />;
  }

  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      {(["position", "rotation"] as const).map(group => (
        <div key={group}>
          <div style={LABEL}>{group === "position" ? "POSITION" : "ROTATION (deg)"}</div>
          <div style={{ display: "flex", gap: 4 }}>
            {([["x", "#ff6b6b"], ["y", "#6bff8a"], ["z", "#6b8aff"]] as const).map(([axis, color]) => {
              const strs   = group === "position" ? posStr : rotStr;
              const setter = group === "position" ? setPosStr : setRotStr;
              const commit = group === "position" ? commitPos : commitRot;
              return (
                <div key={axis} style={{ flex: 1, display: "flex", gap: 4, alignItems: "center", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 6px" }}>
                  <span style={{ color, fontSize: 9 }}>{axis.toUpperCase()}</span>
                  <input type="number" step={group === "position" ? 0.5 : 15} value={strs[axis]}
                    onChange={e => { setter(p => ({ ...p, [axis]: e.target.value })); schedule(() => commit(axis, e.target.value)); }}
                    onBlur={e => flush(() => commit(axis, e.target.value))}
                    onKeyDown={e => { if (e.key === "Enter") flush(() => commit(axis, (e.target as HTMLInputElement).value)); }}
                    style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace" }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {!brush && (
        <div>
          <div style={LABEL}>{shape.kind.toUpperCase()} PARAMS</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {fields.map(f => (
              <div key={f.key}>
                <div style={{ ...LABEL, marginBottom: 2 }}>{f.label}</div>
                <input type="number" step={f.step} min={f.min} max={f.max} value={params[f.key] ?? ""}
                  style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                  onChange={e => { const v = e.target.value; setParams(p => ({ ...p, [f.key]: v })); schedule(() => commitParam(f, v)); }}
                  onBlur={e => flush(() => commitParam(f, e.target.value))}
                  onKeyDown={e => { if (e.key === "Enter") flush(() => commitParam(f, (e.target as HTMLInputElement).value)); }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {!brush && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={resizeOn} onChange={e => toggleResize(e.target.checked)} style={{ accentColor: "#4d8cff", cursor: "pointer" }} />
          <span style={{ color: "#8b94a8", fontSize: 10, letterSpacing: 1 }}>RESIZE HANDLES</span>
        </label>
      )}

      <div>
        <div style={LABEL}>BRUSH</div>
        {!brush ? (
          <>
            <button style={SHAPE_ACTION_BTN} onClick={convertToBrush}>Convert to Brush</button>
            <div style={{ color: "#98a2b8", fontSize: 9, marginTop: 4, lineHeight: 1.4 }}>
              Bakes the {shape.kind}'s corners into an editable convex solid. Params above
              stop applying; drag corners instead.
            </div>
          </>
        ) : (
          <>
            <div style={{ color: "#c0c0c0", fontSize: 11, fontFamily: "monospace", marginBottom: 6 }}>
              {shape.mesh!.vertices.length} corners
            </div>
            <button style={SHAPE_ACTION_BTN} onClick={revertToParams}>Revert to {shape.kind} params</button>
            <div style={{ color: "#98a2b8", fontSize: 9, marginTop: 4, lineHeight: 1.4 }}>
              Drag a corner sphere to reshape (Alt = no snap). Right-click a corner to
              delete it. The solid always stays convex.
            </div>
          </>
        )}
      </div>

      <div>
        <div style={LABEL}>FLOOR LEVEL</div>
        <LevelStepper value={floorLvl} onChange={n => {
          setFloorLvl(n);
          onObjectUpdate({ floorLevel: n } as unknown as Partial<WorldObject>);
        }} />
      </div>

      <div>
        <div style={LABEL}>VISIBILITY</div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={shape?.startHidden ?? false}
            onChange={e => onObjectUpdate({ startHidden: e.target.checked || undefined } as unknown as Partial<WorldObject>)}
          />
          <span style={{ fontSize: 10, color: "#9090a0" }}>Start hidden — reveal with spawn_object</span>
        </label>
      </div>

      {/* Motion (Phase 31) */}
      {shape && (
        <MoverSection entityId={selected.id} mover={shape.mover}
          onCommit={m => onObjectUpdate({ mover: m } as unknown as Partial<WorldObject>)} />
      )}
    </div>
  );
}

const SHAPE_ACTION_BTN: React.CSSProperties = {
  width: "100%", padding: "7px 0", borderRadius: 5,
  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(46,46,46,0.9)",
  color: "#c0c0c0", fontSize: 11, fontFamily: "monospace", cursor: "pointer",
};

// Topology-op buttons (shared by ShapeFaceOps + EdgesList).
const OP_BTN: React.CSSProperties = {
  flex: 1, padding: "5px 0", borderRadius: 4, fontSize: 10, fontFamily: "monospace",
  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(46,46,46,0.9)",
  color: "#c0c0c0", cursor: "pointer",
};
const OP_BTN_OFF: React.CSSProperties = { ...OP_BTN, color: "#505060", cursor: "default" };

// ── Brush FACES list (face mode, Phase 23) ────────────────────────────────────
// Rows hover-highlight the face in the canvas (shape:face-hover) and click-select
// it (shape:sub-select → SelectionManager re-emits with faceIndex). The selected
// face's row expands: corners, inline material + tile (WallSegmentRow idiom).
// Split/Extrude buttons land with the topology ops milestone.

function shapeFacesUpdate(shape: ShapeDef, faceIndex: number, patch: Partial<BrushFace>): { mesh: ShapeBrushMesh } {
  const faces = shape.mesh!.faces!.map((f, i) => i === faceIndex ? { ...f, verts: [...f.verts], ...patch } : f);
  return { mesh: { ...shape.mesh!, faces } };
}

function FacesList({ selected, shape, bus, materialList, onObjectUpdate }: {
  selected: SelectedObjectPayload; shape: ShapeDef; bus?: EventBus;
  materialList: MaterialDef[]; onObjectUpdate: (c: Partial<WorldObject>) => void;
}) {
  const faces = shape.mesh!.faces!;
  const sel = selected.faceIndex ?? null;
  const { schedule, flush } = useFieldDebounce(300);
  const [tileStr, setTileStr] = useState("");
  useEffect(() => {
    const f = sel !== null ? faces[sel] : undefined;
    setTileStr(String(f?.materialOverrides?.tileScale ?? ""));
  }, [sel, selected.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const hover = (i: number | null) => bus?.emit("shape:face-hover", { zoneId: selected.zoneId, shapeId: selected.id, faceIndex: i });
  const pick  = (i: number) => bus?.emit("shape:sub-select", { zoneId: selected.zoneId, shapeId: selected.id, faceIndex: i, vertexIndex: null });
  const commitMat = (i: number, id: string) =>
    onObjectUpdate(shapeFacesUpdate(shape, i, { material: id === "__inherit__" ? undefined : id, materialOverrides: undefined }) as unknown as Partial<WorldObject>);
  const commitTile = (i: number, val: string) => {
    const n = parseFloat(val);
    const f = faces[i]!;
    const ovr = Number.isFinite(n) && n > 0 ? { ...(f.materialOverrides ?? {}), tileScale: n } : undefined;
    onObjectUpdate(shapeFacesUpdate(shape, i, { materialOverrides: ovr }) as unknown as Partial<WorldObject>);
  };

  return (
    <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}
         onMouseLeave={() => hover(null)}>
      <div style={LABEL}>FACES — click a row or a face in the canvas</div>
      {faces.map((f, i) => {
        const isSel = i === sel;
        const matLabel = f.material ? getMaterialLabel(f.material, materialList) : "inherit";
        return (
          <div key={i}
            onMouseEnter={() => hover(i)}
            style={{
              border: isSel ? "1px solid rgba(80,140,255,0.5)" : "1px solid rgba(255,255,255,0.07)",
              borderRadius: 5, background: isSel ? "rgba(80,140,255,0.08)" : "rgba(40,40,40,0.6)",
            }}>
            <button onClick={() => pick(i)}
              style={{ width: "100%", display: "flex", justifyContent: "space-between", padding: "6px 8px", background: "none", border: "none", cursor: "pointer" }}>
              <span style={{ color: isSel ? "#80aaff" : "#c0c0c0", fontSize: 11, fontFamily: "monospace" }}>FACE {i + 1}</span>
              <span style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace" }}>{f.verts.length} corners · {matLabel}</span>
            </button>
            {isSel && (
              <div style={{ padding: "4px 8px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ color: "#98a2b8", fontSize: 9, fontFamily: "monospace" }}>corners: {f.verts.join(", ")}</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <select value={f.material ?? "__inherit__"} onChange={e => commitMat(i, e.target.value)}
                    style={{ flex: 1, background: "rgba(46,46,46,0.9)", color: "#c0c0c0", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, fontSize: 10, fontFamily: "monospace", padding: "3px 4px" }}>
                    <option value="__inherit__">(shape material)</option>
                    {materialList.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                  <span style={{ ...LABEL, marginBottom: 0 }}>TILE</span>
                  <input type="number" step={0.5} min={0.1} value={tileStr} placeholder="—"
                    style={{ ...NUM_INPUT, width: 52, padding: "2px 4px", fontSize: 10 }}
                    onChange={e => { setTileStr(e.target.value); schedule(() => commitTile(i, e.target.value)); }}
                    onBlur={e => flush(() => commitTile(i, e.target.value))}
                  />
                </div>
                <ShapeFaceOps selected={selected} shape={shape} faceIndex={i} onObjectUpdate={onObjectUpdate} />
              </div>
            )}
          </div>
        );
      })}
      <div style={{ color: "#98a2b8", fontSize: 9, lineHeight: 1.4 }}>
        Drag the gizmo on the selected face to move it. Press 1/3 for object/vertex modes.
      </div>
    </div>
  );
}

// Split H/V (quads only) + Extrude — the Phase 23 topology ops. Each op is a pure
// brushOps call committed through onObjectUpdate (one undoable transaction). The
// selected faceIndex stays on the primary child / the moved cap by construction.
function ShapeFaceOps({ selected, shape, faceIndex, onObjectUpdate }: {
  selected: SelectedObjectPayload; shape: ShapeDef; faceIndex: number;
  onObjectUpdate: (c: Partial<WorldObject>) => void;
}) {
  void selected;
  const face = shape.mesh!.faces![faceIndex];
  if (!face) return null;
  const isQuad = face.verts.length === 4;

  // Label which pair cuts "horizontally": pair 0 cuts mid(v0v1)→mid(v2v3). Local
  // direction is used (yaw rotation doesn't change |y|; labels are cosmetic).
  const verts = shape.mesh!.vertices;
  let pair0IsH = true;
  if (isQuad) {
    const [a, b, c, d] = face.verts as [number, number, number, number];
    const m1 = verts[a]!, m2 = verts[b]!, m3 = verts[c]!, m4 = verts[d]!;
    const dir = {
      x: (m3.x + m4.x) / 2 - (m1.x + m2.x) / 2,
      y: (m3.y + m4.y) / 2 - (m1.y + m2.y) / 2,
      z: (m3.z + m4.z) / 2 - (m1.z + m2.z) / 2,
    };
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    pair0IsH = Math.abs(dir.y / len) < 0.7;
  }

  const run = (result: { vertices: Vec3[]; faces: BrushFace[] } | null) => {
    if (!result) return;   // validateMesh aborted — warning already logged
    onObjectUpdate({ mesh: result } as unknown as Partial<WorldObject>);
  };
  const split = (pair: 0 | 1) => run(splitFaceQuad(shape.mesh!, faceIndex, pair));
  const extrude = () => run(extrudeFace(shape.mesh!, faceIndex, 0.25));
  const recess  = () => run(extrudeFace(shape.mesh!, faceIndex, -0.25));
  const inset   = () => run(insetFace(shape.mesh!, faceIndex, 0.25));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 4 }}>
        <button style={isQuad ? OP_BTN : OP_BTN_OFF} disabled={!isQuad}
          onClick={() => split(pair0IsH ? 0 : 1)} title="Split between the horizontal-ish edge pair">
          SPLIT ─
        </button>
        <button style={isQuad ? OP_BTN : OP_BTN_OFF} disabled={!isQuad}
          onClick={() => split(pair0IsH ? 1 : 0)} title="Split between the vertical-ish edge pair">
          SPLIT │
        </button>
        <button style={OP_BTN} onClick={inset}
          title="Inset this face 0.25m — border ring + inner face, ready to extrude or recess">
          INSET
        </button>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <button style={OP_BTN} onClick={extrude} title="Extrude this face 0.25m outward along its normal">
          EXTRUDE
        </button>
        <button style={OP_BTN} onClick={recess}
          title="Extrude this face 0.25m inward — carve a recess (inset first for a window/pit)">
          RECESS
        </button>
      </div>
      {!isQuad && (
        <div style={{ color: "#98a2b8", fontSize: 9 }}>Split works on 4-corner faces only.</div>
      )}
    </div>
  );
}

// ── Per-face materials (Materials screen, Phase 23) ─────────────────────────
// "The materials list should have every face": one row per face with an inline
// material picker + tile scale. Row hover highlights the face in the canvas.

function FaceMaterialsView({ selected, shape, materialList, onObjectUpdate, bus }: {
  selected: SelectedObjectPayload; shape: ShapeDef;
  materialList: MaterialDef[]; onObjectUpdate: (c: Partial<WorldObject>) => void;
  bus?: EventBus;
}) {
  const faces = shape.mesh!.faces!;
  const { schedule, flush } = useFieldDebounce(300);
  const [tiles, setTiles] = useState<Record<number, string>>({});
  useEffect(() => {
    const t: Record<number, string> = {};
    faces.forEach((f, i) => { t[i] = String(f.materialOverrides?.tileScale ?? ""); });
    setTiles(t);
  }, [selected.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sel = selected.faceIndex ?? null;
  const hover = (i: number | null) => bus?.emit("shape:face-hover", { zoneId: selected.zoneId, shapeId: selected.id, faceIndex: i });
  const pick  = (i: number) => bus?.emit("shape:sub-select", { zoneId: selected.zoneId, shapeId: selected.id, faceIndex: i, vertexIndex: null });
  const commitMat = (i: number, id: string) =>
    onObjectUpdate(shapeFacesUpdate(shape, i, { material: id === "__inherit__" ? undefined : id, materialOverrides: undefined }) as unknown as Partial<WorldObject>);
  const commitTile = (i: number, val: string) => {
    const n = parseFloat(val);
    const f = faces[i]!;
    const ovr = Number.isFinite(n) && n > 0 ? { ...(f.materialOverrides ?? {}), tileScale: n } : undefined;
    onObjectUpdate(shapeFacesUpdate(shape, i, { materialOverrides: ovr }) as unknown as Partial<WorldObject>);
  };

  return (
    <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={LABEL}>PER-FACE MATERIALS</div>
      <div style={{ color: "#98a2b8", fontSize: 9, marginBottom: 2 }}>
        Shape material: <span style={{ color: "#909090" }}>{getMaterialLabel(shape.material, materialList)}</span> (faces set to "(shape material)" inherit it)
        {sel !== null && <> · selected: <span style={{ color: "#80aaff" }}>FACE {sel + 1}</span></>}
      </div>
      <div onMouseLeave={() => hover(null)} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {faces.map((f, i) => (
          <FaceMaterialRow
            key={i} index={i} face={f} materialList={materialList}
            isSel={i === sel}
            onHover={() => hover(i)}
            onPick={() => pick(i)}
            tile={tiles[i] ?? ""} setTile={v => setTiles(p => ({ ...p, [i]: v }))}
            onMat={id => commitMat(i, id)}
            onTile={(v, immediate) => immediate ? flush(() => commitTile(i, v)) : schedule(() => commitTile(i, v))}
          />
        ))}
      </div>
    </div>
  );
}

function FaceMaterialRow({ index, face, materialList, isSel, onHover, onPick, tile, setTile, onMat, onTile }: {
  index: number; face: BrushFace; materialList: MaterialDef[];
  isSel: boolean; onHover: () => void; onPick: () => void;
  tile: string; setTile: (v: string) => void;
  onMat: (id: string) => void; onTile: (v: string, immediate: boolean) => void;
}) {
  return (
    <div
      onMouseEnter={onHover}
      style={{
        border: isSel ? "1px solid rgba(80,140,255,0.5)" : "1px solid rgba(255,255,255,0.07)",
        borderRadius: 5,
        background: isSel ? "rgba(80,140,255,0.08)" : "rgba(40,40,40,0.6)",
        padding: "6px 8px", display: "flex", gap: 6, alignItems: "center",
      }}
    >
      <button onClick={onPick} title="Select this face"
        style={{ color: isSel ? "#80aaff" : "#c0c0c0", fontSize: 10, fontFamily: "monospace", width: 52, flexShrink: 0, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
        FACE {index + 1}
      </button>
      <select value={face.material ?? "__inherit__"} onChange={e => onMat(e.target.value)}
        style={{ flex: 1, minWidth: 0, background: "rgba(46,46,46,0.9)", color: "#c0c0c0", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, fontSize: 10, fontFamily: "monospace", padding: "3px 4px" }}>
        <option value="__inherit__">(shape material)</option>
        {materialList.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
      <span style={{ ...LABEL, marginBottom: 0 }}>TILE</span>
      <input type="number" step={0.5} min={0.1} value={tile} placeholder="—"
        style={{ ...NUM_INPUT, width: 48, padding: "2px 4px", fontSize: 10 }}
        onChange={e => { setTile(e.target.value); onTile(e.target.value, false); }}
        onBlur={e => onTile(e.target.value, true)}
      />
    </div>
  );
}

// ── Brush VERTICES list (vertex mode, Phase 23) ──────────────────────────────

function VerticesList({ selected, shape, bus, onObjectUpdate }: {
  selected: SelectedObjectPayload; shape: ShapeDef; bus?: EventBus;
  onObjectUpdate: (c: Partial<WorldObject>) => void;
}) {
  const verts = shape.mesh!.vertices;
  const sel = selected.vertexIndex ?? null;
  const { schedule, flush } = useFieldDebounce(300);
  const [xyz, setXyz] = useState({ x: "", y: "", z: "" });
  useEffect(() => {
    const v = sel !== null ? verts[sel] : undefined;
    setXyz({ x: String(v?.x ?? ""), y: String(v?.y ?? ""), z: String(v?.z ?? "") });
  }, [sel, selected.id, verts[sel ?? -1]?.x, verts[sel ?? -1]?.y, verts[sel ?? -1]?.z]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (i: number) => bus?.emit("shape:sub-select", { zoneId: selected.zoneId, shapeId: selected.id, faceIndex: null, vertexIndex: i });
  const commitAxis = (axis: "x" | "y" | "z", val: string) => {
    if (sel === null) return;
    const n = parseFloat(val);
    if (!Number.isFinite(n)) return;
    const vertices = verts.map((v, i) => i === sel ? { ...v, [axis]: n } : v);
    onObjectUpdate({ mesh: { ...shape.mesh!, vertices } } as unknown as Partial<WorldObject>);
  };

  return (
    <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={LABEL}>CORNERS — click a row or a sphere in the canvas</div>
      {verts.map((v, i) => {
        const isSel = i === sel;
        return (
          <div key={i} style={{
            border: isSel ? "1px solid rgba(0,255,255,0.4)" : "1px solid rgba(255,255,255,0.07)",
            borderRadius: 5, background: isSel ? "rgba(0,255,255,0.06)" : "rgba(40,40,40,0.6)",
          }}>
            <button onClick={() => pick(i)}
              style={{ width: "100%", display: "flex", justifyContent: "space-between", padding: "5px 8px", background: "none", border: "none", cursor: "pointer" }}>
              <span style={{ color: isSel ? "#7ff" : "#c0c0c0", fontSize: 11, fontFamily: "monospace" }}>V{i + 1}</span>
              <span style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace" }}>({v.x}, {v.y}, {v.z})</span>
            </button>
            {isSel && (
              <div style={{ display: "flex", gap: 4, padding: "2px 8px 8px" }}>
                {(["x", "y", "z"] as const).map(axis => (
                  <div key={axis} style={{ flex: 1, display: "flex", gap: 4, alignItems: "center", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 6px" }}>
                    <span style={{ color: axis === "x" ? "#ff6b6b" : axis === "y" ? "#6bff8a" : "#6b8aff", fontSize: 9 }}>{axis.toUpperCase()}</span>
                    <input type="number" step={0.25} value={xyz[axis]}
                      onChange={e => { const val = e.target.value; setXyz(p => ({ ...p, [axis]: val })); schedule(() => commitAxis(axis, val)); }}
                      onBlur={e => flush(() => commitAxis(axis, e.target.value))}
                      style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace" }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Brush EDGES view (edge mode, Phase 39) ───────────────────────────────────
// Edges have no stored identity (an edge IS its vertex-index pair, from
// selected.edgeVerts), so this is a single card for the current selection, not a
// list. SPLIT EDGE commits through the same run/onObjectUpdate idiom as
// ShapeFaceOps, then re-emits shape:sub-select with the surviving sub-edge —
// without that the SelectionManager liveness clamp drops the selection (the old
// pair is no longer traversed once the midpoint is spliced in).

function EdgesList({ selected, shape, bus, onObjectUpdate }: {
  selected: SelectedObjectPayload; shape: ShapeDef; bus?: EventBus;
  onObjectUpdate: (c: Partial<WorldObject>) => void;
}) {
  const verts = shape.mesh!.vertices;
  const edge = selected.edgeVerts ?? null;
  const a = edge ? verts[edge[0]] : undefined;
  const b = edge ? verts[edge[1]] : undefined;

  const doSplit = () => {
    if (!edge) return;
    const r = splitEdge(shape.mesh!, edge);
    if (!r) return;   // validateMesh aborted — warning already logged
    onObjectUpdate({ mesh: r.mesh } as unknown as Partial<WorldObject>);
    bus?.emit("shape:sub-select", {
      zoneId: selected.zoneId, shapeId: selected.id,
      faceIndex: null, vertexIndex: null,
      edge: [Math.min(edge[0], r.mid), Math.max(edge[0], r.mid)] as [number, number],
    });
  };

  return (
    <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={LABEL}>EDGE — click a brush face near an edge</div>
      {!edge || !a || !b ? (
        <div style={{ color: "#98a2b8", fontSize: 10, lineHeight: 1.5 }}>
          Click near a brush edge in the canvas to select it.
        </div>
      ) : (
        <div style={{ border: "1px solid rgba(80,160,255,0.5)", borderRadius: 5, background: "rgba(80,160,255,0.06)", padding: "6px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ color: "#80aaff", fontSize: 11, fontFamily: "monospace" }}>
            EDGE V{edge[0] + 1} – V{edge[1] + 1}
          </span>
          <div style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace" }}>
            ({a.x}, {a.y}, {a.z}) → ({b.x}, {b.y}, {b.z})
          </div>
          <button style={OP_BTN} onClick={doSplit}
            title="Insert a vertex at this edge's midpoint (both adjacent faces gain a corner)">
            SPLIT EDGE
          </button>
        </div>
      )}
      <div style={{ color: "#98a2b8", fontSize: 9, lineHeight: 1.4 }}>
        Drag the gizmo to move the edge. Press 1/2/3 for object/face/vertex modes.
      </div>
    </div>
  );
}

// ── StairGeoView ──────────────────────────────────────────────────────────────

function StairGeoView({ selected, onObjectUpdate }: { selected: SelectedObjectPayload; onObjectUpdate: (c: Partial<WorldObject>) => void }) {
  const stair = selected.data as StairDef | null;

  const [startStr, setStartStr] = useState({ x: String(stair?.start.x ?? 0), y: String(stair?.start.y ?? 0), z: String(stair?.start.z ?? 0) });
  const [endStr,   setEndStr]   = useState({ x: String(stair?.end.x ?? 0),   y: String(stair?.end.y ?? 0),   z: String(stair?.end.z ?? 0)   });
  const [widthStr,    setWidthStr]    = useState(String(stair?.width ?? 2.5));
  const [stepsStr,    setStepsStr]    = useState(String(stair ? effectiveSteps(stair) : 1));
  const initDims = stair ? stairDims(stair.start, stair.end) : { height: 0, length: 0, rotation: 0 };
  const [heightStr, setHeightStr] = useState(String(initDims.height));
  const [lengthStr, setLengthStr] = useState(String(initDims.length));
  const [rotStr,    setRotStr]    = useState(String(initDims.rotation));
  const [hasRailing,  setHasRailing]  = useState(stair?.hasRailing ?? false);
  const [railTopRail,   setRailTopRail]   = useState(stair?.railing?.topRail   ?? true);
  const [railPostsIn,   setRailPostsIn]   = useState(stair?.railing?.balustersInner ?? stair?.railing?.balusters ?? true);
  const [railPostsOut,  setRailPostsOut]  = useState(stair?.railing?.balustersOuter ?? stair?.railing?.balusters ?? true);
  const [railPerimeter, setRailPerimeter] = useState(stair?.railing?.landingPerimeter ?? false);
  const [railTop4, setRailTop4] = useState(() => {
    const per = stair?.railing?.landingPerimeter ?? false;
    const tl  = stair?.railing?.topLanding;
    return { sideArrive: tl?.sideArrive ?? per, far: tl?.far ?? per, sideExit: tl?.sideExit ?? per, close: tl?.close ?? false };
  });
  const [railHeight,    setRailHeight]    = useState(String(stair?.railing?.height        ?? 0.9));
  const [railInterval,  setRailInterval]  = useState(String(stair?.railing?.stepInterval  ?? 1));
  const [railBarT,      setRailBarT]      = useState(String(stair?.railing?.barThickness  ?? 0.1));
  const [railPostT,     setRailPostT]     = useState(String(stair?.railing?.postThickness ?? 0.06));
  const [railSideInset, setRailSideInset] = useState(String(stair?.railing?.sideInset     ?? 0.1));
  const [railOverhang,  setRailOverhang]  = useState(String(stair?.railing?.overhang      ?? 0.15));
  const [undersideMode, setUndersideMode] = useState<StairUndersideMode>(stair?.underside?.mode ?? "open");
  const [undersideThk,  setUndersideThk]  = useState(String(stair?.underside?.thickness ?? 0.25));
  const [hasLanding,  setHasLanding]  = useState(!!(stair?.landing));
  const [landDepth,   setLandDepth]   = useState(String(stair?.landing?.depth ?? stair?.width ?? 2.5));
  const [landWidth,   setLandWidth]   = useState(stair?.landing?.width != null ? String(stair.landing.width) : "");
  const [flightsStr,  setFlightsStr]  = useState(String(stair?.flights ?? 1));
  const [turnDir,     setTurnDir]     = useState<StairTurn>(stair?.turn ?? "left");
  const [gapStr,      setGapStr]      = useState(String(stair?.gap ?? 0.2));
  const [linked,      setLinked]      = useState(false);
  const [hasCutter,   setHasCutter]   = useState(!!(stair?.csgCutter));
  const [cutW,  setCutW]  = useState(String(stair?.csgCutter?.width  ?? stair?.width ?? 2.5));
  const [cutD,  setCutD]  = useState(String(stair?.csgCutter?.depth  ?? 1.0));
  const [cutH,  setCutH]  = useState(String(stair?.csgCutter?.height ?? 2.2));
  const [cutOff, setCutOff] = useState({ x: String(stair?.csgCutter?.offset.x ?? 0), y: String(stair?.csgCutter?.offset.y ?? 1.1), z: String(stair?.csgCutter?.offset.z ?? 0) });
  const [cutRot, setCutRot] = useState({ x: String(stair?.csgCutter?.rotation?.x ?? 0), y: String(stair?.csgCutter?.rotation?.y ?? 0), z: String(stair?.csgCutter?.rotation?.z ?? 0) });
  const [cutInnerH, setCutInnerH] = useState(String(stair?.csgCutter?.innerTileH ?? 1));
  const [cutInnerV, setCutInnerV] = useState(String(stair?.csgCutter?.innerTileV ?? 1));

  useEffect(() => {
    if (!stair) return;
    setStartStr({ x: String(stair.start.x), y: String(stair.start.y), z: String(stair.start.z) });
    setEndStr({   x: String(stair.end.x),   y: String(stair.end.y),   z: String(stair.end.z)   });
    setWidthStr(String(stair.width));
    setStepsStr(String(effectiveSteps(stair)));
    { const d = stairDims(stair.start, stair.end); setHeightStr(String(d.height)); setLengthStr(String(d.length)); setRotStr(String(d.rotation)); }
    setHasRailing(stair.hasRailing);
    setRailTopRail(stair.railing?.topRail   ?? true);
    setRailPostsIn(stair.railing?.balustersInner ?? stair.railing?.balusters ?? true);
    setRailPostsOut(stair.railing?.balustersOuter ?? stair.railing?.balusters ?? true);
    setRailPerimeter(stair.railing?.landingPerimeter ?? false);
    {
      const per = stair.railing?.landingPerimeter ?? false;
      const tl  = stair.railing?.topLanding;
      setRailTop4({ sideArrive: tl?.sideArrive ?? per, far: tl?.far ?? per, sideExit: tl?.sideExit ?? per, close: tl?.close ?? false });
    }
    setRailHeight(String(stair.railing?.height        ?? 0.9));
    setRailInterval(String(stair.railing?.stepInterval  ?? 1));
    setRailBarT(String(stair.railing?.barThickness  ?? 0.1));
    setRailPostT(String(stair.railing?.postThickness ?? 0.06));
    setRailSideInset(String(stair.railing?.sideInset ?? 0.1));
    setRailOverhang(String(stair.railing?.overhang ?? 0.15));
    setUndersideMode(stair.underside?.mode ?? "open");
    setUndersideThk(String(stair.underside?.thickness ?? 0.25));
    setHasLanding(!!(stair.landing));
    setLandDepth(String(stair.landing?.depth ?? stair.width));
    setLandWidth(stair.landing?.width != null ? String(stair.landing.width) : "");
    setFlightsStr(String(stair.flights ?? 1));
    setTurnDir(stair.turn ?? "left");
    setGapStr(String(stair.gap ?? 0.2));
    setLinked(false);
    setHasCutter(!!(stair.csgCutter));
    setCutW(String(stair.csgCutter?.width  ?? stair.width));
    setCutD(String(stair.csgCutter?.depth  ?? 1.0));
    setCutH(String(stair.csgCutter?.height ?? 2.2));
    setCutOff({ x: String(stair.csgCutter?.offset.x ?? 0), y: String(stair.csgCutter?.offset.y ?? 1.1), z: String(stair.csgCutter?.offset.z ?? 0) });
    setCutRot({ x: String(stair.csgCutter?.rotation?.x ?? 0), y: String(stair.csgCutter?.rotation?.y ?? 0), z: String(stair.csgCutter?.rotation?.z ?? 0) });
    setCutInnerH(String(stair.csgCutter?.innerTileH ?? 1));
    setCutInnerV(String(stair.csgCutter?.innerTileV ?? 1));
  }, [selected.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!stair) return;
    setStartStr({ x: String(stair.start.x), y: String(stair.start.y), z: String(stair.start.z) });
    setEndStr({ x: String(stair.end.x), y: String(stair.end.y), z: String(stair.end.z) });
    setStepsStr(String(effectiveSteps(stair)));
    const d = stairDims(stair.start, stair.end);
    setHeightStr(String(d.height)); setLengthStr(String(d.length)); setRotStr(String(d.rotation));
  }, [stair?.start.x, stair?.start.y, stair?.start.z, stair?.end.x, stair?.end.y, stair?.end.z, stair?.numSteps]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!stair) return null;

  const { schedule, flush } = useFieldDebounce(300);

  const rise = stair.end.y - stair.start.y;
  const curSteps = effectiveSteps(stair);
  const stepH = rise > 0 ? rise / curSteps : STAIR_STEP_H;

  const commitVec = (field: "start" | "end", axis: "x" | "y" | "z", val: string) => {
    if (field === "end" && axis === "y") {
      const n = parseFloat(val);
      if (!Number.isFinite(n)) return;
      const newEnd = { ...stair.end, y: n };
      if (linked) {
        const newSteps = Math.max(1, Math.round((n - stair.start.y) / STAIR_STEP_H));
        setStepsStr(String(newSteps));
        onObjectUpdate({ end: newEnd, numSteps: newSteps } as unknown as Partial<WorldObject>);
      } else {
        onObjectUpdate({ end: newEnd, numSteps: effectiveSteps(stair) } as unknown as Partial<WorldObject>);
      }
      return;
    }
    const n = parseFloat(val);
    if (!Number.isFinite(n)) return;
    onObjectUpdate({ [field]: { ...stair[field], [axis]: n } } as unknown as Partial<WorldObject>);
  };

  const commitSteps = (val: string) => {
    const n = Math.round(parseFloat(val));
    if (!Number.isFinite(n) || n < 1) return;
    if (linked) {
      const newEndY = stair.start.y + n * STAIR_STEP_H;
      setEndStr(p => ({ ...p, y: String(newEndY) }));
      onObjectUpdate({ numSteps: n, end: { ...stair.end, y: newEndY } } as unknown as Partial<WorldObject>);
    } else {
      onObjectUpdate({ numSteps: n } as unknown as Partial<WorldObject>);
    }
  };

  // Alternate dimension inputs — rewrite `end` from start + height/length/bearing.
  const DEG2RAD = Math.PI / 180;
  const commitHeight = (val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n)) return;
    const newEndY = stair.start.y + n;
    setEndStr(p => ({ ...p, y: String(newEndY) }));
    if (linked) {
      const newSteps = Math.max(1, Math.round(n / STAIR_STEP_H));
      setStepsStr(String(newSteps));
      onObjectUpdate({ end: { ...stair.end, y: newEndY }, numSteps: newSteps } as unknown as Partial<WorldObject>);
    } else {
      onObjectUpdate({ end: { ...stair.end, y: newEndY }, numSteps: effectiveSteps(stair) } as unknown as Partial<WorldObject>);
    }
  };
  const commitLength = (val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n <= 0) return;
    const rot = stairDims(stair.start, stair.end).rotation * DEG2RAD;
    const ex = stair.start.x + n * Math.cos(rot);
    const ez = stair.start.z + n * Math.sin(rot);
    setEndStr(p => ({ ...p, x: String(+ex.toFixed(4)), z: String(+ez.toFixed(4)) }));
    onObjectUpdate({ end: { ...stair.end, x: ex, z: ez } } as unknown as Partial<WorldObject>);
  };
  const commitRotation = (val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n)) return;
    const rot = n * DEG2RAD;
    const len = stairDims(stair.start, stair.end).length;
    const ex = stair.start.x + len * Math.cos(rot);
    const ez = stair.start.z + len * Math.sin(rot);
    setEndStr(p => ({ ...p, x: String(+ex.toFixed(4)), z: String(+ez.toFixed(4)) }));
    onObjectUpdate({ end: { ...stair.end, x: ex, z: ez } } as unknown as Partial<WorldObject>);
  };

  const commitWidth  = (val: string) => { const n = parseFloat(val); if (Number.isFinite(n) && n > 0) onObjectUpdate({ width: n } as unknown as Partial<WorldObject>); };
  const toggleRailing = (checked: boolean) => { setHasRailing(checked); onObjectUpdate({ hasRailing: checked } as unknown as Partial<WorldObject>); };

  const RAIL_DEFAULTS = { topRail: true, balusters: true, balustersInner: true, balustersOuter: true, landingPerimeter: false, height: 0.9, stepInterval: 1, barThickness: 0.1, postThickness: 0.06, sideInset: 0.1, overhang: 0.15 };
  const updateRailing = (patch: Partial<StairRailingDef>) => {
    const cur = { ...RAIL_DEFAULTS, ...(stair.railing ?? {}) };
    onObjectUpdate({ railing: { ...cur, ...patch } } as unknown as Partial<WorldObject>);
  };
  const commitRailHeight = (val: string) => { const n = parseFloat(val); if (Number.isFinite(n) && n > 0) updateRailing({ height: n }); };
  const commitRailInterval = (val: string) => { const n = Math.round(parseFloat(val)); if (Number.isFinite(n) && n >= 1) updateRailing({ stepInterval: n }); };
  const commitRailBarT = (val: string) => { const n = parseFloat(val); if (Number.isFinite(n) && n > 0) updateRailing({ barThickness: n }); };
  const commitRailPostT = (val: string) => { const n = parseFloat(val); if (Number.isFinite(n) && n > 0) updateRailing({ postThickness: n }); };
  const commitRailSideInset = (val: string) => { const n = parseFloat(val); if (Number.isFinite(n) && n >= 0) updateRailing({ sideInset: n }); };
  const commitRailOverhang = (val: string) => { const n = parseFloat(val); if (Number.isFinite(n) && n >= 0) updateRailing({ overhang: n }); };

  const UNDERSIDE_DEFAULTS = { mode: "open" as StairUndersideMode, thickness: 0.25 };
  const updateUnderside = (patch: Partial<typeof UNDERSIDE_DEFAULTS>) => {
    const cur = { ...UNDERSIDE_DEFAULTS, ...(stair.underside ?? {}) };
    onObjectUpdate({ underside: { ...cur, ...patch } } as unknown as Partial<WorldObject>);
  };
  const commitUndersideThk = (val: string) => { const n = parseFloat(val); if (Number.isFinite(n) && n > 0) updateUnderside({ thickness: n }); };

  // ── Landing & flights (Phase 29) ────────────────────────────────────────────
  // A landing at the top of every flight; flights > 1 = switchback stairwell.
  // Flights require a landing: enabling flights auto-adds one, removing the
  // landing resets flights to 1 (single update → single undo step).
  const curLanding = () => stair.landing ?? { depth: stair.width };
  const toggleLanding = (checked: boolean) => {
    setHasLanding(checked);
    if (checked) {
      const d = parseFloat(landDepth) > 0 ? parseFloat(landDepth) : stair.width;
      setLandDepth(String(d));
      const w = parseFloat(landWidth);
      onObjectUpdate({ landing: { depth: d, ...(Number.isFinite(w) && w > 0 ? { width: w } : {}) } } as unknown as Partial<WorldObject>);
    } else {
      setFlightsStr("1");
      onObjectUpdate({ landing: undefined, flights: 1 } as unknown as Partial<WorldObject>);
    }
  };
  const commitLandDepth = (val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n <= 0 || !stair.landing) return;
    onObjectUpdate({ landing: { ...curLanding(), depth: n } } as unknown as Partial<WorldObject>);
  };
  const commitLandWidth = (val: string) => {
    if (!stair.landing) return;
    const n = parseFloat(val);
    const { width: _omit, ...rest } = curLanding();
    onObjectUpdate({
      landing: Number.isFinite(n) && n > 0 ? { ...rest, width: n } : rest,
    } as unknown as Partial<WorldObject>);
  };
  const commitFlights = (val: string) => {
    const n = Math.round(parseFloat(val));
    if (!Number.isFinite(n) || n < 1) return;
    const patch: Record<string, unknown> = { flights: n };
    if (n > 1 && !stair.landing) {
      setHasLanding(true);
      const d = parseFloat(landDepth) > 0 ? parseFloat(landDepth) : stair.width;
      setLandDepth(String(d));
      patch.landing = { depth: d };
    }
    onObjectUpdate(patch as unknown as Partial<WorldObject>);
  };
  const commitTurn = (t: StairTurn) => { setTurnDir(t); onObjectUpdate({ turn: t } as unknown as Partial<WorldObject>); };
  const commitGap = (val: string) => { const n = parseFloat(val); if (Number.isFinite(n) && n >= 0) onObjectUpdate({ gap: n } as unknown as Partial<WorldObject>); };

  const commitCutter = (field: "width" | "depth" | "height", val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n <= 0) return;
    const cur = stair.csgCutter;
    if (!cur) return;
    onObjectUpdate({ csgCutter: { ...cur, [field]: n } } as unknown as Partial<WorldObject>);
  };
  const commitCutterOffset = (axis: "x" | "y" | "z", val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n)) return;
    const cur = stair.csgCutter;
    if (!cur) return;
    onObjectUpdate({ csgCutter: { ...cur, offset: { ...cur.offset, [axis]: n } } } as unknown as Partial<WorldObject>);
  };
  const commitCutterRotation = (axis: "x" | "y" | "z", val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n)) return;
    const cur = stair.csgCutter;
    if (!cur) return;
    onObjectUpdate({ csgCutter: { ...cur, rotation: { ...(cur.rotation ?? { x: 0, y: 0, z: 0 }), [axis]: n } } } as unknown as Partial<WorldObject>);
  };
  const commitCutterInnerTile = (field: "innerTileH" | "innerTileV", val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n <= 0) return;
    const cur = stair.csgCutter;
    if (!cur) return;
    onObjectUpdate({ csgCutter: { ...cur, [field]: n } } as unknown as Partial<WorldObject>);
  };
  const toggleCutter = (checked: boolean) => {
    setHasCutter(checked);
    if (checked) {
      const w = parseFloat(cutW) || stair.width;
      const d = parseFloat(cutD) || 1.0;
      const h = parseFloat(cutH) || 2.2;
      const ox = parseFloat(cutOff.x) || 0;
      const oy = parseFloat(cutOff.y) || h / 2;
      const oz = parseFloat(cutOff.z) || 0;
      const angle = Math.atan2(stair.end.z - stair.start.z, stair.end.x - stair.start.x);
      const defRotY = -(90 + angle * (180 / Math.PI));
      const rx = parseFloat(cutRot.x) || 0;
      const ry = parseFloat(cutRot.y) || defRotY;
      const rz = parseFloat(cutRot.z) || 0;
      setCutRot({ x: String(rx), y: String(Number(defRotY.toFixed(2))), z: String(rz) });
      const ih = parseFloat(cutInnerH) || 1;
      const iv = parseFloat(cutInnerV) || 1;
      onObjectUpdate({ csgCutter: { offset: { x: ox, y: oy, z: oz }, width: w, depth: d, height: h, rotation: { x: rx, y: ry, z: rz }, innerTileH: ih, innerTileV: iv } } as unknown as Partial<WorldObject>);
    } else {
      onObjectUpdate({ csgCutter: undefined } as unknown as Partial<WorldObject>);
    }
  };

  const vecRow = (
    label: string,
    field: "start" | "end",
    vals: { x: string; y: string; z: string },
    setter: React.Dispatch<React.SetStateAction<{ x: string; y: string; z: string }>>,
  ) => (
    <div>
      <div style={LABEL}>{label}</div>
      <div style={{ display: "flex", gap: 4 }}>
        {(["x","y","z"] as const).map((axis, i) => (
          <div key={axis} style={{ flex: 1, display: "flex", gap: 4, alignItems: "center", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 6px" }}>
            <span style={{ color: ["#ff6b6b","#6bff8a","#6b8aff"][i], fontSize: 9 }}>{axis.toUpperCase()}</span>
            <input type="number" step={0.5} value={vals[axis]}
              onChange={e => { setter(p => ({ ...p, [axis]: e.target.value })); schedule(() => commitVec(field, axis, e.target.value)); }}
              onBlur={e => flush(() => commitVec(field, axis, e.target.value))}
              onKeyDown={e => { if (e.key === "Enter") flush(() => commitVec(field, axis, (e.target as HTMLInputElement).value)); }}
              style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace" }}
            />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      {vecRow("START", "start", startStr, setStartStr)}
      {vecRow("END",   "end",   endStr,   setEndStr)}

      {/* Alternate dimension inputs — drive END from start + height/length/bearing */}
      <div>
        <div style={LABEL}>HEIGHT · LENGTH · ROTATION°</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
          {([
            ["H", heightStr, setHeightStr, commitHeight, 0.1] as const,
            ["L", lengthStr, setLengthStr, commitLength, 0.5] as const,
            ["R", rotStr,    setRotStr,    commitRotation, 5] as const,
          ]).map(([lbl, val, setter, commit, step]) => (
            <div key={lbl} style={{ display: "flex", gap: 4, alignItems: "center", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 6px" }}>
              <span style={{ color: "#8a8a8a", fontSize: 9 }}>{lbl}</span>
              <input type="number" step={step} value={val}
                onChange={e => { setter(e.target.value); schedule(() => commit(e.target.value)); }}
                onBlur={e => flush(() => commit(e.target.value))}
                onKeyDown={e => { if (e.key === "Enter") flush(() => commit((e.target as HTMLInputElement).value)); }}
                style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace" }}
              />
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <div style={LABEL}>STEPS</div>
          <input type="number" step={1} min={1} value={stepsStr}
            onChange={e => { setStepsStr(e.target.value); schedule(() => commitSteps(e.target.value)); }}
            onBlur={e => flush(() => commitSteps(e.target.value))}
            onKeyDown={e => { if (e.key === "Enter") flush(() => commitSteps((e.target as HTMLInputElement).value)); }}
            style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
          />
        </div>
        <div>
          <div style={LABEL}>WIDTH</div>
          <input type="number" step={0.5} min={0.5} value={widthStr}
            onChange={e => { setWidthStr(e.target.value); schedule(() => commitWidth(e.target.value)); }}
            onBlur={e => flush(() => commitWidth(e.target.value))}
            onKeyDown={e => { if (e.key === "Enter") flush(() => commitWidth((e.target as HTMLInputElement).value)); }}
            style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
          />
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={linked} onChange={e => setLinked(e.target.checked)} style={{ accentColor: "#4d8cff", cursor: "pointer", flexShrink: 0 }} />
        <span style={{ color: linked ? "#80aaff" : "#646464", fontSize: 10, userSelect: "none" }}>Link end-Y to step count</span>
      </label>

      <div style={{ color: "#98a2b8", fontSize: 9 }}>
        Rise: {rise.toFixed(2)} m · Step H: {stepH.toFixed(3)} m
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={hasRailing} onChange={e => toggleRailing(e.target.checked)} style={{ accentColor: "#4d8cff", cursor: "pointer" }} />
          <span style={{ color: hasRailing ? "#9ab" : "#8b94a8", fontSize: 10, letterSpacing: 1 }}>RAILING</span>
        </label>
        {hasRailing && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 22, borderLeft: "1px solid rgba(255,255,255,0.06)", marginLeft: 6 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={railTopRail} onChange={e => { setRailTopRail(e.target.checked); updateRailing({ topRail: e.target.checked }); }} style={{ accentColor: "#4d8cff", cursor: "pointer" }} />
              <span style={{ color: "#9a9a9a", fontSize: 10 }}>Top rail</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={railPostsIn} onChange={e => { setRailPostsIn(e.target.checked); updateRailing({ balustersInner: e.target.checked }); }} style={{ accentColor: "#4d8cff", cursor: "pointer" }} />
              <span style={{ color: "#9a9a9a", fontSize: 10 }}>Inner balusters</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={railPostsOut} onChange={e => { setRailPostsOut(e.target.checked); updateRailing({ balustersOuter: e.target.checked }); }} style={{ accentColor: "#4d8cff", cursor: "pointer" }} />
              <span style={{ color: "#9a9a9a", fontSize: 10 }}>Outer balusters</span>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ ...LABEL, marginBottom: 2 }}>HEIGHT</div>
                <input type="number" step={0.1} min={0.1} value={railHeight} style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                  onChange={e => { setRailHeight(e.target.value); schedule(() => commitRailHeight(e.target.value)); }}
                  onBlur={e => flush(() => commitRailHeight(e.target.value))}
                  onKeyDown={e => { if (e.key === "Enter") flush(() => commitRailHeight((e.target as HTMLInputElement).value)); }}
                />
              </div>
              <div>
                <div style={{ ...LABEL, marginBottom: 2 }}>POST EVERY N STEPS</div>
                <input type="number" step={1} min={1} value={railInterval} style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                  onChange={e => { setRailInterval(e.target.value); schedule(() => commitRailInterval(e.target.value)); }}
                  onBlur={e => flush(() => commitRailInterval(e.target.value))}
                  onKeyDown={e => { if (e.key === "Enter") flush(() => commitRailInterval((e.target as HTMLInputElement).value)); }}
                />
              </div>
              <div>
                <div style={{ ...LABEL, marginBottom: 2 }}>RAIL THICKNESS</div>
                <input type="number" step={0.02} min={0.02} value={railBarT} style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                  onChange={e => { setRailBarT(e.target.value); schedule(() => commitRailBarT(e.target.value)); }}
                  onBlur={e => flush(() => commitRailBarT(e.target.value))}
                  onKeyDown={e => { if (e.key === "Enter") flush(() => commitRailBarT((e.target as HTMLInputElement).value)); }}
                />
              </div>
              <div>
                <div style={{ ...LABEL, marginBottom: 2 }}>POST THICKNESS</div>
                <input type="number" step={0.02} min={0.02} value={railPostT} style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                  onChange={e => { setRailPostT(e.target.value); schedule(() => commitRailPostT(e.target.value)); }}
                  onBlur={e => flush(() => commitRailPostT(e.target.value))}
                  onKeyDown={e => { if (e.key === "Enter") flush(() => commitRailPostT((e.target as HTMLInputElement).value)); }}
                />
              </div>
              <div>
                <div style={{ ...LABEL, marginBottom: 2 }}>SIDE INSET</div>
                <input type="number" step={0.02} min={0} value={railSideInset} style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                  onChange={e => { setRailSideInset(e.target.value); schedule(() => commitRailSideInset(e.target.value)); }}
                  onBlur={e => flush(() => commitRailSideInset(e.target.value))}
                  onKeyDown={e => { if (e.key === "Enter") flush(() => commitRailSideInset((e.target as HTMLInputElement).value)); }}
                />
              </div>
              <div>
                <div style={{ ...LABEL, marginBottom: 2 }}>RAIL OVERHANG</div>
                <input type="number" step={0.05} min={0} value={railOverhang} style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                  onChange={e => { setRailOverhang(e.target.value); schedule(() => commitRailOverhang(e.target.value)); }}
                  onBlur={e => flush(() => commitRailOverhang(e.target.value))}
                  onKeyDown={e => { if (e.key === "Enter") flush(() => commitRailOverhang((e.target as HTMLInputElement).value)); }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Underside / stringer */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ color: "#8b94a8", fontSize: 10, letterSpacing: 1 }}>UNDERSIDE</div>
        <div style={{ display: "flex", gap: 4 }}>
          {([["open","Open"],["diagonal","Diagonal"],["closed","To floor"]] as const).map(([m, lbl]) => {
            const isCurrent = m === undersideMode;
            return (
              <button key={m} disabled={isCurrent}
                onClick={() => { setUndersideMode(m); updateUnderside({ mode: m }); }}
                style={{
                  flex: 1, padding: "5px 0", borderRadius: 4,
                  cursor: isCurrent ? "default" : "pointer",
                  fontFamily: "monospace", fontSize: 10, border: "none",
                  background: isCurrent ? "rgba(80,140,255,0.18)" : "rgba(46,46,46,0.6)",
                  color: isCurrent ? "#80aaff" : "#9a9a9a",
                  outline: isCurrent ? "1px solid rgba(80,140,255,0.4)" : "1px solid rgba(255,255,255,0.06)",
                }}
              >{lbl}</button>
            );
          })}
        </div>
        {undersideMode === "diagonal" && (
          <div>
            <div style={{ ...LABEL, marginBottom: 2 }}>STRINGER THICKNESS</div>
            <input type="number" step={0.05} min={0.05} value={undersideThk} style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
              onChange={e => { setUndersideThk(e.target.value); schedule(() => commitUndersideThk(e.target.value)); }}
              onBlur={e => flush(() => commitUndersideThk(e.target.value))}
              onKeyDown={e => { if (e.key === "Enter") flush(() => commitUndersideThk((e.target as HTMLInputElement).value)); }}
            />
          </div>
        )}
      </div>

      {/* Landing & flights */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={hasLanding} onChange={e => toggleLanding(e.target.checked)} style={{ accentColor: "#4d8cff", cursor: "pointer" }} />
          <span style={{ color: hasLanding ? "#9ab" : "#8b94a8", fontSize: 10, letterSpacing: 1 }}>LANDING &amp; FLIGHTS</span>
        </label>
        {hasLanding && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 22, borderLeft: "1px solid rgba(255,255,255,0.06)", marginLeft: 6 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ ...LABEL, marginBottom: 2 }}>LANDING DEPTH</div>
                <input type="number" step={0.5} min={0.5} value={landDepth} style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                  onChange={e => { setLandDepth(e.target.value); schedule(() => commitLandDepth(e.target.value)); }}
                  onBlur={e => flush(() => commitLandDepth(e.target.value))}
                  onKeyDown={e => { if (e.key === "Enter") flush(() => commitLandDepth((e.target as HTMLInputElement).value)); }}
                />
              </div>
              {(stair.flights ?? 1) <= 1 ? (
                <div>
                  <div style={{ ...LABEL, marginBottom: 2 }}>LANDING WIDTH</div>
                  <input type="number" step={0.5} min={0} value={landWidth} placeholder="auto" style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                    onChange={e => { setLandWidth(e.target.value); schedule(() => commitLandWidth(e.target.value)); }}
                    onBlur={e => flush(() => commitLandWidth(e.target.value))}
                    onKeyDown={e => { if (e.key === "Enter") flush(() => commitLandWidth((e.target as HTMLInputElement).value)); }}
                  />
                </div>
              ) : (
                <div>
                  <div style={{ ...LABEL, marginBottom: 2 }}>VOID GAP</div>
                  <input type="number" step={0.1} min={0} value={gapStr} style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                    onChange={e => { setGapStr(e.target.value); schedule(() => commitGap(e.target.value)); }}
                    onBlur={e => flush(() => commitGap(e.target.value))}
                    onKeyDown={e => { if (e.key === "Enter") flush(() => commitGap((e.target as HTMLInputElement).value)); }}
                  />
                </div>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ ...LABEL, marginBottom: 2 }}>FLIGHTS</div>
                <input type="number" step={1} min={1} value={flightsStr} style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                  onChange={e => { setFlightsStr(e.target.value); schedule(() => commitFlights(e.target.value)); }}
                  onBlur={e => flush(() => commitFlights(e.target.value))}
                  onKeyDown={e => { if (e.key === "Enter") flush(() => commitFlights((e.target as HTMLInputElement).value)); }}
                />
              </div>
              {(stair.flights ?? 1) > 1 && (
                <div>
                  <div style={{ ...LABEL, marginBottom: 2 }}>TURN</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {([["left","Left"],["right","Right"]] as const).map(([t, lbl]) => {
                      const isCurrent = t === turnDir;
                      return (
                        <button key={t} disabled={isCurrent}
                          onClick={() => commitTurn(t)}
                          style={{
                            flex: 1, padding: "4px 0", borderRadius: 4,
                            cursor: isCurrent ? "default" : "pointer",
                            fontFamily: "monospace", fontSize: 10, border: "none",
                            background: isCurrent ? "rgba(80,140,255,0.18)" : "rgba(46,46,46,0.6)",
                            color: isCurrent ? "#80aaff" : "#9a9a9a",
                            outline: isCurrent ? "1px solid rgba(80,140,255,0.4)" : "1px solid rgba(255,255,255,0.06)",
                          }}
                        >{lbl}</button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            {stair.hasRailing && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={railPerimeter} onChange={e => { setRailPerimeter(e.target.checked); updateRailing({ landingPerimeter: e.target.checked }); }} style={{ accentColor: "#4d8cff", cursor: "pointer" }} />
                <span style={{ color: "#9a9a9a", fontSize: 10 }}>Landing perimeter rail</span>
              </label>
            )}
            {stair.hasRailing && (stair.flights ?? 1) > 1 && (
              <div>
                <div style={{ ...LABEL, marginBottom: 2 }}>TOP LANDING RAILS</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px" }}>
                  {([["sideArrive", "Arrive side"], ["far", "Far"], ["sideExit", "Exit side"], ["close", "Stairwell"]] as const).map(([key, label]) => (
                    <label key={key} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                      <input type="checkbox" checked={railTop4[key]} onChange={e => {
                        const next = { ...railTop4, [key]: e.target.checked };
                        setRailTop4(next);
                        updateRailing({ topLanding: next });
                      }} style={{ accentColor: "#4d8cff", cursor: "pointer" }} />
                      <span style={{ color: "#9a9a9a", fontSize: 10 }}>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {(stair.flights ?? 1) > 1 && (
              <div style={{ color: "#98a2b8", fontSize: 9 }}>
                Steps &amp; rise are per flight · Top Y: {(stair.start.y + (stair.flights ?? 1) * rise).toFixed(2)} m · Total rise: {((stair.flights ?? 1) * rise).toFixed(2)} m
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cut box */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={hasCutter} onChange={e => toggleCutter(e.target.checked)} style={{ accentColor: "#ffdd00", cursor: "pointer" }} />
          <span style={{ color: hasCutter ? "#ffdd77" : "#8b94a8", fontSize: 10, letterSpacing: 1 }}>CUT BOX</span>
        </label>
        {hasCutter && (
          <>
            <div>
              <div style={LABEL}>SIZE (W / D / H)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                {([["W",cutW,setCutW,"width"],["D",cutD,setCutD,"depth"],["H",cutH,setCutH,"height"]] as const).map(([lbl,val,setter,field]) => (
                  <div key={field}>
                    <div style={{ ...LABEL, marginBottom: 2 }}>{lbl}</div>
                    <input type="number" step={0.1} min={0.1} value={val}
                      style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                      onChange={e => { setter(e.target.value); schedule(() => commitCutter(field, e.target.value)); }}
                      onBlur={e => flush(() => commitCutter(field, e.target.value))}
                      onKeyDown={e => { if (e.key === "Enter") flush(() => commitCutter(field, (e.target as HTMLInputElement).value)); }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={LABEL}>OFFSET FROM END</div>
              <div style={{ display: "flex", gap: 4 }}>
                {(["x","y","z"] as const).map((axis, i) => (
                  <div key={axis} style={{ flex: 1, display: "flex", gap: 3, alignItems: "center", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 5px" }}>
                    <span style={{ color: ["#ff6b6b","#6bff8a","#6b8aff"][i], fontSize: 9 }}>{axis.toUpperCase()}</span>
                    <input type="number" step={0.1} value={cutOff[axis]}
                      onChange={e => { setCutOff(p => ({ ...p, [axis]: e.target.value })); schedule(() => commitCutterOffset(axis, e.target.value)); }}
                      onBlur={e => flush(() => commitCutterOffset(axis, e.target.value))}
                      onKeyDown={e => { if (e.key === "Enter") flush(() => commitCutterOffset(axis, (e.target as HTMLInputElement).value)); }}
                      style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace" }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ color: "#98a2b8", fontSize: 9, marginTop: 3 }}>Y offset = half height puts box bottom at stair end</div>
            </div>
            <div>
              <div style={LABEL}>ROTATION (DEG)</div>
              <div style={{ display: "flex", gap: 4 }}>
                {(["x","y","z"] as const).map((axis, i) => (
                  <div key={axis} style={{ flex: 1, display: "flex", gap: 3, alignItems: "center", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 5px" }}>
                    <span style={{ color: ["#ff6b6b","#6bff8a","#6b8aff"][i], fontSize: 9 }}>{axis.toUpperCase()}</span>
                    <input type="number" step={1} value={cutRot[axis]}
                      onChange={e => { setCutRot(p => ({ ...p, [axis]: e.target.value })); schedule(() => commitCutterRotation(axis, e.target.value)); }}
                      onBlur={e => flush(() => commitCutterRotation(axis, e.target.value))}
                      onKeyDown={e => { if (e.key === "Enter") flush(() => commitCutterRotation(axis, (e.target as HTMLInputElement).value)); }}
                      style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace" }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={LABEL}>INNER TILING</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                {([["T+B",cutInnerH,setCutInnerH,"innerTileH"],["L+R",cutInnerV,setCutInnerV,"innerTileV"]] as const).map(([lbl,val,setter,field]) => (
                  <div key={field}>
                    <div style={{ ...LABEL, marginBottom: 2 }}>{lbl}</div>
                    <input type="number" step={0.25} min={0.1} value={val}
                      style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                      onChange={e => { setter(e.target.value); schedule(() => commitCutterInnerTile(field, e.target.value)); }}
                      onBlur={e => flush(() => commitCutterInnerTile(field, e.target.value))}
                      onKeyDown={e => { if (e.key === "Enter") flush(() => commitCutterInnerTile(field, (e.target as HTMLInputElement).value)); }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── ObjectGeoView ─────────────────────────────────────────────────────────────

function ObjectGeoView({ selected, onObjectUpdate }: { selected: SelectedObjectPayload; onObjectUpdate: (c: Partial<WorldObject>) => void }) {
  const objData = selected.data as WorldObject | null;
  const [draft, setDraft] = useState<Draft>({
    position: toStr(selected.position),
    rotation: toStr(selected.rotation),
    scale:    toStr(selected.scale),
  });
  const [floorLvl, setFloorLvl] = useState(objData?.floor ?? 0);
  const isUniform = (v: Vec3): boolean => v.x === v.y && v.y === v.z;
  const [uniformScale, setUniformScale] = useState(() => isUniform((objData ?? selected).scale));
  const { schedule } = useFieldDebounce(150);

  // Value deps (not just selected.id): undo commits refresh selected.data under the
  // same id, and the drafts must follow. Stored record preferred over the payload —
  // it's the refreshed source (rotation is stored in degrees, same units as payload).
  useEffect(() => {
    const src = objData ?? selected;
    setDraft({ position: toStr(src.position), rotation: toStr(src.rotation), scale: toStr(src.scale) });
    setFloorLvl(objData?.floor ?? 0);
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    selected.id,
    objData?.position.x, objData?.position.y, objData?.position.z,
    objData?.rotation.x, objData?.rotation.y, objData?.rotation.z,
    objData?.scale.x, objData?.scale.y, objData?.scale.z,
  ]);

  // Uniform default per selection: on for uniformly-scaled objects, off when the
  // axes already differ (a single field would misrepresent them).
  useEffect(() => {
    setUniformScale(isUniform((objData ?? selected).scale));
  }, [selected.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (group: GroupKey, axis: "x" | "y" | "z", raw: string): void => {
    setDraft(prev => {
      const next: Draft = { ...prev, [group]: { ...prev[group], [axis]: raw } };
      // Incomplete tokens (".", "-", "") stay in the draft without a data write —
      // committing NaN→0 makes the value-resync effect clobber the field mid-keystroke
      // (typing ".5" became "0" then "05").
      if (Number.isFinite(parseFloat(raw))) {
        const g = next[group];
        schedule(() => onObjectUpdate({ [group]: { x: toNum(g.x), y: toNum(g.y), z: toNum(g.z) } } as Partial<WorldObject>));
      }
      return next;
    });
  };

  const commitUniformScale = (raw: string): void => {
    setDraft(prev => {
      const n = parseFloat(raw);
      if (Number.isFinite(n)) schedule(() => onObjectUpdate({ scale: { x: n, y: n, z: n } } as Partial<WorldObject>));
      return { ...prev, scale: { x: raw, y: raw, z: raw } };
    });
  };

  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      {GROUPS.map(({ key, label, step }) => (
        <div key={key} style={key === "scale" ? { marginTop: 8 } : undefined}>
          <div style={{ ...LABEL, marginBottom: 4, display: "flex", gap: 12, alignItems: "center" }}>
            <span>{label}</span>
            {key === "scale" && (
              <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", letterSpacing: 0 }}>
                <input type="checkbox" checked={uniformScale} onChange={e => setUniformScale(e.target.checked)} style={{ margin: 0 }} />
                Uniform scale
              </label>
            )}
          </div>
          {key === "scale" && uniformScale ? (
            <div style={{ width: "calc((100% - 8px) / 3)", display: "flex", gap: 4, alignItems: "center", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 6px" }}>
              <input type="number" value={draft.scale.x} step={step}
                onChange={e => commitUniformScale(e.target.value)}
                style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace" }}
              />
            </div>
          ) : (
            <div style={{ display: "flex", gap: 4 }}>
              {AXES.map(({ axis, color }) => (
                <div key={axis} style={{ flex: 1, display: "flex", gap: 4, alignItems: "center", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 6px" }}>
                  <span style={{ color, fontSize: 9 }}>{axis.toUpperCase()}</span>
                  <input type="number" value={draft[key][axis]} step={step}
                    onChange={e => commit(key, axis, e.target.value)}
                    style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace" }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <div>
        <div style={LABEL}>FLOOR LEVEL</div>
        <LevelStepper value={floorLvl} onChange={n => {
          setFloorLvl(n);
          onObjectUpdate({ floor: n });
        }} />
      </div>
      <div>
        <div style={LABEL}>INTERACTABLE</div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={objData?.properties.interactable ?? false}
            onChange={e => onObjectUpdate({ properties: { ...(objData?.properties ?? { npcSpawn: false, lootTableId: null, triggerEventId: null }), interactable: e.target.checked } } as Partial<WorldObject>)}
          />
          <span style={{ fontSize: 10, color: "#9090a0" }}>Enable</span>
        </label>
        {objData?.properties.interactable && (
          <input
            type="text"
            placeholder="Interact"
            defaultValue={objData.properties.interactLabel ?? ""}
            key={objData.id + "-label"}
            onBlur={e => onObjectUpdate({ properties: { ...objData.properties, interactLabel: e.target.value } } as Partial<WorldObject>)}
            style={{
              width: "100%", boxSizing: "border-box",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4,
              background: "rgba(40,40,40,0.9)", color: "#c0c0c0",
              fontSize: 10, fontFamily: "monospace", padding: "3px 6px", outline: "none",
            }}
          />
        )}
      </div>

      <div>
        <div style={LABEL}>VISIBILITY</div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={objData?.startHidden ?? false}
            onChange={e => onObjectUpdate({ startHidden: e.target.checked || undefined } as Partial<WorldObject>)}
          />
          <span style={{ fontSize: 10, color: "#9090a0" }}>Start hidden — reveal with spawn_object</span>
        </label>
      </div>

      {/* Motion (Phase 31) */}
      {objData && (
        <MoverSection entityId={selected.id} mover={objData.mover}
          onCommit={m => onObjectUpdate({ mover: m })} />
      )}
    </div>
  );
}

// ── CollidersScreen ───────────────────────────────────────────────────────────

const COLLIDER_SHAPES: AttachedColliderShape[] = ["box", "sphere", "capsule", "cylinder", "hull"];

const COLLIDER_BTN = (active = false): React.CSSProperties => ({
  flex: 1, padding: "5px 0", borderRadius: 4, cursor: active ? "default" : "pointer",
  fontFamily: "monospace", fontSize: 10, textTransform: "capitalize",
  border: `1px solid ${active ? "rgba(80,140,255,0.4)" : "rgba(255,255,255,0.1)"}`,
  background: active ? "rgba(80,140,255,0.18)" : "rgba(46,46,46,0.9)",
  color: active ? "#80aaff" : "#909090",
});

/** Re-derive size fields when a collider's shape changes so it stays roughly the same volume. */
function reshapeCollider(c: AttachedCollider, shape: AttachedColliderShape): AttachedCollider {
  if (shape === c.shape) return c;
  // Leaving a hull/trimesh: its size is already the points' AABB, so convert like a box.
  const from = (c.shape === "hull" || c.shape === "trimesh") ? "box" : c.shape;
  const s = c.size;
  let size: Vec3;
  if (shape === "box") {
    size = from === "sphere"
      ? { x: s.x * 2, y: s.x * 2, z: s.x * 2 }        // sphere r → cube 2r
      : from === "capsule" || from === "cylinder"
        ? { x: s.x * 2, y: s.y, z: s.x * 2 }           // capsule/cylinder r,h → box 2r × h × 2r
        : { ...s };                                     // hull AABB → box verbatim
  } else if (shape === "sphere") {
    size = { x: from === "box" ? Math.max(s.x, s.y, s.z) / 2 : s.x, y: 0, z: 0 };
  } else {
    // capsule / cylinder — both are radius + full height
    size = from === "box"
      ? { x: Math.max(s.x, s.z) / 2, y: s.y, z: 0 }    // box → r = max(w,d)/2, h = height
      : from === "sphere"
        ? { x: s.x, y: s.x * 2, z: 0 }                 // sphere → r, h = 2r
        : { x: s.x, y: s.y, z: 0 };                    // capsule ↔ cylinder: same params
  }
  return { ...c, shape, size, points: undefined, indices: undefined };
}

/** Switch a collider to an auto-fit hull: model-space points, offset reset, AABB size for display. */
function hullFromPoints(c: AttachedCollider, points: Vec3[]): AttachedCollider {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  return {
    ...c, shape: "hull", points,
    offset: { x: 0, y: 0, z: 0 },
    size: { x: +(maxX - minX).toFixed(4), y: +(maxY - minY).toFixed(4), z: +(maxZ - minZ).toFixed(4) },
    rotation: undefined,
    rotationY: undefined,
    indices: undefined,
  };
}

function CollidersScreen({ selected, assets, onObjectUpdate, defaultColliderFor, onSaveCollidersToAsset, hullPointsFor, bus }: {
  selected:           SelectedObjectPayload;
  assets:             AssetDef[];
  onObjectUpdate:     (c: Partial<WorldObject>) => void;
  defaultColliderFor?: (objectId: string) => AttachedCollider | null;
  onSaveCollidersToAsset?: (objectId: string, assetId: string, colliders: AttachedCollider[]) => void;
  hullPointsFor?:      (objectId: string) => Vec3[] | null;
  bus?:               EventBus;
}) {
  const objData    = selected.data as WorldObject | null;
  const colliders  = objData?.colliders;
  const assetDef   = assets.find(a => a.id === objData?.assetId);
  const collidable = !!assetDef?.collidable;
  // Asset-preset compound colliders (Phase 26 baked assets) beat the auto box.
  const presetCols = assetDef?.colliders;
  const defCol     = defaultColliderFor?.(selected.id) ?? null;

  // Editor-session toggles (never persisted): hide the object's own move gizmo while
  // placing colliders, give one collider a translate gizmo, hide individual colliders'
  // wireframes/handles so overlapping ones don't fight. All reset when the screen closes.
  const [hideObjGizmo, setHideObjGizmo] = useState(false);
  const [moveId,       setMoveId]       = useState<string | null>(null);
  const [moveMode,     setMoveMode]     = useState<"translate" | "rotate" | "resize">("translate");
  const [hiddenIds,    setHiddenIds]    = useState<Set<string>>(new Set());

  useEffect(() => () => {
    bus?.emit("gizmo:suspend",  { source: "colliders-panel", suspended: false });
    bus?.emit("collider:move",  { objectId: selected.id, colliderId: null });
    bus?.emit("collider:hidden", { objectId: selected.id, hidden: [] });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleObjGizmo = (hide: boolean): void => {
    setHideObjGizmo(hide);
    bus?.emit("gizmo:suspend", { source: "colliders-panel", suspended: hide });
  };
  const toggleMove = (id: string, mode: "translate" | "rotate" | "resize" = "translate"): void => {
    const next = moveId === id && moveMode === mode ? null : id;
    setMoveId(next);
    setMoveMode(mode);
    bus?.emit("collider:move", { objectId: selected.id, colliderId: next, mode });
  };
  const toggleHidden = (id: string): void => {
    const n = new Set(hiddenIds);
    if (n.has(id)) n.delete(id); else n.add(id);
    setHiddenIds(n);
    bus?.emit("collider:hidden", { objectId: selected.id, hidden: [...n] });
    if (n.has(id) && moveId === id) toggleMove(id, moveMode);   // hiding the focused collider drops its gizmo
  };

  // Draft strings so intermediate input ("0.", "-") doesn't get clobbered; resync
  // from data when it changes externally (handle drag) and no field here is focused.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const { schedule } = useFieldDebounce(300);

  const buildDraft = (list: AttachedCollider[]): Record<string, string> => {
    const d: Record<string, string> = {};
    for (const c of list) {
      d[`${c.id}.ox`] = String(c.offset.x); d[`${c.id}.oy`] = String(c.offset.y); d[`${c.id}.oz`] = String(c.offset.z);
      d[`${c.id}.sx`] = String(c.size.x);   d[`${c.id}.sy`] = String(c.size.y);   d[`${c.id}.sz`] = String(c.size.z);
      const rot = c.rotation ?? { x: 0, y: c.rotationY ?? 0, z: 0 };   // legacy yaw-only fallback
      d[`${c.id}.rx`] = String(rot.x); d[`${c.id}.ry`] = String(rot.y); d[`${c.id}.rz`] = String(rot.z);
    }
    return d;
  };

  useEffect(() => {
    if (containerRef.current?.contains(document.activeElement)) return;
    setDraft(buildDraft(colliders ?? []));
  }, [selected.id, colliders]); // eslint-disable-line react-hooks/exhaustive-deps

  const write = (next: AttachedCollider[]): void =>
    onObjectUpdate({ colliders: next } as Partial<WorldObject>);

  const newBox = (): AttachedCollider => ({
    id:       `col_${crypto.randomUUID().slice(0, 8)}`,
    shape:    "box",
    offset:   defCol ? { ...defCol.offset } : { x: 0, y: 0.5, z: 0 },
    size:     defCol ? { ...defCol.size }   : { x: 1, y: 1, z: 1 },
    isSensor: false,
  });

  const updateCollider = (id: string, patch: Partial<AttachedCollider>): void =>
    write((colliders ?? []).map(c => c.id === id ? { ...c, ...patch } : c));

  // Refit a primitive collider to the model's local AABB (the auto-box source):
  // box takes the bounds verbatim, sphere/capsule derive radius/height the same
  // way reshapeCollider does. Axis-aligned fit — rotation resets.
  const refitCollider = (c: AttachedCollider): AttachedCollider => {
    if (!defCol) return c;
    const { offset, size } = defCol;
    const base = { ...c, offset: { ...offset }, rotation: undefined, rotationY: undefined };
    if (c.shape === "sphere")  return { ...base, size: { x: Math.max(size.x, size.y, size.z) / 2, y: 0, z: 0 } };
    if (c.shape === "capsule" || c.shape === "cylinder")
      return { ...base, size: { x: Math.max(size.x, size.z) / 2, y: size.y, z: 0 } };
    return { ...base, size: { ...size } };
  };

  // Numeric field: update draft immediately, debounce the data write.
  const editField = (c: AttachedCollider, key: string, raw: string): void => {
    setDraft(prev => {
      const next = { ...prev, [`${c.id}.${key}`]: raw };
      schedule(() => {
        const g = (k: string, fallback: number): number => {
          const v = next[`${c.id}.${k}`];
          return v !== undefined ? toNum(v) : fallback;
        };
        const rot = c.rotation ?? { x: 0, y: c.rotationY ?? 0, z: 0 };
        updateCollider(c.id, {
          offset: { x: g("ox", c.offset.x), y: g("oy", c.offset.y), z: g("oz", c.offset.z) },
          size:   { x: g("sx", c.size.x),   y: g("sy", c.size.y),   z: g("sz", c.size.z) },
          // Rotation only means anything on box/capsule/cylinder — don't grow other shapes' data.
          ...(c.shape === "box" || c.shape === "capsule" || c.shape === "cylinder"
            ? { rotation: { x: g("rx", rot.x), y: g("ry", rot.y), z: g("rz", rot.z) }, rotationY: undefined }
            : {}),
        });
      });
      return next;
    });
  };

  const numField = (c: AttachedCollider, key: string, label: string, color = "#909090"): React.ReactElement => (
    <div key={key} style={{ flex: 1, display: "flex", gap: 4, alignItems: "center", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 6px" }}>
      <span style={{ color, fontSize: 9, whiteSpace: "nowrap" }}>{label}</span>
      <input
        type="text" inputMode="decimal"
        value={draft[`${c.id}.${key}`] ?? ""}
        onChange={e => editField(c, key, e.target.value)}
        style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace" }}
      />
    </div>
  );

  const INFO: React.CSSProperties = { color: "#98a2b8", fontSize: 10, lineHeight: 1.6 };
  const ACTION_BTN: React.CSSProperties = {
    padding: "6px 10px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 10,
    border: "1px solid rgba(80,140,255,0.3)", background: "rgba(80,140,255,0.12)", color: "#80aaff",
  };

  const objGizmoToggle = (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
      <input type="checkbox" checked={hideObjGizmo} onChange={e => toggleObjGizmo(e.target.checked)} />
      <span style={{ fontSize: 10, color: "#9090a0" }}>Hide object move gizmo while editing colliders</span>
    </label>
  );

  // Implicit state — no explicit array yet.
  if (colliders === undefined) {
    return (
      <div ref={containerRef} style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={LABEL}>COLLISION</div>
        {objGizmoToggle}
        <div style={INFO}>
          {presetCols?.length
            ? `This model has ${presetCols.length} default collider${presetCols.length > 1 ? "s" : ""} (from a bake or a saved custom set) — the player collides with them in preview and game. Customize to edit this copy's set.`
            : collidable
              ? "Auto box collider fitted from the model's bounds — the player collides with it in preview and game. Customize to edit shape, size or offset."
              : "This asset isn't marked collidable, so it has no automatic collider. Add one to make it solid."}
        </div>
        {collidable ? (
          <>
            <button
              style={ACTION_BTN}
              onClick={() => write(presetCols?.length ? presetCols.map(c => ({ ...c, offset: { ...c.offset }, size: { ...c.size } })) : [newBox()])}
            >Customize</button>
            <button style={{ ...ACTION_BTN, borderColor: "rgba(255,107,107,0.3)", background: "rgba(200,60,60,0.1)", color: "#cc7777" }} onClick={() => write([])}>
              Remove collision
            </button>
          </>
        ) : (
          <button style={ACTION_BTN} onClick={() => write([newBox()])}>+ Add collider</button>
        )}
      </div>
    );
  }

  // Explicit list.
  return (
    <div ref={containerRef} style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      {objGizmoToggle}
      {colliders.length === 0 && (
        <div style={INFO}>No colliders — the player walks through this object.</div>
      )}
      {colliders.map(c => (
        <div key={c.id} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, padding: "10px 10px 12px", display: "flex", flexDirection: "column", gap: 8, opacity: hiddenIds.has(c.id) ? 0.55 : 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
            <span style={{ ...LABEL, marginBottom: 0 }}>{c.isSensor ? "SENSOR" : "SOLID"}</span>
            <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <button
                title={hiddenIds.has(c.id) ? "Show in editor" : "Hide in editor (wireframe + handles)"}
                onClick={() => toggleHidden(c.id)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, lineHeight: 1, padding: "0 2px", opacity: hiddenIds.has(c.id) ? 0.35 : 1 }}
              >👁</button>
              <button
                title="Toggle a move gizmo on this collider"
                onClick={() => toggleMove(c.id, "translate")}
                style={{
                  padding: "2px 7px", borderRadius: 3, cursor: "pointer", fontFamily: "monospace", fontSize: 9,
                  border: `1px solid ${moveId === c.id && moveMode === "translate" ? "rgba(80,140,255,0.5)" : "rgba(255,255,255,0.12)"}`,
                  background: moveId === c.id && moveMode === "translate" ? "rgba(80,140,255,0.2)" : "rgba(255,255,255,0.04)",
                  color: moveId === c.id && moveMode === "translate" ? "#80aaff" : "#808080",
                }}
              >Move</button>
              {(c.shape === "box" || c.shape === "capsule" || c.shape === "cylinder") && (
                <button
                  title="Toggle a rotate gizmo on this collider (1° steps, hold Alt for free)"
                  onClick={() => toggleMove(c.id, "rotate")}
                  style={{
                    padding: "2px 7px", borderRadius: 3, cursor: "pointer", fontFamily: "monospace", fontSize: 9,
                    border: `1px solid ${moveId === c.id && moveMode === "rotate" ? "rgba(80,140,255,0.5)" : "rgba(255,255,255,0.12)"}`,
                    background: moveId === c.id && moveMode === "rotate" ? "rgba(80,140,255,0.2)" : "rgba(255,255,255,0.04)",
                    color: moveId === c.id && moveMode === "rotate" ? "#80aaff" : "#808080",
                  }}
                >Rotate</button>
              )}
              {c.shape !== "hull" && c.shape !== "trimesh" && (
                <button
                  title="Toggle resize drag-handles on this collider (0.25m steps, hold Alt for free)"
                  onClick={() => toggleMove(c.id, "resize")}
                  style={{
                    padding: "2px 7px", borderRadius: 3, cursor: "pointer", fontFamily: "monospace", fontSize: 9,
                    border: `1px solid ${moveId === c.id && moveMode === "resize" ? "rgba(80,140,255,0.5)" : "rgba(255,255,255,0.12)"}`,
                    background: moveId === c.id && moveMode === "resize" ? "rgba(80,140,255,0.2)" : "rgba(255,255,255,0.04)",
                    color: moveId === c.id && moveMode === "resize" ? "#80aaff" : "#808080",
                  }}
                >Resize</button>
              )}
              <button
                title="Remove collider"
                onClick={() => {
                  if (moveId === c.id) toggleMove(c.id, moveMode);
                  write(colliders.filter(x => x.id !== c.id));
                }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#885555", fontSize: 12, lineHeight: 1, padding: "0 2px" }}
              >✕</button>
            </span>
          </div>
          {/* Dropdown, not a button row — 5 shapes ("cylinder"!) don't fit the panel's min width. */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ ...LABEL, marginBottom: 0 }}>SHAPE</span>
            <select
              value={c.shape}
              onChange={e => {
                const s = e.target.value as AttachedColliderShape;
                if (s === c.shape) return;
                if (s === "hull") {
                  const pts = hullPointsFor?.(selected.id);
                  if (!pts) { console.warn("hull auto-fit unavailable (mesh not built or degenerate)"); return; }
                  write(colliders.map(x => x.id === c.id ? hullFromPoints(x, pts) : x));
                } else {
                  write(colliders.map(x => x.id === c.id ? reshapeCollider(x, s) : x));
                }
              }}
              style={{
                flex: 1, padding: "4px 6px", borderRadius: 4, cursor: "pointer",
                fontFamily: "monospace", fontSize: 10, textTransform: "capitalize",
                border: "1px solid rgba(255,255,255,0.1)", background: "rgba(46,46,46,0.9)", color: "#c2cadb",
              }}
            >
              {COLLIDER_SHAPES.map(s => (
                <option key={s} value={s} disabled={s === "hull" && !hullPointsFor}>
                  {s}{s === "hull" ? " (auto-fit from model)" : ""}
                </option>
              ))}
              {/* Trimesh comes only from bakes — shown when current, never offered. */}
              {c.shape === "trimesh" && <option value="trimesh">trimesh</option>}
            </select>
          </div>
          <div>
            <div style={LABEL}>OFFSET</div>
            <div style={{ display: "flex", gap: 4 }}>
              {numField(c, "ox", "X", "#ff6b6b")}
              {numField(c, "oy", "Y", "#6bff8a")}
              {numField(c, "oz", "Z", "#6b8aff")}
            </div>
          </div>
          {c.shape === "hull" || c.shape === "trimesh" ? (
            <div>
              <div style={LABEL}>{c.shape === "hull" ? "HULL" : "MESH"}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ color: "#9090a0", fontSize: 10 }}>
                  {c.shape === "hull"
                    ? `${c.points?.length ?? 0} points · auto-fit from model`
                    : `${Math.floor((c.indices?.length ?? 0) / 3)} tris · exact from bake`}
                </span>
                {c.shape === "hull" && hullPointsFor && (
                  <button
                    style={{ ...COLLIDER_BTN(false), flex: "none", padding: "3px 10px" }}
                    title="Recompute the hull from the model's current geometry"
                    onClick={() => {
                      const pts = hullPointsFor(selected.id);
                      if (pts) write(colliders.map(x => x.id === c.id ? hullFromPoints(x, pts) : x));
                    }}
                  >Refit</button>
                )}
              </div>
            </div>
          ) : (
          <div>
            <div style={LABEL}>{c.shape === "box" ? "SIZE" : c.shape === "sphere" ? "RADIUS" : "RADIUS · HEIGHT"}</div>
            <div style={{ display: "flex", gap: 4 }}>
              {c.shape === "box" && (
                <>
                  {numField(c, "sx", "W")}
                  {numField(c, "sy", "H")}
                  {numField(c, "sz", "D")}
                </>
              )}
              {c.shape === "sphere" && numField(c, "sx", "R")}
              {(c.shape === "capsule" || c.shape === "cylinder") && (
                <>
                  {numField(c, "sx", "R")}
                  {numField(c, "sy", "H")}
                </>
              )}
              {defCol && (
                <button
                  style={{ ...COLLIDER_BTN(false), flex: "none", padding: "3px 10px" }}
                  title="Refit to the model's bounds (resets offset, size and rotation)"
                  onClick={() => write(colliders.map(x => x.id === c.id ? refitCollider(x) : x))}
                >Refit</button>
              )}
            </div>
          </div>
          )}
          {(c.shape === "box" || c.shape === "capsule" || c.shape === "cylinder") && (
            <div>
              <div style={LABEL}>ROTATION (°)</div>
              <div style={{ display: "flex", gap: 4 }}>
                {numField(c, "rx", "X", "#ff6b6b")}
                {numField(c, "ry", "Y", "#6bff8a")}
                {numField(c, "rz", "Z", "#6b8aff")}
              </div>
            </div>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={c.isSensor}
              onChange={e => updateCollider(c.id, { isSensor: e.target.checked })}
            />
            <span style={{ fontSize: 10, color: "#9090a0" }}>
              Sensor — doesn't block; the player walks through it, and entering / leaving fires on_player_enter / on_player_exit scripts
            </span>
          </label>
        </div>
      ))}
      <button style={ACTION_BTN} onClick={() => write([...colliders, newBox()])}>+ Add collider</button>
      {objData?.assetId && onSaveCollidersToAsset && (
        <>
          <button
            style={{ ...ACTION_BTN, borderColor: "rgba(120,200,140,0.35)", background: "rgba(80,200,120,0.1)", color: "#80cc90" }}
            title="Write this collider set into the model's library entry (assets/models/manifest.json)"
            onClick={() => onSaveCollidersToAsset(selected.id, objData.assetId, colliders)}
          >Save as default for this model</button>
          <div style={INFO}>
            Makes this set the model's default colliders: every placement of
            “{assetDef?.label ?? objData.assetId}” that hasn't customized its own
            switches to it — including this one, which goes back to tracking the default.
          </div>
        </>
      )}
    </div>
  );
}

// ── AnimationsScreen ──────────────────────────────────────────────────────────

function AnimationsScreen({ selected, assets, bus, onPreviewClip, onStopPreview, onAutoPlayChange }: {
  selected:         SelectedObjectPayload;
  assets:           AssetDef[];
  bus?:             EventBus;
  onPreviewClip?:    (objectId: string, clipName: string) => void;
  onStopPreview?:    (objectId: string) => void;
  onAutoPlayChange?: (objectId: string, clipName: string | null) => void;
}) {
  const obj   = selected.data as WorldObject | null;
  const clips = assets.find(a => a.id === obj?.assetId)?.animations ?? [];
  const [autoPlay,   setAutoPlay]   = useState<string | null>(obj?.autoPlayAnimation ?? null);
  const [previewing, setPreviewing] = useState<string | null>(null);

  useEffect(() => {
    setAutoPlay((selected.data as WorldObject | null)?.autoPlayAnimation ?? null);
    setPreviewing(null);
  }, [selected.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset the Preview/Stop button when a clip finishes on its own.
  useEffect(() => {
    if (!bus || !obj) return;
    return bus.on("animation:preview-stop", ({ objectId }) => {
      if (objectId === obj.id) setPreviewing(null);
    });
  }, [bus, obj?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!obj) return null;

  const setAuto = (clip: string | null): void => {
    setAutoPlay(clip);
    onAutoPlayChange?.(obj.id, clip);
  };
  const preview = (clip: string): void => { setPreviewing(clip); onPreviewClip?.(obj.id, clip); };
  const stop    = (): void => { setPreviewing(null); onStopPreview?.(obj.id); };

  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={LABEL}>AUTO-PLAY</div>
        <select
          value={autoPlay ?? ""}
          onChange={e => setAuto(e.target.value || null)}
          style={{
            width: "100%", boxSizing: "border-box",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4,
            background: "rgba(40,40,40,0.9)", color: "#c0c0c0",
            fontSize: 10, fontFamily: "monospace", padding: "4px 6px", outline: "none",
          }}
        >
          <option value="">None</option>
          {clips.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div>
        <div style={LABEL}>CLIPS</div>
        {clips.length === 0 && (
          <div style={{ color: "#98a2b8", fontSize: 10, fontStyle: "italic" }}>No animations available</div>
        )}
        {clips.map(c => {
          const isPreviewing = previewing === c;
          const disabled = previewing !== null && !isPreviewing;
          return (
            <div key={c} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4,
              background: "rgba(255,255,255,0.03)", borderRadius: 4, padding: "4px 8px",
              border: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ flex: 1, minWidth: 0, color: "#b0b0b0", fontSize: 11, fontFamily: "monospace",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c}{autoPlay === c ? " · auto" : ""}
              </div>
              <button
                onClick={() => (isPreviewing ? stop() : preview(c))}
                disabled={disabled}
                style={{ padding: "2px 8px", fontSize: 10, fontFamily: "monospace",
                  cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.35 : 1,
                  background: isPreviewing ? "rgba(255,120,0,0.12)" : "rgba(0,255,200,0.1)",
                  border: `1px solid ${isPreviewing ? "rgba(255,120,0,0.3)" : "rgba(0,255,200,0.25)"}`,
                  borderRadius: 3, color: isPreviewing ? "#dd8844" : "#44ccaa" }}
              >{isPreviewing ? "■ Stop" : "▶ Preview"}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── OpeningGeoView ────────────────────────────────────────────────────────────

function OpeningGeoView({ selected, onObjectUpdate }: { selected: SelectedObjectPayload; onObjectUpdate: (c: Partial<WorldObject>) => void }) {
  const opening = selected.data as Opening | null;
  if (!opening) return null;
  return (
    <div style={{ padding: "14px 16px" }}>
      <OpeningRow
        opening={opening}
        onUpdate={changes => onObjectUpdate(changes as unknown as Partial<WorldObject>)}
        onDelete={() => {}}
        hideDelete
      />
    </div>
  );
}

// ── MatScreen ─────────────────────────────────────────────────────────────────

function MatScreen({ selected, materialList, onObjectUpdate, onAddMaterial, quality, onQualityChange, bus }: {
  selected:        SelectedObjectPayload;
  materialList:    MaterialDef[];
  onObjectUpdate:  (changes: Partial<WorldObject>) => void;
  onAddMaterial:   () => void;
  quality:         QualityScale;
  onQualityChange: (q: QualityScale) => void;
  bus?:            EventBus;
}) {
  const { type } = selected;
  return (
    <div>
      <div style={{ paddingTop: 4 }}>
        {type === "wall"     && <WallMatView     selected={selected} materialList={materialList} onObjectUpdate={onObjectUpdate} onAddMaterial={onAddMaterial} />}
        {type === "floor"    && <FloorMatView    selected={selected} materialList={materialList} onObjectUpdate={onObjectUpdate} onAddMaterial={onAddMaterial} />}
        {type === "platform" && <PlatformMatView selected={selected} materialList={materialList} onObjectUpdate={onObjectUpdate} onAddMaterial={onAddMaterial} />}
        {type === "stair"    && <StairMatView    selected={selected} materialList={materialList} onObjectUpdate={onObjectUpdate} onAddMaterial={onAddMaterial} />}
        {type === "ladder"   && <LadderMatView   selected={selected} materialList={materialList} onObjectUpdate={onObjectUpdate} onAddMaterial={onAddMaterial} />}
        {type === "shape"    && <ShapeMatView    selected={selected} materialList={materialList} onObjectUpdate={onObjectUpdate} onAddMaterial={onAddMaterial} bus={bus} />}
      </div>
      <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={LABEL}>QUALITY</div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["low", "medium", "high"] as QualityScale[]).map(q => (
            <button key={q} onClick={() => onQualityChange(q)} style={{
              flex: 1, padding: "4px 0", borderRadius: 4, cursor: "pointer",
              fontFamily: "monospace", fontSize: 10, border: "none",
              background: quality === q ? "rgba(80,140,255,0.25)" : "rgba(46,46,46,0.9)",
              color: quality === q ? "#80aaff" : "#646464",
              outline: quality === q ? "1px solid rgba(80,140,255,0.4)" : "1px solid rgba(255,255,255,0.06)",
            }}>{q}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function WallMatView({ selected, materialList, onObjectUpdate, onAddMaterial }: { selected: SelectedObjectPayload; materialList: MaterialDef[]; onObjectUpdate: (c: Partial<WorldObject>) => void; onAddMaterial: () => void }) {
  const wallData = selected.data as WallDef | null;
  return (
    <MaterialSection
      key={selected.id}
      materialList={materialList}
      currentMaterialId={wallData?.material ?? "brick_01"}
      overrides={wallData?.materialOverrides}
      onMaterialChange={id => onObjectUpdate({ material: id, materialOverrides: undefined } as unknown as Partial<WorldObject>)}
      onOverridesChange={ov => onObjectUpdate({ materialOverrides: ov } as unknown as Partial<WorldObject>)}
      onAddMaterial={onAddMaterial}
    />
  );
}

function FloorMatView({ selected, materialList, onObjectUpdate, onAddMaterial }: { selected: SelectedObjectPayload; materialList: MaterialDef[]; onObjectUpdate: (c: Partial<WorldObject>) => void; onAddMaterial: () => void }) {
  const floorData = selected.data as FloorDef | null;
  return (
    <MaterialSection
      key={selected.id}
      materialList={materialList}
      currentMaterialId={floorData?.floorMesh.material ?? "concrete_01"}
      overrides={floorData?.materialOverrides}
      onMaterialChange={id => onObjectUpdate({ floorMesh: { ...floorData!.floorMesh, material: id }, materialOverrides: undefined } as unknown as Partial<WorldObject>)}
      onOverridesChange={ov => onObjectUpdate({ materialOverrides: ov } as unknown as Partial<WorldObject>)}
      onAddMaterial={onAddMaterial}
    />
  );
}

function LadderGeoView({ selected, onObjectUpdate }: { selected: SelectedObjectPayload; onObjectUpdate: (c: Partial<WorldObject>) => void }) {
  const ladder = selected.data as LadderDef | null;
  const [posStr,  setPosStr]  = useState({ x: String(ladder?.position.x ?? 0), y: String(ladder?.position.y ?? 0), z: String(ladder?.position.z ?? 0) });
  const [rotYStr, setRotYStr] = useState(String(ladder?.rotationY ?? 0));
  const [hStr,    setHStr]    = useState(String(ladder?.height ?? 3));
  const [wStr,    setWStr]    = useState(String(ladder?.width ?? 0.7));
  const [rungStr, setRungStr] = useState(String(ladder?.rungSpacing ?? 0.35));
  const [dismStr, setDismStr] = useState(String(ladder?.topDismountOffset ?? 0.6));
  const [promptStr, setPromptStr] = useState(String(ladder?.promptRange ?? 1.8));
  const [grabStr, setGrabStr] = useState(String(ladder?.autoGrabRange ?? 0.7));
  const [invis, setInvis] = useState(ladder?.invisible ?? false);
  const [noCol, setNoCol] = useState(ladder?.noCollider ?? false);
  const { schedule, flush } = useFieldDebounce(300);

  useEffect(() => {
    setPosStr({ x: String(ladder?.position.x ?? 0), y: String(ladder?.position.y ?? 0), z: String(ladder?.position.z ?? 0) });
    setRotYStr(String(ladder?.rotationY ?? 0));
    setHStr(String(ladder?.height ?? 3));
    setWStr(String(ladder?.width ?? 0.7));
    setRungStr(String(ladder?.rungSpacing ?? 0.35));
    setDismStr(String(ladder?.topDismountOffset ?? 0.6));
    setPromptStr(String(ladder?.promptRange ?? 1.8));
    setGrabStr(String(ladder?.autoGrabRange ?? 0.7));
    setInvis(ladder?.invisible ?? false);
    setNoCol(ladder?.noCollider ?? false);
  }, [selected.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitPos = (axis: "x" | "y" | "z", val: string) => { const n = parseFloat(val); if (!Number.isFinite(n)) return; onObjectUpdate({ position: { ...(ladder?.position ?? { x: 0, y: 0, z: 0 }), [axis]: n } } as unknown as Partial<WorldObject>); };
  const commitNum = (field: keyof LadderDef, val: string, min: number) => { const n = parseFloat(val); if (Number.isFinite(n) && n >= min) onObjectUpdate({ [field]: n } as unknown as Partial<WorldObject>); };

  const numField = (label: string, val: string, setter: (v: string) => void, field: keyof LadderDef, min: number, step = 0.1) => (
    <div>
      <div style={{ ...LABEL, marginBottom: 2 }}>{label}</div>
      <div style={{ display: "flex", gap: 4, alignItems: "center", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 6px" }}>
        <input type="number" step={step} value={val}
          onChange={e => { setter(e.target.value); schedule(() => commitNum(field, e.target.value, min)); }}
          onBlur={e => flush(() => commitNum(field, e.target.value, min))}
          onKeyDown={e => { if (e.key === "Enter") flush(() => commitNum(field, (e.target as HTMLInputElement).value, min)); }}
          style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace" }}
        />
      </div>
    </div>
  );

  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={LABEL}>POSITION (foot)</div>
        <div style={{ display: "flex", gap: 4 }}>
          {([["x","#ff6b6b"],["y","#6bff8a"],["z","#6b8aff"]] as const).map(([axis, color]) => (
            <div key={axis} style={{ flex: 1, display: "flex", gap: 4, alignItems: "center", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 6px" }}>
              <span style={{ color, fontSize: 9 }}>{axis.toUpperCase()}</span>
              <input type="number" step={0.5} value={posStr[axis]}
                onChange={e => { setPosStr(p => ({ ...p, [axis]: e.target.value })); schedule(() => commitPos(axis, e.target.value)); }}
                onBlur={e => flush(() => commitPos(axis, e.target.value))}
                onKeyDown={e => { if (e.key === "Enter") flush(() => commitPos(axis, (e.target as HTMLInputElement).value)); }}
                style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace" }}
              />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div style={LABEL}>ROTATION Y (deg) — climb side faces local +Z</div>
        <div style={{ display: "flex", gap: 4, alignItems: "center", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 6px", width: "fit-content" }}>
          <span style={{ color: "#6bff8a", fontSize: 9 }}>Y</span>
          <input type="number" step={15} value={rotYStr}
            onChange={e => { setRotYStr(e.target.value); schedule(() => commitNum("rotationY", e.target.value, -Infinity)); }}
            onBlur={e => flush(() => commitNum("rotationY", e.target.value, -Infinity))}
            onKeyDown={e => { if (e.key === "Enter") flush(() => commitNum("rotationY", (e.target as HTMLInputElement).value, -Infinity)); }}
            style={{ width: 70, minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace" }}
          />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        {numField("HEIGHT", hStr, setHStr, "height", 0.5)}
        {numField("WIDTH", wStr, setWStr, "width", 0.3)}
        {numField("RUNG SPACING", rungStr, setRungStr, "rungSpacing", 0.15, 0.05)}
        {numField("TOP DISMOUNT OFFSET", dismStr, setDismStr, "topDismountOffset", 0.2)}
        {numField("PROMPT RANGE", promptStr, setPromptStr, "promptRange", 0.3)}
        {numField("AUTO-GRAB RANGE", grabStr, setGrabStr, "autoGrabRange", 0.1)}
      </div>
      <div style={{ color: "#98a2b8", fontSize: 9, lineHeight: 1.5 }}>
        Top-of-ladder ranges (metres onto the platform): PROMPT RANGE = where "Climb down"
        appears; AUTO-GRAB RANGE = where walking toward the ladder mounts (clamped to
        PROMPT RANGE). The green arrow marks the climbable side.
      </div>
      <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#9090a0", fontSize: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={invis} onChange={e => { setInvis(e.target.checked); onObjectUpdate({ invisible: e.target.checked } as unknown as Partial<WorldObject>); }} style={{ accentColor: "#4d8cff", cursor: "pointer" }} />
        INVISIBLE IN GAME
      </label>
      <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#9090a0", fontSize: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={noCol} onChange={e => { setNoCol(e.target.checked); onObjectUpdate({ noCollider: e.target.checked } as unknown as Partial<WorldObject>); }} style={{ accentColor: "#4d8cff", cursor: "pointer" }} />
        NO SOLID COLLIDER
      </label>
      <div style={{ color: "#98a2b8", fontSize: 9, lineHeight: 1.5 }}>
        For invisible climbables (rock walls, vines): place the ladder flush against the
        visible geometry, check both boxes — the ladder supplies the climb volume, the
        wall supplies the look and collision. Rails stay visible while editing.
      </div>
    </div>
  );
}

function LadderMatView({ selected, materialList, onObjectUpdate, onAddMaterial }: { selected: SelectedObjectPayload; materialList: MaterialDef[]; onObjectUpdate: (c: Partial<WorldObject>) => void; onAddMaterial: () => void }) {
  const ladder = selected.data as LadderDef | null;
  return (
    <MaterialSection
      key={selected.id}
      label="LADDER"
      defaultExpanded={true}
      materialList={materialList}
      currentMaterialId={ladder?.material ?? "concrete_01"}
      overrides={ladder?.materialOverrides}
      onMaterialChange={id => onObjectUpdate({ material: id, materialOverrides: undefined } as unknown as Partial<WorldObject>)}
      onOverridesChange={ov => onObjectUpdate({ materialOverrides: ov } as unknown as Partial<WorldObject>)}
      onAddMaterial={onAddMaterial}
    />
  );
}

function PlatformMatView({ selected, materialList, onObjectUpdate, onAddMaterial }: { selected: SelectedObjectPayload; materialList: MaterialDef[]; onObjectUpdate: (c: Partial<WorldObject>) => void; onAddMaterial: () => void }) {
  const plat = selected.data as PlatformDef | null;
  return (
    <>
      <MaterialSection
        key={selected.id + ":top"}
        label="TOP"
        defaultExpanded={false}
        materialList={materialList}
        currentMaterialId={plat?.material ?? "concrete_01"}
        overrides={plat?.materialOverrides}
        onMaterialChange={id => onObjectUpdate({ material: id, materialOverrides: undefined } as unknown as Partial<WorldObject>)}
        onOverridesChange={ov => onObjectUpdate({ materialOverrides: ov } as unknown as Partial<WorldObject>)}
        onAddMaterial={onAddMaterial}
      />
      <MaterialSection
        key={selected.id + ":bottom"}
        label="BOTTOM"
        defaultExpanded={false}
        materialList={materialList}
        currentMaterialId={plat?.bottomMaterial ?? plat?.material ?? "concrete_01"}
        overrides={plat?.bottomMaterialOverrides}
        onMaterialChange={id => onObjectUpdate({ bottomMaterial: id, bottomMaterialOverrides: undefined } as unknown as Partial<WorldObject>)}
        onOverridesChange={ov => onObjectUpdate({ bottomMaterialOverrides: ov } as unknown as Partial<WorldObject>)}
        onAddMaterial={onAddMaterial}
      />
      <MaterialSection
        key={selected.id + ":sides"}
        label="SIDES"
        defaultExpanded={false}
        materialList={materialList}
        currentMaterialId={plat?.sideMaterial ?? plat?.material ?? "concrete_01"}
        overrides={plat?.sideMaterialOverrides}
        onMaterialChange={id => onObjectUpdate({ sideMaterial: id, sideMaterialOverrides: undefined } as unknown as Partial<WorldObject>)}
        onOverridesChange={ov => onObjectUpdate({ sideMaterialOverrides: ov } as unknown as Partial<WorldObject>)}
        onAddMaterial={onAddMaterial}
      />
    </>
  );
}

function StairMatView({ selected, materialList, onObjectUpdate, onAddMaterial }: { selected: SelectedObjectPayload; materialList: MaterialDef[]; onObjectUpdate: (c: Partial<WorldObject>) => void; onAddMaterial: () => void }) {
  const stair = selected.data as StairDef | null;
  const { schedule, flush } = useFieldDebounce(300);
  const [riserJitter, setRiserJitter] = useState(stair?.riserUvJitter ?? 0);
  const [treadJitter, setTreadJitter] = useState(stair?.treadUvJitter ?? 0);
  useEffect(() => {
    setRiserJitter((selected.data as StairDef | null)?.riserUvJitter ?? 0);
    setTreadJitter((selected.data as StairDef | null)?.treadUvJitter ?? 0);
  }, [selected.id]);
  const commitJitter = (v: number) =>
    onObjectUpdate({ riserUvJitter: v } as unknown as Partial<WorldObject>);
  const commitTreadJitter = (v: number) =>
    onObjectUpdate({ treadUvJitter: v } as unknown as Partial<WorldObject>);
  return (
    <>
      <MaterialSection
        key={selected.id + ":body"}
        label="BODY"
        defaultExpanded={false}
        materialList={materialList}
        currentMaterialId={stair?.material ?? "concrete_01"}
        overrides={stair?.materialOverrides}
        onMaterialChange={id => onObjectUpdate({ material: id, materialOverrides: undefined } as unknown as Partial<WorldObject>)}
        onOverridesChange={ov => onObjectUpdate({ materialOverrides: ov } as unknown as Partial<WorldObject>)}
        onAddMaterial={onAddMaterial}
        extraTilingControls={
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", ...LABEL }}>
              <span>TEXTURE VARIATION</span>
              <span style={{ color: "#808090" }}>{Math.round(treadJitter * 100)}%</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.01} value={treadJitter}
              onChange={e => {
                const v = Number(e.target.value);
                setTreadJitter(v);
                schedule(() => commitTreadJitter(v));
              }}
              onPointerUp={() => flush(() => commitTreadJitter(treadJitter))}
              style={{ width: "100%", accentColor: "#80aaff" }}
            />
          </div>
        }
      />
      <MaterialSection
        key={selected.id + ":risers"}
        label="RISERS"
        defaultExpanded={false}
        materialList={materialList}
        currentMaterialId={stair?.riserMaterial ?? stair?.material ?? "concrete_01"}
        overrides={stair?.riserMaterialOverrides}
        onMaterialChange={id => onObjectUpdate({ riserMaterial: id, riserMaterialOverrides: undefined } as unknown as Partial<WorldObject>)}
        onOverridesChange={ov => onObjectUpdate({ riserMaterialOverrides: ov } as unknown as Partial<WorldObject>)}
        onAddMaterial={onAddMaterial}
        extraTilingControls={
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", ...LABEL }}>
              <span>TEXTURE VARIATION</span>
              <span style={{ color: "#808090" }}>{Math.round(riserJitter * 100)}%</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.01} value={riserJitter}
              onChange={e => {
                const v = Number(e.target.value);
                setRiserJitter(v);
                schedule(() => commitJitter(v));
              }}
              onPointerUp={() => flush(() => commitJitter(riserJitter))}
              style={{ width: "100%", accentColor: "#80aaff" }}
            />
          </div>
        }
      />
      {stair?.landing && (
        <MaterialSection
          key={selected.id + ":landing"}
          label="LANDING"
          defaultExpanded={false}
          materialList={materialList}
          currentMaterialId={stair?.landingMaterial ?? stair?.material ?? "concrete_01"}
          overrides={stair?.landingMaterialOverrides}
          onMaterialChange={id => onObjectUpdate({ landingMaterial: id, landingMaterialOverrides: undefined } as unknown as Partial<WorldObject>)}
          onOverridesChange={ov => onObjectUpdate({ landingMaterialOverrides: ov } as unknown as Partial<WorldObject>)}
          onAddMaterial={onAddMaterial}
        />
      )}
      {stair?.hasRailing && (
        <MaterialSection
          key={selected.id + ":railing"}
          label="RAILING"
          defaultExpanded={false}
          materialList={materialList}
          currentMaterialId={stair?.railingMaterial ?? "concrete_01"}
          overrides={stair?.railingMaterialOverrides}
          onMaterialChange={id => onObjectUpdate({ railingMaterial: id, railingMaterialOverrides: undefined } as unknown as Partial<WorldObject>)}
          onOverridesChange={ov => onObjectUpdate({ railingMaterialOverrides: ov } as unknown as Partial<WorldObject>)}
          onAddMaterial={onAddMaterial}
        />
      )}
    </>
  );
}

function ShapeMatView({ selected, materialList, onObjectUpdate, onAddMaterial, bus }: { selected: SelectedObjectPayload; materialList: MaterialDef[]; onObjectUpdate: (c: Partial<WorldObject>) => void; onAddMaterial: () => void; bus?: EventBus }) {
  const shape = selected.data as ShapeDef | null;
  // Face-brushes: per-face materials replace TOP/BOTTOM + SIDES (Phase 23).
  if (shape?.mesh?.faces?.length) {
    return <FaceMaterialsView selected={selected} shape={shape} materialList={materialList} onObjectUpdate={onObjectUpdate} bus={bus} />;
  }
  return (
    <>
      <MaterialSection
        key={selected.id + ":caps"}
        label="TOP / BOTTOM"
        defaultExpanded={false}
        materialList={materialList}
        currentMaterialId={shape?.material ?? "concrete_01"}
        overrides={shape?.materialOverrides}
        onMaterialChange={id => onObjectUpdate({ material: id, materialOverrides: undefined } as unknown as Partial<WorldObject>)}
        onOverridesChange={ov => onObjectUpdate({ materialOverrides: ov } as unknown as Partial<WorldObject>)}
        onAddMaterial={onAddMaterial}
      />
      <MaterialSection
        key={selected.id + ":sides"}
        label="SIDES"
        defaultExpanded={false}
        materialList={materialList}
        currentMaterialId={shape?.sideMaterial ?? shape?.material ?? "concrete_01"}
        overrides={shape?.sideMaterialOverrides}
        onMaterialChange={id => onObjectUpdate({ sideMaterial: id, sideMaterialOverrides: undefined } as unknown as Partial<WorldObject>)}
        onOverridesChange={ov => onObjectUpdate({ sideMaterialOverrides: ov } as unknown as Partial<WorldObject>)}
        onAddMaterial={onAddMaterial}
      />
    </>
  );
}

// ── OpeningsScreen ────────────────────────────────────────────────────────────

function OpeningsScreen({ selected, onSegmentUpdate, zones, activeZoneId }: {
  selected:        SelectedObjectPayload;
  onSegmentUpdate: (wallId: string, changes: Partial<WallDef>) => void;
  zones:           ZoneDef[];
  activeZoneId:    string | null;
}) {
  const wallData = selected.data as WallDef | null;
  const allWalls = selected.runWalls ?? (wallData ? [wallData] : []);
  const allOpenings: Array<{ wallId: string; opening: Opening }> = allWalls.flatMap(w =>
    (w.openings ?? []).map(op => ({ wallId: w.id, opening: op })),
  );

  const addOpening = () => {
    if (!wallData) return;
    const primaryOpenings = wallData.openings ?? [];
    const rightmost = primaryOpenings.reduce((max, o) => Math.max(max, o.offsetAlongWall + o.width), 0);
    const smartOffset = primaryOpenings.length === 0 ? 0.5 : rightmost + 0.5;
    const newOpening: Opening = {
      id: crypto.randomUUID(),
      type: "door",
      offsetAlongWall: smartOffset,
      width: 1.0,
      height: 2.1,
      elevation: 0,
      linkedZoneId: null,
      linkedTransitionId: null,
    };
    onSegmentUpdate(wallData.id, { openings: [...primaryOpenings, newOpening] });
  };

  const updateOpening = (wallId: string, openingId: string, changes: Partial<Opening>) => {
    const targetWall = allWalls.find(w => w.id === wallId);
    if (!targetWall) return;
    let extra: Partial<Opening> = {};
    if (changes.type && changes.type !== targetWall.openings.find(o => o.id === openingId)?.type) {
      extra = (changes.type === "window" || changes.type === "passage")
        ? { height: 1.0, elevation: 1.0 }
        : { height: 2.1, elevation: 0 };
    }
    onSegmentUpdate(wallId, { openings: targetWall.openings.map(o => o.id === openingId ? { ...o, ...changes, ...extra } : o) });
  };

  const deleteOpening = (wallId: string, openingId: string) => {
    const targetWall = allWalls.find(w => w.id === wallId);
    if (!targetWall) return;
    onSegmentUpdate(wallId, { openings: targetWall.openings.filter(o => o.id !== openingId) });
  };

  return (
    <div style={{ padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={LABEL}>OPENINGS</div>
        <button
          onClick={addOpening}
          style={{
            background: "rgba(80,140,255,0.1)", border: "1px solid rgba(80,140,255,0.3)",
            borderRadius: 4, color: "#80aaff", fontSize: 9, cursor: "pointer",
            padding: "3px 10px", fontFamily: "monospace",
          }}
        >+ Add opening</button>
      </div>

      {allOpenings.length === 0 && (
        <div style={{ color: "#98a2b8", fontSize: 11, fontStyle: "italic", textAlign: "center", padding: "20px 0" }}>
          No openings
        </div>
      )}

      {allOpenings.map(({ wallId, opening: op }) => (
        <OpeningRow
          key={op.id}
          opening={op}
          zones={zones}
          activeZoneId={activeZoneId}
          onUpdate={changes => updateOpening(wallId, op.id, changes)}
          onDelete={() => deleteOpening(wallId, op.id)}
        />
      ))}
    </div>
  );
}

// ── SegmentsScreen ────────────────────────────────────────────────────────────

function SegmentsScreen({ selected, materialList, onAddMaterial, onSegmentUpdate, bus, getNodeLinks }: {
  selected:        SelectedObjectPayload;
  materialList:    MaterialDef[];
  onAddMaterial:   () => void;
  onSegmentUpdate: (wallId: string, changes: Partial<WallDef>) => void;
  bus?:            EventBus;
  getNodeLinks?:   (zoneId: string, nodeId: string) => NodeLinks;
}) {
  const wallData = selected.data as WallDef | null;
  const runWalls = selected.runWalls ?? (wallData ? [wallData] : []);

  return (
    <div style={{ padding: "14px 16px" }}>
      {runWalls.map((wall, i) => (
        <WallSegmentRow
          key={wall.id}
          index={i + 1}
          wall={wall}
          zoneId={selected.zoneId}
          materialList={materialList}
          onAddMaterial={onAddMaterial}
          onUpdate={changes => onSegmentUpdate(wall.id, changes)}
          bus={bus}
          getNodeLinks={getNodeLinks}
        />
      ))}
      <div style={{ color: "#98a2b8", fontSize: 9, marginTop: 6 }}>
        Right-click a wall in the canvas to insert a vertex (splits the segment).
      </div>
    </div>
  );
}

// ── VertScreen ────────────────────────────────────────────────────────────────

function VertScreen({ selected, onObjectUpdate }: {
  selected:       SelectedObjectPayload;
  onObjectUpdate: (changes: Partial<WorldObject>) => void;
}) {
  const floorData = selected.data as FloorDef | null;
  const [elevStr,  setElevStr]  = useState(String(floorData?.elevation ?? 0));
  const [floorLvl, setFloorLvl] = useState(floorData?.level ?? 0);

  useEffect(() => {
    setElevStr(String(floorData?.elevation ?? 0));
    setFloorLvl(floorData?.level ?? 0);
  }, [selected.id, floorData?.elevation, floorData?.level]); // eslint-disable-line react-hooks/exhaustive-deps

  const { schedule, flush } = useFieldDebounce(300);

  const commitElev = (raw: string) => {
    const n = parseFloat(raw);
    if (Number.isFinite(n)) onObjectUpdate({ elevation: n } as unknown as Partial<WorldObject>);
  };

  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={LABEL}>FLOOR LEVEL</div>
        <LevelStepper value={floorLvl} onChange={n => {
          setFloorLvl(n);
          onObjectUpdate({ level: n } as unknown as Partial<WorldObject>);
        }} />
      </div>
      <div>
        <div style={LABEL}>ELEVATION</div>
        <input
          type="number" step={0.001}
          value={elevStr}
          onChange={e => { setElevStr(e.target.value); schedule(() => commitElev(e.target.value)); }}
          onBlur={e => flush(() => commitElev(e.target.value))}
          onKeyDown={e => { if (e.key === "Enter") flush(() => commitElev((e.target as HTMLInputElement).value)); }}
          style={{ ...NUM_INPUT, width: 80 }}
        />
        <div style={{ color: "#98a2b8", fontSize: 9, marginTop: 4 }}>
          Adjust to layer overlapping floors (+0.001 per step)
        </div>
      </div>
    </div>
  );
}

// ── MaterialSection ───────────────────────────────────────────────────────────

function MaterialSection({
  label = "MATERIAL", defaultExpanded = true,
  materialList, currentMaterialId, overrides, onMaterialChange, onOverridesChange, onAddMaterial,
  extraTilingControls,
}: {
  label?:            string;
  defaultExpanded?:  boolean;
  materialList:      MaterialDef[];
  currentMaterialId: string;
  overrides:         MaterialOverrides | undefined;
  onMaterialChange:  (id: string) => void;
  onOverridesChange: (ov: MaterialOverrides) => void;
  onAddMaterial:     () => void;
  extraTilingControls?: React.ReactNode;   // rendered with the TILE/OFFSET cluster (e.g. riser TEXTURE VARIATION)
}) {
  const baseDef = materialList.find(m => m.id === currentMaterialId);
  const isColorMode = !!overrides?.color;
  const [open,    setOpen]    = useState(defaultExpanded);
  const [matCat,  setMatCat]  = useState<string>("All");
  const [hovered, setHovered] = useState(false);

  const catOf = (m: MaterialDef) => m.category ?? "Other";
  const present = [...new Set(materialList.map(catOf))];
  const orderedCats = orderedMaterialCategories(present);
  const inCategory = materialList.filter(m => matCat === "All" || catOf(m) === matCat);
  // When the applied material isn't in the active category, pin it above the list (set apart).
  const pinnedCurrent = baseDef && !inCategory.some(m => m.id === baseDef.id) ? baseDef : null;

  const renderTile = (mat: MaterialDef) => {
    const active = mat.id === currentMaterialId;
    return (
      <div key={mat.id} onClick={() => onMaterialChange(mat.id)} style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "4px 8px",
        background: active ? "rgba(80,140,255,0.15)" : "rgba(46,46,46,0.9)",
        border: `1px solid ${active ? "rgba(80,140,255,0.4)" : "rgba(255,255,255,0.06)"}`,
        borderRadius: 4, color: active ? "#80aaff" : "#7a7a7a",
        fontSize: 11, fontFamily: "monospace", cursor: "pointer",
      }}>
        <div style={{
          width: PICKER_SWATCH, height: PICKER_SWATCH, flexShrink: 0, borderRadius: 3,
          border: "1px solid rgba(255,255,255,0.1)",
          background: `#3a3a3a url("${materialSwatchUrl(mat)}") center/cover`,
        }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mat.label}</span>
      </div>
    );
  };
  const hasSplitInit = !!(overrides?.tileScaleX !== undefined || overrides?.tileScaleY !== undefined);
  const [tileStr,   setTileStr]   = useState(String(overrides?.tileScale         ?? baseDef?.tileScale         ?? 1.0));
  const [tileXStr,  setTileXStr]  = useState(String(overrides?.tileScaleX        ?? overrides?.tileScale        ?? baseDef?.tileScale ?? 1.0));
  const [tileYStr,  setTileYStr]  = useState(String(overrides?.tileScaleY        ?? overrides?.tileScale        ?? baseDef?.tileScale ?? 1.0));
  const [splitTile, setSplitTile] = useState(hasSplitInit);
  const [roughStr,  setRoughStr]  = useState(String(overrides?.roughnessVal      ?? baseDef?.roughnessVal      ?? 0.85));
  const [dispStr,   setDispStr]   = useState(String(overrides?.displacementScale ?? baseDef?.displacementScale ?? 0.03));
  const [offXStr,   setOffXStr]   = useState(String(overrides?.offsetX ?? 0));
  const [offYStr,   setOffYStr]   = useState(String(overrides?.offsetY ?? 0));
  const [colorStr,  setColorStr]  = useState(overrides?.color ?? "#888888");

  useEffect(() => {
    const base = overrides?.tileScale ?? baseDef?.tileScale ?? 1.0;
    setTileStr(String(base));
    setTileXStr(String(overrides?.tileScaleX ?? base));
    setTileYStr(String(overrides?.tileScaleY ?? base));
    setSplitTile(!!(overrides?.tileScaleX !== undefined || overrides?.tileScaleY !== undefined));
    setRoughStr(String(overrides?.roughnessVal     ?? baseDef?.roughnessVal      ?? 0.85));
    setDispStr(String(overrides?.displacementScale ?? baseDef?.displacementScale ?? 0.03));
    setOffXStr(String(overrides?.offsetX ?? 0));
    setOffYStr(String(overrides?.offsetY ?? 0));
    setColorStr(overrides?.color ?? "#888888");
  }, [currentMaterialId]); // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveEnabled = (key: MapKey): boolean => {
    const ov = overrides?.maps?.[key]?.enabled;
    return ov !== undefined ? ov : (baseDef?.maps[key]?.enabled ?? false);
  };

  const isOverridden = (key: MapKey): boolean =>
    overrides?.maps?.[key]?.enabled !== undefined &&
    overrides.maps[key]!.enabled !== (baseDef?.maps[key]?.enabled ?? false);

  const toggleMap = (key: MapKey) => {
    onOverridesChange({ ...overrides, maps: { ...(overrides?.maps ?? {}), [key]: { enabled: !effectiveEnabled(key) } } });
  };

  const { schedule, flush } = useFieldDebounce(300);

  const commitTile  = (val: string) => { const n = parseFloat(val); if (!Number.isFinite(n) || n <= 0) return; onOverridesChange({ ...overrides, tileScale: n, tileScaleX: undefined, tileScaleY: undefined }); };
  const commitTileX = (val: string) => { const n = parseFloat(val); if (!Number.isFinite(n) || n <= 0) return; onOverridesChange({ ...overrides, tileScaleX: n }); };
  const commitTileY = (val: string) => { const n = parseFloat(val); if (!Number.isFinite(n) || n <= 0) return; onOverridesChange({ ...overrides, tileScaleY: n }); };
  // Cap 2 while the roughness texture is on: the scalar MULTIPLIES the texture's
  // (sub-1) texels, so >1 is the only way to reach fully-matte on glossy-mapped
  // materials. Plain (map-off) roughness is physically 0..1 — the shader clamps.
  const commitRough = (val: string) => { const n = parseFloat(val); if (!Number.isFinite(n)) return; onOverridesChange({ ...overrides, roughnessVal: Math.max(0, Math.min(effectiveEnabled("roughness") ? 2 : 1, n)) }); };
  const commitDisp  = (val: string) => { const n = parseFloat(val); if (!Number.isFinite(n) || n < 0) return; onOverridesChange({ ...overrides, displacementScale: n }); };
  const commitOffX  = (val: string) => { const n = parseFloat(val); if (!Number.isFinite(n)) return; onOverridesChange({ ...overrides, offsetX: n }); };
  const commitOffY  = (val: string) => { const n = parseFloat(val); if (!Number.isFinite(n)) return; onOverridesChange({ ...overrides, offsetY: n }); };
  const commitColor = (val: string) => { if (!/^#[0-9a-fA-F]{6}$/.test(val)) return; onOverridesChange({ ...overrides, color: val }); };

  const toggleSplitTile = () => {
    const next = !splitTile;
    setSplitTile(next);
    if (next) {
      const seed = (Number.isFinite(parseFloat(tileStr)) && parseFloat(tileStr) > 0) ? parseFloat(tileStr) : 1.0;
      setTileXStr(String(seed)); setTileYStr(String(seed));
      onOverridesChange({ ...overrides, tileScaleX: seed, tileScaleY: seed });
    } else {
      setTileStr(tileXStr);
      onOverridesChange({ ...overrides, tileScale: parseFloat(tileXStr) || 1.0, tileScaleX: undefined, tileScaleY: undefined });
    }
  };

  const roughEnabled = effectiveEnabled("roughness");
  const dispEnabled  = effectiveEnabled("displacement");

  const currentLabel = isColorMode ? `Color ${overrides?.color}` : (baseDef?.label ?? currentMaterialId);

  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ ...ROW_BASE, padding: "9px 16px", boxSizing: "border-box",
          borderLeft: "3px solid rgba(80,140,255,0.6)",
          background: hovered ? "rgba(80,140,255,0.12)" : "rgba(80,140,255,0.05)",
          borderBottom: open ? "1px solid rgba(255,255,255,0.07)" : "none" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span style={{ color: "#acc4ee", fontSize: 11, letterSpacing: 1.5, fontWeight: 600 }}>{label}</span>
          {!open && (
            <span style={{ color: "#8b94a8", fontSize: 10, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentLabel}
            </span>
          )}
        </span>
        <span style={{ color: "#6b86b8", fontSize: 14, lineHeight: 1, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>›</span>
      </button>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 16px 14px" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {(["texture", "color"] as const).map(m => {
              const active = (m === "color") === isColorMode;
              return (
                <button key={m} onClick={() => {
                  if (m === "color") { setColorStr(overrides?.color ?? "#888888"); onOverridesChange({ ...overrides, color: overrides?.color ?? "#888888" }); }
                  else                { onOverridesChange({ ...overrides, color: undefined }); }
                }} style={{
                  flex: 1, padding: "4px 0", borderRadius: 4, cursor: "pointer",
                  fontFamily: "monospace", fontSize: 10, border: "none",
                  background: active ? "rgba(80,140,255,0.25)" : "rgba(46,46,46,0.9)",
                  color: active ? "#80aaff" : "#646464",
                  outline: active ? "1px solid rgba(80,140,255,0.4)" : "1px solid rgba(255,255,255,0.06)",
                }}>{m.toUpperCase()}</button>
              );
            })}
          </div>

          {!isColorMode && (
            <>
          <button
            onClick={onAddMaterial}
            style={{ padding: "5px 10px", borderRadius: 4, cursor: "pointer", background: "rgba(20,30,45,0.6)", border: "1px dashed rgba(255,255,255,0.1)", color: "#98a2b8", fontSize: 10, fontFamily: "monospace", textAlign: "left" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(80,140,255,0.5)"; e.currentTarget.style.color = "#80aaff"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#98a2b8"; }}
          >
            + add material
          </button>

          <MaterialCategoryPills categories={orderedCats} active={matCat} onSelect={setMatCat} />

          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: "min(52vh, 520px)", overflowY: "auto" }}>
            {pinnedCurrent && (
              <>
                <div style={{ color: "#98a2b8", fontSize: 9, letterSpacing: 1, padding: "0 2px" }}>
                  CURRENT · {pinnedCurrent.category ?? "Other"}
                </div>
                {renderTile(pinnedCurrent)}
                <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "3px 0" }} />
              </>
            )}
            {inCategory.map(renderTile)}
          </div>

      {splitTile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ ...LABEL, marginBottom: 0, width: 60, flexShrink: 0 }}>TILE X</div>
            <input type="number" step={0.1} min={0.1} value={tileXStr}
              onChange={e => { setTileXStr(e.target.value); schedule(() => commitTileX(e.target.value)); }}
              onBlur={e => flush(() => commitTileX(e.target.value))}
              style={{ ...NUM_INPUT, padding: "3px 6px", fontSize: 10 }}
            />
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ ...LABEL, marginBottom: 0, width: 60, flexShrink: 0 }}>TILE Y</div>
            <input type="number" step={0.1} min={0.1} value={tileYStr}
              onChange={e => { setTileYStr(e.target.value); schedule(() => commitTileY(e.target.value)); }}
              onBlur={e => flush(() => commitTileY(e.target.value))}
              style={{ ...NUM_INPUT, padding: "3px 6px", fontSize: 10 }}
            />
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div style={{ ...LABEL, marginBottom: 0, width: 60, flexShrink: 0 }}>TILE</div>
          <input type="number" step={0.1} min={0.1} value={tileStr}
            onChange={e => { setTileStr(e.target.value); schedule(() => commitTile(e.target.value)); }}
            onBlur={e => flush(() => commitTile(e.target.value))}
            style={{ ...NUM_INPUT, padding: "3px 6px", fontSize: 10 }}
          />
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input type="checkbox" id="split-tile" checked={splitTile} onChange={toggleSplitTile}
          style={{ cursor: "pointer", accentColor: "#4d8cff", margin: 0 }}
        />
        <label htmlFor="split-tile" style={{ color: "#98a2b8", fontSize: 10, cursor: "pointer", userSelect: "none" }}>
          split X / Y
        </label>
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <div style={{ ...LABEL, marginBottom: 0, width: 60, flexShrink: 0 }}>OFFSET</div>
        <input type="number" step={0.1} value={offXStr}
          onChange={e => { setOffXStr(e.target.value); schedule(() => commitOffX(e.target.value)); }}
          onBlur={e => flush(() => commitOffX(e.target.value))}
          style={{ ...NUM_INPUT, padding: "3px 6px", fontSize: 10 }}
        />
        <input type="number" step={0.1} value={offYStr}
          onChange={e => { setOffYStr(e.target.value); schedule(() => commitOffY(e.target.value)); }}
          onBlur={e => flush(() => commitOffY(e.target.value))}
          style={{ ...NUM_INPUT, padding: "3px 6px", fontSize: 10 }}
        />
      </div>

      {extraTilingControls}

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 8 }}>
        <div style={{ ...LABEL, marginBottom: 6 }}>MAPS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {MAP_ROWS.map(({ key, label: mapLabel }) => {
            const enabled = effectiveEnabled(key);
            const ov      = isOverridden(key);
            return (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={enabled} onChange={() => toggleMap(key)}
                  style={{ accentColor: "#80aaff", cursor: "pointer", flexShrink: 0 }}
                />
                <span style={{ color: ov ? "#c0c0c0" : "#8b94a8", fontSize: 10, fontFamily: "monospace", flex: 1, fontStyle: ov ? "italic" : "normal" }}>
                  {mapLabel}{ov ? "*" : ""}
                </span>
                {key === "roughness" && (
                  <>
                    {overrides?.roughnessVal !== undefined && (
                      <button
                        title={`Reset to this material's default (${baseDef?.roughnessVal ?? 0.85})`}
                        onClick={() => {
                          const d = baseDef?.roughnessVal ?? 0.85;
                          setRoughStr(String(d));
                          onOverridesChange({ ...overrides, roughnessVal: undefined });
                        }}
                        style={{ background: "none", border: "none", color: "#4a9eff", fontSize: 11, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}
                      >↺</button>
                    )}
                    <input type="number" step={0.05} min={0} max={roughEnabled ? 2 : 1} value={roughStr}
                      title={roughEnabled
                        ? `Scales the roughness texture — 0 = mirror · up to 2 for extra-matte (texture pixels are darker than 1, so >1 buys real headroom) · this material's default: ${baseDef?.roughnessVal ?? 0.85}`
                        : `0 = mirror-shiny · 1 = fully matte · this material's default: ${baseDef?.roughnessVal ?? 0.85}`}
                      onChange={e => { setRoughStr(e.target.value); schedule(() => commitRough(e.target.value)); }}
                      onBlur={e => flush(() => commitRough(e.target.value))}
                      style={{ ...NUM_INPUT, width: 52, padding: "2px 5px", fontSize: 10 }}
                    />
                  </>
                )}
                {key === "displacement" && dispEnabled && (
                  <input type="number" step={0.005} min={0} value={dispStr}
                    onChange={e => { setDispStr(e.target.value); schedule(() => commitDisp(e.target.value)); }}
                    onBlur={e => flush(() => commitDisp(e.target.value))}
                    style={{ ...NUM_INPUT, width: 52, padding: "2px 5px", fontSize: 10 }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
            </>
          )}

          {isColorMode && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{ ...LABEL, marginBottom: 0, width: 60, flexShrink: 0 }}>COLOR</div>
                <input type="color" value={colorStr}
                  onChange={e => { setColorStr(e.target.value); schedule(() => commitColor(e.target.value)); }}
                  onBlur={e => flush(() => commitColor(e.target.value))}
                  style={{ width: 36, height: 26, padding: 0, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, background: "none", cursor: "pointer" }}
                />
                <input type="text" value={colorStr} placeholder="#888888"
                  onChange={e => { setColorStr(e.target.value); schedule(() => commitColor(e.target.value)); }}
                  onBlur={e => flush(() => commitColor(colorStr))}
                  style={{ ...NUM_INPUT, padding: "3px 6px", fontSize: 10, width: 80 }}
                />
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{ ...LABEL, marginBottom: 0, width: 60, flexShrink: 0 }}>ROUGHNESS</div>
                <input type="number" step={0.05} min={0} max={1} value={roughStr}
                  onChange={e => { setRoughStr(e.target.value); schedule(() => commitRough(e.target.value)); }}
                  onBlur={e => flush(() => commitRough(e.target.value))}
                  style={{ ...NUM_INPUT, padding: "3px 6px", fontSize: 10, width: 60 }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── OpeningRow ────────────────────────────────────────────────────────────────

function OpeningRow({ opening, onUpdate, onDelete, hideDelete, zones = [], activeZoneId }: {
  opening:      Opening;
  onUpdate:     (changes: Partial<Opening>) => void;
  onDelete:     () => void;
  hideDelete?:  boolean;
  zones?:       ZoneDef[];
  activeZoneId?: string | null;
}) {
  const [offsetStr,  setOffsetStr]  = useState(String(opening.offsetAlongWall));
  const [widthStr,   setWidthStr]   = useState(String(opening.width));
  const [heightStr,  setHeightStr]  = useState(String(opening.height));
  const [elevStr,    setElevStr]    = useState(String(opening.elevation));
  const [innerHStr,  setInnerHStr]  = useState(String(opening.innerTileH ?? ""));
  const [innerVStr,  setInnerVStr]  = useState(String(opening.innerTileV ?? ""));
  const [zonePickerOpen, setZonePickerOpen] = useState(false);

  useEffect(() => {
    setOffsetStr(String(opening.offsetAlongWall));
    setWidthStr(String(opening.width));
    setHeightStr(String(opening.height));
    setElevStr(String(opening.elevation));
    setInnerHStr(String(opening.innerTileH ?? ""));
    setInnerVStr(String(opening.innerTileV ?? ""));
  }, [opening.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setHeightStr(String(opening.height));
    setElevStr(String(opening.elevation));
  }, [opening.type]); // eslint-disable-line react-hooks/exhaustive-deps

  const { schedule, flush } = useFieldDebounce(300);

  const commitNum = (val: string, min: number, field: keyof Opening) => {
    const n = parseFloat(val);
    if (Number.isFinite(n) && n >= min) onUpdate({ [field]: n } as Partial<Opening>);
  };

  const commitInnerTile = (val: string, field: "innerTileH" | "innerTileV") => {
    if (val === "" || val === undefined) { onUpdate({ [field]: undefined }); return; }
    const n = parseFloat(val);
    if (Number.isFinite(n) && n > 0) onUpdate({ [field]: n });
  };

  return (
    <div style={{ background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "6px 8px", marginBottom: 6, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <select
          value={opening.type}
          onChange={e => onUpdate({ type: e.target.value as Opening["type"] })}
          style={{ ...NUM_INPUT, width: "auto", padding: "2px 4px", cursor: "pointer" }}
        >
          <option value="door">Door</option>
          <option value="window">Window</option>
          <option value="arch">Arch</option>
          <option value="passage">Passage</option>
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {opening.type !== "passage" && (
            <label style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}>
              <input type="checkbox" checked={opening.trim !== false} onChange={e => onUpdate({ trim: e.target.checked })} style={{ cursor: "pointer", accentColor: "#4d8cff" }} />
              <span style={{ ...LABEL, marginBottom: 0, userSelect: "none" }}>TRIM</span>
            </label>
          )}
          {!hideDelete && (
            <button onClick={onDelete} style={{ background: "transparent", border: "none", color: "#ff6b6b", cursor: "pointer", fontSize: 14, padding: "0 2px", lineHeight: 1 }}>×</button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        {([
          ["OFFSET", offsetStr, setOffsetStr, 0,   "offsetAlongWall"],
          ["WIDTH",  widthStr,  setWidthStr,  0.1, "width"],
          ["HEIGHT", heightStr, setHeightStr, 0.1, "height"],
          ["ELEV",   elevStr,   setElevStr,   0,   "elevation"],
        ] as const).map(([lbl, val, setter, min, field]) => (
          <div key={field}>
            <div style={{ ...LABEL, marginBottom: 2 }}>{lbl}</div>
            <input type="number" step={0.1} min={min} value={val}
              style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
              onChange={e => { setter(e.target.value); schedule(() => commitNum(e.target.value, min, field)); }}
              onBlur={e => flush(() => commitNum(e.target.value, min, field))}
            />
          </div>
        ))}

        <div>
          <div style={{ ...LABEL, marginBottom: 2 }}>INNER T+B</div>
          <input type="number" step={0.1} min={0.01} placeholder="auto" value={innerHStr}
            style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
            onChange={e => { setInnerHStr(e.target.value); schedule(() => commitInnerTile(e.target.value, "innerTileH")); }}
            onBlur={e => flush(() => commitInnerTile(e.target.value, "innerTileH"))}
          />
        </div>
        <div>
          <div style={{ ...LABEL, marginBottom: 2 }}>INNER L+R</div>
          <input type="number" step={0.1} min={0.01} placeholder="auto" value={innerVStr}
            style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
            onChange={e => { setInnerVStr(e.target.value); schedule(() => commitInnerTile(e.target.value, "innerTileV")); }}
            onBlur={e => flush(() => commitInnerTile(e.target.value, "innerTileV"))}
          />
        </div>
      </div>

      {(opening.type === "door" || opening.type === "arch") && (
        <div style={{ marginTop: 4 }}>
          <div style={{ ...LABEL }}>ZONE LINK</div>
          {!zonePickerOpen ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ flex: 1, fontSize: 10, color: opening.linkedZoneId ? "#80aaff" : "#98a2b8", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {opening.linkedZoneId
                  ? (zones.find(z => z.id === opening.linkedZoneId)?.name ?? "unknown zone")
                  : "not linked"}
              </span>
              <button
                onClick={() => setZonePickerOpen(true)}
                style={{ background: "rgba(80,140,255,0.1)", border: "1px solid rgba(80,140,255,0.25)", borderRadius: 3, color: "#80aaff", fontSize: 9, cursor: "pointer", padding: "2px 8px", fontFamily: "monospace", flexShrink: 0 }}
              >
                {opening.linkedZoneId ? "change" : "link"}
              </button>
              {opening.linkedZoneId && (
                <button
                  onClick={() => onUpdate({ linkedZoneId: null })}
                  style={{ background: "transparent", border: "none", color: "#ff6b6b", cursor: "pointer", fontSize: 13, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
                  title="Unlink zone"
                >×</button>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {zones.filter(z => z.id !== activeZoneId).map(z => (
                <button
                  key={z.id}
                  onClick={() => { onUpdate({ linkedZoneId: z.id }); setZonePickerOpen(false); }}
                  style={{
                    background: z.id === opening.linkedZoneId ? "rgba(80,140,255,0.15)" : "rgba(40,40,40,0.8)",
                    border: `1px solid ${z.id === opening.linkedZoneId ? "rgba(80,140,255,0.4)" : "rgba(255,255,255,0.06)"}`,
                    borderRadius: 3, color: z.id === opening.linkedZoneId ? "#80aaff" : "#909090",
                    fontSize: 10, cursor: "pointer", padding: "3px 8px",
                    fontFamily: "monospace", textAlign: "left",
                  }}
                >{z.name}</button>
              ))}
              {zones.filter(z => z.id !== activeZoneId).length === 0 && (
                <div style={{ color: "#98a2b8", fontSize: 10, fontStyle: "italic" }}>No other zones</div>
              )}
              <button
                onClick={() => setZonePickerOpen(false)}
                style={{ background: "none", border: "none", color: "#585870", cursor: "pointer", fontSize: 9, padding: "2px 0", textAlign: "left" }}
              >cancel</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── WallSegmentRow ────────────────────────────────────────────────────────────

function WallSegmentRow({ index, wall, zoneId, materialList, onAddMaterial, onUpdate, bus, getNodeLinks }: {
  index:         number;
  wall:          WallDef;
  zoneId:        string;
  materialList:  MaterialDef[];
  onAddMaterial: () => void;
  onUpdate:      (changes: Partial<WallDef>) => void;
  bus?:          EventBus;
  getNodeLinks?: (zoneId: string, nodeId: string) => NodeLinks;
}) {
  // Linked = a floor/platform shares one of this wall's nodes. Wall–wall sharing is
  // ignored — chained walls always share nodes and would chip every row.
  const linked = !!getNodeLinks && [wall.startNodeId, wall.endNodeId].some(nid => {
    const l = getNodeLinks(zoneId, nid);
    return l.floorIds.length > 0 || l.platformIds.length > 0;
  });
  const [tileStr, setTileStr] = useState(String(wall.materialOverrides?.tileScale ?? ""));
  const hoveringRef = useRef(false);

  useEffect(() => {
    setTileStr(String(wall.materialOverrides?.tileScale ?? ""));
  }, [wall.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear the canvas highlight if this row unmounts while hovered (screen close, run change).
  useEffect(() => () => {
    if (hoveringRef.current) bus?.emit("wall:segment-hover", { zoneId, wallId: null });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { schedule, flush } = useFieldDebounce(300);

  const commitTile = (val: string) => {
    const trimmed = val.trim();
    if (trimmed === "") { onUpdate({ materialOverrides: undefined }); return; }
    const n = parseFloat(trimmed);
    if (Number.isFinite(n) && n > 0) onUpdate({ materialOverrides: { ...(wall.materialOverrides ?? {}), tileScale: n } });
  };

  return (
    <div
      style={{ background: "rgba(20,30,45,0.6)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 4, padding: "6px 8px", marginBottom: 4, opacity: wall.hidden ? 0.55 : 1 }}
      onMouseEnter={() => { hoveringRef.current = true;  bus?.emit("wall:segment-hover", { zoneId, wallId: wall.id }); }}
      onMouseLeave={() => { hoveringRef.current = false; bus?.emit("wall:segment-hover", { zoneId, wallId: null }); }}
    >
      <div style={{ display: "flex", alignItems: "center", marginBottom: 5 }}>
        <span style={{ color: "#8b94a8", fontSize: 9, letterSpacing: 1 }}>SEG {index}</span>
        {wall.hidden && <span style={{ color: "#8a6d3b", fontSize: 8, letterSpacing: 1, marginLeft: 6 }}>HIDDEN</span>}
        {linked && <span style={{ color: "#4d8cff", fontSize: 8, letterSpacing: 1, marginLeft: 6 }}>LINKED</span>}
        <span style={{ flex: 1 }} />
        <button
          onClick={() => onUpdate({ hidden: !wall.hidden })}
          title={wall.hidden ? "Show segment" : "Hide segment (stays in the run — no visual, no collision)"}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, lineHeight: 1, padding: "0 2px", opacity: wall.hidden ? 0.35 : 1 }}
        >👁</button>
      </div>

      <div style={{ marginBottom: 4 }}>
        <div style={{ ...LABEL, marginBottom: 2 }}>MATERIAL</div>
        <select value={wall.material} onChange={e => onUpdate({ material: e.target.value, materialOverrides: undefined })}
          style={{ ...NUM_INPUT, padding: "2px 4px", cursor: "pointer" }}
        >
          {materialList.length === 0 && <option value={wall.material}>{wall.material}</option>}
          {materialList.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <div style={{ ...LABEL, marginBottom: 0, flexShrink: 0 }}>TILE</div>
        <input type="number" step={0.1} min={0.1} placeholder="default" value={tileStr}
          style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
          onChange={e => { setTileStr(e.target.value); schedule(() => commitTile(e.target.value)); }}
          onBlur={e => flush(() => commitTile(e.target.value))}
        />
      </div>
    </div>
  );
}

// ── SpawnSettingsView ─────────────────────────────────────────────────────────

function SpawnSettingsView({
  settings, assets, onChange, position, onPositionChange, screen, onOpen,
}: { settings: PlayerSettings; assets: AssetDef[]; onChange: (s: Partial<PlayerSettings>) => void; position?: Vec3; onPositionChange?: (pos: Vec3) => void;
     screen: ScreenId | null; onOpen: (s: ScreenId) => void }) {
  const numField = (label: string, key: keyof PlayerSettings, step = 0.1, fallback?: number, help?: string) => (
    <div key={key}>
      <div style={{ ...LABEL, marginBottom: 3, display: "flex", alignItems: "center", gap: 5 }}>
        <span>{label}</span>
        {help && <HelpTooltip text={help} />}
      </div>
      <input
        type="number" step={step}
        defaultValue={(settings[key] as number) ?? fallback}
        key={String(settings[key] ?? fallback)}
        onBlur={e => { const n = parseFloat(e.target.value); if (Number.isFinite(n)) onChange({ [key]: n }); }}
        style={{ width: "100%", boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, background: "rgba(40,40,40,0.9)", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace", padding: "3px 6px", outline: "none" }}
      />
    </div>
  );

  const modelAssets = assets.filter(a => a.category === "Characters" || a.category === "Props" || a.category === "Other");

  // Per-character locomotion clip overrides (third-person). Clip list comes from the selected
  // model's imported animation names; the auto match mirrors CharacterController._clipFor.
  const modelClips = assets.find(a => a.id === settings.modelAssetId)?.animations ?? [];
  const animSlots: { slot: LocomotionState; label: string }[] = [
    { slot: "idle",      label: "IDLE" },
    { slot: "walk",      label: "WALK" },
    { slot: "jump",      label: "JUMP (takeoff)" },
    { slot: "jump_idle", label: "JUMP IDLE (in air)" },
    { slot: "jump_land", label: "JUMP LAND" },
    { slot: "climb",     label: "CLIMB (ladders)" },
  ];
  const autoClip = (intent: string): string | undefined => {
    const lc = intent.toLowerCase();
    return modelClips.find(c => c.toLowerCase() === lc) ?? modelClips.find(c => c.toLowerCase().includes(lc));
  };
  const animField = (slot: LocomotionState, label: string) => {
    const cur = settings.animClips?.[slot];                       // undefined | null | string
    const value = cur === undefined ? "__auto__" : cur === null ? "__none__" : cur;
    const auto = autoClip(slot);
    return (
      <div key={slot}>
        <div style={{ ...LABEL, marginBottom: 3 }}>{label}</div>
        <select
          value={value}
          onChange={e => {
            const v = e.target.value;
            const next = v === "__auto__" ? undefined : v === "__none__" ? null : v;
            onChange({ animClips: { ...settings.animClips, [slot]: next } });
          }}
          style={{ width: "100%", background: "rgba(40,40,40,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "#c0c0c0", fontSize: 10, fontFamily: "monospace", padding: "4px 6px" }}
        >
          <option value="__auto__">{auto ? `Auto (${auto})` : "Auto (none found)"}</option>
          <option value="__none__">None</option>
          {modelClips.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    );
  };

  const posField = (axis: "x" | "y" | "z") => (
    <div key={axis} style={{ flex: 1 }}>
      <div style={{ ...LABEL, marginBottom: 2 }}>{axis.toUpperCase()}</div>
      <input
        type="number" step={0.5}
        defaultValue={position ? Math.round(position[axis] * 100) / 100 : 0}
        key={position ? Math.round(position[axis] * 100) / 100 : 0}
        onBlur={e => {
          const n = parseFloat(e.target.value);
          if (!Number.isFinite(n) || !position || !onPositionChange) return;
          onPositionChange({ ...position, [axis]: n });
        }}
        style={{ width: "100%", boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, background: "rgba(40,40,40,0.9)", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace", padding: "3px 6px", outline: "none" }}
      />
    </div>
  );

  const PAGE: React.CSSProperties = { padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 };
  const BLURB: React.CSSProperties = { color: "#98a2b8", fontSize: 10, fontFamily: "monospace", lineHeight: 1.4 };
  const is3rd = settings.cameraMode === "thirdperson";
  // Small section header inside the Camera page; the badge marks which mode plays.
  const groupHead = (label: string, active: boolean) => (
    <div style={{ ...LABEL, fontSize: 10, marginTop: 4, display: "flex", gap: 6, alignItems: "center" }}>
      <span>{label}</span>
      {active && <span style={{ color: "#80aaff", fontSize: 8, letterSpacing: 1,
        border: "1px solid rgba(80,140,255,0.35)", borderRadius: 3, padding: "1px 4px" }}>ACTIVE</span>}
    </div>
  );
  const modeToggle = (
    <div>
      <div style={{ ...LABEL, marginBottom: 4 }}>CAMERA MODE</div>
      <div style={{ display: "flex", gap: 4 }}>
        {(["fps", "thirdperson"] as const).map(mode => (
          <button
            key={mode}
            onClick={() => onChange({ cameraMode: mode })}
            style={{
              flex: 1, padding: "4px 8px", borderRadius: 4, cursor: "pointer",
              fontSize: 10, fontFamily: "monospace",
              background: settings.cameraMode === mode ? "rgba(80,140,255,0.25)" : "rgba(40,40,40,0.9)",
              border: `1px solid ${settings.cameraMode === mode ? "rgba(80,140,255,0.5)" : "rgba(255,255,255,0.1)"}`,
              color: settings.cameraMode === mode ? "#80aaff" : "#9090a0",
            }}
          >{mode === "fps" ? "FPS" : "3rd Person"}</button>
        ))}
      </div>
    </div>
  );

  if (screen === "spawn-movement") return (
    <div style={PAGE}>
      {numField("MOVE SPEED", "moveSpeed", 0.5)}
      {numField("JUMP HEIGHT", "jumpHeight", 0.1)}
      {numField("CLIMB SPEED", "climbSpeed", 0.5, 2,
        "Vertical speed on ladders (metres/second). W climbs up, S climbs down, jump lets go.")}
      <div style={BLURB}>
        Movement is shared — these apply identically in FPS and 3rd person.
      </div>
    </div>
  );

  if (screen === "spawn-camera") return (
    <div style={PAGE}>
      {modeToggle}
      {groupHead("FPS", !is3rd)}
      {numField("FOV", "fov", 1)}
      {numField("FPS EYE HEIGHT", "fpsEyeHeight", 0.1,
        +(1.8 * (settings.fpsCharacterScale ?? 1) - 0.1).toFixed(2),   // live derived default (tracks FPS Character Scale while unset)
        "Camera height above the character's feet (metres). While unset it tracks FPS Character Scale (shown value); once set it is absolute. Camera only — does not change the collision size.")}
      {groupHead("THIRD PERSON", is3rd)}
      {numField("CAMERA DISTANCE", "thirdPersonDistance", 0.5, undefined,
        "How far behind the character the camera sits (metres). Larger = pulled further back. A wall behind you can pull it in closer automatically.")}
      {numField("CAMERA HEIGHT", "thirdPersonHeight", 0.5, undefined,
        "Height of the camera's aim point above the player (metres). This is CAMERA framing, not the character's size. Higher = the camera sits higher and frames the head/above (character appears lower, seen more from above); lower = aims toward the feet. To resize the character itself, use Character Scale.")}
      {numField("CAMERA ANGLE", "thirdPersonPitch", 1, 0,
        "How many degrees the camera STARTS tilted down toward the character (0 = level, straight ahead). Raising it lifts the camera up and aims it down, keeping the character and the ground ahead both in view — try 15–25 for a platformer. Players can still look around; this is just the angle after spawns.")}
      <div style={BLURB}>
        Both groups are saved with the world; CAMERA MODE picks which one plays.
      </div>
    </div>
  );

  if (screen === "spawn-character") return (
    <div style={PAGE}>
      <div>
        <div style={{ ...LABEL, marginBottom: 4 }}>CHARACTER MODEL</div>
        <select
          value={settings.modelAssetId ?? ""}
          onChange={e => onChange({ modelAssetId: e.target.value || null })}
          style={{ width: "100%", background: "rgba(40,40,40,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "#c0c0c0", fontSize: 10, fontFamily: "monospace", padding: "4px 6px" }}
        >
          <option value="">None (capsule only)</option>
          {modelAssets.map(a => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
      </div>
      {numField("CHARACTER SCALE (3RD PERSON)", "characterScale", 0.1, 1,
        "Third-person character size — the visible avatar AND its collision capsule. 2 = twice as tall; 0.5 = half. Does not affect FPS mode (that has its own FPS Character Scale). After scaling up you may want to raise Camera Height/Distance.")}
      {numField("FPS CHARACTER SCALE", "fpsCharacterScale", 0.1, 1,
        "FPS collision-capsule size (and default eye height). Independent of the third-person Character Scale — a small third-person avatar keeps a normal FPS viewpoint. Default 1.")}
      {numField("JUMP ANIM SPEED", "jumpAnimSpeed", 0.1, 1,
        "Playback speed of the jump animation (3rd person — FPS shows no avatar).")}
      {modelClips.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ ...LABEL, marginBottom: 0 }}>CHARACTER ANIMATIONS</div>
          {animSlots.map(({ slot, label }) => animField(slot, label))}
          <div style={BLURB}>Animations play on the 3rd-person avatar (FPS hides the model).</div>
        </div>
      )}
    </div>
  );

  // The SAME page the root Audio menu opens (audio-character) — one component,
  // two entry points, so the two routes can't drift.
  if (screen === "spawn-sounds") return (
    <CharacterSoundsPage playerSettings={settings} onPlayerSettingsChange={onChange} />
  );

  if (screen === "spawn-controls") return (
    <div style={{ padding: "14px 16px" }}>
      <ControlsSection />
    </div>
  );

  // Root: position + a menu of grouped sub-pages (the audio-menu idiom) with live summaries.
  const fmt = (v: unknown) => v == null ? "—" : String(v);
  const modelLabel = assets.find(a => a.id === settings.modelAssetId)?.label ?? "capsule only";
  return (
    <>
      <div style={{ padding: "14px 16px 10px", display: "flex", flexDirection: "column", gap: 10 }}>
        {position && (
          <div>
            <div style={{ ...LABEL, marginBottom: 4 }}>POSITION</div>
            <div style={{ display: "flex", gap: 6 }}>
              {posField("x")}{posField("y")}{posField("z")}
            </div>
          </div>
        )}
        <div style={{ color: "#98a2b8", fontSize: 11 }}>Player settings for this world.</div>
      </div>
      <CategoryRow label="Movement"
        summary={`speed ${fmt(settings.moveSpeed)} · jump ${fmt(settings.jumpHeight)}`}
        onPress={() => onOpen("spawn-movement")} />
      <CategoryRow label="Camera"
        summary={is3rd ? `3rd person · ${fmt(settings.thirdPersonDistance)}m back` : `FPS · fov ${fmt(settings.fov)}`}
        onPress={() => onOpen("spawn-camera")} />
      <CategoryRow label="Character"
        summary={modelLabel}
        onPress={() => onOpen("spawn-character")} />
      <CategoryRow label="Character Sounds"
        summary={(() => {
          const n = [settings.footstepSound, settings.jumpSound, settings.landSound].filter(Boolean).length;
          return n ? `${n} of 3 set` : "none";
        })()}
        onPress={() => onOpen("spawn-sounds")} />
      <CategoryRow label="Controls"
        summary="this device"
        onPress={() => onOpen("spawn-controls")} />
    </>
  );
}

// ── CheckpointView ────────────────────────────────────────────────────────────

function CheckpointView({ selected, onDelete, onObjectUpdate }: {
  selected:       SelectedObjectPayload;
  onDelete?:      () => void;
  onObjectUpdate: (changes: Partial<WorldObject>) => void;
}) {
  const cp = selected.data as CheckpointDef | null;
  const [posStr, setPosStr] = useState({ x: String(cp?.position.x ?? 0), y: String(cp?.position.y ?? 0), z: String(cp?.position.z ?? 0) });
  const [facing, setFacing] = useState(String(cp?.facingDeg ?? 0));
  const { schedule, flush } = useFieldDebounce(300);

  useEffect(() => {
    setPosStr({ x: String(cp?.position.x ?? 0), y: String(cp?.position.y ?? 0), z: String(cp?.position.z ?? 0) });
    setFacing(String(cp?.facingDeg ?? 0));
  }, [selected.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Resync when moved/rotated externally (gizmo drag refreshes selected.data).
  useEffect(() => { setPosStr({ x: String(cp?.position.x ?? 0), y: String(cp?.position.y ?? 0), z: String(cp?.position.z ?? 0) }); }, [cp?.position.x, cp?.position.y, cp?.position.z]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setFacing(String(cp?.facingDeg ?? 0)); }, [cp?.facingDeg]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cp) return null;

  const commitPos    = (axis: "x" | "y" | "z", val: string) => { const n = parseFloat(val); if (Number.isFinite(n)) onObjectUpdate({ position: { ...cp.position, [axis]: n } } as unknown as Partial<WorldObject>); };
  const commitFacing = (val: string) => { const n = parseFloat(val); if (Number.isFinite(n)) onObjectUpdate({ facingDeg: n } as unknown as Partial<WorldObject>); };

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace", lineHeight: 1.5,
                    padding: "6px 8px", background: "rgba(255,255,255,0.03)",
                    borderRadius: 4, border: "1px solid rgba(255,255,255,0.06)" }}>
        An inert checkpoint marker (position + facing). It does nothing on its own — use a
        script's <b>store_position</b> (source: object → this checkpoint) to save it as a
        respawn point, then <b>teleport_player</b> back to it.
      </div>
      <div>
        <div style={LABEL}>POSITION</div>
        <div style={{ display: "flex", gap: 4 }}>
          {([["x","#ff6b6b"],["y","#6bff8a"],["z","#6b8aff"]] as const).map(([axis, color]) => (
            <div key={axis} style={{ flex: 1, display: "flex", gap: 4, alignItems: "center", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 6px" }}>
              <span style={{ color, fontSize: 9 }}>{axis.toUpperCase()}</span>
              <input type="number" step={0.5} value={posStr[axis]}
                onChange={e => { setPosStr(p => ({ ...p, [axis]: e.target.value })); schedule(() => commitPos(axis, e.target.value)); }}
                onBlur={e => flush(() => commitPos(axis, e.target.value))}
                onKeyDown={e => { if (e.key === "Enter") flush(() => commitPos(axis, (e.target as HTMLInputElement).value)); }}
                style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace" }}
              />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div style={LABEL}>FACING (Y°)</div>
        <input type="number" step={15} value={facing} style={{ ...NUM_INPUT, width: 90 }}
          onChange={e => { setFacing(e.target.value); schedule(() => commitFacing(e.target.value)); }}
          onBlur={e => flush(() => commitFacing(e.target.value))}
          onKeyDown={e => { if (e.key === "Enter") flush(() => commitFacing((e.target as HTMLInputElement).value)); }}
        />
      </div>
      {onDelete && (
        <button onClick={onDelete}
          style={{ padding: "8px 0", background: "rgba(204,102,102,0.12)", border: "1px solid rgba(204,102,102,0.4)",
                   borderRadius: 4, color: "#cc6666", fontSize: 11, fontFamily: "monospace", cursor: "pointer" }}>
          Delete Checkpoint
        </button>
      )}
    </div>
  );
}

// ── LightView ─────────────────────────────────────────────────────────────────

const LIGHT_KIND_HELP: Record<string, string> = {
  point:       "Glows in all directions from a point — lamps, torches, glow effects.",
  spot:        "A cone of light aimed with pitch/yaw — spotlights, streetlamps.",
  directional: "Parallel rays from a direction (position doesn't affect the light) — an extra sun/moon.",
};

function LightView({ selected, onDelete, onObjectUpdate }: {
  selected:       SelectedObjectPayload;
  onDelete?:      () => void;
  onObjectUpdate: (changes: Partial<WorldObject>) => void;
}) {
  const light = selected.data as LightDef | null;
  const [posStr, setPosStr] = useState({ x: String(light?.position.x ?? 0), y: String(light?.position.y ?? 0), z: String(light?.position.z ?? 0) });
  const [numStr, setNumStr] = useState({
    intensity: String(light?.intensity ?? 0), range: String(light?.range ?? 0),
    angle: String(light?.angleDeg ?? 30), pitch: String(light?.pitchDeg ?? 90), yaw: String(light?.yawDeg ?? 0),
    famount: String(light?.flicker?.amount ?? 0), fspeed: String(light?.flicker?.speed ?? 1),
  });
  const { schedule, flush } = useFieldDebounce(300);

  useEffect(() => {
    setPosStr({ x: String(light?.position.x ?? 0), y: String(light?.position.y ?? 0), z: String(light?.position.z ?? 0) });
    setNumStr({
      intensity: String(light?.intensity ?? 0), range: String(light?.range ?? 0),
      angle: String(light?.angleDeg ?? 30), pitch: String(light?.pitchDeg ?? 90), yaw: String(light?.yawDeg ?? 0),
      famount: String(light?.flicker?.amount ?? 0), fspeed: String(light?.flicker?.speed ?? 1),
    });
  }, [selected.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Resync position when moved externally (gizmo drag refreshes selected.data).
  useEffect(() => { setPosStr({ x: String(light?.position.x ?? 0), y: String(light?.position.y ?? 0), z: String(light?.position.z ?? 0) }); }, [light?.position.x, light?.position.y, light?.position.z]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!light) return null;

  const update     = (changes: Partial<LightDef>) => onObjectUpdate(changes as unknown as Partial<WorldObject>);
  const commitPos  = (axis: "x" | "y" | "z", val: string) => { const n = parseFloat(val); if (Number.isFinite(n)) update({ position: { ...light.position, [axis]: n } }); };
  const commitNum  = (key: keyof LightDef, val: string, min = -Infinity) => { const n = parseFloat(val); if (Number.isFinite(n)) update({ [key]: Math.max(min, n) }); };

  const numField = (label: string, stateKey: keyof typeof numStr, defKey: keyof LightDef, step: number, min = 0, suffix?: string) => (
    <div>
      <div style={LABEL}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input type="number" step={step} value={numStr[stateKey]} style={{ ...NUM_INPUT, width: 90 }}
          onChange={e => { const v = e.target.value; setNumStr(p => ({ ...p, [stateKey]: v })); schedule(() => commitNum(defKey, v, min)); }}
          onBlur={e => flush(() => commitNum(defKey, e.target.value, min))}
          onKeyDown={e => { if (e.key === "Enter") flush(() => commitNum(defKey, (e.target as HTMLInputElement).value, min)); }}
        />
        {suffix && <span style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace" }}>{suffix}</span>}
      </div>
    </div>
  );

  const isPoint = light.kind === "point";

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace", lineHeight: 1.5,
                    padding: "6px 8px", background: "rgba(255,255,255,0.03)",
                    borderRadius: 4, border: "1px solid rgba(255,255,255,0.06)" }}>
        {LIGHT_KIND_HELP[light.kind]}
      </div>

      <div>
        <div style={LABEL}>COLOR</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="color" value={light.color}
            onChange={e => update({ color: e.target.value })}
            style={{ width: 42, height: 26, padding: 0, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 4, background: "transparent", cursor: "pointer" }}
          />
          <span style={{ color: "#909090", fontSize: 11, fontFamily: "monospace" }}>{light.color}</span>
        </div>
      </div>

      {numField("INTENSITY", "intensity", "intensity", isPoint || light.kind === "spot" ? 5 : 0.25)}
      {light.kind !== "directional" && numField("RANGE (M)", "range", "range", 1, 0, "0 = unlimited")}
      {light.kind === "spot" && numField("CONE ANGLE (°)", "angle", "angleDeg", 5, 1)}
      {light.kind !== "point" && (
        <div style={{ display: "flex", gap: 10 }}>
          {numField("AIM PITCH (°)", "pitch", "pitchDeg", 5, -90)}
          {numField("AIM YAW (°)", "yaw", "yawDeg", 15, -Infinity)}
        </div>
      )}

      <div>
        <div style={LABEL}>FLICKER</div>
        <div style={{ display: "flex", gap: 4, marginBottom: light.flicker ? 8 : 0 }}>
          {([["none", "None"], ["flame", "🔥 Flame"], ["electric", "⚡ Electric"]] as const).map(([style, label]) => {
            const active = (light.flicker?.style ?? "none") === style;
            return (
              <button key={style}
                onClick={() => update({
                  flicker: style === "none" ? undefined : {
                    style,
                    // per-style defaults on first pick; keep values when switching styles
                    amount: light.flicker?.amount ?? (style === "flame" ? 0.4 : 1),
                    speed:  light.flicker?.speed ?? 1,
                  },
                })}
                style={{ flex: 1, padding: "6px 0", borderRadius: 4, cursor: "pointer", fontSize: 10, fontFamily: "monospace",
                         border: active ? "1px solid rgba(80,140,255,0.5)" : "1px solid rgba(255,255,255,0.1)",
                         background: active ? "rgba(80,140,255,0.18)" : "rgba(46,46,46,0.9)",
                         color: active ? "#cfe0ff" : "#909090" }}>
                {label}
              </button>
            );
          })}
        </div>
        {light.flicker && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {([
              ["AMOUNT", "famount", "amount", 0.05, 0, 1, ["0 to 1", "0 = flicker does nothing", "1 = flicker can take the light fully to black"]],
              ["SPEED", "fspeed", "speed", 0.25, 0.1, 20, ["1 = neutral", "0.5 = half as fast", "2 = twice as fast"]],
            ] as const).map(([label, sk, dk, step, min, max, hints]) => (
              <div key={sk}>
                <div style={LABEL}>{label}</div>
                <input type="number" step={step} min={min} max={max} value={numStr[sk]} style={{ ...NUM_INPUT, width: 70 }}
                  onChange={e => {
                    const v = e.target.value; setNumStr(p => ({ ...p, [sk]: v }));
                    schedule(() => { const n = parseFloat(v); if (Number.isFinite(n) && light.flicker) update({ flicker: { ...light.flicker, [dk]: Math.min(max, Math.max(min, n)) } }); });
                  }}
                  onBlur={e => flush(() => { const n = parseFloat(e.target.value); if (Number.isFinite(n) && light.flicker) update({ flicker: { ...light.flicker, [dk]: Math.min(max, Math.max(min, n)) } }); })}
                />
                <div style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace", lineHeight: 1.5, marginTop: 4 }}>
                  {hints.map(h => <div key={h}>{h}</div>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={light.castShadow}
          onChange={e => update({ castShadow: e.target.checked })} />
        <span style={{ color: "#c0c0c0", fontSize: 11, fontFamily: "monospace" }}>CAST SHADOWS</span>
      </label>
      {light.castShadow && (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginLeft: 22 }}>
            <input type="checkbox" checked={light.staticShadow ?? false}
              onChange={e => update({ staticShadow: e.target.checked })} />
            <span style={{ color: "#c0c0c0", fontSize: 11, fontFamily: "monospace" }}>STATIC SHADOWS</span>
          </label>
          <div style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace", lineHeight: 1.4 }}>
            {light.staticShadow
              ? "Shadow renders once (near-free per frame). Editing geometry refreshes it, but MOVING objects/platforms won't update this light's shadow."
              : "Shadow re-renders every frame — expensive, keep to a few per zone (watch the FPS counter). Turn on STATIC SHADOWS if nothing moves under this light."}
          </div>
        </>
      )}

      <div>
        <div style={LABEL}>POSITION</div>
        <div style={{ display: "flex", gap: 4 }}>
          {([["x","#ff6b6b"],["y","#6bff8a"],["z","#6b8aff"]] as const).map(([axis, color]) => (
            <div key={axis} style={{ flex: 1, display: "flex", gap: 4, alignItems: "center", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 6px" }}>
              <span style={{ color, fontSize: 9 }}>{axis.toUpperCase()}</span>
              <input type="number" step={0.5} value={posStr[axis]}
                onChange={e => { setPosStr(p => ({ ...p, [axis]: e.target.value })); schedule(() => commitPos(axis, e.target.value)); }}
                onBlur={e => flush(() => commitPos(axis, e.target.value))}
                onKeyDown={e => { if (e.key === "Enter") flush(() => commitPos(axis, (e.target as HTMLInputElement).value)); }}
                style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace" }}
              />
            </div>
          ))}
        </div>
      </div>

      {onDelete && (
        <button onClick={onDelete}
          style={{ padding: "8px 0", background: "rgba(204,102,102,0.12)", border: "1px solid rgba(204,102,102,0.4)",
                   borderRadius: 4, color: "#cc6666", fontSize: 11, fontFamily: "monospace", cursor: "pointer" }}>
          Delete Light
        </button>
      )}
    </div>
  );
}

// ── DecalView ─────────────────────────────────────────────────────────────────

function DecalView({ selected, onDelete, onObjectUpdate, decalTextures }: {
  selected:       SelectedObjectPayload;
  onDelete?:      () => void;
  onObjectUpdate: (changes: Partial<WorldObject>) => void;
  decalTextures:  DecalTexDef[];
}) {
  const dec = selected.data as DecalDef | null;
  const [posStr,  setPosStr]  = useState({ x: String(dec?.position.x ?? 0), y: String(dec?.position.y ?? 0), z: String(dec?.position.z ?? 0) });
  const [sizeStr, setSizeStr] = useState({ w: String(dec?.size.width ?? 1), h: String(dec?.size.height ?? 1) });
  const [rotStr,  setRotStr]  = useState(String(dec?.rotation ?? 0));
  const [opStr,   setOpStr]   = useState(String(dec?.opacity ?? 1));
  const { schedule, flush } = useFieldDebounce(300);

  useEffect(() => {
    setPosStr({ x: String(dec?.position.x ?? 0), y: String(dec?.position.y ?? 0), z: String(dec?.position.z ?? 0) });
    setSizeStr({ w: String(dec?.size.width ?? 1), h: String(dec?.size.height ?? 1) });
    setRotStr(String(dec?.rotation ?? 0));
    setOpStr(String(dec?.opacity ?? 1));
  }, [selected.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Resync when moved externally (gizmo drag refreshes selected.data).
  useEffect(() => { setPosStr({ x: String(dec?.position.x ?? 0), y: String(dec?.position.y ?? 0), z: String(dec?.position.z ?? 0) }); }, [dec?.position.x, dec?.position.y, dec?.position.z]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!dec) return null;

  const commit = (changes: Partial<DecalDef>) => onObjectUpdate(changes as unknown as Partial<WorldObject>);
  const commitPos = (axis: "x" | "y" | "z", val: string) => {
    const n = parseFloat(val);
    if (Number.isFinite(n)) commit({ position: { ...dec.position, [axis]: n } });
  };
  const commitSize = (dim: "width" | "height", val: string) => {
    const n = parseFloat(val);
    if (Number.isFinite(n) && n >= 0.05) commit({ size: { ...dec.size, [dim]: n } });
  };
  const commitRot = (val: string) => { const n = parseFloat(val); if (Number.isFinite(n)) commit({ rotation: n }); };
  const commitOp  = (val: string) => { const n = parseFloat(val); if (Number.isFinite(n)) commit({ opacity: Math.max(0, Math.min(1, n)) }); };
  const commitRoughMod = (val: string) => {
    if (val.trim() === "") { commit({ roughnessMod: undefined }); return; }
    const n = parseFloat(val);
    if (Number.isFinite(n)) commit({ roughnessMod: Math.max(0, Math.min(1, n)) });
  };

  const swapTextures = decalTextures.filter(t => t.kinds.includes(dec.kind));

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace", lineHeight: 1.5,
                    padding: "6px 8px", background: "rgba(255,255,255,0.03)",
                    borderRadius: 4, border: "1px solid rgba(255,255,255,0.06)" }}>
        A <b>{dec.kind}</b> decal projected onto nearby static geometry from its anchor
        point. Moving it re-projects; if no surface is in range it keeps its data and
        renders nothing.
      </div>

      <div>
        <div style={LABEL}>TEXTURE</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
          {swapTextures.map(t => (
            <button key={t.id} title={t.label} onClick={() => commit({ textureId: t.id })}
              style={{
                aspectRatio: "1", padding: 0, borderRadius: 4, cursor: "pointer",
                background: `#3a3a3a url("${t.path}") center/cover`,
                border: t.id === dec.textureId ? "2px solid rgba(80,140,255,0.8)" : "1px solid rgba(255,255,255,0.08)",
              }}
            />
          ))}
        </div>
      </div>

      <div>
        <div style={LABEL}>POSITION</div>
        <div style={{ display: "flex", gap: 4 }}>
          {([["x","#ff6b6b"],["y","#6bff8a"],["z","#6b8aff"]] as const).map(([axis, color]) => (
            <div key={axis} style={{ flex: 1, display: "flex", gap: 4, alignItems: "center", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 6px" }}>
              <span style={{ color, fontSize: 9 }}>{axis.toUpperCase()}</span>
              <input type="number" step={0.1} value={posStr[axis]}
                onChange={e => { setPosStr(p => ({ ...p, [axis]: e.target.value })); schedule(() => commitPos(axis, e.target.value)); }}
                onBlur={e => flush(() => commitPos(axis, e.target.value))}
                onKeyDown={e => { if (e.key === "Enter") flush(() => commitPos(axis, (e.target as HTMLInputElement).value)); }}
                style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace" }}
              />
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={LABEL}>WIDTH (m)</div>
          <input type="number" step={0.1} min={0.05} value={sizeStr.w} style={NUM_INPUT}
            onChange={e => { setSizeStr(s => ({ ...s, w: e.target.value })); schedule(() => commitSize("width", e.target.value)); }}
            onBlur={e => flush(() => commitSize("width", e.target.value))}
            onKeyDown={e => { if (e.key === "Enter") flush(() => commitSize("width", (e.target as HTMLInputElement).value)); }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={LABEL}>HEIGHT (m)</div>
          <input type="number" step={0.1} min={0.05} value={sizeStr.h} style={NUM_INPUT}
            onChange={e => { setSizeStr(s => ({ ...s, h: e.target.value })); schedule(() => commitSize("height", e.target.value)); }}
            onBlur={e => flush(() => commitSize("height", e.target.value))}
            onKeyDown={e => { if (e.key === "Enter") flush(() => commitSize("height", (e.target as HTMLInputElement).value)); }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={LABEL}>ROTATION (°)</div>
          <input type="number" step={15} value={rotStr} style={NUM_INPUT}
            onChange={e => { setRotStr(e.target.value); schedule(() => commitRot(e.target.value)); }}
            onBlur={e => flush(() => commitRot(e.target.value))}
            onKeyDown={e => { if (e.key === "Enter") flush(() => commitRot((e.target as HTMLInputElement).value)); }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={LABEL}>OPACITY</div>
          <input type="number" step={0.1} min={0} max={1} value={opStr} style={NUM_INPUT}
            onChange={e => { setOpStr(e.target.value); schedule(() => commitOp(e.target.value)); }}
            onBlur={e => flush(() => commitOp(e.target.value))}
            onKeyDown={e => { if (e.key === "Enter") flush(() => commitOp((e.target as HTMLInputElement).value)); }}
          />
        </div>
      </div>

      {dec.kind === "surface" && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 10, color: "#909090" }}>
              <input type="checkbox" checked={!!dec.triplanar}
                onChange={e => commit({ triplanar: e.target.checked })} />
              TRIPLANAR (wraps corners)
            </label>
          </div>
          <div style={{ flex: 1 }}>
            <div style={LABEL}>WET ROUGHNESS (blank = off)</div>
            <input type="number" step={0.1} min={0} max={1} defaultValue={dec.roughnessMod ?? ""} style={NUM_INPUT}
              key={`${selected.id}-rough`}
              onBlur={e => commitRoughMod(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") commitRoughMod((e.target as HTMLInputElement).value); }}
            />
          </div>
        </div>
      )}

      {onDelete && (
        <button onClick={onDelete}
          style={{ padding: "8px 0", background: "rgba(204,102,102,0.12)", border: "1px solid rgba(204,102,102,0.4)",
                   borderRadius: 4, color: "#cc6666", fontSize: 11, fontFamily: "monospace", cursor: "pointer" }}>
          Delete Decal
        </button>
      )}
    </div>
  );
}

// ── TriggerVolumeView ─────────────────────────────────────────────────────────

const DEFAULT_VOLUME_VISUAL: TriggerVolumeVisual = {
  enabled: true, style: "gradient", color: "#5a3d8f", fadeDir: "up", opacity: 0.8, fadeHeight: 1, animate: false,
};
const clamp01 = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;

/** Shared script list rows (volume ENTRY/EXIT section + object Scripts screen):
 *  enabled dot, label, trigger + action count, delete — editing happens in the
 *  Scripts panel. */
function ScriptListRows({ scripts, emptyHint, onToggle, onDelete, onOpen }: {
  scripts:   ScriptDef[];
  emptyHint: string;
  onToggle?: (id: string) => void;
  onDelete?: (id: string) => void;
  /** Row click → open this script's editor in the Scripts panel. */
  onOpen?:   (id: string) => void;
}) {
  return (
    <>
      {scripts.length === 0 && (
        <div style={{ color: "#98a2b8", fontSize: 10, fontStyle: "italic" }}>{emptyHint}</div>
      )}
      {scripts.map(s => (
        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4,
                                  background: "rgba(255,255,255,0.03)", borderRadius: 4,
                                  padding: "4px 8px", border: "1px solid rgba(255,255,255,0.05)" }}>
          <div
            onClick={() => onToggle?.(s.id)}
            title={s.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
            style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, cursor: onToggle ? "pointer" : "default",
                     background: s.enabled ? "#44cc88" : "#444" }}
          />
          <div
            onClick={() => onOpen?.(s.id)}
            title={onOpen ? "Open this script in the Scripts panel" : undefined}
            style={{ flex: 1, minWidth: 0, cursor: onOpen ? "pointer" : "default" }}
          >
            <div style={{ color: "#b0b0b0", fontSize: 11, fontFamily: "monospace",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.label}
            </div>
            <div style={{ color: "#00ffcc", fontSize: 9, opacity: 0.7 }}>
              {s.trigger.type} · {s.actions.length} action{s.actions.length !== 1 ? "s" : ""}
            </div>
          </div>
          {onDelete && (
            <button
              onClick={() => onDelete(s.id)}
              title="Remove this script"
              style={{ background: "none", border: "none", color: "#664444", fontSize: 13,
                       cursor: "pointer", padding: "0 2px", lineHeight: 1 }}
            >×</button>
          )}
        </div>
      ))}
      {scripts.length > 0 && (
        <div style={{ color: "#98a2b8", fontSize: 9, fontStyle: "italic", marginTop: 4 }}>
          {onOpen ? "Click a script to edit its actions →" : "Edit actions in the Scripts panel →"}
        </div>
      )}
    </>
  );
}

// ── ObjectScriptsScreen ───────────────────────────────────────────────────────
// Scripts attached to a placed object — same list as a volume's ENTRY/EXIT
// section, editing stays in the Scripts panel. The add button presets the
// trigger from what the object supports.
// ── EnemyAIScreen (Phase 61) ──────────────────────────────────────────────────
// Detect → chase/circle → attack, driven by the EnemyAI runtime system.
// Damage is applied to a GLOBAL state key (the player's health key); enemy
// death stays authored via the entity's own STATE + scripts (Phase 60).
function EnemyAIScreen({ selected, assets, onObjectUpdate, bus }: {
  selected: SelectedObjectPayload;
  assets: AssetDef[];
  onObjectUpdate: (changes: Partial<WorldObject>) => void;
  bus?: EventBus;
}) {
  const obj = selected.data as WorldObject | null;
  const ai = obj?.ai;
  const [showRanges, setShowRanges] = useState(false);
  // Viewport rings for the radii being edited (AiRangeRings listens). Re-emits
  // on every value change so the circles track typing; clears on toggle-off,
  // deselect, and unmount.
  const detect = ai?.detectRadius ?? 6;
  const ranges = {
    detect,
    giveUp: ai?.giveUpRadius ?? detect * 1.5,
    attack: ai?.attackRange ?? 1.2,
    leash:  ai?.freeRoam ? null : (ai?.leashRadius ?? 12),
  };
  const rangesJson = JSON.stringify(ranges);
  const wantRings = showRanges && !!obj && !!ai?.enabled;
  useEffect(() => {
    if (!bus || !wantRings) return;
    bus.emit("ai:range-preview", { objectId: obj.id, ranges: JSON.parse(rangesJson) });
    return () => bus.emit("ai:range-preview", { objectId: null });
  }, [bus, wantRings, obj?.id, rangesJson]);
  if (!obj) return null;
  const write = (changes: Partial<EnemyAIDef>) =>
    onObjectUpdate({ ai: { enabled: ai?.enabled ?? false, ...(ai ?? {}), ...changes } });
  const clips = assets.find(a => a.id === obj.assetId)?.animations ?? [];
  const ROW: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 };
  type NumKey = "detectRadius" | "giveUpRadius" | "attackRange" | "moveSpeed" | "attackDamage"
    | "attackCooldown" | "damageMoment" | "variation" | "leashRadius";
  const numRow = (label: string, key: NumKey, dflt: number, step: number, title: string, dot?: string) => (
    <div style={ROW} title={title}>
      <span style={{ color: "#9aa3b5", fontSize: 10, letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 5 }}>
        {dot && showRanges && <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0 }} />}
        {label}
      </span>
      <input type="number" step={step} style={{ ...NUM_INPUT, width: 72 }}
        key={obj.id + key + String(ai?.[key] ?? "")}
        defaultValue={ai?.[key] ?? dflt}
        onBlur={e => { const n = parseFloat(e.target.value); write({ [key]: Number.isFinite(n) ? n : undefined } as Partial<EnemyAIDef>); }}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
    </div>
  );
  const clipRow = (label: string, key: "idleClip" | "walkClip" | "attackClip", title: string) => (
    <div style={ROW} title={title}>
      <span style={{ color: "#9aa3b5", fontSize: 10, letterSpacing: 0.5 }}>{label}</span>
      <select style={{ background: "rgba(40,40,40,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "#c2cadb", fontSize: 10, fontFamily: "monospace", padding: "2px 4px", width: 140 }}
        value={ai?.[key] === null ? "__none__" : (ai?.[key] ?? "__auto__")}
        onChange={e => write({ [key]: e.target.value === "__auto__" ? undefined : e.target.value === "__none__" ? null : e.target.value } as Partial<EnemyAIDef>)}>
        <option value="__auto__">auto (name match)</option>
        <option value="__none__">none</option>
        {clips.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );
  return (
    <div style={{ padding: "12px 16px" }}>
      <div style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace", lineHeight: 1.5,
                    padding: "6px 8px", background: "rgba(255,255,255,0.03)",
                    borderRadius: 4, border: "1px solid rgba(255,255,255,0.06)", marginBottom: 10 }}>
        The enemy notices the player inside DETECT RADIUS, chases (with some
        circling), and bites in ATTACK RANGE — subtracting ATTACK DAMAGE from
        the global DAMAGE KEY. Hook effects with the on_player_detected /
        on_player_lost / on_enemy_attack triggers on this object&apos;s scripts.
        Making the enemy killable is authored: give it its own STATE (e.g.
        health) and a despawn script.
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 10 }}>
        <input type="checkbox" checked={ai?.enabled ?? false}
          onChange={e => write({ enabled: e.target.checked })} />
        <span style={{ fontSize: 11, color: "#c2cadb" }}>Enable enemy AI</span>
      </label>
      {ai?.enabled && (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 8 }}
                 title="Draws the radii below as colored circles around this enemy in the viewport while this screen is open">
            <input type="checkbox" checked={showRanges} onChange={e => setShowRanges(e.target.checked)} />
            <span style={{ fontSize: 10, color: "#c2cadb", letterSpacing: 0.5 }}>SHOW RANGES IN VIEWPORT</span>
          </label>
          {numRow("DETECT RADIUS", "detectRadius", 6, 0.5, "Notices the player within this many metres (horizontal; max 3m height difference)", "#37d67a")}
          {numRow("GIVE-UP RADIUS", "giveUpRadius", (ai?.detectRadius ?? 6) * 1.5, 0.5, "Loses the player beyond this (bigger than detect = doesn't flicker at the edge)", "#e8c14b")}
          {numRow("ATTACK RANGE", "attackRange", 1.2, 0.1, "Starts a bite within this distance", "#ff5d5d")}
          {numRow("MOVE SPEED", "moveSpeed", 2.5, 0.25, "Chase speed, metres/second (player walks ~6)")}
          {numRow("ATTACK DAMAGE", "attackDamage", 1, 1, "Subtracted from DAMAGE KEY when a bite lands")}
          <div style={ROW} title="The GLOBAL state key a landed bite reduces — the player's health key (this game may use Hearts)">
            <span style={{ color: "#9aa3b5", fontSize: 10, letterSpacing: 0.5 }}>DAMAGE KEY</span>
            <input list="wb-state-keys" style={{ ...NUM_INPUT, width: 110 }}
              key={obj.id + "dmgkey" + (ai?.damageKey ?? "")}
              defaultValue={ai?.damageKey ?? "health"}
              onBlur={e => write({ damageKey: e.target.value.trim() || undefined })}
              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
          </div>
          {numRow("ATTACK COOLDOWN", "attackCooldown", 1.5, 0.1, "Seconds between bites")}
          {numRow("DAMAGE MOMENT", "damageMoment", 0.4, 0.05, "Seconds into the attack clip when the hit actually lands (mid-lunge, not wind-up)")}
          {numRow("VARIATION", "variation", 0.5, 0.1, "0–1: circling approach, jittered attack timing, occasional feints. 0 = straight beeline")}
          <div style={ROW} title="No leash: chases the player anywhere, and after losing them stays where it is instead of walking back to its placed spot">
            <span style={{ color: "#9aa3b5", fontSize: 10, letterSpacing: 0.5 }}>FREE ROAM</span>
            <input type="checkbox" checked={ai?.freeRoam ?? false}
              onChange={e => write({ freeRoam: e.target.checked || undefined })} />
          </div>
          {!ai?.freeRoam &&
            numRow("LEASH RADIUS", "leashRadius", 12, 1, "Max distance from its placed spot — beyond it, gives up and walks home", "#58a6ff")}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "8px 0" }} />
          {clipRow("IDLE CLIP", "idleClip", "Played while standing guard")}
          {clipRow("WALK CLIP", "walkClip", "Played while chasing / returning (auto also matches 'run')")}
          {clipRow("ATTACK CLIP", "attackClip", "Played once per bite (auto also matches 'bite')")}
        </>
      )}
    </div>
  );
}

// ── EntityStateSection (Phase 60) ─────────────────────────────────────────────
// Per-entity state keys: schema rows (key / type / default / min-max) stored on
// the entity's `stateSchema`; values live namespaced in the global GameState and
// are shown here live during preview. The raw `__ent.` keys are never displayed.
function EntityStateSection({ entityId, stateSchema, onObjectUpdate, bus }: {
  entityId: string;
  stateSchema?: Record<string, StateSchema>;
  onObjectUpdate?: (changes: Partial<WorldObject>) => void;
  bus?: EventBus;
}) {
  const [, setRev] = useState(0);
  useEffect(() => bus?.on("state:changed", () => setRev(r => r + 1)), [bus]);
  const [newKey, setNewKey] = useState("");
  const entries = Object.entries(stateSchema ?? {});
  const write = (schema: Record<string, StateSchema>) =>
    onObjectUpdate?.({ stateSchema: Object.keys(schema).length ? schema : undefined } as Partial<WorldObject>);
  const setEntry    = (key: string, s: StateSchema) => write({ ...(stateSchema ?? {}), [key]: s });
  const removeEntry = (key: string) => { const c = { ...(stateSchema ?? {}) }; delete c[key]; write(c); };
  const addKey = () => {
    const k = newKey.trim().replace(/\s+/g, "_");
    if (!k || stateSchema?.[k]) return;
    setEntry(k, { type: "number", default: 0 });
    setNewKey("");
  };
  const SEL: React.CSSProperties = { background: "rgba(40,40,40,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "#c2cadb", fontSize: 10, fontFamily: "monospace", padding: "2px 4px" };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={LABEL}>STATE (this {entityId.startsWith("vol_") ? "volume" : "object"} only)</div>
      </div>
      <div style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace", lineHeight: 1.5, marginBottom: 6 }}>
        Keys this entity tracks for itself (health, open, mood…) — every copy and
        prefab instance gets its own values. Scripts read/write them via the
        &ldquo;Whose state&rdquo; scope. Live values show while playing.
      </div>
      {entries.map(([key, s]) => {
        const live = gameState.get(entKey(entityId, key));
        return (
          <div key={key} style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginBottom: 4, padding: "4px 6px", background: "rgba(255,255,255,0.03)", borderRadius: 4 }}>
            <span style={{ color: "#c2cadb", fontSize: 11, fontFamily: "monospace", flex: "1 0 70px", overflow: "hidden", textOverflow: "ellipsis" }} title={key}>{key}</span>
            {live !== undefined && (
              <span title="live value (playing)" style={{ color: "#7fd0a0", fontSize: 10, fontFamily: "monospace" }}>▶ {String(live)}</span>
            )}
            <select style={SEL} value={s.type}
              onChange={e => {
                const type = e.target.value as StateSchema["type"];
                setEntry(key, { type, default: type === "number" ? 0 : type === "boolean" ? false : "" });
              }}>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
              <option value="string">string</option>
            </select>
            {s.type === "boolean" ? (
              <select style={SEL} value={String(s.default ?? false)} title="starting value"
                onChange={e => setEntry(key, { ...s, default: e.target.value === "true" })}>
                <option value="false">start: false</option>
                <option value="true">start: true</option>
              </select>
            ) : (
              <input style={{ ...SEL, width: 56 }} type={s.type === "number" ? "number" : "text"}
                title="starting value" placeholder="start"
                defaultValue={s.default == null ? "" : String(s.default)}
                key={key + "-def-" + String(s.default)}
                onBlur={e => setEntry(key, { ...s, default: s.type === "number" ? (parseFloat(e.target.value) || 0) : e.target.value })}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              />
            )}
            {s.type === "number" && (
              <>
                <input style={{ ...SEL, width: 44 }} type="number" title="minimum (clamped)" placeholder="min"
                  defaultValue={s.min ?? ""} key={key + "-min-" + String(s.min)}
                  onBlur={e => setEntry(key, { ...s, min: e.target.value === "" ? undefined : parseFloat(e.target.value) })}
                  onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                <input style={{ ...SEL, width: 44 }} type="number" title="maximum (clamped)" placeholder="max"
                  defaultValue={s.max ?? ""} key={key + "-max-" + String(s.max)}
                  onBlur={e => setEntry(key, { ...s, max: e.target.value === "" ? undefined : parseFloat(e.target.value) })}
                  onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
              </>
            )}
            <button title="remove key" onClick={() => removeEntry(key)}
              style={{ background: "none", border: "none", color: "#cc6666", cursor: "pointer", fontSize: 11, padding: "0 2px" }}>×</button>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 4 }}>
        <input style={{ ...SEL, flex: 1 }} placeholder="new key (e.g. health)" value={newKey}
          onChange={e => setNewKey(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") addKey(); }} />
        <button onClick={addKey} disabled={!newKey.trim()}
          style={{ ...SEL, cursor: "pointer", color: newKey.trim() ? "#80aaff" : "#666" }}>+ add</button>
      </div>
    </div>
  );
}

function ObjectScriptsScreen({ selected, onScriptsChange, onEditScript, onObjectUpdate, bus }: {
  selected: SelectedObjectPayload;
  onScriptsChange?: (scripts: ScriptDef[]) => void;
  onEditScript?: (scriptId: string) => void;
  onObjectUpdate?: (changes: Partial<WorldObject>) => void;
  bus?: EventBus;
}) {
  const obj = selected.data as WorldObject | null;
  if (!obj) return null;
  const scripts = obj.scripts ?? [];
  const hasSensor = (obj.colliders ?? []).some(c => c.isSensor);
  const preset: "on_interact" | "on_player_enter" | "on_game_start" =
    obj.properties.interactable ? "on_interact" : hasSensor ? "on_player_enter" : "on_game_start";

  const addScript = () => onScriptsChange?.([...scripts, {
    id: `scr_${crypto.randomUUID().slice(0, 8)}`,
    label: preset === "on_interact" ? "On Interact" : preset === "on_player_enter" ? "On Enter" : "New Script",
    zoneId: selected.zoneId,
    enabled: true,
    // No targetId — ScriptEngine keys entity triggers on the owning object.
    trigger: { type: preset },
    conditions: [], actions: [], oneShot: false,
  }]);

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace", lineHeight: 1.5,
                    padding: "6px 8px", background: "rgba(255,255,255,0.03)",
                    borderRadius: 4, border: "1px solid rgba(255,255,255,0.06)" }}>
        Scripts ride this object — copies keep them, and prefabs capture them.
        Target &ldquo;★ this object&rdquo; in an action to affect the object itself.
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={LABEL}>SCRIPTS</div>
        {onScriptsChange && (
          <button
            onClick={addScript}
            title={`Add a script (trigger preset: ${preset})`}
            style={{ padding: "2px 7px", fontSize: 10, fontFamily: "monospace", cursor: "pointer",
                     background: "rgba(0,255,200,0.1)", border: "1px solid rgba(0,255,200,0.25)",
                     borderRadius: 3, color: "#44ccaa" }}
          >+ Add</button>
        )}
      </div>
      <div>
        <ScriptListRows
          scripts={scripts}
          emptyHint="No scripts — hit + Add"
          onToggle={onScriptsChange ? (id) => onScriptsChange(scripts.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s)) : undefined}
          onDelete={onScriptsChange ? (id) => onScriptsChange(scripts.filter(s => s.id !== id)) : undefined}
          onOpen={onEditScript}
        />
      </div>
      {!obj.properties.interactable && !hasSensor && (
        <div style={{ color: "#9aa3b5", fontSize: 9, lineHeight: 1.5 }}>
          For on_interact, enable INTERACTABLE on the root screen. For
          on_player_enter / on_player_exit, add a Sensor collider (Colliders screen).
        </div>
      )}
      <EntityStateSection entityId={obj.id} stateSchema={obj.stateSchema} onObjectUpdate={onObjectUpdate} bus={bus} />
    </div>
  );
}

function blankVolumeScript(zoneId: string, type: "on_player_enter" | "on_player_exit"): ScriptDef {
  return {
    id:         `scr_${crypto.randomUUID().slice(0, 8)}`,
    label:      type === "on_player_enter" ? "On Enter" : "On Exit",
    zoneId,
    enabled:    true,
    // No targetId stamp — ScriptEngine.loadZone force-keys entity triggers on the
    // OWNING volume at index time, so a stamped id would only go stale on duplicate.
    trigger:    { type },
    conditions: [],
    actions:    [],
    oneShot:    false,
  };
}

// MOVE/RESIZE for trigger volumes is one-or-the-other (overlapping face handles and
// gizmo arrows fight for the pick). Sticky for the session so a resize pass over
// several volumes doesn't need re-toggling per selection; resets to MOVE on reload.
let TRIGGER_EDIT_MODE: "move" | "resize" = "move";

function TriggerVolumeView({ selected, onDelete, onScriptsChange, onEditScript, groups, groupsOpen, onToggleGroups, onObjectUpdate, onSelectGroup, bus, prefabSection, zone }: {
  selected:         SelectedObjectPayload;
  onDelete?:        () => void;
  onScriptsChange?: (scripts: ScriptDef[]) => void;
  onEditScript?:    (scriptId: string) => void;
  groups:           GroupDef[];
  groupsOpen:       boolean;
  onToggleGroups:   () => void;
  onObjectUpdate:   (changes: Partial<WorldObject>) => void;
  onSelectGroup?:   (groupId: string) => void;
  bus?:             EventBus;
  prefabSection?:   React.ReactNode;   // PrefabSection when this volume is an instance member (Phase 46)
  zone?:            ZoneDef;           // the volume's zone — sources the "Attached to" host list (Phase 53)
}) {
  const vol = selected.data as TriggerVolume | null;
  const [editMode, setEditModeState] = useState<"move" | "resize">(TRIGGER_EDIT_MODE);
  const setEditMode = (m: "move" | "resize") => { TRIGGER_EDIT_MODE = m; setEditModeState(m); };
  // Broadcast the mode to the resizer + move gizmo on selection and on toggle;
  // clear both when the view unmounts (deselect / different entity type).
  useEffect(() => {
    bus?.emit("trigger:resize-toggle", { enabled: editMode === "resize" });
    bus?.emit("gizmo:suspend", { source: "trigger-edit-mode", suspended: editMode === "resize" });
  }, [editMode, selected.id, bus]);
  useEffect(() => () => {
    bus?.emit("trigger:resize-toggle", { enabled: false });
    bus?.emit("gizmo:suspend", { source: "trigger-edit-mode", suspended: false });
  }, [bus]);
  const [posStr,  setPosStr]  = useState({ x: String(vol?.position.x ?? 0), y: String(vol?.position.y ?? 0), z: String(vol?.position.z ?? 0) });
  const [sizeStr, setSizeStr] = useState({ x: String(vol?.size.x ?? 1),     y: String(vol?.size.y ?? 1),     z: String(vol?.size.z ?? 1) });
  const { schedule, flush } = useFieldDebounce(300);

  useEffect(() => {
    setPosStr({ x: String(vol?.position.x ?? 0), y: String(vol?.position.y ?? 0), z: String(vol?.position.z ?? 0) });
    setSizeStr({ x: String(vol?.size.x ?? 1),    y: String(vol?.size.y ?? 1),     z: String(vol?.size.z ?? 1) });
  }, [selected.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Resync when position/size change externally (gizmo move, face-handle resize).
  useEffect(() => { setPosStr({ x: String(vol?.position.x ?? 0), y: String(vol?.position.y ?? 0), z: String(vol?.position.z ?? 0) }); }, [vol?.position.x, vol?.position.y, vol?.position.z]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSizeStr({ x: String(vol?.size.x ?? 1), y: String(vol?.size.y ?? 1), z: String(vol?.size.z ?? 1) }); }, [vol?.size.x, vol?.size.y, vol?.size.z]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!vol) return null;
  const scripts = vol.scripts ?? [];
  const vis = vol.visual;
  const shape = vol.shape ?? "box";
  const setVisual = (v: TriggerVolumeVisual) => onObjectUpdate({ visual: v } as Partial<WorldObject>);

  const commitPos  = (axis: "x" | "y" | "z", val: string) => { const n = parseFloat(val); if (Number.isFinite(n)) onObjectUpdate({ position: { ...vol.position, [axis]: n } } as Partial<WorldObject>); };
  // Floors: radius (size.x on round shapes) 0.25; box W/H/D 0.14 — the
  // user-measured functional minimum (thinner sensors stop registering the
  // player reliably). Matches the resizer's MIN/MIN_Y.
  const commitSize = (axis: "x" | "y" | "z", val: string) => {
    const n = parseFloat(val);
    const min = shape !== "box" && axis === "x" ? 0.25 : 0.14;
    if (Number.isFinite(n) && n >= min) onObjectUpdate({ size: { ...vol.size, [axis]: n } } as Partial<WorldObject>);
  };

  // Switching shape converts the size so the volume keeps roughly its footprint:
  // box → round inscribes the radius in the XZ extents; round → box circumscribes.
  const setShape = (next: TriggerVolumeShape) => {
    if (next === shape) return;
    const changes: { shape: TriggerVolumeShape; size?: Vec3 } = { shape: next };
    if (shape === "box" && next !== "box") {
      changes.size = { x: Math.max(0.25, Math.min(vol.size.x, vol.size.z) / 2), y: vol.size.y, z: vol.size.z };
    } else if (shape !== "box" && next === "box") {
      const d = vol.size.x * 2;
      changes.size = { x: d, y: shape === "sphere" ? d : vol.size.y, z: d };
    } else if (next === "sphere") {
      changes.size = { ...vol.size };   // radius carries over; height becomes 2r implicitly
    }
    onObjectUpdate(changes as Partial<WorldObject>);
  };

  function addScript(type: "on_player_enter" | "on_player_exit"): void {
    if (!onScriptsChange) return;
    onScriptsChange([...scripts, blankVolumeScript(vol!.zoneId, type)]);
  }

  function toggleScript(id: string): void {
    if (!onScriptsChange) return;
    onScriptsChange(scripts.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  }

  function deleteScript(id: string): void {
    if (!onScriptsChange) return;
    onScriptsChange(scripts.filter(s => s.id !== id));
  }

  return (
    <>
    {/* Prefab membership first (collapsed) — same top placement as the object root view. */}
    {prefabSection}
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace", lineHeight: 1.5,
                    padding: "6px 8px", background: "rgba(255,255,255,0.03)",
                    borderRadius: 4, border: "1px solid rgba(255,255,255,0.06)" }}>
        An invisible 3D detection region — box, sphere, cylinder, or capsule.
        Scripts fire when the player walks in or out. Trigger volumes are
        independent of map zones — they can run any action.
      </div>
      <div>
        <div style={LABEL}>LABEL</div>
        <div style={{ color: "#c0c0c0", fontSize: 11, fontFamily: "monospace" }}>{vol.label}</div>
      </div>
      <div>
        <div style={LABEL}>SHAPE</div>
        <div style={{ display: "flex", gap: 4 }}>
          {(["box", "sphere", "cylinder", "capsule"] as const).map(s => (
            <button key={s} onClick={() => setShape(s)}
              title={s === "box" ? "Rectangular volume" : `${s[0]!.toUpperCase() + s.slice(1)} volume — resize by drag handles (side = radius${s === "sphere" ? "" : ", top/bottom = height"}) or the numeric fields`}
              style={{
                flex: 1, padding: "5px 0", borderRadius: 4, fontSize: 9, fontFamily: "monospace",
                border: "1px solid " + (shape === s ? "rgba(80,140,255,0.5)" : "rgba(255,255,255,0.12)"),
                background: shape === s ? "rgba(80,140,255,0.25)" : "rgba(46,46,46,0.9)",
                color: shape === s ? "#80aaff" : "#c0c0c0", cursor: "pointer",
              }}>
              {s.toUpperCase().slice(0, s === "cylinder" ? 3 : s === "capsule" ? 4 : 6)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div style={LABEL}>EDIT MODE</div>
        <div style={{ display: "flex", gap: 4 }}>
          {(["move", "resize"] as const).map(m => (
            <button key={m} onClick={() => setEditMode(m)}
              title={m === "move" ? "Show the move/rotate gizmo (hides resize handles)" : "Show the face resize handles (hides the move gizmo)"}
              style={{
                flex: 1, padding: "5px 0", borderRadius: 4, fontSize: 10, fontFamily: "monospace",
                border: "1px solid " + (editMode === m ? "rgba(80,140,255,0.5)" : "rgba(255,255,255,0.12)"),
                background: editMode === m ? "rgba(80,140,255,0.25)" : "rgba(46,46,46,0.9)",
                color: editMode === m ? "#80aaff" : "#c0c0c0", cursor: "pointer",
              }}>
              {m === "move" ? "MOVE" : "RESIZE"}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div style={LABEL}>POSITION</div>
        <div style={{ display: "flex", gap: 4 }}>
          {([["x","#ff6b6b"],["y","#6bff8a"],["z","#6b8aff"]] as const).map(([axis, color]) => (
            <div key={axis} style={{ flex: 1, display: "flex", gap: 4, alignItems: "center", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 6px" }}>
              <span style={{ color, fontSize: 9 }}>{axis.toUpperCase()}</span>
              <input type="number" step={0.5} value={posStr[axis]}
                onChange={e => { setPosStr(p => ({ ...p, [axis]: e.target.value })); schedule(() => commitPos(axis, e.target.value)); }}
                onBlur={e => flush(() => commitPos(axis, e.target.value))}
                onKeyDown={e => { if (e.key === "Enter") flush(() => commitPos(axis, (e.target as HTMLInputElement).value)); }}
                style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace" }}
              />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div style={LABEL}>SIZE</div>
        <div style={{ display: "flex", gap: 4 }}>
          {(shape === "box"    ? [["x","W"],["y","H"],["z","D"]] as const :
            shape === "sphere" ? [["x","RADIUS"]] as const :
                                 [["x","RADIUS"],["y","HEIGHT"]] as const
          ).map(([axis, lbl]) => (
            <div key={axis} style={{ flex: 1 }}>
              <div style={{ color: "#8b94a8", fontSize: 9, letterSpacing: 1, marginBottom: 2 }}>{lbl}</div>
              <input type="number" step={shape !== "box" && axis === "x" ? 0.25 : axis === "y" ? 0.1 : 0.5}
                min={shape !== "box" && axis === "x" ? 0.25 : 0.14} value={sizeStr[axis]}
                style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                onChange={e => { setSizeStr(p => ({ ...p, [axis]: e.target.value })); schedule(() => commitSize(axis, e.target.value)); }}
                onBlur={e => flush(() => commitSize(axis, e.target.value))}
                onKeyDown={e => { if (e.key === "Enter") flush(() => commitSize(axis, (e.target as HTMLInputElement).value)); }}
              />
            </div>
          ))}
        </div>
        {shape === "capsule" && vol.size.y < vol.size.x * 2 &&
          <div style={{ color: "#c9a86a", fontSize: 9, marginTop: 3 }}>
            Height below 2× radius — the capsule rounds up to a sphere of this radius.
          </div>}
      </div>
      <div>
        <div style={LABEL}>ROTATION (Y°)</div>
        <input
          type="number"
          key={vol.id + "-roty"}
          defaultValue={vol.rotation?.y ?? 0}
          style={NUM_INPUT}
          onBlur={e => onObjectUpdate({ rotation: { x: 0, y: parseFloat(e.target.value) || 0, z: 0 } } as Partial<WorldObject>)}
          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
      </div>

      {/* Attached to (Phase 53): the volume rides a mover-enabled entity — its
          sensor + visuals follow in preview/game. Position stays the rest pose. */}
      <div>
        <div style={LABEL}>ATTACHED TO</div>
        <select
          value={vol.attachTo ?? ""}
          onChange={e => onObjectUpdate({ attachTo: e.target.value || undefined } as Partial<WorldObject>)}
          style={{
            width: "100%", padding: "4px 6px", borderRadius: 4, cursor: "pointer",
            fontFamily: "monospace", fontSize: 10,
            border: "1px solid rgba(255,255,255,0.1)", background: "rgba(46,46,46,0.9)", color: "#c2cadb",
          }}
        >
          <option value="">— not attached (static) —</option>
          {(["platforms", "shapes", "objects"] as const).map(kind => {
            const hosts = ((zone?.[kind] ?? []) as Array<{ id: string; label?: string; assetId?: string; mover?: { enabled?: boolean } }>)
              .filter(h => h.mover?.enabled);
            if (!hosts.length) return null;
            return (
              <optgroup key={kind} label={kind[0]!.toUpperCase() + kind.slice(1)}>
                {hosts.map(h => (
                  <option key={h.id} value={h.id}>
                    {h.label || h.assetId || h.id} ({h.id.slice(0, 8)})
                  </option>
                ))}
              </optgroup>
            );
          })}
          {/* Dangling host (deleted / mover removed): keep it visible instead of silently clearing. */}
          {vol.attachTo &&
            !(["platforms", "shapes", "objects"] as const).some(kind =>
              ((zone?.[kind] ?? []) as Array<{ id: string; mover?: { enabled?: boolean } }>)
                .some(h => h.id === vol.attachTo && h.mover?.enabled)) && (
            <option value={vol.attachTo}>{vol.attachTo} (missing/no mover — static)</option>
          )}
        </select>
        {vol.attachTo && (
          <div style={{ color: "#9aa3b5", fontSize: 9, marginTop: 3, lineHeight: 1.5 }}>
            Rides this entity's mover in preview/game. Position above is the rest pose.
          </div>
        )}
      </div>

      {/* Per-entity state keys (Phase 60) */}
      <EntityStateSection entityId={vol.id} stateSchema={vol.stateSchema} onObjectUpdate={onObjectUpdate} bus={bus} />

      {/* Visual section — optional decorative fill (shows in preview + game) */}
      <div>
        <div style={LABEL}>VISUAL</div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: vis?.enabled ? 8 : 0 }}>
          <input
            type="checkbox"
            checked={vis?.enabled ?? false}
            onChange={e => setVisual(e.target.checked ? { ...(vis ?? DEFAULT_VOLUME_VISUAL), enabled: true } : { ...(vis ?? DEFAULT_VOLUME_VISUAL), enabled: false })}
          />
          <span style={{ fontSize: 10, color: "#9090a0" }}>Show gradient fill</span>
        </label>
        {vis?.enabled && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: "#9090a0" }}>Color</span>
              <input type="color" value={vis.color}
                onChange={e => setVisual({ ...vis, color: e.target.value })}
                style={{ width: 44, height: 22, padding: 0, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 3, background: "transparent", cursor: "pointer" }} />
            </label>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: "#9090a0" }}>Fade</span>
              <select value={vis.fadeDir}
                onChange={e => setVisual({ ...vis, fadeDir: e.target.value as "up" | "down" })}
                style={{ ...NUM_INPUT, width: 100, cursor: "pointer" }}>
                <option value="up">Fade up</option>
                <option value="down">Fade down</option>
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: "#9090a0" }}>Opacity</span>
              <input type="number" step={0.05} min={0} max={1} defaultValue={vis.opacity} key={vol.id + "-vopacity"}
                onBlur={e => setVisual({ ...vis, opacity: clamp01(parseFloat(e.target.value)) })}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                style={{ ...NUM_INPUT, width: 100 }} />
            </label>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: "#9090a0" }}>Gradient height</span>
              <input type="number" step={0.05} min={0.05} max={1} defaultValue={vis.fadeHeight} key={vol.id + "-vfade"}
                onBlur={e => setVisual({ ...vis, fadeHeight: clamp01(parseFloat(e.target.value)) || 1 })}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                style={{ ...NUM_INPUT, width: 100 }} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={vis.animate}
                onChange={e => setVisual({ ...vis, animate: e.target.checked })} />
              <span style={{ fontSize: 10, color: "#9090a0" }}>Animate (pulse)</span>
            </label>
          </div>
        )}
      </div>

      {/* Editor shading — per-volume tint of the editor-only wireframe + fill */}
      <div>
        <div style={LABEL}>EDITOR SHADING</div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: vol.editorTint ? 8 : 0 }}>
          <input
            type="checkbox"
            checked={!!vol.editorTint}
            onChange={e => onObjectUpdate({ editorTint: e.target.checked ? { color: "#ffcc00", opacity: 0.12 } : undefined } as Partial<WorldObject>)}
          />
          <span style={{ fontSize: 10, color: "#9090a0" }}>Custom color / opacity (editor only)</span>
        </label>
        {vol.editorTint && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: "#9090a0" }}>Color</span>
              <input type="color" value={vol.editorTint.color}
                onChange={e => onObjectUpdate({ editorTint: { ...vol.editorTint!, color: e.target.value } } as Partial<WorldObject>)}
                style={{ width: 44, height: 22, padding: 0, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 3, background: "transparent", cursor: "pointer" }} />
            </label>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: "#9090a0" }}>Fill opacity</span>
              <input type="number" step={0.05} min={0} max={1} defaultValue={vol.editorTint.opacity} key={vol.id + "-etint"}
                onBlur={e => onObjectUpdate({ editorTint: { ...vol.editorTint!, opacity: clamp01(parseFloat(e.target.value)) } } as Partial<WorldObject>)}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                style={{ ...NUM_INPUT, width: 100 }} />
            </label>
          </div>
        )}
      </div>

      {/* Scripts section */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={LABEL}>ENTRY / EXIT SCRIPTS</div>
          {onScriptsChange && (
            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={() => addScript("on_player_enter")}
                title="Add a script that fires when the player walks in"
                style={{ padding: "2px 7px", fontSize: 10, fontFamily: "monospace", cursor: "pointer",
                         background: "rgba(0,255,200,0.1)", border: "1px solid rgba(0,255,200,0.25)",
                         borderRadius: 3, color: "#44ccaa" }}
              >+ Enter</button>
              <button
                onClick={() => addScript("on_player_exit")}
                title="Add a script that fires when the player walks out"
                style={{ padding: "2px 7px", fontSize: 10, fontFamily: "monospace", cursor: "pointer",
                         background: "rgba(255,200,0,0.1)", border: "1px solid rgba(255,200,0,0.25)",
                         borderRadius: 3, color: "#ccaa44" }}
              >+ Exit</button>
            </div>
          )}
        </div>
        <ScriptListRows
          scripts={scripts}
          emptyHint="No scripts — add Entry or Exit above"
          onToggle={onScriptsChange ? toggleScript : undefined}
          onDelete={onScriptsChange ? deleteScript : undefined}
          onOpen={onEditScript}
        />
      </div>

      {onDelete && (
        <button
          onClick={onDelete}
          style={{
            marginTop: 4, padding: "6px 0", width: "100%",
            background: "rgba(200,60,60,0.12)", border: "1px solid rgba(200,60,60,0.3)",
            borderRadius: 5, color: "#cc6666", fontSize: 11, cursor: "pointer", fontFamily: "monospace",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(200,60,60,0.22)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(200,60,60,0.12)"; }}
        >Delete Volume</button>
      )}
    </div>
    <GroupsAccordion
      open={groupsOpen}
      onToggle={onToggleGroups}
      selected={selected}
      groups={groups}
      onObjectUpdate={onObjectUpdate}
      onSelectGroup={onSelectGroup}
    />
    </>
  );
}

// ── ToolView ──────────────────────────────────────────────────────────────────

// World-level ambient/sun controls — shown under the Light tool so the existing
// scene lighting is manageable from the same place placed lights are authored.
// ── LightingQualitySection ────────────────────────────────────────────────────
// Editor perf preference: FANCY = sun + blue fill + warm rim (the published-game
// look); FAST = sun + ambient only. Each extra directional light shades every
// pixel every frame, so FAST buys real framerate on big levels / retina screens.
function LightingQualitySection({ quality, onChange }: {
  quality:  "fancy" | "fast";
  onChange: (q: "fancy" | "fast") => void;
}) {
  return (
    <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={LABEL}>LIGHTING QUALITY</div>
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        {(["fancy", "fast"] as const).map(q => (
          <button key={q} onClick={() => onChange(q)}
            title={q === "fancy"
              ? "Sun + blue fill + warm rim — the full rig"
              : "Sun + ambient only — noticeably faster on big levels; shadowed sides read darker"}
            style={{
              flex: 1, padding: "5px 0", borderRadius: 4, fontSize: 10, fontFamily: "monospace",
              border: "1px solid " + (quality === q ? "rgba(80,140,255,0.5)" : "rgba(255,255,255,0.12)"),
              background: quality === q ? "rgba(80,140,255,0.25)" : "rgba(46,46,46,0.9)",
              color: quality === q ? "#80aaff" : "#c0c0c0", cursor: "pointer",
            }}>
            {q.toUpperCase()}
          </button>
        ))}
      </div>
      <div style={{ color: "#9aa3b5", fontSize: 9, marginTop: 6, lineHeight: 1.5 }}>
        Saved with the scene — published games use it too. FAST drops the
        fill/rim lights for framerate on big levels. (Turning light intensity
        to 0 does NOT save performance — only FAST removes their GPU cost.)
      </div>
    </div>
  );
}

function WorldLightSection({ lighting, onChange }: {
  lighting: { ambient: { color: string; intensity: number }; sun: { color: string; intensity: number }; envIntensity?: number };
  onChange: (changes: { ambient?: Partial<{ color: string; intensity: number }>; sun?: Partial<{ color: string; intensity: number }>; envIntensity?: number }) => void;
}) {
  const envVal = lighting.envIntensity ?? 1;
  const [intStr, setIntStr] = useState({ ambient: String(lighting.ambient.intensity), sun: String(lighting.sun.intensity), env: String(envVal) });
  const { schedule, flush } = useFieldDebounce(300);
  useEffect(() => { setIntStr({ ambient: String(lighting.ambient.intensity), sun: String(lighting.sun.intensity), env: String(envVal) }); },
    [lighting.ambient.intensity, lighting.sun.intensity, envVal]); // eslint-disable-line react-hooks/exhaustive-deps

  const row = (key: "ambient" | "sun", label: string) => {
    const commit = (val: string) => { const n = parseFloat(val); if (Number.isFinite(n) && n >= 0) onChange({ [key]: { intensity: n } }); };
    return (
      <div>
        <div style={LABEL}>{label}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="color" value={lighting[key].color}
            onChange={e => onChange({ [key]: { color: e.target.value } })}
            style={{ width: 42, height: 26, padding: 0, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 4, background: "transparent", cursor: "pointer" }}
          />
          <input type="number" step={key === "ambient" ? 0.1 : 0.25} min={0} value={intStr[key]} style={{ ...NUM_INPUT, width: 70 }}
            onChange={e => { const v = e.target.value; setIntStr(p => ({ ...p, [key]: v })); schedule(() => commit(v)); }}
            onBlur={e => flush(() => commit(e.target.value))}
            onKeyDown={e => { if (e.key === "Enter") flush(() => commit((e.target as HTMLInputElement).value)); }}
          />
          <span style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace" }}>intensity</span>
        </div>
      </div>
    );
  };

  const commitEnv = (val: string) => { const n = parseFloat(val); if (Number.isFinite(n) && n >= 0) onChange({ envIntensity: n }); };

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ ...LABEL, marginBottom: 0 }}>WORLD LIGHT</div>
      {row("ambient", "AMBIENT")}
      {row("sun", "SUN")}
      <div>
        <div style={LABEL}>ENVIRONMENT</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="number" step={0.1} min={0} value={intStr.env} style={{ ...NUM_INPUT, width: 70 }}
            onChange={e => { const v = e.target.value; setIntStr(p => ({ ...p, env: v })); schedule(() => commitEnv(v)); }}
            onBlur={e => flush(() => commitEnv(e.target.value))}
            onKeyDown={e => { if (e.key === "Enter") flush(() => commitEnv((e.target as HTMLInputElement).value)); }}
          />
          <span style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace" }}>intensity</span>
        </div>
      </div>
      <div style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace", lineHeight: 1.4 }}>
        The world's base lighting, saved with the scene. Fill/rim lights follow SUN;
        ENVIRONMENT is the reflected sky/image light. Set all three to 0 for a scene
        lit only by placed lights.
      </div>
    </div>
  );
}

// Scene audio mixer + ambient/music tracks (Phase 36). Global (world-level),
// saved with the scene, applied live via world:audio — mirrors WorldLightSection.
const DEFAULT_AUDIO_MIX: AudioMix = { master: 1, music: 1, sfx: 1, ambient: 1 };

// The Audio screen is a MENU (Phase 64.1, matching the drilldown idiom
// everywhere else): four rows with live summaries, each opening its own page.
function AudioMenuSection({ audio, playerSettings, onOpen }: {
  audio?:          WorldAudio;
  playerSettings?: PlayerSettings;
  onOpen:          (s: ScreenId) => void;
}) {
  const mix = { ...DEFAULT_AUDIO_MIX, ...audio?.mix };
  const pct = (n: number) => `${Math.round(n * 100)}`;
  const slotSummary = (slot?: { soundId?: string; playlist?: AudioPlaylist; mode?: "single" | "playlist" }) => {
    if (slot?.playlist && slot.mode !== "single") {
      const n = slot.playlist.entries.length;
      return `playlist · ${n} entr${n === 1 ? "y" : "ies"}`;
    }
    if (slot?.soundId) return assetManager.getSoundDef(slot.soundId)?.label ?? slot.soundId;
    return "none";
  };
  const charCount = [playerSettings?.footstepSound, playerSettings?.jumpSound, playerSettings?.landSound]
    .filter(Boolean).length;
  return (
    <>
      <CategoryRow label="Mixer"
        summary={`${pct(mix.master)} · ${pct(mix.music)} · ${pct(mix.sfx)} · ${pct(mix.ambient)}%`}
        onPress={() => onOpen("audio-mixer")} />
      <CategoryRow label="Background Music" summary={slotSummary(audio?.music)}
        onPress={() => onOpen("audio-music")} />
      <CategoryRow label="Ambient" summary={slotSummary(audio?.ambient)}
        onPress={() => onOpen("audio-ambient")} />
      {playerSettings && (
        <CategoryRow label="Character Sounds"
          summary={charCount ? `${charCount} of 3 set` : "none"}
          onPress={() => onOpen("audio-character")} />
      )}
    </>
  );
}

function AudioMixerPage({ audio, onChange }: {
  audio?:   WorldAudio;
  onChange: (changes: Partial<WorldAudio>) => void;
}) {
  const mix = { ...DEFAULT_AUDIO_MIX, ...audio?.mix };
  const slider = (key: keyof AudioMix, label: string) => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", ...LABEL }}>
        <span>{label}</span><span style={{ color: "#808090" }}>{Math.round(mix[key] * 100)}%</span>
      </div>
      <input type="range" min={0} max={1} step={0.01} value={mix[key]}
        onChange={e => onChange({ mix: { ...mix, [key]: Number(e.target.value) } })}
        style={{ width: "100%", accentColor: "#80aaff" }} />
    </div>
  );
  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      {slider("master", "MASTER")}
      {slider("music", "MUSIC")}
      {slider("sfx", "SFX")}
      {slider("ambient", "AMBIENT")}
      <div style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace", lineHeight: 1.4 }}>
        Authored per-scene defaults for the four buses. Players can lower each bus
        in the pause menu (their sliders multiply over these).
      </div>
    </div>
  );
}

function AudioSlotPage({ kind, audio, onChange }: {
  kind:     "music" | "ambient";
  audio?:   WorldAudio;
  onChange: (changes: Partial<WorldAudio>) => void;
}) {
  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      {kind === "music" ? (
        <AudioSlotEditor slot={audio?.music}
          onSlot={next => onChange({ music: next })} keepLoopTrue />
      ) : (
        <AudioSlotEditor slot={audio?.ambient}
          onSlot={next => onChange({ ambient: next })} />
      )}
      <div style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace", lineHeight: 1.4 }}>
        Plays on Preview/Play. PLAYLIST mode composes a sequence of short clips and
        silence gaps that plays in order with hard cuts — layer soundscapes by giving
        music AND ambient their own playlists. Trigger-volume scripts
        (play_music / play_sound) change audio per room.
      </div>
    </div>
  );
}

function CharacterSoundsPage({ playerSettings, onPlayerSettingsChange }: {
  playerSettings:         PlayerSettings;
  onPlayerSettingsChange: (s: Partial<PlayerSettings>) => void;
}) {
  // One character-sound row: picker + a VOL gain field (1 = the clip's own level,
  // above 1 boosts — runtime caps at 4).
  const soundRow = (label: string, soundKey: "footstepSound" | "jumpSound" | "landSound",
                    volKey: "footstepVolume" | "jumpVolume" | "landVolume") => (
    <div>
      <div style={LABEL}>{label}</div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <SoundPicker value={playerSettings[soundKey]} allowNone style={{ flex: 1, minWidth: 0 }}
          previewVolume={playerSettings[volKey]}
          onChange={id => onPlayerSettingsChange({ [soundKey]: id || undefined })} />
        <span style={{ color: "#8b94a8", fontSize: 9, letterSpacing: 0.5 }}>VOL</span>
        <input type="number" min={0} step={0.1} style={{ ...NUM_INPUT, width: 52 }}
          title="Gain — 1 = the clip's own volume, higher boosts (up to 4)"
          value={playerSettings[volKey] ?? ""} placeholder="1"
          onChange={e => onPlayerSettingsChange({ [volKey]: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })} />
      </div>
    </div>
  );

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      {soundRow("FOOTSTEP", "footstepSound", "footstepVolume")}
      {soundRow("JUMP", "jumpSound", "jumpVolume")}
      {soundRow("LAND", "landSound", "landVolume")}
      <div>
        <div style={LABEL}>STRIDE LENGTH (m)</div>
        <input type="number" min={0.3} step={0.1} style={{ ...NUM_INPUT, width: 80 }}
          value={playerSettings.footstepDistance ?? ""} placeholder="1.8"
          onChange={e => onPlayerSettingsChange({ footstepDistance: e.target.value === "" ? undefined : Number(e.target.value) })} />
      </div>
      <div style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace", lineHeight: 1.4 }}>
        The player's own footstep / jump / land sounds (SFX bus). Footsteps fire every
        STRIDE LENGTH metres while walking on the ground. VOL 1 plays the clip at its
        own level; higher values boost it (up to 4).
      </div>
    </div>
  );
}

// ── AudioSlotEditor (Phase 64) ────────────────────────────────────────────────
// One scene-audio slot (music or ambient): SINGLE mode = the classic one-track
// picker; PLAYLIST mode = a script-actions-style composed sequence — clip rows
// (picker + per-entry volume) and silence rows (gap seconds), ▲▼ one-step
// reorder, ✕ remove, + clip / + silence, LOOP toggle. Hard cuts by design;
// silence entries are the spacing tool.
type AudioSlot = { soundId?: string; volume?: number; loop?: boolean; playlist?: AudioPlaylist; mode?: "single" | "playlist" };

function AudioSlotEditor({ slot, onSlot, keepLoopTrue }: {
  slot?:        AudioSlot;
  onSlot:       (next: AudioSlot | undefined) => void;
  keepLoopTrue?: boolean;   // the music slot's single-track mode always loops (existing behavior)
}) {
  // The ACTIVE playlist. Both representations coexist on the slot — the mode switch
  // retains the inactive one (like 1st/3rd-person camera poses) and `mode` picks
  // which plays; absent mode = legacy playlist-wins-when-present.
  const pl = slot?.mode !== "single" ? slot?.playlist : undefined;
  // Which playlist row the sound-picker modal is choosing for ("add" = append at the
  // end, { insertAt } = splice in at that index via a row's "+ insert here" strip).
  // The modal itself remembers its search/filter state across open/close.
  const [pickerFor, setPickerFor] = useState<number | "add" | { insertAt: number } | null>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  // Whole-sequence preview (editor-only — its own AudioContext, never the runtime
  // AudioSystem, so nothing here ships in exported games). previewIdx highlights
  // the playing row; the token invalidates stale timers after a stop/restart.
  // WebAudio, not <audio> src-swapping: every clip is scheduled up front at its
  // exact start time from the SAME decoded-buffer cache gameplay preloads
  // (assetManager.loadSound), so transitions are hard cuts like real playback —
  // an <audio> element re-fetches+decodes on every src swap (1–2s of dead air
  // between entries, the v4.79.9 bug).
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const seqToken   = useRef(0);
  const seqCtx     = useRef<AudioContext | null>(null);
  const seqTimers  = useRef<number[]>([]);
  const seqSources = useRef<AudioBufferSourceNode[]>([]);
  const stopSeq = () => {
    seqToken.current++;
    for (const t of seqTimers.current) clearTimeout(t);
    seqTimers.current = [];
    for (const s of seqSources.current) { try { s.stop(); } catch { /* not started yet */ } }
    seqSources.current = [];
    previewRef.current?.pause();
    setPreviewIdx(null);
  };
  useEffect(() => () => {
    seqToken.current++;
    for (const t of seqTimers.current) clearTimeout(t);
    for (const s of seqSources.current) { try { s.stop(); } catch { /* not started yet */ } }
    void seqCtx.current?.close();
    previewRef.current?.pause();
  }, []);
  // Plays the composed sequence ONCE, top to bottom, with per-clip volumes and
  // real silence gaps (LOOP is a runtime behavior — a preview that never ends
  // would just have to be stopped by hand anyway).
  const startSeq = async () => {
    stopSeq();
    const entries = pl?.entries ?? [];
    if (!entries.length) return;
    const token = ++seqToken.current;
    setPreviewIdx(0);   // flip the button to ⏹ while buffers decode (first run only — cached after)
    const ctx = (seqCtx.current ??= new AudioContext());
    if (ctx.state === "suspended") void ctx.resume();
    const buffers = await Promise.all(entries.map(e =>
      e.soundId ? assetManager.loadSound(e.soundId).catch(() => null) : Promise.resolve(null)));
    if (token !== seqToken.current) return;
    let t = ctx.currentTime + 0.08;   // tiny lead-in so entry 1 isn't scheduled in the past
    const base = ctx.currentTime;
    entries.forEach((e, i) => {
      seqTimers.current.push(window.setTimeout(() => {
        if (token === seqToken.current) setPreviewIdx(i);
      }, (t - base) * 1000));
      if (e.soundId) {
        const buf = buffers[i];
        if (!buf) return;   // missing/failed sound — contributes no time, like the runtime's skip
        const def  = assetManager.getSoundDef(e.soundId);
        const src  = ctx.createBufferSource();
        const gain = ctx.createGain();
        src.buffer = buf;
        gain.gain.value = Math.max(0, Math.min(1, (e.volume ?? 1) * (def?.volume ?? 1)));
        src.connect(gain).connect(ctx.destination);
        src.start(t);
        seqSources.current.push(src);
        t += buf.duration;
      } else if (e.silence != null) {
        t += Math.max(0.1, e.silence);
      }
    });
    seqTimers.current.push(window.setTimeout(() => {
      if (token === seqToken.current) stopSeq();
    }, (t - base) * 1000));
  };
  const previewClip = (soundId: string) => {
    stopSeq();   // the row preview shares the <audio> element — take it over cleanly
    const def = assetManager.getSoundDef(soundId);
    if (!def) return;
    if (!previewRef.current) previewRef.current = new Audio();
    const a = previewRef.current;
    a.src = def.path; a.currentTime = 0; a.volume = 1;
    void a.play().catch(() => { /* autoplay / decode failure — ignore */ });
  };
  const MODE_BTN = (active: boolean): React.CSSProperties => ({
    padding: "3px 10px", fontSize: 9, letterSpacing: 0.5, borderRadius: 3, cursor: "pointer",
    border: `1px solid ${active ? "rgba(80,140,255,0.35)" : "rgba(255,255,255,0.1)"}`,
    background: active ? "rgba(80,140,255,0.2)" : "transparent",
    color: active ? "#80aaff" : "#8b94a8",
  });
  const MINI_BTN: React.CSSProperties = {
    padding: "1px 5px", fontSize: 10, borderRadius: 3, cursor: "pointer",
    border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#c2cadb",
  };
  // The slim between-rows insert buttons.
  const STRIP_BTN: React.CSSProperties = {
    padding: "0 8px", fontSize: 8, letterSpacing: 0.5, lineHeight: "12px", borderRadius: 6,
    cursor: "pointer", border: "1px dashed rgba(255,255,255,0.16)", background: "transparent",
    color: "#8b94a8",
  };

  const writeEntries = (entries: PlaylistEntry[], loop = pl?.loop ?? true) => {
    stopSeq();   // editing the sequence mid-preview would play a stale list
    onSlot({ ...slot, mode: "playlist", playlist: { entries, loop } });
  };

  // Mode flips keep BOTH representations. First flip to a mode with nothing authored
  // seeds it from the other (the single track becomes entry 1 / the first clip becomes
  // the single track) — after that each side keeps its own state.
  const toPlaylist = () => onSlot({
    ...slot,
    mode: "playlist",
    playlist: slot?.playlist ?? {
      entries: slot?.soundId ? [{ soundId: slot.soundId, ...(slot.volume != null ? { volume: slot.volume } : {}) }] : [],
      loop: true,
    },
  });
  const toSingle = () => {
    stopSeq();
    const first = slot?.soundId == null ? slot?.playlist?.entries.find(e => e.soundId) : undefined;
    onSlot({
      ...slot,
      mode: "single",
      ...(first?.soundId ? { soundId: first.soundId, ...(first.volume != null ? { volume: first.volume } : {}) } : {}),
      ...(keepLoopTrue ? { loop: true } : {}),
    });
  };

  const move = (i: number, dir: -1 | 1) => {
    const entries = [...pl!.entries];
    const j = i + dir;
    if (j < 0 || j >= entries.length) return;
    [entries[i], entries[j]] = [entries[j]!, entries[i]!];
    writeEntries(entries);
  };
  const patch  = (i: number, p: Partial<PlaylistEntry>) =>
    writeEntries(pl!.entries.map((e, k) => k === i ? { ...e, ...p } : e));
  // Appear/disappear flourish: rows are keyed by INDEX, so a mount animation can't
  // find "the new row" (an insert re-renders existing nodes and appends one at the
  // END). Instead we track which indices just appeared — applying the animation
  // property fresh replays it — and delay a delete by one animation so the row can
  // fade out before the data write removes it.
  const [bornIdx,  setBornIdx]  = useState<number[]>([]);
  const [dyingIdx, setDyingIdx] = useState<number | null>(null);
  const flashIn = (idxs: number[]) => {
    setBornIdx(idxs);
    // Clear afterwards so a later add at the same index re-applies the property
    // (an unchanged animation value never replays).
    window.setTimeout(() => setBornIdx([]), 300);
  };
  const remove = (i: number) => {
    if (dyingIdx != null) return;   // one at a time — the write lands in 200ms
    setDyingIdx(i);
    const entries = pl!.entries.filter((_, k) => k !== i);
    window.setTimeout(() => { setDyingIdx(null); writeEntries(entries); }, 200);
  };
  const duplicate = (i: number) => {
    const entries = [...pl!.entries];
    // The copy goes BELOW the row and that slot animates. With identical adjacent
    // entries above/below is the same data — but animating the clicked row's own
    // index looks like the card ABOVE the copy expanded, which reads as the wrong
    // row moving.
    entries.splice(i + 1, 0, { ...entries[i]! });
    writeEntries(entries);
    flashIn([i + 1]);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 3, cursor: "pointer", marginBottom: 10 }}>
        <button style={MODE_BTN(!pl)} onClick={() => { if (pl) toSingle(); }}>SINGLE</button>
        <button style={MODE_BTN(!!pl)} onClick={() => { if (!pl) toPlaylist(); }}>PLAYLIST</button>
      </div>
      {!pl ? (
        <SoundPicker value={slot?.soundId} allowNone
          onChange={id => {
            const keep = { ...slot, ...(keepLoopTrue ? { loop: true } : {}) };
            if (id) onSlot({ ...keep, soundId: id });
            else if (slot?.playlist) onSlot({ ...keep, soundId: undefined });   // keep the retained playlist
            else onSlot(undefined);
          }} />
      ) : (
        // No container gap — each row wrapper carries its own spacing (via the insert
        // strip's margins), so collapsing a wrapper to 0 height closes the space
        // completely instead of leaving an 8px seam.
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <button style={MINI_BTN} onClick={() => setPickerFor("add")}>+ clip</button>
            <button style={MINI_BTN} onClick={() => { writeEntries([...pl.entries, { silence: 2 }]); flashIn([pl.entries.length]); }}>+ silence</button>
            <button
              title={previewIdx != null ? "Stop the sequence preview" : "Play the whole composed sequence once, right here in the editor"}
              style={{ ...MINI_BTN, color: previewIdx != null ? "#cc8866" : "#80aaff",
                borderColor: previewIdx != null ? "rgba(204,136,102,0.4)" : "rgba(80,140,255,0.35)" }}
              onClick={() => previewIdx != null ? stopSeq() : startSeq()}>
              {previewIdx != null ? "⏹ stop" : "▶ preview"}
            </button>
            <span style={{ flex: 1 }} />
            <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
                            color: "#9aa3b5", fontSize: 9, letterSpacing: 0.5 }}
                   title="Loop the whole composed sequence; off = plays once per scene entry, then silence">
              <input type="checkbox" checked={pl.loop ?? true}
                onChange={ev => writeEntries(pl.entries, ev.target.checked)} />
              LOOP
            </label>
          </div>
          {pl.entries.length === 0 && (
            <div style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace", marginBottom: 4 }}>
              Empty sequence — add clips and silence gaps with the buttons above.
            </div>
          )}
          {pl.entries.map((e, i) => {
            const orderBtns = (
              <>
                <button style={{ ...MINI_BTN, opacity: i === 0 ? 0.3 : 1 }} title="Move up" onClick={() => move(i, -1)}>▲</button>
                <button style={{ ...MINI_BTN, opacity: i === pl.entries.length - 1 ? 0.3 : 1 }} title="Move down" onClick={() => move(i, 1)}>▼</button>
                <button style={MINI_BTN} title="Duplicate — the copy is added right below this entry" onClick={() => duplicate(i)}>⧉</button>
                <button style={{ ...MINI_BTN, color: "#8a5a5a" }} title="Remove entry" onClick={() => remove(i)}>✕</button>
              </>
            );
            const playingNow = previewIdx === i;
            const CARD: React.CSSProperties = {
              display: "flex", flexDirection: "column", gap: 7, padding: "7px 8px",
              background: playingNow ? "rgba(80,140,255,0.1)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${playingNow ? "rgba(80,140,255,0.45)" : "rgba(255,255,255,0.06)"}`, borderRadius: 4,
            };
            const IDX: React.CSSProperties = { color: "#8b94a8", fontSize: 9, width: 12, textAlign: "right", flexShrink: 0 };
            const card = e.silence != null && !e.soundId ? (
              <div style={{ ...CARD, flexDirection: "row", alignItems: "center", gap: 6 }}>
                <span style={IDX}>{i + 1}</span>
                <span style={{ color: "#98a2b8", fontSize: 10, letterSpacing: 0.5, flexShrink: 0 }}
                      title="A gap of silence before the next entry">SILENCE</span>
                <input type="number" min={0.1} step={0.5} style={{ ...NUM_INPUT, width: 52 }}
                  value={e.silence}
                  onChange={ev => patch(i, { silence: Math.max(0.1, Number(ev.target.value) || 0.1) })} />
                <span style={{ color: "#8b94a8", fontSize: 9 }}>sec</span>
                <span style={{ flex: 1 }} />
                {orderBtns}
              </div>
            ) : (
              <div style={CARD}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={IDX}>{i + 1}</span>
                  <button onClick={() => setPickerFor(i)} title="Change clip"
                    style={{ flex: 1, minWidth: 0, textAlign: "left", padding: "4px 6px", borderRadius: 4,
                      cursor: "pointer", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.08)",
                      color: e.soundId ? "#c8c8c8" : "#8b94a8", fontSize: 11, fontFamily: "monospace",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.soundId ? (assetManager.getSoundDef(e.soundId)?.label ?? e.soundId) : "Select a sound…"}
                  </button>
                  <button onClick={() => e.soundId && previewClip(e.soundId)} title="Preview" disabled={!e.soundId}
                    style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 4, cursor: e.soundId ? "pointer" : "default",
                      background: e.soundId ? "rgba(80,140,255,0.15)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${e.soundId ? "rgba(80,140,255,0.3)" : "rgba(255,255,255,0.07)"}`,
                      color: e.soundId ? "#80aaff" : "#555", fontSize: 10, lineHeight: 1 }}>▶</button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 18 }}>
                  <span style={{ color: "#8b94a8", fontSize: 9, letterSpacing: 0.5 }}>VOL</span>
                  <input type="number" min={0} max={1} step={0.1} style={{ ...NUM_INPUT, width: 52 }}
                    title="Per-clip volume (0–1)"
                    value={e.volume ?? 1}
                    onChange={ev => patch(i, { volume: Math.max(0, Math.min(1, Number(ev.target.value) || 0)) })} />
                  <span style={{ flex: 1 }} />
                  {orderBtns}
                </div>
              </div>
            );
            return (
              // The animating unit: card + its insert strip in one overflow-hidden
              // wrapper, expanding from / collapsing to 0 height so neighbouring rows
              // visibly slide on add and delete.
              <div key={i} style={{ display: "flex", flexDirection: "column", overflow: "hidden",
                animation: dyingIdx === i ? "wb-row-out 0.2s ease forwards"
                         : bornIdx.includes(i) ? "wb-row-in 0.25s ease" : undefined }}>
                {card}
                {/* Insert point below each entry — its margins ARE the row spacing. */}
                <div style={{ alignSelf: "center", display: "flex", gap: 4, marginTop: 3, marginBottom: 3 }}>
                  <button onClick={() => setPickerFor({ insertAt: i + 1 })}
                    title="Insert clips at this position — opens the picker; checked clips go here in check order"
                    style={STRIP_BTN}>+ insert here</button>
                  <button onClick={() => {
                      const entries = [...pl.entries];
                      entries.splice(i + 1, 0, { silence: 2 });
                      writeEntries(entries);
                      flashIn([i + 1]);
                    }}
                    title="Insert a 2s silence gap at this position"
                    style={STRIP_BTN}>+ silence</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {(pickerFor === "add" || (typeof pickerFor === "object" && pickerFor !== null)) && (
        // Multi-select: check any number of clips; they land in the order checked when
        // the modal closes — appended ("add") or spliced in at insertAt ("+ insert here").
        <SoundPickerModal title={pickerFor === "add" ? "ADD CLIPS" : "INSERT CLIPS"}
          onClose={() => setPickerFor(null)}
          onPickMulti={ids => {
            const entries = [...(pl?.entries ?? [])];
            const at = pickerFor === "add" ? entries.length : pickerFor.insertAt;
            entries.splice(at, 0, ...ids.map(id => ({ soundId: id })));
            writeEntries(entries);
            flashIn(ids.map((_, k) => at + k));
          }} />
      )}
      {typeof pickerFor === "number" && (
        <SoundPickerModal title={`CLIP ${pickerFor + 1}`}
          onClose={() => setPickerFor(null)}
          onPick={id => { patch(pickerFor, { soundId: id }); setPickerFor(null); }} />
      )}
    </div>
  );
}

// Attached spatial emitter (Phase 36) — a PositionalAudio that follows the mesh. Lives on
// object / platform / shape (the movable entity types); onObjectUpdate routes to the right
// WorldState mutator by selected type, so this screen is type-agnostic.
function EntitySoundScreen({ selected, onObjectUpdate }: {
  selected: SelectedObjectPayload;
  onObjectUpdate: (c: Partial<WorldObject>) => void;
}) {
  const snd = (selected.data as { sound?: AttachedSound } | null)?.sound;
  const patch = (changes: Partial<AttachedSound>) =>
    onObjectUpdate({ sound: { soundId: snd?.soundId ?? "", ...snd, ...changes } } as Partial<WorldObject>);

  const numRow = (key: "volume" | "refDistance" | "maxDistance", label: string, def: number, step: number) => (
    <div>
      <div style={LABEL}>{label}</div>
      <input type="number" min={0} step={step} style={{ ...NUM_INPUT, width: 90 }}
        value={snd?.[key] ?? ""} placeholder={String(def)}
        onChange={e => patch({ [key]: e.target.value === "" ? undefined : Number(e.target.value) })} />
    </div>
  );

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={LABEL}>SOUND</div>
        <SoundPicker value={snd?.soundId} allowNone previewVolume={snd?.volume}
          onChange={id => onObjectUpdate({ sound: id ? { ...snd, soundId: id } : undefined })} />
      </div>
      {snd?.soundId && (
        <>
          <label style={{ color: "#a0a0a0", fontSize: 11, fontFamily: "monospace", display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={snd.loop ?? true} onChange={e => patch({ loop: e.target.checked })} />
            loop
          </label>
          {numRow("volume", "VOLUME (1 = clip level · higher boosts, max 4)", 1, 0.1)}
          {numRow("refDistance", "REF DISTANCE", 1, 0.5)}
          {numRow("maxDistance", "MAX DISTANCE", 20, 1)}
        </>
      )}
      <div style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace", lineHeight: 1.4 }}>
        Plays as a 3D positional loop in Preview/Play, attenuating between REF and MAX
        distance. Rides along if this is a moving platform/shape. Leave empty for silence.
      </div>
    </div>
  );
}

// One row per placed light in the active zone — click selects it in the viewport.
function LightListSection({ lights, onSelect }: { lights: LightDef[]; onSelect?: (id: string) => void }) {
  const KIND_GLYPH: Record<string, string> = { point: "◉", spot: "◭", directional: "☀" };
  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 4, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ ...LABEL, marginBottom: 4 }}>PLACED LIGHTS ({lights.length})</div>
      {lights.length === 0 && (
        <div style={{ color: "#98a2b8", fontSize: 10, fontFamily: "monospace", lineHeight: 1.4 }}>
          None yet — pick the Light tool and click in the scene to place one.
        </div>
      )}
      {lights.map(l => (
        <button
          key={l.id}
          onClick={() => onSelect?.(l.id)}
          title={l.id}
          style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
            padding: "6px 8px", borderRadius: 4, cursor: "pointer",
            background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)",
            color: "#c0c0c0", fontSize: 11, fontFamily: "monospace",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(80,140,255,0.4)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; }}
        >
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: l.color, flexShrink: 0, boxShadow: `0 0 6px ${l.color}` }} />
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {l.label || l.id}
          </span>
          <span style={{ color: "#98a2b8", fontSize: 10, flexShrink: 0 }}>
            {KIND_GLYPH[l.kind]} {l.kind}{l.castShadow ? " · ☑︎sh" : ""}
          </span>
        </button>
      ))}
    </div>
  );
}

function ToolView({ activeTool, onShowCredits, lightCount = 0, onOpenLights, onOpenAudio,
  showPerfCounter, onTogglePerfCounter, showCrosshair, onToggleCrosshair,
  showGridFloor, onToggleGridFloor }: {
  activeTool: ToolId;
  onShowCredits?: () => void;
  lightCount?:   number;
  onOpenLights?: () => void;
  onOpenAudio?:  () => void;
  showPerfCounter?:     boolean;
  onTogglePerfCounter?: () => void;
  showCrosshair?:       boolean;
  onToggleCrosshair?:   () => void;
  showGridFloor?:       boolean;
  onToggleGridFloor?:   () => void;
}) {
  const info = TOOL_INFO[activeTool];
  return (
    <>
      <div style={{ padding: "10px 16px 0", color: "#98a2b8", fontSize: 11 }}>{info.desc}</div>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ padding: "8px 12px", background: "rgba(80,140,255,0.06)", border: "1px solid rgba(80,140,255,0.15)", borderRadius: 6, color: "#909090", fontSize: 11 }}>
          {info.hint}
        </div>
      </div>
      {/* Scene lighting drilldown — world sun/ambient + this zone's placed lights. */}
      {onOpenLights && (
        <CategoryRow
          label="Lights"
          summary={`sun + ambient · ${lightCount} placed`}
          onPress={onOpenLights}
        />
      )}
      {/* Scene audio drilldown — mixer + ambient/music tracks (Phase 36). */}
      {onOpenAudio && (
        <CategoryRow
          label="Audio"
          summary="mixer · ambient · music"
          onPress={onOpenAudio}
        />
      )}
      {/* Home for global editor settings/links — grows over time; credits first. */}
      {activeTool === "select" && onShowCredits && (
        <div style={{ margin: "10px 16px 0", paddingTop: 2 }}>
          <div style={{ ...LABEL, marginBottom: 8 }}>EDITOR</div>
          <button
            onClick={onShowCredits}
            style={{ width: "100%", padding: "8px 10px", background: "rgba(46,46,46,0.9)",
                     border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6,
                     color: "#a0a0a0", fontFamily: "monospace", fontSize: 11, letterSpacing: 1,
                     textAlign: "left", cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(80,140,255,0.3)"; e.currentTarget.style.color = "#80aaff"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#a0a0a0"; }}
          >
            CREDITS — imported asset &amp; material authors
          </button>
          {/* Preview-overlay toggles — persisted globally (localStorage), not per scene. */}
          {onTogglePerfCounter && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 10 }}>
              <input type="checkbox" checked={showPerfCounter ?? true} onChange={onTogglePerfCounter}
                style={{ accentColor: "#4d8cff", cursor: "pointer" }} />
              <span style={{ color: "#c2cadb", fontSize: 11 }}>Perf counter while playing (FPS · draw calls, top-left)</span>
            </label>
          )}
          {onToggleCrosshair && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 8 }}>
              <input type="checkbox" checked={showCrosshair ?? true} onChange={onToggleCrosshair}
                style={{ accentColor: "#4d8cff", cursor: "pointer" }} />
              <span style={{ color: "#c2cadb", fontSize: 11 }}>Crosshair while playing (center of screen)</span>
            </label>
          )}
          {onToggleGridFloor && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 8 }}>
              <input type="checkbox" checked={showGridFloor ?? true} onChange={onToggleGridFloor}
                style={{ accentColor: "#4d8cff", cursor: "pointer" }} />
              <span style={{ color: "#c2cadb", fontSize: 11 }}>Grid floor (the dark ground plane + grid lines)</span>
            </label>
          )}
        </div>
      )}
    </>
  );
}
