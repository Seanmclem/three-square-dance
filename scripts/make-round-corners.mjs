#!/usr/bin/env node
// Builds the rounded-corner variants of the platformer-kit tiles.
//
// Every kit SIDE tile is a pure extrusion: one 2D profile (height vs distance
// out from the platform) repeated at x = -1 and x = +1. A rounded corner is that
// same profile swept a quarter turn around the tile's inner corner instead, so
// its two ends match a straight side neighbor vertex for vertex, and four of
// them close into a radius-2 circle.
//
// Orientation matches the square corners (outward faces -X and +Z at rotY 0):
// the pivot is the inner corner (+1, y, -1), the sweep runs from the +X edge
// (meets a +Z-facing side) to the -Z edge (meets a -X-facing side).
//
// Writes platform_<set>_corner_round<band>.gltf next to the sources and upserts
// their manifest entries (with a quarter-disc hull collider). Re-running
// regenerates the same bytes.
//
//   node scripts/make-round-corners.mjs

import { readFileSync, writeFileSync } from "node:fs";

const DIR      = "public/assets/models";
const MANIFEST = `${DIR}/manifest.json`;
const SEGMENTS = 8;          // per quarter turn (a full circle is a 32-gon)
const PIVOT    = { x: 1, z: -1 };

// side tile → the square corner it pairs with (collider + manifest fields mirror it)
const SOURCES = [
  ["platform_grass_side",             "platform_grass_corner"],
  ["platform_grass_side_tall",        "platform_grass_corner_tall"],
  ["platform_grass_side_center_tall", "platform_grass_corner_center_tall"],
  ["platform_grass_side_bottom_tall", "platform_grass_corner_bottom_tall"],
  ["platform_dirt_side",              "platform_dirt_corner"],
  ["platform_dirt_side_tall",         "platform_dirt_corner_tall"],
];

const r4 = n => Math.round(n * 1e4) / 1e4;

function readAccessor(gltf, bin, index) {
  const acc  = gltf.accessors[index];
  const view = gltf.bufferViews[acc.bufferView];
  const n    = { SCALAR: 1, VEC3: 3 }[acc.type];
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const out  = [];
  for (let i = 0; i < acc.count; i++) {
    const row = [];
    for (let c = 0; c < n; c++) {
      if (acc.componentType === 5126)      row.push(bin.readFloatLE(base + (i * n + c) * 4));
      else if (acc.componentType === 5123) row.push(bin.readUInt16LE(base + (i * n + c) * 2));
      else throw new Error(`unsupported componentType ${acc.componentType}`);
    }
    out.push(row);
  }
  return out;
}

/** Sweep one extruded primitive. Returns { positions, normals, indices }. */
function sweep(P, N, tris) {
  // Profile points = the x=+1 vertices; each x=-1 vertex pairs with the +1
  // vertex sharing its (y, z, normal).
  const key = i => `${r4(P[i][1])},${r4(P[i][2])},${r4(N[i][1])},${r4(N[i][2])}`;
  const profile = [], slot = new Map(), side = [];
  for (let i = 0; i < P.length; i++) {
    const k = key(i);
    if (!slot.has(k)) { slot.set(k, profile.length); profile.push({ y: P[i][1], r: P[i][2] - PIVOT.z, ny: N[i][1], nr: N[i][2] }); }
    side.push(P[i][0] > 0 ? 1 : 0);   // 1 = sweep start (angle 0), 0 = sweep end
  }
  const positions = [], normals = [];
  for (let s = 0; s <= SEGMENTS; s++) {
    const a = (s / SEGMENTS) * Math.PI / 2, sin = Math.sin(a), cos = Math.cos(a);
    for (const p of profile) {
      positions.push([PIVOT.x - p.r * sin, p.y, PIVOT.z + p.r * cos]);
      normals.push([-p.nr * sin, p.ny, p.nr * cos]);
    }
  }
  // Each source triangle spans the full extrusion; replay it per segment with
  // its x=+1 corners on ring s and its x=-1 corners on ring s+1. Triangles that
  // collapse at the pivot (r = 0 on both rings) are dropped.
  const indices = [];
  for (let s = 0; s < SEGMENTS; s++) {
    for (const t of tris) {
      const v = t.map(i => (side[i] ? s : s + 1) * profile.length + slot.get(key(i)));
      const at = i => positions[i].map(r4).join(",");
      if (at(v[0]) === at(v[1]) || at(v[1]) === at(v[2]) || at(v[0]) === at(v[2])) continue;
      indices.push(...v);
    }
  }
  return { positions, normals, indices };
}

function build(sideId) {
  const src = JSON.parse(readFileSync(`${DIR}/${sideId}.gltf`, "utf8"));
  const bin = Buffer.from(src.buffers[0].uri.split(",")[1], "base64");
  const chunks = [], bufferViews = [], accessors = [], primitives = [];
  let offset = 0, maxR = 0, minY = Infinity, maxY = -Infinity;
  const push = (buf, target) => {
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target });
    const pad = (4 - (buf.length % 4)) % 4;
    chunks.push(buf, Buffer.alloc(pad));
    offset += buf.length + pad;
    return bufferViews.length - 1;
  };
  const vec3 = rows => {
    const buf = Buffer.alloc(rows.length * 12);
    rows.forEach((row, i) => row.forEach((x, c) => buf.writeFloatLE(x, (i * 3 + c) * 4)));
    return buf;
  };
  for (const prim of src.meshes[0].primitives) {
    const P = readAccessor(src, bin, prim.attributes.POSITION);
    const N = readAccessor(src, bin, prim.attributes.NORMAL);
    const I = readAccessor(src, bin, prim.indices).map(r => r[0]);
    const tris = []; for (let i = 0; i < I.length; i += 3) tris.push(I.slice(i, i + 3));
    const { positions, normals, indices } = sweep(P, N, tris);
    for (const p of P) { maxR = Math.max(maxR, p[2] - PIVOT.z); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    const min = [0, 1, 2].map(c => Math.min(...positions.map(p => p[c])));
    const max = [0, 1, 2].map(c => Math.max(...positions.map(p => p[c])));
    const idx = Buffer.alloc(indices.length * 2);
    indices.forEach((v, i) => idx.writeUInt16LE(v, i * 2));
    accessors.push({ bufferView: push(vec3(positions), 34962), componentType: 5126, count: positions.length, type: "VEC3", min, max });
    accessors.push({ bufferView: push(vec3(normals), 34962),   componentType: 5126, count: normals.length,   type: "VEC3" });
    accessors.push({ bufferView: push(idx, 34963),             componentType: 5123, count: indices.length,   type: "SCALAR" });
    const a = accessors.length;
    primitives.push({ attributes: { POSITION: a - 3, NORMAL: a - 2 }, indices: a - 1, material: prim.material });
  }
  const data = Buffer.concat(chunks);
  const name = src.nodes[0].name.replace("_Side", "_Corner_Round");
  const gltf = {
    asset: { generator: "scripts/make-round-corners.mjs", version: "2.0" },
    scene: 0, scenes: [{ name: "Scene", nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    materials: src.materials,
    meshes: [{ name, primitives }],
    accessors, bufferViews,
    buffers: [{ byteLength: data.length, uri: `data:application/octet-stream;base64,${data.toString("base64")}` }],
  };
  return { gltf, maxR, minY, maxY };
}

/** Quarter-disc prism: the pivot column plus the arc, at the collider's top and bottom. */
function hullCollider(id, radius, y0, y1) {
  const points = [];
  for (const y of [y0, y1]) {
    points.push({ x: PIVOT.x, y: r4(y), z: PIVOT.z });
    for (let s = 0; s <= SEGMENTS; s++) {
      const a = (s / SEGMENTS) * Math.PI / 2;
      points.push({ x: r4(PIVOT.x - radius * Math.sin(a)), y: r4(y), z: r4(PIVOT.z + radius * Math.cos(a)) });
    }
  }
  return {
    id, shape: "hull", offset: { x: 0, y: 0, z: 0 },
    size: { x: r4(radius), y: r4(y1 - y0), z: r4(radius) },
    isSensor: false, points,
  };
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
for (const [sideId, cornerId] of SOURCES) {
  const roundId = cornerId.replace("_corner", "_corner_round");
  const { gltf, maxR, minY, maxY } = build(sideId);
  writeFileSync(`${DIR}/${roundId}.gltf`, JSON.stringify(gltf));

  // Collider mirrors the square corner: its hand-set slab where it has one
  // (walkable top only, lip excluded), else the model's full extent like the
  // auto box it gets by default.
  const square = manifest.assets.find(a => a.id === cornerId);
  if (!square) throw new Error(`manifest has no ${cornerId}`);
  const slab = square.colliders?.[0];
  const collider = slab
    ? hullCollider(`col_${roundId}`, slab.size.x, slab.offset.y - slab.size.y / 2, slab.offset.y + slab.size.y / 2)
    : hullCollider(`col_${roundId}`, maxR, minY, maxY);

  const { thumbnail: _thumbnail, ...rest } = square;
  const entry = {
    ...rest,
    id: roundId,
    label: square.label.replace("Corner", "Corner Round"),
    path: `/assets/models/${roundId}.gltf`,
    tags: [...new Set([...square.tags, "rounded"])],
    dateAdded: manifest.assets.find(a => a.id === roundId)?.dateAdded ?? new Date().toISOString().slice(0, 10),
    colliders: [collider],
  };
  const at = manifest.assets.findIndex(a => a.id === roundId);
  if (at >= 0) manifest.assets[at] = { ...entry, ...(manifest.assets[at].thumbnail ? { thumbnail: manifest.assets[at].thumbnail } : {}) };
  else manifest.assets.splice(manifest.assets.findIndex(a => a.id === cornerId) + 1, 0, entry);
  console.log(`${roundId}: ${gltf.accessors.filter((_, i) => i % 3 === 2).reduce((n, a) => n + a.count / 3, 0)} tris, collider r=${collider.size.x} y=${collider.points[0].y}..${collider.points.at(-1).y}`);
}
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
