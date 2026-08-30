import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import type { EventBus } from "@/core/EventBus";
import type { MoverDef, Vec3 } from "@/types";
import { reportTransformWrite } from "@/world/transformWatchdog";

// Scratch objects — update() runs per mover per frame, so no allocations here.
const _axis     = new THREE.Vector3();
const _slideOff = new THREE.Vector3();
const _spinQ    = new THREE.Quaternion();
const _bodyQ    = new THREE.Quaternion();
const _deltaQ   = new THREE.Quaternion();
const _invQ     = new THREE.Quaternion();
const _pos      = new THREE.Vector3();
const _v        = new THREE.Vector3();
// Reused plain objects for the Rapier setters — they copy the fields into WASM
// synchronously, so sharing one literal avoids 2 allocations per mover per frame.
const _tv = { x: 0, y: 0, z: 0 };
const _tq = { x: 0, y: 0, z: 0, w: 1 };
// Phase 67 scratch — per-sub accumulation into the one composed pose.
const _sum  = new THREE.Vector3();
const _off1 = new THREE.Vector3();
const _q1   = new THREE.Quaternion();

interface MeshRest { obj: THREE.Object3D; pos: THREE.Vector3; quat: THREE.Quaternion }

/** Phase 67 — one mover's clock. Each sub keeps its own duration/dwell/phase
 *  state; the entry composes every sub into ONE pose per frame. */
interface MoverSub {
  def:      MoverDef;
  running:  boolean;
  t:        number;             // slide: seconds into the cycle; spin: unused
  progress: number;             // slide "once": 0..1 along the leg
  dir:      1 | -1;             // slide "once": travel direction
  angle:    number;             // spin: accumulated radians
}

interface MoverEntry {
  subs:       MoverSub[];         // Phase 67 — [] on aiDriven host entries
  meshes:     MeshRest[];
  body:       RAPIER.RigidBody | null;
  origin:     THREE.Vector3;      // entity rest position (= kinematic body rest pose)
  originQuat: THREE.Quaternion;   // entity rest rotation
  // Phase 61 — entry exists only as an AI enemy's kinematic HOST (body,
  // volume riding, rest-pose reset). Never advanced by this system
  // (subs stays empty) and immune to mover:set ops; EnemyAI drives it
  // through entryFor().
  aiDriven?:  boolean;
  // carry: where the body was told to be last frame → per-frame world delta
  prevPos:    THREE.Vector3;
  delta:      THREE.Vector3;
}

/**
 * Scripted geometry motion (Phase 31). Entities with `mover.enabled` register
 * here from ZoneManager's build paths; each frame (BEFORE physicsWorld.step)
 * the system poses their meshes and kinematic bodies from the authored rest
 * pose — WorldState is never written. Active only between preview:start and
 * preview:stop; on stop everything snaps back to rest.
 */
export class MoverSystem {
  private readonly _entries = new Map<string, MoverEntry>();
  // body handle → entry, for O(1) carry/push lookups from the character controller.
  private readonly _byHandle = new Map<number, MoverEntry>();
  private _active = false;

  constructor(bus: EventBus) {
    bus.on("preview:start", () => { this._active = true; });
    bus.on("preview:stop",  () => { this._active = false; this._resetAll(); });
    bus.on("mover:set",     ({ targetId, op, moverId }) => this._setOp(targetId, op, moverId));
  }

  /** Bound once — handed to CharacterBody's contact scan without a per-frame closure. */
  readonly isMoverBody = (bodyHandle: number): boolean => this._byHandle.has(bodyHandle);

  /** True when any mover can move this frame — gates ALL per-frame carry/push work. */
  anyRunning(): boolean {
    if (!this._active) return false;
    for (const e of this._entries.values()) if (e.subs.some(s => s.running)) return true;
    return false;
  }

  /** meshes' current transforms are captured as the rest pose — call after the builder finished posing them. */
  register(
    entityId: string,
    defs: MoverDef[],
    meshes: THREE.Object3D[],
    body: RAPIER.RigidBody | null,
    origin: Vec3,
    originQuat?: { x: number; y: number; z: number; w: number },
    aiDriven = false,
  ): void {
    const oq = originQuat
      ? new THREE.Quaternion(originQuat.x, originQuat.y, originQuat.z, originQuat.w)
      : new THREE.Quaternion();
    const prev = this._entries.get(entityId);
    if (prev?.body) this._byHandle.delete(prev.body.handle);
    const entry: MoverEntry = {
      // Phase 67 — one clock per mover; an aiDriven host registers none.
      subs: aiDriven ? [] : defs.map(def => ({
        def, running: def.autoStart ?? true, t: 0, progress: 0, dir: 1 as const, angle: 0,
      })),
      meshes: meshes.map(m => ({ obj: m, pos: m.position.clone(), quat: m.quaternion.clone() })),
      body,
      origin:     new THREE.Vector3(origin.x, origin.y, origin.z),
      originQuat: oq,
      aiDriven,
      prevPos: new THREE.Vector3(origin.x, origin.y, origin.z),
      delta:   new THREE.Vector3(),
    };
    this._entries.set(entityId, entry);
    if (body) this._byHandle.set(body.handle, entry);
  }

  /**
   * Phase 61 — the EnemyAI system's handle on an aiDriven host entry: the
   * kinematic body to pose, the mesh list to move with it (attached volume
   * visuals ride via the same list), and the rest pose (the enemy's leash
   * post). Null for non-AI entries — EnemyAI must never drive a real mover.
   */
  entryFor(entityId: string): {
    body: RAPIER.RigidBody | null;
    meshes: ReadonlyArray<{ obj: THREE.Object3D; pos: THREE.Vector3; quat: THREE.Quaternion }>;
    origin: THREE.Vector3;
    originQuat: THREE.Quaternion;
  } | null {
    const e = this._entries.get(entityId);
    if (!e?.aiDriven) return null;
    return { body: e.body, meshes: e.meshes, origin: e.origin, originQuat: e.originQuat };
  }

  unregister(entityId: string): void {
    const e = this._entries.get(entityId);
    if (e?.body) this._byHandle.delete(e.body.handle);
    this._entries.delete(entityId);
  }

  has(entityId: string): boolean { return this._entries.has(entityId); }

  /** The entry's kinematic body + rest pose — for parenting attached trigger-volume
   *  sensors (Phase 53). Null when the entity has no mover entry. */
  hostFor(entityId: string): { body: RAPIER.RigidBody | null; origin: THREE.Vector3; originQuat: THREE.Quaternion } | null {
    const e = this._entries.get(entityId);
    return e ? { body: e.body, origin: e.origin, originQuat: e.originQuat } : null;
  }

  /** Append extra meshes to an entry so they ride the mover (attached volume
   *  wireframe/fill). Current transforms are captured as their rest pose —
   *  _applyPose re-poses them about the entity origin and _resetAll restores
   *  them, both unchanged. NOTE: register() overwrites the mesh list, so
   *  attachments must be re-added after every host rebuild. */
  attachMeshes(entityId: string, objs: THREE.Object3D[]): void {
    const e = this._entries.get(entityId);
    if (!e) return;
    for (const obj of objs) e.meshes.push({ obj, pos: obj.position.clone(), quat: obj.quaternion.clone() });
  }

  /** Remove previously attached meshes (volume deleted/edited while its host
   *  lives on). entityId null = scan every entry (the volume def may already be
   *  gone from WorldState when its meshes are torn down). */
  detachMeshes(entityId: string | null, objs: THREE.Object3D[]): void {
    const set = new Set(objs);
    const entries = entityId ? [this._entries.get(entityId)] : [...this._entries.values()];
    for (const e of entries) {
      if (e) e.meshes = e.meshes.filter(m => !set.has(m.obj));
    }
  }

  /**
   * World translation the mover under `bodyHandle` moves by this frame — what a
   * grounded character must add to ride it. Null when the handle isn't a mover.
   */
  carryDelta(bodyHandle: number): THREE.Vector3 | null {
    return this._byHandle.get(bodyHandle)?.delta ?? null;
  }

  /**
   * Runs every frame in both shells, registered BEFORE physicsWorld.step.
   * Idle entries (not running) cost nothing: their pose was applied on the frame
   * they stopped (or at reset) and their carry delta is zeroed on every
   * running→stopped transition, so skipping them is safe.
   */
  update(dt: number): void {
    if (!this._active || this._entries.size === 0) return;
    for (const [id, e] of this._entries) {
      if (!e.subs.some(s => s.running)) continue;
      for (const s of e.subs) if (s.running) this._advance(s, dt);
      reportTransformWrite(id, "MoverSystem");
      this._applyPose(e);
      // Every sub stopped this frame (a "once" slide reached an end): the final
      // pose is applied above; kill the residual delta so a rider stops being carried.
      if (!e.subs.some(s => s.running)) e.delta.set(0, 0, 0);
    }
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private _advance(s: MoverSub, dt: number): void {
    const d = s.def;
    if (d.kind === "spin") {
      s.angle += (d.speed ?? 45) * (Math.PI / 180) * dt;
      return;
    }
    const duration = Math.max(d.duration ?? 2, 0.05);
    if ((d.mode ?? "loop") === "once") {
      s.progress += (s.dir * dt) / duration;
      if (s.progress >= 1) { s.progress = 1; s.running = false; }
      if (s.progress <= 0) { s.progress = 0; s.running = false; }
    } else {
      s.t += dt;
    }
  }

  /** Slide scalar 0..1 (eased) for the sub's current time state. */
  private _slideU(e: MoverSub): number {
    const d = e.def;
    let u: number;
    if ((d.mode ?? "loop") === "once") {
      u = e.progress;
    } else {
      const duration = Math.max(d.duration ?? 2, 0.05);
      const dwell    = Math.max(d.dwell ?? 0, 0);
      const period   = 2 * (duration + dwell);
      const tt = (e.t + (d.phase ?? 0) * period) % period;
      if      (tt < duration)                    u = tt / duration;
      else if (tt < duration + dwell)            u = 1;
      else if (tt < 2 * duration + dwell)        u = 1 - (tt - duration - dwell) / duration;
      else                                       u = 0;
    }
    return (1 - Math.cos(Math.PI * u)) / 2;   // sinusoidal ease-in-out
  }

  private _applyPose(e: MoverEntry): void {
    // Phase 67 — compose every sub into one pose: slides SUM (in local space,
    // rotated to world once), spins MULTIPLY in list order. A paused sub keeps
    // contributing its frozen offset/angle, exactly like a stopped single
    // mover kept its last pose.
    _sum.set(0, 0, 0);
    _spinQ.identity();
    for (const s of e.subs) {
      const d = s.def;
      _axis.set(d.axis === "x" ? 1 : 0, d.axis === "y" ? 1 : 0, d.axis === "z" ? 1 : 0);
      if (d.kind === "slide") {
        _off1.copy(_axis).multiplyScalar(this._slideU(s) * (d.distance ?? 2));
        _sum.add(_off1);
      } else {
        _q1.setFromAxisAngle(_axis, s.angle);
        _spinQ.multiply(_q1);
      }
    }
    _slideOff.copy(_sum).applyQuaternion(e.originQuat);

    // Body pose: rest pose composed with the local-space motion.
    _pos.copy(e.origin).add(_slideOff);
    _bodyQ.copy(e.originQuat).multiply(_spinQ);
    if (e.body) {
      _tv.x = _pos.x; _tv.y = _pos.y; _tv.z = _pos.z;
      e.body.setNextKinematicTranslation(_tv);
      _tq.x = _bodyQ.x; _tq.y = _bodyQ.y; _tq.z = _bodyQ.z; _tq.w = _bodyQ.w;
      e.body.setNextKinematicRotation(_tq);
    }
    e.delta.copy(_pos).sub(e.prevPos);
    e.prevPos.copy(_pos);

    // Meshes: rotate each about the entity origin by the world-space delta
    // rotation, then add the slide offset (handles off-origin meshes — e.g. a
    // platform's railing boxes — exactly like PlatformBuilder's yaw orbit).
    _deltaQ.copy(e.originQuat).multiply(_spinQ).multiply(_invQ.copy(e.originQuat).invert());
    for (const m of e.meshes) {
      _v.copy(m.pos).sub(e.origin).applyQuaternion(_deltaQ);
      m.obj.position.copy(e.origin).add(_v).add(_slideOff);
      m.obj.quaternion.copy(_deltaQ).multiply(m.quat);
    }
  }

  private _resetAll(): void {
    for (const e of this._entries.values()) {
      // aiDriven entries register no subs (the floating-crab fix, kept by
      // construction): there is nothing here to re-arm.
      for (const s of e.subs) {
        s.t = 0; s.progress = 0; s.dir = 1; s.angle = 0;
        s.running = s.def.autoStart ?? true;
      }
      e.delta.set(0, 0, 0);
      e.prevPos.copy(e.origin);
      for (const m of e.meshes) {
        m.obj.position.copy(m.pos);
        m.obj.quaternion.copy(m.quat);
      }
      if (e.body) {
        // Hard teleport (not setNext…) — preview is over, no step is pending.
        e.body.setTranslation({ x: e.origin.x, y: e.origin.y, z: e.origin.z }, false);
        e.body.setRotation({ x: e.originQuat.x, y: e.originQuat.y, z: e.originQuat.z, w: e.originQuat.w }, false);
      }
    }
  }

  private _setOp(targetId: string, op: "start" | "stop" | "toggle", moverId?: string): void {
    const e = this._entries.get(targetId);
    if (!e || e.aiDriven) return;   // AI host entries never run as movers (Phase 61)
    // Phase 67 — no moverId = every mover (the pre-67 behaviour); an id picks one.
    const subs = moverId ? e.subs.filter(s => s.def.id === moverId) : e.subs;
    for (const s of subs) {
      if (op === "start") { s.running = true; continue; }
      if (op === "stop")  { s.running = false; continue; }
      // toggle: a "once" slide heads for the other end (door open/close);
      // everything else pauses/resumes.
      if (s.def.kind === "slide" && (s.def.mode ?? "loop") === "once") {
        if      (s.progress <= 0) s.dir = 1;
        else if (s.progress >= 1) s.dir = -1;
        else                      s.dir = s.dir === 1 ? -1 : 1;
        s.running = true;
        continue;
      }
      s.running = !s.running;
    }
    if (!e.subs.some(s => s.running)) e.delta.set(0, 0, 0);   // paused mid-motion: no residual carry
  }
}
