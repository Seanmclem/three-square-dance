import * as THREE from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { assetManager } from "@/core/AssetManager";
import type { EventBus } from "@/core/EventBus";
import type { WorldObject } from "@/types";

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
  private _previewingId: string | null = null;

  constructor(private readonly _bus: EventBus) {}

  /** Build an object's mesh and wire up its animation mixer. Returns the scene-ready root. */
  async build(obj: WorldObject, zoneId: string): Promise<THREE.Object3D> {
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
        clips = gltf.animations ?? [];
        // Lazy back-fill for assets imported before clip discovery existed.
        if (def && def.animations === undefined) def.animations = clips.map(c => c.name);
      } else {
        mesh = await assetManager.loadModel(obj.assetId);
      }
      this._applyTransform(mesh, obj, zoneId);
      if (clips.length) this._setupMixer(obj, mesh, clips);
      return mesh;
    } catch (err) {
      console.warn(`ObjectPlacer: failed to load model for asset "${obj.assetId}"`, err);
      return this._fallbackBox(obj, zoneId);
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
  }

  /** Advance every active mixer. Registered on the SceneManager RAF loop. */
  update(dt: number): void {
    for (const mixer of this._mixers.values()) mixer.update(dt);
  }

  /** Play a clip once on the object's mesh in the editor — no preview mode needed. */
  previewClip(objectId: string, clipName: string): void {
    if (this._previewingId) this.stopPreview(this._previewingId);
    const mixer = this._mixers.get(objectId);
    const clip  = this._clips.get(objectId)?.get(clipName);
    if (!mixer || !clip) return;

    this._previewingId = objectId;
    mixer.stopAllAction();
    const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).reset().play();
    action.clampWhenFinished = true;

    const onFinished = () => this.stopPreview(objectId);
    this._finish.set(objectId, onFinished);
    mixer.addEventListener("finished", onFinished);

    this._bus.emit("animation:preview-start", { objectId, clipName });
  }

  /** Stop a preview and fall back to the object's auto-play clip (or bind pose). */
  stopPreview(objectId: string): void {
    const mixer = this._mixers.get(objectId);
    if (!mixer) return;
    const fin = this._finish.get(objectId);
    if (fin) { mixer.removeEventListener("finished", fin); this._finish.delete(objectId); }
    mixer.stopAllAction();

    const auto = this._autoPlay.get(objectId);
    if (auto) {
      const clip = this._clips.get(objectId)?.get(auto);
      if (clip) mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
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
    mixer.stopAllAction();
    if (clipName) {
      const clip = this._clips.get(objectId)?.get(clipName);
      if (clip) mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
    }
  }

  // ── internals ───────────────────────────────────────────────────────────────

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
      mixer.clipAction(clipMap.get(obj.autoPlayAnimation)!).setLoop(THREE.LoopRepeat, Infinity).play();
    }
  }

  private _fallbackBox(obj: WorldObject, zoneId: string): THREE.Object3D {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff6600, wireframe: true });
    const box = new THREE.Mesh(geo, mat);
    box.position.set(obj.position.x, obj.position.y, obj.position.z);
    box.userData = { editorId: obj.id, editorType: "object", zoneId, selectable: true, floorLevel: obj.floor,
      _ownsMaterial: true, interactable: obj.properties.interactable, interactLabel: obj.properties.interactLabel ?? "Interact" };
    return box;
  }
}
