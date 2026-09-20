import { useEffect, useRef, useState } from "react";
import type { EventBus } from "@/core/EventBus";
import type { Vec3 } from "@/types";

/**
 * Right-click menu for the editor viewport (Phase 76). A right-click that did NOT drag
 * (InputManager's `input:rightclick` — a drag is a camera orbit and never fires it) opens
 * a small list of things to do AT the clicked point, which InputManager already raycast
 * (`surfacePos` = the real surface hit, else the ground plane).
 *
 * Existing right-click gestures keep priority: WallSplitter (right-click a wall = split it)
 * and BrushVertexEditor (right-click a corner = delete it) mark the event `handled`; every
 * listener runs synchronously inside emit(), so the flag is read a tick later.
 *
 * One entry today: move the initial spawn here. Add entries to `items` as they come.
 */
export function ViewportContextMenu({ bus, enabled, hasSpawn }: {
  bus: EventBus;
  /** Select tool, not in preview — placement tools use right-click to cancel. */
  enabled: boolean;
  hasSpawn: boolean;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number; at: Vec3 } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => bus.on("input:rightclick", (e) => {
    if (!enabledRef.current) return;
    setTimeout(() => {
      if (e.handled || !enabledRef.current) return;
      setMenu({ x: e.screenPos.x, y: e.screenPos.y, at: e.surfacePos ?? e.worldPos });
    }, 0);
  }), [bus]);

  useEffect(() => { if (!enabled) setMenu(null); }, [enabled]);

  // Any press outside the menu, Escape, or a scroll (the camera is about to move) closes it.
  useEffect(() => {
    if (!menu) return;
    const close = (ev: Event) => { if (!ref.current?.contains(ev.target as Node)) setMenu(null); };
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") setMenu(null); };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("wheel", close, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("wheel", close, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [menu]);

  if (!menu) return null;
  const items = [
    { label: hasSpawn ? "Move initial spawn here" : "Set initial spawn here",
      run: () => bus.emit("spawn:move-to", { position: menu.at }) },
  ];
  const W = 208, ITEM_H = 28;
  const left = Math.min(menu.x, window.innerWidth - W - 8);
  const top  = Math.min(menu.y, window.innerHeight - (items.length * ITEM_H + 40));
  const f = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
  return (
    <div ref={ref} onContextMenu={e => e.preventDefault()} style={{
      position: "fixed", left, top, width: W, zIndex: 60, padding: 4,
      background: "rgba(16,20,30,0.97)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 6,
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)", fontFamily: "monospace",
    }}>
      <div style={{ color: "#c2cadb", fontSize: 10, letterSpacing: 1, padding: "4px 8px 8px" }}>
        AT {f(menu.at.x)}, {f(menu.at.y)}, {f(menu.at.z)}
      </div>
      {items.map(it => (
        <button key={it.label} onClick={() => { it.run(); setMenu(null); }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(77,140,255,0.22)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          style={{ display: "block", width: "100%", height: ITEM_H, textAlign: "left", padding: "0 8px",
                   background: "transparent", border: "none", borderRadius: 4, cursor: "pointer",
                   color: "#dde3f0", fontSize: 12, fontFamily: "monospace" }}>
          {it.label}
        </button>
      ))}
    </div>
  );
}
