import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { IEditorModule, Vec3, PlatformDef } from "@/types";

type PlatformState = "IDLE" | "PLACING";

const GRID      = 0.5;
const MIN_SIZE  = 0.5;

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function makePreview(): THREE.Mesh {
  const geo = new THREE.BoxGeometry(1, 0.3, 1);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x44aaff, transparent: true, opacity: 0.35,
    side: THREE.DoubleSide, depthWrite: false, depthTest: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  return mesh;
}

export class PlatformTool implements IEditorModule {
  private _state: PlatformState = "IDLE";
  private _active  = false;
  private _corner1: { x: number; z: number } | null = null;
  private _preview: THREE.Mesh | null = null;
  private _activeZoneId = "demo";
  private _activeLevel  = 0;
  private _thickness    = 0.3;
  private _material     = "concrete_01";

  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _scene: THREE.Scene,
    private readonly _world: WorldState,
    private readonly _bus:   EventBus,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("tool:select",   ({ tool }) => {
        this._active = tool === "platform";
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

  private _getElevation(): number {
    const zone = this._world.zones.get(this._activeZoneId);
    const floorsAtLevel = zone?.floors.filter(f => f.level === this._activeLevel) ?? [];
    const base = floorsAtLevel.length > 0
      ? Math.max(...floorsAtLevel.map(f => f.elevation))
      : Math.max(2.0, this._activeLevel * 3.0);
    return base + 1.5;
  }

  private _onLeftClick(worldPos: Vec3): void {
    const sx = snap(worldPos.x);
    const sz = snap(worldPos.z);

    if (this._state === "IDLE") {
      this._corner1 = { x: sx, z: sz };
      this._state   = "PLACING";
      this._preview = makePreview();
      this._preview.visible = false;
      this._scene.add(this._preview);
      document.body.style.cursor = "crosshair";
    } else {
      this._commit(sx, sz);
    }
  }

  private _onMouseMove(worldPos: Vec3): void {
    if (this._state !== "PLACING" || !this._preview || !this._corner1) return;
    this._preview.visible = true;
    const ex = snap(worldPos.x);
    const ez = snap(worldPos.z);
    this._updatePreview(ex, ez);
  }

  private _updatePreview(ex: number, ez: number): void {
    if (!this._preview || !this._corner1) return;
    const w = Math.abs(ex - this._corner1.x) || MIN_SIZE;
    const d = Math.abs(ez - this._corner1.z) || MIN_SIZE;
    const cx = (this._corner1.x + ex) / 2;
    const cz = (this._corner1.z + ez) / 2;
    const elev = this._getElevation();

    this._preview.scale.set(w, 1, d);
    this._preview.position.set(cx, elev + this._thickness / 2, cz);
  }

  private _commit(ex: number, ez: number): void {
    if (!this._corner1) { this._reset(); return; }

    const w = Math.abs(ex - this._corner1.x);
    const d = Math.abs(ez - this._corner1.z);

    if (w < MIN_SIZE || d < MIN_SIZE) { this._reset(); return; }

    const cx   = (this._corner1.x + ex) / 2;
    const cz   = (this._corner1.z + ez) / 2;
    const elev = this._getElevation();

    const platform: PlatformDef = {
      id:            `plat_${crypto.randomUUID().slice(0, 8)}`,
      position:      { x: cx, y: elev, z: cz },
      size:          { width: w, depth: d },
      thickness:     this._thickness,
      material:      this._material,
      hasRailing:    false,
      railingHeight: 1.0,
      floorLevel:    this._activeLevel,
    };

    this._world.addPlatform(this._activeZoneId, platform);
    this._bus.emit("tool:placed", { type: "platform", id: platform.id, zoneId: this._activeZoneId });
    this._reset();
  }

  private _reset(): void {
    if (this._preview) {
      this._scene.remove(this._preview);
      (this._preview.geometry as THREE.BufferGeometry).dispose();
      (this._preview.material as THREE.Material).dispose();
      this._preview = null;
    }
    this._corner1 = null;
    this._state   = "IDLE";
    document.body.style.cursor = "";
  }
}
