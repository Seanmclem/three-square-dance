import { useState } from "react";

interface HelpTooltipProps { text: string }

export function HelpTooltip({ text }: HelpTooltipProps) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          width: 16, height: 16, borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.15)",
          background: "none", color: "#505070",
          fontSize: 10, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 600, lineHeight: 1, flexShrink: 0,
        }}
        aria-label="Help"
      >?</button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 49 }}
          />
          <div style={{
            position: "absolute", bottom: "calc(100% + 6px)", left: "50%",
            transform: "translateX(-50%)",
            width: 220, padding: "8px 10px",
            background: "rgba(28,28,28,0.98)", border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: 4, fontSize: 11, lineHeight: 1.6,
            color: "#909090", zIndex: 50,
            boxShadow: "0 4px 12px rgba(0,0,0,.5)",
          }}>
            {text}
          </div>
        </>
      )}
    </div>
  );
}
