import { useState } from "react";

interface NewProjectModalProps {
  onConfirm: (name: string, parentDir: FileSystemDirectoryHandle) => void;
  onCancel:  () => void;
}

/**
 * New Project dialog (Phase 33). Name + folder are chosen HERE, from labeled
 * controls — the directory picker runs off its own button click, so the
 * transient-user-activation rule (which broke the old prompt-then-pick flow,
 * v4.27.1) can never bite: every native dialog gets its own fresh gesture.
 */
export function NewProjectModal({ onConfirm, onCancel }: NewProjectModalProps) {
  const [name, setName] = useState("");
  const [dir, setDir]   = useState<FileSystemDirectoryHandle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = !!name.trim() && !!dir;

  const pickFolder = async () => {
    try {
      setDir(await window.showDirectoryPicker({ mode: "readwrite" }));
      setError(null);
    } catch (e: unknown) {
      if ((e as DOMException).name !== "AbortError") setError((e as Error).message);
    }
  };

  const confirm = () => {
    if (ready) onConfirm(name.trim(), dir!);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 60,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.6)",
    }}>
      <div style={{
        background: "rgba(28,28,28,0.99)", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8, padding: "20px 24px", width: 340,
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div style={{ color: "#c0c0c0", fontSize: 13, fontFamily: "monospace", letterSpacing: 1 }}>
          NEW PROJECT
        </div>

        <div>
          <div style={{ color: "#646464", fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>NAME</div>
          <input
            autoFocus
            type="text"
            placeholder="My Game…"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") confirm(); if (e.key === "Escape") onCancel(); }}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 4, color: "#d8d8d8", fontSize: 12, padding: "6px 8px",
              outline: "none", fontFamily: "monospace",
            }}
          />
        </div>

        <div>
          <div style={{ color: "#646464", fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>LOCATION</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => void pickFolder()}
              style={{
                padding: "6px 12px", borderRadius: 4, cursor: "pointer",
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                color: "#a0a0b8", fontSize: 11, fontFamily: "monospace", whiteSpace: "nowrap",
              }}
            >
              Choose folder…
            </button>
            <span style={{
              color: dir ? "#80aaff" : "#585870", fontSize: 11, fontFamily: "monospace",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {dir ? `📁 ${dir.name}/` : "not chosen"}
            </span>
          </div>
          <div style={{ color: "#585870", fontSize: 10, lineHeight: 1.5, marginTop: 6 }}>
            The project folder is created inside your pick. Choose
            <span style={{ color: "#8090a8" }}> &lt;repo&gt;/public/games </span>
            for instant ▶ Play in the runtime shell (see PUBLISHING_GUIDE.md).
          </div>
          {error && (
            <div style={{ color: "#cc6666", fontSize: 10, marginTop: 6 }}>{error}</div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "6px 14px", borderRadius: 4, cursor: "pointer",
              background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
              color: "#646464", fontSize: 11, fontFamily: "monospace",
            }}
          >Cancel</button>
          <button
            onClick={confirm}
            disabled={!ready}
            style={{
              padding: "6px 14px", borderRadius: 4, cursor: ready ? "pointer" : "default",
              background: ready ? "rgba(80,140,255,0.2)" : "rgba(46,46,46,0.5)",
              border: `1px solid ${ready ? "rgba(80,140,255,0.4)" : "rgba(255,255,255,0.06)"}`,
              color: ready ? "#80aaff" : "#404050",
              fontSize: 11, fontFamily: "monospace",
            }}
          >Create project</button>
        </div>
      </div>
    </div>
  );
}
