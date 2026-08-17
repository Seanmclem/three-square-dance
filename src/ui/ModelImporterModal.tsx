import { useState, useRef } from "react";
import { LoadingManager } from "three";
import type { AssetDef, AssetCategory, AssetManifest, Attribution } from "@/types";
import { renderModelThumbnail, releaseThumbnailRenderer, dataURLtoArrayBuffer } from "@/editor/thumbnailRenderer";
import { readManifest, writeManifest, writeAssetFile } from "@/assets/assetLibrary";
import { AttributionFields } from "@/ui/AttributionFields";
import { TagInput } from "@/ui/TagInput";

interface Props {
  existingTags:   string[];   // suggestions — the manifest isn't read until the import step
  existingAttributions: Attribution[];  // library attributions — autofill picker in AttributionFields
  onComplete:     (assets: AssetDef[]) => void;
  onClose:        () => void;
}

type Phase = "pick" | "meta" | "importing" | "done";

const CATEGORIES: AssetCategory[] = [
  "Furniture", "Props", "Structures", "Lights", "Characters", "Vegetation", "Other",
];

const MODEL_EXTS   = new Set([".glb", ".gltf", ".obj"]);
const TEXTURE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".tga", ".bmp"]);

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
  id:         string;
  modelFile:  File;
  mtlFile:    File | null;
  label:      string;
  category:   string;
  showNewCat: boolean;
}

async function generateThumbnail(
  file: File,
  ext: string,
  mtlFile?: File | null,
): Promise<{ thumb: string | null; animations: string[] }> {
  let blobUrl: string | null = null;
  let mtlBlobUrl: string | null = null;
  let animations: string[] = [];
  try {
    blobUrl = URL.createObjectURL(file);

    let root: import("three").Object3D;
    if (ext === ".obj") {
      const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
      const loader = new OBJLoader();

      if (mtlFile) {
        const { MTLLoader } = await import("three/addons/loaders/MTLLoader.js");
        const manager = new LoadingManager();
        manager.onError = () => {}; // silently ignore missing texture images
        mtlBlobUrl = URL.createObjectURL(mtlFile);
        const mtlLoader = new MTLLoader(manager);
        mtlLoader.setResourcePath(""); // textures won't resolve, but colors parse fine
        const materials = await mtlLoader.loadAsync(mtlBlobUrl);
        materials.preload();
        loader.setMaterials(materials);
      }

      root = await loader.loadAsync(blobUrl);
    } else if (ext === ".glb" || ext === ".gltf") {
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      const gltf = await new GLTFLoader().loadAsync(blobUrl) as {
        scene: import("three").Object3D;
        animations: { name: string }[];
      };
      root = gltf.scene;
      animations = gltf.animations.map(a => a.name);
    } else {
      return { thumb: null, animations };
    }

    return { thumb: renderModelThumbnail(root), animations };
  } catch (err) {
    console.warn("Thumbnail generation failed:", err);
    return { thumb: null, animations };
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    if (mtlBlobUrl) URL.revokeObjectURL(mtlBlobUrl);
  }
}

const OVERLAY: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 100,
  background: "rgba(0,0,0,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center",
};
const MODAL: React.CSSProperties = {
  background: "rgba(28,28,28,0.98)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8, width: 480, maxHeight: "85vh",
  display: "flex", flexDirection: "column",
  color: "#c0c0c0", fontFamily: "monospace", fontSize: 12,
};
const INPUT: React.CSSProperties = {
  background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 4, color: "#c0c0c0", fontFamily: "monospace", fontSize: 11,
  padding: "4px 7px", outline: "none", boxSizing: "border-box",
};
const BTN = (active = true): React.CSSProperties => ({
  padding: "7px 14px", borderRadius: 4, cursor: active ? "pointer" : "default",
  fontFamily: "monospace", fontSize: 11, border: "none",
  background: active ? "rgba(80,140,255,0.2)" : "rgba(55,55,55,0.7)",
  color: active ? "#80aaff" : "#646464",
});
const STEP_LABEL: React.CSSProperties = {
  color: "#8b94a8", fontSize: 10, letterSpacing: 1,
};

export function ModelImporterModal({ existingTags, existingAttributions, onComplete, onClose }: Props) {
  const [phase,      setPhase]      = useState<Phase>("pick");
  const [entries,    setEntries]    = useState<ModelEntry[]>([]);
  const [collidable,    setCollidable]    = useState(true);
  const [bulkNewCat,    setBulkNewCat]    = useState<string | null>(null);
  const [attribution,   setAttribution]   = useState<Attribution>({});
  const [tags,          setTags]          = useState<string[]>([]);
  const [progress,   setProgress]   = useState("");
  const [error,      setError]      = useState<string | null>(null);
  const [results,    setResults]    = useState<AssetDef[]>([]);
  const textureFilesRef = useRef<File[]>([]);
  const filesInputRef   = useRef<HTMLInputElement>(null);
  const mtlInputRef     = useRef<HTMLInputElement>(null);
  const mtlForEntryRef  = useRef<string | null>(null);

  function updateEntry(id: string, patch: Partial<ModelEntry>): void {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  }

  function onFilesChosen(list: FileList | null): void {
    const files = [...(list ?? [])];
    if (!files.length) return;

    // Separate models, mtl, and texture files
    const models   = files.filter(f => MODEL_EXTS.has(getExt(f.name)));
    const mtls     = files.filter(f => getExt(f.name) === ".mtl");
    const textures = files.filter(f => TEXTURE_EXTS.has(getExt(f.name)));

    if (!models.length) return;

    // Auto-pair OBJ files with MTL files by matching base name
    const mtlMap = new Map(mtls.map(f => [baseName(f.name), f]));

    const newEntries: ModelEntry[] = models.map(f => ({
      id:         crypto.randomUUID(),
      modelFile:  f,
      mtlFile:    getExt(f.name) === ".obj" ? (mtlMap.get(baseName(f.name)) ?? null) : null,
      label:      autoLabel(f.name),
      category:   "Props",
      showNewCat: false,
    }));

    textureFilesRef.current = textures;
    setEntries(newEntries);
    setPhase("meta");
  }

  function onMtlChosen(list: FileList | null): void {
    const f = list?.[0];
    const entryId = mtlForEntryRef.current;
    mtlForEntryRef.current = null;
    if (f && entryId) updateEntry(entryId, { mtlFile: f });
  }

  async function copyFile(src: File, dest: string): Promise<void> {
    await writeAssetFile("models", dest, await src.arrayBuffer());
  }

  async function doImport(): Promise<void> {
    if (!entries.length) return;
    setPhase("importing");
    setError(null);

    // Load manifest once
    const manifest = await readManifest<AssetManifest>("models", { version: "1.0", assets: [] });

    // Copy any texture images first (flat copy — MTL references them by filename)
    for (const texFile of textureFilesRef.current) {
      try { await copyFile(texFile, texFile.name); } catch { /* skip */ }
    }

    const imported: AssetDef[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      setProgress(`Importing ${i + 1} of ${entries.length}: ${entry.modelFile.name}`);
      try {
        const modelExt  = getExt(entry.modelFile.name);
        const base      = slugify(entry.label) || slugify(autoLabel(entry.modelFile.name));
        const destModel = `${base}${modelExt}`;
        await copyFile(entry.modelFile, destModel);

        let destMtl: string | undefined;
        if (modelExt === ".obj" && entry.mtlFile) {
          destMtl = `${base}.mtl`;
          await copyFile(entry.mtlFile, destMtl);
        }

        // Generate thumbnail
        setProgress(`Generating thumbnail ${i + 1} of ${entries.length}: ${entry.modelFile.name}`);
        let destThumb: string | undefined;
        const { thumb: thumbDataUrl, animations } = await generateThumbnail(entry.modelFile, modelExt, entry.mtlFile);
        if (thumbDataUrl) {
          destThumb = `${base}_thumb.png`;
          await writeAssetFile("models", destThumb, dataURLtoArrayBuffer(thumbDataUrl));
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
          // "animated" auto-seeds per entry (only models with discovered clips get
          // it, even in a mixed batch). Seed, not invariant — removable later.
          tags:         animations.length ? [...new Set([...tags, "animated"])] : [...tags],
          dateAdded:    new Date().toISOString().slice(0, 10),
          ...(animations.length ? { animations } : {}),
          ...(Object.keys(attribution).length ? { attribution } : {}),
        };

        manifest.assets = manifest.assets.filter(a => a.id !== asset.id);
        manifest.assets.push(asset);
        imported.push(asset);
      } catch (err) {
        console.warn(`Import failed for ${entry.modelFile.name}:`, err);
      }
    }
    releaseThumbnailRenderer();

    // Write manifest once after all imports
    try {
      await writeManifest("models", manifest);
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

        <input
          ref={filesInputRef} type="file" multiple style={{ display: "none" }}
          accept=".glb,.gltf,.obj,.mtl,.png,.jpg,.jpeg,.webp,.bmp"
          onChange={e => { onFilesChosen(e.currentTarget.files); e.currentTarget.value = ""; }}
        />
        <input
          ref={mtlInputRef} type="file" style={{ display: "none" }}
          accept=".mtl"
          onChange={e => { onMtlChosen(e.currentTarget.files); e.currentTarget.value = ""; }}
        />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
          <span style={{ fontSize: 13, color: "#d8d8d8", letterSpacing: 1 }}>IMPORT MODELS</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#585870", fontSize: 16 }}>✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Step 1 — Pick */}
          {phase === "pick" && (
            <>
              <p style={STEP_LABEL}>SELECT FILES</p>
              <div style={{ fontSize: 10, color: "#98a2b8", lineHeight: 1.7 }}>
                Supported: <span style={{ color: "#80aaff" }}>.glb .gltf .obj</span>
                — select multiple files at once. Pair <span style={{ color: "#80aaff" }}>.obj + .mtl</span> by selecting both; they're matched by base name.
                Also select any <span style={{ color: "#80aaff" }}>texture images</span> (.png .jpg …) referenced by the MTL — they'll be copied alongside the model.
              </div>
              <button style={BTN()} onClick={() => filesInputRef.current?.click()}>Browse files…</button>
            </>
          )}

          {/* Step 2 — Metadata list */}
          {(phase === "meta" || phase === "importing") && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={STEP_LABEL}>
                  {entries.length} MODEL{entries.length !== 1 ? "S" : ""}
                  {textureFilesRef.current.length > 0 && ` · ${textureFilesRef.current.length} TEXTURE${textureFilesRef.current.length !== 1 ? "S" : ""}`}
                </p>
                <button style={{ ...BTN(), padding: "3px 8px", fontSize: 10 }} onClick={() => setPhase("pick")}>← Change files</button>
              </div>

              {/* Set all categories */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, color: "#98a2b8", whiteSpace: "nowrap" }}>Set all to</span>
                  <select
                    style={{ ...INPUT, flex: 1, cursor: "pointer" }}
                    defaultValue=""
                    onChange={e => {
                      const val = e.currentTarget.value;
                      if (!val) return;
                      if (val === "__new__") {
                        setBulkNewCat("");
                        setEntries(prev => prev.map(en => ({ ...en, category: "__new__", showNewCat: false })));
                      } else {
                        setBulkNewCat(null);
                        setEntries(prev => prev.map(en => ({ ...en, category: val, showNewCat: false })));
                      }
                      e.currentTarget.value = "";
                    }}
                  >
                    <option value="" disabled>Category…</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="__new__">New category…</option>
                  </select>
                </div>
                {bulkNewCat !== null && (
                  <input
                    style={{ ...INPUT, width: "100%", boxSizing: "border-box" }}
                    placeholder="New category name (applies to all)"
                    autoFocus
                    value={bulkNewCat}
                    onChange={e => {
                      const val = e.currentTarget.value;
                      setBulkNewCat(val);
                      setEntries(prev => prev.map(en => ({ ...en, category: val || "__new__" })));
                    }}
                  />
                )}
              </div>

              {/* Tags (optional) — applies to all imported models */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 10, color: "#98a2b8" }}>Tags (optional — applies to all)</span>
                <TagInput value={tags} onChange={setTags} suggestions={existingTags} />
              </div>

              {/* Attribution (optional) — applies to all imported models */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 10, color: "#98a2b8" }}>Attribution (optional — applies to all)</span>
                <AttributionFields value={attribution} onChange={setAttribution} autofillFrom={existingAttributions} />
              </div>

              {/* Entry list */}
              {entries.map(entry => {
                const isOBJ = getExt(entry.modelFile.name) === ".obj";
                return (
                  <div key={entry.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 5, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
                    {/* File row */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, color: "#80aaff" }}>📄 {entry.modelFile.name}</span>
                      {isOBJ && (
                        entry.mtlFile
                          ? <span style={{ fontSize: 10, color: "#80cc90" }}>🎨 {entry.mtlFile.name}</span>
                          : (
                            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <span style={{ fontSize: 10, color: "#c09050" }}>⚠ no .mtl</span>
                              <button style={{ ...BTN(), padding: "1px 7px", fontSize: 9 }} onClick={() => { mtlForEntryRef.current = entry.id; mtlInputRef.current?.click(); }}>+ .mtl</button>
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
                        value={CATEGORIES.includes(entry.category as AssetCategory) ? entry.category : "__new__"}
                        onChange={e => {
                          setBulkNewCat(null);
                          updateEntry(entry.id, { category: e.currentTarget.value, showNewCat: e.currentTarget.value === "__new__" });
                        }}
                      >
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        <option value="__new__">
                          {!CATEGORIES.includes(entry.category as AssetCategory) && entry.category && entry.category !== "__new__"
                            ? entry.category
                            : "New…"}
                        </option>
                      </select>
                    </div>

                    {entry.showNewCat && bulkNewCat === null && (
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
                <span>Collidable (all) — auto box collider from model bounds</span>
              </label>

              {error && <div style={{ color: "#c06060", fontSize: 10 }}>{error}</div>}
              {phase === "importing" && <div style={{ color: "#98a2b8", fontSize: 10 }}>{progress}</div>}
            </>
          )}

          {/* Done */}
          {phase === "done" && (
            <>
              <p style={STEP_LABEL}>DONE</p>
              <div style={{ color: "#80cc90", fontSize: 11 }}>✓ &nbsp;{results.length} model{results.length !== 1 ? "s" : ""} imported.</div>
              {results.map(r => (
                <div key={r.id} style={{ fontSize: 10, color: "#98a2b8" }}>
                  {r.label} — <span style={{ color: "#98a2b8" }}>{r.path}</span>
                </div>
              ))}
              {error && <div style={{ color: "#c06060", fontSize: 10 }}>{error}</div>}
            </>
          )}
        </div>

        {/* Footer */}
        {(phase === "meta" || phase === "done") && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {phase === "meta" && (
              <button
                style={BTN()}
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
