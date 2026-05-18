import type { ToolId } from "@/types";
import { TOOL_ICONS, IconPlay } from "@/ui/icons";

interface ToolDef { id: ToolId; label: string; shortcut: string }

const TOOLS: ToolDef[] = [
  { id: "select",   label: "Select",   shortcut: "V" },
  { id: "floor",    label: "Floor",    shortcut: "F" },
  { id: "wall",     label: "Wall",     shortcut: "W" },
  { id: "platform", label: "Platform", shortcut: "L" },
  { id: "stair",    label: "Stair",    shortcut: "T" },
  { id: "object",   label: "Object",   shortcut: "O" },
  { id: "zone",     label: "Zone",     shortcut: "Z" },
];

interface ToolbarProps {
  activeTool:   ToolId;
  onToolSelect: (tool: ToolId) => void;
}

export function Toolbar({ activeTool, onToolSelect }: ToolbarProps) {
  return (
    <div style={{
      position: "absolute", left: 0, top: 0, bottom: 0, width: 64,
      background: "rgba(10,14,22,0.95)",
      borderRight: "1px solid rgba(80,120,180,0.2)",
      display: "flex", flexDirection: "column", alignItems: "center",
      paddingTop: 56, gap: 2, zIndex: 10,
    }}>
      {TOOLS.map(tool => {
        const active = activeTool === tool.id;
        const Icon = TOOL_ICONS[tool.id];
        const color = active ? "#80aaff" : "#5a7a9a";
        return (
          <button
            key={tool.id}
            title={`${tool.label} (${tool.shortcut})`}
            onClick={() => onToolSelect(tool.id)}
            style={{
              width: 48, height: 48, border: "none", cursor: "pointer",
              borderRadius: 8, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 2,
              background: active ? "rgba(80,140,255,0.2)" : "transparent",
              outline: active ? "1px solid rgba(80,140,255,0.45)" : "none",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(80,140,255,0.08)"; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
          >
            <Icon color={color} />
            <span style={{ fontSize: 8, letterSpacing: 0.8, color, opacity: 0.7, fontFamily: "monospace" }}>
              {tool.shortcut}
            </span>
          </button>
        );
      })}

      <div style={{ flex: 1 }} />
      <div style={{ width: 40, height: 1, background: "rgba(80,120,180,0.2)", marginBottom: 4 }} />

      <button
        title="Preview (P)"
        style={{
          width: 48, height: 48, border: "1px solid rgba(80,200,120,0.3)",
          borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(80,200,120,0.08)", cursor: "pointer", marginBottom: 8,
        }}
      >
        <IconPlay color="#80cc90" />
      </button>
    </div>
  );
}
