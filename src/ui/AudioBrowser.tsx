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
  const filtered = sounds.filter(s => {
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
