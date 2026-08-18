import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { MoverSystem } from "@/world/MoverSystem";
import type { ObjectPlacer } from "./ObjectPlacer";
import type { PreviewController } from "./PreviewController";
import type { ScriptEngine } from "@/scripting/ScriptEngine";
import type { EnemyAIDef } from "@/types";
import { physicsWorld } from "@/physics/PhysicsWorld";
import { gameState } from "@/scripting/GameState";
import { despawnedKey } from "@/scripting/entityState";

/**
 * Phase 61 — basic enemy AI: detect → chase/circle → attack → cooldown, with
 * hysteresis, a leash, and a movement-variation knob (orbit drift + timing
 * jitter + occasional feints). Design: plans/phase-61-enemy-ai.md.
 *
 * Each AI-enabled object rides a DORMANT MoverSystem entry (built by
 * ZoneManager exactly like a mover host): this system drives that entry's
 * kinematic body + meshes directly — attached trigger volumes ride along, the
 * enemy stays solid to the player, and preview:stop's mover reset snaps
 * everything back to the authored pose for free.
 *
 * Movement is kinematic: a downward ray snaps to ground height (no hit = a
 * ledge → the enemy refuses the step, so it can't walk off its platform), and
 * a forward probe STOPS at walls (no pathfinding). Detection is horizontal
 * distance with a max vertical gap. Enemies are assumed upright (authored
 * X/Z rotation is not preserved while the AI drives).
 *
 * Update order matters: registered AFTER movers.update and BEFORE
 * physicsWorld.step (kinematic setNext* must precede the step). Dormant while
 * the entity is despawned (`__despawned.<id>`, Phase 60) — death itself is
 * authored, the engine never guesses which state key means health.
 */

const MAX_VERTICAL_GAP = 3.5;  // m between player capsule center and enemy feet ("3m" + capsule slack)
const GROUND_RAY_UP    = 1.5;  // ray origin height above current feet
const GROUND_RAY_LEN   = 5.0;
const WALL_PROBE_DIST  = 0.6;
const WALL_PROBE_UP    = 0.5;  // probe height above feet
const TURN_RATE        = 7;    // rad/s toward the desired facing
const ORBIT_MAX_RAD    = 1.1;  // ~63° max orbit bias at variation 1
const ORBIT_PERIOD_SEC = 3.2;
const FEINT_CHANCE     = 0.3;  // × variation, per attack
const ARRIVE_EPS       = 0.25; // "back at post" distance
const HIT_RANGE_SLACK  = 1.3;  // bite still lands within attackRange × this at the damage moment

interface Resolved {
  detectRadius: number; giveUpRadius: number; attackRange: number;
  moveSpeed: number; attackDamage: number; damageKey: string;
  attackCooldown: number; damageMoment: number; variation: number; leashRadius: number;
  idleClip: string | null; walkClip: string | null; attackClip: string | null;
  clipsResolved: boolean;   // false until the model's clips were available for auto-match
  heightY: number | null;   // enemy body height (AABB × scale) — bite whiffs above it; null until the model loaded
}

interface AiRec {
  id:    string;
  def:   EnemyAIDef;
  scaleY: number;   // authored object scale (for the AABB → world height)
  p:     Resolved;
  state: "idle" | "chase" | "attack" | "return";
  pos:   THREE.Vector3;   // feet/origin (object-position convention)
  yaw:   number;          // world yaw, radians
  post:  THREE.Vector3;   // authored rest position (leash anchor)
  cooldownUntil: number;
  attackAt:      number;  // clock when the current attack started
  attackDur:     number;
  feinting:      boolean;
  damageDone:    boolean;
  orbitDir:      1 | -1;
  orbitPhase:    number;
  attackNum:     number;   // per-attack counter — seeds the feint roll (see below)
  currentClip:   string | null;
}

function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h;
}

/** Case-insensitive substring match against the model's clip names. */
function autoClip(names: string[], want: string): string | null {
  const lower = names.map(n => n.toLowerCase());
  const i = lower.findIndex(n => n.includes(want));
  return i >= 0 ? names[i]! : null;
}

export class EnemyAI {
  private _recs = new Map<string, AiRec>();
  private _active = false;
  private _clock = 0;
  private readonly _unsubs: Array<() => void> = [];

  // preallocated scratch
  private readonly _toPlayer = new THREE.Vector3();
  private readonly _dir      = new THREE.Vector3();
  private readonly _cand     = new THREE.Vector3();
  private readonly _quat     = new THREE.Quaternion();
  private readonly _offset   = new THREE.Vector3();
  private readonly _up       = new THREE.Vector3(0, 1, 0);

  constructor(
    private readonly _world:   WorldState,
    private readonly _bus:     EventBus,
    private readonly _movers:  MoverSystem,
    private readonly _placer:  ObjectPlacer,
    private readonly _preview: PreviewController,
    private readonly _engine:  ScriptEngine,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("preview:start", ({ mode }) => {
        // Occlusion mode is a debug vantage — enemies stay put there.
        this._active = mode !== "occlusion";
        if (this._active) this._build();
      }),
      this._bus.on("preview:stop", () => {
        this._active = false;
        this._recs.clear();          // MoverSystem's reset snaps poses back
        this._clock = 0;
      }),
    );
  }

  dispose(): void { this._unsubs.forEach(u => u()); this._unsubs.length = 0; }

  private _build(): void {
    this._recs.clear();
    for (const zone of this._world.zones.values()) {
      for (const obj of zone.objects) {
        const def = obj.ai;
        if (!def?.enabled) continue;
        const entry = this._movers.entryFor(obj.id);
        if (!entry) continue;   // no mesh yet / mover-enabled (real mover wins)
        const h = hash(obj.id);
        const detect = def.detectRadius ?? 6;
        const rec: AiRec = {
          id: obj.id, def,
          scaleY: obj.scale?.y ?? 1,
          p: {
            detectRadius:  detect,
            giveUpRadius:  def.giveUpRadius ?? detect * 1.5,
            attackRange:   def.attackRange ?? 1.2,
            moveSpeed:     def.moveSpeed ?? 2.5,
            attackDamage:  def.attackDamage ?? 1,
            damageKey:     def.damageKey || "health",
            attackCooldown: def.attackCooldown ?? 1.5,
            damageMoment:  def.damageMoment ?? 0.4,
            variation:     Math.max(0, Math.min(1, def.variation ?? 0.5)),
            leashRadius:   def.leashRadius ?? 12,
            idleClip: null, walkClip: null, attackClip: null, clipsResolved: false,
            heightY: null,
          },
          state: "idle",
          pos:  entry.origin.clone(),
          yaw:  new THREE.Euler().setFromQuaternion(entry.originQuat, "YXZ").y,
          post: entry.origin.clone(),
          cooldownUntil: 0, attackAt: 0, attackDur: 0.8, feinting: false, damageDone: true,
          orbitDir: (h & 1) ? 1 : -1,
          orbitPhase: ((h >>> 1) % 628) / 100,
          attackNum: 0,
          currentClip: null,
        };
        this._resolveClips(rec);
        this._recs.set(obj.id, rec);
      }
    }
  }

  /** Clip mapping: authored name, or auto substring match. Models load async —
   *  retried each frame until the mixer's clip list exists. */
  private _resolveClips(rec: AiRec): void {
    const names = this._placer.clipNamesFor(rec.id);
    if (!names.length) return;
    const pick = (authored: string | null | undefined, want: string): string | null =>
      authored === null ? null : (authored ?? autoClip(names, want));
    rec.p.idleClip   = pick(rec.def.idleClip,   "idle");
    rec.p.walkClip   = pick(rec.def.walkClip,   "walk") ?? autoClip(names, "run");
    rec.p.attackClip = pick(rec.def.attackClip, "attack") ?? autoClip(names, "bite");
    rec.p.clipsResolved = true;
  }

  /** Debug/read access for the DEV harness (window.__enemyAI). */
  get recs(): ReadonlyMap<string, AiRec> { return this._recs; }

  update(dt: number): void {
    if (!this._active || this._recs.size === 0) return;
    const player = this._preview.playerPosition;
    if (!player) return;
    // Clamp like physicsWorld.step does (0.05): a frozen background tab can
    // hand rAF a multi-second dt — raw, that teleports steering and blows
    // through attack windows in one frame.
    dt = Math.min(dt, 0.05);
    this._clock += dt;

    for (const rec of this._recs.values()) {
      // Dormant while despawned (killed) — Phase 60 despawn state.
      if (gameState.get(despawnedKey(rec.id)) === true) {
        if (rec.state !== "idle") { rec.state = "idle"; rec.currentClip = null; }
        continue;
      }
      const entry = this._movers.entryFor(rec.id);
      if (!entry) continue;
      // A script-driven clip (e.g. the held Death pose during a DELAYED
      // despawn, or a checkpoint's celebratory Dance) freezes the AI: no
      // chasing, no attacks, no clip changes. currentClip is nulled so
      // locomotion RE-ISSUES its clip when the interlude ends — stopPreview
      // reverts the mixer to the auto-play clip, and stale "already playing
      // Walk" bookkeeping left the enemy drifting in its idle pose.
      if (this._placer.hasScriptClip(rec.id)) { rec.currentClip = null; continue; }
      if (!rec.p.clipsResolved) this._resolveClips(rec);
      if (rec.p.heightY == null) {
        const aabb = this._placer.getLocalAABB(rec.id);
        if (aabb) rec.p.heightY = aabb.size.y * rec.scaleY;
      }

      const dx = player.x - rec.pos.x, dz = player.z - rec.pos.z;
      const distXZ  = Math.hypot(dx, dz);
      const dyOk    = Math.abs(player.y - rec.pos.y) <= MAX_VERTICAL_GAP;
      const fromPost = Math.hypot(rec.pos.x - rec.post.x, rec.pos.z - rec.post.z);
      const p = rec.p;

      // ── state transitions ──
      if (rec.state === "idle" || rec.state === "return") {
        if (distXZ <= p.detectRadius && dyOk && fromPost <= p.leashRadius) {
          rec.state = "chase";
          this._engine.fire("on_player_detected", rec.id);
        }
      }
      if (rec.state === "chase") {
        if (distXZ > p.giveUpRadius || !dyOk || fromPost > p.leashRadius) {
          rec.state = "return";
          this._engine.fire("on_player_lost", rec.id);
        } else if (distXZ <= p.attackRange && this._clock >= rec.cooldownUntil) {
          rec.state = "attack";
          rec.attackAt = this._clock;
          rec.damageDone = false;
          // Feint roll: hash of (enemy phase + attack COUNTER), never the clock —
          // clock-based sin resonates with the regular attack cadence and can
          // roll feints many times in a row (caught live: a 4s window where
          // every bite feinted). The counter decorrelates consecutive attacks.
          rec.attackNum++;
          const roll = Math.abs(Math.sin((rec.orbitPhase + rec.attackNum) * 43758.5453)) % 1;
          rec.feinting = p.variation > 0 && roll < FEINT_CHANCE * p.variation;
          rec.attackDur = (p.attackClip && this._placer.clipDuration(rec.id, p.attackClip)) || 0.8;
          if (p.attackClip) { this._placer.aiPlay(rec.id, p.attackClip, { loop: false, blend: 0.1 }); rec.currentClip = p.attackClip; }
        }
      }
      if (rec.state === "attack") {
        // face the player throughout the bite
        this._turnToward(rec, Math.atan2(dx, dz), dt);
        if (!rec.damageDone && this._clock >= rec.attackAt + p.damageMoment) {
          rec.damageDone = true;
          // The bite is a forward lunge — a player ABOVE the enemy's body
          // (standing/landing on its back mid-stomp) is out of its reach.
          const overTop = (player.y - rec.pos.y) > (p.heightY ?? 1) + 0.35;
          if (!rec.feinting && distXZ <= p.attackRange * HIT_RANGE_SLACK && dyOk && !overTop) {
            gameState.adjust(p.damageKey, -p.attackDamage);
            this._engine.fire("on_enemy_attack", rec.id);
          }
        }
        if (this._clock >= rec.attackAt + rec.attackDur) {
          rec.state = "chase";
          // jittered cooldown so packs don't metronome
          const jitter = 1 + p.variation * 0.4 * Math.sin(this._clock * 7.77 + rec.orbitPhase);
          rec.cooldownUntil = this._clock + p.attackCooldown * jitter;
        }
        this._applyPose(rec, entry);
        continue;   // no locomotion during the bite
      }

      // ── locomotion ──
      let moved = false;
      if (rec.state === "chase" && distXZ > p.attackRange * 0.9) {
        this._dir.set(dx, 0, dz).normalize();
        // orbit bias: curve/strafe instead of beelining (drifts over time)
        const orbit = Math.sin(this._clock * (Math.PI * 2 / ORBIT_PERIOD_SEC) + rec.orbitPhase)
          * p.variation * ORBIT_MAX_RAD * rec.orbitDir;
        if (orbit) this._dir.applyAxisAngle(this._up, orbit);
        moved = this._step(rec, this._dir, p.moveSpeed, dt, entry);
        this._turnToward(rec, Math.atan2(this._dir.x, this._dir.z), dt);
      } else if (rec.state === "chase") {
        this._turnToward(rec, Math.atan2(dx, dz), dt);   // in range, waiting on cooldown
      } else if (rec.state === "return") {
        const hx = rec.post.x - rec.pos.x, hz = rec.post.z - rec.pos.z;
        if (Math.hypot(hx, hz) <= ARRIVE_EPS) {
          rec.state = "idle";
        } else {
          this._dir.set(hx, 0, hz).normalize();
          moved = this._step(rec, this._dir, p.moveSpeed, dt, entry);
          this._turnToward(rec, Math.atan2(this._dir.x, this._dir.z), dt);
        }
      }

      // ── animation by state ──
      const want = rec.state === "idle" ? p.idleClip : (moved || rec.state !== "chase" ? p.walkClip : p.idleClip);
      if (want && want !== rec.currentClip) {
        if (this._placer.aiPlay(rec.id, want, { loop: true })) rec.currentClip = want;
      }

      this._applyPose(rec, entry);
    }
  }

  // Preallocated rays (CharacterController idiom — no per-frame allocation).
  private readonly _wallRay   = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
  private readonly _groundRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

  /** Advance rec.pos along dir with the wall probe + ground snap. Returns true when it moved. */
  private _step(rec: AiRec, dir: THREE.Vector3, speed: number, dt: number, entry: NonNullable<ReturnType<MoverSystem["entryFor"]>>): boolean {
    const w = physicsWorld.world;
    const excludeBody = entry.body ?? undefined;
    // forward wall probe at knee height — stop, don't steer
    this._wallRay.origin = { x: rec.pos.x, y: rec.pos.y + WALL_PROBE_UP, z: rec.pos.z };
    this._wallRay.dir    = { x: dir.x, y: 0, z: dir.z };
    if (w.castRay(this._wallRay, WALL_PROBE_DIST, true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, excludeBody)) return false;
    const step = speed * dt;
    this._cand.set(rec.pos.x + dir.x * step, rec.pos.y, rec.pos.z + dir.z * step);
    // Ground snap at the candidate — no ground = a ledge, refuse the step.
    // The PLAYER's capsule is excluded: a bounced/jumping player overhead must
    // never read as "ground" (the enemy would snap up and ride the bounce).
    this._groundRay.origin = { x: this._cand.x, y: this._cand.y + GROUND_RAY_UP, z: this._cand.z };
    const groundHit = w.castRay(this._groundRay, GROUND_RAY_LEN, true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined,
      this._preview.playerCollider ?? undefined, excludeBody);
    if (!groundHit) return false;
    this._cand.y = (this._cand.y + GROUND_RAY_UP) - groundHit.timeOfImpact;
    // Rise tripwire (debug, kept: cheap and this class has a history) — any
    // upward ground-snap > 0.4m in one step records WHAT the ray hit, on
    // window.__aiRises + console.warn. The floating-crab reports were
    // unreproducible synthetically; this catches the culprit collider live.
    if (this._cand.y - rec.pos.y > 0.4) {
      const t = groundHit.collider.translation();
      const evt = {
        id: rec.id, from: +rec.pos.y.toFixed(2), to: +this._cand.y.toFixed(2),
        toi: +groundHit.timeOfImpact.toFixed(3), sensor: groundHit.collider.isSensor(),
        colliderAt: { x: +t.x.toFixed(2), y: +t.y.toFixed(2), z: +t.z.toFixed(2) },
        handle: groundHit.collider.handle, state: rec.state, clock: +this._clock.toFixed(1),
      };
      const g = globalThis as unknown as { __aiRises?: unknown[] };
      (g.__aiRises ??= []).push(evt);
      if (g.__aiRises.length > 20) g.__aiRises.shift();
      console.warn("[EnemyAI] RISE", JSON.stringify(evt));
    }
    rec.pos.copy(this._cand);
    return true;
  }

  private _turnToward(rec: AiRec, targetYaw: number, dt: number): void {
    let d = targetYaw - rec.yaw;
    while (d >  Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const max = TURN_RATE * dt;
    rec.yaw += Math.max(-max, Math.min(max, d));
  }

  /** Pose the kinematic body + every registered mesh (attached volume visuals
   *  included) from rec.pos/yaw — the mover _applyPose idiom: rest transforms
   *  offset about the entity origin. */
  private _applyPose(rec: AiRec, entry: NonNullable<ReturnType<MoverSystem["entryFor"]>>): void {
    this._quat.setFromAxisAngle(this._up, rec.yaw);
    if (entry.body) {
      entry.body.setNextKinematicTranslation({ x: rec.pos.x, y: rec.pos.y, z: rec.pos.z });
      entry.body.setNextKinematicRotation({ x: this._quat.x, y: this._quat.y, z: this._quat.z, w: this._quat.w });
    }
    // yaw delta relative to the authored rest yaw, applied about the origin
    const restYaw = new THREE.Euler().setFromQuaternion(entry.originQuat, "YXZ").y;
    const dq = new THREE.Quaternion().setFromAxisAngle(this._up, rec.yaw - restYaw);
    for (const m of entry.meshes) {
      this._offset.copy(m.pos).sub(entry.origin).applyQuaternion(dq);
      m.obj.position.copy(rec.pos).add(this._offset);
      m.obj.quaternion.copy(dq).multiply(m.quat);
    }
  }
}
