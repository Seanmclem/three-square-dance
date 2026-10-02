import * as THREE from "three";
import { ShapeBuilder } from "@/builders/ShapeBuilder";
import { weld, type PrintMesh } from "@/editor/printExport";
import type { ShapeDef } from "@/types";

/** The shapes' surfaces as one welded mesh in world space (editor frame: meters, Y up). */
export function shapesToPrintMesh(shapes: ShapeDef[]): PrintMesh {
  const tris: number[][] = [];
  const v = new THREE.Vector3();
  for (const s of shapes) {
    const geo = ShapeBuilder.buildLocalGeometry(s, 1);
    const D2R = Math.PI / 180;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(s.position.x, s.position.y, s.position.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(s.rotation.x * D2R, s.rotation.y * D2R, s.rotation.z * D2R, "XYZ")),
      new THREE.Vector3(1, 1, 1),
    );
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const index = geo.getIndex();
    const count = index ? index.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      const t: number[] = [];
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(pos, index ? index.getX(i + k) : i + k).applyMatrix4(m);
        t.push(v.x, v.y, v.z);
      }
      tris.push(t);
    }
    geo.dispose();
  }
  return weld(tris);
}
