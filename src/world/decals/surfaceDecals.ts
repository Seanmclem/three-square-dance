import * as THREE from "three";
import { decalOrientation, decalDepth } from "@/world/decals/DecalBuilder";
import type { DecalDef } from "@/types";

// SURFACE-EFFECT decals (Phase 21): water damage, stains, weathering — sampled inside
// the surface's OWN MeshStandardMaterial via onBeforeCompile, so the base normal map is
// untouched and lighting has zero seam at the decal edge. Fixed unrolled samplers
// (GLSL ES 3.0 forbids dynamically-indexed sampler arrays); a texture atlas is the
// documented escape hatch if MAX_SURFACE_DECALS ever becomes limiting.
//
// The patched material is a CLONE of the base — never mutate the shared AssetManager
// cache instance (one instance serves every mesh using that material id).

export const MAX_SURFACE_DECALS = 4;

export interface SurfaceDecalSlot {
  texture:    THREE.Texture;
  projMatrix: THREE.Matrix4;   // world → normalized projector space (uv = xy + 0.5, z ∈ ±0.5)
  normal:     THREE.Vector3;
  anchor:     THREE.Vector3;
  size:       THREE.Vector2;   // meters
  params:     THREE.Vector4;   // (opacity, triplanar ? 1 : 0, roughnessMod, hasRoughnessMod ? 1 : 0)
}

/** Build a slot from a DecalDef + its loaded albedo texture. */
export function slotFromDecal(def: DecalDef, texture: THREE.Texture): SurfaceDecalSlot {
  const q = new THREE.Quaternion().setFromEuler(decalOrientation(def.normal, def.rotation));
  const anchor = new THREE.Vector3(def.position.x, def.position.y, def.position.z);
  const worldToLocal = new THREE.Matrix4().compose(anchor, q, new THREE.Vector3(1, 1, 1)).invert();
  const projMatrix = new THREE.Matrix4()
    .makeScale(1 / def.size.width, 1 / def.size.height, 1 / decalDepth(def))
    .multiply(worldToLocal);
  return {
    texture,
    projMatrix,
    normal: new THREE.Vector3(def.normal.x, def.normal.y, def.normal.z).normalize(),
    anchor,
    size:   new THREE.Vector2(def.size.width, def.size.height),
    params: new THREE.Vector4(
      def.opacity,
      def.triplanar ? 1 : 0,
      def.roughnessMod ?? 0,
      def.roughnessMod !== undefined ? 1 : 0,
    ),
  };
}

// 1×1 transparent stand-in for unused sampler slots (samplers must always be bound).
let _emptyTex: THREE.DataTexture | null = null;
function emptyTexture(): THREE.Texture {
  if (_emptyTex) return _emptyTex;
  _emptyTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  _emptyTex.needsUpdate = true;
  return _emptyTex;
}

interface SdUniforms {
  uSdCount:  { value: number };
  uSdProj:   { value: THREE.Matrix4[] };
  uSdNormal: { value: THREE.Vector3[] };
  uSdAnchor: { value: THREE.Vector3[] };
  uSdSize:   { value: THREE.Vector2[] };
  uSdParams: { value: THREE.Vector4[] };
  uSdTex0:   { value: THREE.Texture };
  uSdTex1:   { value: THREE.Texture };
  uSdTex2:   { value: THREE.Texture };
  uSdTex3:   { value: THREE.Texture };
  [key: string]: { value: unknown };
}

function buildUniforms(): SdUniforms {
  return {
    uSdCount:  { value: 0 },
    uSdProj:   { value: Array.from({ length: MAX_SURFACE_DECALS }, () => new THREE.Matrix4()) },
    uSdNormal: { value: Array.from({ length: MAX_SURFACE_DECALS }, () => new THREE.Vector3(0, 1, 0)) },
    uSdAnchor: { value: Array.from({ length: MAX_SURFACE_DECALS }, () => new THREE.Vector3()) },
    uSdSize:   { value: Array.from({ length: MAX_SURFACE_DECALS }, () => new THREE.Vector2(1, 1)) },
    uSdParams: { value: Array.from({ length: MAX_SURFACE_DECALS }, () => new THREE.Vector4()) },
    uSdTex0:   { value: emptyTexture() },
    uSdTex1:   { value: emptyTexture() },
    uSdTex2:   { value: emptyTexture() },
    uSdTex3:   { value: emptyTexture() },
  };
}

function writeSlots(u: SdUniforms, slots: SurfaceDecalSlot[]): void {
  u.uSdCount.value = Math.min(slots.length, MAX_SURFACE_DECALS);
  for (let i = 0; i < MAX_SURFACE_DECALS; i++) {
    const s = slots[i];
    if (s) {
      u.uSdProj.value[i]!.copy(s.projMatrix);
      u.uSdNormal.value[i]!.copy(s.normal);
      u.uSdAnchor.value[i]!.copy(s.anchor);
      u.uSdSize.value[i]!.copy(s.size);
      u.uSdParams.value[i]!.copy(s.params);
    } else {
      u.uSdParams.value[i]!.set(0, 0, 0, 0);
    }
  }
  u.uSdTex0.value = slots[0]?.texture ?? emptyTexture();
  u.uSdTex1.value = slots[1]?.texture ?? emptyTexture();
  u.uSdTex2.value = slots[2]?.texture ?? emptyTexture();
  u.uSdTex3.value = slots[3]?.texture ?? emptyTexture();
}

const VERT_DECLS = /* glsl */`
varying vec3 vSdWorldPos;
varying vec3 vSdWorldNormal;
`;

// `transformed`/`objectNormal` always exist by <worldpos_vertex>; meshes here are
// static walls/floors (no instancing, no skinning, no non-uniform scale).
const VERT_BODY = /* glsl */`
vSdWorldPos    = (modelMatrix * vec4(transformed, 1.0)).xyz;
vSdWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
`;

const FRAG_DECLS = /* glsl */`
varying vec3 vSdWorldPos;
varying vec3 vSdWorldNormal;
uniform int   uSdCount;
uniform mat4  uSdProj[${MAX_SURFACE_DECALS}];
uniform vec3  uSdNormal[${MAX_SURFACE_DECALS}];
uniform vec3  uSdAnchor[${MAX_SURFACE_DECALS}];
uniform vec2  uSdSize[${MAX_SURFACE_DECALS}];
uniform vec4  uSdParams[${MAX_SURFACE_DECALS}];
uniform sampler2D uSdTex0;
uniform sampler2D uSdTex1;
uniform sampler2D uSdTex2;
uniform sampler2D uSdTex3;

float sdEdge(vec2 uv) {
  vec2 f = smoothstep(0.0, 0.06, uv) * (1.0 - smoothstep(0.94, 1.0, uv));
  return f.x * f.y;
}

vec4 sdSample(sampler2D tex, int i, vec3 wp, vec3 wn) {
  vec4 c = vec4(0.0);
  if (uSdParams[i].y > 0.5) {
    // Triplanar: three world-axis projections centered on the anchor, weighted |N|^4,
    // radial falloff — ignores the projector direction entirely, so a stain wraps a
    // mitered corner with no seam.
    vec3 d  = wp - uSdAnchor[i];
    vec3 w3 = pow(abs(wn), vec3(4.0));
    w3 /= (w3.x + w3.y + w3.z + 1e-5);
    vec2 uvx = d.zy / uSdSize[i] + 0.5;
    vec2 uvy = d.xz / uSdSize[i] + 0.5;
    vec2 uvz = d.xy / uSdSize[i] + 0.5;
    c = texture2D(tex, uvx) * sdEdge(uvx) * w3.x
      + texture2D(tex, uvy) * sdEdge(uvy) * w3.y
      + texture2D(tex, uvz) * sdEdge(uvz) * w3.z;
    float rad = length(d) / (0.5 * max(uSdSize[i].x, uSdSize[i].y));
    c.a *= 1.0 - smoothstep(0.7, 1.0, rad);
  } else {
    // Planar projection. The normal-dot fade is what stops the projector painting the
    // far side of a thick wall.
    vec3 lp = (uSdProj[i] * vec4(wp, 1.0)).xyz;
    vec2 uv = lp.xy + 0.5;
    float inBox = sdEdge(uv) * step(abs(lp.z), 0.5);
    float nd    = max(dot(wn, uSdNormal[i]), 0.0);
    c = texture2D(tex, uv);
    c.a *= inBox * nd;
  }
  return c;
}
`;

const FRAG_BLEND = /* glsl */`
float sdA0 = 0.0; float sdA1 = 0.0; float sdA2 = 0.0; float sdA3 = 0.0;
{
  vec3 sdWn = normalize(vSdWorldNormal);
  if (uSdCount > 0) { vec4 c = sdSample(uSdTex0, 0, vSdWorldPos, sdWn); sdA0 = c.a * uSdParams[0].x; diffuseColor.rgb = mix(diffuseColor.rgb, c.rgb, sdA0); }
  if (uSdCount > 1) { vec4 c = sdSample(uSdTex1, 1, vSdWorldPos, sdWn); sdA1 = c.a * uSdParams[1].x; diffuseColor.rgb = mix(diffuseColor.rgb, c.rgb, sdA1); }
  if (uSdCount > 2) { vec4 c = sdSample(uSdTex2, 2, vSdWorldPos, sdWn); sdA2 = c.a * uSdParams[2].x; diffuseColor.rgb = mix(diffuseColor.rgb, c.rgb, sdA2); }
  if (uSdCount > 3) { vec4 c = sdSample(uSdTex3, 3, vSdWorldPos, sdWn); sdA3 = c.a * uSdParams[3].x; diffuseColor.rgb = mix(diffuseColor.rgb, c.rgb, sdA3); }
}
`;

// Wet/stain look: pull roughness toward the decal's target where its alpha covers.
// The base normal map is untouched, so lighting continuity is perfect.
const FRAG_ROUGH = /* glsl */`
if (uSdCount > 0 && uSdParams[0].w > 0.5) roughnessFactor = mix(roughnessFactor, uSdParams[0].z, sdA0);
if (uSdCount > 1 && uSdParams[1].w > 0.5) roughnessFactor = mix(roughnessFactor, uSdParams[1].z, sdA1);
if (uSdCount > 2 && uSdParams[2].w > 0.5) roughnessFactor = mix(roughnessFactor, uSdParams[2].z, sdA2);
if (uSdCount > 3 && uSdParams[3].w > 0.5) roughnessFactor = mix(roughnessFactor, uSdParams[3].z, sdA3);
`;

/**
 * Clone `base` and inject surface-decal sampling. The clone shares textures with the
 * base but owns its program hooks; assign it to the mesh with `_ownsMaterial: true` so
 * the existing rebuild/unload disposal owns it. Constant `customProgramCacheKey` means
 * every patched material shares one compiled program per base shader config — moving /
 * resizing / re-slotting a decal is uniform-only (no recompile).
 */
export function makeSurfaceDecalMaterial(
  base:  THREE.MeshStandardMaterial,
  slots: SurfaceDecalSlot[],
): THREE.MeshStandardMaterial {
  const mat = base.clone();
  const uniforms = buildUniforms();
  writeSlots(uniforms, slots);
  mat.userData["_sdUniforms"] = uniforms;
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERT_DECLS + shader.vertexShader
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\n" + VERT_BODY);
    shader.fragmentShader = FRAG_DECLS + shader.fragmentShader
      .replace("#include <map_fragment>", "#include <map_fragment>\n" + FRAG_BLEND)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n" + FRAG_ROUGH);
  };
  mat.customProgramCacheKey = () => "surfdecals";
  return mat;
}

/** Update a patched material's decal slots in place — no recompile. */
export function updateSurfaceDecalUniforms(
  mat:   THREE.MeshStandardMaterial,
  slots: SurfaceDecalSlot[],
): void {
  const uniforms = mat.userData["_sdUniforms"] as SdUniforms | undefined;
  if (uniforms) writeSlots(uniforms, slots);
}
