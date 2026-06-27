import * as THREE from "three";
import { ColliderBuilder } from "@/physics/ColliderBuilder";
import { assetManager } from "@/core/AssetManager";
import { applyUVOffset } from "@/builders/UVUtils";
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

// Like pushQuad but with explicit per-corner UVs — used for the stringer side/underside
// faces, where UVs accumulate in world space across steps so the texture flows continuously
// instead of restarting per step.
function pushQuadUV(
  acc: StepAccum,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  dx: number, dy: number, dz: number,
  nx: number, ny: number, nz: number,
  ua: number, va: number, ub: number, vb: number,
  uc: number, vc: number, ud: number, vd: number,
): void {
  const { pos, nrm, uv, idx } = acc;
  pos.push(ax,ay,az, bx,by,bz, cx,cy,cz, dx,dy,dz);
  nrm.push(nx,ny,nz, nx,ny,nz, nx,ny,nz, nx,ny,nz);
  uv.push(ua,va, ub,vb, uc,vc, ud,vd);
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

    // Underside style. "open" = current free-floating stepped boxes; "diagonal" = solid
    // wedge with a slanted soffit; "closed" = solid down to the floor. effThk must clear
    // the inner step corners (> stepRise), else the side panels invert.
    const undersideMode = stair.underside?.mode ?? "open";
    const effThk        = Math.max(stair.underside?.thickness ?? 0.3, stepRise * 1.001);

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

      const wd = stepDepth / ts, wh = stepRise / ts, ww = stair.width / ts;
      const rWw = stair.width / riserTs, rWh = stepRise / riserTs;

      // ── Body faces ──────────────────────────────────────────────────────────
      // +Y top
      pushQuad(body,
        pTFL_x,pTFL_y,pTFL_z, pTBL_x,pTBL_y,pTBL_z, pTBR_x,pTBR_y,pTBR_z, pTFR_x,pTFR_y,pTFR_z,
        ...nTop, wd, ww);
      // ── Underside / sides / caps (mode-gated) ─────────────────────────────────
      if (undersideMode === "open") {
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
      } else {
        // Solid wedge ("diagonal") or solid to floor ("closed"). Side bottom corners are
        // constant in local coords across steps, so the soffit tiles into one watertight plane.
        const lyFB = undersideMode === "closed" ? stair.start.y - cy : hh - effThk;       // front-bottom
        const lyBB = undersideMode === "closed" ? stair.start.y - cy : 3 * hh - effThk;   // back-bottom
        const [sFBL_x, sFBL_y, sFBL_z] = toWorld(-hw, lyFB, -hd, cx, cy, cz);
        const [sFBR_x, sFBR_y, sFBR_z] = toWorld(-hw, lyFB,  hd, cx, cy, cz);
        const [sBBL_x, sBBL_y, sBBL_z] = toWorld( hw, lyBB, -hd, cx, cy, cz);
        const [sBBR_x, sBBR_y, sBBR_z] = toWorld( hw, lyBB,  hd, cx, cy, cz);

        // Continuous world-space UVs so the texture flows up the whole stringer instead of
        // restarting each step. Sides: u = run distance, v = world height. Soffit: u = run, v = width.
        const uF   = (i * stepDepth) / ts, uB = ((i + 1) * stepDepth) / ts;
        const vTop = (pTFR_y - stair.start.y) / ts;
        const vFB  = (sFBR_y - stair.start.y) / ts;
        const vBB  = (sBBR_y - stair.start.y) / ts;

        // +Z right side trapezoid (top edge = step profile, bottom edge = stringer line)
        pushQuadUV(body,
          pTFR_x,pTFR_y,pTFR_z, pTBR_x,pTBR_y,pTBR_z, sBBR_x,sBBR_y,sBBR_z, sFBR_x,sFBR_y,sFBR_z,
          ...nSideP, uF,vTop, uB,vTop, uB,vBB, uF,vFB);
        // -Z left side trapezoid
        pushQuadUV(body,
          pTBL_x,pTBL_y,pTBL_z, pTFL_x,pTFL_y,pTFL_z, sFBL_x,sFBL_y,sFBL_z, sBBL_x,sBBL_y,sBBL_z,
          ...nSideN, uB,vTop, uF,vTop, uF,vFB, uB,vBB);

        // Underside — slanted (diagonal) or flat at floor (closed)
        let nUnder: [number, number, number];
        if (undersideMode === "diagonal") {
          const L = Math.hypot(stepRise, stepDepth);
          nUnder = toWorldN(stepRise / L, -stepDepth / L, 0);   // perpendicular to the soffit, pointing down
        } else {
          nUnder = nBot;
        }
        const stepRun = undersideMode === "diagonal" ? Math.hypot(stepDepth, stepRise) : stepDepth;
        const uuF = (i * stepRun) / ts, uuB = ((i + 1) * stepRun) / ts, wUV = stair.width / ts;
        pushQuadUV(body,
          sFBL_x,sFBL_y,sFBL_z, sFBR_x,sFBR_y,sFBR_z, sBBR_x,sBBR_y,sBBR_z, sBBL_x,sBBL_y,sBBL_z,
          ...nUnder, uuF,0, uuF,wUV, uuB,wUV, uuB,0);

        // Back cap (+X) closes the top of the run (both modes)
        if (i === numSteps - 1) {
          pushQuad(body,
            pTBR_x,pTBR_y,pTBR_z, pTBL_x,pTBL_y,pTBL_z, sBBL_x,sBBL_y,sBBL_z, sBBR_x,sBBR_y,sBBR_z,
            ...nBack, ww, (hh - lyBB) / ts);
        }
        // Front cap (-X) — diagonal only: fills the sub-floor nose below the step-0 riser
        if (undersideMode === "diagonal" && i === 0) {
          const [fcTL_x, fcTL_y, fcTL_z] = toWorld(-hw, stair.start.y - cy, -hd, cx, cy, cz);
          const [fcTR_x, fcTR_y, fcTR_z] = toWorld(-hw, stair.start.y - cy,  hd, cx, cy, cz);
          pushQuad(body,
            fcTL_x,fcTL_y,fcTL_z, fcTR_x,fcTR_y,fcTR_z, sFBR_x,sFBR_y,sFBR_z, sFBL_x,sFBL_y,sFBL_z,
            ...nRiser, ww, (effThk - stepRise) / ts);
        }
      }

      // ── Riser face (-X) ─────────────────────────────────────────────────────
      pushQuad(riser,
        pTFL_x,pTFL_y,pTFL_z, pTFR_x,pTFR_y,pTFR_z, pBFR_x,pBFR_y,pBFR_z, pBFL_x,pBFL_y,pBFL_z,
        ...nRiser, rWw, rWh);
    }

    const meshes: THREE.Mesh[] = [];

    // UV offset (Phase 10.8); riser falls back to body overrides when no separate riser material
    const rOffX = riserOvr?.offsetX ?? ovr?.offsetX ?? 0;
    const rOffY = riserOvr?.offsetY ?? ovr?.offsetY ?? 0;
    const bodyGeo = accumToGeo(body);
    applyUVOffset(bodyGeo, ovr?.offsetX ?? 0, ovr?.offsetY ?? 0);
    const bodyMesh = new THREE.Mesh(bodyGeo, mat);
    bodyMesh.castShadow    = true;
    bodyMesh.receiveShadow = true;
    bodyMesh.userData = {
      editorId: stair.id, editorType: "stair", zoneId,
      selectable: true, floorLevel: 0, _ownsMaterial: !!ovr,
    } satisfies MeshUserData;
    meshes.push(bodyMesh);

    const riserGeo = accumToGeo(riser);
    applyUVOffset(riserGeo, rOffX, rOffY);
    const riserMesh = new THREE.Mesh(riserGeo, riserMat);
    riserMesh.castShadow    = true;
    riserMesh.receiveShadow = true;
    riserMesh.userData = {
      editorId: stair.id, editorType: "stair", zoneId,
      selectable: false, floorLevel: 0, _ownsMaterial: !!(riserMatId && riserOvr),
    } satisfies MeshUserData;
    meshes.push(riserMesh);

    // ── Railings ─────────────────────────────────────────────────────────────
    // An open railing per side: a thin top rail following the slope, carried by
    // vertical balusters spaced up the run.
    if (stair.hasRailing) {
      const r           = stair.railing;
      const showTopRail = r?.topRail   ?? true;
      const showPosts   = r?.balusters ?? true;
      const handrailH   = r?.height        ?? 0.9;    // top rail height above the step nosings
      const railBarT    = r?.barThickness  ?? 0.1;    // top-rail cross-section
      const postT       = r?.postThickness ?? 0.06;   // baluster cross-section
      const stepEvery   = Math.max(1, Math.round(r?.stepInterval ?? 1));
      const sideInset   = r?.sideInset ?? 0.1;         // inward offset from the step's side edge
      const overhang    = r?.overhang  ?? 0.15;        // top-rail extension past the end posts, each end

      const railMat = new THREE.MeshStandardMaterial({
        color: 0x9aabb8, roughness: 0.4, metalness: 0.4,
      });

      // Orthonormal basis aligned to the slope:
      //   xAxis → up the slope, zAxis → horizontal side, yAxis → perpendicular up.
      const xAxis = new THREE.Vector3(dx, heightDiff, dz).normalize();
      const zAxis = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
      const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
      const slopeQuat = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis),
      );

      let ownsMat = true;
      const addRail = (
        geo: THREE.BufferGeometry,
        x: number, y: number, z: number,
        quat?: THREE.Quaternion,
      ): void => {
        const mesh = new THREE.Mesh(geo, railMat);
        mesh.position.set(x, y, z);
        if (quat) mesh.quaternion.copy(quat);
        mesh.castShadow = true;
        mesh.userData = {
          editorId: stair.id, editorType: "stair", zoneId,
          selectable: false, floorLevel: 0, _ownsMaterial: ownsMat,
        } satisfies MeshUserData;
        ownsMat = false;
        meshes.push(mesh);
      };

      for (let side = -1; side <= 1; side += 2) {
        const localZ = side * Math.max(postT / 2, hd - sideInset);   // inset from the step edge

        // Anchor on the centre of step i's tread (local x = 0), at the outer edge.
        const treadAnchor = (i: number): [number, number, number] => {
          const t  = (i + 0.5) / numSteps;
          const cx = stair.start.x + dx * t;
          const cy = stair.start.y + (i + 0.5) * stepRise;
          const cz = stair.start.z + dz * t;
          return toWorld(0, hh, localZ, cx, cy, cz);
        };

        // Balusters: every Nth step, always including the top step for support.
        if (showPosts) {
          const placePost = (i: number): void => {
            const [nx, ny, nz] = treadAnchor(i);
            addRail(new THREE.BoxGeometry(postT, handrailH, postT), nx, ny + handrailH / 2, nz);
          };
          for (let i = 0; i < numSteps; i += stepEvery) placePost(i);
          if ((numSteps - 1) % stepEvery !== 0) placePost(numSteps - 1);
        }

        // Top rail — spans first→last tread anchor + a symmetric overhang each end,
        // raised by handrailH. Grows about the fixed midpoint, so the end posts don't move.
        if (showTopRail && numSteps >= 2) {
          const [ax, ay, az] = treadAnchor(0);
          const [bx, by, bz] = treadAnchor(numSteps - 1);
          const len = Math.hypot(bx - ax, by - ay, bz - az) + 2 * overhang;
          addRail(
            new THREE.BoxGeometry(len, railBarT, railBarT),
            (ax + bx) / 2, (ay + by) / 2 + handrailH, (az + bz) / 2, slopeQuat,
          );
        }
      }
    }

    // ── CSG cutter wireframe ─────────────────────────────────────────────────
    if (stair.csgCutter) {
      const { offset, width, depth, height } = stair.csgCutter;
      const wx = stair.end.x + offset.x;
      const wy = stair.end.y + offset.y;
      const wz = stair.end.z + offset.z;

      const boxGeo   = new THREE.BoxGeometry(width, height, depth);
      const edgesGeo = new THREE.EdgesGeometry(boxGeo);
      boxGeo.dispose();
      const wireframe = new THREE.LineSegments(
        edgesGeo,
        new THREE.LineBasicMaterial({ color: 0xffdd00, depthTest: false, transparent: true, opacity: 0.8 }),
      );
      wireframe.position.set(wx, wy, wz);
      const DEG2RAD = Math.PI / 180;
      wireframe.rotation.set(
        (stair.csgCutter.rotation?.x ?? 0) * DEG2RAD,
        (stair.csgCutter.rotation?.y ?? 0) * DEG2RAD,
        (stair.csgCutter.rotation?.z ?? 0) * DEG2RAD,
      );
      wireframe.userData = {
        editorId: stair.id, editorType: "stair", zoneId,
        selectable: false, floorLevel: 0, _ownsMaterial: true, editorOnly: true,
      } satisfies MeshUserData;
      meshes.push(wireframe as unknown as THREE.Mesh);
    }

    const colliders = ColliderBuilder.registerStairSteps(stair);
    return { meshes, colliders };
  }
}
