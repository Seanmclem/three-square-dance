import { useState } from "react";
import type { AssetDef, CharacterDef } from "@/types";

/**
 * Phase 86 part B: the game's characters (game.json `characters`, like prefabs). Each row:
 * EDIT (the isolated character editor), USE AS PLAYER, DUPLICATE, DELETE (asks inline).
 * NEW starts a character from any model; its moves are filled in by AUTO FILL. (Turning
 * the player's MODEL + ANIMATIONS settings into a character lives on the player's
 * Character page, next to those settings: SAVE AS A CHARACTER.)
 */
export function CharacterPanel({ characters, assets, playerCharacterId, onNew, onEdit, onDuplicate, onDelete, onUseAsPlayer, onPlace }: {
  characters:        CharacterDef[];
  assets:            AssetDef[];
  playerCharacterId: string | null;
  onNew:             (modelAssetId: string) => void;
  onEdit:            (id: string) => void;
  onDuplicate:       (id: string) => void;
  onPlace:           (id: string) => void;   // part C: place it in the level (an animated object; turn on enemy AI for an enemy)
  onDelete:          (id: string) => void;
  onUseAsPlayer:     (id: string | null) => void;
}) {
  const [model, setModel] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const models = assets
    .filter(a => /\.(glb|gltf)$/i.test(a.path))
    .sort((a, b) => Number(b.category === "Characters") - Number(a.category === "Characters") || a.label.localeCompare(b.label));
  const label = (id: string) => assets.find(a => a.id === id)?.label ?? id;
  const btn = (primary = false): React.CSSProperties => ({
    padding: "5px 8px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 10,
    border: `1px solid ${primary ? "rgba(80,140,255,0.45)" : "rgba(255,255,255,0.14)"}`,
    background: primary ? "rgba(80,140,255,0.14)" : "rgba(46,46,46,0.8)", color: primary ? "#9dbdff" : "#dde3f0",
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ color: "#c2cadb", fontSize: 10, fontFamily: "monospace", letterSpacing: 1 }}>NEW CHARACTER FROM A MODEL</span>
        <div style={{ display: "flex", gap: 6 }}>
          <select value={model} onChange={e => setModel(e.target.value)} aria-label="Model for a new character"
            style={{ flex: 1, minWidth: 0, background: "#141416", color: "#dde3f0", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, fontSize: 11, fontFamily: "monospace", padding: "4px" }}>
            <option value="">choose a model…</option>
            {models.map(a => <option key={a.id} value={a.id}>{a.label}{a.category === "Characters" ? "" : ` (${a.category})`}{a.animations?.length ? ` · ${a.animations.length} clips` : ""}</option>)}
          </select>
          <button style={btn(!!model)} disabled={!model} onClick={() => { if (model) { onNew(model); setModel(""); } }}>NEW</button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
        {characters.length === 0 && (
          <div style={{ padding: "20px 8px", color: "#98a2b8", fontSize: 11, textAlign: "center", lineHeight: 1.5 }}>
            No characters yet. A character is a model plus how it moves: which clip plays for idle, walk, jump and so on, including clips borrowed from animation files with the same skeleton.
          </div>
        )}
        {characters.map(c => {
          const isPlayer = c.id === playerCharacterId;
          const set = Object.values(c.moves).filter(m => m.clip).length;
          return (
            <div key={c.id} data-character-row={c.id} style={{ border: `1px solid ${isPlayer ? "rgba(60,207,145,0.5)" : "rgba(255,255,255,0.1)"}`, borderRadius: 6, padding: "7px 8px", display: "flex", flexDirection: "column", gap: 6, background: "rgba(36,36,40,0.6)" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ flex: 1, color: "#dde3f0", fontSize: 12, fontFamily: "monospace", fontWeight: 600 }}>{c.name}</span>
                {isPlayer && <span style={{ color: "#7fe0b5", fontSize: 9, fontFamily: "monospace", letterSpacing: 1 }}>PLAYER</span>}
              </div>
              <span style={{ color: "#c2cadb", fontSize: 10, fontFamily: "monospace" }}>
                {label(c.modelAssetId)}{c.clipSources.length ? ` + clips from ${c.clipSources.map(label).join(", ")}` : ""} · {set} moves
              </span>
              {confirmDelete === c.id ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ flex: 1, color: "#ff9b8a", fontSize: 10 }}>Delete {c.name}?{isPlayer ? " The player goes back to its model settings." : ""}</span>
                  <button style={btn()} onClick={() => { onDelete(c.id); setConfirmDelete(null); }}>DELETE</button>
                  <button style={btn()} onClick={() => setConfirmDelete(null)}>KEEP</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <button style={btn(true)} onClick={() => onEdit(c.id)}>EDIT</button>
                  <button style={btn()} onClick={() => onPlace(c.id)}
                    title="Place it in the level: click to drop it (Esc stops). It idles and plays moves from scripts; turn on ENEMY AI on its AI screen to make it an enemy.">PLACE</button>
                  <button style={btn()} onClick={() => onUseAsPlayer(isPlayer ? null : c.id)}
                    title={isPlayer ? "Go back to the player's model settings" : "The game's player uses this character"}>{isPlayer ? "NOT PLAYER" : "USE AS PLAYER"}</button>
                  <button style={btn()} onClick={() => onDuplicate(c.id)}>DUPLICATE</button>
                  <button style={btn()} onClick={() => setConfirmDelete(c.id)}>DELETE</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
