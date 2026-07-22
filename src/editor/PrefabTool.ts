import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { IEditorModule, PrefabDef, Vec3 } from "@/types";
import { defaultVars, expandPrefab, instantiatePrefab, PREFABABLE } from "@/prefab/expand";

type PrefabToolState = "IDLE" | "PLACING";

const GRID = 0.5;
const snap = (v: number): number => Math.round(v / GRID) * GRID;

/**
 * Prefab placement (Phase 44), modeled on ObjectTool: armed by the Prefabs
 * panel via `prefab:selected`, shows a translucent extents-box ghost of the
 * expanded members (v1 — real member meshes are a later polish), snaps to the
 * 0.5m grid, commits with `instantiatePrefab` on click. R rotates 90°, Esc /
 * right-click cancels; the ghost persists for continuous placement.
 */
export class PrefabTool implements IEditorModule {
  private _state: PrefabToolState = "IDLE";
  private _active = false;
  private _prefab: PrefabDef | null = null;
  private _rotationY = 0;
  private _ghost: THREE.Mesh | null = null;
  private _extents: { min: Vec3; max: Vec3 } | null = null;
  private _activeZoneId = "demo";
  private _lastWorldPos:   Vec3 | null = null;
  private _lastSurfacePos: Vec3 | null = null;

  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _scene: THREE.Scene,
    private readonly _world: WorldState,
    private readonly _bus:   EventBus,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("tool:select", ({ tool }) => {
        this._active = tool === "prefab";
        if (!this._active) this._reset();
      }),
      this._bus.on("zone:activated", ({ zoneId }) => { this._activeZoneId = zoneId; }),
      this._bus.on("prefab:selected", ({ prefab }) => {
        if (!this._active) return;
        this._beginPlacing(prefab);
      }),
      this._bus.on("input:mousemove", ({ worldPos, surfacePos }) => {
        this._lastWorldPos   = worldPos;
        this._lastSurfacePos = surfacePos;
        if (this._active && this._state === "PLACING") this._onMouseMove(worldPos, surfacePos);
      }),
      this._bus.on("input:click", ({ worldPos, surfacePos, button }) => {
        if (!this._active) return;
        if (button !== 0) { this._reset(); return; }
        if (this._state === "PLACING") this._commit(worldPos, surfacePos);
      }),
      this._bus.on("input:keydown", ({ code }) => {
        if (!this._active || this._state !== "PLACING") return;
        if (code === "Escape") this._reset();
        if (code === "KeyR") {
          this._rotationY = (this._rotationY + 90) % 360;
          if (this._ghost) this._ghost.rotation.y = this._rotationY * (Math.PI / 180);
        }
      }),
    );
  }

  update(_dt: number): void {}

  dispose(): void {
    this._reset();
    this._unsubs.forEach(u => u());
  }

  private _beginPlacing(prefab: PrefabDef): void {
    this._clearGhost();
    this._prefab = prefab;
    this._rotationY = 0;
    this._extents = memberExtents(prefab);
    const size = {
      x: Math.max(0.5, this._extents.max.x - this._extents.min.x),
      y: Math.max(0.5, this._extents.max.y - this._extents.min.y),
      z: Math.max(0.5, this._extents.max.z - this._extents.min.z),
    };
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    // Ghost pivot = prefab origin: offset the box so it sits where the members will.
    geo.translate(
      (this._extents.min.x + this._extents.max.x) / 2,
      (this._extents.min.y + this._extents.max.y) / 2,
      (this._extents.min.z + this._extents.max.z) / 2,
    );
    const mat = new THREE.MeshStandardMaterial({
      color: 0x44cc88, transparent: true, opacity: 0.35, depthWrite: false,
    });
    this._ghost = new THREE.Mesh(geo, mat);
    this._ghost.renderOrder = 2;
    this._ghost.visible = false;
    this._scene.add(this._ghost);
    this._state = "PLACING";
    document.body.style.cursor = "crosshair";
    if (this._lastWorldPos) this._onMouseMove(this._lastWorldPos, this._lastSurfacePos);
  }

  private _onMouseMove(worldPos: Vec3, surfacePos: Vec3 | null): void {
    const p = surfacePos ?? worldPos;
    if (this._ghost) {
      this._ghost.position.set(snap(p.x), surfacePos ? surfacePos.y : 0, snap(p.z));
      this._ghost.visible = true;
    }
  }

  private _commit(worldPos: Vec3, surfacePos: Vec3 | null): void {
    if (!this._prefab) { this._reset(); return; }
    const p = surfacePos ?? worldPos;
    const origin = {
      position:  { x: snap(p.x), y: surfacePos ? surfacePos.y : 0, z: snap(p.z) },
      rotationY: this._rotationY,
    };
    const { refs } = instantiatePrefab(this._world, this._activeZoneId, this._prefab, origin);
    if (refs.length > 0) {
      this._bus.emit("tool:placed", { type: refs[0].type, id: refs[0].id, zoneId: this._activeZoneId });
    }
    // Ghost stays for continuous placement; Esc stops.
  }

  private _clearGhost(): void {
    if (this._ghost) {
      this._scene.remove(this._ghost);
      this._ghost.geometry.dispose();
      (this._ghost.material as THREE.Material).dispose();
      this._ghost = null;
    }
  }

  private _reset(): void {
    this._clearGhost();
    this._state  = "IDLE";
    this._prefab = null;
    this._rotationY = 0;
    document.body.style.cursor = "";
  }
}

/** Prefab-local AABB of the expanded members' anchor points, padded 1m per side
 *  (tiles are 2×2, so padding a 2m-pitch grid's centers gives exact bounds). */
function memberExtents(prefab: PrefabDef): { min: Vec3; max: Vec3 } {
  const min: Vec3 = { x: Infinity, y: Infinity, z: Infinity };
  const max: Vec3 = { x: -Infinity, y: -Infinity, z: -Infinity };
  const take = (p: Vec3): void => {
    min.x = Math.min(min.x, p.x - 1); max.x = Math.max(max.x, p.x + 1);
    min.y = Math.min(min.y, p.y);     max.y = Math.max(max.y, p.y + 2);
    min.z = Math.min(min.z, p.z - 1); max.z = Math.max(max.z, p.z + 1);
  };
  for (const m of expandPrefab(prefab, defaultVars(prefab))) {
    if (!PREFABABLE.has(m.type)) continue;
    const d = m.def as { position?: Vec3; start?: Vec3; end?: Vec3 };
    if (d.position) take(d.position);
    if (d.start) take(d.start);
    if (d.end) take(d.end);
  }
  if (!Number.isFinite(min.x)) return { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 1, z: 1 } };
  return { min, max };
}
