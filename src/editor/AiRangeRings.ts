import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";

/**
 * Editor-only viewport rings for the Enemy AI screen's SHOW RANGES toggle
 * (Phase 63): color-coded ground circles around the enemy for detect /
 * give-up / attack / leash radii, so the numbers being typed are visible in
 * world scale. Driven by the "ai:range-preview" bus event; cleared on
 * preview start and when the panel toggles off / deselects.
 */

export const RANGE_COLORS = {
  detect: 0x37d67a,   // green  — notices the player
  giveUp: 0xe8c14b,   // yellow — loses the player
  attack: 0xff5d5d,   // red    — bite range
  leash:  0x58a6ff,   // blue   — max distance from post (absent in free roam)
} as const;

const SEGMENTS = 96;
const Y_LIFT   = 0.06;   // above the ground so the lines don't z-fight

export class AiRangeRings {
  private readonly _group = new THREE.Group();
  private _objectId: string | null = null;

  constructor(
    scene: THREE.Scene,
    private readonly _bus: EventBus,
    private readonly _world: WorldState,
  ) {
    this._group.name = "__aiRangeRings";
    scene.add(this._group);
    this._bus.on("ai:range-preview", ({ objectId, ranges }) => {
      this._clear();
      this._objectId = objectId;
      if (objectId && ranges) this._build(objectId, ranges);
    });
    // Editing aid only — never in the playtest view.
    this._bus.on("preview:start", () => { this._clear(); this._objectId = null; });
    // Follow the enemy while it's being moved in the editor.
    this._bus.on("object:updated", ({ id, changes }) => {
      if (id === this._objectId && changes.position) {
        this._group.position.set(changes.position.x, changes.position.y + Y_LIFT, changes.position.z);
      }
    });
  }

  private _build(objectId: string, ranges: { detect: number; giveUp: number; attack: number; leash: number | null }): void {
    const obj = this._findObject(objectId);
    if (!obj) return;
    this._group.position.set(obj.position.x, obj.position.y + Y_LIFT, obj.position.z);
    const entries: Array<[number, number]> = [
      [ranges.attack, RANGE_COLORS.attack],
      [ranges.detect, RANGE_COLORS.detect],
      [ranges.giveUp, RANGE_COLORS.giveUp],
    ];
    if (ranges.leash != null) entries.push([ranges.leash, RANGE_COLORS.leash]);
    for (const [radius, color] of entries) {
      if (!(radius > 0)) continue;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < SEGMENTS; i++) {
        const a = (i / SEGMENTS) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85, depthTest: false });
      const ring = new THREE.LineLoop(geo, mat);
      ring.renderOrder = 999;   // draw over ground meshes (depthTest off)
      this._group.add(ring);
    }
  }

  private _findObject(id: string) {
    for (const zone of this._world.zones.values()) {
      const obj = zone.objects.find(o => o.id === id);
      if (obj) return obj;
    }
    return null;
  }

  private _clear(): void {
    for (const child of [...this._group.children]) {
      this._group.remove(child);
      (child as THREE.LineLoop).geometry.dispose();
      ((child as THREE.LineLoop).material as THREE.Material).dispose();
    }
  }
}
