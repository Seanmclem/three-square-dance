import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { physicsWorld } from "./PhysicsWorld";
import { colliderWorldTransform } from "./attachedColliderMath";
import type { WallDef, Vec2, PlatformDef, StairDef, ShapeDef, Opening, TriggerVolume, WorldObject, AttachedCollider } from "@/types";

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

  static registerPlatform(platform: PlatformDef, applyRotation = true): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(
      platform.size.width / 2,
      platform.thickness / 2,
      platform.size.depth / 2,
    ).setTranslation(
      platform.position.x,
      platform.position.y + platform.thickness / 2,
      platform.position.z,
    );
    // Mirror the mesh's Y rotation (Phase 10.6b). Three.js and Rapier share a
    // right-handed Y-up frame, so a +angle mesh rotation maps to a +angle quaternion.
    // Skipped for CSG platforms, whose geometry is baked unrotated (see PlatformBuilder).
    const angle = applyRotation ? ((platform.rotation?.y ?? 0) * Math.PI) / 180 : 0;
    if (angle) desc.setRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) });
    return physicsWorld.createStaticCollider(desc);
  }

  /**
   * Parametric shape (Phase 22): exact convex hull of the LOCAL-space vertex
   * cloud (all shape kinds are convex by construction), with the def's
   * position/rotation applied on the collider — the same transform the mesh
   * uses, so mesh and collider can never drift. Returns null only for
   * degenerate point clouds (params are clamped upstream, so this is a
   * shouldn't-happen guard: the mesh still renders, just without collision).
   */
  static registerShape(shape: ShapeDef, localPoints: Float32Array): RAPIER.Collider | null {
    const desc = RAPIER.ColliderDesc.convexHull(localPoints);
    if (!desc) {
      console.warn(`ColliderBuilder: convex hull failed for shape "${shape.id}" — no collider`);
      return null;
    }
    const D2R = Math.PI / 180;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      shape.rotation.x * D2R, shape.rotation.y * D2R, shape.rotation.z * D2R, "XYZ",
    ));
    desc.setTranslation(shape.position.x, shape.position.y, shape.position.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    return physicsWorld.createStaticCollider(desc);
  }

  /**
   * Face-brush shape (Phase 23): exact trimesh of the face fans — concave solids
   * collide correctly (a convex hull would fill in dents/alcoves). Same transform
   * mirroring as registerShape. Falls back to the convex hull on degenerate input.
   *
   * FIX_INTERNAL_EDGES (includes MERGE_DUPLICATE_VERTICES) stops the character
   * controller catching on interior fan-triangulation edges of large flat faces.
   *
   * Editor-time query gotcha: colliders only enter the query pipeline after a
   * `world.step()` — the editor doesn't step physics, so ad-hoc console raycasts
   * against fresh colliders miss until one step runs (preview always steps).
   */
  static registerShapeTrimesh(shape: ShapeDef, vertices: Float32Array, indices: Uint32Array): RAPIER.Collider | null {
    let desc: RAPIER.ColliderDesc | null = null;
    try {
      desc = RAPIER.ColliderDesc.trimesh(vertices, indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES);
    } catch {
      console.warn(`ColliderBuilder: trimesh failed for shape "${shape.id}" — falling back to convex hull`);
      desc = RAPIER.ColliderDesc.convexHull(vertices);
    }
    if (!desc) return null;
    const D2R = Math.PI / 180;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      shape.rotation.x * D2R, shape.rotation.y * D2R, shape.rotation.z * D2R, "XYZ",
    ));
    desc.setTranslation(shape.position.x, shape.position.y, shape.position.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
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
    const angle = vol.rotation?.y ? vol.rotation.y * Math.PI / 180 : 0;
    if (angle) desc.setRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) });
    return physicsWorld.createSensorCollider(desc);
  }

  /** Register a placed object's attached colliders (world transform composed from the object). */
  static registerAttachedColliders(obj: WorldObject, colliders: AttachedCollider[]): RAPIER.Collider[] {
    return colliders.map(c => {
      const desc = ColliderBuilder._attachedDesc(obj, c);
      return c.isSensor
        ? physicsWorld.createSensorCollider(desc)
        : physicsWorld.createStaticCollider(desc);
    });
  }

  private static _attachedDesc(obj: WorldObject, c: AttachedCollider): RAPIER.ColliderDesc {
    if (c.shape === "trimesh" && c.points?.length && c.indices?.length) {
      // Exact concave surface (baked face-brushes, Phase 27b). Same frame math as
      // the hull arm; FIX_INTERNAL_EDGES per registerShapeTrimesh.
      const s = obj.scale;
      const flat = new Float32Array(c.points.length * 3);
      c.points.forEach((p, i) => {
        flat[i * 3]     = (p.x + c.offset.x) * s.x;
        flat[i * 3 + 1] = (p.y + c.offset.y) * s.y;
        flat[i * 3 + 2] = (p.z + c.offset.z) * s.z;
      });
      try {
        const tm = RAPIER.ColliderDesc.trimesh(flat, new Uint32Array(c.indices), RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES);
        const D2R = Math.PI / 180;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
          obj.rotation.x * D2R, obj.rotation.y * D2R, obj.rotation.z * D2R));
        return tm
          .setTranslation(obj.position.x, obj.position.y, obj.position.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      } catch {
        console.warn(`[ColliderBuilder] trimesh failed on ${obj.id} — falling back to box`);
      }
    }
    if (c.shape === "hull" && c.points?.length) {
      // Points are object-local pre-scale; scale componentwise THEN rotate with the
      // object (mesh TRS order: world = R·(S·p) + T) — exact under non-uniform scale.
      const s = obj.scale;
      const flat = new Float32Array(c.points.length * 3);
      c.points.forEach((p, i) => {
        flat[i * 3]     = (p.x + c.offset.x) * s.x;
        flat[i * 3 + 1] = (p.y + c.offset.y) * s.y;
        flat[i * 3 + 2] = (p.z + c.offset.z) * s.z;
      });
      const hull = RAPIER.ColliderDesc.convexHull(flat);
      if (hull) {
        const D2R = Math.PI / 180;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
          obj.rotation.x * D2R, obj.rotation.y * D2R, obj.rotation.z * D2R));
        return hull
          .setTranslation(obj.position.x, obj.position.y, obj.position.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      }
      console.warn(`[ColliderBuilder] degenerate hull points on ${obj.id} — falling back to box`);
    }
    // Box/sphere/capsule — plus the degenerate hull/trimesh fallback, which reads
    // as a box of the stored points-AABB size through the same transform math.
    const prim = (c.shape === "hull" || c.shape === "trimesh") ? { ...c, shape: "box" as const } : c;
    const { pos, quat, halfExtents } = colliderWorldTransform(obj, prim);
    const desc =
      prim.shape === "sphere"  ? RAPIER.ColliderDesc.ball(halfExtents.x) :
      prim.shape === "capsule" ? RAPIER.ColliderDesc.capsule(halfExtents.y, halfExtents.x) :
                                 RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z);
    return desc.setTranslation(pos.x, pos.y, pos.z).setRotation(quat);
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

