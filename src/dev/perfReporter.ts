/**
 * Frame-timing telemetry for the desktop shell. The CEF window isn't
 * reachable by any automation tooling (TESTING.md §0), so the page reports
 * its own render cadence: every 5 s it POSTs {avgFps, worstMs, …} to the
 * shell, which appends to <stateDir>/perf-report.jsonl. Reading that file is
 * how shell-window performance problems get debugged.
 */
export function startPerfReporter(intervalMs = 5000): void {
  let frames = 0;
  let worst = 0;
  let last = performance.now();
  let windowStart = last;

  const tick = (now: number) => {
    const dt = now - last;
    last = now;
    if (dt < 1000) {   // ignore tab-hidden gaps
      frames++;
      if (dt > worst) worst = dt;
    }
    if (now - windowStart >= intervalMs) {
      const seconds = (now - windowStart) / 1000;
      // deno-lint-ignore no-explicit-any
      const info = (window as any).__renderer?.info?.render;
      const payload = {
        ts: new Date().toISOString(),
        page: location.pathname,
        size: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
        visible: !document.hidden,
        avgFps: Math.round(frames / seconds),
        worstMs: Math.round(worst * 10) / 10,
        draws: info?.calls ?? null,
        tris: info?.triangles ?? null,
      };
      void fetch("/perf-report", { method: "POST", body: JSON.stringify(payload) }).catch(() => { /* shell gone */ });
      frames = 0;
      worst = 0;
      windowStart = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
