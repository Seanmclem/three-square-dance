import { useState } from "react";
import { slugifyId } from "@/project/ProjectStore";

interface NewProjectModalProps {
  /** Prefill for the scene-1 id — the slug of the current world's name (App knows it). */
  defaultSceneId: string;
  onConfirm: (name: string, startBlank: boolean, sceneId: string) => void;
  onCancel:  () => void;
}

/**
 * New Project dialog (Phase 33; folder picker removed in phase 55). The
 * desktop shell owns the project location — `games/<id>/` in the workspace —
 * so only a name is needed.
 */
export function NewProjectModal({ defaultSceneId, onConfirm, onCancel }: NewProjectModalProps) {
  const [name, setName] = useState("");
  const [startBlank, setStartBlank] = useState(false);
  const [sceneId, setSceneId] = useState(defaultSceneId);
  const [sceneIdTouched, setSceneIdTouched] = useState(false);

  const ready = !!name.trim() && !!slugifyId(sceneId.trim());

  const pickStart = (blank: boolean) => {
    setStartBlank(blank);
    // Untouched id follows the mode: adopted world keeps its name's slug,
    // a blank scene defaults to scene_01.
    if (!sceneIdTouched) setSceneId(blank ? "scene_01" : defaultSceneId);
  };

  const confirm = () => {
    if (ready) onConfirm(name.trim(), startBlank, slugifyId(sceneId.trim()));
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
          <div style={{ color: "#8b94a8", fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>NAME</div>
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
          <div style={{ color: "#8b94a8", fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>LOCATION</div>
          <div style={{ color: "#98a2b8", fontSize: 10, lineHeight: 1.5 }}>
            Created as <span style={{ color: "#8090a8" }}>games/{name.trim() ? slugifyId(name.trim()) : "…"}/</span> in
            your workspace — ▶ Play works immediately.
          </div>
        </div>

        <div>
          <div style={{ color: "#8b94a8", fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>SCENE 1</div>
          <div style={{ display: "flex", gap: 6 }}>
            {([
              { blank: false, label: "Current world", hint: "The world you're editing becomes the project's first scene" },
              { blank: true,  label: "Blank scene",   hint: "Start the project from an empty scene (like New)" },
            ] as const).map(o => (
              <button
                key={o.label}
                title={o.hint}
                onClick={() => pickStart(o.blank)}
                style={{
                  flex: 1, padding: "6px 0", borderRadius: 4, cursor: "pointer",
                  fontFamily: "monospace", fontSize: 10, letterSpacing: 0.5,
                  border: "none",
                  background: startBlank === o.blank ? "rgba(80,140,255,0.2)" : "rgba(46,46,46,0.9)",
                  color: startBlank === o.blank ? "#80aaff" : "#646464",
                  outline: startBlank === o.blank ? "1px solid rgba(80,140,255,0.33)" : "1px solid rgba(255,255,255,0.07)",
                }}
              >{o.label}</button>
            ))}
          </div>
          {startBlank && (
            <div style={{ color: "#8a7a50", fontSize: 10, lineHeight: 1.5, marginTop: 6 }}>
              The world you're editing now will be replaced — save it first if it
              isn't already part of a project or file.
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <span style={{ color: "#8b94a8", fontSize: 10, letterSpacing: 1, whiteSpace: "nowrap" }}>SCENE 1 ID</span>
            <input
              type="text"
              value={sceneId}
              onChange={e => { setSceneId(e.target.value); setSceneIdTouched(true); }}
              onKeyDown={e => { if (e.key === "Enter") confirm(); if (e.key === "Escape") onCancel(); }}
              style={{
                flex: 1, boxSizing: "border-box",
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 4, color: "#d8d8d8", fontSize: 11, padding: "5px 8px",
                outline: "none", fontFamily: "monospace",
              }}
            />
          </div>
          <div style={{ color: "#98a2b8", fontSize: 10, lineHeight: 1.5, marginTop: 4 }}>
            The scene's permanent id — its filename and what load_scene portals
            reference (renaming later isn't supported yet). Saved as{" "}
            <span style={{ color: "#8090a8" }}>scenes/{slugifyId(sceneId.trim()) || "…"}.json</span>.
          </div>
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
