import { useState, useEffect, useRef } from "react";
import type { SoundDef } from "@/types";
import { assetManager } from "@/core/AssetManager";
import { AssetFilterBar } from "@/ui/AssetFilterBar";
import { buildFacets, matchesFacets, type FacetSel } from "@/ui/assetFilters";
import { SOUND_FACETS } from "@/ui/AudioBrowser";

interface SoundPickerModalProps {
  title:   string;
  onPick:  (soundId: string) => void;
  onClose: () => void;
}

// The last search/facet state, surviving close/reopen (and page navigation): pick a
// clip from a filtered list, close, reopen to add the next one — you're right where
// you left off. Deliberately module-level, not persisted — a fresh app start resets it.
let savedState: { search: string; mode: string; sel: FacetSel } = { search: "", mode: "cat", sel: {} };

const OVERLAY: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center",
};
const MODAL: React.CSSProperties = {
  background: "rgba(28,28,28,0.98)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8, width: 420, height: "min(560px, 85vh)", display: "flex", flexDirection: "column",
  color: "#c2cadb", fontFamily: "monospace", fontSize: 12,
};

/**
 * Modal sound picker (the AudioBrowser's search + facet filters + row list, minus
 * manage mode) for flows where a flat <select> over the whole library doesn't scale —
 * playlist clip picking. Click a row to pick it; the caller closes the modal.
 */
export function SoundPickerModal({ title, onPick, onClose }: SoundPickerModalProps) {
  const [search, setSearch] = useState(savedState.search);
  const [mode,   setMode]   = useState(savedState.mode);
  const [sel,    setSel]    = useState<FacetSel>(savedState.sel);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { savedState = { search, mode, sel }; }, [search, mode, sel]);
  // Stop any preview when the modal closes.
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const sounds: SoundDef[] = assetManager.getSoundList();
  const facets = buildFacets(sounds, SOUND_FACETS);

  // Same self-healing as useFacetFilters (which can't seed its state): stale values
  // drop from the effective selection; a vanished facet can't stay the active one.
  const valid = new Map(facets.map(f => [f.key, new Set(f.values.map(v => v.value))]));
  const effSel: FacetSel = {};
  for (const [key, values] of Object.entries(sel)) {
    const keep = values.filter(v => valid.get(key)?.has(v));
    if (keep.length) effSel[key] = keep;
  }
  const activeKey = facets.some(f => f.key === mode) ? mode : (facets[0]?.key ?? "");

  const toggle = (key: string, value: string) => setSel(prev => {
    const multi = SOUND_FACETS.find(s => s.key === key)?.multi;
    const cur = prev[key] ?? [];
    if (!multi) return { ...prev, [key]: cur[0] === value ? [] : [value] };
    return { ...prev, [key]: cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value] };
  });

  const q = search.toLowerCase();
  const filtered = sounds
    .filter(s => matchesFacets(s, SOUND_FACETS, effSel))
    .filter(s => !q || s.label.toLowerCase().includes(q) || (s.tags ?? []).some(t => t.toLowerCase().includes(q)))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));

  const preview = (s: SoundDef) => {
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    if (playing === s.id) { a.pause(); setPlaying(null); return; }
    a.src = s.path; a.currentTime = 0;
    a.onended = () => setPlaying(null);
    void a.play().then(() => setPlaying(s.id)).catch(() => setPlaying(null));
  };

  return (
    <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={MODAL}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: "#dde3f0", letterSpacing: 1 }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#8b94a8", fontSize: 16 }}>✕</button>
        </div>

        <div style={{ padding: "8px 8px 6px", flexShrink: 0 }}>
          <input type="text" placeholder="Search…" value={search} autoFocus
            onChange={e => setSearch(e.currentTarget.value)}
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, color: "#d8d8d8",
              fontSize: 11, padding: "4px 6px", outline: "none", fontFamily: "monospace" }} />
        </div>

        <AssetFilterBar
          facets={facets} activeKey={activeKey} sel={effSel}
          onMode={setMode} onToggle={toggle} onClear={() => setSel({})}
        />

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 8px 8px",
          display: "flex", flexDirection: "column", gap: 3 }}>
          {filtered.length === 0 ? (
            <div style={{ color: "#98a2b8", fontSize: 10, textAlign: "center", paddingTop: 20 }}>
              {sounds.length === 0 ? "No sounds yet — import some in the AUDIO panel." : "No results."}
            </div>
          ) : filtered.map(s => (
            <div key={s.id} onClick={() => onPick(s.id)} title={s.id}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 6px", borderRadius: 4,
                cursor: "pointer", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <button onClick={e => { e.stopPropagation(); preview(s); }} title="Preview"
                style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 4, cursor: "pointer",
                  background: "rgba(80,140,255,0.15)", border: "1px solid rgba(80,140,255,0.3)",
                  color: "#80aaff", fontSize: 10, lineHeight: 1 }}>{playing === s.id ? "⏸" : "▶"}</button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "#c8c8c8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</div>
                <div style={{ fontSize: 9, color: "#98a2b8" }}>{s.category}{s.loop ? " · loop" : ""}{s.spatial ? " · spatial" : ""}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
