import { useState, useRef, useEffect } from "react";
import type { MaterialDef } from "@/types";

export const MAT_CAT_ORDER = ["Stone", "Wood", "Metal", "Fabric", "Ground", "Concrete", "Brick", "Plaster", "Other"];

/** Low-quality albedo URL for a material preview swatch. */
export const materialSwatchUrl = (m: MaterialDef) => m.maps.albedo.path.replace("{quality}", "low");
const MAT_PILL_VISIBLE = 4; // category pills shown inline beside "All" before overflow

/** Build the ordered category list ("All" first, known-order, then custom) from a material's category accessor. */
export function orderedMaterialCategories(present: string[]): string[] {
  return ["All",
    ...MAT_CAT_ORDER.filter(c => present.includes(c)),
    ...present.filter(c => !MAT_CAT_ORDER.includes(c)).sort(),
  ];
}

export function MaterialCategoryPills({ categories, active, onSelect }: {
  categories: string[];   // ordered, includes "All" first
  active:     string;
  onSelect:   (c: string) => void;
}) {
  const [popout, setPopout] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!popout) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setPopout(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [popout]);

  const rest = categories.slice(1);
  let inline = rest.slice(0, MAT_PILL_VISIBLE);
  let overflow = rest.slice(MAT_PILL_VISIBLE);
  if (active !== "All" && overflow.includes(active)) {  // keep the active category visible inline
    inline = [...inline, active];
    overflow = overflow.filter(c => c !== active);
  }

  const pillStyle = (c: string): React.CSSProperties => ({
    flexShrink: 0, fontSize: 10, padding: "3px 7px", borderRadius: 4, border: "none", cursor: "pointer",
    background: active === c ? "rgba(80,140,255,0.25)" : "rgba(255,255,255,0.04)",
    color: active === c ? "#80aaff" : "#808080", whiteSpace: "nowrap",
  });

  return (
    <div ref={ref} style={{ position: "relative", display: "flex", gap: 3, flexWrap: "wrap" }}>
      <button onClick={() => onSelect("All")} style={pillStyle("All")}>All</button>
      {inline.map(c => <button key={c} onClick={() => onSelect(c)} style={pillStyle(c)}>{c}</button>)}
      {overflow.length > 0 && (
        <button onClick={() => setPopout(v => !v)} style={pillStyle("__more__")}>More ▾</button>
      )}
      {popout && overflow.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, zIndex: 20,
          background: "rgba(28,28,28,0.98)", border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 4, padding: "4px 0", minWidth: 110, maxHeight: 180, overflowY: "auto",
          boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        }}>
          {overflow.map(c => (
            <button key={c} onClick={() => { onSelect(c); setPopout(false); }} style={{
              display: "block", width: "100%", textAlign: "left", border: "none", cursor: "pointer",
              background: active === c ? "rgba(80,140,255,0.2)" : "transparent",
              color: active === c ? "#80aaff" : "#808080", fontSize: 10, padding: "5px 12px",
            }}>{c}</button>
          ))}
        </div>
      )}
    </div>
  );
}
