import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { HistoryManager } from "@/editor/HistoryManager";
import type { Vec2, Vec3, WallDef, WallNode } from "@/types";


type WallToolState = "IDLE" | "DRAWING";

const GRID        = 0.5;
const SNAP_RADIUS = 0.5;

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

function makeNodeDot(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(0.12, 8, 8);
  const mat = new THREE.MeshBasicMaterial({
    color:       0x4d8cff,
    depthTest:   false,
    depthWrite:  false,
    transparent: true,
    opacity:     0.7,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}

export class WallTool {
  private _state: WallToolState = "IDLE";
  private _active              = false;
  private _startPoint: Vec2 | null = null;
  private _startNodeId: string | null = null;
  private _chainStartNodeId: string | null = null;
  private _chainNodeIds: string[] = [];
  private _preview: THREE.Mesh | null = null;
  private _nodeDots     = new Map<string, THREE.Mesh>();
  private _activeZoneId = "demo";
  private _activeLevel  = 0;
  private _height       = 3;
  private _thickness    = 0.2;
  private _material     = "brick_01";
  private _shiftDown    = false;
  private _hoveredNodeId: string | null = null;
  private _lastWallId: string | null = null;

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
        const wasActive = this._active;
        this._active = tool === "wall";
        if (!this._active) {
          this._reset();
          if (wasActive) this._hideNodeDots();
        } else {
          this._refreshNodeDots();
        }
      }),
      this._bus.on("floor:select", ({ level }) => { this._activeLevel = level; }),
      this._bus.on("input:click", ({ worldPos, button }) => {
        if (!this._active) return;
        if (button !== 0) { this._reset(); return; }
        this._onLeftClick(worldPos);
      }),
      this._bus.on("input:dblclick", () => {
        if (this._active && this._state === "DRAWING") this._finishChain();
      }),
      this._bus.on("input:mousemove", ({ worldPos }) => {
        if (this._active) this._onMouseMove(worldPos);
      }),
      this._bus.on("input:keydown", ({ code }) => {
        if (code === "ShiftLeft" || code === "ShiftRight") this._shiftDown = true;
        if (this._active && code === "Escape") this._reset();
        if (this._active && code === "Enter" && this._state === "DRAWING") this._finishChain();
      }),
      this._bus.on("input:keyup", ({ code }) => {
        if (code === "ShiftLeft" || code === "ShiftRight") this._shiftDown = false;
      }),
      this._bus.on("input:mousedown", ({ button }) => {
        if (this._active && button === 2) this._reset();
      }),
    );
  }

  private _getActiveZone() {
    return this._world.zones.get(this._activeZoneId);
  }

  private _findSnapNode(x: number, z: number): WallNode | null {
    const zone = this._getActiveZone();
    if (!zone) return null;
    let best: WallNode | null = null;
    let bestDist = SNAP_RADIUS;
    for (const node of zone.nodes) {
      const d = Math.hypot(node.x - x, node.z - z);
      if (d < bestDist) { bestDist = d; best = node; }
    }
    return best;
  }

  private _getOrCreateNode(x: number, z: number): { nodeId: string; pos: Vec2 } {
    const existing = this._findSnapNode(x, z);
    if (existing) return { nodeId: existing.id, pos: { x: existing.x, z: existing.z } };

    const node: WallNode = { id: crypto.randomUUID(), x, z };
    this._world.addNode(this._activeZoneId, node);
    this._addNodeDot(node);
    return { nodeId: node.id, pos: { x, z } };
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
    const snapped = this._findSnapNode(ex, ez);
    if (snapped) return { x: snapped.x, z: snapped.z };
    return { x: ex, z: ez };
  }

  private _onLeftClick(worldPos: Vec3): void {
    if (this._state === "IDLE") {
      const sx = snap(worldPos.x);
      const sz = snap(worldPos.z);
      const { nodeId, pos } = this._getOrCreateNode(sx, sz);
      this._startPoint       = pos;
      this._startNodeId      = nodeId;
      this._chainStartNodeId = nodeId;
      this._chainNodeIds     = [nodeId];
      this._state = "DRAWING";
      this._preview = makePreviewMesh(this._height, this._thickness);
      this._preview.visible = false;
      this._scene.add(this._preview);
    } else {
      this._commit(worldPos);
    }
  }

  private _onMouseMove(worldPos: Vec3): void {
    if (this._state === "DRAWING" && this._preview && this._startPoint) {
      this._preview.visible = true;
      const end = this._calcEnd(worldPos);
      const dx = end.x - this._startPoint.x;
      const dz = end.z - this._startPoint.z;
      const length = Math.hypot(dx, dz) || 0.001;
      const angle  = Math.atan2(dz, dx);
      this._preview.scale.set(length, 1, 1);
      const previewElevation =
        this._getActiveZone()?.floors.find(f => f.level === this._activeLevel)?.elevation
        ?? this._activeLevel * this._height;
      this._preview.position.set(
        (this._startPoint.x + end.x) / 2,
        previewElevation + this._height / 2,
        (this._startPoint.z + end.z) / 2,
      );
      this._preview.rotation.y = -angle;
    }

    const sx = snap(worldPos.x);
    const sz = snap(worldPos.z);
    const nearest = this._findSnapNode(sx, sz);
    const nearestId = nearest?.id ?? null;
    const isNearChainStart = this._state === "DRAWING"
      && nearestId !== null
      && nearestId === this._chainStartNodeId;

    if (nearestId !== this._hoveredNodeId) {
      if (this._hoveredNodeId) {
        const dot = this._nodeDots.get(this._hoveredNodeId);
        if (dot) {
          (dot.material as THREE.MeshBasicMaterial).color.setHex(0x4d8cff);
          (dot.material as THREE.MeshBasicMaterial).opacity = 0.7;
        }
      }
      if (nearestId) {
        const dot = this._nodeDots.get(nearestId);
        if (dot) {
          (dot.material as THREE.MeshBasicMaterial).color.setHex(isNearChainStart ? 0x00ff88 : 0xffdd44);
          (dot.material as THREE.MeshBasicMaterial).opacity = 1.0;
        }
      }
      this._hoveredNodeId = nearestId;
    }

    // Cursor state
    if (this._state === "DRAWING") {
      if (isNearChainStart) document.body.style.cursor = "pointer";
      else if (nearestId)   document.body.style.cursor = "move";
      else                  document.body.style.cursor = "crosshair";
    } else {
      document.body.style.cursor = nearestId ? "move" : "crosshair";
    }
  }

  private _commit(worldPos: Vec3): void {
    const sp = this._startPoint;
    const startNodeId = this._startNodeId;
    if (!sp || !startNodeId) return;

    const epSnapped = this._calcEnd(worldPos);
    if (Math.hypot(epSnapped.x - sp.x, epSnapped.z - sp.z) < GRID) { this._reset(); return; }

    const zone = this._getActiveZone();
    const wallElevation =
      zone?.floors.find(f => f.level === this._activeLevel)?.elevation
      ?? this._activeLevel * this._height;

    let endNodeId!: string;
    let isLoopClose = false;

    this._history.beginBatch("add wall");
    const { nodeId } = this._getOrCreateNode(epSnapped.x, epSnapped.z);
    endNodeId   = nodeId;
    isLoopClose = endNodeId === this._chainStartNodeId;

    const wall: WallDef = {
      id:               `wall_${crypto.randomUUID().slice(0, 8)}`,
      startNodeId,
      endNodeId,
      floor:            this._activeLevel,
      elevation:        wallElevation,
      height:           this._height,
      thickness:        this._thickness,
      material:         this._material,
      exteriorMaterial: this._material,
      openings:         [],
    };

    this._world.addWall(this._activeZoneId, wall);
    this._history.commitBatch();

    this._lastWallId = wall.id;
    this._chainNodeIds.push(endNodeId);

    if (isLoopClose) {
      // Emit auto-floor suggestion with the closed loop's points
      const zone = this._getActiveZone();
      if (zone) {
        const nodeIds = this._chainNodeIds.slice(0, -1);
        const points  = nodeIds.map(id => {
          const n = zone.nodes.find(nn => nn.id === id);
          return n ? { x: n.x, z: n.z } : { x: 0, z: 0 };
        });
        this._bus.emit("floortool:suggest-auto-floor", {
          zoneId:  this._activeZoneId,
          level:   this._activeLevel,
          points,
          nodeIds,
        });
      }
      if (this._lastWallId)
        this._bus.emit("tool:placed", { type: "wall", id: this._lastWallId, zoneId: this._activeZoneId });
      this._reset();
    } else {
      // Chain: continue drawing from the new end node
      this._startPoint      = epSnapped;
      this._startNodeId     = endNodeId;
      this._hoveredNodeId   = null;
      // Keep the existing preview mesh; _onMouseMove will reposition it
    }
  }

  private _finishChain(): void {
    if (this._lastWallId)
      this._bus.emit("tool:placed", { type: "wall", id: this._lastWallId, zoneId: this._activeZoneId });
    this._reset();
  }

  // ─── Node dot helpers ────────────────────────────────────────────────────

  private _addNodeDot(node: WallNode): void {
    if (this._nodeDots.has(node.id)) return;
    const dot = makeNodeDot();
    const dotY =
      (this._getActiveZone()?.floors.find(f => f.level === this._activeLevel)?.elevation ?? this._activeLevel * this._height) + 0.12;
    dot.position.set(node.x, dotY, node.z);
    this._scene.add(dot);
    this._nodeDots.set(node.id, dot);
  }

  private _refreshNodeDots(): void {
    this._hideNodeDots();
    const zone = this._getActiveZone();
    if (!zone) return;
    for (const node of zone.nodes) this._addNodeDot(node);
  }

  private _hideNodeDots(): void {
    for (const dot of this._nodeDots.values()) {
      this._scene.remove(dot);
      (dot.geometry as THREE.BufferGeometry).dispose();
      (dot.material as THREE.Material).dispose();
    }
    this._nodeDots.clear();
    this._hoveredNodeId = null;
  }

  private _reset(): void {
    if (this._preview) {
      this._scene.remove(this._preview);
      (this._preview.geometry as THREE.BufferGeometry).dispose();
      (this._preview.material as THREE.Material).dispose();
      this._preview = null;
    }

    // If the chain start node has no walls referencing it, it was created by
    // the first click and never used — remove it so it doesn't become a
    // dangling draggable dot with no geometry behind it.
    if (this._chainStartNodeId) {
      const zone = this._getActiveZone();
      const unreferenced = zone && !zone.walls.some(
        w => w.startNodeId === this._chainStartNodeId || w.endNodeId === this._chainStartNodeId,
      );
      if (unreferenced) {
        this._world.removeNode(this._activeZoneId, this._chainStartNodeId);
        const dot = this._nodeDots.get(this._chainStartNodeId);
        if (dot) {
          this._scene.remove(dot);
          (dot.geometry as THREE.BufferGeometry).dispose();
          (dot.material as THREE.Material).dispose();
          this._nodeDots.delete(this._chainStartNodeId);
        }
      }
    }

    this._startPoint       = null;
    this._startNodeId      = null;
    this._chainStartNodeId = null;
    this._chainNodeIds     = [];
    this._hoveredNodeId    = null;
    this._lastWallId       = null;
    this._state = "IDLE";
    document.body.style.cursor = "";
  }

  setActiveZone(zoneId: string): void { this._activeZoneId = zoneId; }
  update(_dt: number): void {}

  dispose(): void {
    this._reset();
    this._hideNodeDots();
    this._unsubs.forEach(u => u());
  }
}
