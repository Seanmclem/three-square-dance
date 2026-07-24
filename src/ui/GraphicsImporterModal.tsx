import { useState } from "react";
import type { GraphicDef, GraphicsManifest, Attribution } from "@/types";
import { AttributionFields } from "@/ui/AttributionFields";

interface Props {
  graphicsDir:      FileSystemDirectoryHandle | null;
  onGraphicsDirSet: (dir: FileSystemDirectoryHandle) => void;
  onComplete:       (graphics: GraphicDef[]) => void;
  onClose:          () => void;
}

type Phase = "pick" | "meta" | "importing" | "done";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

type FSPicker = {
  showOpenFilePicker:  (opts: unknown) => Promise<FileSystemFileHandle[]>;
  showDirectoryPicker: (opts: unknown) => Promise<FileSystemDirectoryHandle>;
};

const getExt    = (n: string) => n.slice(n.lastIndexOf(".")).toLowerCase();
const slugify   = (s: string) => s.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
const autoLabel = (n: string) => n.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");

interface GraphicEntry {
  id:     string;
  handle: FileSystemFileHandle;
  label:  string;
}

const OVERLAY: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center",
};
const MODAL: React.CSSProperties = {
  background: "rgba(28,28,28,0.98)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8, width: 480, maxHeight: "85vh", display: "flex", flexDirection: "column",
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

export function GraphicsImporterModal({ graphicsDir, onGraphicsDirSet, onComplete, onClose }: Props) {
  const [phase,    setPhase]    = useState<Phase>("pick");
  const [entries,  setEntries]  = useState<GraphicEntry[]>([]);
  const [progress, setProgress] = useState("");
  const [results,  setResults]  = useState<GraphicDef[]>([]);
  const [error,    setError]    = useState<string | null>(null);
  // One shared category for the whole batch — icon packs share a category.
  const [category, setCategory] = useState("Icons");
  // Shared attribution applied to every graphic in this import batch.
  const [attribution, setAttribution] = useState<Attribution>({});

  const update = (id: string, patch: Partial<GraphicEntry>) =>
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));

  async function pickFiles(): Promise<void> {
    try {
      const handles = await (window as unknown as FSPicker).showOpenFilePicker({
        multiple: true,
        types: [{ description: "Images", accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp"] } }],
      });
      const images = handles.filter(h => IMAGE_EXTS.has(getExt(h.name)));
      if (!images.length) return;
      setEntries(images.map(h => ({ id: crypto.randomUUID(), handle: h, label: autoLabel(h.name) })));
      setPhase("meta");
    } catch { /* cancelled */ }
  }

  async function pickGraphicsDir(): Promise<void> {
    try {
      const dir = await (window as unknown as FSPicker).showDirectoryPicker({ mode: "readwrite" });
      onGraphicsDirSet(dir);
    } catch { /* cancelled */ }
  }

  // Returns the copied bytes so dimensions can be decoded without re-reading the
  // source File (whose snapshot can be invalidated by the write on some setups).
  async function copyFile(src: FileSystemFileHandle, dir: FileSystemDirectoryHandle, dest: string): Promise<ArrayBuffer> {
    const file = await src.getFile();
    const buf  = await file.arrayBuffer();
    const dh   = await dir.getFileHandle(dest, { create: true });
    const w    = await dh.createWritable();
    await w.write(buf);
    await w.close();
    return buf;
  }

  async function doImport(): Promise<void> {
    if (!graphicsDir || !entries.length) return;
    setPhase("importing");
    setError(null);

    let manifest: GraphicsManifest = { version: "1.0", graphics: [] };
    try {
      const mh = await graphicsDir.getFileHandle("manifest.json");
      manifest = JSON.parse(await (await mh.getFile()).text()) as GraphicsManifest;
    } catch { /* new manifest */ }

    const imported: GraphicDef[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      setProgress(`Importing ${i + 1} of ${entries.length}: ${e.handle.name}`);
      try {
        const ext  = getExt(e.handle.name);
        const base = slugify(e.label) || slugify(autoLabel(e.handle.name));
        const dest = `${base}${ext}`;
        const buf = await copyFile(e.handle, graphicsDir, dest);
        // Intrinsic size — shown in tooltips and useful as a GUI default.
        let width: number | undefined, height: number | undefined;
        try {
          const bmp = await createImageBitmap(new Blob([buf]));
          width = bmp.width; height = bmp.height;
          bmp.close();
        } catch { /* unreadable image — keep it anyway */ }
        const graphic: GraphicDef = {
          id: base, label: e.label.trim() || base,
          category: category.trim() || "Icons",
          path: `/assets/graphics/${dest}`,
          ...(width !== undefined ? { width, height } : {}),
          ...(Object.keys(attribution).length ? { attribution } : {}),
        };
        manifest.graphics = manifest.graphics.filter(g => g.id !== graphic.id);
        manifest.graphics.push(graphic);
        imported.push(graphic);
      } catch (err) {
        console.warn(`Import failed for ${e.handle.name}:`, err);
      }
    }

    try {
      const mw = await graphicsDir.getFileHandle("manifest.json", { create: true });
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
          <span style={{ fontSize: 13, color: "#d8d8d8", letterSpacing: 1 }}>IMPORT GRAPHICS</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#585870", fontSize: 16 }}>✕</button>
        </div>

        <div style={{ padding: 20, overflowY: "auto" }}>
          {phase === "pick" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ color: "#909090", lineHeight: 1.5 }}>
                Pick one or more images (.png / .jpg / .webp — PNGs with transparent
                backgrounds work best for icons). They'll be copied into your project's
                <code> assets/graphics</code> folder and added to the graphics manifest.
              </div>
              <button onClick={pickFiles} style={BTN()}>Choose image files…</button>
            </div>
          )}

          {phase === "meta" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {entries.map(e => (
                <div key={e.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 10, background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                  <div style={{ color: "#707070", fontSize: 10 }}>{e.handle.name}</div>
                  <input value={e.label} onChange={ev => update(e.id, { label: ev.target.value })} placeholder="Label" style={INPUT} />
                </div>
              ))}

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#909090" }}>
                Category
                <input value={category} onChange={ev => setCategory(ev.target.value)} placeholder="Icons"
                  style={{ ...INPUT, flex: 1 }} />
              </label>

              <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 10 }}>
                <div style={{ color: "#909090", fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>
                  ATTRIBUTION (optional — applied to all, shown in Credits)
                </div>
                <AttributionFields value={attribution} onChange={setAttribution} />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <button onClick={pickGraphicsDir} style={BTN(!graphicsDir)}>
                  {graphicsDir ? "✓ assets/graphics folder granted" : "Grant assets/graphics folder…"}
                </button>
              </div>
              {!graphicsDir && (
                <div style={{ color: "#707070", fontSize: 10, lineHeight: 1.4 }}>
                  Select your project's <code>public/assets/graphics</code> folder so the files can be written.
                </div>
              )}

              <button onClick={doImport} disabled={!graphicsDir} style={{ ...BTN(!!graphicsDir), marginTop: 4 }}>
                Import {entries.length} graphic{entries.length !== 1 ? "s" : ""}
              </button>
            </div>
          )}

          {phase === "importing" && (
            <div style={{ color: "#909090" }}>{progress || "Importing…"}</div>
          )}

          {phase === "done" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {error && <div style={{ color: "#ff6b6b" }}>{error}</div>}
              <div style={{ color: "#66cc88" }}>Imported {results.length} graphic{results.length !== 1 ? "s" : ""}.</div>
              {results.map(g => (
                <div key={g.id} style={{ color: "#909090", fontSize: 11 }}>
                  • {g.label}{g.width && g.height ? ` (${g.width}×${g.height})` : ""}
                </div>
              ))}
              <button onClick={onClose} style={{ ...BTN(), marginTop: 4 }}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
