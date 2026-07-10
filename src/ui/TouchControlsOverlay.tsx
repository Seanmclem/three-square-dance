import { useRef, useState } from "react";
import type { TouchShared } from "@/input/TouchSource";

const TAP_MAX_PX = 5;      // matches InputManager._DRAG_THRESHOLD — a swipe never fires interact
const TAP_MAX_MS = 250;
const JOY_ZONE   = 0.4;    // left fraction of the screen that spawns the joystick

interface Props {
  shared: TouchShared;     // written imperatively — per-pointer-move state must not re-render React
  joystickRadius: number;
  layout: "right-jump" | "left-jump";
}

/**
 * Touch controls for preview mode (shown only while the active scheme is
 * "touch"). Floating virtual joystick on the left, drag-to-look on the rest,
 * tap = interact, plus jump and ✕ exit buttons. Multi-touch safe: the
 * joystick and look pointers are tracked independently by pointerId.
 */
export function TouchControlsOverlay({ shared, joystickRadius, layout }: Props) {
  const [joyOrigin, setJoyOrigin] = useState<{ x: number; y: number } | null>(null);
  // The origin must ALSO live in a ref: a pointermove can arrive before React
  // re-renders with the new state, and the handler closure would still see null.
  const joyOriginRef = useRef<{ x: number; y: number } | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const joyId  = useRef<number | null>(null);
  const lookId = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });
  const tapStart = useRef({ x: 0, y: 0, t: 0 });

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    if (joyId.current === null && e.clientX < window.innerWidth * JOY_ZONE) {
      joyId.current = e.pointerId;
      joyOriginRef.current = { x: e.clientX, y: e.clientY };
      setJoyOrigin(joyOriginRef.current);
    } else if (lookId.current === null) {
      lookId.current = e.pointerId;
      lookLast.current = { x: e.clientX, y: e.clientY };
      tapStart.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const origin = joyOriginRef.current;
    if (e.pointerId === joyId.current && origin) {
      let dx = e.clientX - origin.x;
      let dy = e.clientY - origin.y;
      const len = Math.hypot(dx, dy);
      if (len > joystickRadius) { dx *= joystickRadius / len; dy *= joystickRadius / len; }
      shared.move.x = dx / joystickRadius;
      shared.move.y = -dy / joystickRadius;   // screen up = forward
      if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    } else if (e.pointerId === lookId.current) {
      shared.lookPx.x += e.clientX - lookLast.current.x;
      shared.lookPx.y += e.clientY - lookLast.current.y;
      lookLast.current = { x: e.clientX, y: e.clientY };
    }
  }

  function onPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerId === joyId.current) {
      joyId.current = null;
      joyOriginRef.current = null;
      shared.move.x = shared.move.y = 0;
      setJoyOrigin(null);
    } else if (e.pointerId === lookId.current) {
      lookId.current = null;
      const t = tapStart.current;
      if (performance.now() - t.t <= TAP_MAX_MS &&
          Math.hypot(e.clientX - t.x, e.clientY - t.y) <= TAP_MAX_PX) {
        shared.interactQueued = true;
      }
    }
  }

  const btnBase: React.CSSProperties = {
    position: "absolute", borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.35)", background: "rgba(20,26,40,0.45)",
    color: "rgba(255,255,255,0.85)", fontFamily: "monospace",
    display: "flex", alignItems: "center", justifyContent: "center",
    userSelect: "none", touchAction: "none", pointerEvents: "auto",
  };
  const jumpSide = layout === "right-jump" ? { right: "calc(28px + env(safe-area-inset-right))" }
                                           : { left:  "calc(28px + env(safe-area-inset-left))" };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      style={{ position: "absolute", inset: 0, zIndex: 60, touchAction: "none", overscrollBehavior: "none" }}
    >
      {/* Joystick — ghost hint when idle, live base+knob while a thumb is down */}
      {joyOrigin ? (
        <div style={{
          position: "absolute",
          left: joyOrigin.x - joystickRadius, top: joyOrigin.y - joystickRadius,
          width: joystickRadius * 2, height: joystickRadius * 2,
          borderRadius: "50%", border: "1px solid rgba(255,255,255,0.35)",
          background: "rgba(20,26,40,0.25)", pointerEvents: "none",
        }}>
          <div ref={knobRef} style={{
            position: "absolute",
            left: joystickRadius * 0.6, top: joystickRadius * 0.6,
            width: joystickRadius * 0.8, height: joystickRadius * 0.8,
            borderRadius: "50%", background: "rgba(200,216,255,0.55)",
          }} />
        </div>
      ) : (
        <div style={{
          position: "absolute",
          left: "calc(36px + env(safe-area-inset-left))",
          bottom: "calc(36px + env(safe-area-inset-bottom))",
          width: joystickRadius * 2, height: joystickRadius * 2,
          borderRadius: "50%", border: "1px dashed rgba(255,255,255,0.2)",
          pointerEvents: "none",
        }} />
      )}

      {/* Jump */}
      <div
        onPointerDown={e => { e.stopPropagation(); shared.jumpHeld = true; }}
        onPointerUp={e => { e.stopPropagation(); shared.jumpHeld = false; }}
        onPointerCancel={e => { e.stopPropagation(); shared.jumpHeld = false; }}
        style={{ ...btnBase, ...jumpSide,
                 bottom: "calc(44px + env(safe-area-inset-bottom))",
                 width: 64, height: 64, fontSize: 11, letterSpacing: 1 }}
      >
        JUMP
      </div>

      {/* Pause menu (cancel action → App toggles the pause overlay) */}
      <div
        onPointerDown={e => e.stopPropagation()}
        onPointerUp={e => { e.stopPropagation(); shared.cancelQueued = true; }}
        style={{ ...btnBase,
                 top: "calc(16px + env(safe-area-inset-top))",
                 right: "calc(16px + env(safe-area-inset-right))",
                 width: 40, height: 40, fontSize: 16 }}
      >
        ⚙
      </div>

      {/* Inventory bag (bag toggle → App/Runtime toggles the bag overlay) */}
      <div
        onPointerDown={e => e.stopPropagation()}
        onPointerUp={e => { e.stopPropagation(); shared.bagQueued = true; }}
        style={{ ...btnBase,
                 top: "calc(64px + env(safe-area-inset-top))",
                 right: "calc(16px + env(safe-area-inset-right))",
                 width: 40, height: 40, fontSize: 16 }}
      >
        🎒
      </div>
    </div>
  );
}
