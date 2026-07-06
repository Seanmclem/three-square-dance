import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { IEditorModule, Opening, ScreenPos, ToolId, WallDef } from "@/types";

// Don't split so close to a node that it creates a sliver segment.
const MIN_END_DIST = 0.15;

/**
 * Right-click on a wall (Select tool) inserts a vertex at the clicked point,
 * splitting the wall into two connected segments that share the new node.
 * Camera orbit is unaffected: InputManager only emits `input:rightclick` for a
 * stationary RMB press+release (drags never fire it).
 */
export class WallSplitter implements IEditorModule {
  private readonly _scene:  THREE.Scene;
  private readonly _camera: THREE.PerspectiveCamera;
  private readonly _dom:    HTMLCanvasElement;
  private readonly _world:  WorldState;
  private readonly _bus:    EventBus;

  private readonly _raycaster = new THREE.Raycaster();
  private readonly _mouse     = new THREE.Vector2();
  private _activeTool: ToolId = "select";
  private _unsub: Array<() => void> = [];

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    domElement: HTMLCanvasElement,
    worldState: WorldState,
    bus: EventBus,
  ) {
    this._scene  = scene;
    this._camera = camera;
    this._dom    = domElement;
    this._world  = worldState;
    this._bus    = bus;
  }

  init(): void {
    this._unsub.push(
      this._bus.on("input:rightclick", ({ screenPos }) => this._onRightClick(screenPos)),
      this._bus.on("tool:select",      ({ tool })      => { this._activeTool = tool; }),
    );
  }

  update(_dt: number): void {}

  dispose(): void {
    this._unsub.forEach(u => u());
    this._unsub = [];
  }

  private _onRightClick(screenPos: ScreenPos): void {
    if (this._activeTool !== "select") return;

    const rect = this._dom.getBoundingClientRect();
    this._mouse.x =  ((screenPos.x - rect.left) / rect.width)  * 2 - 1;
    this._mouse.y = -((screenPos.y - rect.top)  / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._mouse, this._camera);

    const wallHits = this._raycaster
      .intersectObjects(this._scene.children, true)
      .filter(h => h.object.userData.selectable && h.object.userData.editorType === "wall");
    // Like SelectionManager: hidden-wall ghosts only count when no solid wall is hit.
    const solid = wallHits.filter(h => !h.object.userData.ghostPick);
    const hit   = (solid.length > 0 ? solid : wallHits)[0];
    if (!hit) return;

    const zoneId = hit.object.userData.zoneId as string;
    const zone   = this._world.zones.get(zoneId);
    if (!zone) return;

    // A run mesh spans several walls — find the segment nearest the hit point.
    const wallIds = (hit.object.userData.wallIds as string[] | undefined)
      ?? [hit.object.userData.editorId as string];
    let best: { wall: WallDef; t: number; x: number; z: number; len: number; d2: number } | null = null;
    for (const id of wallIds) {
      const w = zone.walls.find(zw => zw.id === id);
      if (!w) continue;
      const s = zone.nodes.find(n => n.id === w.startNodeId);
      const e = zone.nodes.find(n => n.id === w.endNodeId);
      if (!s || !e) continue;
      const dx = e.x - s.x, dz = e.z - s.z;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-6) continue;
      const t  = ((hit.point.x - s.x) * dx + (hit.point.z - s.z) * dz) / len2;
      const tc = Math.max(0, Math.min(1, t));
      const px = s.x + dx * tc, pz = s.z + dz * tc;
      const d2 = (hit.point.x - px) ** 2 + (hit.point.z - pz) ** 2;
      if (!best || d2 < best.d2) best = { wall: w, t: tc, x: px, z: pz, len: Math.sqrt(len2), d2 };
    }
    if (!best) return;

    const splitDist = best.t * best.len;
    if (splitDist < MIN_END_DIST || best.len - splitDist < MIN_END_DIST) return;

    this._split(zoneId, best.wall, { x: best.x, z: best.z }, splitDist);
  }

  private _split(zoneId: string, wall: WallDef, pt: { x: number; z: number }, splitDist: number): void {
    // Capture before updateWallSegment mutates the def.
    const origEndNodeId = wall.endNodeId;

    // Openings stay with the half that contains their centre; the second half's
    // offsets are re-measured from the new node.
    const keepA: Opening[] = [], moveB: Opening[] = [];
    for (const o of wall.openings) {
      if (o.offsetAlongWall + o.width / 2 <= splitDist) keepA.push(o);
      else moveB.push({ ...o, offsetAlongWall: Math.max(0, o.offsetAlongWall - splitDist) });
    }

    const midNode   = { id: crypto.randomUUID(), x: pt.x, z: pt.z };
    const newWallId = `wall_${crypto.randomUUID().slice(0, 8)}`;

    this._world.transaction("split wall", () => {
      this._world.addNode(zoneId, midNode);
      this._world.updateWallSegment(zoneId, wall.id, { endNodeId: midNode.id, openings: keepA });
      this._world.addWall(zoneId, {
        ...wall,
        id:          newWallId,
        startNodeId: midNode.id,
        endNodeId:   origEndNodeId,
        openings:    moveB,
      });
    });

    // Selects the run (or refreshes the panel if already selected) + syncs history UI.
    this._bus.emit("tool:placed", { type: "wall", id: wall.id, zoneId });
  }
}
