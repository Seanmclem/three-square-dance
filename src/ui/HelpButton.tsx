import { useState } from "react";

interface ShortcutEntry { keys: string[]; action: string }
/** `inBrushEditor`: still shown inside the isolated brush editor (the rest are hidden there). */
interface ShortcutSection { label: string; rows: ShortcutEntry[]; inBrushEditor?: boolean }

const SECTIONS: ShortcutSection[] = [
  {
    label: "CAMERA",
    inBrushEditor: true,
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
      { keys: ["Enter", "Dbl-click", "Esc"], action: "End chain (placed walls kept)" },
      { keys: ["Shift"],             action: "Snap angle to 45°" },
      { keys: ["click start dot"],   action: "Close loop" },
    ],
  },
  {
    label: "POLYGON FLOOR TOOL  (P)",
    rows: [
      { keys: ["LMB"],               action: "Add vertex" },
      { keys: ["click first dot"],   action: "Close & commit polygon" },
      { keys: ["Enter", "Dbl-click"], action: "Commit polygon (3+ points)" },
      { keys: ["Esc"],               action: "Cancel polygon" },
    ],
  },
  {
    label: "SELECT TOOL",
    rows: [
      { keys: ["LMB drag node"],     action: "Move node (live rebuild)" },
      { keys: ["Alt"],               action: "Free drag (no grid snap)" },
      { keys: ["Esc"],               action: "Cancel drag, restore position" },
      // Right-CLICK = pressed and released without dragging (a right-drag is the camera orbit).
      { keys: ["RMB click wall"],         action: "Split the wall there (insert a vertex)" },
      { keys: ["RMB click brush corner"], action: "Delete that corner" },
      { keys: ["RMB click"],              action: "Menu: move initial spawn here" },
    ],
  },
  {
    label: "BRUSH EDITING  (shape → Convert to Brush in panel)",
    inBrushEditor: true,
    rows: [
      { keys: ["Panel: Edit Brush"], action: "Open the brush alone at the origin; Save / Cancel in the bar" },
      { keys: ["1", "2", "3", "4"],  action: "Select mode: Object / Face / Vertex / Edge" },
      { keys: ["LMB"],               action: "Pick a face / corner / edge on the selected brush" },
      { keys: ["LMB drag gizmo"],    action: "Move the face / corner / edge (snaps 0.25)" },
      { keys: ["Alt"],               action: "Free drag (no snap)" },
      { keys: ["Esc"],               action: "Cancel drag, restore geometry" },
      { keys: ["RMB click corner"],  action: "Delete that corner (keeps at least 4)" },
      { keys: ["Panel: SPLIT ─ │"],  action: "Split the selected face into two" },
      { keys: ["Panel: LOOP CUT ─ │"], action: "Split the selected face and keep going around the shape (hover to preview the ring)" },
      { keys: ["Panel: INSET"],      action: "Inset a smaller face inside the selected one" },
      { keys: ["Panel: EXTRUDE / RECESS"], action: "Push the selected face out / in" },
      { keys: ["Panel: SPLIT EDGE"], action: "Insert a vertex at the edge midpoint" },
      { keys: ["Panel: LOOP CUT"],   action: "Edge mode: cut a ring of edges around the shape, crossing the selected edge" },
      { keys: ["Panel: FLIP FOLD"],  action: "A bent face creases along the dashed line; flip it to the other diagonal" },
    ],
  },
];

function ShortcutRow({ keys, action }: ShortcutEntry) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
        {keys.map(k => (
          <span key={k} style={{
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.13)",
            borderRadius: 4, padding: "1px 5px",
            fontSize: 9, color: "#a0a0a0", fontFamily: "monospace",
            whiteSpace: "nowrap",
          }}>{k}</span>
        ))}
      </div>
      <span style={{ color: "#98a2b8", fontSize: 10 }}>{action}</span>
    </div>
  );
}

export function HelpButton({ brushEditor = false }: { brushEditor?: boolean }) {
  const [open, setOpen] = useState(false);
  // In the isolated brush editor, only the sections that apply there.
  const sections = brushEditor ? SECTIONS.filter(s => s.inBrushEditor) : SECTIONS;

  return (
    <>
      <button
        title="Keyboard shortcuts"
        onClick={() => setOpen(v => !v)}
        style={{
          width: 26, height: 26,
          border: `1px solid ${open ? "rgba(80,140,255,0.5)" : "rgba(255,255,255,0.1)"}`,
          borderRadius: 6,
          background: open ? "rgba(80,140,255,0.15)" : "transparent",
          color: open ? "#80aaff" : "#7a7a7a",
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
          background: "rgba(28,28,28,0.97)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8, padding: "12px 14px",
          zIndex: 50, minWidth: 230,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          {brushEditor && (
            <div style={{ color: "#c2cadb", fontSize: 10 }}>
              Brush editor: other tools' shortcuts are hidden until you Save or Cancel.
            </div>
          )}
          {sections.map(({ label, rows }) => (
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
