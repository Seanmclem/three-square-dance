/**
 * Phase 62 — transform-ownership watchdog (dev-only).
 *
 * Every system that writes an entity mesh/body transform reports
 * (entityId, writerName) as it writes. Two DIFFERENT writers hitting the
 * same entity within one frame means two systems both think they own that
 * transform — the exact seam behind the floating-crab bug (MoverSystem and
 * EnemyAI co-driving obj_e043c8bb). That now costs one console.warn on the
 * first frame it happens instead of a week of live-trap debugging.
 *
 * Armed only when the dev globals install (vite dev / dev shell); packaged
 * builds pay a single boolean check per report. Frame boundary = microtask:
 * the whole update pipeline (movers → AI → physics → bus handlers) runs
 * synchronously in one task, so a queueMicrotask flush after the first
 * report of a frame clears the slate before the next frame — and it works
 * identically under TESTING.md's manual deterministic stepping.
 */

let armed = false;
const frameWriters = new Map<string, Set<string>>();
const warned = new Set<string>();   // "entityId|writerA+writerB"
let flushQueued = false;

export function armTransformWatchdog(): void {
  armed = true;
}

export function reportTransformWrite(entityId: string, writer: string): void {
  if (!armed) return;
  let writers = frameWriters.get(entityId);
  if (!writers) { writers = new Set(); frameWriters.set(entityId, writers); }
  if (!writers.has(writer)) {
    for (const other of writers) {
      const key = `${entityId}|${[other, writer].sort().join("+")}`;
      if (!warned.has(key)) {
        warned.add(key);
        console.warn(
          `[transformWatchdog] "${entityId}" transform written by both ${other} and ${writer} ` +
          `in the same frame — two systems think they own this entity's pose`);
      }
    }
    writers.add(writer);
  }
  if (!flushQueued) {
    flushQueued = true;
    queueMicrotask(() => { flushQueued = false; frameWriters.clear(); });
  }
}
