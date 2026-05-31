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

// "lock_x": only Z changes when dragged (horizontal rect edge)
// "lock_z": only X changes when dragged (vertical rect edge)
type AxisConstraint = "lock_x" | "lock_z" | "free";

interface EdgeEntry {
  nodeId1:         string;
  nodeId2:         string;
  line:            THREE.Line;
  axisConstraint:  AxisConstraint;
  y:               number;  // world Y for the edge line
}

// Rect floor corner adjacency: corners stored as [TL, TR, BR, BL] (indices 0-3).
// SAME_X[i] = the corner that shares X with corner i.
// SAME_Z[i] = the corner that shares Z with corner i.
const RECT_SAME_X = [3, 2, 1, 0] as const;
const RECT_SAME_Z = [1, 0, 3, 2] as const;

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

function makeEdgeLine(x1: number, z1: number, x2: number, z2: number, y = 0.04): THREE.Line {
  const pts = [new THREE.Vector3(x1, y, z1), new THREE.Vector3(x2, y, z2)];
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

  private _nodeDots         = new Map<string, THREE.Mesh>();
  private _nodeDotY         = new Map<string, number>();    // nodeId → world Y for the dot
  private _hoveredNodeId:   string | null = null;
  private _dragNodeId:      string | null = null;
  private _dragOrigPos:     Vec2   | null = null;

  private _edgeEntries      = new Map<string, EdgeEntry>(); // key: "id1::id2"
  private _hoveredEdgeKey:  string | null = null;
  private _dragEdgeKey:     string | null = null;
  private _dragEdgeOrig:    { x1: number; z1: number; x2: number; z2: number } | null = null;
  private _dragEdgeStart:   Vec2   | null = null; // raw world pos at drag start

  // Rect-floor constraint lookups — keyed by nodeId / floorId
  private _nodeToRectFloor  = new Map<string, string>();   // nodeId → floorId
  private _rectFloorNodes   = new Map<string, string[]>(); // floorId → [id0,id1,id2,id3]

  private _altDown = false;
  private _lastRawPos: Vec2 = { x: 0, z: 0 };
  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _scene:   THREE.Scene,
    private readonly _world:   WorldState,
    private readonly _bus:     EventBus,
    private readonly _camera:  THREE.Camera,
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
      this._bus.on("platform:updated", () => {
        if (this._activeTool === "select" && this._state !== "DRAG") this._refresh();
      }),
      this._bus.on("floor:updated", () => {
        if (this._activeTool === "select" && this._state !== "DRAG") this._refresh();
      }),
      this._bus.on("wall:rebuilt", () => {
        if (this._activeTool === "select" && this._state !== "DRAG") this._refresh();
      }),
    );
  }

  private _dotY(nodeId: string): number { return this._nodeDotY.get(nodeId) ?? 0.12; }

  /**
   * InputManager always raycasts to y=0. When a node is elevated (e.g. on a
   * platform slab), the ground-plane hit point is perspective-shifted from the
   * visual dot. This projects the y=0 hit back up to the dot's actual world Y
   * so that distance checks work correctly regardless of camera angle.
   */
  private _projectRayToY(rawX: number, rawZ: number, targetY: number): { x: number; z: number } {
    const cam = this._camera as THREE.PerspectiveCamera;
    const cy = cam.position.y;
    if (targetY <= 0.01 || cy <= targetY) return { x: rawX, z: rawZ };
    const t = 1 - targetY / cy;
    return {
      x: cam.position.x + t * (rawX - cam.position.x),
      z: cam.position.z + t * (rawZ - cam.position.z),
    };
  }

  private _getActiveZone() {
    return this._world.zones.get(this._activeZoneId);
  }

  private _findNearestNode(rawX: number, rawZ: number): string | null {
    const zone = this._getActiveZone();
    if (!zone) return null;
    let bestId: string | null = null;
    let bestDist = SNAP_RADIUS;
    for (const node of zone.nodes) {
      const { x, z } = this._projectRayToY(rawX, rawZ, this._dotY(node.id));
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
      const { x, z } = this._projectRayToY(rawX, rawZ, edge.y);
      const d = distToSegment(x, z, n1.x, n1.z, n2.x, n2.z);
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
      const nodeY = this._dotY(this._dragNodeId);
      const { x: cx, z: cz } = this._projectRayToY(rawX, rawZ, nodeY);
      const sx = this._altDown ? cx : snap(cx);
      const sz = this._altDown ? cz : snap(cz);
      this._world.updateNode(this._activeZoneId, this._dragNodeId, { x: sx, z: sz });
      const dot = this._nodeDots.get(this._dragNodeId);
      if (dot) dot.position.set(sx, nodeY, sz);
      this._syncRectCorner(this._dragNodeId, sx, sz);
      this._updateEdgeLinesForNode(this._dragNodeId, sx, sz);
      return;
    }

    // ── Edge drag ──────────────────────────────────────────────────────────
    if (this._state === "DRAG" && this._dragEdgeKey && this._dragEdgeOrig && this._dragEdgeStart) {
      const edge = this._edgeEntries.get(this._dragEdgeKey);
      if (edge) {
        const { x: curCx, z: curCz } = this._projectRayToY(rawX, rawZ, edge.y);
        const rawDx = curCx - this._dragEdgeStart.x;
        const rawDz = curCz - this._dragEdgeStart.z;
        const ax = edge.axisConstraint;
        const dx = ax === "lock_x" ? 0 : (this._altDown ? rawDx : snap(rawDx));
        const dz = ax === "lock_z" ? 0 : (this._altDown ? rawDz : snap(rawDz));

        const newX1 = this._dragEdgeOrig.x1 + dx;
        const newZ1 = this._dragEdgeOrig.z1 + dz;
        const newX2 = this._dragEdgeOrig.x2 + dx;
        const newZ2 = this._dragEdgeOrig.z2 + dz;

        this._world.updateNode(this._activeZoneId, edge.nodeId1, { x: newX1, z: newZ1 });
        this._world.updateNode(this._activeZoneId, edge.nodeId2, { x: newX2, z: newZ2 });

        const dot1 = this._nodeDots.get(edge.nodeId1);
        const dot2 = this._nodeDots.get(edge.nodeId2);
        if (dot1) dot1.position.set(newX1, this._dotY(edge.nodeId1), newZ1);
        if (dot2) dot2.position.set(newX2, this._dotY(edge.nodeId2), newZ2);

        this._updateEdgeLinesForNode(edge.nodeId1, newX1, newZ1);
        this._updateEdgeLinesForNode(edge.nodeId2, newX2, newZ2);
      }
      return;
    }

    // ── Hover: node takes priority over edge ───────────────────────────────
    const nearestNodeId  = this._findNearestNode(rawX, rawZ);
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
      this._dragEdgeKey   = this._hoveredEdgeKey;
      this._dragEdgeOrig  = { x1: n1.x, z1: n1.z, x2: n2.x, z2: n2.z };
      const { x: esx, z: esz } = this._projectRayToY(this._lastRawPos.x, this._lastRawPos.z, edge.y);
      this._dragEdgeStart = { x: esx, z: esz };
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
      if (dot) dot.position.set(this._dragOrigPos.x, this._dotY(this._dragNodeId), this._dragOrigPos.z);
      this._syncRectCorner(this._dragNodeId, this._dragOrigPos.x, this._dragOrigPos.z);
      this._updateEdgeLinesForNode(this._dragNodeId, this._dragOrigPos.x, this._dragOrigPos.z);
    }

    if (this._dragEdgeKey && this._dragEdgeOrig) {
      const edge = this._edgeEntries.get(this._dragEdgeKey);
      if (edge) {
        this._world.updateNode(this._activeZoneId, edge.nodeId1, { x: this._dragEdgeOrig.x1, z: this._dragEdgeOrig.z1 });
        this._world.updateNode(this._activeZoneId, edge.nodeId2, { x: this._dragEdgeOrig.x2, z: this._dragEdgeOrig.z2 });
        const dot1 = this._nodeDots.get(edge.nodeId1);
        const dot2 = this._nodeDots.get(edge.nodeId2);
        if (dot1) dot1.position.set(this._dragEdgeOrig.x1, this._dotY(edge.nodeId1), this._dragEdgeOrig.z1);
        if (dot2) dot2.position.set(this._dragEdgeOrig.x2, this._dotY(edge.nodeId2), this._dragEdgeOrig.z2);
        this._updateEdgeLinesForNode(edge.nodeId1, this._dragEdgeOrig.x1, this._dragEdgeOrig.z1);
        this._updateEdgeLinesForNode(edge.nodeId2, this._dragEdgeOrig.x2, this._dragEdgeOrig.z2);
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

    this._dragNodeId    = null;
    this._dragOrigPos   = null;
    this._dragEdgeKey   = null;
    this._dragEdgeOrig  = null;
    this._dragEdgeStart = null;
    this._state         = "IDLE";

    this._bus.emit("gizmo:dragging", { isDragging: false });
    document.body.style.cursor = (this._hoveredNodeId || this._hoveredEdgeKey) ? "move" : "";
  }

  // ── Rect constraint ────────────────────────────────────────────────────────

  /**
   * For rect floors, keeps the two adjacent corners locked to the same axis as
   * the dragged corner.  Mutates zone.nodes directly (no extra updateNode events)
   * so the single floor rebuild triggered by the main drag node picks up all
   * three updated positions at once.
   */
  private _syncRectCorner(nodeId: string, nx: number, nz: number): void {
    const floorId = this._nodeToRectFloor.get(nodeId);
    if (!floorId) return;
    const ids = this._rectFloorNodes.get(floorId);
    if (!ids || ids.length < 4) return;

    const idx = ids.indexOf(nodeId);
    if (idx < 0) return;

    const zone = this._getActiveZone();
    if (!zone) return;

    const sameXId = ids[RECT_SAME_X[idx]]!;
    const sameZId = ids[RECT_SAME_Z[idx]]!;

    const sameXNode = zone.nodes.find(n => n.id === sameXId);
    const sameZNode = zone.nodes.find(n => n.id === sameZId);

    if (sameXNode) {
      sameXNode.x = nx;
      const dot = this._nodeDots.get(sameXId);
      if (dot) dot.position.set(nx, this._dotY(sameXId), sameXNode.z);
      this._updateEdgeLinesForNode(sameXId, nx, sameXNode.z);
    }

    if (sameZNode) {
      sameZNode.z = nz;
      const dot = this._nodeDots.get(sameZId);
      if (dot) dot.position.set(sameZNode.x, this._dotY(sameZId), nz);
      this._updateEdgeLinesForNode(sameZId, sameZNode.x, nz);
    }
  }

  // ── Visuals ────────────────────────────────────────────────────────────────

  private _refresh(): void {
    this._hide();
    const zone = this._getActiveZone();
    if (!zone) return;

    // Build a lookup: nodeId → platform top-face Y (only for polygon platform nodes)
    const platformNodeY = new Map<string, number>();
    for (const platform of zone.platforms) {
      if (!platform.nodeIds?.length) continue;
      const topY = platform.position.y + platform.thickness + 0.06;
      for (const id of platform.nodeIds) platformNodeY.set(id, topY);
    }

    for (const node of zone.nodes) {
      const y = platformNodeY.get(node.id) ?? 0.12;
      this._nodeDotY.set(node.id, y);
      const dot = makeNodeDot();
      dot.position.set(node.x, y, node.z);
      this._scene.add(dot);
      this._nodeDots.set(node.id, dot);
    }

    for (const floor of zone.floors) {
      const ids = floor.floorMesh.nodeIds;
      if (!ids || ids.length < 3) continue;

      const isRect = floor.floorMesh.shape === "rect" && ids.length === 4;
      if (isRect) {
        this._rectFloorNodes.set(floor.id, [...ids]);
        for (const id of ids) this._nodeToRectFloor.set(id, floor.id);
      }

      for (let i = 0; i < ids.length; i++) {
        const id1 = ids[i]!;
        const id2 = ids[(i + 1) % ids.length]!;
        const n1  = zone.nodes.find(n => n.id === id1);
        const n2  = zone.nodes.find(n => n.id === id2);
        if (!n1 || !n2) continue;
        const key = `${id1}::${id2}`;
        if (this._edgeEntries.has(key)) continue;

        let axisConstraint: AxisConstraint = "free";
        if (isRect) {
          if (Math.abs(n1.z - n2.z) < 0.001) axisConstraint = "lock_x";
          else if (Math.abs(n1.x - n2.x) < 0.001) axisConstraint = "lock_z";
        }

        const line = makeEdgeLine(n1.x, n1.z, n2.x, n2.z);
        this._scene.add(line);
        this._edgeEntries.set(key, { nodeId1: id1, nodeId2: id2, line, axisConstraint, y: 0.04 });
      }
    }

    for (const platform of zone.platforms) {
      const ids = platform.nodeIds;
      if (!ids || ids.length < 3) continue;
      const edgeY = platform.position.y + platform.thickness + 0.04;

      for (let i = 0; i < ids.length; i++) {
        const id1 = ids[i]!;
        const id2 = ids[(i + 1) % ids.length]!;
        const n1  = zone.nodes.find(n => n.id === id1);
        const n2  = zone.nodes.find(n => n.id === id2);
        if (!n1 || !n2) continue;
        const key = `${id1}::${id2}`;
        if (this._edgeEntries.has(key)) continue;

        const line = makeEdgeLine(n1.x, n1.z, n2.x, n2.z, edgeY);
        this._scene.add(line);
        this._edgeEntries.set(key, { nodeId1: id1, nodeId2: id2, line, axisConstraint: "free", y: edgeY });
      }
    }
  }

  private _hide(): void {
    for (const dot of this._nodeDots.values()) {
      this._scene.remove(dot);
      dot.geometry.dispose();
      (dot.material as THREE.Material).dispose();
    }
    this._nodeDots.clear();
    this._nodeDotY.clear();
    this._hoveredNodeId = null;

    for (const entry of this._edgeEntries.values()) {
      this._scene.remove(entry.line);
      entry.line.geometry.dispose();
      (entry.line.material as THREE.Material).dispose();
    }
    this._edgeEntries.clear();
    this._hoveredEdgeKey = null;

    this._rectFloorNodes.clear();
    this._nodeToRectFloor.clear();
  }

  private _setEdgeStyle(line: THREE.Line, hovered: boolean): void {
    const mat = line.material as THREE.LineBasicMaterial;
    mat.color.setHex(hovered ? 0x5599ff : 0x3366aa);
    mat.opacity = hovered ? 0.85 : 0.35;
  }

  private _updateEdgeLine(edge: EdgeEntry, x1: number, z1: number, x2: number, z2: number): void {
    const pos = edge.line.geometry.attributes["position"] as THREE.BufferAttribute;
    pos.setXYZ(0, x1, edge.y, z1);
    pos.setXYZ(1, x2, edge.y, z2);
    pos.needsUpdate = true;
  }

  private _updateEdgeLinesForNode(nodeId: string, nx: number, nz: number): void {
    const zone = this._getActiveZone();
    if (!zone) return;
    for (const edge of this._edgeEntries.values()) {
      if (edge.nodeId1 !== nodeId && edge.nodeId2 !== nodeId) continue;
      const isFirst = edge.nodeId1 === nodeId;
      const otherId = isFirst ? edge.nodeId2 : edge.nodeId1;
      const other   = zone.nodes.find(n => n.id === otherId);
      if (!other) continue;
      if (isFirst) this._updateEdgeLine(edge, nx, nz, other.x, other.z);
      else         this._updateEdgeLine(edge, other.x, other.z, nx, nz);
    }
  }

  setActiveZone(zoneId: string): void { this._activeZoneId = zoneId; }

  dispose(): void {
    if (this._state === "DRAG") this._cancelDrag();
    this._hide();
    document.body.style.cursor = "";
    this._unsubs.forEach(u => u());
  }
}
