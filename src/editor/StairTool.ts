import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { HistoryManager } from "@/editor/HistoryManager";
import type { IEditorModule, Vec3, StairDef } from "@/types";

type StairState = "IDLE" | "PLACING";

const GRID       = 0.5;
const MIN_HORIZ  = 1.0;
const DEFAULT_W  = 2.5;
const STEP_H     = 0.2;   // must match ColliderBuilder / StairBuilder

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function makeStartDot(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(0.14, 8, 8);
  const mat = new THREE.MeshBasicMaterial({ color: 0x44ffaa, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}

function makePreviewLine(): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0),
  ]);
  const mat = new THREE.LineBasicMaterial({ color: 0x44ffaa, depthTest: false });
  const line = new THREE.Line(geo, mat);
  line.renderOrder = 2;
  return line;
}

export class StairTool implements IEditorModule {
  private _state: StairState = "IDLE";
  private _active  = false;
  private _startPos: Vec3 | null = null;
  private _startDot:   THREE.Mesh | null = null;
  private _previewLine: THREE.Line | null = null;
  private _activeZoneId = "demo";
  private _activeLevel  = 0;
  private _material     = "concrete_01";
  private _hasRailing   = false;

  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _scene:   THREE.Scene,
    private readonly _world:   WorldState,
    private readonly _bus:     EventBus,
    private readonly _history: HistoryManager,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("tool:select",   ({ tool }) => {
        this._active = tool === "stair";
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
      this._bus.on("input:keydown", ({ code }) => {
        if (this._active && code === "Escape") this._reset();
      }),
    );
  }

  update(_dt: number): void {}

  dispose(): void {
    this._reset();
    this._unsubs.forEach(u => u());
  }

  private _getElevationForLevel(level: number): number {
    const zone = this._world.zones.get(this._activeZoneId);
    const floors = zone?.floors.filter(f => f.level === level) ?? [];
    if (floors.length > 0) return Math.max(...floors.map(f => f.elevation));
    return level * 3.0;
  }

  private _onLeftClick(worldPos: Vec3): void {
    const sx = snap(worldPos.x);
    const sz = snap(worldPos.z);

    if (this._state === "IDLE") {
      const sy = this._getElevationForLevel(this._activeLevel);
      this._startPos = { x: sx, y: sy, z: sz };

      this._startDot = makeStartDot();
      this._startDot.position.set(sx, sy + 0.15, sz);
      this._scene.add(this._startDot);

      this._previewLine = makePreviewLine();
      this._previewLine.visible = false;
      this._scene.add(this._previewLine);

      this._state = "PLACING";
      document.body.style.cursor = "crosshair";
    } else {
      this._commit(sx, sz);
    }
  }

  private _onMouseMove(worldPos: Vec3): void {
    if (this._state !== "PLACING" || !this._previewLine || !this._startPos) return;
    this._previewLine.visible = true;
    const ex = snap(worldPos.x);
    const ez = snap(worldPos.z);
    const ey = this._computeEndY(ex, ez);

    const positions = this._previewLine.geometry.attributes["position"] as THREE.BufferAttribute;
    positions.setXYZ(0, this._startPos.x, this._startPos.y, this._startPos.z);
    positions.setXYZ(1, ex, ey, ez);
    positions.needsUpdate = true;
    this._previewLine.geometry.computeBoundingSphere();
  }

  private _computeEndY(ex: number, ez: number): number {
    const horiz = Math.hypot(ex - (this._startPos?.x ?? 0), ez - (this._startPos?.z ?? 0));
    if (horiz < MIN_HORIZ) return (this._startPos?.y ?? 0) + STEP_H;
    const numSteps = Math.max(1, Math.round(horiz / 0.3));
    const upLevel   = this._activeLevel + 1;
    const targetY   = this._getElevationForLevel(upLevel);
    return targetY > (this._startPos?.y ?? 0) ? targetY : (this._startPos?.y ?? 0) + numSteps * STEP_H;
  }

  private _commit(ex: number, ez: number): void {
    if (!this._startPos) { this._reset(); return; }

    const horiz = Math.hypot(ex - this._startPos.x, ez - this._startPos.z);
    if (horiz < MIN_HORIZ) { this._reset(); return; }

    const ey = this._computeEndY(ex, ez);

    const stair: StairDef = {
      id:         `stair_${crypto.randomUUID().slice(0, 8)}`,
      start:      { ...this._startPos },
      end:        { x: ex, y: ey, z: ez },
      width:      DEFAULT_W,
      style:      "straight",
      material:   this._material,
      hasRailing: this._hasRailing,
      riserUvJitter: 0.5,
    };

    this._world.transaction("add stair", () => {
      this._world.addStair(this._activeZoneId, stair);
      this._bus.emit("tool:placed", { type: "stair", id: stair.id, zoneId: this._activeZoneId });
    });
    this._reset();
  }

  private _reset(): void {
    if (this._startDot) {
      this._scene.remove(this._startDot);
      this._startDot.geometry.dispose();
      (this._startDot.material as THREE.Material).dispose();
      this._startDot = null;
    }
    if (this._previewLine) {
      this._scene.remove(this._previewLine);
      this._previewLine.geometry.dispose();
      (this._previewLine.material as THREE.Material).dispose();
      this._previewLine = null;
    }
    this._startPos = null;
    this._state    = "IDLE";
    document.body.style.cursor = "";
  }
}
