import * as THREE from "three";
import { ColliderBuilder } from "@/physics/ColliderBuilder";
import { assetManager } from "@/core/AssetManager";
import { csgSubtract } from "@/utils/csg";
import type { PlatformDef, MeshUserData, Vec2 } from "@/types";
import type RAPIER from "@dimforge/rapier3d-compat";

export interface PlatformBuildOutput {
  meshes:    THREE.Mesh[];
  collider:  RAPIER.Collider;
}

// ── Shared face helper ────────────────────────────────────────────────────────

function pushFace(
  pos: number[], nrm: number[], uv: number[], idx: number[], vi: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  dx: number, dy: number, dz: number,
  nx: number, ny: number, nz: number,
  uScl: number, vScl: number,
): void {
  pos.push(ax, ay, az,  bx, by, bz,  cx, cy, cz,  dx, dy, dz);
  nrm.push(nx, ny, nz,  nx, ny, nz,  nx, ny, nz,  nx, ny, nz);
  uv.push(0, 0,  uScl, 0,  uScl, vScl,  0, vScl);
  idx.push(vi, vi+2, vi+1,  vi, vi+3, vi+2);
}

function makeGeo(pos: number[], nrm: number[], uv: number[], idx: number[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal",   new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute("uv",       new THREE.Float32BufferAttribute(uv,  2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

// ── Rect slab ─────────────────────────────────────────────────────────────────

function buildSlabCapGeo(w: number, h: number, d: number, ts: number): THREE.BufferGeometry {
  const hw = w/2, hh = h/2, hd = d/2;
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  let vi = 0;
  const f = (...a: Parameters<typeof pushFace>) => { pushFace(...a); vi += 4; };
  // +Y top
  f(pos,nrm,uv,idx,vi,  -hw, hh,-hd,  hw, hh,-hd,  hw, hh, hd,  -hw, hh, hd,  0,1,0, w*ts,d*ts);
  // -Y bottom
  f(pos,nrm,uv,idx,vi,  -hw,-hh, hd,  hw,-hh, hd,  hw,-hh,-hd,  -hw,-hh,-hd,  0,-1,0, w*ts,d*ts);
  return makeGeo(pos, nrm, uv, idx);
}

function buildSlabSideGeo(w: number, h: number, d: number, ts: number): THREE.BufferGeometry {
  const hw = w/2, hh = h/2, hd = d/2;
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  let vi = 0;
  const f = (...a: Parameters<typeof pushFace>) => { pushFace(...a); vi += 4; };
  // +Z front
  f(pos,nrm,uv,idx,vi,  -hw, hh, hd,  hw, hh, hd,  hw,-hh, hd,  -hw,-hh, hd,  0,0,1, w*ts,h*ts);
  // -Z back
  f(pos,nrm,uv,idx,vi,   hw, hh,-hd, -hw, hh,-hd, -hw,-hh,-hd,   hw,-hh,-hd,  0,0,-1, w*ts,h*ts);
  // +X right
  f(pos,nrm,uv,idx,vi,   hw, hh, hd,  hw, hh,-hd,  hw,-hh,-hd,   hw,-hh, hd,  1,0,0, d*ts,h*ts);
  // -X left
  f(pos,nrm,uv,idx,vi,  -hw, hh,-hd, -hw, hh, hd, -hw,-hh, hd,  -hw,-hh,-hd, -1,0,0, d*ts,h*ts);
  return makeGeo(pos, nrm, uv, idx);
}

// ── Polygon slab ──────────────────────────────────────────────────────────────

function buildPolygonCapGeo(points: Vec2[], cx: number, cz: number, thickness: number, tileScale: number): THREE.BufferGeometry {
  // Signed area in world XZ: positive = CW from above (Z goes away from viewer in top-down).
  // ShapeGeometry needs a CCW shape in XY to produce front-face normals in +Z → after
  // rotateX(-π/2) those become +Y (visible from above).  The shape uses y = -(worldZ - cz),
  // so a CW-from-above world polygon maps to a CW XY shape — wrong.  Reverse points to fix.
  let area2 = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!;
    area2 += (a.x - cx) * (b.z - cz) - (b.x - cx) * (a.z - cz);
  }
  const orderedPoints = area2 > 0 ? [...points].reverse() : points;

  const shape = new THREE.Shape();
  const first = orderedPoints[0]!;
  shape.moveTo(first.x - cx, -(first.z - cz));
  for (let i = 1; i < orderedPoints.length; i++) {
    const pt = orderedPoints[i]!;
    shape.lineTo(pt.x - cx, -(pt.z - cz));
  }
  shape.closePath();

  // Top cap: ShapeGeometry in XY plane → rotateX(-π/2) → XZ plane at y=0 → translate to top face
  const topGeo = new THREE.ShapeGeometry(shape);
  topGeo.rotateX(-Math.PI / 2);
  topGeo.translate(0, thickness / 2, 0);

  // Bottom cap: same but at y = -thickness/2 with reversed winding → normal points -Y
  const botGeo = new THREE.ShapeGeometry(shape);
  botGeo.rotateX(-Math.PI / 2);
  botGeo.translate(0, -thickness / 2, 0);
  const botIdx = botGeo.getIndex();
  if (botIdx) {
    for (let i = 0; i < botIdx.count; i += 3) {
      const a = botIdx.getX(i + 1);
      botIdx.setX(i + 1, botIdx.getX(i + 2));
      botIdx.setX(i + 2, a);
    }
    botIdx.needsUpdate = true;
    botGeo.computeVertexNormals();
  }

  // Remap UVs to world-scale tiling for both caps
  for (const geo of [topGeo, botGeo]) {
    const p = geo.attributes["position"] as THREE.BufferAttribute;
    const u = geo.attributes["uv"]       as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) u.setXY(i, p.getX(i) * tileScale, p.getZ(i) * tileScale);
    u.needsUpdate = true;
  }

  // Merge top + bottom into one geometry
  const posT = topGeo.attributes["position"] as THREE.BufferAttribute;
  const nrmT = topGeo.attributes["normal"]   as THREE.BufferAttribute;
  const uvT  = topGeo.attributes["uv"]       as THREE.BufferAttribute;
  const idxT = topGeo.getIndex()!;
  const posB = botGeo.attributes["position"] as THREE.BufferAttribute;
  const nrmB = botGeo.attributes["normal"]   as THREE.BufferAttribute;
  const uvB  = botGeo.attributes["uv"]       as THREE.BufferAttribute;
  const idxB = botGeo.getIndex()!;
  const off = posT.count;

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute([...posT.array, ...posB.array], 3));
  merged.setAttribute("normal",   new THREE.Float32BufferAttribute([...nrmT.array, ...nrmB.array], 3));
  merged.setAttribute("uv",       new THREE.Float32BufferAttribute([...uvT.array,  ...uvB.array],  2));
  merged.setIndex([...Array.from(idxT.array), ...Array.from(idxB.array).map(i => i + off)]);
  merged.computeBoundingSphere();

  topGeo.dispose();
  botGeo.dispose();
  return merged;
}

function buildPolygonSideGeo(points: Vec2[], cx: number, cz: number, thickness: number, tileScale: number): THREE.BufferGeometry {
  const n = points.length;

  // Signed shoelace area in XZ to detect CW-vs-CCW when viewed from above (+Y)
  // Positive = CW from above (in Three.js top-down view where Z goes away from viewer)
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i]!, b = points[(i + 1) % n]!;
    area2 += (a.x - cx) * (b.z - cz) - (b.x - cx) * (a.z - cz);
  }
  const nSign = area2 >= 0 ? 1 : -1;

  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  let vi = 0, arcLen = 0;

  for (let i = 0; i < n; i++) {
    const p1 = points[i]!, p2 = points[(i + 1) % n]!;
    const lx1 = p1.x - cx, lz1 = p1.z - cz;
    const lx2 = p2.x - cx, lz2 = p2.z - cz;
    const dx = lx2 - lx1, dz = lz2 - lz1;
    const edgeLen = Math.hypot(dx, dz) || 1e-6;

    // Outward normal in XZ plane (Y=0 for vertical side walls)
    const nx = nSign * dz / edgeLen;
    const nz = nSign * (-dx) / edgeLen;

    const yB = -thickness / 2, yT = thickness / 2;
    pos.push(lx1, yB, lz1,  lx2, yB, lz2,  lx2, yT, lz2,  lx1, yT, lz1);
    nrm.push(nx, 0, nz,  nx, 0, nz,  nx, 0, nz,  nx, 0, nz);

    const u0 = arcLen * tileScale, u1 = (arcLen + edgeLen) * tileScale;
    const v1 = thickness * tileScale;
    uv.push(u0, 0,  u1, 0,  u1, v1,  u0, v1);

    // Winding: for outward -Z normal on a CW-from-above edge (e.g. TL→TR, dx=2,dz=0),
    // cross-product test shows A→C→B gives -Z front face.  CCW-from-above is opposite.
    if (nSign > 0) idx.push(vi, vi+2, vi+1,  vi, vi+3, vi+2);
    else           idx.push(vi, vi+1, vi+2,  vi, vi+2, vi+3);

    vi += 4;
    arcLen += edgeLen;
  }

  return makeGeo(pos, nrm, uv, idx);
}

// ── Builder ───────────────────────────────────────────────────────────────────

export class PlatformBuilder {
  static async build(platform: PlatformDef, zoneId: string, cutterMeshes: THREE.Mesh[] = []): Promise<PlatformBuildOutput> {
    const ovr     = platform.materialOverrides;
    const baseDef = assetManager.getMaterialDef(platform.material);
    const tileScale = ovr?.tileScale ?? baseDef?.tileScale ?? 1.0;

    const mat = ovr
      ? await assetManager.getMaterialWithOverrides(platform.material, ovr)
          .catch(() => assetManager.getDefaultMaterial(0x667788))
      : await assetManager.getMaterial(platform.material)
          .catch(() => assetManager.getDefaultMaterial(0x667788));

    const sideOvr   = platform.sideMaterialOverrides;
    const sideMatId = platform.sideMaterial;
    const sideBaseDef = sideMatId ? assetManager.getMaterialDef(sideMatId) : null;
    const sideTileScale = sideOvr?.tileScale ?? sideBaseDef?.tileScale ?? tileScale;

    const sideMat: THREE.Material = sideMatId
      ? (sideOvr
          ? await assetManager.getMaterialWithOverrides(sideMatId, sideOvr)
              .catch(() => assetManager.getDefaultMaterial(0x667788))
          : await assetManager.getMaterial(sideMatId)
              .catch(() => assetManager.getDefaultMaterial(0x667788)))
      : mat;

    const { position: p, size, thickness } = platform;
    const floorLevel = platform.floorLevel ?? 0;
    const meshes: THREE.Mesh[] = [];

    const isPolygon = !!(platform.points && platform.points.length >= 3);

    let capGeo  = isPolygon
      ? buildPolygonCapGeo(platform.points!, p.x, p.z, thickness, tileScale)
      : buildSlabCapGeo(size.width, thickness, size.depth, tileScale);
    const sideGeo = isPolygon
      ? buildPolygonSideGeo(platform.points!, p.x, p.z, thickness, sideTileScale)
      : buildSlabSideGeo(size.width, thickness, size.depth, sideTileScale);

    const slabY = p.y + thickness / 2;

    // Apply CSG cuts — translate cap geo to world space, cut, result stays in world space
    let capInWorldSpace = false;
    if (cutterMeshes.length > 0) {
      const worldCapGeo = capGeo.clone();
      worldCapGeo.translate(p.x, slabY, p.z);
      let workMesh: THREE.Mesh = new THREE.Mesh(worldCapGeo, new THREE.MeshBasicMaterial());
      workMesh.updateMatrixWorld();
      let prevIsOriginal = true;
      for (const cutter of cutterMeshes) {
        const prev = workMesh;
        workMesh = csgSubtract(workMesh, cutter);
        workMesh.updateMatrixWorld();
        if (!prevIsOriginal) prev.geometry.dispose();
        prevIsOriginal = false;
      }
      worldCapGeo.dispose();
      capGeo = workMesh.geometry;
      capGeo.setAttribute('uv2', capGeo.attributes['uv']?.clone() ?? capGeo.attributes['position'].clone());
      capInWorldSpace = true;
    }

    const capMesh = new THREE.Mesh(capGeo, mat);
    capMesh.position.set(capInWorldSpace ? 0 : p.x, capInWorldSpace ? 0 : slabY, capInWorldSpace ? 0 : p.z);
    capMesh.receiveShadow = true;
    capMesh.castShadow    = true;
    capMesh.userData = {
      editorId:      platform.id,
      editorType:    "platform",
      zoneId,
      selectable:    true,
      floorLevel,
      _ownsMaterial: !!ovr,
    } satisfies MeshUserData;
    meshes.push(capMesh);

    const sideMesh = new THREE.Mesh(sideGeo, sideMat);
    sideMesh.position.set(p.x, slabY, p.z);
    sideMesh.receiveShadow = true;
    sideMesh.castShadow    = true;
    sideMesh.userData = {
      editorId:      platform.id,
      editorType:    "platform",
      zoneId,
      selectable:    false,
      floorLevel,
      _ownsMaterial: !!(sideMatId && sideOvr),
    } satisfies MeshUserData;
    meshes.push(sideMesh);

    // ── Railings ─────────────────────────────────────────────────────────────
    if (platform.hasRailing) {
      const rh  = platform.railingHeight;
      const rt  = 0.06;
      const ry  = p.y + thickness + rh / 2;
      const railMat = new THREE.MeshStandardMaterial({
        color: 0x9aabb8, roughness: 0.4, metalness: 0.4,
      });

      const railConfigs = [
        { w: size.width, h: rh, d: rt, dx: 0,               dz: -size.depth / 2 },
        { w: size.width, h: rh, d: rt, dx: 0,               dz:  size.depth / 2 },
        { w: rt, h: rh, d: size.depth - rt * 2, dx: -size.width / 2, dz: 0 },
        { w: rt, h: rh, d: size.depth - rt * 2, dx:  size.width / 2, dz: 0 },
      ];

      for (let i = 0; i < railConfigs.length; i++) {
        const cfg  = railConfigs[i]!;
        const geo  = new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d);
        const mesh = new THREE.Mesh(geo, railMat);
        mesh.position.set(p.x + cfg.dx, ry, p.z + cfg.dz);
        mesh.castShadow = true;
        mesh.userData = {
          editorId:      platform.id,
          editorType:    "platform",
          zoneId,
          selectable:    false,
          floorLevel,
          _ownsMaterial: i === 0,
        } satisfies MeshUserData;
        meshes.push(mesh);
      }
    }

    const collider = ColliderBuilder.registerPlatform(platform);
    return { meshes, collider };
  }
}
