import type { WorldState } from "@/world/WorldState";
import type { ItemDef } from "@/types";
import { gameState } from "./GameState";

/**
 * Items are an identity layer over gameState (Phase 32): the count for item
 * `<id>` lives at key `inv.<id>`. These helpers are the single place that
 * convention is spelled out.
 */
export const INV_PREFIX = "inv.";

export const invKey = (itemId: string): string => `${INV_PREFIX}${itemId}`;

export interface OwnedItem {
  id:    string;          // item id (registry id, or raw key suffix if unregistered)
  def:   ItemDef | null;  // null = not in the registry (deleted / hand-typed id)
  count: number;
}

/**
 * Merge the game-level registry (game.json) under the scene's own — scene wins
 * on a duplicate id (replaces in place, keeping game order); scene-only items
 * are appended (Phase 33).
 */
export function mergeItemDefs(game: ItemDef[] | undefined, scene: ItemDef[] | undefined): ItemDef[] {
  if (!game?.length)  return scene ?? [];
  if (!scene?.length) return game;
  const out = game.map(g => scene.find(s => s.id === g.id) ?? g);
  for (const s of scene) if (!game.some(g => g.id === s.id)) out.push(s);
  return out;
}

/** The effective item registry: game-level (project/manifest) + scene-level. */
export function itemRegistry(world: WorldState): ItemDef[] {
  return mergeItemDefs(world.gameItems, world.world?.items);
}

/**
 * Seed starting inventory from the registry's `startCount` fields. Call ONLY
 * right after a New Game reset (values are wiped there, so a plain set is
 * correct; never call on scene transitions — that would re-grant items).
 */
export function seedStartingInventory(world: WorldState): void {
  for (const item of itemRegistry(world)) {
    if (!item.startCount || item.startCount <= 0) continue;
    gameState.set(invKey(item.id), Math.min(item.startCount, item.stackSize ?? Infinity));
  }
}

/**
 * Everything the player currently holds (count > 0), joined against the
 * world's item registry. Pure read — the bag UI's only data source.
 */
export function ownedItems(world: WorldState): OwnedItem[] {
  const registry = itemRegistry(world);
  const out: OwnedItem[] = [];
  for (const [key, value] of Object.entries(gameState.snapshot())) {
    if (!key.startsWith(INV_PREFIX)) continue;
    const count = Number(value ?? 0);
    if (!(count > 0)) continue;
    const id = key.slice(INV_PREFIX.length);
    out.push({ id, def: registry.find(i => i.id === id) ?? null, count });
  }
  // Registry order first (authored order), unregistered stragglers last.
  out.sort((a, b) => {
    const ai = a.def ? registry.indexOf(a.def) : Infinity;
    const bi = b.def ? registry.indexOf(b.def) : Infinity;
    return ai - bi || a.id.localeCompare(b.id);
  });
  return out;
}
