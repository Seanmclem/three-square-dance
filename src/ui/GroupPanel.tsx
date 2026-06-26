import { useState } from "react";
import type { GroupDef, SelectedRef } from "@/types";
import type { GroupMember } from "@/editor/groupMembers";

interface GroupPanelProps {
  groups:            GroupDef[];
  hiddenGroupIds:    Set<string>;
  groupMembers:      Map<string, GroupMember[]>;
  multiSelectedCount: number;
  onAdd:             () => void;
  onRemove:          (id: string) => void;
  onRename:          (id: string, name: string) => void;
  onToggleVisibility:(id: string) => void;
  onAddSelected:     (groupId: string) => void;
  onRemoveMember:    (groupId: string, ref: SelectedRef) => void;
  onSelectMembers:   (groupId: string) => void;
  onDeleteMembers:   (groupId: string) => void;
  onDuplicateMembers:(groupId: string) => void;
}

export function GroupPanel({
  groups, hiddenGroupIds, groupMembers, multiSelectedCount,
  onAdd, onRemove, onRename, onToggleVisibility,
  onAddSelected, onRemoveMember, onSelectMembers, onDeleteMembers, onDuplicateMembers,
}: GroupPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft,     setDraft]     = useState("");
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set());

  function startEdit(g: GroupDef): void {
    setEditingId(g.id);
    setDraft(g.name);
  }

  function commitEdit(id: string): void {
    const name = draft.trim();
    if (name) onRename(id, name);
    setEditingId(null);
  }

  function toggleExpanded(id: string): void {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
        ) : groups.map(g => {
          const isOpen  = expanded.has(g.id);
          const members = groupMembers.get(g.id) ?? [];
          return (
            <div key={g.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px" }}>
                <button
                  onClick={() => toggleExpanded(g.id)}
                  title={isOpen ? "Collapse" : "Expand"}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#606070",
                           fontSize: 11, lineHeight: 1, padding: "0 1px", flexShrink: 0,
                           display: "inline-block", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.12s" }}
                >›</button>

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

                <span style={{ color: "#505060", fontSize: 10, fontFamily: "monospace", flexShrink: 0 }}>
                  {members.length}
                </span>

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

              {isOpen && (
                <div style={{ padding: "0 10px 10px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    <ActionBtn
                      label={`+ Add selected${multiSelectedCount > 0 ? ` (${multiSelectedCount})` : ""}`}
                      disabled={multiSelectedCount === 0}
                      onClick={() => onAddSelected(g.id)}
                      accent
                    />
                    <ActionBtn label="Select"    disabled={members.length === 0} onClick={() => onSelectMembers(g.id)} />
                    <ActionBtn label="Duplicate" disabled={members.length === 0} onClick={() => onDuplicateMembers(g.id)} />
                    <ActionBtn label="Delete"    disabled={members.length === 0} onClick={() => onDeleteMembers(g.id)} danger />
                  </div>

                  {members.length === 0 ? (
                    <div style={{ color: "#404050", fontSize: 10, fontFamily: "monospace" }}>
                      No members. Select objects and click “Add selected”.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      {members.map(m => (
                        <div key={`${m.ref.type}:${m.ref.id}`}
                          style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                          <span style={{ color: "#505060", fontSize: 9, fontFamily: "monospace", width: 30, flexShrink: 0 }}>
                            {m.ref.type.slice(0, 4)}
                          </span>
                          <span style={{ flex: 1, color: "#9090a0", fontSize: 10, fontFamily: "monospace",
                                         overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {m.label}
                          </span>
                          <button
                            onClick={() => onRemoveMember(g.id, m.ref)}
                            title="Remove from group"
                            style={{ background: "none", border: "none", color: "#454555", fontSize: 12,
                                     cursor: "pointer", padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
                            onMouseEnter={e => { e.currentTarget.style.color = "#cc6666"; }}
                            onMouseLeave={e => { e.currentTarget.style.color = "#454555"; }}
                          >×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActionBtn({ label, onClick, disabled, accent, danger }: {
  label: string; onClick: () => void; disabled?: boolean; accent?: boolean; danger?: boolean;
}) {
  const color  = disabled ? "#3a3a44" : danger ? "#b06060" : accent ? "#80aaff" : "#9098a8";
  const border = disabled ? "rgba(255,255,255,0.05)" : danger ? "rgba(180,90,90,0.25)" : accent ? "rgba(80,140,255,0.25)" : "rgba(255,255,255,0.1)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: accent && !disabled ? "rgba(80,140,255,0.08)" : "transparent",
        border: `1px solid ${border}`, borderRadius: 3,
        cursor: disabled ? "default" : "pointer", color,
        fontSize: 9, padding: "3px 6px", fontFamily: "monospace", letterSpacing: 0.3,
      }}
    >{label}</button>
  );
}
