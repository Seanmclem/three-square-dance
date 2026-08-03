import { useEffect, useRef, useState } from "react";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { UiAnchor, UiElementDef, UiMenuElement } from "@/types";
import { gameState } from "@/scripting/GameState";
import { uiKey, uiRegistry } from "@/scripting/uiElements";
import { checkScriptConditions } from "@/scripting/ScriptEngine";
import { assetManager } from "@/core/AssetManager";

/**
 * Custom game GUI overlay (Phase 49) — renders the author-defined UI element
 * registry (uiRegistry: game.json + scene defs). Mounted in both shells while
 * playing. Everything derives from gameState:
 *  - visibility: `__ui.<id>` (set by show_ui/hide_ui; startVisible as default),
 *  - bar/counter values: the element's stateKey,
 * so one `state:changed` subscription keeps the whole overlay live, and shown
 * elements survive scene transitions / saves without extra wiring.
 *
 * Menus reuse the dialogue interaction grammar: ControlSchemeManager routes
 * confirm/menuNav to the bus while `ui:menu-shown` is up; the pick is dispatched
 * by ScriptEngine (`ui:menu-pick`). One menu is navigable at a time (the first
 * visible one); dialogue takes precedence when both are open.
 */

interface Props {
  bus:   EventBus;
  world: WorldState;
}

const ANCHOR_STYLE = (anchor: UiAnchor, ox: number, oy: number): React.CSSProperties => {
  const s: React.CSSProperties = { position: "absolute" };
  if (anchor.startsWith("top")) s.top = oy; else s.bottom = oy;
  if (anchor.endsWith("left"))       s.left = ox;
  else if (anchor.endsWith("right")) s.right = ox;
  else { s.left = "50%"; s.transform = "translateX(-50%)"; }
  return s;
};

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0)) || 0;

// Optional contrast pill behind an element (UiElementBase.backdrop) — same
// translucent dark-grey treatment as the bar track, for bright skies.
const BACKDROP: React.CSSProperties = {
  background: "rgba(30,34,44,0.4)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 6, padding: "4px 10px",
};

export function GameGuiOverlay({ bus, world }: Props) {
  // One rev bump per gameState change re-renders the whole overlay (a handful
  // of DOM nodes — no per-element subscriptions needed).
  const [, setRev] = useState(0);
  useEffect(() => bus.on("state:changed", () => setRev(r => r + 1)), [bus]);

  // Dialogue precedence: while a dialogue is open, confirm/menuNav belong to it.
  const dialogueOpenRef = useRef(false);
  useEffect(() => {
    const unsubs = [
      bus.on("dialogue:show",   () => { dialogueOpenRef.current = true; }),
      bus.on("dialogue:closed", () => { dialogueOpenRef.current = false; }),
    ];
    return () => unsubs.forEach(u => u());
  }, [bus]);

  const elements = uiRegistry(world);
  const isVisible = (el: UiElementDef): boolean => {
    const v = gameState.get(uiKey(el.id));
    return v === undefined ? !!el.startVisible : !!v;
  };
  const visible = elements.filter(isVisible);

  // The first visible menu owns navigation (v1: one navigable menu at a time).
  const activeMenu = visible.find((el): el is UiMenuElement => el.kind === "menu") ?? null;
  // Re-filtered every render — the state:changed rev bump keeps conditions live.
  const menuOptions = activeMenu ? activeMenu.options.filter(o => checkScriptConditions(o.conditions ?? [])) : [];
  const [selIndex, setSelIndex] = useState(0);

  // Announce menu open/close so ControlSchemeManager enters/leaves menu mode.
  const prevMenuId = useRef<string | null>(null);
  useEffect(() => {
    const id = activeMenu?.id ?? null;
    const prev = prevMenuId.current;
    if (id === prev) return;
    if (prev) bus.emit("ui:menu-closed", { elementId: prev });
    if (id)   { bus.emit("ui:menu-shown", { elementId: id }); setSelIndex(0); }
    prevMenuId.current = id;
  }, [activeMenu?.id, bus]);
  // If the overlay unmounts with a menu up (preview exit), release menu mode.
  useEffect(() => () => {
    if (prevMenuId.current) bus.emit("ui:menu-closed", { elementId: prevMenuId.current });
  }, [bus]);

  // Confirm picks, menu:nav moves the highlight — only while a menu is up and
  // no dialogue is open (re-subscribed each render; closures stay fresh).
  useEffect(() => {
    if (!activeMenu) return;
    const pick = (index: number) => {
      const opt = menuOptions[index];
      if (opt) bus.emit("ui:menu-pick", { elementId: activeMenu.id, optionId: opt.id });
    };
    const offConfirm = bus.on("action:confirm", () => {
      if (!dialogueOpenRef.current) pick(selIndex);
    });
    const offNav = bus.on("menu:nav", ({ dir }) => {
      if (dialogueOpenRef.current || !menuOptions.length) return;
      setSelIndex(s => (s + dir + menuOptions.length) % menuOptions.length);
    });
    return () => { offConfirm(); offNav(); };
  });

  if (!visible.length) return null;

  const graphicSrc = (graphicId?: string): string | null => {
    const def = graphicId ? assetManager.getGraphicDef(graphicId) : undefined;
    return def ? assetManager.resolveUrl(def.path) : null;
  };

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 90, pointerEvents: "none", fontFamily: "monospace" }}>
      {visible.map(el => {
        const style = ANCHOR_STYLE(el.anchor, el.offsetX ?? 16, el.offsetY ?? 16);
        switch (el.kind) {
          case "bar": {
            const max = el.max ?? 100;
            const frac = Math.min(1, Math.max(0, num(gameState.get(el.stateKey)) / (max || 1)));
            const src = graphicSrc(el.graphicId);
            return (
              <div key={el.id} style={{ ...style, display: "flex", alignItems: "center", gap: 6, ...(el.backdrop ? BACKDROP : {}) }}>
                {src && <img src={src} alt="" style={{ width: 22, height: 22, objectFit: "contain" }} />}
                <div style={{
                  width: el.width ?? 160, height: el.height ?? 14,
                  background: "rgba(10,10,20,0.55)", border: "1px solid rgba(255,255,255,0.25)",
                  borderRadius: 4, overflow: "hidden",
                }}>
                  <div data-ui-fill={el.id} style={{
                    width: `${frac * 100}%`, height: "100%",
                    background: el.color ?? "#e05555", transition: "width 0.15s",
                  }} />
                </div>
              </div>
            );
          }
          case "counter": {
            const src = graphicSrc(el.graphicId);
            const size = el.size ?? 24;
            return (
              <div key={el.id} style={{ ...style, display: "flex", alignItems: "center", gap: 6,
                color: "#dde3f0", fontSize: Math.max(12, size * 0.6),
                textShadow: "0 1px 3px rgba(0,0,0,0.8)", ...(el.backdrop ? BACKDROP : {}) }}>
                {src && <img src={src} alt="" style={{ width: size, height: size, objectFit: "contain" }} />}
                <span data-ui-count={el.id}>{el.prefix ?? "×"}{num(gameState.get(el.stateKey))}</span>
              </div>
            );
          }
          case "label":
            return (
              <div key={el.id} style={{ ...style, color: el.color ?? "#dde3f0",
                fontSize: el.fontSize ?? 13, textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                whiteSpace: "pre-wrap", maxWidth: 360, ...(el.backdrop ? BACKDROP : {}) }}>
                {el.text}
              </div>
            );
          case "image": {
            const def = assetManager.getGraphicDef(el.graphicId);
            const src = graphicSrc(el.graphicId);
            if (!src) return null;
            const imgStyle: React.CSSProperties = {
              width: el.width ?? Math.min(def?.width ?? 64, 256),
              height: el.height ?? "auto",
              opacity: el.opacity ?? 1,
            };
            return el.backdrop
              ? (
                <div key={el.id} style={{ ...style, ...BACKDROP, padding: 4 }}>
                  <img src={src} alt="" style={{ ...imgStyle, display: "block" }} />
                </div>
              )
              : <img key={el.id} src={src} alt="" style={{ ...style, ...imgStyle }} />;
          }
          case "menu": {
            const isActive = activeMenu?.id === el.id;
            const opts = isActive ? menuOptions : el.options.filter(o => checkScriptConditions(o.conditions ?? []));
            return (
              <div key={el.id} style={{ ...style, pointerEvents: "auto", minWidth: 220, maxWidth: 360,
                background: "rgba(10,10,20,0.92)", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.45)", padding: "14px 18px 16px" }}>
                {el.title && (
                  <div style={{ color: "#80aaff", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                    {el.title}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {opts.length === 0 && (
                    <div style={{ color: "#5a6474", fontSize: 12 }}>Nothing available.</div>
                  )}
                  {opts.map((opt, i) => {
                    const active = isActive && i === selIndex;
                    return (
                      <div
                        key={opt.id}
                        onClick={e => {
                          e.stopPropagation();
                          if (!dialogueOpenRef.current) bus.emit("ui:menu-pick", { elementId: el.id, optionId: opt.id });
                        }}
                        onMouseEnter={() => { if (isActive) setSelIndex(i); }}
                        style={{
                          padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13,
                          color: active ? "#fff" : "#9ab",
                          background: active ? "rgba(128,170,255,0.18)" : "transparent",
                          border: `1px solid ${active ? "rgba(128,170,255,0.5)" : "transparent"}`,
                        }}
                      >
                        {active ? "▸ " : "  "}{opt.text || "…"}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }
        }
      })}
    </div>
  );
}
