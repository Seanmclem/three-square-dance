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
  private _scratchInside = new Set<number>();          // reused each frame (swapped, not re-allocated)

  // ladder sensor tracking (Phase 34) — deduped by ladderId, since each ladder
  // contributes two sensor colliders (climb column + top-lip zone)
  private _ladderSensors = new Map<number, string>(); // colliderHandle → ladderId
  private _insideLadders = new Set<string>();
  private _scratchLadders = new Set<string>();

  constructor(
    private readonly _doorSensors: ReadonlyMap<number, string>,
    private readonly _bus: EventBus,
  ) {}

  setCharacterCollider(c: RAPIER.Collider): void { this._characterCollider = c; }

  setVolumeSensors(map: Map<number, string>): void {
    this._volumeSensors = map;
    this._insideVolumes.clear();
  }

  setLadderSensors(map: Map<number, string>): void {
    this._ladderSensors = map;
    this._insideLadders.clear();
  }

  update(): void {
    if (!this._characterCollider) return;

    const now = Date.now();

    const nowInside = this._scratchInside;
    nowInside.clear();
    const nowLadders = this._scratchLadders;
    nowLadders.clear();

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

      // ladder sensors (either of the ladder's two boxes counts as "near")
      const ladderId = this._ladderSensors.get(other.handle);
      if (ladderId) nowLadders.add(ladderId);
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

    // ladder enter/exit (same diff pattern, keyed by ladderId)
    for (const id of nowLadders) {
      if (!this._insideLadders.has(id)) this._bus.emit("ladder:zone-enter", { ladderId: id });
    }
    for (const id of this._insideLadders) {
      if (!nowLadders.has(id)) this._bus.emit("ladder:zone-exit", { ladderId: id });
    }

    // swap: next frame reuses the old set as scratch (no per-frame Set allocation)
    this._scratchInside = this._insideVolumes;
    this._insideVolumes = nowInside;
    this._scratchLadders = this._insideLadders;
    this._insideLadders = nowLadders;
  }
}
