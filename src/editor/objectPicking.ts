import * as THREE from "three";

export interface ObjectBoxHit {
  root:     THREE.Object3D;   // the object's root group (carries editorId/editorType)
  distance: number;           // world distance from the ray origin to the box entry point
  point:    THREE.Vector3;    // world-space entry point
}

const _inv     = new THREE.Matrix4();
const _local   = new THREE.Ray();
const _box     = new THREE.Box3();
const _entry   = new THREE.Vector3();
const _half    = new THREE.Vector3();
const _center  = new THREE.Vector3();

function isChainVisible(obj: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = obj;
  while (node) {
    if (!node.visible) return false;
    node = node.parent;
  }
  return true;
}

/**
 * Generous object picking: ray-test each placed object's cached model AABB
 * (stashed as `userData.localAABB` by ObjectPlacer) as an oriented box in world
 * space. Low-poly props are full of gaps (between an animal's legs, under a
 * table top), so precise triangle raycasts frequently thread through them and
 * hit whatever is behind — a click inside the object's box should count as
 * clicking the object unless something else is genuinely closer.
 *
 * Returns hits sorted nearest-first.
 */
export function castObjectBoxes(ray: THREE.Ray, scene: THREE.Scene): ObjectBoxHit[] {
  const hits: ObjectBoxHit[] = [];
  scene.traverse(root => {
    const ud = root.userData;
    if (ud["editorType"] !== "object" || ud["_parentId"] || !ud["selectable"]) return;
    const aabb = ud["localAABB"] as { center: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } | undefined;
    if (!aabb || !isChainVisible(root)) return;

    // Ray into the object's local (pre-transform) space; slab-test the cached AABB.
    _inv.copy(root.matrixWorld).invert();
    _local.copy(ray).applyMatrix4(_inv);
    _center.set(aabb.center.x, aabb.center.y, aabb.center.z);
    _half.set(aabb.size.x / 2, aabb.size.y / 2, aabb.size.z / 2);
    _box.set(_center.clone().sub(_half), _center.clone().add(_half));
    if (!_local.intersectBox(_box, _entry)) return;

    // Back to world space for a distance comparable with real mesh hits.
    const world = _entry.clone().applyMatrix4(root.matrixWorld);
    hits.push({ root, distance: ray.origin.distanceTo(world), point: world });
  });
  return hits.sort((a, b) => a.distance - b.distance);
}
