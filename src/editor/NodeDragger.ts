import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { ToolId, Vec2 } from "@/types";

const SNAP_RADIUS = 0.5;
const EDGE_RADIUS = 0.35; // lower than SNAP_RADIUS so nodes take priority
const GRID        = 0.5;

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 === 0) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

type DraggerState = "IDLE" | "DRAG";

interface EdgeEntry {
  nodeId1: string;
  nodeId2: string;
  line:    THREE.Line;
}

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

function makeEdgeLine(x1: number, z1: number, x2: number, z2: number): THREE.Line {
  const pts = [new THREE.Vector3(x1, 0.04, z1), new THREE.Vector3(x2, 0.04, z2)];
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({
    color:       0x3366aa,
    depthTest:   false,
    transparent: true,
    opacity:     0.35,
  });
  const line = new THREE.Line(geo, mat);
  line.renderOrder = 2;
  return line;
}

export class NodeDragger {
  private _activeTool: ToolId  = "select";
  private _state: DraggerState = "IDLE";
  private _activeZoneId        = "demo";

  private _nodeDots          = new Map<string, THREE.Mesh>();
  private _hoveredNodeId:    string | null = null;
  private _dragNodeId:       string | null = null;
  private _dragOrigPos:      Vec2   | null = null;

  private _edgeEntries       = new Map<string, EdgeEntry>(); // key: "id1::id2"
  private _hoveredEdgeKey:   string | null = null;
  private _dragEdgeKey:      string | null = null;
  private _dragEdgeOrig:     { x1: number; z1: number; x2: number; z2: number } | null = null;
  private _dragEdgeStart:    Vec2   | null = null; // raw world pos at drag start

  private _altDown = false;
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
          this._refresh();
        } else {
          if (this._state === "DRAG") this._cancelDrag();
          this._hide();
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

  private _findNearestEdge(rawX: number, rawZ: number): string | null {
    const zone = this._getActiveZone();
    if (!zone) return null;
    let bestKey: string | null = null;
    let bestDist = EDGE_RADIUS;
    for (const [key, edge] of this._edgeEntries) {
      const n1 = zone.nodes.find(n => n.id === edge.nodeId1);
      const n2 = zone.nodes.find(n => n.id === edge.nodeId2);
      if (!n1 || !n2) continue;
      const d = distToSegment(rawX, rawZ, n1.x, n1.z, n2.x, n2.z);
      if (d < bestDist) { bestDist = d; bestKey = key; }
    }
    return bestKey;
  }

  private _onMouseMove(rawX: number, rawZ: number): void {
    this._lastRawPos = { x: rawX, z: rawZ };
    const sx = this._altDown ? rawX : snap(rawX);
    const sz = this._altDown ? rawZ : snap(rawZ);

    // ── Node drag ──────────────────────────────────────────────────────────
    if (this._state === "DRAG" && this._dragNodeId) {
      this._world.updateNode(this._activeZoneId, this._dragNodeId, { x: sx, z: sz });
      const dot = this._nodeDots.get(this._dragNodeId);
      if (dot) dot.position.set(sx, 0.12, sz);
      return;
    }

    // ── Edge drag ──────────────────────────────────────────────────────────
    if (this._state === "DRAG" && this._dragEdgeKey && this._dragEdgeOrig && this._dragEdgeStart) {
      const dx = this._altDown
        ? rawX - this._dragEdgeStart.x
        : snap(rawX - this._dragEdgeStart.x);
      const dz = this._altDown
        ? rawZ - this._dragEdgeStart.z
        : snap(rawZ - this._dragEdgeStart.z);

      const edge = this._edgeEntries.get(this._dragEdgeKey);
      if (edge) {
        const newX1 = this._dragEdgeOrig.x1 + dx;
        const newZ1 = this._dragEdgeOrig.z1 + dz;
        const newX2 = this._dragEdgeOrig.x2 + dx;
        const newZ2 = this._dragEdgeOrig.z2 + dz;

        this._world.updateNode(this._activeZoneId, edge.nodeId1, { x: newX1, z: newZ1 });
        this._world.updateNode(this._activeZoneId, edge.nodeId2, { x: newX2, z: newZ2 });

        const dot1 = this._nodeDots.get(edge.nodeId1);
        const dot2 = this._nodeDots.get(edge.nodeId2);
        if (dot1) dot1.position.set(newX1, 0.12, newZ1);
        if (dot2) dot2.position.set(newX2, 0.12, newZ2);

        this._updateEdgeLine(edge, newX1, newZ1, newX2, newZ2);
      }
      return;
    }

    // ── Hover: node takes priority over edge ───────────────────────────────
    const nearestNodeId = this._findNearestNode(rawX, rawZ);
    const nearestEdgeKey = nearestNodeId ? null : this._findNearestEdge(rawX, rawZ);

    if (nearestNodeId !== this._hoveredNodeId) {
      if (this._hoveredNodeId) {
        const dot = this._nodeDots.get(this._hoveredNodeId);
        if (dot) {
          (dot.material as THREE.MeshBasicMaterial).color.setHex(0x6699bb);
          (dot.material as THREE.MeshBasicMaterial).opacity = 0.6;
          dot.scale.setScalar(1);
        }
      }
      if (nearestNodeId) {
        const dot = this._nodeDots.get(nearestNodeId);
        if (dot) {
          (dot.material as THREE.MeshBasicMaterial).color.setHex(0x4d8cff);
          (dot.material as THREE.MeshBasicMaterial).opacity = 1.0;
          dot.scale.setScalar(1.4);
        }
      }
      this._hoveredNodeId = nearestNodeId;
    }

    if (nearestEdgeKey !== this._hoveredEdgeKey) {
      if (this._hoveredEdgeKey) {
        const e = this._edgeEntries.get(this._hoveredEdgeKey);
        if (e) this._setEdgeStyle(e.line, false);
      }
      if (nearestEdgeKey) {
        const e = this._edgeEntries.get(nearestEdgeKey);
        if (e) this._setEdgeStyle(e.line, true);
      }
      this._hoveredEdgeKey = nearestEdgeKey;
    }

    document.body.style.cursor = (nearestNodeId || nearestEdgeKey) ? "move" : "";
  }

  private _onMouseDown(): void {
    const zone = this._getActiveZone();
    if (!zone) return;

    if (this._hoveredNodeId) {
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
      return;
    }

    if (this._hoveredEdgeKey) {
      const edge = this._edgeEntries.get(this._hoveredEdgeKey);
      if (!edge) return;
      const n1 = zone.nodes.find(n => n.id === edge.nodeId1);
      const n2 = zone.nodes.find(n => n.id === edge.nodeId2);
      if (!n1 || !n2) return;

      // record raw world pos so we can compute snapped delta each frame
      const lastMove = this._lastRawPos;
      this._dragEdgeKey   = this._hoveredEdgeKey;
      this._dragEdgeOrig  = { x1: n1.x, z1: n1.z, x2: n2.x, z2: n2.z };
      this._dragEdgeStart = { x: lastMove.x, z: lastMove.z };
      this._state         = "DRAG";
      this._bus.emit("gizmo:dragging", { isDragging: true });
      document.body.style.cursor = "grabbing";
    }
  }

  private _onMouseUp(): void {
    if (this._state !== "DRAG") return;
    this._endDrag();
  }

  private _cancelDrag(): void {
    if (this._state !== "DRAG") return;

    if (this._dragNodeId && this._dragOrigPos) {
      this._world.updateNode(this._activeZoneId, this._dragNodeId, this._dragOrigPos);
      const dot = this._nodeDots.get(this._dragNodeId);
      if (dot) dot.position.set(this._dragOrigPos.x, 0.12, this._dragOrigPos.z);
    }

    if (this._dragEdgeKey && this._dragEdgeOrig) {
      const edge = this._edgeEntries.get(this._dragEdgeKey);
      if (edge) {
        this._world.updateNode(this._activeZoneId, edge.nodeId1, { x: this._dragEdgeOrig.x1, z: this._dragEdgeOrig.z1 });
        this._world.updateNode(this._activeZoneId, edge.nodeId2, { x: this._dragEdgeOrig.x2, z: this._dragEdgeOrig.z2 });
        const dot1 = this._nodeDots.get(edge.nodeId1);
        const dot2 = this._nodeDots.get(edge.nodeId2);
        if (dot1) dot1.position.set(this._dragEdgeOrig.x1, 0.12, this._dragEdgeOrig.z1);
        if (dot2) dot2.position.set(this._dragEdgeOrig.x2, 0.12, this._dragEdgeOrig.z2);
        this._updateEdgeLine(edge, this._dragEdgeOrig.x1, this._dragEdgeOrig.z1, this._dragEdgeOrig.x2, this._dragEdgeOrig.z2);
      }
    }

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

    if (this._dragEdgeKey) {
      const e = this._edgeEntries.get(this._dragEdgeKey);
      if (e) this._setEdgeStyle(e.line, this._hoveredEdgeKey === this._dragEdgeKey);
    }

    this._dragNodeId   = null;
    this._dragOrigPos  = null;
    this._dragEdgeKey  = null;
    this._dragEdgeOrig = null;
    this._dragEdgeStart = null;
    this._state        = "IDLE";

    this._bus.emit("gizmo:dragging", { isDragging: false });
    document.body.style.cursor = (this._hoveredNodeId || this._hoveredEdgeKey) ? "move" : "";
  }

  // ── Visuals ────────────────────────────────────────────────────────────────

  private _lastRawPos: Vec2 = { x: 0, z: 0 };

  private _refresh(): void {
    this._hide();
    const zone = this._getActiveZone();
    if (!zone) return;

    for (const node of zone.nodes) {
      const dot = makeNodeDot();
      dot.position.set(node.x, 0.12, node.z);
      this._scene.add(dot);
      this._nodeDots.set(node.id, dot);
    }

    for (const floor of zone.floors) {
      const ids = floor.floorMesh.nodeIds;
      if (!ids || ids.length < 3) continue;
      for (let i = 0; i < ids.length; i++) {
        const id1 = ids[i]!;
        const id2 = ids[(i + 1) % ids.length]!;
        const n1 = zone.nodes.find(n => n.id === id1);
        const n2 = zone.nodes.find(n => n.id === id2);
        if (!n1 || !n2) continue;
        const key = `${id1}::${id2}`;
        if (this._edgeEntries.has(key)) continue; // avoid duplicate if shared
        const line = makeEdgeLine(n1.x, n1.z, n2.x, n2.z);
        this._scene.add(line);
        this._edgeEntries.set(key, { nodeId1: id1, nodeId2: id2, line });
      }
    }
  }

  // kept for compat — init() / dispose() used _hideNodeDots name before refactor
  private _hideNodeDots(): void { this._hide(); }

  private _hide(): void {
    for (const dot of this._nodeDots.values()) {
      this._scene.remove(dot);
      dot.geometry.dispose();
      (dot.material as THREE.Material).dispose();
    }
    this._nodeDots.clear();
    this._hoveredNodeId = null;

    for (const entry of this._edgeEntries.values()) {
      this._scene.remove(entry.line);
      entry.line.geometry.dispose();
      (entry.line.material as THREE.Material).dispose();
    }
    this._edgeEntries.clear();
    this._hoveredEdgeKey = null;
  }

  private _setEdgeStyle(line: THREE.Line, hovered: boolean): void {
    const mat = line.material as THREE.LineBasicMaterial;
    mat.color.setHex(hovered ? 0x5599ff : 0x3366aa);
    mat.opacity = hovered ? 0.85 : 0.35;
  }

  private _updateEdgeLine(edge: EdgeEntry, x1: number, z1: number, x2: number, z2: number): void {
    const pos = edge.line.geometry.attributes["position"] as THREE.BufferAttribute;
    pos.setXYZ(0, x1, 0.04, z1);
    pos.setXYZ(1, x2, 0.04, z2);
    pos.needsUpdate = true;
  }

  setActiveZone(zoneId: string): void { this._activeZoneId = zoneId; }

  dispose(): void {
    if (this._state === "DRAG") this._cancelDrag();
    this._hide();
    document.body.style.cursor = "";
    this._unsubs.forEach(u => u());
  }
}
