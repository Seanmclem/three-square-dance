import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { Vec3 } from "@/types";

type ZoneToolState = "IDLE" | "PLACING";

const GRID = 0.5;

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function makePreviewMesh(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x7acc88,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  return mesh;
}

export class ZoneTool {
  private _state: ZoneToolState = "IDLE";
  private _active       = false;
  private _startPoint: THREE.Vector3 | null = null;
  private _preview: THREE.Mesh | null = null;

  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _scene: THREE.Scene,
    private readonly _bus:   EventBus,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("tool:select", ({ tool }) => {
        this._active = tool === "zone";
        if (!this._active) this._reset();
      }),
      this._bus.on("input:click", ({ worldPos, button }) => {
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
      this._preview.visible = false;
      this._scene.add(this._preview);
    } else {
      const end = new THREE.Vector3(snap(worldPos.x), 0, snap(worldPos.z));
      const start = this._startPoint!;
      const w = Math.abs(end.x - start.x);
      const d = Math.abs(end.z - start.z);
      if (w < 1 || d < 1) { this._reset(); return; }
      const bounds = {
        x:     Math.min(start.x, end.x),
        z:     Math.min(start.z, end.z),
        width: w,
        depth: d,
      };
      this._reset();
      this._bus.emit("zonetool:awaiting-name", { bounds });
    }
  }

  private _onMouseMove(worldPos: Vec3): void {
    if (this._state !== "PLACING" || !this._startPoint || !this._preview) return;
    const ex = snap(worldPos.x);
    const ez = snap(worldPos.z);
    const cx = (this._startPoint.x + ex) / 2;
    const cz = (this._startPoint.z + ez) / 2;
    const w  = Math.abs(ex - this._startPoint.x);
    const d  = Math.abs(ez - this._startPoint.z);
    if (w < 0.1 || d < 0.1) { this._preview.visible = false; return; }
    this._preview.visible = true;
    this._preview.position.set(cx, 0.01, cz);
    this._preview.scale.set(w, 1, d);
  }

  private _reset(): void {
    if (this._preview) {
      this._scene.remove(this._preview);
      this._preview.geometry.dispose();
      (this._preview.material as THREE.Material).dispose();
      this._preview = null;
    }
    this._startPoint = null;
    this._state = "IDLE";
  }

  dispose(): void {
    this._reset();
    this._unsubs.forEach(u => u());
    this._unsubs.length = 0;
  }
}
