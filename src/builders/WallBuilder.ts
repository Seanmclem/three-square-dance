import * as THREE from "three";
import { ColliderBuilder } from "@/physics/ColliderBuilder";
import { assetManager } from "@/core/AssetManager";
import { csgSubtract } from "@/utils/csg";
import { resolveRunNodeIds } from "@/utils/wallRuns";
import type { WallDef, ZoneDef, WallNode, MeshUserData, Opening } from "@/types";
import type RAPIER from "@dimforge/rapier3d-compat";

export interface WallBuildOutput {
  mesh:       THREE.Mesh;
  colliders:  RAPIER.Collider[];
  trimMeshes: THREE.Mesh[];
}

function applyBoxUVTiling(
  geo: THREE.BoxGeometry,
  W: number, H: number, D: number,
  tileX: number, tileY: number,
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
      uv.setXY(vi, uv.getX(vi) * uS * tileX, uv.getY(vi) * vS * tileY);
    }
  }
  uv.needsUpdate = true;
}

const TRIM_W = 0.08;

function createArchCutterGeo(width: number, height: number, thickness: number): THREE.BufferGeometry {
  const radius   = width / 2;
  const rectH    = height - radius;
  const archCy   = -height / 2 + rectH; // Y center of the semicircle in opening-local space
  const depth    = thickness + 0.1;

  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height / 2);
  shape.lineTo( width / 2, -height / 2);
  shape.lineTo( width / 2, archCy);
  shape.absarc(0, archCy, radius, 0, Math.PI, false);
  shape.lineTo(-width / 2, -height / 2);

  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2); // center along Z for wall thickness
  return geo;
}

// Builds the 4 inward-facing faces of a passage/opening tunnel as explicit geometry.
// Geometry is centered at origin in opening-local space (width × height × thickness).
// includeLintel: false for arch openings (arch curve replaces the top face).
function buildPassageLiner(
  W: number, H: number, T: number,
  tileH: number, tileV: number,
  includeLintel = true,
): THREE.BufferGeometry {
  const hw = W / 2, hh = H / 2, ht = T / 2;

  const pos: number[] = [], nrm: number[] = [], uv: number[] = [];

  const tri = (
    verts: [number, number, number][],
    nx: number, ny: number, nz: number,
    uvFn: (x: number, y: number, z: number) => [number, number],
  ) => {
    for (const [x, y, z] of verts) {
      pos.push(x, y, z);
      nrm.push(nx, ny, nz);
      uv.push(...uvFn(x, y, z));
    }
  };

  // Jamb UV: U = depth (Z from -ht→+ht), V = height (Y from -hh→+hh)
  const jUV = (x: number, y: number, z: number): [number, number] =>
    [(z + ht) * tileV, (y + hh) * tileV];

  // Sill/lintel UV: U = width (X from -hw→+hw), V = depth (Z from -ht→+ht)
  const hUV = (x: number, y: number, z: number): [number, number] =>
    [(x + hw) * tileH, (z + ht) * tileH];

  // Right jamb (x = +hw, normal = -X toward center)
  tri([[+hw,-hh,-ht],[+hw,-hh,+ht],[+hw,+hh,+ht]], -1, 0, 0, jUV);
  tri([[+hw,-hh,-ht],[+hw,+hh,+ht],[+hw,+hh,-ht]], -1, 0, 0, jUV);

  // Left jamb  (x = -hw, normal = +X toward center)
  tri([[-hw,-hh,-ht],[-hw,+hh,-ht],[-hw,+hh,+ht]], +1, 0, 0, jUV);
  tri([[-hw,-hh,-ht],[-hw,+hh,+ht],[-hw,-hh,+ht]], +1, 0, 0, jUV);

  // Top lintel (y = +hh, normal = -Y downward into opening)
  if (includeLintel) {
    tri([[-hw,+hh,-ht],[-hw,+hh,+ht],[+hw,+hh,+ht]], 0, -1, 0, hUV);
    tri([[-hw,+hh,-ht],[+hw,+hh,+ht],[+hw,+hh,-ht]], 0, -1, 0, hUV);
  }

  // Bottom sill (y = -hh, normal = +Y upward into opening)
  tri([[-hw,-hh,+ht],[+hw,-hh,+ht],[+hw,-hh,-ht]], 0, +1, 0, hUV);
  tri([[-hw,-hh,+ht],[+hw,-hh,-ht],[-hw,-hh,-ht]], 0, +1, 0, hUV);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal',   new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv',       new THREE.Float32BufferAttribute(uv,  2));
  g.setAttribute('uv2',      new THREE.Float32BufferAttribute([...uv], 2));
  return g;
}

interface LinerSetup {
  geo: THREE.BufferGeometry;
  px: number; py: number; pz: number;
  ry: number;
}

function buildTrimFrame(
  opening: Opening,
  length: number,
  wallHeight: number,
  wallThickness: number,
  cx: number,
  cz: number,
  angle: number,
  elevation = 0,
): THREE.Mesh[] {
  const TRIM_D = wallThickness + 0.06;
  // passage or trim disabled: clean hole, no trim
  if (opening.type === "passage" || opening.trim === false) return [];

  const localX = opening.offsetAlongWall + opening.width / 2 - length / 2;
  const localY = opening.elevation + opening.height / 2 - wallHeight / 2;
  const cos = Math.cos(angle), sin = Math.sin(angle);

  const meshes: THREE.Mesh[] = [];

  const addPiece = (lx: number, ly: number, w: number, h: number) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2d2d2d, roughness: 0.9 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, TRIM_D), mat);
    mesh.position.set(cx + cos * lx, elevation + wallHeight / 2 + ly, cz + sin * lx);
    mesh.rotation.y = -angle;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { selectable: false, _ownsMaterial: true };
    meshes.push(mesh);
  };

  // For arch openings the jambs only cover the straight rectangular part;
  // the arch curve needs no framing on its sides.
  const isArch  = opening.type === "arch";
  const jambH   = isArch
    ? (opening.height - opening.width / 2) + TRIM_W * 2
    : opening.height + TRIM_W * 2;
  const jambY   = isArch ? localY - opening.width / 4 : localY;

  addPiece(localX - opening.width / 2 - TRIM_W / 2, jambY, TRIM_W, jambH);
  addPiece(localX + opening.width / 2 + TRIM_W / 2, jambY, TRIM_W, jambH);
  // No straight header for arch (the arch curve IS the top)
  if (!isArch) {
    addPiece(localX, localY + opening.height / 2 + TRIM_W / 2, opening.width + TRIM_W * 2, TRIM_W);
  }
  // Sill for windows
  if (opening.type === "window") {
    addPiece(localX, localY - opening.height / 2 - TRIM_W / 2, opening.width + TRIM_W * 2, TRIM_W);
  }

  return meshes;
}

/**
 * Computes miter-bisected left/right corner positions at an open run endpoint.
 * If exactly one non-run wall connects at the node, a bisector miter is used
 * so the geometry flush-joins with the adjacent run. Otherwise returns a flat cap.
 *
 * isStart=true  → runDir is the OUTGOING direction from pt (start of run/wall).
 * isStart=false → runDir is the INCOMING direction into pt (end of run/wall).
 */
function endpointMiter(
  nodeId: string,
  pt: { x: number; z: number },
  runDir: { dx: number; dz: number },
  isStart: boolean,
  zone: ZoneDef,
  nodes: Map<string, WallNode>,
  runWallIds: Set<string>,
  T: number,
): { left: { x: number; z: number }; right: { x: number; z: number } } {
  const adjacent = zone.walls.filter(w =>
    !runWallIds.has(w.id) &&
    (w.startNodeId === nodeId || w.endNodeId === nodeId),
  );

  if (adjacent.length === 1) {
    const neighbor    = adjacent[0]!;
    const otherNodeId = neighbor.startNodeId === nodeId ? neighbor.endNodeId : neighbor.startNodeId;
    const otherNode   = nodes.get(otherNodeId);

    if (otherNode) {
      let dx1: number, dz1: number, dx2: number, dz2: number;
      if (isStart) {
        // incoming = from neighbor toward pt; outgoing = run's first segment
        dx1 = pt.x - otherNode.x; dz1 = pt.z - otherNode.z;
        dx2 = runDir.dx;           dz2 = runDir.dz;
      } else {
        // incoming = run's last segment; outgoing = toward neighbor
        dx1 = runDir.dx;                dz1 = runDir.dz;
        dx2 = otherNode.x - pt.x; dz2 = otherNode.z - pt.z;
      }
      const len1 = Math.hypot(dx1, dz1) || 0.001;
      const nx1 = dz1 / len1, nz1 = -dx1 / len1;
      const len2 = Math.hypot(dx2, dz2) || 0.001;
      const nx2 = dz2 / len2, nz2 = -dx2 / len2;
      const bx = nx1 + nx2, bz = nz1 + nz2;
      const bLen = Math.hypot(bx, bz) || 0.001;
      const mx = bx / bLen, mz = bz / bLen;
      const cosHalf = Math.max(nx1 * mx + nz1 * mz, 0.2);
      const mLen = (T / 2) / cosHalf;
      return {
        left:  { x: pt.x + mx * mLen, z: pt.z + mz * mLen },
        right: { x: pt.x - mx * mLen, z: pt.z - mz * mLen },
      };
    }
  }

  // Flat cap perpendicular to the run direction.
  const flatLen = Math.hypot(runDir.dx, runDir.dz) || 0.001;
  const nx = runDir.dz / flatLen, nz = -runDir.dx / flatLen;
  return {
    left:  { x: pt.x + nx * T / 2, z: pt.z + nz * T / 2 },
    right: { x: pt.x - nx * T / 2, z: pt.z - nz * T / 2 },
  };
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

    const totalDx  = rawEnd.x - rawStart.x;
    const totalDz  = rawEnd.z - rawStart.z;
    const totalLen = Math.hypot(totalDx, totalDz) || 0.001;
    const angle    = Math.atan2(totalDz, totalDx);
    const cos      = Math.cos(angle), sin = Math.sin(angle);
    const cx       = (rawStart.x + rawEnd.x) / 2;
    const cz       = (rawStart.z + rawEnd.z) / 2;

    const H  = wall.height;
    const T  = wall.thickness;
    const ovr       = wall.materialOverrides;
    const baseDef   = assetManager.getMaterialDef(wall.material);
    const tileScale = ovr?.tileScale ?? baseDef?.tileScale ?? 1.0;
    const tileX     = ovr?.tileScaleX ?? tileScale;
    const tileY     = ovr?.tileScaleY ?? tileScale;

    const runWallIds = new Set([wall.id]);
    const runDir     = { dx: totalDx, dz: totalDz };

    // Miter-correct corners at both endpoints using neighbor wall directions.
    // This ensures geometry is flush with adjacent run meshes at shared nodes.
    const startMiter = endpointMiter(
      wall.startNodeId, rawStart, runDir, true,
      zone, nodes, runWallIds, T,
    );
    const endMiter = endpointMiter(
      wall.endNodeId, rawEnd, runDir, false,
      zone, nodes, runWallIds, T,
    );

    // Build strip geometry in world space (Y: 0..H) — same structure as buildRun.
    // Vertices: 0=SL_bot 1=SL_top 2=SR_bot 3=SR_top 4=EL_bot 5=EL_top 6=ER_bot 7=ER_top
    const sl = startMiter.left, sr = startMiter.right;
    const el = endMiter.left,   er = endMiter.right;
    const posArr = [
      sl.x, 0, sl.z,  sl.x, H, sl.z,  sr.x, 0, sr.z,  sr.x, H, sr.z,
      el.x, 0, el.z,  el.x, H, el.z,  er.x, 0, er.z,  er.x, H, er.z,
    ];
    const uE = totalLen / tileX, vT = H / tileY;
    const uvArr = [0,0,0,vT,0,0,0,vT, uE,0,uE,vT,uE,0,uE,vT];
    const idxArr = [
      0,1,5, 0,5,4,  // left face
      2,6,7, 2,7,3,  // right face
      1,3,7, 1,7,5,  // top
      0,4,6, 0,6,2,  // bottom
      0,2,3, 0,3,1,  // start cap
      4,5,7, 4,7,6,  // end cap
    ];

    const baseGeo = new THREE.BufferGeometry();
    baseGeo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    baseGeo.setAttribute('uv',  new THREE.Float32BufferAttribute(uvArr, 2));
    baseGeo.setAttribute('uv2', new THREE.Float32BufferAttribute([...uvArr], 2));
    baseGeo.setIndex(idxArr);
    baseGeo.computeVertexNormals();

    // CSG: subtract openings. Cutters positioned in world space (matching buildRun).
    let finalGeo: THREE.BufferGeometry = baseGeo;
    const trimMeshes: THREE.Mesh[] = [];
    const linerSetups: LinerSetup[] = [];

    if (wall.openings.length > 0) {
      let workMesh: THREE.Mesh = new THREE.Mesh(baseGeo, new THREE.MeshBasicMaterial());
      workMesh.updateMatrixWorld();
      let prevIsOriginal = true;

      for (const opening of wall.openings) {
        const lx = opening.offsetAlongWall + opening.width / 2 - totalLen / 2;
        const cutterGeo = opening.type === "arch"
          ? createArchCutterGeo(opening.width + 0.05, opening.height + 0.05, T)
          : new THREE.BoxGeometry(opening.width + 0.05, opening.height + 0.05, T + 0.1);
        const cutterMesh = new THREE.Mesh(cutterGeo, new THREE.MeshBasicMaterial());
        cutterMesh.position.set(cx + cos * lx, opening.elevation + opening.height / 2, cz + sin * lx);
        cutterMesh.rotation.y = -angle;
        cutterMesh.updateMatrixWorld();

        const oldGeo = workMesh.geometry;
        workMesh = csgSubtract(workMesh, cutterMesh);
        workMesh.updateMatrixWorld();
        cutterGeo.dispose();
        if (!prevIsOriginal) oldGeo.dispose();
        prevIsOriginal = false;
      }

      finalGeo = workMesh.geometry;
      finalGeo.setAttribute('uv2', finalGeo.attributes.uv);

      for (const opening of wall.openings) {
        const lx     = opening.offsetAlongWall + opening.width / 2 - totalLen / 2;
        const worldY = opening.elevation + opening.height / 2;

        trimMeshes.push(...buildTrimFrame(opening, totalLen, H, T, cx, cz, angle, wall.elevation ?? 0));

        const triggerMesh = new THREE.Mesh(
          new THREE.BoxGeometry(opening.width, opening.height, 0.01),
          new THREE.MeshStandardMaterial({
            color: 0x4d8cff, emissive: 0x000000, emissiveIntensity: 0.0,
            transparent: true, opacity: 0.04,
            depthTest: false, depthWrite: false, side: THREE.DoubleSide,
          }),
        );
        triggerMesh.renderOrder = 1;
        triggerMesh.position.set(cx + cos * lx, (wall.elevation ?? 0) + worldY, cz + sin * lx);
        triggerMesh.rotation.y = -angle;
        triggerMesh.userData = {
          editorId:      opening.id,
          editorType:    "opening",
          zoneId,
          selectable:    true,
          floorLevel:    wall.floor,
          _ownsMaterial: true,
          wallId:        wall.id,
          _selectOpacity:         0.55,
          _origOpacity:           0.04,
          _origEmissive:          0x000000,
          _origEmissiveIntensity: 0,
        };
        trimMeshes.push(triggerMesh);

        if (opening.type === "passage" || opening.type === "arch") {
          const iTH = opening.innerTileH ?? tileX;
          const iTV = opening.innerTileV ?? tileX;
          const isArch    = opening.type === "arch";
          const linerH    = isArch ? opening.height - opening.width / 2 : opening.height;
          const linerOfsY = isArch ? -opening.width / 4 : 0;
          linerSetups.push({
            geo: buildPassageLiner(opening.width, linerH, T, iTH, iTV, !isArch),
            px:  cx + cos * lx,
            py:  worldY + linerOfsY,
            pz:  cz + sin * lx,
            ry: -angle,
          });
        }
      }
    }

    const mat = ovr
      ? await assetManager.getMaterialWithOverrides(wall.material, ovr)
          .catch(() => assetManager.getDefaultMaterial(0x4a5a6a))
      : await assetManager.getMaterial(wall.material)
          .catch(() => assetManager.getDefaultMaterial(0x4a5a6a));

    const mesh = new THREE.Mesh(finalGeo, mat);
    mesh.position.set(0, wall.elevation ?? 0, 0);
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

    for (const ls of linerSetups) {
      const lm = mat.clone();
      lm.side = THREE.DoubleSide;
      lm.polygonOffset = true;
      lm.polygonOffsetFactor = -1;
      lm.polygonOffsetUnits  = -1;
      const linerMesh = new THREE.Mesh(ls.geo, lm);
      linerMesh.position.set(ls.px, (wall.elevation ?? 0) + ls.py, ls.pz);
      linerMesh.rotation.y = ls.ry;
      linerMesh.castShadow    = true;
      linerMesh.receiveShadow = true;
      linerMesh.userData = { selectable: false, _ownsMaterial: true };
      trimMeshes.push(linerMesh);
    }

    const colliders = ColliderBuilder.registerWallSegments(
      wall, wall.elevation ?? 0,
      { x: rawStart.x, z: rawStart.z },
      { x: rawEnd.x,   z: rawEnd.z   },
    );

    return { mesh, colliders, trimMeshes };
  }

  // Builds a single continuous mesh for a chain of compatible walls with mitered corner joins.
  // All walls in the run must share material, exteriorMaterial, and height — and have no openings.
  static async buildRun(
    walls:  WallDef[],
    zoneId: string,
    zone:   ZoneDef,
    nodes:  Map<string, WallNode>,
  ): Promise<WallBuildOutput> {
    if (walls.length <= 1) return WallBuilder.build(walls[0]!, zoneId, zone, nodes);

    const nodeIds = resolveRunNodeIds(walls);
    if (!nodeIds) return WallBuilder.build(walls[0]!, zoneId, zone, nodes);

    // Detect closed loop: resolveRunNodeIds appends the start node again when the
    // run wraps back to where it began (e.g. a fully-enclosed room).
    const isClosed = nodeIds.length > 2 && nodeIds[0] === nodeIds[nodeIds.length - 1];
    const resolvedIds = isClosed ? nodeIds.slice(0, -1) : nodeIds;

    const pts = resolvedIds.map(id => {
      const n = nodes.get(id)!;
      return { x: n.x, z: n.z };
    });

    const wall        = walls[0]!;
    const H           = wall.height;
    const T           = wall.thickness;
    const runElevation = wall.elevation ?? 0;
    const ovr         = wall.materialOverrides;
    const baseDef   = assetManager.getMaterialDef(wall.material);
    const tileScale = ovr?.tileScale ?? baseDef?.tileScale ?? 1.0;
    const tileX     = ovr?.tileScaleX ?? tileScale;
    const tileY     = ovr?.tileScaleY ?? tileScale;

    // Cumulative arc-length for UV continuity across corners
    const cumDist: number[] = [0];
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]!, cur = pts[i]!;
      cumDist.push(cumDist[i - 1]! + Math.hypot(cur.x - prev.x, cur.z - prev.z));
    }

    // Left/right edge positions at each polyline point using miter bisectors at interior corners.
    // Open-run endpoints check for adjacent non-run walls and miter toward them so geometry
    // flush-joins with standalone wall meshes that share those corner nodes.
    const N = pts.length;
    const runWallIds = new Set(walls.map(w => w.id));
    const lefts:  { x: number; z: number }[] = [];
    const rights: { x: number; z: number }[] = [];

    for (let i = 0; i < N; i++) {
      const p = pts[i]!;

      if (!isClosed && i === 0) {
        const nxt = pts[1]!;
        const em = endpointMiter(
          resolvedIds[0]!, p, { dx: nxt.x - p.x, dz: nxt.z - p.z }, true,
          zone, nodes, runWallIds, T,
        );
        lefts.push(em.left); rights.push(em.right);
        continue;
      }
      if (!isClosed && i === N - 1) {
        const prv = pts[i - 1]!;
        const em = endpointMiter(
          resolvedIds[resolvedIds.length - 1]!, p, { dx: p.x - prv.x, dz: p.z - prv.z }, false,
          zone, nodes, runWallIds, T,
        );
        lefts.push(em.left); rights.push(em.right);
        continue;
      }

      // Interior corner (or any point in a closed loop): miter bisector.
      // Use modular indexing so the first/last points of a closed loop
      // correctly reference their wrap-around neighbours.
      const prv = pts[(i - 1 + N) % N]!, nxt = pts[(i + 1) % N]!;
      const dx1 = p.x - prv.x, dz1 = p.z - prv.z;
      const len1 = Math.hypot(dx1, dz1) || 0.001;
      const nx1 = dz1 / len1, nz1 = -dx1 / len1;
      const dx2 = nxt.x - p.x, dz2 = nxt.z - p.z;
      const len2 = Math.hypot(dx2, dz2) || 0.001;
      const nx2 = dz2 / len2, nz2 = -dx2 / len2;
      const bx = nx1 + nx2, bz = nz1 + nz2;
      const bLen = Math.hypot(bx, bz) || 0.001;
      const mx = bx / bLen, mz = bz / bLen;
      // miterLen = (T/2) / cos(half-angle); clamp cosine to prevent extreme miters
      const cosHalf = Math.max(nx1 * mx + nz1 * mz, 0.2);
      const mLen = (T / 2) / cosHalf;

      lefts.push({  x: p.x + mx * mLen, z: p.z + mz * mLen });
      rights.push({ x: p.x - mx * mLen, z: p.z - mz * mLen });
    }

    // Build indexed BufferGeometry.
    // Per polyline point: 4 vertices — LB(4i), LT(4i+1), RB(4i+2), RT(4i+3)
    // Face winding verified for correct outward normals (CCW from outside).
    const vTop   = H / tileY;
    const posArr: number[] = [];
    const uvArr:  number[] = [];
    const idxArr: number[] = [];

    for (let i = 0; i < N; i++) {
      const l = lefts[i]!, r = rights[i]!;
      const u = cumDist[i]! / tileX;
      posArr.push(l.x, 0, l.z,  l.x, H, l.z,  r.x, 0, r.z,  r.x, H, r.z);
      uvArr.push( u,   0, u,   vTop,  u,  0, u, vTop);
    }

    // Closed loops: the wrap-around segment (pts[N-1]→pts[0]) would interpolate
    // from cumDist[N-1]/tileX back to UV=0, cramming the full arc-length into
    // one face and producing tiny compressed tiling. Fix: add a duplicate of
    // pts[0]'s vertices with U = totalCumDist so the face gets one segment's
    // worth of UV, then point the wrap-around indices at that extra vertex.
    if (isClosed) {
      const wrapLen    = Math.hypot(pts[0]!.x - pts[N - 1]!.x, pts[0]!.z - pts[N - 1]!.z);
      const uTotal     = (cumDist[N - 1]! + wrapLen) / tileX;
      const l = lefts[0]!, r = rights[0]!;
      posArr.push(l.x, 0, l.z,  l.x, H, l.z,  r.x, 0, r.z,  r.x, H, r.z);
      uvArr.push(uTotal, 0, uTotal, vTop, uTotal, 0, uTotal, vTop);
    }

    // Closed loops have N segments (last wraps back to 0); open runs have N-1.
    const segCount = isClosed ? N : N - 1;
    for (let i = 0; i < segCount; i++) {
      // Wrap-around segment uses the extra vertex (index N) instead of vertex 0
      // so its UV continues forward rather than jumping back to 0.
      const j   = (isClosed && i === N - 1) ? N : (i + 1) % N;
      const LBi  = 4 * i,  LTi  = 4 * i + 1,  RBi  = 4 * i + 2,  RTi  = 4 * i + 3;
      const LBi1 = 4 * j,  LTi1 = 4 * j + 1,  RBi1 = 4 * j + 2,  RTi1 = 4 * j + 3;

      // Left face — outward normal points left
      idxArr.push(LBi, LTi, LTi1,  LBi, LTi1, LBi1);
      // Right face — outward normal points right
      idxArr.push(RBi, RBi1, RTi1,  RBi, RTi1, RTi);
      // Top face — outward normal points up
      idxArr.push(LTi, RTi, RTi1,  LTi, RTi1, LTi1);
      // Bottom face — outward normal points down (closes mesh for watertight CSG)
      idxArr.push(LBi, LBi1, RBi1,  LBi, RBi1, RBi);
    }

    // End caps only for open runs — closed loops need no caps.
    if (!isClosed) {
      idxArr.push(0, 2, 3,  0, 3, 1);
      const L = N - 1;
      idxArr.push(4*L, 4*L+1, 4*L+3,  4*L, 4*L+3, 4*L+2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvArr,  2));
    geo.setAttribute('uv2',      new THREE.Float32BufferAttribute(uvArr.slice(), 2));
    geo.setIndex(idxArr);
    geo.computeVertexNormals();

    // --- Opening processing: CSG cuts + trim/trigger meshes for any wall in the run ---
    // Uses global arc-length so openings slide around corners when offset > wall length.
    let finalGeo: THREE.BufferGeometry = geo;
    const trimMeshes: THREE.Mesh[] = [];
    const linerSetups: LinerSetup[] = [];
    const hasAnyOpenings = walls.some(w => w.openings.length > 0);

    if (hasAnyOpenings) {
      // Per-segment lengths (closed loops include the wrap-around segment).
      const segLens: number[] = [];
      for (let si = 0; si < walls.length; si++) {
        const j = (si + 1) % N;
        segLens.push(Math.hypot(pts[j]!.x - pts[si]!.x, pts[j]!.z - pts[si]!.z) || 0.001);
      }
      // cumDist[k] = arc from pts[0] to the START of segment k.
      // End of segment k = cumDist[k] + segLens[k].
      const segArcEnd = (k: number) => cumDist[k]! + segLens[k]!;

      let workMesh: THREE.Mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
      workMesh.updateMatrixWorld();
      let prevIsOriginal = true;

      for (let si = 0; si < walls.length; si++) {
        const wallSeg = walls[si]!;
        if (wallSeg.openings.length === 0) continue;

        const isForward = wallSeg.startNodeId === resolvedIds[si];

        for (const opening of wallSeg.openings) {
          // Map the opening's left edge to a global run arc-length position so
          // it can slide around corners when the offset exceeds the wall length.
          const effectiveLeft = isForward
            ? opening.offsetAlongWall
            : segLens[si]! - opening.offsetAlongWall - opening.width;
          const openingArcStart  = cumDist[si]! + effectiveLeft;
          const openingArcEnd    = openingArcStart + opening.width;
          const openingArcCenter = (openingArcStart + openingArcEnd) / 2;

          // ── CSG: apply one cut per run segment that this opening overlaps ──────
          let trimSegIdx   = -1;
          let trimCenterDist = 0;

          for (let k = 0; k < walls.length; k++) {
            const arcS = cumDist[k]!;
            const arcE = segArcEnd(k);

            const overlapS = Math.max(openingArcStart, arcS);
            const overlapE = Math.min(openingArcEnd,   arcE);
            if (overlapS >= overlapE) continue;

            // Track which segment contains the opening centre (for trim/trigger).
            if (openingArcCenter >= arcS && openingArcCenter < arcE) {
              trimSegIdx     = k;
              trimCenterDist = openingArcCenter - arcS;
            }

            const cutWidth   = overlapE - overlapS;
            const cutCtrDist = (overlapS + overlapE) / 2 - arcS;

            const kj = (k + 1) % N;
            const kA = pts[k]!, kB = pts[kj]!;
            const kDx  = kB.x - kA.x, kDz = kB.z - kA.z;
            const kLen = segLens[k]!;
            const kUx  = kDx / kLen, kUz = kDz / kLen;
            const kAng = Math.atan2(kDz, kDx);

            const worldX = kA.x + kUx * cutCtrDist;
            const worldY = opening.elevation + opening.height / 2;
            const worldZ = kA.z + kUz * cutCtrDist;

            // Use arch cutter only when the whole opening lives on one segment.
            const cutterGeo = (opening.type === "arch" && Math.abs(cutWidth - opening.width) < 0.001)
              ? createArchCutterGeo(cutWidth + 0.05, opening.height + 0.05, T)
              : new THREE.BoxGeometry(cutWidth + 0.05, opening.height + 0.05, T + 0.1);

            const cutterMesh = new THREE.Mesh(cutterGeo, new THREE.MeshBasicMaterial());
            cutterMesh.position.set(worldX, worldY, worldZ);
            cutterMesh.rotation.y = -kAng;
            cutterMesh.updateMatrixWorld();

            const oldGeo = workMesh.geometry;
            workMesh = csgSubtract(workMesh, cutterMesh);
            workMesh.updateMatrixWorld();

            cutterGeo.dispose();
            if (!prevIsOriginal) oldGeo.dispose();
            prevIsOriginal = false;
          }

          // ── Trim frame + trigger on the segment containing the opening centre ──
          if (trimSegIdx < 0) {
            // Opening centre is outside run bounds (open run, extreme offset).
            trimSegIdx     = openingArcCenter < 0 ? 0 : walls.length - 1;
            trimCenterDist = openingArcCenter < 0 ? 0 : segLens[trimSegIdx]!;
          }

          {
            const k   = trimSegIdx;
            const kj  = (k + 1) % N;
            const kA  = pts[k]!, kB = pts[kj]!;
            const kDx = kB.x - kA.x, kDz = kB.z - kA.z;
            const kLen = segLens[k]!;
            const kUx  = kDx / kLen, kUz = kDz / kLen;
            const kAng = Math.atan2(kDz, kDx);
            const kCx  = (kA.x + kB.x) / 2;
            const kCz  = (kA.z + kB.z) / 2;

            const localX   = trimCenterDist - kLen / 2;
            const localY_m = opening.elevation + opening.height / 2 - H / 2;
            const TRIM_D   = T + 0.06;

            if (opening.type !== "passage" && opening.trim !== false) {
              const isArch = opening.type === "arch";
              const jambH  = isArch
                ? (opening.height - opening.width / 2) + TRIM_W * 2
                : opening.height + TRIM_W * 2;
              const jambY  = isArch ? localY_m - opening.width / 4 : localY_m;

              const addPiece = (lx: number, ly: number, pw: number, ph: number) => {
                const tmat = new THREE.MeshStandardMaterial({ color: 0x2d2d2d, roughness: 0.9 });
                const pm   = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, TRIM_D), tmat);
                pm.position.set(kCx + kUx * lx, runElevation + H / 2 + ly, kCz + kUz * lx);
                pm.rotation.y    = -kAng;
                pm.castShadow    = true;
                pm.receiveShadow = true;
                pm.userData = { selectable: false, _ownsMaterial: true };
                trimMeshes.push(pm);
              };
              addPiece(localX - opening.width / 2 - TRIM_W / 2, jambY, TRIM_W, jambH);
              addPiece(localX + opening.width / 2 + TRIM_W / 2, jambY, TRIM_W, jambH);
              if (!isArch) {
                addPiece(localX, localY_m + opening.height / 2 + TRIM_W / 2, opening.width + TRIM_W * 2, TRIM_W);
              }
              if (opening.type === "window") {
                addPiece(localX, localY_m - opening.height / 2 - TRIM_W / 2, opening.width + TRIM_W * 2, TRIM_W);
              }
            }

            const triggerMesh = new THREE.Mesh(
              new THREE.BoxGeometry(opening.width, opening.height, 0.01),
              new THREE.MeshStandardMaterial({
                color: 0x4d8cff, emissive: 0x000000, emissiveIntensity: 0.0,
                transparent: true, opacity: 0.04,
                depthTest: false, depthWrite: false, side: THREE.DoubleSide,
              }),
            );
            triggerMesh.renderOrder = 1;
            triggerMesh.position.set(kCx + kUx * localX, runElevation + H / 2 + localY_m, kCz + kUz * localX);
            triggerMesh.rotation.y = -kAng;
            triggerMesh.userData = {
              editorId:      opening.id,
              editorType:    "opening",
              zoneId,
              selectable:    true,
              floorLevel:    wallSeg.floor,
              _ownsMaterial: true,
              wallId:        wallSeg.id,
              _selectOpacity:         0.55,
              _origOpacity:           0.04,
              _origEmissive:          0x000000,
              _origEmissiveIntensity: 0,
            };
            trimMeshes.push(triggerMesh);

            // Liner only for passage/arch — doors and windows use trim frames instead
            if (opening.type === "passage" || opening.type === "arch") {
              const iTH = opening.innerTileH ?? tileX;
              const iTV = opening.innerTileV ?? tileX;
              const isArch2    = opening.type === "arch";
              const linerH2    = isArch2 ? opening.height - opening.width / 2 : opening.height;
              const linerOfsY2 = isArch2 ? -opening.width / 4 : 0;
              linerSetups.push({
                geo: buildPassageLiner(opening.width, linerH2, T, iTH, iTV, !isArch2),
                px:  kCx + kUx * localX,
                py:  H / 2 + localY_m + linerOfsY2,
                pz:  kCz + kUz * localX,
                ry: -kAng,
              });
            }
          }
        }
      }

      finalGeo = workMesh.geometry;
      finalGeo.setAttribute('uv2', finalGeo.attributes.uv);
    }

    const mat = ovr
      ? await assetManager.getMaterialWithOverrides(wall.material, ovr)
          .catch(() => assetManager.getDefaultMaterial(0x4a5a6a))
      : await assetManager.getMaterial(wall.material)
          .catch(() => assetManager.getDefaultMaterial(0x4a5a6a));

    const mesh = new THREE.Mesh(finalGeo, mat);
    mesh.position.set(0, runElevation, 0);
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

    // Create liner meshes now that the material is available
    for (const ls of linerSetups) {
      const lm = mat.clone();
      lm.side = THREE.DoubleSide;
      lm.polygonOffset = true;
      lm.polygonOffsetFactor = -1;
      lm.polygonOffsetUnits  = -1;
      const linerMesh = new THREE.Mesh(ls.geo, lm);
      linerMesh.position.set(ls.px, runElevation + ls.py, ls.pz);
      linerMesh.rotation.y = ls.ry;
      linerMesh.castShadow    = true;
      linerMesh.receiveShadow = true;
      linerMesh.userData = { selectable: false, _ownsMaterial: true };
      trimMeshes.push(linerMesh);
    }

    // One collider per wall segment using full (untrimmed) node positions
    const allColliders: RAPIER.Collider[] = [];
    for (const w of walls) {
      const sNode = nodes.get(w.startNodeId)!;
      const eNode = nodes.get(w.endNodeId)!;
      allColliders.push(
        ...ColliderBuilder.registerWallSegments(
          w, w.elevation ?? 0,
          { x: sNode.x, z: sNode.z },
          { x: eNode.x, z: eNode.z },
        ),
      );
    }

    return { mesh, colliders: allColliders, trimMeshes };
  }
}
