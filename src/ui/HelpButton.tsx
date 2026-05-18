import { useState } from "react";

const CONTROLS = [
  { keys: ["RMB"],              action: "Orbit camera" },
  { keys: ["MMB"],              action: "Pan camera" },
  { keys: ["Scroll"],           action: "Zoom in / out" },
  { keys: ["W", "S", "A", "D"], action: "Move focus" },
  { keys: ["↑", "↓", "←", "→"],action: "Move focus" },
];

export function HelpButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        title="Camera controls"
        onClick={() => setOpen(v => !v)}
        style={{
          width: 26, height: 26,
          border: `1px solid ${open ? "rgba(80,140,255,0.5)" : "rgba(80,120,180,0.3)"}`,
          borderRadius: 6,
          background: open ? "rgba(80,140,255,0.15)" : "transparent",
          color: open ? "#80aaff" : "#5a7a9a",
          fontSize: 13, fontWeight: 600, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "serif", lineHeight: 1,
          transition: "all 0.15s",
          flexShrink: 0,
        }}
      >
        ?
      </button>

      {open && (
        <div style={{
          position: "absolute", top: 54, left: 70,
          background: "rgba(10,14,22,0.97)",
          border: "1px solid rgba(80,120,180,0.3)",
          borderRadius: 8, padding: "12px 14px",
          zIndex: 50, minWidth: 210,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}>
          <div style={{ color: "#80aaff", fontSize: 10, letterSpacing: 2, marginBottom: 10 }}>
            CAMERA CONTROLS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {CONTROLS.map(({ keys, action }) => (
              <div key={action} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ display: "flex", gap: 3 }}>
                  {keys.map(k => (
                    <span key={k} style={{
                      background: "rgba(80,120,180,0.15)",
                      border: "1px solid rgba(80,120,180,0.35)",
                      borderRadius: 4, padding: "1px 5px",
                      fontSize: 9, color: "#7a9ab8", fontFamily: "monospace",
                      whiteSpace: "nowrap",
                    }}>{k}</span>
                  ))}
                </div>
                <span style={{ color: "#4a6a8a", fontSize: 10 }}>{action}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
