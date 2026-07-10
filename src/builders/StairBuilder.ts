import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { ColliderBuilder } from "@/physics/ColliderBuilder";
import type { StairRailBarrier } from "@/physics/ColliderBuilder";
import { assetManager } from "@/core/AssetManager";
import { applyUVOffset } from "@/builders/UVUtils";
import { computeStairLayout, computeRailPaths, computeStairRamps, frameToWorld, isPlainStair, STAIR_RAMP_THICK, STAIR_RAMP_LIFT } from "@/builders/stairLayout";
import type { LandingSpec } from "@/builders/stairLayout";
import type { StairDef, StairUndersideMode, MeshUserData, Vec3 } from "@/types";
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

    // Landing material — mirrors the riser fallback chain (absent → body).
    const landOvr   = stair.landingMaterialOverrides;
    const landMatId = stair.landingMaterial;
    const landBaseDef = landMatId ? assetManager.getMaterialDef(landMatId) : null;
    const landTs = landOvr?.tileScale ?? landBaseDef?.tileScale ?? ts;
    const landMat: THREE.Material = landMatId
      ? (landOvr
          ? await assetManager.getMaterialWithOverrides(landMatId, landOvr)
              .catch(() => assetManager.getDefaultMaterial(0x6a7a8a))
          : await assetManager.getMaterial(landMatId)
              .catch(() => assetManager.getDefaultMaterial(0x6a7a8a)))
      : mat;

    // Flight/landing layout (Phase 29). A plain stair (single flight, no
    // landing) yields exactly one FlightSpec equal to the def's start/end, so
    // the legacy geometry falls out unchanged.
    const layout = computeStairLayout(stair);
    const plain  = isPlainStair(stair);

    // Flight-1 constants — used by the legacy railing branch and the CSG cutter.
    const heightDiff = stair.end.y - stair.start.y;
    const dx         = stair.end.x - stair.start.x;
    const dz         = stair.end.z - stair.start.z;
    const horizDist  = Math.hypot(dx, dz);
    const angle      = Math.atan2(dz, dx);

    const numSteps  = layout.numSteps;
    const stepRise  = heightDiff / numSteps;
    const stepDepth = horizDist / numSteps;
    const hh = stepRise  / 2;
    const hd = stair.width / 2;

    // Underside style. "open" = current free-floating stepped boxes; "diagonal" = solid
    // wedge with a slanted soffit; "closed" = solid down to the floor.
    // `thickness` = clearance below the step undersides (the visible stringer depth). The
    // soffit drops that far below the inner step corners, so the internal drop below the
    // nosing line is clearance + stepRise (always > stepRise → side panels never invert).
    const undersideMode = stair.underside?.mode ?? "open";

    // Transform a local point + world step-center offset into world coords,
    // in flight 1's frame (legacy railing branch).
    const cosA1 = Math.cos(angle);
    const sinA1 = Math.sin(angle);
    const toWorld1 = (
      lx: number, ly: number, lz: number,
      cx: number, cy: number, cz: number,
    ): [number, number, number] => [
      lx * cosA1 - lz * sinA1 + cx,
      ly + cy,
      lx * sinA1 + lz * cosA1 + cz,
    ];

    const body:    StepAccum = { pos: [], nrm: [], uv: [], idx: [], vi: 0 };
    const riser:   StepAccum = { pos: [], nrm: [], uv: [], idx: [], vi: 0 };
    const landAcc: StepAccum = { pos: [], nrm: [], uv: [], idx: [], vi: 0 };

    // ── One flight of steps (the pre-Phase-29 per-step loop, verbatim, with
    // the flight's own start/end in place of the def's) ─────────────────────
    const emitFlight = (fStart: Vec3, fEnd: Vec3, mode: StairUndersideMode): void => {
    const fdx         = fEnd.x - fStart.x;
    const fdz         = fEnd.z - fStart.z;
    const fAngle      = Math.atan2(fdz, fdx);
    const hw          = stepDepth / 2;

    const stringerGap = Math.max(stair.underside?.thickness ?? 0.25, 0.02);
    const effThk      = stringerGap + stepRise;

    // Rotation matrix for rotation.y = -angle  (local → world direction)
    const cosA =  Math.cos(fAngle);
    const sinA =  Math.sin(fAngle);

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

    const undersideMode = mode;

    for (let i = 0; i < numSteps; i++) {
      const t  = (i + 0.5) / numSteps;
      const cx = fStart.x + fdx * t;
      const cy = fStart.y + (i + 0.5) * stepRise;
      const cz = fStart.z + fdz * t;

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
        const lyFB = undersideMode === "closed" ? fStart.y - cy : hh - effThk;       // front-bottom
        const lyBB = undersideMode === "closed" ? fStart.y - cy : 3 * hh - effThk;   // back-bottom
        const [sFBL_x, sFBL_y, sFBL_z] = toWorld(-hw, lyFB, -hd, cx, cy, cz);
        const [sFBR_x, sFBR_y, sFBR_z] = toWorld(-hw, lyFB,  hd, cx, cy, cz);
        const [sBBL_x, sBBL_y, sBBL_z] = toWorld( hw, lyBB, -hd, cx, cy, cz);
        const [sBBR_x, sBBR_y, sBBR_z] = toWorld( hw, lyBB,  hd, cx, cy, cz);

        // Continuous world-space UVs so the texture flows up the whole stringer instead of
        // restarting each step. Sides: u = run distance, v = world height. Soffit: u = run, v = width.
        const uF   = (i * stepDepth) / ts, uB = ((i + 1) * stepDepth) / ts;
        const vTop = (pTFR_y - fStart.y) / ts;
        const vFB  = (sFBR_y - fStart.y) / ts;
        const vBB  = (sBBR_y - fStart.y) / ts;

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
          const [fcTL_x, fcTL_y, fcTL_z] = toWorld(-hw, fStart.y - cy, -hd, cx, cy, cz);
          const [fcTR_x, fcTR_y, fcTR_z] = toWorld(-hw, fStart.y - cy,  hd, cx, cy, cz);
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
    };  // end emitFlight

    // ── One landing slab (Phase 29) ─────────────────────────────────────────
    // A box in the stairwell frame, emitted into the body accumulator so it
    // shares the tread material/overrides and stays part of the selectable
    // body mesh. Quad winding is corrected per-face because a "left" turn
    // mirrors the frame (turnVec = -right ⇒ determinant -1).
    const emitLanding = (l: LandingSpec): void => {
      const F = layout.frame;
      const pt = (u: number, v: number, y: number): [number, number, number] => {
        const w = frameToWorld(F, u, v, y);
        return [w.x, w.y, w.z];
      };
      // Push a quad with the desired outward normal, swapping winding if the
      // frame mirroring flipped it. Rendered normal of pushQuad ∝ (c-a)×(b-a).
      const quadN = (
        a: [number, number, number], b: [number, number, number],
        c: [number, number, number], d: [number, number, number],
        n: [number, number, number], uScl: number, vScl: number,
      ): void => {
        const gx = (c[1]-a[1])*(b[2]-a[2]) - (c[2]-a[2])*(b[1]-a[1]);
        const gy = (c[2]-a[2])*(b[0]-a[0]) - (c[0]-a[0])*(b[2]-a[2]);
        const gz = (c[0]-a[0])*(b[1]-a[1]) - (c[1]-a[1])*(b[0]-a[0]);
        const flip = gx*n[0] + gy*n[1] + gz*n[2] < 0;
        const [B, D] = flip ? [d, b] : [b, d];
        pushQuad(landAcc, ...a, ...B, ...c, ...D, ...n, uScl, vScl);
      };

      const du = l.uMax - l.uMin, dv = l.vMax - l.vMin, dh = l.topY - l.bottomY;
      const T00 = pt(l.uMin, l.vMin, l.topY),    T10 = pt(l.uMax, l.vMin, l.topY);
      const T11 = pt(l.uMax, l.vMax, l.topY),    T01 = pt(l.uMin, l.vMax, l.topY);
      const B00 = pt(l.uMin, l.vMin, l.bottomY), B10 = pt(l.uMax, l.vMin, l.bottomY);
      const B11 = pt(l.uMax, l.vMax, l.bottomY), B01 = pt(l.uMin, l.vMax, l.bottomY);

      const dirN:  [number, number, number] = [F.dir.x, 0, F.dir.z];
      const dirNn: [number, number, number] = [-F.dir.x, 0, -F.dir.z];
      const tN:    [number, number, number] = [F.turnVec.x, 0, F.turnVec.z];
      const tNn:   [number, number, number] = [-F.turnVec.x, 0, -F.turnVec.z];

      quadN(T00, T10, T11, T01, [0, 1, 0],  du / landTs, dv / landTs);   // top (walking surface)
      quadN(B00, B01, B11, B10, [0, -1, 0], du / landTs, dv / landTs);   // underside
      quadN(T00, T10, B10, B00, tNn,  du / landTs, dh / landTs);         // side v = vMin
      quadN(T01, T11, B11, B01, tN,   du / landTs, dh / landTs);         // side v = vMax
      quadN(T00, T01, B01, B00, dirNn, dv / landTs, dh / landTs);        // side u = uMin
      quadN(T10, T11, B11, B10, dirN,  dv / landTs, dh / landTs);        // side u = uMax
    };

    // Emit every flight (upper flights downgrade "closed" to the diagonal
    // soffit — a closed column under flight k ≥ 1 would swallow the flight or
    // landing directly beneath it) and every landing.
    for (let k = 0; k < layout.flights.length; k++) {
      const effMode: StairUndersideMode =
        undersideMode === "closed" && k > 0 ? "diagonal" : undersideMode;
      emitFlight(layout.flights[k].start, layout.flights[k].end, effMode);
    }
    for (const l of layout.landings) emitLanding(l);

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

    // Landing slabs get their own mesh so they can carry their own material.
    if (landAcc.vi > 0) {
      const landGeo = accumToGeo(landAcc);
      applyUVOffset(landGeo, landOvr?.offsetX ?? ovr?.offsetX ?? 0, landOvr?.offsetY ?? ovr?.offsetY ?? 0);
      const landMesh = new THREE.Mesh(landGeo, landMat);
      landMesh.castShadow    = true;
      landMesh.receiveShadow = true;
      landMesh.userData = {
        editorId: stair.id, editorType: "stair", zoneId,
        selectable: true, floorLevel: 0, _ownsMaterial: !!(landMatId && landOvr),
      } satisfies MeshUserData;
      meshes.push(landMesh);
    }

    // ── Railings ─────────────────────────────────────────────────────────────
    // An open railing per side: a thin top rail following the slope, carried by
    // vertical balusters spaced up the run.
    const railBarriers: StairRailBarrier[] = [];
    if (stair.hasRailing) {
      const r           = stair.railing;
      const showTopRail = r?.topRail   ?? true;
      const showPosts   = r?.balusters ?? true;
      // Per-side baluster toggles; inner = the turn side (void side of a switchback).
      const postsInner  = r?.balustersInner ?? showPosts;
      const postsOuter  = r?.balustersOuter ?? showPosts;
      const handrailH   = r?.height        ?? 0.9;    // top rail height above the step nosings
      const railBarT    = r?.barThickness  ?? 0.1;    // top-rail cross-section
      const postT       = r?.postThickness ?? 0.06;   // baluster cross-section
      const stepEvery   = Math.max(1, Math.round(r?.stepInterval ?? 1));
      const sideInset   = r?.sideInset ?? 0.1;         // inward offset from the step's side edge
      const overhang    = r?.overhang  ?? 0.15;        // top-rail extension past the end posts, each end

      // Rail/post material — an authored material if set, else the built-in
      // metal grey. Overrides clone (owned); a plain authored material is the
      // shared cached instance (not owned); the built-in grey is owned.
      const railMatId = stair.railingMaterial;
      const railMatOvr = stair.railingMaterialOverrides;
      let railMat: THREE.Material;
      let railMatOwned: boolean;
      if (railMatId) {
        railMat = railMatOvr
          ? await assetManager.getMaterialWithOverrides(railMatId, railMatOvr)
              .catch(() => assetManager.getDefaultMaterial(0x9aabb8))
          : await assetManager.getMaterial(railMatId)
              .catch(() => assetManager.getDefaultMaterial(0x9aabb8));
        railMatOwned = !!railMatOvr;
      } else {
        railMat = new THREE.MeshStandardMaterial({ color: 0x9aabb8, roughness: 0.4, metalness: 0.4 });
        railMatOwned = true;
      }

      // Fake-round shading: side-face normals bent radially outward from the
      // bar's long axis, so square bars and posts light like cylinders while
      // the silhouette stays boxy (classic cheap-rail trick). Faces whose
      // normal points mostly along the axis — end caps, tip chamfers, miter
      // cuts — keep their flat shading so ends still read as cut.
      const roundNormals = (geo: THREE.BufferGeometry, axis: THREE.Vector3): void => {
        const pos = geo.attributes.position, nrm = geo.attributes.normal;
        const v = new THREE.Vector3(), n = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          n.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
          if (Math.abs(n.dot(axis)) > 0.5) continue;
          v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
          v.addScaledVector(axis, -v.dot(axis));   // radial from the centerline
          if (v.lengthSq() < 1e-12) continue;
          v.normalize();
          nrm.setXYZ(i, v.x, v.y, v.z);
        }
        nrm.needsUpdate = true;
      };
      const X_AXIS = new THREE.Vector3(1, 0, 0);
      // Octagonal cross-section for all rail bars (across-flats = barThickness,
      // flat top face): with the radial normals the bars read as true cylinders
      // even up close, at a fraction of a real cylinder's cost.
      const SEC_R = (railBarT / 2) / Math.cos(Math.PI / 8);
      const SEC: [number, number][] = Array.from({ length: 8 }, (_, i) => {
        const a = Math.PI / 8 + i * (Math.PI / 4);
        return [SEC_R * Math.sin(a), SEC_R * Math.cos(a)];
      });
      // Posts: 8-sided prisms (CylinderGeometry's side normals are already
      // smooth, so they shade round out of the box).
      const postR = (postT / 2) / Math.cos(Math.PI / 8);
      const postGeo = (): THREE.BufferGeometry =>
        new THREE.CylinderGeometry(postR, postR, handrailH, 8);

      let ownsMat = railMatOwned;
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

      // A thin barrier wall under one rail run (A→B along the walking/anchor
      // line), from the surface up to handrailH, so the character can't pass
      // through the rail. `quat`/`yAxis` come from the same slope basis the
      // visible rail uses; the wall is centered half a handrail height up
      // along yAxis. Built regardless of the topRail/baluster visual toggles.
      const railBarrierThk = Math.max(postT, railBarT);
      const addBarrier = (
        ax: number, ay: number, az: number,
        bx: number, by: number, bz: number,
        quat: THREE.Quaternion, yAxis: THREE.Vector3,
      ): void => {
        const len = Math.hypot(bx - ax, by - ay, bz - az);
        if (len < 1e-6) return;
        railBarriers.push({
          center: {
            x: (ax + bx) / 2 + yAxis.x * (handrailH / 2),
            y: (ay + by) / 2 + yAxis.y * (handrailH / 2),
            z: (az + bz) / 2 + yAxis.z * (handrailH / 2),
          },
          half: { x: len / 2, y: handrailH / 2, z: railBarrierThk / 2 },
          quat: { x: quat.x, y: quat.y, z: quat.z, w: quat.w },
        });
      };

      // Top-rail bar geometry along local X, spanning exactly ±len/2 (callers
      // bake any miter extension into len). Octagonal cross-section; a tapered
      // free end keeps its reach but chamfers all around (the tip section
      // shrinks toward the axis over the last `chamf` of length).
      const railBarGeo = (len: number, taperStart: boolean, taperEnd: boolean): THREE.BufferGeometry => {
        const c = 0.3 * railBarT;
        if (len < 3 * c) taperStart = taperEnd = false;
        const tipScale = Math.max(0.2, 1 - c / SEC_R);
        const pts: THREE.Vector3[] = [];
        const end = (x: number, taper: boolean, inward: 1 | -1): void => {
          for (const [oy, oz] of SEC) {
            if (taper) {
              pts.push(new THREE.Vector3(x, oy * tipScale, oz * tipScale));
              pts.push(new THREE.Vector3(x + inward * c, oy, oz));
            } else {
              pts.push(new THREE.Vector3(x, oy, oz));
            }
          }
        };
        end(-len / 2, taperStart, 1);
        end(len / 2, taperEnd, -1);
        const geo = new ConvexGeometry(pts);
        roundNormals(geo, X_AXIS);
        return geo;
      };

      if (plain) {
        // ── Legacy single-flight railing (pre-Phase-29, unchanged) ──────────
        // Orthonormal basis aligned to the slope:
        //   xAxis → up the slope, zAxis → horizontal side, yAxis → perpendicular up.
        const xAxis = new THREE.Vector3(dx, heightDiff, dz).normalize();
        const zAxis = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
        const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
        const slopeQuat = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis),
        );

        for (let side = -1; side <= 1; side += 2) {
          // Local +Z is right of travel; the turn side (= inner) is right for
          // turn:"right", left otherwise.
          const sideIsInner = (side === 1) === ((stair.turn ?? "left") === "right");
          const sidePosts   = sideIsInner ? postsInner : postsOuter;
          const localZ = side * Math.max(postT / 2, hd - sideInset);   // inset from the step edge

          // Anchor on the centre of step i's tread (local x = 0), at the outer edge.
          const treadAnchor = (i: number): [number, number, number] => {
            const t  = (i + 0.5) / numSteps;
            const cx = stair.start.x + dx * t;
            const cy = stair.start.y + (i + 0.5) * stepRise;
            const cz = stair.start.z + dz * t;
            return toWorld1(0, hh, localZ, cx, cy, cz);
          };

          // Balusters: every Nth step, always including the top step for support.
          if (sidePosts) {
            const placePost = (i: number): void => {
              const [nx, ny, nz] = treadAnchor(i);
              addRail(postGeo(), nx, ny + handrailH / 2, nz);
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
              railBarGeo(len, true, true),
              (ax + bx) / 2, (ay + by) / 2 + handrailH, (az + bz) / 2, slopeQuat,
            );
          }

          // Collision barrier along the run (visual toggles don't affect it).
          if (numSteps >= 2) {
            const [ax, ay, az] = treadAnchor(0);
            const [bx, by, bz] = treadAnchor(numSteps - 1);
            const dl = Math.hypot(bx - ax, by - ay, bz - az) || 1;
            const ex = ((bx - ax) / dl) * overhang, ey = ((by - ay) / dl) * overhang, ez = ((bz - az) / dl) * overhang;
            addBarrier(ax - ex, ay - ey, az - ez, bx + ex, by + ey, bz + ez, slopeQuat, yAxis);
          }
        }
      } else {
        // ── Path railing (Phase 29): continuous polylines over flights and
        // landings — sloped runs, level landing runs, corner posts. Path
        // vertices sit at walking-surface height; rails render `handrailH`
        // above, posts rise from the vertex. Interior corners are mitered on
        // the bisector plane shared by both bars (no stubs); free path ends
        // get the chamfered tip.
        const rl = computeRailPaths(stair, layout);

        for (const { position: p, side } of rl.posts) {
          if (!(side === "inner" ? postsInner : postsOuter)) continue;
          addRail(postGeo(), p.x, p.y + handrailH / 2, p.z);
        }

        // One rail bar between two lifted path vertices, built in world space
        // around the segment midpoint (mesh gets no rotation). End kinds:
        //   free  — chamfered tip (both tip corners clipped 45°)
        //   miter — bisector-plane cut shared with the adjacent bar; only used
        //           when the sections actually match on that plane (planar bends)
        //   run   — level bar runs straight through a 3D corner: extend railH
        //           past the vertex, square end (its own clean piece)
        //   butt  — sloped bar dies into the through-running level bar: vertical
        //           cut flush with that bar's side face (railH back, horizontally)
        type BarEnd =
          | { kind: "free" }
          | { kind: "miter"; adj: THREE.Vector3 }
          | { kind: "run" }
          | { kind: "butt" };
        const chamf = 0.3 * railBarT;
        const railH = railBarT / 2;
        const railBar = (
          a: THREE.Vector3, b: THREE.Vector3,
          xAxis: THREE.Vector3, yAxis: THREE.Vector3, zAxis: THREE.Vector3,
          endA: BarEnd, endB: BarEnd,
        ): THREE.BufferGeometry => {
          const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
          const len = a.distanceTo(b);
          const pts: THREE.Vector3[] = [];
          // Point at `v` offset dx along the bar and (oy, oz) across it.
          const at = (v: THREE.Vector3, dx: number, oy: number, oz: number): THREE.Vector3 =>
            new THREE.Vector3().copy(v)
              .addScaledVector(xAxis, dx)
              .addScaledVector(yAxis, oy)
              .addScaledVector(zAxis, oz)
              .sub(mid);
          const addEnd = (v: THREE.Vector3, end: BarEnd, inward: 1 | -1): void => {
            if (end.kind === "miter") {
              const n = new THREE.Vector3().addVectors(xAxis, end.adj);
              const nd = n.lengthSq() > 1e-8 ? n.normalize().dot(xAxis) : 0;
              if (Math.abs(nd) > 1e-4) {
                // Long edges v+o+t·x̂ cut by the plane through v with normal n.
                for (const [oy, oz] of SEC) {
                  const o = new THREE.Vector3().addScaledVector(yAxis, oy).addScaledVector(zAxis, oz);
                  pts.push(at(v, -n.dot(o) / nd, oy, oz));
                }
                return;
              }
              // degenerate 180° bend → square cut below
            } else if (end.kind === "butt") {
              const H  = new THREE.Vector3(xAxis.x, 0, xAxis.z);
              const hx = H.length();
              if (hx > 1e-6) {
                H.divideScalar(hx);
                // Vertical plane through v + inward·railH·Ĥ with normal Ĥ.
                for (const [oy, oz] of SEC) {
                  const o = new THREE.Vector3().addScaledVector(yAxis, oy).addScaledVector(zAxis, oz);
                  pts.push(at(v, (inward * railH - o.dot(H)) / xAxis.dot(H), oy, oz));
                }
                return;
              }
            }
            const tip = end.kind === "free" && len >= 3 * chamf;   // square when too short
            const dx0 = end.kind === "run" ? -inward * railH : 0;
            const tipScale = Math.max(0.2, 1 - chamf / SEC_R);
            for (const [oy, oz] of SEC) {
              if (tip) {
                pts.push(at(v, 0, oy * tipScale, oz * tipScale));   // shrunk end face
                pts.push(at(v, inward * chamf, oy, oz));            // full-section shoulder
              } else {
                pts.push(at(v, dx0, oy, oz));
              }
            }
          };
          addEnd(a, endA, 1);
          addEnd(b, endB, -1);
          const geo = new ConvexGeometry(pts);
          roundNormals(geo, xAxis);
          return geo;
        };

        // A corner is mitered only when the two bars' sections line up on the
        // bisector plane: both level (plan bend) or same horizontal heading
        // (slope→level bend in a vertical plane). At 3D corners (heading turns
        // while sloped — the void crossings) the pieces separate instead: the
        // level bar runs through, the sloped bar butts into its side.
        const EPS = 1e-6;
        const planarBend = (d1: THREE.Vector3, d2: THREE.Vector3): boolean => {
          if (Math.abs(d1.y) < EPS && Math.abs(d2.y) < EPS) return true;
          const cross = d1.x * d2.z - d1.z * d2.x;
          const dot   = d1.x * d2.x + d1.z * d2.z;
          return Math.abs(cross) < EPS && dot > 0;
        };

        for (const { points: path } of rl.paths) {
          // Non-degenerate segments with unit directions, for miter adjacency.
          const segs: { a: THREE.Vector3; b: THREE.Vector3; dir: THREE.Vector3 }[] = [];
          for (let i = 0; i + 1 < path.length; i++) {
            const d = new THREE.Vector3(
              path[i + 1].x - path[i].x, path[i + 1].y - path[i].y, path[i + 1].z - path[i].z);
            if (d.lengthSq() < 1e-12) continue;
            segs.push({
              a: new THREE.Vector3(path[i].x, path[i].y, path[i].z),
              b: new THREE.Vector3(path[i + 1].x, path[i + 1].y, path[i + 1].z),
              dir: d.normalize(),
            });
          }
          for (let i = 0; i < segs.length; i++) {
            const { a, b, dir } = segs[i];
            const xAxis = dir;
            const zAxis = new THREE.Vector3(-dir.z, 0, dir.x).normalize();   // horizontal side
            const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
            const quat = new THREE.Quaternion().setFromRotationMatrix(
              new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis),
            );
            if (showTopRail) {
              const endOf = (adjIdx: number): BarEnd => {
                if (adjIdx < 0 || adjIdx >= segs.length) return { kind: "free" };
                const adj = segs[adjIdx].dir;
                if (planarBend(dir, adj)) return { kind: "miter", adj };
                return Math.abs(dir.y) < EPS ? { kind: "run" } : { kind: "butt" };
              };
              const up = new THREE.Vector3(0, handrailH, 0);
              const geo = railBar(
                new THREE.Vector3().copy(a).add(up), new THREE.Vector3().copy(b).add(up),
                xAxis, yAxis, zAxis, endOf(i - 1), endOf(i + 1),
              );
              addRail(geo, (a.x + b.x) / 2, (a.y + b.y) / 2 + handrailH, (a.z + b.z) / 2);
            }
            addBarrier(a.x, a.y, a.z, b.x, b.y, b.z, quat, yAxis);
          }
        }
      }
    }

    // ── Climb-ramp wireframes ────────────────────────────────────────────────
    // Editor-only visualization of the invisible climb-ramp colliders (cyan).
    // Never renders in preview/play (`editorOnly`).
    for (const rmp of computeStairRamps(layout)) {
      const seg = new THREE.Vector3(rmp.b.x - rmp.a.x, rmp.b.y - rmp.a.y, rmp.b.z - rmp.a.z);
      const len = seg.length();
      if (len < 1e-6) continue;
      const x = seg.divideScalar(len);
      const z = new THREE.Vector3(-x.z, 0, x.x).normalize();
      const y = new THREE.Vector3().crossVectors(z, x);
      const boxGeo   = new THREE.BoxGeometry(len, STAIR_RAMP_THICK, stair.width);
      const edgesGeo = new THREE.EdgesGeometry(boxGeo);
      boxGeo.dispose();
      const wire = new THREE.LineSegments(
        edgesGeo,
        new THREE.LineBasicMaterial({ color: 0x00ffcc, depthTest: false, transparent: true, opacity: 0.7 }),
      );
      const off = STAIR_RAMP_LIFT - STAIR_RAMP_THICK / 2;
      wire.position.set(
        (rmp.a.x + rmp.b.x) / 2 + y.x * off,
        (rmp.a.y + rmp.b.y) / 2 + y.y * off,
        (rmp.a.z + rmp.b.z) / 2 + y.z * off,
      );
      wire.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      wire.userData = {
        editorId: stair.id, editorType: "stair", zoneId,
        selectable: false, floorLevel: 0, _ownsMaterial: true, editorOnly: true,
      } satisfies MeshUserData;
      meshes.push(wire as unknown as THREE.Mesh);
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
    if (railBarriers.length) colliders.push(...ColliderBuilder.registerStairRailings(railBarriers));
    return { meshes, colliders };
  }
}
