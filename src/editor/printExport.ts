import { zipSync, strToU8 } from "three/addons/libs/fflate.module.js";

/**
 * Export for 3D printing (v4.107.0): brushes / shapes → one welded triangle mesh in the
 * printer's frame, as 3MF (units stated: millimeter) or binary STL. Pure: the caller
 * supplies world-space triangles in the editor's frame (meters, Y up).
 *
 * The editor is Y-up in meters; printers are Z-up and slicers read millimeters. So the
 * mesh is rotated +90° about X ((x, y, z) → (x, −z, y), a proper rotation, so outward
 * winding stays outward), scaled by the chosen mm per meter, centred on X / Y and set
 * on the bed (lowest point at Z = 0).
 */
export interface PrintMesh { positions: Float32Array; indices: Uint32Array }
export interface Size3 { x: number; y: number; z: number }

/** Merge triangle soup into shared corners (closed solids stay closed for slicers). */
export function weld(tris: number[][]): PrintMesh {
  const key = (x: number, y: number, z: number) => `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
  const map = new Map<string, number>();
  const pos: number[] = [], idx: number[] = [];
  for (const t of tris) {
    for (let k = 0; k < 9; k += 3) {
      const id = key(t[k]!, t[k + 1]!, t[k + 2]!);
      let i = map.get(id);
      if (i === undefined) { i = pos.length / 3; pos.push(t[k]!, t[k + 1]!, t[k + 2]!); map.set(id, i); }
      idx.push(i);
    }
    // drop triangles that collapsed onto a line or point
    const n = idx.length;
    if (idx[n - 1] === idx[n - 2] || idx[n - 1] === idx[n - 3] || idx[n - 2] === idx[n - 3]) idx.length = n - 3;
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

/** Size of a mesh in the editor frame (meters), as the printer will see it: x, depth, height. */
export function printSizeMeters(m: PrintMesh): Size3 {
  const b = bounds(toPrinterFrame(m, 1));
  return { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z };
}

/** Editor frame (m, Y up) → printer frame (mm, Z up), centred, on the bed. */
export function toPrinterFrame(m: PrintMesh, mmPerMeter: number): PrintMesh {
  const p = new Float32Array(m.positions.length);
  for (let i = 0; i < p.length; i += 3) {
    p[i] = m.positions[i]! * mmPerMeter;
    p[i + 1] = -m.positions[i + 2]! * mmPerMeter;
    p[i + 2] = m.positions[i + 1]! * mmPerMeter;
  }
  const b = bounds({ positions: p, indices: m.indices });
  const cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2;
  for (let i = 0; i < p.length; i += 3) { p[i] = p[i]! - cx; p[i + 1] = p[i + 1]! - cy; p[i + 2] = p[i + 2]! - b.min.z; }
  return { positions: p, indices: m.indices };
}

export function bounds(m: PrintMesh): { min: Size3; max: Size3 } {
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let i = 0; i < m.positions.length; i += 3) {
    const x = m.positions[i]!, y = m.positions[i + 1]!, z = m.positions[i + 2]!;
    if (x < min.x) min.x = x; if (y < min.y) min.y = y; if (z < min.z) min.z = z;
    if (x > max.x) max.x = x; if (y > max.y) max.y = y; if (z > max.z) max.z = z;
  }
  return { min, max };
}

/** 3MF: a zip with the content types, the root relationship and one mesh object, in mm. */
export function write3MF(m: PrintMesh, name: string): Uint8Array {
  const f = (v: number) => (+v.toFixed(4)).toString();
  const verts: string[] = [], tris: string[] = [];
  for (let i = 0; i < m.positions.length; i += 3) verts.push(`<vertex x="${f(m.positions[i]!)}" y="${f(m.positions[i + 1]!)}" z="${f(m.positions[i + 2]!)}"/>`);
  for (let i = 0; i < m.indices.length; i += 3) tris.push(`<triangle v1="${m.indices[i]}" v2="${m.indices[i + 1]}" v3="${m.indices[i + 2]}"/>`);
  const esc = (s: string) => s.replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">${esc(name)}</metadata>
<metadata name="Application">World Builder</metadata>
<resources><object id="1" name="${esc(name)}" type="model"><mesh><vertices>${verts.join("")}</vertices><triangles>${tris.join("")}</triangles></mesh></object></resources>
<build><item objectid="1"/></build>
</model>`;
  const types = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;
  return zipSync({
    "[Content_Types].xml": strToU8(types),
    "_rels/.rels": strToU8(rels),
    "3D/3dmodel.model": strToU8(model),
  });
}

/** Binary STL (no units in the format; slicers read the numbers as mm). */
export function writeSTL(m: PrintMesh): Uint8Array {
  const n = m.indices.length / 3;
  const buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf);
  const header = "World Builder STL (millimeters)";
  for (let i = 0; i < header.length; i++) dv.setUint8(i, header.charCodeAt(i));
  dv.setUint32(80, n, true);
  const P = m.positions;
  for (let t = 0; t < n; t++) {
    const [a, b, c] = [m.indices[t * 3]! * 3, m.indices[t * 3 + 1]! * 3, m.indices[t * 3 + 2]! * 3];
    const ux = P[b]! - P[a]!, uy = P[b + 1]! - P[a + 1]!, uz = P[b + 2]! - P[a + 2]!;
    const vx = P[c]! - P[a]!, vy = P[c + 1]! - P[a + 1]!, vz = P[c + 2]! - P[a + 2]!;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const o = 84 + t * 50;
    [nx, ny, nz, P[a]!, P[a + 1]!, P[a + 2]!, P[b]!, P[b + 1]!, P[b + 2]!, P[c]!, P[c + 1]!, P[c + 2]!].forEach((v, k) => dv.setFloat32(o + k * 4, v, true));
    dv.setUint16(o + 48, 0, true);
  }
  return new Uint8Array(buf);
}

/** Every edge used exactly twice, in opposite directions (what slicers call manifold). */
export function isWatertight(m: PrintMesh): boolean {
  const count = new Map<string, number>();
  for (let i = 0; i < m.indices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = m.indices[i + k]!, b = m.indices[i + (k + 1) % 3]!;
      const key = `${a},${b}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  }
  for (const [key, n] of count) {
    const [a, b] = key.split(",");
    if (n !== 1 || count.get(`${b},${a}`) !== 1) return false;
  }
  return true;
}
