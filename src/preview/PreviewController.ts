import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { SceneManager } from "@/core/SceneManager";
import type { ZoneManager } from "@/world/ZoneManager";
import { CharacterController } from "./CharacterController";
import { TriggerSystem } from "./TriggerSystem";
import { ControlSchemeManager } from "@/input/ControlSchemeManager";
import { loadBindings } from "@/input/bindings";
import { zeroActionState } from "@/input/actions";
import { isGameplayMode, type PreviewMode } from "@/types";

const DEFAULT_SETTINGS = {
  cameraMode:          "fps" as const,
  moveSpeed:           6,
  jumpHeight:          1.2,
  fov:                 75,
  thirdPersonDistance: 4,
  thirdPersonHeight:   2,
  jumpAnimSpeed:       1,
  characterScale:      1,
};

export class PreviewController {
  private _controller:  CharacterController | null = null;
  private _triggers:    TriggerSystem | null = null;
  private _input:       ControlSchemeManager | null = null;
  private _updateFn:    ((dt: number) => void) | null = null;
  private _offScheme:   (() => void) | null = null;
  private _offPause:    Array<() => void> = [];
  private _onCanvasMouseDown: ((e: MouseEvent) => void) | null = null;

  // Phase 28 — occlusion-test mode: the editor camera renders (detached vantage)
  // while the character's camera runs unrendered as the "logic camera".
  private _mode:    PreviewMode | null = null;
  private _subMode: "player" | "camera" = "player";
  private _cullView = false;
  private _frustumHelper: THREE.CameraHelper | null = null;
  private _onOcclusionKeyDown: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    private readonly _bus:   EventBus,
    private readonly _world: WorldState,
    private readonly _scene: SceneManager,
    private readonly _zones: ZoneManager,
  ) {}

  get isActive(): boolean { return this._controller !== null; }
  get input(): ControlSchemeManager | null { return this._input; }
  get mode(): PreviewMode | null { return this._mode; }
  get occlusionState(): { subMode: "player" | "camera"; cullView: boolean } {
    return { subMode: this._subMode, cullView: this._cullView };
  }

  enter(mode: PreviewMode, opts?: { resume?: boolean }): void {
    if (this._controller) return;

    // Occlusion mode needs the editor orbit camera as its vantage — the runtime
    // shell's SceneManager has none, so degrade to a normal game session there.
    if (mode === "occlusion" && !this._scene.editorCamera) {
      console.warn("[PreviewController] occlusion mode needs an editor camera — falling back to game");
      mode = "game";
    }

    const settings = this._world.world?.playerSettings ?? DEFAULT_SETTINGS;

    let spawnPos: THREE.Vector3;
    let facingDeg = 0;
    if (isGameplayMode(mode) && this._world.world?.defaultSpawn) {
      const s = this._world.world.defaultSpawn;
      // s.position is at foot/floor level; body origin is at capsule center (scaled)
      const capsuleBottom = (0.6 + 0.3) * (settings.characterScale ?? 1); // (halfHeight + radius) * scale
      spawnPos = new THREE.Vector3(s.position.x, s.position.y + capsuleBottom, s.position.z);
      facingDeg = s.facingDeg;
    } else if (this._scene.editorCamera) {
      const f = this._scene.editorCamera.focus;
      spawnPos = new THREE.Vector3(f.x, f.y + 1.5, f.z);
    } else {
      // Game-mode SceneManager has no editor camera; a scene without a
      // defaultSpawn lands here — spawn at origin rather than crash.
      console.warn("[PreviewController] no defaultSpawn in scene — spawning at origin");
      spawnPos = new THREE.Vector3(0, 1.5, 0);
    }

    const input = new ControlSchemeManager(this._scene.renderer.domElement, this._bus, loadBindings());
    input.init();

    const controller = new CharacterController(settings, this._scene.scene, this._bus, input);
    controller.init(spawnPos, facingDeg);

    const triggers = new TriggerSystem(this._zones.doorSensorMap, this._bus);
    triggers.setCharacterCollider(controller.body.collider);
    triggers.setVolumeSensors(this._zones.volumeSensorMap);

    this._mode = mode;
    if (mode === "occlusion") {
      // Don't hand the character camera to the renderer — with _previewCamera
      // null, SceneManager keeps rendering the editor camera (the vantage) and
      // keeps running its orbit update. The character camera still updates every
      // frame (incl. spring-arm pull-in) as the unrendered logic camera.
      this._subMode  = "player";
      this._cullView = false;
      if (this._scene.editorCamera) this._scene.editorCamera.enabled = false;   // player sub-mode first
      const helper = new THREE.CameraHelper(controller.camera);
      helper.frustumCulled = false;   // its bounds live in camera-local space — never let it pop
      this._scene.scene.add(helper);
      this._frustumHelper = helper;
    } else {
      this._scene.setPreviewCamera(controller.camera);
    }

    const updateFn = (dt: number) => {
      input.update(dt);        // merge device input BEFORE the controller reads it
      // Camera sub-mode: the character holds still while WASD/mouse drive the
      // editor vantage (KeyboardMouseSource listens on document regardless of
      // pointer lock, so without this WASD would move both at once).
      if (this._mode === "occlusion" && this._subMode === "camera") zeroActionState(input.state);
      controller.update(dt);
      if (this._frustumHelper) {
        // Nothing else refreshes the unrendered logic camera's matrixWorld.
        controller.camera.updateMatrixWorld();
        this._frustumHelper.update();
      }
      triggers.update();
    };
    this._scene.onUpdate(updateFn);
    this._updateFn   = updateFn;
    this._controller = controller;
    this._triggers   = triggers;
    this._input      = input;

    // Pointer lock is a kbm concern — touch has no pointer to lock (the call
    // throws on most mobile browsers) and gamepad doesn't need one.
    const canvas = this._scene.renderer.domElement;
    if (input.activeScheme === "kbm" && this._wantsLock()) canvas.requestPointerLock();
    // Live scheme switches: leaving kbm releases the lock; re-entering kbm
    // can't re-lock from a key press alone (needs a gesture), so the next
    // canvas mousedown re-acquires it.
    this._offScheme = this._bus.on("input:scheme-changed", ({ scheme }) => {
      if (scheme !== "kbm" && document.pointerLockElement) document.exitPointerLock();
    });
    // Pause menu needs a free cursor to click Resume/Exit. Re-lock on close is
    // best-effort (works when closed by a click/keypress = user activation);
    // if it fails, the existing canvas-mousedown handler re-acquires.
    this._offPause.push(
      this._bus.on("pause:show", () => {
        if (document.pointerLockElement) document.exitPointerLock();
      }),
      this._bus.on("pause:closed", () => {
        if (input.activeScheme === "kbm" && this._wantsLock()) canvas.requestPointerLock();
      }),
    );
    this._onCanvasMouseDown = () => {
      if (input.activeScheme === "kbm" && !document.pointerLockElement && this._wantsLock()) canvas.requestPointerLock();
    };
    canvas.addEventListener("mousedown", this._onCanvasMouseDown);

    if (mode === "occlusion") {
      // Capture phase so nothing swallows Tab; added/removed with enter/exit.
      this._onOcclusionKeyDown = (e: KeyboardEvent) => {
        if (e.code === "Tab") {
          e.preventDefault();   // block browser focus navigation
          this._setSubMode(this._subMode === "player" ? "camera" : "player");
        } else if (e.code === "KeyC") {
          const tag = (e.target as HTMLElement).tagName;
          if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") this.setCullView(!this._cullView);
        }
      };
      window.addEventListener("keydown", this._onOcclusionKeyDown, true);
    }

    this._bus.emit("preview:start", { mode, resume: opts?.resume ?? false });
  }

  /** Occlusion camera sub-mode never wants the pointer locked — the mouse orbits the vantage. */
  private _wantsLock(): boolean {
    return this._mode !== "occlusion" || this._subMode === "player";
  }

  private _setSubMode(m: "player" | "camera"): void {
    if (this._subMode === m || this._mode !== "occlusion") return;
    this._subMode = m;
    const editorCamera = this._scene.editorCamera;
    if (m === "player") {
      if (editorCamera) editorCamera.enabled = false;
      // Synchronous inside the Tab keydown = valid user activation for the lock.
      if (this._input?.activeScheme === "kbm") this._scene.renderer.domElement.requestPointerLock();
    } else {
      if (document.pointerLockElement) document.exitPointerLock();
      if (editorCamera) editorCamera.enabled = true;
    }
    this._bus.emit("occlusion:state", this.occlusionState);
  }

  /** Toggle the cull-as-player render pass (occlusion mode only; C key / test hook). */
  setCullView(on: boolean): void {
    if (this._mode !== "occlusion" || this._cullView === on || !this._controller) return;
    this._cullView = on;
    this._scene.setCullOverrideCamera(on ? this._controller.camera : null);
    this._bus.emit("occlusion:state", this.occlusionState);
  }

  exit(): void {
    if (!this._controller) return;

    document.exitPointerLock();

    if (this._updateFn) {
      this._scene.offUpdate(this._updateFn);
      this._updateFn = null;
    }

    this._scene.setCullOverrideCamera(null);
    if (this._frustumHelper) {
      this._scene.scene.remove(this._frustumHelper);
      this._frustumHelper.geometry.dispose();
      (this._frustumHelper.material as THREE.Material).dispose();
      this._frustumHelper = null;
    }
    if (this._onOcclusionKeyDown) {
      window.removeEventListener("keydown", this._onOcclusionKeyDown, true);
      this._onOcclusionKeyDown = null;
    }
    this._mode     = null;
    this._subMode  = "player";
    this._cullView = false;

    // Also restores editorCamera.enabled + aspect — needed by occlusion mode too,
    // even though it never set a preview camera.
    this._scene.setPreviewCamera(null);
    this._controller.dispose();
    this._input?.dispose();
    this._offScheme?.();
    this._offScheme = null;
    this._offPause.forEach(u => u());
    this._offPause = [];
    if (this._onCanvasMouseDown) {
      this._scene.renderer.domElement.removeEventListener("mousedown", this._onCanvasMouseDown);
      this._onCanvasMouseDown = null;
    }
    this._controller = null;
    this._triggers   = null;
    this._input      = null;

    this._bus.emit("preview:stop", {});
  }
}
