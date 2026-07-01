import { useEffect, useState } from "react";

/**
 * Tiny always-on FPS readout (top-left of the canvas). A cheap sanity gauge so
 * per-frame regressions are caught early — see TESTING.md §7. Green ≥55, amber
 * ≥40, red below. Runs its own rAF loop; `pointerEvents: none` so it never
 * blocks the viewport.
 */
export function FpsCounter() {
  const [fps, setFps] = useState(0);

  useEffect(() => {
    let raf = 0, frames = 0, last = performance.now();
    const loop = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const color = fps >= 55 ? "#5fd08a" : fps >= 40 ? "#d8c25f" : "#e07a7a";
  return (
    <div style={{
      position: "absolute", top: 54, left: 64, zIndex: 40, pointerEvents: "none",
      color, fontSize: 10, fontFamily: "monospace", letterSpacing: 1,
      background: "rgba(10,14,22,0.55)", padding: "2px 6px", borderRadius: 4,
    }}>
      {fps} FPS
    </div>
  );
}
