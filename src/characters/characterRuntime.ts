import * as THREE from "three";
import { assetManager } from "@/core/AssetManager";
import { BUILT_IN_MOVES, legacyGuess } from "./autoFill";
import { layerClips, mixClip, type MixRig } from "./mix";
import type { AimPoses } from "./partLayers";
import type { CharacterDef, CharacterMove, LocomotionState, PlayerFeel, PlayerSettings } from "@/types";

/**
 * Phase 86: loading a character: its model plus the clips it borrows from other files
 * (same skeleton), and turning its moves into clips for the CharacterAnimator.
 */

export interface PooledClip { clip: THREE.AnimationClip; source: string }
export interface LoadedCharacter { scene: THREE.Object3D; pool: PooledClip[] }

/** The model's scene (the cached source; clone it before use) and every clip the
 *  character can use: the model's own first, then each clip source in order. A clip
 *  source that fails to load is skipped with a note. */
export async function loadCharacter(def: Pick<CharacterDef, "modelAssetId" | "clipSources">): Promise<LoadedCharacter> {
  const own = await assetManager.loadGLTF(def.modelAssetId) as { scene: THREE.Object3D; animations?: THREE.AnimationClip[] };
  const pool: PooledClip[] = (own.animations ?? []).map(clip => ({ clip, source: def.modelAssetId }));
  for (const source of def.clipSources) {
    if (source === def.modelAssetId) continue;
    try {
      const g = await assetManager.loadGLTF(source) as { animations?: THREE.AnimationClip[] };
      pool.push(...(g.animations ?? []).map(clip => ({ clip, source })));
    } catch (err) {
      console.warn(`[characters] couldn't load clips from "${source}"`, err);
    }
  }
  return { scene: own.scene, pool };
}

/** Names of the skeleton's top bones (bones whose parent isn't a bone): the ones whose
 *  sideways travel KEEP IN PLACE pins. */
export function topBoneNames(root: THREE.Object3D): string[] {
  const out: string[] = [];
  root.traverse(o => { if ((o as THREE.Bone).isBone && !(o.parent as THREE.Bone | null)?.isBone) out.push(o.name); });
  return out;
}

const IN_PLACE_MIN_TRAVEL = 0.2;   // m: less sideways root travel than this is left alone
const inPlaceCache = new WeakMap<THREE.AnimationClip, THREE.AnimationClip>();

function rootTrackNames(topBones: readonly string[]): Set<string> {
  return new Set(topBones.map(b => `${THREE.PropertyBinding.sanitizeNodeName(b)}.position`));
}

/** Does `clip` move the body sideways (a top bone travels more than 0.2 m)? */
export function clipTravels(clip: THREE.AnimationClip, topBones: readonly string[]): boolean {
  const names = rootTrackNames(topBones);
  return clip.tracks.some(t => {
    if (!names.has(t.name)) return false;
    const v = t.values;
    for (let i = 3; i < v.length; i += 3) if (Math.hypot(v[i]! - v[0]!, v[i + 2]! - v[2]!) > IN_PLACE_MIN_TRAVEL) return true;
    return false;
  });
}

/**
 * KEEP IN PLACE: a copy of `clip` whose top bones stay put sideways (X / Z pinned to the
 * first key; height kept, so jumps still rise), or the clip itself when nothing travels.
 * Root-motion exports (Quaternius's `_RM` files) walk the body 1.3 to 5.5 m per loop;
 * the engine moves the character, so the clip must not.
 */
export function keepInPlace(clip: THREE.AnimationClip, topBones: readonly string[]): THREE.AnimationClip {
  const cached = inPlaceCache.get(clip);
  if (cached) return cached;
  const names = rootTrackNames(topBones);
  let out = clip;
  if (clipTravels(clip, topBones)) {
    out = clip.clone();
    for (const t of out.tracks) {
      if (!names.has(t.name)) continue;
      const v = t.values;
      for (let i = 3; i < v.length; i += 3) { v[i] = v[0]!; v[i + 2] = v[2]!; }
    }
  }
  inPlaceCache.set(clip, out);
  return out;
}

/** Move name → clip for a character, over its loaded clip pool. A move with layers
 *  (Phase 87) plays one mixed clip, built once; `groups` sorts the bones into body parts. */
export function moveResolver(def: Pick<CharacterDef, "moves" | "inPlace">, pool: readonly PooledClip[], topBones: readonly string[], rig?: MixRig): (move: string) => THREE.AnimationClip | null {
  const find = (clip: string, source?: string) => {
    const hit = pool.find(p => p.clip.name === clip && (!source || p.source === source));
    if (!hit) return null;
    return def.inPlace === false ? hit.clip : keepInPlace(hit.clip, topBones);
  };
  return move => {
    const m: CharacterMove | undefined = def.moves[move];
    if (!m?.clip) return null;
    const base = find(m.clip, m.source);
    if (!base || !m.layers?.length || !rig) return base;
    const layers = layerClips(m.layers, find);
    return layers.length ? mixClip(`mix:${move}`, base, layers, rig) : base;
  };
}

/** Phase 88: the character's aim poses as clips, or null (none set / not loaded: the spine
 *  turns instead). */
export function aimPosesOf(def: Pick<CharacterDef, "aim" | "inPlace">, pool: readonly PooledClip[]): AimPoses | null {
  const a = def.aim;
  const find = (r?: { clip: string; source?: string }) => r?.clip ? pool.find(p => p.clip.name === r.clip && (!r.source || p.source === r.source))?.clip ?? null : null;
  const up = find(a?.up), neutral = find(a?.neutral), down = find(a?.down);
  return up && neutral && down ? { up, neutral, down, part: a?.part ?? "upper", upDeg: a?.upDeg ?? 60, downDeg: a?.downDeg ?? 60 } : null;
}

/** A move's handoff time into another (Phase 87), else undefined (the caller's default). */
export function handoffOf(def: Pick<CharacterDef, "handoffs">, from: string, to: string): number | undefined {
  const h = def.handoffs?.[`${from}>${to}`];
  return h != null && h >= 0 ? h : undefined;
}

/**
 * The character a player had before Phase 86, built from its settings: the model, the
 * per-game ANIMATIONS overrides (null = none, a name = that clip) and, for the rest, the
 * old name guess (exact, then "contains"). Clips untouched (no KEEP IN PLACE), so games
 * play exactly as before until a real character is chosen.
 */
export function legacyCharacter(settings: PlayerSettings, clipNames: readonly string[]): CharacterDef {
  const moves: Record<string, CharacterMove> = {};
  for (const move of BUILT_IN_MOVES) {
    if (move === "fall") continue;   // older players never had a fall: walking off a ledge stays as it was
    const override = settings.animClips?.[move as LocomotionState];
    moves[move] = { clip: override === null ? null : override ? override : legacyGuess(move, clipNames) };
  }
  return { id: "__legacy__", name: "Player", modelAssetId: settings.modelAssetId ?? "", clipSources: [], moves, inPlace: false };
}

/** The player's character: the game's one named by `characterId`, else null (the older
 *  settings describe the player). */
export function characterFor(settings: PlayerSettings, characters: readonly CharacterDef[] | undefined): CharacterDef | null {
  return (settings.characterId && characters?.find(c => c.id === settings.characterId)) || null;
}

/** The capsule's full height at character scale 1 (2 × (half height 0.6 + radius 0.3)). */
export const CAPSULE_HEIGHT = 1.8;

/** The model's height in its own units (bind pose, before any character scale). */
export function modelHeight(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  return box.isEmpty() ? 0 : box.max.y - box.min.y;
}

/**
 * Change a character's model. Same skeleton: every move keeps its clip (the old model's
 * own clips are now borrowed from it, so it joins the files; the new model leaves them).
 * Different skeleton: borrowed files can't play on it, so they go, and a move keeps its
 * clip only when the new model has a clip of that name. Everything else stays (name,
 * height in meters, colors by material name, sounds, FEEL, move speeds).
 */
export function swapCharacterModel(def: CharacterDef, newId: string, o: { sameSkeleton: boolean; oldClips: readonly string[]; newClips: readonly string[] }): CharacterDef {
  const old = def.modelAssetId;
  if (o.sameSkeleton) {
    const borrowOld = o.oldClips.length > 0;
    const keep = <T extends { clip: string | null; source?: string }>(m: T): T => {
      if (m.source === newId) { const { source: _s, ...rest } = m; return rest as T; }
      if (!m.source && m.clip && borrowOld && o.oldClips.includes(m.clip)) return { ...m, source: old };
      return m;
    };
    const moves = Object.fromEntries(Object.entries(def.moves).map(([k, m]) =>
      [k, m.layers ? { ...keep(m), layers: m.layers.map(keep) } : keep(m)]));
    const clipSources = [...new Set([...(borrowOld ? [old] : []), ...def.clipSources])].filter(s => s !== newId);
    const aim = def.aim && { ...def.aim, ...Object.fromEntries((["up", "neutral", "down"] as const).filter(k => def.aim![k]).map(k => [k, keep(def.aim![k]!)])) };
    return { ...def, modelAssetId: newId, clipSources, moves, ...(aim ? { aim } : {}) };
  }
  const moves = Object.fromEntries(Object.entries(def.moves).map(([k, m]) => {
    const { source: _s, layers, ...rest } = m;
    const keeps = !!m.clip && o.newClips.includes(m.clip);   // the new model's own clip of that name
    const kept = layers?.filter(l => o.newClips.includes(l.clip)).map(({ source: _ls, ...l }) => l);
    return [k, { ...(keeps ? rest : { ...rest, clip: null }), ...(kept?.length ? { layers: kept } : {}) }];
  }));
  const aim = def.aim && Object.fromEntries(Object.entries(def.aim).flatMap(([k, v]): Array<[string, unknown]> =>
    typeof v === "object" ? (o.newClips.includes(v.clip) ? [[k, { clip: v.clip }]] : []) : [[k, v]])) as CharacterDef["aim"];
  return { ...def, modelAssetId: newId, clipSources: [], moves, ...(aim ? { aim } : {}) };
}

/** The moves that lose their clip when swapping to a model with a different skeleton. */
export function movesLostBySwap(def: CharacterDef, newId: string, newClips: readonly string[]): string[] {
  const after = swapCharacterModel(def, newId, { sameSkeleton: false, oldClips: [], newClips });
  return Object.keys(def.moves).filter(k => def.moves[k]!.clip && !after.moves[k]!.clip);
}

/** A move's playback rate (its SPEED, 1 when unset). */
export function moveSpeedOf(def: Pick<CharacterDef, "moves">, move: string): number {
  const s = def.moves[move]?.speed;
  return s && s > 0 ? s : 1;
}

/** The rate for a clip played by name (enemy AI, scripts): the SPEED of the first move set
 *  to that clip that has one, else 1. */
export function clipSpeedOf(def: Pick<CharacterDef, "moves">, clipName: string): number {
  const m = Object.values(def.moves).find(x => x.clip === clipName && x.speed && x.speed > 0);
  return m?.speed ?? 1;
}

/**
 * The player settings with the character's own sounds and FEEL laid over them: each sound
 * slot the character sets replaces the game's (footstep = sound + volume + variants +
 * wobble; jump; land; stride); a FEEL switch is off when either turns it off.
 */
export function playerSettingsWithCharacter(settings: PlayerSettings, def: Pick<CharacterDef, "sounds" | "feel">): PlayerSettings {
  const s = def.sounds ?? {};
  const out: PlayerSettings = { ...settings };
  if (s.footstepSound) {
    out.footstepSound = s.footstepSound; out.footstepVolume = s.footstepVolume;
    out.footstepVariants = s.footstepVariants; out.footstepPitchWobble = s.footstepPitchWobble;
  }
  if (s.jumpSound) { out.jumpSound = s.jumpSound; out.jumpVolume = s.jumpVolume; }
  if (s.landSound) { out.landSound = s.landSound; out.landVolume = s.landVolume; }
  if (s.footstepDistance) out.footstepDistance = s.footstepDistance;
  const cf = def.feel;
  if (cf && Object.values(cf).some(v => v === false)) {
    const feel: PlayerFeel = { ...settings.feel };
    for (const k of Object.keys(cf) as (keyof PlayerFeel)[]) if (cf[k] === false) feel[k] = false;
    out.feel = feel;
  }
  return out;
}

/**
 * A character's look on a fresh model clone: its colors (each named material cloned, so
 * the cached source asset is never touched) and the scale that makes the model `height`
 * tall (1 when no height is set). The caller multiplies its own scale by the result.
 */
export function applyCharacterLook(root: THREE.Object3D, def: Pick<CharacterDef, "colors" | "height">, measuredHeight = modelHeight(root)): number {
  const colors = def.colors ?? {};
  if (Object.keys(colors).length) {
    const clones = new Map<THREE.Material, THREE.Material>();
    root.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const swap = (m: THREE.Material) => {
        const c = colors[m.name];
        if (!c) return m;
        let k = clones.get(m);
        if (!k) { k = m.clone(); (k as THREE.MeshStandardMaterial).color?.set(c); clones.set(m, k); }
        return k;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });
  }
  return def.height && measuredHeight > 0 ? def.height / measuredHeight : 1;
}

/** Material names on a model (for the colors list), in first-seen order. */
export function materialNames(root: THREE.Object3D): string[] {
  const out: string[] = [];
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (m.name && !out.includes(m.name)) out.push(m.name);
  });
  return out;
}

/** The base color of each named material, as #rrggbb (for the color pickers' start values). */
export function materialColors(root: THREE.Object3D): Record<string, string> {
  const out: Record<string, string> = {};
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const c = (m as THREE.MeshStandardMaterial).color;
      if (m.name && c && !(m.name in out)) out[m.name] = `#${c.getHexString()}`;
    }
  });
  return out;
}
