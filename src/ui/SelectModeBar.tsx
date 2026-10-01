import type { ToolId } from "@/types";

/**
 * One-click select-mode switcher (v4.99.3), shown in the brush editor next to the
 * amber bar: Object / Face / Vertex / Edge, the same four modes as the Select tool's
 * menu and the 1–4 keys. `showLabels = false` gives a compact icons-only bar (the
 * word and key move to the tooltip). Mockup: https://claude.ai/artifact/LTrEtEiY7hD2XwtEM1zQW2
 */
const MODES: Array<{ tool: ToolId; label: string; key: string; icon: "object" | "face" | "vertex" | "edge" }> = [
  { tool: "select",        label: "Object", key: "1", icon: "object" },
  { tool: "select-face",   label: "Face",   key: "2", icon: "face" },
  { tool: "select-vertex", label: "Vertex", key: "3", icon: "vertex" },
  { tool: "select-edge",   label: "Edge",   key: "4", icon: "edge" },
];

function ModeIcon({ name }: { name: "object" | "face" | "vertex" | "edge" }) {
  const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  const cube = (op: number) => <>
    <path d="M3 5.5 8 3l5 2.5v5L8 13l-5-2.5z" {...s} opacity={op} />
    <path d="M3 5.5 8 8l5-2.5M8 8v5" {...s} opacity={op} />
  </>;
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden="true" style={{ flexShrink: 0 }}>
      {name === "object" ? cube(1) : cube(0.55)}
      {name === "face"   && <path d="M3 5.5 8 8v5l-5-2.5z" fill="currentColor" opacity={0.85} />}
      {name === "vertex" && <circle cx="8" cy="8" r="2.1" fill="currentColor" />}
      {name === "edge"   && <path d="M8 8v5" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" />}
    </svg>
  );
}

export function SelectModeBar({ activeTool, onSelect, showLabels = true }: {
  activeTool: ToolId;
  onSelect:   (tool: ToolId) => void;
  showLabels?: boolean;
}) {
  return (
    <div style={{
      position: "absolute", top: 56, left: 80, zIndex: 30,
      display: "flex", gap: 2, padding: 3,
      background: "rgba(28,28,28,0.96)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7,
      boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
    }}>
      {MODES.map(m => {
        const on = activeTool === m.tool;
        return (
          <button key={m.tool} onClick={() => onSelect(m.tool)} title={`${m.label} select (${m.key})`}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: showLabels ? "4px 10px" : "5px 7px", borderRadius: 5, cursor: "pointer",
              fontFamily: "monospace", fontSize: 11,
              border: `1px solid ${on ? "rgba(80,140,255,0.55)" : "transparent"}`,
              background: on ? "rgba(80,140,255,0.22)" : "transparent",
              color: on ? "#9dbdff" : "#dde3f0",
            }}>
            <ModeIcon name={m.icon} />
            {showLabels && <>
              <span>{m.label}</span>
              <span style={{ color: on ? "#9dbdff" : "#8f98ab", opacity: on ? 0.8 : 1, fontSize: 10 }}>{m.key}</span>
            </>}
          </button>
        );
      })}
    </div>
  );
}
