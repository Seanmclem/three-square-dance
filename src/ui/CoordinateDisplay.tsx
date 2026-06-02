import type { Vec3 } from "@/types";

const AXES = [
  { label: "X", color: "#ff6b6b" },
  { label: "Y", color: "#6bff8a" },
  { label: "Z", color: "#6b8aff" },
] as const;

interface CoordinateDisplayProps { coords: Vec3 }

export function CoordinateDisplay({ coords }: CoordinateDisplayProps) {
  return (
    <div style={{
      position: "absolute", bottom: 16, left: 80,
      background: "rgba(28,28,28,0.88)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 6, padding: "4px 10px", zIndex: 10, display: "flex", gap: 12,
    }}>
      {AXES.map(({ label, color }) => {
        const value = coords[label.toLowerCase() as keyof Vec3];
        return (
          <span key={label} style={{ fontFamily: "monospace", fontSize: 11 }}>
            <span style={{ color }}>{label} </span>
            <span style={{ color: "#7a7a7a" }}>{value.toFixed(2)}</span>
          </span>
        );
      })}
    </div>
  );
}
