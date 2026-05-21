import * as THREE from "three";
import { ColliderBuilder } from "@/physics/ColliderBuilder";
import { assetManager } from "@/core/AssetManager";
import type { WallDef, ZoneDef, WallNode, MeshUserData } from "@/types";
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
  static async build(
    wall:   WallDef,
    zoneId: string,
    zone:   ZoneDef,
    nodes:  Map<string, WallNode>,
  ): Promise<WallBuildOutput> {
    const rawStart = nodes.get(wall.startNodeId)!;
    const rawEnd   = nodes.get(wall.endNodeId)!;

    // Corner joining: shorten wall at ends that connect to other walls
    const connectedAtStart = zone.walls.filter(w =>
      w.id !== wall.id &&
      (w.startNodeId === wall.startNodeId || w.endNodeId === wall.startNodeId),
    );
    const connectedAtEnd = zone.walls.filter(w =>
      w.id !== wall.id &&
      (w.startNodeId === wall.endNodeId || w.endNodeId === wall.endNodeId),
    );

    const totalDx  = rawEnd.x - rawStart.x;
    const totalDz  = rawEnd.z - rawStart.z;
    const totalLen = Math.hypot(totalDx, totalDz) || 0.001;
    const ux = totalDx / totalLen;
    const uz = totalDz / totalLen;

    const startOff = connectedAtStart.length > 0 ? wall.thickness / 2 : 0;
    const endOff   = connectedAtEnd.length   > 0 ? wall.thickness / 2 : 0;

    const start = { x: rawStart.x + ux * startOff, z: rawStart.z + uz * startOff };
    const end   = { x: rawEnd.x   - ux * endOff,   z: rawEnd.z   - uz * endOff   };

    const dx     = end.x - start.x;
    const dz     = end.z - start.z;
    const length = Math.hypot(dx, dz);
    const angle  = Math.atan2(dz, dx);
    const cx     = (start.x + end.x) / 2;
    const cz     = (start.z + end.z) / 2;

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

    const colliders = ColliderBuilder.registerWallSegments(wall, 0, start, end);

    return { mesh, colliders };
  }
}
