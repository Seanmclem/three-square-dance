import { useState, useEffect } from "react";
import type { SkyboxDef } from "@/types";

interface SkyboxBrowserProps {
  skyboxes:         SkyboxDef[];
  selectedId:       string;                 // WorldConfig.skybox — "sky" = procedural
  onSelect:         (id: string) => void;
  onImport:         () => void;
  onDeleteSkyboxes: (ids: string[]) => void;
  onEdit:           (ids: string[]) => void;
}

const catOf = (s: SkyboxDef) => s.category ?? "Other";

export function SkyboxBrowser({ skyboxes, selectedId, onSelect, onImport, onDeleteSkyboxes, onEdit }: SkyboxBrowserProps) {
  const [search,  setSearch]  = useState("");
  const [cat,     setCat]     = useState<string>("All");
  const [manage,  setManage]  = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const exitManage  = () => { setManage(false); setChecked(new Set()); };
  const toggleCheck = (id: string) =>
    setChecked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  useEffect(() => {
    setChecked(prev => {
      const ids = new Set(skyboxes.map(s => s.id));
      const next = new Set([...prev].filter(id => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [skyboxes]);

  const cats = ["All", ...[...new Set(skyboxes.map(catOf))].sort()];
  const filtered = skyboxes.filter(s => {
    const matchCat = cat === "All" || catOf(s) === cat;
    const q = search.toLowerCase();
    return matchCat && (!q || s.label.toLowerCase().includes(q));
  });

  const pill = (c: string) => (
    <button key={c} onClick={() => setCat(c)} style={{
      padding: "2px 8px", borderRadius: 10, fontSize: 10, cursor: "pointer",
      background: cat === c ? "rgba(80,140,255,0.2)" : "rgba(255,255,255,0.04)",
      border: `1px solid ${cat === c ? "rgba(80,140,255,0.35)" : "rgba(255,255,255,0.07)"}`,
      color: cat === c ? "#80aaff" : "#808080",
    }}>{c}</button>
  );

  // A tile: procedural "sky" (swatch) or an image skybox (thumbnail). In manage mode,
  // clicking an image tile toggles its checkbox instead of selecting it. The procedural
  // tile is never manageable (it's built in), so it's hidden while managing.
  const tile = (id: string, label: string, sub: string, bg: React.CSSProperties, manageable: boolean) => {
    const sel = manageable && manage ? checked.has(id) : id === selectedId;
    const del = manageable && manage && sel;
    return (
      <button key={id} title={label}
        onClick={() => (manageable && manage) ? toggleCheck(id) : onSelect(id)}
        style={{
          background: del ? "rgba(200,60,60,0.18)" : sel ? "rgba(80,140,255,0.15)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${del ? "rgba(200,60,60,0.5)" : sel ? "rgba(80,140,255,0.55)" : "rgba(255,255,255,0.05)"}`,
          borderRadius: 4, cursor: "pointer", padding: 2, position: "relative",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 2, overflow: "hidden", minHeight: 78,
        }}>
        <div style={{ width: "100%", aspectRatio: "2 / 1", borderRadius: 3, ...bg }} />
        {manageable && manage && (
          <span style={{ position: "absolute", top: 4, left: 4, width: 14, height: 14, borderRadius: 3, fontSize: 10,
            display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
            background: sel ? "rgba(200,60,60,0.9)" : "rgba(20,20,20,0.8)",
            border: `1px solid ${sel ? "rgba(255,140,140,0.8)" : "rgba(255,255,255,0.3)"}` }}>{sel ? "✓" : ""}</span>
        )}
        <span style={{ fontSize: 8, color: sel && !del ? "#80aaff" : "#909090",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%", textAlign: "center" }}>
          {label}<span style={{ color: "#606060" }}>{sub ? ` · ${sub}` : ""}</span>
        </span>
      </button>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ padding: "8px 8px 6px", flexShrink: 0 }}>
        <input type="text" placeholder="Search…" value={search}
          onChange={e => setSearch(e.currentTarget.value)}
          style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, color: "#d8d8d8",
            fontSize: 11, padding: "4px 6px", outline: "none" }} />
      </div>

      <div style={{ padding: "0 8px 4px", flexShrink: 0, display: "flex", flexWrap: "wrap", gap: 4 }}>
        {cats.map(pill)}
      </div>

      <div style={{ padding: "6px 8px", flexShrink: 0, display: "flex", gap: 4 }}>
        {!manage ? (
          <>
            <button onClick={onImport} style={{ flex: 1, padding: "5px 0", background: "rgba(80,140,255,0.12)",
              border: "1px solid rgba(80,140,255,0.25)", borderRadius: 4, cursor: "pointer",
              color: "#80aaff", fontSize: 10, letterSpacing: 0.5 }}>+ Import Skybox</button>
            {skyboxes.length > 0 && (
              <button onClick={() => setManage(true)} style={{ flexShrink: 0, padding: "5px 10px",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 4, cursor: "pointer", color: "#808080", fontSize: 10 }}>Manage</button>
            )}
          </>
        ) : (
          <>
            <button onClick={() => { if (checked.size) onEdit([...checked]); }} disabled={checked.size === 0}
              style={{ flex: 1, padding: "5px 0",
                background: checked.size ? "rgba(80,140,255,0.12)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${checked.size ? "rgba(80,140,255,0.3)" : "rgba(255,255,255,0.07)"}`,
                borderRadius: 4, cursor: checked.size ? "pointer" : "default",
                color: checked.size ? "#80aaff" : "#555", fontSize: 10 }}>
              Edit{checked.size ? ` (${checked.size})` : ""}</button>
            <button onClick={() => { if (checked.size) onDeleteSkyboxes([...checked]); }} disabled={checked.size === 0}
              style={{ flex: 1, padding: "5px 0",
                background: checked.size ? "rgba(200,60,60,0.15)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${checked.size ? "rgba(200,60,60,0.35)" : "rgba(255,255,255,0.07)"}`,
                borderRadius: 4, cursor: checked.size ? "pointer" : "default",
                color: checked.size ? "#cc6666" : "#555", fontSize: 10 }}>
              Delete{checked.size ? ` (${checked.size})` : ""}</button>
            <button onClick={exitManage} style={{ flexShrink: 0, padding: "5px 10px",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 4, cursor: "pointer", color: "#808080", fontSize: 10 }}>Done</button>
          </>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 8px",
        display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 4, alignContent: "start" }}>
        {/* Built-in procedural sky — always first, hidden while managing imports. */}
        {!manage && tile("sky", "Procedural Sky", "built-in", {
          background: "linear-gradient(#87ceeb, #cfe8f5 55%, #b9d8ea)",
        }, false)}
        {filtered.map(s => tile(s.id, s.label, s.format.toUpperCase(), {
          backgroundColor: "#2a2a30",
          backgroundImage: `url("${s.thumbnail ?? s.path}")`,
          backgroundSize: "cover", backgroundPosition: "center",
        }, true))}
        {skyboxes.length === 0 && (
          <div style={{ gridColumn: "1/-1", color: "#505050", fontSize: 10, textAlign: "center", paddingTop: 12 }}>
            Import an equirectangular image (JPG/PNG/HDR) to add a skybox.
          </div>
        )}
      </div>
    </div>
  );
}
