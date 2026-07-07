import * as THREE from "three";
import { ColliderBuilder } from "@/physics/ColliderBuilder";
import { assetManager } from "@/core/AssetManager";
import { applyUVOffset } from "@/builders/UVUtils";
import type { ShapeDef, MeshUserData } from "@/types";
import type RAPIER from "@dimforge/rapier3d-compat";

export interface ShapeBuildOutput {
  mesh:     THREE.Mesh;
  collider: RAPIER.Collider | null;
}

/** Below this radialSegments count, cylinder sides get flat per-face normals
 *  (crisp tri-prism / hex-pillar look); at or above, smooth analytic normals. */
export const FLAT_SHADE_MAX_SEGMENTS = 11;

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

// ── Geometry accumulator ──────────────────────────────────────────────────────
// All faces are emitted with explicit per-corner normals/UVs (cylinder corners
// differ per vertex, so PlatformBuilder's rect-UV pushFace doesn't fit).
// Winding convention: corners CCW viewed from outside; indices (0,1,2),(0,2,3).

interface GeoBuf { pos: number[]; nrm: number[]; uv: number[]; idx: number[]; vi: number }

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

// ── Per-kind local-space geometry (XZ-centered, base at y = 0) ────────────────

const CONE_EPS = 1e-3;

function buildCylinderGeo(p: ResolvedShapeParams, ts: number): THREE.BufferGeometry {
  const { radiusTop: rT, radiusBottom: rB, height: h, radialSegments: seg } = p;
  const isCone = rT < CONE_EPS;
  const flat   = seg <= FLAT_SHADE_MAX_SEGMENTS;
  const slant  = Math.hypot(h, rB - rT);
  const vs     = slant / ts;
  const b: GeoBuf = { pos: [], nrm: [], uv: [], idx: [], vi: 0 };

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
    const ub0 = (t0 * rB) / ts, ub1 = (t1 * rB) / ts;
    const nFlat = sideNormal((t0 + t1) / 2);
    if (isCone) {
      const apex: V3 = [0, h, 0];
      const n0 = flat ? nFlat : sideNormal(t0);
      const n1 = flat ? nFlat : sideNormal(t1);
      const nA = nFlat;
      // CCW from outside: (b1, b0, apex)
      pushTri(b, [b1, b0, apex], [n1, n0, nA], [[ub1, 0], [ub0, 0], [(ub0 + ub1) / 2, vs]]);
    } else {
      const p0: V3 = [rT * Math.cos(t0), h, rT * Math.sin(t0)];
      const p1: V3 = [rT * Math.cos(t1), h, rT * Math.sin(t1)];
      const ut0 = (t0 * rT) / ts, ut1 = (t1 * rT) / ts;
      const n0 = flat ? nFlat : sideNormal(t0);
      const n1 = flat ? nFlat : sideNormal(t1);
      // CCW from outside: (b1, b0, t0, t1)
      pushQuad(b, [b1, b0, p0, p1], [n1, n0, n0, n1],
        [[ub1, 0], [ub0, 0], [ut0, vs], [ut1, vs]]);
    }
  }

  // Caps — triangle fans with planar XZ metric UVs (u = x/ts, v = z/ts).
  const cap = (y: number, r: number, up: boolean) => {
    const n: V3 = [0, up ? 1 : -1, 0];
    const center: V3 = [0, y, 0];
    for (let i = 0; i < seg; i++) {
      const t0 = (i / seg) * Math.PI * 2, t1 = ((i + 1) / seg) * Math.PI * 2;
      const q0: V3 = [r * Math.cos(t0), y, r * Math.sin(t0)];
      const q1: V3 = [r * Math.cos(t1), y, r * Math.sin(t1)];
      const uvOf = (v: V3): [number, number] => [v[0] / ts, v[2] / ts];
      // Top cap winds (center, q1, q0) for +Y; bottom (center, q0, q1) for −Y.
      const tri: [V3, V3, V3] = up ? [center, q1, q0] : [center, q0, q1];
      pushTri(b, tri, [n, n, n], [uvOf(tri[0]), uvOf(tri[1]), uvOf(tri[2])]);
    }
  };
  cap(0, rB, false);
  if (!isCone) cap(h, rT, true);

  return makeGeo(b);
}

function buildWedgeGeo(p: ResolvedShapeParams, ts: number): THREE.BufferGeometry {
  const { width: w, depth: d, heightLow: hL, heightHigh: hH } = p;
  const hw = w / 2, hd = d / 2;
  const b: GeoBuf = { pos: [], nrm: [], uv: [], idx: [], vi: 0 };
  const isRamp = hL < 1e-4;

  const b00: V3 = [-hw, 0, -hd], b10: V3 = [hw, 0, -hd];
  const b11: V3 = [hw, 0, hd],   b01: V3 = [-hw, 0, hd];
  const k00: V3 = [-hw, hH, -hd], k10: V3 = [hw, hH, -hd];   // high edge (−Z)
  const k01: V3 = [-hw, hL, hd],  k11: V3 = [hw, hL, hd];    // low edge (+Z)

  pushQuadMetric(b, b00, b10, b11, b01, ts);                 // bottom (−Y)
  pushQuadMetric(b, b10, b00, k00, k10, ts);                 // back (−Z)
  pushQuadMetric(b, k00, k01, k11, k10, ts);                 // sloped top
  if (isRamp) {
    pushTriMetric(b, b00, b01, k00, ts);                     // −X side (triangle)
    pushTriMetric(b, b11, b10, k10, ts);                     // +X side (triangle)
  } else {
    pushQuadMetric(b, b01, b11, k11, k01, ts);               // front (+Z)
    pushQuadMetric(b, b00, b01, k01, k00, ts);               // −X side (trapezoid)
    pushQuadMetric(b, b11, b10, k10, k11, ts);               // +X side (trapezoid)
  }
  return makeGeo(b);
}

function buildFlexBoxGeo(p: ResolvedShapeParams, ts: number): THREE.BufferGeometry {
  const { width: w, depth: d, height: h, taperX: tx, taperZ: tz, shearX: sx, shearZ: sz } = p;
  const hw = w / 2, hd = d / 2;
  const b: GeoBuf = { pos: [], nrm: [], uv: [], idx: [], vi: 0 };

  const b00: V3 = [-hw, 0, -hd], b10: V3 = [hw, 0, -hd];
  const b11: V3 = [hw, 0, hd],   b01: V3 = [-hw, 0, hd];
  const t00: V3 = [-hw * tx + sx, h, -hd * tz + sz], t10: V3 = [hw * tx + sx, h, -hd * tz + sz];
  const t11: V3 = [hw * tx + sx, h, hd * tz + sz],   t01: V3 = [-hw * tx + sx, h, hd * tz + sz];

  // Top/bottom edges of every side face stay parallel to X or Z for any
  // taper/shear, so all six faces remain planar quads.
  pushQuadMetric(b, b00, b10, b11, b01, ts);   // bottom (−Y)
  pushQuadMetric(b, t00, t01, t11, t10, ts);   // top (+Y)
  pushQuadMetric(b, b10, b00, t00, t10, ts);   // −Z
  pushQuadMetric(b, b01, b11, t11, t01, ts);   // +Z
  pushQuadMetric(b, b11, b10, t10, t11, ts);   // +X
  pushQuadMetric(b, b00, b01, t01, t00, ts);   // −X
  return makeGeo(b);
}

// ── Builder ───────────────────────────────────────────────────────────────────

export class ShapeBuilder {
  /** Pure local-space geometry — used by build(), the tool ghost preview, and tests. */
  static buildLocalGeometry(def: ShapeDef, tileScale: number): THREE.BufferGeometry {
    const p = resolveShapeParams(def);
    switch (def.kind) {
      case "cylinder": return buildCylinderGeo(p, tileScale);
      case "wedge":    return buildWedgeGeo(p, tileScale);
      case "box":      return buildFlexBoxGeo(p, tileScale);
    }
  }

  /**
   * Convex-hull vertex cloud in LOCAL space (rings/corners). All three kinds are
   * convex by construction, so the hull is exact; ColliderBuilder.registerShape
   * applies the def's position/rotation on the collider — same transform as the
   * mesh, so the two can never drift.
   */
  static localHullPoints(def: ShapeDef): Float32Array {
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
    const ovr     = shape.materialOverrides;
    const baseDef = assetManager.getMaterialDef(shape.material);
    const tileScale = ovr?.tileScale ?? baseDef?.tileScale ?? 1.0;

    const mat = ovr
      ? await assetManager.getMaterialWithOverrides(shape.material, ovr)
          .catch(() => assetManager.getDefaultMaterial(0x667788))
      : await assetManager.getMaterial(shape.material)
          .catch(() => assetManager.getDefaultMaterial(0x667788));

    const geo = ShapeBuilder.buildLocalGeometry(shape, tileScale);
    applyUVOffset(geo, ovr?.offsetX ?? 0, ovr?.offsetY ?? 0);

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
    mesh.userData = {
      editorId:      shape.id,
      editorType:    "shape",
      zoneId,
      selectable:    true,
      floorLevel:    shape.floorLevel ?? 0,
      _ownsMaterial: !!ovr,
    } satisfies MeshUserData;

    const collider = ColliderBuilder.registerShape(shape, ShapeBuilder.localHullPoints(shape));
    return { mesh, collider };
  }
}
