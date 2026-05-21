import { useEffect, useRef, useState } from "react";
import type { ToolId, SelectedObjectPayload, WorldObject, Vec3, FloorDef, WallDef } from "@/types";
import type { MaterialDef } from "@/types";
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

interface PropertiesPanelProps {
  activeTool:     ToolId;
  selected:       SelectedObjectPayload | null;
  materialList:   MaterialDef[];
  onObjectUpdate: (changes: Partial<WorldObject>) => void;
  onMaterialsReload: () => void;
}

export function PropertiesPanel({
  activeTool, selected, materialList, onObjectUpdate, onMaterialsReload,
}: PropertiesPanelProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const debounceRef = useRef<number | null>(null);

  // texturesDir handle — requested once per session, kept in state
  const [texturesDir,   setTexturesDir]   = useState<FileSystemDirectoryHandle | null>(null);
  const [importerOpen,  setImporterOpen]  = useState(false);
  const [dirError,      setDirError]      = useState<string | null>(null);

  useEffect(() => {
    if (debounceRef.current !== null) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    setDraft(selected
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

  const openImporter = async () => {
    setDirError(null);
    if (!("showDirectoryPicker" in window)) {
      setDirError("Material importer requires Chrome or Edge.");
      return;
    }
    let dir = texturesDir;
    if (!dir) {
      try {
        dir = await window.showDirectoryPicker({ mode: "readwrite" });
        setTexturesDir(dir);
      } catch (e) {
        if ((e as DOMException).name !== "AbortError")
          setDirError("Could not open textures folder: " + String(e));
        return;
      }
    }
    setImporterOpen(true);
  };

  const handleImportComplete = (material: MaterialDef) => {
    void material;
    setImporterOpen(false);
    onMaterialsReload();
  };

  return (
    <div style={PANEL_STYLE}>
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(80,120,180,0.15)" }}>
        <div style={{ color: "#80aaff", fontSize: 11, letterSpacing: 2 }}>PROPERTIES</div>
      </div>
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
      <div style={{ flex: 1 }} />

      {dirError && (
        <div style={{ padding: "6px 16px", color: "#ff6b6b", fontSize: 10 }}>{dirError}</div>
      )}

      {importerOpen && texturesDir && (
        <MaterialImporterModal
          texturesDir={texturesDir}
          onComplete={handleImportComplete}
          onClose={() => setImporterOpen(false)}
        />
      )}
    </div>
  );
}

function FloorView({ selected, materialList, onObjectUpdate, onAddMaterial }: {
  selected:       SelectedObjectPayload;
  materialList:   MaterialDef[];
  onObjectUpdate: (changes: Partial<WorldObject>) => void;
  onAddMaterial:  () => void;
}) {
  const floorData  = selected.data as FloorDef | null;
  const currentMat = floorData?.floorMesh.material ?? "concrete_01";

  return (
    <>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(80,120,180,0.1)" }}>
        <div style={{ color: "#6a90b8", fontSize: 12, fontFamily: "monospace" }}>{selected.id}</div>
        <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>
          floor · level {floorData?.level ?? 0}
        </div>
      </div>

      <div style={{ padding: "10px 16px" }}>
        <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>MATERIAL</div>
        <MaterialPicker
          materialList={materialList}
          current={currentMat}
          onSelect={id => onObjectUpdate({
            floorMesh: { ...floorData!.floorMesh, material: id },
          } as unknown as Partial<WorldObject>)}
          onAddMaterial={onAddMaterial}
        />
      </div>
    </>
  );
}

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
            <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>{label}</div>
            <div style={{ display: "flex", gap: 4 }}>
              {AXES.map(({ axis, color }) => (
                <div key={axis} style={{
                  flex: 1, display: "flex", gap: 4, alignItems: "center",
                  background: "rgba(20,30,45,0.8)", border: "1px solid rgba(80,120,180,0.15)",
                  borderRadius: 4, padding: "2px 6px",
                }}>
                  <span style={{ color, fontSize: 9 }}>{axis.toUpperCase()}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draft[key][axis]}
                    step={step}
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

const NUM_INPUT: React.CSSProperties = {
  width: "100%", border: "1px solid rgba(80,120,180,0.2)", borderRadius: 4,
  background: "rgba(20,30,45,0.8)", color: "#9ab8d4", fontSize: 11,
  fontFamily: "monospace", padding: "4px 8px", outline: "none",
};

function WallView({ selected, materialList, onObjectUpdate, onAddMaterial }: {
  selected:       SelectedObjectPayload;
  materialList:   MaterialDef[];
  onObjectUpdate: (changes: Partial<WorldObject>) => void;
  onAddMaterial:  () => void;
}) {
  const wallData   = selected.data as WallDef | null;
  const [height,    setHeight]    = useState(String(wallData?.height    ?? 3));
  const [thickness, setThickness] = useState(String(wallData?.thickness ?? 0.2));
  const currentMat  = wallData?.material ?? "brick_01";
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
          <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>HEIGHT</div>
          <input type="number" value={height} step={0.5} min={0.5} style={NUM_INPUT}
            onChange={e => { setHeight(e.target.value); scheduleCommit("height", e.target.value); }}
            onBlur={e => flushCommit("height", e.target.value)}
          />
        </div>
        <div>
          <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>THICKNESS</div>
          <input type="number" value={thickness} step={0.1} min={0.1} style={NUM_INPUT}
            onChange={e => { setThickness(e.target.value); scheduleCommit("thickness", e.target.value); }}
            onBlur={e => flushCommit("thickness", e.target.value)}
          />
        </div>
        <div>
          <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>MATERIAL</div>
          <MaterialPicker
            materialList={materialList}
            current={currentMat}
            onSelect={id => onObjectUpdate({ material: id } as unknown as Partial<WorldObject>)}
            onAddMaterial={onAddMaterial}
          />
        </div>
      </div>
    </>
  );
}

function MaterialPicker({ materialList, current, onSelect, onAddMaterial }: {
  materialList: MaterialDef[];
  current:      string;
  onSelect:     (id: string) => void;
  onAddMaterial: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <button
        onClick={onAddMaterial}
        style={{
          padding: "6px 10px", borderRadius: 4, cursor: "pointer",
          background: "rgba(20,30,45,0.6)",
          border: "1px dashed rgba(80,120,180,0.3)",
          color: "#4a6a8a", fontSize: 10, fontFamily: "monospace",
          textAlign: "left", marginBottom: 2,
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(80,140,255,0.5)"; e.currentTarget.style.color = "#80aaff"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(80,120,180,0.3)"; e.currentTarget.style.color = "#4a6a8a"; }}
      >
        + add ambientcg material
      </button>

      {materialList.map(mat => {
        const active = mat.id === current;
        return (
          <div
            key={mat.id}
            onClick={() => onSelect(mat.id)}
            style={{
              padding: "6px 10px",
              background: active ? "rgba(80,140,255,0.15)" : "rgba(20,30,45,0.8)",
              border: `1px solid ${active ? "rgba(80,140,255,0.4)" : "rgba(80,120,180,0.12)"}`,
              borderRadius: 4,
              color: active ? "#80aaff" : "#5a7a9a",
              fontSize: 11, fontFamily: "monospace", cursor: "pointer",
            }}
          >
            {mat.label}
          </div>
        );
      })}
    </div>
  );
}

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
        <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>ASSETS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {PLACEHOLDER_ASSETS.map(name => (
            <div
              key={name}
              style={{
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
