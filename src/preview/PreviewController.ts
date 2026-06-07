import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { SceneManager } from "@/core/SceneManager";
import { CharacterController } from "./CharacterController";

const DEFAULT_SETTINGS = {
  cameraMode:          "fps" as const,
  moveSpeed:           6,
  jumpHeight:          1.2,
  fov:                 75,
  thirdPersonDistance: 4,
  thirdPersonHeight:   2,
};

// Minimum ms between successive zone transitions (prevents loop triggers)
const TRANSITION_COOLDOWN = 2000;

export class PreviewController {
  private _controller:      CharacterController | null = null;
  private _updateFn:        ((dt: number) => void) | null = null;
  private _lastTransition   = 0;

  constructor(
    private readonly _bus:   EventBus,
    private readonly _world: WorldState,
    private readonly _scene: SceneManager,
  ) {}

  get isActive(): boolean { return this._controller !== null; }

  enter(mode: "preview" | "game"): void {
    if (this._controller) return;

    const settings = this._world.world?.playerSettings ?? DEFAULT_SETTINGS;

    // Determine spawn: game mode uses worldConfig.defaultSpawn; preview uses editor camera focus
    let spawnPos: THREE.Vector3;
    let facingDeg = 0;
    if (mode === "game" && this._world.world?.defaultSpawn) {
      const s = this._world.world.defaultSpawn;
      spawnPos = new THREE.Vector3(s.position.x, s.position.y, s.position.z);
      facingDeg = s.facingDeg;
    } else {
      const f = this._scene.editorCamera.focus;
      spawnPos = new THREE.Vector3(f.x, f.y + 1.5, f.z);
    }

    const controller = new CharacterController(settings);
    controller.init(spawnPos, facingDeg);

    // Swap renderer to use character camera
    this._scene.setPreviewCamera(controller.camera);

    // Register per-frame update + door proximity check
    const updateFn = (dt: number) => {
      controller.update(dt);
      this._checkDoorProximity(controller);
    };
    this._scene.onUpdate(updateFn);
    this._updateFn  = updateFn;
    this._controller = controller;

    // Request pointer lock
    this._scene.renderer.domElement.requestPointerLock();

    this._bus.emit("preview:start", {});
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
    this._controller = null;

    this._bus.emit("preview:stop", {});
  }

  private _checkDoorProximity(controller: CharacterController): void {
    const now = Date.now();
    if (now - this._lastTransition < TRANSITION_COOLDOWN) return;

    const zoneId = this._world.activeZoneId;
    if (!zoneId) return;
    const zone = this._world.zones.get(zoneId);
    if (!zone) return;

    const charPos = controller.body.position;

    for (const wall of zone.walls) {
      for (const opening of wall.openings) {
        if (!opening.linkedZoneId) continue;
        if (opening.type !== "door" && opening.type !== "arch") continue;

        // Compute door center in world space
        const startNode = zone.nodes.find(n => n.id === wall.startNodeId);
        const endNode   = zone.nodes.find(n => n.id === wall.endNodeId);
        if (!startNode || !endNode) continue;

        const dx  = endNode.x - startNode.x;
        const dz  = endNode.z - startNode.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.001) continue;

        const t     = (opening.offsetAlongWall + opening.width / 2) / len;
        const doorX = startNode.x + dx * t;
        const doorZ = startNode.z + dz * t;
        const doorY = (wall.elevation ?? 0) + opening.elevation + opening.height / 2;

        const horizDist = Math.hypot(charPos.x - doorX, charPos.z - doorZ);
        const vertDiff  = Math.abs(charPos.y - doorY);

        // Trigger if character is within the door frame (horizontal radius + vertical range)
        if (horizDist < opening.width * 0.6 && vertDiff < opening.height * 0.6) {
          this._lastTransition = now;
          this._bus.emit("zone:enter", { zoneId: opening.linkedZoneId });
          return;
        }
      }
    }
  }
}
