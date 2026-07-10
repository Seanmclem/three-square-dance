import { useEffect, useState, type ComponentType } from "react";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import { ownedItems, type OwnedItem } from "@/scripting/inventory";

/**
 * Inventory bag overlay (Phase 32, view-only). Split into a container and a
 * swappable style renderer so games can ship different bag looks later:
 *  - container (this file's BagOverlay): bus wiring (menu:nav highlight,
 *    action:confirm closes, state:changed live-refresh), close/backdrop —
 *    everything a style must never reimplement;
 *  - style renderer: purely presentational, picked from BAG_STYLES by
 *    playerSettings.bagStyle (default "list"). Adding a style = one component
 *    + one registry entry (+ an editor dropdown once there are ≥2).
 */
export interface BagStyleProps {
  items:         OwnedItem[];
  selectedIndex: number;
  onSelect:      (i: number) => void;
  onClose:       () => void;
}

interface Props {
  bus:     EventBus;
  world:   WorldState;
  onClose: () => void;
}

export function BagOverlay({ bus, world, onClose }: Props) {
  const [selected, setSelected] = useState(0);
  const [items, setItems] = useState<OwnedItem[]>(() => ownedItems(world));

  // Live refresh: a give_item firing while the bag is open updates the rows.
  useEffect(() => {
    return bus.on("state:changed", () => setItems(ownedItems(world)));
  }, [bus, world]);

  // Re-subscribed whenever `selected`/`items` change so closures never go stale
  // (the PauseMenu idiom).
  useEffect(() => {
    const unsubs = [
      bus.on("menu:nav", ({ dir }) =>
        setSelected(s => (items.length ? (s + dir + items.length) % items.length : 0))),
      bus.on("action:confirm", onClose),   // view-only v1: confirm just closes
    ];
    return () => unsubs.forEach(u => u());
  }, [bus, onClose, items.length]);

  const styleId = world.world?.playerSettings?.bagStyle ?? "list";
  const Style = BAG_STYLES[styleId] ?? BagListStyle;

  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute", inset: 0, zIndex: 110,
        background: "rgba(5,8,14,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <Style
        items={items}
        selectedIndex={Math.min(selected, Math.max(0, items.length - 1))}
        onSelect={setSelected}
        onClose={onClose}
      />
    </div>
  );
}

// ─── Style: list (v1 default) ─────────────────────────────────────────────────

function BagListStyle({ items, selectedIndex, onSelect }: BagStyleProps) {
  const sel = items[selectedIndex];
  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        background: "rgba(10,14,22,0.95)", border: "1px solid rgba(100,160,255,0.3)",
        borderRadius: 8, padding: "20px 28px", minWidth: 300, maxWidth: 420,
        maxHeight: "70vh", display: "flex", flexDirection: "column", gap: 8,
      }}
    >
      <div style={{
        color: "#c8d8ff", fontSize: 14, fontFamily: "monospace",
        letterSpacing: 2, textAlign: "center", marginBottom: 4,
      }}>
        INVENTORY
      </div>
      <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {items.length === 0 && (
          <div style={{ color: "#606070", fontSize: 12, textAlign: "center", padding: "12px 0" }}>
            Nothing yet.
          </div>
        )}
        {items.map((it, i) => {
          const active = i === selectedIndex;
          return (
            <div
              key={it.id}
              onMouseEnter={() => onSelect(i)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "6px 10px", borderRadius: 6,
                background: active ? "rgba(80,140,255,0.18)" : "transparent",
                border: `1px solid ${active ? "rgba(80,140,255,0.5)" : "transparent"}`,
              }}
            >
              {it.def?.icon ? (
                <img src={it.def.icon} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 28, height: 28, borderRadius: 4, flexShrink: 0, background: "rgba(255,255,255,0.08)" }} />
              )}
              <span style={{
                flex: 1, fontSize: 13,
                color: it.def ? (active ? "#fff" : "#b0b8c8") : "#606070",
                fontStyle: it.def ? "normal" : "italic",   // unregistered id fallback
              }}>
                {it.def?.label ?? it.id}
              </span>
              <span style={{ color: "#80aaff", fontSize: 12, fontFamily: "monospace", flexShrink: 0 }}>
                ×{it.count}
              </span>
            </div>
          );
        })}
      </div>
      {sel?.def?.description && (
        <div style={{
          color: "#8890a0", fontSize: 11, lineHeight: 1.5,
          borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 8,
        }}>
          {sel.def.description}
        </div>
      )}
    </div>
  );
}

const BAG_STYLES: Record<string, ComponentType<BagStyleProps>> = {
  list: BagListStyle,
};
