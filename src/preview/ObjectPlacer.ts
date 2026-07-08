import * as THREE from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { enablePaddedSkinnedCulling } from "./skinnedCulling";
import { assetManager } from "@/core/AssetManager";
import type { EventBus } from "@/core/EventBus";
import type { WorldObject, Vec3 } from "@/types";

/** Default crossfade duration (seconds) when switching animation clips. */
const BLEND_SEC = 0.3;

/**
 * Owns the placed-object domain: builds object meshes (mesh + transform + userData,
 * skeleton-safe clone for skinned/animated GLTFs, fallback box on load failure) and
 * the per-object animation subsystem (AnimationMixer + clip map, auto-play, editor
 * clip preview). ZoneManager parents the returned mesh into the per-zone scene graph
 * and disposes its geometry; everything else about an object lives here.
 *
 * Phase 13 (NPCs/enemies) reuses this same object-mixer subsystem.
 */
export class ObjectPlacer {
  private readonly _mixers   = new Map<string, THREE.AnimationMixer>();
  private readonly _clips    = new Map<string, Map<string, THREE.AnimationClip>>();
  private readonly _autoPlay = new Map<string, string | null>();
  private readonly _finish   = new Map<string, () => void>();
  private readonly _active   = new Map<string, THREE.AnimationAction>();
  private readonly _meshes   = new Map<string, THREE.Object3D>();
  private readonly _despawned = new Set<string>();
  private _previewingId: string | null = null;

  constructor(private readonly _bus: EventBus) {
    // Script-driven actions (Phase 10.9). Object id is already group-resolved by ScriptEngine.
    this._bus.on("object:play-animation", ({ id, clipName, loop, hold, blend }) => this.previewClip(id, clipName, { loop, hold, blend }));
    this._bus.on("object:updated", ({ id, changes }) => {
      if (changes.material) void this._applyMaterial(id, changes.material);
      // move_object (and editor transform edits): apply to the live mesh for any object,
      // not just the selected one. Script edits are runtime-only (data untouched).
      if (changes.position || changes.rotation || changes.scale) this._applyTransformChanges(id, changes);
    });
    // despawn_object: runtime-only hide. Tracked so preview:stop can un-hide (exiting
    // preview doesn't rebuild the zone), matching ZoneManager's non-object despawn.
    this._bus.on("object:despawn", ({ id }) => {
      const mesh = this._meshes.get(id);
      if (mesh) mesh.visible = false;
      this._mixers.get(id)?.stopAllAction();
      this._active.delete(id);
      this._despawned.add(id);
    });
    this._bus.on("preview:stop", () => {
      for (const id of this._despawned) {
        const mesh = this._meshes.get(id);
        if (mesh) mesh.visible = true;
      }
      this._despawned.clear();
    });
  }

  /** Build an object's mesh and wire up its animation mixer. Returns the scene-ready root. */
  async build(obj: WorldObject, zoneId: string): Promise<THREE.Object3D> {
    // Missing-file model (e.g. gitignored / closed-source): skip the wasted 404 fetch.
    if (assetManager.isAssetMissing(obj.assetId)) return this._register(obj.id, this._fallbackBox(obj, zoneId));
    const def  = assetManager.getAssetDef(obj.assetId);
    const path = def?.path ?? `/assets/models/${obj.assetId}.glb`;
    const isGltf = !/\.obj$/i.test(path);
    try {
      let mesh: THREE.Object3D;
      let clips: THREE.AnimationClip[] = [];
      if (isGltf) {
        const gltf = await assetManager.loadGLTF(obj.assetId) as {
          scene: THREE.Object3D;
          animations: THREE.AnimationClip[];
        };
        // SkeletonUtils.clone rebinds skinned meshes to the cloned skeleton; plain
        // .clone() leaves the AnimationMixer driving the shared source skeleton.
        mesh  = cloneSkinned(gltf.scene);
        // Keep skinned meshes cullable (skip them off-screen in render + shadow passes) but with
        // padded bounds so animations don't pop them out. See skinnedCulling.ts.
        enablePaddedSkinnedCulling(mesh);
        clips = gltf.animations ?? [];
        // Lazy back-fill for assets imported before clip discovery existed.
        if (def && def.animations === undefined) def.animations = clips.map(c => c.name);
      } else {
        mesh = await assetManager.loadModel(obj.assetId);
      }
      // Model-local AABB (before the object transform is applied) — feeds the
      // auto-fit default collider and the Colliders panel. _applyTransform
      // overwrites userData, so stash after it runs.
      const box = new THREE.Box3().setFromObject(mesh);
      this._applyTransform(mesh, obj, zoneId);
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        const size   = box.getSize(new THREE.Vector3());
        mesh.userData["localAABB"] = {
          center: { x: center.x, y: center.y, z: center.z },
          size:   { x: size.x,   y: size.y,   z: size.z },
        };
      }
      if (clips.length) this._setupMixer(obj, mesh, clips);
      if (obj.material) void this._applyMaterial(obj.id, obj.material, mesh);
      return this._register(obj.id, mesh);
    } catch (err) {
      console.warn(`ObjectPlacer: failed to load model for asset "${obj.assetId}"`, err);
      return this._register(obj.id, this._fallbackBox(obj, zoneId));
    }
  }

  /** Model-local AABB stashed at build time (null until the mesh has been built). */
  getLocalAABB(objectId: string): { center: Vec3; size: Vec3 } | null {
    const aabb = this._meshes.get(objectId)?.userData["localAABB"];
    return (aabb as { center: Vec3; size: Vec3 } | undefined) ?? null;
  }

  /**
   * Convex hull of the model's geometry in object-local (pre-scale) space —
   * the auto-fit source for "hull" attached colliders (Phase 27). Vertices are
   * stride-subsampled (~1.5k max inputs; skinned meshes read rest pose), reduced
   * via ConvexGeometry, then deduped. Null until the mesh is built, on empty
   * geometry, or when the hull is degenerate (flat/collinear models).
   */
  getLocalHullPoints(objectId: string): Vec3[] | null {
    const root = this._meshes.get(objectId);
    if (!root) return null;
    root.updateWorldMatrix(true, true);
    const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();

    const parts: Array<{ attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute; rel: THREE.Matrix4 }> = [];
    let total = 0;
    root.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const attr = o.geometry?.getAttribute("position");
      if (!attr?.count) return;
      parts.push({ attr, rel: new THREE.Matrix4().copy(rootInv).multiply(o.matrixWorld) });
      total += attr.count;
    });
    if (total === 0) return null;

    const stride = Math.max(1, Math.ceil(total / 1500));
    const samples: THREE.Vector3[] = [];
    for (const { attr, rel } of parts) {
      for (let i = 0; i < attr.count; i += stride) {
        samples.push(new THREE.Vector3().fromBufferAttribute(attr, i).applyMatrix4(rel));
      }
    }

    try {
      const hull = new ConvexGeometry(samples);
      const pos = hull.getAttribute("position");
      const seen = new Set<string>();
      const out: Vec3[] = [];
      for (let i = 0; i < pos.count; i++) {
        const x = +pos.getX(i).toFixed(4), y = +pos.getY(i).toFixed(4), z = +pos.getZ(i).toFixed(4);
        const key = `${x}|${y}|${z}`;
        if (!seen.has(key)) { seen.add(key); out.push({ x, y, z }); }
      }
      hull.dispose();
      return out.length >= 4 ? out : null;
    } catch {
      return null;   // degenerate input (flat / collinear)
    }
  }

  /** Tear down an object's mixer/clip state. Geometry disposal is ZoneManager's job. */
  remove(objectId: string): void {
    if (this._previewingId === objectId) this._previewingId = null;
    const mixer = this._mixers.get(objectId);
    if (mixer) {
      const fin = this._finish.get(objectId);
      if (fin) mixer.removeEventListener("finished", fin);
      mixer.stopAllAction();
    }
    this._mixers.delete(objectId);
    this._clips.delete(objectId);
    this._autoPlay.delete(objectId);
    this._finish.delete(objectId);
    this._active.delete(objectId);
    this._meshes.delete(objectId);
  }

  /**
   * Crossfade the object's active action to `clip`. Tracks the new action in `_active` so the
   * next switch can fade from it. With no prior action (or duration 0) it just starts the clip.
   */
  private _fadeTo(
    objectId: string,
    mixer: THREE.AnimationMixer,
    clip: THREE.AnimationClip,
    opts: { loop: boolean; duration: number },
  ): THREE.AnimationAction {
    const next = mixer.clipAction(clip);
    next.reset();
    next.setLoop(opts.loop ? THREE.LoopRepeat : THREE.LoopOnce, opts.loop ? Infinity : 1);
    next.clampWhenFinished = !opts.loop;
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();

    const prev = this._active.get(objectId);
    if (prev && prev !== next) {
      if (opts.duration > 0) prev.crossFadeTo(next, opts.duration, false);
      else prev.stop();
    }
    this._active.set(objectId, next);
    return next;
  }

  /** Advance every active mixer. Registered on the SceneManager RAF loop. */
  update(dt: number): void {
    for (const mixer of this._mixers.values()) mixer.update(dt);
  }

  /**
   * Play a clip on the object's mesh — no preview mode needed.
   * Default: play once, then revert to the auto-play clip / bind pose.
   * `opts.loop`: repeat forever. `opts.hold`: play once and freeze on the final frame.
   */
  previewClip(objectId: string, clipName: string, opts?: { loop?: boolean; hold?: boolean; blend?: number }): void {
    if (this._previewingId) this.stopPreview(this._previewingId);
    const mixer = this._mixers.get(objectId);
    const clip  = this._clips.get(objectId)?.get(clipName);
    if (!mixer || !clip) {
      console.warn(
        `ObjectPlacer.previewClip: nothing to play for object "${objectId}", clip "${clipName}" — ` +
        `${!mixer ? "no mixer (object has no animation clips)" : "clip name not found"}. ` +
        `Available: [${[...(this._clips.get(objectId)?.keys() ?? [])].join(", ")}]`,
      );
      return;
    }

    const loop = opts?.loop ?? false;
    this._fadeTo(objectId, mixer, clip, { loop, duration: opts?.blend ?? BLEND_SEC });

    // Only the default case plays once then reverts, and counts as the evictable preview.
    // Loop never finishes; hold freezes on the clamped final frame (e.g. a death pose stays
    // down) — neither should be reverted by a later play, so don't mark them as _previewingId.
    if (!loop && !opts?.hold) {
      this._previewingId = objectId;
      const onFinished = () => this.stopPreview(objectId);
      this._finish.set(objectId, onFinished);
      mixer.addEventListener("finished", onFinished);
    }

    this._bus.emit("animation:preview-start", { objectId, clipName });
  }

  /** Stop a preview and fall back to the object's auto-play clip (or bind pose). */
  stopPreview(objectId: string): void {
    const mixer = this._mixers.get(objectId);
    if (!mixer) return;
    const fin = this._finish.get(objectId);
    if (fin) { mixer.removeEventListener("finished", fin); this._finish.delete(objectId); }

    // Crossfade back to the resting clip (or fade out to bind pose if there's none).
    const auto = this._autoPlay.get(objectId);
    const clip = auto ? this._clips.get(objectId)?.get(auto) : undefined;
    if (clip) {
      this._fadeTo(objectId, mixer, clip, { loop: true, duration: BLEND_SEC });
    } else {
      this._active.get(objectId)?.fadeOut(BLEND_SEC);
      this._active.delete(objectId);
    }
    if (this._previewingId === objectId) this._previewingId = null;
    this._bus.emit("animation:preview-stop", { objectId });
  }

  /** Change the looping resting-state clip; takes effect immediately on the mesh. */
  setAutoPlay(objectId: string, clipName: string | null): void {
    this._autoPlay.set(objectId, clipName);
    this._bus.emit("animation:auto-play-changed", { objectId, clipName });
    // Don't disturb an in-flight preview; stopPreview() restores the new auto-play after.
    if (this._previewingId === objectId) return;
    const mixer = this._mixers.get(objectId);
    if (!mixer) return;
    if (clipName) {
      const clip = this._clips.get(objectId)?.get(clipName);
      if (clip) this._fadeTo(objectId, mixer, clip, { loop: true, duration: BLEND_SEC });
    } else {
      this._active.get(objectId)?.fadeOut(BLEND_SEC);
      this._active.delete(objectId);
    }
  }

  // ── internals ───────────────────────────────────────────────────────────────

  private _register(objectId: string, mesh: THREE.Object3D): THREE.Object3D {
    this._meshes.set(objectId, mesh);
    return mesh;
  }

  /** Swap every mesh material on a placed object to a registry material (change_material). */
  private async _applyMaterial(objectId: string, materialId: string, target?: THREE.Object3D): Promise<void> {
    const mesh = target ?? this._meshes.get(objectId);
    if (!mesh) return;
    const mat = await assetManager.getMaterial(materialId);
    mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.material = mat;
        // This mesh's material is now shared/registry-owned, not built per-instance.
        (child.userData as { _ownsMaterial?: boolean })._ownsMaterial = false;
      }
    });
  }

  /** Apply a partial transform change (degrees for rotation) to a placed object's mesh. */
  private _applyTransformChanges(objectId: string, changes: Partial<WorldObject>): void {
    const mesh = this._meshes.get(objectId);
    if (!mesh) return;
    const DEG2RAD = Math.PI / 180;
    if (changes.position) mesh.position.set(changes.position.x, changes.position.y, changes.position.z);
    if (changes.rotation) mesh.rotation.set(changes.rotation.x * DEG2RAD, changes.rotation.y * DEG2RAD, changes.rotation.z * DEG2RAD);
    if (changes.scale)    mesh.scale.set(changes.scale.x, changes.scale.y, changes.scale.z);
  }

  private _applyTransform(mesh: THREE.Object3D, obj: WorldObject, zoneId: string): void {
    mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
    const DEG2RAD = Math.PI / 180;
    mesh.rotation.set(obj.rotation.x * DEG2RAD, obj.rotation.y * DEG2RAD, obj.rotation.z * DEG2RAD);
    mesh.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
    mesh.userData = { editorId: obj.id, editorType: "object", zoneId, selectable: true, floorLevel: obj.floor,
      interactable: obj.properties.interactable, interactLabel: obj.properties.interactLabel ?? "Interact" };
    mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        // _parentId tells SelectionManager._resolveRoot to walk up to the root group,
        // so _selected is the root (world-space transform) not a local-space child mesh.
        child.userData = { ...mesh.userData, _parentId: obj.id };
        child.castShadow    = true;
        child.receiveShadow = true;
      }
    });
  }

  private _setupMixer(obj: WorldObject, mesh: THREE.Object3D, clips: THREE.AnimationClip[]): void {
    const mixer = new THREE.AnimationMixer(mesh);
    const clipMap = new Map<string, THREE.AnimationClip>();
    for (const c of clips) clipMap.set(c.name, c);
    this._mixers.set(obj.id, mixer);
    this._clips.set(obj.id, clipMap);
    this._autoPlay.set(obj.id, obj.autoPlayAnimation ?? null);

    if (obj.autoPlayAnimation && clipMap.has(obj.autoPlayAnimation)) {
      // Hard start (nothing to blend from); record as active so the first switch can crossfade.
      const action = mixer.clipAction(clipMap.get(obj.autoPlayAnimation)!).setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      this._active.set(obj.id, action);
    }
  }

  private _fallbackBox(obj: WorldObject, zoneId: string): THREE.Object3D {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff6600, wireframe: true });
    const box = new THREE.Mesh(geo, mat);
    box.position.set(obj.position.x, obj.position.y, obj.position.z);
    box.userData = { editorId: obj.id, editorType: "object", zoneId, selectable: true, floorLevel: obj.floor,
      _ownsMaterial: true, interactable: obj.properties.interactable, interactLabel: obj.properties.interactLabel ?? "Interact",
      localAABB: { center: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } } };
    return box;
  }
}
