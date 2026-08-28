import { useEscapeClose } from "./useEscapeClose";
import { useState, useRef } from "react";
import type { GraphicDef, GraphicsManifest, Attribution } from "@/types";
import { readManifest, writeManifest, writeAssetFile } from "@/assets/assetLibrary";
import { AttributionFields } from "@/ui/AttributionFields";

interface Props {
  onComplete:       (graphics: GraphicDef[]) => void;
  onClose:          () => void;
}

type Phase = "pick" | "meta" | "importing" | "done";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const getExt    = (n: string) => n.slice(n.lastIndexOf(".")).toLowerCase();
const slugify   = (s: string) => s.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
const autoLabel = (n: string) => n.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");

interface GraphicEntry {
  id:    string;
  file:  File;
  label: string;
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

export function GraphicsImporterModal({ onComplete, onClose }: Props) {
  useEscapeClose(onClose);
  const [phase,    setPhase]    = useState<Phase>("pick");
  const [entries,  setEntries]  = useState<GraphicEntry[]>([]);
  const [progress, setProgress] = useState("");
  const [results,  setResults]  = useState<GraphicDef[]>([]);
  const [error,    setError]    = useState<string | null>(null);
  // One shared category for the whole batch — icon packs share a category.
  const [category, setCategory] = useState("Icons");
  // Shared attribution applied to every graphic in this import batch.
  const [attribution, setAttribution] = useState<Attribution>({});
  const filesInputRef = useRef<HTMLInputElement>(null);

  const update = (id: string, patch: Partial<GraphicEntry>) =>
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));

  function onFilesChosen(list: FileList | null): void {
    const images = [...(list ?? [])].filter(f => IMAGE_EXTS.has(getExt(f.name)));
    if (!images.length) return;
    setEntries(images.map(f => ({ id: crypto.randomUUID(), file: f, label: autoLabel(f.name) })));
    setPhase("meta");
  }

  async function doImport(): Promise<void> {
    if (!entries.length) return;
    setPhase("importing");
    setError(null);

    const manifest = await readManifest<GraphicsManifest>("graphics", { version: "1.0", graphics: [] });

    const imported: GraphicDef[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      setProgress(`Importing ${i + 1} of ${entries.length}: ${e.file.name}`);
      try {
        const ext  = getExt(e.file.name);
        const base = slugify(e.label) || slugify(autoLabel(e.file.name));
        const dest = `${base}${ext}`;
        const buf  = await e.file.arrayBuffer();
        await writeAssetFile("graphics", dest, buf);
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
        console.warn(`Import failed for ${e.file.name}:`, err);
      }
    }

    try {
      await writeManifest("graphics", manifest);
    } catch (err) {
      setError(`Manifest write failed: ${String(err)}`);
    }

    setResults(imported);
    setPhase("done");
    onComplete(imported);
  }

  return (
    <div style={OVERLAY}>
      <div style={MODAL}>
        <input
          ref={filesInputRef} type="file" multiple style={{ display: "none" }}
          accept="image/*,.png,.jpg,.jpeg,.webp"
          onChange={e => { onFilesChosen(e.currentTarget.files); e.currentTarget.value = ""; }}
        />
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
              <button onClick={() => filesInputRef.current?.click()} style={BTN()}>Choose image files…</button>
            </div>
          )}

          {phase === "meta" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {entries.map(e => (
                <div key={e.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 10, background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                  <div style={{ color: "#98a2b8", fontSize: 10 }}>{e.file.name}</div>
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

              <button onClick={doImport} style={{ ...BTN(), marginTop: 4 }}>
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
