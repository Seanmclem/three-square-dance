import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { HistoryManager } from "@/editor/HistoryManager";
import type { Vec3 } from "@/types";

type State = "IDLE" | "PLACING";

const GRID = 0.5;
const DEFAULT_HEIGHT = 2.5;
const AMBER = 0xffaa00;

function snap(v: number): number { return Math.round(v / GRID) * GRID; }

function makeWireframe(w: number, h: number, d: number): THREE.LineSegments {
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
  const mat = new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.75 });
  return new THREE.LineSegments(geo, mat);
}

export class TriggerVolumeTool {
  private _state:         State  = "IDLE";
  private _active         = false;
  private _height         = DEFAULT_HEIGHT;
  private _start:         THREE.Vector3 | null = null;
  private _preview:       THREE.LineSegments | null = null;
  private _activeZoneId   = "demo";
  private _lastWorldPos: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };

  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _scene:   THREE.Scene,
    private readonly _world:   WorldState,
    private readonly _bus:     EventBus,
    private readonly _history: HistoryManager,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("tool:select", ({ tool }) => {
        this._active = tool === "trigger-volume";
        if (!this._active) this._reset();
      }),
      this._bus.on("zone:activated", ({ zoneId }) => { this._activeZoneId = zoneId; }),
      this._bus.on("input:mousedown", ({ button }) => {
        if (!this._active || button !== 0) return;
        if (this._state === "IDLE") this._beginPlace(this._lastWorldPos);
      }),
      this._bus.on("input:mouseup", ({ button }) => {
        if (!this._active || button !== 0) return;
        if (this._state === "PLACING") this._finishPlace(this._lastWorldPos);
      }),
      this._bus.on("input:mousemove", ({ worldPos }) => {
        this._lastWorldPos = worldPos;
        if (this._active && this._state === "PLACING") this._updatePreview(worldPos);
      }),
      this._bus.on("input:wheel", ({ delta }) => {
        if (!this._active || this._state !== "PLACING") return;
        this._height = Math.max(0.5, this._height - delta * 0.005);
        if (this._start && this._preview)
          this._refreshPreviewGeometry(this._preview, 0.1, this._height, 0.1);
      }),
      this._bus.on("input:keydown", ({ code }) => {
        if (this._active && code === "Escape") this._reset();
      }),
    );
  }

  private _beginPlace(worldPos: Vec3): void {
    this._start = new THREE.Vector3(snap(worldPos.x), 0, snap(worldPos.z));
    this._height = DEFAULT_HEIGHT;
    this._state = "PLACING";

    const wire = makeWireframe(0.1, this._height, 0.1);
    wire.position.set(this._start.x, this._height / 2, this._start.z);
    wire.userData = { editorOnly: false, selectable: false };
    this._scene.add(wire);
    this._preview = wire;
  }

  private _updatePreview(worldPos: Vec3): void {
    if (!this._start || !this._preview) return;
    const ex = snap(worldPos.x);
    const ez = snap(worldPos.z);
    const w  = Math.max(GRID, Math.abs(ex - this._start.x));
    const d  = Math.max(GRID, Math.abs(ez - this._start.z));
    const cx = (this._start.x + ex) / 2;
    const cz = (this._start.z + ez) / 2;
    this._preview.position.set(cx, this._height / 2, cz);
    this._refreshPreviewGeometry(this._preview, w, this._height, d);
  }

  private _refreshPreviewGeometry(wire: THREE.LineSegments, w: number, h: number, d: number): void {
    wire.geometry.dispose();
    wire.geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
  }

  private _finishPlace(worldPos: Vec3): void {
    if (!this._start || !this._preview) { this._reset(); return; }
    const ex = snap(worldPos.x);
    const ez = snap(worldPos.z);
    const w  = Math.max(GRID, Math.abs(ex - this._start.x));
    const d  = Math.max(GRID, Math.abs(ez - this._start.z));
    const cx = (this._start.x + ex) / 2;
    const cz = (this._start.z + ez) / 2;

    // Require a minimum size to avoid accidental single-click creates
    if (w < GRID && d < GRID) { this._reset(); return; }

    const vol = {
      id:       `vol_${crypto.randomUUID().slice(0, 8)}`,
      label:    "Trigger Volume",
      position: { x: cx, y: 0, z: cz },
      size:     { x: w, y: this._height, z: d },
      zoneId:   this._activeZoneId,
    };
    this._history.record("place trigger volume", () => {
      this._world.addTriggerVolume(this._activeZoneId, vol);
    });

    this._reset();
  }

  private _reset(): void {
    if (this._preview) {
      this._scene.remove(this._preview);
      this._preview.geometry.dispose();
      (this._preview.material as THREE.Material).dispose();
      this._preview = null;
    }
    this._start  = null;
    this._height = DEFAULT_HEIGHT;
    this._state  = "IDLE";
  }

  dispose(): void {
    this._unsubs.forEach(u => u());
    this._reset();
  }
}
