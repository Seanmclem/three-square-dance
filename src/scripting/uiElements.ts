import type { WorldState } from "@/world/WorldState";
import type { UiElementDef } from "@/types";

/**
 * Custom GUI elements are a registry over gameState (Phase 49, the items
 * pattern): element visibility lives at key `__ui.<id>` — set by show_ui /
 * hide_ui — so it survives scene transitions, persists into the runtime save,
 * and resets on New Game. The `__` prefix hides it from the STATE tab.
 */
export const UI_PREFIX = "__ui.";

export const uiKey = (elementId: string): string => `${UI_PREFIX}${elementId}`;

/**
 * Merge the game-level registry (game.json) under the scene's own — scene wins
 * on a duplicate id (replaces in place, keeping game order); scene-only
 * elements are appended (mergeItemDefs semantics).
 */
export function mergeUiElementDefs(game: UiElementDef[] | undefined, scene: UiElementDef[] | undefined): UiElementDef[] {
  if (!game?.length)  return scene ?? [];
  if (!scene?.length) return game;
  const out = game.map(g => scene.find(s => s.id === g.id) ?? g);
  for (const s of scene) if (!game.some(g => g.id === s.id)) out.push(s);
  return out;
}

/** The effective GUI registry: game-level (project/manifest) + scene-level. */
export function uiRegistry(world: WorldState): UiElementDef[] {
  return mergeUiElementDefs(world.gameUiElements, world.world?.uiElements);
}
