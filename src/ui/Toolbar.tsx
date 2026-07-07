import { useState } from "react";
import type { ToolId, LeftPanelId } from "@/types";
import { TOOL_ICONS, IconPlay, IconTriggerVolume, IconMaterial } from "@/ui/icons";

// `variants`: a tool button that opens a popover to pick between related tools (rect vs
// polygon). The button's primary id is variants[0]; the group is "active" when any variant
// is the active tool.
interface ToolDef { id: ToolId; label: string; shortcut: string; variants?: { id: ToolId; label: string }[] }

const TOOLS: ToolDef[] = [
  { id: "select",          label: "Select",   shortcut: "V" },
  { id: "floor",           label: "Floor",    shortcut: "F", variants: [{ id: "floor", label: "▭ Rectangle" }, { id: "poly-floor", label: "⬠ Polygon" }] },
  { id: "wall",            label: "Wall",     shortcut: "W" },
  { id: "platform",        label: "Platform", shortcut: "L", variants: [{ id: "platform", label: "▭ Rectangle" }, { id: "poly-platform", label: "⬠ Polygon" }] },
  { id: "stair",           label: "Stair",     shortcut: "T" },
  { id: "shape-cylinder",  label: "Shape",    shortcut: "B", variants: [{ id: "shape-cylinder", label: "◍ Cylinder" }, { id: "shape-wedge", label: "◺ Wedge" }, { id: "shape-box", label: "▤ Box" }] },
  { id: "object",          label: "Object",   shortcut: "O" },
  { id: "zone",            label: "Groups",   shortcut: "Z" },
  { id: "spawnpoint",      label: "Spawn",    shortcut: "N" },
  { id: "trigger-volume",  label: "Trigger",  shortcut: "U" },
  { id: "decal",           label: "Decal",    shortcut: "K" },
];

interface ToolbarProps {
  activeTool:    ToolId;
  openPanel:     LeftPanelId;
  onToolSelect:  (tool: ToolId) => void;
  onPanelToggle: (panelId: LeftPanelId) => void;
  onPreview?:    () => void;
  onNewGame?:    () => void;
  onContinue?:   () => void;
  hasGameSave?:  () => boolean;
  isPreview?:    boolean;
  spawnMode?:    "initial" | "checkpoint";
  onSpawnMode?:  (mode: "initial" | "checkpoint") => void;
}

export function Toolbar({ activeTool, openPanel, onToolSelect, onPanelToggle, onPreview, onNewGame, onContinue, hasGameSave, isPreview, spawnMode = "initial", onSpawnMode }: ToolbarProps) {
  const [showGameMenu, setShowGameMenu] = useState(false);
  // Re-evaluated whenever the menu opens (opening flips showGameMenu → re-render),
  // so it reflects a save written since the last play session.
  const canContinue = showGameMenu && (hasGameSave?.() ?? false);
  return (
    <div style={{
      position: "absolute", left: 0, top: 0, bottom: 0, width: 64,
      background: "rgba(28,28,28,0.95)",
      borderRight: "1px solid rgba(255,255,255,0.08)",
      display: "flex", flexDirection: "column", alignItems: "center",
      paddingTop: 56, gap: 2, zIndex: 10,
    }}>

      {TOOLS.map(tool => {
        // For a variant group, the active variant (if any) drives the icon and re-click target.
        const activeVariantId = tool.variants?.find(v => v.id === activeTool)?.id;
        const active = activeTool === tool.id
          || activeVariantId !== undefined
          || (tool.id === "zone"            && openPanel === "groups")
          || (tool.id === "object"          && openPanel === "assets")
          || (tool.id === "trigger-volume"  && openPanel === "scripts" && activeTool === "trigger-volume");
        const Icon = TOOL_ICONS[activeVariantId ?? tool.id];
        const color = active ? "#80aaff" : "#7a7a7a";
        const showSpawnMenu   = tool.id === "spawnpoint" && activeTool === "spawnpoint";
        const showVariantMenu = !!tool.variants && active;
        return (
          <div key={tool.id} style={{ position: "relative", display: "flex" }}>
          <button
            title={tool.label}
            // Re-clicking an active group keeps its current variant; otherwise select the primary.
            onClick={() => onToolSelect(activeVariantId ?? tool.id)}
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
            <span style={{ fontSize: 8, letterSpacing: 0.5, color, opacity: 0.7, fontFamily: "monospace",
                           textAlign: "center", lineHeight: 1.1, maxWidth: 46 }}>
              {tool.label}
            </span>
          </button>
          {showSpawnMenu && (
            <div style={{
              position: "absolute", left: "100%", top: 0, marginLeft: 6, zIndex: 100,
              background: "rgba(28,28,28,0.98)", border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 6, padding: 4, minWidth: 150,
              display: "flex", flexDirection: "column", gap: 2,
              boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
            }}>
              {([["initial", "◉ Initial Spawn"], ["checkpoint", "+ Checkpoint"]] as const).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => onSpawnMode?.(m)}
                  style={{
                    padding: "6px 10px", textAlign: "left", fontSize: 12, fontFamily: "monospace",
                    cursor: "pointer", border: "none", borderRadius: 4, whiteSpace: "nowrap",
                    background: spawnMode === m ? "rgba(80,140,255,0.25)" : "transparent",
                    color: spawnMode === m ? "#cfe0ff" : "#c0c0c0",
                  }}
                  onMouseEnter={e => { if (spawnMode !== m) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                  onMouseLeave={e => { if (spawnMode !== m) e.currentTarget.style.background = "transparent"; }}
                >
                  {label}
                </button>
              ))}
              <div style={{ color: "#606070", fontSize: 9, padding: "2px 10px 4px", lineHeight: 1.3 }}>
                {spawnMode === "initial" ? "Click in the scene to set the player start." : "Click to drop checkpoint markers."}
              </div>
            </div>
          )}
          {showVariantMenu && (
            <div style={{
              position: "absolute", left: "100%", top: 0, marginLeft: 6, zIndex: 100,
              background: "rgba(28,28,28,0.98)", border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 6, padding: 4, minWidth: 140,
              display: "flex", flexDirection: "column", gap: 2,
              boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
            }}>
              {tool.variants!.map(v => {
                const on = activeTool === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => onToolSelect(v.id)}
                    style={{
                      padding: "6px 10px", textAlign: "left", fontSize: 12, fontFamily: "monospace",
                      cursor: "pointer", border: "none", borderRadius: 4, whiteSpace: "nowrap",
                      background: on ? "rgba(80,140,255,0.25)" : "transparent",
                      color: on ? "#cfe0ff" : "#c0c0c0",
                    }}
                    onMouseEnter={e => { if (!on) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                    onMouseLeave={e => { if (!on) e.currentTarget.style.background = "transparent"; }}
                  >
                    {v.label}
                  </button>
                );
              })}
              <div style={{ color: "#606070", fontSize: 9, padding: "2px 10px 4px", lineHeight: 1.3 }}>
                {activeTool.startsWith("poly-") ? "Click to place vertices; Enter to close." : "Click-drag to paint a region."}
              </div>
            </div>
          )}
          </div>
        );
      })}

      <div style={{ flex: 1 }} />

      {/* Materials panel button */}
      {(() => {
        const matActive = openPanel === "materials";
        return (
          <button
            title="Materials panel"
            onClick={() => onPanelToggle(matActive ? null : "materials")}
            style={{
              width: 48, height: 36, border: "none", cursor: "pointer",
              borderRadius: 8, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 2,
              background: matActive ? "rgba(80,140,255,0.2)" : "transparent",
              outline: matActive ? "1px solid rgba(80,140,255,0.45)" : "none",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { if (!matActive) e.currentTarget.style.background = "rgba(80,140,255,0.08)"; }}
            onMouseLeave={e => { if (!matActive) e.currentTarget.style.background = "transparent"; }}
          >
            <IconMaterial color={matActive ? "#80aaff" : "#7a7a7a"} />
            <span style={{ fontSize: 6, letterSpacing: 0.5, color: matActive ? "#80aaff" : "#7a7a7a",
                           opacity: 0.85, fontFamily: "monospace" }}>
              MATS
            </span>
          </button>
        );
      })()}

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

      {/* Play row: New Game button + dropdown caret (Preview/Continue in the menu) */}
      <div style={{ position: "relative", display: "flex", gap: 2, marginBottom: 8 }}>
        <button
          title="New Game (G)"
          onClick={onNewGame}
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
              onClick={() => { setShowGameMenu(false); onNewGame?.(); }}
              style={{
                width: "100%", padding: "6px 12px", background: "none", border: "none",
                color: "#ccc", cursor: "pointer", textAlign: "left", fontSize: 12,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(80,200,120,0.15)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
            >▶ New Game</button>
            <button
              disabled={!canContinue}
              title={canContinue ? "Resume the saved game" : "No saved game yet"}
              onClick={() => { setShowGameMenu(false); onContinue?.(); }}
              style={{
                width: "100%", padding: "6px 12px", background: "none", border: "none",
                color: canContinue ? "#ccc" : "#555", cursor: canContinue ? "pointer" : "default",
                textAlign: "left", fontSize: 12,
              }}
              onMouseEnter={e => { if (canContinue) (e.currentTarget as HTMLButtonElement).style.background = "rgba(80,200,120,0.15)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
            >▶ Continue</button>
          </div>
        )}
      </div>
    </div>
  );
}
