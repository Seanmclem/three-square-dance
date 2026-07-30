import * as THREE from "three";
import type { Vec3, Euler3, Scale3 } from "@/types";

/**
 * Re-origin a GLTF/GLB model file: shift its geometry by `delta` (model space)
 * so the pivot lands where the user wants (e.g. base at the origin).
 *
 * The shift is written as a single wrapper node (`__reorigin`) that parents the
 * scene's root nodes, rather than editing each root's own translation — animation
 * tracks target the original roots, so a translation written onto an animated
 * root would be stomped the moment a clip plays. Re-origining twice accumulates
 * into the existing wrapper instead of nesting.
 */

const REORIGIN_NODE = "__reorigin";

const GLB_MAGIC  = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"

interface GltfNode {
  name?:        string;
  translation?: number[];
  children?:    number[];
}
interface GltfDoc {
  scene?:  number;
  scenes?: { nodes?: number[] }[];
  nodes?:  GltfNode[];
}

function shiftSceneRoots(json: GltfDoc, delta: Vec3): void {
  const scene = json.scenes?.[json.scene ?? 0];
  if (!scene?.nodes?.length || !json.nodes) throw new Error("GLTF has no scene root nodes");
  const first = json.nodes[scene.nodes[0]!];
  if (scene.nodes.length === 1 && first?.name === REORIGIN_NODE) {
    const t = first.translation ?? [0, 0, 0];
    first.translation = [t[0]! + delta.x, t[1]! + delta.y, t[2]! + delta.z];
  } else {
    json.nodes.push({ name: REORIGIN_NODE, translation: [delta.x, delta.y, delta.z], children: [...scene.nodes] });
    scene.nodes = [json.nodes.length - 1];
  }
}

/** Apply the shift to raw model-file bytes. Supports .gltf (JSON) and .glb. */
export function applyGltfReorigin(bytes: ArrayBuffer, fileName: string, delta: Vec3): ArrayBuffer {
  if (/\.glb$/i.test(fileName)) return reoriginGlb(bytes, delta);
  if (/\.gltf$/i.test(fileName)) {
    const json = JSON.parse(new TextDecoder().decode(bytes)) as GltfDoc;
    shiftSceneRoots(json, delta);
    return new TextEncoder().encode(JSON.stringify(json, null, 2)).buffer as ArrayBuffer;
  }
  throw new Error(`unsupported model format: ${fileName}`);
}

function reoriginGlb(bytes: ArrayBuffer, delta: Vec3): ArrayBuffer {
  const dv = new DataView(bytes);
  if (dv.byteLength < 12 || dv.getUint32(0, true) !== GLB_MAGIC) throw new Error("not a GLB file");
  const version = dv.getUint32(4, true);

  // Split into chunks: [len u32][type u32][data len bytes], data 4-byte aligned
  // (per spec chunkLength includes the chunk's own padding).
  const chunks: { type: number; data: Uint8Array }[] = [];
  let off = 12;
  while (off + 8 <= dv.byteLength) {
    const len  = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    chunks.push({ type, data: new Uint8Array(bytes, off + 8, len) });
    off += 8 + len;
  }
  const jsonChunk = chunks.find(c => c.type === CHUNK_JSON);
  if (!jsonChunk) throw new Error("GLB has no JSON chunk");

  const json = JSON.parse(new TextDecoder().decode(jsonChunk.data)) as GltfDoc;
  shiftSceneRoots(json, delta);
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  if (jsonBytes.length % 4) {
    const padded = new Uint8Array(jsonBytes.length + (4 - jsonBytes.length % 4));
    padded.set(jsonBytes);
    padded.fill(0x20, jsonBytes.length); // JSON chunks pad with spaces
    jsonBytes = padded;
  }
  jsonChunk.data = jsonBytes;

  const total = 12 + chunks.reduce((n, c) => n + 8 + c.data.length, 0);
  const out   = new Uint8Array(total);
  const outDv = new DataView(out.buffer);
  outDv.setUint32(0, GLB_MAGIC, true);
  outDv.setUint32(4, version, true);
  outDv.setUint32(8, total, true);
  let w = 12;
  for (const c of chunks) {
    outDv.setUint32(w, c.data.length, true);
    outDv.setUint32(w + 4, c.type, true);
    out.set(c.data, w + 8);
    w += 8 + c.data.length;
  }
  return out.buffer;
}

/**
 * World-space displacement of a placed instance's geometry after the model
 * shifts by `delta`: R · (S · delta), with the entity's XYZ euler (degrees) and
 * scale. Subtract this from the entity position to keep it visually in place.
 */
export function instanceWorldShift(delta: Vec3, rotation: Euler3, scale: Scale3): Vec3 {
  const DEG2RAD = Math.PI / 180;
  const v = new THREE.Vector3(delta.x * scale.x, delta.y * scale.y, delta.z * scale.z)
    .applyEuler(new THREE.Euler(rotation.x * DEG2RAD, rotation.y * DEG2RAD, rotation.z * DEG2RAD));
  return { x: v.x, y: v.y, z: v.z };
}
