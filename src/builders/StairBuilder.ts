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

// ── Geometry helpers ──────────────────────────────────────────────────────────

interface StepAccum {
  pos: number[];
  nrm: number[];
  uv:  number[];
  idx: number[];
  vi:  number;
}

function pushQuad(
  acc: StepAccum,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  dx: number, dy: number, dz: number,
  nx: number, ny: number, nz: number,
  uScl: number, vScl: number,
): void {
  const { pos, nrm, uv, idx } = acc;
  pos.push(ax,ay,az, bx,by,bz, cx,cy,cz, dx,dy,dz);
  nrm.push(nx,ny,nz, nx,ny,nz, nx,ny,nz, nx,ny,nz);
  uv.push(0,0, uScl,0, uScl,vScl, 0,vScl);
  idx.push(acc.vi, acc.vi+2, acc.vi+1,  acc.vi, acc.vi+3, acc.vi+2);
  acc.vi += 4;
}

function accumToGeo(acc: StepAccum): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(acc.pos, 3));
  geo.setAttribute("normal",   new THREE.Float32BufferAttribute(acc.nrm, 3));
  geo.setAttribute("uv",       new THREE.Float32BufferAttribute(acc.uv,  2));
  geo.setIndex(acc.idx);
  geo.computeBoundingSphere();
  return geo;
}

// ── Builder ───────────────────────────────────────────────────────────────────

export class StairBuilder {
  static async build(stair: StairDef, zoneId: string): Promise<StairBuildOutput> {
    const ovr     = stair.materialOverrides;
    const baseDef = assetManager.getMaterialDef(stair.material);
    const ts      = ovr?.tileScale ?? baseDef?.tileScale ?? 1.0;

    const mat = ovr
      ? await assetManager.getMaterialWithOverrides(stair.material, ovr)
          .catch(() => assetManager.getDefaultMaterial(0x6a7a8a))
      : await assetManager.getMaterial(stair.material)
          .catch(() => assetManager.getDefaultMaterial(0x6a7a8a));

    const riserOvr   = stair.riserMaterialOverrides;
    const riserMatId = stair.riserMaterial;
    const riserBaseDef = riserMatId ? assetManager.getMaterialDef(riserMatId) : null;
    const riserTs = riserOvr?.tileScale ?? riserBaseDef?.tileScale ?? ts;

    const riserMat: THREE.Material = riserMatId
      ? (riserOvr
          ? await assetManager.getMaterialWithOverrides(riserMatId, riserOvr)
              .catch(() => assetManager.getDefaultMaterial(0x6a7a8a))
          : await assetManager.getMaterial(riserMatId)
              .catch(() => assetManager.getDefaultMaterial(0x6a7a8a)))
      : mat;

    const heightDiff = stair.end.y - stair.start.y;
    const dx         = stair.end.x - stair.start.x;
    const dz         = stair.end.z - stair.start.z;
    const horizDist  = Math.hypot(dx, dz);
    const angle      = Math.atan2(dz, dx);

    const numSteps  = stair.numSteps ?? Math.max(1, Math.round(heightDiff / STEP_HEIGHT));
    const stepRise  = heightDiff / numSteps;
    const stepDepth = horizDist / numSteps;
    const hw = stepDepth / 2;
    const hh = stepRise  / 2;
    const hd = stair.width / 2;

    // Rotation matrix for rotation.y = -angle  (local → world direction)
    const cosA =  Math.cos(angle);
    const sinA =  Math.sin(angle);

    // Transform a local point + world step-center offset into world coords
    const toWorld = (
      lx: number, ly: number, lz: number,
      cx: number, cy: number, cz: number,
    ): [number, number, number] => [
      lx * cosA - lz * sinA + cx,
      ly + cy,
      lx * sinA + lz * cosA + cz,
    ];

    // Transform a local normal into world (no translation)
    const toWorldN = (nx: number, ny: number, nz: number): [number, number, number] => [
      nx * cosA - nz * sinA,
      ny,
      nx * sinA + nz * cosA,
    ];

    // Pre-compute world normals for the fixed face directions
    const nTop    = toWorldN(0, 1, 0);
    const nBot    = toWorldN(0, -1, 0);
    const nBack   = toWorldN(1, 0, 0);   // +X: back face of step (faces toward end)
    const nRiser  = toWorldN(-1, 0, 0);  // -X: riser face (faces toward start / viewer)
    const nSideP  = toWorldN(0, 0, 1);   // +Z side
    const nSideN  = toWorldN(0, 0, -1);  // -Z side

    const body:  StepAccum = { pos: [], nrm: [], uv: [], idx: [], vi: 0 };
    const riser: StepAccum = { pos: [], nrm: [], uv: [], idx: [], vi: 0 };

    for (let i = 0; i < numSteps; i++) {
      const t  = (i + 0.5) / numSteps;
      const cx = stair.start.x + dx * t;
      const cy = stair.start.y + (i + 0.5) * stepRise;
      const cz = stair.start.z + dz * t;

      // 8 corner points in world space (local coords → world)
      const [pTFL_x, pTFL_y, pTFL_z] = toWorld(-hw,  hh, -hd, cx, cy, cz); // top front left
      const [pTFR_x, pTFR_y, pTFR_z] = toWorld(-hw,  hh,  hd, cx, cy, cz); // top front right
      const [pTBL_x, pTBL_y, pTBL_z] = toWorld( hw,  hh, -hd, cx, cy, cz); // top back left
      const [pTBR_x, pTBR_y, pTBR_z] = toWorld( hw,  hh,  hd, cx, cy, cz); // top back right
      const [pBFL_x, pBFL_y, pBFL_z] = toWorld(-hw, -hh, -hd, cx, cy, cz); // bot front left
      const [pBFR_x, pBFR_y, pBFR_z] = toWorld(-hw, -hh,  hd, cx, cy, cz); // bot front right
      const [pBBL_x, pBBL_y, pBBL_z] = toWorld( hw, -hh, -hd, cx, cy, cz); // bot back left
      const [pBBR_x, pBBR_y, pBBR_z] = toWorld( hw, -hh,  hd, cx, cy, cz); // bot back right

      const wd = stepDepth * ts, wh = stepRise * ts, ww = stair.width * ts;
      const rWw = stair.width * riserTs, rWh = stepRise * riserTs;

      // ── Body faces ──────────────────────────────────────────────────────────
      // +Y top
      pushQuad(body,
        pTFL_x,pTFL_y,pTFL_z, pTBL_x,pTBL_y,pTBL_z, pTBR_x,pTBR_y,pTBR_z, pTFR_x,pTFR_y,pTFR_z,
        ...nTop, wd, ww);
      // -Y bottom
      pushQuad(body,
        pBFL_x,pBFL_y,pBFL_z, pBFR_x,pBFR_y,pBFR_z, pBBR_x,pBBR_y,pBBR_z, pBBL_x,pBBL_y,pBBL_z,
        ...nBot, wd, ww);
      // +X back
      pushQuad(body,
        pTBR_x,pTBR_y,pTBR_z, pTBL_x,pTBL_y,pTBL_z, pBBL_x,pBBL_y,pBBL_z, pBBR_x,pBBR_y,pBBR_z,
        ...nBack, ww, wh);
      // +Z right side
      pushQuad(body,
        pTFR_x,pTFR_y,pTFR_z, pTBR_x,pTBR_y,pTBR_z, pBBR_x,pBBR_y,pBBR_z, pBFR_x,pBFR_y,pBFR_z,
        ...nSideP, wd, wh);
      // -Z left side
      pushQuad(body,
        pTBL_x,pTBL_y,pTBL_z, pTFL_x,pTFL_y,pTFL_z, pBFL_x,pBFL_y,pBFL_z, pBBL_x,pBBL_y,pBBL_z,
        ...nSideN, wd, wh);

      // ── Riser face (-X) ─────────────────────────────────────────────────────
      pushQuad(riser,
        pTFL_x,pTFL_y,pTFL_z, pTFR_x,pTFR_y,pTFR_z, pBFR_x,pBFR_y,pBFR_z, pBFL_x,pBFL_y,pBFL_z,
        ...nRiser, rWw, rWh);
    }

    const meshes: THREE.Mesh[] = [];

    const bodyMesh = new THREE.Mesh(accumToGeo(body), mat);
    bodyMesh.castShadow    = true;
    bodyMesh.receiveShadow = true;
    bodyMesh.userData = {
      editorId: stair.id, editorType: "stair", zoneId,
      selectable: true, floorLevel: 0, _ownsMaterial: !!ovr,
    } satisfies MeshUserData;
    meshes.push(bodyMesh);

    const riserMesh = new THREE.Mesh(accumToGeo(riser), riserMat);
    riserMesh.castShadow    = true;
    riserMesh.receiveShadow = true;
    riserMesh.userData = {
      editorId: stair.id, editorType: "stair", zoneId,
      selectable: false, floorLevel: 0, _ownsMaterial: !!(riserMatId && riserOvr),
    } satisfies MeshUserData;
    meshes.push(riserMesh);

    // ── Railings ─────────────────────────────────────────────────────────────
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

        const midX = (stair.start.x + stair.end.x) / 2;
        const midY = (stair.start.y + stair.end.y) / 2 + railH / 2;
        const midZ = (stair.start.z + stair.end.z) / 2;

        const perpX = -Math.sin(angle) * sideOff;
        const perpZ =  Math.cos(angle) * sideOff;

        mesh.position.set(midX + perpX, midY, midZ + perpZ);
        mesh.rotation.y = -angle;
        mesh.castShadow = true;

        mesh.userData = {
          editorId: stair.id, editorType: "stair", zoneId,
          selectable: false, floorLevel: 0,
          _ownsMaterial: side === -1,
        } satisfies MeshUserData;
        meshes.push(mesh);
      }
    }

    const colliders = ColliderBuilder.registerStairSteps(stair);
    return { meshes, colliders };
  }
}
