import { useRef, useState, useEffect } from "react";
import { HelpButton } from "@/ui/HelpButton";

interface TopBarProps {
  activeFloor:     number;
  onFloorChange:   (level: number) => void;
  onCameraTopDown: () => void;
  onSave:          () => Promise<void>;
  onLoad:          (json: unknown) => void;
  onLoadFSA?:      () => Promise<void>;
  onNew?:          () => void;
  onUndo:          () => void;
  onRedo:          () => void;
  canUndo:         boolean;
  canRedo:         boolean;
  isDirty?:        boolean;
  lastAutosaveAt?: number | null;
  // Projects (Phase 33) — all optional; absent = classic single-scene rendering.
  project?: { name: string; sceneIds: string[]; currentSceneId: string; entryScene: string } | null;
  projectPendingName?: string | null;
  onProjectNew?:       () => void;
  onProjectOpen?:      () => void;
  onProjectReopen?:    () => void;
  onProjectClose?:     () => void;
  onProjectPlay?:      () => void;
  onProjectPublish?:   () => void;
  onSceneSwitch?:      (id: string) => void;
  onSceneAdd?:         () => void;
  onSceneDelete?:      (id: string) => void;
  onEntrySceneChange?: (id: string) => void;
}

const FLOORS = [
  { level: 0, label: "G" },
  { level: 1, label: "1" },
  { level: 2, label: "2" },
  { level: 3, label: "3" },
];

function useAutosaveLabel(lastAutosaveAt: number | null | undefined): string | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!lastAutosaveAt) return;
    const id = setInterval(() => setTick(t => t + 1), 10_000);
    return () => clearInterval(id);
  }, [lastAutosaveAt]);
  if (!lastAutosaveAt) return null;
  const sec = Math.floor((Date.now() - lastAutosaveAt) / 1000);
  if (sec < 10)  return "autosaved just now";
  if (sec < 60)  return `autosaved ${sec}s ago`;
  const min = Math.floor(sec / 60);
  return `autosaved ${min}m ago`;
}

const popBtn: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left",
  padding: "6px 12px", border: "none", background: "transparent",
  color: "#a0a0b8", fontSize: 11, cursor: "pointer", letterSpacing: 0.5,
  fontFamily: "monospace", whiteSpace: "nowrap",
};

/** Minimal popover: absolutely positioned panel under its anchor, closed by any
 *  outside pointerdown (first popover pattern in the codebase — Phase 33). */
function Popover({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} style={{
      position: "absolute", top: 40, left: 0, zIndex: 50, minWidth: 160,
      background: "rgba(20,22,30,0.98)", border: "1px solid rgba(100,160,255,0.25)",
      borderRadius: 6, padding: "4px 0", boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
    }}>
      {children}
    </div>
  );
}

export function TopBar({ activeFloor, onFloorChange, onCameraTopDown, onSave, onLoad, onLoadFSA, onNew, onUndo, onRedo, canUndo, canRedo, isDirty, lastAutosaveAt,
  project, projectPendingName, onProjectNew, onProjectOpen, onProjectReopen, onProjectClose, onProjectPlay, onProjectPublish,
  onSceneSwitch, onSceneAdd, onSceneDelete, onEntrySceneChange }: TopBarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const autosaveLabel = useAutosaveLabel(lastAutosaveAt);
  const [projMenuOpen, setProjMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        onLoad(json);
      } catch {
        console.error("Invalid scene file — could not parse JSON");
      }
      if (fileRef.current) fileRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const handleLoadClick = () => {
    if (onLoadFSA && 'showOpenFilePicker' in window) {
      void onLoadFSA();
    } else {
      fileRef.current?.click();
    }
  };

  return (
    <div style={{
      position: "absolute", top: 0, left: 64, right: 280, height: 48,
      background: "rgba(28,28,28,0.95)",
      borderBottom: "1px solid rgba(255,255,255,0.08)",
      display: "flex", alignItems: "center", gap: 12,
      padding: "0 16px", zIndex: 10,
    }}>
      <span style={{ color: "#80aaff", fontFamily: "monospace", fontSize: 13, letterSpacing: 2, opacity: 0.8 }}>
        SquareDance{isDirty ? <span style={{ color: "#ffcc66", marginLeft: 2 }}>*</span> : null}
      </span>
      {autosaveLabel && (
        <span style={{ color: "#3a3a50", fontSize: 10, fontFamily: "monospace", letterSpacing: 0.5 }}>
          {autosaveLabel}
        </span>
      )}
      <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.1)" }} />

      {/* Projects (Phase 33) */}
      {onProjectNew && !project && (
        <div style={{ position: "relative" }}>
          {projectPendingName ? (
            <button
              onClick={onProjectReopen}
              title={`Regrant folder access to reopen "${projectPendingName}"`}
              style={{
                padding: "4px 10px", border: "1px solid rgba(255,204,102,0.4)",
                borderRadius: 6, background: "rgba(255,204,102,0.08)", color: "#ffcc66",
                fontSize: 11, cursor: "pointer", letterSpacing: 1, fontFamily: "monospace",
                maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              REOPEN “{projectPendingName}”
            </button>
          ) : (
            <button
              onClick={() => setProjMenuOpen(o => !o)}
              style={{
                padding: "4px 10px", border: "1px solid rgba(255,255,255,0.09)",
                borderRadius: 6, background: "transparent", color: "#7a7a7a",
                fontSize: 11, cursor: "pointer", letterSpacing: 1, fontFamily: "monospace",
              }}
            >
              PROJ ▾
            </button>
          )}
          <Popover open={projMenuOpen} onClose={() => setProjMenuOpen(false)}>
            <button
              style={popBtn}
              title="First pick where projects live — choose <repo>/public/games for instant ▶ Play — then name it"
              onClick={() => { setProjMenuOpen(false); onProjectNew?.(); }}
            >
              New Project…
            </button>
            <button style={popBtn} title="Pick a project folder (contains manifest.json)" onClick={() => { setProjMenuOpen(false); onProjectOpen?.(); }}>Open Project…</button>
          </Popover>
        </div>
      )}
      {project && (
        <>
          <span
            title={`Project: ${project.name}`}
            style={{ color: "#80aaff", fontSize: 11, fontFamily: "monospace", letterSpacing: 1,
                     maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {project.name}
          </span>
          <select
            value={project.currentSceneId}
            onChange={e => onSceneSwitch?.(e.target.value)}
            title="Switch scene (current scene saves first)"
            style={{
              background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 6, color: "#c0c0c0", fontSize: 11, padding: "4px 6px",
              fontFamily: "monospace", outline: "none", maxWidth: 140,
            }}
          >
            {project.sceneIds.map(id => (
              <option key={id} value={id}>
                {id}{id === project.entryScene ? " ★" : ""}
              </option>
            ))}
          </select>
          <button
            onClick={onSceneAdd}
            title="Add scene"
            style={{ width: 24, height: 24, border: "1px solid rgba(255,255,255,0.09)", borderRadius: 6,
                     background: "transparent", color: "#7a7a7a", fontSize: 13, cursor: "pointer" }}
          >
            +
          </button>
          <button
            onClick={onProjectPlay}
            title="Play project in the runtime shell (saves first)"
            style={{ width: 24, height: 24, border: "1px solid rgba(80,200,120,0.35)", borderRadius: 6,
                     background: "rgba(80,200,120,0.08)", color: "#50c878", fontSize: 11, cursor: "pointer" }}
          >
            ▶
          </button>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setMoreMenuOpen(o => !o)}
              title="Project menu"
              style={{ width: 24, height: 24, border: "1px solid rgba(255,255,255,0.09)", borderRadius: 6,
                       background: "transparent", color: "#7a7a7a", fontSize: 12, cursor: "pointer" }}
            >
              ⋯
            </button>
            <Popover open={moreMenuOpen} onClose={() => setMoreMenuOpen(false)}>
              <div style={{ ...popBtn, cursor: "default", color: "#606070", display: "flex", alignItems: "center", gap: 6 }}>
                Entry scene
                <select
                  value={project.entryScene}
                  onChange={e => { onEntrySceneChange?.(e.target.value); }}
                  style={{ background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.12)",
                           borderRadius: 4, color: "#c0c0c0", fontSize: 11, fontFamily: "monospace", outline: "none" }}
                >
                  {project.sceneIds.map(id => <option key={id} value={id}>{id}</option>)}
                </select>
              </div>
              <button style={popBtn} onClick={() => { setMoreMenuOpen(false); onProjectPublish?.(); }}>Publish…</button>
              <button
                style={{ ...popBtn,
                         color: project.currentSceneId === project.entryScene || project.sceneIds.length <= 1 ? "#44444f" : "#cc6666",
                         cursor: project.currentSceneId === project.entryScene || project.sceneIds.length <= 1 ? "default" : "pointer" }}
                disabled={project.currentSceneId === project.entryScene || project.sceneIds.length <= 1}
                title="Deletes the current scene's file (entry scene can't be deleted)"
                onClick={() => { setMoreMenuOpen(false); onSceneDelete?.(project.currentSceneId); }}
              >
                Delete scene “{project.currentSceneId}”…
              </button>
              <button style={popBtn} onClick={() => { setMoreMenuOpen(false); onProjectClose?.(); }}>Close project</button>
            </Popover>
          </div>
        </>
      )}
      {(onProjectNew || project) && <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.1)" }} />}

      <span style={{ color: "#7a7a7a", fontSize: 11, letterSpacing: 1 }}>FLOOR</span>
      {FLOORS.map(({ level, label }) => (
        <button
          key={level}
          onClick={() => onFloorChange(level)}
          style={{
            width: 28, height: 28, border: "1px solid",
            borderColor: activeFloor === level ? "rgba(80,140,255,0.6)" : "rgba(255,255,255,0.08)",
            borderRadius: 6,
            background: activeFloor === level ? "rgba(80,140,255,0.2)" : "transparent",
            color: activeFloor === level ? "#80aaff" : "#7a7a7a",
            fontSize: 12, cursor: "pointer", fontFamily: "monospace",
          }}
        >
          {label}
        </button>
      ))}

      <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }} />
      <button
        onClick={onCameraTopDown}
        title="Top-down view"
        style={{
          padding: "3px 8px", border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 6, background: "transparent", color: "#7a7a7a",
          fontSize: 11, cursor: "pointer", letterSpacing: 1, fontFamily: "monospace",
        }}
      >
        TOP
      </button>
      <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }} />
      <HelpButton />
      <div style={{ flex: 1 }} />

      {([
        { label: "↩", title: "Undo (Cmd+Z)", onClick: onUndo, enabled: canUndo },
        { label: "↪", title: "Redo (Cmd+Y)", onClick: onRedo, enabled: canRedo },
      ] as const).map(btn => (
        <button
          key={btn.title}
          title={btn.title}
          onClick={btn.onClick}
          disabled={!btn.enabled}
          style={{
            width: 28, height: 28, border: "none", borderRadius: 6,
            background: btn.enabled ? "rgba(255,255,255,0.07)" : "transparent",
            color: btn.enabled ? "#9090b0" : "rgba(255,255,255,0.09)",
            fontSize: 14, cursor: btn.enabled ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.15s",
          }}
        >
          {btn.label}
        </button>
      ))}
      <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }} />

      <input
        ref={fileRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      {onNew && (
        <button
          onClick={onNew}
          style={{
            padding: "4px 12px", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 6, background: "transparent", color: "#585870",
            fontSize: 11, cursor: "pointer", letterSpacing: 1,
          }}
        >
          New
        </button>
      )}
      <button
        onClick={() => void onSave()}
        style={{
          padding: "4px 12px", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 6, background: "transparent", color: "#a0a0a0",
          fontSize: 11, cursor: "pointer", letterSpacing: 1,
        }}
      >
        Save
      </button>
      <button
        onClick={handleLoadClick}
        style={{
          padding: "4px 12px", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 6, background: "transparent", color: "#a0a0a0",
          fontSize: 11, cursor: "pointer", letterSpacing: 1,
        }}
      >
        Load
      </button>
    </div>
  );
}
