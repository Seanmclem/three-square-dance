import type RAPIER from "@dimforge/rapier3d-compat";
import type { EventBus } from "@/core/EventBus";
import { physicsWorld } from "@/physics/PhysicsWorld";

export class TriggerSystem {
  private _characterCollider: RAPIER.Collider | null = null;
  private _lastTransition = 0;
  private readonly _cooldown = 2000;

  constructor(
    private readonly _doorSensors: ReadonlyMap<number, string>,
    private readonly _bus: EventBus,
  ) {}

  setCharacterCollider(c: RAPIER.Collider): void { this._characterCollider = c; }

  update(): void {
    if (!this._characterCollider) return;
    const now = Date.now();
    if (now - this._lastTransition < this._cooldown) return;
    physicsWorld.world.intersectionPairsWith(this._characterCollider, (other) => {
      const zoneId = this._doorSensors.get(other.handle);
      if (zoneId) {
        this._lastTransition = now;
        this._bus.emit("zone:enter", { zoneId });
      }
    });
  }
}
