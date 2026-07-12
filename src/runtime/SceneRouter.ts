import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { ZoneManager } from "@/world/ZoneManager";
import type { PreviewController } from "@/preview/PreviewController";
import type { ScriptEngine } from "@/scripting/ScriptEngine";
import type { SceneFile, WorldConfig } from "@/types";
import { gameState, DEFAULT_STATE_SCHEMA } from "@/scripting/GameState";
import { migrateWallNodes, migrateUVs, migrateDialogues, pruneOrphanNodes, migrateWorldLighting } from "@/world/WorldLoader";
import type { LoadedManifest } from "./manifest";

export interface SceneRouterDeps {
  bus:          EventBus;
  world:        WorldState;
  zones:        ZoneManager;
  preview:      PreviewController;
  scriptEngine: ScriptEngine;
  manifest:     LoadedManifest;
  /** Shell callbacks — keep the router UI-agnostic. */
  onLoading?: () => void;
  onPlaying?: () => void;
  onError?:   (message: string) => void;
}

/**
 * File-level scene routing — one level above the in-scene zone-transition
 * system. `go()` tears the current world down completely (scripts, character,
 * zones + colliders), fetches the target SceneFile, and boots game mode in it.
 * `gameState` deliberately survives: configureSchema() only seeds missing
 * keys, so values written in scene A persist into scene B.
 */
export class SceneRouter {
  private _currentSceneId: string | null = null;
  private _transitioning = false;
  private _offLoadRequest: (() => void) | null = null;

  constructor(private readonly deps: SceneRouterDeps) {
    // load_scene script action → route. Unknown ids are non-fatal: log and
    // stay in the current scene (go() throws before any teardown).
    this._offLoadRequest = deps.bus.on("scene:load-request", ({ sceneId }) => {
      void this.go(sceneId);
    });
  }

  get currentSceneId(): string | null { return this._currentSceneId; }
  /** True while go() is mid-teardown/build — preview:stop during a transition
   *  must not bounce the shell back to the menu. */
  get transitioning(): boolean { return this._transitioning; }

  async go(
    sceneId: string,
    opts?: {
      newGame?: boolean;
      resume?: boolean;
      /** Continue-from-save: one-shots + pose from the runtime save blob
       *  (state is restored by the caller before go(), values survive). */
      restore?: { firedOneShots: string[]; pose?: { x: number; y: number; z: number; facing: number } };
    },
  ): Promise<void> {
    // A portal volume can fire load_scene twice before teardown starts.
    if (this._transitioning) return;
    const { bus, world, zones, preview, scriptEngine, manifest } = this.deps;

    // Resolve BEFORE any teardown: an unknown scene id (authored free-text in
    // the editor) is non-fatal — log it and stay in the current scene.
    let targetUrl: URL;
    try {
      targetUrl = manifest.sceneUrl(sceneId);
    } catch (err) {
      console.error(`SceneRouter: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    this._transitioning = true;
    try {
      this.deps.onLoading?.();
      if (preview.isActive) {
        bus.emit("overlay:fade-in", { color: "#000000", duration: 0.3 });
      }

      // Capture fired one-shots BEFORE deactivate/activate (activate clears
      // the set) so cross-scene one-shots don't re-fire on revisit.
      const fired = scriptEngine.getFiredOneShots();
      scriptEngine.deactivate();
      scriptEngine.clearIndex();

      // Remove the character (body + collider + camera) before zone teardown.
      preview.exit();

      // Unload every loaded zone: meshes, Rapier colliders (incl. shape
      // hulls/trimeshes), door/volume sensors, decal maps. unloadZone no-ops
      // for zones that were never loaded.
      for (const id of [...world.zones.keys()]) zones.unloadZone(id);

      const res = await fetch(targetUrl.href);
      if (!res.ok) throw new Error(`Scene "${sceneId}" fetch failed: HTTP ${res.status}`);
      const file = await res.json() as SceneFile;

      // Same migration pipeline the editor runs on load.
      migrateWallNodes(file.zones);
      migrateUVs(file);
      migrateDialogues(file);
      migrateWorldLighting(file);
      for (const zone of file.zones) pruneOrphanNodes(zone);

      world.loadFromJSON(file); // sets activeZoneId = zones[0]
      // Shared game config (manifest-linked game.json, Phase 33) — session-only
      // fields, merged under the scene's own registry/schema by the readers.
      world.gameItems       = this.deps.manifest.game?.items;
      world.gameStateSchema = this.deps.manifest.game?.stateSchema;
      if (!world.activeZoneId) throw new Error(`Scene "${sceneId}" has no zones`);
      await zones.loadZone(world.activeZoneId);

      // Re-index scripts from the freshly loaded world (mirrors App.tsx's
      // preview:start handler).
      const activeZone = world.zones.get(world.activeZoneId);
      scriptEngine.clearIndex();
      scriptEngine.loadWorld(world.world ?? {} as WorldConfig);
      if (activeZone) scriptEngine.loadZone(activeZone);

      // NO reset here — cross-scene persistence is the point. New keys from
      // this scene's schema seed their defaults; existing values survive.
      // Game-level schema defaults spread UNDER the scene's own (scene wins);
      // the classic DEFAULT only applies when neither exists.
      const gameSchema  = world.gameStateSchema;
      const sceneSchema = world.world?.stateSchema;
      gameState.configureSchema({
        ...(gameSchema ?? {}),
        ...(sceneSchema ?? (gameSchema ? {} : DEFAULT_STATE_SCHEMA)),
      });

      scriptEngine.activate();
      if (opts?.restore) scriptEngine.restoreFiredOneShots(opts.restore.firedOneShots);
      else if (!opts?.newGame) scriptEngine.restoreFiredOneShots(fired);

      this._currentSceneId = sceneId;
      preview.enter("game", { resume: opts?.resume });
      if (opts?.restore?.pose) {
        const p = opts.restore.pose;
        bus.emit("character:teleport", { position: { x: p.x, y: p.y, z: p.z }, facing: p.facing });
      }

      // First entry of a run only; scene→scene transitions don't re-fire it.
      if (opts?.newGame || opts?.resume) scriptEngine.onGameStart();
      // Fire on_level_load directly (with the zone id, matching the editor's
      // zone:enter → on_level_load path) — do NOT synthesize zone:enter,
      // which would also trip ZoneManager's zone-swap handler.
      scriptEngine.fire("on_level_load", world.activeZoneId);

      this.deps.onPlaying?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`SceneRouter: failed to load scene "${sceneId}":`, err);
      this.deps.onError?.(msg);
    } finally {
      this._transitioning = false;
    }
  }

  dispose(): void {
    this._offLoadRequest?.();
    this._offLoadRequest = null;
  }
}
