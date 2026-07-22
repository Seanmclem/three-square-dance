import type { GameConfig, PrefabDef } from "@/types";

// Prefab library persistence (Phase 44). The library's home is the project's
// game.json (GameConfig.prefabs — the items/stateSchema precedent). With no
// project open, prefabs live under this localStorage key and are promoted into
// game.json (union by id, game.json wins) the next time a project is opened.
const SESSION_KEY = "worldeditor_prefabs";

export function loadSessionPrefabs(): PrefabDef[] {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as PrefabDef[]) : [];
  } catch {
    return [];
  }
}

export function saveSessionPrefabs(prefabs: PrefabDef[]): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(prefabs));
  } catch { /* quota/private-mode — session library just won't persist */ }
}

/** Merge session prefabs into an opened project's game config (game.json wins on
 *  id conflict) and clear the session store. Returns true when game changed. */
export function promoteSessionPrefabs(game: GameConfig): boolean {
  const session = loadSessionPrefabs();
  if (session.length === 0) return false;
  const existing = new Set((game.prefabs ?? []).map(p => p.id));
  const added = session.filter(p => !existing.has(p.id));
  localStorage.removeItem(SESSION_KEY);
  if (added.length === 0) return false;
  game.prefabs = [...(game.prefabs ?? []), ...added];
  console.info(`[prefabs] promoted ${added.length} session prefab(s) into the project's game.json`);
  return true;
}
