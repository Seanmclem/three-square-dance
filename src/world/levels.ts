import type { ZoneDef } from "@/types";

/** A level's height: its floor slab, else its walls, else 3 m per level. */
export function levelElevation(zone: ZoneDef | null | undefined, level: number): number {
  return zone?.floors.find(f => f.level === level)?.elevation
    ?? zone?.walls.find(w => w.floor === level)?.elevation
    ?? level * 3;
}

/** The highest level whose height is at or below `y` (5 cm slack, so a landing
 *  or tread sitting on a level's height counts as that level). */
export function levelAtHeight(zone: ZoneDef | null | undefined, y: number): number {
  const top = y + 0.05;
  const levels = new Set<number>([0, Math.max(0, Math.floor(top / 3))]);   // real levels below G come from the zone
  for (const f of zone?.floors ?? []) levels.add(f.level);
  for (const w of zone?.walls ?? []) levels.add(w.floor);
  let best = 0, bestElev = -Infinity;
  for (const l of levels) {
    const e = levelElevation(zone, l);
    if (e <= top && e > bestElev) { best = l; bestElev = e; }
  }
  return best;
}
