import { useState } from "react";
import type { ToolId, LeftPanelId } from "@/types";
import { TOOL_ICONS, IconPlay, IconTriggerVolume } from "@/ui/icons";

interface ToolDef { id: ToolId; label: string; shortcut: string }

const TOOLS: ToolDef[] = [
  { id: "select",          label: "Select",   shortcut: "V" },
  { id: "floor",           label: "Floor",    shortcut: "F" },
  { id: "poly-floor",      label: "Poly Flr", shortcut: "P" },
  { id: "wall",            label: "Wall",     shortcut: "W" },
  { id: "platform",        label: "Platform", shortcut: "L" },
  { id: "poly-platform",   label: "Poly Plat", shortcut: "K" },
  { id: "stair",           label: "Stair",     shortcut: "T" },
  { id: "object",          label: "Object",   shortcut: "O" },
  { id: "zone",            label: "Zone",     shortcut: "Z" },
  { id: "spawnpoint",      label: "Spawn",    shortcut: "N" },
  { id: "trigger-volume",  label: "Trigger",  shortcut: "U" },
];

interface ToolbarProps {
  activeTool:    ToolId;
  openPanel:     LeftPanelId;
  onToolSelect:  (tool: ToolId) => void;
  onPanelToggle: (panelId: LeftPanelId) => void;
  onPreview?:    () => void;
  onStartGame?:  () => void;
  isPreview?:    boolean;
}

export function Toolbar({ activeTool, openPanel, onToolSelect, onPanelToggle, onPreview, onStartGame, isPreview }: ToolbarProps) {
  const [showGameMenu, setShowGameMenu] = useState(false);
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
          || (tool.id === "zone"            && openPanel === "zones")
          || (tool.id === "object"          && openPanel === "assets")
          || (tool.id === "trigger-volume"  && openPanel === "scripts" && activeTool === "trigger-volume");
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

      {/* Scripts panel button */}
      {(() => {
        const scriptsActive = openPanel === "scripts";
        return (
          <button
            title="Scripts &amp; Triggers panel (S)"
            onClick={() => onPanelToggle(scriptsActive ? null : "scripts")}
            style={{
              width: 48, height: 36, border: "none", cursor: "pointer",
              borderRadius: 8, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 2,
              background: scriptsActive ? "rgba(255,170,0,0.2)" : "transparent",
              outline: scriptsActive ? "1px solid rgba(255,170,0,0.45)" : "none",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { if (!scriptsActive) e.currentTarget.style.background = "rgba(255,170,0,0.08)"; }}
            onMouseLeave={e => { if (!scriptsActive) e.currentTarget.style.background = "transparent"; }}
          >
            <IconTriggerVolume color={scriptsActive ? "#ffaa00" : "#7a7a7a"} />
            <span style={{ fontSize: 6, letterSpacing: 0.5, color: scriptsActive ? "#ffaa00" : "#7a7a7a",
                           opacity: 0.85, fontFamily: "monospace" }}>
              SCRIPTS
            </span>
          </button>
        );
      })()}

      <div style={{ width: 40, height: 1, background: "rgba(255,255,255,0.08)", marginBottom: 4 }} />

      {/* Play row: Preview button + dropdown caret */}
      <div style={{ position: "relative", display: "flex", gap: 2, marginBottom: 8 }}>
        <button
          title="Preview (G)"
          onClick={onPreview}
          style={{
            width: 36, height: 36,
            border: `1px solid ${isPreview ? "rgba(80,200,120,0.7)" : "rgba(80,200,120,0.3)"}`,
            borderRadius: "8px 0 0 8px", display: "flex", alignItems: "center", justifyContent: "center",
            background: isPreview ? "rgba(80,200,120,0.25)" : "rgba(80,200,120,0.08)",
            cursor: "pointer",
          }}
        >
          <IconPlay color={isPreview ? "#60ee80" : "#80cc90"} />
        </button>
        <button
          title="More play options"
          onClick={() => setShowGameMenu(v => !v)}
          style={{
            width: 14, height: 36,
            border: `1px solid ${isPreview ? "rgba(80,200,120,0.7)" : "rgba(80,200,120,0.3)"}`,
            borderLeft: "none",
            borderRadius: "0 8px 8px 0", display: "flex", alignItems: "center", justifyContent: "center",
            background: isPreview ? "rgba(80,200,120,0.25)" : "rgba(80,200,120,0.08)",
            cursor: "pointer", fontSize: 8, color: isPreview ? "#60ee80" : "#80cc90",
          }}
        >▾</button>

        {showGameMenu && (
          <div style={{
            position: "absolute", bottom: "100%", left: 0, marginBottom: 4,
            background: "rgba(28,28,28,0.97)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 6, padding: "4px 0", minWidth: 120, zIndex: 100,
          }}>
            <button
              onClick={() => { setShowGameMenu(false); onPreview?.(); }}
              style={{
                width: "100%", padding: "6px 12px", background: "none", border: "none",
                color: "#ccc", cursor: "pointer", textAlign: "left", fontSize: 12,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(80,200,120,0.15)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
            >▶ Preview</button>
            <button
              onClick={() => { setShowGameMenu(false); onStartGame?.(); }}
              style={{
                width: "100%", padding: "6px 12px", background: "none", border: "none",
                color: "#ccc", cursor: "pointer", textAlign: "left", fontSize: 12,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(80,200,120,0.15)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
            >▶ Start Game</button>
          </div>
        )}
      </div>
    </div>
  );
}
