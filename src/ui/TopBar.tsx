import { useRef, useState, useEffect } from "react";
import { HelpButton } from "@/ui/HelpButton";
import { isDesktop } from "@/shared/desktopApi";

interface TopBarProps {
  activeFloor:     number;
  onFloorChange:   (level: number) => void;
  onCameraTopDown: () => void;
  onSave:          () => Promise<void>;
  onLoad:          (json: unknown) => void;
  onNew?:          () => void;
  onUndo:          () => void;
  onRedo:          () => void;
  canUndo:         boolean;
  canRedo:         boolean;
  isDirty?:        boolean;
  lastAutosaveAt?: number | null;
  // Projects (Phase 33) — all optional; absent = classic single-scene rendering.
  project?: { name: string; sceneIds: string[]; currentSceneId: string; entryScene: string } | null;
  onProjectNew?:       () => void;
  onProjectOpen?:      () => void;
  onProjectClose?:     () => void;
  onProjectPlay?:      () => void;
  onProjectExport?:    () => void;
  onSceneSwitch?:      (id: string) => void;
  onSceneAdd?:         () => void;
  onSceneDelete?:      (id: string) => void;
  onEntrySceneChange?: (id: string) => void;
}

const FLOORS = [
  { level: 0, label: "G", name: "Ground" },
  { level: 1, label: "1", name: "Floor 1" },
  { level: 2, label: "2", name: "Floor 2" },
  { level: 3, label: "3", name: "Floor 3" },
];

/** "saved 24m ago" — relative to the last autosave, re-rendered every 10s. */
function useSavedLabel(lastAutosaveAt: number | null | undefined): string | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!lastAutosaveAt) return;
    const id = setInterval(() => setTick(t => t + 1), 10_000);
    return () => clearInterval(id);
  }, [lastAutosaveAt]);
  if (!lastAutosaveAt) return null;
  const sec = Math.floor((Date.now() - lastAutosaveAt) / 1000);
  if (sec < 10)  return "saved just now";
  if (sec < 60)  return `saved ${sec}s ago`;
  const min = Math.floor(sec / 60);
  return `saved ${min}m ago`;
}

// ── Phase 66 top bar (direction F: command bar + explicit Save + labelled Top) ──
const SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Small stroke icons, one style. */
function Ic({ name, size = 14 }: { name: string; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "play":   return <svg {...p}><path d="M5 3.5v9l7-4.5z" fill="currentColor" stroke="none" /></svg>;
    case "plus":   return <svg {...p}><path d="M8 3.5v9M3.5 8h9" /></svg>;
    case "dots":   return <svg {...p}><circle cx="4" cy="8" r="1.2" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" /><circle cx="12" cy="8" r="1.2" fill="currentColor" stroke="none" /></svg>;
    case "undo":   return <svg {...p}><path d="M6 4 3 7l3 3" /><path d="M3 7h6a4 4 0 0 1 0 8H7" /></svg>;
    case "redo":   return <svg {...p}><path d="M10 4l3 3-3 3" /><path d="M13 7H7a4 4 0 0 0 0 8h2" /></svg>;
    case "save":   return <svg {...p}><path d="M3 3h8l2 2v8H3z" /><path d="M5 3v4h5V3M5 13V9h6v4" /></svg>;
    case "folder": return <svg {...p}><path d="M2.5 4h4l1.5 1.5h5.5v7h-11z" /></svg>;
    case "file":   return <svg {...p}><path d="M4 2.5h5l3 3v8H4z" /><path d="M9 2.5v3h3" /></svg>;
    case "reload": return <svg {...p}><path d="M13 8a5 5 0 1 1-1.5-3.5" /><path d="M13 3v3h-3" /></svg>;
    case "layers": return <svg {...p}><path d="M8 3 2.5 6 8 9l5.5-3z" /><path d="M2.5 9 8 12l5.5-3" /></svg>;
    case "top":    return <svg {...p}><rect x="3" y="3" width="10" height="10" rx="1.5" /><path d="M3 7h10M7 3v10" opacity="0.5" /></svg>;
    case "star":   return <svg {...p}><path d="M8 2.5l1.7 3.6 3.9.5-2.8 2.7.7 3.9L8 11.3l-3.5 1.9.7-3.9L2.4 6.6l3.9-.5z" fill="currentColor" stroke="none" /></svg>;
    case "chev":   return <svg {...p}><path d="M4.5 6.5 8 10l3.5-3.5" /></svg>;
    case "export": return <svg {...p}><path d="M8 10V3M5 6l3-3 3 3" /><path d="M3 10v3h10v-3" /></svg>;
    case "x":      return <svg {...p}><path d="M4 4l8 8M12 4l-8 8" /></svg>;
    case "close":  return <svg {...p}><path d="M3 3h10v10H3z" /><path d="M6 6l4 4M10 6l-4 4" /></svg>;
    default:       return null;
  }
}

/** Icon/text button: `ghost` has no border until hover, `on` is the active blue, `primary` is the filled green Play. */
function ibStyle(opts: { ghost?: boolean; on?: boolean; primary?: boolean; disabled?: boolean; amber?: boolean }): React.CSSProperties {
  const { ghost, on, primary, disabled, amber } = opts;
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    height: 28, minWidth: 28, padding: "0 8px", borderRadius: 6, whiteSpace: "nowrap",
    fontFamily: primary ? SANS : "monospace", fontSize: 11, fontWeight: primary ? 600 : 400,
    cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.35 : 1,
    border: `1px solid ${primary ? "#50c878" : on ? "rgba(80,140,255,0.6)" : amber ? "rgba(232,193,75,0.4)" : ghost ? "transparent" : "rgba(255,255,255,0.09)"}`,
    background: primary ? "#50c878" : on ? "rgba(80,140,255,0.2)" : "transparent",
    color: primary ? "#0f1115" : on ? "#80aaff" : amber ? "#e8c14b" : "#9aa3b5",
    transition: "background 0.12s, color 0.12s, border-color 0.12s",
  };
}

const popBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
  padding: "6px 12px", border: "none", background: "transparent",
  color: "#c2cadb", fontSize: 11, cursor: "pointer",
  fontFamily: "monospace", whiteSpace: "nowrap", borderRadius: 4,
};
const popHead: React.CSSProperties = { ...popBtn, cursor: "default", color: "#8b94a8", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", paddingTop: 8 };
const popHr: React.CSSProperties = { height: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0" };

/** Minimal popover: absolutely positioned panel under its anchor, closed by any
 *  outside pointerdown (first popover pattern in the codebase — Phase 33). */
function Popover({ open, onClose, align = "left", children }: { open: boolean; onClose: () => void; align?: "left" | "right"; children: React.ReactNode }) {
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
      position: "absolute", top: 36, ...(align === "right" ? { right: 0 } : { left: 0 }), zIndex: 50, minWidth: 190,
      background: "rgba(20,22,30,0.98)", border: "1px solid rgba(100,160,255,0.25)",
      borderRadius: 6, padding: "4px 4px", boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
      display: "flex", flexDirection: "column",
    }}>
      {children}
    </div>
  );
}

const SEP = <div style={{ width: 1, height: 22, background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />;

export function TopBar({ activeFloor, onFloorChange, onCameraTopDown, onSave, onLoad, onNew, onUndo, onRedo, canUndo, canRedo, isDirty, lastAutosaveAt,
  project, onProjectNew, onProjectOpen, onProjectClose, onProjectPlay, onProjectExport,
  onSceneSwitch, onSceneAdd, onSceneDelete, onEntrySceneChange }: TopBarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const savedLabel = useSavedLabel(lastAutosaveAt);
  const [projMenuOpen, setProjMenuOpen] = useState(false);
  const [sceneMenuOpen, setSceneMenuOpen] = useState(false);
  const [floorMenuOpen, setFloorMenuOpen] = useState(false);
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
    fileRef.current?.click();
  };

  const floor = FLOORS.find(f => f.level === activeFloor) ?? FLOORS[0]!;
  const canDeleteScene = !!project && project.currentSceneId !== project.entryScene && project.sceneIds.length > 1;
  const hover = (e: React.MouseEvent<HTMLElement>, on: boolean) => {
    const el = e.currentTarget as HTMLElement;
    el.style.background = on ? "rgba(255,255,255,0.06)" : "transparent";
  };

  return (
    <div style={{
      position: "absolute", top: 0, left: 64, right: 280, height: 48,
      background: "rgba(28,28,28,0.95)",
      borderBottom: "1px solid rgba(255,255,255,0.08)",
      display: "flex", alignItems: "center", gap: 8,
      padding: "0 14px", zIndex: 10, fontFamily: "monospace",
    }}>
      {/* Mark */}
      <div title="SquareDance" style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0,
        background: "linear-gradient(135deg, #80aaff, #5b7fd6)", color: "#0f1115",
        display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 700, fontSize: 12 }}>
        S
      </div>

      {/* Breadcrumb: project › scene */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setProjMenuOpen(o => !o)}
            title={project ? `Project: ${project.name} — click for the project menu` : "No project open — click to create or open one"}
            style={{ background: "transparent", border: "none", padding: "3px 4px", borderRadius: 4, cursor: "pointer",
              color: project ? "#80aaff" : "#8b94a8", fontFamily: "monospace", fontSize: 12, letterSpacing: 0.5,
              maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            onMouseEnter={(e) => hover(e, true)} onMouseLeave={(e) => hover(e, false)}
          >
            {project ? project.name : "no project"}
          </button>
          <Popover open={projMenuOpen} onClose={() => setProjMenuOpen(false)}>
            {project && <div style={popHead}>Project · {project.name}</div>}
            {onProjectNew && (
              <button style={popBtn} title="Name the project — it lives in the workspace games folder"
                onClick={() => { setProjMenuOpen(false); onProjectNew(); }}
                onMouseEnter={(e) => hover(e, true)} onMouseLeave={(e) => hover(e, false)}>
                <Ic name="file" size={12} /> New project…
              </button>
            )}
            {onProjectOpen && (
              <button style={popBtn} title="Open a project from the workspace"
                onClick={() => { setProjMenuOpen(false); onProjectOpen(); }}
                onMouseEnter={(e) => hover(e, true)} onMouseLeave={(e) => hover(e, false)}>
                <Ic name="folder" size={12} /> Open project…
              </button>
            )}
            {project && onProjectExport && (
              <button style={popBtn} onClick={() => { setProjMenuOpen(false); onProjectExport(); }}
                onMouseEnter={(e) => hover(e, true)} onMouseLeave={(e) => hover(e, false)}>
                <Ic name="export" size={12} /> Export game…
              </button>
            )}
            {project && onProjectClose && (
              <>
                <div style={popHr} />
                <button style={popBtn} onClick={() => { setProjMenuOpen(false); onProjectClose(); }}
                  onMouseEnter={(e) => hover(e, true)} onMouseLeave={(e) => hover(e, false)}>
                  <Ic name="close" size={12} /> Close project
                </button>
              </>
            )}
          </Popover>
        </div>

        {project && (
          <>
            <span style={{ color: "#5c6478", fontSize: 12 }}>›</span>
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setSceneMenuOpen(o => !o)}
                title="Scene — click to switch, add, or set the entry scene (switching saves the current scene first)"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent",
                  border: "1px solid transparent", padding: "3px 6px", borderRadius: 6, cursor: "pointer",
                  color: "#dde3f0", fontFamily: "monospace", fontSize: 12, maxWidth: 190 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.14)"; hover(e, true); }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "transparent"; hover(e, false); }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.currentSceneId}</span>
                {project.currentSceneId === project.entryScene && (
                  <span title="Entry scene — the game starts here" style={{ color: "#e8c14b", display: "inline-flex" }}><Ic name="star" size={10} /></span>
                )}
                <span style={{ color: "#8b94a8", display: "inline-flex" }}><Ic name="chev" size={11} /></span>
              </button>
              <Popover open={sceneMenuOpen} onClose={() => setSceneMenuOpen(false)}>
                <div style={popHead}>Scenes</div>
                {project.sceneIds.map(id => (
                  <button key={id} style={{ ...popBtn, color: id === project.currentSceneId ? "#80aaff" : "#c2cadb" }}
                    onClick={() => { setSceneMenuOpen(false); if (id !== project.currentSceneId) onSceneSwitch?.(id); }}
                    onMouseEnter={(e) => hover(e, true)} onMouseLeave={(e) => hover(e, false)}>
                    <span style={{ width: 12, display: "inline-flex", color: "#e8c14b" }}>{id === project.entryScene && <Ic name="star" size={11} />}</span>
                    {id}
                    {id === project.currentSceneId && <span style={{ marginLeft: "auto", color: "#8b94a8", fontSize: 10 }}>current</span>}
                  </button>
                ))}
                <div style={popHr} />
                {onSceneAdd && (
                  <button style={popBtn} onClick={() => { setSceneMenuOpen(false); onSceneAdd(); }}
                    onMouseEnter={(e) => hover(e, true)} onMouseLeave={(e) => hover(e, false)}>
                    <Ic name="plus" size={12} /> New scene…
                  </button>
                )}
                {onEntrySceneChange && project.currentSceneId !== project.entryScene && (
                  <button style={popBtn} title="The game starts in the entry scene"
                    onClick={() => { setSceneMenuOpen(false); onEntrySceneChange(project.currentSceneId); }}
                    onMouseEnter={(e) => hover(e, true)} onMouseLeave={(e) => hover(e, false)}>
                    <Ic name="star" size={12} /> Make this the entry scene
                  </button>
                )}
                {onSceneDelete && (
                  <button style={{ ...popBtn, color: canDeleteScene ? "#cc6666" : "#5c6478", cursor: canDeleteScene ? "pointer" : "default" }}
                    disabled={!canDeleteScene}
                    title={canDeleteScene ? "Deletes the current scene's file" : "The entry scene (or the only scene) can't be deleted"}
                    onClick={() => { setSceneMenuOpen(false); onSceneDelete(project.currentSceneId); }}
                    onMouseEnter={(e) => { if (canDeleteScene) hover(e, true); }} onMouseLeave={(e) => hover(e, false)}>
                    <Ic name="x" size={12} /> Delete scene “{project.currentSceneId}”…
                  </button>
                )}
              </Popover>
            </div>
          </>
        )}
      </div>

      {/* Save state */}
      <span title={isDirty ? "Unsaved changes — Save (⌘S) writes the scene" : (savedLabel ?? "nothing saved yet")}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, color: isDirty ? "#e8c14b" : "#8b94a8", fontSize: 10, letterSpacing: 0.5, whiteSpace: "nowrap", marginLeft: 4 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
          background: isDirty ? "#e8c14b" : "#50c878", boxShadow: `0 0 6px ${isDirty ? "rgba(232,193,75,0.5)" : "rgba(80,200,120,0.5)"}` }} />
        {isDirty ? "unsaved changes" : (savedLabel ?? "")}
      </span>

      <div style={{ flex: 1 }} />

      {/* Floor menu */}
      <div style={{ position: "relative" }}>
        <button title="Which floor you're editing" onClick={() => setFloorMenuOpen(o => !o)} style={ibStyle({ on: floorMenuOpen })}>
          <Ic name="layers" /> Floor {floor.label} <Ic name="chev" size={11} />
        </button>
        <Popover open={floorMenuOpen} onClose={() => setFloorMenuOpen(false)} align="right">
          {FLOORS.map(f => (
            <button key={f.level} style={{ ...popBtn, color: f.level === activeFloor ? "#80aaff" : "#c2cadb" }}
              onClick={() => { setFloorMenuOpen(false); onFloorChange(f.level); }}
              onMouseEnter={(e) => hover(e, true)} onMouseLeave={(e) => hover(e, false)}>
              <span style={{ width: 14, textAlign: "center", color: "#8b94a8" }}>{f.label}</span>{f.name}
            </button>
          ))}
        </Popover>
      </div>
      <button onClick={onCameraTopDown} title="Top-down view" style={ibStyle({})}>
        <Ic name="top" /> Top
      </button>

      {SEP}

      <button title="Undo (⌘Z)" onClick={onUndo} disabled={!canUndo} style={ibStyle({ ghost: true, disabled: !canUndo })}><Ic name="undo" /></button>
      <button title="Redo (⌘Y)" onClick={onRedo} disabled={!canRedo} style={ibStyle({ ghost: true, disabled: !canRedo })}><Ic name="redo" /></button>
      <HelpButton />
      {isDesktop() && (
        <button
          title={`Reload the editor UI — picks up a fresh build (unsaved changes are autosaved first). Running build: ${__BUILD_STAMP__}`}
          onClick={() => location.reload()}
          style={ibStyle({ ghost: true })}
        >
          <Ic name="reload" />
        </button>
      )}

      {SEP}

      <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleFileChange} />
      <button onClick={() => void onSave()} title={isDirty ? "Save — unsaved changes (⌘S)" : "Save (⌘S)"} style={ibStyle({ amber: !!isDirty })}>
        <Ic name="save" /> Save
      </button>
      {project && onProjectPlay && (
        <button onClick={onProjectPlay} title="Play the project in the runtime shell (saves first)" style={ibStyle({ primary: true })}>
          <Ic name="play" /> Play
        </button>
      )}
      <div style={{ position: "relative" }}>
        <button onClick={() => setMoreMenuOpen(o => !o)} title="More…" style={ibStyle({ ghost: true, on: moreMenuOpen })}>
          <Ic name="dots" />
        </button>
        <Popover open={moreMenuOpen} onClose={() => setMoreMenuOpen(false)} align="right">
          {project && onEntrySceneChange && (
            <div style={{ ...popHead, textTransform: "none", letterSpacing: 0, fontSize: 11, gap: 6 }}>
              Entry scene
              <select
                value={project.entryScene}
                onChange={e => onEntrySceneChange(e.target.value)}
                style={{ background: "rgba(46,46,46,0.9)", border: "1px solid rgba(255,255,255,0.12)",
                         borderRadius: 4, color: "#c0c0c0", fontSize: 11, fontFamily: "monospace", outline: "none", marginLeft: "auto" }}
              >
                {project.sceneIds.map(id => <option key={id} value={id}>{id}</option>)}
              </select>
            </div>
          )}
          {project && onProjectExport && (
            <button style={popBtn} onClick={() => { setMoreMenuOpen(false); onProjectExport(); }}
              onMouseEnter={(e) => hover(e, true)} onMouseLeave={(e) => hover(e, false)}>
              <Ic name="export" size={12} /> Export game…
            </button>
          )}
          {(project || onNew) && <div style={popHr} />}
          {onNew && (
            <button style={popBtn} title="Start a fresh, empty world" onClick={() => { setMoreMenuOpen(false); onNew(); }}
              onMouseEnter={(e) => hover(e, true)} onMouseLeave={(e) => hover(e, false)}>
              <Ic name="file" size={12} /> New empty world
            </button>
          )}
          <button style={popBtn} title="Load a scene from a JSON file" onClick={() => { setMoreMenuOpen(false); handleLoadClick(); }}
            onMouseEnter={(e) => hover(e, true)} onMouseLeave={(e) => hover(e, false)}>
            <Ic name="folder" size={12} /> Load scene JSON…
          </button>
          {project && onProjectClose && (
            <>
              <div style={popHr} />
              <button style={popBtn} onClick={() => { setMoreMenuOpen(false); onProjectClose(); }}
                onMouseEnter={(e) => hover(e, true)} onMouseLeave={(e) => hover(e, false)}>
                <Ic name="close" size={12} /> Close project
              </button>
            </>
          )}
        </Popover>
      </div>
    </div>
  );
}
