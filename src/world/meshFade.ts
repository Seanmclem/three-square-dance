import * as THREE from "three";

/**
 * Material-opacity fades for spawn/despawn (Phase 53+). GLTF materials are
 * SHARED across instances of the same asset, so fading one in place would fade
 * every copy — each fade instead swaps in per-mesh clones for its duration and
 * restores the originals at the end. Self-driven on requestAnimationFrame;
 * preview:stop calls cancelAllFades() so no half-faded clone materials leak
 * into the editor.
 */

interface MatRec {
  mesh:        THREE.Mesh;
  original:    THREE.Material | THREE.Material[];
  clones:      THREE.Material[];
  baseOpacity: number[];
}

interface ActiveFade { cancel: () => void }

const active = new Map<THREE.Object3D, ActiveFade>();

/** Cancel every running fade, restoring original materials (visibility untouched). */
export function cancelAllFades(): void {
  for (const f of [...active.values()]) f.cancel();
  active.clear();
}

/**
 * Fade the meshes under `roots` out (opacity → 0) or in (0 → authored opacity)
 * over `duration` seconds, then restore original materials and call `onDone`.
 * A new fade on a root cancels a running one. Roots with no fadeable materials
 * (e.g. instancing proxies) complete immediately.
 */
export function fadeMeshes(
  roots: THREE.Object3D[],
  dir: "in" | "out",
  duration: number,
  onDone?: () => void,
): void {
  for (const r of roots) active.get(r)?.cancel();

  const recs: MatRec[] = [];
  for (const root of roots) {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!(m as { isMesh?: boolean }).isMesh && !(o as { isLine?: boolean }).isLine) return;
      if (!m.material) return;
      const arr    = Array.isArray(m.material) ? m.material : [m.material];
      const clones = arr.map((mat) => { const c = mat.clone(); c.transparent = true; return c; });
      recs.push({ mesh: m, original: m.material, clones, baseOpacity: arr.map((mat) => mat.opacity ?? 1) });
      m.material = Array.isArray(m.material) ? clones : clones[0]!;
    });
  }
  if (recs.length === 0) { onDone?.(); return; }

  const restore = () => {
    for (const rec of recs) {
      rec.mesh.material = rec.original;
      rec.clones.forEach((c) => c.dispose());
    }
    for (const r of roots) active.delete(r);
  };

  const t0 = performance.now();
  let raf = 0;
  const entry: ActiveFade = { cancel: () => { cancelAnimationFrame(raf); restore(); } };
  for (const r of roots) active.set(r, entry);

  const tick = () => {
    const t = Math.min(1, (performance.now() - t0) / (duration * 1000));
    const k = dir === "out" ? 1 - t : t;
    for (const rec of recs) rec.clones.forEach((c, i) => { c.opacity = rec.baseOpacity[i]! * k; });
    if (t >= 1) { restore(); onDone?.(); }
    else raf = requestAnimationFrame(tick);
  };
  tick();
}
