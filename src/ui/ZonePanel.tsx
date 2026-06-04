import type { ZoneDef, ZoneType } from "@/types";
import { HelpTooltip } from "@/ui/HelpTooltip";

const TYPE_COLORS: Record<ZoneType, string> = {
  outdoor: "#7a9a7a",
  indoor:  "#80aaff",
  dungeon: "#cc8080",
};

interface ZonePanelProps {
  zones:          ZoneDef[];
  activeZoneId:   string | null;
  onEnterZone:    (zoneId: string) => void;
  onNewZone:      () => void;
}

export function ZonePanel({ zones, activeZoneId, onEnterZone, onNewZone }: ZonePanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 8px 6px 12px", flexShrink: 0,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "#646464", fontSize: 10, letterSpacing: 1, fontFamily: "monospace" }}>ZONES</span>
          <HelpTooltip text="Zones are separate areas of your world — outdoor spaces, building interiors, dungeon floors. Only one zone is loaded at a time. Use the Floor selector inside a zone for multi-level spaces that should always be in memory together." />
        </div>
        <button
          onClick={onNewZone}
          style={{
            background: "rgba(80,140,255,0.1)", border: "1px solid rgba(80,140,255,0.2)",
            borderRadius: 4, cursor: "pointer", color: "#80aaff",
            fontSize: 10, padding: "3px 8px", fontFamily: "monospace", letterSpacing: 0.5,
          }}
        >+ New</button>
      </div>

      {/* Zone list */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {zones.length === 0 ? (
          <div style={{ padding: "24px 16px", color: "#404050", fontSize: 10, textAlign: "center" }}>
            No zones — draw one with the Zone tool.
          </div>
        ) : (
          zones.map(zone => {
            const isActive = zone.id === activeZoneId;
            const color    = TYPE_COLORS[zone.type as ZoneType] ?? "#808080";
            return (
              <div
                key={zone.id}
                style={{
                  padding: "10px 12px",
                  borderLeft: isActive ? `3px solid ${color}` : "3px solid transparent",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  background: isActive ? "rgba(80,140,255,0.04)" : "transparent",
                  display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    color: isActive ? color : "#c0c0c0",
                    fontSize: 11, fontFamily: "monospace",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {zone.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                    <span style={{
                      fontSize: 9, color, background: `${color}22`,
                      padding: "1px 5px", borderRadius: 3, letterSpacing: 0.5,
                    }}>{zone.type}</span>
                    <span style={{ fontSize: 9, color: "#404050" }}>
                      {zone.walls.length}w · {zone.floors.length}f
                    </span>
                  </div>
                  {isActive && (
                    <div style={{ color: "#404060", fontSize: 9, marginTop: 2 }}>editing</div>
                  )}
                </div>

                {!isActive && (
                  <button
                    onClick={() => onEnterZone(zone.id)}
                    style={{
                      flexShrink: 0, padding: "4px 8px", borderRadius: 4,
                      background: "rgba(80,140,255,0.08)", border: "1px solid rgba(80,140,255,0.2)",
                      cursor: "pointer", color: "#80aaff", fontSize: 10, fontFamily: "monospace",
                      whiteSpace: "nowrap",
                    }}
                  >Enter ›</button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
