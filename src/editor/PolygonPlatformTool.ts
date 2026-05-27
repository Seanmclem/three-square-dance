import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { Vec2, Vec3, PlatformDef, WallNode } from "@/types";

type PolyPlatState = "IDLE" | "DRAWING";

const GRID        = 0.5;
const SNAP_RADIUS = 0.6;

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function makeVertexDot(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(0.08, 8, 8);
  const mat = new THREE.MeshBasicMaterial({ color: 0x44aaff, depthTest: false, depthWrite: false, transparent: true, opacity: 0.85 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}

const PREVIEW_Y = 0.006;
const DOT_Y     = 0.12;

function buildPreviewLine(pts: Vec2[]): THREE.Line {
  const pts3 = pts.map(p => new THREE.Vector3(p.x, PREVIEW_Y, p.z));
  if (pts3.length >= 2) pts3.push(pts3[0]!.clone());
  const geo = new THREE.BufferGeometry().setFromPoints(pts3);
  const mat = new THREE.LineBasicMaterial({ color: 0x44aaff, depthTest: false, transparent: true, opacity: 0.7 });
  return new THREE.Line(geo, mat);
}

export class PolygonPlatformTool {
  private _state: PolyPlatState = "IDLE";
  private _active          = false;
  private _points: Vec2[]  = [];
  private _dots:   THREE.Mesh[] = [];
  private _previewLine: THREE.Line | null = null;
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
      this._bus.on("tool:select", ({ tool }) => {
        this._active = tool === "poly-platform";
        if (!this._active) this._reset();
      }),
      this._bus.on("floor:select", ({ level }) => { this._activeLevel = level; }),
      this._bus.on("input:click", ({ worldPos, button }) => {
        if (!this._active) return;
        if (button !== 0) { this._reset(); return; }
        this._onLeftClick(worldPos);
      }),
      this._bus.on("input:dblclick", () => {
        if (this._active && this._state === "DRAWING") this._commit();
      }),
      this._bus.on("input:mousemove", ({ worldPos }) => {
        if (this._active && this._state === "DRAWING") this._updatePreview(worldPos);
      }),
      this._bus.on("input:keydown", ({ code }) => {
        if (!this._active) return;
        if (code === "Escape") { this._reset(); return; }
        if (code === "Enter" && this._state === "DRAWING") this._commit();
      }),
      this._bus.on("input:mousedown", ({ button }) => {
        if (this._active && button === 2) this._reset();
      }),
    );
  }

  private _getElevation(): number {
    const zone = this._world.zones.get(this._activeZoneId);
    const floorsAtLevel = zone?.floors.filter(f => f.level === this._activeLevel) ?? [];
    const base = floorsAtLevel.length > 0
      ? Math.max(...floorsAtLevel.map(f => f.elevation))
      : Math.max(1.0, this._activeLevel * 3.0);
    return base + 1.5;
  }

  private _snapToFirst(x: number, z: number): { x: number; z: number; isSnapping: boolean } {
    if (this._points.length < 3) return { x, z, isSnapping: false };
    const first = this._points[0]!;
    if (Math.hypot(x - first.x, z - first.z) < SNAP_RADIUS)
      return { x: first.x, z: first.z, isSnapping: true };
    return { x, z, isSnapping: false };
  }

  private _onLeftClick(worldPos: Vec3): void {
    const sx = snap(worldPos.x);
    const sz = snap(worldPos.z);
    const { x, z, isSnapping } = this._snapToFirst(sx, sz);

    if (isSnapping && this._points.length >= 3) {
      this._commit();
      return;
    }

    this._points.push({ x, z });
    if (this._state === "IDLE") this._state = "DRAWING";

    const dot = makeVertexDot();
    dot.position.set(x, DOT_Y, z);
    this._scene.add(dot);
    this._dots.push(dot);

    this._rebuildPreviewLine();
  }

  private _updatePreview(worldPos: Vec3): void {
    const sx = snap(worldPos.x);
    const sz = snap(worldPos.z);
    const { x, z, isSnapping } = this._snapToFirst(sx, sz);
    document.body.style.cursor = isSnapping ? "pointer" : "crosshair";

    this._clearPreviewLine();
    this._previewLine = buildPreviewLine([...this._points, { x, z }]);
    this._scene.add(this._previewLine);
  }

  private _rebuildPreviewLine(): void {
    this._clearPreviewLine();
    if (this._points.length < 2) return;
    this._previewLine = buildPreviewLine(this._points);
    this._scene.add(this._previewLine);
  }

  private _clearPreviewLine(): void {
    if (this._previewLine) {
      this._scene.remove(this._previewLine);
      this._previewLine.geometry.dispose();
      this._previewLine = null;
    }
  }

  private _commit(): void {
    if (this._points.length < 3) { this._reset(); return; }

    const xs  = this._points.map(p => p.x);
    const zs  = this._points.map(p => p.z);
    const cx  = this._points.reduce((s, p) => s + p.x, 0) / this._points.length;
    const cz  = this._points.reduce((s, p) => s + p.z, 0) / this._points.length;
    const bboxW = Math.max(...xs) - Math.min(...xs);
    const bboxD = Math.max(...zs) - Math.min(...zs);
    const elev  = this._getElevation();

    const nodes: WallNode[] = this._points.map(p => ({ id: crypto.randomUUID(), x: p.x, z: p.z }));
    for (const node of nodes) this._world.addNode(this._activeZoneId, node);

    const platform: PlatformDef = {
      id:            `plat_${crypto.randomUUID().slice(0, 8)}`,
      position:      { x: cx, y: elev, z: cz },
      size:          { width: Math.max(bboxW, 0.5), depth: Math.max(bboxD, 0.5) },
      thickness:     this._thickness,
      material:      this._material,
      hasRailing:    false,
      railingHeight: 1.0,
      floorLevel:    this._activeLevel,
      points:        [...this._points],
      nodeIds:       nodes.map(n => n.id),
    };

    this._world.addPlatform(this._activeZoneId, platform);
    this._bus.emit("tool:placed", { type: "platform", id: platform.id, zoneId: this._activeZoneId });
    this._reset();
  }

  private _reset(): void {
    this._clearPreviewLine();
    for (const dot of this._dots) {
      this._scene.remove(dot);
      (dot.geometry as THREE.BufferGeometry).dispose();
      (dot.material as THREE.Material).dispose();
    }
    this._dots = [];
    this._points = [];
    this._state = "IDLE";
    document.body.style.cursor = "";
  }

  setActiveZone(zoneId: string): void { this._activeZoneId = zoneId; }
  setMaterial(materialId: string):  void { this._material = materialId; }

  update(_dt: number): void {}

  dispose(): void {
    this._reset();
    this._unsubs.forEach(u => u());
  }
}
