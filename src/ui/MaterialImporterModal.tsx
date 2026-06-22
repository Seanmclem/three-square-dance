import { useState } from "react";
import { materialImporter } from "@/editor/MaterialImporter";
import type { DetectedMaps, ImportResult } from "@/editor/MaterialImporter";
import type { MaterialDef, MaterialCategory, Attribution } from "@/types";
import { AttributionFields } from "@/ui/AttributionFields";

const ACG_ATTRIBUTION: Attribution = {
  author: "ambientCG", patreonUrl: "https://patreon.com/ambientcg", license: "CC0",
};

const MATERIAL_CATEGORIES: MaterialCategory[] = [
  "Stone", "Wood", "Metal", "Fabric", "Ground", "Concrete", "Brick", "Plaster", "Other",
];

interface Props {
  texturesDir:      FileSystemDirectoryHandle | null;
  onTextureDirSet:  (dir: FileSystemDirectoryHandle) => void;
  onComplete:       (material: MaterialDef) => void;
  onClose:          () => void;
}

type Phase = "input" | "importing" | "done";

const MAP_LABELS: Array<keyof DetectedMaps> = [
  "albedo", "normal", "roughness", "metalness", "ao", "displacement",
];

const OVERLAY: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 100,
  background: "rgba(0,0,0,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center",
};

const MODAL: React.CSSProperties = {
  background: "rgba(28,28,28,0.98)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  width: 440,
  maxHeight: "85vh",
  overflowY: "auto",
  padding: "20px 22px",
  display: "flex",
  flexDirection: "column",
  gap: 18,
  color: "#c0c0c0",
  fontFamily: "monospace",
  fontSize: 12,
};

const INPUT_STYLE: React.CSSProperties = {
  width: "100%", background: "rgba(46,46,46,0.9)",
  border: "1px solid rgba(255,255,255,0.09)", borderRadius: 4,
  color: "#c0c0c0", fontFamily: "monospace", fontSize: 12,
  padding: "5px 8px", outline: "none", boxSizing: "border-box",
};

const BTN = (active = true): React.CSSProperties => ({
  padding: "7px 14px", borderRadius: 4, cursor: active ? "pointer" : "default",
  fontFamily: "monospace", fontSize: 11, border: "none",
  background: active ? "rgba(80,140,255,0.2)" : "rgba(55,55,55,0.7)",
  color: active ? "#80aaff" : "#646464",
});

const STEP_LABEL: React.CSSProperties = {
  color: "#646464", fontSize: 10, letterSpacing: 1, marginBottom: 8,
};

function autoLabel(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function MaterialImporterModal({
  texturesDir, onTextureDirSet, onComplete, onClose,
}: Props) {
  const [materialId,   setMaterialId]   = useState("");
  const [label,        setLabel]        = useState("");
  const [category,     setCategory]     = useState<MaterialCategory>("Other");
  const [attribution,  setAttribution]  = useState<Attribution>({ ...ACG_ATTRIBUTION });
  const [acgAuto,      setAcgAuto]       = useState(true);

  const toggleAcg = (on: boolean) => {
    setAcgAuto(on);
    setAttribution(prev => on
      ? { ...prev, ...ACG_ATTRIBUTION }
      : { ...prev, author: undefined, patreonUrl: undefined, license: undefined, licenseOther: undefined });
  };
  const [sourceDir,    setSourceDir]    = useState<FileSystemDirectoryHandle | null>(null);
  const [detectedMaps, setDetectedMaps] = useState<DetectedMaps | null>(null);
  const [phase,        setPhase]        = useState<Phase>("input");
  const [result,       setResult]       = useState<ImportResult | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  const effectiveLabel = label || autoLabel(materialId || "material");

  // Step 0 — pick destination (textures) folder
  const pickTexturesDir = async () => {
    setError(null);
    try {
      const dir = await window.showDirectoryPicker({ mode: "readwrite" });
      onTextureDirSet(dir);
      if (!dir.name.toLowerCase().includes("textures")) {
        setError(`⚠ "${dir.name}" doesn't look like the textures folder. Expected public/assets/textures/.`);
      }
    } catch (e) {
      if ((e as DOMException).name !== "AbortError")
        setError("Could not open folder: " + String(e));
    }
  };

  // Step 2 — pick ambientCG source folder
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
    if (!texturesDir || !sourceDir || !detectedMaps) return;
    const id = materialId.trim().replace(/\s+/g, "_").toLowerCase();
    if (!id) { setError("Material id is required"); return; }
    setPhase("importing");
    setError(null);
    try {
      const res = await materialImporter.importMaterial(id, effectiveLabel, category, attribution, texturesDir, detectedMaps);
      setResult(res);
      setPhase("done");
    } catch (e) {
      setError("Import failed: " + String(e));
      setPhase("input");
    }
  };

  const handleDone = () => {
    const id = materialId.trim().replace(/\s+/g, "_").toLowerCase();
    const base = `/assets/textures/${id}`;
    const def: MaterialDef = {
      id, label: effectiveLabel, category,
      ...(Object.keys(attribution).length ? { attribution } : {}),
      tileScale: 1.0, roughnessVal: 0.85, metalnessVal: 0.0, displacementScale: 0.03,
      maps: {
        albedo:       { enabled: true,                             path: `${base}/albedo.jpg` },
        normal:       { enabled: "normal"    in (detectedMaps!),  path: `${base}/normal.jpg` },
        roughness:    { enabled: "roughness" in (detectedMaps!),  path: `${base}/roughness.jpg` },
        metalness:    { enabled: false,                           path: `${base}/metalness.jpg` },
        ao:           { enabled: "ao"        in (detectedMaps!),  path: `${base}/ao.jpg` },
        displacement: { enabled: false,                           path: `${base}/displacement.jpg` },
      },
    };
    onComplete(def);
  };

  const handleImportAnother = () => {
    setMaterialId(""); setLabel(""); setCategory("Other"); setAcgAuto(true); setAttribution({ ...ACG_ATTRIBUTION }); setSourceDir(null);
    setDetectedMaps(null); setPhase("input"); setResult(null); setError(null);
  };

  const canImport = !!(texturesDir && sourceDir && detectedMaps && materialId.trim());

  return (
    <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={MODAL}>

        {/* Header */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ color: "#80aaff", fontSize: 13, letterSpacing: 1 }}>ADD MATERIAL</div>
            <button onClick={onClose} style={{ ...BTN(true), padding: "2px 8px", fontSize: 14 }}>✕</button>
          </div>
          <div style={{ color: "#646464", fontSize: 10, marginTop: 4 }}>
            Compatible with ambientCG texture sets (albedo / normal / roughness / ao / displacement maps).
          </div>
        </div>

        {/* Step 0 — destination folder (one-time per session) */}
        <div>
          <div style={STEP_LABEL}>DESTINATION — project textures folder{texturesDir ? " ✓" : ""}</div>
          {texturesDir
            ? <div style={{ color: "#6bff8a", fontSize: 11 }}>📁 {texturesDir.name}</div>
            : <>
                <div style={{ color: "#646464", fontSize: 11, marginBottom: 8, lineHeight: 1.5 }}>
                  Navigate to <span style={{ color: "#c0c0c0" }}>public/assets/textures/</span> inside this project.
                  This is where imported files will be written. Only needed once per session.
                </div>
                <button style={BTN(true)} onClick={pickTexturesDir}>
                  Select textures folder…
                </button>
              </>
          }
        </div>

        {phase !== "done" && <>
          {/* Step 1 — name */}
          <div>
            <div style={STEP_LABEL}>1  MATERIAL ID</div>
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
              <div style={{ color: "#646464", fontSize: 10, marginTop: 4 }}>
                folder: /assets/textures/{materialId.trim().replace(/\s+/g, "_").toLowerCase()}/
              </div>
            )}
            <select
              value={category}
              onChange={e => setCategory(e.target.value as MaterialCategory)}
              style={{ ...INPUT_STYLE, marginTop: 6 }}
            >
              {MATERIAL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Attribution (optional) */}
          <div>
            <div style={STEP_LABEL}>ATTRIBUTION (optional)</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11, marginBottom: 8 }}>
              <input type="checkbox" checked={acgAuto} onChange={e => toggleAcg(e.currentTarget.checked)} />
              Auto-fill ambientCG (author, Patreon, CC0)
            </label>
            <AttributionFields value={attribution} onChange={setAttribution} />
          </div>

          {/* Step 2 — source folder */}
          <div>
            <div style={STEP_LABEL}>2  AMBIENTCG SOURCE FOLDER</div>
            <button style={BTN(true)} onClick={pickSourceFolder}>
              {sourceDir ? `📁 ${sourceDir.name}` : "Choose ambientCG folder…"}
            </button>

            {detectedMaps && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                {MAP_LABELS.map(key => {
                  const found = detectedMaps[key];
                  return (
                    <div key={key} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ color: found ? "#6bff8a" : "#505060", width: 14, fontSize: 11 }}>
                        {found ? "●" : "○"}
                      </span>
                      <span style={{ color: "#909090", width: 80 }}>{key}</span>
                      <span style={{
                        color: "#646464", fontSize: 10,
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

          {/* Step 3 — import */}
          <div>
            <div style={STEP_LABEL}>3  IMPORT</div>
            <button style={BTN(canImport)} onClick={handleImport} disabled={!canImport}>
              {phase === "importing" ? "Importing…" : "Import material"}
            </button>
          </div>
        </>}

        {phase === "done" && result && (
          <div>
            <div style={STEP_LABEL}>RESULT</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {result.copied.map(f  => <div key={f} style={{ color: "#6bff8a", fontSize: 11 }}>✓ {f}</div>)}
              {result.skipped.map(f => <div key={f} style={{ color: "#ffaa44", fontSize: 11 }}>⚠ {f} — already exists, skipped</div>)}
              {result.failed.map(f  => <div key={f} style={{ color: "#ff6b6b", fontSize: 11 }}>✗ {f} — failed</div>)}
              <div style={{ color: "#6bff8a", fontSize: 11, marginTop: 4 }}>✓ manifest.json updated</div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button style={BTN(true)} onClick={handleImportAnother}>Import another</button>
              <button style={{ ...BTN(true), background: "rgba(80,140,255,0.3)" }} onClick={handleDone}>Done</button>
            </div>
          </div>
        )}

        {error && <div style={{ color: "#ff6b6b", fontSize: 11 }}>{error}</div>}
      </div>
    </div>
  );
}
