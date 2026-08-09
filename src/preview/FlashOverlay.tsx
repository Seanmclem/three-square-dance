import { useEffect, useState } from "react";

export interface FlashRequest { color: string; duration: number; peak: number }

export interface FlashOverlayProps {
  flash:      FlashRequest | null;
  onComplete: () => void;
}

/**
 * Damage flash: a full-screen tint that rises to `peak` opacity and releases itself.
 *
 * Deliberately separate from FadeOverlay rather than a mode on it. FadeOverlay is
 * driven by `overlay:fade-in`, which InputManager and ControlSchemeManager both treat
 * as "suppress player input" (it exists for respawns and scene transitions, where the
 * screen must HOLD opaque while the world changes underneath). A damage flash must
 * never take the controls away mid-fight, and must never reach full opacity.
 *
 * Back-to-back hits re-arm correctly without any extra nonce: each emit carries a fresh
 * payload object, so the `[flash]` dep differs by identity even when the values match.
 */
export function FlashOverlay({ flash, onComplete }: FlashOverlayProps) {
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    if (!flash) { setOpacity(0); return; }
    // Snap to peak, then let the transition carry it back down.
    setOpacity(flash.peak);
    const raf = requestAnimationFrame(() => setOpacity(0));
    const done = setTimeout(onComplete, flash.duration * 1000);
    return () => { cancelAnimationFrame(raf); clearTimeout(done); };
  }, [flash]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!flash) return null;

  return (
    <div
      style={{
        position: "absolute", inset: 0, zIndex: 199, pointerEvents: "none",
        // Vignette rather than a flat wash — the edges read as damage without
        // washing out what the player is looking at.
        background: `radial-gradient(ellipse at center, transparent 35%, ${flash.color} 100%)`,
        opacity,
        transition: `opacity ${flash.duration}s ease-out`,
      }}
    />
  );
}
