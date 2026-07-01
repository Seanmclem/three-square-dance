import { useEffect, useState } from "react";

/**
 * Tiny always-on perf readout (top-left of the canvas). Shows average FPS AND the
 * worst single-frame time (ms) in each 500ms window — the worst-frame is what catches
 * the brief hitches/jank that an averaged FPS masks (a couple of long frames barely
 * move the average). At 120Hz an ideal frame is ~8.3ms; a spike to 17ms+ is a dropped
 * frame you can feel. See TESTING.md §7.
 *
 * Runs its own rAF loop, `pointerEvents: none` so it never blocks the viewport.
 */
export function FpsCounter() {
  const [stats, setStats] = useState({ fps: 0, worstMs: 0 });

  useEffect(() => {
    let raf = 0, frames = 0, worst = 0;
    let windowStart = performance.now(), lastFrame = windowStart;
    const loop = () => {
      const now = performance.now();
      const dt = now - lastFrame;
      lastFrame = now;
      frames++;
      if (dt > worst) worst = dt;                 // longest frame this window
      if (now - windowStart >= 500) {
        setStats({ fps: Math.round((frames * 1000) / (now - windowStart)), worstMs: Math.round(worst) });
        frames = 0; worst = 0; windowStart = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const fpsColor  = stats.fps >= 55 ? "#5fd08a" : stats.fps >= 40 ? "#d8c25f" : "#e07a7a";
  // worst-frame: ≤12ms buttery, ≤24ms a missed vsync/two, above = a visible stutter
  const worstColor = stats.worstMs <= 12 ? "#5fd08a" : stats.worstMs <= 24 ? "#d8c25f" : "#e07a7a";
  return (
    <div style={{
      position: "absolute", top: 54, left: 64, zIndex: 40, pointerEvents: "none",
      fontSize: 10, fontFamily: "monospace", letterSpacing: 1,
      background: "rgba(10,14,22,0.55)", padding: "2px 6px", borderRadius: 4,
      display: "flex", gap: 8,
    }}>
      <span style={{ color: fpsColor }}>{stats.fps} FPS</span>
      <span style={{ color: worstColor }} title="worst single frame in the last 0.5s">{stats.worstMs}ms&#9662;</span>
    </div>
  );
}
