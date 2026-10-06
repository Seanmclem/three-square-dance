import * as THREE from "three";
import type { BodyPart } from "@/types";
import { allBones, partBones, type MixRig } from "./mix";

/**
 * Phase 88: actions on a body part, and aiming, on top of whatever the mixer played this
 * frame (the driver's locomotion). Runs right after `mixer.update`, so a character with no
 * action and no aim is untouched.
 *
 *  - An ACTION (a move that plays on the upper body, arms, head or legs) writes its clip's
 *    rotations onto that part, faded in and out. The part's first bone (the spine above the
 *    hips, a shoulder, the neck) is re-aimed each frame so the part keeps the facing it has
 *    in its own clip, whatever the legs' clip does with the hips.
 *  - AIM (on while aiming, or while an action that aims plays): with aim poses (up /
 *    straight / down clips) the part takes the pose for the aim angle, or, over an action,
 *    the action is tilted by (aim pose relative to straight). Without aim poses the spine
 *    and head turn toward the angle.
 */
export interface AimPoses {
  up: THREE.AnimationClip; neutral: THREE.AnimationClip; down: THREE.AnimationClip;
  part: BodyPart; upDeg: number; downDeg: number;
}

const AIM_FADE = 0.2;        // seconds to start / stop aiming
const SPINE_MAX = 60;        // degrees: the most the spine turn bends
const SPINE_SHARE = 0.7;     // of the spine turn on the spine (the rest on the neck / head)

/** Rotation tracks of a clip, sampled by bone. */
class Sampler {
  private readonly tracks = new Map<string, THREE.Interpolant>();
  constructor(clip: THREE.AnimationClip) {
    for (const tr of clip.tracks) {
      const p = THREE.PropertyBinding.parseTrackName(tr.name);
      if (p.propertyName === "quaternion") this.tracks.set(p.nodeName, tr.createInterpolant());
    }
  }
  q(bone: string, t: number): THREE.Quaternion | null {
    const it = this.tracks.get(bone);
    if (!it) return null;
    const v = it.evaluate(t);
    return new THREE.Quaternion(v[0], v[1], v[2], v[3]);
  }
}
const samplers = new WeakMap<THREE.AnimationClip, Sampler>();
const sampler = (clip: THREE.AnimationClip) => { let s = samplers.get(clip); if (!s) { s = new Sampler(clip); samplers.set(clip, s); } return s; };

interface Action {
  key: string; clip: THREE.AnimationClip; part: BodyPart; bones: string[]; set: Set<string>;
  loop: boolean; hold: boolean; aims: boolean; speed: number; fade: number;
  t: number; w: number; target: number;
}

export class PartLayers {
  private readonly bones = new Map<string, THREE.Object3D>();
  private readonly order: string[];
  private readonly written = new Map<THREE.Object3D, { orig: THREE.Quaternion; wrote: THREE.Quaternion }>();
  private action: Action | null = null;
  private aimOn = false;
  private pitch = 0;      // radians, up = positive
  private aimW = 0;

  constructor(private readonly root: THREE.Object3D, private readonly rig: MixRig, private readonly aimPoses: () => AimPoses | null) {
    root.traverse(o => { if ((o as THREE.Bone).isBone) this.bones.set(THREE.PropertyBinding.sanitizeNodeName(o.name), o); });
    this.order = allBones(rig);
  }

  /** The playing action's key ("" when none). */
  get actionKey(): string { return this.action && this.action.target > 0 ? this.action.key : ""; }
  get aiming(): boolean { return this.aimOn || !!this.action?.aims; }

  playAction(key: string, clip: THREE.AnimationClip, part: BodyPart, o: { loop: boolean; hold: boolean; aims: boolean; speed: number; fade: number }): void {
    const bones = partBones(this.rig, part);
    const w = this.action?.part === part ? this.action.w : 0;   // a new action on the same part takes over smoothly
    this.action = { key, clip, part, bones, set: new Set(bones), ...o, t: 0, w, target: 1 };
  }
  stopAction(): void { if (this.action) this.action.target = 0; }
  setAim(on: boolean): void { this.aimOn = on; }
  setAimPitch(rad: number): void { this.pitch = rad; }

  post(dt: number): void {
    // Bones the mixer didn't drive keep last frame's write: put them back first.
    for (const [b, w] of this.written) if (b.quaternion.equals(w.wrote)) b.quaternion.copy(w.orig);
    this.written.clear();
    const a = this.action;
    if (a) {
      const dur = a.clip.duration || 1;
      a.t += dt * a.speed;
      if (a.t >= dur) {
        if (a.loop) a.t %= dur;
        else { a.t = dur; if (!a.hold) a.target = 0; }
      }
      const step = a.fade > 0 ? dt / a.fade : 1;
      a.w = a.target > a.w ? Math.min(a.target, a.w + step) : Math.max(a.target, a.w - step);
      if (a.target === 0 && a.w <= 0) this.action = null;
    }
    const aimTarget = this.aiming ? 1 : 0;
    this.aimW = aimTarget > this.aimW ? Math.min(1, this.aimW + dt / AIM_FADE) : Math.max(0, this.aimW - dt / AIM_FADE);
    const act = this.action;
    if (!act && this.aimW <= 0) return;
    if (act && act.w > 0) this.writeAction(act);
    if (this.aimW > 0) {
      const poses = this.aimPoses();
      if (poses) this.aimWithPoses(poses, act && act.w > 0 ? act : null);
      else this.turnSpine();
    }
    for (const [b, w] of this.written) w.wrote.copy(b.quaternion);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private touch(b: THREE.Object3D): void {
    if (!this.written.has(b)) this.written.set(b, { orig: b.quaternion.clone(), wrote: new THREE.Quaternion() });
  }

  /** Rotation of `bone` relative to the skeleton's top, from the live pose or a getter. */
  private chain(bone: string | null | undefined, get: (b: string) => THREE.Quaternion): THREE.Quaternion {
    const q = new THREE.Quaternion();
    for (let b = bone; b; b = this.rig.parent.get(b)) q.premultiply(get(b));
    return q;
  }
  private live = (b: string) => this.bones.get(b)?.quaternion ?? new THREE.Quaternion();

  /** Write a clip's pose (at `t`) onto `bones`; first bones of the part are re-aimed. */
  private writePose(bones: string[], inPart: Set<string>, pose: (b: string) => THREE.Quaternion | null, poseParent: (b: string) => THREE.Quaternion, w: number): void {
    for (const b of bones) {
      const obj = this.bones.get(b), q = pose(b);
      if (!obj || !q) continue;
      const par = this.rig.parent.get(b);
      if (par && !inPart.has(par)) {
        // keep the part's facing from its own clip: (live parent)⁻¹ × (clip parent) × q
        q.premultiply(this.chain(par, poseParent)).premultiply(this.chain(par, this.live).invert());
      }
      this.touch(obj);
      obj.quaternion.slerp(q, w);
    }
  }

  private writeAction(a: Action): void {
    const s = sampler(a.clip);
    this.writePose(a.bones, a.set, b => s.q(b, a.t), b => s.q(b, a.t) ?? this.rig.rest.get(b) ?? new THREE.Quaternion(), a.w);
  }

  private aimWithPoses(p: AimPoses, over: Action | null): void {
    const up = this.pitch >= 0;
    const f = Math.min(1, Math.abs(this.pitch) / THREE.MathUtils.degToRad(Math.max(1, up ? p.upDeg : p.downDeg)));
    const sN = sampler(p.neutral), sT = sampler(up ? p.up : p.down);
    const at = (b: string) => { const n = sN.q(b, 0), t = sT.q(b, 0); return n && t ? n.slerp(t, f) : n; };
    const bones = partBones(this.rig, p.part);
    if (over) {
      // Tilt the action by the aim: (straight)⁻¹ × (aim pose), on the bones both share.
      for (const b of bones) {
        if (!over.set.has(b)) continue;
        const obj = this.bones.get(b), n = sN.q(b, 0), pose = at(b);
        if (!obj || !n || !pose) continue;
        const delta = n.invert().multiply(pose);
        this.touch(obj);
        obj.quaternion.multiply(new THREE.Quaternion().slerp(delta, this.aimW));
      }
      return;
    }
    this.writePose(bones, new Set(bones), at, b => sN.q(b, 0) ?? this.rig.rest.get(b) ?? new THREE.Quaternion(), this.aimW);
  }

  /** No aim poses: bend the spine (and a little the neck / head) toward the aim angle. */
  private turnSpine(): void {
    const spine = this.order.filter(b => this.rig.groups.get(b) === "spine");
    const head = this.order.filter(b => this.rig.groups.get(b) === "head").slice(0, 2);
    if (!spine.length && !head.length) return;
    const ang = THREE.MathUtils.clamp(this.pitch, -THREE.MathUtils.degToRad(SPINE_MAX), THREE.MathUtils.degToRad(SPINE_MAX)) * this.aimW;
    // The character's right-hand axis, in the skeleton's own frame (an export may turn the
    // armature, e.g. Z-up to Y-up).
    const top = this.bones.get(this.order[0]!);
    const armQ = new THREE.Quaternion();
    if (top?.parent) {
      const rootQ = new THREE.Quaternion(), parQ = new THREE.Quaternion();
      this.root.getWorldQuaternion(rootQ); top.parent.getWorldQuaternion(parQ);
      armQ.copy(rootQ.invert().multiply(parQ));
    }
    const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(armQ.clone().invert());
    const turn = (b: string, share: number) => {
      const obj = this.bones.get(b);
      if (!obj || !share) return;
      const P = this.chain(this.rig.parent.get(b), this.live);
      const R = new THREE.Quaternion().setFromAxisAngle(axis, -ang * share);   // aiming up leans back
      this.touch(obj);
      obj.quaternion.premultiply(P.clone().invert().multiply(R).multiply(P));
    };
    const sShare = head.length ? SPINE_SHARE : 1;
    for (const b of spine) turn(b, sShare / spine.length);
    for (const b of head) turn(b, (1 - sShare) / head.length);
  }
}
