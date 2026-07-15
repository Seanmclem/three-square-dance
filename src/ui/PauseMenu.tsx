import { useEffect, useState } from "react";
import type { EventBus } from "@/core/EventBus";
import type { AudioMix } from "@/types";

const ITEMS = ["Resume", "Exit"] as const;

const DEFAULT_MIX: AudioMix = { master: 1, music: 1, sfx: 1, ambient: 1 };
const MIX_KEY = "audio_mix";

function loadMix(): AudioMix {
  try {
    const raw = localStorage.getItem(MIX_KEY);
    if (raw) return { ...DEFAULT_MIX, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_MIX };
}

interface Props {
  bus:      EventBus;
  onResume: () => void;
  onExit:   () => void;
}

/**
 * Minimal pause menu (Phase 24b). Opened/closed by App via action:cancel
 * (gamepad Start, kbm Enter, touch ⚙). While open the ControlSchemeManager is
 * in menu mode: menu:nav (kbm arrows/W/S, d-pad, left-stick flick) moves the
 * highlight, confirm (A / E / Enter /
 * tap) activates. Mouse/touch can also click the buttons or the backdrop
 * (backdrop = resume). Esc keeps its direct exit-preview path.
 */
export function PauseMenu({ bus, onResume, onExit }: Props) {
  const [selected, setSelected] = useState(0);
  const [mix, setMix] = useState<AudioMix>(loadMix);

  const setBus = (key: keyof AudioMix, value: number) => {
    const next = { ...mix, [key]: value };
    setMix(next);
    try { localStorage.setItem(MIX_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    bus.emit("audio:player-mix", { mix: next });
  };

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

        {/* Player volume mixer (Phase 36) — persists to localStorage, multiplies over
            the scene's authored mix via audio:player-mix. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "2px 0 8px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          {(["master", "music", "sfx", "ambient"] as const).map(key => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 58, fontSize: 10, fontFamily: "monospace", color: "#8890a0", letterSpacing: 1, textTransform: "uppercase" }}>{key}</span>
              <input type="range" min={0} max={1} step={0.01} value={mix[key]}
                onChange={e => setBus(key, Number(e.target.value))}
                style={{ flex: 1, accentColor: "#80aaff" }} />
              <span style={{ width: 32, textAlign: "right", fontSize: 10, fontFamily: "monospace", color: "#8890a0" }}>{Math.round(mix[key] * 100)}%</span>
            </div>
          ))}
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
