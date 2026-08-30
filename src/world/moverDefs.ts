import type { MoverDef } from "@/types";

/** Phase 67 — an entity's movers. `movers` is the authored list; the legacy
 *  single `mover` (Phase 31) is read forever but written never again (the
 *  editor migrates it to `movers` on first edit of the Motion section). */
export function entityMovers(e: { movers?: MoverDef[]; mover?: MoverDef }): MoverDef[] {
  return e.movers ?? (e.mover ? [e.mover] : []);
}

/** The enabled subset — what actually registers/animates. */
export function enabledMovers(e: { movers?: MoverDef[]; mover?: MoverDef }): MoverDef[] {
  return entityMovers(e).filter(m => m.enabled);
}

export function hasEnabledMover(e: { movers?: MoverDef[]; mover?: MoverDef }): boolean {
  return entityMovers(e).some(m => m.enabled);
}
