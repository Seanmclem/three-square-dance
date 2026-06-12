import type RAPIER from "@dimforge/rapier3d-compat";
import type { EventBus } from "@/core/EventBus";
import { physicsWorld } from "@/physics/PhysicsWorld";

export class TriggerSystem {
  private _characterCollider: RAPIER.Collider | null = null;
  private _lastTransition = 0;
  private readonly _cooldown = 2000;

  // trigger volume tracking
  private _volumeSensors = new Map<number, string>(); // colliderHandle → volumeId
  private _insideVolumes = new Set<number>();

  constructor(
    private readonly _doorSensors: ReadonlyMap<number, string>,
    private readonly _bus: EventBus,
  ) {}

  setCharacterCollider(c: RAPIER.Collider): void { this._characterCollider = c; }

  setVolumeSensors(map: Map<number, string>): void {
    this._volumeSensors = map;
    this._insideVolumes.clear();
  }

  update(): void {
    if (!this._characterCollider) return;

    const now = Date.now();

    const nowInside = new Set<number>();

    physicsWorld.world.intersectionPairsWith(this._characterCollider, (other) => {
      // door / zone transition sensors
      const zoneId = this._doorSensors.get(other.handle);
      if (zoneId && now - this._lastTransition >= this._cooldown) {
        this._lastTransition = now;
        this._bus.emit("zone:enter", { zoneId });
      }

      // trigger volume sensors
      if (this._volumeSensors.has(other.handle)) {
        nowInside.add(other.handle);
      }
    });

    // emit enter for newly-inside volumes
    for (const h of nowInside) {
      if (!this._insideVolumes.has(h)) {
        const volumeId = this._volumeSensors.get(h)!;
        this._bus.emit("trigger:volume-enter", { volumeId });
      }
    }
    // emit exit for volumes we left
    for (const h of this._insideVolumes) {
      if (!nowInside.has(h)) {
        const volumeId = this._volumeSensors.get(h)!;
        this._bus.emit("trigger:volume-exit", { volumeId });
      }
    }

    this._insideVolumes = nowInside;
  }
}
