import { useEffect, useRef, useState } from "react";
import type { AssetDef } from "@/types";
import { assetManager } from "@/core/AssetManager";
import {
  ThumbnailStage, DEFAULT_STAGE, THUMB_SIZE, releaseThumbnailRenderer,
  type StageParams,
} from "@/editor/thumbnailRenderer";

interface Props {
  asset:            AssetDef;
  needsFolderGrant: boolean;
  onCancel:         () => void;
  onSave:           (dataUrl: string) => void;
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

export function ThumbnailStagerModal({ asset, needsFolderGrant, onCancel, onSave }: Props) {
  const [status,  setStatus]  = useState<"loading" | "ready" | "error">("loading");
  const [preview, setPreview] = useState<string | null>(null);
  const [params,  setParams]  = useState<StageParams>(DEFAULT_STAGE);

  const stageRef  = useRef<ThumbnailStage | null>(null);
  const paramsRef = useRef<StageParams>(DEFAULT_STAGE);
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
    if (stage) setPreview(stage.render(paramsRef.current));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLElement>): void => {
    const last = dragRef.current;
    if (!last) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    const p = paramsRef.current;
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
              background: "#2e2e33",
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
            drag to orbit · scroll to zoom
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
          </div>
          <div style={SLIDER_ROW}>
            <span style={{ width: 34 }}>Light</span>
            <input
              type="range" min={0.2} max={3} step={0.05} value={params.light}
              disabled={status !== "ready"}
              onChange={e => update({ light: Number(e.currentTarget.value) })}
              style={{ flex: 1 }}
            />
          </div>
          <button
            style={{ ...BTN(status === "ready"), padding: "4px 10px", alignSelf: "flex-start", fontSize: 10 }}
            disabled={status !== "ready"}
            onClick={() => update({ ...DEFAULT_STAGE })}
          >
            Reset view
          </button>

          {needsFolderGrant && (
            <div style={{ background: "rgba(255,180,40,0.06)", border: "1px solid rgba(255,180,40,0.2)", borderRadius: 4, padding: "6px 9px", fontSize: 10, color: "#c09050" }}>
              Saving will ask for access to <span style={{ color: "#d8b060" }}>public/assets/models</span>.
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={{ ...BTN(), background: "rgba(55,55,55,0.7)", color: "#909090" }} onClick={onCancel}>Cancel</button>
          <button
            style={BTN(status === "ready" && !!preview)}
            disabled={status !== "ready" || !preview}
            onClick={() => { if (preview) onSave(preview); }}
          >
            Save Thumbnail
          </button>
        </div>
      </div>
    </div>
  );
}
