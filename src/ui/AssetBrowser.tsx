import { useState, useRef, useEffect } from "react";
import type { AssetDef, AssetCategory } from "@/types";

const CATEGORIES: AssetCategory[] = ["Furniture", "Props", "Structures", "Lights", "Characters", "Vegetation", "Other"];
const STRIP_COUNT = 3; // how many category pills to show in the strip beside "All"

const CAT_BTN = (active: boolean): React.CSSProperties => ({
  flexShrink: 0,
  fontSize: 11, padding: "4px 8px", borderRadius: 4,
  border: "none", cursor: "pointer",
  background: active ? "rgba(80,140,255,0.25)" : "rgba(255,255,255,0.04)",
  color: active ? "#80aaff" : "#808080",
  letterSpacing: 0.3, whiteSpace: "nowrap",
  transition: "background 0.1s, color 0.1s",
});

interface AssetBrowserProps {
  assets:          AssetDef[];
  selectedAssetId: string | null;
  onSelect:        (id: string | null) => void;
  onImport:        () => void;
}

export function AssetBrowser({ assets, selectedAssetId, onSelect, onImport }: AssetBrowserProps) {
  const [search,   setSearch]   = useState("");
  const [category, setCategory] = useState<AssetCategory | "All">("All");
  const [popoutOpen, setPopoutOpen] = useState(false);
  // Most recently selected named categories, newest last
  const [recent, setRecent] = useState<AssetCategory[]>([]);
  const popoutRef  = useRef<HTMLDivElement>(null);

  // Close popout on outside click
  useEffect(() => {
    if (!popoutOpen) return;
    const handler = (e: MouseEvent) => {
      if (popoutRef.current && !popoutRef.current.contains(e.target as Node))
        setPopoutOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popoutOpen]);

  const selectCategory = (cat: AssetCategory | "All") => {
    setCategory(cat);
    setPopoutOpen(false);
    if (cat !== "All") {
      setRecent(prev => {
        const next = prev.filter(c => c !== cat);
        next.push(cat);
        return next;
      });
    }
  };

  // Most recent on the left, padded with defaults on the right
  const recentSlice   = [...recent].reverse().slice(0, STRIP_COUNT);
  const recentSet     = new Set(recentSlice);
  const needed        = STRIP_COUNT - recentSlice.length;
  const padded        = CATEGORIES.filter(c => !recentSet.has(c)).slice(0, needed);
  const stripCats: AssetCategory[] = [...recentSlice, ...padded];

  // Overflow = everything NOT in the strip
  const stripSet   = new Set(stripCats);
  const overflowCats = CATEGORIES.filter(c => !stripSet.has(c));

  const filtered = assets.filter(a => {
    const matchCat = category === "All" || a.category === category;
    const q        = search.toLowerCase();
    const matchQ   = !q || a.label.toLowerCase().includes(q) || a.tags.some(t => t.toLowerCase().includes(q));
    return matchCat && matchQ;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Search bar */}
      <div style={{ padding: "8px 8px 6px", flexShrink: 0 }}>
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.currentTarget.value)}
          style={{
            width: "100%", boxSizing: "border-box",
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 4, color: "#d8d8d8", fontSize: 11, padding: "4px 6px",
            outline: "none",
          }}
        />
      </div>

      {/* Category strip — fixed, no scroll */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 2, padding: "0 8px 4px", flexWrap: "wrap" }}>
          {/* All */}
          <button
            style={CAT_BTN(category === "All")}
            onClick={() => selectCategory("All")}
            onMouseEnter={e => { if (category !== "All") e.currentTarget.style.background = "rgba(80,140,255,0.12)"; }}
            onMouseLeave={e => { if (category !== "All") e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
          >All</button>

          {/* Strip pills */}
          {stripCats.map(cat => (
            <button
              key={cat}
              style={CAT_BTN(category === cat)}
              onClick={() => selectCategory(cat)}
              onMouseEnter={e => { if (category !== cat) e.currentTarget.style.background = "rgba(80,140,255,0.12)"; }}
              onMouseLeave={e => { if (category !== cat) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
            >
              {cat}
            </button>
          ))}

          {/* More button — full row below the pills */}
          {overflowCats.length > 0 && (
            <button
              style={{
                ...CAT_BTN(overflowCats.includes(category as AssetCategory)),
                width: "100%", marginTop: 4, textAlign: "center",
                justifyContent: "center",
              }}
              onClick={() => setPopoutOpen(v => !v)}
              onMouseEnter={e => { if (!overflowCats.includes(category as AssetCategory)) e.currentTarget.style.background = "rgba(80,140,255,0.12)"; }}
              onMouseLeave={e => { if (!overflowCats.includes(category as AssetCategory)) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
            >
              {overflowCats.includes(category as AssetCategory)
                ? `${category as string} ▾`
                : "More ▾"}
            </button>
          )}
        </div>

        {/* Overflow popout */}
        {popoutOpen && (
          <div
            ref={popoutRef}
            style={{
              position: "absolute", top: "100%", right: 6, zIndex: 20,
              background: "rgba(28,28,28,0.98)",
              border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 4, padding: "4px 0",
              minWidth: 120, maxHeight: 200, overflowY: "auto",
              boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
            }}
          >
            {overflowCats.map(cat => (
              <button
                key={cat}
                onClick={() => selectCategory(cat)}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  background: category === cat ? "rgba(80,140,255,0.2)" : "transparent",
                  border: "none", cursor: "pointer",
                  color: category === cat ? "#80aaff" : "#808080",
                  fontSize: 11, padding: "6px 12px",
                  letterSpacing: 0.4, transition: "background 0.1s, color 0.1s",
                }}
                onMouseEnter={e => {
                  if (category !== cat) {
                    e.currentTarget.style.background = "rgba(80,140,255,0.1)";
                    e.currentTarget.style.color = "#8aaad0";
                  }
                }}
                onMouseLeave={e => {
                  if (category !== cat) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "#808080";
                  }
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Import button */}
      <div style={{ padding: "8px 8px 6px", flexShrink: 0 }}>
        <button
          onClick={onImport}
          style={{
            width: "100%", padding: "5px 0",
            background: "rgba(80,140,255,0.12)",
            border: "1px solid rgba(80,140,255,0.25)",
            borderRadius: 4, cursor: "pointer",
            color: "#80aaff", fontSize: 10, letterSpacing: 0.5,
            transition: "background 0.1s, border-color 0.1s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "rgba(80,140,255,0.22)";
            e.currentTarget.style.borderColor = "rgba(80,140,255,0.5)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "rgba(80,140,255,0.12)";
            e.currentTarget.style.borderColor = "rgba(80,140,255,0.25)";
          }}
        >
          + Import Model
        </button>
      </div>

      {/* Grid */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "4px 8px",
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4,
        alignContent: "start",
      }}>
        {filtered.length === 0 ? (
          <div style={{
            gridColumn: "1/-1", color: "#505050", fontSize: 10,
            textAlign: "center", paddingTop: 20,
          }}>
            {assets.length === 0 ? "No assets yet — import a model to get started." : "No results."}
          </div>
        ) : (
          filtered.map(asset => {
            const sel = asset.id === selectedAssetId;
            return (
              <button
                key={asset.id}
                title={asset.label}
                onClick={() => onSelect(sel ? null : asset.id)}
                style={{
                  background: sel ? "rgba(80,140,255,0.2)" : "rgba(255,255,255,0.04)",
                  border: sel ? "1px solid rgba(80,140,255,0.5)" : "1px solid rgba(255,255,255,0.05)",
                  borderRadius: 4, cursor: "pointer", padding: 2,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  overflow: "hidden",
                }}
              >
                {asset.thumbnail ? (
                  <img
                    src={asset.thumbnail}
                    alt={asset.label}
                    style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 3 }}
                  />
                ) : (
                  <div style={{
                    width: "100%", aspectRatio: "1",
                    background: "rgba(55,55,55,0.5)", borderRadius: 3,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 18, color: "#505050",
                  }}>◻</div>
                )}
                <span style={{
                  fontSize: 8, color: sel ? "#80aaff" : "#808080",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  width: "100%", textAlign: "center",
                }}>
                  {asset.label}
                </span>
              </button>
            );
          })
        )}
      </div>

    </div>
  );
}
