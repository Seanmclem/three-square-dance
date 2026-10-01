/**
 * Amber top-center bar shown while an isolated edit mode is active (prefab
 * edit, Phase 47; brush edit) — the mode must be unmistakable, since saving/
 * scene-switching/play are all disabled underneath it.
 */
export function EditModeBar({ title, name, hint, onSave, onCancel, cancelLabel = "Cancel", status, saveDisabled, confirm }: {
  title:    string;   // "Editing Prefab"
  name:     string;
  hint?:    string;   // what Save does (omitted → a narrower bar)
  onSave:   () => void;
  onCancel: () => void;
  cancelLabel?: string;                                   // brush edit: "Close"
  status?: { text: string; tone: "dirty" | "saved" } | null;   // brush edit: unsaved / saved
  saveDisabled?: boolean;                                 // nothing to save
  /** Inline confirmation (e.g. closing with unsaved changes) — replaces the buttons. */
  confirm?: { text: string; confirmLabel: string; onConfirm: () => void; onDismiss: () => void } | null;
}) {
  const btn = (primary: boolean, disabled = false): React.CSSProperties => ({
    background: primary ? "rgba(240,180,60,0.15)" : "transparent",
    border: `1px solid ${primary ? "rgba(240,180,60,0.5)" : "rgba(255,255,255,0.2)"}`,
    borderRadius: 4, color: primary ? "#f0c060" : "#c2cadb", fontSize: 11, fontFamily: "monospace",
    padding: "4px 12px", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1,
  });
  return (
    <div style={{
      position: "absolute", top: 56, left: "50%", transform: "translateX(-50%)",
      zIndex: 30, display: "flex", alignItems: "center", gap: 12,
      background: "rgba(48,38,16,0.96)", border: "1px solid rgba(240,180,60,0.45)",
      borderRadius: 6, padding: "8px 14px",
      boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    }}>
      <span style={{ color: "#f0c060", fontSize: 12, fontFamily: "monospace" }}>
        ⬡ {title} · <strong>{name}</strong>
      </span>
      {hint && (
        <span style={{ color: "#b09050", fontSize: 10, fontFamily: "monospace" }}>
          {hint}
        </span>
      )}
      {status && (
        <span style={{ color: status.tone === "dirty" ? "#ffcf7a" : "#8fdcaf", fontSize: 11, fontFamily: "monospace" }}>
          {status.tone === "dirty" ? "● " : "✓ "}{status.text}
        </span>
      )}
      {confirm ? (
        <>
          <span style={{ color: "#ffcf7a", fontSize: 11, fontFamily: "monospace" }}>{confirm.text}</span>
          <button onClick={confirm.onConfirm} style={btn(false)}>{confirm.confirmLabel}</button>
          <button onClick={confirm.onDismiss} style={btn(true)}>Keep editing</button>
        </>
      ) : (
        <>
          <button onClick={onSave} disabled={saveDisabled} style={btn(true, saveDisabled)}>Save</button>
          <button onClick={onCancel} style={btn(false)}>{cancelLabel}</button>
        </>
      )}
    </div>
  );
}
