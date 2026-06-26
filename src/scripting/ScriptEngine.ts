import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type {
  ZoneDef, WorldConfig, ScriptDef, ScriptAction, ScriptCondition,
  TriggerType, Vec3,
} from "@/types";
import { gameStateManager } from "./GameStateManager";

export class ScriptEngine {
  private _active       = false;
  // index: `${triggerType}:${targetId}` → scripts[]
  private _index        = new Map<string, ScriptDef[]>();
  private _firedOneShots = new Set<string>();
  private _flags        = new Map<string, boolean>();
  private _timers: ReturnType<typeof setTimeout>[] = [];
  private _intervals: ReturnType<typeof setInterval>[] = [];

  // bound listeners so we can remove them on deactivate
  private _unsubscribers: (() => void)[] = [];

  constructor(
    private readonly _bus:   EventBus,
    private readonly _state: WorldState,
  ) {}

  // ─── Activation ───────────────────────────────────────────────────────────

  activate(): void {
    if (this._active) return;
    this._active = true;
    this._firedOneShots.clear();
    this._flags.clear();

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

    this._startTimers();
  }

  deactivate(): void {
    this._active = false;
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
        //  - target-less triggers (on_game_start/on_timer/on_level_load/…) fire with null and
        //    must key to the wildcard; an old ScriptPanel set targetId = objId on these, which
        //    mis-keys them so they never fire — strip that stale id.
        let trig = s.trigger;
        if (trig.type === "on_interact") {
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
    if (!this._checkConditions(s.conditions)) return;
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

  private _checkConditions(conditions: ScriptCondition[]): boolean {
    for (const c of conditions) {
      switch (c.type) {
        case "flag_set":       if (!this.hasFlag(c.flag ?? "")) return false; break;
        case "flag_not_set":   if (this.hasFlag(c.flag ?? ""))  return false; break;
        case "player_has_item":
          if (!gameStateManager.hasItem(c.itemId ?? "")) return false; break;
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
    for (const action of s.actions) this._dispatch(action);
  }

  private _dispatch(action: ScriptAction): void {
    switch (action.type) {
      case "play_sound":
        this._bus.emit("audio:play", { id: action.sound ?? "", position: action.position });
        break;

      case "show_dialogue":
        if (action.dialogue) {
          this._bus.emit("dialogue:show", {
            speaker:  action.dialogue.speaker,
            lines:    action.dialogue.lines,
            portrait: action.dialogue.portrait,
          });
        }
        break;

      case "set_flag":
        if (action.flag) this.setFlag(action.flag);
        break;

      case "clear_flag":
        if (action.flag) this.clearFlag(action.flag);
        break;

      case "fire_event":
        if (action.eventId) this.fire("on_flag_set", action.eventId);
        break;

      case "fade_screen":
        this._bus.emit("overlay:fade-in", {
          color:    action.fadeColor    ?? "#000000",
          duration: action.fadeDuration ?? 0.3,
        });
        break;

      case "teleport_player":
        if (action.position) {
          this._bus.emit("character:teleport", {
            position: action.position,
            facing:   0,
          });
        }
        break;

      case "despawn_object":
        for (const id of this._resolveTargets(action.targetId))
          this._bus.emit("object:despawn", { id });
        break;

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

      case "give_item":
        if (action.itemId) gameStateManager.addItem(action.itemId);
        break;

      case "run_script":
        if (action.script) {
          try {
            // sandboxed via limited context object — not truly isolated
            const ctx = {
              flags:        Object.fromEntries(this._flags),
              setFlag:      (f: string) => this.setFlag(f),
              clearFlag:    (f: string) => this.clearFlag(f),
              hasFlag:      (f: string) => this.hasFlag(f),
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
    collect(zone.triggerVolumes ?? []);
    return ids;
  }

  // ─── Flag system ──────────────────────────────────────────────────────────

  setFlag(flag: string): void {
    this._flags.set(flag, true);
    this.fire("on_flag_set", flag);
  }

  clearFlag(flag: string): void {
    this._flags.delete(flag);
    this.fire("on_flag_cleared", flag);
  }

  hasFlag(flag: string): boolean {
    return this._flags.get(flag) === true;
  }
}
