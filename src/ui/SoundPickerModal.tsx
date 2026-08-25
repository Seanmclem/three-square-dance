import { useState, useEffect, useRef } from "react";
import type { SoundDef } from "@/types";
import { assetManager } from "@/core/AssetManager";
import { AssetFilterBar } from "@/ui/AssetFilterBar";
import { buildFacets, matchesFacets, type FacetSel } from "@/ui/assetFilters";
import { SOUND_FACETS } from "@/ui/AudioBrowser";

interface SoundPickerModalProps {
  title:    string;
  onPick?:  (soundId: string) => void;            // single mode: a row click picks and the caller closes
  // Multi mode (when provided, replaces onPick): row clicks toggle numbered check
  // marks; closing the modal — ADD button, ✕, or clicking outside — commits every
  // checked sound IN THE ORDER CHECKED. Uncheck to cancel individual picks.
  onPickMulti?: (soundIds: string[]) => void;
  onClose:  () => void;
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
 * playlist clip picking. Single mode (onPick): click a row to pick it; the caller
 * closes the modal. Multi mode (onPickMulti): rows toggle numbered checks and every
 * close path commits them in the order checked.
 */
export function SoundPickerModal({ title, onPick, onPickMulti, onClose }: SoundPickerModalProps) {
  const [search, setSearch] = useState(savedState.search);
  const [mode,   setMode]   = useState(savedState.mode);
  const [sel,    setSel]    = useState<FacetSel>(savedState.sel);
  const [playing, setPlaying] = useState<string | null>(null);
  // Multi mode: ids in the order they were checked — that order is the commit order.
  const [picked,  setPicked]  = useState<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const multi = !!onPickMulti;
  // Every way out of the modal commits the checked picks (that's the whole flow:
  // check several, close, they're in the playlist). Unchecking is the cancel.
  const finish = () => {
    if (multi && picked.length) onPickMulti!(picked);
    onClose();
  };
  const rowClick = (id: string) => {
    if (!multi) { onPick?.(id); return; }
    setPicked(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

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
    <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) finish(); }}>
      <div style={MODAL}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: "#dde3f0", letterSpacing: 1 }}>{title}</span>
          <button onClick={finish} style={{ background: "none", border: "none", cursor: "pointer", color: "#8b94a8", fontSize: 16 }}>✕</button>
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
          ) : filtered.map(s => {
            const order = multi ? picked.indexOf(s.id) : -1;   // ≥0 = checked; shown as the add order
            return (
              <div key={s.id} onClick={() => rowClick(s.id)} title={s.id}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 6px", borderRadius: 4,
                  cursor: "pointer",
                  background: order >= 0 ? "rgba(80,140,255,0.12)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${order >= 0 ? "rgba(80,140,255,0.45)" : "rgba(255,255,255,0.05)"}` }}>
                {multi && (
                  <span style={{ width: 16, height: 16, flexShrink: 0, borderRadius: 3, fontSize: 9,
                    display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                    background: order >= 0 ? "rgba(80,140,255,0.9)" : "rgba(20,20,20,0.8)",
                    border: `1px solid ${order >= 0 ? "rgba(160,195,255,0.8)" : "rgba(255,255,255,0.3)"}` }}>
                    {order >= 0 ? order + 1 : ""}</span>
                )}
                <button onClick={e => { e.stopPropagation(); preview(s); }} title="Preview"
                  style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 4, cursor: "pointer",
                    background: "rgba(80,140,255,0.15)", border: "1px solid rgba(80,140,255,0.3)",
                    color: "#80aaff", fontSize: 10, lineHeight: 1 }}>{playing === s.id ? "⏸" : "▶"}</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#c8c8c8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</div>
                  <div style={{ fontSize: 9, color: "#98a2b8" }}>{s.category}{s.loop ? " · loop" : ""}{s.spatial ? " · spatial" : ""}</div>
                </div>
              </div>
            );
          })}
        </div>

        {multi && (
          <div style={{ padding: 8, borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
            <button onClick={finish} disabled={picked.length === 0}
              title={picked.length ? "Add the checked clips to the playlist, in the order checked" : "Check clips above to add them"}
              style={{ width: "100%", padding: "6px 0", borderRadius: 4, fontSize: 10, letterSpacing: 0.5,
                cursor: picked.length ? "pointer" : "default", fontFamily: "monospace",
                background: picked.length ? "rgba(80,140,255,0.15)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${picked.length ? "rgba(80,140,255,0.35)" : "rgba(255,255,255,0.07)"}`,
                color: picked.length ? "#80aaff" : "#555" }}>
              {picked.length ? `ADD ${picked.length} CLIP${picked.length > 1 ? "S" : ""}` : "CHECK CLIPS TO ADD"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
