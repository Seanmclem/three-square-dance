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

// Returns the ordered sequence of node IDs for a connected chain of walls.
// Determines traversal direction from the connection between walls[0] and walls[1].
function resolveRunNodeIds(walls: WallDef[]): string[] | null {
  if (walls.length === 0) return null;
  if (walls.length === 1) return [walls[0]!.startNodeId, walls[0]!.endNodeId];

  const w0 = walls[0]!, w1 = walls[1]!;
  const w1Nodes = new Set([w1.startNodeId, w1.endNodeId]);

  let nodeIds: string[];
  if (w1Nodes.has(w0.endNodeId)) {
    nodeIds = [w0.startNodeId, w0.endNodeId];
  } else if (w1Nodes.has(w0.startNodeId)) {
    nodeIds = [w0.endNodeId, w0.startNodeId];
  } else {
    return null;
  }

  for (let i = 1; i < walls.length; i++) {
    const prevNodeId = nodeIds[nodeIds.length - 1]!;
    const w = walls[i]!;
    if (w.startNodeId === prevNodeId) {
      nodeIds.push(w.endNodeId);
    } else if (w.endNodeId === prevNodeId) {
      nodeIds.push(w.startNodeId);
    } else {
      return null;
    }
  }

  return nodeIds;
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

    const ovr       = wall.materialOverrides;
    const baseDef   = assetManager.getMaterialDef(wall.material);
    const tileScale = ovr?.tileScale ?? baseDef?.tileScale ?? 1.0;

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
      _ownsMaterial: !!ovr,
    } satisfies MeshUserData;

    const colliders = ColliderBuilder.registerWallSegments(wall, 0, start, end);

    return { mesh, colliders };
  }

  // Builds a single continuous mesh for a chain of compatible walls with mitered corner joins.
  // All walls in the run must share material, exteriorMaterial, and height.
  static async buildRun(
    walls:  WallDef[],
    zoneId: string,
    zone:   ZoneDef,
    nodes:  Map<string, WallNode>,
  ): Promise<WallBuildOutput> {
    if (walls.length <= 1) return WallBuilder.build(walls[0]!, zoneId, zone, nodes);

    const nodeIds = resolveRunNodeIds(walls);
    if (!nodeIds) return WallBuilder.build(walls[0]!, zoneId, zone, nodes);

    const pts = nodeIds.map(id => {
      const n = nodes.get(id)!;
      return { x: n.x, z: n.z };
    });

    const wall      = walls[0]!;
    const H         = wall.height;
    const T         = wall.thickness;
    const ovr       = wall.materialOverrides;
    const baseDef   = assetManager.getMaterialDef(wall.material);
    const tileScale = ovr?.tileScale ?? baseDef?.tileScale ?? 1.0;

    // Cumulative arc-length for UV continuity across corners
    const cumDist: number[] = [0];
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]!, cur = pts[i]!;
      cumDist.push(cumDist[i - 1]! + Math.hypot(cur.x - prev.x, cur.z - prev.z));
    }

    // Left/right edge positions at each polyline point using miter bisectors at interior corners.
    // Normal formula: for direction (dx, dz), left normal = (dz/len, -dx/len) in XZ.
    const lefts:  { x: number; z: number }[] = [];
    const rights: { x: number; z: number }[] = [];

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      let mx: number, mz: number, mLen: number;

      if (i === 0) {
        const nxt = pts[1]!;
        const dx = nxt.x - p.x, dz = nxt.z - p.z;
        const len = Math.hypot(dx, dz) || 0.001;
        mx = dz / len; mz = -dx / len;
        mLen = T / 2;
      } else if (i === pts.length - 1) {
        const prv = pts[i - 1]!;
        const dx = p.x - prv.x, dz = p.z - prv.z;
        const len = Math.hypot(dx, dz) || 0.001;
        mx = dz / len; mz = -dx / len;
        mLen = T / 2;
      } else {
        // Miter bisector: average of the two adjacent segment normals
        const prv = pts[i - 1]!, nxt = pts[i + 1]!;
        const dx1 = p.x - prv.x, dz1 = p.z - prv.z;
        const len1 = Math.hypot(dx1, dz1) || 0.001;
        const nx1 = dz1 / len1, nz1 = -dx1 / len1;
        const dx2 = nxt.x - p.x, dz2 = nxt.z - p.z;
        const len2 = Math.hypot(dx2, dz2) || 0.001;
        const nx2 = dz2 / len2, nz2 = -dx2 / len2;
        const bx = nx1 + nx2, bz = nz1 + nz2;
        const bLen = Math.hypot(bx, bz) || 0.001;
        mx = bx / bLen; mz = bz / bLen;
        // miterLen = (T/2) / cos(half-angle); clamp cosine to prevent extreme miters
        const cosHalf = Math.max(nx1 * mx + nz1 * mz, 0.2);
        mLen = (T / 2) / cosHalf;
      }

      lefts.push({  x: p.x + mx * mLen, z: p.z + mz * mLen });
      rights.push({ x: p.x - mx * mLen, z: p.z - mz * mLen });
    }

    // Build indexed BufferGeometry.
    // Per polyline point: 4 vertices — LB(4i), LT(4i+1), RB(4i+2), RT(4i+3)
    // Face winding verified for correct outward normals (CCW from outside).
    const posArr: number[] = [];
    const uvArr:  number[] = [];
    const idxArr: number[] = [];

    for (let i = 0; i < pts.length; i++) {
      const l = lefts[i]!, r = rights[i]!;
      const u = cumDist[i]! / tileScale;
      const vTop = H / tileScale;
      posArr.push(l.x, 0, l.z,  l.x, H, l.z,  r.x, 0, r.z,  r.x, H, r.z);
      uvArr.push( u,   0, u,   vTop,  u,  0, u, vTop);
    }

    for (let i = 0; i < pts.length - 1; i++) {
      const LBi  = 4 * i,       LTi  = 4 * i + 1,     RBi  = 4 * i + 2,     RTi  = 4 * i + 3;
      const LBi1 = 4 * (i + 1), LTi1 = 4 * (i + 1) + 1, RBi1 = 4 * (i + 1) + 2, RTi1 = 4 * (i + 1) + 3;

      // Left face — outward normal points left
      idxArr.push(LBi, LTi, LTi1,  LBi, LTi1, LBi1);
      // Right face — outward normal points right
      idxArr.push(RBi, RBi1, RTi1,  RBi, RTi1, RTi);
      // Top face — outward normal points up
      idxArr.push(LTi, RTi, RTi1,  LTi, RTi1, LTi1);
    }

    // Start cap
    idxArr.push(0, 2, 3,  0, 3, 1);

    // End cap
    const L = pts.length - 1;
    idxArr.push(4*L, 4*L+1, 4*L+3,  4*L, 4*L+3, 4*L+2);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvArr,  2));
    geo.setAttribute('uv2',      new THREE.Float32BufferAttribute(uvArr.slice(), 2));
    geo.setIndex(idxArr);
    geo.computeVertexNormals();

    const mat = ovr
      ? await assetManager.getMaterialWithOverrides(wall.material, ovr)
          .catch(() => assetManager.getDefaultMaterial(0x4a5a6a))
      : await assetManager.getMaterial(wall.material)
          .catch(() => assetManager.getDefaultMaterial(0x4a5a6a));

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    mesh.userData = {
      editorId:      wall.id,
      editorType:    "wall",
      zoneId,
      selectable:    true,
      floorLevel:    wall.floor,
      _ownsMaterial: !!ovr,
    } satisfies MeshUserData;

    // One collider per wall segment using full (untrimmed) node positions
    const allColliders: RAPIER.Collider[] = [];
    for (const w of walls) {
      const sNode = nodes.get(w.startNodeId)!;
      const eNode = nodes.get(w.endNodeId)!;
      allColliders.push(
        ...ColliderBuilder.registerWallSegments(
          w, 0,
          { x: sNode.x, z: sNode.z },
          { x: eNode.x, z: eNode.z },
        ),
      );
    }

    return { mesh, colliders: allColliders };
  }
}
