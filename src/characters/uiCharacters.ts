import type { CharacterDef, PlayerSettings } from "@/types";

/**
 * Phase 86: the game's characters for deep UI (player settings, the enemy AI screen),
 * set by the App whenever its list changes; read during render (the App re-renders the
 * panels when it does).
 */
let current: CharacterDef[] = [];
export function setUiCharacters(list: CharacterDef[]): void { current = list; }
export function uiCharacters(): CharacterDef[] { return current; }

/** Actions the App provides to those panels (null outside a project's App). */
let actions: { fromSettings: (settings: PlayerSettings) => string | null } | null = null;
export function setUiCharacterActions(a: typeof actions): void { actions = a; }
export function uiCharacterActions(): typeof actions { return actions; }

/** Moves a use plays by itself that the character has no clip for. */
export function missingMoves(c: CharacterDef, moves: readonly string[]): string[] {
  return moves.filter(m => !c.moves[m]?.clip);
}

/** The moves the engine plays by itself for the player / an enemy (Phase 86 §3). */
export const PLAYER_MOVES = ["idle", "walk", "jump", "jump_idle", "jump_land", "climb"] as const;
export const ENEMY_MOVES  = ["idle", "walk", "attack"] as const;
export const moveLabel = (m: string) => ({ jump: "jump (takeoff)", jump_idle: "in air", jump_land: "land", fall: "fall (no jump)" } as Record<string, string>)[m] ?? m;
