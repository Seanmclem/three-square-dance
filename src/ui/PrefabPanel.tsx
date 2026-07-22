import { useState } from "react";
import type { PrefabDef } from "@/types";
import { GENERATORS } from "@/prefab/generators";

interface PrefabPanelProps {
  prefabs:         PrefabDef[];                 // the library (session or project game.json)
  instanceCounts:  Map<string, number>;         // prefabId → live instances in the open scene
  onPlacePrefab:   (prefabId: string) => void;
  onPlaceGenerator:(generatorId: string) => void;  // creates a library def on first use, then places
  onRename:        (prefabId: string, name: string) => void;
  onDelete:        (prefabId: string) => void;
}

/**
 * Prefab library panel (Phase 44). Lists the built-in generators (always
 * available — placing one creates its library entry) and the library's prefab
 * defs with live instance counts. Capture-from-selection lands with snapshot
 * prefabs (phase 46).
 */
export function PrefabPanel({
  prefabs, instanceCounts, onPlacePrefab, onPlaceGenerator, onRename, onDelete,
}: PrefabPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft,     setDraft]     = useState("");

  function commitEdit(id: string): void {
    const name = draft.trim();
    if (name) onRename(id, name);
    setEditingId(null);
  }

  const libraryGeneratorIds = new Set(prefabs.filter(p => p.kind === "generator").map(p => p.generatorId));
  const unplacedGenerators  = Object.values(GENERATORS).filter(g => !libraryGeneratorIds.has(g.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 8px 6px 12px", flexShrink: 0,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <span style={{ color: "#8a92a6", fontSize: 10, letterSpacing: 1, fontFamily: "monospace" }}>PREFABS</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {prefabs.length === 0 && unplacedGenerators.length === 0 && (
          <div style={{ padding: "24px 16px", color: "#8a92a6", fontSize: 10, textAlign: "center", fontFamily: "monospace" }}>
            No prefabs yet.
          </div>
        )}

        {prefabs.map(p => {
          const count = instanceCounts.get(p.id) ?? 0;
          return (
            <div key={p.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px" }}>
                <span
                  title={p.kind === "generator" ? "Generator prefab — parameters drive its contents" : "Snapshot prefab"}
                  style={{ color: p.kind === "generator" ? "#7fb069" : "#80aaff", fontSize: 11, flexShrink: 0, fontFamily: "monospace" }}
                >{p.kind === "generator" ? "ƒ" : "⬡"}</span>

                {editingId === p.id ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onBlur={() => commitEdit(p.id)}
                    onKeyDown={e => {
                      if (e.key === "Enter") commitEdit(p.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    style={{
                      flex: 1, background: "rgba(60,60,80,0.6)", border: "1px solid rgba(80,140,255,0.4)",
                      borderRadius: 3, color: "#dde3f0", fontSize: 11, padding: "2px 6px",
                      fontFamily: "monospace", outline: "none",
                    }}
                  />
                ) : (
                  <span
                    onClick={() => { setEditingId(p.id); setDraft(p.name); }}
                    title="Click to rename"
                    style={{ flex: 1, color: "#dde3f0", fontSize: 11, fontFamily: "monospace", cursor: "text",
                             overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >{p.name}</span>
                )}

                <span title="Instances in this scene"
                  style={{ color: "#8a92a6", fontSize: 10, fontFamily: "monospace", flexShrink: 0 }}>
                  {count}
                </span>

                <button
                  onClick={() => onPlacePrefab(p.id)}
                  title="Place an instance (click in the viewport; R rotates, Esc stops)"
                  style={{
                    background: "rgba(80,140,255,0.1)", border: "1px solid rgba(80,140,255,0.25)",
                    borderRadius: 3, cursor: "pointer", color: "#80aaff",
                    fontSize: 9, padding: "3px 8px", fontFamily: "monospace", flexShrink: 0,
                  }}
                >Place</button>

                <button
                  onClick={() => onDelete(p.id)}
                  disabled={count > 0}
                  title={count > 0 ? `${count} placed instance(s) — unlink or delete them first` : "Delete prefab"}
                  style={{ background: "none", border: "none", color: count > 0 ? "#3a3a44" : "#b06060", fontSize: 13,
                           cursor: count > 0 ? "default" : "pointer", padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
                >×</button>
              </div>
            </div>
          );
        })}

        {unplacedGenerators.length > 0 && (
          <>
            <div style={{ padding: "10px 12px 4px", color: "#8a92a6", fontSize: 9, letterSpacing: 1, fontFamily: "monospace" }}>
              BUILT-IN GENERATORS
            </div>
            {unplacedGenerators.map(g => (
              <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px",
                                       borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ color: "#7fb069", fontSize: 11, flexShrink: 0, fontFamily: "monospace" }}>ƒ</span>
                <span style={{ flex: 1, color: "#c2cadb", fontSize: 11, fontFamily: "monospace" }}>{g.label}</span>
                <button
                  onClick={() => onPlaceGenerator(g.id)}
                  title="Add to the library and place an instance"
                  style={{
                    background: "rgba(127,176,105,0.1)", border: "1px solid rgba(127,176,105,0.3)",
                    borderRadius: 3, cursor: "pointer", color: "#7fb069",
                    fontSize: 9, padding: "3px 8px", fontFamily: "monospace", flexShrink: 0,
                  }}
                >Place</button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
