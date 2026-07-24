import { useState } from "react";
import type { GraphicDef } from "@/types";
import { MaterialCategoryPills, orderedMaterialCategories } from "@/ui/materialCategories";
import { assetManager } from "@/core/AssetManager";

interface GraphicsBrowserProps {
  graphics: GraphicDef[];
  onImport: () => void;
}

const catOf = (g: GraphicDef) => g.category ?? "Other";

// Checkerboard backdrop so transparent PNGs read correctly (DecalBrowser precedent).
const checkerTile = (path: string): React.CSSProperties => ({
  width: "100%", aspectRatio: "1", borderRadius: 3,
  backgroundColor: "#4a4a4a",
  backgroundImage: `linear-gradient(45deg, #3a3a3a 25%, transparent 25%, transparent 75%, #3a3a3a 75%), linear-gradient(45deg, #3a3a3a 25%, transparent 25%, transparent 75%, #3a3a3a 75%), url("${assetManager.resolveUrl(path)}")`,
  backgroundSize: "12px 12px, 12px 12px, contain",
  backgroundPosition: "0 0, 6px 6px, center",
  backgroundRepeat: "repeat, repeat, no-repeat",
});

export function GraphicsBrowser({ graphics, onImport }: GraphicsBrowserProps) {
  const [search, setSearch] = useState("");
  const [cat,    setCat]    = useState<string>("All");

  const orderedCats = orderedMaterialCategories([...new Set(graphics.map(catOf))]);
  const q = search.toLowerCase();
  const filtered = graphics.filter(g =>
    (cat === "All" || catOf(g) === cat) && (!q || g.label.toLowerCase().includes(q)));

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ padding: "8px 8px 6px", flexShrink: 0 }}>
        <input type="text" placeholder="Search…" value={search}
          onChange={e => setSearch(e.currentTarget.value)}
          style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, color: "#d8d8d8",
            fontSize: 11, padding: "4px 6px", outline: "none" }} />
      </div>

      <div style={{ padding: "0 8px 4px", flexShrink: 0 }}>
        <MaterialCategoryPills categories={orderedCats} active={cat} onSelect={setCat} />
      </div>

      <div style={{ padding: "6px 8px", flexShrink: 0, display: "flex", gap: 4 }}>
        <button onClick={onImport} style={{ flex: 1, padding: "5px 0", background: "rgba(80,140,255,0.12)",
          border: "1px solid rgba(80,140,255,0.25)", borderRadius: 4, cursor: "pointer",
          color: "#80aaff", fontSize: 10, letterSpacing: 0.5 }}>+ Import Graphics</button>
      </div>

      <div style={{ padding: "0 8px 6px", flexShrink: 0, color: "#606070", fontSize: 9, fontFamily: "monospace", lineHeight: 1.4 }}>
        2D images for item icons and custom game UI — hearts, coins, keys, panels.
        PNGs with transparency work best.
      </div>

      <div style={{
        flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 8px",
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, alignContent: "start",
      }}>
        {filtered.length === 0 ? (
          <div style={{ gridColumn: "1/-1", color: "#505050", fontSize: 10, textAlign: "center", paddingTop: 20 }}>
            {graphics.length === 0 ? "No graphics yet — import PNGs to get started." : "No results."}
          </div>
        ) : (
          filtered.map(g => (
            <div
              key={g.id}
              title={g.width && g.height ? `${g.label} (${g.width}×${g.height})` : g.label}
              style={{
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 4, padding: 2,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                overflow: "hidden", minHeight: 80,
              }}
            >
              <div style={checkerTile(g.path)} />
              <span style={{
                fontSize: 8, color: "#9aa3b5",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                width: "100%", textAlign: "center",
              }}>{g.label}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── GraphicPickerPopover ─────────────────────────────────────────────────────
// Small anchored popover for picking a graphic (item icons, GUI elements).
// Rendered by the caller when open; closes via onClose (click-away is the
// caller's concern — it renders inside panels with their own stacking).

interface GraphicPickerPopoverProps {
  graphics: GraphicDef[];
  onPick:   (g: GraphicDef) => void;
  onClose:  () => void;
}

export function GraphicPickerPopover({ graphics, onPick, onClose }: GraphicPickerPopoverProps) {
  const [search, setSearch] = useState("");
  const q = search.toLowerCase();
  const filtered = graphics.filter(g => !q || g.label.toLowerCase().includes(q));

  return (
    <div style={{
      position: "absolute", zIndex: 60, top: "100%", right: 0, marginTop: 4,
      width: 228, maxHeight: 260, display: "flex", flexDirection: "column",
      background: "rgba(28,28,28,0.98)", border: "1px solid rgba(255,255,255,0.14)",
      borderRadius: 6, padding: 6, boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
    }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 6, flexShrink: 0 }}>
        <input type="text" placeholder="Search…" value={search} autoFocus
          onChange={e => setSearch(e.currentTarget.value)}
          style={{ flex: 1, minWidth: 0, boxSizing: "border-box", background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, color: "#d8d8d8",
            fontSize: 11, padding: "3px 6px", outline: "none" }} />
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer",
          color: "#585870", fontSize: 13, padding: "0 2px", flexShrink: 0 }}>✕</button>
      </div>
      <div style={{
        flex: 1, minHeight: 0, overflowY: "auto",
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, alignContent: "start",
      }}>
        {filtered.length === 0 ? (
          <div style={{ gridColumn: "1/-1", color: "#505050", fontSize: 10, textAlign: "center", padding: "14px 0" }}>
            {graphics.length === 0 ? "No graphics — import some via Assets → Graphics." : "No results."}
          </div>
        ) : filtered.map(g => (
          <button key={g.id} title={g.label} onClick={() => { onPick(g); onClose(); }}
            style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: 4, cursor: "pointer", padding: 2,
            }}>
            <div style={checkerTile(g.path)} />
          </button>
        ))}
      </div>
    </div>
  );
}
