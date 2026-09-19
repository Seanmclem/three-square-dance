import { useEffect, useState } from "react";
import type { EventBus } from "@/core/EventBus";
import type { BusEvents } from "@/types";

/**
 * Last-jump readout (Phase 70) — sits under the perf counter while playing.
 * CharacterController measures every airborne stretch and emits
 * `character:jump-stats` on landing; this shows the most recent one, so jump
 * height / distance can be tuned against the measured gaps in a test room
 * instead of by feel. Editor preference, off by default. `pointerEvents: none`.
 */
export function JumpReadout({ bus }: { bus: EventBus }) {
  const [s, setS] = useState<BusEvents["character:jump-stats"] | null>(null);
  useEffect(() => bus.on("character:jump-stats", setS), [bus]);

  const landed = !s || Math.abs(s.drop) < 0.05 ? "level"
    : `${Math.abs(s.drop).toFixed(2)}m ${s.drop > 0 ? "higher" : "lower"}`;
  return (
    <div style={{
      position: "absolute", top: 76, left: 64, zIndex: 40, pointerEvents: "none",
      fontSize: 10, fontFamily: "monospace", letterSpacing: 1, color: "#dde3f0",
      background: "rgba(10,14,22,0.55)", padding: "2px 6px", borderRadius: 4,
      display: "flex", gap: 8,
    }}>
      {s ? (
        <>
          <span title="peak height above the takeoff point">up {s.height.toFixed(2)}m</span>
          <span title="horizontal distance from takeoff to landing">across {s.distance.toFixed(2)}m</span>
          <span title="time in the air">{s.airTime.toFixed(2)}s</span>
          <span title="landing height relative to takeoff" style={{ color: "#c2cadb" }}>landed {landed}</span>
        </>
      ) : <span>jump to measure</span>}
    </div>
  );
}
