import * as THREE from "three";
import { ColliderBuilder } from "@/physics/ColliderBuilder";
import { assetManager } from "@/core/AssetManager";
import { csgSubtract } from "@/utils/csg";
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

function buildTrimFrame(
  opening: Opening,
  length: number,
  wallHeight: number,
  wallThickness: number,
  cx: number,
  cz: number,
  angle: number,
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
    mesh.position.set(cx + cos * lx, wallHeight / 2 + ly, cz + sin * lx);
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
    const tileX     = ovr?.tileScaleX ?? tileScale;
    const tileY     = ovr?.tileScaleY ?? tileScale;

    const dispEnabled = ovr?.maps?.displacement?.enabled
      ?? baseDef?.maps.displacement.enabled
      ?? false;
    const segX = dispEnabled ? Math.max(1, Math.ceil(length * 4)) : 1;
    const segY = dispEnabled ? Math.max(1, Math.ceil(wall.height * 4)) : 1;

    const geo = new THREE.BoxGeometry(length, wall.height, wall.thickness, segX, segY, 1);
    applyBoxUVTiling(geo, length, wall.height, wall.thickness, tileX, tileY);

    // CSG: subtract each opening from the wall geometry
    let finalGeo: THREE.BufferGeometry = geo;
    const trimMeshes: THREE.Mesh[] = [];

    if (wall.openings.length > 0) {
      let workMesh: THREE.Mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
      workMesh.updateMatrixWorld();
      let prevIsOriginal = true;

      for (const opening of wall.openings) {
        // Cutter position in wall local space (wall runs along X, centered at origin)
        const localX = opening.offsetAlongWall + opening.width / 2 - length / 2;
        const localY = opening.elevation + opening.height / 2 - wall.height / 2;

        const cutterGeo = opening.type === "arch"
          ? createArchCutterGeo(opening.width + 0.05, opening.height + 0.05, wall.thickness)
          : new THREE.BoxGeometry(opening.width + 0.05, opening.height + 0.05, wall.thickness + 0.1);
        const cutterMesh = new THREE.Mesh(cutterGeo, new THREE.MeshBasicMaterial());
        cutterMesh.position.set(localX, localY, 0);
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

      const cos = Math.cos(angle), sin = Math.sin(angle);
      for (const opening of wall.openings) {
        trimMeshes.push(...buildTrimFrame(opening, length, wall.height, wall.thickness, cx, cz, angle));

        // Invisible trigger mesh — fills the opening so raycasting can select it
        const lx = opening.offsetAlongWall + opening.width / 2 - length / 2;
        const ly = opening.elevation + opening.height / 2 - wall.height / 2;
        const triggerMesh = new THREE.Mesh(
          new THREE.BoxGeometry(opening.width, opening.height, 0.01),
          new THREE.MeshStandardMaterial({
            color: 0x4d8cff, emissive: 0x000000, emissiveIntensity: 0.0,
            transparent: true, opacity: 0.04,
            depthTest: false, depthWrite: false, side: THREE.DoubleSide,
          }),
        );
        triggerMesh.renderOrder = 1;
        triggerMesh.position.set(cx + cos * lx, wall.height / 2 + ly, cz + sin * lx);
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
      }
    } else {
      geo.setAttribute('uv2', geo.attributes.uv);
    }

    const mat = ovr
      ? await assetManager.getMaterialWithOverrides(wall.material, ovr)
          .catch(() => assetManager.getDefaultMaterial(0x4a5a6a))
      : await assetManager.getMaterial(wall.material)
          .catch(() => assetManager.getDefaultMaterial(0x4a5a6a));

    const mesh = new THREE.Mesh(finalGeo, mat);
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

    const wall      = walls[0]!;
    const H         = wall.height;
    const T         = wall.thickness;
    const ovr       = wall.materialOverrides;
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
    // For closed loops every point is interior; open runs treat the two endpoints as flat caps.
    // Normal formula: for direction (dx, dz), left normal = (dz/len, -dx/len) in XZ.
    const N = pts.length;
    const lefts:  { x: number; z: number }[] = [];
    const rights: { x: number; z: number }[] = [];

    for (let i = 0; i < N; i++) {
      const p = pts[i]!;
      let mx: number, mz: number, mLen: number;

      if (!isClosed && i === 0) {
        const nxt = pts[1]!;
        const dx = nxt.x - p.x, dz = nxt.z - p.z;
        const len = Math.hypot(dx, dz) || 0.001;
        mx = dz / len; mz = -dx / len;
        mLen = T / 2;
      } else if (!isClosed && i === N - 1) {
        const prv = pts[i - 1]!;
        const dx = p.x - prv.x, dz = p.z - prv.z;
        const len = Math.hypot(dx, dz) || 0.001;
        mx = dz / len; mz = -dx / len;
        mLen = T / 2;
      } else {
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

    for (let i = 0; i < N; i++) {
      const l = lefts[i]!, r = rights[i]!;
      const u = cumDist[i]! / tileX;
      const vTop = H / tileY;
      posArr.push(l.x, 0, l.z,  l.x, H, l.z,  r.x, 0, r.z,  r.x, H, r.z);
      uvArr.push( u,   0, u,   vTop,  u,  0, u, vTop);
    }

    // Closed loops have N segments (last wraps back to 0); open runs have N-1.
    const segCount = isClosed ? N : N - 1;
    for (let i = 0; i < segCount; i++) {
      const j   = (i + 1) % N;
      const LBi  = 4 * i,  LTi  = 4 * i + 1,  RBi  = 4 * i + 2,  RTi  = 4 * i + 3;
      const LBi1 = 4 * j,  LTi1 = 4 * j + 1,  RBi1 = 4 * j + 2,  RTi1 = 4 * j + 3;

      // Left face — outward normal points left
      idxArr.push(LBi, LTi, LTi1,  LBi, LTi1, LBi1);
      // Right face — outward normal points right
      idxArr.push(RBi, RBi1, RTi1,  RBi, RTi1, RTi);
      // Top face — outward normal points up
      idxArr.push(LTi, RTi, RTi1,  LTi, RTi1, LTi1);
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
                pm.position.set(kCx + kUx * lx, H / 2 + ly, kCz + kUz * lx);
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
            triggerMesh.position.set(kCx + kUx * localX, H / 2 + localY_m, kCz + kUz * localX);
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

    return { mesh, colliders: allColliders, trimMeshes };
  }
}
