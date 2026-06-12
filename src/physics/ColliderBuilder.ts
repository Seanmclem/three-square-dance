import RAPIER from "@dimforge/rapier3d-compat";
import { physicsWorld } from "./PhysicsWorld";
import type { WallDef, Vec2, PlatformDef, StairDef, Opening, TriggerVolume } from "@/types";

export class ColliderBuilder {
  static registerFloor(
    bounds: { x: number; z: number; width: number; depth: number },
    elevation: number,
  ): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(bounds.width / 2, 0.05, bounds.depth / 2)
      .setTranslation(
        bounds.x + bounds.width / 2,
        elevation - 0.05,
        bounds.z + bounds.depth / 2,
      );
    return physicsWorld.createStaticCollider(desc);
  }

  static registerWallSegments(wall: WallDef, elevation: number, start: Vec2, end: Vec2): RAPIER.Collider[] {
    const length = Math.hypot(end.x - start.x, end.z - start.z);
    const angle  = Math.atan2(end.z - start.z, end.x - start.x);
    const midX   = (start.x + end.x) / 2;
    const midZ   = (start.z + end.z) / 2;

    const sorted: Opening[] = [...wall.openings].sort(
      (a, b) => a.offsetAlongWall - b.offsetAlongWall,
    );
    const segments: Array<{ start: number; end: number }> = [];
    let cursor = 0;
    for (const opening of sorted) {
      if (opening.offsetAlongWall > cursor)
        segments.push({ start: cursor, end: opening.offsetAlongWall });
      cursor = opening.offsetAlongWall + opening.width;
    }
    if (cursor < length) segments.push({ start: cursor, end: length });

    return segments.map((seg) => {
      const segLen = seg.end - seg.start;
      const segMid = seg.start + segLen / 2 - length / 2;
      const wx = midX + Math.cos(angle) * segMid;
      const wz = midZ + Math.sin(angle) * segMid;
      const desc = RAPIER.ColliderDesc.cuboid(segLen / 2, wall.height / 2, wall.thickness / 2)
        .setTranslation(wx, elevation + wall.height / 2, wz)
        .setRotation({ x: 0, y: Math.sin(-angle / 2), z: 0, w: Math.cos(-angle / 2) });
      return physicsWorld.createStaticCollider(desc);
    });
  }

  static registerPlatform(platform: PlatformDef): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(
      platform.size.width / 2,
      platform.thickness / 2,
      platform.size.depth / 2,
    ).setTranslation(
      platform.position.x,
      platform.position.y + platform.thickness / 2,
      platform.position.z,
    );
    return physicsWorld.createStaticCollider(desc);
  }

  static registerStairSteps(stair: StairDef): RAPIER.Collider[] {
    const heightDiff = stair.end.y - stair.start.y;
    const horizDist  = Math.hypot(stair.end.x - stair.start.x, stair.end.z - stair.start.z);
    const angle      = Math.atan2(stair.end.z - stair.start.z, stair.end.x - stair.start.x);
    const defaultStepH = 0.2;
    const numSteps   = stair.numSteps ?? Math.max(1, Math.round(heightDiff / defaultStepH));
    const stepRise   = heightDiff / numSteps;
    const stepDepth  = horizDist / numSteps;
    const colliders: RAPIER.Collider[] = [];

    for (let i = 0; i < numSteps; i++) {
      const t = (i + 0.5) / numSteps;
      const desc = RAPIER.ColliderDesc.cuboid(stepDepth / 2, stepRise / 2, stair.width / 2)
        .setTranslation(
          stair.start.x + (stair.end.x - stair.start.x) * t,
          stair.start.y + (i + 0.5) * stepRise,
          stair.start.z + (stair.end.z - stair.start.z) * t,
        )
        .setRotation({ x: 0, y: Math.sin(-angle / 2), z: 0, w: Math.cos(-angle / 2) });
      colliders.push(physicsWorld.createStaticCollider(desc));
    }
    return colliders;
  }

  static registerDoorSensor(wall: WallDef, opening: Opening, elevation: number, start: Vec2, end: Vec2): RAPIER.Collider {
    const angle = Math.atan2(end.z - start.z, end.x - start.x);
    const desc = RAPIER.ColliderDesc.cuboid((opening.width - 0.1) / 2, opening.height / 2, 0.4)
      .setTranslation(
        start.x + Math.cos(angle) * (opening.offsetAlongWall + opening.width / 2),
        elevation + opening.elevation + opening.height / 2,
        start.z + Math.sin(angle) * (opening.offsetAlongWall + opening.width / 2),
      )
      .setRotation({ x: 0, y: Math.sin(-angle / 2), z: 0, w: Math.cos(-angle / 2) });
    return physicsWorld.createSensorCollider(desc);
  }

  static registerVolumeSensor(vol: TriggerVolume): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(vol.size.x / 2, vol.size.y / 2, vol.size.z / 2)
      .setTranslation(vol.position.x, vol.position.y + vol.size.y / 2, vol.position.z);
    return physicsWorld.createSensorCollider(desc);
  }

  static registerTerrain(
    heightData: Float32Array,
    resolution: number,
    worldSize: number,
    maxHeight: number,
  ): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.heightfield(
      resolution - 1,
      resolution - 1,
      heightData,
      { x: worldSize, y: maxHeight, z: worldSize },
    ).setTranslation(0, 0, 0);
    return physicsWorld.createStaticCollider(desc);
  }
}

