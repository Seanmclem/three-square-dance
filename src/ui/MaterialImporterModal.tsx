import { useEscapeClose } from "./useEscapeClose";
import { useState, useRef } from "react";
import { materialImporter } from "@/editor/MaterialImporter";
import type { DetectedMaps, ImportResult } from "@/editor/MaterialImporter";
import type { MaterialCategory, Attribution } from "@/types";
import { AttributionFields } from "@/ui/AttributionFields";
import { TagInput } from "@/ui/TagInput";

const ACG_ATTRIBUTION: Attribution = {
  author: "ambientCG", patreonUrl: "https://patreon.com/ambientcg", license: "CC0",
};

const MATERIAL_CATEGORIES: MaterialCategory[] = [
  "Stone", "Wood", "Metal", "Fabric", "Ground", "Concrete", "Brick", "Plaster", "Other",
];

interface Props {
  existingCategories: string[];   // categories already in the material library (incl. custom ones)
  existingAttributions: Attribution[];  // library attributions — autofill picker in AttributionFields
  existingTags:       string[];   // suggestions from the material library
  onComplete:       () => void;
  onClose:          () => void;
}

type Phase = "input" | "importing" | "done";

/** acg: one ambientCG set = one material with several maps.
 *  pngs: a folder of plain images = one albedo-only material per image. */
type ImportType = "acg" | "pngs";

const MAP_LABELS: Array<keyof DetectedMaps> = [
  "albedo", "normal", "roughness", "metalness", "ao", "displacement",
];

// Non-standard attribute — makes the file input pick a whole directory.
const DIR_INPUT_PROPS = { webkitdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>;

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
  color: "#8b94a8", fontSize: 10, letterSpacing: 1, marginBottom: 8,
};

const FIELD_LABEL: React.CSSProperties = {
  color: "#c2cadb", fontSize: 11, marginBottom: 4,
};

function autoLabel(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function toId(s: string): string {
  return s.trim().replace(/\s+/g, "_").toLowerCase();
}

/** "texture_01.png" → "texture_01"; anything outside [a-z0-9_] becomes "_". */
function fileBaseId(name: string): string {
  return name.slice(0, name.lastIndexOf(".")).toLowerCase().replace(/[^a-z0-9_]+/g, "_");
}

export function MaterialImporterModal({ existingCategories, existingAttributions, existingTags, onComplete, onClose }: Props) {
  useEscapeClose(onClose);
  const [importType,   setImportType]   = useState<ImportType>("acg");
  const [images,       setImages]       = useState<File[] | null>(null);
  const [idPrefix,     setIdPrefix]     = useState("");
  const [imageResults, setImageResults] = useState<ImportResult[] | null>(null);
  const [materialId,   setMaterialId]   = useState("");
  const [label,        setLabel]        = useState("");
  const [category,     setCategory]     = useState<MaterialCategory>("Other");
  const [newCat,       setNewCat]       = useState(false);
  const [tags,         setTags]         = useState<string[]>([]);
  // Built-in categories first, then any custom ones already in the library.
  const categories = [
    ...MATERIAL_CATEGORIES,
    ...[...new Set(existingCategories)].filter(c => !MATERIAL_CATEGORIES.includes(c)).sort(),
  ];
  const [attribution,  setAttribution]  = useState<Attribution>({ ...ACG_ATTRIBUTION });
  const [acgAuto,      setAcgAuto]       = useState(true);

  const toggleAcg = (on: boolean) => {
    setAcgAuto(on);
    setAttribution(prev => on
      ? { ...prev, ...ACG_ATTRIBUTION }
      : { ...prev, author: undefined, patreonUrl: undefined, license: undefined, licenseOther: undefined });
  };
  const [sourceName,   setSourceName]   = useState<string | null>(null);
  const [detectedMaps, setDetectedMaps] = useState<DetectedMaps | null>(null);
  const [phase,        setPhase]        = useState<Phase>("input");
  const [result,       setResult]       = useState<ImportResult | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);

  const effectiveLabel = label || autoLabel(materialId || "material");

  const imageId = (f: File) => [toId(idPrefix), fileBaseId(f.name)].filter(Boolean).join("_");

  const changeImportType = (t: ImportType) => {
    setImportType(t);
    setSourceName(null); setDetectedMaps(null); setImages(null); setError(null);
    // The ambientCG auto-fill only makes sense for ambientCG sets.
    if (t === "pngs" && acgAuto) toggleAcg(false);
    if (t === "acg" && !acgAuto) toggleAcg(true);
  };

  // Step 2 — pick ambientCG source folder
  const onSourceChosen = (list: FileList | null) => {
    setError(null);
    const files = [...(list ?? [])];
    if (!files.length) return;
    const folder = files[0]!.webkitRelativePath.split("/")[0] || "folder";
    setSourceName(folder);
    if (importType === "pngs") {
      setImages(materialImporter.scanImages(files));
      setIdPrefix(toId(folder));
    } else {
      setDetectedMaps(materialImporter.scanFiles(files));
    }
  };

  const handleImport = async () => {
    if (importType === "pngs") {
      if (!images?.length) return;
      setPhase("importing");
      setError(null);
      try {
        const entries = images.map(file => ({ id: imageId(file), label: autoLabel(imageId(file)), file }));
        setImageResults(await materialImporter.importImages(entries, category.trim(), attribution, tags));
        setPhase("done");
      } catch (e) {
        setError("Import failed: " + String(e));
        setPhase("input");
      }
      return;
    }
    if (!detectedMaps) return;
    const id = materialId.trim().replace(/\s+/g, "_").toLowerCase();
    if (!id) { setError("Material id is required"); return; }
    setPhase("importing");
    setError(null);
    try {
      const res = await materialImporter.importMaterial(id, effectiveLabel, category.trim(), attribution, tags, detectedMaps);
      setResult(res);
      setPhase("done");
    } catch (e) {
      setError("Import failed: " + String(e));
      setPhase("input");
    }
  };

  const handleImportAnother = () => {
    setMaterialId(""); setLabel(""); setCategory("Other"); setNewCat(false); setTags([]); setSourceName(null);
    const acg = importType === "acg";
    setAcgAuto(acg); setAttribution(acg ? { ...ACG_ATTRIBUTION } : {});
    setDetectedMaps(null); setImages(null); setIdPrefix(""); setImageResults(null);
    setPhase("input"); setResult(null); setError(null);
  };

  const canImport = !!category.trim() && (importType === "pngs"
    ? !!images?.length
    : !!(detectedMaps && materialId.trim()));

  return (
    <div style={OVERLAY}>
      <div style={MODAL}>

        <input
          ref={sourceInputRef} type="file" style={{ display: "none" }}
          {...DIR_INPUT_PROPS}
          onChange={e => { onSourceChosen(e.currentTarget.files); e.currentTarget.value = ""; }}
        />

        {/* Header */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ color: "#80aaff", fontSize: 13, letterSpacing: 1 }}>ADD MATERIAL</div>
            <button onClick={onClose} style={{ ...BTN(true), padding: "2px 8px", fontSize: 14 }}>✕</button>
          </div>
        </div>

        {phase !== "done" && <>
          {/* Import type */}
          <div>
            <div style={STEP_LABEL}>IMPORT TYPE</div>
            <select
              value={importType}
              onChange={e => changeImportType(e.target.value as ImportType)}
              style={INPUT_STYLE}
            >
              <option value="acg">ambientCG texture set</option>
              <option value="pngs">Folder of PNGs</option>
            </select>
            <div style={{ color: "#98a2b8", fontSize: 10, marginTop: 4 }}>
              {importType === "acg"
                ? "One material from an ambientCG folder (albedo / normal / roughness / ao / displacement maps)."
                : "One material per image in the folder, color map only (e.g. Kenney prototype textures)."}
            </div>
          </div>

          {/* Step 1 — name + category */}
          <div>
            <div style={STEP_LABEL}>1  NAME</div>
            {importType === "pngs" ? <>
              <div style={FIELD_LABEL}>ID prefix</div>
              <input
                style={INPUT_STYLE}
                placeholder="e.g. proto_dark (defaults to the folder name)"
                value={idPrefix}
                onChange={e => setIdPrefix(e.target.value)}
              />
              <div style={{ color: "#98a2b8", fontSize: 10, marginTop: 4 }}>
                each image becomes /assets/textures/{toId(idPrefix) ? `${toId(idPrefix)}_` : ""}&lt;image name&gt;/
              </div>
            </> : <>
              <div style={FIELD_LABEL}>Material id</div>
              <input
                style={INPUT_STYLE}
                placeholder="e.g. brick_wall_02"
                value={materialId}
                onChange={e => setMaterialId(e.target.value)}
              />
              {materialId && (
                <div style={{ color: "#98a2b8", fontSize: 10, marginTop: 4 }}>
                  folder: /assets/textures/{materialId.trim().replace(/\s+/g, "_").toLowerCase()}/
                </div>
              )}
              <div style={{ ...FIELD_LABEL, marginTop: 8 }}>Label</div>
              <input
                style={INPUT_STYLE}
                placeholder={`default: "${autoLabel(materialId || "material")}"`}
                value={label}
                onChange={e => setLabel(e.target.value)}
              />
            </>}
            <div style={{ ...FIELD_LABEL, marginTop: 8 }}>Category</div>
            <select
              value={newCat ? "__new__" : category}
              onChange={e => {
                const v = e.target.value;
                setNewCat(v === "__new__");
                setCategory(v === "__new__" ? "" : v);
              }}
              style={INPUT_STYLE}
            >
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__new__">New category…</option>
            </select>
            {newCat && (
              <input
                autoFocus
                style={{ ...INPUT_STYLE, marginTop: 6 }}
                placeholder="New category name, e.g. Prototype"
                value={category}
                onChange={e => setCategory(e.target.value)}
              />
            )}
            <div style={{ ...FIELD_LABEL, marginTop: 8 }}>Tags</div>
            <TagInput value={tags} onChange={setTags} suggestions={existingTags} />
          </div>

          {/* Attribution (optional) */}
          <div>
            <div style={STEP_LABEL}>ATTRIBUTION (optional)</div>
            {importType === "acg" && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11, marginBottom: 8 }}>
              <input type="checkbox" checked={acgAuto} onChange={e => toggleAcg(e.currentTarget.checked)} />
              Auto-fill ambientCG (author, Patreon, CC0)
            </label>
            )}
            <AttributionFields value={attribution} onChange={setAttribution} autofillFrom={existingAttributions} />
          </div>

          {/* Step 2 — source folder */}
          <div>
            <div style={STEP_LABEL}>2  {importType === "pngs" ? "IMAGE FOLDER" : "AMBIENTCG SOURCE FOLDER"}</div>
            <button style={BTN(true)} onClick={() => sourceInputRef.current?.click()}>
              {sourceName ? `📁 ${sourceName}` : importType === "pngs" ? "Choose image folder…" : "Choose ambientCG folder…"}
            </button>

            {importType === "pngs" && images && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                {!images.length && <div style={{ color: "#ffaa44", fontSize: 11 }}>No .png / .jpg / .webp images at the top of this folder.</div>}
                {images.map(f => (
                  <div key={f.name} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: "#6bff8a", width: 14, fontSize: 11 }}>●</span>
                    <span style={{ color: "#c2cadb", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{imageId(f)}</span>
                    <span style={{ color: "#98a2b8", fontSize: 10 }}>{f.name}</span>
                  </div>
                ))}
              </div>
            )}

            {importType === "acg" && detectedMaps && (
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
                        color: "#98a2b8", fontSize: 10,
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
              {phase === "importing" ? "Importing…"
                : importType === "pngs" && images?.length ? `Import ${images.length} material${images.length === 1 ? "" : "s"}`
                : "Import material"}
            </button>
          </div>
        </>}

        {phase === "done" && (result || imageResults) && (
          <div>
            <div style={STEP_LABEL}>RESULT</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {imageResults?.map(r => (
                <div key={r.materialId} style={{ fontSize: 11, color: r.failed.length ? "#ff6b6b" : r.skipped.length ? "#ffaa44" : "#6bff8a" }}>
                  {r.failed.length ? "✗" : r.skipped.length ? "⚠" : "✓"} {r.materialId}
                  {r.failed.length ? " — failed" : r.skipped.length ? " — image already exists, kept it" : ""}
                </div>
              ))}
              {result && result.copied.map(f  => <div key={f} style={{ color: "#6bff8a", fontSize: 11 }}>✓ {f}</div>)}
              {result && result.skipped.map(f => <div key={f} style={{ color: "#ffaa44", fontSize: 11 }}>⚠ {f} — already exists, skipped</div>)}
              {result && result.failed.map(f  => <div key={f} style={{ color: "#ff6b6b", fontSize: 11 }}>✗ {f} — failed</div>)}
              <div style={{ color: "#6bff8a", fontSize: 11, marginTop: 4 }}>✓ manifest.json updated</div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button style={BTN(true)} onClick={handleImportAnother}>Import another</button>
              <button style={{ ...BTN(true), background: "rgba(80,140,255,0.3)" }} onClick={onComplete}>Done</button>
            </div>
          </div>
        )}

        {error && <div style={{ color: "#ff6b6b", fontSize: 11 }}>{error}</div>}
      </div>
    </div>
  );
}
