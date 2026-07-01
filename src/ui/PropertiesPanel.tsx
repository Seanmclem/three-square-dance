import { useEffect, useRef, useState } from "react";
import type {
  ToolId, SelectedObjectPayload, SelectedRef, WorldObject, Vec3,
  FloorDef, WallDef, Opening, MaterialDef, MaterialOverrides, QualityScale,
  PlatformDef, StairDef, StairUndersideMode, ZoneDef, ZoneType, PlayerSettings, LocomotionState, AssetDef, TriggerVolume, ScriptDef,
  GroupDef,
} from "@/types";
import type { EventBus } from "@/core/EventBus";
import { MaterialCategoryPills, orderedMaterialCategories, materialSwatchUrl } from "@/ui/materialCategories";

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
  color: "#646464", fontSize: 10, letterSpacing: 1, marginBottom: 4,
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
  floor:       { desc: "Click and drag to paint a rectangular floor region.",      hint: "Click to place floor origin" },
  "poly-floor": { desc: "Click to place vertices. Enter or click first dot to close.", hint: "Click to add first vertex" },
  wall:        { desc: "Click to set wall start, click again to set end.",         hint: "Click to place wall start" },
  platform:         { desc: "Click and drag to define a freestanding platform.",        hint: "Click to place platform" },
  "poly-platform":  { desc: "Click to place vertices. Enter or click first dot to close.", hint: "Click to add first vertex" },
  stair:       { desc: "Click bottom point, then top point of staircase.",         hint: "Click bottom of stair" },
  object:      { desc: "Choose an asset below, click to place.",                   hint: "Select an asset first" },
  zone:        { desc: "Draw a zone boundary to group rooms.",                     hint: "Click to define zone area" },
  spawnpoint:       { desc: "Click to place the player spawn point.",                   hint: "Click to set spawn location" },
  "trigger-volume": { desc: "Click and drag to place a trigger volume.",               hint: "Click to set volume start" },
};

const PLACEHOLDER_ASSETS = ["Wall Segment", "Floor Tile", "Door Frame", "Window", "Staircase", "Platform"] as const;

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

type ScreenId = "geo" | "mat" | "open" | "seg" | "vert" | "animations";

const SCREEN_LABELS: Record<ScreenId, string> = {
  geo: "Geometry", mat: "Material", open: "Openings", seg: "Segments", vert: "Vertices",
  animations: "Animations",
};

const SCREEN_SUBTITLES: Record<ScreenId, string> = {
  geo:  "HEIGHT · THICKNESS",
  mat:  "MATERIAL · MAPS",
  open: "OPENINGS",
  seg:  "WALL SEGMENTS",
  vert: "ELEVATION",
  animations: "CLIPS · AUTO-PLAY",
};

const GEO_SUBTITLES: Partial<Record<string, string>> = {
  wall:     "HEIGHT · THICKNESS",
  platform: "POSITION · SIZE",
  stair:    "POINTS · STEPS",
  object:   "TRANSFORM",
  opening:  "DIMENSIONS",
};

const OBJECT_SCREENS: Record<string, ScreenId[]> = {
  wall:     ["geo", "mat", "open", "seg"],
  floor:    ["mat", "vert"],
  platform: ["geo", "mat"],
  stair:    ["geo", "mat"],
  object:   ["geo", "mat"],
  opening:  ["geo"],
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

  switch (s) {
    case "geo":
      if (wallData)  return `h ${wallData.height} · t ${wallData.thickness}`;
      if (platData)  return `${platData.size.width}×${platData.size.depth}`;
      if (stairData) return `${effectiveSteps(stairData)} steps`;
      return "geometry";
    case "mat": {
      let matId: string | undefined;
      let overrides: MaterialOverrides | undefined;
      if (wallData)  { matId = wallData.material;            overrides = wallData.materialOverrides; }
      if (floorData) { matId = floorData.floorMesh.material; overrides = floorData.materialOverrides; }
      if (platData)  { matId = platData.material;            overrides = platData.materialOverrides; }
      if (stairData) { matId = stairData.material;           overrides = stairData.materialOverrides; }
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
  if (type === "opening") {
    const d = selected.data as Opening | null;
    return `${(d?.type ?? "").toUpperCase()} OPENING`;
  }
  if (type === "trigger-volume") return "TRIGGER VOLUME";
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
  onImportMaterial:         () => void;
  onQualityChange:          (q: QualityScale) => void;
  onCopyRunToFloor?:        (targetLevel: number) => void;
  onFillRunWithFloor?:      () => void;
  onDelete?:                () => void;
  onVolumeScriptsChange?:   (scripts: ScriptDef[]) => void;
  zones?:                   ZoneDef[];
  groups?:                  GroupDef[];
  activeZoneId?:            string | null;
  playerSettings?:          PlayerSettings;
  assets?:                  AssetDef[];
  onPlayerSettingsChange?:  (s: Partial<PlayerSettings>) => void;
  onSpawnPositionChange?:   (pos: Vec3) => void;
  bus?:                     EventBus;
  onPreviewClip?:           (objectId: string, clipName: string) => void;
  onStopPreview?:           (objectId: string) => void;
  onAutoPlayChange?:        (objectId: string, clipName: string | null) => void;
  multiSelected?:           SelectedRef[];
  onCopy?:                  () => void;
  onDuplicate?:             () => void;
}

// ── PropertiesPanel ───────────────────────────────────────────────────────────

export function PropertiesPanel({
  activeTool, selected, materialList, quality, onObjectUpdate, onSegmentUpdate,
  onImportMaterial, onQualityChange, onCopyRunToFloor, onFillRunWithFloor, onDelete,
  onVolumeScriptsChange,
  zones = [], groups = [], activeZoneId, playerSettings, assets = [], onPlayerSettingsChange, onSpawnPositionChange,
  bus, onPreviewClip, onStopPreview, onAutoPlayChange,
  multiSelected = [], onCopy, onDuplicate,
}: PropertiesPanelProps) {
  const [stack, setStack]           = useState<ScreenId[]>([]);
  const [actionsOpen, setActionsOpen] = useState(true);
  const [groupsOpen, setGroupsOpen]   = useState(false);
  const [labelDraft, setLabelDraft]   = useState("");
  const [editingLabel, setEditingLabel] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStack([]); setActionsOpen(true); setGroupsOpen(false);
    setEditingLabel(false);
    setLabelDraft((selected?.data as { label?: string } | null)?.label ?? "");
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [stack.length]);

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
  const headerTitle    = !selected ? "" : selected.id === "__spawn__" ? "Spawn Point" : isRoot ? (currentLabel || selected.id) : SCREEN_LABELS[currentScreen!];
  const headerSubtitle = !selected ? "" : selected.id === "__spawn__" ? "player settings" : isRoot ? objectTypeLabel(selected) : getSubtitle(currentScreen!, selected.type);

  const canRename = !!selected && isRoot && selected.id !== "__spawn__"
    && ["object", "wall", "floor", "platform", "stair", "trigger-volume"].includes(selected.type as string);
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
            <div style={{ color: "#646464", fontSize: 11, fontFamily: "monospace", marginTop: 2 }}>{summary}</div>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ color: "#646464", fontSize: 11, fontFamily: "monospace", marginBottom: 12, lineHeight: 1.5 }}>
            Drag the gizmo to move all together (translate only). Rotate/scale need a single selection.
          </div>
          {onDuplicate && <button style={ACTION_BTN} onClick={onDuplicate}>Duplicate</button>}
          {onCopy      && <button style={ACTION_BTN} onClick={onCopy}>Copy</button>}
          {onDelete    && (
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
        {selected && (
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
              <span style={{ color: "#646464", letterSpacing: 1, whiteSpace: "nowrap", flexShrink: 0 }}>{headerSubtitle}</span>
              {canRename && (currentLabel || editingLabel) && (
                <span style={{ color: "#555", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {selected.id}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Scrollable body */}
      <div ref={bodyRef} style={{ flex: 1, overflowY: "auto" }}>
        {selected?.id === "__spawn__" && playerSettings && onPlayerSettingsChange ? (
          <SpawnSettingsView
            settings={playerSettings} assets={assets} onChange={onPlayerSettingsChange}
            position={selected.position} onPositionChange={onSpawnPositionChange}
          />
        ) : !selected ? (
          <ToolView activeTool={activeTool} />
        ) : selected.type === "trigger-volume" ? (
          <TriggerVolumeView
            selected={selected}
            onDelete={onDelete}
            onScriptsChange={onVolumeScriptsChange}
            groups={groups}
            groupsOpen={groupsOpen}
            onToggleGroups={() => setGroupsOpen(v => !v)}
            onObjectUpdate={onObjectUpdate}
          />
        ) : isRoot ? (
          <>
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
            />
            <ActionsAccordion
              open={actionsOpen}
              onToggle={() => setActionsOpen(v => !v)}
              selected={selected}
              onCopyRunToFloor={onCopyRunToFloor}
              onFillRunWithFloor={onFillRunWithFloor}
              onDelete={onDelete}
            />
          </>
        ) : currentScreen === "geo" ? (
          <GeoScreen selected={selected} onObjectUpdate={onObjectUpdate} onSegmentUpdate={onSegmentUpdate} />
        ) : currentScreen === "mat" ? (
          <MatScreen
            selected={selected}
            materialList={materialList}
            onObjectUpdate={onObjectUpdate}
            onAddMaterial={onImportMaterial}
            quality={quality}
            onQualityChange={onQualityChange}
          />
        ) : currentScreen === "open" ? (
          <OpeningsScreen selected={selected} onSegmentUpdate={onSegmentUpdate} zones={zones} activeZoneId={activeZoneId ?? null} />
        ) : currentScreen === "seg" ? (
          <SegmentsScreen selected={selected} materialList={materialList} onAddMaterial={onImportMaterial} onSegmentUpdate={onSegmentUpdate} />
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
        ) : null}
      </div>

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
        <span style={{ color: "#646464", fontSize: 10, fontFamily: "monospace" }}>{summary}</span>
        <span style={{ color: "#505060", fontSize: 14, lineHeight: 1 }}>›</span>
      </span>
    </button>
  );
}

// ── ActionsAccordion ──────────────────────────────────────────────────────────

function ActionsAccordion({ open, onToggle, selected, onCopyRunToFloor, onFillRunWithFloor, onDelete }: {
  open:               boolean;
  onToggle:           () => void;
  selected:           SelectedObjectPayload;
  onCopyRunToFloor?:  (level: number) => void;
  onFillRunWithFloor?: () => void;
  onDelete?:          () => void;
}) {
  const wallData = selected.type === "wall" ? selected.data as WallDef : null;
  const [hovered, setHovered] = useState(false);

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
                        color: isCurrent ? "#404050" : "#80aaff",
                        outline: isCurrent ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(80,140,255,0.3)",
                      }}
                    >{level === 0 ? "G" : String(level)}</button>
                  );
                })}
              </div>
            </div>
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

function GroupsAccordion({ open, onToggle, selected, groups, onObjectUpdate }: {
  open:           boolean;
  onToggle:       () => void;
  selected:       SelectedObjectPayload;
  groups:         GroupDef[];
  onObjectUpdate: (changes: Partial<WorldObject>) => void;
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
            <div style={{ color: "#505060", fontSize: 10, fontFamily: "monospace", lineHeight: 1.5 }}>
              No groups yet — create one in the Groups panel.
            </div>
          ) : groups.map(g => {
            const checked = memberIds.includes(g.id);
            return (
              <button
                key={g.id}
                onClick={() => toggleGroup(g.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
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
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── GeoScreen ─────────────────────────────────────────────────────────────────

function GeoScreen({ selected, onObjectUpdate, onSegmentUpdate }: {
  selected:        SelectedObjectPayload;
  onObjectUpdate:  (changes: Partial<WorldObject>) => void;
  onSegmentUpdate: (wallId: string, changes: Partial<WallDef>) => void;
}) {
  if (selected.type === "wall")     return <WallGeoView     selected={selected} onObjectUpdate={onObjectUpdate} />;
  if (selected.type === "platform") return <PlatformGeoView selected={selected} onObjectUpdate={onObjectUpdate} />;
  if (selected.type === "stair")    return <StairGeoView    selected={selected} onObjectUpdate={onObjectUpdate} />;
  if (selected.type === "object")   return <ObjectGeoView   selected={selected} onObjectUpdate={onObjectUpdate} />;
  if (selected.type === "opening")  return <OpeningGeoView  selected={selected} onObjectUpdate={onObjectUpdate} />;
  return null;
}

// ── WallGeoView ───────────────────────────────────────────────────────────────

function WallGeoView({ selected, onObjectUpdate }: { selected: SelectedObjectPayload; onObjectUpdate: (c: Partial<WorldObject>) => void }) {
  const wallData = selected.data as WallDef | null;
  const [height,    setHeight]    = useState(String(wallData?.height    ?? 3));
  const [thickness, setThickness] = useState(String(wallData?.thickness ?? 0.2));
  const [floorLvl,  setFloorLvl]  = useState(wallData?.floor ?? 0);
  const { schedule, flush } = useFieldDebounce(300);

  useEffect(() => {
    setHeight(String(wallData?.height ?? 3));
    setThickness(String(wallData?.thickness ?? 0.2));
    setFloorLvl(wallData?.floor ?? 0);
  }, [selected.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (field: "height" | "thickness", val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n <= 0) return;
    onObjectUpdate({ [field]: n } as unknown as Partial<WorldObject>);
  };

  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
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

function PlatformGeoView({ selected, onObjectUpdate }: { selected: SelectedObjectPayload; onObjectUpdate: (c: Partial<WorldObject>) => void }) {
  const plat = selected.data as PlatformDef | null;
  const [posStr,   setPosStr]   = useState({ x: String(plat?.position.x ?? 0), y: String(plat?.position.y ?? 0), z: String(plat?.position.z ?? 0) });
  const [rotYStr,  setRotYStr]  = useState(String(plat?.rotation?.y ?? 0));
  const [sizeStr,  setSizeStr]  = useState({ w: String(plat?.size.width ?? 2), d: String(plat?.size.depth ?? 2) });
  const [thickStr, setThickStr] = useState(String(plat?.thickness ?? 0.3));
  const [railH,    setRailH]    = useState(String(plat?.railingHeight ?? 1.0));
  const [hasRail,  setHasRail]  = useState(plat?.hasRailing ?? false);
  const [floorLvl, setFloorLvl] = useState(plat?.floorLevel ?? 0);
  const { schedule, flush } = useFieldDebounce(300);

  useEffect(() => {
    setPosStr({ x: String(plat?.position.x ?? 0), y: String(plat?.position.y ?? 0), z: String(plat?.position.z ?? 0) });
    setRotYStr(String(plat?.rotation?.y ?? 0));
    setSizeStr({ w: String(plat?.size.width ?? 2), d: String(plat?.size.depth ?? 2) });
    setThickStr(String(plat?.thickness ?? 0.3));
    setRailH(String(plat?.railingHeight ?? 1.0));
    setHasRail(plat?.hasRailing ?? false);
    setFloorLvl(plat?.floorLevel ?? 0);
  }, [selected.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setRotYStr(String(plat?.rotation?.y ?? 0)); }, [plat?.rotation?.y]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitPos   = (axis: "x" | "y" | "z", val: string) => { const n = parseFloat(val); if (!Number.isFinite(n)) return; onObjectUpdate({ position: { ...(plat?.position ?? { x: 0, y: 0, z: 0 }), [axis]: n } } as unknown as Partial<WorldObject>); };
  const commitRotY  = (val: string) => { const n = parseFloat(val); if (Number.isFinite(n)) onObjectUpdate({ rotation: { x: 0, y: n, z: 0 } } as unknown as Partial<WorldObject>); };
  const commitSize  = (dim: "width" | "depth", val: string) => { const n = parseFloat(val); if (Number.isFinite(n) && n > 0) onObjectUpdate({ size: { ...(plat?.size ?? { width: 2, depth: 2 }), [dim]: n } } as unknown as Partial<WorldObject>); };
  const commitThick = (val: string) => { const n = parseFloat(val); if (Number.isFinite(n) && n > 0) onObjectUpdate({ thickness: n } as unknown as Partial<WorldObject>); };
  const commitRailH = (val: string) => { const n = parseFloat(val); if (Number.isFinite(n) && n > 0) onObjectUpdate({ railingHeight: n } as unknown as Partial<WorldObject>); };
  const toggleRail  = (checked: boolean) => { setHasRail(checked); onObjectUpdate({ hasRailing: checked } as unknown as Partial<WorldObject>); };

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
              <div style={{ color: "#505060", fontSize: 9, marginBottom: 2 }}>{lbl}</div>
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
          <span style={{ color: "#7a7a7a", fontSize: 10, letterSpacing: 1 }}>RAILING</span>
        </label>
        {hasRail && (
          <div>
            <div style={{ color: "#505060", fontSize: 9, marginBottom: 2 }}>RAILING HEIGHT</div>
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
  const [railBalusters, setRailBalusters] = useState(stair?.railing?.balusters ?? true);
  const [railHeight,    setRailHeight]    = useState(String(stair?.railing?.height        ?? 0.9));
  const [railInterval,  setRailInterval]  = useState(String(stair?.railing?.stepInterval  ?? 1));
  const [railBarT,      setRailBarT]      = useState(String(stair?.railing?.barThickness  ?? 0.1));
  const [railPostT,     setRailPostT]     = useState(String(stair?.railing?.postThickness ?? 0.06));
  const [railSideInset, setRailSideInset] = useState(String(stair?.railing?.sideInset     ?? 0.1));
  const [railOverhang,  setRailOverhang]  = useState(String(stair?.railing?.overhang      ?? 0.15));
  const [undersideMode, setUndersideMode] = useState<StairUndersideMode>(stair?.underside?.mode ?? "open");
  const [undersideThk,  setUndersideThk]  = useState(String(stair?.underside?.thickness ?? 0.25));
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
    setRailBalusters(stair.railing?.balusters ?? true);
    setRailHeight(String(stair.railing?.height        ?? 0.9));
    setRailInterval(String(stair.railing?.stepInterval  ?? 1));
    setRailBarT(String(stair.railing?.barThickness  ?? 0.1));
    setRailPostT(String(stair.railing?.postThickness ?? 0.06));
    setRailSideInset(String(stair.railing?.sideInset ?? 0.1));
    setRailOverhang(String(stair.railing?.overhang ?? 0.15));
    setUndersideMode(stair.underside?.mode ?? "open");
    setUndersideThk(String(stair.underside?.thickness ?? 0.25));
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

  const RAIL_DEFAULTS = { topRail: true, balusters: true, height: 0.9, stepInterval: 1, barThickness: 0.1, postThickness: 0.06, sideInset: 0.1, overhang: 0.15 };
  const updateRailing = (patch: Partial<typeof RAIL_DEFAULTS>) => {
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

      <div style={{ color: "#404050", fontSize: 9 }}>
        Rise: {rise.toFixed(2)} m · Step H: {stepH.toFixed(3)} m
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={hasRailing} onChange={e => toggleRailing(e.target.checked)} style={{ accentColor: "#4d8cff", cursor: "pointer" }} />
          <span style={{ color: hasRailing ? "#9ab" : "#7a7a7a", fontSize: 10, letterSpacing: 1 }}>RAILING</span>
        </label>
        {hasRailing && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 22, borderLeft: "1px solid rgba(255,255,255,0.06)", marginLeft: 6 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={railTopRail} onChange={e => { setRailTopRail(e.target.checked); updateRailing({ topRail: e.target.checked }); }} style={{ accentColor: "#4d8cff", cursor: "pointer" }} />
              <span style={{ color: "#9a9a9a", fontSize: 10 }}>Top rail</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={railBalusters} onChange={e => { setRailBalusters(e.target.checked); updateRailing({ balusters: e.target.checked }); }} style={{ accentColor: "#4d8cff", cursor: "pointer" }} />
              <span style={{ color: "#9a9a9a", fontSize: 10 }}>Balusters</span>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ color: "#505060", fontSize: 9, marginBottom: 2 }}>HEIGHT</div>
                <input type="number" step={0.1} min={0.1} value={railHeight} style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                  onChange={e => { setRailHeight(e.target.value); schedule(() => commitRailHeight(e.target.value)); }}
                  onBlur={e => flush(() => commitRailHeight(e.target.value))}
                  onKeyDown={e => { if (e.key === "Enter") flush(() => commitRailHeight((e.target as HTMLInputElement).value)); }}
                />
              </div>
              <div>
                <div style={{ color: "#505060", fontSize: 9, marginBottom: 2 }}>POST EVERY N STEPS</div>
                <input type="number" step={1} min={1} value={railInterval} style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                  onChange={e => { setRailInterval(e.target.value); schedule(() => commitRailInterval(e.target.value)); }}
                  onBlur={e => flush(() => commitRailInterval(e.target.value))}
                  onKeyDown={e => { if (e.key === "Enter") flush(() => commitRailInterval((e.target as HTMLInputElement).value)); }}
                />
              </div>
              <div>
                <div style={{ color: "#505060", fontSize: 9, marginBottom: 2 }}>RAIL THICKNESS</div>
                <input type="number" step={0.02} min={0.02} value={railBarT} style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                  onChange={e => { setRailBarT(e.target.value); schedule(() => commitRailBarT(e.target.value)); }}
                  onBlur={e => flush(() => commitRailBarT(e.target.value))}
                  onKeyDown={e => { if (e.key === "Enter") flush(() => commitRailBarT((e.target as HTMLInputElement).value)); }}
                />
              </div>
              <div>
                <div style={{ color: "#505060", fontSize: 9, marginBottom: 2 }}>POST THICKNESS</div>
                <input type="number" step={0.02} min={0.02} value={railPostT} style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                  onChange={e => { setRailPostT(e.target.value); schedule(() => commitRailPostT(e.target.value)); }}
                  onBlur={e => flush(() => commitRailPostT(e.target.value))}
                  onKeyDown={e => { if (e.key === "Enter") flush(() => commitRailPostT((e.target as HTMLInputElement).value)); }}
                />
              </div>
              <div>
                <div style={{ color: "#505060", fontSize: 9, marginBottom: 2 }}>SIDE INSET</div>
                <input type="number" step={0.02} min={0} value={railSideInset} style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                  onChange={e => { setRailSideInset(e.target.value); schedule(() => commitRailSideInset(e.target.value)); }}
                  onBlur={e => flush(() => commitRailSideInset(e.target.value))}
                  onKeyDown={e => { if (e.key === "Enter") flush(() => commitRailSideInset((e.target as HTMLInputElement).value)); }}
                />
              </div>
              <div>
                <div style={{ color: "#505060", fontSize: 9, marginBottom: 2 }}>RAIL OVERHANG</div>
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
        <div style={{ color: "#7a7a7a", fontSize: 10, letterSpacing: 1 }}>UNDERSIDE</div>
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
            <div style={{ color: "#505060", fontSize: 9, marginBottom: 2 }}>STRINGER THICKNESS</div>
            <input type="number" step={0.05} min={0.05} value={undersideThk} style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
              onChange={e => { setUndersideThk(e.target.value); schedule(() => commitUndersideThk(e.target.value)); }}
              onBlur={e => flush(() => commitUndersideThk(e.target.value))}
              onKeyDown={e => { if (e.key === "Enter") flush(() => commitUndersideThk((e.target as HTMLInputElement).value)); }}
            />
          </div>
        )}
      </div>

      {/* Cut box */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={hasCutter} onChange={e => toggleCutter(e.target.checked)} style={{ accentColor: "#ffdd00", cursor: "pointer" }} />
          <span style={{ color: hasCutter ? "#ffdd77" : "#7a7a7a", fontSize: 10, letterSpacing: 1 }}>CUT BOX</span>
        </label>
        {hasCutter && (
          <>
            <div>
              <div style={LABEL}>SIZE (W / D / H)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                {([["W",cutW,setCutW,"width"],["D",cutD,setCutD,"depth"],["H",cutH,setCutH,"height"]] as const).map(([lbl,val,setter,field]) => (
                  <div key={field}>
                    <div style={{ color: "#505060", fontSize: 9, marginBottom: 2 }}>{lbl}</div>
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
              <div style={{ color: "#404050", fontSize: 9, marginTop: 3 }}>Y offset = half height puts box bottom at stair end</div>
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
                    <div style={{ color: "#505060", fontSize: 9, marginBottom: 2 }}>{lbl}</div>
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
  const { schedule } = useFieldDebounce(150);

  useEffect(() => {
    setDraft({ position: toStr(selected.position), rotation: toStr(selected.rotation), scale: toStr(selected.scale) });
    setFloorLvl((selected.data as WorldObject | null)?.floor ?? 0);
  }, [selected.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (group: GroupKey, axis: "x" | "y" | "z", raw: string): void => {
    setDraft(prev => {
      const next: Draft = { ...prev, [group]: { ...prev[group], [axis]: raw } };
      const g = next[group];
      schedule(() => onObjectUpdate({ [group]: { x: toNum(g.x), y: toNum(g.y), z: toNum(g.z) } } as Partial<WorldObject>));
      return next;
    });
  };

  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      {GROUPS.map(({ key, label, step }) => (
        <div key={key}>
          <div style={{ ...LABEL, marginBottom: 4 }}>{label}</div>
          <div style={{ display: "flex", gap: 4 }}>
            {AXES.map(({ axis, color }) => (
              <div key={axis} style={{ flex: 1, display: "flex", gap: 4, alignItems: "center", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 6px" }}>
                <span style={{ color, fontSize: 9 }}>{axis.toUpperCase()}</span>
                <input type="text" inputMode="decimal" value={draft[key][axis]} step={step}
                  onChange={e => commit(key, axis, e.target.value)}
                  style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#c0c0c0", fontSize: 10, fontFamily: "monospace" }}
                />
              </div>
            ))}
          </div>
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
          <div style={{ color: "#444", fontSize: 10, fontStyle: "italic" }}>No animations available</div>
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

function MatScreen({ selected, materialList, onObjectUpdate, onAddMaterial, quality, onQualityChange }: {
  selected:        SelectedObjectPayload;
  materialList:    MaterialDef[];
  onObjectUpdate:  (changes: Partial<WorldObject>) => void;
  onAddMaterial:   () => void;
  quality:         QualityScale;
  onQualityChange: (q: QualityScale) => void;
}) {
  const { type } = selected;
  return (
    <div>
      <div style={{ paddingTop: 4 }}>
        {type === "wall"     && <WallMatView     selected={selected} materialList={materialList} onObjectUpdate={onObjectUpdate} onAddMaterial={onAddMaterial} />}
        {type === "floor"    && <FloorMatView    selected={selected} materialList={materialList} onObjectUpdate={onObjectUpdate} onAddMaterial={onAddMaterial} />}
        {type === "platform" && <PlatformMatView selected={selected} materialList={materialList} onObjectUpdate={onObjectUpdate} onAddMaterial={onAddMaterial} />}
        {type === "stair"    && <StairMatView    selected={selected} materialList={materialList} onObjectUpdate={onObjectUpdate} onAddMaterial={onAddMaterial} />}
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

function PlatformMatView({ selected, materialList, onObjectUpdate, onAddMaterial }: { selected: SelectedObjectPayload; materialList: MaterialDef[]; onObjectUpdate: (c: Partial<WorldObject>) => void; onAddMaterial: () => void }) {
  const plat = selected.data as PlatformDef | null;
  return (
    <>
      <MaterialSection
        key={selected.id + ":top"}
        label="TOP / BOTTOM"
        defaultExpanded={false}
        materialList={materialList}
        currentMaterialId={plat?.material ?? "concrete_01"}
        overrides={plat?.materialOverrides}
        onMaterialChange={id => onObjectUpdate({ material: id, materialOverrides: undefined } as unknown as Partial<WorldObject>)}
        onOverridesChange={ov => onObjectUpdate({ materialOverrides: ov } as unknown as Partial<WorldObject>)}
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
        <div style={{ color: "#404050", fontSize: 11, fontStyle: "italic", textAlign: "center", padding: "20px 0" }}>
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

function SegmentsScreen({ selected, materialList, onAddMaterial, onSegmentUpdate }: {
  selected:        SelectedObjectPayload;
  materialList:    MaterialDef[];
  onAddMaterial:   () => void;
  onSegmentUpdate: (wallId: string, changes: Partial<WallDef>) => void;
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
          materialList={materialList}
          onAddMaterial={onAddMaterial}
          onUpdate={changes => onSegmentUpdate(wall.id, changes)}
        />
      ))}
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
        <div style={{ color: "#404050", fontSize: 9, marginTop: 4 }}>
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
}: {
  label?:            string;
  defaultExpanded?:  boolean;
  materialList:      MaterialDef[];
  currentMaterialId: string;
  overrides:         MaterialOverrides | undefined;
  onMaterialChange:  (id: string) => void;
  onOverridesChange: (ov: MaterialOverrides) => void;
  onAddMaterial:     () => void;
}) {
  const baseDef = materialList.find(m => m.id === currentMaterialId);
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
  const commitRough = (val: string) => { const n = parseFloat(val); if (!Number.isFinite(n)) return; onOverridesChange({ ...overrides, roughnessVal: Math.max(0, Math.min(1, n)) }); };
  const commitDisp  = (val: string) => { const n = parseFloat(val); if (!Number.isFinite(n) || n < 0) return; onOverridesChange({ ...overrides, displacementScale: n }); };
  const commitOffX  = (val: string) => { const n = parseFloat(val); if (!Number.isFinite(n)) return; onOverridesChange({ ...overrides, offsetX: n }); };
  const commitOffY  = (val: string) => { const n = parseFloat(val); if (!Number.isFinite(n)) return; onOverridesChange({ ...overrides, offsetY: n }); };

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

  const currentLabel = baseDef?.label ?? currentMaterialId;

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
            <span style={{ color: "#707070", fontSize: 10, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentLabel}
            </span>
          )}
        </span>
        <span style={{ color: "#6b86b8", fontSize: 14, lineHeight: 1, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>›</span>
      </button>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 16px 14px" }}>
          <button
            onClick={onAddMaterial}
            style={{ padding: "5px 10px", borderRadius: 4, cursor: "pointer", background: "rgba(20,30,45,0.6)", border: "1px dashed rgba(255,255,255,0.1)", color: "#646464", fontSize: 10, fontFamily: "monospace", textAlign: "left" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(80,140,255,0.5)"; e.currentTarget.style.color = "#80aaff"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#646464"; }}
          >
            + add material
          </button>

          <MaterialCategoryPills categories={orderedCats} active={matCat} onSelect={setMatCat} />

          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: "min(52vh, 520px)", overflowY: "auto" }}>
            {pinnedCurrent && (
              <>
                <div style={{ color: "#646464", fontSize: 9, letterSpacing: 1, padding: "0 2px" }}>
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
        <label htmlFor="split-tile" style={{ color: "#646464", fontSize: 10, cursor: "pointer", userSelect: "none" }}>
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
                <span style={{ color: ov ? "#c0c0c0" : "#7a7a7a", fontSize: 10, fontFamily: "monospace", flex: 1, fontStyle: ov ? "italic" : "normal" }}>
                  {mapLabel}{ov ? "*" : ""}
                </span>
                {key === "roughness" && !roughEnabled && (
                  <input type="number" step={0.05} min={0} max={1} value={roughStr}
                    onChange={e => { setRoughStr(e.target.value); schedule(() => commitRough(e.target.value)); }}
                    onBlur={e => flush(() => commitRough(e.target.value))}
                    style={{ ...NUM_INPUT, width: 52, padding: "2px 5px", fontSize: 10 }}
                  />
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
              <span style={{ color: "#505060", fontSize: 9, userSelect: "none" }}>TRIM</span>
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
            <div style={{ color: "#505060", fontSize: 9, marginBottom: 2 }}>{lbl}</div>
            <input type="number" step={0.1} min={min} value={val}
              style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
              onChange={e => { setter(e.target.value); schedule(() => commitNum(e.target.value, min, field)); }}
              onBlur={e => flush(() => commitNum(e.target.value, min, field))}
            />
          </div>
        ))}

        <div>
          <div style={{ color: "#505060", fontSize: 9, marginBottom: 2 }}>INNER T+B</div>
          <input type="number" step={0.1} min={0.01} placeholder="auto" value={innerHStr}
            style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
            onChange={e => { setInnerHStr(e.target.value); schedule(() => commitInnerTile(e.target.value, "innerTileH")); }}
            onBlur={e => flush(() => commitInnerTile(e.target.value, "innerTileH"))}
          />
        </div>
        <div>
          <div style={{ color: "#505060", fontSize: 9, marginBottom: 2 }}>INNER L+R</div>
          <input type="number" step={0.1} min={0.01} placeholder="auto" value={innerVStr}
            style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
            onChange={e => { setInnerVStr(e.target.value); schedule(() => commitInnerTile(e.target.value, "innerTileV")); }}
            onBlur={e => flush(() => commitInnerTile(e.target.value, "innerTileV"))}
          />
        </div>
      </div>

      {(opening.type === "door" || opening.type === "arch") && (
        <div style={{ marginTop: 4 }}>
          <div style={{ color: "#505060", fontSize: 9, marginBottom: 4 }}>ZONE LINK</div>
          {!zonePickerOpen ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ flex: 1, fontSize: 10, color: opening.linkedZoneId ? "#80aaff" : "#404050", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                <div style={{ color: "#404050", fontSize: 10, fontStyle: "italic" }}>No other zones</div>
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

function WallSegmentRow({ index, wall, materialList, onAddMaterial, onUpdate }: {
  index:         number;
  wall:          WallDef;
  materialList:  MaterialDef[];
  onAddMaterial: () => void;
  onUpdate:      (changes: Partial<WallDef>) => void;
}) {
  const [tileStr, setTileStr] = useState(String(wall.materialOverrides?.tileScale ?? ""));

  useEffect(() => {
    setTileStr(String(wall.materialOverrides?.tileScale ?? ""));
  }, [wall.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { schedule, flush } = useFieldDebounce(300);

  const commitTile = (val: string) => {
    const trimmed = val.trim();
    if (trimmed === "") { onUpdate({ materialOverrides: undefined }); return; }
    const n = parseFloat(trimmed);
    if (Number.isFinite(n) && n > 0) onUpdate({ materialOverrides: { ...(wall.materialOverrides ?? {}), tileScale: n } });
  };

  return (
    <div style={{ background: "rgba(20,30,45,0.6)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 4, padding: "6px 8px", marginBottom: 4 }}>
      <div style={{ color: "#646464", fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>SEG {index}</div>

      <div style={{ marginBottom: 4 }}>
        <div style={{ color: "#505060", fontSize: 9, marginBottom: 2 }}>MATERIAL</div>
        <select value={wall.material} onChange={e => onUpdate({ material: e.target.value, materialOverrides: undefined })}
          style={{ ...NUM_INPUT, padding: "2px 4px", cursor: "pointer" }}
        >
          {materialList.length === 0 && <option value={wall.material}>{wall.material}</option>}
          {materialList.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <div style={{ color: "#505060", fontSize: 9, flexShrink: 0 }}>TILE</div>
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
  settings, assets, onChange, position, onPositionChange,
}: { settings: PlayerSettings; assets: AssetDef[]; onChange: (s: Partial<PlayerSettings>) => void; position?: Vec3; onPositionChange?: (pos: Vec3) => void }) {
  const numField = (label: string, key: keyof PlayerSettings, step = 0.1, fallback?: number) => (
    <div key={key}>
      <div style={{ ...LABEL, marginBottom: 3 }}>{label}</div>
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

  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      {position && (
        <div>
          <div style={{ ...LABEL, marginBottom: 4 }}>POSITION</div>
          <div style={{ display: "flex", gap: 6 }}>
            {posField("x")}{posField("y")}{posField("z")}
          </div>
        </div>
      )}
      <div style={{ color: "#646464", fontSize: 11, marginBottom: 2 }}>Player settings for this world.</div>

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

      {numField("MOVE SPEED", "moveSpeed", 0.5)}
      {numField("JUMP HEIGHT", "jumpHeight", 0.1)}
      {settings.cameraMode === "fps" && numField("FOV", "fov", 1)}
      {settings.cameraMode === "thirdperson" && numField("3RD PERSON DISTANCE", "thirdPersonDistance", 0.5)}
      {settings.cameraMode === "thirdperson" && numField("3RD PERSON HEIGHT", "thirdPersonHeight", 0.5)}
      {settings.cameraMode === "thirdperson" && numField("CHARACTER SCALE", "characterScale", 0.1, 1)}
      {settings.cameraMode === "thirdperson" && numField("JUMP ANIM SPEED", "jumpAnimSpeed", 0.1, 1)}

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

      {settings.cameraMode === "thirdperson" && modelClips.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ ...LABEL, marginBottom: 0 }}>CHARACTER ANIMATIONS</div>
          {animSlots.map(({ slot, label }) => animField(slot, label))}
        </div>
      )}
    </div>
  );
}

// ── TriggerVolumeView ─────────────────────────────────────────────────────────

function blankVolumeScript(zoneId: string, volId: string, type: "on_player_enter" | "on_player_exit"): ScriptDef {
  return {
    id:         `scr_${crypto.randomUUID().slice(0, 8)}`,
    label:      type === "on_player_enter" ? "On Enter" : "On Exit",
    zoneId,
    enabled:    true,
    trigger:    { type, targetId: volId },
    conditions: [],
    actions:    [],
    oneShot:    false,
  };
}

function TriggerVolumeView({ selected, onDelete, onScriptsChange, groups, groupsOpen, onToggleGroups, onObjectUpdate }: {
  selected:         SelectedObjectPayload;
  onDelete?:        () => void;
  onScriptsChange?: (scripts: ScriptDef[]) => void;
  groups:           GroupDef[];
  groupsOpen:       boolean;
  onToggleGroups:   () => void;
  onObjectUpdate:   (changes: Partial<WorldObject>) => void;
}) {
  const vol = selected.data as TriggerVolume | null;
  if (!vol) return null;
  const fmt     = (n: number) => n.toFixed(2);
  const scripts = vol.scripts ?? [];

  function addScript(type: "on_player_enter" | "on_player_exit"): void {
    if (!onScriptsChange) return;
    onScriptsChange([...scripts, blankVolumeScript(vol!.zoneId, vol!.id, type)]);
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
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ color: "#606070", fontSize: 10, fontFamily: "monospace", lineHeight: 1.5,
                    padding: "6px 8px", background: "rgba(255,255,255,0.03)",
                    borderRadius: 4, border: "1px solid rgba(255,255,255,0.06)" }}>
        An invisible 3D detection box. Scripts fire when the player walks in or out.
        Trigger volumes are independent of map zones — they can run any action.
      </div>
      <div>
        <div style={LABEL}>LABEL</div>
        <div style={{ color: "#c0c0c0", fontSize: 11, fontFamily: "monospace" }}>{vol.label}</div>
      </div>
      <div>
        <div style={LABEL}>POSITION</div>
        <div style={{ display: "flex", gap: 12 }}>
          {(["x", "y", "z"] as const).map((axis, i) => (
            <div key={axis} style={{ flex: 1 }}>
              <div style={{ color: ["#ff6b6b","#6bff8a","#6b8aff"][i]!, fontSize: 9, letterSpacing: 1, marginBottom: 2 }}>{axis.toUpperCase()}</div>
              <div style={{ ...NUM_INPUT, color: "#909090" }}>{fmt(vol.position[axis])}</div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div style={LABEL}>SIZE</div>
        <div style={{ display: "flex", gap: 12 }}>
          {([["x","W"],["y","H"],["z","D"]] as const).map(([axis, lbl]) => (
            <div key={axis} style={{ flex: 1 }}>
              <div style={{ color: "#666", fontSize: 9, letterSpacing: 1, marginBottom: 2 }}>{lbl}</div>
              <div style={{ ...NUM_INPUT, color: "#909090" }}>{fmt(vol.size[axis])}</div>
            </div>
          ))}
        </div>
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
        {scripts.length === 0 && (
          <div style={{ color: "#444", fontSize: 10, fontStyle: "italic" }}>
            No scripts — add Entry or Exit above
          </div>
        )}
        {scripts.map(s => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4,
                                    background: "rgba(255,255,255,0.03)", borderRadius: 4,
                                    padding: "4px 8px", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div
              onClick={() => toggleScript(s.id)}
              title={s.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
              style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
                       background: s.enabled ? "#44cc88" : "#444" }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "#b0b0b0", fontSize: 11, fontFamily: "monospace",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.label}
              </div>
              <div style={{ color: "#00ffcc", fontSize: 9, opacity: 0.7 }}>
                {s.trigger.type} · {s.actions.length} action{s.actions.length !== 1 ? "s" : ""}
              </div>
            </div>
            {onScriptsChange && (
              <button
                onClick={() => deleteScript(s.id)}
                title="Remove script from this volume"
                style={{ background: "none", border: "none", color: "#664444", fontSize: 13,
                         cursor: "pointer", padding: "0 2px", lineHeight: 1 }}
              >×</button>
            )}
          </div>
        ))}
        {scripts.length > 0 && (
          <div style={{ color: "#444", fontSize: 9, fontStyle: "italic", marginTop: 4 }}>
            Edit actions in the Scripts panel →
          </div>
        )}
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
    />
    </>
  );
}

// ── ToolView ──────────────────────────────────────────────────────────────────

function ToolView({ activeTool }: { activeTool: ToolId }) {
  const info = TOOL_INFO[activeTool];
  return (
    <>
      <div style={{ padding: "10px 16px 0", color: "#646464", fontSize: 11 }}>{info.desc}</div>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ padding: "8px 12px", background: "rgba(80,140,255,0.06)", border: "1px solid rgba(80,140,255,0.15)", borderRadius: 6, color: "#909090", fontSize: 11 }}>
          {info.hint}
        </div>
      </div>
      <div style={{ margin: "10px 16px 0", paddingTop: 2 }}>
        <div style={{ ...LABEL, marginBottom: 8 }}>ASSETS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {PLACEHOLDER_ASSETS.map(name => (
            <div key={name} style={{ padding: "8px 6px", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, color: "#7a7a7a", fontSize: 10, textAlign: "center", cursor: "pointer", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(80,140,255,0.3)"; e.currentTarget.style.color = "#80aaff"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#7a7a7a"; }}
            >
              {name}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
