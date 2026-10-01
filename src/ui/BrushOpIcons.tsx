/**
 * Small line icons for the brush op buttons (v4.97.0): each button shows an icon AND a
 * word, so the op reads at a glance without relying on ─ / │ text glyphs. 16×16 grid,
 * 1.4 stroke, currentColor, so they follow the button's enabled/disabled color.
 */
export type BrushOpIconName =
  | "split-h" | "split-v" | "loop-h" | "loop-v" | "inset" | "extrude" | "recess" | "fold"
  | "split-edge" | "loop-cut-edge" | "select-loop" | "around-face" | "select-ring" | "face-loop-h" | "face-loop-v" | "round";

export function BrushOpIcon({ name, size = 14 }: { name: BrushOpIconName; size?: number }) {
  const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const box = <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" {...s} opacity="0.55" />;
  const body = (() => {
    switch (name) {
      case "split-h":  return <>{box}<line x1="2.5" y1="8" x2="13.5" y2="8" {...s} strokeWidth="2" /></>;
      case "split-v":  return <>{box}<line x1="8" y1="2.5" x2="8" y2="13.5" {...s} strokeWidth="2" /></>;
      case "loop-h":   return <><rect x="3.5" y="1.5" width="9" height="13" rx="1.5" {...s} opacity="0.55" /><ellipse cx="8" cy="8" rx="6.5" ry="2.2" {...s} strokeWidth="1.8" /></>;
      case "loop-v":   return <><rect x="1.5" y="3.5" width="13" height="9" rx="1.5" {...s} opacity="0.55" /><ellipse cx="8" cy="8" rx="2.2" ry="6.5" {...s} strokeWidth="1.8" /></>;
      case "inset":    return <>{box}<rect x="5.5" y="5.5" width="5" height="5" rx="0.5" {...s} strokeWidth="1.8" /></>;
      case "extrude":  return <><rect x="2.5" y="8.5" width="11" height="5" rx="1" {...s} opacity="0.55" /><path d="M8 8.5V2M5.5 4.5 8 2l2.5 2.5" {...s} strokeWidth="1.8" /></>;
      case "recess":   return <><path d="M2.5 5.5h3v5h5v-5h3v8h-11z" {...s} opacity="0.55" /><path d="M8 1.5v6M5.5 5 8 7.5 10.5 5" {...s} strokeWidth="1.8" /></>;
      case "fold":     return <>{box}<line x1="2.5" y1="13.5" x2="13.5" y2="2.5" {...s} strokeDasharray="1.8 1.8" opacity="0.55" /><line x1="2.5" y1="2.5" x2="13.5" y2="13.5" {...s} strokeWidth="1.8" strokeDasharray="2.4 1.6" /></>;
      case "split-edge":    return <><line x1="2" y1="8" x2="14" y2="8" {...s} opacity="0.55" /><circle cx="8" cy="8" r="2.4" fill="currentColor" /></>;
      case "loop-cut-edge": return <><line x1="8" y1="1.5" x2="8" y2="14.5" {...s} opacity="0.55" /><ellipse cx="8" cy="8" rx="6.5" ry="2.2" {...s} strokeWidth="1.8" /></>;
      case "select-loop":   return <><line x1="2" y1="8" x2="14" y2="8" {...s} strokeWidth="1.8" /><circle cx="2.5" cy="8" r="1.6" fill="currentColor" /><circle cx="8" cy="8" r="1.6" fill="currentColor" /><circle cx="13.5" cy="8" r="1.6" fill="currentColor" /></>;
      case "around-face":   return <><rect x="3" y="3" width="10" height="10" rx="0.5" {...s} strokeWidth="1.8" /><circle cx="3" cy="3" r="1.5" fill="currentColor" /><circle cx="13" cy="3" r="1.5" fill="currentColor" /><circle cx="3" cy="13" r="1.5" fill="currentColor" /><circle cx="13" cy="13" r="1.5" fill="currentColor" /></>;
      case "face-loop-h":   return <>{box}<rect x="2.5" y="6" width="11" height="4" fill="currentColor" opacity="0.85" /></>;
      case "face-loop-v":   return <>{box}<rect x="6" y="2.5" width="4" height="11" fill="currentColor" opacity="0.85" /></>;
      case "round":         return <><path d="M2.5 13.5V8a5.5 5.5 0 0 1 5.5-5.5h5.5" {...s} strokeWidth="1.8" /><path d="M2.5 13.5V2.5h11" {...s} opacity="0.4" strokeDasharray="1.6 1.6" /></>;
      case "select-ring":   return <><ellipse cx="8" cy="8" rx="6.5" ry="3" {...s} strokeWidth="1.6" /><circle cx="1.5" cy="8" r="1.5" fill="currentColor" /><circle cx="14.5" cy="8" r="1.5" fill="currentColor" /><circle cx="8" cy="11" r="1.5" fill="currentColor" /><circle cx="8" cy="5" r="1.5" fill="currentColor" /></>;
    }
  })();
  return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ flexShrink: 0 }}>{body}</svg>;
}
