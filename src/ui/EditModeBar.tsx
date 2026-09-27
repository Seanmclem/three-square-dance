/**
 * Amber top-center bar shown while an isolated edit mode is active (prefab
 * edit, Phase 47; brush edit) — the mode must be unmistakable, since saving/
 * scene-switching/play are all disabled underneath it.
 */
export function EditModeBar({ title, name, hint, onSave, onCancel }: {
  title:    string;   // "Editing Prefab"
  name:     string;
  hint:     string;   // what Save does
  onSave:   () => void;
  onCancel: () => void;
}) {
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
      <span style={{ color: "#b09050", fontSize: 10, fontFamily: "monospace" }}>
        {hint}
      </span>
      <button
        onClick={onSave}
        style={{
          background: "rgba(240,180,60,0.15)", border: "1px solid rgba(240,180,60,0.5)",
          borderRadius: 4, color: "#f0c060", fontSize: 11, fontFamily: "monospace",
          padding: "4px 12px", cursor: "pointer",
        }}
      >Save</button>
      <button
        onClick={onCancel}
        style={{
          background: "transparent", border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 4, color: "#c2cadb", fontSize: 11, fontFamily: "monospace",
          padding: "4px 12px", cursor: "pointer",
        }}
      >Cancel</button>
    </div>
  );
}
