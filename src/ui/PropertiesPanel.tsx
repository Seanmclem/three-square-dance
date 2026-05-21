import { useEffect, useRef, useState } from "react";
import type {
  ToolId, SelectedObjectPayload, WorldObject, Vec3,
  FloorDef, WallDef, MaterialDef, MaterialOverrides, QualityScale,
} from "@/types";
import { MaterialImporterModal } from "@/ui/MaterialImporterModal";

interface ToolInfo { desc: string; hint: string }

const TOOL_INFO: Record<ToolId, ToolInfo> = {
  select:   { desc: "Click any object to select it. Use gizmos to transform.", hint: "Nothing selected" },
  floor:    { desc: "Click and drag to paint a floor region.",                 hint: "Click to place floor origin" },
  wall:     { desc: "Click to set wall start, click again to set end.",        hint: "Click to place wall start" },
  platform: { desc: "Click and drag to define a freestanding platform.",       hint: "Click to place platform" },
  stair:    { desc: "Click bottom point, then top point of staircase.",        hint: "Click bottom of stair" },
  object:   { desc: "Choose an asset below, click to place.",                  hint: "Select an asset first" },
  zone:     { desc: "Draw a zone boundary to group rooms.",                    hint: "Click to define zone area" },
};

const PLACEHOLDER_ASSETS = ["Wall Segment", "Floor Tile", "Door Frame", "Window", "Staircase", "Platform"] as const;

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

const PANEL_STYLE: React.CSSProperties = {
  position: "absolute", right: 0, top: 0, bottom: 0, width: 280,
  background: "rgba(10,14,22,0.95)", borderLeft: "1px solid rgba(80,120,180,0.2)",
  display: "flex", flexDirection: "column", zIndex: 10,
};

const NUM_INPUT: React.CSSProperties = {
  width: "100%", border: "1px solid rgba(80,120,180,0.2)", borderRadius: 4,
  background: "rgba(20,30,45,0.8)", color: "#9ab8d4", fontSize: 11,
  fontFamily: "monospace", padding: "4px 8px", outline: "none",
};

const LABEL: React.CSSProperties = {
  color: "#4a6a8a", fontSize: 10, letterSpacing: 1, marginBottom: 4,
};

interface PropertiesPanelProps {
  activeTool:        ToolId;
  selected:          SelectedObjectPayload | null;
  materialList:      MaterialDef[];
  quality:           QualityScale;
  onObjectUpdate:    (changes: Partial<WorldObject>) => void;
  onMaterialsReload: () => void;
  onQualityChange:   (q: QualityScale) => void;
}

export function PropertiesPanel({
  activeTool, selected, materialList, quality, onObjectUpdate, onMaterialsReload, onQualityChange,
}: PropertiesPanelProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const debounceRef = useRef<number | null>(null);

  const [texturesDir,  setTexturesDir]  = useState<FileSystemDirectoryHandle | null>(null);
  const [importerOpen, setImporterOpen] = useState(false);
  const [dirError,     setDirError]     = useState<string | null>(null);

  useEffect(() => {
    if (debounceRef.current !== null) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    const needsDraft = selected && selected.type !== "wall" && selected.type !== "floor";
    setDraft(needsDraft
      ? { position: toStr(selected.position), rotation: toStr(selected.rotation), scale: toStr(selected.scale) }
      : null);
  }, [selected]);

  useEffect(() => () => { if (debounceRef.current !== null) clearTimeout(debounceRef.current); }, []);

  const commit = (group: GroupKey, axis: "x" | "y" | "z", raw: string): void => {
    setDraft(prev => {
      if (!prev) return prev;
      const next: Draft = { ...prev, [group]: { ...prev[group], [axis]: raw } };
      const g = next[group];
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        onObjectUpdate({ [group]: { x: toNum(g.x), y: toNum(g.y), z: toNum(g.z) } } as Partial<WorldObject>);
        debounceRef.current = null;
      }, 150);
      return next;
    });
  };

  const openImporter = () => {
    setDirError(null);
    if (!("showDirectoryPicker" in window)) {
      setDirError("Material importer requires Chrome or Edge.");
      return;
    }
    setImporterOpen(true);
  };

  const handleImportComplete = (_m: MaterialDef) => {
    setImporterOpen(false);
    onMaterialsReload();
  };

  return (
    <div style={PANEL_STYLE}>
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(80,120,180,0.15)" }}>
        <div style={{ color: "#80aaff", fontSize: 11, letterSpacing: 2 }}>PROPERTIES</div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {selected && selected.type === "floor"
          ? <FloorView
              selected={selected} materialList={materialList} onObjectUpdate={onObjectUpdate}
              onAddMaterial={openImporter}
            />
          : selected && selected.type === "wall"
            ? <WallView
                selected={selected} materialList={materialList} onObjectUpdate={onObjectUpdate}
                onAddMaterial={openImporter}
              />
            : selected && draft
              ? <TransformView selected={selected} draft={draft} commit={commit} />
              : <ToolView activeTool={activeTool} />}
      </div>

      {/* Quality — always visible at panel bottom */}
      <div style={{
        padding: "10px 16px", borderTop: "1px solid rgba(80,120,180,0.1)",
        display: "flex", flexDirection: "column", gap: 6,
      }}>
        <div style={LABEL}>QUALITY</div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["low", "medium", "high"] as QualityScale[]).map(q => (
            <button
              key={q}
              onClick={() => onQualityChange(q)}
              style={{
                flex: 1, padding: "4px 0", borderRadius: 4, cursor: "pointer",
                fontFamily: "monospace", fontSize: 10, border: "none",
                background: quality === q ? "rgba(80,140,255,0.25)" : "rgba(20,30,45,0.8)",
                color: quality === q ? "#80aaff" : "#4a6a8a",
                outline: quality === q ? "1px solid rgba(80,140,255,0.4)" : "1px solid rgba(80,120,180,0.12)",
              }}
            >{q}</button>
          ))}
        </div>
      </div>

      {dirError && (
        <div style={{ padding: "4px 16px 8px", color: "#ff6b6b", fontSize: 10 }}>{dirError}</div>
      )}

      {importerOpen && (
        <MaterialImporterModal
          texturesDir={texturesDir}
          onTextureDirSet={setTexturesDir}
          onComplete={handleImportComplete}
          onClose={() => setImporterOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Floor view ───────────────────────────────────────────────────────────────

function FloorView({ selected, materialList, onObjectUpdate, onAddMaterial }: {
  selected:       SelectedObjectPayload;
  materialList:   MaterialDef[];
  onObjectUpdate: (changes: Partial<WorldObject>) => void;
  onAddMaterial:  () => void;
}) {
  const floorData = selected.data as FloorDef | null;

  return (
    <>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(80,120,180,0.1)" }}>
        <div style={{ color: "#6a90b8", fontSize: 12, fontFamily: "monospace" }}>{selected.id}</div>
        <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>
          floor · level {floorData?.level ?? 0}
        </div>
      </div>

      <div style={{ padding: "10px 16px" }}>
        <MaterialSection
          materialList={materialList}
          currentMaterialId={floorData?.floorMesh.material ?? "concrete_01"}
          overrides={floorData?.materialOverrides}
          onMaterialChange={id => onObjectUpdate({
            floorMesh: { ...floorData!.floorMesh, material: id },
            materialOverrides: undefined,
          } as unknown as Partial<WorldObject>)}
          onOverridesChange={ov => onObjectUpdate({
            materialOverrides: ov,
          } as unknown as Partial<WorldObject>)}
          onAddMaterial={onAddMaterial}
        />
      </div>
    </>
  );
}

// ─── Transform view ───────────────────────────────────────────────────────────

function TransformView({ selected, draft, commit }: {
  selected: SelectedObjectPayload;
  draft: Draft;
  commit: (g: GroupKey, a: "x" | "y" | "z", raw: string) => void;
}) {
  return (
    <>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(80,120,180,0.1)" }}>
        <div style={{ color: "#6a90b8", fontSize: 12, fontFamily: "monospace" }}>{selected.id}</div>
        <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>
          {selected.type}
        </div>
      </div>
      <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {GROUPS.map(({ key, label, step }) => (
          <div key={key}>
            <div style={{ ...LABEL, marginBottom: 4 }}>{label}</div>
            <div style={{ display: "flex", gap: 4 }}>
              {AXES.map(({ axis, color }) => (
                <div key={axis} style={{
                  flex: 1, display: "flex", gap: 4, alignItems: "center",
                  background: "rgba(20,30,45,0.8)", border: "1px solid rgba(80,120,180,0.15)",
                  borderRadius: 4, padding: "2px 6px",
                }}>
                  <span style={{ color, fontSize: 9 }}>{axis.toUpperCase()}</span>
                  <input
                    type="text" inputMode="decimal"
                    value={draft[key][axis]} step={step}
                    onChange={e => commit(key, axis, e.target.value)}
                    style={{
                      width: "100%", minWidth: 0, border: "none", outline: "none",
                      background: "transparent", color: "#9ab8d4",
                      fontSize: 10, fontFamily: "monospace",
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Wall view ────────────────────────────────────────────────────────────────

function WallView({ selected, materialList, onObjectUpdate, onAddMaterial }: {
  selected:       SelectedObjectPayload;
  materialList:   MaterialDef[];
  onObjectUpdate: (changes: Partial<WorldObject>) => void;
  onAddMaterial:  () => void;
}) {
  const wallData   = selected.data as WallDef | null;
  const [height,    setHeight]    = useState(String(wallData?.height    ?? 3));
  const [thickness, setThickness] = useState(String(wallData?.thickness ?? 0.2));
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current !== null) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    setHeight(String(wallData?.height ?? 3));
    setThickness(String(wallData?.thickness ?? 0.2));
  }, [selected.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (debounceRef.current !== null) clearTimeout(debounceRef.current); }, []);

  const scheduleCommit = (field: "height" | "thickness", val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n <= 0) return;
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      onObjectUpdate({ [field]: n } as unknown as Partial<WorldObject>);
      debounceRef.current = null;
    }, 300);
  };

  const flushCommit = (field: "height" | "thickness", val: string) => {
    if (debounceRef.current !== null) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n <= 0) return;
    onObjectUpdate({ [field]: n } as unknown as Partial<WorldObject>);
  };

  return (
    <>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(80,120,180,0.1)" }}>
        <div style={{ color: "#6a90b8", fontSize: 12, fontFamily: "monospace" }}>{selected.id}</div>
        <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>
          wall · level {wallData?.floor ?? 0}
        </div>
      </div>

      <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div style={LABEL}>HEIGHT</div>
          <input type="number" value={height} step={0.5} min={0.5} style={NUM_INPUT}
            onChange={e => { setHeight(e.target.value); scheduleCommit("height", e.target.value); }}
            onBlur={e => flushCommit("height", e.target.value)}
          />
        </div>
        <div>
          <div style={LABEL}>THICKNESS</div>
          <input type="number" value={thickness} step={0.1} min={0.1} style={NUM_INPUT}
            onChange={e => { setThickness(e.target.value); scheduleCommit("thickness", e.target.value); }}
            onBlur={e => flushCommit("thickness", e.target.value)}
          />
        </div>

        <MaterialSection
          materialList={materialList}
          currentMaterialId={wallData?.material ?? "brick_01"}
          overrides={wallData?.materialOverrides}
          onMaterialChange={id => onObjectUpdate({
            material: id,
            materialOverrides: undefined,
          } as unknown as Partial<WorldObject>)}
          onOverridesChange={ov => onObjectUpdate({
            materialOverrides: ov,
          } as unknown as Partial<WorldObject>)}
          onAddMaterial={onAddMaterial}
        />
      </div>
    </>
  );
}

// ─── Material section ─────────────────────────────────────────────────────────

type MapKey = keyof MaterialDef['maps'];

const MAP_ROWS: Array<{ key: MapKey; label: string }> = [
  { key: "albedo",       label: "Albedo" },
  { key: "normal",       label: "Normal" },
  { key: "roughness",    label: "Roughness" },
  { key: "metalness",    label: "Metalness" },
  { key: "ao",           label: "AO" },
  { key: "displacement", label: "Displacement" },
];

function MaterialSection({
  materialList, currentMaterialId, overrides, onMaterialChange, onOverridesChange, onAddMaterial,
}: {
  materialList:      MaterialDef[];
  currentMaterialId: string;
  overrides:         MaterialOverrides | undefined;
  onMaterialChange:  (id: string) => void;
  onOverridesChange: (ov: MaterialOverrides) => void;
  onAddMaterial:     () => void;
}) {
  const baseDef = materialList.find(m => m.id === currentMaterialId);

  const [tileStr,  setTileStr]  = useState(String(overrides?.tileScale         ?? baseDef?.tileScale         ?? 1.0));
  const [roughStr, setRoughStr] = useState(String(overrides?.roughnessVal      ?? baseDef?.roughnessVal      ?? 0.85));
  const [dispStr,  setDispStr]  = useState(String(overrides?.displacementScale ?? baseDef?.displacementScale ?? 0.03));

  // Reset local string state when the selected material changes
  useEffect(() => {
    setTileStr(String(overrides?.tileScale         ?? baseDef?.tileScale         ?? 1.0));
    setRoughStr(String(overrides?.roughnessVal     ?? baseDef?.roughnessVal      ?? 0.85));
    setDispStr(String(overrides?.displacementScale ?? baseDef?.displacementScale ?? 0.03));
  }, [currentMaterialId]); // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveEnabled = (key: MapKey): boolean => {
    const ov = overrides?.maps?.[key]?.enabled;
    return ov !== undefined ? ov : (baseDef?.maps[key]?.enabled ?? false);
  };

  const isOverridden = (key: MapKey): boolean =>
    overrides?.maps?.[key]?.enabled !== undefined &&
    overrides.maps[key]!.enabled !== (baseDef?.maps[key]?.enabled ?? false);

  const toggleMap = (key: MapKey) => {
    const next = !effectiveEnabled(key);
    onOverridesChange({
      ...overrides,
      maps: { ...(overrides?.maps ?? {}), [key]: { enabled: next } },
    });
  };

  const commitTile = (val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n <= 0) return;
    onOverridesChange({ ...overrides, tileScale: n });
  };

  const commitRough = (val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n)) return;
    onOverridesChange({ ...overrides, roughnessVal: Math.max(0, Math.min(1, n)) });
  };

  const commitDisp = (val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n < 0) return;
    onOverridesChange({ ...overrides, displacementScale: n });
  };

  const roughEnabled = effectiveEnabled("roughness");
  const dispEnabled  = effectiveEnabled("displacement");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={LABEL}>MATERIAL</div>

      {/* Picker */}
      <button
        onClick={onAddMaterial}
        style={{
          padding: "5px 10px", borderRadius: 4, cursor: "pointer",
          background: "rgba(20,30,45,0.6)", border: "1px dashed rgba(80,120,180,0.3)",
          color: "#4a6a8a", fontSize: 10, fontFamily: "monospace", textAlign: "left",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(80,140,255,0.5)"; e.currentTarget.style.color = "#80aaff"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(80,120,180,0.3)"; e.currentTarget.style.color = "#4a6a8a"; }}
      >
        + add ambientcg material
      </button>

      <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 130, overflowY: "auto" }}>
        {materialList.map(mat => {
          const active = mat.id === currentMaterialId;
          return (
            <div key={mat.id} onClick={() => onMaterialChange(mat.id)} style={{
              padding: "5px 10px",
              background: active ? "rgba(80,140,255,0.15)" : "rgba(20,30,45,0.8)",
              border: `1px solid ${active ? "rgba(80,140,255,0.4)" : "rgba(80,120,180,0.12)"}`,
              borderRadius: 4, color: active ? "#80aaff" : "#5a7a9a",
              fontSize: 11, fontFamily: "monospace", cursor: "pointer",
            }}>
              {mat.label}
            </div>
          );
        })}
      </div>

      {/* Tile scale */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <div style={{ ...LABEL, marginBottom: 0, width: 60, flexShrink: 0 }}>TILE</div>
        <input
          type="number" step={0.1} min={0.1}
          value={tileStr}
          onChange={e => setTileStr(e.target.value)}
          onBlur={e => commitTile(e.target.value)}
          style={{ ...NUM_INPUT, padding: "3px 6px", fontSize: 10 }}
        />
      </div>

      {/* Map toggles */}
      <div style={{ borderTop: "1px solid rgba(80,120,180,0.1)", paddingTop: 8 }}>
        <div style={{ ...LABEL, marginBottom: 6 }}>MAPS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {MAP_ROWS.map(({ key, label }) => {
            const enabled = effectiveEnabled(key);
            const ov      = isOverridden(key);
            return (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggleMap(key)}
                  style={{ accentColor: "#80aaff", cursor: "pointer", flexShrink: 0 }}
                />
                <span style={{
                  color: ov ? "#9ab8d4" : "#5a7a9a",
                  fontSize: 10, fontFamily: "monospace", flex: 1,
                  fontStyle: ov ? "italic" : "normal",
                }}>
                  {label}{ov ? "*" : ""}
                </span>
                {/* Roughness scalar when map is disabled */}
                {key === "roughness" && !roughEnabled && (
                  <input
                    type="number" step={0.05} min={0} max={1}
                    value={roughStr}
                    onChange={e => setRoughStr(e.target.value)}
                    onBlur={e => commitRough(e.target.value)}
                    style={{ ...NUM_INPUT, width: 52, padding: "2px 5px", fontSize: 10 }}
                  />
                )}
                {/* Displacement scale when map is enabled */}
                {key === "displacement" && dispEnabled && (
                  <input
                    type="number" step={0.005} min={0}
                    value={dispStr}
                    onChange={e => setDispStr(e.target.value)}
                    onBlur={e => commitDisp(e.target.value)}
                    style={{ ...NUM_INPUT, width: 52, padding: "2px 5px", fontSize: 10 }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Tool view ────────────────────────────────────────────────────────────────

function ToolView({ activeTool }: { activeTool: ToolId }) {
  const info = TOOL_INFO[activeTool];
  return (
    <>
      <div style={{ padding: "10px 16px 0", color: "#4a6a8a", fontSize: 11 }}>{info.desc}</div>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(80,120,180,0.1)" }}>
        <div style={{
          padding: "8px 12px", background: "rgba(80,140,255,0.06)",
          border: "1px solid rgba(80,140,255,0.15)", borderRadius: 6,
          color: "#6a90b8", fontSize: 11,
        }}>
          {info.hint}
        </div>
      </div>
      <div style={{ margin: "10px 16px 0", paddingTop: 2 }}>
        <div style={{ ...LABEL, marginBottom: 8 }}>ASSETS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {PLACEHOLDER_ASSETS.map(name => (
            <div key={name} style={{
              padding: "8px 6px", background: "rgba(20,30,45,0.8)",
              border: "1px solid rgba(80,120,180,0.12)", borderRadius: 6,
              color: "#5a7a9a", fontSize: 10, textAlign: "center", cursor: "pointer",
              transition: "all 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(80,140,255,0.3)"; e.currentTarget.style.color = "#80aaff"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(80,120,180,0.12)"; e.currentTarget.style.color = "#5a7a9a"; }}
            >
              {name}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
