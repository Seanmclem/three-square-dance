import { useEffect, useState } from "react";
import { DocViewerModal, type DocGuide } from "@/ui/DocViewerModal";

interface ShortcutEntry { keys: string[]; action: string }
/** `inBrushEditor`: still shown inside the isolated brush editor (the rest are hidden there).
 *  `guide`: an HTML guide in public/docs/, opened in DocViewerModal from the section header. */
interface ShortcutSection { label: string; rows: ShortcutEntry[]; inBrushEditor?: boolean; guide?: DocGuide }

// The guide file is the single source (v4.104.0); the old claude.ai copy had drifted.
const BRUSH_GUIDE: DocGuide = {
  title: "Brush editing guide",
  src: "/docs/brush-editing.html",
};

/** Right-click help (v4.104.0): an element with data-help="<id>" (brush panel buttons)
 *  opens the brush guide at that id. */
function helpAnchorFrom(target: EventTarget | null): string | null {
  return (target instanceof Element ? target.closest<HTMLElement>("[data-help]")?.dataset.help : null) ?? null;
}

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
    guide: BRUSH_GUIDE,
    rows: [
      { keys: ["RMB panel button"], action: "Open the brush guide at that button's entry (Cmd+F searches the guide)" },
      { keys: ["Panel: Edit Brush"], action: "Open the brush alone at the origin; Save (or Cmd+S) keeps editing, Close exits and asks if there are unsaved changes" },
      { keys: ["1", "2", "3", "4"],  action: "Select mode: Object / Face / Vertex / Edge (in Edit Brush, also the bar top-left: one click)" },
      { keys: ["LMB"],               action: "Pick a face / corner / edge on the selected brush" },
      { keys: ["LMB drag gizmo"],    action: "Move the face / corner / edge (in SNAP steps, 0.25 m by default; SNAP is in the panel)" },
      { keys: ["Alt"],               action: "Free drag (no snap)" },
      { keys: ["Esc"],               action: "Cancel drag, restore geometry" },
      { keys: ["RMB click corner"],  action: "Delete that corner (keeps at least 4)" },
      { keys: ["LMB drag (box select)"],  action: "Vertex mode: box select: drag a box over corners (not starting on a corner dot) to pick them all, hidden ones too (Shift+drag adds, Alt+drag removes); then T / R / S or the gizmo moves them all" },
      { keys: ["Shift+LMB corner"],  action: "Vertex mode: add / remove a corner from the selection" },
      { keys: ["Shift+LMB face"],    action: "Face mode: add / remove a face from the selection" },
      { keys: ["Dbl-click face"],    action: "Face mode: select that face's face loop (the ring of faces through it)" },
      { keys: ["Dbl-click edge"],    action: "Edge mode: select every corner along that edge's loop" },
      { keys: ["T", "R", "S"],       action: "2+ corners selected: move / rotate / scale them together (SNAP steps / 15° / 0.1)" },
      { keys: ["Panel: SPLIT H / V"], action: "Split the selected face into two" },
      { keys: ["Panel: LOOP CUT H / V"], action: "Split the selected face and keep going around the shape (hover to preview the ring)" },
      { keys: ["Panel: INSET"],      action: "Inset a smaller face inside the selected one" },
      { keys: ["Panel: EXTRUDE / RECESS"], action: "Push the selected face out / in" },
      { keys: ["Panel: SPLIT EDGE"], action: "Insert a vertex at the edge midpoint" },
      { keys: ["Panel: LOOP CUT"],   action: "Edge mode: cut a ring of edges around the shape, crossing the selected edge" },
      { keys: ["Panel: FLIP FOLD"],  action: "A bent face creases along the dashed line; flip it to the other diagonal" },
      { keys: ["Panel: SELECT LOOP"], action: "Edge mode: select the corners along the selected edge's loop, straight on" },
      { keys: ["Panel: AROUND FACE n"], action: "Edge mode: select the corners around the flat area on either side of the edge" },
      { keys: ["Panel: SELECT RING"], action: "After a loop cut: select the new ring's corners" },
      { keys: ["Panel: FACE LOOP H / V"], action: "Face mode: select the ring of faces through the selected face" },
      { keys: ["2+ faces selected"],  action: "Material / TILE apply to all; INSET, EXTRUDE, RECESS act on them as one piece" },
      { keys: ["Panel: HOLE"],        action: "Face mode: a ghost cutter on the face follows the mouse, a click drops it, CUT HOLE cuts it (Esc cancels); click a hole's face later to change it, drag its gizmo to move the whole hole, or FILL it" },
      { keys: ["Panel: GIZMO PUSH"],  action: "Face mode: drag the gizmo's centre box to push the selected face(s) out / in along their own directions" },
      { keys: ["Panel: DIST"],        action: "How far EXTRUDE / RECESS go (default 0.25 m)" },
      { keys: ["Panel: OUTER WALLS"], action: "KEEP: walls all round (as before). FOLLOW: tops / bottoms / outer sides are cut back or stretched with the face (EXTRUDE, RECESS, PUSH)" },
      { keys: ["Shift+LMB edge"],     action: "Edge mode: add / remove an edge from the selection" },
      { keys: ["Delete"],             action: "Edge mode: DISSOLVE the picked edge(s), merging the faces either side (also the DISSOLVE / DISSOLVE LOOP buttons)" },
      { keys: ["Panel: ROUND"],       action: "Edge mode: round the selected edge(s) into a curve (STEPS: 1 = flat cut-off; SIZE)" },
      { keys: ["LMB curve"],          action: "Face / edge mode: open that curve again: STEPS / SIZE rebuild it; MAKE SHARP puts the edge back" },
      { keys: ["Panel: CURVES"],      action: "Every curve on the brush: hover to light it up, EDIT, SPLIT ALL / SPLIT OFF for curves of several edges" },
      { keys: ["O"],                  action: "SOFT on / off: nearby corners follow a drag part of the way (also the SOFT button in Geometry)" },
      { keys: ["[", "]"],             action: "SOFT on: shrink / grow its radius, also while dragging" },
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
  const [guide, setGuide] = useState<DocGuide | null>(null);
  // One capture listener for right-click help, installed by the always-mounted top bar.
  useEffect(() => {
    const onContext = (e: MouseEvent) => {
      const id = helpAnchorFrom(e.target);
      if (!id) return;
      e.preventDefault();
      setOpen(false);
      setGuide({ ...BRUSH_GUIDE, src: `${BRUSH_GUIDE.src}#${id}` });
    };
    window.addEventListener("contextmenu", onContext, true);
    return () => window.removeEventListener("contextmenu", onContext, true);
  }, []);
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
              Brush editor: other tools' shortcuts are hidden until you Close it.
            </div>
          )}
          {sections.map(({ label, rows, guide: g }) => (
            <div key={label}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ color: "#80aaff", fontSize: 10, letterSpacing: 2 }}>{label}</span>
                {g && (
                  <button onClick={() => { setOpen(false); setGuide(g); }}
                    title="Diagrams and explanations for every brush mode and button"
                    style={{
                      marginLeft: "auto", padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                      border: "1px solid rgba(80,140,255,0.35)", background: "rgba(80,140,255,0.12)",
                      color: "#80aaff", fontSize: 10, fontFamily: "monospace",
                    }}>
                    Open guide
                  </button>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {rows.map(row => <ShortcutRow key={row.action} {...row} />)}
              </div>
            </div>
          ))}
        </div>
      )}
      {guide && <DocViewerModal guide={guide} onClose={() => setGuide(null)} />}
    </>
  );
}
