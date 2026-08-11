import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { AssetDef, Vec3 } from "@/types";
import { assetManager } from "@/core/AssetManager";
import {
  ThumbnailStage, DEFAULT_STAGE, THUMB_SIZE, releaseThumbnailRenderer,
  type StageParams,
} from "@/editor/thumbnailRenderer";

interface Props {
  asset:            AssetDef;
  placedCount:      number;    // placed copies in the loaded world (for the compensate checkbox)
  onCancel:         () => void;
  onApply:          (delta: Vec3, compensate: boolean) => void;
}

type Mode = "base" | "center";

// Marker palette — dots in the radio labels/legend match the preview markers.
const COL_ORIGIN = "#ffb347";
const COL_BASE   = "#6fd08c";
const COL_CENTER = "#80aaff";

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
const DOT = (color: string): React.CSSProperties => ({
  display: "inline-block", width: 8, height: 8, borderRadius: "50%",
  background: color, marginRight: 5, verticalAlign: "middle",
});

const fmt = (n: number): string => (Math.abs(n) < 0.0005 ? "0" : n.toFixed(2));
const isNoop = (d: Vec3): boolean => Math.abs(d.x) + Math.abs(d.y) + Math.abs(d.z) < 0.001;

/** "0.95 above the origin" / "0.14 below the origin" — plain language, no signed jargon. */
function describeBase(minY: number): string {
  if (Math.abs(minY) < 0.0005) return "exactly at the origin height";
  return `${fmt(Math.abs(minY))} ${minY > 0 ? "above" : "below"} the origin`;
}

/** The preview's origin/target markers: built once per model, re-styled per mode. */
interface MarkerRig {
  base:     THREE.Mesh;
  center:   THREE.Mesh;
  line:     THREE.Line;
  lineGeo:  THREE.BufferGeometry;
  targets:  { base: THREE.Vector3; center: THREE.Vector3 };
}

function buildMarkers(box: THREE.Box3): { group: THREE.Group; rig: MarkerRig } {
  const c = box.getCenter(new THREE.Vector3());
  const r = Math.max(box.getSize(new THREE.Vector3()).length() * 0.022, 1e-3);
  const group = new THREE.Group();

  const onTop = { depthTest: false, transparent: true } as const;
  const sphere = (color: string, pos: THREE.Vector3): THREE.Mesh => {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(r, 16, 12),
      new THREE.MeshBasicMaterial({ color, ...onTop }),
    );
    m.position.copy(pos);
    m.renderOrder = 999;
    group.add(m);
    return m;
  };

  // Current origin: amber sphere + axis cross so it reads as "the pivot".
  const origin = new THREE.Vector3(0, 0, 0);
  sphere(COL_ORIGIN, origin);
  const L = r * 3.2;
  const crossGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-L, 0, 0), new THREE.Vector3(L, 0, 0),
    new THREE.Vector3(0, -L, 0), new THREE.Vector3(0, L, 0),
    new THREE.Vector3(0, 0, -L), new THREE.Vector3(0, 0, L),
  ]);
  const cross = new THREE.LineSegments(crossGeo, new THREE.LineBasicMaterial({ color: COL_ORIGIN, ...onTop, opacity: 0.9 }));
  cross.renderOrder = 999;
  group.add(cross);

  const targets = {
    base:   new THREE.Vector3(c.x, box.min.y, c.z),
    center: c.clone(),
  };
  const base   = sphere(COL_BASE, targets.base);
  const center = sphere(COL_CENTER, targets.center);

  // Motion line: current origin → the selected target (restyled per mode).
  const lineGeo = new THREE.BufferGeometry().setFromPoints([origin, targets.base]);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: COL_BASE, ...onTop, opacity: 0.8 }));
  line.renderOrder = 998;
  group.add(line);

  return { group, rig: { base, center, line, lineGeo, targets } };
}

/** Emphasize the selected target: full-bright + bigger; the other dims. */
function styleMarkers(rig: MarkerRig, mode: Mode): void {
  const sel = mode === "base" ? rig.base : rig.center;
  const oth = mode === "base" ? rig.center : rig.base;
  sel.scale.setScalar(1.3);
  (sel.material as THREE.MeshBasicMaterial).opacity = 1;
  oth.scale.setScalar(0.85);
  (oth.material as THREE.MeshBasicMaterial).opacity = 0.35;
  (rig.line.material as THREE.LineBasicMaterial).color.set(mode === "base" ? COL_BASE : COL_CENTER);
  rig.lineGeo.setFromPoints([new THREE.Vector3(0, 0, 0), rig.targets[mode]]);
}

export function ReoriginModal({ asset, placedCount, onCancel, onApply }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [bounds, setBounds] = useState<{ min: Vec3; center: Vec3 } | null>(null);
  const [mode,   setMode]   = useState<Mode>("base");
  const [compensate, setCompensate] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);

  const stageRef  = useRef<ThumbnailStage | null>(null);
  const rigRef    = useRef<MarkerRig | null>(null);
  const paramsRef = useRef<StageParams>(DEFAULT_STAGE);
  const modeRef   = useRef<Mode>("base");
  const dragRef   = useRef<{ x: number; y: number } | null>(null);

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

        // Stage the model together with the markers so the framing bbox includes
        // the current origin even when it sits well outside the geometry.
        const { group, rig } = buildMarkers(box);
        group.add(root);
        rigRef.current = rig;
        styleMarkers(rig, modeRef.current);
        const stage = new ThumbnailStage(group);
        stageRef.current = stage;
        setPreview(stage.render(paramsRef.current));
        setStatus("ready");
      })
      .catch(err => {
        console.warn("Re-origin: model load failed", err);
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      stageRef.current?.dispose();
      stageRef.current = null;
      rigRef.current = null;
      releaseThumbnailRenderer();
    };
  }, [asset.id, isObj]);

  const rerender = (): void => {
    const stage = stageRef.current;
    if (stage) setPreview(stage.render(paramsRef.current));
  };

  const pickMode = (m: Mode): void => {
    modeRef.current = m;
    setMode(m);
    const rig = rigRef.current;
    if (rig) { styleMarkers(rig, m); rerender(); }
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
    paramsRef.current = {
      ...p,
      yaw:   p.yaw - dx * 0.01,
      pitch: Math.min(1.45, Math.max(-1.35, p.pitch + dy * 0.01)),
    };
    rerender();
  };
  const onPointerUp = (): void => { dragRef.current = null; };
  const onWheel = (e: React.WheelEvent): void => {
    const p = paramsRef.current;
    paramsRef.current = { ...p, zoom: Math.min(3, Math.max(0.4, p.zoom * Math.exp(-e.deltaY * 0.001))) };
    rerender();
  };

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

          {status === "error" && (
            <span style={{ fontSize: 10, color: "#c06060" }}>
              {isObj ? "OBJ models can't be re-origined — only GLTF/GLB." : "Could not load model."}
            </span>
          )}

          {status !== "error" && (
            <>
              {/* Preview — model + origin/target markers */}
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
                {status === "ready" && preview && (
                  <img src={preview} alt={asset.label} draggable={false} style={{ width: "100%", height: "100%", pointerEvents: "none" }} />
                )}
              </div>
              <div style={{ fontSize: 9, color: "#585858", textAlign: "center", marginTop: -6 }}>
                <span style={DOT(COL_ORIGIN)} />origin now &nbsp;·&nbsp; drag to orbit · scroll to zoom
              </div>
            </>
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

              {/* Mode choice — dots match the preview markers */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {([
                  ["base",   COL_BASE,   "Base — model stands on its origin (props, plants, characters)"],
                  ["center", COL_CENTER, "Center — origin in the middle of the model (floating or spinning things)"],
                ] as [Mode, string, string][]).map(([m, color, label]) => (
                  <label key={m} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 10, color: mode === m ? "#dde3f0" : "#9aa3b5", cursor: "pointer", lineHeight: 1.5 }}>
                    <input type="radio" name="reorigin-mode" checked={mode === m} onChange={() => pickMode(m)} style={{ marginTop: 1 }} />
                    <span><span style={DOT(color)} />{label}</span>
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
