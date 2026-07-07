import { useState } from "react";
import type { DecalTexDef, DecalKind } from "@/types";
import { MaterialCategoryPills, orderedMaterialCategories } from "@/ui/materialCategories";

interface DecalBrowserProps {
  decals:     DecalTexDef[];
  selectedId: string | null;
  onSelect:   (id: string | null, kind: DecalKind) => void;
}

const catOf = (d: DecalTexDef) => d.category ?? "Other";

export function DecalBrowser({ decals, selectedId, onSelect }: DecalBrowserProps) {
  const [kind, setKind] = useState<DecalKind>("overlay");
  const [cat,  setCat]  = useState<string>("All");

  const byKind = decals.filter(d => d.kinds.includes(kind));
  const orderedCats = orderedMaterialCategories([...new Set(byKind.map(catOf))]);
  const filtered = byKind.filter(d => cat === "All" || catOf(d) === cat);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Kind toggle */}
      <div style={{ padding: "8px 8px 4px", flexShrink: 0, display: "flex", gap: 4 }}>
        {(["overlay", "surface"] as const).map(k => {
          const active   = kind === k;
          const disabled = k === "surface";   // Phase 21 — surface-effect shader decals
          return (
            <button
              key={k}
              disabled={disabled}
              title={disabled ? "Surface-effect decals land in a later phase" : k === "overlay" ? "Stickers, cracks, paint — a mesh on top of the surface" : undefined}
              onClick={() => setKind(k)}
              style={{
                flex: 1, padding: "5px 0", borderRadius: 4, fontSize: 10, letterSpacing: 0.5,
                cursor: disabled ? "default" : "pointer",
                background: active ? "rgba(80,140,255,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${active ? "rgba(80,140,255,0.35)" : "rgba(255,255,255,0.08)"}`,
                color: disabled ? "#444" : active ? "#80aaff" : "#808080",
              }}
            >{k === "overlay" ? "Overlay" : "Surface (soon)"}</button>
          );
        })}
      </div>

      {/* Category pills */}
      <div style={{ padding: "0 8px 4px", flexShrink: 0 }}>
        <MaterialCategoryPills categories={orderedCats} active={cat} onSelect={setCat} />
      </div>

      <div style={{ padding: "2px 8px 6px", flexShrink: 0, color: "#606070", fontSize: 9, fontFamily: "monospace", lineHeight: 1.4 }}>
        Pick a decal, then hover a wall/floor and click to stamp. Scroll = size,
        shift+scroll = rotate, Esc = done.
      </div>

      {/* Grid */}
      <div style={{
        flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 8px",
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, alignContent: "start",
      }}>
        {filtered.length === 0 ? (
          <div style={{ gridColumn: "1/-1", color: "#505050", fontSize: 10, textAlign: "center", paddingTop: 20 }}>
            {decals.length === 0 ? "No decals — add PNGs + manifest.json under public/assets/decals." : "No results."}
          </div>
        ) : (
          filtered.map(d => {
            const sel = d.id === selectedId;
            return (
              <button
                key={d.id}
                title={d.label}
                onClick={() => onSelect(sel ? null : d.id, kind)}
                style={{
                  background: sel ? "rgba(80,140,255,0.15)" : "rgba(255,255,255,0.04)",
                  border: sel ? "1px solid rgba(80,140,255,0.55)" : "1px solid rgba(255,255,255,0.05)",
                  borderRadius: 4, cursor: "pointer", padding: 2,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  overflow: "hidden", minHeight: 80,
                }}
              >
                <div style={{
                  width: "100%", aspectRatio: "1", borderRadius: 3,
                  // checker backdrop so transparent PNGs read correctly
                  backgroundColor: "#4a4a4a",
                  backgroundImage: `linear-gradient(45deg, #3a3a3a 25%, transparent 25%, transparent 75%, #3a3a3a 75%), linear-gradient(45deg, #3a3a3a 25%, transparent 25%, transparent 75%, #3a3a3a 75%), url("${d.path}")`,
                  backgroundSize: "12px 12px, 12px 12px, cover",
                  backgroundPosition: "0 0, 6px 6px, center",
                }} />
                <span style={{
                  fontSize: 8, color: sel ? "#80aaff" : "#808080",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  width: "100%", textAlign: "center",
                }}>{d.label}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
