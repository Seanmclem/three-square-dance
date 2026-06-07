import { useEffect, useRef, useState } from "react";
import type { EventBus } from "@/core/EventBus";

interface Props { bus: EventBus }

export function PreviewHUD({ bus }: Props) {
  const [zoneName, setZoneName] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = bus.on("preview:zone-entered", ({ zoneName: name }) => {
      setZoneName(name);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setZoneName(null), 3000);
    });
    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [bus]);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 50 }}>

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

      {/* Esc to exit */}
      <div style={{
        position: "absolute", bottom: 16, right: 16,
        color: "rgba(255,255,255,0.35)", fontSize: 11,
        fontFamily: "monospace", letterSpacing: 1,
      }}>
        Esc · exit
      </div>
    </div>
  );
}
