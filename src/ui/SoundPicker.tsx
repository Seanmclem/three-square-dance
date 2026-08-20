import { useState, useRef } from "react";
import { assetManager } from "@/core/AssetManager";
import { SoundPickerModal } from "@/ui/SoundPickerModal";

interface SoundPickerProps {
  value:      string | undefined;
  onChange:   (soundId: string) => void;
  allowNone?: boolean;   // show a ✕ clear button (reports onChange(""))
  style?:     React.CSSProperties;
}

/**
 * A sound-asset field (Phase 36; modal since v4.79.8): a button showing the current
 * sound's label that opens `SoundPickerModal` (search + facet filters + browsable
 * list — the whole-library <select> didn't scale), a ▶ preview through a throwaway
 * <audio> element (editor preview only — the runtime AudioSystem handles in-game
 * playback), and, with `allowNone`, a ✕ clear. The modal remembers its filter state
 * across open/close, shared by every picker.
 */
export function SoundPicker({ value, onChange, allowNone, style }: SoundPickerProps) {
  const [open, setOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const label = value ? (assetManager.getSoundDef(value)?.label ?? value) : undefined;

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

  const SIDE_BTN = (enabled: boolean, tint: "blue" | "grey"): React.CSSProperties => ({
    flexShrink: 0, width: 24, height: 24, borderRadius: 4, cursor: enabled ? "pointer" : "default",
    background: enabled && tint === "blue" ? "rgba(80,140,255,0.15)" : "rgba(255,255,255,0.04)",
    border: `1px solid ${enabled && tint === "blue" ? "rgba(80,140,255,0.3)" : "rgba(255,255,255,0.07)"}`,
    color: !enabled ? "#555" : tint === "blue" ? "#80aaff" : "#8b94a8",
    fontSize: 10, lineHeight: 1,
  });

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", ...style }}>
      <button onClick={() => setOpen(true)} title={value ?? "Select a sound"}
        style={{ flex: 1, minWidth: 0, textAlign: "left", padding: "4px 6px", borderRadius: 4,
          cursor: "pointer", background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.08)",
          color: label ? "#c8c8c8" : "#8b94a8", fontSize: 11, fontFamily: "monospace",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label ?? (allowNone ? "— none —" : "Select a sound…")}
      </button>
      <button type="button" onClick={preview} disabled={!value} title="Preview"
        style={SIDE_BTN(!!value, "blue")}>▶</button>
      {allowNone && value && (
        <button type="button" onClick={() => onChange("")} title="Clear"
          style={SIDE_BTN(true, "grey")}>✕</button>
      )}
      {open && (
        <SoundPickerModal title="SELECT SOUND"
          onClose={() => setOpen(false)}
          onPick={id => { onChange(id); setOpen(false); }} />
      )}
    </div>
  );
}
