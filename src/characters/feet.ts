import * as THREE from "three";

/**
 * Phase 87: when a clip's feet are on the ground. Plays the clip on a spare copy of the
 * model (never the one on screen), samples each foot's height, and reads:
 *  - contacts: the stretches of the loop where a foot is down,
 *  - touchdowns: the moment each one starts (footstep sounds play there),
 *  - groundSpeed: how fast a planted foot slides backward under the body, i.e. the speed
 *    the clip "walks" at (meters per second at the copy's scale). Played at
 *    groundSpeed × rate, the feet stay planted.
 * Cached per clip and copy scale. Null when the model has no feet we can find.
 */
export interface FootInfo {
  duration: number;
  feet: Array<{ name: string; contacts: Array<[number, number]>; touchdowns: number[] }>;
  groundSpeed: number | null;   // null: the feet never slide back (an idle, a jump)
}

const MIN_SAMPLES = 72, PER_SECOND = 60;   // read the loop at least this finely
const cache = new WeakMap<THREE.AnimationClip, Map<THREE.Object3D, FootInfo | null>>();

/** The left and right foot bones: by name (foot / ankle, with a side), else the lowest
 *  bone on each side in the bind pose. */
export function footBones(root: THREE.Object3D): THREE.Bone[] {
  const bones: THREE.Bone[] = [];
  root.traverse(o => { if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone); });
  const side = (n: string): "l" | "r" | null =>
    /(^|[^a-z])(l|left)([^a-z]|$)|left/i.test(n) ? "l" : /(^|[^a-z])(r|right)([^a-z]|$)|right/i.test(n) ? "r" : null;
  const named = bones.filter(b => /foot|ankle/i.test(b.name) && !/toe|ball|end|tip|ik|pole|target/i.test(b.name));
  const l = named.find(b => side(b.name) === "l"), r = named.find(b => side(b.name) === "r");
  if (l && r) return [l, r];
  root.updateMatrixWorld(true);
  const p = new THREE.Vector3();
  const lowest = (want: (x: number) => boolean) => {
    let best: THREE.Bone | null = null, y = Infinity;
    for (const b of bones) { b.getWorldPosition(p); if (want(p.x) && p.y < y) { y = p.y; best = b; } }
    return best;
  };
  const a = lowest(x => x > 0.01), b = lowest(x => x < -0.01);
  return a && b ? [a, b] : [];
}

/**
 * Analyse `clip` on `sample` (a spare copy of the model at the scale it plays at, not in
 * the scene). The copy's own pose is left at the clip's start.
 */
export function footInfo(clip: THREE.AnimationClip, sample: THREE.Object3D): FootInfo | null {
  let byRoot = cache.get(clip);
  if (!byRoot) { byRoot = new Map(); cache.set(clip, byRoot); }
  if (byRoot.has(sample)) return byRoot.get(sample)!;
  const info = analyse(clip, sample);
  byRoot.set(sample, info);
  return info;
}

/** A foot grazing the floor for a moment isn't a step: gaps of up to `gap` samples inside
 *  a contact are closed, then contacts of `blip` samples or fewer are dropped (the loop wraps). */
const GAP_S = 0.05, BLIP_S = 0.04;   // seconds
function debounce(down: boolean[], gap: number, blip: number): boolean[] {
  const n = down.length, out = [...down];
  const runs = (want: boolean) => {   // [start, length] of each run of `want`, wrapping
    const r: Array<[number, number]> = [];
    if (out.every(v => v === want)) return r;
    let i = out.findIndex(v => v !== want);
    for (let c = 0; c < n; c++, i = (i + 1) % n) {
      if (out[i] !== want || out[(i - 1 + n) % n] === want) continue;
      let len = 0; while (out[(i + len) % n] === want && len < n) len++;
      r.push([i, len]);
    }
    return r;
  };
  for (const [s, len] of runs(false)) if (len <= gap) for (let j = 0; j < len; j++) out[(s + j) % n] = true;
  for (const [s, len] of runs(true)) if (len <= blip) for (let j = 0; j < len; j++) out[(s + j) % n] = false;
  return out;
}

/** Each foot's chain (the foot bone and what hangs below it: ball, toes). The lowest of
 *  them is the part touching the ground (the heel at touchdown, the toes at push-off). */
function footChains(feet: THREE.Bone[]): THREE.Object3D[][] {
  return feet.map(f => { const c: THREE.Object3D[] = []; f.traverse(o => { if ((o as THREE.Bone).isBone) c.push(o); }); return c; });
}

/** The floor: where the feet rest in the model's own pose, read once per copy before any
 *  clip moves it. */
const floorCache = new WeakMap<THREE.Object3D, number>();

function analyse(clip: THREE.AnimationClip, sample: THREE.Object3D): FootInfo | null {
  const feet = footBones(sample);
  if (feet.length !== 2 || clip.duration <= 0) return null;
  const chains = footChains(feet);
  const inv = new THREE.Matrix4(), p = new THREE.Vector3();
  // Lowest point of a chain, in the copy's own space at its scale.
  const lowest = (chain: THREE.Object3D[]): THREE.Vector3 => {
    let best: THREE.Vector3 | null = null;
    for (const o of chain) { o.getWorldPosition(p); const v = p.clone().applyMatrix4(inv).multiply(sample.scale); if (!best || v.y < best.y) best = v; }
    return best!;
  };
  let height = 0;
  if (!floorCache.has(sample)) {
    sample.updateMatrixWorld(true);
    inv.copy(sample.matrixWorld).invert();
    floorCache.set(sample, Math.min(...chains.map(c => lowest(c).y)));
  }
  const floor = floorCache.get(sample)!;
  { const box = new THREE.Box3().setFromObject(sample); height = box.max.y - box.min.y; }
  const mixer = new THREE.AnimationMixer(sample);
  const action = mixer.clipAction(clip);
  action.play();
  const pos: THREE.Vector3[][] = feet.map(() => []);
  const ank: THREE.Vector3[][] = feet.map(() => []);
  const SAMPLES = Math.max(MIN_SAMPLES, Math.ceil(clip.duration * PER_SECOND));
  for (let i = 0; i < SAMPLES; i++) {
    action.time = (clip.duration * i) / SAMPLES;
    mixer.update(0);
    sample.updateMatrixWorld(true);
    inv.copy(sample.matrixWorld).invert();
    chains.forEach((c, k) => pos[k]!.push(lowest(c)));
    feet.forEach((f, k) => { f.getWorldPosition(p); ank[k]!.push(p.clone().applyMatrix4(inv).multiply(sample.scale)); });
  }
  action.stop(); mixer.uncacheRoot(sample);
  const dt = clip.duration / SAMPLES;
  const tol = Math.max(0.02, 0.03 * (height || 1.8));
  const speeds: number[] = [];
  const out: FootInfo = { duration: clip.duration, feet: [], groundSpeed: null };
  feet.forEach((f, k) => {
    const ps = pos[k]!;
    const down = debounce(ps.map(v => v.y < floor + tol), Math.round(GAP_S / dt), Math.round(BLIP_S / dt));
    if (down.every(Boolean) || !down.some(Boolean)) {   // never lifts (standing) or never lands (in the air)
      out.feet.push({ name: f.name, contacts: down[0] ? [[0, clip.duration]] : [], touchdowns: [] });
      return;
    }
    const contacts: Array<[number, number]> = [], touchdowns: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      if (!down[i] || down[(i - 1 + SAMPLES) % SAMPLES]) continue;   // a touchdown starts here
      let j = i;
      while (down[(j + 1) % SAMPLES] && j - i < SAMPLES) j++;
      touchdowns.push(i * dt);
      contacts.push([i * dt, ((j + 1) % SAMPLES) * dt]);
      // How fast the planted foot moves back under the body: the ankle (the lowest point
      // jumps from heel to toe mid-step), skipping the touchdown and push-off samples.
      for (let s = i + 1; s < j - 1; s++) {
        const a = ank[k]![s % SAMPLES]!, b = ank[k]![(s + 1) % SAMPLES]!;
        speeds.push(Math.hypot(b.x - a.x, b.z - a.z) / dt);
      }
    }
    out.feet.push({ name: f.name, contacts, touchdowns });
  });
  if (speeds.length >= 4) {
    speeds.sort((a, b) => a - b);
    const med = speeds[Math.floor(speeds.length / 2)]!;
    out.groundSpeed = med > 0.05 ? med : null;
  }
  return out;
}
