import { useEffect, useState } from "react";
import * as THREE from "three";
import type { AssetDef, Vec3 } from "@/types";
import { assetManager } from "@/core/AssetManager";

interface Props {
  asset:            AssetDef;
  placedCount:      number;    // placed copies in the loaded world (for the compensate checkbox)
  needsFolderGrant: boolean;
  onCancel:         () => void;
  onApply:          (delta: Vec3, compensate: boolean) => void;
}

type Mode = "base" | "center";

const OVERLAY: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 100,
  background: "rgba(0,0,0,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center",
};
const MODAL: React.CSSProperties = {
  background: "rgba(28,28,28,0.98)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8, width: 340,
  display: "flex", flexDirection: "column",
  color: "#c0c0c0", fontFamily: "monospace", fontSize: 12,
};
const BTN = (active = true): React.CSSProperties => ({
  padding: "7px 14px", borderRadius: 4, cursor: active ? "pointer" : "default",
  fontFamily: "monospace", fontSize: 11, border: "none",
  background: active ? "rgba(80,140,255,0.2)" : "rgba(55,55,55,0.7)",
  color: active ? "#80aaff" : "#646464",
});

const fmt = (n: number): string => (Math.abs(n) < 0.0005 ? "0" : n.toFixed(2));
const isNoop = (d: Vec3): boolean => Math.abs(d.x) + Math.abs(d.y) + Math.abs(d.z) < 0.001;

/** "0.95 above the origin" / "0.14 below the origin" — plain language, no signed jargon. */
function describeBase(minY: number): string {
  if (Math.abs(minY) < 0.0005) return "exactly at the origin height";
  return `${fmt(Math.abs(minY))} ${minY > 0 ? "above" : "below"} the origin`;
}

export function ReoriginModal({ asset, placedCount, needsFolderGrant, onCancel, onApply }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [bounds, setBounds] = useState<{ min: Vec3; center: Vec3 } | null>(null);
  const [mode,   setMode]   = useState<Mode>("base");
  const [compensate, setCompensate] = useState(true);

  const isObj = /\.obj$/i.test(asset.path);

  useEffect(() => {
    if (isObj) { setStatus("error"); return; }
    let cancelled = false;
    assetManager.loadModel(asset.id)
      .then(root => {
        if (cancelled) return;
        root.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(root);
        if (box.isEmpty()) { setStatus("error"); return; }
        const c = box.getCenter(new THREE.Vector3());
        setBounds({ min: { x: box.min.x, y: box.min.y, z: box.min.z }, center: { x: c.x, y: c.y, z: c.z } });
        setStatus("ready");
      })
      .catch(err => {
        console.warn("Re-origin: model load failed", err);
        if (!cancelled) setStatus("error");
      });
    return () => { cancelled = true; };
  }, [asset.id, isObj]);

  const delta: Vec3 | null = bounds
    ? (mode === "base"
        ? { x: -bounds.center.x, y: -bounds.min.y,    z: -bounds.center.z }
        : { x: -bounds.center.x, y: -bounds.center.y, z: -bounds.center.z })
    : null;
  const noop = delta ? isNoop(delta) : false;

  return (
    <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={MODAL}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <span style={{ fontSize: 13, color: "#d8d8d8", letterSpacing: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            RE-ORIGIN — {asset.label}
          </span>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "#585870", fontSize: 16 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 12 }}>

          {status === "loading" && <span style={{ fontSize: 10, color: "#646464" }}>Loading model…</span>}
          {status === "error" && (
            <span style={{ fontSize: 10, color: "#c06060" }}>
              {isObj ? "OBJ models can't be re-origined — only GLTF/GLB." : "Could not load model."}
            </span>
          )}

          {status === "ready" && bounds && delta && (
            <>
              {/* Where the model sits now, in plain terms */}
              <div style={{ fontSize: 10, color: "#9aa3b5", lineHeight: 1.6 }}>
                The origin is where the move gizmo sits and what placement snaps to
                the ground. Right now this model's base is {describeBase(bounds.min.y)}
                {(Math.abs(bounds.center.x) > 0.0005 || Math.abs(bounds.center.z) > 0.0005) &&
                  <>, and it's off-center sideways by X {fmt(bounds.center.x)}, Z {fmt(bounds.center.z)}</>}.
              </div>

              {/* Mode choice */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {([
                  ["base",   "Base — model stands on its origin (props, plants, characters)"],
                  ["center", "Center — origin in the middle of the model (floating or spinning things)"],
                ] as [Mode, string][]).map(([m, label]) => (
                  <label key={m} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 10, color: mode === m ? "#dde3f0" : "#9aa3b5", cursor: "pointer", lineHeight: 1.5 }}>
                    <input type="radio" name="reorigin-mode" checked={mode === m} onChange={() => setMode(m)} style={{ marginTop: 1 }} />
                    {label}
                  </label>
                ))}
              </div>

              <div style={{ fontSize: 10, color: noop ? "#7a9a7a" : "#c2cadb" }}>
                {noop
                  ? "Already there — nothing to shift."
                  : `Shifts the geometry by X ${fmt(delta.x)}, Y ${fmt(delta.y)}, Z ${fmt(delta.z)} inside the file.`}
              </div>

              {/* Placed-copy compensation */}
              {placedCount > 0 && !noop && (
                <label style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 10, color: "#9aa3b5", cursor: "pointer", lineHeight: 1.5 }}>
                  <input type="checkbox" checked={compensate} onChange={e => setCompensate(e.currentTarget.checked)} style={{ marginTop: 1 }} />
                  Move the {placedCount} placed cop{placedCount === 1 ? "y" : "ies"} in this world to
                  compensate, so they stay exactly where they look now (undoable).
                </label>
              )}

              <div style={{ fontSize: 10, color: "#8a7a50", lineHeight: 1.5 }}>
                The model file itself is rewritten — that part isn't undoable, and copies
                placed in other scenes or projects will shift next time they load.
              </div>

              {needsFolderGrant && (
                <div style={{ background: "rgba(255,180,40,0.06)", border: "1px solid rgba(255,180,40,0.2)", borderRadius: 4, padding: "6px 9px", fontSize: 10, color: "#c09050" }}>
                  Saving will ask for access to <span style={{ color: "#d8b060" }}>public/assets/models</span>.
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={{ ...BTN(), background: "rgba(55,55,55,0.7)", color: "#909090" }} onClick={onCancel}>Cancel</button>
          <button
            style={BTN(status === "ready" && !noop)}
            disabled={status !== "ready" || noop || !delta}
            onClick={() => { if (delta) onApply(delta, compensate && placedCount > 0); }}
          >
            Re-origin
          </button>
        </div>
      </div>
    </div>
  );
}
