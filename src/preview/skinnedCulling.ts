import * as THREE from "three";

// Skinned meshes frustum-cull against their BIND-POSE bounding sphere, which doesn't follow the
// animated bones — so an animation that moves verts far from it (a death pose lying flat, a big
// reach) makes submeshes pop out as the camera moves. Rather than disable culling entirely
// (characters then render + cast shadows even off-screen), re-enable it but PAD the bounding
// sphere so it comfortably covers the animation range.
//
// Idempotent: computeBoundingSphere() recomputes from the bind pose each call, so re-running this
// on shared/cloned geometry (SkeletonUtils.clone shares geometry across instances) never compounds
// the padding.
const SKINNED_CULL_PAD = 2;

export function enablePaddedSkinnedCulling(root: THREE.Object3D): void {
  root.traverse(c => {
    const sm = c as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh) return;
    sm.geometry.computeBoundingSphere();
    if (sm.geometry.boundingSphere) sm.geometry.boundingSphere.radius *= SKINNED_CULL_PAD;
    sm.frustumCulled = true;
  });
}
