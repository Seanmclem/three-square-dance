import type { WorldState } from "@/world/WorldState";
import { gameState } from "./GameState";
import { INV_PREFIX } from "./inventory";

/**
 * Per-entity state (Phase 60) — the facade convention, spelled out in ONE place.
 *
 * Entity-local values live in the single global GameState store under
 * namespaced keys: `__ent.<entityId>.<key>`. Entity item counters nest the
 * inventory convention inside that: `__ent.<entityId>.inv.<itemId>`. The `__`
 * prefix keeps them out of the STATE tab's live list and out of the player's
 * bag (which scans the bare `inv.` prefix) — and because they are ordinary
 * keys, saves/Continue, New-Game reset, schema clamping, and `state:changed`
 * reactivity all apply unchanged.
 *
 * INVARIANT: no UI ever displays a raw namespaced key — authors see the entity
 * plus its bare key name; the prefixing happens at index/dispatch time only.
 *
 * Despawn persistence rides the same facade: `__despawned.<entityId>` booleans
 * written by spawn_object/despawn_object and applied at zone load
 * (state-wins-when-present over the authored `startHidden`).
 */

export const ENT_PREFIX     = "__ent.";
export const DESPAWN_PREFIX = "__despawned.";

export const entKey       = (entityId: string, key: string): string => `${ENT_PREFIX}${entityId}.${key}`;
export const entInvKey    = (entityId: string, itemId: string): string => entKey(entityId, `${INV_PREFIX}${itemId}`);
export const despawnedKey = (entityId: string): string => `${DESPAWN_PREFIX}${entityId}`;

/**
 * Register every entity's authored state schema (namespaced) with GameState.
 * Call right AFTER gameState.configureSchema(...) — that call clears the whole
 * schema map on every play start / scene entry, so entity schemas must be
 * re-applied each time. register() seeds defaults for missing keys only, so
 * Continue keeps saved values while New Game (reset) re-seeds everything.
 */
export function registerEntityStateSchemas(world: WorldState): void {
  for (const zone of world.zones.values()) {
    const lists: { id: string; stateSchema?: Record<string, import("@/types").StateSchema> }[][] =
      [zone.objects, zone.triggerVolumes ?? []];
    for (const arr of lists)
      for (const e of arr)
        for (const [key, schema] of Object.entries(e.stateSchema ?? {}))
          gameState.register(entKey(e.id, key), schema);
  }
}
