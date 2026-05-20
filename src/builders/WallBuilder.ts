import * as THREE from "three";
import { ColliderBuilder } from "@/physics/ColliderBuilder";
import { assetManager } from "@/core/AssetManager";
import type { WallDef, MeshUserData } from "@/types";
import type RAPIER from "@dimforge/rapier3d-compat";

export interface WallBuildOutput {
  mesh:      THREE.Mesh;
  colliders: RAPIER.Collider[];
}

export class WallBuilder {
  static async build(wall: WallDef, zoneId: string): Promise<WallBuildOutput> {
    const dx     = wall.end.x - wall.start.x;
    const dz     = wall.end.z - wall.start.z;
    const length = Math.hypot(dx, dz);
    const angle  = Math.atan2(dz, dx);
    const cx     = (wall.start.x + wall.end.x) / 2;
    const cz     = (wall.start.z + wall.end.z) / 2;

    const geo = new THREE.BoxGeometry(length, wall.height, wall.thickness);

    const mat = await assetManager.getMaterial(wall.material)
      .catch(() => assetManager.getDefaultMaterial(0x4a5a6a));

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, wall.height / 2, cz);
    mesh.rotation.y = -angle;
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    mesh.userData = {
      editorId:      wall.id,
      editorType:    "wall",
      zoneId,
      selectable:    true,
      floorLevel:    wall.floor,
      _ownsMaterial: false,
    } satisfies MeshUserData;

    const colliders = ColliderBuilder.registerWallSegments(wall, 0);

    return { mesh, colliders };
  }
}
