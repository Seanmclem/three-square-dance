import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import type { Vec3, BrushFace, ShapeBrushMesh, MaterialOverrides, LoopCutStart } from "@/types";

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
 * four real corners (`quadCorners`): straight-through verts on a side are kept
 * and end up on whichever child they fall in. pair 0 cuts sides c0→c1 / c2→c3,
 * pair 1 cuts c1→c2 / c3→c0. The selected faceIdx stays on child A. CRITICAL:
 * any other face traversing a split edge gets the midpoint spliced into its loop
 * (T-junction prevention — without it the neighbor's fan leaves a crack in both
 * render and trimesh).
 * Returns null (with reason logged) if the face isn't a quad or the result fails
 * validation.
 */
export function splitFaceQuad(mesh: ShapeBrushMesh, faceIdx: number, pair: 0 | 1): BrushMeshData | null {
  const src = mesh.faces?.[faceIdx];
  if (!src) return null;
  const vertices = mesh.vertices.map(v => ({ ...v }));
  const corners = quadCorners(vertices, src.verts);
  if (!corners) return null;
  const L = src.verts.length;
  // Rotate the loop to start at corner 0, so sides are contiguous runs.
  const loop = src.verts.map((_, i) => src.verts[(corners[0] + i) % L]!);
  const c = corners.map(k => (k - corners[0] + L) % L) as [number, number, number, number];
  const sideA = pair === 0 ? 0 : 1, sideB = sideA + 2;   // side k runs loop[c[k]] .. loop[c[k+1]]
  const end = (k: number): number => k === 3 ? loop.length : c[k + 1]!;   // loop grows after a cut

  // Midpoint of a side = midpoint of its two corners; insert it into the side's
  // chain (or reuse the vert already sitting there). Returns the midpoint's
  // vertex index, its loop position, and the edge it split (null if reused).
  const cut = (k: number): { idx: number; pos: number; edge: [number, number] | null } => {
    const p = vertices[loop[c[k]!]!]!, q = vertices[loop[end(k) % loop.length]!]!;
    const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: (p.z + q.z) / 2 };
    const before = vertices.length;
    const idx = addOrReuse(vertices, m);
    const reused = idx < before;
    for (let i = c[k]!; i < end(k); i++) {
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
  if (cutA.edge) { for (let k = sideA + 1; k < 4; k++) c[k]!++; }   // later corners shifted by the insert
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

  const inner: number[] = [];
  const V = (i: number): THREE.Vector3 => {
    const v = vertices[loop[(i + L) % L]!]!;
    return new THREE.Vector3(v.x, v.y, v.z);
  };
  for (let i = 0; i < L; i++) {
    const prev = V(i - 1), cur = V(i), next = V(i + 1);
    // Edge directions projected into the face plane (Newell handles mild non-planarity).
    const dPrev = cur.clone().sub(prev); dPrev.addScaledVector(n, -dPrev.dot(n));
    const dNext = next.clone().sub(cur); dNext.addScaledVector(n, -dNext.dot(n));
    if (dPrev.lengthSq() < 1e-12 || dNext.lengthSq() < 1e-12) { console.warn("brushOps.insetFace: zero-length edge"); return null; }
    dPrev.normalize(); dNext.normalize();
    // In-plane inward edge normals (loop is CCW about n, so n × d points into the face).
    const mPrev = new THREE.Vector3().crossVectors(n, dPrev);
    const mNext = new THREE.Vector3().crossVectors(n, dNext);
    const b = mPrev.clone().add(mNext);
    if (b.lengthSq() < 1e-12) { console.warn("brushOps.insetFace: spike corner (edges reverse)"); return null; }
    b.normalize();
    const denom = b.dot(mNext);   // = sin(θ/2) for interior angle θ; miter blows up as θ → 0
    if (denom < 0.05) { console.warn("brushOps.insetFace: near-degenerate corner"); return null; }
    const p = cur.addScaledVector(b, margin / denom);
    // Never addOrReuse here: welding an inner vertex onto the outer ring would corrupt topology.
    vertices.push({ x: +p.x.toFixed(4), y: +p.y.toFixed(4), z: +p.z.toFixed(4) });
    inner.push(vertices.length - 1);
  }

  // Margin-too-large guards: collapsed inner edge, or inner loop inverted/degenerate
  // (raw = unnormalized Newell vector of the inner loop; ‖raw‖ = 2×area).
  const raw = new THREE.Vector3();
  for (let i = 0; i < L; i++) {
    const a = vertices[inner[i]!]!, c = vertices[inner[(i + 1) % L]!]!;
    const dx = a.x - c.x, dy = a.y - c.y, dz = a.z - c.z;
    if (dx * dx + dy * dy + dz * dz < 1e-6) { console.warn("brushOps.insetFace: inner loop collapsed (margin too large)"); return null; }
    raw.x += (a.y - c.y) * (a.z + c.z);
    raw.y += (a.z - c.z) * (a.x + c.x);
    raw.z += (a.x - c.x) * (a.y + c.y);
  }
  if (raw.lengthSq() < 1e-12 || raw.dot(n) <= 0) { console.warn("brushOps.insetFace: inner loop inverted (margin too large)"); return null; }

  const faces = cloneFaces(mesh.faces!);
  faces[faceIdx] = { ...faces[faceIdx]!, verts: inner };
  for (let i = 0; i < L; i++) {
    faces.push({
      // Border quad [p, q, qInner, pInner]: supplies p→q (pairs the untouched
      // neighbor's q→p) and qInner→pInner (pairs the inner face's pInner→qInner).
      verts: [loop[i]!, loop[(i + 1) % L]!, inner[(i + 1) % L]!, inner[i]!],
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
export function roundEdges(mesh: ShapeBrushMesh, edges: Array<[number, number]>, size: number, steps: number): RegionOpResult {
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

  for (const [a, b] of edges) {
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
    const stripMat = { material: FA.material, materialOverrides: FA.materialOverrides ? structuredClone(FA.materialOverrides) : undefined };
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
      faces.push({ verts: [a, ...[...A].reverse()], material: src.material, materialOverrides: src.materialOverrides ? structuredClone(src.materialOverrides) : undefined });
    }
    // End at b: B[0] → … → B[steps].
    if (h1 === hk) {
      replaceWith(h1, b, [...B]);
    } else {
      insertBefore(h1, b, B[0]!);          // nbA → B0 → b
      insertAfter(hk, b, B[steps]!);       // b → B_s → nbB
      const src = faces[h1]!;
      faces.push({ verts: [b, ...B], material: src.material, materialOverrides: src.materialOverrides ? structuredClone(src.materialOverrides) : undefined });
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
  return { mesh: out };
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
