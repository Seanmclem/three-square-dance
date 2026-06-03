import * as THREE from "three";
import { groupWallRuns, resolveRunNodeIds, buildNodesMap } from "@/utils/wallRuns";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { IEditorModule, ToolId, Opening, WallDef, SelectedObjectPayload, ScreenPos } from "@/types";
import type { HistoryManager } from "@/editor/HistoryManager";

// ─── Run topology (computed once at drag-start) ───────────────────────────────

interface RunTopo {
  runWalls:    WallDef[];
  resolvedIds: string[];                    // ordered node IDs, no wrap duplicate
  pts:         Array<{ x: number; z: number }>; // world-space polyline (matches resolvedIds)
  isClosed:    boolean;
  segCount:    number;
  cumDist:     number[];  // cumDist[i] = arc from pts[0] to pts[i], length N
  segLens:     number[];  // segLens[i] = length of segment i, length segCount
}

// ─── Drag state ───────────────────────────────────────────────────────────────

interface DragState {
  openingId:   string;
  origWallId:  string;
  zoneId:      string;
  opening:     Opening;   // snapshot at drag start
  wallHeight:  number;
  topo:        RunTopo;
  triggerMesh: THREE.Object3D;
  dragPlane:   THREE.Plane;
  startScreen: ScreenPos;
  active:      boolean;   // false = pending, true = actively dragging
  // Updated each mousemove:
  arcCenter:   number;
  elevation:   number;
  segIndex:    number;
}

// ─── Pure topology helpers ────────────────────────────────────────────────────

function buildRunTopo(
  runWalls: WallDef[],
  rawIds:   string[],
  pts:      Array<{ x: number; z: number }>,
): RunTopo {
  const isClosed  = rawIds.length > 2 && rawIds[0] === rawIds[rawIds.length - 1];
  const resolvedIds = isClosed ? rawIds.slice(0, -1) : rawIds;
  const actualPts   = isClosed ? pts.slice(0, -1)    : pts;
  const N         = actualPts.length;
  const segCount  = isClosed ? N : N - 1;

  // cumDist[i] = arc from pts[0] to pts[i]  (N entries)
  const cumDist: number[] = [0];
  for (let i = 1; i < N; i++) {
    cumDist.push(cumDist[i - 1]! + Math.hypot(
      actualPts[i]!.x - actualPts[i - 1]!.x,
      actualPts[i]!.z - actualPts[i - 1]!.z,
    ));
  }

  // segLens[i] = length of segment i  (segCount entries)
  const segLens: number[] = [];
  for (let i = 0; i < segCount; i++) {
    const j = (i + 1) % N;
    segLens.push(Math.hypot(
      actualPts[j]!.x - actualPts[i]!.x,
      actualPts[j]!.z - actualPts[i]!.z,
    ) || 0.001);
  }

  return { runWalls, resolvedIds, pts: actualPts, isClosed, segCount, cumDist, segLens };
}

/** Project world point P onto the run centerline; returns arc length and segment index. */
function projectToPolyline(P: THREE.Vector3, topo: RunTopo): { arcLength: number; segIndex: number } {
  const { pts, cumDist, segLens, segCount } = topo;
  const N = pts.length;
  let bestArc = 0, bestSeg = 0, bestDist = Infinity;

  for (let i = 0; i < segCount; i++) {
    const j  = (i + 1) % N;
    const ax = pts[i]!.x, az = pts[i]!.z;
    const dx = pts[j]!.x - ax, dz = pts[j]!.z - az;
    const len = segLens[i]!;
    const px  = P.x - ax,  pz  = P.z - az;
    const t   = Math.max(0, Math.min(1, (px * dx + pz * dz) / (len * len)));
    const dist = Math.hypot(P.x - (ax + dx * t), P.z - (az + dz * t));
    if (dist < bestDist) { bestDist = dist; bestSeg = i; bestArc = cumDist[i]! + t * len; }
  }
  return { arcLength: bestArc, segIndex: bestSeg };
}

/** Find which segment an arc-center position belongs to. */
function findSegForArc(arcCenter: number, topo: RunTopo): number {
  const { cumDist, segLens } = topo;
  for (let i = 0; i < segLens.length - 1; i++) {
    if (arcCenter < cumDist[i]! + segLens[i]!) return i;
  }
  return segLens.length - 1;
}

/** Compute world position for an opening center at a given arc + elevation. */
function arcToWorld(arcCenter: number, segIndex: number, elevation: number, openingH: number, topo: RunTopo): THREE.Vector3 {
  const { pts, cumDist, segLens } = topo;
  const N  = pts.length;
  const j  = (segIndex + 1) % N;
  const kA = pts[segIndex]!, kB = pts[j]!;
  const len = segLens[segIndex]!;
  const ux  = (kB.x - kA.x) / len, uz = (kB.z - kA.z) / len;
  const d   = arcCenter - cumDist[segIndex]!;
  return new THREE.Vector3(kA.x + ux * d, elevation + openingH / 2, kA.z + uz * d);
}

/** Rotation.y for the trigger mesh at a given segment. */
function segRotY(segIndex: number, topo: RunTopo): number {
  const { pts, segLens } = topo;
  const N  = pts.length;
  const j  = (segIndex + 1) % N;
  const dx = pts[j]!.x - pts[segIndex]!.x;
  const dz = pts[j]!.z - pts[segIndex]!.z;
  return -Math.atan2(dz, dx);
}

/** Map arc center → { wallId, offsetAlongWall } using the same formula as buildRun. */
function arcToOpening(arcCenter: number, segIndex: number, opening: Opening, topo: RunTopo): { newWallId: string; newOffset: number } {
  const { runWalls, resolvedIds, cumDist, segLens } = topo;
  const wall      = runWalls[segIndex]!;
  const isForward = wall.startNodeId === resolvedIds[segIndex];
  const segLen    = segLens[segIndex]!;

  let newOffset: number;
  if (isForward) {
    newOffset = arcCenter - cumDist[segIndex]! - opening.width / 2;
  } else {
    newOffset = cumDist[segIndex]! + segLen - arcCenter - opening.width / 2;
  }
  newOffset = Math.max(0, Math.min(segLen - opening.width, newOffset));
  return { newWallId: wall.id, newOffset };
}

/** Find the arc-center of an opening in a run (inverse of buildRun effectiveLeft). */
function openingArcCenter(opening: Opening, wallIdx: number, topo: RunTopo): number {
  const wall      = topo.runWalls[wallIdx]!;
  const isForward = wall.startNodeId === topo.resolvedIds[wallIdx];
  const segLen    = topo.segLens[wallIdx]!;
  const effectiveLeft = isForward
    ? opening.offsetAlongWall
    : segLen - opening.offsetAlongWall - opening.width;
  return topo.cumDist[wallIdx]! + effectiveLeft + opening.width / 2;
}

// ─── Main class ───────────────────────────────────────────────────────────────

const DRAG_THRESHOLD_PX = 4;

export class OpeningDragHandler implements IEditorModule {
  private _activeTool: ToolId = "select";
  private _armed: { openingId: string; wallId: string; zoneId: string } | null = null;
  private _drag:  DragState | null = null;

  private readonly _raycaster = new THREE.Raycaster();
  private readonly _ndcMouse  = new THREE.Vector2();
  private readonly _unsubs:   Array<() => void> = [];

  constructor(
    private readonly _scene:   THREE.Scene,
    private readonly _cam:     THREE.PerspectiveCamera,
    private readonly _dom:     HTMLCanvasElement,
    private readonly _world:   WorldState,
    private readonly _bus:     EventBus,
    private readonly _history: HistoryManager,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("tool:select",      ({ tool })     => { this._activeTool = tool; if (tool !== "select") this._abort(); }),
      this._bus.on("object:selected",  p             => { if (p.type === "opening") this._onArm(p); else this._abort(); }),
      this._bus.on("object:deselected",()            => this._abort()),
      this._bus.on("input:mousedown",  ({ button, screenPos }) => { if (button === 0 && this._activeTool === "select") this._onDown(screenPos); }),
      this._bus.on("input:mousemove",  ({ screenPos }) => this._onMove(screenPos)),
      this._bus.on("input:mouseup",    ({ button })  => { if (button === 0) this._onUp(); }),
      this._bus.on("input:keydown",    ({ code })    => { if (code === "Escape") this._abort(); }),
    );
  }

  update(_dt: number): void {}

  dispose(): void {
    this._abort();
    this._unsubs.forEach(u => u());
  }

  // ── Internal event handlers ───────────────────────────────────────────────

  private _onArm(payload: SelectedObjectPayload): void {
    this._armed = { openingId: payload.id, wallId: payload.parentId ?? "", zoneId: payload.zoneId };
  }

  private _onDown(screenPos: ScreenPos): void {
    if (!this._armed) return;
    const { openingId, wallId, zoneId } = this._armed;

    const zone    = this._world.zones.get(zoneId);
    const wall    = zone?.walls.find(w => w.id === wallId);
    const opening = wall?.openings.find(o => o.id === openingId);
    if (!zone || !wall || !opening) return;

    // Build run topology
    const nodesMap = buildNodesMap(zone);
    const allRuns  = groupWallRuns(zone, nodesMap);
    const run      = allRuns.find(r => r.some(w => w.id === wallId));
    if (!run) return;
    const rawIds = resolveRunNodeIds(run);
    if (!rawIds) return;

    // rawIds may have N+1 entries for closed loops (first === last) — buildRunTopo handles it
    const rawPts = rawIds.map(id => { const n = nodesMap.get(id)!; return { x: n.x, z: n.z }; });
    const topo   = buildRunTopo(run, rawIds, rawPts);

    const wallIdx = topo.runWalls.findIndex(w => w.id === wallId);
    if (wallIdx < 0) return;

    const initArc  = openingArcCenter(opening, wallIdx, topo);
    const initSeg  = findSegForArc(initArc, topo);

    // Find the trigger mesh via scene traversal
    let triggerMesh: THREE.Object3D | null = null;
    this._scene.traverse(obj => {
      if (!triggerMesh &&
          obj.userData["editorId"]   === openingId &&
          obj.userData["editorType"] === "opening" &&
          obj.userData["zoneId"]     === zoneId)
        triggerMesh = obj;
    });
    if (!triggerMesh) return;

    // Drag plane: vertical, facing the camera, passing through the opening center.
    // Camera-facing ensures a valid ray intersection regardless of wall orientation.
    const openingPos = arcToWorld(initArc, initSeg, opening.elevation, opening.height, topo);
    const toCamH     = new THREE.Vector3(
      this._cam.position.x - openingPos.x, 0, this._cam.position.z - openingPos.z,
    );
    const horizDist = toCamH.length();
    if (horizDist > 0.1) toCamH.divideScalar(horizDist);
    else {
      // Camera is directly above — fall back to wall segment normal
      const { pts, segLens } = topo;
      const j   = (initSeg + 1) % pts.length;
      const len = segLens[initSeg]!;
      const kUx = (pts[j]!.x - pts[initSeg]!.x) / len;
      const kUz = (pts[j]!.z - pts[initSeg]!.z) / len;
      toCamH.set(kUz, 0, -kUx);
    }
    const dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(toCamH, openingPos);

    this._drag = {
      openingId,
      origWallId: wallId,
      zoneId,
      opening: { ...opening },
      wallHeight: wall.height,
      topo,
      triggerMesh,
      dragPlane,
      startScreen: screenPos,
      active: false,
      arcCenter: initArc,
      elevation: opening.elevation,
      segIndex:  initSeg,
    };
  }

  private _onMove(screenPos: ScreenPos): void {
    const drag = this._drag;
    if (!drag) return;

    if (!drag.active) {
      const dx = screenPos.x - drag.startScreen.x;
      const dy = screenPos.y - drag.startScreen.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      drag.active = true;
      this._bus.emit("gizmo:dragging", { isDragging: true });
      document.body.style.cursor = "grabbing";
    }

    const hit = this._hitPlane(screenPos, drag.dragPlane);
    if (!hit) return;

    const { topo, opening, wallHeight } = drag;

    // Arc center: clamp to a valid range so the opening stays within the run
    const totalLen    = topo.segLens.reduce((a, b) => a + b, 0);
    const rawArc      = projectToPolyline(hit, topo).arcLength;
    const arcCenter   = Math.max(opening.width / 2, Math.min(totalLen - opening.width / 2, rawArc));
    const segIndex    = findSegForArc(arcCenter, topo);

    // Elevation: directly from hit.y, clamped to wall bounds
    const elevation = Math.max(0, Math.min(wallHeight - opening.height, hit.y - opening.height / 2));

    // Move trigger mesh for live preview
    const worldPos = arcToWorld(arcCenter, segIndex, elevation, opening.height, topo);
    drag.triggerMesh.position.copy(worldPos);
    drag.triggerMesh.rotation.y = segRotY(segIndex, topo);

    drag.arcCenter = arcCenter;
    drag.elevation = elevation;
    drag.segIndex  = segIndex;
  }

  private _onUp(): void {
    const drag = this._drag;
    if (!drag) return;
    if (!drag.active) { this._drag = null; return; } // just a click, not a drag

    const { newWallId, newOffset } = arcToOpening(drag.arcCenter, drag.segIndex, drag.opening, drag.topo);
    const newElev = drag.elevation;

    if (newWallId !== drag.origWallId) {
      // Opening migrated to a different wall segment
      this._history.beginBatch("move opening");
      this._world.removeOpening(drag.zoneId, drag.origWallId, drag.openingId);
      this._world.addOpening(drag.zoneId, newWallId, {
        ...drag.opening,
        offsetAlongWall: newOffset,
        elevation:       newElev,
      });
      this._history.commitBatch();
      // SelectionManager will handle re-selection via the wall:rebuilt chain.
      // Deselect here so there's no stale selection on the old wall while rebuilding.
      this._bus.emit("object:deselected", {});
    } else {
      // Same wall — updateOpening triggers wall:updated → ZoneManager rebuild →
      // wall:rebuilt → SelectionManager re-emits object:selected automatically.
      this._history.record("move opening", () => {
        this._world.updateOpening(drag.zoneId, drag.origWallId, drag.openingId, {
          offsetAlongWall: newOffset,
          elevation:       newElev,
        });
      });
    }

    this._cleanupDrag();
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private _hitPlane(screenPos: ScreenPos, plane: THREE.Plane): THREE.Vector3 | null {
    const rect = this._dom.getBoundingClientRect();
    this._ndcMouse.x =  ((screenPos.x - rect.left) / rect.width)  * 2 - 1;
    this._ndcMouse.y = -((screenPos.y - rect.top)  / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._ndcMouse, this._cam);
    const hit = new THREE.Vector3();
    return this._raycaster.ray.intersectPlane(plane, hit) ? hit : null;
  }

  private _abort(): void {
    if (this._drag?.active) this._cleanupDrag();
    this._drag  = null;
    this._armed = null;
  }

  private _cleanupDrag(): void {
    this._bus.emit("gizmo:dragging", { isDragging: false });
    document.body.style.cursor = "";
    this._drag  = null;
    this._armed = null;
  }
}
