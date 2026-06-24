import { useState } from "react";
import type { GroupDef } from "@/types";

interface GroupPanelProps {
  groups:           GroupDef[];
  hiddenGroupIds:   Set<string>;
  onAdd:            () => void;
  onRemove:         (id: string) => void;
  onRename:         (id: string, name: string) => void;
  onToggleVisibility: (id: string) => void;
}

export function GroupPanel({ groups, hiddenGroupIds, onAdd, onRemove, onRename, onToggleVisibility }: GroupPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft,     setDraft]     = useState("");

  function startEdit(g: GroupDef): void {
    setEditingId(g.id);
    setDraft(g.name);
  }

  function commitEdit(id: string): void {
    const name = draft.trim();
    if (name) onRename(id, name);
    setEditingId(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 8px 6px 12px", flexShrink: 0,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <span style={{ color: "#646464", fontSize: 10, letterSpacing: 1, fontFamily: "monospace" }}>GROUPS</span>
        <button
          onClick={onAdd}
          style={{
            background: "rgba(80,140,255,0.1)", border: "1px solid rgba(80,140,255,0.2)",
            borderRadius: 4, cursor: "pointer", color: "#80aaff",
            fontSize: 10, padding: "3px 8px", fontFamily: "monospace", letterSpacing: 0.5,
          }}
        >+ New</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {groups.length === 0 ? (
          <div style={{ padding: "24px 16px", color: "#404050", fontSize: 10, textAlign: "center", fontFamily: "monospace" }}>
            No groups yet.<br />
            <span style={{ color: "#333340" }}>Create one to start tagging objects.</span>
          </div>
        ) : groups.map(g => (
          <div
            key={g.id}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 10px",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4d6fa8", flexShrink: 0 }} />

            {editingId === g.id ? (
              <input
                autoFocus
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={() => commitEdit(g.id)}
                onKeyDown={e => {
                  if (e.key === "Enter") commitEdit(g.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                style={{
                  flex: 1, background: "rgba(60,60,80,0.6)", border: "1px solid rgba(80,140,255,0.4)",
                  borderRadius: 3, color: "#c0c0e0", fontSize: 11, padding: "2px 6px",
                  fontFamily: "monospace", outline: "none",
                }}
              />
            ) : (
              <span
                onClick={() => startEdit(g)}
                title="Click to rename"
                style={{ flex: 1, color: "#b0b0c0", fontSize: 11, fontFamily: "monospace", cursor: "text",
                         overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {g.name}
              </span>
            )}

            <button
              onClick={() => onToggleVisibility(g.id)}
              title={hiddenGroupIds.has(g.id) ? "Group hidden — click to show" : "Group visible — click to hide"}
              style={{ background: "none", border: "none", fontSize: 12,
                       color: hiddenGroupIds.has(g.id) ? "#555560" : "#8a9ab0",
                       cursor: "pointer", padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
            >{hiddenGroupIds.has(g.id) ? "🚫" : "👁"}</button>

            <button
              onClick={() => onRemove(g.id)}
              title="Delete group"
              style={{ background: "none", border: "none", color: "#553333", fontSize: 13,
                       cursor: "pointer", padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.color = "#cc6666"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "#553333"; }}
            >×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
