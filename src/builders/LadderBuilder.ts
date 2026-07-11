import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { physicsWorld } from "@/physics/PhysicsWorld";
import { assetManager } from "@/core/AssetManager";
import { applyUVOffset } from "@/builders/UVUtils";
import type { LadderDef, MeshUserData } from "@/types";

export interface LadderBuildOutput {
  meshes:    THREE.Mesh[];
  colliders: RAPIER.Collider[];   // solid body collider(s)
  sensors:   RAPIER.Collider[];   // climb-column sensor + top-lip sensor (register handle → ladderId)
}

const RAIL_SIZE  = 0.06;   // square rail cross-section
const RUNG_SIZE  = 0.05;   // square rung cross-section
const SOLID_DEPTH = 0.16;  // solid collider slab depth (z)

// Climb sensor geometry (local frame: foot at origin, +Z = climb side, +Y up).
const SENSOR_SIDE_PAD  = 0.15;  // extra sensor width each side
const SENSOR_DEPTH     = 0.9;   // how far the climb column reaches out from the ladder plane
const SENSOR_BELOW     = 0.1;   // column reaches slightly below the foot
const SENSOR_ABOVE     = 0.5;   // column reaches above the top rung
const TOPZONE_HEIGHT   = 1.3;   // top-lip zone height above the ladder top

/** Defaults/clamps for sparse defs (console-spawned, old saves). */
export function resolveLadderParams(def: LadderDef): {
  height: number; width: number; rungSpacing: number; topDismountOffset: number;
  promptRange: number; autoGrabRange: number;
} {
  const num = (v: number | undefined, dflt: number, min: number, max = Infinity) =>
    Math.min(max, Math.max(min, v ?? dflt));
  const promptRange = num(def.promptRange, 1.8, 0.3);
  return {
    height:            num(def.height,      3,   0.5),
    width:             num(def.width,       0.7, 0.3),
    rungSpacing:       num(def.rungSpacing, 0.35, 0.15),
    topDismountOffset: num(def.topDismountOffset, 0.6, 0.2),
    promptRange,
    // beyond the sensor the mount check never sees the ladder — clamp inside it
    autoGrabRange:     num(def.autoGrabRange, 0.7, 0.1, promptRange),
  };
}

interface Accum { pos: number[]; nrm: number[]; uv: number[]; idx: number[]; vi: number }

// Axis-aligned box in the ladder's local frame: 6 quads, per-face normals,
// UVs scaled by face dimensions so the material tiles in meters.
function pushBox(acc: Accum, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): void {
  const quad = (
    ax: number, ay: number, az: number, bx: number, by: number, bz: number,
    cx2: number, cy2: number, cz2: number, dx: number, dy: number, dz: number,
    nx: number, ny: number, nz: number, u: number, v: number,
  ) => {
    acc.pos.push(ax,ay,az, bx,by,bz, cx2,cy2,cz2, dx,dy,dz);
    acc.nrm.push(nx,ny,nz, nx,ny,nz, nx,ny,nz, nx,ny,nz);
    acc.uv.push(0,0, u,0, u,v, 0,v);
    acc.idx.push(acc.vi, acc.vi+2, acc.vi+1, acc.vi, acc.vi+3, acc.vi+2);
    acc.vi += 4;
  };
  const x0 = cx-hx, x1 = cx+hx, y0 = cy-hy, y1 = cy+hy, z0 = cz-hz, z1 = cz+hz;
  quad(x0,y0,z1, x1,y0,z1, x1,y1,z1, x0,y1,z1,  0,0,1,  hx*2, hy*2);   // +Z
  quad(x1,y0,z0, x0,y0,z0, x0,y1,z0, x1,y1,z0,  0,0,-1, hx*2, hy*2);   // −Z
  quad(x1,y0,z1, x1,y0,z0, x1,y1,z0, x1,y1,z1,  1,0,0,  hz*2, hy*2);   // +X
  quad(x0,y0,z0, x0,y0,z1, x0,y1,z1, x0,y1,z0, -1,0,0,  hz*2, hy*2);   // −X
  quad(x0,y1,z1, x1,y1,z1, x1,y1,z0, x0,y1,z0,  0,1,0,  hx*2, hz*2);   // +Y
  quad(x0,y0,z0, x1,y0,z0, x1,y0,z1, x0,y0,z1,  0,-1,0, hx*2, hz*2);   // −Y
}

export class LadderBuilder {
  static async build(def: LadderDef, zoneId: string): Promise<LadderBuildOutput> {
    const p   = resolveLadderParams(def);
    const ovr = def.materialOverrides;
    const mat = (ovr
      ? await assetManager.getMaterialWithOverrides(def.material, ovr)
      : await assetManager.getMaterial(def.material)) as THREE.Material;

    // ── Geometry (local frame: foot at origin, +Z climb side) ────────────────
    const acc: Accum = { pos: [], nrm: [], uv: [], idx: [], vi: 0 };
    const railX = p.width / 2 - RAIL_SIZE / 2;
    pushBox(acc,  railX, p.height / 2, 0, RAIL_SIZE / 2, p.height / 2, RAIL_SIZE / 2);
    pushBox(acc, -railX, p.height / 2, 0, RAIL_SIZE / 2, p.height / 2, RAIL_SIZE / 2);
    const rungHalf = railX - RAIL_SIZE / 2;   // rungs span between the rails' inner faces
    for (let y = p.rungSpacing; y <= p.height - RUNG_SIZE; y += p.rungSpacing) {
      pushBox(acc, 0, y, 0, rungHalf, RUNG_SIZE / 2, RUNG_SIZE / 2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(acc.pos, 3));
    geo.setAttribute("normal",   new THREE.Float32BufferAttribute(acc.nrm, 3));
    geo.setAttribute("uv",       new THREE.Float32BufferAttribute(acc.uv,  2));
    geo.setIndex(acc.idx);
    geo.computeBoundingSphere();
    applyUVOffset(geo, ovr?.offsetX ?? 0, ovr?.offsetY ?? 0);

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.position.set(def.position.x, def.position.y, def.position.z);
    mesh.rotation.y = THREE.MathUtils.degToRad(def.rotationY);
    mesh.userData = {
      editorId: def.id, editorType: "ladder", zoneId,
      selectable: true, floorLevel: def.floorLevel ?? 0, _ownsMaterial: !!ovr,
    } satisfies MeshUserData;

    // ── Colliders (world frame: rotate local offsets by yaw) ─────────────────
    const yaw = THREE.MathUtils.degToRad(def.rotationY);
    const rotQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    const place = (desc: RAPIER.ColliderDesc, lx: number, ly: number, lz: number): RAPIER.ColliderDesc => {
      const w = new THREE.Vector3(lx, ly, lz).applyQuaternion(rotQ);
      return desc
        .setTranslation(def.position.x + w.x, def.position.y + w.y, def.position.z + w.z)
        .setRotation({ x: rotQ.x, y: rotQ.y, z: rotQ.z, w: rotQ.w });
    };

    const solid = physicsWorld.createStaticCollider(
      place(RAPIER.ColliderDesc.cuboid(p.width / 2, p.height / 2, SOLID_DEPTH / 2), 0, p.height / 2, 0),
    );

    // Climb-column sensor: the mountable face of the ladder.
    const colH = (p.height + SENSOR_BELOW + SENSOR_ABOVE) / 2;
    const column = physicsWorld.createSensorCollider(
      place(
        RAPIER.ColliderDesc.cuboid(p.width / 2 + SENSOR_SIDE_PAD, colH, SENSOR_DEPTH / 2),
        0, colH - SENSOR_BELOW, SOLID_DEPTH / 2 + SENSOR_DEPTH / 2,
      ),
    );
    // Top-lip sensor: standing area on the platform behind the ladder top —
    // the remount-from-above zone (extends −Z, from just below the top edge up).
    // Its depth IS the "Climb down" prompt's range; auto-mount uses the tighter
    // per-ladder autoGrabRange gate in CharacterController.
    const topZone = physicsWorld.createSensorCollider(
      place(
        RAPIER.ColliderDesc.cuboid(p.width / 2 + SENSOR_SIDE_PAD, TOPZONE_HEIGHT / 2, p.promptRange / 2),
        0, p.height + TOPZONE_HEIGHT / 2 - 0.1, -(p.promptRange / 2),
      ),
    );

    // Editor-only climb-side indicator: a green arrow at mid-height on the +Z
    // face, tip pointing into the ladder ("mount from here"). Hidden in
    // preview/game via the shared editorOnly sweep.
    const arrowGeo = new THREE.ConeGeometry(0.11, 0.3, 10);
    arrowGeo.rotateX(-Math.PI / 2);                       // +Y axis → −Z (tip toward the ladder)
    arrowGeo.translate(0, p.height * 0.55, 0.45);
    const arrow = new THREE.Mesh(
      arrowGeo,
      new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.85 }),
    );
    arrow.position.copy(mesh.position);
    arrow.rotation.y = mesh.rotation.y;
    arrow.userData = {
      editorId: def.id, editorType: "ladder", zoneId,
      selectable: false, floorLevel: def.floorLevel ?? 0, _ownsMaterial: true, editorOnly: true,
    } satisfies MeshUserData;

    return { meshes: [mesh, arrow], colliders: [solid], sensors: [column, topZone] };
  }
}
