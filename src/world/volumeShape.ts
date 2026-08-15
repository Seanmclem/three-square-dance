import * as THREE from "three";
import type { TriggerVolume, Vec3 } from "@/types";

// Shape helpers shared by the trigger-volume editor visuals (ZoneManager), the
// AABB pick test (TriggerVolumeTool), and anything needing a volume's true
// world-space extents. Size encoding matches AttachedCollider: box = full
// extents; sphere: x = radius; cylinder/capsule: x = radius, y = full height.
// position stays the XZ center + Y BOTTOM for every shape.

/** Full world-space bounding extents of a volume, honoring its shape. */
export function volumeExtents(vol: TriggerVolume): Vec3 {
  switch (vol.shape ?? "box") {
    case "sphere":   { const d = vol.size.x * 2; return { x: d, y: d, z: d }; }
    case "cylinder":
    case "capsule":  { const d = vol.size.x * 2; return { x: d, y: vol.size.y, z: d }; }
    default:         return { x: vol.size.x, y: vol.size.y, z: vol.size.z };
  }
}

/** Geometry for the volume body, centered on the volume's center point.
 *  `inset` shrinks every extent slightly (interior-fill z-fight guard). */
export function volumeGeometry(vol: TriggerVolume, inset = 0): THREE.BufferGeometry {
  const dim = (n: number) => Math.max(0.05, n - inset);
  switch (vol.shape ?? "box") {
    case "sphere":
      return new THREE.SphereGeometry(dim(vol.size.x * 2) / 2, 24, 16);
    case "cylinder": {
      const r = dim(vol.size.x * 2) / 2;
      return new THREE.CylinderGeometry(r, r, dim(vol.size.y), 24);
    }
    case "capsule": {
      const r = dim(vol.size.x * 2) / 2;
      // CapsuleGeometry's length is the cylindrical mid-section; total = length + 2r.
      return new THREE.CapsuleGeometry(r, Math.max(0.01, dim(vol.size.y) - 2 * r), 4, 16);
    }
    default:
      return new THREE.BoxGeometry(dim(vol.size.x), dim(vol.size.y), dim(vol.size.z));
  }
}
