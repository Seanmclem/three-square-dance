import * as THREE from "three";
import type { AttachedCollider, Vec3, WorldObject } from "@/types";

/** Quaternion as plain numbers — consumable by both Rapier and THREE. */
export interface Quat { x: number; y: number; z: number; w: number }

export interface ColliderWorldTransform {
  pos:  Vec3;   // world-space center of the collider shape
  quat: Quat;   // world-space orientation
  /** box: half extents; sphere: x = radius; capsule: x = radius, y = half height (cylindrical part). */
  halfExtents: Vec3;
}

const DEG2RAD = Math.PI / 180;

/** Default auto-fit box collider from a model's local-space AABB. */
export function defaultColliderFromAABB(center: Vec3, size: Vec3): AttachedCollider {
  return {
    id:       "col_auto",
    shape:    "box",
    offset:   { x: center.x, y: center.y, z: center.z },
    size:     { x: size.x, y: size.y, z: size.z },
    isSensor: false,
  };
}

/**
 * World transform + Rapier-ready half extents for an attached collider.
 *
 * Scale is applied in the collider's LOCAL frame (offsets and box extents scale
 * componentwise) — exact for axis-aligned colliders; an approximation when
 * rotationY ≠ 0 under non-uniform object scale. Sphere/capsule radii use the
 * max relevant scale axis so the shape never shrinks inside the visual mesh.
 */
export function colliderWorldTransform(obj: WorldObject, c: AttachedCollider): ColliderWorldTransform {
  const s = obj.scale;
  const objQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    obj.rotation.x * DEG2RAD, obj.rotation.y * DEG2RAD, obj.rotation.z * DEG2RAD,
  ));

  const worldOffset = new THREE.Vector3(c.offset.x * s.x, c.offset.y * s.y, c.offset.z * s.z)
    .applyQuaternion(objQuat);
  const pos: Vec3 = {
    x: obj.position.x + worldOffset.x,
    y: obj.position.y + worldOffset.y,
    z: obj.position.z + worldOffset.z,
  };

  const yaw = (c.rotationY ?? 0) * DEG2RAD;
  const quat = objQuat.clone();
  if (yaw && c.shape !== "sphere")
    quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));

  let halfExtents: Vec3;
  if (c.shape === "box") {
    halfExtents = {
      x: Math.abs((c.size.x / 2) * s.x),
      y: Math.abs((c.size.y / 2) * s.y),
      z: Math.abs((c.size.z / 2) * s.z),
    };
  } else if (c.shape === "sphere") {
    const r = c.size.x * Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z));
    halfExtents = { x: r, y: r, z: r };
  } else {
    const r = c.size.x * Math.max(Math.abs(s.x), Math.abs(s.z));
    // Rapier capsules are half-height of the cylindrical section; keep total height = size.y.
    const halfH = Math.max(0.01, (c.size.y * Math.abs(s.y)) / 2 - r);
    halfExtents = { x: r, y: halfH, z: r };
  }

  return { pos, quat: { x: quat.x, y: quat.y, z: quat.z, w: quat.w }, halfExtents };
}
