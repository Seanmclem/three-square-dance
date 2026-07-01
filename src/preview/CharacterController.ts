import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import type { PlayerSettings } from "@/types";
import type { EventBus } from "@/core/EventBus";
import { CharacterBody } from "./CharacterBody";
import { physicsWorld } from "@/physics/PhysicsWorld";
import { assetManager } from "@/core/AssetManager";

const MIN_DIST = 0.6;   // closest the spring-arm camera may sit to the pivot
const CAM_SKIN = 0.2;   // gap kept in front of an occluding wall
const ZOOM_MIN = 1.5;   // scroll-zoom distance clamp
const ZOOM_MAX = 12;
const INTERACT_RANGE = 2.5;
// Avatar GLBs vary in authored forward axis; this model faces +Z, our math assumes -Z.
const MODEL_FORWARD_OFFSET = Math.PI;
// The avatar is never an interact target — skip its (expensive, skinned) per-frame raycast.
const NO_RAYCAST: THREE.Object3D["raycast"] = () => {};

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
  private _currentAction:  THREE.AnimationAction | null = null;
  private _currentClipObj: THREE.AnimationClip  | null = null;
  private _animPhase: "ground" | "jump" | "airidle" | "land" = "ground";
  private _modelYaw   = 0;                       // smoothed avatar facing (third-person)
  private _desiredDist: number;                  // scroll-zoom target distance

  readonly camera: THREE.PerspectiveCamera;

  private readonly _onMouseMove: (e: MouseEvent) => void;
  private readonly _onKeyDown:   (e: KeyboardEvent) => void;
  private readonly _onKeyUp:     (e: KeyboardEvent) => void;
  private readonly _onWheel:     (e: WheelEvent) => void;

  constructor(
    private readonly _settings: PlayerSettings,
    private readonly _scene: THREE.Scene,
    private readonly _bus: EventBus,
  ) {
    this.camera = new THREE.PerspectiveCamera(
      _settings.fov, window.innerWidth / window.innerHeight, 0.05, 500,
    );

    this._desiredDist = _settings.thirdPersonDistance;
    this._raycaster.far = INTERACT_RANGE;

    this._onMouseMove = (e: MouseEvent) => {
      this._yaw   -= e.movementX * 0.002;
      this._pitch -= e.movementY * 0.002;
      this._pitch  = Math.max(-Math.PI * 80 / 180, Math.min(Math.PI * 80 / 180, this._pitch));
    };
    this._onWheel = (e: WheelEvent) => {
      this._desiredDist = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this._desiredDist + e.deltaY * 0.005));
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
    document.addEventListener("wheel",     this._onWheel, { passive: true });
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

    // Camera — FPS or third-person orbit (yaw/pitch) with spring-arm collision
    if (this._settings.cameraMode === "thirdperson") {
      const pivot   = new THREE.Vector3(pos.x, pos.y + this._settings.thirdPersonHeight, pos.z);
      const forward = new THREE.Vector3(0, 0, -1)
        .applyEuler(new THREE.Euler(this._pitch, this._yaw, 0, "YXZ")); // camera look dir
      const back    = forward.clone().negate();                         // pivot → camera
      let dist = this._desiredDist;
      const hit = physicsWorld.world.castRay(
        new RAPIER.Ray(pivot, back), dist, true,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this._body.collider,
      );
      if (hit) dist = Math.max(MIN_DIST, hit.timeOfImpact - CAM_SKIN); // pull in on walls
      this.camera.position.copy(pivot).addScaledVector(back, dist);
      this.camera.lookAt(pivot);
    } else {
      const eyeY = pos.y + this._body.capsuleHalfHeight + this._body.capsuleRadius - 0.1;
      this.camera.position.set(pos.x, eyeY, pos.z);
      this.camera.rotation.set(this._pitch, this._yaw, 0, "YXZ");
    }

    // Character model — face the movement direction (smoothed), hold facing when idle
    if (this._modelRoot) {
      const feetY = pos.y - (this._body.capsuleHalfHeight + this._body.capsuleRadius);
      this._modelRoot.position.set(pos.x, feetY, pos.z);
      if (isMoving) {
        const targetYaw = Math.atan2(-dir.x, -dir.z);
        let delta = targetYaw - this._modelYaw;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));   // wrap to [-π, π]
        this._modelYaw += delta * Math.min(1, dt * 10);
      }
      this._modelRoot.rotation.y = this._modelYaw + MODEL_FORWARD_OFFSET;
      this._modelRoot.visible = (this._settings.cameraMode === "thirdperson");
      this._mixer?.update(dt);
      this._updateAnim(!this._body.isGrounded, isMoving);
    }

    // Interact ray — cast from camera in look direction, max 2.5m
    const lookDir = new THREE.Vector3(0, 0, -1).applyEuler(this.camera.rotation);
    this._raycaster.set(this.camera.position, lookDir);
    const hits = this._raycaster
      .intersectObjects(this._scene.children, true)
      .filter(h => h.object.userData["interactable"]);
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
    // No avatar asset chosen → show a plain capsule (the dropdown's "capsule only" option),
    // so third-person always has a visible body.
    if (!this._settings.modelAssetId) { this._buildCapsule(); return; }
    try {
      const gltf = await assetManager.loadGLTF(this._settings.modelAssetId) as {
        scene: THREE.Object3D; animations: THREE.AnimationClip[];
      };
      // SkeletonUtils.clone rebinds skinned meshes to the cloned skeleton (plain .clone() breaks it)
      const root = cloneSkinned(gltf.scene);
      root.traverse(c => {
        if ((c as THREE.SkinnedMesh).isSkinnedMesh) c.frustumCulled = false;
        c.raycast = NO_RAYCAST;
      });
      this._modelAnimations = gltf.animations ?? [];
      this._modelRoot = root;
      this._mixer = new THREE.AnimationMixer(root);
      this._scene.add(root);
      this._modelYaw = this._yaw;
      this._play("idle", true);
    } catch (err) {
      console.warn("CharacterController: failed to load model", err);
    }
  }

  private _buildCapsule(): void {
    const r = this._body.capsuleRadius, h = this._body.capsuleHalfHeight;
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(r, h * 2, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x6b8cc4, roughness: 0.7 }),
    );
    mesh.position.y = h + r;                 // lift so the capsule's foot sits at the group origin
    mesh.raycast = NO_RAYCAST;
    const group = new THREE.Group();
    group.add(mesh);
    this._modelRoot = group;
    this._scene.add(group);
    this._modelYaw = this._yaw;
  }

  // Resolve an intent ("idle"/"walk") to an actual clip, case-insensitively, so any
  // model's capitalization ("Idle", "Walk", …) works.
  private _clipFor(intent: string): THREE.AnimationClip | null {
    const lc = intent.toLowerCase();
    return this._modelAnimations.find(c => c.name.toLowerCase() === lc)
        ?? this._modelAnimations.find(c => c.name.toLowerCase().includes(lc))
        ?? null;
  }

  private _has(intent: string): boolean { return this._clipFor(intent) != null; }

  // Crossfade to a clip. `loop` false = one-shot that clamps on its last frame.
  private _play(intent: string, loop: boolean): void {
    if (intent === this._currentClip || !this._mixer) return;
    const clip = this._clipFor(intent);
    if (!clip) return;
    const next = this._mixer.clipAction(clip);
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.fadeIn(0.15).play();
    this._currentAction?.fadeOut(0.15);
    this._currentAction  = next;
    this._currentClipObj = clip;
    this._currentClip    = intent;
  }

  // Has the current one-shot reached its end? (Only meaningful for a clamped LoopOnce.)
  private _animDone(): boolean {
    const a = this._currentAction, c = this._currentClipObj;
    return !!a && !!c && a.time >= c.duration - 0.02;
  }

  // Locomotion state machine: ground (idle/walk) → jump takeoff → air-idle loop → land → ground.
  // Each stage falls back gracefully if the model lacks that clip.
  private _updateAnim(airborne: boolean, isMoving: boolean): void {
    if (!this._mixer) return;
    switch (this._animPhase) {
      case "ground":
        if (airborne) this._enterJump();
        else this._play(isMoving ? "walk" : "idle", true);
        break;
      case "jump":                                        // takeoff one-shot
        if (!airborne) this._enterLand();
        else if (this._animDone() && this._has("jump_idle")) {
          this._play("jump_idle", true);                  // still airborne past takeoff → loop air pose
          this._animPhase = "airidle";
        }
        break;
      case "airidle":
        if (!airborne) this._enterLand();
        break;
      case "land":                                        // landing one-shot
        if (airborne) this._enterJump();                  // jumped again mid-landing
        else if (this._animDone()) {
          this._play(isMoving ? "walk" : "idle", true);
          this._animPhase = "ground";
        }
        break;
    }
  }

  private _enterJump(): void {
    if      (this._has("jump"))      { this._play("jump", false);     this._animPhase = "jump"; }
    else if (this._has("jump_idle")) { this._play("jump_idle", true); this._animPhase = "airidle"; }
    else                             { this._animPhase = "airidle"; }   // no jump clips: keep current
  }

  private _enterLand(): void {
    if (this._has("jump_land")) { this._play("jump_land", false); this._animPhase = "land"; }
    else                        { this._animPhase = "ground"; }         // resolves to walk/idle next frame
  }

  dispose(): void {
    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("keydown",   this._onKeyDown);
    document.removeEventListener("keyup",     this._onKeyUp);
    document.removeEventListener("wheel",     this._onWheel);
    if (this._modelRoot) this._scene.remove(this._modelRoot);
    this._mixer?.stopAllAction();
    if (this._interactTargetId) this._bus.emit("character:interact-range", null);
    this._body.dispose();
    this._keys.clear();
  }
}
