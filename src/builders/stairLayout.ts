import type { StairDef, Vec3 } from "@/types";

// Pure layout math for stairs with landings / switchback flights (Phase 29).
// Single source of truth consumed by BOTH StairBuilder (meshes) and
// ColliderBuilder (physics) so the two can never drift. Imports only types.
//
// Frame conventions (match StairBuilder's toWorld/angle math exactly):
//   angle A = atan2(end.z - start.z, end.x - start.x)  — flight 1's heading
//   dir     = (cosA, sinA)      — up-flight direction in XZ (local +X)
//   right   = (-sinA, cosA)     — right of travel (local +Z)
//   turnVec = left or right per stair.turn — the side flights stack toward
// Stairwell frame: u = distance along dir, v = signed distance along turnVec,
// both anchored at stair.start. frameToWorld converts (u, v, y) → world.
//
// Layout rules (see plans/phase-29-stair-landings-switchbacks.md):
//   - start/end describe flight 1 exactly as before; numSteps is per-flight;
//     every flight repeats flight 1's run/rise, rotated 180° alternately.
//   - Flight k sits at lateral center v = (k % 2) · (width + gap); even
//     flights run u 0→run, odd flights run→0.
//   - A landing tops EVERY flight when `landing` is set: k even u ∈ [run, run+D],
//     k odd u ∈ [-D, 0]; laterally spanning both flights + void (or
//     landing.width when flights === 1). Landings add no rise.

const DEFAULT_STEP_H = 0.2;   // numSteps fallback — mirrors StairBuilder/StairTool/ColliderBuilder

export interface StairFrame {
  origin:  Vec3;                       // stair.start
  angle:   number;                     // flight 1 heading (radians)
  dir:     { x: number; z: number };   // up-flight unit vector
  turnVec: { x: number; z: number };   // lateral unit vector toward the next flight
}

export interface FlightSpec {
  start: Vec3;   // feeds the existing per-step loop unchanged
  end:   Vec3;
}

export interface LandingSpec {
  uMin: number; uMax: number;
  vMin: number; vMax: number;
  topY: number;                        // walking surface (= top of the flight it caps)
  bottomY: number;                     // derived from underside mode
}

export interface StairLayout {
  flights:  FlightSpec[];
  landings: LandingSpec[];
  frame:    StairFrame;
  // Shared scalars, resolved + clamped:
  run: number; rise: number; numSteps: number;
  width: number; gap: number; off: number;   // off = width + gap (lateral pitch)
  landingDepth: number | null;               // null → no landings
  flightsCount: number;
}

export function frameToWorld(frame: StairFrame, u: number, v: number, y: number): Vec3 {
  return {
    x: frame.origin.x + u * frame.dir.x + v * frame.turnVec.x,
    y,
    z: frame.origin.z + u * frame.dir.z + v * frame.turnVec.z,
  };
}

/** True when the stair has no landing and a single flight — builders take the legacy path. */
export function isPlainStair(stair: StairDef): boolean {
  return (stair.flights ?? 1) <= 1 && !stair.landing;
}

export function computeStairLayout(stair: StairDef): StairLayout {
  const dx   = stair.end.x - stair.start.x;
  const dz   = stair.end.z - stair.start.z;
  const rise = stair.end.y - stair.start.y;
  const run  = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const dir   = { x: Math.cos(angle), z: Math.sin(angle) };
  const right = { x: -Math.sin(angle), z: Math.cos(angle) };
  const turnVec = (stair.turn ?? "left") === "left"
    ? { x: -right.x, z: -right.z }
    : right;
  const frame: StairFrame = { origin: stair.start, angle, dir, turnVec };

  const numSteps = stair.numSteps ?? Math.max(1, Math.round(rise / DEFAULT_STEP_H));
  const width    = stair.width;
  const gap      = Math.max(0, stair.gap ?? 0.2);
  const off      = width + gap;

  // Defensive clamps — hand-edited JSON must never break a rebuild.
  const flightsCount = Math.max(1, Math.round(stair.flights ?? 1));
  const landingDef   = stair.landing ?? (flightsCount > 1 ? { depth: width } : null);
  const landingDepth = landingDef ? Math.max(0.1, landingDef.depth) : null;

  const baseY = stair.start.y;
  const flights: FlightSpec[] = [];
  for (let k = 0; k < flightsCount; k++) {
    const vC = (k % 2) * off;
    const uA = k % 2 === 0 ? 0 : run;    // flight k's low end
    const uB = k % 2 === 0 ? run : 0;    // flight k's high end
    flights.push({
      start: frameToWorld(frame, uA, vC, baseY + k * rise),
      end:   frameToWorld(frame, uB, vC, baseY + (k + 1) * rise),
    });
  }

  const landings: LandingSpec[] = [];
  if (landingDepth !== null) {
    const D = landingDepth;
    const stepRise = rise / numSteps;
    const mode     = stair.underside?.mode ?? "open";
    const effThk   = Math.max(stair.underside?.thickness ?? 0.25, 0.02) + stepRise;
    const lw = flightsCount === 1 ? Math.max(width, landingDef?.width ?? width) : 0;
    for (let k = 0; k < flightsCount; k++) {
      const topY = baseY + (k + 1) * rise;
      // "closed" reaches the ground only for the first landing — upper landings sit
      // directly above lower ones (k and k+2 share a footprint), so they fall back
      // to the diagonal-style slab. Same rule as upper flights in StairBuilder.
      const bottomY =
        mode === "closed" && k === 0 ? baseY :
        mode === "open"              ? topY - stepRise :
                                       topY - effThk;
      landings.push({
        uMin: k % 2 === 0 ? run : -D,
        uMax: k % 2 === 0 ? run + D : 0,
        vMin: flightsCount === 1 ? -lw / 2 : -width / 2,
        vMax: flightsCount === 1 ?  lw / 2 : off + width / 2,
        topY, bottomY,
      });
    }
  }

  return { flights, landings, frame, run, rise, numSteps, width, gap, off, landingDepth, flightsCount };
}

// ─── Rail paths ───────────────────────────────────────────────────────────────
//
// With landings engaged, the entire railing is a small set of continuous
// polylines. Every vertex is at WALKING-SURFACE height — the top rail renders
// `height` above each point, posts rise from the point. The tread-anchor line
// of a flight (centers of the step nosings) is exactly the straight line from
// (u = low end, y = flight base) to (u = high end, y = flight top), so sloped
// segments meet the landings' level segments perfectly at the corners.
//
//   - Inner path (around the void): up flight k on the void side → the rail
//     levels out at the landing edge and eases a short horizontal run onto the
//     landing → level across behind the void → ease back → up flight k+1 → …
//     → free end after the top landing's crossing. The ease keeps every bend
//     planar so rail miters always line up.
//   - Outer path: up flight k's outer side → level around the landing's three
//     outer perimeter edges (the last leg lies on flight k+1's outer rail
//     line) → up flight k+1 → … → terminates at the top landing's open exit
//     edge. No rail ever crosses a flight entry/exit edge.
//   - Single flight + landing (balcony): both side rails continue onto the
//     landing and wrap its three exposed edges; the entry edge stays open.

export type RailSide = "inner" | "outer";
export interface StairRailLayout {
  paths: { points: Vec3[]; side: RailSide }[];        // polylines; consecutive points = one rail segment
  posts: { position: Vec3; side: RailSide }[];        // post base positions (deduped per side)
}

interface RailCfg {
  inset:     number;   // effective inward offset of a rail line from its edge
  overhang:  number;   // extension past free ends, along the segment
  stepEvery: number;   // baluster rhythm on slopes (every Nth step)
}

export function computeRailPaths(stair: StairDef, layout: StairLayout): StairRailLayout {
  const { run, rise, numSteps, width, gap, off, landingDepth, flightsCount, frame } = layout;
  if (landingDepth === null) return { paths: [], posts: [] };

  const r = stair.railing;
  const postT     = r?.postThickness ?? 0.06;
  const sideInset = r?.sideInset ?? 0.1;
  const cfg: RailCfg = {
    // Same clamp as the legacy builder: never inset past the stair centerline.
    inset:     width / 2 - Math.max(postT / 2, width / 2 - sideInset),
    overhang:  r?.overhang ?? 0.15,
    stepEvery: Math.max(1, Math.round(r?.stepInterval ?? 1)),
  };

  const baseY    = stair.start.y;
  const D        = landingDepth;
  const stepRise = rise / numSteps;
  const stepDepth = run / numSteps;

  // Landing perimeter rails (outer landing edges) are opt-in — real stairwells
  // have walls there; without them the outer rail just stops at each landing.
  const perimeter = r?.landingPerimeter ?? false;

  // Frame-space path points, converted to world at the end. `freeStart` marks
  // paths whose first vertex is an overhang tip (freeEnd) — no post there.
  type P = { u: number; v: number; y: number };
  const paths: { pts: P[]; side: RailSide; freeStart?: boolean }[] = [];

  const uLow  = (k: number) => (k % 2 === 0 ? 0 : run);       // flight k's low-end boundary
  const uHigh = (k: number) => (k % 2 === 0 ? run : 0);       // flight k's high-end boundary
  const uFar  = (k: number) => (k % 2 === 0 ? run + D - cfg.inset : -D + cfg.inset);
  const topY  = (k: number) => baseY + (k + 1) * rise;

  // Bottom free end of flight 0's rail: first tread anchor extended down-slope by overhang.
  const freeEnd = (v: number): P => {
    const slopeLen = Math.hypot(run, rise);
    const u0 = (0.5 / numSteps) * run;
    const y0 = baseY + 0.5 * stepRise;
    return { u: u0 - cfg.overhang * (run / slopeLen), v, y: y0 - cfg.overhang * (rise / slopeLen) };
  };

  if (flightsCount === 1) {
    // Balcony. s = +1 is the turn side ("inner" for consistency), s = -1 outer.
    // With perimeter ON each side rail continues onto the landing (one spans the
    // far edge, meeting the other at the shared corner); OFF they stop at the edge.
    const lw = Math.max(width, stair.landing?.width ?? width);
    for (const s of [1, -1] as const) {
      const side: RailSide = s === 1 ? "inner" : "outer";
      const vFlight  = s * (width / 2 - cfg.inset);
      const vLanding = s * (lw / 2 - cfg.inset);
      const pts: P[] = [freeEnd(vFlight), { u: run, v: vFlight, y: topY(0) }];
      if (perimeter) {
        if (Math.abs(vLanding - vFlight) > 1e-6)
          pts.push({ u: run, v: vLanding, y: topY(0) });        // lateral jog on a wider landing
        pts.push({ u: run + D - cfg.inset, v: vLanding, y: topY(0) });
        if (s === 1)                                             // far edge, once
          pts.push({ u: run + D - cfg.inset, v: -(lw / 2 - cfg.inset), y: topY(0) });
      }
      paths.push({ pts, side, freeStart: true });
    }
  } else {
    // Rail v-lines per flight parity: inner hugs the void, outer hugs the perimeter.
    const vInner = (k: number) => (k % 2 === 0 ? width / 2 - cfg.inset : off - width / 2 + cfg.inset);
    const vOuter = (k: number) => (k % 2 === 0 ? -width / 2 + cfg.inset : off + width / 2 - cfg.inset);

    // The diagonal levels out at the landing edge and eases a short horizontal
    // run onto the landing before turning, so every bend is planar (flat 90°s
    // and same-heading slope→level) — 3D bends never appear and corner miters
    // always line up.
    const ease = Math.min(0.3, D * 0.4);
    const inner: P[] = [freeEnd(vInner(0))];
    for (let k = 0; k < flightsCount; k++) {
      const uE = uHigh(k) + (k % 2 === 0 ? ease : -ease);            // into the landing
      inner.push({ u: uHigh(k), v: vInner(k),     y: topY(k) });     // slope levels out at landing k
      inner.push({ u: uE,       v: vInner(k),     y: topY(k) });     // horizontal ease onto the landing
      inner.push({ u: uE,       v: vInner(k + 1), y: topY(k) });     // level across behind the void
      if (k + 1 < flightsCount)
        inner.push({ u: uHigh(k), v: vInner(k + 1), y: topY(k) });   // ease back to flight k+1's start
      // …then straight up flight k+1, or free end after the crossing on the top landing.
    }
    paths.push({ pts: inner, side: "inner", freeStart: true });

    if (perimeter) {
      // One continuous outer path wrapping every landing's three outer edges.
      const outer: P[] = [freeEnd(vOuter(0))];
      for (let k = 0; k < flightsCount; k++) {
        const y = topY(k);
        outer.push({ u: uHigh(k), v: vOuter(k),     y });   // arrive at landing k
        outer.push({ u: uFar(k),  v: vOuter(k),     y });   // side edge along arriving flight's line
        outer.push({ u: uFar(k),  v: vOuter(k + 1), y });   // far edge
        outer.push({ u: uHigh(k), v: vOuter(k + 1), y });   // side edge onto next flight's line
        // Top landing: this last vertex is the corner of the open exit edge — terminate.
      }
      paths.push({ pts: outer, side: "outer", freeStart: true });
    } else {
      // Per-flight outer rails that stop at each landing boundary.
      for (let k = 0; k < flightsCount; k++) {
        const start: P = k === 0
          ? freeEnd(vOuter(0))
          : { u: uLow(k), v: vOuter(k), y: topY(k - 1) };
        paths.push({ pts: [start, { u: uHigh(k), v: vOuter(k), y: topY(k) }], side: "outer", freeStart: k === 0 });
      }
    }
  }

  // ── Posts ──────────────────────────────────────────────────────────────────
  // Corner/end posts at every vertex; per-step anchors on sloped segments
  // (legacy rhythm: every Nth step + the top step); spaced posts on long
  // level runs. Deduped — paths share corners with themselves at zero-length
  // segments and with each other at the balcony far corner.
  const posts: { p: P; side: RailSide }[] = [];
  const seen = new Set<string>();
  let curSide: RailSide = "inner";
  const addPost = (p: P): void => {
    const key = `${curSide}:${Math.round(p.u * 500)}:${Math.round(p.v * 500)}:${Math.round(p.y * 500)}`;
    if (seen.has(key)) return;
    seen.add(key);
    posts.push({ p, side: curSide });
  };

  for (const { pts, side, freeStart } of paths) {
    curSide = side;
    for (let i = freeStart ? 1 : 0; i < pts.length; i++) addPost(pts[i]);
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const horiz = Math.hypot(b.u - a.u, b.v - a.v);
      if (horiz < 1e-6) continue;
      if (Math.abs(b.y - a.y) > 1e-6) {
        // Sloped segment — posts at the tread anchors it passes over. Anchors
        // that crowd a corner post half a step away are skipped: the top
        // anchor always (segment tops are landing corners), and the bottom
        // anchor unless that end is a free overhang tip (which has no post).
        const first = freeStart && i === 0 ? 0 : cfg.stepEvery;
        for (let i2 = first; i2 < Math.max(1, numSteps - 1); i2 += cfg.stepEvery) addAnchorPost(a, b, i2);
      } else {
        // Level segment — evenly spaced interior posts, corners already placed.
        const spacing = cfg.stepEvery * stepDepth;
        for (let d = spacing; d < horiz - spacing * 0.25; d += spacing) {
          const t = d / horiz;
          addPost({ u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t, y: a.y });
        }
      }
    }
  }

  // A sloped segment lies on a flight's tread-anchor line: parameterize by the
  // anchor fraction (i + 0.5)/numSteps measured from the segment's LOW end.
  function addAnchorPost(a: P, b: P, i: number): void {
    const lo = a.y <= b.y ? a : b;
    const hi = a.y <= b.y ? b : a;
    const span = hi.y - lo.y;
    // Fraction of the full flight this segment covers (free ends extend past it).
    const yAt = baseY0(lo, hi, i);
    if (yAt === null) return;
    const t = (yAt - lo.y) / span;
    addPost({ u: lo.u + (hi.u - lo.u) * t, v: lo.v, y: yAt });
  }
  // Anchor i's walking height within the flight containing this segment.
  function baseY0(lo: P, hi: P, i: number): number | null {
    const flightBase = hi.y - rise;                        // segment top is always a flight top
    const y = flightBase + (i + 0.5) * stepRise;
    if (y < lo.y - 1e-6 || y > hi.y + 1e-6) return null;   // outside this segment's reach
    return y;
  }

  const toW = (p: P): Vec3 => frameToWorld(frame, p.u, p.v, p.y);
  return {
    paths: paths.map(({ pts, side }) => ({ points: pts.map(toW), side })),
    posts: posts.map(({ p, side }) => ({ position: toW(p), side })),
  };
}
