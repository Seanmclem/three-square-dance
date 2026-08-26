import { useState, useEffect } from "react";
import { assetManager } from "@/core/AssetManager";
import { SoundPickerModal } from "@/ui/SoundPickerModal";

interface SoundPickerProps {
  value:      string | undefined;
  onChange:   (soundId: string) => void;
  allowNone?: boolean;   // show a ✕ clear button (reports onChange(""))
  // Gain the ▶ preview plays at — pass the field's authored VOL so the preview
  // sounds like the runtime will. Same semantics as AudioSystem._onPlay: this
  // OVERRIDES the SoundDef's own volume (absent = def volume), capped at 4.
  previewVolume?: number;
  style?:     React.CSSProperties;
}

// One shared editor-preview output (module-level: browsers cap live AudioContexts,
// and one-at-a-time preview is the right behavior anyway). WebAudio, not <audio>,
// because an <audio> element can't apply gain above 1 — boosted VOLs would lie.
let previewCtx: AudioContext | null = null;
let previewSrc: AudioBufferSourceNode | null = null;
let previewToken = 0;

function stopPreview(): void {
  previewToken++;
  try { previewSrc?.stop(); } catch { /* not started */ }
  previewSrc = null;
}

async function playPreview(soundId: string, volume: number | undefined): Promise<void> {
  stopPreview();
  const token = previewToken;
  const def = assetManager.getSoundDef(soundId);
  if (!def) return;
  let buf: AudioBuffer;
  try { buf = await assetManager.loadSound(soundId); } catch { return; }
  if (token !== previewToken) return;   // another preview/stop won meanwhile
  const ctx = (previewCtx ??= new AudioContext());
  if (ctx.state === "suspended") void ctx.resume();
  const src  = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buf;
  gain.gain.value = Math.max(0, Math.min(4, volume ?? def.volume ?? 1));
  src.connect(gain).connect(ctx.destination);
  src.start();
  previewSrc = src;
}

/**
 * A sound-asset field (Phase 36; modal since v4.79.8): a button showing the current
 * sound's label that opens `SoundPickerModal` (search + facet filters + browsable
 * list — the whole-library <select> didn't scale), a ▶ preview through the shared
 * WebAudio path above (editor preview only — the runtime AudioSystem handles in-game
 * playback; pass `previewVolume` so the preview matches the field's authored VOL),
 * and, with `allowNone`, a ✕ clear. The modal remembers its filter state across
 * open/close, shared by every picker.
 */
export function SoundPicker({ value, onChange, allowNone, previewVolume, style }: SoundPickerProps) {
  const [open, setOpen] = useState(false);
  const label = value ? (assetManager.getSoundDef(value)?.label ?? value) : undefined;

  // Stop the shared preview when this field unmounts (e.g. navigating away mid-play).
  useEffect(() => () => stopPreview(), []);

  const preview = () => {
    if (value) void playPreview(value, previewVolume);
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
