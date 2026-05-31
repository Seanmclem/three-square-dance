import { useEffect, useRef, useState } from "react";
import type {
  ToolId, SelectedObjectPayload, WorldObject, Vec3,
  FloorDef, WallDef, Opening, MaterialDef, MaterialOverrides, QualityScale,
  PlatformDef, StairDef, StairCutterDef,
} from "@/types";
import { MaterialImporterModal } from "@/ui/MaterialImporterModal";

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
  activeTool:          ToolId;
  selected:            SelectedObjectPayload | null;
  materialList:        MaterialDef[];
  quality:             QualityScale;
  onObjectUpdate:      (changes: Partial<WorldObject>) => void;
  onSegmentUpdate:     (wallId: string, changes: Partial<WallDef>) => void;
  onMaterialsReload:   () => void;
  onQualityChange:     (q: QualityScale) => void;
  onCopyRunToFloor?:   (targetLevel: number) => void;
  onFillRunWithFloor?: () => void;
  onDelete?:           () => void;
}

export function PropertiesPanel({
  activeTool, selected, materialList, quality, onObjectUpdate, onSegmentUpdate, onMaterialsReload, onQualityChange,
  onCopyRunToFloor, onFillRunWithFloor, onDelete,
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
        {selected && selected.type === "opening"
          ? <OpeningView selected={selected} onObjectUpdate={onObjectUpdate} />
          : selected && selected.type === "floor"
            ? <FloorView
                selected={selected} materialList={materialList} onObjectUpdate={onObjectUpdate}
                onAddMaterial={openImporter}
              />
            : selected && selected.type === "wall"
              ? <WallView
                  selected={selected} materialList={materialList} onObjectUpdate={onObjectUpdate}
                  onAddMaterial={openImporter}
                  runWalls={selected.runWalls}
                  onSegmentUpdate={onSegmentUpdate}
                  onCopyRunToFloor={onCopyRunToFloor}
                  onFillRunWithFloor={onFillRunWithFloor}
                />
              : selected && selected.type === "platform"
                ? <PlatformView
                    selected={selected} materialList={materialList} onObjectUpdate={onObjectUpdate}
                    onAddMaterial={openImporter}
                  />
                : selected && selected.type === "stair"
                  ? <StairView
                      selected={selected} materialList={materialList}
                      onObjectUpdate={onObjectUpdate} onAddMaterial={openImporter}
                    />
                  : selected && draft
                    ? <TransformView selected={selected} draft={draft} commit={commit} />
                    : <ToolView activeTool={activeTool} />}
      </div>

      {onDelete && (
        <div style={{ padding: "10px 16px", borderTop: "1px solid rgba(180,60,60,0.15)" }}>
          <button
            onClick={onDelete}
            style={{
              width: "100%", padding: "6px 0", borderRadius: 4, cursor: "pointer",
              fontFamily: "monospace", fontSize: 11, border: "1px solid rgba(220,80,80,0.35)",
              background: "rgba(200,60,60,0.1)", color: "#e88",
            }}
          >Delete</button>
        </div>
      )}

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
  const [elevStr, setElevStr] = useState(String(floorData?.elevation ?? 0));

  useEffect(() => {
    setElevStr(String(floorData?.elevation ?? 0));
  }, [selected.id, floorData?.elevation]);

  const commitElev = (raw: string) => {
    const n = parseFloat(raw);
    if (Number.isFinite(n)) onObjectUpdate({ elevation: n } as unknown as Partial<WorldObject>);
  };

  return (
    <>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(80,120,180,0.1)" }}>
        <div style={{ color: "#6a90b8", fontSize: 12, fontFamily: "monospace" }}>{selected.id}</div>
        <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>
          {floorData?.floorMesh.shape ?? "rect"} floor · level {floorData?.level ?? 0}
        </div>
      </div>

      <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(80,120,180,0.08)" }}>
        <div style={LABEL}>ELEVATION</div>
        <input
          type="text" inputMode="decimal"
          value={elevStr}
          onChange={e => setElevStr(e.target.value)}
          onBlur={e => commitElev(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") commitElev((e.target as HTMLInputElement).value); }}
          style={{ ...NUM_INPUT, width: 80 }}
        />
        <div style={{ color: "#2a4a6a", fontSize: 9, marginTop: 4 }}>
          Adjust to layer overlapping floors (+0.001 per step)
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

function WallView({ selected, materialList, onObjectUpdate, onAddMaterial, runWalls, onSegmentUpdate, onCopyRunToFloor, onFillRunWithFloor }: {
  selected:            SelectedObjectPayload;
  materialList:        MaterialDef[];
  onObjectUpdate:      (changes: Partial<WorldObject>) => void;
  onAddMaterial:       () => void;
  runWalls?:           WallDef[];
  onSegmentUpdate:     (wallId: string, changes: Partial<WallDef>) => void;
  onCopyRunToFloor?:   (targetLevel: number) => void;
  onFillRunWithFloor?: () => void;
}) {
  const wallData   = selected.data as WallDef | null;
  const [height,    setHeight]    = useState(String(wallData?.height    ?? 3));
  const [thickness, setThickness] = useState(String(wallData?.thickness ?? 0.2));
  const debounceRef = useRef<number | null>(null);

  // Aggregate openings from every wall in the run so dragged openings don't vanish.
  const allWalls = runWalls ?? (wallData ? [wallData] : []);
  const allOpenings: Array<{ wallId: string; opening: Opening }> = allWalls.flatMap(w =>
    (w.openings ?? []).map(op => ({ wallId: w.id, opening: op })),
  );

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

  const addOpening = () => {
    if (!wallData) return;
    const primaryOpenings = wallData.openings ?? [];
    const rightmost = primaryOpenings.reduce(
      (max, o) => Math.max(max, o.offsetAlongWall + o.width),
      0,
    );
    const smartOffset = primaryOpenings.length === 0 ? 0.5 : rightmost + 0.5;
    const newOpening: Opening = {
      id:                 crypto.randomUUID(),
      type:               "door",
      offsetAlongWall:    smartOffset,
      width:              1.0,
      height:             2.1,
      elevation:          0,
      linkedZoneId:       null,
      linkedTransitionId: null,
    };
    onSegmentUpdate(wallData.id, { openings: [...primaryOpenings, newOpening] });
  };

  const updateOpening = (wallId: string, openingId: string, changes: Partial<Opening>) => {
    const targetWall = allWalls.find(w => w.id === wallId);
    if (!targetWall) return;
    let extra: Partial<Opening> = {};
    if (changes.type && changes.type !== targetWall.openings.find(o => o.id === openingId)?.type) {
      if (changes.type === "window" || changes.type === "passage") {
        extra = { height: 1.0, elevation: 1.0 };
      } else {
        extra = { height: 2.1, elevation: 0 };
      }
    }
    const updatedOpenings = targetWall.openings.map(o =>
      o.id === openingId ? { ...o, ...changes, ...extra } : o,
    );
    onSegmentUpdate(wallId, { openings: updatedOpenings });
  };

  const deleteOpening = (wallId: string, openingId: string) => {
    const targetWall = allWalls.find(w => w.id === wallId);
    if (!targetWall) return;
    onSegmentUpdate(wallId, { openings: targetWall.openings.filter(o => o.id !== openingId) });
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

        {/* Openings */}
        <div style={{ borderTop: "1px solid rgba(80,120,180,0.1)", paddingTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={LABEL}>OPENINGS</div>
            <button
              onClick={addOpening}
              style={{
                background: "rgba(80,140,255,0.1)", border: "1px solid rgba(80,140,255,0.3)",
                borderRadius: 4, color: "#80aaff", fontSize: 9, cursor: "pointer",
                padding: "2px 8px", fontFamily: "monospace",
              }}
            >+ ADD</button>
          </div>

          {allOpenings.length === 0 && (
            <div style={{ color: "#2a4a6a", fontSize: 10, fontStyle: "italic" }}>No openings</div>
          )}

          {allOpenings.map(({ wallId, opening: op }) => (
            <OpeningRow
              key={op.id}
              opening={op}
              onUpdate={changes => updateOpening(wallId, op.id, changes)}
              onDelete={() => deleteOpening(wallId, op.id)}
            />
          ))}
        </div>

        {/* Fill closed loop with floor */}
        {onFillRunWithFloor && (
          <div style={{ borderTop: "1px solid rgba(80,120,180,0.1)", paddingTop: 10 }}>
            <button
              onClick={onFillRunWithFloor}
              style={{
                width: "100%", padding: "6px 10px", borderRadius: 4, cursor: "pointer",
                background: "rgba(80,180,120,0.1)", border: "1px solid rgba(80,180,120,0.3)",
                color: "#7acca0", fontSize: 10, fontFamily: "monospace",
              }}
            >Fill closed loop with floor</button>
          </div>
        )}

        {/* Copy run to another floor */}
        {onCopyRunToFloor && (
          <div style={{ borderTop: "1px solid rgba(80,120,180,0.1)", paddingTop: 10 }}>
            <div style={LABEL}>COPY TO FLOOR</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[0, 1, 2, 3].map(level => {
                const isCurrent = level === (wallData?.floor ?? 0);
                return (
                  <button
                    key={level}
                    disabled={isCurrent}
                    onClick={() => onCopyRunToFloor(level)}
                    style={{
                      flex: 1, padding: "4px 0", borderRadius: 4,
                      cursor: isCurrent ? "default" : "pointer",
                      fontFamily: "monospace", fontSize: 10, border: "none",
                      background: isCurrent ? "rgba(20,30,45,0.4)" : "rgba(80,140,255,0.1)",
                      color: isCurrent ? "#2a4a6a" : "#80aaff",
                      outline: isCurrent
                        ? "1px solid rgba(80,120,180,0.1)"
                        : "1px solid rgba(80,140,255,0.3)",
                    }}
                  >{level}</button>
                );
              })}
            </div>
          </div>
        )}

        {runWalls && runWalls.length > 1 && (
          <SegmentsSection
            runWalls={runWalls}
            materialList={materialList}
            onAddMaterial={onAddMaterial}
            onSegmentUpdate={onSegmentUpdate}
          />
        )}
      </div>
    </>
  );
}

// ─── Wall segments section ────────────────────────────────────────────────────

function SegmentsSection({ runWalls, materialList, onAddMaterial, onSegmentUpdate }: {
  runWalls:        WallDef[];
  materialList:    MaterialDef[];
  onAddMaterial:   () => void;
  onSegmentUpdate: (wallId: string, changes: Partial<WallDef>) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ borderTop: "1px solid rgba(80,120,180,0.1)", paddingTop: 10 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          width: "100%", background: "none", border: "none", cursor: "pointer",
          padding: "0 0 4px",
        }}
      >
        <span style={{ ...LABEL, marginBottom: 0 }}>SEGMENTS ({runWalls.length})</span>
        <span style={{ color: "#4a6a8a", fontSize: 10 }}>{open ? "▴" : "▾"}</span>
      </button>

      {open && runWalls.map((wall, i) => (
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

function WallSegmentRow({ index, wall, materialList, onUpdate }: {
  index:        number;
  wall:         WallDef;
  materialList: MaterialDef[];
  onAddMaterial:() => void;
  onUpdate:     (changes: Partial<WallDef>) => void;
}) {
  const [tileStr, setTileStr] = useState(String(wall.materialOverrides?.tileScale ?? ""));

  useEffect(() => {
    setTileStr(String(wall.materialOverrides?.tileScale ?? ""));
  }, [wall.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitTile = (val: string) => {
    const trimmed = val.trim();
    if (trimmed === "") { onUpdate({ materialOverrides: undefined }); return; }
    const n = parseFloat(trimmed);
    if (Number.isFinite(n) && n > 0)
      onUpdate({ materialOverrides: { ...(wall.materialOverrides ?? {}), tileScale: n } });
  };

  const STOP = (e: React.KeyboardEvent) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key))
      e.nativeEvent.stopPropagation();
  };

  return (
    <div style={{
      background: "rgba(20,30,45,0.6)", border: "1px solid rgba(80,120,180,0.1)",
      borderRadius: 4, padding: "6px 8px", marginBottom: 4,
    }}>
      <div style={{ color: "#4a6a8a", fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>
        SEG {index}
      </div>

      <div style={{ marginBottom: 4 }}>
        <div style={{ color: "#3a5a7a", fontSize: 9, marginBottom: 2 }}>MATERIAL</div>
        <select
          value={wall.material}
          onChange={e => onUpdate({ material: e.target.value, materialOverrides: undefined })}
          style={{ ...NUM_INPUT, padding: "2px 4px", cursor: "pointer" }}
        >
          {materialList.length === 0 && (
            <option value={wall.material}>{wall.material}</option>
          )}
          {materialList.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <div style={{ color: "#3a5a7a", fontSize: 9, flexShrink: 0 }}>TILE</div>
        <input
          type="number" step={0.1} min={0.1} placeholder="default"
          value={tileStr}
          style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
          onChange={e => setTileStr(e.target.value)}
          onBlur={e => commitTile(e.target.value)}
          onKeyDown={STOP}
        />
      </div>
    </div>
  );
}

// ─── Opening view (when an individual opening is selected) ───────────────────

function OpeningView({ selected, onObjectUpdate }: {
  selected:       SelectedObjectPayload;
  onObjectUpdate: (changes: Partial<WorldObject>) => void;
}) {
  const opening = selected.data as Opening | null;
  if (!opening) return null;

  return (
    <>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(80,120,180,0.1)" }}>
        <div style={{ color: "#6a90b8", fontSize: 12, fontFamily: "monospace", textTransform: "capitalize" }}>
          {opening.type} Opening
        </div>
        <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 1, marginTop: 2 }}>
          {selected.id.slice(0, 20)}
        </div>
      </div>
      <div style={{ padding: "10px 16px" }}>
        <OpeningRow
          opening={opening}
          onUpdate={changes => onObjectUpdate(changes as unknown as Partial<WorldObject>)}
          onDelete={() => {/* deletion handled from the wall's openings list */}}
          hideDelete
        />
      </div>
    </>
  );
}

// ─── Opening row ──────────────────────────────────────────────────────────────

function OpeningRow({ opening, onUpdate, onDelete, hideDelete }: {
  opening:     Opening;
  onUpdate:    (changes: Partial<Opening>) => void;
  onDelete:    () => void;
  hideDelete?: boolean;
}) {
  const [offsetStr,  setOffsetStr]  = useState(String(opening.offsetAlongWall));
  const [widthStr,   setWidthStr]   = useState(String(opening.width));
  const [heightStr,  setHeightStr]  = useState(String(opening.height));
  const [elevStr,    setElevStr]    = useState(String(opening.elevation));
  const [innerHStr,  setInnerHStr]  = useState(String(opening.innerTileH ?? ""));
  const [innerVStr,  setInnerVStr]  = useState(String(opening.innerTileV ?? ""));

  useEffect(() => {
    setOffsetStr(String(opening.offsetAlongWall));
    setWidthStr(String(opening.width));
    setHeightStr(String(opening.height));
    setElevStr(String(opening.elevation));
    setInnerHStr(String(opening.innerTileH ?? ""));
    setInnerVStr(String(opening.innerTileV ?? ""));
  }, [opening.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep height/elevation strings in sync when type change applies new defaults
  useEffect(() => {
    setHeightStr(String(opening.height));
    setElevStr(String(opening.elevation));
  }, [opening.type]); // eslint-disable-line react-hooks/exhaustive-deps

  const blurNum = (val: string, min: number, field: keyof Opening) => {
    const n = parseFloat(val);
    if (Number.isFinite(n) && n >= min) onUpdate({ [field]: n } as Partial<Opening>);
  };

  const blurInnerTile = (val: string, field: "innerTileH" | "innerTileV") => {
    if (val === "" || val === undefined) { onUpdate({ [field]: undefined }); return; }
    const n = parseFloat(val);
    if (Number.isFinite(n) && n > 0) onUpdate({ [field]: n });
  };

  return (
    <div style={{
      background: "rgba(20,30,45,0.8)", border: "1px solid rgba(80,120,180,0.15)",
      borderRadius: 4, padding: "6px 8px", marginBottom: 6,
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <select
          value={opening.type}
          onChange={e => onUpdate({ type: e.target.value as Opening["type"] })}
          style={{
            ...NUM_INPUT, width: "auto", padding: "2px 4px", cursor: "pointer",
          }}
        >
          <option value="door">Door</option>
          <option value="window">Window</option>
          <option value="arch">Arch</option>
          <option value="passage">Passage</option>
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {opening.type !== "passage" && (
            <label style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={opening.trim !== false}
                onChange={e => onUpdate({ trim: e.target.checked })}
                style={{ cursor: "pointer", accentColor: "#4d8cff" }}
              />
              <span style={{ color: "#3a5a7a", fontSize: 9, userSelect: "none" }}>TRIM</span>
            </label>
          )}
          {!hideDelete && (
            <button
              onClick={onDelete}
              style={{
                background: "transparent", border: "none", color: "#ff6b6b",
                cursor: "pointer", fontSize: 14, padding: "0 2px", lineHeight: 1,
              }}
            >×</button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        {([
          ["OFFSET", offsetStr, setOffsetStr, 0,   "offsetAlongWall"] ,
          ["WIDTH",  widthStr,  setWidthStr,  0.1, "width"]           ,
          ["HEIGHT", heightStr, setHeightStr, 0.1, "height"]          ,
          ["ELEV",   elevStr,   setElevStr,   0,   "elevation"]       ,
        ] as const).map(([label, val, setter, min, field]) => (
          <div key={field}>
            <div style={{ color: "#3a5a7a", fontSize: 9, marginBottom: 2 }}>{label}</div>
            <input
              type="number" step={0.1} min={min} value={val}
              style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
              onChange={e => setter(e.target.value)}
              onBlur={e => blurNum(e.target.value, min, field)}
            />
          </div>
        ))}

        {/* Inner passage tiling: top+bottom (H) and left+right (V) */}
        <div>
          <div style={{ color: "#3a5a7a", fontSize: 9, marginBottom: 2 }}>INNER T+B</div>
          <input
            type="number" step={0.1} min={0.01} placeholder="auto"
            value={innerHStr}
            style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
            onChange={e => setInnerHStr(e.target.value)}
            onBlur={e => blurInnerTile(e.target.value, "innerTileH")}
          />
        </div>
        <div>
          <div style={{ color: "#3a5a7a", fontSize: 9, marginBottom: 2 }}>INNER L+R</div>
          <input
            type="number" step={0.1} min={0.01} placeholder="auto"
            value={innerVStr}
            style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
            onChange={e => setInnerVStr(e.target.value)}
            onBlur={e => blurInnerTile(e.target.value, "innerTileV")}
          />
        </div>
      </div>
    </div>
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
  label = "MATERIAL",
  materialList, currentMaterialId, overrides, onMaterialChange, onOverridesChange, onAddMaterial,
}: {
  label?:            string;
  materialList:      MaterialDef[];
  currentMaterialId: string;
  overrides:         MaterialOverrides | undefined;
  onMaterialChange:  (id: string) => void;
  onOverridesChange: (ov: MaterialOverrides) => void;
  onAddMaterial:     () => void;
}) {
  const baseDef = materialList.find(m => m.id === currentMaterialId);

  const hasSplitInit = !!(overrides?.tileScaleX !== undefined || overrides?.tileScaleY !== undefined);
  const [tileStr,   setTileStr]   = useState(String(overrides?.tileScale         ?? baseDef?.tileScale         ?? 1.0));
  const [tileXStr,  setTileXStr]  = useState(String(overrides?.tileScaleX        ?? overrides?.tileScale        ?? baseDef?.tileScale ?? 1.0));
  const [tileYStr,  setTileYStr]  = useState(String(overrides?.tileScaleY        ?? overrides?.tileScale        ?? baseDef?.tileScale ?? 1.0));
  const [splitTile, setSplitTile] = useState(hasSplitInit);
  const [roughStr,  setRoughStr]  = useState(String(overrides?.roughnessVal      ?? baseDef?.roughnessVal      ?? 0.85));
  const [dispStr,   setDispStr]   = useState(String(overrides?.displacementScale ?? baseDef?.displacementScale ?? 0.03));

  // Reset local string state when the selected material changes
  useEffect(() => {
    const base = overrides?.tileScale ?? baseDef?.tileScale ?? 1.0;
    setTileStr(String(base));
    setTileXStr(String(overrides?.tileScaleX ?? base));
    setTileYStr(String(overrides?.tileScaleY ?? base));
    setSplitTile(!!(overrides?.tileScaleX !== undefined || overrides?.tileScaleY !== undefined));
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
    onOverridesChange({ ...overrides, tileScale: n, tileScaleX: undefined, tileScaleY: undefined });
  };

  const commitTileX = (val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n <= 0) return;
    onOverridesChange({ ...overrides, tileScaleX: n });
  };

  const commitTileY = (val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n <= 0) return;
    onOverridesChange({ ...overrides, tileScaleY: n });
  };

  const toggleSplitTile = () => {
    const next = !splitTile;
    setSplitTile(next);
    if (next) {
      // Seed X/Y from the current unified value
      const base = parseFloat(tileStr);
      const seed = Number.isFinite(base) && base > 0 ? base : 1.0;
      setTileXStr(String(seed));
      setTileYStr(String(seed));
      onOverridesChange({ ...overrides, tileScaleX: seed, tileScaleY: seed });
    } else {
      // Collapse back: keep tileScale, drop X/Y
      setTileStr(tileXStr);
      onOverridesChange({ ...overrides, tileScale: parseFloat(tileXStr) || 1.0, tileScaleX: undefined, tileScaleY: undefined });
    }
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
      <div style={LABEL}>{label}</div>

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
      {splitTile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ ...LABEL, marginBottom: 0, width: 60, flexShrink: 0 }}>TILE X</div>
            <input
              type="number" step={0.1} min={0.1}
              value={tileXStr}
              onChange={e => setTileXStr(e.target.value)}
              onBlur={e => commitTileX(e.target.value)}
              style={{ ...NUM_INPUT, padding: "3px 6px", fontSize: 10 }}
            />
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ ...LABEL, marginBottom: 0, width: 60, flexShrink: 0 }}>TILE Y</div>
            <input
              type="number" step={0.1} min={0.1}
              value={tileYStr}
              onChange={e => setTileYStr(e.target.value)}
              onBlur={e => commitTileY(e.target.value)}
              style={{ ...NUM_INPUT, padding: "3px 6px", fontSize: 10 }}
            />
          </div>
        </div>
      ) : (
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
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="checkbox"
          id="split-tile"
          checked={splitTile}
          onChange={toggleSplitTile}
          style={{ cursor: "pointer", accentColor: "#4d8cff", margin: 0 }}
        />
        <label
          htmlFor="split-tile"
          style={{ color: "#4a6a8a", fontSize: 10, cursor: "pointer", userSelect: "none" }}
        >
          split X / Y
        </label>
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

// ─── Platform view ────────────────────────────────────────────────────────────

function PlatformView({ selected, materialList, onObjectUpdate, onAddMaterial }: {
  selected:       SelectedObjectPayload;
  materialList:   MaterialDef[];
  onObjectUpdate: (changes: Partial<WorldObject>) => void;
  onAddMaterial:  () => void;
}) {
  const plat = selected.data as PlatformDef | null;
  const [posStr,   setPosStr]   = useState({ x: String(plat?.position.x ?? 0), y: String(plat?.position.y ?? 0), z: String(plat?.position.z ?? 0) });
  const [rotYStr,  setRotYStr]  = useState(String(plat?.rotation?.y ?? 0));
  const [sizeStr,  setSizeStr]  = useState({ w: String(plat?.size.width ?? 2), d: String(plat?.size.depth ?? 2) });
  const [thickStr, setThickStr] = useState(String(plat?.thickness ?? 0.3));
  const [railH,    setRailH]    = useState(String(plat?.railingHeight ?? 1.0));
  const [hasRail,  setHasRail]  = useState(plat?.hasRailing ?? false);
  const posDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    setPosStr({ x: String(plat?.position.x ?? 0), y: String(plat?.position.y ?? 0), z: String(plat?.position.z ?? 0) });
    setRotYStr(String(plat?.rotation?.y ?? 0));
    setSizeStr({ w: String(plat?.size.width ?? 2), d: String(plat?.size.depth ?? 2) });
    setThickStr(String(plat?.thickness ?? 0.3));
    setRailH(String(plat?.railingHeight ?? 1.0));
    setHasRail(plat?.hasRailing ?? false);
  }, [selected.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (posDebounceRef.current !== null) clearTimeout(posDebounceRef.current); }, []);

  // Keep rotY in sync when gizmo commits a rotation rebuild
  useEffect(() => {
    setRotYStr(String(plat?.rotation?.y ?? 0));
  }, [plat?.rotation?.y]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitRotY = (val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n)) return;
    onObjectUpdate({ rotation: { x: 0, y: n, z: 0 } } as unknown as Partial<WorldObject>);
  };

  const commitPos = (axis: "x" | "y" | "z", val: string) => {
    if (posDebounceRef.current !== null) { clearTimeout(posDebounceRef.current); posDebounceRef.current = null; }
    const n = parseFloat(val);
    if (!Number.isFinite(n)) return;
    onObjectUpdate({ position: { ...(plat?.position ?? { x: 0, y: 0, z: 0 }), [axis]: n } } as unknown as Partial<WorldObject>);
  };

  const schedulePos = (axis: "x" | "y" | "z", val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n)) return;
    if (posDebounceRef.current !== null) clearTimeout(posDebounceRef.current);
    posDebounceRef.current = window.setTimeout(() => {
      onObjectUpdate({ position: { ...(plat?.position ?? { x: 0, y: 0, z: 0 }), [axis]: n } } as unknown as Partial<WorldObject>);
      posDebounceRef.current = null;
    }, 100);
  };

  const commitSize = (dim: "width" | "depth", val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n <= 0) return;
    onObjectUpdate({ size: { ...(plat?.size ?? { width: 2, depth: 2 }), [dim]: n } } as unknown as Partial<WorldObject>);
  };

  const commitThick = (val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n <= 0) return;
    onObjectUpdate({ thickness: n } as unknown as Partial<WorldObject>);
  };

  const toggleRail = (checked: boolean) => {
    setHasRail(checked);
    onObjectUpdate({ hasRailing: checked } as unknown as Partial<WorldObject>);
  };

  const commitRailH = (val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n <= 0) return;
    onObjectUpdate({ railingHeight: n } as unknown as Partial<WorldObject>);
  };

  return (
    <>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(80,120,180,0.1)" }}>
        <div style={{ color: "#6a90b8", fontSize: 12, fontFamily: "monospace" }}>{selected.id}</div>
        <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>
          platform · level {plat?.floorLevel ?? 0}
        </div>
      </div>

      <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Position */}
        <div>
          <div style={LABEL}>POSITION</div>
          <div style={{ display: "flex", gap: 4 }}>
            {([["x", "#ff6b6b"], ["y", "#6bff8a"], ["z", "#6b8aff"]] as const).map(([axis, color]) => (
              <div key={axis} style={{
                flex: 1, display: "flex", gap: 4, alignItems: "center",
                background: "rgba(20,30,45,0.8)", border: "1px solid rgba(80,120,180,0.15)",
                borderRadius: 4, padding: "2px 6px",
              }}>
                <span style={{ color, fontSize: 9 }}>{axis.toUpperCase()}</span>
                <input
                  type="number"
                  step={0.5}
                  value={posStr[axis]}
                  onChange={e => { setPosStr(p => ({ ...p, [axis]: e.target.value })); schedulePos(axis, e.target.value); }}
                  onBlur={e => commitPos(axis, e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight")
                      e.nativeEvent.stopPropagation();
                    if (e.key === "Enter") commitPos(axis, (e.target as HTMLInputElement).value);
                  }}
                  style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#9ab8d4", fontSize: 10, fontFamily: "monospace" }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Rotation Y */}
        <div>
          <div style={LABEL}>ROTATION Y (deg)</div>
          <div style={{
            display: "flex", gap: 4, alignItems: "center",
            background: "rgba(20,30,45,0.8)", border: "1px solid rgba(80,120,180,0.15)",
            borderRadius: 4, padding: "2px 6px", width: "fit-content",
          }}>
            <span style={{ color: "#6bff8a", fontSize: 9 }}>Y</span>
            <input
              type="number" step={15}
              value={rotYStr}
              onChange={e => setRotYStr(e.target.value)}
              onBlur={e => commitRotY(e.target.value)}
              onKeyDown={e => {
                if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key))
                  e.nativeEvent.stopPropagation();
                if (e.key === "Enter") commitRotY((e.target as HTMLInputElement).value);
              }}
              style={{ width: 70, minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#9ab8d4", fontSize: 10, fontFamily: "monospace" }}
            />
          </div>
        </div>

        {/* Size */}
        <div>
          <div style={LABEL}>SIZE</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            {([["W", "width", sizeStr.w, (v: string) => setSizeStr(p => ({ ...p, w: v })), "width"],
               ["D", "depth",  sizeStr.d, (v: string) => setSizeStr(p => ({ ...p, d: v })), "depth"]] as const).map(
              ([label, , val, setter, dim]) => (
                <div key={dim}>
                  <div style={{ color: "#3a5a7a", fontSize: 9, marginBottom: 2 }}>{label}</div>
                  <input
                    type="number" step={0.5} min={0.5} value={val}
                    style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                    onChange={e => setter(e.target.value)}
                    onBlur={e => commitSize(dim as "width" | "depth", e.target.value)}
                  />
                </div>
              )
            )}
          </div>
        </div>

        {/* Thickness */}
        <div>
          <div style={LABEL}>THICKNESS</div>
          <input
            type="number" step={0.05} min={0.05} value={thickStr}
            style={{ ...NUM_INPUT, width: 90 }}
            onChange={e => setThickStr(e.target.value)}
            onBlur={e => commitThick(e.target.value)}
          />
        </div>

        {/* Railing */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={hasRail}
              onChange={e => toggleRail(e.target.checked)}
              style={{ accentColor: "#4d8cff", cursor: "pointer" }}
            />
            <span style={{ color: "#5a7a9a", fontSize: 10, letterSpacing: 1 }}>RAILING</span>
          </label>
          {hasRail && (
            <div>
              <div style={{ color: "#3a5a7a", fontSize: 9, marginBottom: 2 }}>RAILING HEIGHT</div>
              <input
                type="number" step={0.1} min={0.3} value={railH}
                style={{ ...NUM_INPUT, width: 90 }}
                onChange={e => setRailH(e.target.value)}
                onBlur={e => commitRailH(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Material — top/bottom */}
        <MaterialSection
          label="TOP / BOTTOM"
          materialList={materialList}
          currentMaterialId={plat?.material ?? "concrete_01"}
          overrides={plat?.materialOverrides}
          onMaterialChange={id => onObjectUpdate({ material: id, materialOverrides: undefined } as unknown as Partial<WorldObject>)}
          onOverridesChange={ov => onObjectUpdate({ materialOverrides: ov } as unknown as Partial<WorldObject>)}
          onAddMaterial={onAddMaterial}
        />

        {/* Material — sides */}
        <MaterialSection
          label="SIDES"
          materialList={materialList}
          currentMaterialId={plat?.sideMaterial ?? plat?.material ?? "concrete_01"}
          overrides={plat?.sideMaterialOverrides}
          onMaterialChange={id => onObjectUpdate({ sideMaterial: id, sideMaterialOverrides: undefined } as unknown as Partial<WorldObject>)}
          onOverridesChange={ov => onObjectUpdate({ sideMaterialOverrides: ov } as unknown as Partial<WorldObject>)}
          onAddMaterial={onAddMaterial}
        />
      </div>
    </>
  );
}

// ─── Stair view ───────────────────────────────────────────────────────────────

const STAIR_STEP_H = 0.2; // default riser height matching StairBuilder

const STAIR_ARROW_STOP = (e: React.KeyboardEvent) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key))
    e.nativeEvent.stopPropagation();
};

function effectiveSteps(stair: StairDef): number {
  return stair.numSteps ?? Math.max(1, Math.round((stair.end.y - stair.start.y) / STAIR_STEP_H));
}

function StairView({ selected, materialList, onObjectUpdate, onAddMaterial }: {
  selected:       SelectedObjectPayload;
  materialList:   MaterialDef[];
  onObjectUpdate: (changes: Partial<WorldObject>) => void;
  onAddMaterial:  () => void;
}) {
  const stair = selected.data as StairDef | null;

  const [startStr, setStartStr] = useState({
    x: String(stair?.start.x ?? 0), y: String(stair?.start.y ?? 0), z: String(stair?.start.z ?? 0),
  });
  const [endStr, setEndStr] = useState({
    x: String(stair?.end.x ?? 0), y: String(stair?.end.y ?? 0), z: String(stair?.end.z ?? 0),
  });
  const [widthStr,   setWidthStr]   = useState(String(stair?.width ?? 2.5));
  const [stepsStr,   setStepsStr]   = useState(String(stair ? effectiveSteps(stair) : 1));
  const [hasRailing, setHasRailing] = useState(stair?.hasRailing ?? false);
  const [linked,     setLinked]     = useState(false);

  const [hasCutter,  setHasCutter]  = useState(!!(stair?.csgCutter));
  const [cutW,       setCutW]       = useState(String(stair?.csgCutter?.width  ?? stair?.width ?? 2.5));
  const [cutD,       setCutD]       = useState(String(stair?.csgCutter?.depth  ?? 1.0));
  const [cutH,       setCutH]       = useState(String(stair?.csgCutter?.height ?? 2.2));
  const [cutOff,     setCutOff]     = useState({
    x: String(stair?.csgCutter?.offset.x ?? 0),
    y: String(stair?.csgCutter?.offset.y ?? 1.1),
    z: String(stair?.csgCutter?.offset.z ?? 0),
  });
  const [cutRot,     setCutRot]     = useState({
    x: String(stair?.csgCutter?.rotation?.x ?? 0),
    y: String(stair?.csgCutter?.rotation?.y ?? 0),
    z: String(stair?.csgCutter?.rotation?.z ?? 0),
  });
  const [cutInnerH,  setCutInnerH]  = useState(String(stair?.csgCutter?.innerTileH ?? 1));
  const [cutInnerV,  setCutInnerV]  = useState(String(stair?.csgCutter?.innerTileV ?? 1));

  // Full reset when a different stair is selected
  useEffect(() => {
    if (!stair) return;
    setStartStr({ x: String(stair.start.x), y: String(stair.start.y), z: String(stair.start.z) });
    setEndStr({ x: String(stair.end.x), y: String(stair.end.y), z: String(stair.end.z) });
    setWidthStr(String(stair.width));
    setStepsStr(String(effectiveSteps(stair)));
    setHasRailing(stair.hasRailing);
    setLinked(false);
    setHasCutter(!!(stair.csgCutter));
    setCutW(String(stair.csgCutter?.width  ?? stair.width));
    setCutD(String(stair.csgCutter?.depth  ?? 1.0));
    setCutH(String(stair.csgCutter?.height ?? 2.2));
    setCutOff({
      x: String(stair.csgCutter?.offset.x ?? 0),
      y: String(stair.csgCutter?.offset.y ?? 1.1),
      z: String(stair.csgCutter?.offset.z ?? 0),
    });
    setCutRot({
      x: String(stair.csgCutter?.rotation?.x ?? 0),
      y: String(stair.csgCutter?.rotation?.y ?? 0),
      z: String(stair.csgCutter?.rotation?.z ?? 0),
    });
    setCutInnerH(String(stair.csgCutter?.innerTileH ?? 1));
    setCutInnerV(String(stair.csgCutter?.innerTileV ?? 1));
  }, [selected.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync end/steps UI after a rebuild updates the data
  useEffect(() => {
    if (!stair) return;
    setEndStr({ x: String(stair.end.x), y: String(stair.end.y), z: String(stair.end.z) });
    setStepsStr(String(effectiveSteps(stair)));
  }, [stair?.end.x, stair?.end.y, stair?.end.z, stair?.numSteps]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!stair) return null;

  const rise = stair.end.y - stair.start.y;

  const commitEndY = (val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n)) return;
    const newEnd = { ...stair.end, y: n };
    if (linked) {
      // Linked: auto-recalculate steps from new height
      const newSteps = Math.max(1, Math.round((n - stair.start.y) / STAIR_STEP_H));
      setStepsStr(String(newSteps));
      onObjectUpdate({ end: newEnd, numSteps: newSteps } as unknown as Partial<WorldObject>);
    } else {
      // Unlinked: freeze current effective step count so height change doesn't shift it
      onObjectUpdate({ end: newEnd, numSteps: effectiveSteps(stair) } as unknown as Partial<WorldObject>);
    }
  };

  const commitVec = (field: "start" | "end", axis: "x" | "y" | "z", val: string) => {
    if (field === "end" && axis === "y") { commitEndY(val); return; }
    const n = parseFloat(val);
    if (!Number.isFinite(n)) return;
    onObjectUpdate({ [field]: { ...stair[field], [axis]: n } } as unknown as Partial<WorldObject>);
  };

  const commitSteps = (val: string) => {
    const n = Math.round(parseFloat(val));
    if (!Number.isFinite(n) || n < 1) return;
    if (linked) {
      // Linked: adjust end.y so total rise = n × default step height
      const newEndY = stair.start.y + n * STAIR_STEP_H;
      setEndStr(p => ({ ...p, y: String(newEndY) }));
      onObjectUpdate({ numSteps: n, end: { ...stair.end, y: newEndY } } as unknown as Partial<WorldObject>);
    } else {
      onObjectUpdate({ numSteps: n } as unknown as Partial<WorldObject>);
    }
  };

  const commitWidth = (val: string) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n <= 0) return;
    onObjectUpdate({ width: n } as unknown as Partial<WorldObject>);
  };

  const toggleRailing = (checked: boolean) => {
    setHasRailing(checked);
    onObjectUpdate({ hasRailing: checked } as unknown as Partial<WorldObject>);
  };

  const toggleCutter = (checked: boolean) => {
    setHasCutter(checked);
    if (checked) {
      const w  = parseFloat(cutW)  || stair.width;
      const d  = parseFloat(cutD)  || 1.0;
      const h  = parseFloat(cutH)  || 2.2;
      const ox = parseFloat(cutOff.x) || 0;
      const oy = parseFloat(cutOff.y) || h / 2;
      const oz = parseFloat(cutOff.z) || 0;
      // Default Y rotation aligns cut box width with stair width direction
      const angle = Math.atan2(stair.end.z - stair.start.z, stair.end.x - stair.start.x);
      const defRotY = -(90 + angle * (180 / Math.PI));
      const rx = parseFloat(cutRot.x) || 0;
      const ry = parseFloat(cutRot.y) || defRotY;
      const rz = parseFloat(cutRot.z) || 0;
      setCutRot({ x: String(rx), y: String(Number(defRotY.toFixed(2))), z: String(rz) });
      const ih = parseFloat(cutInnerH) || 1;
      const iv = parseFloat(cutInnerV) || 1;
      onObjectUpdate({ csgCutter: {
        offset: { x: ox, y: oy, z: oz }, width: w, depth: d, height: h,
        rotation: { x: rx, y: ry, z: rz },
        innerTileH: ih, innerTileV: iv,
      } } as unknown as Partial<WorldObject>);
    } else {
      onObjectUpdate({ csgCutter: undefined } as unknown as Partial<WorldObject>);
    }
  };

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

  const vecRow = (
    label: string,
    field: "start" | "end",
    vals: { x: string; y: string; z: string },
    setter: React.Dispatch<React.SetStateAction<{ x: string; y: string; z: string }>>,
  ) => (
    <div>
      <div style={LABEL}>{label}</div>
      <div style={{ display: "flex", gap: 4 }}>
        {(["x", "y", "z"] as const).map((axis, i) => (
          <div key={axis} style={{
            flex: 1, display: "flex", gap: 4, alignItems: "center",
            background: "rgba(20,30,45,0.8)", border: "1px solid rgba(80,120,180,0.15)",
            borderRadius: 4, padding: "2px 6px",
          }}>
            <span style={{ color: ["#ff6b6b","#6bff8a","#6b8aff"][i], fontSize: 9 }}>{axis.toUpperCase()}</span>
            <input
              type="number" step={0.5}
              value={vals[axis]}
              onChange={e => setter(p => ({ ...p, [axis]: e.target.value }))}
              onBlur={e => commitVec(field, axis, e.target.value)}
              onKeyDown={e => { STAIR_ARROW_STOP(e); if (e.key === "Enter") commitVec(field, axis, (e.target as HTMLInputElement).value); }}
              style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#9ab8d4", fontSize: 10, fontFamily: "monospace" }}
            />
          </div>
        ))}
      </div>
    </div>
  );

  const curSteps = effectiveSteps(stair);
  const stepH    = rise > 0 ? rise / curSteps : STAIR_STEP_H;

  return (
    <>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(80,120,180,0.1)" }}>
        <div style={{ color: "#6a90b8", fontSize: 12, fontFamily: "monospace" }}>{selected.id}</div>
        <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>
          stair · {stair.style}
        </div>
      </div>

      <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {vecRow("START", "start", startStr, setStartStr)}
        {vecRow("END",   "end",   endStr,   setEndStr)}

        {/* Steps / Width */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <div style={LABEL}>STEPS</div>
            <input
              type="number" step={1} min={1}
              value={stepsStr}
              onChange={e => setStepsStr(e.target.value)}
              onBlur={e => commitSteps(e.target.value)}
              onKeyDown={e => { STAIR_ARROW_STOP(e); if (e.key === "Enter") commitSteps((e.target as HTMLInputElement).value); }}
              style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
            />
          </div>
          <div>
            <div style={LABEL}>WIDTH</div>
            <input
              type="number" step={0.5} min={0.5}
              value={widthStr}
              onChange={e => setWidthStr(e.target.value)}
              onBlur={e => commitWidth(e.target.value)}
              onKeyDown={e => { STAIR_ARROW_STOP(e); if (e.key === "Enter") commitWidth((e.target as HTMLInputElement).value); }}
              style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
            />
          </div>
        </div>

        {/* Link toggle */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox" checked={linked}
            onChange={e => setLinked(e.target.checked)}
            style={{ accentColor: "#4d8cff", cursor: "pointer", flexShrink: 0 }}
          />
          <span style={{ color: linked ? "#80aaff" : "#4a6a8a", fontSize: 10, userSelect: "none" }}>
            Link end-Y to step count
          </span>
        </label>

        <div style={{ color: "#2a4a6a", fontSize: 9 }}>
          Rise: {rise.toFixed(2)} m · Step H: {stepH.toFixed(3)} m
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox" checked={hasRailing}
            onChange={e => toggleRailing(e.target.checked)}
            style={{ accentColor: "#4d8cff", cursor: "pointer" }}
          />
          <span style={{ color: "#5a7a9a", fontSize: 10, letterSpacing: 1 }}>RAILING</span>
        </label>

        {/* Material — body (top, bottom, sides) */}
        <MaterialSection
          label="BODY"
          materialList={materialList}
          currentMaterialId={stair.material ?? "concrete_01"}
          overrides={stair.materialOverrides}
          onMaterialChange={id => onObjectUpdate({ material: id, materialOverrides: undefined } as unknown as Partial<WorldObject>)}
          onOverridesChange={ov => onObjectUpdate({ materialOverrides: ov } as unknown as Partial<WorldObject>)}
          onAddMaterial={onAddMaterial}
        />

        {/* Material — risers */}
        <MaterialSection
          label="RISERS"
          materialList={materialList}
          currentMaterialId={stair.riserMaterial ?? stair.material ?? "concrete_01"}
          overrides={stair.riserMaterialOverrides}
          onMaterialChange={id => onObjectUpdate({ riserMaterial: id, riserMaterialOverrides: undefined } as unknown as Partial<WorldObject>)}
          onOverridesChange={ov => onObjectUpdate({ riserMaterialOverrides: ov } as unknown as Partial<WorldObject>)}
          onAddMaterial={onAddMaterial}
        />

        {/* CUT BOX */}
        <div style={{ borderTop: "1px solid rgba(80,120,180,0.1)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox" checked={hasCutter}
              onChange={e => toggleCutter(e.target.checked)}
              style={{ accentColor: "#ffdd00", cursor: "pointer" }}
            />
            <span style={{ color: hasCutter ? "#ffdd77" : "#5a7a9a", fontSize: 10, letterSpacing: 1 }}>CUT BOX</span>
          </label>

          {hasCutter && (
            <>
              <div>
                <div style={LABEL}>SIZE (W / D / H)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                  {([["W", cutW, setCutW, "width"], ["D", cutD, setCutD, "depth"], ["H", cutH, setCutH, "height"]] as const).map(
                    ([lbl, val, setter, field]) => (
                      <div key={field}>
                        <div style={{ color: "#3a5a7a", fontSize: 9, marginBottom: 2 }}>{lbl}</div>
                        <input
                          type="number" step={0.1} min={0.1} value={val}
                          style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                          onChange={e => setter(e.target.value)}
                          onBlur={e => commitCutter(field, e.target.value)}
                          onKeyDown={e => { STAIR_ARROW_STOP(e); if (e.key === "Enter") commitCutter(field, (e.target as HTMLInputElement).value); }}
                        />
                      </div>
                    )
                  )}
                </div>
              </div>

              <div>
                <div style={LABEL}>OFFSET FROM END</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {(["x", "y", "z"] as const).map((axis, i) => (
                    <div key={axis} style={{
                      flex: 1, display: "flex", gap: 3, alignItems: "center",
                      background: "rgba(20,30,45,0.8)", border: "1px solid rgba(80,120,180,0.15)",
                      borderRadius: 4, padding: "2px 5px",
                    }}>
                      <span style={{ color: ["#ff6b6b","#6bff8a","#6b8aff"][i], fontSize: 9 }}>{axis.toUpperCase()}</span>
                      <input
                        type="number" step={0.1}
                        value={cutOff[axis]}
                        onChange={e => setCutOff(p => ({ ...p, [axis]: e.target.value }))}
                        onBlur={e => commitCutterOffset(axis, e.target.value)}
                        onKeyDown={e => { STAIR_ARROW_STOP(e); if (e.key === "Enter") commitCutterOffset(axis, (e.target as HTMLInputElement).value); }}
                        style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#9ab8d4", fontSize: 10, fontFamily: "monospace" }}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ color: "#2a4a6a", fontSize: 9, marginTop: 3 }}>
                  Y offset = half height puts box bottom at stair end
                </div>
              </div>

              <div>
                <div style={LABEL}>ROTATION (DEG)</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {(["x", "y", "z"] as const).map((axis, i) => (
                    <div key={axis} style={{
                      flex: 1, display: "flex", gap: 3, alignItems: "center",
                      background: "rgba(20,30,45,0.8)", border: "1px solid rgba(80,120,180,0.15)",
                      borderRadius: 4, padding: "2px 5px",
                    }}>
                      <span style={{ color: ["#ff6b6b","#6bff8a","#6b8aff"][i], fontSize: 9 }}>{axis.toUpperCase()}</span>
                      <input
                        type="number" step={1}
                        value={cutRot[axis]}
                        onChange={e => setCutRot(p => ({ ...p, [axis]: e.target.value }))}
                        onBlur={e => commitCutterRotation(axis, e.target.value)}
                        onKeyDown={e => { STAIR_ARROW_STOP(e); if (e.key === "Enter") commitCutterRotation(axis, (e.target as HTMLInputElement).value); }}
                        style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: "#9ab8d4", fontSize: 10, fontFamily: "monospace" }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div style={LABEL}>INNER TILING</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  {([["T+B", cutInnerH, setCutInnerH, "innerTileH"], ["L+R", cutInnerV, setCutInnerV, "innerTileV"]] as const).map(
                    ([lbl, val, setter, field]) => (
                      <div key={field}>
                        <div style={{ color: "#3a5a7a", fontSize: 9, marginBottom: 2 }}>{lbl}</div>
                        <input
                          type="number" step={0.25} min={0.1} value={val}
                          style={{ ...NUM_INPUT, padding: "2px 4px", fontSize: 10 }}
                          onChange={e => setter(e.target.value)}
                          onBlur={e => commitCutterInnerTile(field, e.target.value)}
                          onKeyDown={e => { STAIR_ARROW_STOP(e); if (e.key === "Enter") commitCutterInnerTile(field, (e.target as HTMLInputElement).value); }}
                        />
                      </div>
                    )
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
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
