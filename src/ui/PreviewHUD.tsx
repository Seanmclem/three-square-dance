import { useEffect, useRef, useState } from "react";
import type { EventBus } from "@/core/EventBus";

type Scheme = "kbm" | "gamepad" | "touch";

// Scheme-specific glyphs for the two prompts the HUD renders. Touch has no
// menu/exit hint — the overlay's ⚙ button is the affordance.
const INTERACT_PREFIX: Record<Scheme, string> = { kbm: "[E]", gamepad: "[LB]", touch: "Tap ·" };
const EXIT_HINT:       Record<Scheme, string | null> = {
  kbm: "Enter · menu   Esc · exit",
  gamepad: "Start · menu",
  touch: null,
};

interface Props { bus: EventBus; activeZoneName?: string; scheme: Scheme }

export function PreviewHUD({ bus, activeZoneName, scheme }: Props) {
  const [zoneName,      setZoneName]      = useState<string | null>(null);
  const [interactLabel, setInteractLabel] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubs = [
      bus.on("preview:zone-entered", ({ zoneName: name }) => {
        setZoneName(name);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setZoneName(null), 3000);
      }),
      bus.on("character:interact-range", payload => {
        setInteractLabel(payload ? payload.label : null);
      }),
    ];
    return () => {
      unsubs.forEach(u => u());
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [bus]);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 50 }}>

      {/* Top-left: current zone name */}
      {activeZoneName && (
        <div style={{
          position: "absolute", top: 16, left: 80,
          color: "rgba(200,216,255,0.55)", fontSize: 11,
          fontFamily: "monospace", letterSpacing: 1,
        }}>
          {activeZoneName}
        </div>
      )}

      {/* Crosshair */}
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: 18, height: 18,
      }}>
        <div style={{
          position: "absolute", top: "50%", left: 0, right: 0, height: 1,
          background: "rgba(255,255,255,0.75)", transform: "translateY(-50%)",
        }} />
        <div style={{
          position: "absolute", left: "50%", top: 0, bottom: 0, width: 1,
          background: "rgba(255,255,255,0.75)", transform: "translateX(-50%)",
        }} />
      </div>

      {/* Interact prompt */}
      {interactLabel && (
        <div style={{
          position: "absolute", top: "calc(50% + 24px)", left: "50%",
          transform: "translateX(-50%)",
          color: "rgba(255,255,255,0.85)", fontSize: 12,
          fontFamily: "monospace", letterSpacing: 1,
          background: "rgba(0,0,0,0.45)", borderRadius: 4, padding: "2px 8px",
        }}>
          {INTERACT_PREFIX[scheme]} {interactLabel}
        </div>
      )}

      {/* Zone name toast */}
      {zoneName && (
        <div style={{
          position: "absolute", top: 72, left: "50%", transform: "translateX(-50%)",
          background: "rgba(10,14,22,0.85)", border: "1px solid rgba(100,160,255,0.3)",
          borderRadius: 6, padding: "6px 20px",
          color: "#c8d8ff", fontSize: 13, fontFamily: "monospace", letterSpacing: 2,
        }}>
          {zoneName}
        </div>
      )}

      {/* Exit hint (scheme-specific; touch relies on the overlay's ✕ button) */}
      {EXIT_HINT[scheme] && (
        <div style={{
          position: "absolute", bottom: 16, right: 16,
          color: "rgba(255,255,255,0.35)", fontSize: 11,
          fontFamily: "monospace", letterSpacing: 1,
        }}>
          {EXIT_HINT[scheme]}
        </div>
      )}
    </div>
  );
}
