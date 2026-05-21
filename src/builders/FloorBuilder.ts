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
  ): Promise<FloorBuildOutput> {
    const pts  = floor.floorMesh.points ?? [];
    const minX = Math.min(...pts.map(p => p.x));
    const maxX = Math.max(...pts.map(p => p.x));
    const minZ = Math.min(...pts.map(p => p.z));
    const maxZ = Math.max(...pts.map(p => p.z));
    const w    = maxX - minX;
    const d    = maxZ - minZ;
    const cx   = minX + w / 2;
    const cz   = minZ + d / 2;

    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    geo.translate(cx, floor.elevation + 0.004, cz);

    const tileScale = assetManager.getMaterialDef(floor.floorMesh.material)?.tileScale ?? 1.0;
    const uvAttr = geo.attributes["uv"] as THREE.BufferAttribute;
    for (let i = 0; i < uvAttr.count; i++) {
      uvAttr.setXY(i, uvAttr.getX(i) * w * tileScale, uvAttr.getY(i) * d * tileScale);
    }
    geo.setAttribute('uv2', geo.attributes.uv);

    const mat = await assetManager.getMaterial(floor.floorMesh.material)
      .catch(() => assetManager.getDefaultMaterial(0x4a5a40));

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.userData = {
      editorId:      `floor_${floor.level}_${zoneId}`,
      editorType:    "floor",
      zoneId,
      selectable:    true,
      floorLevel:    floor.level,
      _ownsMaterial: false,
    } satisfies MeshUserData;

    const collider = ColliderBuilder.registerFloor(
      { x: minX, z: minZ, width: w, depth: d },
      floor.elevation,
    );

    return { mesh, collider };
  }
}
