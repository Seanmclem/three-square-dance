import type { Facet, FacetSel } from "@/ui/assetFilters";

// The filter strip for the simpler asset browsers (sounds, skyboxes, materials,
// graphics, decals). AssetBrowser keeps its own strip — it has 10× the items and needs
// the `More ▾` popout — but both read their facets from `assetFilters.ts`, so the
// segments mean the same thing in every panel.
//
// One strip, one facet at a time. With a single visible facet the segmented control is
// omitted entirely, so a library with no tags and no attribution (decals) looks exactly
// like it always has: a row of category pills.

interface AssetFilterBarProps {
  facets:    Facet[];
  activeKey: string;
  sel:       FacetSel;
  onMode:    (key: string) => void;
  onToggle:  (key: string, value: string) => void;
  onClear:   () => void;
  /** Panels whose category row is its own component (materials/graphics/decals use
   *  `MaterialCategoryPills` — domain ordering plus its own overflow popout) pass it
   *  here; the bar shows it in place of generic chips while `cat` is the active facet,
   *  so adopting the bar doesn't flatten a category order someone chose on purpose. */
  categorySlot?: React.ReactNode;
}

const CHIP = (active: boolean): React.CSSProperties => ({
  padding: "2px 8px", borderRadius: 10, fontSize: 10, cursor: "pointer",
  background: active ? "rgba(80,140,255,0.2)" : "rgba(255,255,255,0.04)",
  border: `1px solid ${active ? "rgba(80,140,255,0.35)" : "rgba(255,255,255,0.07)"}`,
  color: active ? "#80aaff" : "#c2cadb",
});

const SEG = (active: boolean): React.CSSProperties => ({
  padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", border: "none",
  letterSpacing: 0.5, whiteSpace: "nowrap",
  background: active ? "rgba(80,140,255,0.25)" : "transparent",
  color: active ? "#80aaff" : "#c2cadb",
});

const COUNT: React.CSSProperties = { opacity: 0.55, marginLeft: 4 };

export function AssetFilterBar({ facets, activeKey, sel, onMode, onToggle, onClear, categorySlot }: AssetFilterBarProps) {
  if (facets.length === 0) return null;

  const active = facets.find(f => f.key === activeKey) ?? facets[0]!;
  const anyActive = Object.values(sel).some(v => v.length > 0);
  // Filters live on hidden facets still apply — surface them as clearable chips so a
  // forgotten pack can't read as "the tag filter found nothing".
  const elsewhere = facets.filter(f => f.key !== active.key && (sel[f.key]?.length));
  const ownSlot = active.key === "cat" ? categorySlot : undefined;

  return (
    <>
      {facets.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 8px 4px", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.04)", borderRadius: 4, padding: 2 }}>
            {facets.map(f => {
              const n = sel[f.key]?.length ?? 0;
              return (
                <button key={f.key} onClick={() => onMode(f.key)} style={SEG(f.key === active.key)}>
                  {f.label}{n > 0 && <span style={COUNT}>{n}</span>}
                </button>
              );
            })}
          </div>
          <span style={{ flex: 1 }} />
          {anyActive && (
            <button onClick={onClear} title="Clear every filter" style={{
              flexShrink: 0, fontSize: 10, padding: "3px 8px", borderRadius: 3, background: "transparent",
              border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", color: "#c2cadb", letterSpacing: 0.5,
            }}>clear</button>
          )}
        </div>
      )}

      {/* Chips for filters set on the facets you can't currently see. */}
      {elsewhere.length > 0 && (
        <div style={{ padding: "0 8px 4px", flexShrink: 0, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {elsewhere.flatMap(f => sel[f.key]!.map(v => (
            <button key={`${f.key}:${v}`} onClick={() => onToggle(f.key, v)}
              title={`Clear the ${f.label.toLowerCase()} filter`}
              style={{ ...CHIP(false), background: "rgba(255,255,255,0.06)" }}>
              {f.prefix}{v} ✕
            </button>
          )))}
        </div>
      )}

      {/* A slot renders in a plain row: MaterialCategoryPills' overflow popout is
          absolutely positioned and `overflow: auto` below would clip it. */}
      {ownSlot ? (
        <div style={{ padding: "0 8px 4px", flexShrink: 0 }}>{ownSlot}</div>
      ) : (
        <div style={{ padding: "0 8px 4px", flexShrink: 0, display: "flex", flexWrap: "wrap", gap: 4,
          maxHeight: 68, overflowY: "auto" }}>
          {/* Exclusive facets get a leading All; multi-select ones clear by unclicking. */}
          {!active.multi && (
            <button onClick={() => { const cur = sel[active.key]?.[0]; if (cur) onToggle(active.key, cur); }}
              style={CHIP(!sel[active.key]?.length)}>All</button>
          )}
          {active.values.map(v => (
            <button key={v.value} onClick={() => onToggle(active.key, v.value)}
              style={CHIP(!!sel[active.key]?.includes(v.value))}>
              {active.prefix}{v.value}{active.counts && <span style={COUNT}>{v.count}</span>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
