import * as THREE from "three";
import { assetManager } from "@/core/AssetManager";
import { BUILT_IN_MOVES, legacyGuess } from "./autoFill";
import type { CharacterDef, CharacterMove, LocomotionState, PlayerSettings } from "@/types";

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

/**
 * KEEP IN PLACE: a copy of `clip` whose top bones stay put sideways (X / Z pinned to the
 * first key; height kept, so jumps still rise), or the clip itself when nothing travels.
 * Root-motion exports (Quaternius's `_RM` files) walk the body 1.3 to 5.5 m per loop;
 * the engine moves the character, so the clip must not.
 */
export function keepInPlace(clip: THREE.AnimationClip, topBones: readonly string[]): THREE.AnimationClip {
  const cached = inPlaceCache.get(clip);
  if (cached) return cached;
  const names = new Set(topBones.map(b => `${THREE.PropertyBinding.sanitizeNodeName(b)}.position`));
  const travels = (t: THREE.KeyframeTrack) => {
    const v = t.values;
    for (let i = 3; i < v.length; i += 3) if (Math.hypot(v[i]! - v[0]!, v[i + 2]! - v[2]!) > IN_PLACE_MIN_TRAVEL) return true;
    return false;
  };
  let out = clip;
  if (clip.tracks.some(t => names.has(t.name) && travels(t))) {
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

/** Move name → clip for a character, over its loaded clip pool. */
export function moveResolver(def: Pick<CharacterDef, "moves" | "inPlace">, pool: readonly PooledClip[], topBones: readonly string[]): (move: string) => THREE.AnimationClip | null {
  return move => {
    const m: CharacterMove | undefined = def.moves[move];
    if (!m?.clip) return null;
    const hit = pool.find(p => p.clip.name === m.clip && (!m.source || p.source === m.source));
    if (!hit) return null;
    return def.inPlace === false ? hit.clip : keepInPlace(hit.clip, topBones);
  };
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
