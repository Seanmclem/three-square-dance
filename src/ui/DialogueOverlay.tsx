import { useEffect, useRef, useState } from "react";
import type { EventBus } from "@/core/EventBus";

interface DialogueState {
  speaker:     string;
  lines:       string[];
  portrait?:   string;
  options?:    { text: string; hasNext: boolean }[];
  lineIndex:   number;
  optionIndex: number;
}

export interface DialogueOverlayProps {
  dialogue: { speaker: string; lines: string[]; portrait?: string;
              options?: { text: string; hasNext: boolean }[] } | null;
  bus:      EventBus;
  onClose:  () => void;
}

export function DialogueOverlay({ dialogue, bus, onClose }: DialogueOverlayProps) {
  const [state, setState] = useState<DialogueState | null>(null);
  const prevDialogue = useRef(dialogue);

  // When a new dialogue (or the next tree node) is passed in, reset to line 0
  useEffect(() => {
    if (dialogue && dialogue !== prevDialogue.current) {
      setState({ ...dialogue, lineIndex: 0, optionIndex: 0 });
    }
    if (!dialogue) setState(null);
    prevDialogue.current = dialogue;
  }, [dialogue]);

  const onLastLine   = !!state && state.lineIndex + 1 >= state.lines.length;
  const options      = state?.options ?? [];
  const optionsShown = onLastLine && options.length > 0;

  function advance(): void {
    if (!state || optionsShown) return;  // once options are up, confirm selects instead
    if (onLastLine) {
      setState(null);
      onClose();
    } else {
      setState(s => s ? { ...s, lineIndex: s.lineIndex + 1 } : null);
    }
  }

  function choose(index: number): void {
    const opt = options[index];
    if (!opt) return;
    // The runner dispatches the option's effects and, if it has a next node,
    // emits a fresh dialogue:show that replaces this state via the shells.
    bus.emit("dialogue:choose", { index });
    if (!opt.hasNext) {
      setState(null);
      onClose();
    }
  }

  // Confirm advances lines / selects the highlighted option; menu:nav moves the
  // highlight. ControlSchemeManager maps every scheme's inputs onto these two bus
  // events (kbm E/Space/Enter + arrows, gamepad A + d-pad, touch) and only emits
  // them while a dialogue is open (menu mode).
  useEffect(() => {
    if (!state) return;
    const offConfirm = bus.on("action:confirm", () => {
      if (optionsShown) choose(state.optionIndex);
      else advance();
    });
    const offNav = bus.on("menu:nav", ({ dir }) => {
      if (!optionsShown) return;
      setState(s => s
        ? { ...s, optionIndex: (s.optionIndex + dir + options.length) % options.length }
        : null);
    });
    return () => { offConfirm(); offNav(); };
  });

  if (!state) return null;

  const line = state.lines[state.lineIndex] ?? "";
  const hasMore = state.lineIndex + 1 < state.lines.length;

  return (
    <div
      onClick={optionsShown ? undefined : advance}
      style={{
        // Floating box near the bottom — centered with side margins (never
        // edge-to-edge), lifted off the bottom edge + touch safe-area.
        position: "absolute",
        bottom: "calc(40px + env(safe-area-inset-bottom, 0px))",
        left: "50%", transform: "translateX(-50%)",
        width: "min(720px, calc(100% - 64px))",
        background: "rgba(10,10,20,0.92)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
        padding: "18px 24px 20px",
        cursor: optionsShown ? "default" : "pointer",
        zIndex: 100,
        display: "flex", gap: 20, alignItems: "flex-start",
      }}
    >
      {state.portrait && (
        <div style={{
          width: 64, height: 64, flexShrink: 0,
          background: "rgba(255,255,255,0.08)",
          borderRadius: 4, overflow: "hidden",
        }}>
          <img src={state.portrait} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      )}
      <div style={{ flex: 1 }}>
        <div style={{ color: "#80aaff", fontSize: 13, fontFamily: "monospace",
                      fontWeight: 600, marginBottom: 6 }}>
          {state.speaker}
        </div>
        <div style={{ color: "#d0d0d0", fontSize: 14, lineHeight: 1.6 }}>
          {line}
        </div>
        {optionsShown && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
            {options.map((opt, i) => {
              const active = i === state.optionIndex;
              return (
                <div
                  key={i}
                  onClick={e => { e.stopPropagation(); choose(i); }}
                  onMouseEnter={() => setState(s => s ? { ...s, optionIndex: i } : null)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                    color: active ? "#fff" : "#9ab",
                    background: active ? "rgba(128,170,255,0.18)" : "transparent",
                    border: `1px solid ${active ? "rgba(128,170,255,0.5)" : "transparent"}`,
                  }}
                >
                  {active ? "▸ " : "  "}{opt.text || "…"}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ color: "#555", fontSize: 11, alignSelf: "flex-end", flexShrink: 0 }}>
        {optionsShown ? "▶ E to choose" : hasMore ? "▶ E to continue" : "▶ E to close"}
        {state.lines.length > 1 && (
          <span style={{ color: "#444", marginLeft: 8 }}>
            {state.lineIndex + 1}/{state.lines.length}
          </span>
        )}
      </div>
    </div>
  );
}
