import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import type { Vec3, BrushFace, ShapeBrushMesh, MaterialOverrides } from "@/types";

/**
 * Pure topology operations for face-brushes (Phase 23). Data in, data out — every
 * op returns FRESH vertices/faces arrays (the undo journal diffs whole entities, so
 * inputs are never mutated). Invariants maintained throughout:
 *  - face loops are CCW viewed from OUTSIDE (Newell normal points outward);
 *  - the loops tile the full boundary: every undirected edge is traversed by
 *    exactly two faces, in opposite directions (manifold, no T-junctions).
 * `validateMesh` checks those invariants and gates every op commit.
 */

const EPS_POS   = 1e-4;   // point identity (meters)
const EPS_POS_SQ = EPS_POS * EPS_POS;
const EPS_NRM   = 1 - 1e-6;  // normal match (dot)
const EPS_PLANE = 1e-4;   // coplanarity distance (meters)

export interface BrushMeshData { vertices: Vec3[]; faces: BrushFace[] }

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Outward face normal via Newell's method (robust for non-planar/n-gon loops). */
export function newellNormal(vertices: Vec3[], loop: number[]): THREE.Vector3 {
  const n = new THREE.Vector3();
  for (let i = 0; i < loop.length; i++) {
    const a = vertices[loop[i]!]!;
    const b = vertices[loop[(i + 1) % loop.length]!]!;
    n.x += (a.y - b.y) * (a.z + b.z);
    n.y += (a.z - b.z) * (a.x + b.x);
    n.z += (a.x - b.x) * (a.y + b.y);
  }
  return n.normalize();
}

export function faceCentroid(vertices: Vec3[], loop: number[]): THREE.Vector3 {
  const c = new THREE.Vector3();
  for (const vi of loop) c.add(new THREE.Vector3(vertices[vi]!.x, vertices[vi]!.y, vertices[vi]!.z));
  return c.multiplyScalar(1 / loop.length);
}

/** Index of an existing vertex within EPS_POS, else push a new one. */
function addOrReuse(vertices: Vec3[], p: Vec3): number {
  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i]!;
    const dx = v.x - p.x, dy = v.y - p.y, dz = v.z - p.z;
    if (dx * dx + dy * dy + dz * dz < EPS_POS_SQ) return i;
  }
  vertices.push({ x: +p.x.toFixed(4), y: +p.y.toFixed(4), z: +p.z.toFixed(4) });
  return vertices.length - 1;
}

/**
 * Manifold check: every undirected edge traversed by exactly two loops (in opposite
 * directions), every face ≥ 3 verts with in-range indices, total fan volume > 0.
 * Returns null when valid, else a human-readable reason.
 */
export function validateMesh(mesh: BrushMeshData): string | null {
  const { vertices, faces } = mesh;
  if (faces.length < 4) return `only ${faces.length} faces (min 4)`;
  const edgeCount = new Map<string, number>();
  let volume6 = 0;
  const o = vertices[0]!;
  for (const f of faces) {
    if (f.verts.length < 3) return "face with < 3 verts";
    for (let i = 0; i < f.verts.length; i++) {
      const a = f.verts[i]!, b = f.verts[(i + 1) % f.verts.length]!;
      if (a < 0 || a >= vertices.length || b < 0 || b >= vertices.length) return "vertex index out of range";
      if (a === b) return "degenerate edge (a === a)";
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
    }
    // Signed volume of the fan tetrahedra against vertices[0].
    const v0 = f.verts[0]!;
    for (let i = 1; i < f.verts.length - 1; i++) {
      const [a, b, c] = [vertices[v0]!, vertices[f.verts[i]!]!, vertices[f.verts[i + 1]!]!];
      volume6 +=
        (a.x - o.x) * ((b.y - o.y) * (c.z - o.z) - (b.z - o.z) * (c.y - o.y)) -
        (a.y - o.y) * ((b.x - o.x) * (c.z - o.z) - (b.z - o.z) * (c.x - o.x)) +
        (a.z - o.z) * ((b.x - o.x) * (c.y - o.y) - (b.y - o.y) * (c.x - o.x));
    }
  }
  for (const [key, n] of edgeCount) {
    if (n !== 2) return `edge ${key} traversed ${n}× (expected 2)`;
  }
  if (volume6 <= 0) return "non-positive enclosed volume (winding flipped?)";
  return null;
}

// ── Cloud → faces conversion ──────────────────────────────────────────────────

/**
 * Convert a convex vertex cloud into explicit face loops: convex hull →
 * coplanar-triangle merge → boundary loop per planar region. Winding stays
 * CCW-outward by construction (hull triangles are outward; boundary chaining
 * preserves their direction). Interior/absorbed cloud points are dropped —
 * conversion is the canonicalization moment. Returns null on a degenerate hull.
 *
 * `seed` reproduces the parametric cap/side look: faces with |n.y| ≥ 0.5 inherit
 * the shape material (material left undefined); other faces get sideMaterial.
 */
export function facesFromCloud(
  cloud: Vec3[],
  seed?: { sideMaterial?: string; sideMaterialOverrides?: MaterialOverrides },
): BrushMeshData | null {
  let hull: THREE.BufferGeometry;
  try {
    hull = new ConvexGeometry(cloud.map(v => new THREE.Vector3(v.x, v.y, v.z)));
  } catch {
    return null;
  }
  const pos = hull.attributes["position"] as THREE.BufferAttribute;

  // 1. Canonical vertex set (hull output is unindexed + duplicated per corner).
  const vertices: Vec3[] = [];
  const canon = (x: number, y: number, z: number): number => addOrReuse(vertices, { x, y, z });

  // 2. Triangle table with outward unit normals.
  interface Tri { i: [number, number, number]; n: THREE.Vector3; a: THREE.Vector3 }
  const tris: Tri[] = [];
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  for (let t = 0; t < pos.count; t += 3) {
    va.fromBufferAttribute(pos, t); vb.fromBufferAttribute(pos, t + 1); vc.fromBufferAttribute(pos, t + 2);
    const ia = canon(va.x, va.y, va.z), ib = canon(vb.x, vb.y, vb.z), ic = canon(vc.x, vc.y, vc.z);
    if (ia === ib || ib === ic || ia === ic) continue;
    const n = new THREE.Vector3().subVectors(vb, va).cross(new THREE.Vector3().subVectors(vc, va));
    if (n.lengthSq() < 1e-12) continue;
    tris.push({ i: [ia, ib, ic], n: n.normalize(), a: va.clone() });
  }
  hull.dispose();
  if (tris.length < 4) return null;

  // 3. Adjacency by undirected edge.
  const edgeToTris = new Map<string, number[]>();
  const ekey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  tris.forEach((tri, ti) => {
    for (let e = 0; e < 3; e++) {
      const key = ekey(tri.i[e]!, tri.i[(e + 1) % 3]!);
      const arr = edgeToTris.get(key) ?? [];
      arr.push(ti);
      edgeToTris.set(key, arr);
    }
  });

  // 4. BFS coplanar merge into planar regions.
  const groupOf = new Array<number>(tris.length).fill(-1);
  const groups: number[][] = [];
  for (let s = 0; s < tris.length; s++) {
    if (groupOf[s] !== -1) continue;
    const gid = groups.length;
    const members: number[] = [];
    const queue = [s];
    groupOf[s] = gid;
    const seedTri = tris[s]!;
    while (queue.length) {
      const ti = queue.pop()!;
      members.push(ti);
      const tri = tris[ti]!;
      for (let e = 0; e < 3; e++) {
        for (const nb of edgeToTris.get(ekey(tri.i[e]!, tri.i[(e + 1) % 3]!)) ?? []) {
          if (groupOf[nb] !== -1) continue;
          const cand = tris[nb]!;
          if (cand.n.dot(seedTri.n) <= EPS_NRM) continue;
          // Every candidate vertex must lie on the seed plane.
          const onPlane = cand.i.every(vi => {
            const v = vertices[vi]!;
            return Math.abs((v.x - seedTri.a.x) * seedTri.n.x + (v.y - seedTri.a.y) * seedTri.n.y + (v.z - seedTri.a.z) * seedTri.n.z) < EPS_PLANE;
          });
          if (!onPlane) continue;
          groupOf[nb] = gid;
          queue.push(nb);
        }
      }
    }
    groups.push(members);
  }

  // 5. Boundary loop per group: directed edges whose reverse is absent, chained.
  const faces: BrushFace[] = [];
  for (const members of groups) {
    const directed = new Set<string>();
    for (const ti of members) {
      const [a, b, c] = tris[ti]!.i;
      directed.add(`${a}>${b}`); directed.add(`${b}>${c}`); directed.add(`${c}>${a}`);
    }
    const next = new Map<number, number>();
    for (const d of directed) {
      const [a, b] = d.split(">").map(Number) as [number, number];
      if (!directed.has(`${b}>${a}`)) next.set(a, b);   // boundary edge
    }
    if (next.size < 3) continue;
    const start = next.keys().next().value as number;
    const loop: number[] = [start];
    let cur = next.get(start)!;
    while (cur !== start && loop.length <= next.size) {
      loop.push(cur);
      cur = next.get(cur)!;
      if (cur === undefined) break;
    }
    if (cur !== start || loop.length < 3) continue;   // open/duplicated loop — skip region

    // 6. Collinear cleanup.
    const cleaned: number[] = [];
    for (let i = 0; i < loop.length; i++) {
      const p = vertices[loop[(i - 1 + loop.length) % loop.length]!]!;
      const q = vertices[loop[i]!]!;
      const r = vertices[loop[(i + 1) % loop.length]!]!;
      va.set(q.x - p.x, q.y - p.y, q.z - p.z);
      vb.set(r.x - q.x, r.y - q.y, r.z - q.z);
      if (vc.crossVectors(va, vb).lengthSq() > 1e-12) cleaned.push(loop[i]!);
    }
    if (cleaned.length < 3) continue;

    const face: BrushFace = { verts: cleaned };
    // 7. Material seeding — reproduce the parametric cap/side look.
    if (seed?.sideMaterial) {
      const n = newellNormal(vertices, cleaned);
      if (Math.abs(n.y) < 0.5) {
        face.material = seed.sideMaterial;
        if (seed.sideMaterialOverrides) face.materialOverrides = structuredClone(seed.sideMaterialOverrides);
      }
    }
    faces.push(face);
  }

  // 8. Drop vertices no face references; remap indices.
  const used = new Set<number>();
  for (const f of faces) for (const vi of f.verts) used.add(vi);
  const remap = new Map<number, number>();
  const outVerts: Vec3[] = [];
  for (let i = 0; i < vertices.length; i++) {
    if (used.has(i)) { remap.set(i, outVerts.length); outVerts.push(vertices[i]!); }
  }
  for (const f of faces) f.verts = f.verts.map(vi => remap.get(vi)!);

  const out = { vertices: outVerts, faces };
  const err = validateMesh(out);
  if (err) {
    console.warn(`brushOps.facesFromCloud: invalid result (${err}) — keeping cloud`);
    return null;
  }
  return out;
}

// ── Topology ops (Phase 23 M5) ────────────────────────────────────────────────

const cloneFaces = (faces: BrushFace[]): BrushFace[] =>
  faces.map(f => ({ ...f, verts: [...f.verts], materialOverrides: f.materialOverrides ? structuredClone(f.materialOverrides) : undefined }));

/**
 * Split a QUAD face between the midpoints of an opposite edge pair.
 * pair 0 cuts edges (v0,v1)/(v2,v3); pair 1 cuts (v1,v2)/(v3,v0). The selected
 * faceIdx stays on child A. CRITICAL: any other face traversing a split edge gets
 * the midpoint spliced into its loop (T-junction prevention — without it the
 * neighbor's fan leaves a crack in both render and trimesh).
 * Returns null (with reason logged) if the face isn't a quad or the result fails
 * validation.
 */
export function splitFaceQuad(mesh: ShapeBrushMesh, faceIdx: number, pair: 0 | 1): BrushMeshData | null {
  const src = mesh.faces?.[faceIdx];
  if (!src || src.verts.length !== 4) return null;
  const [a, b, c, d] = src.verts as [number, number, number, number];
  const e1: [number, number] = pair === 0 ? [a, b] : [b, c];
  const e2: [number, number] = pair === 0 ? [c, d] : [d, a];

  const vertices = mesh.vertices.map(v => ({ ...v }));
  const mid = (e: [number, number]): Vec3 => ({
    x: (vertices[e[0]]!.x + vertices[e[1]]!.x) / 2,
    y: (vertices[e[0]]!.y + vertices[e[1]]!.y) / 2,
    z: (vertices[e[0]]!.z + vertices[e[1]]!.z) / 2,
  });
  const i1 = addOrReuse(vertices, mid(e1));
  const i2 = addOrReuse(vertices, mid(e2));

  const faces = cloneFaces(mesh.faces!);
  // Children keep CCW winding and inherit the parent's material.
  const childA: number[] = pair === 0 ? [a, i1, i2, d] : [a, b, i1, i2];
  const childB: number[] = pair === 0 ? [i1, b, c, i2] : [i2, i1, c, d];
  faces[faceIdx] = { ...faces[faceIdx]!, verts: childA };
  faces.push({ ...src, verts: childB, materialOverrides: src.materialOverrides ? structuredClone(src.materialOverrides) : undefined });

  // T-junction propagation into every other face sharing a split edge.
  for (let fi = 0; fi < faces.length; fi++) {
    if (fi === faceIdx || fi === faces.length - 1) continue;
    const loop = faces[fi]!.verts;
    for (const [m, [p, q]] of [[i1, e1], [i2, e2]] as Array<[number, [number, number]]>) {
      if (loop.includes(m)) continue;
      for (let k = 0; k < loop.length; k++) {
        const s = loop[k]!, t = loop[(k + 1) % loop.length]!;
        if ((s === p && t === q) || (s === q && t === p)) {
          loop.splice(k + 1, 0, m);
          break;
        }
      }
    }
  }

  const out = { vertices, faces };
  const err = validateMesh(out);
  if (err) { console.warn(`brushOps.splitFaceQuad: aborted (${err})`); return null; }
  return out;
}

/**
 * Extrude a face along its outward normal by `dist` (> 0 only in v1). The loop's
 * vertices are DUPLICATED (never reused — neighbors keep the original ring), the
 * face is retargeted to the new ring (faceIdx stays on the moved cap), and a side
 * quad [p, q, q', p'] per edge seals the band. Sides inherit the cap's material.
 */
export function extrudeFace(mesh: ShapeBrushMesh, faceIdx: number, dist = 0.25): BrushMeshData | null {
  const src = mesh.faces?.[faceIdx];
  if (!src || dist <= 0) return null;
  const vertices = mesh.vertices.map(v => ({ ...v }));
  const n = newellNormal(vertices, src.verts);
  if (n.lengthSq() < 0.5) { console.warn("brushOps.extrudeFace: degenerate normal"); return null; }

  const dup = src.verts.map(vi => {
    const v = vertices[vi]!;
    vertices.push({ x: +(v.x + n.x * dist).toFixed(4), y: +(v.y + n.y * dist).toFixed(4), z: +(v.z + n.z * dist).toFixed(4) });
    return vertices.length - 1;
  });

  const faces = cloneFaces(mesh.faces!);
  faces[faceIdx] = { ...faces[faceIdx]!, verts: dup };
  for (let i = 0; i < src.verts.length; i++) {
    const p = src.verts[i]!, q = src.verts[(i + 1) % src.verts.length]!;
    const pd = dup[i]!, qd = dup[(i + 1) % dup.length]!;
    faces.push({
      verts: [p, q, qd, pd],   // CCW from outside the band (loop is CCW about +n)
      material: src.material,
      materialOverrides: src.materialOverrides ? structuredClone(src.materialOverrides) : undefined,
    });
  }

  const out = { vertices, faces };
  const err = validateMesh(out);
  if (err) { console.warn(`brushOps.extrudeFace: aborted (${err})`); return null; }
  return out;
}
