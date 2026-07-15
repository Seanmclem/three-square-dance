import { useMemo, useRef } from "react";
import type { SoundCategory } from "@/types";
import { assetManager } from "@/core/AssetManager";

interface SoundPickerProps {
  value:            string | undefined;
  onChange:         (soundId: string) => void;
  /** Optional category filter — e.g. only Music tracks for the music picker. */
  filterCategory?:  SoundCategory;
  allowNone?:       boolean;   // include a "— none —" option
  style?:           React.CSSProperties;
}

const selectStyle: React.CSSProperties = {
  flex: 1, minWidth: 0,
  background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 4, color: "#c0c0c0", fontSize: 11, padding: "4px 6px", outline: "none",
};

/**
 * A sound-asset dropdown (Phase 36) backed by the AssetManager library, with a ▶
 * preview button that plays the file through a throwaway <audio> element (editor
 * preview only — the runtime AudioSystem handles in-game playback). Reads the list
 * directly from assetManager so callers don't have to thread a `sounds` prop.
 */
export function SoundPicker({ value, onChange, filterCategory, allowNone, style }: SoundPickerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sounds = useMemo(() => {
    const list = assetManager.getSoundList();
    return filterCategory ? list.filter(s => s.category === filterCategory) : list;
  }, [filterCategory]);

  const preview = () => {
    if (!value) return;
    const def = assetManager.getSoundDef(value);
    if (!def) return;
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    a.src = def.path;
    a.currentTime = 0;
    void a.play().catch(() => { /* autoplay / decode failure — ignore */ });
  };

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", ...style }}>
      <select
        value={value ?? ""}
        onChange={e => onChange(e.currentTarget.value)}
        style={selectStyle}
      >
        {(allowNone || !value) && <option value="">{allowNone ? "— none —" : "Select a sound…"}</option>}
        {sounds.map(s => (
          <option key={s.id} value={s.id}>{s.label} · {s.category}</option>
        ))}
      </select>
      <button
        type="button" onClick={preview} disabled={!value} title="Preview"
        style={{
          flexShrink: 0, width: 24, height: 24, borderRadius: 4, cursor: value ? "pointer" : "default",
          background: value ? "rgba(80,140,255,0.15)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${value ? "rgba(80,140,255,0.3)" : "rgba(255,255,255,0.07)"}`,
          color: value ? "#80aaff" : "#555", fontSize: 10, lineHeight: 1,
        }}
      >▶</button>
    </div>
  );
}
