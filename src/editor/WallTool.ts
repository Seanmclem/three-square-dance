import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { Vec2, Vec3, WallDef } from "@/types";

type WallToolState = "IDLE" | "PLACING";

const GRID = 0.5;
let _wallIdCounter = 0;

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function makePreviewMesh(height: number, thickness: number): THREE.Mesh {
  const geo = new THREE.BoxGeometry(1, height, thickness);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x4d8cff,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  return mesh;
}

export class WallTool {
  private _state: WallToolState = "IDLE";
  private _active       = false;
  private _startPoint: Vec2 | null = null;
  private _preview: THREE.Mesh | null = null;
  private _activeZoneId = "demo";
  private _activeLevel  = 0;
  private _height       = 3;
  private _thickness    = 0.2;
  private _material     = "brick_01";
  private _shiftDown    = false;

  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _scene: THREE.Scene,
    private readonly _world: WorldState,
    private readonly _bus:   EventBus,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("tool:select", ({ tool }) => {
        this._active = tool === "wall";
        if (!this._active) this._reset();
      }),
      this._bus.on("floor:select", ({ level }) => { this._activeLevel = level; }),
      this._bus.on("input:click", ({ worldPos, button }) => {
        if (!this._active) return;
        if (button !== 0) { this._reset(); return; }
        this._onLeftClick(worldPos);
      }),
      this._bus.on("input:mousemove", ({ worldPos }) => {
        if (this._active) this._onMouseMove(worldPos);
      }),
      this._bus.on("input:keydown", ({ code }) => {
        if (code === "ShiftLeft" || code === "ShiftRight") this._shiftDown = true;
        if (this._active && code === "Escape") this._reset();
      }),
      this._bus.on("input:keyup", ({ code }) => {
        if (code === "ShiftLeft" || code === "ShiftRight") this._shiftDown = false;
      }),
      this._bus.on("input:mousedown", ({ button }) => {
        if (this._active && button === 2) this._reset();
      }),
    );
  }

  private _calcEnd(worldPos: Vec3): Vec2 {
    let ex = snap(worldPos.x);
    let ez = snap(worldPos.z);
    if (this._shiftDown && this._startPoint) {
      const dx = ex - this._startPoint.x;
      const dz = ez - this._startPoint.z;
      const snappedAngle = Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(dx, dz);
      ex = snap(this._startPoint.x + Math.cos(snappedAngle) * len);
      ez = snap(this._startPoint.z + Math.sin(snappedAngle) * len);
    }
    return { x: ex, z: ez };
  }

  private _onLeftClick(worldPos: Vec3): void {
    if (this._state === "IDLE") {
      this._startPoint = { x: snap(worldPos.x), z: snap(worldPos.z) };
      this._state = "PLACING";
      this._preview = makePreviewMesh(this._height, this._thickness);
      this._scene.add(this._preview);
    } else {
      this._commit(worldPos);
    }
  }

  private _onMouseMove(worldPos: Vec3): void {
    if (this._state !== "PLACING" || !this._preview || !this._startPoint) return;
    const end = this._calcEnd(worldPos);
    const dx = end.x - this._startPoint.x;
    const dz = end.z - this._startPoint.z;
    const length = Math.hypot(dx, dz) || 0.001;
    const angle  = Math.atan2(dz, dx);
    this._preview.scale.set(length, 1, 1);
    this._preview.position.set(
      (this._startPoint.x + end.x) / 2,
      this._height / 2,
      (this._startPoint.z + end.z) / 2,
    );
    this._preview.rotation.y = -angle;
  }

  private _commit(worldPos: Vec3): void {
    const sp = this._startPoint;
    if (!sp) return;
    const ep = this._calcEnd(worldPos);
    if (Math.hypot(ep.x - sp.x, ep.z - sp.z) < GRID) { this._reset(); return; }

    const wall: WallDef = {
      id:               `wall_${++_wallIdCounter}`,
      start:            sp,
      end:              ep,
      floor:            this._activeLevel,
      height:           this._height,
      thickness:        this._thickness,
      material:         this._material,
      exteriorMaterial: this._material,
      openings:         [],
    };

    this._world.addWall(this._activeZoneId, wall);
    this._reset();
  }

  private _reset(): void {
    if (this._preview) {
      this._scene.remove(this._preview);
      (this._preview.geometry as THREE.BufferGeometry).dispose();
      (this._preview.material as THREE.Material).dispose();
      this._preview = null;
    }
    this._startPoint = null;
    this._state = "IDLE";
  }

  setActiveZone(zoneId: string): void { this._activeZoneId = zoneId; }
  update(_dt: number): void {}

  dispose(): void {
    this._reset();
    this._unsubs.forEach(u => u());
  }
}
