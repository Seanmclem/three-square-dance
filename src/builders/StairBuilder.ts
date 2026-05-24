import * as THREE from "three";
import { ColliderBuilder } from "@/physics/ColliderBuilder";
import { assetManager } from "@/core/AssetManager";
import type { StairDef, MeshUserData } from "@/types";
import type RAPIER from "@dimforge/rapier3d-compat";

export interface StairBuildOutput {
  meshes:    THREE.Mesh[];
  colliders: RAPIER.Collider[];
}

const STEP_HEIGHT = 0.2;

export class StairBuilder {
  static async build(stair: StairDef, zoneId: string): Promise<StairBuildOutput> {
    const mat = await assetManager.getMaterial(stair.material)
      .catch(() => assetManager.getDefaultMaterial(0x6a7a8a));

    const heightDiff = stair.end.y - stair.start.y;
    const dx         = stair.end.x - stair.start.x;
    const dz         = stair.end.z - stair.start.z;
    const horizDist  = Math.hypot(dx, dz);
    const angle      = Math.atan2(dz, dx);

    const numSteps  = Math.max(1, Math.round(heightDiff / STEP_HEIGHT));
    const stepDepth = horizDist / numSteps;
    const meshes: THREE.Mesh[] = [];

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    for (let i = 0; i < numSteps; i++) {
      const t = (i + 0.5) / numSteps;

      const cx = stair.start.x + dx * t;
      const cy = stair.start.y + (i + 0.5) * STEP_HEIGHT;
      const cz = stair.start.z + dz * t;

      const stepGeo = new THREE.BoxGeometry(stair.width, STEP_HEIGHT, stepDepth);
      const stepMesh = new THREE.Mesh(stepGeo, mat);

      stepMesh.position.set(cx, cy, cz);
      stepMesh.rotation.y = -angle;
      stepMesh.castShadow    = true;
      stepMesh.receiveShadow = true;

      stepMesh.userData = {
        editorId:      stair.id,
        editorType:    "stair",
        zoneId,
        selectable:    i === 0, // only first step is selectable (represents the whole stair)
        floorLevel:    0,
        _ownsMaterial: false,
      } satisfies MeshUserData;

      meshes.push(stepMesh);

      void cosA; void sinA; // used for angle, keep linter happy
    }

    // Optional side railings
    if (stair.hasRailing) {
      const railMat = new THREE.MeshStandardMaterial({
        color: 0x9aabb8, roughness: 0.4, metalness: 0.4,
      });
      const railH = 0.9;
      const railT = 0.05;

      for (let side = -1; side <= 1; side += 2) {
        const sideOff = side * (stair.width / 2 + railT / 2);
        const geo  = new THREE.BoxGeometry(railT, railH, horizDist);
        const mesh = new THREE.Mesh(geo, railMat);

        // Position at center of stair
        const midX = (stair.start.x + stair.end.x) / 2;
        const midY = (stair.start.y + stair.end.y) / 2 + railH / 2;
        const midZ = (stair.start.z + stair.end.z) / 2;

        // Offset perpendicular to stair direction
        const perpX = -Math.sin(angle) * sideOff;
        const perpZ =  Math.cos(angle) * sideOff;

        mesh.position.set(midX + perpX, midY, midZ + perpZ);
        mesh.rotation.y = -angle;
        mesh.castShadow = true;

        mesh.userData = {
          editorId:      stair.id,
          editorType:    "stair",
          zoneId,
          selectable:    false,
          floorLevel:    0,
          _ownsMaterial: side === -1, // first rail owns the material
        } satisfies MeshUserData;
        meshes.push(mesh);
      }
    }

    const colliders = ColliderBuilder.registerStairSteps(stair);
    return { meshes, colliders };
  }
}
