import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeClose } from "./useEscapeClose";
import { desktop } from "@/shared/desktopApi";
import { shapesToPrintMesh } from "@/editor/printExportShapes";
import { printSizeMeters, toPrinterFrame, write3MF, writeSTL, isWatertight } from "@/editor/printExport";
import type { ShapeDef } from "@/types";

/** Bambu X1 / P1 / A1 build volume; the A1 mini is 180 mm. */
const BED_MM = 256;
const KEY = "printExportSettings";
type Settings = { mode: "longest" | "scale"; longest: number; scale: number; format: "3mf" | "stl" };

function loadSettings(): Settings {
  const d: Settings = { mode: "longest", longest: 100, scale: 50, format: "3mf" };
  try { return { ...d, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings> }; } catch { return d; }
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Export for 3D printing (v4.107.0): the selected shapes as one 3MF (mm, Bambu's own
 * format) or STL, sized by "longest side" or "1 m = N mm", saved to Downloads and,
 * on the desktop, opened in Bambu Studio. Editor meters / Y-up become printer mm / Z-up.
 */
export function PrintExportDialog({ shapes, onClose }: { shapes: ShapeDef[]; onClose: () => void }) {
  useEscapeClose(onClose);
  const [s, setS] = useState<Settings>(loadSettings);
  const [name, setName] = useState(() => (shapes.length === 1 ? (shapes[0]!.label ?? shapes[0]!.id) : "model").replace(/\s+/g, "_"));
  const [result, setResult] = useState<{ text: string; path?: string; error?: boolean } | null>(null);
  const mesh = useMemo(() => shapesToPrintMesh(shapes), [shapes]);
  const meters = useMemo(() => printSizeMeters(mesh), [mesh]);
  const watertight = useMemo(() => isWatertight(mesh), [mesh]);
  const longestM = Math.max(meters.x, meters.y, meters.z) || 1;
  const mmPerM = s.mode === "longest" ? s.longest / longestM : s.scale;
  const mm = { x: meters.x * mmPerM, y: meters.y * mmPerM, z: meters.z * mmPerM };
  const tooBig = Math.max(mm.x, mm.y, mm.z) > BED_MM;
  const tooSmall = Math.min(mm.x, mm.y, mm.z) < 2;
  const update = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    setS(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  };
  const d = desktop();

  const save = async (openAfter: boolean) => {
    setResult(null);
    if (!(mmPerM > 0) || !mesh.indices.length) { setResult({ text: "Nothing to export.", error: true }); return; }
    const p = toPrinterFrame(mesh, mmPerM);
    const bytes = s.format === "3mf" ? write3MF(p, name) : writeSTL(p);
    if (!d) {
      // Plain browser: a normal download.
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/octet-stream" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `${name}.${s.format}` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setResult({ text: `Downloaded ${name}.${s.format}.` });
      return;
    }
    try {
      const { path } = await d.writePrintFile(name, s.format, toBase64(bytes));
      if (openAfter) {
        const r = await d.openInSlicer(path, "bambu");
        setResult(r.ok ? { text: `Saved and opened in Bambu Studio: ${path}`, path } : { text: `Saved to ${path}, but ${r.error}`, path, error: true });
      } else setResult({ text: `Saved to ${path}`, path });
    } catch (e) {
      const msg = (e as Error).message;
      setResult({ text: /unknown api method|HTTP 404/.test(msg) ? "Restart the app once to finish installing 3D print export, then try again." : `Couldn't save: ${msg}`, error: true });
    }
  };

  const f = (v: number) => (v >= 100 ? v.toFixed(0) : v.toFixed(1));
  const label: React.CSSProperties = { color: "#c2cadb", fontSize: 10, letterSpacing: 1, fontFamily: "monospace" };
  const seg = (on: boolean): React.CSSProperties => ({
    flex: 1, padding: "5px 0", cursor: "pointer", fontFamily: "monospace", fontSize: 11, borderRadius: 4,
    border: `1px solid ${on ? "rgba(80,140,255,0.55)" : "rgba(255,255,255,0.12)"}`,
    background: on ? "rgba(80,140,255,0.22)" : "rgba(46,46,46,0.9)", color: on ? "#9dbdff" : "#dde3f0",
  });
  const input: React.CSSProperties = { width: 72, padding: "3px 6px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.15)", background: "#141416", color: "#dde3f0", fontFamily: "monospace", fontSize: 12 };
  const btn = (primary = false): React.CSSProperties => ({
    padding: "7px 12px", borderRadius: 5, cursor: "pointer", fontFamily: "monospace", fontSize: 11,
    border: `1px solid ${primary ? "rgba(60,207,145,0.6)" : "rgba(255,255,255,0.15)"}`,
    background: primary ? "rgba(60,207,145,0.15)" : "rgba(46,46,46,0.9)", color: primary ? "#7fe0b5" : "#dde3f0",
  });

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 400, background: "#1c1c1e", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: 18, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.6)", fontFamily: "system-ui, sans-serif", color: "#dde3f0" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={{ color: "#80aaff", fontFamily: "monospace", fontSize: 12, letterSpacing: 1, flex: 1 }}>EXPORT FOR 3D PRINTING</span>
          <button onClick={onClose} style={{ ...btn(), padding: "2px 8px" }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: "#c2cadb" }}>
          {shapes.length === 1 ? "1 shape" : `${shapes.length} shapes`} · in the editor {f(meters.x)} × {f(meters.y)} × {f(meters.z)} m (width × depth × height)
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={label}>PRINTED SIZE</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button style={seg(s.mode === "longest")} onClick={() => update({ mode: "longest" })}>LONGEST SIDE</button>
            <button style={seg(s.mode === "scale")} onClick={() => update({ mode: "scale" })}>SCALE</button>
          </div>
          {s.mode === "longest" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              Longest side <input type="number" min={1} step={5} value={s.longest} style={input} onChange={e => update({ longest: Math.max(0, parseFloat(e.target.value) || 0) })} /> mm
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              1 m in the editor = <input type="number" min={0.1} step={5} value={s.scale} style={input} onChange={e => update({ scale: Math.max(0, parseFloat(e.target.value) || 0) })} /> mm
            </div>
          )}
          <div style={{ fontFamily: "monospace", fontSize: 13, color: tooBig ? "#ff9b8a" : "#7fe0b5" }}>
            {f(mm.x)} × {f(mm.y)} × {f(mm.z)} mm
          </div>
          {tooBig && <div style={{ color: "#ff9b8a", fontSize: 11 }}>Bigger than a Bambu bed ({BED_MM} × {BED_MM} × {BED_MM} mm). Make it smaller, or split it in the slicer.</div>}
          {tooSmall && !tooBig && <div style={{ color: "#ffb86b", fontSize: 11 }}>Under 2 mm on one side: that part may not print well.</div>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={label}>FILE</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button style={seg(s.format === "3mf")} onClick={() => update({ format: "3mf" })} title="Bambu Studio's own format; states millimeters inside the file">3MF (Bambu)</button>
            <button style={seg(s.format === "stl")} onClick={() => update({ format: "stl" })} title="Works in any slicer; has no units, slicers read millimeters">STL</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            Name <input value={name} onChange={e => setName(e.target.value)} style={{ ...input, flex: 1, width: "auto" }} />.{s.format}
          </div>
          {!watertight && <div style={{ color: "#ffb86b", fontSize: 11 }}>Some surfaces aren't fully closed; the slicer will try to repair them.</div>}
        </div>

        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button style={btn()} onClick={() => void save(false)}>{d ? "Save to Downloads" : "Download"}</button>
          {d && <button style={btn(true)} onClick={() => void save(true)}>Save and open in Bambu Studio</button>}
        </div>
        {result && (
          <div style={{ fontSize: 11, color: result.error ? "#ff9b8a" : "#c2cadb", display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ flex: 1, wordBreak: "break-all" }}>{result.text}</span>
            {result.path && d && <button style={{ ...btn(), padding: "3px 8px" }} onClick={() => void d.revealPath(result.path!)}>Show in Finder</button>}
          </div>
        )}
        <div style={{ color: "#98a2b8", fontSize: 10, lineHeight: 1.5 }}>
          Just the shape: colors and textures aren't exported. The model is turned so the editor's up is the printer's up, and set on the bed.
        </div>
      </div>
    </div>,
    document.body,
  );
}
