import * as THREE from "three";
import { ColliderBuilder } from "@/physics/ColliderBuilder";
import { assetManager } from "@/core/AssetManager";
import type { PlatformDef, MeshUserData } from "@/types";
import type RAPIER from "@dimforge/rapier3d-compat";

export interface PlatformBuildOutput {
  meshes:    THREE.Mesh[];
  collider:  RAPIER.Collider;
}

function buildSlabGeo(w: number, h: number, d: number, tileScale: number): THREE.BufferGeometry {
  // Custom box geometry with physically-correct UV tiling (1 unit = 1 tile).
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const ts = tileScale;

  // 6 faces × 4 verts each
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv:  number[] = [];
  const idx: number[] = [];
  let vi = 0;

  function face(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    nx: number, ny: number, nz: number,
    uScl: number, vScl: number,
  ) {
    pos.push(ax, ay, az,  bx, by, bz,  cx, cy, cz,  dx, dy, dz);
    nrm.push(nx, ny, nz,  nx, ny, nz,  nx, ny, nz,  nx, ny, nz);
    uv.push(0, 0,  uScl, 0,  uScl, vScl,  0, vScl);
    idx.push(vi, vi+1, vi+2,  vi, vi+2, vi+3);
    vi += 4;
  }

  // +Y top
  face(-hw, hh, -hd,   hw, hh, -hd,   hw, hh,  hd,  -hw, hh,  hd,   0,1,0,  w*ts, d*ts);
  // -Y bottom
  face(-hw,-hh,  hd,   hw,-hh,  hd,   hw,-hh, -hd,  -hw,-hh, -hd,   0,-1,0, w*ts, d*ts);
  // +Z front
  face(-hw, hh,  hd,   hw, hh,  hd,   hw,-hh,  hd,  -hw,-hh,  hd,   0,0,1,  w*ts, h*ts);
  // -Z back
  face( hw, hh, -hd,  -hw, hh, -hd,  -hw,-hh, -hd,   hw,-hh, -hd,   0,0,-1, w*ts, h*ts);
  // +X right
  face( hw, hh,  hd,   hw, hh, -hd,   hw,-hh, -hd,   hw,-hh,  hd,   1,0,0,  d*ts, h*ts);
  // -X left
  face(-hw, hh, -hd,  -hw, hh,  hd,  -hw,-hh,  hd,  -hw,-hh, -hd,  -1,0,0,  d*ts, h*ts);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal",   new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute("uv",       new THREE.Float32BufferAttribute(uv,  2));
  geo.setAttribute("uv2",      new THREE.Float32BufferAttribute(uv.slice(), 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

export class PlatformBuilder {
  static async build(platform: PlatformDef, zoneId: string): Promise<PlatformBuildOutput> {
    const ovr = platform.materialOverrides;
    const baseDef   = assetManager.getMaterialDef(platform.material);
    const tileScale = ovr?.tileScale ?? baseDef?.tileScale ?? 1.0;

    const mat = ovr
      ? await assetManager.getMaterialWithOverrides(platform.material, ovr)
          .catch(() => assetManager.getDefaultMaterial(0x667788))
      : await assetManager.getMaterial(platform.material)
          .catch(() => assetManager.getDefaultMaterial(0x667788));

    const { position: p, size, thickness } = platform;
    const floorLevel = platform.floorLevel ?? 0;
    const meshes: THREE.Mesh[] = [];

    // ── Slab ─────────────────────────────────────────────────────────────
    const slabGeo  = buildSlabGeo(size.width, thickness, size.depth, tileScale);
    const slab     = new THREE.Mesh(slabGeo, mat);
    slab.position.set(p.x, p.y + thickness / 2, p.z);
    slab.receiveShadow = true;
    slab.castShadow    = true;
    slab.userData = {
      editorId:      platform.id,
      editorType:    "platform",
      zoneId,
      selectable:    true,
      floorLevel,
      _ownsMaterial: !!ovr,
    } satisfies MeshUserData;
    meshes.push(slab);

    // ── Railings ─────────────────────────────────────────────────────────
    if (platform.hasRailing) {
      const rh  = platform.railingHeight;
      const rt  = 0.06;
      const ry  = p.y + thickness + rh / 2;
      const railMat = new THREE.MeshStandardMaterial({
        color: 0x9aabb8, roughness: 0.4, metalness: 0.4,
      });

      const railConfigs = [
        // front / back (along X axis)
        { w: size.width, h: rh, d: rt, dx: 0,               dz: -size.depth / 2 },
        { w: size.width, h: rh, d: rt, dx: 0,               dz:  size.depth / 2 },
        // left / right (along Z axis, inset by rt so corners don't double up)
        { w: rt, h: rh, d: size.depth - rt * 2, dx: -size.width / 2, dz: 0 },
        { w: rt, h: rh, d: size.depth - rt * 2, dx:  size.width / 2, dz: 0 },
      ];

      for (let i = 0; i < railConfigs.length; i++) {
        const cfg  = railConfigs[i]!;
        const geo  = new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d);
        const mesh = new THREE.Mesh(geo, railMat);
        mesh.position.set(p.x + cfg.dx, ry, p.z + cfg.dz);
        mesh.castShadow = true;
        // Only the first railing mesh "owns" railMat (for disposal tracking)
        mesh.userData = {
          editorId:      platform.id,
          editorType:    "platform",
          zoneId,
          selectable:    false,
          floorLevel,
          _ownsMaterial: i === 0,
        } satisfies MeshUserData;
        meshes.push(mesh);
      }
    }

    const collider = ColliderBuilder.registerPlatform(platform);
    return { meshes, collider };
  }
}
