import * as THREE from "three";
import type { PlayerSettings } from "@/types";
import type { EventBus } from "@/core/EventBus";
import { CharacterBody } from "./CharacterBody";
import { assetManager } from "@/core/AssetManager";

export class CharacterController {
  private readonly _body = new CharacterBody();
  private _yaw     = 0;
  private _pitch   = 0;
  private _velY    = 0;
  private readonly _keys = new Set<string>();

  private readonly _raycaster = new THREE.Raycaster();
  private _interactTargetId: string | null = null;

  private _modelRoot: THREE.Object3D | null = null;
  private _mixer:     THREE.AnimationMixer | null = null;
  private _modelAnimations: THREE.AnimationClip[] = [];
  private _currentClip = "";

  readonly camera: THREE.PerspectiveCamera;

  private readonly _onMouseMove: (e: MouseEvent) => void;
  private readonly _onKeyDown:   (e: KeyboardEvent) => void;
  private readonly _onKeyUp:     (e: KeyboardEvent) => void;

  constructor(
    private readonly _settings: PlayerSettings,
    private readonly _scene: THREE.Scene,
    private readonly _bus: EventBus,
  ) {
    this.camera = new THREE.PerspectiveCamera(
      _settings.fov, window.innerWidth / window.innerHeight, 0.05, 500,
    );

    this._onMouseMove = (e: MouseEvent) => {
      this._yaw   -= e.movementX * 0.002;
      this._pitch -= e.movementY * 0.002;
      this._pitch  = Math.max(-Math.PI * 80 / 180, Math.min(Math.PI * 80 / 180, this._pitch));
    };
    this._onKeyDown = (e: KeyboardEvent) => {
      this._keys.add(e.code);
      if (e.code === "KeyE" && this._interactTargetId) {
        this._bus.emit("character:interact", { objectId: this._interactTargetId });
      }
    };
    this._onKeyUp = (e: KeyboardEvent) => this._keys.delete(e.code);
  }

  init(spawnPos: THREE.Vector3, facingDeg: number): void {
    this._yaw = THREE.MathUtils.degToRad(facingDeg);
    this._body.init(spawnPos);
    document.addEventListener("mousemove", this._onMouseMove);
    document.addEventListener("keydown",   this._onKeyDown);
    document.addEventListener("keyup",     this._onKeyUp);
    void this._loadModel();
  }

  update(dt: number): void {
    const speed = this._settings.moveSpeed;
    const dir   = new THREE.Vector3();

    if (this._keys.has("KeyW") || this._keys.has("ArrowUp"))    dir.z -= 1;
    if (this._keys.has("KeyS") || this._keys.has("ArrowDown"))  dir.z += 1;
    if (this._keys.has("KeyA") || this._keys.has("ArrowLeft"))  dir.x -= 1;
    if (this._keys.has("KeyD") || this._keys.has("ArrowRight")) dir.x += 1;
    const isMoving = dir.lengthSq() > 0;
    if (isMoving) dir.normalize().multiplyScalar(speed * dt);
    dir.applyEuler(new THREE.Euler(0, this._yaw, 0, "YXZ"));

    if (this._body.isGrounded) {
      this._velY = this._keys.has("Space")
        ? Math.sqrt(2 * 9.81 * this._settings.jumpHeight)
        : 0;
    } else {
      this._velY -= 20 * dt;
    }
    dir.y = this._velY * dt;

    this._body.move(dir);
    const pos = this._body.position;

    // Camera — FPS or third-person
    if (this._settings.cameraMode === "thirdperson") {
      const camX = pos.x - Math.sin(this._yaw) * this._settings.thirdPersonDistance;
      const camZ = pos.z - Math.cos(this._yaw) * this._settings.thirdPersonDistance;
      this.camera.position.set(camX, pos.y + this._settings.thirdPersonHeight, camZ);
      this.camera.lookAt(pos.x, pos.y + this._body.capsuleHalfHeight, pos.z);
    } else {
      const eyeY = pos.y + this._body.capsuleHalfHeight + this._body.capsuleRadius - 0.1;
      this.camera.position.set(pos.x, eyeY, pos.z);
      this.camera.rotation.set(this._pitch, this._yaw, 0, "YXZ");
    }

    // Character model
    if (this._modelRoot) {
      const feetY = pos.y - (this._body.capsuleHalfHeight + this._body.capsuleRadius);
      this._modelRoot.position.set(pos.x, feetY, pos.z);
      this._modelRoot.rotation.y = this._yaw;
      this._modelRoot.visible = (this._settings.cameraMode === "thirdperson");
      this._mixer?.update(dt);
      this._playClip(isMoving ? "walk" : "idle");
    }

    // Interact ray — cast from camera in look direction, max 2.5m
    const lookDir = new THREE.Vector3(0, 0, -1).applyEuler(this.camera.rotation);
    this._raycaster.set(this.camera.position, lookDir);
    const hits = this._raycaster
      .intersectObjects(this._scene.children, true)
      .filter(h => h.distance < 2.5 && h.object.userData["interactable"]);
    const hit = hits[0] ?? null;
    const newId = (hit?.object.userData["editorId"] as string | undefined) ?? null;
    if (newId !== this._interactTargetId) {
      this._interactTargetId = newId;
      this._bus.emit(
        "character:interact-range",
        newId
          ? { objectId: newId, label: (hit!.object.userData["interactLabel"] as string | undefined) ?? "Interact" }
          : null,
      );
    }
  }

  get body(): CharacterBody { return this._body; }

  private async _loadModel(): Promise<void> {
    if (!this._settings.modelAssetId) return;
    try {
      const root = await assetManager.loadModel(this._settings.modelAssetId);
      this._modelAnimations = ((root as unknown as { animations?: THREE.AnimationClip[] }).animations) ?? [];
      this._modelRoot = root;
      this._mixer = new THREE.AnimationMixer(root);
      this._scene.add(root);
      this._playClip("idle");
    } catch (err) {
      console.warn("CharacterController: failed to load model", err);
    }
  }

  private _playClip(name: string): void {
    if (name === this._currentClip || !this._mixer) return;
    const clip = THREE.AnimationClip.findByName(this._modelAnimations, name);
    if (!clip) return;
    if (this._currentClip) {
      const prev = THREE.AnimationClip.findByName(this._modelAnimations, this._currentClip);
      if (prev) this._mixer.clipAction(prev).fadeOut(0.15);
    }
    this._mixer.clipAction(clip).reset().fadeIn(0.15).play();
    this._currentClip = name;
  }

  dispose(): void {
    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("keydown",   this._onKeyDown);
    document.removeEventListener("keyup",     this._onKeyUp);
    if (this._modelRoot) this._scene.remove(this._modelRoot);
    this._mixer?.stopAllAction();
    if (this._interactTargetId) this._bus.emit("character:interact-range", null);
    this._body.dispose();
    this._keys.clear();
  }
}
