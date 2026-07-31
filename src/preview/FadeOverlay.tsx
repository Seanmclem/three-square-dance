import { useEffect, useState } from "react";

export interface FadeRequest { color: string; duration: number; direction: "in" | "out" }

export interface FadeOverlayProps {
  fade:       FadeRequest | null;
  onComplete: () => void;
}

/**
 * Renders the fade actions' visual: a full-screen colored div.
 * direction "in": animate transparent → opaque, then HOLD (stays mounted until
 * an explicit fade-out request replaces it — respawn/scene transitions rely on
 * the screen staying covered while the world changes underneath).
 * direction "out": animate current opacity → transparent over `duration`
 * (0 = today's hard cut), then onComplete() so the shell clears the state.
 */
export function FadeOverlay({ fade, onComplete }: FadeOverlayProps) {
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    if (!fade) { setOpacity(0); return; }
    if (fade.direction === "in") {
      // Start transparent, then flip to opaque on the next frame so the CSS transition runs.
      setOpacity(0);
      const raf = requestAnimationFrame(() => setOpacity(1));
      return () => cancelAnimationFrame(raf);
    }
    // "out": we may be mounting fresh (opacity state 0 but visually the "in"
    // overlay was opaque) — force opaque first, then release next frame.
    setOpacity(1);
    const raf = requestAnimationFrame(() => setOpacity(0));
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
