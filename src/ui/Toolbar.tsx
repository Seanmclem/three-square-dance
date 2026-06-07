import type { ToolId, LeftPanelId } from "@/types";
import { TOOL_ICONS, IconPlay } from "@/ui/icons";

interface ToolDef { id: ToolId; label: string; shortcut: string }

const TOOLS: ToolDef[] = [
  { id: "select",     label: "Select",   shortcut: "V" },
  { id: "floor",      label: "Floor",    shortcut: "F" },
  { id: "poly-floor", label: "Poly Flr", shortcut: "P" },
  { id: "wall",       label: "Wall",     shortcut: "W" },
  { id: "platform",        label: "Platform", shortcut: "L" },
  { id: "poly-platform",   label: "Poly Plat", shortcut: "K" },
  { id: "stair",           label: "Stair",     shortcut: "T" },
  { id: "object",     label: "Object",   shortcut: "O" },
  { id: "zone",       label: "Zone",     shortcut: "Z" },
];

interface ToolbarProps {
  activeTool:   ToolId;
  openPanel:    LeftPanelId;
  onToolSelect: (tool: ToolId) => void;
  onPreview?:   () => void;
  isPreview?:   boolean;
}

export function Toolbar({ activeTool, openPanel, onToolSelect, onPreview, isPreview }: ToolbarProps) {
  return (
    <div style={{
      position: "absolute", left: 0, top: 0, bottom: 0, width: 64,
      background: "rgba(28,28,28,0.95)",
      borderRight: "1px solid rgba(255,255,255,0.08)",
      display: "flex", flexDirection: "column", alignItems: "center",
      paddingTop: 56, gap: 2, zIndex: 10,
    }}>

      {TOOLS.map(tool => {
        const active = activeTool === tool.id
          || (tool.id === "zone"   && openPanel === "zones")
          || (tool.id === "object" && openPanel === "assets");
        const Icon = TOOL_ICONS[tool.id];
        const color = active ? "#80aaff" : "#7a7a7a";
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
      <div style={{ width: 40, height: 1, background: "rgba(255,255,255,0.08)", marginBottom: 4 }} />

      <button
        title="Preview (G)"
        onClick={onPreview}
        style={{
          width: 48, height: 48,
          border: `1px solid ${isPreview ? "rgba(80,200,120,0.7)" : "rgba(80,200,120,0.3)"}`,
          borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
          background: isPreview ? "rgba(80,200,120,0.25)" : "rgba(80,200,120,0.08)",
          cursor: "pointer", marginBottom: 8,
          outline: isPreview ? "1px solid rgba(80,200,120,0.45)" : "none",
        }}
      >
        <IconPlay color={isPreview ? "#60ee80" : "#80cc90"} />
      </button>
    </div>
  );
}
