import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type {
  ZoneDef, WorldConfig, ScriptDef, ScriptAction, ScriptCondition,
  TriggerType, Vec3, CompareOp, DialogueTreeDef,
} from "@/types";
import { gameState } from "./GameState";
import { DialogueRunner } from "./DialogueRunner";
import { invKey, itemRegistry } from "./inventory";

function isVec3(v: unknown): v is Vec3 {
  return !!v && typeof v === "object"
    && typeof (v as Vec3).x === "number"
    && typeof (v as Vec3).y === "number"
    && typeof (v as Vec3).z === "number";
}

function compareNum(a: number, op: CompareOp, b: number): boolean {
  switch (op) {
    case ">=": return a >= b;
    case "<=": return a <= b;
    case ">":  return a >  b;
    case "<":  return a <  b;
    case "==": return a === b;
    case "!=": return a !== b;
  }
}

export class ScriptEngine {
  private _active       = false;
  // index: `${triggerType}:${targetId}` → scripts[]
  private _index        = new Map<string, ScriptDef[]>();
  private _firedOneShots = new Set<string>();
  private _timers: ReturnType<typeof setTimeout>[] = [];
  private _intervals: ReturnType<typeof setInterval>[] = [];

  // bound listeners so we can remove them on deactivate
  private _unsubscribers: (() => void)[] = [];

  private readonly _runner: DialogueRunner;

  constructor(
    private readonly _bus:   EventBus,
    private readonly _state: WorldState,
  ) {
    this._runner = new DialogueRunner(this._bus, this);
  }

  // ─── Activation ───────────────────────────────────────────────────────────

  activate(): void {
    if (this._active) return;
    this._active = true;
    this._firedOneShots.clear();

    const sub = <K extends keyof import("@/types").BusEvents>(
      event: K,
      cb: (p: import("@/types").BusEvents[K]) => void,
    ) => {
      this._bus.on(event, cb);
      this._unsubscribers.push(() => this._bus.off(event, cb));
    };

    sub("trigger:volume-enter",  ({ volumeId })  => this.fire("on_player_enter", volumeId));
    sub("trigger:volume-exit",   ({ volumeId })  => this.fire("on_player_exit",  volumeId));
    sub("character:interact",    ({ objectId })  => this.fire("on_interact",     objectId));
    sub("zone:enter",            ({ zoneId })    => this.fire("on_level_load",  zoneId));
    sub("state:changed",         ({ key })       => this.fire("on_state_changed", key));

    this._runner.attach();
    this._startTimers();
  }

  deactivate(): void {
    this._active = false;
    this._runner.detach();
    for (const unsub of this._unsubscribers) unsub();
    this._unsubscribers = [];
    for (const t of this._timers) clearTimeout(t);
    this._timers = [];
    for (const i of this._intervals) clearInterval(i);
    this._intervals = [];
  }

  onGameStart(): void { this.fire("on_game_start", null); }

  // ─── Index management ─────────────────────────────────────────────────────

  loadZone(zone: ZoneDef): void {
    for (const s of zone.scripts ?? []) this._indexScript(s);
    for (const obj of zone.objects) {
      for (const s of obj.scripts ?? []) {
        // Normalise the per-object trigger target so the index key matches what fire() looks up:
        //  - on_interact's target is always the owning object → key on_interact:<objId>
        //  - on_player_enter/exit on an object = its attached sensor colliders, which report
        //    the object id through the volume-sensor path → key <trigger>:<objId>
        //  - target-less triggers (on_game_start/on_timer/on_level_load/…) fire with null and
        //    must key to the wildcard; an old ScriptPanel set targetId = objId on these, which
        //    mis-keys them so they never fire — strip that stale id.
        let trig = s.trigger;
        if (trig.type === "on_interact" || trig.type === "on_player_enter" || trig.type === "on_player_exit") {
          trig = { ...trig, targetId: obj.id };
        } else if (trig.targetId === obj.id) {
          trig = { ...trig, targetId: undefined };
        }
        this._indexScript(trig === s.trigger ? s : { ...s, trigger: trig });
      }
    }
    for (const vol of zone.triggerVolumes ?? []) {
      for (const s of vol.scripts ?? []) {
        // inject targetId = vol.id so the index key matches trigger:volume-enter events
        const effective: ScriptDef = s.trigger.targetId
          ? s
          : { ...s, trigger: { ...s.trigger, targetId: vol.id } };
        this._indexScript(effective);
      }
    }
  }

  loadWorld(world: WorldConfig): void {
    for (const s of world.scripts ?? []) this._indexScript(s);
  }

  clearIndex(): void { this._index.clear(); }

  private _indexScript(s: ScriptDef): void {
    const key = `${s.trigger.type}:${s.trigger.targetId ?? "*"}`;
    const bucket = this._index.get(key) ?? [];
    bucket.push(s);
    this._index.set(key, bucket);
  }

  // ─── Firing ───────────────────────────────────────────────────────────────

  fire(trigger: TriggerType, targetId: string | null): void {
    if (!this._active) return;
    const key      = `${trigger}:${targetId ?? "*"}`;
    const wildcard = `${trigger}:*`;
    const scripts  = [
      ...(this._index.get(key)      ?? []),
      ...(key !== wildcard ? (this._index.get(wildcard) ?? []) : []),
    ];
    for (const s of scripts) this._evalAndRun(s);
  }

  /** Evaluate one script's guards and run it (honouring delay/oneShot). Shared by fire() and the timer loop. */
  private _evalAndRun(s: ScriptDef): void {
    if (!s.enabled) return;
    if (this._firedOneShots.has(s.id)) return;
    if (!this.checkConditions(s.conditions)) return;
    const run = () => this._runActions(s);
    if (s.trigger.delay && s.trigger.delay > 0) {
      const t = setTimeout(run, s.trigger.delay * 1000);
      this._timers.push(t);
    } else {
      run();
    }
    if (s.oneShot) this._firedOneShots.add(s.id);
  }

  /** Schedule every indexed `on_timer` script. Repeating timers use setInterval, one-shots use setTimeout. */
  private _startTimers(): void {
    for (const bucket of this._index.values()) {
      for (const s of bucket) {
        if (s.trigger.type !== "on_timer") continue;
        const ms = (s.trigger.interval ?? 5) * 1000;
        if (s.trigger.repeat) {
          this._intervals.push(setInterval(() => this._evalAndRun(s), ms));
        } else {
          this._timers.push(setTimeout(() => this._evalAndRun(s), ms));
        }
      }
    }
  }

  // ─── Condition evaluation ─────────────────────────────────────────────────

  /** Public so DialogueRunner can filter option conditions with the same rules. */
  checkConditions(conditions: ScriptCondition[]): boolean {
    for (const c of conditions) {
      switch (c.type) {
        case "has_state": {
          const v = gameState.get(c.stateKey ?? "");
          if (v === undefined || v === null || v === false) return false;
          break;
        }
        case "compare_number": {
          const v      = Number(gameState.get(c.stateKey ?? "") ?? 0);
          const target = Number(c.stateValue ?? 0);
          if (!compareNum(v, c.compareOp ?? "==", target)) return false;
          break;
        }
        case "has_item": {
          const owned = Number(gameState.get(invKey(c.itemId ?? "")) ?? 0);
          if (owned < (c.count ?? 1)) return false;
          break;
        }
        case "npc_alive":
        case "npc_dead":
          // stub — NPC system Phase 13
          break;
      }
    }
    return true;
  }

  // ─── Action dispatch ──────────────────────────────────────────────────────

  private _runActions(s: ScriptDef): void {
    this.runActions(s.actions);
  }

  /** Public so DialogueRunner can dispatch a chosen option's effects. */
  runActions(actions: ScriptAction[]): void {
    for (const action of actions) this._dispatch(action);
  }

  /** Find a dialogue tree by id across every zone (tiny data; cross-zone-safe). */
  findDialogue(id: string): DialogueTreeDef | undefined {
    for (const z of this._state.zones.values()) {
      const d = z.dialogues?.find(t => t.id === id);
      if (d) return d;
    }
    return undefined;
  }

  private _dispatch(action: ScriptAction): void {
    switch (action.type) {
      case "play_sound": {
        // Positional when targeting an entity/group — resolve each target's pose;
        // otherwise a non-positional (or explicit-position) one-shot.
        const ids = this._resolveTargets(action.targetId);
        if (ids.length) {
          for (const id of ids) {
            const pose = this._resolveObjectPose(id);
            this._bus.emit("audio:play", {
              id: action.sound ?? "",
              position: pose ? { x: pose.x, y: pose.y, z: pose.z } : action.position,
              volume: action.volume, loop: action.loop,
            });
          }
        } else {
          this._bus.emit("audio:play", { id: action.sound ?? "", position: action.position, volume: action.volume, loop: action.loop });
        }
        break;
      }

      case "stop_sound":
        this._bus.emit("audio:stop", { id: action.sound });
        break;

      case "play_music":
        this._bus.emit("music:play", { soundId: action.music ?? action.sound ?? "", volume: action.volume, loop: action.loop, fade: action.fadeSeconds });
        break;

      case "stop_music":
        this._bus.emit("music:stop", { fade: action.fadeSeconds });
        break;

      case "set_footstep":
        // Empty sound → revert to the authored default (CharacterController clears the override).
        this._bus.emit("character:set-footstep", { sound: action.sound });
        break;

      case "show_dialogue": {
        // Legacy inline `action.dialogue` is migrated to a registry tree by
        // migrateDialogues on load (both pipelines) — no runtime fallback.
        const tree = action.dialogueId ? this.findDialogue(action.dialogueId) : undefined;
        if (tree) this._runner.start(tree);
        else console.warn(`[ScriptEngine] show_dialogue: dialogue '${action.dialogueId ?? ""}' not found`);
        break;
      }

      case "set_state":
        if (action.stateKey) gameState.set(action.stateKey, action.stateValue ?? null);
        break;

      case "adjust_number":
        if (action.stateKey) gameState.adjust(action.stateKey, action.numberDelta ?? 0);
        break;

      case "delete_state":
        if (action.stateKey) gameState.delete(action.stateKey);
        break;

      case "fire_event":
        if (action.eventId) this.fire("on_state_changed", action.eventId);
        break;

      case "fade_screen":
        this._bus.emit("overlay:fade-in", {
          color:    action.fadeColor    ?? "#000000",
          duration: action.fadeDuration ?? 0.3,
        });
        break;

      case "load_scene":
        // Cross-scene routing (runtime shell). Only the runtime's SceneRouter
        // listens — in editor preview this is a deliberate no-op.
        if (action.sceneId) this._bus.emit("scene:load-request", { sceneId: action.sceneId });
        break;

      case "teleport_player": {
        // Destination: literal position, or a stored Vec3/pose via positionKey (overrides).
        let dest: Vec3 | undefined = action.position;
        if (action.positionKey) {
          const stored = gameState.get(action.positionKey);
          if (isVec3(stored)) dest = stored;
          else { console.warn(`[ScriptEngine] teleport_player: state key '${action.positionKey}' is not a Vec3`); dest = undefined; }
        }
        if (!dest) break;
        // Facing (degrees): keep current (undefined), a literal, or from a state key
        // (a number, or the .facing of a stored pose — so one key restores position + facing).
        let facing: number | undefined;
        if (action.facingSource === "literal") facing = action.facing;
        else if (action.facingSource === "key") {
          const v = gameState.get(action.facingKey ?? "");
          const poseFacing = (v as { facing?: unknown } | undefined)?.facing;
          if (typeof v === "number") facing = v;                    // a plain number key
          else if (typeof poseFacing === "number") facing = poseFacing;  // a stored pose's .facing
          else console.warn(`[ScriptEngine] teleport_player: facing key '${action.facingKey}' has no numeric facing`);
        }
        this._bus.emit("character:teleport", { position: dest, facing });
        break;
      }

      case "store_position": {
        // Store a position (as a { x,y,z,facing? } pose) into a state key.
        const key = action.stateKey;
        if (!key) break;
        switch (action.posSource ?? "player") {
          case "player":
            this._bus.emit("character:save-position", { key });   // CharacterController writes live pose
            break;
          case "object": {
            const pose = this._resolveObjectPose(action.targetId);
            if (pose) gameState.set(key, pose);
            else console.warn(`[ScriptEngine] store_position: object '${action.targetId}' not found in active zone`);
            break;
          }
          case "coords":
            if (action.position) {
              const pose: Record<string, number> = { x: action.position.x, y: action.position.y, z: action.position.z };
              if (action.facing != null) pose.facing = action.facing;
              gameState.set(key, pose);
            }
            break;
        }
        break;
      }

      case "despawn_object":
        for (const id of this._resolveTargets(action.targetId))
          this._bus.emit("object:despawn", { id });
        break;

      // Phase 31 — scripted geometry motion. MoverSystem is the only listener;
      // targets without a registered mover are silently ignored there.
      case "start_mover":
      case "stop_mover":
      case "toggle_mover": {
        const op = action.type === "start_mover" ? "start"
                 : action.type === "stop_mover"  ? "stop" : "toggle";
        for (const id of this._resolveTargets(action.targetId))
          this._bus.emit("mover:set", { targetId: id, op });
        break;
      }

      // Placed-light switching. ZoneManager is the only listener — drives intensity
      // only (light counts never change → no shader recompile); reset on preview:stop.
      case "light_on":
      case "light_off":
      case "toggle_light": {
        const op = action.type === "light_on" ? "on"
                 : action.type === "light_off" ? "off" : "toggle";
        for (const id of this._resolveTargets(action.targetId))
          this._bus.emit("light:set", { targetId: id, op });
        break;
      }

      // Phase 32 — items: counts live at gameState `inv.<itemId>`. Clamp inline
      // (registry stackSize / floor 0) — gameState only clamps registered keys.
      case "give_item":
      case "take_item": {
        if (!action.itemId) break;
        const key   = invKey(action.itemId);
        const item  = itemRegistry(this._state).find(i => i.id === action.itemId);
        if (!item) console.warn(`[ScriptEngine] ${action.type}: item '${action.itemId}' not in registry (operating on raw key)`);
        const cur   = Number(gameState.get(key) ?? 0);
        const count = action.count ?? 1;
        const next  = action.type === "give_item"
          ? Math.min(cur + count, item?.stackSize ?? Infinity)
          : Math.max(cur - count, 0);
        gameState.set(key, next);
        break;
      }

      case "move_object": {
        if (action.position) {
          const zoneId = this._state.activeZoneId ?? "";
          for (const id of this._resolveTargets(action.targetId))
            this._bus.emit("object:updated", { id, zoneId, changes: { position: action.position as Vec3 } });
        }
        break;
      }

      case "play_animation":
        if (action.animation)
          for (const id of this._resolveTargets(action.targetId))
            this._bus.emit("object:play-animation", { id, clipName: action.animation, loop: action.animationLoop, hold: action.animationHold, blend: action.animationBlend });
        break;

      case "change_material": {
        if (action.material) {
          const zoneId = this._state.activeZoneId ?? "";
          for (const id of this._resolveTargets(action.targetId))
            this._bus.emit("object:updated", { id, zoneId, changes: { material: action.material } });
        }
        break;
      }

      case "show_ui":
        if (action.uiElementId) this._bus.emit("ui:show", { elementId: action.uiElementId });
        break;

      case "run_script":
        if (action.script) {
          try {
            // sandboxed via limited context object — not truly isolated
            const ctx = {
              get:    (k: string) => gameState.get(k),
              set:    (k: string, v: import("@/types").JsonValue) => gameState.set(k, v),
              has:    (k: string) => gameState.has(k),
              adjust: (k: string, d: number) => gameState.adjust(k, d),
            };
            // eslint-disable-next-line no-new-func
            new Function("ctx", action.script)(ctx);
          } catch (e) {
            console.warn("[ScriptEngine] run_script error:", e);
          }
        }
        break;

      case "spawn_npc":
      case "open_door":
      case "close_door":
        // stubs — Phase 13 / future phases
        console.warn(`[ScriptEngine] action '${action.type}' not yet implemented`);
        break;
    }
  }

  /**
   * Expand an action target into concrete entity ids. A targetId matching a
   * GroupDef resolves to every active-zone entity tagged with that group;
   * anything else is treated as a single entity id.
   */
  /**
   * Resolve an entity id in the active zone to a { x,y,z,facing } pose. Works for any
   * entity type that carries a real `position` — objects, platforms, trigger volumes —
   * not just model objects (facing is rotation.y in degrees, 0 when absent). Stairs /
   * walls / floors are node- or segment-based with no single position, so they're skipped.
   */
  private _resolveObjectPose(targetId?: string): { x: number; y: number; z: number; facing: number } | null {
    if (!targetId) return null;
    const zone = this._state.activeZoneId ? this._state.zones.get(this._state.activeZoneId) : undefined;
    if (!zone) return null;
    const obj = zone.objects.find(o => o.id === targetId);
    if (obj) return { x: obj.position.x, y: obj.position.y, z: obj.position.z, facing: obj.rotation.y };
    const plat = zone.platforms.find(p => p.id === targetId);
    if (plat) return { x: plat.position.x, y: plat.position.y, z: plat.position.z, facing: plat.rotation?.y ?? 0 };
    const shape = (zone.shapes ?? []).find(s => s.id === targetId);
    if (shape) return { x: shape.position.x, y: shape.position.y, z: shape.position.z, facing: shape.rotation.y };
    const vol = (zone.triggerVolumes ?? []).find(v => v.id === targetId);
    if (vol) return { x: vol.position.x, y: vol.position.y, z: vol.position.z, facing: vol.rotation?.y ?? 0 };
    const cp = (zone.checkpoints ?? []).find(c => c.id === targetId);
    if (cp) return { x: cp.position.x, y: cp.position.y, z: cp.position.z, facing: cp.facingDeg };
    return null;
  }

  private _resolveTargets(targetId?: string): string[] {
    if (!targetId) return [];
    if (!this._state.groups.some(g => g.id === targetId)) return [targetId];
    const zone = this._state.activeZoneId ? this._state.zones.get(this._state.activeZoneId) : undefined;
    if (!zone) return [];
    const ids: string[] = [];
    const collect = (arr: { id: string; groupIds?: string[] }[]) => {
      for (const e of arr) if (e.groupIds?.includes(targetId)) ids.push(e.id);
    };
    collect(zone.objects);
    collect(zone.walls);
    collect(zone.floors);
    collect(zone.platforms);
    collect(zone.stairs);
    collect(zone.shapes ?? []);
    collect(zone.triggerVolumes ?? []);
    return ids;
  }

  // ─── Game-save hooks ──────────────────────────────────────────────────────
  // Fired one-shots are session progress — persisted alongside gameState so a
  // saved game doesn't re-run scripts that already fired.

  getFiredOneShots(): string[] { return [...this._firedOneShots]; }

  restoreFiredOneShots(ids: string[]): void { this._firedOneShots = new Set(ids); }
}
