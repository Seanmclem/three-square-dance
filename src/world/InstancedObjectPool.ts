import * as THREE from "three";
import { assetManager } from "@/core/AssetManager";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "./WorldState";
import type { Vec3, WorldObject } from "@/types";

/**
 * Runtime-only InstancedMesh pooling for placed objects (draw-call collapse).
 *
 * Constructed ONLY by the runtime shell (RuntimeApp) and injected into
 * ObjectPlacer — the editor never builds a pool, so editor behavior is
 * untouched. Eligible objects skip the per-object GLTF clone: ObjectPlacer
 * registers a lightweight proxy Object3D (userData + transform, no children)
 * and this pool renders one InstancedMesh per (assetId, submesh) with the
 * SHARED cached gltf geometry/materials.
 *
 * Eligibility is a static exclusion — no per-instance mutation machinery.
 * Anything a script could despawn/move/re-material (by id OR via a group),
 * plus animated/skinned/transparent assets and objects with per-object state
 * (material override, mover, sound, interactable, autoPlayAnimation), falls
 * back to the normal clone path. Over-exclusion is harmless.
 */

/** Action types whose targetId mutates a placed object at runtime. */
const MUTATING_ACTIONS = new Set([
  "despawn_object", "move_object", "change_material", "play_animation",
  "start_mover", "stop_mover", "toggle_mover", "open_door", "close_door", "spawn_npc",
]);

interface Submesh {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  rel:      THREE.Matrix4;   // gltf-root-relative submesh transform (root TRS stripped)
}

interface AssetInfo {
  submeshes: Submesh[];
  localAABB: { center: Vec3; size: Vec3 } | null;
}

interface ZonePool {
  pending:   Map<string, Array<{ matrix: THREE.Matrix4 }>>;   // assetId → placements, until finalized
  group:     THREE.Group | null;
  meshes:    THREE.InstancedMesh[];
  ids:       Set<string>;
  finalized: boolean;
  excluded:  Set<string> | null;   // script-mutation targetIds (lazy, per zone load)
}

const DEG2RAD = Math.PI / 180;

export class InstancedObjectPool {
  private readonly _zones = new Map<string, ZonePool>();
  private readonly _idToZone = new Map<string, string>();
  // Probe + submesh extraction per assetId; null cached too (ineligible asset).
  private readonly _assets = new Map<string, Promise<AssetInfo | null>>();
  // Resolved infos stashed at tryAdd time so _buildZonePool can read synchronously.
  private readonly _resolved = new Map<string, AssetInfo>();
  private readonly _unsub: () => void;

  constructor(
    private readonly _scene: THREE.Scene,
    bus: EventBus,
    private readonly _world: WorldState,
  ) {
    // loadZone builds objects one at a time, so instance counts are unknown
    // until the zone finishes — finalize exact-count meshes on zone:loaded.
    this._unsub = bus.on("zone:loaded", ({ zoneId }) => this._buildZonePool(zoneId));
  }

  /**
   * Register a placement if the object is eligible; null = caller falls back to
   * the per-object clone path. Declines after the zone pool has been finalized.
   */
  async tryAdd(obj: WorldObject, zoneId: string): Promise<{ localAABB: { center: Vec3; size: Vec3 } | null } | null> {
    if (obj.autoPlayAnimation || obj.material || obj.mover?.enabled || obj.sound || obj.properties.interactable) return null;
    const excluded = this._excludedIds(zoneId);
    if (excluded.has(obj.id) || obj.groupIds?.some(g => excluded.has(g))) return null;

    const def = assetManager.getAssetDef(obj.assetId);
    if (/\.obj$/i.test(def?.path ?? "")) return null;   // OBJ loads via a different branch
    const info = await this._assetInfo(obj.assetId);
    if (!info) return null;
    this._resolved.set(obj.assetId, info);

    const pool = this._zonePool(zoneId);
    if (pool.finalized) return null;

    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(obj.position.x, obj.position.y, obj.position.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(
        obj.rotation.x * DEG2RAD, obj.rotation.y * DEG2RAD, obj.rotation.z * DEG2RAD)),
      new THREE.Vector3(obj.scale.x, obj.scale.y, obj.scale.z),
    );
    let placements = pool.pending.get(obj.assetId);
    if (!placements) { placements = []; pool.pending.set(obj.assetId, placements); }
    placements.push({ matrix });
    pool.ids.add(obj.id);
    this._idToZone.set(obj.id, zoneId);
    return { localAABB: info.localAABB };
  }

  /** Drop one object; the last id out tears down the zone's group + meshes. */
  release(objectId: string): void {
    const zoneId = this._idToZone.get(objectId);
    if (zoneId === undefined) return;
    this._idToZone.delete(objectId);
    const pool = this._zones.get(zoneId);
    if (!pool) return;
    pool.ids.delete(objectId);
    if (pool.ids.size === 0) {
      this._releaseZone(pool);
      this._zones.delete(zoneId);
    }
  }

  dispose(): void {
    this._unsub();
    for (const pool of this._zones.values()) this._releaseZone(pool);
    this._zones.clear();
    this._idToZone.clear();
  }

  // ── internals ───────────────────────────────────────────────────────────────

  private _zonePool(zoneId: string): ZonePool {
    let pool = this._zones.get(zoneId);
    if (!pool) {
      pool = { pending: new Map(), group: null, meshes: [], ids: new Set(), finalized: false, excluded: null };
      this._zones.set(zoneId, pool);
    }
    return pool;
  }

  /**
   * Every id a script action could mutate, from a container-agnostic deep walk
   * of the loaded level data — covers ScriptDefs (world/zone/object/volume),
   * DialogueOption.actions and UiMenuOption.actions without enumerating them.
   * Group ids collected here match via obj.groupIds (same static data
   * ScriptEngine._resolveTargets expands). Disabled scripts count (conservative).
   */
  private _excludedIds(zoneId: string): Set<string> {
    const pool = this._zonePool(zoneId);
    if (pool.excluded) return pool.excluded;
    const out = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) { for (const v of node) walk(v); return; }
      if (!node || typeof node !== "object") return;
      const rec = node as Record<string, unknown>;
      if (typeof rec["type"] === "string" && MUTATING_ACTIONS.has(rec["type"]) && typeof rec["targetId"] === "string") {
        out.add(rec["targetId"]);
      }
      for (const v of Object.values(rec)) walk(v);
    };
    walk(this._world.zones.get(zoneId));
    walk(this._world.world);
    walk(this._world.gameUiElements);
    pool.excluded = out;
    return out;
  }

  private _assetInfo(assetId: string): Promise<AssetInfo | null> {
    let p = this._assets.get(assetId);
    if (!p) { p = this._probeAsset(assetId); this._assets.set(assetId, p); }
    return p;
  }

  private async _probeAsset(assetId: string): Promise<AssetInfo | null> {
    const gltf = await assetManager.loadGLTF(assetId) as {
      scene: THREE.Object3D;
      animations?: THREE.AnimationClip[];
    };
    if (gltf.animations?.length) return null;
    // Lazy back-fill parity with ObjectPlacer.build for assets imported before clip discovery.
    const def = assetManager.getAssetDef(assetId);
    if (def && def.animations === undefined) def.animations = [];

    let skinned = false, transparent = false;
    gltf.scene.traverse(o => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (m) for (const mat of Array.isArray(m) ? m : [m]) if (mat.transparent) transparent = true;
    });
    if (skinned || transparent) return null;

    // Submeshes in gltf-root-relative space. build() overwrites the clone root's
    // TRS with the object transform, so instances compose objMatrix × rel to
    // land exactly where the clone would.
    gltf.scene.updateWorldMatrix(true, true);
    const rootInv = new THREE.Matrix4().copy(gltf.scene.matrixWorld).invert();
    const submeshes: Submesh[] = [];
    gltf.scene.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      if (!o.geometry?.getAttribute("position")?.count) return;
      submeshes.push({
        geometry: o.geometry,
        material: o.material,
        rel: new THREE.Matrix4().copy(rootInv).multiply(o.matrixWorld),
      });
    });
    if (submeshes.length === 0) return null;

    // Same AABB semantics as build()'s pre-transform Box3 stash — feeds the
    // proxy's userData.localAABB so auto-fit colliders match the clone path.
    const box = new THREE.Box3().setFromObject(gltf.scene);
    let localAABB: AssetInfo["localAABB"] = null;
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      const size   = box.getSize(new THREE.Vector3());
      localAABB = {
        center: { x: center.x, y: center.y, z: center.z },
        size:   { x: size.x,   y: size.y,   z: size.z },
      };
    }
    return { submeshes, localAABB };
  }

  /** zone:loaded — build exact-count InstancedMeshes from the accumulated placements. */
  private _buildZonePool(zoneId: string): void {
    const pool = this._zones.get(zoneId);
    if (!pool || pool.finalized) return;
    pool.finalized = true;

    if (pool.pending.size > 0) {
      // Parented at the scene ROOT, not the zone group: unloadZone's dispose
      // traverse would otherwise dispose the SHARED gltf-cached geometry.
      const group = new THREE.Group();
      group.name = `instanced_${zoneId}`;
      const tmp = new THREE.Matrix4();
      for (const [assetId, placements] of pool.pending) {
        // tryAdd stashed the resolved info before accepting any placement.
        const submeshes = this._resolved.get(assetId)?.submeshes;
        if (!submeshes) continue;
        submeshes.forEach((sub, k) => {
          const mesh = new THREE.InstancedMesh(sub.geometry, sub.material, placements.length);
          placements.forEach((p, i) => mesh.setMatrixAt(i, tmp.multiplyMatrices(p.matrix, sub.rel)));
          mesh.instanceMatrix.needsUpdate = true;
          mesh.computeBoundingSphere();
          mesh.castShadow = mesh.receiveShadow = true;
          mesh.name = `pool_${assetId}_${k}`;
          mesh.userData = { selectable: false };
          group.add(mesh);
          pool.meshes.push(mesh);
        });
      }
      this._scene.add(group);
      pool.group = group;

      // Frozen static shadow maps (shadow.autoUpdate === false) rendered before
      // this finalize would miss the pooled meshes — re-render them once.
      this._scene.traverse(o => {
        const shadow = (o as THREE.DirectionalLight).shadow as THREE.LightShadow | undefined;
        if ((o as THREE.Light).isLight && shadow && shadow.autoUpdate === false) shadow.needsUpdate = true;
      });
    }
    pool.pending.clear();
  }

  private _releaseZone(pool: ZonePool): void {
    if (pool.group) this._scene.remove(pool.group);
    // InstancedMesh.dispose frees the instanceMatrix GPU buffer ONLY — the
    // geometry and materials are the shared AssetManager gltf cache and must
    // survive for the next scene load. Never call geometry/material.dispose here.
    for (const m of pool.meshes) m.dispose();
    pool.meshes.length = 0;
    pool.group = null;
    pool.ids.clear();
    pool.pending.clear();
  }
}
