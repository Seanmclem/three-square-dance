import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type {
  ZoneDef, WorldConfig, ScriptDef, ScriptAction, ScriptCondition,
  TriggerType, Vec3, CompareOp, DialogueTreeDef, JsonValue,
} from "@/types";
import { gameState } from "./GameState";
import { DialogueRunner } from "./DialogueRunner";
import { invKey, itemRegistry } from "./inventory";
import { entKey, entInvKey, despawnedKey } from "./entityState";
import { uiKey, uiRegistry } from "./uiElements";

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

/**
 * Pure condition check over the gameState singleton — the single rule set,
 * shared by the engine, DialogueRunner (via checkConditions), and
 * GameGuiOverlay (menu option filtering).
 */
/**
 * player_falling's live-motion read (Phase 61.1). A module-level provider
 * because checkScriptConditions is a free function shared by the engine,
 * dialogues, and GUI menus. Set by both shells to the PreviewController's
 * playerMotion accessor; null result (not playing) fails the condition closed.
 */
let _playerMotion: (() => { grounded: boolean; velY: number; fellMsAgo: number } | null) | null = null;
export function setPlayerMotionProvider(fn: (() => { grounded: boolean; velY: number; fellMsAgo: number } | null) | null): void {
  _playerMotion = fn;
}

/** Equality used by BOTH the on_state_equals trigger and the state_equals
 *  condition: strict for primitives, JSON-deep for objects. */
function jsonEquals(a: JsonValue | undefined, b: JsonValue): boolean {
  if (a === b) return true;
  if (typeof a === "object" && typeof b === "object" && a !== null && b !== null)
    return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

export function checkScriptConditions(conditions: ScriptCondition[], ownerId?: string): boolean {
  // Phase 60 — entity scope: a condition may name an entity whose namespaced
  // key is read instead of the global one. "self" resolves through ownerId
  // (index-time rewrite covers entity-owned scripts; the ownerId param covers
  // dialogue options, where defs are evaluated raw). "self" with no owner
  // fails closed — same spirit as _resolveTargets' warning.
  const entity = (c: ScriptCondition): string | null | undefined => {
    if (!c.entityId) return undefined;                    // global
    if (c.entityId !== "self") return c.entityId;
    if (ownerId) return ownerId;
    console.warn("[ScriptEngine] condition scoped to 'self' outside an entity-owned context — failing");
    return null;                                          // unresolvable
  };
  // One condition's raw verdict, before the optional `not` inversion.
  const passes = (c: ScriptCondition, eid: string | undefined): boolean => {
    switch (c.type) {
      case "has_state": {
        const key = c.stateKey ?? "";
        const v = gameState.get(eid ? entKey(eid, key) : key);
        return !(v === undefined || v === null || v === false);
      }
      case "state_equals": {
        const key = c.stateKey ?? "";
        return jsonEquals(gameState.get(eid ? entKey(eid, key) : key), c.stateValue ?? null);
      }
      case "compare_number": {
        const key    = c.stateKey ?? "";
        const v      = Number(gameState.get(eid ? entKey(eid, key) : key) ?? 0);
        const target = Number(c.stateValue ?? 0);
        return compareNum(v, c.compareOp ?? "==", target);
      }
      case "has_item": {
        // owned <op> count — op defaults to ">=" ("has at least N"), so
        // pre-existing conditions keep their exact semantics.
        const key   = eid ? entInvKey(eid, c.itemId ?? "") : invKey(c.itemId ?? "");
        const owned = Number(gameState.get(key) ?? 0);
        return compareNum(owned, c.compareOp ?? ">=", c.count ?? 1);
      }
      case "player_falling": {
        // Airborne AND descending — the goomba-stomp gate. Walking into a
        // stomp zone (grounded) or rising through it (velY > 0) fails.
        // Both paths require a MEANINGFUL fall (> 2.5 m/s — reached ~0.13s
        // into any real jump's descent): teleport settle-drops, slope/step
        // micro-falls, and grounded walking never pass. That matters double
        // since v4.76.3's per-frame occupancy retry — a hair-trigger
        // threshold would fire on any single airborne flicker frame inside
        // the zone. The 120ms grace covers thin/flush zones whose enter
        // event lands on the same frame as grounding (velY already clamped).
        const m = _playerMotion?.() ?? null;
        const fallingNow  = !!m && !m.grounded && m.velY < -2.5;
        const justLanded  = !!m && m.fellMsAgo <= 120;
        return fallingNow || justLanded;
      }
      case "npc_alive":
      case "npc_dead":
        // Removed from the dropdown in Phase 60 (scoped compare_number covers
        // them); old data stays a tolerated no-op (always passes).
        return true;
    }
    return true;
  };
  for (const c of conditions) {
    const eid = entity(c);
    if (eid === null) return false;   // unresolvable "self" fails closed, `not` or not
    // `not` = "unless": the condition must FAIL for the guard to pass.
    if (passes(c, eid) === !!c.not) return false;
  }
  return true;
}

/**
 * Phase 65 — if-blocks. Choose each block's branch ONCE (first branch whose
 * conditions pass; else the `else` branch if present; else nothing) and return
 * the actions to dispatch: untagged actions always, tagged ones only when their
 * block picked their branch. A tag pointing at a missing block is treated as
 * untagged (lenient — unwrap semantics). Pure; shared with the editor's preview.
 */
export function selectBlockActions(s: Pick<ScriptDef, "actions" | "blocks">, ownerId?: string): ScriptAction[] {
  if (!s.blocks?.length) return s.actions;
  const chosen = new Map<string, number>();
  for (const b of s.blocks) {
    let pick = b.else ? -1 : Number.NaN;   // NaN never equals a branch index → nothing runs
    for (let i = 0; i < b.branches.length; i++) {
      if (checkScriptConditions(b.branches[i]!.conditions, ownerId)) { pick = i; break; }
    }
    chosen.set(b.id, pick);
  }
  return s.actions.filter(a => {
    if (!a.block) return true;
    const pick = chosen.get(a.block.id);
    return pick === undefined ? true : pick === a.block.branch;
  });
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

    // Enter is occupancy-aware (v4.76.3): a script whose conditions FAIL at
    // entry stays armed and fires the moment they pass while still inside
    // (per-frame volume-stay) — e.g. player_falling after jumping from within
    // a tall stomp zone, or has_item after using a key while standing on the
    // plate. Each script still fires at most once per visit; exit disarms.
    sub("trigger:volume-enter",  ({ volumeId })  => this._fireEnterOccupancy(volumeId, true));
    sub("trigger:volume-stay",   ({ volumeId })  => this._fireEnterOccupancy(volumeId, false));
    sub("trigger:volume-exit",   ({ volumeId })  => {
      this._enterFired.delete(volumeId);
      this.fire("on_player_exit", volumeId);
    });
    sub("character:interact",    ({ objectId })  => this.fire("on_interact",     objectId));
    sub("zone:enter",            ({ zoneId })    => this.fire("on_level_load",  zoneId));
    sub("state:changed",         ({ key, value }) => {
      this.fire("on_state_changed", key);
      this._fireStateEquals(key, value);
      // The long-dead on_health_zero stub, finally wired: transition-only for
      // free — GameState.set no-ops equal values and clamps health at 0, so
      // re-damage while dead can't re-fire until health rises again.
      if (key === "health" && typeof value === "number" && value <= 0) this.fire("on_health_zero", null);
    });

    // Custom GUI menus (Phase 49): the overlay emits the picked option; the
    // engine re-checks its conditions, dispatches its actions through the real
    // pipeline, and closes the menu unless closeOnPick is explicitly false.
    sub("ui:menu-pick", ({ elementId, optionId }) => {
      const el = uiRegistry(this._state).find(e => e.id === elementId);
      if (el?.kind !== "menu") return;
      const opt = el.options.find(o => o.id === optionId);
      if (!opt || !this.checkConditions(opt.conditions ?? [])) return;
      this.runActions(opt.actions ?? []);
      if (opt.closeOnPick !== false) gameState.set(uiKey(elementId), false);
    });

    this._runner.attach();
    this._startTimers();
  }

  deactivate(): void {
    this._active = false;
    this._enterFired.clear();
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
    for (const obj of zone.objects)
      for (const s of obj.scripts ?? []) this._indexScript(this._ownedScript(s, obj.id));
    for (const vol of zone.triggerVolumes ?? [])
      for (const s of vol.scripts ?? []) this._indexScript(this._ownedScript(s, vol.id));
  }

  /**
   * Normalise an entity-owned script for the index. The stored def is NEVER
   * mutated — shallow copies only (the index copy must not share rewritten
   * trigger/action objects with the def, or undo/saves would corrupt).
   *  - Entity triggers (on_interact / on_player_enter / on_player_exit) key on
   *    the OWNER regardless of what was authored — so a duplicated entity's
   *    scripts fire on the copy (not the source it was stamped with), and blank
   *    scripts need no stamp at all. Volumes used to inject-only-if-falsy, which
   *    left duplicated volumes firing on the original.
   *  - Target-less triggers (on_game_start / on_timer / …) must key to the
   *    wildcard; a stale authored self-id mis-keys them so they never fire —
   *    strip it. on_state_equals/on_dialogue_end targetIds (state key /
   *    dialogue id) pass through untouched.
   *  - Action targetId "self" resolves to the owner. The def keeps the literal
   *    "self", which is what makes prefab capture / copy / paste portable —
   *    every stamped copy re-resolves to its own owner at index time.
   */
  private _ownedScript(s: ScriptDef, ownerId: string): ScriptDef {
    let trig = s.trigger;
    if (trig.type === "on_interact" || trig.type === "on_player_enter" || trig.type === "on_player_exit"
      || trig.type === "on_player_detected" || trig.type === "on_player_lost" || trig.type === "on_enemy_attack") {
      trig = { ...trig, targetId: ownerId };
    } else if (trig.targetId === ownerId) {
      trig = { ...trig, targetId: undefined };
    }
    // Phase 60 — entity-scoped state trigger: "self" resolves to the owner here;
    // _indexScript then folds entityId into the (namespaced) bucket key.
    if (trig.entityId === "self") trig = { ...trig, entityId: ownerId };
    const selfAction = (a: ScriptAction) => a.targetId === "self" || a.fromId === "self" || a.toId === "self";
    const hasSelf     = s.actions.some(selfAction);
    const hasSelfCond = (s.conditions ?? []).some(c => c.entityId === "self");
    const hasSelfBlock = (s.blocks ?? []).some(b => b.branches.some(br => br.conditions.some(c => c.entityId === "self")));
    if (trig === s.trigger && !hasSelf && !hasSelfCond && !hasSelfBlock) return s;
    const resolveCond = (c: ScriptCondition): ScriptCondition => c.entityId === "self" ? { ...c, entityId: ownerId } : c;
    const resolveAction = (a: ScriptAction): ScriptAction => !selfAction(a) ? a : {
      ...a,
      ...(a.targetId === "self" ? { targetId: ownerId } : {}),
      ...(a.fromId   === "self" ? { fromId:   ownerId } : {}),
      ...(a.toId     === "self" ? { toId:     ownerId } : {}),
    };
    return {
      ...s,
      trigger: trig,
      actions:    hasSelf     ? s.actions.map(resolveAction) : s.actions,
      conditions: hasSelfCond ? s.conditions.map(resolveCond) : s.conditions,
      blocks:     hasSelfBlock ? s.blocks!.map(b => ({ ...b, branches: b.branches.map(br => ({ conditions: br.conditions.map(resolveCond) })) })) : s.blocks,
    };
  }

  loadWorld(world: WorldConfig): void {
    for (const s of world.scripts ?? []) this._indexScript(s);
  }

  clearIndex(): void { this._index.clear(); }

  private _indexScript(s: ScriptDef): void {
    // Phase 60 — entity-scoped state triggers bucket under the NAMESPACED key,
    // so the ordinary state:changed → fire path matches them with zero changes
    // (GameState emits the raw namespaced key). "self" surviving to here means
    // a non-entity-owned script authored it — it can never fire; warn.
    let t = s.trigger;
    if ((t.type === "on_state_changed" || t.type === "on_state_equals") && t.entityId) {
      if (t.entityId === "self") {
        console.warn(`[ScriptEngine] state trigger scoped to 'self' on a non-entity script '${s.label ?? s.id}' — never fires`);
      } else if (t.targetId) {
        t = { ...t, targetId: entKey(t.entityId, t.targetId) };
        s = { ...s, trigger: t };
      }
    }
    const key = `${t.type}:${t.targetId ?? "*"}`;
    const bucket = this._index.get(key) ?? [];
    bucket.push(s);
    this._index.set(key, bucket);
  }

  // ─── Firing ───────────────────────────────────────────────────────────────

  /**
   * on_state_equals: run the key's bucket filtered by the authored value.
   * Not routed through fire() — that runs whole buckets, and the value filter
   * is per-script. No wildcard bucket: a state key (targetId) is required.
   * Only fires on real transitions (GameState emits only on actual change);
   * seeded defaults never emit, and delete_state emits value: null.
   */
  private _fireStateEquals(key: string, value: JsonValue): void {
    if (!this._active) return;
    const bucket = this._index.get(`on_state_equals:${key}`);
    if (!bucket) return;
    for (const s of bucket) {
      if (jsonEquals(s.trigger.stateValue, value)) this._evalAndRun(s);
    }
  }

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

  // volumeId → script ids already fired during the CURRENT occupancy (v4.76.3).
  private _enterFired = new Map<string, Set<string>>();

  /** Run every on_player_enter script for this volume that hasn't fired during
   *  the current occupancy — at entry AND on each stay frame, so conditions
   *  that come true mid-occupancy still fire (once per visit). */
  private _fireEnterOccupancy(volumeId: string, isEnter: boolean): void {
    if (!this._active) return;
    const scripts = [
      ...(this._index.get(`on_player_enter:${volumeId}`) ?? []),
      ...(this._index.get("on_player_enter:*") ?? []),
    ];
    if (!scripts.length) return;
    let fired = this._enterFired.get(volumeId);
    if (isEnter || !fired) { fired = new Set(); this._enterFired.set(volumeId, fired); }
    for (const s of scripts) {
      if (fired.has(s.id)) continue;
      if (this._evalAndRun(s)) fired.add(s.id);
    }
  }

  /** Evaluate one script's guards and run it (honouring delay/oneShot). Shared by fire()
   *  and the timer loop. Returns true when the script actually ran/scheduled. */
  private _evalAndRun(s: ScriptDef): boolean {
    if (!s.enabled) return false;
    if (this._firedOneShots.has(s.id)) return false;
    if (!this.checkConditions(s.conditions)) return false;
    const run = () => this._runActions(s);
    if (s.trigger.delay && s.trigger.delay > 0) {
      const t = setTimeout(run, s.trigger.delay * 1000);
      this._timers.push(t);
    } else {
      run();
    }
    if (s.oneShot) this._firedOneShots.add(s.id);
    return true;
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
  checkConditions(conditions: ScriptCondition[], ownerId?: string): boolean {
    return checkScriptConditions(conditions, ownerId);
  }

  // ─── Action dispatch ──────────────────────────────────────────────────────

  private _runActions(s: ScriptDef): void {
    // Entity triggers carry the owner in the stamped targetId — thread it through
    // so owner-relative actions (launch_player's "relative to this volume") can
    // resolve the owner's pose at dispatch time.
    const t = s.trigger;
    const ownerId = (t.type === "on_player_enter" || t.type === "on_player_exit" || t.type === "on_interact"
      || t.type === "on_player_detected" || t.type === "on_player_lost" || t.type === "on_enemy_attack")
      ? t.targetId : undefined;
    // Phase 65 — if-blocks pick their branch here: after the trigger delay,
    // before per-action delays.
    this.runActions(selectBlockActions(s, ownerId), ownerId);
  }

  /** Public so DialogueRunner can dispatch a chosen option's effects (no owner there). */
  runActions(actions: ScriptAction[], ownerId?: string): void {
    for (const action of actions) {
      // Per-action delay: offset from when the script's actions start (i.e. after
      // any trigger-level delay). Lets one script sequence its effects — e.g.
      // play_animation Chest_Open now, despawn_object 0.8s later — without a
      // second delayed script. Timers die with deactivate(), same as trigger delays.
      if (action.delay && action.delay > 0) {
        const t = setTimeout(() => this._dispatch(action, ownerId), action.delay * 1000);
        this._timers.push(t);
      } else {
        this._dispatch(action, ownerId);
      }
    }
  }

  /** Find a dialogue tree by id across every zone (tiny data; cross-zone-safe). */
  findDialogue(id: string): DialogueTreeDef | undefined {
    for (const z of this._state.zones.values()) {
      const d = z.dialogues?.find(t => t.id === id);
      if (d) return d;
    }
    return undefined;
  }

  /**
   * Phase 60 — resolve a state action's write keys. No targetId = the bare
   * global key. A targetId (entity or group; "self" pre-resolved at index time,
   * or via ownerId on dialogue paths) fans out to each member's namespaced key.
   */
  private _scopedStateKeys(action: ScriptAction, ownerId: string | undefined, bare: string): string[] {
    if (!action.targetId) return [bare];
    const tid = action.targetId === "self" ? ownerId : action.targetId;
    if (!tid) {
      console.warn(`[ScriptEngine] ${action.type} scoped to 'self' outside an entity-owned context — no-op`);
      return [];
    }
    return this._resolveTargets(tid).map(id => entKey(id, bare));
  }

  private _dispatch(action: ScriptAction, ownerId?: string): void {
    // Per-action guard, evaluated HERE — i.e. after the action's delay — so a
    // delayed action reads the world as it is when it actually fires.
    if (action.conditions?.length && !checkScriptConditions(action.conditions, ownerId)) return;
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
        // Phase 60: the launching entity threads through so option conditions/
        // actions scoped to "this entity" resolve to the NPC being talked to.
        if (tree) this._runner.start(tree, ownerId);
        else console.warn(`[ScriptEngine] show_dialogue: dialogue '${action.dialogueId ?? ""}' not found`);
        break;
      }

      case "set_state":
        if (action.stateKey)
          for (const key of this._scopedStateKeys(action, ownerId, action.stateKey))
            // "__toggle__" sentinel (boolean keys' third option in the editor):
            // flip the CURRENT value per resolved key — each entity in a group
            // scope toggles its own state independently.
            gameState.set(key, action.stateValue === "__toggle__" ? !gameState.get(key) : (action.stateValue ?? null));
        break;

      case "adjust_number":
        if (action.stateKey)
          for (const key of this._scopedStateKeys(action, ownerId, action.stateKey))
            gameState.adjust(key, action.numberDelta ?? 0);
        break;

      case "delete_state":
        if (action.stateKey)
          for (const key of this._scopedStateKeys(action, ownerId, action.stateKey))
            gameState.delete(key);
        break;

      case "fire_event":
        if (action.eventId) this.fire("on_state_changed", action.eventId);
        break;

      case "flash_player":
        // CharacterController decides model-tint vs screen-flash — it owns cameraMode,
        // and the avatar is hidden entirely in FPS.
        this._bus.emit("character:flash", {
          color: action.flashColor ?? "#ff0000",
          duration: action.flashDuration ?? 1,
        });
        break;

      case "fade_screen": {
        const dur = action.fadeDuration ?? 0.3;
        this._bus.emit("overlay:fade-in", { color: action.fadeColor ?? "#000000", duration: dur });
        // The overlay HOLDS at opaque until a fade-out (Phase 53), and fade-in
        // suppresses player input — release both at fade end. duration 0 out =
        // the pre-53 visual (fade to color, hard cut back). Timer is tracked so
        // deactivate() cancels it; InputManager also un-suppresses on preview:stop.
        const t = setTimeout(() => this._bus.emit("overlay:fade-out", { duration: 0 }), dur * 1000);
        this._timers.push(t);
        break;
      }

      case "respawn_player": {
        // Death/respawn in one action: fade to color, then (under cover) teleport,
        // optionally refill health, and fade back. Destination priority:
        // stored pose key → checkpoint → the world's default spawn.
        const dur = action.fadeDuration ?? 0.4;
        this._bus.emit("overlay:fade-in", { color: action.fadeColor ?? "#000000", duration: dur });
        const t = setTimeout(() => {
          let dest: Vec3 | undefined;
          let facing: number | undefined;
          const stored = action.positionKey ? gameState.get(action.positionKey) : undefined;
          if (isVec3(stored)) {
            dest = stored;
            const f = (stored as { facing?: unknown }).facing;
            if (typeof f === "number") facing = f;
          }
          if (!dest && action.targetId) {
            const pose = this._resolveObjectPose(action.targetId);   // checkpoint-aware
            if (pose) { dest = pose; facing = pose.facing; }
          }
          if (!dest) {
            const spawn = this._state.world?.defaultSpawn;
            if (spawn) { dest = spawn.position; facing = spawn.facingDeg; }
          }
          if (dest) this._bus.emit("character:teleport", { position: dest, facing });
          else console.warn("[ScriptEngine] respawn_player: no destination (empty stored key, no checkpoint, no default spawn)");
          if (action.restoreHealth) gameState.resetKey("health");
          this._bus.emit("overlay:fade-out", { duration: dur });
        }, dur * 1000);
        this._timers.push(t);
        break;
      }

      case "launch_player": {
        // Spring/bouncer: sets the player's vertical velocity (the jump channel),
        // plus an optional horizontal shove. CharacterController is the only listener.
        // Direction frame: world compass, the owning entity's Y rotation (a rotated
        // dash pad launches out of its own front — pose.facing is that rotation), or
        // the player's own facing (180 = always knocked backwards).
        // Pre-v4.63.3 actions only have the boolean, so read it as the fallback.
        const relativeTo = action.launchRelativeTo ?? (action.launchRelative ? "entity" : "world");
        let dirDeg = action.launchDirDeg;
        if (relativeTo === "entity" && ownerId) {
          const pose = this._resolveObjectPose(ownerId);
          if (pose) dirDeg = (dirDeg ?? 0) + pose.facing;
        }
        this._bus.emit("character:launch", {
          speed: action.launchSpeed ?? 12,
          hSpeed: action.launchHSpeed,
          dirDeg,
          // The player's look yaw lives in CharacterController — it adds its own.
          relativeToPlayer: relativeTo === "player",
        });
        break;
      }

      case "load_scene":
        // Cross-scene routing: the runtime's SceneRouter, or the editor's
        // non-destructive preview hop (App's scene:load-request listener).
        if (action.sceneId) this._bus.emit("scene:load-request", { sceneId: action.sceneId, fadeColor: action.fadeColor, fadeDuration: action.fadeDuration });
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
        for (const id of this._resolveTargets(action.targetId)) {
          this._bus.emit("object:despawn", { id, fade: action.fadeDuration });
          // Phase 60 — persistent: rides the save; ZoneManager re-applies at
          // zone load (state-wins-when-present over startHidden).
          gameState.set(despawnedKey(id), true);
        }
        break;

      case "spawn_object":
        // Opposite of despawn: re-show a hidden entity (+ re-enable colliders).
        for (const id of this._resolveTargets(action.targetId)) {
          this._bus.emit("object:spawn", { id, fade: action.fadeDuration });
          gameState.set(despawnedKey(id), false);   // false ≠ absent: overrides startHidden
        }
        break;

      // Phase 31 — scripted geometry motion. MoverSystem is the only listener;
      // targets without a registered mover are silently ignored there.
      case "start_mover":
      case "stop_mover":
      case "toggle_mover": {
        const op = action.type === "start_mover" ? "start"
                 : action.type === "stop_mover"  ? "stop" : "toggle";
        for (const id of this._resolveTargets(action.targetId))
          this._bus.emit("mover:set", { targetId: id, op, moverId: action.moverId });
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
      // Phase 60 — a targetId scopes the counter to that entity's inventory
      // (`__ent.<id>.inv.<itemId>`), fanning out over group members.
      case "give_item":
      case "take_item": {
        if (!action.itemId) break;
        const item = itemRegistry(this._state).find(i => i.id === action.itemId);
        if (!item) console.warn(`[ScriptEngine] ${action.type}: item '${action.itemId}' not in registry (operating on raw key)`);
        for (const key of this._scopedStateKeys(action, ownerId, invKey(action.itemId))) {
          const cur   = Number(gameState.get(key) ?? 0);
          const count = action.count ?? 1;
          const next  = action.type === "give_item"
            ? Math.min(cur + count, item?.stackSize ?? Infinity)
            : Math.max(cur - count, 0);
          gameState.set(key, next);
        }
        break;
      }

      // Phase 60 — atomic, conserving item move: min(count, source balance,
      // destination stack space). Endpoints are single scopes (no groups):
      // absent = the player's global inventory; else an entity's inventory.
      case "transfer_item": {
        if (!action.itemId) break;
        const item = itemRegistry(this._state).find(i => i.id === action.itemId);
        const endpoint = (id?: string): string | null => {
          const eid = id === "self" ? ownerId : id;
          if (id && !eid) {
            console.warn("[ScriptEngine] transfer_item 'self' endpoint outside an entity-owned context — no-op");
            return null;
          }
          return eid ? entInvKey(eid, action.itemId!) : invKey(action.itemId!);
        };
        const fromKey = endpoint(action.fromId);
        const toKey   = endpoint(action.toId);
        if (!fromKey || !toKey || fromKey === toKey) break;
        const avail = Number(gameState.get(fromKey) ?? 0);
        const cur   = Number(gameState.get(toKey) ?? 0);
        const space = (item?.stackSize ?? Infinity) - cur;
        const move  = Math.max(0, Math.min(action.count ?? 1, avail, space));
        if (move <= 0) break;
        gameState.set(fromKey, avail - move);
        gameState.set(toKey, cur + move);
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
        if (action.animation) {
          // "player" targets the avatar (CharacterController override channel),
          // never the entity resolver — there is no entity with that id.
          if (action.targetId === "player") {
            this._bus.emit("character:play-animation", { clipName: action.animation, loop: action.animationLoop, hold: action.animationHold });
            break;
          }
          for (const id of this._resolveTargets(action.targetId))
            this._bus.emit("object:play-animation", { id, clipName: action.animation, loop: action.animationLoop, hold: action.animationHold, blend: action.animationBlend });
        }
        break;

      case "change_material": {
        if (action.material) {
          const zoneId = this._state.activeZoneId ?? "";
          for (const id of this._resolveTargets(action.targetId))
            this._bus.emit("object:updated", { id, zoneId, changes: { material: action.material } });
        }
        break;
      }

      // GUI visibility lives in gameState (`__ui.<id>`) — the overlay derives
      // from it via state:changed, so shown elements survive scene transitions,
      // persist into the save, and reset on New Game.
      case "show_ui":
        if (action.uiElementId) gameState.set(uiKey(action.uiElementId), true);
        break;

      case "hide_ui":
        if (action.uiElementId) gameState.set(uiKey(action.uiElementId), false);
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
    // "self" only means something on an entity-owned script (loadZone resolves it
    // to the owner at index time). Anywhere else — zone scripts, dialogue-option
    // effects — there is no owner: no-op loudly rather than target a bogus id.
    if (targetId === "self") {
      console.warn("[ScriptEngine] action target 'self' outside an entity-owned script — no target");
      return [];
    }
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
