import { useEffect, useState } from "react";
import { desktop, type ProjectRow } from "@/shared/desktopApi";

interface OpenProjectModalProps {
  onConfirm: (projectId: string) => void;
  onCancel:  () => void;
}

/**
 * Open Project dialog (phase 55). Replaces the directory picker: the desktop
 * shell lists every project in the workspace games dir; click one to open it.
 */
export function OpenProjectModal({ onConfirm, onCancel }: OpenProjectModalProps) {
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    desktop()?.listProjects()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 60,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.6)",
    }}>
      <div style={{
        background: "rgba(28,28,28,0.99)", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8, padding: "20px 24px", width: 380, maxHeight: "70vh",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        <div style={{ color: "#c0c0c0", fontSize: 13, fontFamily: "monospace", letterSpacing: 1 }}>
          OPEN PROJECT
        </div>

        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {rows === null && !error && (
            <div style={{ color: "#98a2b8", fontSize: 11, fontFamily: "monospace" }}>Scanning workspace…</div>
          )}
          {error && <div style={{ color: "#cc6666", fontSize: 11 }}>{error}</div>}
          {rows?.length === 0 && (
            <div style={{ color: "#98a2b8", fontSize: 11, lineHeight: 1.6 }}>
              No projects in the workspace games folder yet — use New Project….
            </div>
          )}
          {rows?.map(r => (
            <button
              key={r.id}
              onClick={() => onConfirm(r.id)}
              style={{
                textAlign: "left", padding: "8px 12px", borderRadius: 4, cursor: "pointer",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                display: "flex", flexDirection: "column", gap: 2,
              }}
            >
              <span style={{ color: "#dde3f0", fontSize: 12, fontFamily: "monospace" }}>{r.name}</span>
              <span style={{ color: "#8090a8", fontSize: 10, fontFamily: "monospace" }}>
                games/{r.id}/ — {r.sceneIds.length} scene{r.sceneIds.length === 1 ? "" : "s"}
                {r.updatedAt ? ` — saved ${r.updatedAt.slice(0, 10)}` : ""}
              </span>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "6px 14px", borderRadius: 4, cursor: "pointer",
              background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
              color: "#646464", fontSize: 11, fontFamily: "monospace",
            }}
          >Cancel</button>
        </div>
      </div>
    </div>
  );
}
