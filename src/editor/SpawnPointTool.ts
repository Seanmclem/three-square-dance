import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";

export class SpawnPointTool {
  private _marker:  THREE.Object3D | null = null;
  private _active   = false;
  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _scene: THREE.Scene,
    private readonly _world: WorldState,
    private readonly _bus:   EventBus,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("tool:select", ({ tool }) => {
        this._active = (tool === "spawnpoint");
      }),
      this._bus.on("input:click", ({ worldPos, button }) => {
        if (!this._active || button !== 0) return;
        this._placeMarker(worldPos.x, worldPos.y, worldPos.z);
      }),
      this._bus.on("preview:start", () => {
        if (this._marker) this._marker.visible = false;
      }),
      this._bus.on("preview:stop", () => {
        if (this._marker) this._marker.visible = true;
      }),
      // Restore marker after scene load if a defaultSpawn was saved
      this._bus.on("world:loaded", () => this._restoreFromWorld()),
      this._bus.on("scene:loaded", () => this._restoreFromWorld()),
    );
  }

  private _restoreFromWorld(): void {
    const spawn = this._world.world?.defaultSpawn;
    if (spawn) this._placeMarker(spawn.position.x, spawn.position.y, spawn.position.z, false);
    else this._removeMarker();
  }

  private _placeMarker(x: number, y: number, z: number, persist = true): void {
    this._removeMarker();

    const origin = new THREE.Vector3(x, y, z);
    const dir    = new THREE.Vector3(0, 1, 0);
    const arrow  = new THREE.ArrowHelper(dir, origin, 1.8, 0xffcc44, 0.55, 0.28);
    arrow.userData = { editorOnly: true };
    arrow.traverse(child => { child.userData.editorOnly = true; });
    this._scene.add(arrow);
    this._marker = arrow;

    if (persist) {
      this._world.setDefaultSpawn({ position: { x, y, z }, facingDeg: 0 });
    }
  }

  private _removeMarker(): void {
    if (this._marker) {
      this._scene.remove(this._marker);
      this._marker = null;
    }
  }

  dispose(): void {
    this._unsubs.forEach(u => u());
    this._removeMarker();
  }
}
