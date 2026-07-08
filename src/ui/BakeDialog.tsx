import { useState } from "react";

interface BakeDialogProps {
  shapeCount: number;
  onConfirm: (opts: { name: string; toLibrary: boolean; toFile: boolean }) => void;
  onCancel:  () => void;
}

const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Bake-to-GLB options (Phase 26): asset name + where the result goes. Both
 * destinations default ON; at least one must be checked to confirm. The source
 * shapes are never modified.
 */
export function BakeDialog({ shapeCount, onConfirm, onCancel }: BakeDialogProps) {
  const [name, setName]           = useState("baked-structure");
  const [toLibrary, setToLibrary] = useState(true);
  const [toFile, setToFile]       = useState(true);

  const slug = slugify(name);
  const ok = !!slug && (toLibrary || toFile);
  const confirm = () => { if (ok) onConfirm({ name: slug, toLibrary, toFile }); };

  const check = (label: string, hint: string, value: boolean, set: (v: boolean) => void) => (
    <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", color: "#c0c0c0", fontSize: 11 }}>
      <input type="checkbox" checked={value} onChange={e => set(e.target.checked)} style={{ marginTop: 1 }} />
      <span>
        {label}
        <span style={{ display: "block", color: "#646464", fontSize: 9.5, lineHeight: 1.35 }}>{hint}</span>
      </span>
    </label>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 60,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.6)",
    }}>
      <div style={{
        background: "rgba(28,28,28,0.99)", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8, padding: "20px 24px", width: 320,
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        display: "flex", flexDirection: "column", gap: 14, fontFamily: "monospace",
      }}>
        <div style={{ color: "#c0c0c0", fontSize: 13, letterSpacing: 1 }}>
          BAKE {shapeCount} SHAPE{shapeCount === 1 ? "" : "S"} → GLB
        </div>
        <div style={{ color: "#646464", fontSize: 10, lineHeight: 1.4 }}>
          Merges the selection into one model per material. The original shapes are kept.
        </div>

        <div>
          <div style={{ color: "#646464", fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>NAME</div>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") confirm(); if (e.key === "Escape") onCancel(); }}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 4, color: "#d8d8d8", fontSize: 12, padding: "6px 8px",
              outline: "none", fontFamily: "monospace",
            }}
          />
          {slug && slug !== name && (
            <div style={{ color: "#646464", fontSize: 9, marginTop: 3 }}>file: {slug}.glb</div>
          )}
        </div>

        {check("Add to asset library", "Registers it in the Asset Browser (writes into your assets/models folder) so you can place copies immediately.", toLibrary, setToLibrary)}
        {check("Save .glb file locally", "Save a copy wherever you like — standard glTF binary, opens in Blender & co.", toFile, setToFile)}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "6px 14px", borderRadius: 4, cursor: "pointer",
              background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
              color: "#646464", fontSize: 11, fontFamily: "monospace",
            }}
          >Cancel</button>
          <button
            onClick={confirm}
            disabled={!ok}
            style={{
              padding: "6px 14px", borderRadius: 4, cursor: ok ? "pointer" : "default",
              background: ok ? "rgba(80,140,255,0.2)" : "rgba(46,46,46,0.5)",
              border: `1px solid ${ok ? "rgba(80,140,255,0.4)" : "rgba(255,255,255,0.06)"}`,
              color: ok ? "#80aaff" : "#404050",
              fontSize: 11, fontFamily: "monospace",
            }}
          >Bake</button>
        </div>
      </div>
    </div>
  );
}
