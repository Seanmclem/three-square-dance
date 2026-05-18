import type { ToolId } from "@/types";

interface ToolInfo { desc: string; hint: string }

const TOOL_INFO: Record<ToolId, ToolInfo> = {
  select:   { desc: "Click any object to select it. Use gizmos to transform.", hint: "Nothing selected" },
  floor:    { desc: "Click and drag to paint a floor region.",                 hint: "Click to place floor origin" },
  wall:     { desc: "Click to set wall start, click again to set end.",        hint: "Click to place wall start" },
  platform: { desc: "Click and drag to define a freestanding platform.",       hint: "Click to place platform" },
  stair:    { desc: "Click bottom point, then top point of staircase.",        hint: "Click bottom of stair" },
  object:   { desc: "Choose an asset below, click to place.",                  hint: "Select an asset first" },
  zone:     { desc: "Draw a zone boundary to group rooms.",                    hint: "Click to define zone area" },
};

const PLACEHOLDER_ASSETS = ["Wall Segment", "Floor Tile", "Door Frame", "Window", "Staircase", "Platform"] as const;

const TRANSFORM_AXES = [
  { axis: "X", color: "#ff6b6b" },
  { axis: "Y", color: "#6bff8a" },
  { axis: "Z", color: "#6b8aff" },
] as const;

interface PropertiesPanelProps {
  activeTool: ToolId;
}

export function PropertiesPanel({ activeTool }: PropertiesPanelProps) {
  const info = TOOL_INFO[activeTool];

  return (
    <div style={{
      position: "absolute", right: 0, top: 0, bottom: 0, width: 280,
      background: "rgba(10,14,22,0.95)", borderLeft: "1px solid rgba(80,120,180,0.2)",
      display: "flex", flexDirection: "column", zIndex: 10,
    }}>
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(80,120,180,0.15)" }}>
        <div style={{ color: "#80aaff", fontSize: 11, letterSpacing: 2, marginBottom: 4 }}>PROPERTIES</div>
        <div style={{ color: "#4a6a8a", fontSize: 11 }}>{info.desc}</div>
      </div>

      <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(80,120,180,0.1)" }}>
        <div style={{
          padding: "8px 12px", background: "rgba(80,140,255,0.06)",
          border: "1px solid rgba(80,140,255,0.15)", borderRadius: 6,
          color: "#6a90b8", fontSize: 11,
        }}>
          {info.hint}
        </div>
      </div>

      <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {(["Position", "Rotation", "Scale"] as const).map(label => (
          <div key={label}>
            <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>{label}</div>
            <div style={{ display: "flex", gap: 4 }}>
              {TRANSFORM_AXES.map(({ axis, color }) => (
                <div key={axis} style={{
                  flex: 1, padding: "4px 8px",
                  background: "rgba(20,30,45,0.8)", border: "1px solid rgba(80,120,180,0.15)",
                  borderRadius: 4, display: "flex", gap: 4, alignItems: "center",
                }}>
                  <span style={{ color, fontSize: 9 }}>{axis}</span>
                  <span style={{ color: "#3a5a7a", fontSize: 10, fontFamily: "monospace" }}>0.00</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ margin: "8px 16px 0", borderTop: "1px solid rgba(80,120,180,0.1)", paddingTop: 10 }}>
        <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>ASSETS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {PLACEHOLDER_ASSETS.map(name => (
            <div
              key={name}
              style={{
                padding: "8px 6px", background: "rgba(20,30,45,0.8)",
                border: "1px solid rgba(80,120,180,0.12)", borderRadius: 6,
                color: "#5a7a9a", fontSize: 10, textAlign: "center", cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(80,140,255,0.3)"; e.currentTarget.style.color = "#80aaff"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(80,120,180,0.12)"; e.currentTarget.style.color = "#5a7a9a"; }}
            >
              {name}
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1 }} />
    </div>
  );
}
