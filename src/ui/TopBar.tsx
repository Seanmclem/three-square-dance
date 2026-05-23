import { HelpButton } from "@/ui/HelpButton";

interface TopBarProps {
  activeFloor:     number;
  onFloorChange:   (level: number) => void;
  onCameraTopDown: () => void;
}

const FLOORS = [
  { level: 0, label: "G" },
  { level: 1, label: "1" },
  { level: 2, label: "2" },
  { level: 3, label: "3" },
];

export function TopBar({ activeFloor, onFloorChange, onCameraTopDown }: TopBarProps) {
  return (
    <div style={{
      position: "absolute", top: 0, left: 64, right: 280, height: 48,
      background: "rgba(10,14,22,0.95)",
      borderBottom: "1px solid rgba(80,120,180,0.2)",
      display: "flex", alignItems: "center", gap: 12,
      padding: "0 16px", zIndex: 10,
    }}>
      <span style={{ color: "#80aaff", fontFamily: "monospace", fontSize: 13, letterSpacing: 2, opacity: 0.8 }}>
        SquareDance
      </span>
      <div style={{ width: 1, height: 24, background: "rgba(80,120,180,0.3)" }} />

      <span style={{ color: "#5a7a9a", fontSize: 11, letterSpacing: 1 }}>FLOOR</span>
      {FLOORS.map(({ level, label }) => (
        <button
          key={level}
          onClick={() => onFloorChange(level)}
          style={{
            width: 28, height: 28, border: "1px solid",
            borderColor: activeFloor === level ? "rgba(80,140,255,0.6)" : "rgba(80,120,180,0.2)",
            borderRadius: 6,
            background: activeFloor === level ? "rgba(80,140,255,0.2)" : "transparent",
            color: activeFloor === level ? "#80aaff" : "#5a7a9a",
            fontSize: 12, cursor: "pointer", fontFamily: "monospace",
          }}
        >
          {label}
        </button>
      ))}

      <div style={{ width: 1, height: 20, background: "rgba(80,120,180,0.2)" }} />
      <button
        onClick={onCameraTopDown}
        title="Top-down view"
        style={{
          padding: "3px 8px", border: "1px solid rgba(80,120,180,0.25)",
          borderRadius: 6, background: "transparent", color: "#5a7a9a",
          fontSize: 11, cursor: "pointer", letterSpacing: 1, fontFamily: "monospace",
        }}
      >
        TOP
      </button>
      <div style={{ width: 1, height: 20, background: "rgba(80,120,180,0.2)" }} />
      <HelpButton />
      <div style={{ flex: 1 }} />

      {(["Save", "Load"] as const).map(label => (
        <button
          key={label}
          style={{
            padding: "4px 12px", border: "1px solid rgba(80,120,180,0.3)",
            borderRadius: 6, background: "transparent", color: "#7a9ab8",
            fontSize: 11, cursor: "pointer", letterSpacing: 1,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
