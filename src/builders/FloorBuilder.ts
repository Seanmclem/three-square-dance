import * as THREE from "three";
import { ColliderBuilder } from "@/physics/ColliderBuilder";
import { assetManager } from "@/core/AssetManager";
import type { FloorDef, MeshUserData } from "@/types";
import type RAPIER from "@dimforge/rapier3d-compat";

export interface FloorBuildOutput {
  mesh:     THREE.Mesh;
  collider: RAPIER.Collider;
}

export class FloorBuilder {
  static async build(
    floor: FloorDef,
    _bounds: { x: number; z: number; width: number; depth: number },
    zoneId: string,
    levelIndex = 0,
  ): Promise<FloorBuildOutput> {
    const pts  = floor.floorMesh.points ?? [];
    const yBase = floor.elevation + 0.004 + 0.001 * levelIndex;

    const ovr       = floor.materialOverrides;
    const baseDef   = assetManager.getMaterialDef(floor.floorMesh.material);
    const tileScale = ovr?.tileScale ?? baseDef?.tileScale ?? 1.0;
    const tileX     = ovr?.tileScaleX ?? tileScale;
    const tileY     = ovr?.tileScaleY ?? tileScale;
    const dispEnabled = ovr?.maps?.displacement?.enabled
      ?? baseDef?.maps.displacement.enabled
      ?? false;

    let geo: THREE.BufferGeometry;
    let colliderBounds: { x: number; z: number; width: number; depth: number };

    if (floor.floorMesh.shape === "polygon" && pts.length >= 3) {
      const shape = new THREE.Shape();
      shape.moveTo(pts[0]!.x, pts[0]!.z);
      for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i]!.x, pts[i]!.z);
      shape.closePath();

      const shapeGeo = new THREE.ShapeGeometry(shape);
      // ShapeGeometry is in XY — remap to XZ plane
      const pos = shapeGeo.attributes["position"] as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i);
        const py = pos.getY(i);
        pos.setXYZ(i, px, yBase, py);
      }
      pos.needsUpdate = true;
      shapeGeo.computeVertexNormals();

      const uvAttr = shapeGeo.attributes["uv"] as THREE.BufferAttribute;
      const minX = Math.min(...pts.map(p => p.x));
      const minZ = Math.min(...pts.map(p => p.z));
      const szW  = Math.max(...pts.map(p => p.x)) - minX;
      const szD  = Math.max(...pts.map(p => p.z)) - minZ;
      for (let i = 0; i < uvAttr.count; i++) {
        uvAttr.setXY(i, uvAttr.getX(i) * szW * tileX, uvAttr.getY(i) * szD * tileY);
      }
      shapeGeo.setAttribute('uv2', shapeGeo.attributes.uv);
      geo = shapeGeo;

      const bMinX = Math.min(...pts.map(p => p.x));
      const bMinZ = Math.min(...pts.map(p => p.z));
      colliderBounds = { x: bMinX, z: bMinZ, width: szW, depth: szD };
    } else {
      // Rect
      const minX = Math.min(...pts.map(p => p.x));
      const maxX = Math.max(...pts.map(p => p.x));
      const minZ = Math.min(...pts.map(p => p.z));
      const maxZ = Math.max(...pts.map(p => p.z));
      const w = maxX - minX;
      const d = maxZ - minZ;
      const cx = minX + w / 2;
      const cz = minZ + d / 2;

      const segW = dispEnabled ? Math.max(1, Math.ceil(w * 4)) : 1;
      const segD = dispEnabled ? Math.max(1, Math.ceil(d * 4)) : 1;
      const rectGeo = new THREE.PlaneGeometry(w, d, segW, segD);
      rectGeo.rotateX(-Math.PI / 2);
      rectGeo.translate(cx, yBase, cz);

      const uvAttr = rectGeo.attributes["uv"] as THREE.BufferAttribute;
      for (let i = 0; i < uvAttr.count; i++) {
        uvAttr.setXY(i, uvAttr.getX(i) * w * tileX, uvAttr.getY(i) * d * tileY);
      }
      rectGeo.setAttribute('uv2', rectGeo.attributes.uv);
      geo = rectGeo;
      colliderBounds = { x: minX, z: minZ, width: w, depth: d };
    }

    const mat = ovr
      ? await assetManager.getMaterialWithOverrides(floor.floorMesh.material, ovr)
          .catch(() => assetManager.getDefaultMaterial(0x4a5a40))
      : await assetManager.getMaterial(floor.floorMesh.material)
          .catch(() => assetManager.getDefaultMaterial(0x4a5a40));

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.userData = {
      editorId:      floor.id,
      editorType:    "floor",
      zoneId,
      selectable:    true,
      floorLevel:    floor.level,
      _ownsMaterial: !!ovr,
    } satisfies MeshUserData;

    const collider = ColliderBuilder.registerFloor(colliderBounds, floor.elevation);

    return { mesh, collider };
  }
}
