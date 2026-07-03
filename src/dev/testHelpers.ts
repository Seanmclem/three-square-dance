import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { ScriptEngine } from "@/scripting/ScriptEngine";
import { GAMESAVE_KEY, type GameState } from "@/scripting/GameState";
import type { PreviewController } from "@/preview/PreviewController";
import type { LeftPanelId, ScriptAction, TriggerType, PlatformDef, WorldObject } from "@/types";

/**
 * DEV-only browser test harness. Installs `window.__test` with shortcuts for the
 * things that are awkward to drive through the canvas/UI from an automation tab:
 * firing scripts, entering preview, opening left panels, and spawning throwaway
 * entities. Mirrors the manual recipes in TESTING.md so a future session can drive
 * the app from `javascript_tool` instead of fragile pixel clicks.
 *
 * Not shipped in production — only called from App.tsx behind `import.meta.env.DEV`.
 */
export interface TestHelperDeps {
  bus:          EventBus;
  world:        WorldState;
  scriptEngine: ScriptEngine;
  preview:      PreviewController;
  gameState:    GameState;
}

export function installTestHelpers({ bus, world, scriptEngine, preview, gameState }: TestHelperDeps): void {
  const zoneId = () => world.activeZoneId ?? "demo";

  const api = {
    // ── Preview / scripting ──────────────────────────────────────────────────
    /** Enter preview (no spawn needed — falls back to a floor point). */
    enterPreview: () => preview.enter("preview"),
    /** Enter game mode (uses defaultSpawn) and fire on_game_start. */
    enterGame:    () => { preview.enter("game"); scriptEngine.onGameStart(); },
    exitPreview:  () => preview.exit(),
    /** Fire a trigger through the real index (e.g. fire("on_interact", objectId)). */
    fire:         (trigger: TriggerType, targetId: string | null = null) => scriptEngine.fire(trigger, targetId),
    /** Run one action through the full dispatch (incl. _resolveTargets) without preview. */
    runAction:    (action: ScriptAction) => (scriptEngine as unknown as { _dispatch(a: ScriptAction): void })._dispatch(action),

    // ── Gameplay state ─────────────────────────────────────────────────────────
    /** Direct access to the generic gameplay-state store. */
    gameState,
    /** Wipe the game save + reset runtime state + fired one-shots (New Game). */
    newGame: (): void => {
      localStorage.removeItem(GAMESAVE_KEY);
      gameState.reset();
      scriptEngine.restoreFiredOneShots([]);
    },

    // ── UI ───────────────────────────────────────────────────────────────────
    /** Open a left panel programmatically (reliable replacement for the z hotkey). */
    openPanel:    (panelId: LeftPanelId) => bus.emit("leftpanel:open", { panelId }),

    // ── Throwaway entities (ids are prefixed so cleanup() can find them) ───────
    spawnPlatform: ({ id = `test_plat_${Date.now()}`, x = 0, z = 0 } = {}): string => {
      const plat: PlatformDef = {
        id, label: id, position: { x, y: 0, z }, size: { width: 3, depth: 3 },
        thickness: 0.4, material: "concrete", hasRailing: false, railingHeight: 1,
      };
      world.addPlatform(zoneId(), plat);
      return id;
    },
    spawnObject: ({ id = `test_obj_${Date.now()}`, assetId = "nonexistent_model", x = 0, y = 0.5, z = -3, groupIds = [] as string[] } = {}): string => {
      const obj: WorldObject = {
        id, label: id, assetId, position: { x, y, z }, rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }, floor: 0, zoneId: zoneId(),
        properties: { interactable: false, npcSpawn: false, lootTableId: null, triggerEventId: null },
        groupIds,
      };
      world.addObject(zoneId(), obj);
      return id;
    },

    /** Remove every test_* entity and grp_* group across all zones; restores the demo. */
    cleanup: (): void => {
      for (const [zid, zone] of world.zones) {
        for (const o of [...zone.objects])   if (o.id.startsWith("test_")) world.removeObject(zid, o.id);
        for (const p of [...zone.platforms]) if (p.id.startsWith("test_")) world.removePlatform(zid, p.id);
      }
      for (const g of [...world.groups]) if (g.id.startsWith("grp_")) world.removeGroup(g.id);
    },
  };

  (window as unknown as { __test: typeof api }).__test = api;
}
