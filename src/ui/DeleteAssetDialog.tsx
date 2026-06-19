import { useState } from "react";

interface DeleteAssetDialogProps {
  labels:    string[];                  // labels of the items to delete
  usage:     { count: number; zones: string[] };  // in-scene usage across zones
  needsFolderGrant: boolean;            // true if the asset folder isn't granted yet this session
  noun?:        string;                 // "model" (default) | "material"
  usageNoun?:   string;                 // "placed object" (default) | "surface"
  usageEffect?: string;                 // trailing sentence after the usage warning
  folderHint?:  string;                 // folder to grant, e.g. "public/assets/models"
  onCancel:  () => void;
  onConfirm: (deleteFiles: boolean) => void;
}

const S = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 60,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(0,0,0,0.6)",
  } as React.CSSProperties,
  card: {
    background: "rgba(28,28,28,0.99)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8, padding: "20px 24px", width: 340,
    boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
    display: "flex", flexDirection: "column", gap: 16,
  } as React.CSSProperties,
  title: { color: "#c0c0c0", fontSize: 13, fontFamily: "monospace", letterSpacing: 1 } as React.CSSProperties,
  body:  { color: "#909090", fontSize: 12, fontFamily: "monospace", lineHeight: 1.5 } as React.CSSProperties,
  list:  { color: "#c0c0c0", fontSize: 11, fontFamily: "monospace", margin: "4px 0 0", paddingLeft: 16 } as React.CSSProperties,
  warn:  { color: "#ccaa44", fontSize: 11, fontFamily: "monospace", lineHeight: 1.4 } as React.CSSProperties,
  check: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "#909090", fontSize: 11, fontFamily: "monospace" } as React.CSSProperties,
  hint:  { color: "#6a7a90", fontSize: 10, fontFamily: "monospace", lineHeight: 1.4 } as React.CSSProperties,
  row:   { display: "flex", gap: 8, justifyContent: "flex-end" } as React.CSSProperties,
  btn: (variant: "ghost" | "danger"): React.CSSProperties => ({
    padding: "6px 14px", borderRadius: 4, cursor: "pointer",
    fontFamily: "monospace", fontSize: 11,
    background: variant === "danger" ? "rgba(200,60,60,0.15)" : "transparent",
    border:     variant === "danger" ? "1px solid rgba(200,60,60,0.3)" : "1px solid rgba(255,255,255,0.1)",
    color:      variant === "danger" ? "#cc6666" : "#606070",
  }),
};

export function DeleteAssetDialog({
  labels, usage, needsFolderGrant, onCancel, onConfirm,
  noun = "model", usageNoun = "placed object",
  usageEffect = "They will show as placeholder boxes until reassigned or removed.",
  folderHint = "public/assets/models",
}: DeleteAssetDialogProps) {
  const [deleteFiles, setDeleteFiles] = useState(false);
  const many   = labels.length !== 1;
  const sample = labels.slice(0, 6);
  const extra  = labels.length - sample.length;
  const these  = many ? `these ${noun}s` : `this ${noun}`;

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={S.card}>
        <div style={S.title}>DELETE {many ? `${labels.length} ${noun.toUpperCase()}S` : noun.toUpperCase()}</div>
        <div style={S.body}>
          Remove {these} from the library?
          <ul style={S.list}>
            {sample.map(l => <li key={l}>{l}</li>)}
            {extra > 0 && <li>…and {extra} more</li>}
          </ul>
        </div>

        {usage.count > 0 && (
          <div style={S.warn}>
            ⚠ {usage.count} {usageNoun}{usage.count !== 1 ? "s" : ""} across{" "}
            {usage.zones.length} group{usage.zones.length !== 1 ? "s" : ""} use{usage.count === 1 ? "s" : ""}{" "}
            {these}. {usageEffect}
          </div>
        )}

        <label style={S.check}>
          <input type="checkbox" checked={deleteFiles} onChange={e => setDeleteFiles(e.target.checked)} />
          Also delete the {noun} file{many ? "s" : ""} from disk (irreversible)
        </label>

        {needsFolderGrant && (
          <div style={S.hint}>
            Next, the browser will ask for a folder — select{" "}
            <strong style={{ color: "#90a4c0" }}>{folderHint}</strong> and allow editing.
          </div>
        )}

        <div style={S.row}>
          <button style={S.btn("ghost")}  onClick={onCancel}>Cancel</button>
          <button style={S.btn("danger")} onClick={() => onConfirm(deleteFiles)}>
            {deleteFiles ? "Delete + remove files" : "Remove from library"}
          </button>
        </div>
      </div>
    </div>
  );
}
