import * as THREE from "three";
import type { BodyPart, MoveLayer } from "@/types";

/**
 * Phase 87: mixing clips into a new move ("Walk_Loop on the legs, Idle_Talking_Loop on
 * the upper body"). The result is one ordinary clip, so everything that plays clips
 * (the player, placed characters, the enemy AI, scripts, the editor) plays it as is.
 */

export const BODY_PARTS: Array<{ id: BodyPart; label: string }> = [
  { id: "upper", label: "upper body" },
  { id: "arms",  label: "arms" },
  { id: "head",  label: "head" },
  { id: "legs",  label: "legs" },
];

export type Group = "legs" | "spine" | "arms" | "head";

/** What mixing needs to know about a skeleton: each bone's body part, its parent and its
 *  resting rotation (all by track name). */
export interface MixRig { groups: Map<string, Group>; parent: Map<string, string | null>; rest: Map<string, THREE.Quaternion> }

export function mixRig(root: THREE.Object3D): MixRig {
  const groups = boneGroups(root), parent = new Map<string, string | null>(), rest = new Map<string, THREE.Quaternion>();
  root.traverse(o => {
    if (!(o as THREE.Bone).isBone) return;
    const n = THREE.PropertyBinding.sanitizeNodeName(o.name);
    parent.set(n, (o.parent as THREE.Bone | null)?.isBone ? THREE.PropertyBinding.sanitizeNodeName(o.parent!.name) : null);
    rest.set(n, o.quaternion.clone());
  });
  return { groups, parent, rest };
}

/**
 * Which body part each bone belongs to: by name first (thigh / spine / clavicle / neck …),
 * a bone with no telling name follows its parent, and a skeleton with no telling names at
 * all is sorted by where its bones sit in the model's own pose (below the hips = legs,
 * out to the side = arms, the top = head).
 */
export function boneGroups(root: THREE.Object3D): Map<string, Group> {
  const bones: THREE.Bone[] = [];
  root.traverse(o => { if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone); });
  const byName = (n: string): Group | null =>
    /thigh|upleg|calf|shin|knee|leg|foot|ankle|toe|ball|pelvis|hips?\b|^root$/i.test(n) ? "legs"
    : /neck|head|jaw|eye|ear|brow|tongue|skull/i.test(n) ? "head"
    : /clavicle|shoulder|arm|elbow|hand|wrist|finger|thumb|index|middle|ring|pinky|digit|palm/i.test(n) ? "arms"
    : /spine|chest|torso|abdomen|belly|back|rib/i.test(n) ? "spine"
    : null;
  const out = new Map<string, Group>();
  const named = bones.filter(b => byName(b.name)).length;
  if (named >= Math.min(6, bones.length / 3)) {
    const walk = (o: THREE.Object3D, inherited: Group) => {
      let g = inherited;
      if ((o as THREE.Bone).isBone) { g = byName(o.name) ?? inherited; out.set(o.name, g); }
      for (const c of o.children) walk(c, g);
    };
    walk(root, "legs");
    return sanitized(out);
  }
  // No telling names: by position in the bind pose.
  root.updateMatrixWorld(true);
  const p = new THREE.Vector3();
  const ys = bones.map(b => b.getWorldPosition(p).y);
  const lo = Math.min(...ys), hi = Math.max(...ys), h = hi - lo || 1;
  const hips = lo + 0.5 * h;
  bones.forEach((b, i) => {
    b.getWorldPosition(p);
    const y = ys[i]!;
    out.set(b.name, y < hips ? "legs" : y > lo + 0.86 * h ? "head" : Math.abs(p.x) > 0.12 * h ? "arms" : "spine");
  });
  return sanitized(out);
}

/** Keyed the way animation tracks name bones. */
const sanitized = (m: Map<string, Group>) => new Map([...m].map(([k, v]) => [THREE.PropertyBinding.sanitizeNodeName(k), v]));

export const inPart = (g: Group | undefined, part: BodyPart): boolean =>
  part === "upper" ? g === "spine" || g === "arms" || g === "head" : g === part;

/** A body part's bones, each after its parent (by track name). */
export function partBones(rig: MixRig, part: BodyPart): string[] {
  const depth = (b: string) => { let d = 0; for (let p = rig.parent.get(b); p; p = rig.parent.get(p)) d++; return d; };
  return [...rig.groups.keys()].filter(b => inPart(rig.groups.get(b), part)).sort((x, y) => depth(x) - depth(y));
}

/** Every bone, each after its parent. */
export function allBones(rig: MixRig): string[] {
  const depth = (b: string) => { let d = 0; for (let p = rig.parent.get(b); p; p = rig.parent.get(p)) d++; return d; };
  return [...rig.parent.keys()].sort((x, y) => depth(x) - depth(y));
}

const boneOf = (track: THREE.KeyframeTrack) => THREE.PropertyBinding.parseTrackName(track.name).nodeName;

/** A track repeated `n` times back to back (one loop = `len` seconds). */
function tile(track: THREE.KeyframeTrack, len: number, n: number): THREE.KeyframeTrack {
  if (n <= 1) return track.clone();
  const size = track.getValueSize();
  const times: number[] = [], values: number[] = [];
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < track.times.length; i++) {
      const t = track.times[i]! + k * len;
      if (times.length && t <= times[times.length - 1]! + 1e-6) continue;   // the seam key is already there
      times.push(t);
      for (let j = 0; j < size; j++) values.push(track.values[i * size + j]!);
    }
  }
  const T = track.constructor as new (name: string, times: number[], values: number[]) => THREE.KeyframeTrack;
  return new T(track.name, times, values);
}

/** A track stretched in time by `k`. */
function stretch(track: THREE.KeyframeTrack, k: number): THREE.KeyframeTrack {
  const t = track.clone();
  if (k !== 1) t.scale(k);
  return t;
}

const mixCache = new WeakMap<THREE.AnimationClip, Map<string, THREE.AnimationClip>>();

/**
 * The mixed clip: the base everywhere except the layers' body parts, each layer on its
 * part (a later layer wins where parts overlap). Loops line up: the result lasts a whole
 * number of base loops, and each layer is stretched (a little) to fill it, so neither
 * jumps at the seam. Cached per base + recipe.
 */
export function mixClip(name: string, base: THREE.AnimationClip, layers: Array<{ clip: THREE.AnimationClip; part: BodyPart }>, rig: MixRig): THREE.AnimationClip {
  const groups = rig.groups;
  const key = name + "|" + layers.map(l => `${l.clip.uuid}:${l.part}`).join(",");
  let byKey = mixCache.get(base);
  if (!byKey) { byKey = new Map(); mixCache.set(base, byKey); }
  const hit = byKey.get(key);
  if (hit) return hit;
  const B = base.duration || 1;
  const n = Math.max(1, ...layers.map(l => Math.round((l.clip.duration || B) / B)));
  const D = n * B;
  const owner = (bone: string): number => {   // index of the layer that drives this bone, -1 = base
    let who = -1;
    layers.forEach((l, i) => { if (inPart(groups.get(bone), l.part)) who = i; });
    return who;
  };
  const tracks: THREE.KeyframeTrack[] = [];
  for (const t of base.tracks) if (owner(boneOf(t)) === -1) tracks.push(tile(t, B, n));
  const layerTracks = layers.map(l => { const k = D / (l.clip.duration || D); return l.clip.tracks.map(t => stretch(t, k)); });
  layers.forEach((_, i) => { for (const t of layerTracks[i]!) if (owner(boneOf(t)) === i) tracks.push(t); });
  // Keep each layer facing the way it does in its own clip: the first bone of its part
  // (the spine above the hips, a shoulder, the neck) sits on a parent that now comes from
  // another clip, which may lean or turn differently (a run leans forward, so a punch on
  // top of it punched the ground). Re-aim that bone so the part keeps the rotation it has
  // in the layer's own clip, relative to the whole model.
  layers.forEach((_, i) => {
    for (const b of rig.groups.keys()) {
      const par = rig.parent.get(b);
      if (owner(b) !== i || par == null || owner(par) === i) continue;
      const fixed = reaim(b, D, rig, tracks, layerTracks[i]!);
      if (!fixed) continue;
      const at = tracks.findIndex(t => t.name === `${b}.quaternion`);
      if (at >= 0) tracks[at] = fixed; else tracks.push(fixed);
    }
  });
  const out = new THREE.AnimationClip(name, D, tracks);
  byKey.set(key, out);
  return out;
}

const REAIM_FPS = 30;

/** The bone's rotation track rebuilt so that (its parent's rotation in the mix) × (it)
 *  equals (its parent's rotation in the layer's clip) × (its rotation there). */
function reaim(bone: string, D: number, rig: MixRig, mixTracks: THREE.KeyframeTrack[], layerTracks: THREE.KeyframeTrack[]): THREE.KeyframeTrack | null {
  const sampler = (tracks: THREE.KeyframeTrack[]) => {
    const byBone = new Map<string, (t: number) => THREE.Quaternion>();
    for (const tr of tracks) {
      const p = THREE.PropertyBinding.parseTrackName(tr.name);
      if (p.propertyName !== "quaternion") continue;
      const it = tr.createInterpolant(), q = new THREE.Quaternion();
      byBone.set(p.nodeName, t => { const v = it.evaluate(t); return q.set(v[0]!, v[1]!, v[2]!, v[3]!).clone(); });
    }
    return (b: string, t: number) => byBone.get(b)?.(t) ?? rig.rest.get(b)?.clone() ?? new THREE.Quaternion();
  };
  const inMix = sampler(mixTracks), inLayer = sampler(layerTracks);
  if (!layerTracks.some(t => t.name === `${bone}.quaternion`)) return null;
  const chain: string[] = [];   // the parent, its parent … up to the top bone
  for (let b = rig.parent.get(bone) ?? null; b; b = rig.parent.get(b) ?? null) chain.push(b);
  const modelRot = (get: (b: string, t: number) => THREE.Quaternion, t: number) => {
    const q = new THREE.Quaternion();
    for (let i = chain.length - 1; i >= 0; i--) q.multiply(get(chain[i]!, t));
    return q;
  };
  const frames = Math.max(2, Math.ceil(D * REAIM_FPS));
  const times: number[] = [], values: number[] = [];
  for (let f = 0; f <= frames; f++) {
    const t = (D * f) / frames;
    const q = modelRot(inMix, t).invert().multiply(modelRot(inLayer, t)).multiply(inLayer(bone, t));
    times.push(t); values.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values);
}

/** The layers of a move, as clips (a layer whose clip isn't loaded is skipped). */
export function layerClips(layers: readonly MoveLayer[] | undefined, find: (clip: string, source?: string) => THREE.AnimationClip | null): Array<{ clip: THREE.AnimationClip; part: BodyPart }> {
  return (layers ?? []).flatMap(l => { const c = l.clip ? find(l.clip, l.source) : null; return c ? [{ clip: c, part: l.part }] : []; });
}
