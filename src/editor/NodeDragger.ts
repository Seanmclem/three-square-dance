import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { ToolId, Vec2 } from "@/types";

const SNAP_RADIUS = 0.5;
const EDGE_RADIUS = 0.35; // lower than SNAP_RADIUS so nodes take priority
const GRID        = 0.5;
const MIN_SIZE    = 0.5;  // smallest allowed rect-platform width/depth

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

// Rect-platform corner/edge handles. Corners 0-3 wind (-,-),(+,-),(+,+),(-,+) in
// the platform's local XZ; edge i joins corner i→(i+1). Local axes in world are
// eX=(cos,-sin), eZ=(sin,cos) for a yaw of `theta` (PlatformDef.rotation.y).
const CORNER_SIGN: ReadonlyArray<readonly [number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const EDGE_NORMAL: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const EDGE_IS_DEPTH = [true, false, true, false] as const; // does edge i's normal move depth (else width)?

function rectCorners(cx: number, cz: number, w: number, d: number, theta: number): Vec2[] {
  const hw = w / 2, hd = d / 2, cos = Math.cos(theta), sin = Math.sin(theta);
  return CORNER_SIGN.map(([sx, sz]) => {
    const lx = sx * hw, lz = sz * hd;
    return { x: cx + lx * cos + lz * sin, z: cz - lx * sin + lz * cos };
  });
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

interface RectCornerEntry { platformId: string; index: number; dot: THREE.Mesh; y: number; }
interface RectEdgeEntry   { platformId: string; index: number; line: THREE.Line; y: number; }
interface RectOrig        { cx: number; cz: number; posY: number; thickness: number; w: number; d: number; theta: number; }

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
    opacity:     0.48,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 3;
  mesh.userData.hideInGame = true;
  return mesh;
}

function makeEdgeLine(x1: number, z1: number, x2: number, z2: number, y = 0.04): THREE.Line {
  const pts = [new THREE.Vector3(x1, y, z1), new THREE.Vector3(x2, y, z2)];
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({
    color:       0x3366aa,
    depthTest:   false,
    transparent: true,
    opacity:     0.42,
  });
  const line = new THREE.Line(geo, mat);
  line.renderOrder = 2;
  line.userData.hideInGame = true;
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

  // Rect (non-node-backed) platforms: synthetic corner/edge handles derived from
  // position+size+rotation. Dragging resizes via WorldState.updatePlatform.
  private _rectCorners      = new Map<string, RectCornerEntry>(); // key: "platId#c<i>"
  private _rectEdges        = new Map<string, RectEdgeEntry>();   // key: "platId#e<i>"
  private _hoveredRectCorner: string | null = null;
  private _hoveredRectEdge:   string | null = null;
  private _dragRectPlatId:    string | null = null;
  private _dragRectKind:      "corner" | "edge" | null = null;
  private _dragRectIndex     = -1;
  private _dragRectOrig:      RectOrig | null = null;

  // Rect-floor constraint lookups — keyed by nodeId / floorId
  private _nodeToRectFloor  = new Map<string, string>();   // nodeId → floorId
  private _rectFloorNodes   = new Map<string, string[]>(); // floorId → [id0,id1,id2,id3]

  private _altDown = false;
  private _gizmoActive = false; // a TransformControls gizmo drag is in progress — mute node picking
  private _gameMode = false;   // in Play (game) mode, helpers stay hidden — don't rebuild them
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
        if (this._activeTool !== "select" || this._gizmoActive) return;
        this._onMouseMove(worldPos.x, worldPos.z);
      }),
      this._bus.on("input:mousedown", ({ button }) => {
        if (this._activeTool !== "select" || button !== 0 || this._gizmoActive) return;
        this._onMouseDown();
      }),
      // A gizmo drag (TransformControls) shares the canvas; without this, pressing on a
      // gizmo ring over a node dot behind it would also grab the node. Mute picking while
      // the gizmo is dragging. Fires on pointerdown, before input:mousedown's mousedown.
      // NodeDragger re-emits this for its OWN drags (state==="DRAG" by then) — ignore those
      // so a node drag doesn't mute itself.
      this._bus.on("gizmo:dragging", ({ isDragging }) => {
        this._gizmoActive = isDragging && this._state !== "DRAG";
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
      // Cold load builds zone geometry with no per-entity rebuild event, so refresh
      // here to create the node dots / edge lines that _refresh would otherwise miss.
      // Skip in game mode: helpers are hidden there, and a mid-game zone transition
      // must not resurrect them as fresh (visible) meshes.
      this._bus.on("zone:loaded", () => {
        if (this._activeTool === "select" && this._state !== "DRAG" && !this._gameMode) this._refresh();
      }),
      this._bus.on("preview:start", ({ mode }) => { if (mode === "game") this._gameMode = true; }),
      this._bus.on("preview:stop",  () => { this._gameMode = false; }),
      this._bus.on("platform:updated", () => {
        if (this._activeTool === "select" && this._state !== "DRAG") this._refresh();
      }),
      this._bus.on("floor:updated", () => {
        if (this._activeTool === "select" && this._state !== "DRAG") this._refresh();
      }),
      // Deleting a node-backed polygon prunes its nodes (WorldState); refresh so the
      // stale dots + edge lines for those nodes are cleared from the scene.
      this._bus.on("platform:removed", () => {
        if (this._activeTool === "select" && this._state !== "DRAG") this._refresh();
      }),
      this._bus.on("floor:removed", () => {
        if (this._activeTool === "select" && this._state !== "DRAG") this._refresh();
      }),
      this._bus.on("wall:rebuilt", () => {
        if (this._activeTool === "select" && this._state !== "DRAG") this._refresh();
      }),
      // Deleting a wall run removes the walls then their nodes (separate removeNode calls
      // emit no event). Defer a microtask so the refresh runs after the whole delete, then
      // _refresh rebuilds dots from the remaining geometry — clearing the orphaned dots.
      this._bus.on("wall:removed", () => {
        if (this._activeTool === "select" && this._state !== "DRAG") {
          queueMicrotask(() => { if (this._activeTool === "select" && this._state !== "DRAG") this._refresh(); });
        }
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

    // ── Rect-platform resize drag ──────────────────────────────────────────
    if (this._state === "DRAG" && this._dragRectPlatId) {
      this._onRectDragMove(rawX, rawZ);
      return;
    }

    // ── Hover: corners (node / rect) take priority over edges ──────────────
    const nearestNodeId   = this._findNearestNode(rawX, rawZ);
    const nearestRectCnr  = nearestNodeId ? null : this._findNearestRectCorner(rawX, rawZ);
    const anyCorner       = nearestNodeId || nearestRectCnr;
    const nearestEdgeKey  = anyCorner ? null : this._findNearestEdge(rawX, rawZ);
    const nearestRectEdge = (anyCorner || nearestEdgeKey) ? null : this._findNearestRectEdge(rawX, rawZ);

    if (nearestRectCnr !== this._hoveredRectCorner) {
      const prev = this._hoveredRectCorner ? this._rectCorners.get(this._hoveredRectCorner) : null;
      if (prev) this._styleDot(prev.dot, "idle");
      const next = nearestRectCnr ? this._rectCorners.get(nearestRectCnr) : null;
      if (next) this._styleDot(next.dot, "hover");
      this._hoveredRectCorner = nearestRectCnr;
    }

    if (nearestRectEdge !== this._hoveredRectEdge) {
      const prev = this._hoveredRectEdge ? this._rectEdges.get(this._hoveredRectEdge) : null;
      if (prev) this._setEdgeStyle(prev.line, false);
      const next = nearestRectEdge ? this._rectEdges.get(nearestRectEdge) : null;
      if (next) this._setEdgeStyle(next.line, true);
      this._hoveredRectEdge = nearestRectEdge;
    }

    if (nearestNodeId !== this._hoveredNodeId) {
      if (this._hoveredNodeId) {
        const dot = this._nodeDots.get(this._hoveredNodeId);
        if (dot) {
          (dot.material as THREE.MeshBasicMaterial).color.setHex(0x6699bb);
          (dot.material as THREE.MeshBasicMaterial).opacity = 0.48;
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

    document.body.style.cursor =
      (nearestNodeId || nearestRectCnr || nearestEdgeKey || nearestRectEdge) ? "move" : "";
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
      this._world.beginTransaction("move node");
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

    if (this._hoveredRectCorner || this._hoveredRectEdge) {
      const isCorner = !!this._hoveredRectCorner;
      const entry = isCorner
        ? this._rectCorners.get(this._hoveredRectCorner!)
        : this._rectEdges.get(this._hoveredRectEdge!);
      if (!entry) return;
      const plat = zone.platforms.find(p => p.id === entry.platformId);
      if (!plat) return;
      this._dragRectPlatId = entry.platformId;
      this._dragRectKind   = isCorner ? "corner" : "edge";
      this._dragRectIndex  = entry.index;
      this._dragRectOrig   = {
        cx: plat.position.x, cz: plat.position.z, posY: plat.position.y,
        thickness: plat.thickness, w: plat.size.width, d: plat.size.depth,
        theta: ((plat.rotation?.y ?? 0) * Math.PI) / 180,
      };
      this._state = "DRAG";
      this._world.beginTransaction("resize platform");
      this._bus.emit("gizmo:dragging", { isDragging: true });
      if (isCorner) this._styleDot(this._rectCorners.get(this._hoveredRectCorner!)!.dot, "drag");
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
      this._world.beginTransaction("move edge");
      this._bus.emit("gizmo:dragging", { isDragging: true });
      document.body.style.cursor = "grabbing";
    }
  }

  private _onMouseUp(): void {
    if (this._state !== "DRAG") return;
    this._world.commitTransaction();  // the live updateNode calls collapse into one undo step
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

    if (this._dragRectPlatId && this._dragRectOrig) {
      const o = this._dragRectOrig;
      this._world.updatePlatform(this._activeZoneId, this._dragRectPlatId, {
        position: { x: o.cx, y: o.posY, z: o.cz },
        size:     { width: o.w, depth: o.d },
      });
      this._repositionRectPlatform(this._dragRectPlatId, o.cx, o.cz, o.w, o.d, o.theta);
    }

    this._world.abortTransaction();  // reverted above — discard the journal, no undo entry
    this._endDrag();
  }

  private _endDrag(): void {
    if (this._dragNodeId) {
      const isHovered = this._hoveredNodeId === this._dragNodeId;
      const dot = this._nodeDots.get(this._dragNodeId);
      if (dot) {
        (dot.material as THREE.MeshBasicMaterial).color.setHex(isHovered ? 0x4d8cff : 0x6699bb);
        (dot.material as THREE.MeshBasicMaterial).opacity = isHovered ? 1.0 : 0.48;
        dot.scale.setScalar(isHovered ? 1.4 : 1);
      }
    }

    if (this._dragEdgeKey) {
      const e = this._edgeEntries.get(this._dragEdgeKey);
      if (e) this._setEdgeStyle(e.line, this._hoveredEdgeKey === this._dragEdgeKey);
    }

    if (this._dragRectKind === "corner" && this._hoveredRectCorner) {
      const c = this._rectCorners.get(this._hoveredRectCorner);
      if (c) this._styleDot(c.dot, "hover");
    }

    this._dragNodeId     = null;
    this._dragOrigPos    = null;
    this._dragEdgeKey    = null;
    this._dragEdgeOrig   = null;
    this._dragEdgeStart  = null;
    this._dragRectPlatId = null;
    this._dragRectKind   = null;
    this._dragRectIndex  = -1;
    this._dragRectOrig   = null;
    this._state          = "IDLE";

    this._bus.emit("gizmo:dragging", { isDragging: false });
    document.body.style.cursor =
      (this._hoveredNodeId || this._hoveredRectCorner || this._hoveredEdgeKey || this._hoveredRectEdge)
        ? "move" : "";
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

    // Build a nodeId → world Y lookup. Higher-priority sources overwrite lower ones.
    // Priority: platform top-face > floor elevation > wall elevation > ground default.
    const nodeY = new Map<string, number>();

    for (const wall of zone.walls) {
      const y = (wall.elevation ?? 0) + 0.12;
      for (const id of [wall.startNodeId, wall.endNodeId]) {
        if (!nodeY.has(id) || nodeY.get(id)! < y) nodeY.set(id, y);
      }
    }
    for (const floor of zone.floors) {
      if (!floor.floorMesh.nodeIds) continue;
      const y = floor.elevation + 0.12;
      for (const id of floor.floorMesh.nodeIds) {
        if (!nodeY.has(id) || nodeY.get(id)! < y) nodeY.set(id, y);
      }
    }
    for (const platform of zone.platforms) {
      if (!platform.nodeIds?.length) continue;
      const y = platform.position.y + platform.thickness + 0.06;
      for (const id of platform.nodeIds) nodeY.set(id, y);
    }

    for (const node of zone.nodes) {
      const y = nodeY.get(node.id) ?? 0.12;
      this._nodeDotY.set(node.id, y);
      const dot = makeNodeDot();
      dot.position.set(node.x, y, node.z);
      this._scene.add(dot);
      this._nodeDots.set(node.id, dot);
    }

    for (const floor of zone.floors) {
      const ids = floor.floorMesh.nodeIds;
      if (!ids || ids.length < 3) continue;
      const edgeY = floor.elevation + 0.04;

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

        const line = makeEdgeLine(n1.x, n1.z, n2.x, n2.z, edgeY);
        this._scene.add(line);
        this._edgeEntries.set(key, { nodeId1: id1, nodeId2: id2, line, axisConstraint, y: edgeY });
      }
    }

    for (const platform of zone.platforms) {
      const ids = platform.nodeIds;
      if (!ids || ids.length < 3) {
        // Rect (non-node-backed) platform: synthesize corner + edge handles.
        this._buildRectPlatform(platform.id, platform.position.x, platform.position.z,
          platform.position.y + platform.thickness, platform.size.width, platform.size.depth,
          ((platform.rotation?.y ?? 0) * Math.PI) / 180);
        continue;
      }
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

  // ── Rect-platform handles ────────────────────────────────────────────────────

  private _buildRectPlatform(id: string, cx: number, cz: number, topY: number, w: number, d: number, theta: number): void {
    const corners = rectCorners(cx, cz, w, d, theta);
    const dotY  = topY + 0.06;
    const edgeY = topY + 0.04;
    for (let i = 0; i < 4; i++) {
      const dot = makeNodeDot();
      dot.position.set(corners[i]!.x, dotY, corners[i]!.z);
      this._scene.add(dot);
      this._rectCorners.set(`${id}#c${i}`, { platformId: id, index: i, dot, y: dotY });
    }
    for (let i = 0; i < 4; i++) {
      const a = corners[i]!, b = corners[(i + 1) % 4]!;
      const line = makeEdgeLine(a.x, a.z, b.x, b.z, edgeY);
      this._scene.add(line);
      this._rectEdges.set(`${id}#e${i}`, { platformId: id, index: i, line, y: edgeY });
    }
  }

  private _repositionRectPlatform(id: string, cx: number, cz: number, w: number, d: number, theta: number): void {
    const corners = rectCorners(cx, cz, w, d, theta);
    for (let i = 0; i < 4; i++) {
      const c   = this._rectCorners.get(`${id}#c${i}`);
      if (c) c.dot.position.set(corners[i]!.x, c.y, corners[i]!.z);
      const e   = this._rectEdges.get(`${id}#e${i}`);
      if (e) {
        const a = corners[i]!, b = corners[(i + 1) % 4]!;
        const pos = e.line.geometry.attributes["position"] as THREE.BufferAttribute;
        pos.setXYZ(0, a.x, e.y, a.z);
        pos.setXYZ(1, b.x, e.y, b.z);
        pos.needsUpdate = true;
      }
    }
  }

  private _styleDot(dot: THREE.Mesh, mode: "idle" | "hover" | "drag"): void {
    const m = dot.material as THREE.MeshBasicMaterial;
    if (mode === "idle")       { m.color.setHex(0x6699bb); m.opacity = 0.48; dot.scale.setScalar(1); }
    else if (mode === "hover") { m.color.setHex(0x4d8cff); m.opacity = 1.0;  dot.scale.setScalar(1.4); }
    else                       { m.color.setHex(0xffffff); m.opacity = 1.0;  dot.scale.setScalar(1.8); }
  }

  private _findNearestRectCorner(rawX: number, rawZ: number): string | null {
    let bestKey: string | null = null;
    let bestDist = SNAP_RADIUS;
    for (const [key, c] of this._rectCorners) {
      const { x, z } = this._projectRayToY(rawX, rawZ, c.y);
      const d = Math.hypot(c.dot.position.x - x, c.dot.position.z - z);
      if (d < bestDist) { bestDist = d; bestKey = key; }
    }
    return bestKey;
  }

  private _findNearestRectEdge(rawX: number, rawZ: number): string | null {
    let bestKey: string | null = null;
    let bestDist = EDGE_RADIUS;
    for (const [key, e] of this._rectEdges) {
      const p = e.line.geometry.attributes["position"] as THREE.BufferAttribute;
      const { x, z } = this._projectRayToY(rawX, rawZ, e.y);
      const d = distToSegment(x, z, p.getX(0), p.getZ(0), p.getX(1), p.getZ(1));
      if (d < bestDist) { bestDist = d; bestKey = key; }
    }
    return bestKey;
  }

  private _onRectDragMove(rawX: number, rawZ: number): void {
    const o = this._dragRectOrig;
    if (!o || !this._dragRectPlatId) return;
    const { x: px, z: pz } = this._projectRayToY(rawX, rawZ, o.posY + o.thickness + 0.06);
    const mx = this._altDown ? px : snap(px);
    const mz = this._altDown ? pz : snap(pz);

    const cos = Math.cos(o.theta), sin = Math.sin(o.theta);
    const eX = { x: cos, z: -sin }, eZ = { x: sin, z: cos };
    const origCorners = rectCorners(o.cx, o.cz, o.w, o.d, o.theta);

    let cx: number, cz: number, w: number, d: number;

    if (this._dragRectKind === "corner") {
      const i   = this._dragRectIndex;
      const opp = origCorners[(i + 2) % 4]!;
      const dx  = mx - opp.x, dz = mz - opp.z;
      w = Math.max(MIN_SIZE, Math.abs(dx * eX.x + dz * eX.z));
      d = Math.max(MIN_SIZE, Math.abs(dx * eZ.x + dz * eZ.z));
      const [sx, sz] = CORNER_SIGN[i]!;
      cx = opp.x + eX.x * (sx * w / 2) + eZ.x * (sz * d / 2);
      cz = opp.z + eX.z * (sx * w / 2) + eZ.z * (sz * d / 2);
    } else {
      const i    = this._dragRectIndex;
      const [nx, nz] = EDGE_NORMAL[i]!;
      const nrm  = { x: eX.x * nx + eZ.x * nz, z: eX.z * nx + eZ.z * nz }; // world outward normal (unit)
      const oc1  = origCorners[(i + 2) % 4]!, oc2 = origCorners[(i + 3) % 4]!;
      const oppMid = { x: (oc1.x + oc2.x) / 2, z: (oc1.z + oc2.z) / 2 };
      const signed = Math.max(MIN_SIZE, (mx - oppMid.x) * nrm.x + (mz - oppMid.z) * nrm.z);
      cx = oppMid.x + nrm.x * (signed / 2);
      cz = oppMid.z + nrm.z * (signed / 2);
      if (EDGE_IS_DEPTH[i]) { w = o.w; d = signed; } else { w = signed; d = o.d; }
    }

    this._world.updatePlatform(this._activeZoneId, this._dragRectPlatId, {
      position: { x: cx, y: o.posY, z: cz },
      size:     { width: w, depth: d },
    });
    this._repositionRectPlatform(this._dragRectPlatId, cx, cz, w, d, o.theta);
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

    for (const c of this._rectCorners.values()) {
      this._scene.remove(c.dot);
      c.dot.geometry.dispose();
      (c.dot.material as THREE.Material).dispose();
    }
    this._rectCorners.clear();
    this._hoveredRectCorner = null;

    for (const e of this._rectEdges.values()) {
      this._scene.remove(e.line);
      e.line.geometry.dispose();
      (e.line.material as THREE.Material).dispose();
    }
    this._rectEdges.clear();
    this._hoveredRectEdge = null;

    this._rectFloorNodes.clear();
    this._nodeToRectFloor.clear();
  }

  private _setEdgeStyle(line: THREE.Line, hovered: boolean): void {
    const mat = line.material as THREE.LineBasicMaterial;
    mat.color.setHex(hovered ? 0x5599ff : 0x3366aa);
    mat.opacity = hovered ? 0.85 : 0.42;
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
