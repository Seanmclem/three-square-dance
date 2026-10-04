import * as THREE from "three";
import type { RigInfo } from "@/types";

/** FNV-1a, 32-bit, as 8 hex digits: a short, stable id for a skeleton's bone names. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

/**
 * Phase 86: a model's skeleton, for matching animation files to models. Two models
 * with the same bone names (the Universal Animation Library files and both mannequins)
 * get the same `id`, and clips from one play on the other: three.js binds a clip's
 * tracks by bone name. `height` = the model's height in its own units (bind pose).
 * Null for a model with no skinned mesh (no skeleton, nothing to animate by bone).
 */
export function rigInfo(root: THREE.Object3D): RigInfo | null {
  const names = new Set<string>();
  root.traverse(o => {
    const sk = (o as THREE.SkinnedMesh).isSkinnedMesh ? (o as THREE.SkinnedMesh).skeleton : null;
    sk?.bones.forEach(b => names.add(b.name));
  });
  if (!names.size) return null;
  const bones = [...names].sort();
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const height = box.isEmpty() ? 0 : Math.round((box.max.y - box.min.y) * 100) / 100;
  return { id: hash(bones.join("|")), bones, height };
}

/** How much of `library`'s skeleton the model has (0..1), and which bones are missing. */
export function rigOverlap(model: RigInfo, library: RigInfo): { share: number; missing: string[] } {
  if (model.id === library.id) return { share: 1, missing: [] };
  const have = new Set(model.bones);
  const missing = library.bones.filter(b => !have.has(b));
  return { share: library.bones.length ? 1 - missing.length / library.bones.length : 0, missing };
}
