import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { SceneManager } from "@/core/SceneManager";
import type { ZoneManager } from "@/world/ZoneManager";
import { CharacterController } from "./CharacterController";
import { TriggerSystem } from "./TriggerSystem";
import { ControlSchemeManager } from "@/input/ControlSchemeManager";
import { DEFAULT_BINDINGS } from "@/input/bindings";

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
  private _onCanvasMouseDown: ((e: MouseEvent) => void) | null = null;

  constructor(
    private readonly _bus:   EventBus,
    private readonly _world: WorldState,
    private readonly _scene: SceneManager,
    private readonly _zones: ZoneManager,
  ) {}

  get isActive(): boolean { return this._controller !== null; }
  get input(): ControlSchemeManager | null { return this._input; }

  enter(mode: "preview" | "game", opts?: { resume?: boolean }): void {
    if (this._controller) return;

    const settings = this._world.world?.playerSettings ?? DEFAULT_SETTINGS;

    let spawnPos: THREE.Vector3;
    let facingDeg = 0;
    if (mode === "game" && this._world.world?.defaultSpawn) {
      const s = this._world.world.defaultSpawn;
      // s.position is at foot/floor level; body origin is at capsule center (scaled)
      const capsuleBottom = (0.6 + 0.3) * (settings.characterScale ?? 1); // (halfHeight + radius) * scale
      spawnPos = new THREE.Vector3(s.position.x, s.position.y + capsuleBottom, s.position.z);
      facingDeg = s.facingDeg;
    } else {
      const f = this._scene.editorCamera.focus;
      spawnPos = new THREE.Vector3(f.x, f.y + 1.5, f.z);
    }

    const input = new ControlSchemeManager(this._scene.renderer.domElement, this._bus, DEFAULT_BINDINGS);
    input.init();

    const controller = new CharacterController(settings, this._scene.scene, this._bus, input);
    controller.init(spawnPos, facingDeg);

    const triggers = new TriggerSystem(this._zones.doorSensorMap, this._bus);
    triggers.setCharacterCollider(controller.body.collider);
    triggers.setVolumeSensors(this._zones.volumeSensorMap);

    this._scene.setPreviewCamera(controller.camera);

    const updateFn = (dt: number) => {
      input.update(dt);        // merge device input BEFORE the controller reads it
      controller.update(dt);
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
    if (input.activeScheme === "kbm") canvas.requestPointerLock();
    // Live scheme switches: leaving kbm releases the lock; re-entering kbm
    // can't re-lock from a key press alone (needs a gesture), so the next
    // canvas mousedown re-acquires it.
    this._offScheme = this._bus.on("input:scheme-changed", ({ scheme }) => {
      if (scheme !== "kbm" && document.pointerLockElement) document.exitPointerLock();
    });
    this._onCanvasMouseDown = () => {
      if (input.activeScheme === "kbm" && !document.pointerLockElement) canvas.requestPointerLock();
    };
    canvas.addEventListener("mousedown", this._onCanvasMouseDown);

    this._bus.emit("preview:start", { mode, resume: opts?.resume ?? false });
  }

  exit(): void {
    if (!this._controller) return;

    document.exitPointerLock();

    if (this._updateFn) {
      this._scene.offUpdate(this._updateFn);
      this._updateFn = null;
    }

    this._scene.setPreviewCamera(null);
    this._controller.dispose();
    this._input?.dispose();
    this._offScheme?.();
    this._offScheme = null;
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
