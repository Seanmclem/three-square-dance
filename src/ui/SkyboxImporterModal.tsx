import { useState } from "react";
import type { SkyboxDef, SkyboxCategory, SkyboxManifest, Attribution } from "@/types";
import { AttributionFields } from "@/ui/AttributionFields";

interface Props {
  skyboxDir:      FileSystemDirectoryHandle | null;
  onSkyboxDirSet: (dir: FileSystemDirectoryHandle) => void;
  onComplete:     (skyboxes: SkyboxDef[]) => void;
  onClose:        () => void;
}

type Phase = "pick" | "meta" | "importing" | "done";

const CATEGORIES: SkyboxCategory[] = ["Day", "Sunset", "Night", "Space", "Studio", "Other"];
const IMG_EXTS = new Set([".jpg", ".jpeg", ".png", ".hdr"]);

type FSPicker = {
  showOpenFilePicker:  (opts: unknown) => Promise<FileSystemFileHandle[]>;
  showDirectoryPicker: (opts: unknown) => Promise<FileSystemDirectoryHandle>;
};

const getExt    = (n: string) => n.slice(n.lastIndexOf(".")).toLowerCase();
const slugify   = (s: string) => s.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
const autoLabel = (n: string) => n.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
const formatOf  = (n: string): SkyboxDef["format"] => getExt(n) === ".hdr" ? "hdr" : "ldr";

interface SkyboxEntry {
  id:       string;
  handle:   FileSystemFileHandle;
  label:    string;
  category: SkyboxCategory;
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

export function SkyboxImporterModal({ skyboxDir, onSkyboxDirSet, onComplete, onClose }: Props) {
  const [phase,    setPhase]    = useState<Phase>("pick");
  const [entries,  setEntries]  = useState<SkyboxEntry[]>([]);
  const [progress, setProgress] = useState("");
  const [results,  setResults]  = useState<SkyboxDef[]>([]);
  const [error,    setError]    = useState<string | null>(null);
  // Shared attribution applied to every skybox in this import batch (mirrors AudioImporter).
  const [attribution, setAttribution] = useState<Attribution>({});

  const update = (id: string, patch: Partial<SkyboxEntry>) =>
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));

  async function pickFiles(): Promise<void> {
    try {
      const handles = await (window as unknown as FSPicker).showOpenFilePicker({
        multiple: true,
        types: [{ description: "Equirectangular image", accept: {
          "image/*": [".jpg", ".jpeg", ".png"], "application/octet-stream": [".hdr"] } }],
      });
      const imgs = handles.filter(h => IMG_EXTS.has(getExt(h.name)));
      if (!imgs.length) return;
      setEntries(imgs.map(h => ({
        id: crypto.randomUUID(), handle: h, label: autoLabel(h.name), category: "Day",
      })));
      setPhase("meta");
    } catch { /* cancelled */ }
  }

  async function pickSkyboxDir(): Promise<void> {
    try {
      const dir = await (window as unknown as FSPicker).showDirectoryPicker({ mode: "readwrite" });
      onSkyboxDirSet(dir);
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
    if (!skyboxDir || !entries.length) return;
    setPhase("importing");
    setError(null);

    let manifest: SkyboxManifest = { version: "1.0", skyboxes: [] };
    try {
      const mh = await skyboxDir.getFileHandle("manifest.json");
      manifest = JSON.parse(await (await mh.getFile()).text()) as SkyboxManifest;
    } catch { /* new manifest */ }

    const imported: SkyboxDef[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      setProgress(`Importing ${i + 1} of ${entries.length}: ${e.handle.name}`);
      try {
        const ext  = getExt(e.handle.name);
        const base = slugify(e.label) || slugify(autoLabel(e.handle.name));
        const dest = `${base}${ext}`;
        await copyFile(e.handle, skyboxDir, dest);
        const skybox: SkyboxDef = {
          id: base, label: e.label.trim() || base, category: e.category,
          path: `/assets/skyboxes/${dest}`, format: formatOf(e.handle.name),
          tags: [], dateAdded: new Date().toISOString().slice(0, 10),
          ...(Object.keys(attribution).length ? { attribution } : {}),
        };
        manifest.skyboxes = manifest.skyboxes.filter(s => s.id !== skybox.id);
        manifest.skyboxes.push(skybox);
        imported.push(skybox);
      } catch (err) {
        console.warn(`Import failed for ${e.handle.name}:`, err);
      }
    }

    try {
      const mw = await skyboxDir.getFileHandle("manifest.json", { create: true });
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
          <span style={{ fontSize: 13, color: "#d8d8d8", letterSpacing: 1 }}>IMPORT SKYBOXES</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#585870", fontSize: 16 }}>✕</button>
        </div>

        <div style={{ padding: 20, overflowY: "auto" }}>
          {phase === "pick" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ color: "#909090", lineHeight: 1.5 }}>
                Pick one or more <b>equirectangular</b> images (.jpg / .png / .hdr, 2:1 aspect).
                They'll be copied into your project's <code>assets/skyboxes</code> folder and
                added to the skybox manifest. HDR gives the best image-based lighting.
              </div>
              <button onClick={pickFiles} style={BTN()}>Choose image files…</button>
            </div>
          )}

          {phase === "meta" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {entries.map(e => (
                <div key={e.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 10, background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                  <div style={{ color: "#707070", fontSize: 10 }}>{e.handle.name} · {formatOf(e.handle.name).toUpperCase()}</div>
                  <input value={e.label} onChange={ev => update(e.id, { label: ev.target.value })} placeholder="Label" style={INPUT} />
                  <select value={e.category} onChange={ev => update(e.id, { category: ev.target.value as SkyboxCategory })} style={{ ...INPUT }}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ))}

              <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 10 }}>
                <div style={{ color: "#909090", fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>
                  ATTRIBUTION (optional — applied to all, shown in Credits)
                </div>
                <AttributionFields value={attribution} onChange={setAttribution} />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <button onClick={pickSkyboxDir} style={BTN(!skyboxDir)}>
                  {skyboxDir ? "✓ assets/skyboxes folder granted" : "Grant assets/skyboxes folder…"}
                </button>
              </div>
              {!skyboxDir && (
                <div style={{ color: "#707070", fontSize: 10, lineHeight: 1.4 }}>
                  Select your project's <code>public/assets/skyboxes</code> folder so the files can be written.
                </div>
              )}

              <button onClick={doImport} disabled={!skyboxDir} style={{ ...BTN(!!skyboxDir), marginTop: 4 }}>
                Import {entries.length} skybox{entries.length !== 1 ? "es" : ""}
              </button>
            </div>
          )}

          {phase === "importing" && (
            <div style={{ color: "#909090" }}>{progress || "Importing…"}</div>
          )}

          {phase === "done" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {error && <div style={{ color: "#ff6b6b" }}>{error}</div>}
              <div style={{ color: "#66cc88" }}>Imported {results.length} skybox{results.length !== 1 ? "es" : ""}.</div>
              {results.map(s => <div key={s.id} style={{ color: "#909090", fontSize: 11 }}>• {s.label} ({s.category})</div>)}
              <button onClick={onClose} style={{ ...BTN(), marginTop: 4 }}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
