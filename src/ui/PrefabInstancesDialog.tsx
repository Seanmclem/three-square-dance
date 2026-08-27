import type { Vec3 } from "@/types";

export interface PrefabInstanceRow {
  recordId:    string;
  zoneId:      string;
  zoneName:    string;
  origin:      { position: Vec3; rotationY: number };
  memberCount: number;   // 0 = ghost/leftover record (members deleted pre-v4.80 pruning)
}

interface PrefabInstancesDialogProps {
  prefabName:     string;
  rows:           PrefabInstanceRow[];
  onGoTo:         (row: PrefabInstanceRow) => void;
  onDeleteRow:    (row: PrefabInstanceRow) => void;
  onDeletePrefab: () => void;   // enabled only once rows is empty
  onClose:        () => void;
}

const S = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 60,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(0,0,0,0.6)",
  } as React.CSSProperties,
  card: {
    background: "rgba(28,28,28,0.99)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8, padding: "20px 24px", width: 380,
    boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
    display: "flex", flexDirection: "column", gap: 14,
  } as React.CSSProperties,
  title: { color: "#c0c0c0", fontSize: 13, fontFamily: "monospace", letterSpacing: 1 } as React.CSSProperties,
  body:  { color: "#909090", fontSize: 12, fontFamily: "monospace", lineHeight: 1.5 } as React.CSSProperties,
  warn:  { color: "#ccaa44", fontSize: 11, fontFamily: "monospace" } as React.CSSProperties,
  row:   { display: "flex", gap: 8, justifyContent: "flex-end" } as React.CSSProperties,
  btn: (variant: "ghost" | "danger", enabled = true): React.CSSProperties => ({
    padding: "6px 14px", borderRadius: 4, cursor: enabled ? "pointer" : "default",
    fontFamily: "monospace", fontSize: 11,
    background: enabled && variant === "danger" ? "rgba(200,60,60,0.15)" : "transparent",
    border:     enabled && variant === "danger" ? "1px solid rgba(200,60,60,0.3)" : "1px solid rgba(255,255,255,0.1)",
    color:      !enabled ? "#555" : variant === "danger" ? "#cc6666" : "#8b94a8",
  }),
  miniBtn: (variant: "ghost" | "danger"): React.CSSProperties => ({
    padding: "3px 8px", borderRadius: 3, cursor: "pointer", flexShrink: 0,
    fontFamily: "monospace", fontSize: 10,
    background: variant === "danger" ? "rgba(200,60,60,0.12)" : "rgba(80,140,255,0.12)",
    border:     variant === "danger" ? "1px solid rgba(200,60,60,0.3)" : "1px solid rgba(80,140,255,0.3)",
    color:      variant === "danger" ? "#cc6666" : "#80aaff",
  }),
};

/**
 * Shown instead of a disabled × when a prefab still has placed instances: every
 * instance (including ghost records whose members are all gone) is listed with
 * Go to / Delete, and the prefab itself becomes deletable once the list is empty.
 * Dumb/controlled — App owns the rows and recomputes them only on open, row
 * deletion, or prefab-instance events (never per frame).
 */
export function PrefabInstancesDialog({
  prefabName, rows, onGoTo, onDeleteRow, onDeletePrefab, onClose,
}: PrefabInstancesDialogProps) {
  const fmt = (n: number): string => String(Math.round(n * 10) / 10);
  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.card}>
        <div style={S.title}>DELETE PREFAB · {prefabName.toUpperCase()}</div>
        {rows.length > 0 ? (
          <div style={S.body}>
            {rows.length} placed instance{rows.length !== 1 ? "s" : ""} still exist
            {rows.length === 1 ? "s" : ""} — remove them (or Unlink from their
            Properties) before the prefab can be deleted.
          </div>
        ) : (
          <div style={S.body}>No instances remain — the prefab can be deleted now.</div>
        )}

        {rows.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
            {rows.map(r => (
              <div key={r.recordId} style={{ display: "flex", alignItems: "center", gap: 8,
                padding: "6px 8px", borderRadius: 4,
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ flex: 1, minWidth: 0, fontFamily: "monospace", fontSize: 11,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  color: r.memberCount === 0 ? "#ccaa44" : "#c0c0c0" }}>
                  {r.memberCount === 0
                    ? "empty record (leftover)"
                    : `${r.zoneName} · (${fmt(r.origin.position.x)}, ${fmt(r.origin.position.y)}, ${fmt(r.origin.position.z)}) · ${r.memberCount} piece${r.memberCount !== 1 ? "s" : ""}`}
                </div>
                {r.memberCount > 0 && (
                  <button style={S.miniBtn("ghost")} onClick={() => onGoTo(r)}
                    title="Select this instance and move the camera to it">Go to</button>
                )}
                <button style={S.miniBtn("danger")} onClick={() => onDeleteRow(r)}
                  title={r.memberCount === 0 ? "Remove the leftover record" : "Delete this instance and its pieces (undoable)"}>
                  Delete</button>
              </div>
            ))}
          </div>
        )}

        {rows.length > 0 && (
          <div style={S.warn}>⚠ Deleting the prefab is enabled once every instance above is gone.</div>
        )}

        <div style={S.row}>
          <button style={S.btn("ghost")} onClick={onClose}>Cancel</button>
          <button style={S.btn("danger", rows.length === 0)} disabled={rows.length !== 0}
            onClick={onDeletePrefab}
            title={rows.length === 0 ? "Delete the prefab from the library" : "Instances still exist"}>
            Delete prefab
          </button>
        </div>
      </div>
    </div>
  );
}
