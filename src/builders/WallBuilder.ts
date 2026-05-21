import * as THREE from "three";
import { ColliderBuilder } from "@/physics/ColliderBuilder";
import { assetManager } from "@/core/AssetManager";
import type { WallDef, MeshUserData } from "@/types";
import type RAPIER from "@dimforge/rapier3d-compat";

export interface WallBuildOutput {
  mesh:      THREE.Mesh;
  colliders: RAPIER.Collider[];
}

function applyBoxUVTiling(
  geo: THREE.BoxGeometry,
  W: number, H: number, D: number,
  tileScale: number,
): void {
  const uv  = geo.attributes.uv as THREE.BufferAttribute;
  const idx = geo.index!;
  const dims: [number, number][] = [
    [D, H], [D, H], // +x, -x
    [W, D], [W, D], // +y, -y
    [W, H], [W, H], // +z, -z
  ];
  for (let fi = 0; fi < geo.groups.length; fi++) {
    const { start, count } = geo.groups[fi];
    const [uS, vS] = dims[fi];
    const seen = new Set<number>();
    for (let i = start; i < start + count; i++) {
      const vi = idx.getX(i);
      if (seen.has(vi)) continue;
      seen.add(vi);
      uv.setXY(vi, uv.getX(vi) * uS * tileScale, uv.getY(vi) * vS * tileScale);
    }
  }
  uv.needsUpdate = true;
}

export class WallBuilder {
  static async build(wall: WallDef, zoneId: string): Promise<WallBuildOutput> {
    const dx     = wall.end.x - wall.start.x;
    const dz     = wall.end.z - wall.start.z;
    const length = Math.hypot(dx, dz);
    const angle  = Math.atan2(dz, dx);
    const cx     = (wall.start.x + wall.end.x) / 2;
    const cz     = (wall.start.z + wall.end.z) / 2;

    const ovr      = wall.materialOverrides;
    const baseDef  = assetManager.getMaterialDef(wall.material);
    const tileScale = ovr?.tileScale ?? baseDef?.tileScale ?? 1.0;

    // Displacement requires subdivided geometry to show any effect
    const dispEnabled = ovr?.maps?.displacement?.enabled
      ?? baseDef?.maps.displacement.enabled
      ?? false;
    const segX = dispEnabled ? Math.max(1, Math.ceil(length * 4)) : 1;
    const segY = dispEnabled ? Math.max(1, Math.ceil(wall.height * 4)) : 1;

    const geo = new THREE.BoxGeometry(length, wall.height, wall.thickness, segX, segY, 1);
    applyBoxUVTiling(geo, length, wall.height, wall.thickness, tileScale);
    geo.setAttribute('uv2', geo.attributes.uv);

    const mat = ovr
      ? await assetManager.getMaterialWithOverrides(wall.material, ovr)
          .catch(() => assetManager.getDefaultMaterial(0x4a5a6a))
      : await assetManager.getMaterial(wall.material)
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
      _ownsMaterial: !!ovr,  // true → ZoneManager disposes on rebuild
    } satisfies MeshUserData;

    const colliders = ColliderBuilder.registerWallSegments(wall, 0);

    return { mesh, colliders };
  }
}
