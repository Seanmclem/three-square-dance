import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import type { Vec3, BrushFace, ShapeBrushMesh, MaterialOverrides, LoopCutStart, HoleSpec, HoleTag } from "@/types";

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

/** `splitEdge` result: the new mesh plus the midpoint's vertex index (for re-selection). */
export interface SplitEdgeResult { mesh: BrushMeshData; mid: number }

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

// ── Quad folds ───────────────────────────────────────────────────────────────
// A 4-vert face whose corners aren't coplanar must bend along one diagonal. The
// render, the trimesh collider and the selection overlay all fan-triangulate from
// the loop's first vertex, so they share `fanLoop` to agree on which diagonal.

/** Normalized twist of a 4-vert loop a,b,c,d: ((b−a)×(c−a))·(d−a), scale-free.
 *  0 = flat. Negative → d sits inside the plane of a,b,c, so the a–c fold is a ridge. */
function quadTwist(vertices: Vec3[], loop: number[]): number {
  const [a, b, c, d] = loop.map(i => vertices[i]!) as [Vec3, Vec3, Vec3, Vec3];
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
  const wx = d.x - a.x, wy = d.y - a.y, wz = d.z - a.z;
  const t = (uy * vz - uz * vy) * wx + (uz * vx - ux * vz) * wy + (ux * vy - uy * vx) * wz;
  const scale = Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz) * Math.hypot(wx, wy, wz);
  return scale > 0 ? t / scale : 0;
}

/** True for a 4-vert face whose corners aren't coplanar (it visibly folds). */
export function isBentQuad(vertices: Vec3[], face: BrushFace): boolean {
  return face.verts.length === 4 && Math.abs(quadTwist(vertices, face.verts)) > 1e-6;
}

/** The diagonal a 4-vert face folds along: 0 = verts[0]–verts[2], 1 = verts[1]–verts[3].
 *  An explicit `face.fold` wins; otherwise the one that bulges outward (0 when flat,
 *  which is the fan every face used before folds existed). */
export function faceFold(vertices: Vec3[], face: BrushFace): 0 | 1 {
  if (face.fold !== undefined) return face.fold;
  return face.verts.length === 4 && quadTwist(vertices, face.verts) > 1e-6 ? 1 : 0;
}

/** The face loop rotated so a fan from its first vertex follows the fold. Same winding;
 *  non-quads are returned unchanged. */
export function fanLoop(vertices: Vec3[], face: BrushFace): number[] {
  const v = face.verts;
  return v.length === 4 && faceFold(vertices, face) === 1 ? [v[1]!, v[2]!, v[3]!, v[0]!] : v;
}

/**
 * The triangles a face is drawn and collided with, as vertex-index triples wound like
 * the loop (outward). A convex face fans from `fanLoop` (so a bent quad follows its
 * fold). A CONCAVE face (split edges + dragged corners can make one) is ear-clipped in
 * its own plane instead: a fan from one corner spills outside the outline, which drew
 * an inset frame across the corner of its own recess (v4.96.1, `my_custom_cube`).
 */
export function faceTriangles(vertices: Vec3[], face: BrushFace): Array<[number, number, number]> {
  const loop = fanLoop(vertices, face);
  const n = newellNormal(vertices, loop);
  if (loop.length > 3 && isConcaveLoop(vertices, loop, n)) {
    const helper = Math.abs(n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = helper.cross(n).normalize(), v = n.clone().cross(u);
    const p = new THREE.Vector3();
    const pts = loop.map(i => { const w = vertices[i]!; p.set(w.x, w.y, w.z); return new THREE.Vector2(p.dot(u), p.dot(v)); });
    const tris = THREE.ShapeUtils.triangulateShape(pts, []);
    if (tris.length === loop.length - 2) {
      return tris.map(([a, b, c]) => {
        const t: [number, number, number] = [loop[a!]!, loop[b!]!, loop[c!]!];
        return triNormalDot(vertices, t, n) < 0 ? [t[0], t[2], t[1]] : t;
      });
    }
  }
  const out: Array<[number, number, number]> = [];
  for (let i = 1; i < loop.length - 1; i++) out.push([loop[0]!, loop[i]!, loop[i + 1]!]);
  return out;
}

/** Any corner turning against the face normal (straight-through points don't count). */
function isConcaveLoop(vertices: Vec3[], loop: number[], n: THREE.Vector3): boolean {
  const L = loop.length;
  for (let i = 0; i < L; i++) {
    const a = vertices[loop[(i + L - 1) % L]!]!, b = vertices[loop[i]!]!, c = vertices[loop[(i + 1) % L]!]!;
    const e1 = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z), e2 = new THREE.Vector3(c.x - b.x, c.y - b.y, c.z - b.z);
    const scale = e1.length() * e2.length();
    if (scale > 0 && e1.cross(e2).dot(n) < -1e-6 * scale) return true;
  }
  return false;
}

function triNormalDot(vertices: Vec3[], t: [number, number, number], n: THREE.Vector3): number {
  const [a, b, c] = t.map(i => vertices[i]!) as [Vec3, Vec3, Vec3];
  return new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z)
    .cross(new THREE.Vector3(c.x - a.x, c.y - a.y, c.z - a.z)).dot(n);
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
 * Splice vertex `mid` into every face loop traversing undirected edge (p,q), right
 * after the matched endpoint (T-junction prevention). Loops already containing `mid`
 * are skipped. Mutates `faces` — call on cloned faces. Returns the splice count.
 */
function spliceMidpoint(faces: BrushFace[], mid: number, p: number, q: number): number {
  let count = 0;
  for (const f of faces) {
    const loop = f.verts;
    if (loop.includes(mid)) continue;
    for (let k = 0; k < loop.length; k++) {
      const s = loop[k]!, t = loop[(k + 1) % loop.length]!;
      if ((s === p && t === q) || (s === q && t === p)) {
        loop.splice(k + 1, 0, mid);
        count++;
        break;
      }
    }
  }
  return count;
}

/**
 * The loop positions of a face's REAL corners: verts where the boundary turns.
 * A vert that lies straight between its neighbors (a T-junction left by a
 * neighbor's split or splitEdge) is not a corner. Returns null unless there are
 * exactly four, so a rectangle with extra verts on its edges still counts as a
 * quad for splitting.
 */
export function quadCorners(vertices: Vec3[], loop: number[]): [number, number, number, number] | null {
  const L = loop.length;
  if (L < 4) return null;
  const corners: number[] = [];
  for (let i = 0; i < L; i++) {
    const u = vertices[loop[(i + L - 1) % L]!]!, v = vertices[loop[i]!]!, w = vertices[loop[(i + 1) % L]!]!;
    const ax = v.x - u.x, ay = v.y - u.y, az = v.z - u.z;
    const bx = w.x - v.x, by = w.y - v.y, bz = w.z - v.z;
    const la = Math.hypot(ax, ay, az) || 1, lb = Math.hypot(bx, by, bz) || 1;
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    const sin = Math.hypot(cx, cy, cz) / (la * lb);
    const cos = (ax * bx + ay * by + az * bz) / (la * lb);
    if (sin > 1e-3 || cos < 0) corners.push(i);   // turns (or doubles back) → a corner
  }
  return corners.length === 4 ? corners as [number, number, number, number] : null;
}

/**
 * Split a QUAD face between the midpoints of an opposite side pair. "Quad" means
 * four sides (`splitSides`: four real corners, or a rounded rectangle's four straight
 * runs, v4.107.1): straight-through verts and curves are kept
 * and end up on whichever child they fall in. pair 0 cuts sides c0→c1 / c2→c3,
 * pair 1 cuts c1→c2 / c3→c0. The selected faceIdx stays on child A. CRITICAL:
 * any other face traversing a split edge gets the midpoint spliced into its loop
 * (T-junction prevention — without it the neighbor's fan leaves a crack in both
 * render and trimesh).
 * Returns null (with reason logged) if the face isn't a quad or the result fails
 * validation.
 */
/**
 * The four sides of a face for SPLIT (v4.107.1): runs of edges that continue in a
 * straight line. A four-cornered face has exactly four. A rounded rectangle (a face
 * whose corners a ROUND turned into curves) has four long straight runs with short
 * curve edges between them: those four count as its sides, each at least 3× longer
 * than any curve edge. Returns each side's first and last loop position, in loop
 * order, or null.
 */
export function splitSides(vertices: Vec3[], loop: number[]): Array<{ from: number; to: number }> | null {
  const L = loop.length;
  if (L < 4) return null;
  const P = (i: number) => vertices[loop[(i + L) % L]!]!;
  const dirAt = (i: number) => { const a = P(i), b = P(i + 1); const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }; const l = Math.hypot(d.x, d.y, d.z) || 1; return { x: d.x / l, y: d.y / l, z: d.z / l, l }; };
  const D = Array.from({ length: L }, (_, i) => dirAt(i));
  const straight = (i: number) => { const a = D[(i + L - 1) % L]!, b = D[i]!; return a.x * b.x + a.y * b.y + a.z * b.z > 0.9998; };   // corner i continues the previous edge
  const start = Array.from({ length: L }, (_, i) => i).find(i => !straight(i));
  if (start === undefined) return null;
  const runs: Array<{ from: number; to: number; len: number }> = [];
  for (let k = 0; k < L; ) {
    const from = (start + k) % L;
    let len = D[from]!.l, n = 1;
    while (n < L && straight((from + n) % L)) { len += D[(from + n) % L]!.l; n++; }
    runs.push({ from, to: (from + n) % L, len });
    k += n;
  }
  if (runs.length === 4) return runs.map(({ from, to }) => ({ from, to }));
  if (runs.length < 4) return null;
  const byLen = [...runs].sort((a, b) => b.len - a.len);
  const four = byLen.slice(0, 4), rest = byLen.slice(4);
  if (rest.length && four[3]!.len < 3 * rest[0]!.len) return null;   // no clear four sides
  return runs.filter(r => four.includes(r)).map(({ from, to }) => ({ from, to }));
}

export function splitFaceQuad(mesh: ShapeBrushMesh, faceIdx: number, pair: 0 | 1): BrushMeshData | null {
  const src = mesh.faces?.[faceIdx];
  if (!src) return null;
  const vertices = mesh.vertices.map(v => ({ ...v }));
  const sides = splitSides(vertices, src.verts);
  if (!sides) return null;
  const L = src.verts.length;
  // Rotate the loop to start at side 0, so every side is a contiguous run of positions.
  const r0 = sides[0]!.from;
  const loop = src.verts.map((_, i) => src.verts[(r0 + i) % L]!);
  const run = sides.map(s => ({ from: (s.from - r0 + L) % L, to: ((s.to - r0 + L) % L) || L }));
  const sideA = pair === 0 ? 0 : 1, sideB = sideA + 2;

  // Midpoint of a side = midpoint of its two ends (on its straight run); insert it into
  // the side's chain (or reuse the vert already sitting there). Returns the midpoint's
  // vertex index, its loop position, and the edge it split (null if reused).
  const cut = (k: number): { idx: number; pos: number; edge: [number, number] | null } => {
    const p = vertices[loop[run[k]!.from]!]!, q = vertices[loop[run[k]!.to % loop.length]!]!;
    const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: (p.z + q.z) / 2 };
    const before = vertices.length;
    const idx = addOrReuse(vertices, m);
    const reused = idx < before;
    for (let i = run[k]!.from; i < run[k]!.to; i++) {
      const s = loop[i]!, t = loop[(i + 1) % loop.length]!;
      if (reused && s === idx) return { idx, pos: i, edge: null };
      const a = vertices[s]!, b = vertices[t]!;
      // m on segment s→t: |a→m| + |m→b| ≈ |a→b|
      const d = (u: Vec3, v: Vec3) => Math.hypot(u.x - v.x, u.y - v.y, u.z - v.z);
      if (!reused && Math.abs(d(a, m) + d(m, b) - d(a, b)) < EPS_POS) {
        loop.splice(i + 1, 0, idx);
        return { idx, pos: i + 1, edge: [s, t] };
      }
    }
    return { idx, pos: -1, edge: null };
  };
  const cutA = cut(sideA);
  if (cutA.pos < 0) return null;
  if (cutA.edge) for (let k = sideA + 1; k < 4; k++) { run[k]!.from++; run[k]!.to++; }   // later sides shifted by the insert
  const cutB = cut(sideB);
  if (cutB.pos < 0) return null;
  const N = loop.length;

  // Walk the loop from one midpoint to the other; both children keep CCW winding.
  const walk = (from: number, to: number): number[] => {
    const out: number[] = [];
    for (let i = from; ; i = (i + 1) % N) { out.push(loop[i]!); if (i === to) break; }
    return out;
  };
  const childB = walk(cutA.pos, cutB.pos);
  const childA = walk(cutB.pos, cutA.pos);

  const faces = cloneFaces(mesh.faces!);
  // New loops: an inherited `fold` would index the wrong corners.
  faces[faceIdx] = { ...faces[faceIdx]!, verts: childA, fold: undefined };
  faces.push({ ...src, verts: childB, fold: undefined, materialOverrides: src.materialOverrides ? structuredClone(src.materialOverrides) : undefined });

  // T-junction propagation into every other face sharing a split edge (the two
  // children already contain the midpoints, so spliceMidpoint's guard skips them).
  if (cutA.edge) spliceMidpoint(faces, cutA.idx, cutA.edge[0], cutA.edge[1]);
  if (cutB.edge) spliceMidpoint(faces, cutB.idx, cutB.edge[0], cutB.edge[1]);

  const out = { vertices, faces };
  const err = validateMesh(out);
  if (err) { console.warn(`brushOps.splitFaceQuad: aborted (${err})`); return null; }
  return out;
}

/**
 * Inset a face: replace it with a border ring of quads (uniform width `margin`) and
 * a new inner face. Each corner moves inward along its angle bisector with miter
 * length margin/sin(θ/2), so the perpendicular distance from the inner loop to every
 * original edge is exactly `margin` (uniform border even at non-90° corners — a
 * centroid scale would not give this on elongated faces). The inner face takes over
 * faces[faceIdx] (keeps material/overrides, stays selected — ready to EXTRUDE or
 * RECESS); border quads inherit the parent material. Outer-ring vertices are
 * untouched, so no T-junction propagation is needed.
 * Guards reject margins too large for the face (collapsed/inverted inner loop) and
 * degenerate corners. Residual v1 risk: a strongly concave face can produce a
 * self-intersecting inner loop that still passes the area guard — validateMesh
 * catches many such cases; the rest the user undoes.
 */
export function insetFace(mesh: ShapeBrushMesh, faceIdx: number, margin = 0.25): BrushMeshData | null {
  const src = mesh.faces?.[faceIdx];
  if (!src || src.verts.length < 3 || !(margin > 0)) return null;
  const vertices = mesh.vertices.map(v => ({ ...v }));
  const loop = src.verts;
  const L = loop.length;
  const n = newellNormal(vertices, loop);
  if (n.lengthSq() < 0.5) { console.warn("brushOps.insetFace: degenerate normal"); return null; }

  // v4.107.1: the border is built from SIDES, not corners: each side's line moves
  // `margin` inward and neighbouring lines meet at the inner corners. A side whose inner
  // copy would come out zero or reversed (a curve tighter than the border, e.g. a ROUND
  // with a small SIZE) drops out and its neighbours meet in one sharp corner instead, so
  // a rounded face insets at any width that fits. Done in the face's plane (2D).
  const u = new THREE.Vector3(), w = new THREE.Vector3();
  u.set(Math.abs(n.x) < 0.9 ? 1 : 0, Math.abs(n.x) < 0.9 ? 0 : 1, 0).cross(n).normalize();
  w.crossVectors(n, u);
  const O = new THREE.Vector3();
  for (const vi of loop) O.add(new THREE.Vector3(vertices[vi]!.x, vertices[vi]!.y, vertices[vi]!.z));
  O.divideScalar(L);
  const P = loop.map(vi => { const v = new THREE.Vector3(vertices[vi]!.x, vertices[vi]!.y, vertices[vi]!.z).sub(O); return { x: v.dot(u), y: v.dot(w), h: v.dot(n) }; });
  // Side i runs P[i] → P[i+1]; its direction and inward normal (CCW about n → left).
  const dir = P.map((p, i) => { const q = P[(i + 1) % L]!; const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy); return { x: dx / (l || 1), y: dy / (l || 1), l }; });
  if (dir.some(d => d.l < 1e-6)) { console.warn("brushOps.insetFace: zero-length edge"); return null; }
  const line = (i: number) => ({ px: P[i]!.x - dir[i]!.y * margin, py: P[i]!.y + dir[i]!.x * margin, dx: dir[i]!.x, dy: dir[i]!.y });
  const meet = (a: number, b: number): { x: number; y: number } | null => {
    const A = line(a), B = line(b), den = A.dx * B.dy - A.dy * B.dx;
    if (Math.abs(den) < 1e-9) return null;   // parallel sides (a straight-through corner): no meeting point
    const s = ((B.px - A.px) * B.dy - (B.py - A.py) * B.dx) / den;
    return { x: A.px + A.dx * s, y: A.py + A.dy * s };
  };
  // Inner start of active side j = where the previous active side's line meets j's
  // (a straight-through corner just offsets its own point).
  let active = Array.from({ length: L }, (_, i) => i);
  let starts = new Map<number, { x: number; y: number }>();
  for (let pass = 0; pass < L; pass++) {
    if (active.length < 3) { console.warn("brushOps.insetFace: inner loop collapsed (margin too large)"); return null; }
    starts = new Map();
    active.forEach((j, k) => {
      const prev = active[(k + active.length - 1) % active.length]!;
      starts.set(j, meet(prev, j) ?? { x: P[j]!.x - dir[j]!.y * margin, y: P[j]!.y + dir[j]!.x * margin });
    });
    const gone = active.filter((j, k) => {
      const a = starts.get(j)!, b = starts.get(active[(k + 1) % active.length]!)!;
      return (b.x - a.x) * dir[j]!.x + (b.y - a.y) * dir[j]!.y <= 1e-5;   // zero or reversed inner side
    });
    if (!gone.length) break;
    active = active.filter(j => !gone.includes(j));
  }
  if (active.length < 3) { console.warn("brushOps.insetFace: inner loop collapsed (margin too large)"); return null; }
  // Each original corner i maps to the inner start of the first active side at or after i.
  const firstActiveFrom = (i: number) => { for (let k = 0; k < L; k++) { const j = (i + k) % L; if (active.includes(j)) return j; } return i; };
  const innerOf = new Map<number, number>();   // active side → inner vertex index
  const heights = new Map<number, number[]>();
  for (let i = 0; i < L; i++) { const j = firstActiveFrom(i); heights.set(j, [...(heights.get(j) ?? []), P[i]!.h]); }
  for (const j of active) {
    const s2 = starts.get(j)!, hs = heights.get(j) ?? [0], h = hs.reduce((a, b) => a + b, 0) / hs.length;
    const p = O.clone().addScaledVector(u, s2.x).addScaledVector(w, s2.y).addScaledVector(n, h);
    // Never addOrReuse here: welding an inner vertex onto the outer ring would corrupt topology.
    vertices.push({ x: +p.x.toFixed(4), y: +p.y.toFixed(4), z: +p.z.toFixed(4) });
    innerOf.set(j, vertices.length - 1);
  }
  const corner = (i: number) => innerOf.get(firstActiveFrom(i % L))!;
  const inner = active.map(j => innerOf.get(j)!);

  // Inner loop inverted or degenerate → margin too large (raw = Newell vector, ‖raw‖ = 2×area).
  const raw = new THREE.Vector3();
  for (let i = 0; i < inner.length; i++) {
    const a = vertices[inner[i]!]!, c = vertices[inner[(i + 1) % inner.length]!]!;
    raw.x += (a.y - c.y) * (a.z + c.z);
    raw.y += (a.z - c.z) * (a.x + c.x);
    raw.z += (a.x - c.x) * (a.y + c.y);
  }
  if (raw.lengthSq() < 1e-12 || raw.dot(n) <= 0) { console.warn("brushOps.insetFace: inner loop inverted (margin too large)"); return null; }

  const faces = cloneFaces(mesh.faces!);
  faces[faceIdx] = { ...faces[faceIdx]!, verts: inner };
  for (let i = 0; i < L; i++) {
    const a = corner(i), b = corner(i + 1);
    faces.push({
      // Border quad [p, q, qInner, pInner]: supplies p→q (pairs the untouched
      // neighbor's q→p) and qInner→pInner (pairs the inner face's pInner→qInner).
      // A side that dropped out has one inner corner: a triangle [p, q, inner].
      verts: a === b ? [loop[i]!, loop[(i + 1) % L]!, a] : [loop[i]!, loop[(i + 1) % L]!, b, a],
      material: src.material,
      materialOverrides: src.materialOverrides ? structuredClone(src.materialOverrides) : undefined,
    });
  }

  const out = { vertices, faces };
  const err = validateMesh(out);
  if (err) { console.warn(`brushOps.insetFace: aborted (${err})`); return null; }
  return out;
}

/**
 * Extrude a face along its outward normal by `dist` — positive = outward bump,
 * negative = inward recess/carve. The loop's vertices are DUPLICATED (never reused —
 * neighbors keep the original ring), the face is retargeted to the new ring (faceIdx
 * stays on the moved cap), and a side quad [p, q, q', p'] per edge seals the band.
 * Sides inherit the cap's material. A recess deeper than the solid is caught by
 * validateMesh's volume check when gross; a shallow punch-through of a large solid
 * can still validate (net volume positive) — the user undoes those.
 */
export function extrudeFace(mesh: ShapeBrushMesh, faceIdx: number, dist = 0.25): BrushMeshData | null {
  const src = mesh.faces?.[faceIdx];
  if (!src || dist === 0 || !Number.isFinite(dist)) return null;
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
      // Sign-agnostic winding — do NOT flip for negative dist: by directed-edge
      // pairing the band must supply p→q (the neighbor still has q→p) and qd→pd
      // (the moved cap has pd→qd), whichever way the dup ring moved; the quad's
      // geometric normal flips automatically with the sign of dist.
      verts: [p, q, qd, pd],
      material: src.material,
      materialOverrides: src.materialOverrides ? structuredClone(src.materialOverrides) : undefined,
    });
  }

  const out = { vertices, faces };
  const err = validateMesh(out);
  if (err) { console.warn(`brushOps.extrudeFace: aborted (${err})`); return null; }
  return out;
}

/**
 * Insert a vertex at the midpoint of an edge: both faces traversing (a,b) gain the
 * midpoint in their loop (e.g. two quads become pentagons). Works on any polygon
 * faces — the generalization of splitFaceQuad's edge cut. Returns the new mesh plus
 * the midpoint's vertex index so the caller can re-select a surviving sub-edge (the
 * original (a,b) pair is no longer traversed after the split, so a stored edge
 * selection on it goes stale).
 */
export function splitEdge(mesh: ShapeBrushMesh, edge: [number, number]): SplitEdgeResult | null {
  const [a, b] = edge;
  if (!mesh.faces?.length || a === b) return null;
  if (a < 0 || b < 0 || a >= mesh.vertices.length || b >= mesh.vertices.length) return null;
  const vertices = mesh.vertices.map(v => ({ ...v }));
  const va = vertices[a]!, vb = vertices[b]!;
  const mid = addOrReuse(vertices, { x: (va.x + vb.x) / 2, y: (va.y + vb.y) / 2, z: (va.z + vb.z) / 2 });
  const faces = cloneFaces(mesh.faces);
  // Exactly the two adjacent faces must take the splice (manifold invariant); also
  // catches addOrReuse welding onto a vertex already inside one of those loops.
  const count = spliceMidpoint(faces, mid, a, b);
  if (count !== 2) { console.warn(`brushOps.splitEdge: edge traversed ${count}× (expected 2)`); return null; }
  const out = { vertices, faces };
  const err = validateMesh(out);
  if (err) { console.warn(`brushOps.splitEdge: aborted (${err})`); return null; }
  return { mesh: out, mid };
}

// ── Loop cut (Phase 79) ──────────────────────────────────────────────────────
// A ring of SPLITs: the ring crosses four-cornered faces, entering through one side
// and leaving through the opposite side. Those crossed sides are the RAILS; each gets
// one new vertex at its middle. The cut itself is splitFaceQuad per ring face (it
// already reuses shared midpoints and splices open ends into the face they stop at).

export type { LoopCutStart };

/** Why a ring stopped short of closing, and where (the rail midpoint it reached). */
export interface LoopCutStop {
  faceIdx: number | null;   // face it couldn't enter (null = no face across)
  reason:  "not-quad" | "partial-side" | "ambiguous" | "revisit" | "open";
  corners?: number;         // the blocking face's corner count, for "not-quad"
  at:      Vec3;
}

/** One ring face: its SPLIT pair plus its two rails as corner-vertex pairs. */
export interface LoopCutFace { faceIdx: number; pair: 0 | 1; rails: [[number, number], [number, number]] }

export interface LoopCutRing { faces: LoopCutFace[]; closed: boolean; stops: LoopCutStop[] }

/** A quad face's 4 sides as vertex runs, corner to corner inclusive (straight-through
 *  verts included). Null unless the face has 4 real corners. */
function quadSides(vertices: Vec3[], loop: number[]): number[][] | null {
  const c = quadCorners(vertices, loop);
  if (!c) return null;
  const L = loop.length;
  return [0, 1, 2, 3].map(k => {
    const run: number[] = [];
    for (let i = c[k]!; ; i = (i + 1) % L) { run.push(loop[i]!); if (i === c[(k + 1) % 4]) break; }
    return run;
  });
}

const midOf = (vertices: Vec3[], p: number, q: number): Vec3 => {
  const a = vertices[p]!, b = vertices[q]!;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
};

/** The side index (0..3) of a quad whose corner ends are {p, q}, or null. */
function sideWithEnds(sides: number[][], p: number, q: number): number | null {
  for (let k = 0; k < 4; k++) {
    const s = sides[k]!, a = s[0]!, b = s[s.length - 1]!;
    if ((a === p && b === q) || (a === q && b === p)) return k;
  }
  return null;
}

/**
 * Plan a loop cut without changing anything: which faces the ring crosses (in ring
 * order), whether it closes, and where it stops. Used by the cut and the preview.
 * An edge start becomes a face start on the first four-cornered face using the edge.
 */
export function loopCutRing(mesh: ShapeBrushMesh, start: LoopCutStart): LoopCutRing | null {
  const faces = mesh.faces;
  if (!faces?.length) return null;
  const vertices = mesh.vertices;

  // Undirected segment → faces traversing it.
  const segFaces = new Map<string, number[]>();
  const key = (a: number, b: number) => a < b ? `${a}|${b}` : `${b}|${a}`;
  faces.forEach((f, fi) => f.verts.forEach((v, i) => {
    const k = key(v, f.verts[(i + 1) % f.verts.length]!);
    const list = segFaces.get(k);
    if (list) list.push(fi); else segFaces.set(k, [fi]);
  }));

  let startFace: number, startPair: 0 | 1;
  if ("edge" in start) {
    const [a, b] = start.edge;
    const hit = (segFaces.get(key(a, b)) ?? []).find(fi => {
      const sides = quadSides(vertices, faces[fi]!.verts);
      return sides?.some(s => s.some((v, i) => i + 1 < s.length && key(v, s[i + 1]!) === key(a, b)));
    });
    if (hit === undefined) return null;
    const sides = quadSides(vertices, faces[hit]!.verts)!;
    const k = sides.findIndex(s => s.some((v, i) => i + 1 < s.length && key(v, s[i + 1]!) === key(a, b)));
    startFace = hit; startPair = (k % 2) as 0 | 1;
  } else {
    if (!faces[start.faceIdx] || !quadSides(vertices, faces[start.faceIdx]!.verts)) return null;
    startFace = start.faceIdx; startPair = start.pair;
  }

  const ends = (s: number[]): [number, number] => [s[0]!, s[s.length - 1]!];
  const s0 = quadSides(vertices, faces[startFace]!.verts)!;
  const first: LoopCutFace = { faceIdx: startFace, pair: startPair, rails: [ends(s0[startPair]!), ends(s0[startPair + 2]!)] };
  const visited = new Set([startFace]);
  const stops: LoopCutStop[] = [];

  // Walk out of `fromFace` through side run `exit` until the ring closes or stops.
  const walk = (fromFace: number, exit: number[]): { chain: LoopCutFace[]; closed: boolean } => {
    const chain: LoopCutFace[] = [];
    let fi = fromFace, run = exit;
    for (;;) {
      const [p, q] = ends(run);
      const at = midOf(vertices, p, q);
      // The face across the segment of `run` that holds the side's midpoint.
      const across = new Set<number>();
      for (let i = 0; i + 1 < run.length; i++) {
        const a = vertices[run[i]!]!, b = vertices[run[i + 1]!]!;
        const d = (u: Vec3, w: Vec3) => Math.hypot(u.x - w.x, u.y - w.y, u.z - w.z);
        if (Math.abs(d(a, at) + d(at, b) - d(a, b)) < EPS_POS) {
          for (const g of segFaces.get(key(run[i]!, run[i + 1]!)) ?? []) if (g !== fi) across.add(g);
        }
      }
      if (across.size === 0) { stops.push({ faceIdx: null, reason: "open", at }); return { chain, closed: false }; }
      if (across.size > 1)   { stops.push({ faceIdx: null, reason: "ambiguous", at }); return { chain, closed: false }; }
      const g = [...across][0]!;
      if (g === startFace) return { chain, closed: true };
      if (visited.has(g)) { stops.push({ faceIdx: g, reason: "revisit", at }); return { chain, closed: false }; }
      const sides = quadSides(vertices, faces[g]!.verts);
      if (!sides) {
        stops.push({ faceIdx: g, reason: "not-quad", corners: faces[g]!.verts.length, at });
        return { chain, closed: false };
      }
      const k = sideWithEnds(sides, p, q);
      if (k === null) { stops.push({ faceIdx: g, reason: "partial-side", at }); return { chain, closed: false }; }
      visited.add(g);
      const out = sides[(k + 2) % 4]!;
      chain.push({ faceIdx: g, pair: (k % 2) as 0 | 1, rails: [[p, q], ends(out)] });
      fi = g; run = out;
    }
  };

  const a = walk(startFace, s0[startPair + 2]!);
  if (a.closed) return { faces: [first, ...a.chain], closed: true, stops: [] };
  const b = walk(startFace, s0[startPair]!);
  // Ring order: b-chain reversed (rails flipped to [far, near]; either rail gives the
  // same split pair), the start face, then the a-chain.
  const back = b.chain.reverse().map(f => ({ ...f, rails: [f.rails[1], f.rails[0]] as LoopCutFace["rails"] }));
  return { faces: [...back, first, ...a.chain], closed: false, stops };
}

/** Result of a loop cut: the new mesh plus the ring's vertex indices in ring order. */
export interface LoopCutResult { mesh: BrushMeshData; ring: LoopCutRing; ringVerts: number[] }

/** Cut the ring `loopCutRing` plans: one splitFaceQuad per ring face, validated at the end. */
export function loopCut(mesh: ShapeBrushMesh, start: LoopCutStart): LoopCutResult | null {
  const ring = loopCutRing(mesh, start);
  if (!ring) return null;
  // Rail midpoints in ring order (each rail once; a closed ring's last rail = its first).
  const railMids: Vec3[] = [];
  const seen = new Set<string>();
  for (const f of ring.faces) for (const [p, q] of f.rails) {
    const k = p < q ? `${p}|${q}` : `${q}|${p}`;
    if (!seen.has(k)) { seen.add(k); railMids.push(midOf(mesh.vertices, p, q)); }
  }

  let cur: BrushMeshData = { vertices: mesh.vertices, faces: mesh.faces! };
  for (const f of ring.faces) {
    // Re-derive the pair from the entry rail: earlier splits splice points into this
    // face's loop. Face indices are stable (splitFaceQuad keeps the index, appends).
    const sides = quadSides(cur.vertices, cur.faces[f.faceIdx]!.verts);
    const k = sides ? sideWithEnds(sides, f.rails[0][0], f.rails[0][1]) : null;
    if (k === null) { console.warn("brushOps.loopCut: ring face changed shape mid-cut"); return null; }
    const next = splitFaceQuad(cur, f.faceIdx, (k % 2) as 0 | 1);
    if (!next) return null;   // splitFaceQuad logged why
    cur = next;
  }
  const err = validateMesh(cur);
  if (err) { console.warn(`brushOps.loopCut: aborted (${err})`); return null; }

  const ringVerts = railMids.map(m => cur.vertices.findIndex(v =>
    (v.x - m.x) ** 2 + (v.y - m.y) ** 2 + (v.z - m.z) ** 2 < EPS_POS_SQ));
  return { mesh: cur, ring, ringVerts: ringVerts.filter(i => i >= 0) };
}

// ── Edge loop select (Phase 80) ──────────────────────────────────────────────

/**
 * The vertices along an edge loop through edge [a, b], in order (Blender's rule):
 * at each vertex keep going only through a regular 4-way junction (exactly 4
 * neighbours, all 4 surrounding faces four-cornered), taking the edge that shares no
 * face with the one we arrived on. Anything else (3 or 5+ neighbours, a triangle or
 * n-gon, a straight-through point) ends the loop there. `closed` when it comes back
 * round to its start.
 */
export function edgeLoop(mesh: ShapeBrushMesh, edge: [number, number]): { verts: number[]; closed: boolean } | null {
  const faces = mesh.faces;
  if (!faces?.length) return null;
  const vertices = mesh.vertices;
  const key = (p: number, q: number) => p < q ? `${p}|${q}` : `${q}|${p}`;
  const nbrs = new Map<number, Set<number>>();
  const edgeFaces = new Map<string, number[]>();
  const vertFaces = new Map<number, Set<number>>();
  faces.forEach((f, fi) => f.verts.forEach((v, i) => {
    const w = f.verts[(i + 1) % f.verts.length]!;
    if (!nbrs.has(v)) nbrs.set(v, new Set());
    if (!nbrs.has(w)) nbrs.set(w, new Set());
    nbrs.get(v)!.add(w); nbrs.get(w)!.add(v);
    const k = key(v, w);
    edgeFaces.set(k, [...(edgeFaces.get(k) ?? []), fi]);
    if (!vertFaces.has(v)) vertFaces.set(v, new Set());
    vertFaces.get(v)!.add(fi);
  }));
  const [a, b] = edge;
  if (!edgeFaces.has(key(a, b))) return null;

  const regular = (v: number): boolean =>
    nbrs.get(v)?.size === 4 && [...vertFaces.get(v)!].every(fi => quadCorners(vertices, faces[fi]!.verts) !== null);
  const straightOn = (from: number, at: number): number | null => {
    if (!regular(at)) return null;
    const inFaces = new Set(edgeFaces.get(key(from, at)) ?? []);
    const next = [...nbrs.get(at)!].filter(n => n !== from &&
      !(edgeFaces.get(key(at, n)) ?? []).some(fi => inFaces.has(fi)));
    return next.length === 1 ? next[0]! : null;
  };

  // Walk forward from b; if it closes, done. Otherwise walk backward from a.
  const fwd = [a, b];
  for (let prev = a, cur = b; ;) {
    const nx = straightOn(prev, cur);
    if (nx === null) break;
    if (nx === a) return { verts: fwd, closed: true };
    if (fwd.includes(nx)) break;
    fwd.push(nx); prev = cur; cur = nx;
  }
  const back: number[] = [];
  for (let prev = b, cur = a; ;) {
    const nx = straightOn(prev, cur);
    if (nx === null || fwd.includes(nx) || back.includes(nx)) break;
    back.push(nx); prev = cur; cur = nx;
  }
  return { verts: [...back.reverse(), ...fwd], closed: false };
}

/**
 * "Around a face" loop select (v4.97.0): the corners around the flat area on one side
 * of an edge, in order. The area is face `faceIdx` plus every face connected to it
 * through shared edges that lies in the same plane, so on a plain cube it's that
 * face's outline and on a cube whose top was split it's the whole top's outline. The
 * outline is the area's boundary edges chained into a loop; when the area has more
 * than one (an inset frame has an outer and an inner one), the loop through `edge`
 * wins, else the longest.
 */
export function flatAreaOutline(mesh: ShapeBrushMesh, faceIdx: number, edge: [number, number]): number[] | null {
  const faces = mesh.faces;
  const start = faces?.[faceIdx];
  if (!faces || !start) return null;
  const V = mesh.vertices;
  const n0 = newellNormal(V, start.verts);
  const p0 = V[start.verts[0]!]!;
  const inPlane = (fi: number): boolean => {
    const f = faces[fi]!;
    if (newellNormal(V, f.verts).dot(n0) < EPS_NRM) return false;
    return f.verts.every(i => Math.abs((V[i]!.x - p0.x) * n0.x + (V[i]!.y - p0.y) * n0.y + (V[i]!.z - p0.z) * n0.z) < EPS_PLANE);
  };
  const key = (a: number, b: number) => a < b ? `${a}|${b}` : `${b}|${a}`;
  const edgeFaces = new Map<string, number[]>();
  faces.forEach((f, fi) => f.verts.forEach((v, i) => {
    const k = key(v, f.verts[(i + 1) % f.verts.length]!);
    edgeFaces.set(k, [...(edgeFaces.get(k) ?? []), fi]);
  }));

  // Flood the flat area through shared edges.
  const area = new Set([faceIdx]);
  const queue = [faceIdx];
  while (queue.length) {
    const f = faces[queue.pop()!]!;
    f.verts.forEach((v, i) => {
      for (const g of edgeFaces.get(key(v, f.verts[(i + 1) % f.verts.length]!)) ?? []) {
        if (!area.has(g) && inPlane(g)) { area.add(g); queue.push(g); }
      }
    });
  }

  // Boundary = directed edges of area faces whose neighbour across isn't in the area.
  const next = new Map<number, number>();
  for (const fi of area) {
    const f = faces[fi]!;
    f.verts.forEach((v, i) => {
      const w = f.verts[(i + 1) % f.verts.length]!;
      if ((edgeFaces.get(key(v, w)) ?? []).every(g => g === fi || !area.has(g))) next.set(v, w);
    });
  }
  const loops: number[][] = [];
  const used = new Set<number>();
  for (const s of next.keys()) {
    if (used.has(s)) continue;
    const loop: number[] = [];
    for (let v: number | undefined = s; v !== undefined && !used.has(v); v = next.get(v)) { used.add(v); loop.push(v); }
    if (loop.length >= 3) loops.push(loop);
  }
  if (!loops.length) return null;
  const through = loops.find(l => l.includes(edge[0]) && l.includes(edge[1]));
  if (through) return through;
  const perimeter = (l: number[]) => l.reduce((s, v, i) => {
    const a = V[v]!, b = V[l[(i + 1) % l.length]!]!;
    return s + Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  }, 0);
  return loops.reduce((best, l) => perimeter(l) > perimeter(best) ? l : best);
}

// ── Face sets: region INSET / EXTRUDE / RECESS (Phase 81) ────────────────────

/** A region op's result: the new mesh, or why it was refused (nothing changed). */
export type RegionOpResult = { mesh: BrushMeshData } | { refused: string };

/**
 * The outer boundary of a face set: every edge of a set face whose face across isn't in
 * the set, directed as that set face walks it (`owner`), plus the boundary corners.
 * Interior edges (between two set faces) are not part of it.
 */
export function regionBoundary(mesh: ShapeBrushMesh, set: number[]): {
  edges: Array<{ p: number; q: number; owner: number }>;
  corners: Set<number>;
} {
  const faces = mesh.faces ?? [];
  const inSet = new Set(set);
  const key = (a: number, b: number) => a < b ? `${a}|${b}` : `${b}|${a}`;
  const edgeFaces = new Map<string, number[]>();
  faces.forEach((f, fi) => f.verts.forEach((v, i) => {
    const k = key(v, f.verts[(i + 1) % f.verts.length]!);
    edgeFaces.set(k, [...(edgeFaces.get(k) ?? []), fi]);
  }));
  const edges: Array<{ p: number; q: number; owner: number }> = [];
  const corners = new Set<number>();
  for (const fi of inSet) {
    const f = faces[fi];
    if (!f) continue;
    f.verts.forEach((p, i) => {
      const q = f.verts[(i + 1) % f.verts.length]!;
      if ((edgeFaces.get(key(p, q)) ?? []).some(g => g !== fi && inSet.has(g))) return;
      edges.push({ p, q, owner: fi });
      corners.add(p); corners.add(q);
    });
  }
  return { edges, corners };
}

/**
 * Per-corner offset that moves every face of a set exactly `dist` along its own normal
 * while keeping the faces joined: `o · n = dist` for the normal `n` of every set face
 * around the corner (1 normal: `dist n`; 2: `dist (n1 + n2) / (1 + n1 · n2)`; 3+: least
 * squares). Null when a corner's faces fold back on each other (no such offset).
 * Shared by extrudeRegion (EXTRUDE / RECESS) and offsetRegion (PUSH).
 */
export function regionOffsets(mesh: ShapeBrushMesh, set: number[], dist: number): Map<number, THREE.Vector3> | null {
  const faces0 = mesh.faces!;
  const V0 = mesh.vertices;
  // Normals of the set faces around each set corner.
  const around = new Map<number, THREE.Vector3[]>();
  for (const fi of set) {
    const n = newellNormal(V0, faces0[fi]!.verts);
    for (const v of faces0[fi]!.verts) {
      const list = around.get(v) ?? [];
      if (!list.some(m => m.dot(n) > EPS_NRM)) list.push(n);
      around.set(v, list);
    }
  }
  const offsetFor = (ns: THREE.Vector3[]): THREE.Vector3 | null => {
    if (ns.length === 1) return ns[0]!.clone().multiplyScalar(dist);
    if (ns.length === 2) {
      const [a, b] = ns as [THREE.Vector3, THREE.Vector3];
      const den = 1 + a.dot(b);
      return den < 1e-6 ? null : a.clone().add(b).multiplyScalar(dist / den);
    }
    // 3+: least squares (Σ n nᵀ) o = dist Σ n
    const m = new THREE.Matrix3().set(0, 0, 0, 0, 0, 0, 0, 0, 0);
    const e = m.elements;
    const rhs = new THREE.Vector3();
    for (const n of ns) {
      const c = [n.x, n.y, n.z];
      for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) e[k * 3 + r]! += c[r]! * c[k]!;
      rhs.addScaledVector(n, dist);
    }
    if (Math.abs(m.determinant()) < 1e-9) return null;
    return rhs.applyMatrix3(m.clone().invert());
  };

  const out = new Map<number, THREE.Vector3>();
  for (const [v, ns] of around) {
    const o = offsetFor(ns);
    if (!o) return null;
    out.set(v, o);
  }
  return out;
}

/**
 * PUSH (v4.99.0): move a face set `dist` along its faces' own normals without adding
 * walls: the same offsets as extrudeRegion, applied to the existing corners, so the set
 * faces grow or shrink to stay joined and the faces around them stretch to follow.
 * Refused if a set face would turn inside out or the mesh fails validateMesh.
 */
export function offsetRegion(mesh: ShapeBrushMesh, set: number[], dist: number): RegionOpResult {
  const faces0 = mesh.faces;
  if (!faces0?.length || !set.length || !Number.isFinite(dist)) return { refused: "nothing to push" };
  const offsets = regionOffsets(mesh, set, dist);
  if (!offsets) return { refused: "a corner where the selected faces fold back on each other" };
  const V0 = mesh.vertices;
  const vertices = V0.map((v, i) => {
    const o = offsets.get(i);
    return o ? { x: +(v.x + o.x).toFixed(4), y: +(v.y + o.y).toFixed(4), z: +(v.z + o.z).toFixed(4) } : { ...v };
  });
  for (const fi of set) {
    const n0 = newellNormal(V0, faces0[fi]!.verts), n1 = newellNormal(vertices, faces0[fi]!.verts);
    if (n1.lengthSq() < 0.5 || n1.dot(n0) <= 0) return { refused: "PUSH would turn faces inside out" };
  }
  const out = { vertices, faces: cloneFaces(faces0) };
  const err = validateMesh(out);
  if (err) return { refused: `PUSH would make an invalid shape (${err})` };
  return { mesh: out };
}

/**
 * Extrude (dist > 0) or recess (dist < 0) a face set as ONE piece. Each corner moves by
 * the offset `o` with `o · n = dist` for the normal of every set face around it, so every
 * face's plane moves exactly `dist` along its own normal and the faces grow or shrink to
 * stay joined (a cylinder band becomes a wider / narrower ring). Boundary corners are
 * duplicated (unselected faces keep the originals) and get one side wall per boundary
 * edge, `[p, q, q', p']` as in extrudeFace (sign-agnostic winding); interior corners just
 * move. A 1-face set gives exactly extrudeFace's result. Refused (nothing changed) if a
 * face would turn inside out or the mesh fails validateMesh.
 */
export function extrudeRegion(mesh: ShapeBrushMesh, set: number[], dist: number): RegionOpResult {
  const faces0 = mesh.faces;
  if (!faces0?.length || !set.length || dist === 0 || !Number.isFinite(dist)) return { refused: "nothing to move" };
  const V0 = mesh.vertices;
  const { edges, corners } = regionBoundary(mesh, set);

  const offsets = regionOffsets(mesh, set, dist);
  if (!offsets) return { refused: "a corner where the selected faces fold back on each other" };

  const vertices = V0.map(v => ({ ...v }));
  const moved = new Map<number, number>();   // old corner → index of its moved position
  for (const [v, o] of offsets) {
    const p = V0[v]!;
    const np = { x: +(p.x + o.x).toFixed(4), y: +(p.y + o.y).toFixed(4), z: +(p.z + o.z).toFixed(4) };
    if (corners.has(v)) { vertices.push(np); moved.set(v, vertices.length - 1); }
    else { vertices[v] = np; moved.set(v, v); }
  }

  const faces = cloneFaces(faces0);
  for (const fi of set) faces[fi] = { ...faces[fi]!, verts: faces[fi]!.verts.map(v => moved.get(v) ?? v) };
  // Every set face must keep facing the same way after the move (else inside out).
  for (const fi of set) {
    const n0 = newellNormal(V0, faces0[fi]!.verts), n1 = newellNormal(vertices, faces[fi]!.verts);
    if (n1.lengthSq() < 0.5 || n1.dot(n0) <= 0) return { refused: dist < 0 ? "RECESS would turn faces inside out" : "EXTRUDE would turn faces inside out" };
  }
  for (const { p, q, owner } of edges) {
    const src = faces0[owner]!;
    faces.push({
      verts: [p, q, moved.get(q)!, moved.get(p)!],
      material: src.material,
      materialOverrides: src.materialOverrides ? structuredClone(src.materialOverrides) : undefined,
    });
  }
  const out = { vertices, faces };
  const err = validateMesh(out);
  if (err) return { refused: `${dist < 0 ? "RECESS" : "EXTRUDE"} would make an invalid shape (${err})` };
  return { mesh: out };
}

/**
 * Inset a face set as ONE region: a border of quads only along its outer boundary,
 * never between two set faces. Each boundary corner gets an inner copy `margin` into
 * the region: along the single set-interior edge leaving it when there is exactly one
 * (a band's rim corner slides down its seam, a patch's side midpoint along its split
 * line), else by insetFace's miter rule in the plane of the set faces there. Set faces
 * swap boundary corners for the inner copies (they stay the selection, ready to
 * EXTRUDE / RECESS); border quads `[p, q, q', p']` take the material of the face they
 * border. Refused if a corner would collapse or a face would flip.
 */
export function insetRegion(mesh: ShapeBrushMesh, set: number[], margin = 0.25): RegionOpResult {
  const faces0 = mesh.faces;
  if (!faces0?.length || !set.length || !(margin > 0)) return { refused: "nothing to inset" };
  const V0 = mesh.vertices;
  const { edges, corners } = regionBoundary(mesh, set);
  if (!edges.length) return { refused: "the selection has no outer edge to inset from (it covers the whole shape)" };
  const inSet = new Set(set);
  const key = (a: number, b: number) => a < b ? `${a}|${b}` : `${b}|${a}`;
  const boundaryKeys = new Set(edges.map(e => key(e.p, e.q)));
  const vec = (v: Vec3) => new THREE.Vector3(v.x, v.y, v.z);

  // Per corner: the set-interior edges leaving it, and the set faces' normal there.
  const interior = new Map<number, Set<number>>();
  const normalAt = new Map<number, THREE.Vector3>();
  for (const fi of inSet) {
    const loop = faces0[fi]!.verts, n = newellNormal(V0, loop);
    loop.forEach((v, i) => {
      normalAt.set(v, (normalAt.get(v) ?? new THREE.Vector3()).add(n));
      for (const w of [loop[(i + 1) % loop.length]!, loop[(i + loop.length - 1) % loop.length]!]) {
        if (!boundaryKeys.has(key(v, w))) { const s = interior.get(v) ?? new Set(); s.add(w); interior.set(v, s); }
      }
    });
  }
  const prevOf = new Map<number, number>(), nextOf = new Map<number, number>();
  for (const { p, q } of edges) { nextOf.set(p, q); prevOf.set(q, p); }

  const vertices = V0.map(v => ({ ...v }));
  const inner = new Map<number, number>();
  for (const c of corners) {
    const cur = vec(V0[c]!);
    let pos: THREE.Vector3;
    const ins = [...(interior.get(c) ?? [])];
    if (ins.length === 1) {
      const toW = vec(V0[ins[0]!]!).sub(cur);
      if (toW.length() <= margin * 1.05) return { refused: "the border is wider than the faces it would cut into" };
      pos = cur.addScaledVector(toW.normalize(), margin);
    } else {
      const a = prevOf.get(c), b = nextOf.get(c);
      const n = normalAt.get(c)?.clone().normalize();
      if (a === undefined || b === undefined || !n || n.lengthSq() < 0.5) return { refused: "a corner the border can't go round" };
      const dPrev = cur.clone().sub(vec(V0[a]!)); dPrev.addScaledVector(n, -dPrev.dot(n));
      const dNext = vec(V0[b]!).sub(cur); dNext.addScaledVector(n, -dNext.dot(n));
      if (dPrev.lengthSq() < 1e-12 || dNext.lengthSq() < 1e-12) return { refused: "a zero-length edge on the border" };
      const mPrev = new THREE.Vector3().crossVectors(n, dPrev.normalize());
      const mNext = new THREE.Vector3().crossVectors(n, dNext.normalize());
      const bis = mPrev.clone().add(mNext);
      if (bis.lengthSq() < 1e-12) return { refused: "a spike-shaped corner on the border" };
      bis.normalize();
      const denom = bis.dot(mNext);
      if (denom < 0.05) return { refused: "a corner too sharp to inset" };
      pos = cur.addScaledVector(bis, margin / denom);
    }
    vertices.push({ x: +pos.x.toFixed(4), y: +pos.y.toFixed(4), z: +pos.z.toFixed(4) });
    inner.set(c, vertices.length - 1);
  }

  const faces = cloneFaces(faces0);
  for (const fi of inSet) faces[fi] = { ...faces[fi]!, verts: faces[fi]!.verts.map(v => inner.get(v) ?? v), fold: undefined };
  for (const fi of inSet) {
    const n0 = newellNormal(V0, faces0[fi]!.verts), n1 = newellNormal(vertices, faces[fi]!.verts);
    const area = (() => { const l = faces[fi]!.verts; let s = 0; for (let i = 1; i < l.length - 1; i++) s += vec(vertices[l[i]!]!).sub(vec(vertices[l[0]!]!)).cross(vec(vertices[l[i + 1]!]!).sub(vec(vertices[l[0]!]!))).length(); return s; })();
    if (area < 1e-6 || n1.dot(n0) <= 0) return { refused: "the border is wider than the faces it would cut into" };
  }
  for (const { p, q, owner } of edges) {
    const src = faces0[owner]!;
    faces.push({
      verts: [p, q, inner.get(q)!, inner.get(p)!],
      material: src.material,
      materialOverrides: src.materialOverrides ? structuredClone(src.materialOverrides) : undefined,
    });
  }
  const out = { vertices, faces };
  const err = validateMesh(out);
  if (err) return { refused: `INSET would make an invalid shape (${err})` };
  return { mesh: out };
}

// ── Soft falloff (Phase 82) ─────────────────────────────────────────────────

export type SoftCurve = "smooth" | "linear" | "sharp";

/** How much a corner follows, by its distance as a fraction of the radius (0 = at a
 *  moved corner, 1 = the edge of the reach, where it stops following). */
export function softWeight(t: number, curve: SoftCurve): number {
  if (t >= 1) return 0;
  if (t <= 0) return 1;
  return curve === "linear" ? 1 - t : curve === "sharp" ? (1 - t) * (1 - t) : 1 - t * t * (3 - 2 * t);
}

/**
 * Soft falloff: the corners near the moved ones follow part of the way. `sources` are
 * the corners the drag moves (their positions in `next` are final). Every other corner
 * within `radius` of a source takes w × that nearest source's displacement, w from
 * `softWeight`. Distance is measured ALONG THE SURFACE (shortest path over the face
 * edges, from the original positions), so the far side of a thin slab stays put; a
 * cloud brush (no faces) uses straight-line distance. Returns the new vertex array and
 * the corners it moved with their weights (for the preview); `next` is returned as is
 * when radius ≤ 0.
 */
export function softDisplace(
  orig: Vec3[], next: Vec3[], sources: number[], faces: BrushFace[] | undefined,
  radius: number, curve: SoftCurve,
): { vertices: Vec3[]; affected: Array<{ i: number; w: number }> } {
  const n = orig.length;
  if (radius <= 0 || !sources.length) return { vertices: next, affected: [] };
  const dist = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const len = (a: number, b: number) => Math.hypot(orig[a]!.x - orig[b]!.x, orig[a]!.y - orig[b]!.y, orig[a]!.z - orig[b]!.z);
  for (const s of sources) { if (s < n) { dist[s] = 0; from[s] = s; } }
  if (faces?.length) {
    const adj: number[][] = Array.from({ length: n }, () => []);
    for (const f of faces) {
      for (let k = 0; k < f.verts.length; k++) {
        const a = f.verts[k]!, b = f.verts[(k + 1) % f.verts.length]!;
        if (!adj[a]!.includes(b)) { adj[a]!.push(b); adj[b]!.push(a); }
      }
    }
    // Dijkstra (meshes are small; a linear scan for the next corner is fine).
    const done = new Uint8Array(n);
    for (;;) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i]! < radius && (u < 0 || dist[i]! < dist[u]!)) u = i;
      if (u < 0) break;
      done[u] = 1;
      for (const v of adj[u]!) {
        const d = dist[u]! + len(u, v);
        if (d < dist[v]!) { dist[v] = d; from[v] = from[u]!; }
      }
    }
  } else {
    for (let i = 0; i < n; i++) {
      if (dist[i] === 0) continue;
      for (const s of sources) { const d = len(i, s); if (d < dist[i]!) { dist[i] = d; from[i] = s; } }
    }
  }
  const moved = new Set(sources);
  const affected: Array<{ i: number; w: number }> = [];
  const vertices = next.map((v, i) => {
    if (moved.has(i) || from[i]! < 0) return v;
    const w = softWeight(dist[i]! / radius, curve);
    if (w <= 0) return v;
    const s = from[i]!, o = orig[i]!;
    affected.push({ i, w });
    return {
      x: +(o.x + w * (next[s]!.x - orig[s]!.x)).toFixed(4),
      y: +(o.y + w * (next[s]!.y - orig[s]!.y)).toFixed(4),
      z: +(o.z + w * (next[s]!.z - orig[s]!.z)).toFixed(4),
    };
  });
  return { vertices, affected };
}

// ── Round edges / bevel (Phase 83) ──────────────────────────────────────────

/**
 * Round each edge (a bevel): the sharp edge becomes a curve of `steps` thin faces
 * starting `size` back from the edge along the two faces it joins (1 step = a flat
 * cut-off). Edges are vertex-index pairs; they may share faces but not corners. The
 * curve at each end is `C + (pA − C) cos θ + (pB − C) sin θ`, C = pA + pB − corner:
 * tangent to both faces (a circular arc on a right angle). When three faces meet at a
 * corner the third face takes the curve in place of the corner; with more faces there,
 * the curve's ends are spliced into the two rail faces and a flat patch fills the gap.
 * Unused corners are compacted away. Refused (with a reason) rather than half-applied.
 */
export function roundEdges(mesh: ShapeBrushMesh, edges: Array<[number, number]>, size: number, steps: number, id = `r${Math.random().toString(36).slice(2, 8)}`): RegionOpResult {
  if (!mesh.faces?.length) return { refused: "Only edited brushes (with faces) can be rounded." };
  if (!edges.length) return { refused: "Select an edge first." };
  if (!(size > 0) || !Number.isFinite(size)) return { refused: "SIZE must be more than 0." };
  steps = Math.max(1, Math.min(64, Math.round(steps)));
  const ends = edges.flat();
  if (new Set(ends).size !== ends.length) return { refused: "Two of the selected edges meet at a corner; rounding both isn't supported yet." };

  const vertices = mesh.vertices.map(v => ({ ...v }));
  let faces = cloneFaces(mesh.faces);
  const r4 = (n: number) => +n.toFixed(4);
  const findDirected = (p: number, q: number) => faces.findIndex(f => f.verts.some((v, i) => v === p && f.verts[(i + 1) % f.verts.length] === q));
  const at = (f: BrushFace, v: number, off: number) => { const L = f.verts.length, i = f.verts.indexOf(v); return f.verts[(i + off + L) % L]!; };

  for (const [part, [a, b]] of edges.entries()) {
    const fa = findDirected(a, b), fb = findDirected(b, a);
    if (fa < 0 || fb < 0) return { refused: "That edge isn't between two faces." };
    const FA = faces[fa]!, FB = faces[fb]!;
    // Rails: the other edge of FA / FB at each end.
    const naA = at(FA, a, -1), nbA = at(FA, b, +1), naB = at(FB, a, +1), nbB = at(FB, b, -1);
    const railPoint = (end: number, toward: number): Vec3 | null => {
      const e = vertices[end]!, t = vertices[toward]!;
      const len = Math.hypot(t.x - e.x, t.y - e.y, t.z - e.z);
      if (size >= len - 1e-4) return null;
      const k = size / len;
      return { x: e.x + (t.x - e.x) * k, y: e.y + (t.y - e.y) * k, z: e.z + (t.z - e.z) * k };
    };
    const pA = [railPoint(a, naA), railPoint(a, naB)], pB = [railPoint(b, nbA), railPoint(b, nbB)];
    if (pA.some(p => !p) || pB.some(p => !p)) return { refused: "SIZE is too big: the curve would run past the next corner." };
    const curve = (corner: Vec3, p0: Vec3, p1: Vec3): number[] => {
      const C = { x: p0.x + p1.x - corner.x, y: p0.y + p1.y - corner.y, z: p0.z + p1.z - corner.z };
      return Array.from({ length: steps + 1 }, (_, i) => {
        const t = (i / steps) * Math.PI / 2, c = Math.cos(t), s = Math.sin(t);
        vertices.push({
          x: r4(C.x + (p0.x - C.x) * c + (p1.x - C.x) * s),
          y: r4(C.y + (p0.y - C.y) * c + (p1.y - C.y) * s),
          z: r4(C.z + (p0.z - C.z) * c + (p1.z - C.z) * s),
        });
        return vertices.length - 1;
      });
    };
    const A = curve(vertices[a]!, pA[0]!, pA[1]!);   // A[0] on FA's rail, A[steps] on FB's
    const B = curve(vertices[b]!, pB[0]!, pB[1]!);

    // Rail faces / end faces, found before FA / FB change.
    const g1 = findDirected(a, naA), gk = findDirected(naB, a);   // around a
    const h1 = findDirected(nbA, b), hk = findDirected(b, nbB);   // around b
    if (g1 < 0 || gk < 0 || h1 < 0 || hk < 0) return { refused: "That edge's corners aren't closed; nothing changed." };

    const swap = (fi: number, from: number, to: number) => { faces[fi] = { ...faces[fi]!, verts: faces[fi]!.verts.map(v => v === from ? to : v) }; };
    swap(fa, a, A[0]!); swap(fa, b, B[0]!);
    swap(fb, a, A[steps]!); swap(fb, b, B[steps]!);
    // Phase 84: every curve face remembers the curve (sig is filled in once it's built).
    const tag = { id, part, steps, size, a: { ...vertices[a]! }, b: { ...vertices[b]! }, sig: "" };
    const stripMat = { material: FA.material, materialOverrides: FA.materialOverrides ? structuredClone(FA.materialOverrides) : undefined, round: tag };
    for (let i = 0; i < steps; i++) faces.push({ verts: [B[i]!, A[i]!, A[i + 1]!, B[i + 1]!], ...stripMat });

    // End at a: the curve runs A[steps] → … → A[0] in the end face (or patch).
    const insertAfter = (fi: number, v: number, add: number) => { const vs = [...faces[fi]!.verts]; vs.splice(vs.indexOf(v) + 1, 0, add); faces[fi] = { ...faces[fi]!, verts: vs }; };
    const insertBefore = (fi: number, v: number, add: number) => { const vs = [...faces[fi]!.verts]; vs.splice(vs.indexOf(v), 0, add); faces[fi] = { ...faces[fi]!, verts: vs }; };
    const replaceWith = (fi: number, v: number, run: number[]) => { const vs = [...faces[fi]!.verts]; vs.splice(vs.indexOf(v), 1, ...run); faces[fi] = { ...faces[fi]!, verts: vs }; };
    if (g1 === gk) {
      replaceWith(g1, a, [...A].reverse());
    } else {
      insertAfter(g1, a, A[0]!);           // a → A0 → naA
      insertBefore(gk, a, A[steps]!);      // naB → A_s → a
      const src = faces[g1]!;
      faces.push({ verts: [a, ...[...A].reverse()], material: src.material, materialOverrides: src.materialOverrides ? structuredClone(src.materialOverrides) : undefined, round: { ...tag, patch: true } });
    }
    // End at b: B[0] → … → B[steps].
    if (h1 === hk) {
      replaceWith(h1, b, [...B]);
    } else {
      insertBefore(h1, b, B[0]!);          // nbA → B0 → b
      insertAfter(hk, b, B[steps]!);       // b → B_s → nbB
      const src = faces[h1]!;
      faces.push({ verts: [b, ...B], material: src.material, materialOverrides: src.materialOverrides ? structuredClone(src.materialOverrides) : undefined, round: { ...tag, patch: true } });
    }
    // Faces that changed corner count can't keep a 4-corner fold choice.
    faces = faces.map(f => (f.fold !== undefined && f.verts.length !== 4) ? (({ fold: _f, ...rest }) => rest)(f) : f);
  }

  // Compact: drop corners no face uses any more (the rounded edges' old ends).
  const used = new Set(faces.flatMap(f => f.verts));
  const remap = new Map<number, number>();
  const outVerts: Vec3[] = [];
  vertices.forEach((v, i) => { if (used.has(i)) { remap.set(i, outVerts.length); outVerts.push(v); } });
  const out = { vertices: outVerts, faces: faces.map(f => ({ ...f, verts: f.verts.map(v => remap.get(v)!) })) };
  const err = validateMesh(out);
  if (err) return { refused: `Rounding would break the brush (${err}); nothing changed.` };
  stampRoundSig(out, id);
  return { mesh: out };
}

// ── Editable curves (Phase 84) ───────────────────────────────────────────────

/** Fingerprint of a curve: the positions of every corner its faces use, sorted. */
export function roundSig(mesh: { vertices: Vec3[]; faces: BrushFace[] }, id: string): string {
  const vs = new Set<number>();
  for (const f of mesh.faces) if (f.round?.id === id) f.verts.forEach(v => vs.add(v));
  return [...vs].map(i => { const v = mesh.vertices[i]!; return `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`; }).sort().join(";");
}

function stampRoundSig(mesh: { vertices: Vec3[]; faces: BrushFace[] }, id: string): void {
  const sig = roundSig(mesh, id);
  mesh.faces = mesh.faces.map(f => f.round?.id === id ? { ...f, round: { ...f.round, sig } } : f);
}

export interface RoundInfo { id: string; parts: number[]; steps: number; size: number; edited: boolean; faces: number[] }

/** The curves on a brush, oldest first (v4.106.1). Ids are `r` + a base-36 time stamp
 *  (a split adds `.part`), so sorting by id keeps each curve's number stable when
 *  STEPS / SIZE rebuild it (its faces move to the end of the face list). */
export function roundsOf(mesh: { vertices: Vec3[]; faces?: BrushFace[] }): RoundInfo[] {
  const out = new Map<string, RoundInfo>();
  (mesh.faces ?? []).forEach((f, fi) => {
    const r = f.round;
    if (!r) return;
    const info = out.get(r.id) ?? { id: r.id, parts: [], steps: r.steps, size: r.size, edited: false, faces: [] };
    if (!info.parts.includes(r.part)) info.parts.push(r.part);
    info.faces.push(fi);
    out.set(r.id, info);
  });
  for (const info of out.values()) {
    const sig = mesh.faces![info.faces[0]!]!.round!.sig;
    info.edited = roundSig({ vertices: mesh.vertices, faces: mesh.faces! }, info.id) !== sig;
    info.parts.sort((p, q) => p - q);
  }
  return [...out.values()].sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
}

/** The curve a face belongs to, or (for an edge) one of its two faces does. */
export function roundAt(mesh: { faces?: BrushFace[] }, pick: { face?: number; edge?: [number, number] }): string | null {
  const faces = mesh.faces ?? [];
  if (pick.face !== undefined) return faces[pick.face]?.round?.id ?? null;
  if (pick.edge) {
    const [a, b] = pick.edge;
    for (const f of faces) {
      if (!f.round) continue;
      if (f.verts.some((v, i) => { const w = f.verts[(i + 1) % f.verts.length]!; return (v === a && w === b) || (v === b && w === a); })) return f.round.id;
    }
  }
  return null;
}

/**
 * MAKE SHARP: remove a curve's faces and merge each end of each of its edges back into
 * one corner (the corner that was there, or one at the remembered position). Works on
 * a hand-edited curve too, as long as the result is still a valid brush; otherwise
 * refused. Returns the sharp edges as vertex pairs, in part order, for re-rounding.
 */
export function unroundEdges(mesh: { vertices: Vec3[]; faces: BrushFace[] }, id: string): { mesh: BrushMeshData; edges: Array<[number, number]> } | { refused: string } {
  const tagged = mesh.faces.filter(f => f.round?.id === id);
  if (!tagged.length) return { refused: "That curve isn't on this brush any more." };
  const vertices = mesh.vertices.map(v => ({ ...v }));
  const parts = [...new Set(tagged.map(f => f.round!.part))].sort((p, q) => p - q);
  const target = new Map<number, number>();   // curve corner → corner it merges into
  const ends: Array<[number, number]> = [];
  const d2 = (v: Vec3, p: Vec3) => (v.x - p.x) ** 2 + (v.y - p.y) ** 2 + (v.z - p.z) ** 2;
  for (const part of parts) {
    const pf = tagged.filter(f => f.round!.part === part);
    const { a, b } = pf[0]!.round!;
    // A patch's own corner (not on any strip) is the surviving original corner.
    const stripVerts = new Set(pf.filter(f => !f.round!.patch).flatMap(f => f.verts));
    const keep = new Set<number>();
    const endFor = (p: Vec3): number => {
      for (const f of pf) if (f.round!.patch) for (const v of f.verts) if (!stripVerts.has(v) && d2(vertices[v]!, p) < 1e-6) { keep.add(v); return v; }
      vertices.push({ ...p });
      return vertices.length - 1;
    };
    const ta = endFor(a), tb = endFor(b);
    ends.push([ta, tb]);
    for (const f of pf) for (const v of f.verts) {
      if (keep.has(v) || target.has(v)) continue;
      target.set(v, d2(vertices[v]!, a) <= d2(vertices[v]!, b) ? ta : tb);
    }
  }
  const faces: BrushFace[] = [];
  for (const f of mesh.faces) {
    if (f.round?.id === id) continue;
    const vs: number[] = [];
    for (const v of f.verts.map(v => target.get(v) ?? v)) if (vs[vs.length - 1] !== v) vs.push(v);
    while (vs.length > 1 && vs[0] === vs[vs.length - 1]) vs.pop();
    if (vs.length >= 3) faces.push({ ...f, verts: vs });
  }
  const used = new Set(faces.flatMap(f => f.verts));
  const remap = new Map<number, number>();
  const outVerts: Vec3[] = [];
  vertices.forEach((v, i) => { if (used.has(i)) { remap.set(i, outVerts.length); outVerts.push(v); } });
  const out = { vertices: outVerts, faces: faces.map(f => ({ ...f, verts: f.verts.map(v => remap.get(v)!) })) };
  const err = validateMesh(out);
  if (err || ends.some(([p, q]) => !remap.has(p) || !remap.has(q))) return { refused: "This curve was changed too much by hand to make sharp again; nothing changed." };
  return { mesh: out, edges: ends.map(([p, q]) => [remap.get(p)!, remap.get(q)!]) };
}

/** SPLIT: give one edge of a curve (or every edge, part omitted) its own curve id. */
export function splitRound(mesh: { vertices: Vec3[]; faces: BrushFace[] }, id: string, part?: number): BrushMeshData {
  const tagged = mesh.faces.filter(f => f.round?.id === id);
  const parts = [...new Set(tagged.map(f => f.round!.part))];
  // A hand-edited curve stays marked as edited after the split (no fresh fingerprint).
  const edited = !!tagged.length && roundSig(mesh, id) !== tagged[0]!.round!.sig;
  const fresh = new Map(parts.filter(p => part === undefined || p === part).map(p => [p, `${id}.${p}`]));
  const out = {
    vertices: mesh.vertices,
    faces: mesh.faces.map(f => (f.round?.id === id && fresh.has(f.round.part)) ? { ...f, round: { ...f.round, id: fresh.get(f.round.part)!, part: 0 } } : f),
  };
  const restamp = (rid: string) => edited
    ? (out.faces = out.faces.map(f => f.round?.id === rid ? { ...f, round: { ...f.round, sig: "edited" } } : f))
    : stampRoundSig(out, rid);
  for (const nid of fresh.values()) restamp(nid);
  if (part !== undefined && parts.length > 1) restamp(id);
  return out;
}

// ── Wrapped texture mapping (v4.101.2) ───────────────────────────────────────

/** Per-face texture axes: u horizontal along the face (up × n; world x on caps), v = n × u
 *  (straight up on upright faces). Deterministic, so coplanar faces share one mapping. */
export function faceUVBasis(n: THREE.Vector3): { u: THREE.Vector3; v: THREE.Vector3 } {
  const u = new THREE.Vector3(), v = new THREE.Vector3();
  if (Math.abs(n.y) > 0.99) u.set(1, 0, 0);
  else u.crossVectors(new THREE.Vector3(0, 1, 0), n).normalize();
  v.crossVectors(n, u);
  return { u, v };
}

/**
 * Texture shift per face (meters, added before dividing by the tile size) so the
 * texture runs on unbroken across edges, like gift-wrap: from a starting face, a
 * neighbor (same `group`: material + overrides) takes on the shift that makes the two
 * agree along their shared edge, when the texture runs the same way on both sides of
 * it (the edge lies along both faces' u, or both faces' v, same direction) or the two
 * are coplanar. So a brick texture wraps around upright corners of any angle and over
 * rounded edges; caps (flat tops / bottoms) keep their own mapping, and a full wrap
 * closes with one seam where it meets itself.
 */
export function wrapUVOffsets(mesh: { vertices: Vec3[]; faces: BrushFace[] }, group: (fi: number) => string): Array<{ du: number; dv: number }> {
  const { vertices, faces } = mesh;
  const frames = faces.map(f => {
    const n = newellNormal(vertices, f.verts);
    return { n, ...faceUVBasis(n), cap: Math.abs(n.y) > 0.9999 };   // truly flat tops / bottoms only
  });
  const out = faces.map(() => ({ du: 0, dv: 0 }));
  const placed = new Uint8Array(faces.length);
  const edgeFaces = new Map<string, number[]>();
  faces.forEach((f, fi) => f.verts.forEach((a, k) => {
    const b = f.verts[(k + 1) % f.verts.length]!;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    edgeFaces.set(key, [...(edgeFaces.get(key) ?? []), fi]);
  }));
  const P = (i: number) => new THREE.Vector3(vertices[i]!.x, vertices[i]!.y, vertices[i]!.z);
  const same = (x: number, y: number) => Math.abs(x) > 0.999 && Math.abs(y) > 0.999 && Math.sign(x) === Math.sign(y);
  for (let root = 0; root < faces.length; root++) {
    if (placed[root]) continue;
    placed[root] = 1;
    if (frames[root]!.cap) continue;   // caps never start or join a wrap
    const queue = [root];
    while (queue.length) {
      const fa = queue.shift()!;
      const A = frames[fa]!, f = faces[fa]!;
      for (let k = 0; k < f.verts.length; k++) {
        const a = f.verts[k]!, b = f.verts[(k + 1) % f.verts.length]!;
        const fb = (edgeFaces.get(a < b ? `${a}|${b}` : `${b}|${a}`) ?? []).find(x => x !== fa);
        if (fb === undefined || placed[fb] || frames[fb]!.cap || group(fb) !== group(fa)) continue;
        const B = frames[fb]!;
        const p = P(a), d = P(b).sub(p).normalize();
        const coplanar = A.n.dot(B.n) > 0.9999;
        if (!coplanar && !same(d.dot(A.u), d.dot(B.u)) && !same(d.dot(A.v), d.dot(B.v))) continue;
        // B's uv at p must equal A's: (p·uB + duB) = (p·uA + duA), same for v.
        out[fb] = { du: p.dot(A.u) + out[fa]!.du - p.dot(B.u), dv: p.dot(A.v) + out[fa]!.dv - p.dot(B.v) };
        placed[fb] = 1;
        queue.push(fb);
      }
    }
  }
  return out;
}

// ── Outer walls follow (v4.103.0) ────────────────────────────────────────────

/**
 * EXTRUDE / RECESS / PUSH with OUTER WALLS: FOLLOW. The face set moves `dist` along its
 * normals (regionOffsets, as EXTRUDE does). For each boundary edge of the set, the face
 * on the other side decides: a face in the same flat side (coplanar with the set face it
 * borders) stays and gets a step wall, as EXTRUDE / RECESS do; a face at an angle (a
 * top, a bottom, an outer side) gets no wall and follows instead: its corners on that
 * edge move with the set, so it is cut back (or stretched out). A corner touching a step
 * wall is duplicated (the original stays for the flat side, its copy moves); every other
 * set corner just moves. Refused when a face would turn inside out or validateMesh fails.
 */
export function followRegion(mesh: ShapeBrushMesh, set: number[], dist: number): RegionOpResult {
  const faces0 = mesh.faces;
  if (!faces0?.length || !set.length || !Number.isFinite(dist) || dist === 0) return { refused: "nothing to move" };
  const offsets = regionOffsets(mesh, set, dist);
  if (!offsets) return { refused: "a corner where the selected faces fold back on each other" };
  const inSet = new Set(set);
  const vertices = mesh.vertices.map(v => ({ ...v }));
  const key = (a: number, b: number) => a < b ? `${a}|${b}` : `${b}|${a}`;
  const normals = faces0.map(f => newellNormal(mesh.vertices, f.verts));

  // Boundary edges: set face → the outside face across each edge.
  const owner = new Map<string, number[]>();
  faces0.forEach((f, fi) => f.verts.forEach((a, k) => {
    const b = f.verts[(k + 1) % f.verts.length]!;
    owner.set(key(a, b), [...(owner.get(key(a, b)) ?? []), fi]);
  }));
  const walls: Array<{ p: number; q: number; src: BrushFace }> = [];   // p→q in the set face
  const followEdge = new Set<string>();   // boundary edges whose outside face follows
  const dup = new Set<number>();
  for (const fi of set) {
    const f = faces0[fi]!;
    f.verts.forEach((p, k) => {
      const q = f.verts[(k + 1) % f.verts.length]!;
      const other = owner.get(key(p, q))!.find(g => g !== fi);
      if (other === undefined || inSet.has(other)) return;
      if (normals[other]!.dot(normals[fi]!) > 0.999) { walls.push({ p, q, src: f }); dup.add(p); dup.add(q); }
      else followEdge.add(key(p, q));
    });
  }

  // Moved position of every set corner: a copy where it meets a step wall, else in place.
  const moved = new Map<number, number>();
  for (const [v, o] of offsets) {
    const w = vertices[v]!;
    const p = { x: +(w.x + o.x).toFixed(4), y: +(w.y + o.y).toFixed(4), z: +(w.z + o.z).toFixed(4) };
    if (dup.has(v)) { vertices.push(p); moved.set(v, vertices.length - 1); }
    else { vertices[v] = p; moved.set(v, v); }
  }
  const mv = (v: number) => moved.get(v) ?? v;

  const faces: BrushFace[] = faces0.map((f, fi) => {
    if (inSet.has(fi)) return { ...f, verts: f.verts.map(mv) };
    // An outside face: an edge it shares with the set (a follow edge) uses the moved
    // corners, its other edges the originals; a duplicated corner between the two kinds
    // of edge appears twice (original, then copy, or the reverse).
    const L = f.verts.length, out: number[] = [];
    for (let i = 0; i < L; i++) {
      const x = f.verts[i]!, prev = f.verts[(i + L - 1) % L]!, next = f.verts[(i + 1) % L]!;
      const xin = followEdge.has(key(prev, x)) ? mv(x) : x;
      const xout = followEdge.has(key(x, next)) ? mv(x) : x;
      if (out[out.length - 1] !== xin) out.push(xin);
      if (xout !== xin) out.push(xout);
    }
    while (out.length > 1 && out[0] === out[out.length - 1]) out.pop();
    return { ...f, verts: out };
  });
  for (const { p, q, src } of walls) {
    faces.push({
      verts: [p, q, mv(q), mv(p)],   // same sign-agnostic winding as extrudeFace
      material: src.material,
      materialOverrides: src.materialOverrides ? structuredClone(src.materialOverrides) : undefined,
    });
  }
  // No face may turn inside out (e.g. a top cut back past its far side).
  for (let fi = 0; fi < faces0.length; fi++) {
    const n1 = newellNormal(vertices, faces[fi]!.verts);
    if (n1.lengthSq() < 1e-8 || n1.dot(normals[fi]!) <= 0) return { refused: `${dist < 0 ? "RECESS" : "EXTRUDE"} would turn faces inside out; nothing changed.` };
  }
  const out = { vertices, faces: faces.map(f => (f.fold !== undefined && f.verts.length !== 4) ? (({ fold: _f, ...rest }) => rest)(f) : f) };
  const err = validateMesh(out);
  if (err) return { refused: `${dist < 0 ? "RECESS" : "EXTRUDE"} would break the brush (${err}); nothing changed.` };
  return { mesh: out };
}

// ── Dissolve edges (v4.105.0) ─────────────────────────────────────────────────

/**
 * DISSOLVE: remove each edge by merging the two faces on either side into one face
 * (the first face's material). Refused when the two faces aren't flat to each other
 * (the merged face would be bent), when an edge borders the same face twice, or when
 * the result isn't a valid brush. Afterwards a corner left with just two edges in a
 * straight line (the dissolved edge's ends, typically) is removed too, so dissolving a
 * split's line leaves a clean four-cornered face. Unused corners are compacted.
 */
export function dissolveEdges(mesh: ShapeBrushMesh, edges: Array<[number, number]>): RegionOpResult {
  if (!mesh.faces?.length) return { refused: "Only edited brushes (with faces) have edges to dissolve." };
  if (!edges.length) return { refused: "Select an edge first." };
  let faces = cloneFaces(mesh.faces);
  const vertices = mesh.vertices.map(v => ({ ...v }));
  const findDirected = (p: number, q: number) => faces.findIndex(f => f.verts.some((v, i) => v === p && f.verts[(i + 1) % f.verts.length] === q));
  const rotateTo = (loop: number[], start: number) => { const i = loop.indexOf(start); return [...loop.slice(i), ...loop.slice(0, i)]; };
  const touched = new Set<number>();
  for (const [a, b] of edges) {
    const fa = findDirected(a, b), fb = findDirected(b, a);
    if (fa < 0 || fb < 0) continue;   // already gone (an earlier merge in this batch took it)
    if (fa === fb) return { refused: "That edge borders the same face on both sides; nothing changed." };
    const na = newellNormal(vertices, faces[fa]!.verts), nb = newellNormal(vertices, faces[fb]!.verts);
    if (na.dot(nb) < 0.999) return { refused: "Those two faces aren't flat to each other, so merging them would bend the face; nothing changed." };
    const A = rotateTo(faces[fa]!.verts, b);   // b … a  (the a→b edge closes it)
    const B = rotateTo(faces[fb]!.verts, a);   // a … b
    const merged = [...A, ...B.slice(1, -1)];
    if (new Set(merged).size !== merged.length) return { refused: "Those faces touch along more than one edge; dissolve them one at a time." };
    const keep: BrushFace = { ...faces[fa]!, verts: merged };
    delete keep.fold;
    faces = faces.filter((_, i) => i !== fa && i !== fb);
    faces.push(keep);
    touched.add(a); touched.add(b);
  }
  // Corners left on a straight line between exactly two neighbours: remove them.
  for (const v of touched) {
    const nbrs = new Set<number>();
    for (const f of faces) f.verts.forEach((x, i) => { if (x === v) { nbrs.add(f.verts[(i + 1) % f.verts.length]!); nbrs.add(f.verts[(i + f.verts.length - 1) % f.verts.length]!); } });
    if (nbrs.size !== 2) continue;
    const [p, q] = [...nbrs].map(i => vertices[i]!), c = vertices[v]!;
    const d1 = new THREE.Vector3(c.x - p.x, c.y - p.y, c.z - p.z), d2 = new THREE.Vector3(q.x - c.x, q.y - c.y, q.z - c.z);
    if (d1.lengthSq() < 1e-12 || d2.lengthSq() < 1e-12 || d1.normalize().dot(d2.normalize()) < 0.9999) continue;
    faces = faces.map(f => f.verts.includes(v) ? { ...f, verts: f.verts.filter(x => x !== v) } : f);
  }
  if (faces.some(f => f.verts.length < 3)) return { refused: "That would leave a face with fewer than 3 corners; nothing changed." };
  const used = new Set(faces.flatMap(f => f.verts));
  const remap = new Map<number, number>();
  const outVerts: Vec3[] = [];
  vertices.forEach((v, i) => { if (used.has(i)) { remap.set(i, outVerts.length); outVerts.push(v); } });
  const out = { vertices: outVerts, faces: faces.map(f => {
    const g = { ...f, verts: f.verts.map(v => remap.get(v)!) };
    if (g.fold !== undefined && g.verts.length !== 4) delete g.fold;
    return g;
  }) };
  const err = validateMesh(out);
  if (err) return { refused: `Dissolving would break the brush (${err}); nothing changed.` };
  return { mesh: out };
}

/** The edges of the loop SELECT LOOP / double-click would follow from `edge` (DISSOLVE LOOP). */
export function edgeLoopEdges(mesh: ShapeBrushMesh, edge: [number, number]): Array<[number, number]> {
  const l = edgeLoop(mesh, edge);
  if (!l || l.verts.length < 2) return [edge];
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < l.verts.length; i++) out.push([l.verts[i]!, l.verts[i + 1]!]);
  if (l.closed) out.push([l.verts[l.verts.length - 1]!, l.verts[0]!]);
  return out;
}

// ── Holes (Phase 85) ─────────────────────────────────────────────────────────

const HOLE_MARGIN = 0.005;   // a hole keeps this far inside its face (meters)
type P2 = { x: number; y: number };

/** A flat face's own 2D frame: centroid O, normal n, texture axes u / v (u × v = n). */
export function holeFrame(vertices: Vec3[], loop: number[]): { O: THREE.Vector3; n: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3 } {
  const n = newellNormal(vertices, loop);
  const { u, v } = faceUVBasis(n);
  return { O: faceCentroid(vertices, loop), n, u, v };
}

/** The hole's outline around (0, 0), counter-clockwise about the face normal. */
function holeOutline2D(spec: HoleSpec): P2[] {
  if (spec.shape === "square") return [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, b]) => ({ x: a! * spec.w / 2, y: b! * spec.h / 2 }));
  const N = Math.max(3, Math.min(64, Math.round(spec.sides)));
  return Array.from({ length: N }, (_, k) => { const t = 2 * Math.PI * (k + 0.5) / N; return { x: Math.cos(t) * spec.w / 2, y: Math.sin(t) * spec.w / 2 }; });
}

/** First face a ray from `o` along `d` (brush space) passes through, skipping `skip`. */
function rayFirstFace(mesh: { vertices: Vec3[]; faces: BrushFace[] }, o: THREE.Vector3, d: THREE.Vector3, skip: number): { face: number; t: number } | null {
  const ray = new THREE.Ray(o, d), hit = new THREE.Vector3();
  const V = (i: number) => new THREE.Vector3(mesh.vertices[i]!.x, mesh.vertices[i]!.y, mesh.vertices[i]!.z);
  let best: { face: number; t: number } | null = null;
  mesh.faces.forEach((f, fi) => {
    if (fi === skip) return;
    for (const [a, b, c] of faceTriangles(mesh.vertices, f)) {
      if (!ray.intersectTriangle(V(a), V(b), V(c), false, hit)) continue;
      const t = hit.distanceTo(o);
      if (t > 1e-5 && (!best || t < best.t)) best = { face: fi, t };
    }
  });
  return best;
}

/** How deep the brush is under point `c` of face `faceIdx` (straight in), or null. */
export function holeThickness(mesh: ShapeBrushMesh, faceIdx: number, c: Vec3): number | null {
  const face = mesh.faces?.[faceIdx];
  if (!face) return null;
  const n = newellNormal(mesh.vertices, face.verts);
  return rayFirstFace({ vertices: mesh.vertices, faces: mesh.faces! }, new THREE.Vector3(c.x, c.y, c.z), n.clone().negate(), faceIdx)?.t ?? null;
}

const cross2 = (o: P2, a: P2, b: P2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
function segsCross(a: P2, b: P2, c: P2, d: P2): boolean {
  const d1 = cross2(c, d, a), d2 = cross2(c, d, b), d3 = cross2(a, b, c), d4 = cross2(a, b, d);
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
}
function segDist(p: P2, a: P2, b: P2): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function insidePoly(p: P2, poly: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * The faces around a hole in a flat face (a brush face can't have a hole in it): a
 * "spoke" from outline corners to hole corners, chosen by direction from the hole's
 * centre, and between two spokes one face: the outline run, then back along the hole.
 * `outline` / `hole` are 2D, both counter-clockwise; returns vertex loops or a refusal.
 */
function holeRing(outline: P2[], outlineIdx: number[], hole: P2[], holeIdx: number[], c: P2): number[][] | string {
  const L = outline.length, N = hole.length;
  const ang = (p: P2) => Math.atan2(p.y - c.y, p.x - c.x);
  const wrap = (a: number) => { while (a <= -Math.PI) a += 2 * Math.PI; while (a > Math.PI) a -= 2 * Math.PI; return a; };
  const simpler = "This face's shape goes around the hole in a way HOLE can't cut yet; try nearer the middle.";
  // Every direction from the centre must leave the face once.
  let turn = 0;
  for (let j = 0; j < L; j++) {
    const d = wrap(ang(outline[(j + 1) % L]!) - ang(outline[j]!));
    if (!(d > 1e-9)) return simpler;
    turn += d;
  }
  if (Math.abs(turn - 2 * Math.PI) > 1e-6) return simpler;
  // The hole sits inside, clear of the edges.
  for (const p of hole) {
    if (!insidePoly(p, outline)) return "The hole doesn't fit on this face there.";
    for (let j = 0; j < L; j++) if (segDist(p, outline[j]!, outline[(j + 1) % L]!) < HOLE_MARGIN) return "The hole doesn't fit on this face there.";
  }
  for (let j = 0; j < L; j++) for (let k = 0; k < N; k++) if (segsCross(outline[j]!, outline[(j + 1) % L]!, hole[k]!, hole[(k + 1) % N]!)) return "The hole doesn't fit on this face there.";
  // Each outline corner's spoke: the hole corner nearest its direction that it can see.
  const m = outline.map(o => {
    let best = -1, bestD = Infinity;
    for (let k = 0; k < N; k++) {
      const h = hole[k]!, prev = hole[(k + N - 1) % N]!, next = hole[(k + 1) % N]!;
      if (!(cross2(prev, h, o) < 0 || cross2(h, next, o) < 0)) continue;   // behind the hole
      const d = Math.abs(wrap(ang(h) - ang(o)));
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
  });
  if (m.some(k => k < 0)) return simpler;
  let adv = 0;
  for (let j = 0; j < L; j++) adv += (m[(j + 1) % L]! - m[j]! + N) % N;
  if (adv !== N) return simpler;
  // A run of corners on one hole corner shares one spoke (its first corner).
  const spokes = outline.map((_, j) => j).filter(j => m[j] !== m[(j + L - 1) % L]);
  if (spokes.length < 2) return simpler;
  for (const j of spokes) {
    const o = outline[j]!, h = hole[m[j]!]!;
    for (let i = 0; i < L; i++) if (i !== j && (i + 1) % L !== j && segsCross(o, h, outline[i]!, outline[(i + 1) % L]!)) return simpler;
    for (let k = 0; k < N; k++) if (k !== m[j] && (k + 1) % N !== m[j] && segsCross(o, h, hole[k]!, hole[(k + 1) % N]!)) return simpler;
  }
  return spokes.map((j, s) => {
    const j2 = spokes[(s + 1) % spokes.length]!;
    const loop: number[] = [];
    for (let i = j; ; i = (i + 1) % L) { loop.push(outlineIdx[i]!); if (i === j2) break; }
    for (let k = m[j2]!; ; k = (k + N - 1) % N) { loop.push(holeIdx[k]!); if (k === m[j]) break; }
    return loop;
  });
}

/** Whether point `p` (on the face's plane, brush space) is inside flat face `loop`. */
export function faceContainsPoint(vertices: Vec3[], loop: number[], p: Vec3): boolean {
  const fr = holeFrame(vertices, loop);
  const to2 = (q: Vec3) => { const d = new THREE.Vector3(q.x, q.y, q.z).sub(fr.O); return { x: d.dot(fr.u), y: d.dot(fr.v) }; };
  return insidePoly(to2(p), loop.map(i => to2(vertices[i]!)));
}

/** Fingerprint of a hole: the positions of every corner its faces use, sorted. */
export function holeSig(mesh: { vertices: Vec3[]; faces: BrushFace[] }, id: string): string {
  const vs = new Set<number>();
  for (const f of mesh.faces) if (f.hole?.id === id) f.verts.forEach(v => vs.add(v));
  return [...vs].map(i => { const v = mesh.vertices[i]!; return `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`; }).sort().join(";");
}

/**
 * HOLE (Phase 85): cut a round (`sides` straight sides) or square hole into flat face
 * `faceIdx` at `spec.c`, straight in along the face normal: right through to the face
 * on the far side (`depth` null), or a pocket `depth` deep with a floor. The two faces
 * become rings of faces around the opening, joined by a tube of walls; every new face
 * carries the hole's record (`hole`), so it can be changed or filled later. Refused,
 * with a reason, when it doesn't fit (not flat, too close to an edge, comes out across
 * an edge or through more than one face, deeper than the brush).
 */
export function cutHole(mesh: ShapeBrushMesh, faceIdx: number, spec: HoleSpec, id = `h${Date.now().toString(36)}`): RegionOpResult {
  const src = mesh.faces?.[faceIdx];
  if (!src) return { refused: "Pick a face to cut the hole into." };
  if (src.round || src.hole) return { refused: "Holes go in flat faces, not in a curve or another hole's faces." };
  if (!(spec.w > 0) || (spec.shape === "square" && !(spec.h > 0))) return { refused: "SIZE must be more than 0." };
  if (spec.depth !== null && !(spec.depth > 0)) return { refused: "DEPTH must be more than 0 (or THROUGH)." };
  const all = { vertices: mesh.vertices, faces: mesh.faces! };
  const vertices = mesh.vertices.map(v => ({ ...v }));
  const V3 = (i: number) => new THREE.Vector3(vertices[i]!.x, vertices[i]!.y, vertices[i]!.z);
  const fr = holeFrame(vertices, src.verts);
  const to2 = (p: THREE.Vector3, f = fr) => { const d = p.clone().sub(f.O); return { x: d.dot(f.u), y: d.dot(f.v), h: d.dot(f.n) }; };
  if (src.verts.some(i => Math.abs(to2(V3(i)).h) > 1e-3)) return { refused: "This face isn't flat, so a hole can't go in it." };
  const c2 = to2(new THREE.Vector3(spec.c.x, spec.c.y, spec.c.z));
  const H2 = holeOutline2D(spec).map(p => ({ x: p.x + c2.x, y: p.y + c2.y }));
  const H3 = H2.map(p => fr.O.clone().addScaledVector(fr.u, p.x).addScaledVector(fr.v, p.y));
  const N = H3.length;
  const into = fr.n.clone().negate();

  // How far in each part of the hole can go: every ray must stay inside one face's reach.
  const centre = fr.O.clone().addScaledVector(fr.u, c2.x).addScaledVector(fr.v, c2.y);
  const hits = [centre, ...H3].map(p => rayFirstFace(all, p, into, faceIdx));
  if (hits.some(h => !h)) return { refused: "The hole doesn't fit on this face there." };
  const exitIdx = hits[0]!.face;
  let exit: BrushFace | null = null, exitFr: ReturnType<typeof holeFrame> | null = null;
  if (spec.depth === null) {
    if (hits.some(h => h!.face !== exitIdx)) return { refused: "The hole would come out across an edge on the far side (or through another part); move it or make it smaller." };
    exit = mesh.faces![exitIdx]!;
    if (exit.round || exit.hole) return { refused: "The hole would come out in a curve or another hole's faces." };
    exitFr = holeFrame(vertices, exit.verts);
    if (exit.verts.some(i => Math.abs(to2(V3(i), exitFr!).h) > 1e-3)) return { refused: "The face on the far side isn't flat, so the hole can't come out there." };
    if (exitFr.n.dot(fr.n) > -0.05) return { refused: "The far side is too slanted for the hole to come out." };
  } else if (hits.some(h => h!.t <= spec.depth! + HOLE_MARGIN)) {
    return { refused: "DEPTH goes deeper than the brush here; make it shallower or use THROUGH." };
  }

  const r4 = (n: number) => +n.toFixed(4);
  const push = (p: THREE.Vector3) => { vertices.push({ x: r4(p.x), y: r4(p.y), z: r4(p.z) }); return vertices.length - 1; };
  const Hi = H3.map(push);
  const Xp = spec.depth === null ? H3.map((p, k) => p.clone().addScaledVector(into, hits[k + 1]!.t)) : H3.map(p => p.clone().addScaledVector(into, spec.depth!));
  const Xi = Xp.map(push);

  const tag = (part: HoleTag["part"]): HoleTag => ({ id, part, shape: spec.shape, sides: N, w: spec.w, h: spec.shape === "square" ? spec.h : spec.w, depth: spec.depth, c: { x: r4(centre.x), y: r4(centre.y), z: r4(centre.z) }, sig: "" });
  const like = (f: BrushFace, part: HoleTag["part"]) => (verts: number[]): BrushFace => ({
    verts, material: f.material, materialOverrides: f.materialOverrides ? structuredClone(f.materialOverrides) : undefined, hole: tag(part),
  });
  const entryRing = holeRing(src.verts.map(i => to2(V3(i))), src.verts, H2, Hi, c2);
  if (typeof entryRing === "string") return { refused: entryRing };
  const added: BrushFace[] = entryRing.map(like(src, "entry"));
  for (let k = 0; k < N; k++) added.push(like(src, "wall")([Hi[k]!, Hi[(k + 1) % N]!, Xi[(k + 1) % N]!, Xi[k]!]));
  if (exit && exitFr) {
    // The far side's opening, counter-clockwise about its own (opposite) normal.
    const order = [...Array(N).keys()].reverse();
    const ring = holeRing(exit.verts.map(i => to2(V3(i), exitFr)), exit.verts, order.map(k => to2(Xp[k]!, exitFr)), order.map(k => Xi[k]!), to2(centre.clone().addScaledVector(into, hits[0]!.t), exitFr));
    if (typeof ring === "string") return { refused: ring.replace("This face's", "The far side's").replace("on this face", "on the far side") };
    added.push(...ring.map(like(exit, "exit")));
  } else {
    added.push(like(src, "floor")([...Xi]));
  }
  const faces = [...cloneFaces(mesh.faces!).filter((_, i) => i !== faceIdx && !(exit && i === exitIdx)), ...added];
  const out = { vertices, faces };
  const err = validateMesh(out);
  if (err) return { refused: `The hole would break the brush (${err}); nothing changed.` };
  const sig = holeSig(out, id);
  out.faces = out.faces.map(f => f.hole?.id === id ? { ...f, hole: { ...f.hole, sig } } : f);
  return { mesh: out };
}

export interface HoleInfo { id: string; spec: HoleSpec; edited: boolean; faces: number[] }

/** The holes in a brush, oldest first. */
export function holesOf(mesh: { vertices: Vec3[]; faces?: BrushFace[] }): HoleInfo[] {
  const out = new Map<string, HoleInfo>();
  (mesh.faces ?? []).forEach((f, fi) => {
    const h = f.hole;
    if (!h) return;
    const info = out.get(h.id) ?? { id: h.id, spec: { shape: h.shape, sides: h.sides, w: h.w, h: h.h, depth: h.depth, c: h.c }, edited: false, faces: [] };
    info.faces.push(fi);
    out.set(h.id, info);
  });
  for (const info of out.values()) info.edited = holeSig({ vertices: mesh.vertices, faces: mesh.faces! }, info.id) !== mesh.faces![info.faces[0]!]!.hole!.sig;
  return [...out.values()].sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
}

/** The hole a face belongs to. */
export function holeAt(mesh: { faces?: BrushFace[] }, face: number): string | null {
  return mesh.faces?.[face]?.hole?.id ?? null;
}

/**
 * FILL: take a hole's faces out and close each opening they leave with one face (the
 * face that was there before the cut, with its material). Works on a hand-edited hole
 * as long as the result is still a valid brush. Returns the entry face's new index.
 */
export function fillHole(mesh: { vertices: Vec3[]; faces: BrushFace[] }, id: string): { mesh: BrushMeshData; entry: number; spec: HoleSpec } | { refused: string } {
  const tagged = mesh.faces.filter(f => f.hole?.id === id);
  if (!tagged.length) return { refused: "That hole isn't on this brush any more." };
  const t = tagged[0]!.hole!;
  const spec: HoleSpec = { shape: t.shape, sides: t.sides, w: t.w, h: t.h, depth: t.depth, c: t.c };
  // The edges the hole's faces share with the rest of the brush, chained into loops.
  const dir = new Set<string>();
  for (const f of tagged) f.verts.forEach((v, i) => dir.add(`${v},${f.verts[(i + 1) % f.verts.length]}`));
  const next = new Map<number, { to: number; face: BrushFace }>();
  for (const f of tagged) f.verts.forEach((v, i) => {
    const w = f.verts[(i + 1) % f.verts.length]!;
    if (!dir.has(`${w},${v}`)) next.set(v, { to: w, face: f });
  });
  const restored: Array<{ face: BrushFace; part: HoleTag["part"] }> = [];
  const seen = new Set<number>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: number[] = [];
    let v = start;
    while (!seen.has(v)) {
      seen.add(v); loop.push(v);
      const e = next.get(v);
      if (!e) return { refused: "This hole was changed too much by hand to fill; nothing changed." };
      v = e.to;
    }
    if (v !== start || loop.length < 3) return { refused: "This hole was changed too much by hand to fill; nothing changed." };
    const owner = next.get(start)!.face;
    const { hole: _h, round: _r, fold: _f, ...rest } = owner;
    restored.push({ face: { ...rest, verts: loop, materialOverrides: owner.materialOverrides ? structuredClone(owner.materialOverrides) : undefined }, part: owner.hole!.part });
  }
  const faces = [...cloneFaces(mesh.faces.filter(f => f.hole?.id !== id)), ...restored.map(r => r.face)];
  const used = new Set(faces.flatMap(f => f.verts));
  const remap = new Map<number, number>();
  const outVerts: Vec3[] = [];
  mesh.vertices.forEach((v, i) => { if (used.has(i)) { remap.set(i, outVerts.length); outVerts.push({ ...v }); } });
  const out = { vertices: outVerts, faces: faces.map(f => ({ ...f, verts: f.verts.map(v => remap.get(v)!) })) };
  const err = validateMesh(out);
  const entryAt = restored.findIndex(r => r.part === "entry");
  if (err || entryAt < 0) return { refused: "This hole was changed too much by hand to fill; nothing changed." };
  return { mesh: out, entry: out.faces.length - restored.length + entryAt, spec };
}

/** Change a hole's settings (or move it): fill it, then cut it again with the same id. */
export function recutHole(mesh: { vertices: Vec3[]; faces: BrushFace[] }, id: string, spec: HoleSpec): RegionOpResult {
  const f = fillHole(mesh, id);
  if ("refused" in f) return f;
  return cutHole(f.mesh, f.entry, spec, id);
}
