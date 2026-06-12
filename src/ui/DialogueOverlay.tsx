import { useEffect, useRef, useState } from "react";

interface DialogueState {
  speaker:   string;
  lines:     string[];
  portrait?: string;
  lineIndex: number;
}

export interface DialogueOverlayProps {
  dialogue: { speaker: string; lines: string[]; portrait?: string } | null;
  onClose:  () => void;
}

export function DialogueOverlay({ dialogue, onClose }: DialogueOverlayProps) {
  const [state, setState] = useState<DialogueState | null>(null);
  const prevDialogue = useRef(dialogue);

  // When a new dialogue is passed in, reset to line 0
  useEffect(() => {
    if (dialogue && dialogue !== prevDialogue.current) {
      setState({ ...dialogue, lineIndex: 0 });
    }
    if (!dialogue) setState(null);
    prevDialogue.current = dialogue;
  }, [dialogue]);

  function advance(): void {
    if (!state) return;
    if (state.lineIndex + 1 >= state.lines.length) {
      setState(null);
      onClose();
    } else {
      setState(s => s ? { ...s, lineIndex: s.lineIndex + 1 } : null);
    }
  }

  // Advance on E key
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyE" || e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!state) return null;

  const line = state.lines[state.lineIndex] ?? "";
  const hasMore = state.lineIndex + 1 < state.lines.length;

  return (
    <div
      onClick={advance}
      style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: "rgba(10,10,20,0.92)",
        borderTop: "1px solid rgba(255,255,255,0.12)",
        padding: "20px 32px 24px",
        cursor: "pointer",
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
      </div>
      <div style={{ color: "#555", fontSize: 11, alignSelf: "flex-end", flexShrink: 0 }}>
        {hasMore ? "▶ E to continue" : "▶ E to close"}
        {state.lines.length > 1 && (
          <span style={{ color: "#444", marginLeft: 8 }}>
            {state.lineIndex + 1}/{state.lines.length}
          </span>
        )}
      </div>
    </div>
  );
}
