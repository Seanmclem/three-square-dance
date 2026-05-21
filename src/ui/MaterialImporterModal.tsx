import { useState } from "react";
import { materialImporter } from "@/editor/MaterialImporter";
import type { DetectedMaps, ImportResult } from "@/editor/MaterialImporter";
import type { MaterialDef } from "@/types";

interface Props {
  texturesDir: FileSystemDirectoryHandle;
  onComplete:  (material: MaterialDef) => void;
  onClose:     () => void;
}

type Phase = "input" | "importing" | "done";

const MAP_LABELS: Record<keyof DetectedMaps, string> = {
  albedo:       "albedo",
  normal:       "normal",
  roughness:    "roughness",
  metalness:    "metalness",
  ao:           "ao",
  displacement: "displacement",
};

const OVERLAY: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 100,
  background: "rgba(0,0,0,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center",
};

const MODAL: React.CSSProperties = {
  background: "rgba(10,14,22,0.98)",
  border: "1px solid rgba(80,120,180,0.3)",
  borderRadius: 8,
  width: 420,
  maxHeight: "80vh",
  overflowY: "auto",
  padding: "20px 22px",
  display: "flex",
  flexDirection: "column",
  gap: 16,
  color: "#9ab8d4",
  fontFamily: "monospace",
  fontSize: 12,
};

const INPUT_STYLE: React.CSSProperties = {
  width: "100%", background: "rgba(20,30,45,0.9)",
  border: "1px solid rgba(80,120,180,0.25)", borderRadius: 4,
  color: "#9ab8d4", fontFamily: "monospace", fontSize: 12,
  padding: "5px 8px", outline: "none", boxSizing: "border-box",
};

const BTN = (active = true): React.CSSProperties => ({
  padding: "7px 16px", borderRadius: 4, cursor: active ? "pointer" : "default",
  fontFamily: "monospace", fontSize: 11, border: "none",
  background: active ? "rgba(80,140,255,0.2)" : "rgba(40,50,70,0.6)",
  color: active ? "#80aaff" : "#4a6a8a",
  transition: "background 0.15s",
});

function autoLabel(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function MaterialImporterModal({ texturesDir, onComplete, onClose }: Props) {
  const [materialId,   setMaterialId]   = useState("");
  const [label,        setLabel]        = useState("");
  const [sourceDir,    setSourceDir]    = useState<FileSystemDirectoryHandle | null>(null);
  const [detectedMaps, setDetectedMaps] = useState<DetectedMaps | null>(null);
  const [phase,        setPhase]        = useState<Phase>("input");
  const [result,       setResult]       = useState<ImportResult | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  const effectiveLabel = label || autoLabel(materialId || "material");

  const pickSourceFolder = async () => {
    setError(null);
    try {
      const dir = await window.showDirectoryPicker({ mode: "read" });
      setSourceDir(dir);
      const maps = await materialImporter.scanFolder(dir);
      setDetectedMaps(maps);
    } catch (e) {
      if ((e as DOMException).name !== "AbortError")
        setError("Could not open folder: " + String(e));
    }
  };

  const handleImport = async () => {
    if (!sourceDir || !detectedMaps) return;
    const id = materialId.trim().replace(/\s+/g, "_").toLowerCase();
    if (!id) { setError("Material id is required"); return; }
    setPhase("importing");
    setError(null);
    try {
      const res = await materialImporter.importMaterial(id, effectiveLabel, texturesDir, detectedMaps);
      setResult(res);
      setPhase("done");
    } catch (e) {
      setError("Import failed: " + String(e));
      setPhase("input");
    }
  };

  const handleDone = () => {
    // Build a minimal MaterialDef so the caller can refresh without re-fetching
    const id = materialId.trim().replace(/\s+/g, "_").toLowerCase();
    const base = `/assets/textures/${id}`;
    const def: MaterialDef = {
      id, label: effectiveLabel,
      tileScale: 1.0, roughnessVal: 0.85, metalnessVal: 0.0, displacementScale: 0.03,
      maps: {
        albedo:       { enabled: true,                               path: `${base}/albedo.jpg` },
        normal:       { enabled: "normal"       in (detectedMaps!),  path: `${base}/normal.jpg` },
        roughness:    { enabled: "roughness"    in (detectedMaps!),  path: `${base}/roughness.jpg` },
        metalness:    { enabled: false,                              path: `${base}/metalness.jpg` },
        ao:           { enabled: "ao"           in (detectedMaps!),  path: `${base}/ao.jpg` },
        displacement: { enabled: false,                              path: `${base}/displacement.jpg` },
      },
    };
    onComplete(def);
  };

  const handleImportAnother = () => {
    setMaterialId("");
    setLabel("");
    setSourceDir(null);
    setDetectedMaps(null);
    setPhase("input");
    setResult(null);
    setError(null);
  };

  return (
    <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={MODAL}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: "#80aaff", fontSize: 13, letterSpacing: 1 }}>ADD AMBIENTCG MATERIAL</div>
          <button onClick={onClose} style={{ ...BTN(true), padding: "2px 8px", fontSize: 14, lineHeight: 1 }}>✕</button>
        </div>

        {phase !== "done" && <>
          {/* Step 1 — Name */}
          <div>
            <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>1  MATERIAL ID</div>
            <input
              style={INPUT_STYLE}
              placeholder="e.g. brick_wall_02"
              value={materialId}
              onChange={e => setMaterialId(e.target.value)}
            />
            <input
              style={{ ...INPUT_STYLE, marginTop: 6 }}
              placeholder={`label (default: "${autoLabel(materialId || "material")}")`}
              value={label}
              onChange={e => setLabel(e.target.value)}
            />
            {materialId && (
              <div style={{ color: "#4a6a8a", fontSize: 10, marginTop: 4 }}>
                folder: /assets/textures/{materialId.trim().replace(/\s+/g, "_").toLowerCase()}/
              </div>
            )}
          </div>

          {/* Step 2 — Source folder */}
          <div>
            <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>2  SOURCE FOLDER</div>
            <button style={BTN(true)} onClick={pickSourceFolder}>
              {sourceDir ? `📁 ${sourceDir.name}` : "Choose ambientCG folder…"}
            </button>

            {detectedMaps && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                {(Object.keys(MAP_LABELS) as Array<keyof DetectedMaps>).map(key => {
                  const found = detectedMaps[key];
                  return (
                    <div key={key} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ color: found ? "#6bff8a" : "#3a5a6a", width: 14, fontSize: 11 }}>
                        {found ? "●" : "○"}
                      </span>
                      <span style={{ color: "#6a90b8", width: 80 }}>{MAP_LABELS[key]}</span>
                      <span style={{
                        color: "#4a6a8a", fontSize: 10,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                      }}>
                        {found ? found.srcName : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 3 — Import */}
          <div>
            <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>3  IMPORT</div>
            <button
              style={BTN(!!(sourceDir && detectedMaps && materialId.trim()))}
              onClick={handleImport}
              disabled={!(sourceDir && detectedMaps && materialId.trim())}
            >
              Import material
            </button>
          </div>
        </>}

        {phase === "done" && result && (
          <div>
            <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 1, marginBottom: 10 }}>RESULT</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {result.copied.map(f => (
                <div key={f} style={{ color: "#6bff8a", fontSize: 11 }}>✓ {f}</div>
              ))}
              {result.skipped.map(f => (
                <div key={f} style={{ color: "#ffaa44", fontSize: 11 }}>⚠ {f} (already exists — skipped)</div>
              ))}
              {result.failed.map(f => (
                <div key={f} style={{ color: "#ff6b6b", fontSize: 11 }}>✗ {f} (failed)</div>
              ))}
              <div style={{ color: "#6bff8a", fontSize: 11, marginTop: 4 }}>✓ manifest.json updated</div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button style={BTN(true)} onClick={handleImportAnother}>Import another</button>
              <button style={{ ...BTN(true), background: "rgba(80,140,255,0.3)" }} onClick={handleDone}>
                Done
              </button>
            </div>
          </div>
        )}

        {error && (
          <div style={{ color: "#ff6b6b", fontSize: 11 }}>{error}</div>
        )}
      </div>
    </div>
  );
}
