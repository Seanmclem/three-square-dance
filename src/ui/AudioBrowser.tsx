import { useState, useEffect, useRef } from "react";
import type { SoundDef } from "@/types";

interface AudioBrowserProps {
  sounds:         SoundDef[];
  onImport:       () => void;
  onDeleteSounds: (ids: string[]) => void;
  onEdit:         (ids: string[]) => void;
}

const catOf = (s: SoundDef) => s.category ?? "SFX";

export function AudioBrowser({ sounds, onImport, onDeleteSounds, onEdit }: AudioBrowserProps) {
  const [search,  setSearch]  = useState("");
  const [cat,     setCat]     = useState<string>("All");
  // The pill strip shows EITHER categories (exclusive) or tags (multi-select AND).
  // Both filters stay live across the toggle — see `filtered` below.
  const [filterMode, setFilterMode] = useState<"cat" | "tag">("cat");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [manage,  setManage]  = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const exitManage  = () => { setManage(false); setChecked(new Set()); };
  const toggleCheck = (id: string) =>
    setChecked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  useEffect(() => {
    setChecked(prev => {
      const ids = new Set(sounds.map(s => s.id));
      const next = new Set([...prev].filter(id => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [sounds]);

  // Stop any preview when the panel unmounts.
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const preview = (s: SoundDef) => {
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    if (playing === s.id) { a.pause(); setPlaying(null); return; }
    a.src = s.path; a.currentTime = 0;
    a.onended = () => setPlaying(null);
    void a.play().then(() => setPlaying(s.id)).catch(() => setPlaying(null));
  };

  const cats = ["All", ...[...new Set(sounds.map(catOf))].sort()];

  // Tags, most-used first (frequency is the useful default when there may be dozens).
  const tagCounts = new Map<string, number>();
  for (const s of sounds) for (const t of s.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const ALL_TAGS = [...tagCounts.keys()]
    .sort((a, b) => (tagCounts.get(b)! - tagCounts.get(a)!) || a.localeCompare(b));

  const toggleTag = (t: string) =>
    setActiveTags(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; });
  const clearFilters = () => { setCat("All"); setActiveTags(new Set()); };

  // Natural order so "sound12" sorts after "sound9", not next to "sound1".
  const filtered = sounds.filter(s => {
    const matchCat  = cat === "All" || catOf(s) === cat;
    const matchTags = activeTags.size === 0 || [...activeTags].every(t => (s.tags ?? []).includes(t));
    const q = search.toLowerCase();
    return matchCat && matchTags
      && (!q || s.label.toLowerCase().includes(q) || (s.tags ?? []).some(t => t.toLowerCase().includes(q)));
  }).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));

  const chip = (key: string, label: React.ReactNode, active: boolean, onClick: () => void, title?: string) => (
    <button key={key} onClick={onClick} title={title} style={{
      padding: "2px 8px", borderRadius: 10, fontSize: 10, cursor: "pointer",
      background: active ? "rgba(80,140,255,0.2)" : "rgba(255,255,255,0.04)",
      border: `1px solid ${active ? "rgba(80,140,255,0.35)" : "rgba(255,255,255,0.07)"}`,
      color: active ? "#80aaff" : "#c2cadb",
    }}>{label}</button>
  );
  const pill = (c: string) => chip(c, c, cat === c, () => setCat(c));

  // Facet switcher — named segments, so the strip below never changes meaning silently.
  const seg = (mode: "cat" | "tag", label: React.ReactNode) => (
    <button key={mode} onClick={() => setFilterMode(mode)} style={{
      padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer", border: "none",
      letterSpacing: 0.5, whiteSpace: "nowrap",
      background: filterMode === mode ? "rgba(80,140,255,0.25)" : "transparent",
      color: filterMode === mode ? "#80aaff" : "#c2cadb",
    }}>{label}</button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ padding: "8px 8px 6px", flexShrink: 0 }}>
        <input type="text" placeholder="Search…" value={search}
          onChange={e => setSearch(e.currentTarget.value)}
          style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, color: "#d8d8d8",
            fontSize: 11, padding: "4px 6px", outline: "none" }} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 8px 4px", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.04)", borderRadius: 4, padding: 2 }}>
          {seg("cat", "Categories")}
          {seg("tag", <>Tags{activeTags.size > 0 && <span style={{ opacity: 0.55, marginLeft: 4 }}>{activeTags.size}</span>}</>)}
        </div>
        <span style={{ flex: 1 }} />
        {(activeTags.size > 0 || cat !== "All") && (
          <button onClick={clearFilters} title="Clear the category and tag filters" style={{
            flexShrink: 0, fontSize: 10, padding: "3px 8px", borderRadius: 3, background: "transparent",
            border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", color: "#c2cadb", letterSpacing: 0.5,
          }}>clear</button>
        )}
      </div>

      {/* Strip: category pills OR tag chips. Wraps, and scrolls once tags get numerous. */}
      <div style={{ padding: "0 8px 4px", flexShrink: 0, display: "flex", flexWrap: "wrap", gap: 4,
        maxHeight: 68, overflowY: "auto" }}>
        {filterMode === "cat" ? cats.map(pill) : (
          <>
            {/* The category filter is still live but its pills are hidden — surface it so a
                forgotten category doesn't read as "the tag filter found nothing". */}
            {cat !== "All" && chip("__cat", `${cat} ✕`, false, () => setCat("All"), "Clear the category filter")}
            {ALL_TAGS.map(t => chip(t, <>#{t}<span style={{ opacity: 0.55, marginLeft: 4 }}>{tagCounts.get(t)}</span></>,
              activeTags.has(t), () => toggleTag(t)))}
            {ALL_TAGS.length === 0 && (
              <span style={{ fontSize: 10, color: "#9aa3b5", padding: "2px" }}>No tags yet</span>
            )}
          </>
        )}
      </div>

      <div style={{ padding: "6px 8px", flexShrink: 0, display: "flex", gap: 4 }}>
        {!manage ? (
          <>
            <button onClick={onImport} style={{ flex: 1, padding: "5px 0", background: "rgba(80,140,255,0.12)",
              border: "1px solid rgba(80,140,255,0.25)", borderRadius: 4, cursor: "pointer",
              color: "#80aaff", fontSize: 10, letterSpacing: 0.5 }}>+ Import Sound</button>
            {sounds.length > 0 && (
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
            <button onClick={() => { if (checked.size) onDeleteSounds([...checked]); }} disabled={checked.size === 0}
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

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 8px", display: "flex", flexDirection: "column", gap: 3 }}>
        {filtered.length === 0 ? (
          <div style={{ color: "#505050", fontSize: 10, textAlign: "center", paddingTop: 20 }}>
            {sounds.length === 0 ? "No sounds yet — import one to get started." : "No results."}
          </div>
        ) : filtered.map(s => {
          const sel = manage && checked.has(s.id);
          return (
            <div key={s.id} onClick={() => manage && toggleCheck(s.id)} title={s.id}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 6px", borderRadius: 4,
                cursor: manage ? "pointer" : "default",
                background: sel ? "rgba(200,60,60,0.18)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${sel ? "rgba(200,60,60,0.5)" : "rgba(255,255,255,0.05)"}` }}>
              {manage && (
                <span style={{ width: 14, height: 14, flexShrink: 0, borderRadius: 3, fontSize: 10,
                  display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                  background: sel ? "rgba(200,60,60,0.9)" : "rgba(20,20,20,0.8)",
                  border: `1px solid ${sel ? "rgba(255,140,140,0.8)" : "rgba(255,255,255,0.3)"}` }}>{sel ? "✓" : ""}</span>
              )}
              <button onClick={e => { e.stopPropagation(); preview(s); }} title="Preview"
                style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 4, cursor: "pointer",
                  background: "rgba(80,140,255,0.15)", border: "1px solid rgba(80,140,255,0.3)",
                  color: "#80aaff", fontSize: 10, lineHeight: 1 }}>{playing === s.id ? "⏸" : "▶"}</button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "#c8c8c8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</div>
                <div style={{ fontSize: 9, color: "#707070" }}>{s.category}{s.loop ? " · loop" : ""}{s.spatial ? " · spatial" : ""}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
