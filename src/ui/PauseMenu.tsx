import { useEffect, useState } from "react";
import type { EventBus } from "@/core/EventBus";

const ITEMS = ["Resume", "Exit"] as const;

interface Props {
  bus:      EventBus;
  onResume: () => void;
  onExit:   () => void;
}

/**
 * Minimal pause menu (Phase 24b). Opened/closed by App via action:cancel
 * (gamepad Start, kbm Enter, touch ⚙). While open the ControlSchemeManager is
 * in menu mode: d-pad → menu:nav moves the highlight, confirm (A / E / Enter /
 * tap) activates. Mouse/touch can also click the buttons or the backdrop
 * (backdrop = resume). Esc keeps its direct exit-preview path.
 */
export function PauseMenu({ bus, onResume, onExit }: Props) {
  const [selected, setSelected] = useState(0);

  // Re-subscribed whenever `selected` changes so the confirm closure is never
  // stale (updater-side effects would double-fire under StrictMode).
  useEffect(() => {
    const unsubs = [
      bus.on("menu:nav", ({ dir }) =>
        setSelected(s => (s + dir + ITEMS.length) % ITEMS.length)),
      bus.on("action:confirm", () => (selected === 0 ? onResume : onExit)()),
    ];
    return () => unsubs.forEach(u => u());
  }, [bus, onResume, onExit, selected]);

  return (
    <div
      onClick={onResume}
      style={{
        position: "absolute", inset: 0, zIndex: 110,
        background: "rgba(5,8,14,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "rgba(10,14,22,0.95)", border: "1px solid rgba(100,160,255,0.3)",
          borderRadius: 8, padding: "24px 40px", minWidth: 220,
          display: "flex", flexDirection: "column", gap: 10,
        }}
      >
        <div style={{
          color: "#c8d8ff", fontSize: 14, fontFamily: "monospace",
          letterSpacing: 2, textAlign: "center", marginBottom: 6,
        }}>
          PAUSED
        </div>
        {ITEMS.map((label, i) => (
          <button
            key={label}
            onClick={i === 0 ? onResume : onExit}
            onMouseEnter={() => setSelected(i)}
            style={{
              padding: "8px 16px", borderRadius: 6, cursor: "pointer",
              fontSize: 12, fontFamily: "monospace", letterSpacing: 1,
              background: selected === i ? "rgba(80,140,255,0.25)" : "rgba(40,40,40,0.9)",
              border: `1px solid ${selected === i ? "rgba(80,140,255,0.6)" : "rgba(255,255,255,0.12)"}`,
              color: selected === i ? "#80aaff" : "#9090a0",
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
