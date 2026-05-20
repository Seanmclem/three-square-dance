import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { Vec3, FloorDef } from "@/types";

type FloorToolState = "IDLE" | "PLACING";

const GRID = 0.5;

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function makePreviewMesh(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
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

export class FloorTool {
  private _state: FloorToolState = "IDLE";
  private _active       = false;
  private _startPoint: THREE.Vector3 | null = null;
  private _preview: THREE.Mesh | null = null;
  private _activeZoneId = "demo";
  private _activeLevel  = 0;
  private _material     = "concrete_01";

  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _scene:  THREE.Scene,
    private readonly _world:  WorldState,
    private readonly _bus:    EventBus,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("tool:select", ({ tool }) => {
        this._active = tool === "floor";
        if (!this._active) this._reset();
      }),
      this._bus.on("floor:select",  ({ level }) => { this._activeLevel = level; }),
      this._bus.on("input:click",   ({ worldPos, button }) => {
        if (!this._active) return;
        if (button !== 0) { this._reset(); return; }
        this._onLeftClick(worldPos);
      }),
      this._bus.on("input:mousemove", ({ worldPos }) => {
        if (this._active) this._onMouseMove(worldPos);
      }),
      this._bus.on("input:keydown",   ({ code }) => {
        if (this._active && code === "Escape") this._reset();
      }),
      this._bus.on("input:mousedown", ({ button }) => {
        if (this._active && button === 2) this._reset();
      }),
    );
  }

  private _onLeftClick(worldPos: Vec3): void {
    if (this._state === "IDLE") {
      this._startPoint = new THREE.Vector3(snap(worldPos.x), 0, snap(worldPos.z));
      this._state = "PLACING";
      this._preview = makePreviewMesh();
      this._scene.add(this._preview);
    } else {
      this._commit(worldPos);
    }
  }

  private _onMouseMove(worldPos: Vec3): void {
    if (this._state !== "PLACING" || !this._preview || !this._startPoint) return;

    const ex = snap(worldPos.x);
    const ez = snap(worldPos.z);
    const sx = this._startPoint.x;
    const sz = this._startPoint.z;

    const w = ex - sx || 0.001;
    const d = ez - sz || 0.001;

    this._preview.scale.set(Math.abs(w), 1, Math.abs(d));
    this._preview.position.set(sx + w / 2, 0.003, sz + d / 2);
  }

  private _commit(worldPos: Vec3): void {
    const sp = this._startPoint;
    if (!sp) return;

    const ex = snap(worldPos.x);
    const ez = snap(worldPos.z);

    const minX = Math.min(sp.x, ex);
    const minZ = Math.min(sp.z, ez);
    const w    = Math.abs(ex - sp.x);
    const d    = Math.abs(ez - sp.z);

    if (w < GRID || d < GRID) { this._reset(); return; }

    const zone = this._world.zones.get(this._activeZoneId);
    const elevation = zone?.floors.find(f => f.level === this._activeLevel)?.elevation ?? 0;

    const floor: FloorDef = {
      level:         this._activeLevel,
      elevation,
      ceilingHeight: null,
      floorMesh: {
        shape:    "rect",
        points:   [
          { x: minX, z: minZ },
          { x: minX + w, z: minZ },
          { x: minX + w, z: minZ + d },
          { x: minX, z: minZ + d },
        ],
        material: this._material,
      },
    };

    this._world.addFloor(this._activeZoneId, floor);
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
  setMaterial(materialId: string): void { this._material = materialId; }

  update(_dt: number): void {}

  dispose(): void {
    this._reset();
    this._unsubs.forEach(u => u());
  }
}

