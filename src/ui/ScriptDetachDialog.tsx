interface ScriptDetachDialogProps {
  scriptCount:   number;
  entityLabel:   string;   // "trigger volume" | "object"
  onDeleteAll:   () => void;
  onKeepScripts: () => void;
  onCancel:      () => void;
}

const S = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 60,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(0,0,0,0.6)",
  } as React.CSSProperties,
  card: {
    background: "rgba(28,28,28,0.99)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8, padding: "20px 24px", width: 320,
    boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
    display: "flex", flexDirection: "column", gap: 16,
  } as React.CSSProperties,
  title: { color: "#c0c0c0", fontSize: 13, fontFamily: "monospace", letterSpacing: 1 } as React.CSSProperties,
  body:  { color: "#909090", fontSize: 12, fontFamily: "monospace", lineHeight: 1.5 } as React.CSSProperties,
  row:   { display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" } as React.CSSProperties,
  btn: (variant: "ghost" | "danger" | "primary"): React.CSSProperties => ({
    padding: "6px 14px", borderRadius: 4, cursor: "pointer",
    fontFamily: "monospace", fontSize: 11,
    background:
      variant === "primary" ? "rgba(80,140,255,0.2)"
      : variant === "danger" ? "rgba(200,60,60,0.15)"
      : "transparent",
    border:
      variant === "primary" ? "1px solid rgba(80,140,255,0.4)"
      : variant === "danger" ? "1px solid rgba(200,60,60,0.3)"
      : "1px solid rgba(255,255,255,0.1)",
    color:
      variant === "primary" ? "#80aaff"
      : variant === "danger" ? "#cc6666"
      : "#606070",
  }),
};

export function ScriptDetachDialog({
  scriptCount, entityLabel, onDeleteAll, onKeepScripts, onCancel,
}: ScriptDetachDialogProps) {
  const plural = scriptCount === 1 ? "script" : "scripts";
  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={S.card}>
        <div style={S.title}>DELETE {entityLabel.toUpperCase()}</div>
        <div style={S.body}>
          This {entityLabel} has <strong style={{ color: "#c0c0c0" }}>{scriptCount} {plural}</strong> attached.
          <br />
          What would you like to do with {scriptCount === 1 ? "it" : "them"}?
        </div>
        <div style={S.row}>
          <button style={S.btn("ghost")}   onClick={onCancel}>Cancel</button>
          <button style={S.btn("danger")}  onClick={onDeleteAll}>Delete everything</button>
          <button style={S.btn("primary")} onClick={onKeepScripts}>
            Keep {plural} (detach)
          </button>
        </div>
      </div>
    </div>
  );
}
