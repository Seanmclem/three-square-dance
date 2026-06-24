import { useEffect, useState } from "react";

export interface FadeRequest { color: string; duration: number }

export interface FadeOverlayProps {
  fade:       FadeRequest | null;
  onComplete: () => void;
}

/**
 * Renders the `fade_screen` script action's visual: a full-screen colored div
 * that animates from transparent to opaque over `duration` seconds. The
 * `overlay:fade-in` bus event already fires from ScriptEngine (Phase 10.5);
 * App subscribes and feeds the payload here (Phase 10.9).
 */
export function FadeOverlay({ fade, onComplete }: FadeOverlayProps) {
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    if (!fade) { setOpacity(0); return; }
    // Start transparent, then flip to opaque on the next frame so the CSS transition runs.
    setOpacity(0);
    const raf = requestAnimationFrame(() => setOpacity(1));
    const done = setTimeout(onComplete, fade.duration * 1000);
    return () => { cancelAnimationFrame(raf); clearTimeout(done); };
  }, [fade]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!fade) return null;

  return (
    <div
      style={{
        position: "absolute", inset: 0, zIndex: 200, pointerEvents: "none",
        background: fade.color, opacity,
        transition: `opacity ${fade.duration}s linear`,
      }}
    />
  );
}
