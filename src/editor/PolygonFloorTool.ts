import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { Vec2, Vec3, FloorDef, WallNode } from "@/types";

type PolyFloorState = "IDLE" | "DRAWING";

const GRID        = 0.5;
const SNAP_RADIUS = 0.6;

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function makeVertexDot(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(0.1, 8, 8);
  const mat = new THREE.MeshBasicMaterial({ color: 0x44aaff, depthTest: false, depthWrite: false, transparent: true, opacity: 0.85 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}

function buildPreviewMesh(pts: Vec2[]): THREE.Mesh {
  if (pts.length < 2) {
    return new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  }
  const pts3 = pts.map(p => new THREE.Vector3(p.x, 0.006, p.z));
  pts3.push(pts3[0]!.clone()); // close loop
  const geo = new THREE.BufferGeometry().setFromPoints(pts3);
  const mat = new THREE.LineBasicMaterial({ color: 0x4d8cff, depthTest: false, transparent: true, opacity: 0.7 });
  return new THREE.Line(geo, mat) as unknown as THREE.Mesh;
}

export class PolygonFloorTool {
  private _state: PolyFloorState = "IDLE";
  private _active          = false;
  private _points: Vec2[]  = [];
  private _dots:   THREE.Mesh[] = [];
  private _previewLine: THREE.Object3D | null = null;
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
        this._active = tool === "poly-floor";
        if (!this._active) this._reset();
      }),
      this._bus.on("floor:select",  ({ level }) => { this._activeLevel = level; }),
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

    if (this._state === "IDLE") {
      this._state = "DRAWING";
    }

    const dot = makeVertexDot();
    dot.position.set(x, 0.12, z);
    this._scene.add(dot);
    this._dots.push(dot);

    this._rebuildPreviewLine();
  }

  private _updatePreview(worldPos: Vec3): void {
    const sx = snap(worldPos.x);
    const sz = snap(worldPos.z);
    const { x, z, isSnapping } = this._snapToFirst(sx, sz);
    document.body.style.cursor = isSnapping ? "pointer" : "crosshair";

    // Rebuild line with cursor pos as the current endpoint
    if (this._previewLine) {
      this._scene.remove(this._previewLine);
      (this._previewLine as THREE.Line).geometry?.dispose();
    }
    const pts = [...this._points, { x, z }];
    this._previewLine = buildPreviewMesh(pts) as unknown as THREE.Object3D;
    this._scene.add(this._previewLine);
  }

  private _rebuildPreviewLine(): void {
    if (this._previewLine) {
      this._scene.remove(this._previewLine);
      (this._previewLine as THREE.Line).geometry?.dispose();
    }
    this._previewLine = buildPreviewMesh(this._points) as unknown as THREE.Object3D;
    this._scene.add(this._previewLine);
  }

  private _commit(): void {
    if (this._points.length < 3) { this._reset(); return; }

    const zone = this._world.zones.get(this._activeZoneId);
    const elevation = zone?.floors.find(f => f.level === this._activeLevel)?.elevation ?? 0;

    const nodes: WallNode[] = this._points.map(p => ({ id: crypto.randomUUID(), x: p.x, z: p.z }));
    for (const node of nodes) this._world.addNode(this._activeZoneId, node);

    const floor: FloorDef = {
      id:            crypto.randomUUID(),
      level:         this._activeLevel,
      elevation,
      ceilingHeight: null,
      floorMesh: {
        shape:   "polygon",
        points:  [...this._points],
        nodeIds: nodes.map(n => n.id),
        material: this._material,
      },
    };

    this._world.addFloor(this._activeZoneId, floor);
    this._bus.emit("tool:placed", { type: "floor", id: floor.id, zoneId: this._activeZoneId });
    this._reset();
  }

  private _reset(): void {
    if (this._previewLine) {
      this._scene.remove(this._previewLine);
      (this._previewLine as THREE.Line).geometry?.dispose();
      this._previewLine = null;
    }
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
