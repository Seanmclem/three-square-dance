import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DialogueNode, DialogueTreeDef } from "@/types";

// ── Dialogue flowchart — secondary read-mostly view (Phase 41) ────────────────
// The left-panel nested tree stays the primary editor; this overlay docks over
// everything to the right of the panel and draws the same DialogueTreeDef as a
// node-and-arrow graph. Clicking a box jumps to that node's card in the panel;
// dragging a box persists DialogueNode.editorPos (runtime ignores it).

const BOX_W = 220;
const PAD = 10;      // box top/bottom padding
const HEADER_H = 20; // id badge + speaker row
const LINES_H = 30;  // fixed two-line preview of the node's first line
const OPT_H = 20;    // one port row per response option
const GAP_X = 70;    // horizontal gap between boxes in a layer
const GAP_Y = 70;    // vertical gap between layers
const CHIP_DX = 52;  // end / missing chips sit this far right of their port

function boxHeight(n: DialogueNode): number {
  return PAD + HEADER_H + LINES_H + n.options.length * OPT_H + PAD;
}

function portY(optIndex: number): number {
  return PAD + HEADER_H + LINES_H + optIndex * OPT_H + OPT_H / 2;
}

// Synthetic pointer events (tests) have no active pointer to capture — don't
// let the capture bookkeeping break the drag itself.
function capture(el: Element, pointerId: number): void {
  try { el.setPointerCapture(pointerId); } catch { /* no live pointer */ }
}
function release(el: Element, pointerId: number): void {
  try { el.releasePointerCapture(pointerId); } catch { /* no live pointer */ }
}

/** Layered BFS from the start node; unreachable roots continue in layers below. */
function autoLayout(dialogue: DialogueTreeDef): Map<string, { x: number; y: number }> {
  const byId = new Map(dialogue.nodes.map((n) => [n.id, n]));
  const depth = new Map<string, number>();
  function bfs(rootId: string, rootDepth: number): void {
    if (!byId.has(rootId) || depth.has(rootId)) return;
    depth.set(rootId, rootDepth);
    const queue = [rootId];
    while (queue.length) {
      const id = queue.shift()!;
      for (const o of byId.get(id)!.options) {
        if (o.next && byId.has(o.next) && !depth.has(o.next)) {
          depth.set(o.next, depth.get(id)! + 1);
          queue.push(o.next);
        }
      }
    }
  }
  bfs(dialogue.startNode, 0);
  for (const n of dialogue.nodes) {
    bfs(n.id, (depth.size ? Math.max(...depth.values()) : -1) + 1);
  }

  const layers = new Map<number, DialogueNode[]>();
  for (const n of dialogue.nodes) {
    const d = depth.get(n.id) ?? 0;
    layers.set(d, [...(layers.get(d) ?? []), n]);
  }
  const pos = new Map<string, { x: number; y: number }>();
  let y = 0;
  for (const d of [...layers.keys()].sort((a, b) => a - b)) {
    const row = layers.get(d)!;
    const rowW = row.length * (BOX_W + GAP_X) - GAP_X;
    row.forEach((n, i) => pos.set(n.id, { x: Math.round(i * (BOX_W + GAP_X) - rowW / 2), y }));
    y += Math.max(...row.map(boxHeight)) + GAP_Y;
  }
  return pos;
}

export function DialogueFlowchart({
  dialogue,
  onChange,
  onJumpToNode,
  onClose,
}: {
  dialogue: DialogueTreeDef;
  onChange: (d: DialogueTreeDef) => void;
  onJumpToNode: (nodeId: string) => void;
  onClose: () => void;
}) {
  const byId = useMemo(() => new Map(dialogue.nodes.map((n) => [n.id, n])), [dialogue.nodes]);
  const auto = useMemo(() => autoLayout(dialogue), [dialogue]);

  // Reachability — same walk the panel uses for its Unreachable section.
  const reachable = useMemo(() => {
    const seen = new Set<string>();
    const queue = byId.has(dialogue.startNode) ? [dialogue.startNode] : [];
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const o of byId.get(id)!.options) if (o.next && byId.has(o.next)) queue.push(o.next);
    }
    return seen;
  }, [byId, dialogue.startNode]);

  // Dock left edge to the panel's live right edge (it's user-resizable).
  // Seeded synchronously so the first paint — and the fit measurement that
  // runs in the same layout pass — already use the real canvas width.
  const [left, setLeft] = useState(
    () => document.getElementById("wb-leftpanel")?.getBoundingClientRect().right ?? 64,
  );
  useLayoutEffect(() => {
    const panel = document.getElementById("wb-leftpanel");
    if (!panel) return;
    const update = () => setLeft(panel.getBoundingClientRect().right);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(panel);
    return () => ro.disconnect();
  }, []);

  // screen = world * zoom + pan
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ px: number; py: number; vx: number; vy: number } | null>(null);
  const nodeRef = useRef<{ id: string; px: number; py: number; ox: number; oy: number; moved: boolean } | null>(null);

  function posOf(n: DialogueNode): { x: number; y: number } {
    if (drag?.id === n.id) return drag;
    return n.editorPos ?? auto.get(n.id)!;
  }

  function fitTo(positions: Map<string, { x: number; y: number }>): void {
    const el = canvasRef.current;
    if (!el || dialogue.nodes.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of dialogue.nodes) {
      const p = positions.get(n.id)!;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + BOX_W + CHIP_DX + 40); // room for end chips
      maxY = Math.max(maxY, p.y + boxHeight(n) + 40);
    }
    const r = el.getBoundingClientRect();
    const zoom = Math.min(1, Math.max(0.4, Math.min(r.width / (maxX - minX + 80), r.height / (maxY - minY + 80))));
    setView({
      x: (r.width - (maxX - minX) * zoom) / 2 - minX * zoom,
      y: (r.height - (maxY - minY) * zoom) / 2 - minY * zoom,
      zoom,
    });
  }

  useLayoutEffect(() => {
    fitTo(new Map(dialogue.nodes.map((n) => [n.id, n.editorPos ?? auto.get(n.id)!])));
    // Fit once per dialogue opened — not on every edit while the chart is up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogue.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // Native wheel listener — React's root wheel handler is passive.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      setView((v) => {
        const zoom = Math.min(1.6, Math.max(0.4, v.zoom * Math.exp(-e.deltaY * 0.0015)));
        return { x: cx - ((cx - v.x) / v.zoom) * zoom, y: cy - ((cy - v.y) / v.zoom) * zoom, zoom };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function onCanvasDown(e: React.PointerEvent<HTMLDivElement>): void {
    capture(e.currentTarget, e.pointerId);
    panRef.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y };
  }
  function onCanvasMove(e: React.PointerEvent<HTMLDivElement>): void {
    const p = panRef.current;
    if (!p) return;
    setView((v) => ({ ...v, x: p.vx + e.clientX - p.px, y: p.vy + e.clientY - p.py }));
  }
  function onCanvasUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (!panRef.current) return;
    panRef.current = null;
    release(e.currentTarget, e.pointerId);
    setSelectedId(null);
  }

  function onNodeDown(e: React.PointerEvent<HTMLDivElement>, n: DialogueNode): void {
    e.stopPropagation();
    capture(e.currentTarget, e.pointerId);
    const p = posOf(n);
    nodeRef.current = { id: n.id, px: e.clientX, py: e.clientY, ox: p.x, oy: p.y, moved: false };
  }
  function onNodeMove(e: React.PointerEvent<HTMLDivElement>): void {
    const d = nodeRef.current;
    if (!d) return;
    const dx = (e.clientX - d.px) / view.zoom;
    const dy = (e.clientY - d.py) / view.zoom;
    if (Math.abs(e.clientX - d.px) + Math.abs(e.clientY - d.py) > 4) d.moved = true;
    if (d.moved) setDrag({ id: d.id, x: d.ox + dx, y: d.oy + dy });
  }
  function onNodeUp(e: React.PointerEvent<HTMLDivElement>): void {
    const d = nodeRef.current;
    if (!d) return;
    nodeRef.current = null;
    release(e.currentTarget, e.pointerId);
    e.stopPropagation();
    if (!d.moved) {
      setSelectedId(d.id);
      onJumpToNode(d.id);
      return;
    }
    // Recompute from the event, not the `drag` state — the state lags a render
    // behind and can miss the final move (or the whole drag, for fast drags).
    const x = Math.round(d.ox + (e.clientX - d.px) / view.zoom);
    const y = Math.round(d.oy + (e.clientY - d.py) / view.zoom);
    setDrag(null);
    onChange({
      ...dialogue,
      nodes: dialogue.nodes.map((n) => (n.id === d.id ? { ...n, editorPos: { x, y } } : n)),
    });
  }

  function autoArrange(): void {
    const pos = autoLayout(dialogue);
    onChange({
      ...dialogue,
      nodes: dialogue.nodes.map((n) => ({ ...n, editorPos: pos.get(n.id)! })),
    });
    // Refit from the computed positions — props won't have re-flowed yet.
    fitTo(pos);
  }

  // ── Edge + chip geometry (world space) ──────────────────────────────────────
  const edges: { d: string; color: string; key: string }[] = [];
  const chips: { x: number; y: number; text: string; color: string; key: string }[] = [];
  for (const n of dialogue.nodes) {
    const p = posOf(n);
    n.options.forEach((o, i) => {
      const x1 = p.x + BOX_W;
      const y1 = p.y + portY(i);
      if (o.next && byId.has(o.next)) {
        const t = byId.get(o.next)!;
        const tp = posOf(t);
        const x2 = tp.x + BOX_W / 2;
        const y2 = tp.y - 6;
        // Control-point reach scales with distance; loop-backs (target above
        // the source port) get a much wider sweep so the curve arcs around
        // instead of hairpinning at the port and slicing across boxes.
        const dist = Math.hypot(x2 - x1, y2 - y1);
        const k = y2 < y1 ? Math.min(280, 80 + dist * 0.5) : Math.min(160, 40 + dist * 0.25);
        edges.push({
          key: `${n.id}-${o.id}`,
          color: "rgba(128,170,255,0.75)",
          d: `M ${x1} ${y1} C ${x1 + k} ${y1}, ${x2} ${y2 - k}, ${x2} ${y2}`,
        });
      } else if (o.next) {
        edges.push({
          key: `${n.id}-${o.id}`,
          color: "rgba(220,90,90,0.9)",
          d: `M ${x1} ${y1} L ${x1 + CHIP_DX - 14} ${y1}`,
        });
        chips.push({ key: `${n.id}-${o.id}`, x: x1 + CHIP_DX, y: y1, text: `⚠ ${o.next} missing`, color: "#cc6666" });
      } else {
        edges.push({
          key: `${n.id}-${o.id}`,
          color: "rgba(150,158,175,0.55)",
          d: `M ${x1} ${y1} L ${x1 + CHIP_DX - 14} ${y1}`,
        });
        chips.push({ key: `${n.id}-${o.id}`, x: x1 + CHIP_DX, y: y1, text: "end", color: "#98a2b8" });
      }
    });
    if (n.options.length === 0) {
      const bx = p.x + BOX_W / 2;
      const by = p.y + boxHeight(n);
      edges.push({
        key: `${n.id}-end`,
        color: "rgba(150,158,175,0.55)",
        d: `M ${bx} ${by} L ${bx} ${by + 22}`,
      });
      chips.push({ key: `${n.id}-end`, x: bx, y: by + 34, text: "end", color: "#98a2b8" });
    }
  }

  // Portal to <body>: rendered in place it would inherit LeftPanel's stacking
  // context (zIndex 9) and the PropertiesPanel (zIndex 10) would draw over it.
  return createPortal(
    <div
      style={{
        position: "fixed",
        left,
        top: 48,
        right: 0,
        bottom: 0,
        zIndex: 55,
        background: "rgba(16,18,24,0.97)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "monospace",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
        }}
      >
        <span style={{ color: "#dde3f0", fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>
          Flowchart — {dialogue.label || "Dialogue"}
        </span>
        <span style={{ color: "#8b94a8", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          click a box to edit it in the panel · drag boxes · drag background to pan · scroll to zoom
        </span>
        <button
          title="Re-lay out all page nodes layer by layer from the start node (overwrites saved positions)"
          style={{
            padding: "4px 8px",
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 4,
            color: "#c0c0c0",
            fontSize: 11,
            cursor: "pointer",
          }}
          onClick={autoArrange}
        >
          Auto-arrange
        </button>
        <button
          title="Close the flowchart (Esc)"
          style={{ background: "none", border: "none", cursor: "pointer", color: "#dde3f0", fontSize: 14, padding: "0 2px" }}
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        onPointerDown={onCanvasDown}
        onPointerMove={onCanvasMove}
        onPointerUp={onCanvasUp}
        style={{ flex: 1, overflow: "hidden", position: "relative", cursor: panRef.current ? "grabbing" : "grab" }}
      >
        {dialogue.nodes.length === 0 && (
          <div style={{ color: "#8b94a8", fontSize: 11, textAlign: "center", marginTop: 60 }}>
            No page nodes yet — add one in the panel on the left.
          </div>
        )}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
            transformOrigin: "0 0",
          }}
        >
          <svg width={1} height={1} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
            <defs>
              <marker id="wb-fc-arrow" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
                <path d="M 0 0 L 8 4 L 0 8 z" fill="rgba(128,170,255,0.85)" />
              </marker>
            </defs>
            {edges.map((e) => (
              <path key={e.key} d={e.d} fill="none" stroke={e.color} strokeWidth={1.5}
                markerEnd={e.color.includes("128,170,255") ? "url(#wb-fc-arrow)" : undefined} />
            ))}
          </svg>

          {chips.map((c) => (
            <div
              key={c.key}
              style={{
                position: "absolute",
                left: c.x,
                top: c.y,
                transform: "translate(0, -50%)",
                border: `1px solid ${c.color}`,
                borderRadius: 9,
                padding: "1px 8px",
                fontSize: 9,
                color: c.color,
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}
            >
              {c.text}
            </div>
          ))}

          {dialogue.nodes.map((n) => {
            const p = posOf(n);
            const isStart = n.id === dialogue.startNode;
            const unreachable = !reachable.has(n.id);
            const selected = selectedId === n.id;
            const speaker = (n.speaker ?? dialogue.speaker ?? "NPC").toUpperCase();
            return (
              <div
                key={n.id}
                onPointerDown={(e) => onNodeDown(e, n)}
                onPointerMove={onNodeMove}
                onPointerUp={onNodeUp}
                title={unreachable
                  ? "Unreachable — nothing leads to this page node. Click to edit it in the panel."
                  : "Click to edit this page node in the panel; drag to move it"}
                style={{
                  position: "absolute",
                  left: p.x,
                  top: p.y,
                  width: BOX_W,
                  boxSizing: "border-box",
                  padding: PAD,
                  background: "rgba(34,37,46,0.97)",
                  borderRadius: 6,
                  border: unreachable ? "1px solid rgba(204,153,68,0.8)" : "1px solid rgba(255,255,255,0.12)",
                  outline: selected ? "2px solid rgba(128,170,255,0.9)" : "none",
                  cursor: "grab",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 4, height: HEADER_H, boxSizing: "border-box" }}>
                  <span
                    style={{
                      color: "#80aaff",
                      fontSize: 10,
                      background: "rgba(128,170,255,0.12)",
                      borderRadius: 3,
                      padding: "1px 6px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {n.id}
                    {isStart ? " · start" : ""}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      color: "#dde3f0",
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: 0.5,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      textAlign: "right",
                    }}
                  >
                    {speaker}
                  </span>
                </div>
                <div
                  style={{
                    height: LINES_H,
                    boxSizing: "border-box",
                    overflow: "hidden",
                    color: "#c2cadb",
                    fontSize: 10,
                    lineHeight: "15px",
                  }}
                >
                  {n.lines.filter(Boolean).length
                    ? `"${n.lines.filter(Boolean).join(" · ")}"`
                    : <span style={{ color: "#5a6474", fontStyle: "italic" }}>(no lines)</span>}
                </div>
                {n.options.map((o) => (
                  <div
                    key={o.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      height: OPT_H,
                      boxSizing: "border-box",
                      fontSize: 10,
                      color: "#98a2b8",
                    }}
                  >
                    <span style={{ color: "#5a6474" }}>▸</span>
                    <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {o.text || <span style={{ fontStyle: "italic", color: "#5a6474" }}>(response)</span>}
                    </span>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        flexShrink: 0,
                        marginRight: -PAD - 4,
                        background:
                          o.next && byId.has(o.next) ? "#80aaff" : o.next ? "#cc6666" : "#5a6474",
                      }}
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
