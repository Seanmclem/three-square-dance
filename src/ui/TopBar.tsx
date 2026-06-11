import { useRef } from "react";
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
}

const FLOORS = [
  { level: 0, label: "G" },
  { level: 1, label: "1" },
  { level: 2, label: "2" },
  { level: 3, label: "3" },
];

export function TopBar({ activeFloor, onFloorChange, onCameraTopDown, onSave, onLoad, onLoadFSA, onNew, onUndo, onRedo, canUndo, canRedo, isDirty }: TopBarProps) {
  const fileRef = useRef<HTMLInputElement>(null);

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
      <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.1)" }} />

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
