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

    const ovr       = floor.materialOverrides;
    const baseDef   = assetManager.getMaterialDef(floor.floorMesh.material);
    const tileScale = ovr?.tileScale ?? baseDef?.tileScale ?? 1.0;
    const tileX     = ovr?.tileScaleX ?? tileScale;
    const tileY     = ovr?.tileScaleY ?? tileScale;

    // Displacement requires subdivided geometry
    const dispEnabled = ovr?.maps?.displacement?.enabled
      ?? baseDef?.maps.displacement.enabled
      ?? false;
    const segW = dispEnabled ? Math.max(1, Math.ceil(w * 4)) : 1;
    const segD = dispEnabled ? Math.max(1, Math.ceil(d * 4)) : 1;

    const geo = new THREE.PlaneGeometry(w, d, segW, segD);
    geo.rotateX(-Math.PI / 2);
    geo.translate(cx, floor.elevation + 0.004, cz);

    const uvAttr = geo.attributes["uv"] as THREE.BufferAttribute;
    for (let i = 0; i < uvAttr.count; i++) {
      uvAttr.setXY(i, uvAttr.getX(i) * w * tileX, uvAttr.getY(i) * d * tileY);
    }
    geo.setAttribute('uv2', geo.attributes.uv);

    const mat = ovr
      ? await assetManager.getMaterialWithOverrides(floor.floorMesh.material, ovr)
          .catch(() => assetManager.getDefaultMaterial(0x4a5a40))
      : await assetManager.getMaterial(floor.floorMesh.material)
          .catch(() => assetManager.getDefaultMaterial(0x4a5a40));

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.userData = {
      editorId:      `floor_${floor.level}_${zoneId}`,
      editorType:    "floor",
      zoneId,
      selectable:    true,
      floorLevel:    floor.level,
      _ownsMaterial: !!ovr,
    } satisfies MeshUserData;

    const collider = ColliderBuilder.registerFloor(
      { x: minX, z: minZ, width: w, depth: d },
      floor.elevation,
    );

    return { mesh, collider };
  }
}
