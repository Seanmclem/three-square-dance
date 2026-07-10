import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import type { EventBus } from "@/core/EventBus";
import type { MoverDef, Vec3 } from "@/types";

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

interface MeshRest { obj: THREE.Object3D; pos: THREE.Vector3; quat: THREE.Quaternion }

interface MoverEntry {
  def:        MoverDef;
  meshes:     MeshRest[];
  body:       RAPIER.RigidBody | null;
  origin:     THREE.Vector3;      // entity rest position (= kinematic body rest pose)
  originQuat: THREE.Quaternion;   // entity rest rotation
  running:    boolean;
  t:          number;             // slide: seconds into the cycle; spin: unused
  progress:   number;             // slide "once": 0..1 along the leg
  dir:        1 | -1;             // slide "once": travel direction
  angle:      number;             // spin: accumulated radians
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
    bus.on("mover:set",     ({ targetId, op }) => this._setOp(targetId, op));
  }

  /** Bound once — handed to CharacterBody's contact scan without a per-frame closure. */
  readonly isMoverBody = (bodyHandle: number): boolean => this._byHandle.has(bodyHandle);

  /** True when any mover can move this frame — gates ALL per-frame carry/push work. */
  anyRunning(): boolean {
    if (!this._active) return false;
    for (const e of this._entries.values()) if (e.running) return true;
    return false;
  }

  /** meshes' current transforms are captured as the rest pose — call after the builder finished posing them. */
  register(
    entityId: string,
    def: MoverDef,
    meshes: THREE.Object3D[],
    body: RAPIER.RigidBody | null,
    origin: Vec3,
    originQuat?: { x: number; y: number; z: number; w: number },
  ): void {
    const oq = originQuat
      ? new THREE.Quaternion(originQuat.x, originQuat.y, originQuat.z, originQuat.w)
      : new THREE.Quaternion();
    const prev = this._entries.get(entityId);
    if (prev?.body) this._byHandle.delete(prev.body.handle);
    const entry: MoverEntry = {
      def,
      meshes: meshes.map(m => ({ obj: m, pos: m.position.clone(), quat: m.quaternion.clone() })),
      body,
      origin:     new THREE.Vector3(origin.x, origin.y, origin.z),
      originQuat: oq,
      running:    def.autoStart ?? true,
      t: 0, progress: 0, dir: 1, angle: 0,
      prevPos: new THREE.Vector3(origin.x, origin.y, origin.z),
      delta:   new THREE.Vector3(),
    };
    this._entries.set(entityId, entry);
    if (body) this._byHandle.set(body.handle, entry);
  }

  unregister(entityId: string): void {
    const e = this._entries.get(entityId);
    if (e?.body) this._byHandle.delete(e.body.handle);
    this._entries.delete(entityId);
  }

  has(entityId: string): boolean { return this._entries.has(entityId); }

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
    for (const e of this._entries.values()) {
      if (!e.running) continue;
      this._advance(e, dt);
      this._applyPose(e);
      // Stopped this frame (a "once" slide reached an end): the final pose is
      // applied above; kill the residual delta so a rider stops being carried.
      if (!e.running) e.delta.set(0, 0, 0);
    }
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private _advance(e: MoverEntry, dt: number): void {
    const d = e.def;
    if (d.kind === "spin") {
      e.angle += (d.speed ?? 45) * (Math.PI / 180) * dt;
      return;
    }
    const duration = Math.max(d.duration ?? 2, 0.05);
    if ((d.mode ?? "loop") === "once") {
      e.progress += (e.dir * dt) / duration;
      if (e.progress >= 1) { e.progress = 1; e.running = false; }
      if (e.progress <= 0) { e.progress = 0; e.running = false; }
    } else {
      e.t += dt;
    }
  }

  /** Slide scalar 0..1 (eased) for the entry's current time state. */
  private _slideU(e: MoverEntry): number {
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
    const d = e.def;
    _axis.set(d.axis === "x" ? 1 : 0, d.axis === "y" ? 1 : 0, d.axis === "z" ? 1 : 0);

    if (d.kind === "slide") {
      const s = this._slideU(e) * (d.distance ?? 2);
      _slideOff.copy(_axis).multiplyScalar(s).applyQuaternion(e.originQuat);
      _spinQ.identity();
    } else {
      _slideOff.set(0, 0, 0);
      _spinQ.setFromAxisAngle(_axis, e.angle);
    }

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
      e.t = 0; e.progress = 0; e.dir = 1; e.angle = 0;
      e.running = e.def.autoStart ?? true;
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

  private _setOp(targetId: string, op: "start" | "stop" | "toggle"): void {
    const e = this._entries.get(targetId);
    if (!e) return;
    if (op === "start") { e.running = true; return; }
    if (op === "stop")  { e.running = false; e.delta.set(0, 0, 0); return; }
    // toggle: a "once" slide heads for the other end (door open/close);
    // everything else pauses/resumes.
    if (e.def.kind === "slide" && (e.def.mode ?? "loop") === "once") {
      if      (e.progress <= 0) e.dir = 1;
      else if (e.progress >= 1) e.dir = -1;
      else                      e.dir = e.dir === 1 ? -1 : 1;
      e.running = true;
      return;
    }
    e.running = !e.running;
    if (!e.running) e.delta.set(0, 0, 0);   // paused mid-motion: no residual carry
  }
}
