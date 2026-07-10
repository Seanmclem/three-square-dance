import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { ColliderBuilder } from "@/physics/ColliderBuilder";
import { physicsWorld } from "@/physics/PhysicsWorld";
import { assetManager } from "@/core/AssetManager";
import { applyUVOffset } from "@/builders/UVUtils";
import { newellNormal } from "@/editor/brushOps";
import type { ShapeDef, MeshUserData, MaterialOverrides, FaceGroup } from "@/types";
import type RAPIER from "@dimforge/rapier3d-compat";

export interface ShapeBuildOutput {
  meshes:   THREE.Mesh[];   // [capMesh (selectable), sideMesh] — same transform, same editorId
  collider: RAPIER.Collider | null;
  // Present when the shape has an active mover (Phase 31) — the kinematic body
  // the collider is parented to (absent if the collider itself failed).
  moverBody?: RAPIER.RigidBody;
}

/** Below this radialSegments count, cylinder sides get flat per-face normals
 *  (crisp tri-prism / hex-pillar look); at or above, smooth analytic normals. */
export const FLAT_SHADE_MAX_SEGMENTS = 11;

/** Hull faces whose normal is at least this vertical count as "caps" (top/bottom material). */
const CAP_NY = 0.5;

export interface ResolvedShapeParams {
  radiusTop:      number;
  radiusBottom:   number;
  height:         number;
  radialSegments: number;
  width:          number;
  depth:          number;
  heightLow:      number;
  heightHigh:     number;
  taperX:         number;
  taperZ:         number;
  shearX:         number;
  shearZ:         number;
}

/**
 * Fill in defaults and clamp every param so sparse defs (console-spawned, old
 * saves) can never produce degenerate geometry or a null convex hull. Every
 * consumer (builder, collider, tool ghost, panel) resolves through this.
 */
export function resolveShapeParams(def: ShapeDef): ResolvedShapeParams {
  const num = (v: number | undefined, dflt: number, min: number, max = Infinity) =>
    Math.min(max, Math.max(min, v ?? dflt));
  return {
    radiusTop:      num(def.radiusTop,      1, 0),
    radiusBottom:   num(def.radiusBottom,   1, 0.05),
    height:         num(def.height,         2, 0.05),
    radialSegments: Math.round(num(def.radialSegments, 16, 3, 64)),
    width:          num(def.width,          2, 0.05),
    depth:          num(def.depth,          2, 0.05),
    heightLow:      num(def.heightLow,      0.1, 0),
    heightHigh:     num(def.heightHigh,     1.5, 0.05),
    taperX:         num(def.taperX,         1, 0.01),
    taperZ:         num(def.taperZ,         1, 0.01),
    shearX:         def.shearX ?? 0,
    shearZ:         def.shearZ ?? 0,
  };
}

/** True when the def is in brush mode (local vertex cloud supersedes kind params). */
export function isBrush(def: ShapeDef): boolean {
  return (def.mesh?.vertices?.length ?? 0) >= 4;
}

/** True when the brush has explicit face loops (Phase 23) — loops are authoritative. */
export function isFaceBrush(def: ShapeDef): boolean {
  return isBrush(def) && (def.mesh?.faces?.length ?? 0) >= 4;
}

// ── Geometry accumulators ─────────────────────────────────────────────────────
// All faces are emitted with explicit per-corner normals/UVs (cylinder corners
// differ per vertex, so PlatformBuilder's rect-UV pushFace doesn't fit).
// Winding convention: corners CCW viewed from outside; indices (0,1,2),(0,2,3).

interface GeoBuf { pos: number[]; nrm: number[]; uv: number[]; idx: number[]; vi: number }

const newBuf = (): GeoBuf => ({ pos: [], nrm: [], uv: [], idx: [], vi: 0 });

type V3 = readonly [number, number, number];

function pushQuad(
  b: GeoBuf,
  corners: readonly [V3, V3, V3, V3],
  normals: readonly [V3, V3, V3, V3],
  uvs:     readonly [number, number][],
): void {
  for (let i = 0; i < 4; i++) {
    b.pos.push(...corners[i]!);
    b.nrm.push(...normals[i]!);
    b.uv.push(uvs[i]![0], uvs[i]![1]);
  }
  b.idx.push(b.vi, b.vi + 1, b.vi + 2,  b.vi, b.vi + 2, b.vi + 3);
  b.vi += 4;
}

function pushTri(
  b: GeoBuf,
  corners: readonly [V3, V3, V3],
  normals: readonly [V3, V3, V3],
  uvs:     readonly [number, number][],
): void {
  for (let i = 0; i < 3; i++) {
    b.pos.push(...corners[i]!);
    b.nrm.push(...normals[i]!);
    b.uv.push(uvs[i]![0], uvs[i]![1]);
  }
  b.idx.push(b.vi, b.vi + 1, b.vi + 2);
  b.vi += 3;
}

const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vn = new THREE.Vector3();
const _vu = new THREE.Vector3(), _vv = new THREE.Vector3(), _vp = new THREE.Vector3();

/**
 * Planar quad from 4 CCW-from-outside corners. Face normal comes from the
 * corner cross product; UVs are in-plane METRIC projection (meters ÷ tileScale,
 * the Phase-10.8 world-density convention) — u along the a→b edge, v along
 * normal × uDir — so slanted faces (wedge tops, sheared box sides) tile at the
 * same physical density as axis-aligned ones.
 */
function pushQuadMetric(b: GeoBuf, a: V3, b2: V3, c: V3, d: V3, ts: number): void {
  _va.set(b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]);
  _vb.set(c[0] - a[0],  c[1] - a[1],  c[2] - a[2]);
  _vn.crossVectors(_va, _vb).normalize();
  _vu.copy(_va).normalize();
  _vv.crossVectors(_vn, _vu);
  const n: V3 = [_vn.x, _vn.y, _vn.z];
  const uvOf = (p: V3): [number, number] => {
    _vp.set(p[0] - a[0], p[1] - a[1], p[2] - a[2]);
    return [_vp.dot(_vu) / ts, _vp.dot(_vv) / ts];
  };
  pushQuad(b, [a, b2, c, d], [n, n, n, n], [uvOf(a), uvOf(b2), uvOf(c), uvOf(d)]);
}

/** Triangle variant of pushQuadMetric (wedge sides when heightLow = 0). */
function pushTriMetric(b: GeoBuf, a: V3, b2: V3, c: V3, ts: number): void {
  _va.set(b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]);
  _vb.set(c[0] - a[0],  c[1] - a[1],  c[2] - a[2]);
  _vn.crossVectors(_va, _vb).normalize();
  _vu.copy(_va).normalize();
  _vv.crossVectors(_vn, _vu);
  const n: V3 = [_vn.x, _vn.y, _vn.z];
  const uvOf = (p: V3): [number, number] => {
    _vp.set(p[0] - a[0], p[1] - a[1], p[2] - a[2]);
    return [_vp.dot(_vu) / ts, _vp.dot(_vv) / ts];
  };
  pushTri(b, [a, b2, c], [n, n, n], [uvOf(a), uvOf(b2), uvOf(c)]);
}

function makeGeo(b: GeoBuf): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
  geo.setAttribute("normal",   new THREE.Float32BufferAttribute(b.nrm, 3));
  geo.setAttribute("uv",       new THREE.Float32BufferAttribute(b.uv,  2));
  geo.setIndex(b.idx);
  geo.computeBoundingSphere();
  return geo;
}

/** Concatenate two GeoBufs (for the single-geometry ghost/merged path). */
function mergeBufs(a: GeoBuf, b: GeoBuf): GeoBuf {
  return {
    pos: [...a.pos, ...b.pos],
    nrm: [...a.nrm, ...b.nrm],
    uv:  [...a.uv,  ...b.uv],
    idx: [...a.idx, ...b.idx.map(i => i + a.vi)],
    vi:  a.vi + b.vi,
  };
}

// ── Per-kind local-space geometry (XZ-centered, base at y = 0) ────────────────
// Each builder fills TWO buffers: `cap` (top/bottom faces — `material`) and
// `side` (lateral faces — `sideMaterial`, falling back to `material`).

const CONE_EPS = 1e-3;

function buildCylinderBufs(p: ResolvedShapeParams, tsCap: number, tsSide: number): { cap: GeoBuf; side: GeoBuf } {
  const { radiusTop: rT, radiusBottom: rB, height: h, radialSegments: seg } = p;
  const isCone = rT < CONE_EPS;
  const flat   = seg <= FLAT_SHADE_MAX_SEGMENTS;
  const slant  = Math.hypot(h, rB - rT);
  const vs     = slant / tsSide;
  const cap = newBuf(), side = newBuf();

  // Smooth outward side normal at angle θ: derived from the frustum surface
  // tangents — normalize(h·cosθ, rB − rT, h·sinθ).
  const sideNormal = (theta: number): V3 => {
    const len = Math.hypot(h, rB - rT) || 1;
    return [(h * Math.cos(theta)) / len, (rB - rT) / len, (h * Math.sin(theta)) / len];
  };

  for (let i = 0; i < seg; i++) {
    const t0 = (i / seg) * Math.PI * 2, t1 = ((i + 1) / seg) * Math.PI * 2;
    const b0: V3 = [rB * Math.cos(t0), 0, rB * Math.sin(t0)];
    const b1: V3 = [rB * Math.cos(t1), 0, rB * Math.sin(t1)];
    // Cylindrical metric unwrap: u = arc length in meters ÷ tileScale, per ring
    // (each ring uses its own circumference so cones keep metric density).
    const ub0 = (t0 * rB) / tsSide, ub1 = (t1 * rB) / tsSide;
    const nFlat = sideNormal((t0 + t1) / 2);
    if (isCone) {
      const apex: V3 = [0, h, 0];
      const n0 = flat ? nFlat : sideNormal(t0);
      const n1 = flat ? nFlat : sideNormal(t1);
      pushTri(side, [b1, b0, apex], [n1, n0, nFlat], [[ub1, 0], [ub0, 0], [(ub0 + ub1) / 2, vs]]);
    } else {
      const p0: V3 = [rT * Math.cos(t0), h, rT * Math.sin(t0)];
      const p1: V3 = [rT * Math.cos(t1), h, rT * Math.sin(t1)];
      const ut0 = (t0 * rT) / tsSide, ut1 = (t1 * rT) / tsSide;
      const n0 = flat ? nFlat : sideNormal(t0);
      const n1 = flat ? nFlat : sideNormal(t1);
      pushQuad(side, [b1, b0, p0, p1], [n1, n0, n0, n1],
        [[ub1, 0], [ub0, 0], [ut0, vs], [ut1, vs]]);
    }
  }

  // Caps — triangle fans with planar XZ metric UVs (u = x/ts, v = z/ts).
  const fan = (y: number, r: number, up: boolean) => {
    const n: V3 = [0, up ? 1 : -1, 0];
    const center: V3 = [0, y, 0];
    for (let i = 0; i < seg; i++) {
      const t0 = (i / seg) * Math.PI * 2, t1 = ((i + 1) / seg) * Math.PI * 2;
      const q0: V3 = [r * Math.cos(t0), y, r * Math.sin(t0)];
      const q1: V3 = [r * Math.cos(t1), y, r * Math.sin(t1)];
      const uvOf = (v: V3): [number, number] => [v[0] / tsCap, v[2] / tsCap];
      const tri: [V3, V3, V3] = up ? [center, q1, q0] : [center, q0, q1];
      pushTri(cap, tri, [n, n, n], [uvOf(tri[0]), uvOf(tri[1]), uvOf(tri[2])]);
    }
  };
  fan(0, rB, false);
  if (!isCone) fan(h, rT, true);

  return { cap, side };
}

function buildWedgeBufs(p: ResolvedShapeParams, tsCap: number, tsSide: number): { cap: GeoBuf; side: GeoBuf } {
  const { width: w, depth: d, heightLow: hL, heightHigh: hH } = p;
  const hw = w / 2, hd = d / 2;
  const cap = newBuf(), side = newBuf();
  const isRamp = hL < 1e-4;

  const b00: V3 = [-hw, 0, -hd], b10: V3 = [hw, 0, -hd];
  const b11: V3 = [hw, 0, hd],   b01: V3 = [-hw, 0, hd];
  const k00: V3 = [-hw, hH, -hd], k10: V3 = [hw, hH, -hd];   // high edge (−Z)
  const k01: V3 = [-hw, hL, hd],  k11: V3 = [hw, hL, hd];    // low edge (+Z)

  pushQuadMetric(cap, b00, b10, b11, b01, tsCap);            // bottom (−Y)
  pushQuadMetric(cap, k00, k01, k11, k10, tsCap);            // sloped top (walkable face)
  pushQuadMetric(side, b10, b00, k00, k10, tsSide);          // back (−Z)
  if (isRamp) {
    pushTriMetric(side, b00, b01, k00, tsSide);              // −X side (triangle)
    pushTriMetric(side, b11, b10, k10, tsSide);              // +X side (triangle)
  } else {
    pushQuadMetric(side, b01, b11, k11, k01, tsSide);        // front (+Z)
    pushQuadMetric(side, b00, b01, k01, k00, tsSide);        // −X side (trapezoid)
    pushQuadMetric(side, b11, b10, k10, k11, tsSide);        // +X side (trapezoid)
  }
  return { cap, side };
}

function buildFlexBoxBufs(p: ResolvedShapeParams, tsCap: number, tsSide: number): { cap: GeoBuf; side: GeoBuf } {
  const { width: w, depth: d, height: h, taperX: tx, taperZ: tz, shearX: sx, shearZ: sz } = p;
  const hw = w / 2, hd = d / 2;
  const cap = newBuf(), side = newBuf();

  const b00: V3 = [-hw, 0, -hd], b10: V3 = [hw, 0, -hd];
  const b11: V3 = [hw, 0, hd],   b01: V3 = [-hw, 0, hd];
  const t00: V3 = [-hw * tx + sx, h, -hd * tz + sz], t10: V3 = [hw * tx + sx, h, -hd * tz + sz];
  const t11: V3 = [hw * tx + sx, h, hd * tz + sz],   t01: V3 = [-hw * tx + sx, h, hd * tz + sz];

  // Top/bottom edges of every side face stay parallel to X or Z for any
  // taper/shear, so all six faces remain planar quads.
  pushQuadMetric(cap, b00, b10, b11, b01, tsCap);    // bottom (−Y)
  pushQuadMetric(cap, t00, t01, t11, t10, tsCap);    // top (+Y)
  pushQuadMetric(side, b10, b00, t00, t10, tsSide);  // −Z
  pushQuadMetric(side, b01, b11, t11, t01, tsSide);  // +Z
  pushQuadMetric(side, b11, b10, t10, t11, tsSide);  // +X
  pushQuadMetric(side, b00, b01, t01, t00, tsSide);  // −X
  return { cap, side };
}

/**
 * Brush mode: triangulate the convex hull of the local vertex cloud. Faces with
 * |normal.y| ≥ CAP_NY go to the cap buffer, the rest to sides. Per-face metric
 * UVs use a basis derived from the normal alone, so coplanar hull triangles
 * share the same projection (no seams within a flat face).
 */
function buildHullBufs(def: ShapeDef, tsCap: number, tsSide: number): { cap: GeoBuf; side: GeoBuf } | null {
  const verts = def.mesh!.vertices;
  let hull: THREE.BufferGeometry;
  try {
    hull = new ConvexGeometry(verts.map(v => new THREE.Vector3(v.x, v.y, v.z)));
  } catch {
    console.warn(`ShapeBuilder: degenerate brush hull for "${def.id}" — falling back to kind params`);
    return null;
  }
  const cap = newBuf(), side = newBuf();
  const pos = hull.attributes["position"] as THREE.BufferAttribute;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    n.crossVectors(_va.subVectors(b, a), _vb.subVectors(c, a)).normalize();
    const isCap = Math.abs(n.y) >= CAP_NY;
    const ts = isCap ? tsCap : tsSide;
    // Deterministic per-normal basis → coplanar triangles get identical UVs.
    if (Math.abs(n.y) > 0.99) u.copy(X); else u.crossVectors(UP, n).normalize();
    v.crossVectors(n, u);
    const uvOf = (p: THREE.Vector3): [number, number] => [p.dot(u) / ts, p.dot(v) / ts];
    const nn: V3 = [n.x, n.y, n.z];
    pushTri(isCap ? cap : side,
      [[a.x, a.y, a.z], [b.x, b.y, b.z], [c.x, c.y, c.z]],
      [nn, nn, nn], [uvOf(a), uvOf(b), uvOf(c)]);
  }
  hull.dispose();
  return { cap, side };
}

function buildBufs(def: ShapeDef, tsCap: number, tsSide: number): { cap: GeoBuf; side: GeoBuf } {
  if (isBrush(def)) {
    const hull = buildHullBufs(def, tsCap, tsSide);
    if (hull) return hull;
  }
  const p = resolveShapeParams(def);
  switch (def.kind) {
    case "cylinder": return buildCylinderBufs(p, tsCap, tsSide);
    case "wedge":    return buildWedgeBufs(p, tsCap, tsSide);
    case "box":      return buildFlexBoxBufs(p, tsCap, tsSide);
  }
}

// ── Face-brush geometry (Phase 23) ────────────────────────────────────────────
// Deterministic per-normal UV basis (shared with the hull path): coplanar faces
// get identical metric projections, so flat regions have no seams.
function faceUVBasis(n: THREE.Vector3): { u: THREE.Vector3; v: THREE.Vector3 } {
  const u = new THREE.Vector3(), v = new THREE.Vector3();
  if (Math.abs(n.y) > 0.99) u.set(1, 0, 0);
  else u.crossVectors(new THREE.Vector3(0, 1, 0), n).normalize();
  v.crossVectors(n, u);
  return { u, v };
}

/** Fan-triangulate one face loop into a GeoBuf with flat Newell normals + metric UVs. */
function pushFaceLoop(buf: GeoBuf, def: ShapeDef, loop: number[], ts: number): number {
  const verts = def.mesh!.vertices;
  const n = newellNormal(verts, loop);
  const nn: V3 = [n.x, n.y, n.z];
  const { u, v } = faceUVBasis(n);
  const p = new THREE.Vector3();
  const uvOf = (vi: number): [number, number] => {
    const w = verts[vi]!;
    p.set(w.x, w.y, w.z);
    return [p.dot(u) / ts, p.dot(v) / ts];
  };
  const at = (vi: number): V3 => [verts[vi]!.x, verts[vi]!.y, verts[vi]!.z];
  for (let i = 1; i < loop.length - 1; i++) {
    pushTri(buf, [at(loop[0]!), at(loop[i]!), at(loop[i + 1]!)], [nn, nn, nn],
      [uvOf(loop[0]!), uvOf(loop[i]!), uvOf(loop[i + 1]!)]);
  }
  return loop.length - 2;   // triangles emitted
}

// ── Builder ───────────────────────────────────────────────────────────────────

export class ShapeBuilder {
  /** Merged single geometry — tool ghost + tests. */
  static buildLocalGeometry(def: ShapeDef, tileScale: number): THREE.BufferGeometry {
    if (isFaceBrush(def)) {
      const buf = newBuf();
      for (const f of def.mesh!.faces!) pushFaceLoop(buf, def, f.verts, tileScale);
      return makeGeo(buf);
    }
    const { cap, side } = buildBufs(def, tileScale, tileScale);
    return makeGeo(mergeBufs(cap, side));
  }

  /** Flat vertex + fan-index arrays for the face-brush trimesh collider. */
  static localTrimesh(def: ShapeDef): { vertices: Float32Array; indices: Uint32Array } {
    const verts = def.mesh!.vertices;
    const v = new Float32Array(verts.length * 3);
    verts.forEach((p, i) => { v[i * 3] = p.x; v[i * 3 + 1] = p.y; v[i * 3 + 2] = p.z; });
    const idx: number[] = [];
    for (const f of def.mesh!.faces ?? []) {
      for (let i = 1; i < f.verts.length - 1; i++) idx.push(f.verts[0]!, f.verts[i]!, f.verts[i + 1]!);
    }
    return { vertices: v, indices: new Uint32Array(idx) };
  }

  /** Cap/side split for the two-material build. */
  static buildLocalGeometrySplit(def: ShapeDef, tsCap: number, tsSide: number): { cap: THREE.BufferGeometry; side: THREE.BufferGeometry } {
    const bufs = buildBufs(def, tsCap, tsSide);
    return { cap: makeGeo(bufs.cap), side: makeGeo(bufs.side) };
  }

  /**
   * Convex-hull vertex cloud in LOCAL space (rings/corners, or the brush cloud).
   * All shapes are convex, so the hull is exact; ColliderBuilder.registerShape
   * applies the def's position/rotation on the collider — same transform as the
   * mesh, so the two can never drift.
   */
  static localHullPoints(def: ShapeDef): Float32Array {
    if (isBrush(def)) {
      const pts: number[] = [];
      for (const v of def.mesh!.vertices) pts.push(v.x, v.y, v.z);
      return new Float32Array(pts);
    }
    const p = resolveShapeParams(def);
    const pts: number[] = [];
    if (def.kind === "cylinder") {
      const { radiusTop: rT, radiusBottom: rB, height: h, radialSegments: seg } = p;
      for (let i = 0; i < seg; i++) {
        const t = (i / seg) * Math.PI * 2;
        pts.push(rB * Math.cos(t), 0, rB * Math.sin(t));
        if (rT >= CONE_EPS) pts.push(rT * Math.cos(t), h, rT * Math.sin(t));
      }
      if (rT < CONE_EPS) pts.push(0, h, 0);
    } else if (def.kind === "wedge") {
      const { width: w, depth: d, heightLow: hL, heightHigh: hH } = p;
      const hw = w / 2, hd = d / 2;
      pts.push(-hw, 0, -hd,  hw, 0, -hd,  hw, 0, hd,  -hw, 0, hd,
               -hw, hH, -hd, hw, hH, -hd, hw, hL, hd, -hw, hL, hd);
    } else {
      const { width: w, depth: d, height: h, taperX: tx, taperZ: tz, shearX: sx, shearZ: sz } = p;
      const hw = w / 2, hd = d / 2;
      pts.push(-hw, 0, -hd,  hw, 0, -hd,  hw, 0, hd,  -hw, 0, hd,
               -hw * tx + sx, h, -hd * tz + sz,  hw * tx + sx, h, -hd * tz + sz,
                hw * tx + sx, h,  hd * tz + sz, -hw * tx + sx, h,  hd * tz + sz);
    }
    return new Float32Array(pts);
  }

  static async build(shape: ShapeDef, zoneId: string): Promise<ShapeBuildOutput> {
    const meshes = await ShapeBuilder.buildMeshes(shape, zoneId);
    // Mover path (Phase 31): kinematic body carrying the full rest pose; the
    // local-space hull/trimesh attaches body-relative.
    let moverBody: RAPIER.RigidBody | undefined;
    if (shape.mover?.enabled) {
      const D2R = Math.PI / 180;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        shape.rotation.x * D2R, shape.rotation.y * D2R, shape.rotation.z * D2R, "XYZ",
      ));
      moverBody = physicsWorld.createKinematicBody(shape.position, { x: q.x, y: q.y, z: q.z, w: q.w });
    }
    let collider: RAPIER.Collider | null;
    if (isFaceBrush(shape)) {
      const tm = ShapeBuilder.localTrimesh(shape);
      collider = ColliderBuilder.registerShapeTrimesh(shape, tm.vertices, tm.indices, moverBody);
    } else {
      collider = ColliderBuilder.registerShape(shape, ShapeBuilder.localHullPoints(shape), moverBody);
    }
    if (moverBody && !collider) {
      // Degenerate hull — nothing attached, drop the orphan body (mesh still animates).
      physicsWorld.removeRigidBody(moverBody);
      moverBody = undefined;
    }
    return moverBody ? { meshes, collider, moverBody } : { meshes, collider };
  }

  /**
   * Render meshes only — identical to build() minus physics registration. The
   * bake-to-GLB path (Phase 26) uses this to get pristine display meshes without
   * leaking collider bodies into the physics world.
   */
  static async buildMeshes(shape: ShapeDef, zoneId: string): Promise<THREE.Mesh[]> {
    if (isFaceBrush(shape)) return ShapeBuilder._buildFaceBrushMeshes(shape, zoneId);
    const capOvr  = shape.materialOverrides;
    const capDef  = assetManager.getMaterialDef(shape.material);
    const tsCap   = capOvr?.tileScale ?? capDef?.tileScale ?? 1.0;

    const sideId  = shape.sideMaterial;
    const sideOvr = shape.sideMaterialOverrides;
    const sideDef = sideId ? assetManager.getMaterialDef(sideId) : null;
    const tsSide  = sideOvr?.tileScale ?? sideDef?.tileScale ?? tsCap;

    const loadMat = (id: string, ovr: MaterialOverrides | undefined) =>
      ovr
        ? assetManager.getMaterialWithOverrides(id, ovr).catch(() => assetManager.getDefaultMaterial(0x667788))
        : assetManager.getMaterial(id).catch(() => assetManager.getDefaultMaterial(0x667788));

    const capMat  = await loadMat(shape.material, capOvr);
    const sideMat = sideId ? await loadMat(sideId, sideOvr) : capMat;

    const { cap, side } = ShapeBuilder.buildLocalGeometrySplit(shape, tsCap, tsSide);
    applyUVOffset(cap,  capOvr?.offsetX ?? 0, capOvr?.offsetY ?? 0);
    // Sides fall back to cap offsets when no separate side material (platform convention).
    applyUVOffset(side, sideOvr?.offsetX ?? capOvr?.offsetX ?? 0, sideOvr?.offsetY ?? capOvr?.offsetY ?? 0);

    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, owns: boolean): THREE.Mesh => {
      const mesh = new THREE.Mesh(geo, mat);
      // Local-space contract: geometry stays local; position/rotation are the mesh
      // transform (mirrored onto the collider), never baked into vertices.
      mesh.position.set(shape.position.x, shape.position.y, shape.position.z);
      mesh.rotation.set(
        THREE.MathUtils.degToRad(shape.rotation.x),
        THREE.MathUtils.degToRad(shape.rotation.y),
        THREE.MathUtils.degToRad(shape.rotation.z),
      );
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
      // BOTH meshes are selectable (unlike platforms): clicking a side face should
      // select the shape, and decals project onto selectable meshes only.
      mesh.userData = {
        editorId:      shape.id,
        editorType:    "shape",
        zoneId,
        selectable:    true,
        floorLevel:    shape.floorLevel ?? 0,
        _ownsMaterial: owns,
      } satisfies MeshUserData;
      return mesh;
    };

    const capMesh  = mk(cap,  capMat,  !!capOvr);
    const sideMesh = mk(side, sideMat, !!(sideId && sideOvr));
    return [capMesh, sideMesh];
  }

  /**
   * Face-brush build (Phase 23): faces grouped by effective material → one mesh per
   * group (a single-material brush stays one mesh/draw call), fan-triangulated with
   * flat Newell normals and per-face metric UVs. Each built mesh carries
   * userData.faceGroups (triangle range → face index) for face-mode picking.
   * Collider (added by build()) = exact trimesh of the same fans (concave solids
   * collide correctly).
   */
  private static async _buildFaceBrushMeshes(shape: ShapeDef, zoneId: string): Promise<THREE.Mesh[]> {
    const faces = shape.mesh!.faces!;

    interface Group { matId: string; ovr?: MaterialOverrides; faceIdxs: number[] }
    const groups = new Map<string, Group>();
    faces.forEach((f, i) => {
      // A face without its own material inherits the shape's material AND overrides.
      const matId = f.material ?? shape.material;
      const ovr   = f.material ? f.materialOverrides : (f.materialOverrides ?? shape.materialOverrides);
      const key   = `${matId}|${JSON.stringify(ovr ?? null)}`;
      const g = groups.get(key) ?? { matId, ovr, faceIdxs: [] };
      g.faceIdxs.push(i);
      groups.set(key, g);
    });

    const loadMat = (id: string, ovr: MaterialOverrides | undefined) =>
      ovr
        ? assetManager.getMaterialWithOverrides(id, ovr).catch(() => assetManager.getDefaultMaterial(0x667788))
        : assetManager.getMaterial(id).catch(() => assetManager.getDefaultMaterial(0x667788));

    const meshes: THREE.Mesh[] = [];
    for (const g of groups.values()) {
      const matDef = assetManager.getMaterialDef(g.matId);
      const ts = g.ovr?.tileScale ?? matDef?.tileScale ?? 1.0;
      const buf = newBuf();
      const faceGroups: FaceGroup[] = [];
      let triOffset = 0;
      for (const fi of g.faceIdxs) {
        const count = pushFaceLoop(buf, shape, faces[fi]!.verts, ts);
        faceGroups.push({ start: triOffset, count, faceIndex: fi });
        triOffset += count;
      }
      const geo = makeGeo(buf);
      applyUVOffset(geo, g.ovr?.offsetX ?? 0, g.ovr?.offsetY ?? 0);
      const mat  = await loadMat(g.matId, g.ovr);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(shape.position.x, shape.position.y, shape.position.z);
      mesh.rotation.set(
        THREE.MathUtils.degToRad(shape.rotation.x),
        THREE.MathUtils.degToRad(shape.rotation.y),
        THREE.MathUtils.degToRad(shape.rotation.z),
      );
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
      mesh.userData = {
        editorId:      shape.id,
        editorType:    "shape",
        zoneId,
        selectable:    true,
        floorLevel:    shape.floorLevel ?? 0,
        _ownsMaterial: !!g.ovr,
        faceGroups,
      } satisfies MeshUserData;
      meshes.push(mesh);
    }
    return meshes;
  }
}
