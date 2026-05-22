import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { ToolId, Vec2 } from "@/types";

const SNAP_RADIUS = 0.5;
const GRID        = 0.5;

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

type DraggerState = "IDLE" | "DRAG";

function makeNodeDot(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(0.1, 8, 8);
  const mat = new THREE.MeshBasicMaterial({
    color:       0x6699bb,
    depthTest:   false,
    depthWrite:  false,
    transparent: true,
    opacity:     0.6,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 3;
  return mesh;
}

export class NodeDragger {
  private _activeTool: ToolId  = "select";
  private _state: DraggerState = "IDLE";
  private _activeZoneId        = "demo";

  private _nodeDots          = new Map<string, THREE.Mesh>();
  private _hoveredNodeId:    string | null = null;
  private _dragNodeId:       string | null = null;
  private _dragOrigPos:      Vec2   | null = null;
  private _altDown                         = false;

  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _scene:  THREE.Scene,
    private readonly _world:  WorldState,
    private readonly _bus:    EventBus,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("tool:select", ({ tool }) => {
        this._activeTool = tool;
        if (tool === "select") {
          this._refreshNodeDots();
        } else {
          if (this._state === "DRAG") this._cancelDrag();
          this._hideNodeDots();
        }
      }),
      this._bus.on("input:mousemove", ({ worldPos }) => {
        if (this._activeTool !== "select") return;
        this._onMouseMove(worldPos.x, worldPos.z);
      }),
      this._bus.on("input:mousedown", ({ button }) => {
        if (this._activeTool !== "select" || button !== 0) return;
        this._onMouseDown();
      }),
      this._bus.on("input:mouseup", ({ button }) => {
        if (button === 0) this._onMouseUp();
      }),
      this._bus.on("input:keydown", ({ code }) => {
        if (code === "AltLeft"    || code === "AltRight")   this._altDown = true;
        if (code === "Escape"     && this._state === "DRAG") this._cancelDrag();
      }),
      this._bus.on("input:keyup", ({ code }) => {
        if (code === "AltLeft" || code === "AltRight") this._altDown = false;
      }),
    );
  }

  private _getActiveZone() {
    return this._world.zones.get(this._activeZoneId);
  }

  private _findNearestNode(x: number, z: number): string | null {
    const zone = this._getActiveZone();
    if (!zone) return null;
    let bestId: string | null = null;
    let bestDist = SNAP_RADIUS;
    for (const node of zone.nodes) {
      const d = Math.hypot(node.x - x, node.z - z);
      if (d < bestDist) { bestDist = d; bestId = node.id; }
    }
    return bestId;
  }

  private _onMouseMove(rawX: number, rawZ: number): void {
    const sx = this._altDown ? rawX : snap(rawX);
    const sz = this._altDown ? rawZ : snap(rawZ);

    if (this._state === "DRAG" && this._dragNodeId) {
      this._world.updateNode(this._activeZoneId, this._dragNodeId, { x: sx, z: sz });
      const dot = this._nodeDots.get(this._dragNodeId);
      if (dot) dot.position.set(sx, 0.12, sz);
      return;
    }

    const nearestId = this._findNearestNode(rawX, rawZ);

    if (nearestId !== this._hoveredNodeId) {
      if (this._hoveredNodeId) {
        const dot = this._nodeDots.get(this._hoveredNodeId);
        if (dot) {
          (dot.material as THREE.MeshBasicMaterial).color.setHex(0x6699bb);
          (dot.material as THREE.MeshBasicMaterial).opacity = 0.6;
          dot.scale.setScalar(1);
        }
      }
      if (nearestId) {
        const dot = this._nodeDots.get(nearestId);
        if (dot) {
          (dot.material as THREE.MeshBasicMaterial).color.setHex(0x4d8cff);
          (dot.material as THREE.MeshBasicMaterial).opacity = 1.0;
          dot.scale.setScalar(1.4);
        }
      }
      this._hoveredNodeId = nearestId;
    }

    document.body.style.cursor = nearestId ? "move" : "";
  }

  private _onMouseDown(): void {
    if (!this._hoveredNodeId) return;
    const zone = this._getActiveZone();
    if (!zone) return;
    const node = zone.nodes.find(n => n.id === this._hoveredNodeId);
    if (!node) return;

    this._dragNodeId  = this._hoveredNodeId;
    this._dragOrigPos = { x: node.x, z: node.z };
    this._state       = "DRAG";

    this._bus.emit("gizmo:dragging", { isDragging: true });

    const dot = this._nodeDots.get(this._dragNodeId);
    if (dot) {
      (dot.material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
      (dot.material as THREE.MeshBasicMaterial).opacity = 1.0;
      dot.scale.setScalar(1.8);
    }

    document.body.style.cursor = "grabbing";
  }

  private _onMouseUp(): void {
    if (this._state !== "DRAG") return;
    this._endDrag();
  }

  private _cancelDrag(): void {
    if (this._state !== "DRAG" || !this._dragNodeId || !this._dragOrigPos) return;
    this._world.updateNode(this._activeZoneId, this._dragNodeId, this._dragOrigPos);
    const dot = this._nodeDots.get(this._dragNodeId);
    if (dot) dot.position.set(this._dragOrigPos.x, 0.12, this._dragOrigPos.z);
    this._endDrag();
  }

  private _endDrag(): void {
    if (this._dragNodeId) {
      const isHovered = this._hoveredNodeId === this._dragNodeId;
      const dot = this._nodeDots.get(this._dragNodeId);
      if (dot) {
        (dot.material as THREE.MeshBasicMaterial).color.setHex(isHovered ? 0x4d8cff : 0x6699bb);
        (dot.material as THREE.MeshBasicMaterial).opacity = isHovered ? 1.0 : 0.6;
        dot.scale.setScalar(isHovered ? 1.4 : 1);
      }
    }

    this._dragNodeId  = null;
    this._dragOrigPos = null;
    this._state       = "IDLE";

    this._bus.emit("gizmo:dragging", { isDragging: false });
    document.body.style.cursor = this._hoveredNodeId ? "move" : "";
  }

  private _refreshNodeDots(): void {
    this._hideNodeDots();
    const zone = this._getActiveZone();
    if (!zone) return;
    for (const node of zone.nodes) {
      const dot = makeNodeDot();
      dot.position.set(node.x, 0.12, node.z);
      this._scene.add(dot);
      this._nodeDots.set(node.id, dot);
    }
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

  setActiveZone(zoneId: string): void { this._activeZoneId = zoneId; }

  dispose(): void {
    if (this._state === "DRAG") this._cancelDrag();
    this._hideNodeDots();
    document.body.style.cursor = "";
    this._unsubs.forEach(u => u());
  }
}
