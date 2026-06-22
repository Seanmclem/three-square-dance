import { useState, useEffect } from "react";
import type { MaterialDef } from "@/types";
import { MaterialCategoryPills, orderedMaterialCategories, materialSwatchUrl } from "@/ui/materialCategories";

interface MaterialBrowserProps {
  materials:         MaterialDef[];
  onImport:          () => void;
  onDeleteMaterials: (ids: string[]) => void;
  onEdit:            (ids: string[]) => void;
}

const catOf = (m: MaterialDef) => m.category ?? "Other";

export function MaterialBrowser({ materials, onImport, onDeleteMaterials, onEdit }: MaterialBrowserProps) {
  const [search,  setSearch]  = useState("");
  const [matCat,  setMatCat]  = useState<string>("All");
  const [manage,  setManage]  = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const exitManage  = () => { setManage(false); setChecked(new Set()); };
  const toggleCheck = (id: string) =>
    setChecked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Drop checks for materials that no longer exist (e.g. just deleted).
  useEffect(() => {
    setChecked(prev => {
      const ids = new Set(materials.map(m => m.id));
      const next = new Set([...prev].filter(id => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [materials]);

  const orderedCats = orderedMaterialCategories([...new Set(materials.map(catOf))]);
  const filtered = materials.filter(m => {
    const matchCat = matCat === "All" || catOf(m) === matCat;
    const q = search.toLowerCase();
    const matchQ = !q || m.label.toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Search */}
      <div style={{ padding: "8px 8px 6px", flexShrink: 0 }}>
        <input
          type="text" placeholder="Search…" value={search}
          onChange={e => setSearch(e.currentTarget.value)}
          style={{
            width: "100%", boxSizing: "border-box",
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 4, color: "#d8d8d8", fontSize: 11, padding: "4px 6px", outline: "none",
          }}
        />
      </div>

      {/* Category pills */}
      <div style={{ padding: "0 8px 4px", flexShrink: 0 }}>
        <MaterialCategoryPills categories={orderedCats} active={matCat} onSelect={setMatCat} />
      </div>

      {/* Import / Manage toolbar */}
      <div style={{ padding: "6px 8px", flexShrink: 0, display: "flex", gap: 4 }}>
        {!manage ? (
          <>
            <button onClick={onImport} style={{
              flex: 1, padding: "5px 0", background: "rgba(80,140,255,0.12)",
              border: "1px solid rgba(80,140,255,0.25)", borderRadius: 4, cursor: "pointer",
              color: "#80aaff", fontSize: 10, letterSpacing: 0.5,
            }}>+ Import Material</button>
            {materials.length > 0 && (
              <button onClick={() => setManage(true)} title="Select materials to delete" style={{
                flexShrink: 0, padding: "5px 10px", background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, cursor: "pointer",
                color: "#808080", fontSize: 10, letterSpacing: 0.5,
              }}>Manage</button>
            )}
          </>
        ) : (
          <>
            <button
              onClick={() => { if (checked.size) onEdit([...checked]); }}
              disabled={checked.size === 0}
              style={{
                flex: 1, padding: "5px 0",
                background: checked.size ? "rgba(80,140,255,0.12)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${checked.size ? "rgba(80,140,255,0.3)" : "rgba(255,255,255,0.07)"}`,
                borderRadius: 4, cursor: checked.size ? "pointer" : "default",
                color: checked.size ? "#80aaff" : "#555", fontSize: 10, letterSpacing: 0.5,
              }}
            >Edit{checked.size ? ` (${checked.size})` : ""}</button>
            <button
              onClick={() => { if (checked.size) onDeleteMaterials([...checked]); }}
              disabled={checked.size === 0}
              style={{
                flex: 1, padding: "5px 0",
                background: checked.size ? "rgba(200,60,60,0.15)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${checked.size ? "rgba(200,60,60,0.35)" : "rgba(255,255,255,0.07)"}`,
                borderRadius: 4, cursor: checked.size ? "pointer" : "default",
                color: checked.size ? "#cc6666" : "#555", fontSize: 10, letterSpacing: 0.5,
              }}
            >Delete{checked.size ? ` (${checked.size})` : ""}</button>
            <button onClick={exitManage} style={{
              flexShrink: 0, padding: "5px 10px", background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, cursor: "pointer",
              color: "#808080", fontSize: 10, letterSpacing: 0.5,
            }}>Done</button>
          </>
        )}
      </div>

      {/* Grid */}
      <div style={{
        flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 8px",
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, alignContent: "start",
      }}>
        {filtered.length === 0 ? (
          <div style={{ gridColumn: "1/-1", color: "#505050", fontSize: 10, textAlign: "center", paddingTop: 20 }}>
            {materials.length === 0 ? "No materials yet — import one to get started." : "No results."}
          </div>
        ) : (
          filtered.map(mat => {
            const sel = manage && checked.has(mat.id);
            return (
              <button
                key={mat.id}
                title={mat.label}
                onClick={() => manage && toggleCheck(mat.id)}
                style={{
                  position: "relative",
                  background: sel ? "rgba(200,60,60,0.2)" : "rgba(255,255,255,0.04)",
                  border: sel ? "1px solid rgba(200,60,60,0.5)" : "1px solid rgba(255,255,255,0.05)",
                  borderRadius: 4, cursor: manage ? "pointer" : "default", padding: 2,
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
                <div style={{
                  width: "100%", aspectRatio: "1", borderRadius: 3,
                  background: `#3a3a3a url("${materialSwatchUrl(mat)}") center/cover`,
                }} />
                <span style={{
                  fontSize: 8, color: sel ? "#cc8888" : "#808080",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  width: "100%", textAlign: "center",
                }}>{mat.label}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
