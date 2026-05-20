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
    bounds: { x: number; z: number; width: number; depth: number },
    zoneId: string,
  ): Promise<FloorBuildOutput> {
    const { width, depth } = bounds;
    const geo = new THREE.PlaneGeometry(width, depth);
    geo.rotateX(-Math.PI / 2);
    geo.translate(bounds.x + width / 2, floor.elevation, bounds.z + depth / 2);

    const uvAttr = geo.attributes["uv"] as THREE.BufferAttribute;
    for (let i = 0; i < uvAttr.count; i++) {
      uvAttr.setXY(i, uvAttr.getX(i) * width, uvAttr.getY(i) * depth);
    }

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

    const collider = ColliderBuilder.registerFloor(bounds, floor.elevation);

    return { mesh, collider };
  }
}
