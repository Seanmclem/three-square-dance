import { useState, useEffect } from "react";
import type { GraphicDef } from "@/types";
import { MaterialCategoryPills, orderedMaterialCategories } from "@/ui/materialCategories";
import { AssetFilterBar } from "@/ui/AssetFilterBar";
import { useFacetFilters, type FacetSpec } from "@/ui/assetFilters";
import { assetManager } from "@/core/AssetManager";

interface GraphicsBrowserProps {
  graphics: GraphicDef[];
  onImport: () => void;
  onDeleteGraphics: (ids: string[]) => void;
  onEdit: (ids: string[]) => void;
}

const catOf = (g: GraphicDef) => g.category ?? "Other";

// Checkerboard backdrop so transparent PNGs read correctly. The image layer is
// listed FIRST — CSS paints the first background layer on top, so the checker
// must come after the url() or it draws over the graphic.
const checkerTile = (path: string): React.CSSProperties => ({
  width: "100%", aspectRatio: "1", borderRadius: 3,
  backgroundColor: "#4a4a4a",
  backgroundImage: `url("${assetManager.resolveUrl(path)}"), linear-gradient(45deg, #3a3a3a 25%, transparent 25%, transparent 75%, #3a3a3a 75%), linear-gradient(45deg, #3a3a3a 25%, transparent 25%, transparent 75%, #3a3a3a 75%)`,
  backgroundSize: "contain, 12px 12px, 12px 12px",
  backgroundPosition: "center, 0 0, 6px 6px",
  backgroundRepeat: "no-repeat, repeat, repeat",
});

// GraphicDef has no `tags` field, so there is no tag facet here.
const FACETS: FacetSpec<GraphicDef>[] = [
  { key: "cat",    label: "Categories", always: true, read: catOf },
  { key: "pack",   label: "Pack",   blankBucket: "(no pack)",       read: g => g.attribution?.sourceName },
  { key: "author", label: "Author",     read: g => g.attribution?.author },
];

export function GraphicsBrowser({ graphics, onImport, onDeleteGraphics, onEdit }: GraphicsBrowserProps) {
  const [search,  setSearch]  = useState("");
  // Manage mode: tiles become multi-select checkboxes for batch edit/delete
  const [manage,  setManage]  = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const exitManage  = () => { setManage(false); setChecked(new Set()); };
  const toggleCheck = (id: string) =>
    setChecked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Drop checks for graphics that no longer exist (e.g. just deleted).
  useEffect(() => {
    setChecked(prev => {
      const ids = new Set(graphics.map(g => g.id));
      const next = new Set([...prev].filter(id => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [graphics]);

  const facetState = useFacetFilters(graphics, FACETS);
  const orderedCats = orderedMaterialCategories([...new Set(graphics.map(catOf))]);
  const q = search.toLowerCase();
  const filtered = facetState.filtered.filter(g => !q || g.label.toLowerCase().includes(q));

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ padding: "8px 8px 6px", flexShrink: 0 }}>
        <input type="text" placeholder="Search…" value={search}
          onChange={e => setSearch(e.currentTarget.value)}
          style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, color: "#d8d8d8",
            fontSize: 11, padding: "4px 6px", outline: "none" }} />
      </div>

      <AssetFilterBar
        facets={facetState.facets} activeKey={facetState.activeKey} sel={facetState.sel}
        onMode={facetState.setMode} onToggle={facetState.toggle} onClear={facetState.clear}
        categorySlot={
          <MaterialCategoryPills
            categories={orderedCats}
            active={facetState.sel.cat?.[0] ?? "All"}
            onSelect={c => (c === "All" ? facetState.clearFacet("cat") : facetState.toggle("cat", c))}
          />
        }
      />

      <div style={{ padding: "6px 8px", flexShrink: 0, display: "flex", gap: 4 }}>
        {!manage ? (
          <>
            <button onClick={onImport} style={{ flex: 1, padding: "5px 0", background: "rgba(80,140,255,0.12)",
              border: "1px solid rgba(80,140,255,0.25)", borderRadius: 4, cursor: "pointer",
              color: "#80aaff", fontSize: 10, letterSpacing: 0.5 }}>+ Import Graphics</button>
            {graphics.length > 0 && (
              <button onClick={() => setManage(true)} title="Select graphics to edit or delete"
                style={{ flexShrink: 0, padding: "5px 10px",
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 4, cursor: "pointer", color: "#c2cadb", fontSize: 10, letterSpacing: 0.5 }}>Manage</button>
            )}
          </>
        ) : (
          <>
            <button onClick={() => { if (checked.size) onEdit([...checked]); }} disabled={checked.size === 0}
              style={{ flex: 1, padding: "5px 0",
                background: checked.size ? "rgba(80,140,255,0.12)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${checked.size ? "rgba(80,140,255,0.3)" : "rgba(255,255,255,0.07)"}`,
                borderRadius: 4, cursor: checked.size ? "pointer" : "default",
                color: checked.size ? "#9dbdff" : "#8b93a5", fontSize: 10, letterSpacing: 0.5 }}>
              Edit{checked.size ? ` (${checked.size})` : ""}</button>
            <button onClick={() => { if (checked.size) onDeleteGraphics([...checked]); }} disabled={checked.size === 0}
              style={{ flex: 1, padding: "5px 0",
                background: checked.size ? "rgba(200,60,60,0.15)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${checked.size ? "rgba(200,60,60,0.35)" : "rgba(255,255,255,0.07)"}`,
                borderRadius: 4, cursor: checked.size ? "pointer" : "default",
                color: checked.size ? "#e08585" : "#8b93a5", fontSize: 10, letterSpacing: 0.5 }}>
              Delete{checked.size ? ` (${checked.size})` : ""}</button>
            <button onClick={exitManage} style={{ flexShrink: 0, padding: "5px 10px",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 4, cursor: "pointer", color: "#c2cadb", fontSize: 10, letterSpacing: 0.5 }}>Done</button>
          </>
        )}
      </div>

      <div style={{ padding: "0 8px 6px", flexShrink: 0, color: "#98a2b8", fontSize: 9, fontFamily: "monospace", lineHeight: 1.4 }}>
        2D images for item icons and custom game UI — hearts, coins, keys, panels.
        PNGs with transparency work best.
      </div>

      <div style={{
        flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 8px",
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, alignContent: "start",
      }}>
        {filtered.length === 0 ? (
          <div style={{ gridColumn: "1/-1", color: "#98a2b8", fontSize: 10, textAlign: "center", paddingTop: 20 }}>
            {graphics.length === 0 ? "No graphics yet — import PNGs to get started." : "No results."}
          </div>
        ) : (
          filtered.map(g => {
            const sel = manage && checked.has(g.id);
            return (
              <div
                key={g.id}
                title={g.width && g.height ? `${g.label} (${g.width}×${g.height})` : g.label}
                onClick={() => manage && toggleCheck(g.id)}
                style={{
                  position: "relative",
                  background: sel ? "rgba(200,60,60,0.18)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${sel ? "rgba(200,60,60,0.5)" : "rgba(255,255,255,0.05)"}`,
                  borderRadius: 4, padding: 2, cursor: manage ? "pointer" : "default",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  overflow: "hidden", minHeight: 80,
                }}
              >
                {manage && (
                  <div style={{
                    position: "absolute", top: 3, left: 3, zIndex: 1,
                    width: 14, height: 14, borderRadius: 3,
                    background: sel ? "rgba(200,60,60,0.9)" : "rgba(20,20,20,0.8)",
                    border: `1px solid ${sel ? "rgba(255,140,140,0.8)" : "rgba(255,255,255,0.3)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontSize: 10, lineHeight: 1,
                  }}>{sel ? "✓" : ""}</div>
                )}
                <div style={checkerTile(g.path)} />
                <span style={{
                  fontSize: 8, color: sel ? "#e08585" : "#9aa3b5",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  width: "100%", textAlign: "center",
                }}>{g.label}</span>
              </div>
            );
          })
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
          <div style={{ gridColumn: "1/-1", color: "#98a2b8", fontSize: 10, textAlign: "center", padding: "14px 0" }}>
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
