import { useState, useRef, useEffect } from "react";
import type { AssetDef, AssetCategory } from "@/types";

const KNOWN_ORDER = ["Furniture", "Props", "Structures", "Lights", "Characters", "Vegetation", "Other"];
const STRIP_COUNT = 3; // how many category pills to show in the strip beside "All"
const TAG_STRIP_COUNT = 4; // tag chips are shorter than category names, so one more fits

const CAT_BTN = (active: boolean): React.CSSProperties => ({
  flexShrink: 0,
  fontSize: 11, padding: "4px 8px", borderRadius: 4,
  border: "none", cursor: "pointer",
  background: active ? "rgba(80,140,255,0.25)" : "rgba(255,255,255,0.04)",
  color: active ? "#80aaff" : "#808080",
  letterSpacing: 0.3, whiteSpace: "nowrap",
  transition: "background 0.1s, color 0.1s",
});

// Facet switcher. Named segments, not a bare "#" — the strip below changes meaning,
// and identically-styled pills gave no hint which facet you were looking at.
const SEG_BTN = (active: boolean): React.CSSProperties => ({
  flexShrink: 0,
  fontSize: 10, padding: "3px 10px", borderRadius: 3,
  border: "none", cursor: "pointer",
  background: active ? "rgba(80,140,255,0.25)" : "transparent",
  color: active ? "#80aaff" : "#c2cadb",
  letterSpacing: 0.5, whiteSpace: "nowrap",
  transition: "background 0.1s, color 0.1s",
});
const COUNT_SPAN: React.CSSProperties = { opacity: 0.55, marginLeft: 4 };

interface AssetBrowserProps {
  assets:          AssetDef[];
  selectedAssetId: string | null;
  onSelect:        (id: string | null) => void;
  onImport:        () => void;
  onDeleteAssets:  (ids: string[]) => void;
  onEdit:          (ids: string[]) => void;
  onRestage:       (id: string) => void;
}

export function AssetBrowser({ assets, selectedAssetId, onSelect, onImport, onDeleteAssets, onEdit, onRestage }: AssetBrowserProps) {
  const [search,   setSearch]   = useState("");
  const [category, setCategory] = useState<AssetCategory | "All">("All");
  // The pill strip shows EITHER categories (exclusive) or tags (multi-select AND).
  // Both filters stay live across the toggle — see `filtered` below.
  const [filterMode, setFilterMode] = useState<"cat" | "tag">("cat");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [popoutOpen, setPopoutOpen] = useState(false);
  // Manage mode: tiles become multi-select checkboxes for batch delete
  const [manage, setManage]     = useState(false);
  const [checked, setChecked]   = useState<Set<string>>(new Set());

  const exitManage = () => { setManage(false); setChecked(new Set()); };
  const toggleCheck = (id: string) =>
    setChecked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Drop checks for assets that no longer exist (e.g. just deleted).
  useEffect(() => {
    setChecked(prev => {
      const ids = new Set(assets.map(a => a.id));
      const next = new Set([...prev].filter(id => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [assets]);
  // Most recently selected named categories, newest last
  const [recent, setRecent] = useState<AssetCategory[]>([]);

  // All categories present in the asset list, sorted: known order first, then custom alphabetically
  const CATEGORIES: AssetCategory[] = [
    ...KNOWN_ORDER.filter(c => assets.some(a => a.category === c)),
    ...[...new Set(assets.map(a => a.category))]
      .filter(c => !KNOWN_ORDER.includes(c))
      .sort(),
  ];
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

  // Tags, most-used first (frequency is the useful default when there may be dozens;
  // the category strip's recency ordering doesn't transfer — you multi-select tags).
  const tagCounts = new Map<string, number>();
  for (const a of assets) for (const t of a.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const ALL_TAGS = [...tagCounts.keys()]
    .sort((a, b) => (tagCounts.get(b)! - tagCounts.get(a)!) || a.localeCompare(b));

  // Active tags always stay visible in the strip; the rest fill the remaining slots.
  const activeInOrder = ALL_TAGS.filter(t => activeTags.has(t));
  const tagStrip      = [
    ...activeInOrder,
    ...ALL_TAGS.filter(t => !activeTags.has(t)).slice(0, Math.max(0, TAG_STRIP_COUNT - activeInOrder.length)),
  ];
  const overflowTags  = ALL_TAGS.filter(t => !tagStrip.includes(t));

  const toggleTag = (tag: string) =>
    setActiveTags(prev => { const n = new Set(prev); n.has(tag) ? n.delete(tag) : n.add(tag); return n; });

  const clearFilters = () => { setCategory("All"); setActiveTags(new Set()); };

  const filtered = assets.filter(a => {
    const matchCat  = category === "All" || a.category === category;
    const matchTags = activeTags.size === 0 || [...activeTags].every(t => a.tags.includes(t));
    const q         = search.toLowerCase();
    const matchQ    = !q || a.label.toLowerCase().includes(q) || a.tags.some(t => t.toLowerCase().includes(q));
    return matchCat && matchTags && matchQ;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>

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

      {/* Facet switcher — says which of the two the strip below is showing */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 8px 4px", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.04)", borderRadius: 4, padding: 2 }}>
          <button
            style={SEG_BTN(filterMode === "cat")}
            onClick={() => { setFilterMode("cat"); setPopoutOpen(false); }}
          >
            Categories
          </button>
          <button
            style={SEG_BTN(filterMode === "tag")}
            onClick={() => { setFilterMode("tag"); setPopoutOpen(false); }}
          >
            Tags{activeTags.size > 0 && <span style={COUNT_SPAN}>{activeTags.size}</span>}
          </button>
        </div>
        <span style={{ flex: 1 }} />
        {(activeTags.size > 0 || category !== "All") && (
          <button
            onClick={clearFilters}
            title="Clear the category and tag filters"
            style={{
              flexShrink: 0, fontSize: 10, padding: "3px 8px", borderRadius: 3,
              background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
              cursor: "pointer", color: "#c2cadb", letterSpacing: 0.5,
            }}
          >
            clear
          </button>
        )}
      </div>

      {/* Category strip — fixed, no scroll */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 2, padding: "0 8px 4px", flexWrap: "wrap" }}>
          {filterMode === "cat" ? (
            <>
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
            </>
          ) : (
            <>
              {/* The category filter is still live but its pills are hidden — surface it
                  so a forgotten category doesn't read as "the tag filter found nothing". */}
              {category !== "All" && (
                <button
                  style={{ ...CAT_BTN(true), background: "rgba(255,255,255,0.06)", color: "#c2cadb" }}
                  title="Clear the category filter"
                  onClick={() => setCategory("All")}
                >
                  {category as string} ✕
                </button>
              )}

              {/* Tag chips — multi-select, ANDed. `#` + count so they can't be mistaken
                  for category pills, which are exclusive and countless. */}
              {tagStrip.map(tag => (
                <button
                  key={tag}
                  style={CAT_BTN(activeTags.has(tag))}
                  onClick={() => toggleTag(tag)}
                  onMouseEnter={e => { if (!activeTags.has(tag)) e.currentTarget.style.background = "rgba(80,140,255,0.12)"; }}
                  onMouseLeave={e => { if (!activeTags.has(tag)) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                >
                  #{tag}<span style={COUNT_SPAN}>{tagCounts.get(tag) ?? 0}</span>
                </button>
              ))}
              {ALL_TAGS.length === 0 && (
                <span style={{ fontSize: 10, color: "#7a7a7a", padding: "4px 2px" }}>No tags yet</span>
              )}
            </>
          )}

          {/* More button — full row below the pills */}
          {(filterMode === "cat" ? overflowCats.length : overflowTags.length) > 0 && (
            <button
              style={{
                ...CAT_BTN(filterMode === "cat" && overflowCats.includes(category as AssetCategory)),
                width: "100%", marginTop: 4, textAlign: "center",
                justifyContent: "center",
              }}
              onClick={() => setPopoutOpen(v => !v)}
              onMouseEnter={e => { if (!overflowCats.includes(category as AssetCategory)) e.currentTarget.style.background = "rgba(80,140,255,0.12)"; }}
              onMouseLeave={e => { if (!overflowCats.includes(category as AssetCategory)) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
            >
              {filterMode === "cat" && overflowCats.includes(category as AssetCategory)
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
            {/* Tag mode stays open across clicks — tags are multi-select. */}
            {(filterMode === "cat" ? overflowCats : overflowTags).map(item => {
              const on = filterMode === "cat" ? category === item : activeTags.has(item);
              return (
                <button
                  key={item}
                  onClick={() => filterMode === "cat" ? selectCategory(item) : toggleTag(item)}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    background: on ? "rgba(80,140,255,0.2)" : "transparent",
                    border: "none", cursor: "pointer",
                    color: on ? "#80aaff" : "#808080",
                    fontSize: 11, padding: "6px 12px",
                    letterSpacing: 0.4, transition: "background 0.1s, color 0.1s",
                  }}
                  onMouseEnter={e => {
                    if (!on) {
                      e.currentTarget.style.background = "rgba(80,140,255,0.1)";
                      e.currentTarget.style.color = "#8aaad0";
                    }
                  }}
                  onMouseLeave={e => {
                    if (!on) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "#808080";
                    }
                  }}
                >
                  {filterMode === "cat"
                    ? item
                    : <>#{item}<span style={COUNT_SPAN}>{tagCounts.get(item) ?? 0}</span></>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Import / Manage toolbar */}
      <div style={{ padding: "8px 8px 6px", flexShrink: 0, display: "flex", gap: 4 }}>
        {!manage ? (
          <>
            <button
              onClick={onImport}
              style={{
                flex: 1, padding: "5px 0",
                background: "rgba(80,140,255,0.12)",
                border: "1px solid rgba(80,140,255,0.25)",
                borderRadius: 4, cursor: "pointer",
                color: "#80aaff", fontSize: 10, letterSpacing: 0.5,
              }}
            >
              + Import Model
            </button>
            {assets.length > 0 && (
              <button
                onClick={() => setManage(true)}
                title="Select models to delete"
                style={{
                  flexShrink: 0, padding: "5px 10px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 4, cursor: "pointer",
                  color: "#808080", fontSize: 10, letterSpacing: 0.5,
                }}
              >
                Manage
              </button>
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
            >
              Edit{checked.size ? ` (${checked.size})` : ""}
            </button>
            <button
              onClick={() => { if (checked.size === 1) onRestage([...checked][0]!); }}
              disabled={checked.size !== 1}
              title="Re-stage thumbnail (select exactly one)"
              style={{
                flexShrink: 0, padding: "5px 8px",
                background: checked.size === 1 ? "rgba(80,140,255,0.12)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${checked.size === 1 ? "rgba(80,140,255,0.3)" : "rgba(255,255,255,0.07)"}`,
                borderRadius: 4, cursor: checked.size === 1 ? "pointer" : "default",
                color: checked.size === 1 ? "#80aaff" : "#555", fontSize: 10,
              }}
            >
              📷
            </button>
            <button
              onClick={() => { if (checked.size) onDeleteAssets([...checked]); }}
              disabled={checked.size === 0}
              style={{
                flex: 1, padding: "5px 0",
                background: checked.size ? "rgba(200,60,60,0.15)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${checked.size ? "rgba(200,60,60,0.35)" : "rgba(255,255,255,0.07)"}`,
                borderRadius: 4, cursor: checked.size ? "pointer" : "default",
                color: checked.size ? "#cc6666" : "#555", fontSize: 10, letterSpacing: 0.5,
              }}
            >
              Delete{checked.size ? ` (${checked.size})` : ""}
            </button>
            <button
              onClick={exitManage}
              style={{
                flexShrink: 0, padding: "5px 10px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 4, cursor: "pointer",
                color: "#808080", fontSize: 10, letterSpacing: 0.5,
              }}
            >
              Done
            </button>
          </>
        )}
      </div>

      {/* Grid */}
      <div style={{
        flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 8px",
        // Fixed 96px cells, not `3` and not `1fr`: a wider panel buys MORE tiles per row
        // rather than fatter ones. The width must be a definite px — with `1fr` the
        // square's height (width:100% + aspect-ratio) contributes ~0 to grid row sizing,
        // rows collapse to the label, and the tiles overlap each other.
        display: "grid", gridTemplateColumns: "repeat(auto-fill, 96px)",
        // start, not space-between: at 2 columns space-between flings them to opposite
        // edges with a canyon between.
        justifyContent: "start", gridAutoRows: "min-content", gap: 4,
        alignContent: "start",
      }}>
        {filtered.length === 0 ? (
          <div style={{
            gridColumn: "1/-1", color: "#505050", fontSize: 10,
            textAlign: "center", paddingTop: 20,
          }}>
            {assets.length === 0 ? "No assets yet — import a model to get started." : "No results."}
            {/* An accidental 2-tag AND shouldn't read as a broken panel. */}
            {assets.length > 0 && (activeTags.size > 0 || category !== "All") && (
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={clearFilters}
                  style={{
                    background: "rgba(80,140,255,0.12)", border: "1px solid rgba(80,140,255,0.25)",
                    borderRadius: 4, cursor: "pointer", color: "#80aaff",
                    fontSize: 10, padding: "4px 10px", letterSpacing: 0.5,
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        ) : (
          filtered.map(asset => {
            const sel = manage ? checked.has(asset.id) : asset.id === selectedAssetId;
            const accent = manage ? "200,60,60" : "80,140,255";
            return (
              <button
                key={asset.id}
                title={asset.label}
                onClick={() => manage ? toggleCheck(asset.id) : onSelect(sel ? null : asset.id)}
                style={{
                  position: "relative",
                  background: sel ? `rgba(${accent},0.2)` : "rgba(255,255,255,0.04)",
                  border: sel ? `1px solid rgba(${accent},0.5)` : "1px solid rgba(255,255,255,0.05)",
                  borderRadius: 4, cursor: "pointer", padding: 2,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  // 92px square thumb + label. The old `minHeight: 80` capped the row while
                  // the image rendered at full column width, and `overflow:hidden` silently
                  // cropped the difference — that was the letterboxing.
                  overflow: "hidden", width: 96, minHeight: 108,
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
                {asset.thumbnail ? (
                  <img
                    src={asset.thumbnail}
                    alt={asset.label}
                    // contain, not cover: thumbnails are square renders, so nothing is ever
                    // cropped even if the box is off-square. flexShrink:0 stops the column
                    // flex from compressing the square.
                    style={{ width: "100%", aspectRatio: "1", objectFit: "contain", flexShrink: 0, display: "block", borderRadius: 3 }}
                  />
                ) : (
                  <div style={{
                    width: "100%", aspectRatio: "1", flexShrink: 0,
                    background: "rgba(55,55,55,0.5)", borderRadius: 3,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 18, color: "#505050",
                  }}>◻</div>
                )}
                <span style={{
                  fontSize: 8, color: sel ? (manage ? "#cc8888" : "#80aaff") : "#808080",
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
