import { useEffect, useRef, useState } from "react";
import type { AssetDef } from "@/types";
import { assetManager } from "@/core/AssetManager";
import {
  ThumbnailStage, DEFAULT_STAGE, THUMB_SIZE, releaseThumbnailRenderer,
  type StageParams,
} from "@/editor/thumbnailRenderer";

interface Props {
  asset:            AssetDef;
  onCancel:         () => void;
  onSave:           (dataUrl: string) => void;
  // Icon mode (Phase 48): transparent-background render saved into the graphics
  // library instead of overwriting the model thumbnail.
  onSaveIcon?:            (dataUrl: string) => void;
}

const OVERLAY: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 100,
  background: "rgba(0,0,0,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center",
};
const MODAL: React.CSSProperties = {
  background: "rgba(28,28,28,0.98)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8, width: 320,
  display: "flex", flexDirection: "column",
  color: "#c0c0c0", fontFamily: "monospace", fontSize: 12,
};
const BTN = (active = true): React.CSSProperties => ({
  padding: "7px 14px", borderRadius: 4, cursor: active ? "pointer" : "default",
  fontFamily: "monospace", fontSize: 11, border: "none",
  background: active ? "rgba(80,140,255,0.2)" : "rgba(55,55,55,0.7)",
  color: active ? "#80aaff" : "#646464",
});
const SLIDER_ROW: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: "#7a7a7a",
};
const NUM_INPUT: React.CSSProperties = {
  width: 52, boxSizing: "border-box", flexShrink: 0,
  background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 4, color: "#c0c0c0", fontFamily: "monospace", fontSize: 10,
  padding: "3px 5px", outline: "none",
};

// Numeric twin of a slider: free typing via a local draft (so "0.5" isn't
// clamped at "0"), live-commits clamped values, snaps display back on blur.
function NumField({ value, min, max, step, disabled, onCommit, width }: {
  value: number; min: number; max: number; step: number;
  disabled: boolean; onCommit: (n: number) => void; width?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number" min={min} max={max} step={step} disabled={disabled}
      value={draft ?? String(Math.round(value * 100) / 100)}
      onChange={e => {
        const t = e.currentTarget.value;
        setDraft(t);
        const n = Number(t);
        if (t.trim() !== "" && Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, n)));
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
      style={width ? { ...NUM_INPUT, width } : NUM_INPUT}
    />
  );
}

export function ThumbnailStagerModal({ asset, onCancel, onSave, onSaveIcon }: Props) {
  const [status,  setStatus]  = useState<"loading" | "ready" | "error">("loading");
  const [preview, setPreview] = useState<string | null>(null);
  const [params,  setParams]  = useState<StageParams>(DEFAULT_STAGE);
  const [iconMode, setIconMode] = useState(false);

  const stageRef  = useRef<ThumbnailStage | null>(null);
  const paramsRef = useRef<StageParams>(DEFAULT_STAGE);
  const iconRef   = useRef(false);
  const dragRef   = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    assetManager.loadModel(asset.id)
      .then(root => {
        if (cancelled) return;
        const stage = new ThumbnailStage(root);
        stageRef.current = stage;
        if (stage.isEmpty) { setStatus("error"); return; }
        setPreview(stage.render(paramsRef.current));
        setStatus("ready");
      })
      .catch(err => {
        console.warn("Thumbnail stager: model load failed", err);
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      stageRef.current?.dispose();
      stageRef.current = null;
      releaseThumbnailRenderer();
    };
  }, [asset.id]);

  const update = (patch: Partial<StageParams>): void => {
    paramsRef.current = { ...paramsRef.current, ...patch };
    setParams(paramsRef.current);
    const stage = stageRef.current;
    if (stage) setPreview(stage.render(paramsRef.current, { transparent: iconRef.current }));
  };

  const setMode = (icon: boolean): void => {
    iconRef.current = icon;
    setIconMode(icon);
    const stage = stageRef.current;
    if (stage) setPreview(stage.render(paramsRef.current, { transparent: icon }));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY };
  };
  const clampPan = (n: number): number => Math.min(2, Math.max(-2, n));
  const nudge = (dx: number, dy: number): void => {
    const p = paramsRef.current;
    update({ panX: clampPan((p.panX ?? 0) + dx), panY: clampPan((p.panY ?? 0) + dy) });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>): void => {
    const last = dragRef.current;
    if (!last) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    const p = paramsRef.current;
    if (e.shiftKey) {
      // Pan instead of orbit; /zoom keeps the drag ~1:1 with the cursor when zoomed in.
      const k = 0.004 / p.zoom;
      update({ panX: clampPan((p.panX ?? 0) + dx * k), panY: clampPan((p.panY ?? 0) - dy * k) });
      return;
    }
    update({
      yaw:   p.yaw - dx * 0.01,
      pitch: Math.min(1.45, Math.max(-1.35, p.pitch + dy * 0.01)),
    });
  };
  const onPointerUp = (): void => { dragRef.current = null; };
  const onWheel = (e: React.WheelEvent): void => {
    const zoom = Math.min(3, Math.max(0.4, paramsRef.current.zoom * Math.exp(-e.deltaY * 0.001)));
    update({ zoom });
  };

  return (
    <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={MODAL}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <span style={{ fontSize: 13, color: "#d8d8d8", letterSpacing: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            STAGE THUMBNAIL — {asset.label}
          </span>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "#585870", fontSize: 16 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Preview */}
          <div
            onPointerDown={status === "ready" ? onPointerDown : undefined}
            onPointerMove={status === "ready" ? onPointerMove : undefined}
            onPointerUp={onPointerUp}
            onWheel={status === "ready" ? onWheel : undefined}
            style={{
              width: THUMB_SIZE, height: THUMB_SIZE, alignSelf: "center",
              borderRadius: 5, overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.08)",
              // Icon mode: checkerboard so the transparent background reads correctly.
              background: iconMode ? "#4a4a4a" : "#2e2e33",
              backgroundImage: iconMode
                ? "linear-gradient(45deg, #3a3a3a 25%, transparent 25%, transparent 75%, #3a3a3a 75%), linear-gradient(45deg, #3a3a3a 25%, transparent 25%, transparent 75%, #3a3a3a 75%)"
                : "none",
              backgroundSize: iconMode ? "16px 16px, 16px 16px" : "auto",
              backgroundPosition: iconMode ? "0 0, 8px 8px" : "0 0",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: status === "ready" ? "grab" : "default",
              touchAction: "none", userSelect: "none",
            }}
          >
            {status === "loading" && <span style={{ fontSize: 10, color: "#646464" }}>Loading model…</span>}
            {status === "error"   && <span style={{ fontSize: 10, color: "#c06060" }}>Could not load model.</span>}
            {status === "ready" && preview && (
              <img src={preview} alt={asset.label} draggable={false} style={{ width: "100%", height: "100%", pointerEvents: "none" }} />
            )}
          </div>
          <div style={{ fontSize: 9, color: "#585858", textAlign: "center" }}>
            drag to orbit · scroll to zoom · shift-drag to move
          </div>

          {/* Sliders */}
          <div style={SLIDER_ROW}>
            <span style={{ width: 34 }}>Zoom</span>
            <input
              type="range" min={0.4} max={3} step={0.01} value={params.zoom}
              disabled={status !== "ready"}
              onChange={e => update({ zoom: Number(e.currentTarget.value) })}
              style={{ flex: 1 }}
            />
            <NumField value={params.zoom} min={0.4} max={3} step={0.01}
              disabled={status !== "ready"} onCommit={n => update({ zoom: n })} />
          </div>
          <div style={SLIDER_ROW}>
            <span style={{ width: 34 }}>Light</span>
            <input
              type="range" min={0.2} max={3} step={0.05} value={params.light}
              disabled={status !== "ready"}
              onChange={e => update({ light: Number(e.currentTarget.value) })}
              style={{ flex: 1 }}
            />
            <NumField value={params.light} min={0.2} max={3} step={0.05}
              disabled={status !== "ready"} onCommit={n => update({ light: n })} />
          </div>
          <div style={{ ...SLIDER_ROW, gap: 5 }}>
            <span style={{ width: 34 }}>Move</span>
            {([["◀", -0.05, 0], ["▶", 0.05, 0], ["▲", 0, 0.05], ["▼", 0, -0.05]] as const).map(([glyph, dx, dy]) => (
              <button key={glyph} disabled={status !== "ready"} onClick={() => nudge(dx, dy)}
                title="Nudge the model in the frame"
                style={{ ...BTN(status === "ready"), padding: "3px 0", width: 20, fontSize: 9, flexShrink: 0 }}>
                {glyph}
              </button>
            ))}
            <span style={{ marginLeft: "auto" }}>X</span>
            <NumField value={params.panX ?? 0} min={-2} max={2} step={0.05} width={56}
              disabled={status !== "ready"} onCommit={n => update({ panX: n })} />
            <span>Y</span>
            <NumField value={params.panY ?? 0} min={-2} max={2} step={0.05} width={56}
              disabled={status !== "ready"} onCommit={n => update({ panY: n })} />
          </div>
          <button
            style={{ ...BTN(status === "ready"), padding: "4px 10px", alignSelf: "flex-start", fontSize: 10 }}
            disabled={status !== "ready"}
            onClick={() => update({ ...DEFAULT_STAGE })}
          >
            Reset view
          </button>

          {onSaveIcon && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#9aa3b5", cursor: "pointer" }}>
              <input type="checkbox" checked={iconMode} onChange={e => setMode(e.currentTarget.checked)} />
              Icon (transparent background) — saved to the graphics library
            </label>
          )}

        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={{ ...BTN(), background: "rgba(55,55,55,0.7)", color: "#909090" }} onClick={onCancel}>Cancel</button>
          <button
            style={BTN(status === "ready" && !!preview)}
            disabled={status !== "ready" || !preview}
            onClick={() => { if (preview) (iconMode && onSaveIcon ? onSaveIcon : onSave)(preview); }}
          >
            {iconMode ? "Save Icon" : "Save Thumbnail"}
          </button>
        </div>
      </div>
    </div>
  );
}
