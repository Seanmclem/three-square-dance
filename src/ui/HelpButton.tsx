import { useState } from "react";

interface ShortcutEntry { keys: string[]; action: string }
interface ShortcutSection { label: string; rows: ShortcutEntry[] }

const SECTIONS: ShortcutSection[] = [
  {
    label: "CAMERA",
    rows: [
      { keys: ["RMB"],               action: "Orbit" },
      { keys: ["MMB"],               action: "Pan" },
      { keys: ["Scroll"],            action: "Zoom" },
      { keys: ["W", "A", "S", "D"],  action: "Move focus" },
    ],
  },
  {
    label: "WALL TOOL",
    rows: [
      { keys: ["LMB"],               action: "Place segment / start chain" },
      { keys: ["Enter"],             action: "Finish chain (keep walls)" },
      { keys: ["Dbl-click"],         action: "Finish chain (keep walls)" },
      { keys: ["Esc"],               action: "Discard ghost, keep placed" },
      { keys: ["Shift"],             action: "Snap angle to 45°" },
      { keys: ["click start dot"],   action: "Close loop" },
    ],
  },
  {
    label: "SELECT TOOL",
    rows: [
      { keys: ["LMB drag node"],     action: "Move node (live rebuild)" },
      { keys: ["Alt"],               action: "Free drag (no grid snap)" },
      { keys: ["Esc"],               action: "Cancel drag, restore position" },
    ],
  },
];

function ShortcutRow({ keys, action }: ShortcutEntry) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
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
  );
}

export function HelpButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        title="Keyboard shortcuts"
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
          zIndex: 50, minWidth: 230,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          {SECTIONS.map(({ label, rows }) => (
            <div key={label}>
              <div style={{ color: "#80aaff", fontSize: 10, letterSpacing: 2, marginBottom: 8 }}>
                {label}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {rows.map(row => <ShortcutRow key={row.action} {...row} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
