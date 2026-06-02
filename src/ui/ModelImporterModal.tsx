import { useState } from "react";
import type { AssetDef, AssetCategory, AssetManifest } from "@/types";
import { renderModelThumbnail } from "@/editor/thumbnailRenderer";

interface Props {
  modelsDir:      FileSystemDirectoryHandle | null;
  onModelsDirSet: (dir: FileSystemDirectoryHandle) => void;
  onComplete:     (assets: AssetDef[]) => void;
  onClose:        () => void;
}

type Phase = "pick" | "meta" | "importing" | "done";

const CATEGORIES: AssetCategory[] = [
  "Furniture", "Props", "Structures", "Lights", "Characters", "Vegetation", "Other",
];

const MODEL_EXTS = new Set([".glb", ".gltf", ".obj"]);

function getExt(name: string): string {
  return name.slice(name.lastIndexOf(".")).toLowerCase();
}
function baseName(name: string): string {
  return name.slice(0, name.lastIndexOf(".")).toLowerCase();
}
function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}
function autoLabel(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
}

interface ModelEntry {
  id:          string;
  modelHandle: FileSystemFileHandle;
  mtlHandle:   FileSystemFileHandle | null;
  label:       string;
  category:    string;
  showNewCat:  boolean;
}

type FSPicker = {
  showOpenFilePicker:  (opts: unknown) => Promise<FileSystemFileHandle[]>;
  showDirectoryPicker: (opts: unknown) => Promise<FileSystemDirectoryHandle>;
};

function dataURLtoArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)!;
  return bytes.buffer;
}

async function generateThumbnail(
  handle: FileSystemFileHandle,
  ext: string,
): Promise<string | null> {
  let blobUrl: string | null = null;
  try {
    const file = await handle.getFile();
    blobUrl = URL.createObjectURL(file);

    let root: import("three").Object3D;
    if (ext === ".obj") {
      const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
      root = await new OBJLoader().loadAsync(blobUrl);
    } else if (ext === ".glb" || ext === ".gltf") {
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      const gltf = await new GLTFLoader().loadAsync(blobUrl) as { scene: import("three").Object3D };
      root = gltf.scene;
    } else {
      return null;
    }

    return renderModelThumbnail(root);
  } catch (err) {
    console.warn("Thumbnail generation failed:", err);
    return null;
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
}

const OVERLAY: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 100,
  background: "rgba(0,0,0,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center",
};
const MODAL: React.CSSProperties = {
  background: "rgba(10,14,22,0.98)",
  border: "1px solid rgba(80,120,180,0.3)",
  borderRadius: 8, width: 480, maxHeight: "85vh",
  display: "flex", flexDirection: "column",
  color: "#9ab8d4", fontFamily: "monospace", fontSize: 12,
};
const INPUT: React.CSSProperties = {
  background: "rgba(20,30,45,0.9)", border: "1px solid rgba(80,120,180,0.25)",
  borderRadius: 4, color: "#9ab8d4", fontFamily: "monospace", fontSize: 11,
  padding: "4px 7px", outline: "none", boxSizing: "border-box",
};
const BTN = (active = true): React.CSSProperties => ({
  padding: "7px 14px", borderRadius: 4, cursor: active ? "pointer" : "default",
  fontFamily: "monospace", fontSize: 11, border: "none",
  background: active ? "rgba(80,140,255,0.2)" : "rgba(40,50,70,0.6)",
  color: active ? "#80aaff" : "#4a6a8a",
});
const STEP_LABEL: React.CSSProperties = {
  color: "#4a6a8a", fontSize: 10, letterSpacing: 1,
};

export function ModelImporterModal({ modelsDir, onModelsDirSet, onComplete, onClose }: Props) {
  const [phase,      setPhase]      = useState<Phase>("pick");
  const [entries,    setEntries]    = useState<ModelEntry[]>([]);
  const [collidable, setCollidable] = useState(true);
  const [progress,   setProgress]   = useState("");
  const [error,      setError]      = useState<string | null>(null);
  const [results,    setResults]    = useState<AssetDef[]>([]);

  function updateEntry(id: string, patch: Partial<ModelEntry>): void {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  }

  async function pickFiles(): Promise<void> {
    try {
      const handles = await (window as unknown as FSPicker).showOpenFilePicker({
        multiple: true,
        types: [{ description: "3D Models & Materials", accept: { "model/*": [".glb", ".gltf", ".obj"], "text/plain": [".mtl"] } }],
      });
      if (!handles.length) return;

      // Separate models from mtl files
      const models = handles.filter(h => MODEL_EXTS.has(getExt(h.name)));
      const mtls   = handles.filter(h => getExt(h.name) === ".mtl");

      if (!models.length) return;

      // Auto-pair OBJ files with MTL files by matching base name
      const mtlMap = new Map(mtls.map(h => [baseName(h.name), h]));

      const newEntries: ModelEntry[] = models.map(h => ({
        id:          crypto.randomUUID(),
        modelHandle: h,
        mtlHandle:   getExt(h.name) === ".obj" ? (mtlMap.get(baseName(h.name)) ?? null) : null,
        label:       autoLabel(h.name),
        category:    "Props",
        showNewCat:  false,
      }));

      setEntries(newEntries);
      setPhase("meta");
    } catch { /* cancelled */ }
  }

  async function pickExtraMtl(entryId: string): Promise<void> {
    try {
      const [h] = await (window as unknown as FSPicker).showOpenFilePicker({
        multiple: false,
        types: [{ description: "MTL Material", accept: { "text/plain": [".mtl"] } }],
      });
      if (h) updateEntry(entryId, { mtlHandle: h });
    } catch { /* cancelled */ }
  }

  async function pickModelsDir(): Promise<void> {
    try {
      const dir = await (window as unknown as FSPicker).showDirectoryPicker({ mode: "readwrite" });
      onModelsDirSet(dir);
    } catch { /* cancelled */ }
  }

  async function copyFile(src: FileSystemFileHandle, dir: FileSystemDirectoryHandle, dest: string): Promise<void> {
    const file = await src.getFile();
    const dh   = await dir.getFileHandle(dest, { create: true });
    const w    = await dh.createWritable();
    await w.write(await file.arrayBuffer());
    await w.close();
  }

  async function doImport(): Promise<void> {
    if (!modelsDir || !entries.length) return;
    setPhase("importing");
    setError(null);

    // Load manifest once
    let manifest: AssetManifest = { version: "1.0", assets: [] };
    try {
      const mh = await modelsDir.getFileHandle("manifest.json");
      manifest = JSON.parse(await (await mh.getFile()).text()) as AssetManifest;
    } catch { /* new manifest */ }

    const imported: AssetDef[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      setProgress(`Importing ${i + 1} of ${entries.length}: ${entry.modelHandle.name}`);
      try {
        const modelExt  = getExt(entry.modelHandle.name);
        const base      = slugify(entry.label) || slugify(autoLabel(entry.modelHandle.name));
        const destModel = `${base}${modelExt}`;
        await copyFile(entry.modelHandle, modelsDir, destModel);

        let destMtl: string | undefined;
        if (modelExt === ".obj" && entry.mtlHandle) {
          destMtl = `${base}.mtl`;
          await copyFile(entry.mtlHandle, modelsDir, destMtl);
        }

        // Generate thumbnail
        setProgress(`Generating thumbnail ${i + 1} of ${entries.length}: ${entry.modelHandle.name}`);
        let destThumb: string | undefined;
        const thumbDataUrl = await generateThumbnail(entry.modelHandle, modelExt);
        if (thumbDataUrl) {
          destThumb = `${base}_thumb.png`;
          const thumbHandle = await modelsDir.getFileHandle(destThumb, { create: true });
          const thumbWriter = await thumbHandle.createWritable();
          await thumbWriter.write(dataURLtoArrayBuffer(thumbDataUrl));
          await thumbWriter.close();
        }

        const resolvedCat = (entry.category === "__new__" ? "Other" : entry.category) as AssetCategory;

        const asset: AssetDef = {
          id:           base,
          label:        entry.label.trim() || base,
          category:     resolvedCat,
          path:         `/assets/models/${destModel}`,
          ...(destMtl   ? { mtlPath:   `/assets/models/${destMtl}`   } : {}),
          ...(destThumb ? { thumbnail: `/assets/models/${destThumb}` } : {}),
          collidable,
          colliderType: "box",
          tags:         [],
          dateAdded:    new Date().toISOString().slice(0, 10),
        };

        manifest.assets = manifest.assets.filter(a => a.id !== asset.id);
        manifest.assets.push(asset);
        imported.push(asset);
      } catch (err) {
        console.warn(`Import failed for ${entry.modelHandle.name}:`, err);
      }
    }

    // Write manifest once after all imports
    try {
      const mw = await modelsDir.getFileHandle("manifest.json", { create: true });
      const wb = await mw.createWritable();
      await wb.write(JSON.stringify(manifest, null, 2));
      await wb.close();
    } catch (err) {
      setError(`Manifest write failed: ${String(err)}`);
    }

    setResults(imported);
    setPhase("done");
    onComplete(imported);
  }

  return (
    <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={MODAL}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px 12px", borderBottom: "1px solid rgba(80,120,180,0.15)", flexShrink: 0 }}>
          <span style={{ fontSize: 13, color: "#c0d0e0", letterSpacing: 1 }}>IMPORT MODELS</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#4060a0", fontSize: 16 }}>✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Step 1 — Pick */}
          {phase === "pick" && (
            <>
              <p style={STEP_LABEL}>SELECT FILES</p>
              <div style={{ fontSize: 10, color: "#5a7a9a", lineHeight: 1.7 }}>
                Supported: <span style={{ color: "#80aaff" }}>.glb .gltf .obj</span>
                — select multiple files at once. Pair <span style={{ color: "#80aaff" }}>.obj + .mtl</span> by selecting both; they're matched by base name.
              </div>
              {!modelsDir && (
                <div style={{ background: "rgba(255,180,40,0.06)", border: "1px solid rgba(255,180,40,0.2)", borderRadius: 4, padding: "8px 10px", fontSize: 10, color: "#c09050" }}>
                  Models folder not set — imports cannot be saved.
                </div>
              )}
              <button style={BTN()} onClick={() => void pickFiles()}>Browse files…</button>
              {!modelsDir && (
                <button style={{ ...BTN(), background: "rgba(255,180,40,0.1)", color: "#c09050" }} onClick={() => void pickModelsDir()}>
                  Set models folder…
                </button>
              )}
            </>
          )}

          {/* Step 2 — Metadata list */}
          {(phase === "meta" || phase === "importing") && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={STEP_LABEL}>{entries.length} MODEL{entries.length !== 1 ? "S" : ""} DETECTED</p>
                <button style={{ ...BTN(), padding: "3px 8px", fontSize: 10 }} onClick={() => setPhase("pick")}>← Change files</button>
              </div>

              {/* Set all categories */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: "#5a7a9a", whiteSpace: "nowrap" }}>Set all to</span>
                <select
                  style={{ ...INPUT, flex: 1, cursor: "pointer" }}
                  defaultValue=""
                  onChange={e => {
                    const val = e.currentTarget.value;
                    if (!val) return;
                    setEntries(prev => prev.map(en => ({ ...en, category: val, showNewCat: val === "__new__" })));
                    e.currentTarget.value = "";
                  }}
                >
                  <option value="" disabled>Category…</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__new__">New category…</option>
                </select>
              </div>

              {/* Entry list */}
              {entries.map(entry => {
                const isOBJ = getExt(entry.modelHandle.name) === ".obj";
                return (
                  <div key={entry.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(80,120,180,0.12)", borderRadius: 5, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
                    {/* File row */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, color: "#80aaff" }}>📄 {entry.modelHandle.name}</span>
                      {isOBJ && (
                        entry.mtlHandle
                          ? <span style={{ fontSize: 10, color: "#80cc90" }}>🎨 {entry.mtlHandle.name}</span>
                          : (
                            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <span style={{ fontSize: 10, color: "#c09050" }}>⚠ no .mtl</span>
                              <button style={{ ...BTN(), padding: "1px 7px", fontSize: 9 }} onClick={() => void pickExtraMtl(entry.id)}>+ .mtl</button>
                            </span>
                          )
                      )}
                    </div>

                    {/* Label + Category row */}
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        style={{ ...INPUT, flex: 1 }}
                        value={entry.label}
                        onChange={e => updateEntry(entry.id, { label: e.currentTarget.value })}
                        placeholder="Label"
                      />
                      <select
                        style={{ ...INPUT, width: 110, cursor: "pointer" }}
                        value={entry.category}
                        onChange={e => updateEntry(entry.id, { category: e.currentTarget.value, showNewCat: e.currentTarget.value === "__new__" })}
                      >
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        <option value="__new__">New…</option>
                      </select>
                    </div>

                    {entry.showNewCat && (
                      <input
                        style={INPUT}
                        placeholder="Category name"
                        autoFocus
                        onChange={e => updateEntry(entry.id, { category: e.currentTarget.value || "__new__" })}
                      />
                    )}
                  </div>
                );
              })}

              {/* Global collidable */}
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11 }}>
                <input type="checkbox" checked={collidable} onChange={e => setCollidable(e.currentTarget.checked)} />
                <span>Collidable (all)</span>
              </label>

              {!modelsDir && (
                <div style={{ background: "rgba(255,60,60,0.06)", border: "1px solid rgba(255,60,60,0.2)", borderRadius: 4, padding: "8px 10px", fontSize: 10, color: "#c06060" }}>
                  No models folder set.{" "}
                  <button style={{ background: "none", border: "none", cursor: "pointer", color: "#c09050", fontSize: 10 }} onClick={() => void pickModelsDir()}>Set folder…</button>
                </div>
              )}
              {error && <div style={{ color: "#c06060", fontSize: 10 }}>{error}</div>}
              {phase === "importing" && <div style={{ color: "#6080a0", fontSize: 10 }}>{progress}</div>}
            </>
          )}

          {/* Done */}
          {phase === "done" && (
            <>
              <p style={STEP_LABEL}>DONE</p>
              <div style={{ color: "#80cc90", fontSize: 11 }}>✓ &nbsp;{results.length} model{results.length !== 1 ? "s" : ""} imported.</div>
              {results.map(r => (
                <div key={r.id} style={{ fontSize: 10, color: "#6080a0" }}>
                  {r.label} — <span style={{ color: "#4a6a8a" }}>{r.path}</span>
                </div>
              ))}
              {error && <div style={{ color: "#c06060", fontSize: 10 }}>{error}</div>}
            </>
          )}
        </div>

        {/* Footer */}
        {(phase === "meta" || phase === "done") && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(80,120,180,0.15)", flexShrink: 0, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {phase === "meta" && (
              <button
                style={BTN(!!modelsDir)}
                disabled={!modelsDir}
                onClick={() => void doImport()}
              >
                Import {entries.length > 1 ? `all ${entries.length}` : ""}
              </button>
            )}
            {phase === "done" && <button style={BTN()} onClick={onClose}>Close</button>}
          </div>
        )}
      </div>
    </div>
  );
}
