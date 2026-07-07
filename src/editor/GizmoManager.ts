import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import { resolveShapeParams } from "@/builders/ShapeBuilder";
import type {
  IEditorModule, SelectedObjectPayload, SelectedRef,
  PlatformDef, StairDef, FloorDef, WallDef, WallNode, WorldObject, TriggerVolume, DecalDef, ShapeDef,
} from "@/types";

// Decals are translate-only: roll-around-surface-normal maps badly to the world-Y
// rotate ring, so rotation edits stay in the panel / placement scroll.
type GizmoType = "platform" | "stair" | "floor" | "wall" | "object" | "spawn" | "trigger-volume" | "checkpoint" | "decal" | "shape";

export class GizmoManager implements IEditorModule {
  private readonly _scene:      THREE.Scene;
  private readonly _camera:     THREE.PerspectiveCamera;
  private readonly _dom:        HTMLCanvasElement;
  private readonly _worldState: WorldState;
  private readonly _bus:        EventBus;

  private _controls: TransformControls | null = null;
  private readonly _pivot = new THREE.Group();

  private _selId:     string | null   = null;
  private _selZoneId: string | null   = null;
  private _selType:   GizmoType | null = null;

  // Group (multi-select) translate-only mode. When active, _selId/_selType are null and
  // the pivot sits at the centroid of all selected meshes.
  private _groupMode      = false;
  private _groupRefs:     SelectedRef[] = [];
  private _regroupScheduled = false;

  // Meshes that follow the pivot during live preview
  private _trackedMeshes: Array<{
    obj:            THREE.Object3D;
    offset:         THREE.Vector3;         // world offset from pivot (translate preview)
    origLocalPos:   THREE.Vector3;         // local position at selection (for rotate reset)
    origLocalRot:   THREE.Euler;           // local rotation at selection (for rotate reset)
    origParent:     THREE.Object3D | null; // parent to restore to after pivot-attach
  }> = [];
  private _pivotStart       = new THREE.Vector3();
  private _rotateStartAngle = 0;
  private _rotateAttached   = false;

  // Controls-enabled gating: game mode wins, then any suspend source (Colliders
  // panel toggle / collider move gizmo), then the transient handle-hover mute.
  private _inGame    = false;
  private _hoverMute = false;
  private readonly _suspends = new Set<string>();

  // Wall-run node IDs and wall IDs collected at selection time
  private _wallNodeIds: string[] = [];
  private _wallRunIds:  string[] = [];

  // Stair start/end snapshot taken at the start of each drag (for rotate commit)
  private _stairDragSnapshot: { start: { x: number; y: number; z: number }; end: { x: number; y: number; z: number } } | null = null;
  // Wall-node snapshot taken at the start of each rotate drag
  private _wallDragSnapshot: Array<{ id: string; x: number; z: number }> | null = null;
  // Polygon platform snapshot taken at the start of each drag (for rotate commit)
  private _polyPlatDragSnapshot: {
    cx: number; cz: number;
    nodes: Array<{ id: string; x: number; z: number }>;
    points?: Array<{ x: number; z: number }>;
  } | null = null;

  private _objInitialScale = new THREE.Vector3(1, 1, 1);

  private _unsubs: Array<() => void> = [];

  constructor(
    scene:      THREE.Scene,
    camera:     THREE.PerspectiveCamera,
    dom:        HTMLCanvasElement,
    worldState: WorldState,
    bus:        EventBus,
  ) {
    this._scene      = scene;
    this._camera     = camera;
    this._dom        = dom;
    this._worldState = worldState;
    this._bus        = bus;
  }

  init(): void {
    this._scene.add(this._pivot);

    this._controls = new TransformControls(this._camera, this._dom);
    this._controls.setSize(0.65);
    this._controls.setSpace("world");

    this._controls.addEventListener("dragging-changed", e => {
      const isDragging = (e as unknown as { value: boolean }).value;
      this._bus.emit("gizmo:dragging", { isDragging });
      if (isDragging) this._onDragStart();
      else            this._onDragEnd();
    });

    this._controls.addEventListener("objectChange", () => this._onObjectChange());

    this._scene.add(this._controls);

    this._unsubs.push(
      this._bus.on("object:selected",  payload => this._onSelect(payload)),
      this._bus.on("object:deselected", ()     => this._detach()),
      this._bus.on("selection:changed", ({ refs }) => this._onSelectionChanged(refs)),

      // Re-attach after async rebuild (SelectionManager also re-emits object:selected,
      // but _reattachMeshes runs first to avoid a one-frame pop of the old pivot)
      this._bus.on("platform:rebuilt", ({ zoneId, platformId }) => {
        if (platformId === this._selId && zoneId === this._selZoneId) this._reattachMeshes();
        else if (this._groupMode && this._groupHas(platformId)) this._scheduleRegroup();
      }),
      this._bus.on("stair:rebuilt", ({ zoneId, stairId }) => {
        if (stairId === this._selId && zoneId === this._selZoneId) this._reattachMeshes();
        else if (this._groupMode && this._groupHas(stairId)) this._scheduleRegroup();
      }),
      this._bus.on("floor:rebuilt", ({ zoneId, floorId }) => {
        if (floorId === this._selId && zoneId === this._selZoneId) this._reattachMeshes();
        else if (this._groupMode && this._groupHas(floorId)) this._scheduleRegroup();
      }),
      this._bus.on("wall:rebuilt", ({ wallId }) => {
        if (this._groupMode && this._groupHas(wallId)) this._scheduleRegroup();
      }),
      this._bus.on("triggervolume:updated", ({ zoneId, id }) => {
        if (id === this._selId && zoneId === this._selZoneId) this._reattachMeshes();
        else if (this._groupMode && this._groupHas(id)) this._scheduleRegroup();
      }),
      this._bus.on("decal:rebuilt", ({ zoneId, decalId }) => {
        if (decalId === this._selId && zoneId === this._selZoneId) this._reattachMeshes();
        else if (this._groupMode && this._groupHas(decalId)) this._scheduleRegroup();
      }),
      this._bus.on("shape:rebuilt", ({ zoneId, shapeId }) => {
        if (shapeId === this._selId && zoneId === this._selZoneId) this._reattachMeshes();
        else if (this._groupMode && this._groupHas(shapeId)) this._scheduleRegroup();
      }),
      // Spawn has no rebuild event; re-seed the pivot after each commit so repeated
      // rotations don't accumulate stale pivot/tracked-mesh state. (zoneId is "" for spawn.)
      // Deferred a microtask so it runs AFTER SpawnPointTool rebuilds the marker (both listen
      // to spawn:updated) and after TransformControls' drag-end fully unwinds — then
      // _updateMeshOffsets re-tracks the fresh marker rather than the just-removed one.
      this._bus.on("spawn:updated", () => {
        if (this._selType !== "spawn" || this._selId !== "__spawn__") return;
        queueMicrotask(() => {
          if (this._selType === "spawn" && this._selId === "__spawn__") this._reattachMeshes();
        });
      }),
      // Checkpoint markers are rebuilt fresh by CheckpointTool on checkpoint:updated (both
      // listen). Defer a microtask so we re-track the new marker, mirroring spawn.
      this._bus.on("checkpoint:updated", ({ zoneId, id }) => {
        if (this._selType !== "checkpoint" || this._selId !== id || this._selZoneId !== zoneId) return;
        queueMicrotask(() => {
          if (this._selType === "checkpoint" && this._selId === id) this._reattachMeshes();
        });
      }),

      // A collider face handle is hovered — suspend TransformControls so the handle wins
      // the pick (TC's invisible picker zones blanket small objects). Editor-only: the
      // ColliderEditor never hovers during preview, so this can't fight the game-mode disable.
      this._bus.on("collider:handle-hover", ({ hovering }) => {
        this._hoverMute = hovering;
        this._applyControlsEnabled();
      }),
      // Longer-lived suspensions (Colliders panel toggle, collider move gizmo).
      this._bus.on("gizmo:suspend", ({ source, suspended }) => {
        if (suspended) this._suspends.add(source); else this._suspends.delete(source);
        this._applyControlsEnabled();
      }),

      // Game mode: hide the gizmo (Preview keeps it). Restore on exit — visible only if
      // something is still attached, so an existing selection's gizmo reappears.
      this._bus.on("preview:start", ({ mode }) => {
        if (mode === "game") { this._inGame = true; this._applyControlsEnabled(); }
      }),
      this._bus.on("preview:stop", () => {
        this._inGame = false;
        this._applyControlsEnabled();
      }),

      this._bus.on("input:keydown", ({ code, ctrl, meta }) => {
        if (!this._controls || (this._selId === null && !this._groupMode)) return;
        if (ctrl || meta) return;  // T/R/S are bare keys — don't fire on Cmd+S, Cmd+R, etc.
        if (this._groupMode) return;  // group is translate-only — ignore T/R/S mode switches
        if (code === "KeyT") { this._controls.setMode("translate"); this._syncAxisVisibility(); }
        if (code === "KeyR" && (this._selType === "platform" || this._selType === "stair" || this._selType === "wall" || this._selType === "object" || this._selType === "trigger-volume" || this._selType === "spawn" || this._selType === "checkpoint" || this._selType === "shape")) {
          this._controls.setMode("rotate");
          this._syncAxisVisibility();
        }
        if (code === "KeyS" && this._selType === "object") {
          this._controls.setMode("scale");
          this._syncAxisVisibility();
        }
      }),
    );
  }

  update(_dt: number): void {}

  /** Recompute controls enabled/visible from game mode, suspend sources, and hover mute. */
  private _applyControlsEnabled(): void {
    if (!this._controls) return;
    if (this._inGame) {
      this._controls.enabled = false;
      this._controls.visible = false;
      return;
    }
    const suspended = this._suspends.size > 0;
    this._controls.enabled = !suspended && !this._hoverMute;
    this._controls.visible = !suspended && this._controls.object != null;
  }

  dispose(): void {
    this._unsubs.forEach(u => u());
    this._unsubs = [];
    this._detach();
    if (this._controls) {
      this._scene.remove(this._controls);
      this._controls.dispose();
      this._controls = null;
    }
    this._scene.remove(this._pivot);
  }

  // ─── Selection ────────────────────────────────────────────────────────────

  private _onSelect(payload: SelectedObjectPayload): void {
    // A single-entity selection always supersedes any group mode.
    this._groupMode = false;
    this._groupRefs = [];

    const type = payload.type as string;
    if (!["platform", "stair", "floor", "wall", "object", "spawn", "trigger-volume", "checkpoint", "decal", "shape"].includes(type)) {
      this._detach(); return;
    }

    const sameObject = this._selId === payload.id && this._selZoneId === payload.zoneId;

    // A rebuild-triggered re-selection of the same object during a rotate drag would
    // call pivot.rotation.set(0, storedRotY, 0) and wipe the live drag rotation.
    if (this._rotateAttached && sameObject) {
      return;
    }

    this._selId     = payload.id;
    this._selZoneId = payload.zoneId;
    this._selType   = type as GizmoType;

    // Only reset to translate on a genuinely new selection; preserve mode across rebuilds
    if (!sameObject) this._controls?.setMode("translate");

    let px = payload.position.x;
    let py = payload.position.y + 0.3;
    let pz = payload.position.z;
    let rotY = 0;

    if (type === "platform") {
      const plat = this._getPlatform();
      // For polygon platforms (baked rotation), preserve the current pivot angle on
      // rebuild-triggered re-selections (sameObject) so the gizmo ring stays put.
      // On fresh selections (sameObject = false), reset to 0 (no stored angle).
      const isPolyPlat = !!(plat?.nodeIds?.length);
      rotY = (isPolyPlat && sameObject)
        ? this._pivotYaw()
        : (plat?.rotation?.y ? THREE.MathUtils.degToRad(plat.rotation.y) : 0);

    } else if (type === "stair") {
      const stair = this._getStair();
      if (stair) {
        px = (stair.start.x + stair.end.x) / 2;
        pz = (stair.start.z + stair.end.z) / 2;
        py = Math.max(stair.start.y, stair.end.y) + 0.3;
      }

    } else if (type === "wall") {
      const center = this._wallRunCenter(payload);
      px = center.x;
      pz = center.z;
      this._wallNodeIds = this._collectWallNodeIds(payload);
      this._wallRunIds  = this._collectWallRunIds(payload);

    } else if (type === "object") {
      const obj = this._getObject();
      if (obj) {
        px = obj.position.x;
        py = obj.position.y;
        pz = obj.position.z;
        rotY = THREE.MathUtils.degToRad(obj.rotation.y);
        this._objInitialScale.set(obj.scale.x, obj.scale.y, obj.scale.z);
      }

    } else if (type === "floor") {
      this._wallNodeIds = [];
      const floorDef = payload.data as FloorDef | null;
      if (floorDef) {
        py = floorDef.elevation + 0.3;
        // floorMesh.points is a build-time-only cache for node-backed floors — it isn't
        // written back to WorldState when nodes move, so read live node positions instead.
        const nodeIds = floorDef.floorMesh.nodeIds;
        const zoneForNodes = this._worldState.zones.get(payload.zoneId);
        const pts = (nodeIds?.length && zoneForNodes)
          ? nodeIds
              .map(id => zoneForNodes.nodes.find(n => n.id === id))
              .filter((n): n is WallNode => !!n)
          : floorDef.floorMesh.points;
        if (pts && pts.length > 0) {
          px = pts.reduce((s, p) => s + p.x, 0) / pts.length;
          pz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
        } else {
          const zone = this._worldState.zones.get(payload.zoneId);
          if (zone) {
            px = zone.bounds.x + zone.bounds.width  / 2;
            pz = zone.bounds.z + zone.bounds.depth  / 2;
          }
        }
      }
    } else if (type === "trigger-volume") {
      const vol = payload.data as TriggerVolume | null;
      if (vol) {
        px = vol.position.x;
        py = vol.position.y + vol.size.y / 2;
        pz = vol.position.z;
        rotY = vol.rotation?.y ? THREE.MathUtils.degToRad(vol.rotation.y) : 0;
      }
    } else if (type === "decal") {
      const dec = payload.data as DecalDef | null;
      if (dec) {
        // Pivot floats slightly off the surface along the decal's normal.
        px = dec.position.x + dec.normal.x * 0.3;
        py = dec.position.y + dec.normal.y * 0.3;
        pz = dec.position.z + dec.normal.z * 0.3;
      }
    } else if (type === "shape") {
      const shape = this._getShape();
      if (shape) {
        py   = this._shapeTopY(shape) + 0.3;
        rotY = THREE.MathUtils.degToRad(shape.rotation.y);
      }
    } else if (type === "spawn") {
      rotY = THREE.MathUtils.degToRad(this._worldState.world?.defaultSpawn?.facingDeg ?? 0);
    } else if (type === "checkpoint") {
      const cp = this._worldState.zones.get(payload.zoneId)?.checkpoints?.find(c => c.id === payload.id);
      rotY = THREE.MathUtils.degToRad(cp?.facingDeg ?? 0);
    }

    this._pivot.position.set(px, py, pz);
    this._pivot.rotation.set(0, rotY, 0);
    this._pivotStart.copy(this._pivot.position);

    this._updateMeshOffsets();
    this._syncAxisVisibility();
    this._controls?.attach(this._pivot);
  }

  private _detach(): void {
    this._detachFromPivot();
    this._controls?.detach();
    this._selId      = null;
    this._selZoneId  = null;
    this._selType    = null;
    this._groupMode  = false;
    this._groupRefs  = [];
    this._trackedMeshes = [];
    this._wallNodeIds   = [];
    this._wallRunIds    = [];
    this._stairDragSnapshot    = null;
    this._wallDragSnapshot     = null;
    this._polyPlatDragSnapshot = null;
  }

  // ─── Group (multi-select) translate ─────────────────────────────────────────

  private _onSelectionChanged(refs: SelectedRef[]): void {
    if (refs.length <= 1) {
      // Single (or empty) selection is driven by object:selected / object:deselected.
      if (this._groupMode) { this._groupMode = false; this._groupRefs = []; }
      return;
    }
    this._buildGroup(refs);
  }

  private _groupHas(id: string): boolean {
    return this._groupRefs.some(r => r.id === id || (r.memberIds?.includes(id) ?? false));
  }

  private _groupIdSet(): Set<string> {
    const ids = new Set<string>();
    for (const ref of this._groupRefs) {
      ids.add(ref.id);
      ref.memberIds?.forEach(id => ids.add(id));
    }
    return ids;
  }

  /** Meshes (deduped to roots) whose editorId is in the group's id set, with world positions. */
  private _collectGroupMeshes(idSet: Set<string>): Array<{ obj: THREE.Object3D; worldPos: THREE.Vector3 }> {
    const out: Array<{ obj: THREE.Object3D; worldPos: THREE.Vector3 }> = [];
    const wp = new THREE.Vector3();
    this._scene.traverse(obj => {
      const eid = obj.userData["editorId"] as string | undefined;
      if (!eid || !idSet.has(eid)) return;
      if ((obj.userData as { _hasCsgCuts?: boolean })._hasCsgCuts) return;
      // Skip if any ancestor is also a selected root — it moves as part of that ancestor.
      let anc = obj.parent;
      while (anc) {
        const aid = anc.userData["editorId"] as string | undefined;
        if (aid && idSet.has(aid)) return;
        anc = anc.parent;
      }
      obj.getWorldPosition(wp);
      out.push({ obj, worldPos: wp.clone() });
    });
    return out;
  }

  /** An entity's visual center, derived from world data (used to place the group pivot). */
  private _refDisplayPos(ref: SelectedRef): THREE.Vector3 | null {
    const zone = this._worldState.zones.get(ref.zoneId);
    if (!zone) return null;
    switch (ref.type) {
      case "object": {
        const o = zone.objects.find(x => x.id === ref.id);
        return o ? new THREE.Vector3(o.position.x, o.position.y, o.position.z) : null;
      }
      case "platform": {
        const p = zone.platforms.find(x => x.id === ref.id);
        return p ? new THREE.Vector3(p.position.x, p.position.y, p.position.z) : null;
      }
      case "stair": {
        const s = zone.stairs.find(x => x.id === ref.id);
        return s ? new THREE.Vector3((s.start.x + s.end.x) / 2, (s.start.y + s.end.y) / 2, (s.start.z + s.end.z) / 2) : null;
      }
      case "trigger-volume": {
        const v = zone.triggerVolumes?.find(x => x.id === ref.id);
        return v ? new THREE.Vector3(v.position.x, v.position.y, v.position.z) : null;
      }
      case "decal": {
        const d = zone.decals?.find(x => x.id === ref.id);
        return d ? new THREE.Vector3(d.position.x, d.position.y, d.position.z) : null;
      }
      case "shape": {
        const s = zone.shapes?.find(x => x.id === ref.id);
        return s ? new THREE.Vector3(s.position.x, s.position.y, s.position.z) : null;
      }
      case "floor": {
        const f = zone.floors.find(x => x.id === ref.id);
        if (!f) return null;
        const pts = f.floorMesh.points;
        if (pts && pts.length > 0) {
          const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
          const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
          return new THREE.Vector3(cx, f.elevation, cz);
        }
        return new THREE.Vector3(zone.bounds.x + zone.bounds.width / 2, f.elevation, zone.bounds.z + zone.bounds.depth / 2);
      }
      case "wall": {
        const ids = ref.memberIds?.length ? ref.memberIds : [ref.id];
        const nodeIds = new Set<string>();
        for (const wid of ids) {
          const w = zone.walls.find(x => x.id === wid);
          if (w) { nodeIds.add(w.startNodeId); nodeIds.add(w.endNodeId); }
        }
        const nodes = [...nodeIds].map(id => zone.nodes.find(n => n.id === id)).filter((n): n is WallNode => !!n);
        if (nodes.length === 0) return null;
        const cx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
        const cz = nodes.reduce((s, n) => s + n.z, 0) / nodes.length;
        return new THREE.Vector3(cx, 0, cz);
      }
      default:
        return null;
    }
  }

  private _buildGroup(refs: SelectedRef[]): void {
    this._groupMode = true;
    this._groupRefs = refs;
    this._selId     = null;
    this._selType   = null;
    this._selZoneId = refs[0].zoneId;
    this._controls?.setMode("translate");

    const cands = this._collectGroupMeshes(this._groupIdSet());
    if (cands.length === 0) { this._detach(); return; }

    // Pivot at the centroid of each entity's DATA position (one vote per entity), not the
    // mesh transforms — wall/floor meshes bake geometry in world space with the transform at
    // the origin, which would otherwise drag the centroid toward (0,0,0). Falls back to the
    // mesh-world centroid if no ref resolves a data position.
    const centroid = new THREE.Vector3();
    const dataPositions = refs.map(r => this._refDisplayPos(r)).filter((p): p is THREE.Vector3 => p !== null);
    if (dataPositions.length > 0) {
      for (const p of dataPositions) centroid.add(p);
      centroid.multiplyScalar(1 / dataPositions.length);
    } else {
      for (const c of cands) centroid.add(c.worldPos);
      centroid.multiplyScalar(1 / cands.length);
    }

    this._pivot.position.copy(centroid);
    this._pivot.rotation.set(0, 0, 0);
    this._pivotStart.copy(this._pivot.position);

    this._trackedMeshes = cands.map(c => ({
      obj:          c.obj,
      offset:       c.worldPos.clone().sub(centroid),
      origLocalPos: c.obj.position.clone(),
      origLocalRot: c.obj.rotation.clone(),
      origParent:   c.obj.parent,
    }));

    this._syncAxisVisibility();
    this._controls?.attach(this._pivot);
  }

  /** After a group commit rebuilds meshes, re-track them against the (unchanged) pivot. */
  private _scheduleRegroup(): void {
    if (this._regroupScheduled) return;
    this._regroupScheduled = true;
    queueMicrotask(() => {
      this._regroupScheduled = false;
      if (!this._groupMode) return;
      const pivotPos = this._pivot.position;
      const cands = this._collectGroupMeshes(this._groupIdSet());
      if (cands.length === 0) return;
      this._trackedMeshes = cands.map(c => ({
        obj:          c.obj,
        offset:       c.worldPos.clone().sub(pivotPos),
        origLocalPos: c.obj.position.clone(),
        origLocalRot: c.obj.rotation.clone(),
        origParent:   c.obj.parent,
      }));
    });
  }

  private _commitGroupTranslate(): void {
    const delta = this._pivot.position.clone().sub(this._pivotStart);
    if (delta.lengthSq() < 1e-6) { this._pivotStart.copy(this._pivot.position); return; }
    const movedNodes = new Set<string>();
    for (const ref of this._groupRefs) this._translateRef(ref, delta, movedNodes);
    this._pivotStart.copy(this._pivot.position);
  }

  /** Offset one entity by delta; shared nodes (dedupe via movedNodes) move exactly once. */
  private _translateRef(ref: SelectedRef, delta: THREE.Vector3, movedNodes: Set<string>): void {
    const zoneId = ref.zoneId;
    const zone   = this._worldState.zones.get(zoneId);
    if (!zone) return;

    const moveNode = (nodeId: string): void => {
      if (movedNodes.has(nodeId)) return;
      movedNodes.add(nodeId);
      const node = zone.nodes.find(n => n.id === nodeId);
      if (node) this._worldState.updateNode(zoneId, nodeId, { x: node.x + delta.x, z: node.z + delta.z });
    };

    switch (ref.type) {
      case "wall": {
        const ids = ref.memberIds?.length ? ref.memberIds : [ref.id];
        for (const wid of ids) {
          const wall = zone.walls.find(w => w.id === wid);
          if (!wall) continue;
          moveNode(wall.startNodeId);
          moveNode(wall.endNodeId);
        }
        break;
      }
      case "platform": {
        const plat = zone.platforms.find(p => p.id === ref.id);
        if (!plat) break;
        if (plat.nodeIds?.length) for (const id of plat.nodeIds) moveNode(id);
        const changes: Partial<PlatformDef> = {
          position: { x: plat.position.x + delta.x, y: plat.position.y + delta.y, z: plat.position.z + delta.z },
        };
        if (plat.points && plat.points.length >= 3) {
          changes.points = plat.points.map(pt => ({ x: pt.x + delta.x, z: pt.z + delta.z }));
        }
        this._worldState.updatePlatform(zoneId, ref.id, changes);
        break;
      }
      case "floor": {
        const floor = zone.floors.find(f => f.id === ref.id);
        if (!floor) break;
        const fm = floor.floorMesh;
        if (fm.nodeIds?.length) {
          for (const id of fm.nodeIds) moveNode(id);
        } else if (fm.points?.length) {
          this._worldState.updateFloor(zoneId, ref.id, {
            floorMesh: { ...fm, points: fm.points.map(p => ({ x: p.x + delta.x, z: p.z + delta.z })) },
          });
        }
        break;
      }
      case "stair": {
        const s = zone.stairs.find(x => x.id === ref.id);
        if (!s) break;
        this._worldState.updateStair(zoneId, ref.id, {
          start: { x: s.start.x + delta.x, y: s.start.y + delta.y, z: s.start.z + delta.z },
          end:   { x: s.end.x   + delta.x, y: s.end.y   + delta.y, z: s.end.z   + delta.z },
        });
        break;
      }
      case "object": {
        const o = zone.objects.find(x => x.id === ref.id);
        if (!o) break;
        this._worldState.updateObject(zoneId, ref.id, {
          position: { x: o.position.x + delta.x, y: o.position.y + delta.y, z: o.position.z + delta.z },
        });
        break;
      }
      case "decal": {
        const d = zone.decals?.find(x => x.id === ref.id);
        if (!d) break;
        this._worldState.updateDecal(zoneId, ref.id, {
          position: { x: d.position.x + delta.x, y: d.position.y + delta.y, z: d.position.z + delta.z },
        });
        break;
      }
      case "trigger-volume": {
        const v = zone.triggerVolumes?.find(x => x.id === ref.id);
        if (!v) break;
        this._worldState.updateTriggerVolume(zoneId, ref.id, {
          position: { x: v.position.x + delta.x, y: v.position.y + delta.y, z: v.position.z + delta.z },
        });
        break;
      }
      case "shape": {
        const s = zone.shapes?.find(x => x.id === ref.id);
        if (!s) break;
        this._worldState.updateShape(zoneId, ref.id, {
          position: { x: s.position.x + delta.x, y: s.position.y + delta.y, z: s.position.z + delta.z },
        });
        break;
      }
    }
  }

  // ─── Mesh tracking ────────────────────────────────────────────────────────

  private _updateMeshOffsets(): void {
    this._trackedMeshes = [];
    const pivotPos = this._pivot.position;
    const worldPos = new THREE.Vector3();
    this._scene.traverse(obj => {
      if (obj.userData["editorId"] !== this._selId) return;
      if (obj.userData["zoneId"]   !== this._selZoneId) return;
      if ((obj.userData as { _hasCsgCuts?: boolean })._hasCsgCuts) return;
      // Skip if ANY ancestor carries the same editorId — it will move as part of that ancestor.
      // Walk the full chain (not just direct parent) to handle OBJ's deeper group hierarchy:
      // rootGroup(editorId) → namedGroup(no editorId) → Mesh(editorId) — the mesh must be skipped.
      let anc = obj.parent;
      while (anc) {
        if (anc.userData["editorId"] === this._selId) return;
        anc = anc.parent;
      }
      obj.getWorldPosition(worldPos);
      this._trackedMeshes.push({
        obj,
        offset:       worldPos.clone().sub(pivotPos),
        origLocalPos: obj.position.clone(),
        origLocalRot: obj.rotation.clone(),
        origParent:   obj.parent,
      });
    });
  }

  private _reattachMeshes(): void {
    // Recompute pivot from world state (after async rebuild the mesh positions changed)
    const type = this._selType;
    if (!type) return;

    if (this._rotateAttached) {
      // A rebuild fired while a rotate drag is in progress.
      // For platforms: swap the stale tracked meshes (old build, currently inside the pivot)
      // for the fresh rebuild meshes (new build, currently in the scene).  This prevents a
      // one-frame visual snap when the old mesh is detached at commit time and the new mesh
      // (at the pre-rotate world position) briefly becomes the only visible one.
      if (type === "platform") {
        // Collect new meshes BEFORE any reparenting so scene.traverse is stable.
        type Candidate = {
          obj:          THREE.Object3D;
          worldPos:     THREE.Vector3;
          origLocalPos: THREE.Vector3;
          origLocalRot: THREE.Euler;
          origParent:   THREE.Object3D | null;
        };
        const candidates: Candidate[] = [];
        const wPos = new THREE.Vector3();

        this._scene.traverse(obj => {
          if (obj.userData["editorId"] !== this._selId) return;
          if (obj.userData["zoneId"]   !== this._selZoneId) return;
          if ((obj.userData as { _hasCsgCuts?: boolean })._hasCsgCuts) return;
          if (obj.parent === this._pivot) return; // already in pivot — skip stale mesh
          let anc = obj.parent;
          while (anc) {
            if (anc.userData["editorId"] === this._selId) return;
            anc = anc.parent;
          }
          obj.getWorldPosition(wPos);
          candidates.push({
            obj,
            worldPos:     wPos.clone(),
            origLocalPos: obj.position.clone(),
            origLocalRot: obj.rotation.clone(),
            origParent:   obj.parent,
          });
        });

        // Remove stale tracked meshes from the pivot
        for (const t of this._trackedMeshes) {
          if (t.obj.parent === this._pivot) this._pivot.remove(t.obj);
        }

        // Parent new meshes into the pivot (preserving world transform).
        // Since the new mesh centre ≈ pivot position, its pivot-local position is ~(0,0,0)
        // and the geometry will rotate correctly around the pivot centre as the drag continues.
        const pivotPos = this._pivot.position;
        this._trackedMeshes = candidates.map(c => {
          this._pivot.attach(c.obj);
          return {
            obj:          c.obj,
            offset:       c.worldPos.clone().sub(pivotPos),
            origLocalPos: c.origLocalPos,
            origLocalRot: c.origLocalRot,
            origParent:   c.origParent,
          };
        });
      }
      // For any type (including stair): don't touch pivot.rotation — it is the live drag value.
      return;
    }

    if (type === "platform") {
      const plat = this._getPlatform();
      if (plat) {
        // Polygon platforms bake rotation into node positions (plat.rotation.y stays 0).
        // Preserve the current pivot angle so the gizmo ring doesn't snap to 0 after
        // each commit — the user's accumulated rotation is visible across rebuilds.
        // Rect platforms use the stored plat.rotation.y.
        const isPolyPlat = !!(plat.nodeIds?.length);
        const rotY = isPolyPlat
          ? this._pivotYaw()
          : (plat.rotation?.y ? THREE.MathUtils.degToRad(plat.rotation.y) : 0);
        this._pivot.position.set(plat.position.x, plat.position.y + plat.thickness / 2 + 0.3, plat.position.z);
        this._pivot.rotation.set(0, rotY, 0);
        this._pivotStart.copy(this._pivot.position);
      }
    } else if (type === "stair") {
      const stair = this._getStair();
      if (stair) {
        this._pivot.position.set(
          (stair.start.x + stair.end.x) / 2,
          Math.max(stair.start.y, stair.end.y) + 0.3,
          (stair.start.z + stair.end.z) / 2,
        );
        this._pivot.rotation.set(0, 0, 0);
        this._pivotStart.copy(this._pivot.position);
      }
    } else if (type === "trigger-volume") {
      const zone = this._worldState.zones.get(this._selZoneId!);
      const vol  = zone?.triggerVolumes?.find(v => v.id === this._selId);
      if (vol) {
        this._pivot.position.set(vol.position.x, vol.position.y + vol.size.y / 2, vol.position.z);
        this._pivot.rotation.set(0, vol.rotation?.y ? THREE.MathUtils.degToRad(vol.rotation.y) : 0, 0);
        this._pivotStart.copy(this._pivot.position);
      }
    } else if (type === "shape") {
      const shape = this._getShape();
      if (shape) {
        this._pivot.position.set(shape.position.x, this._shapeTopY(shape) + 0.3, shape.position.z);
        this._pivot.rotation.set(0, THREE.MathUtils.degToRad(shape.rotation.y), 0);
        this._pivotStart.copy(this._pivot.position);
      }
    } else if (type === "spawn") {
      const s = this._worldState.world?.defaultSpawn;
      if (s) {
        this._pivot.position.set(s.position.x, s.position.y + 0.3, s.position.z);
        this._pivot.rotation.set(0, THREE.MathUtils.degToRad(s.facingDeg ?? 0), 0);
        this._pivotStart.copy(this._pivot.position);
      }
    } else if (type === "checkpoint") {
      const cp = this._worldState.zones.get(this._selZoneId ?? "")?.checkpoints?.find(c => c.id === this._selId);
      if (cp) {
        this._pivot.position.set(cp.position.x, cp.position.y + 0.3, cp.position.z);
        this._pivot.rotation.set(0, THREE.MathUtils.degToRad(cp.facingDeg ?? 0), 0);
        this._pivotStart.copy(this._pivot.position);
      }
    }
    // For floor/wall: pivot Y is driven by the mesh; let SelectionManager re-emit handle it

    this._updateMeshOffsets();
    this._controls?.attach(this._pivot);
  }

  // ─── Drag handlers ────────────────────────────────────────────────────────

  private _onDragStart(): void {
    if (this._controls?.getMode() === "rotate") {
      this._rotateStartAngle = this._pivotYaw();
      if (this._selType === "stair") {
        const stair = this._getStair();
        if (stair) this._stairDragSnapshot = { start: { ...stair.start }, end: { ...stair.end } };
      }
      if (this._selType === "platform") {
        const plat = this._getPlatform();
        if (plat?.nodeIds?.length) {
          const zone = this._worldState.zones.get(this._selZoneId!);
          if (zone) {
            this._polyPlatDragSnapshot = {
              cx: plat.position.x,
              cz: plat.position.z,
              nodes: plat.nodeIds
                .map(id => { const n = zone.nodes.find(n => n.id === id); return n ? { id, x: n.x, z: n.z } : null; })
                .filter((n): n is { id: string; x: number; z: number } => n !== null),
              points: plat.points ? plat.points.map(p => ({ ...p })) : undefined,
            };
          }
        }
      }
      if (this._selType === "wall") {
        const zone = this._worldState.zones.get(this._selZoneId!);
        if (zone) {
          this._wallDragSnapshot = this._wallNodeIds
            .map(id => { const n = zone.nodes.find(n => n.id === id); return n ? { id, x: n.x, z: n.z } : null; })
            .filter((n): n is { id: string; x: number; z: number } => n !== null);
        }
      }
      // Parent tracked objects into the pivot — Three.js handles world-space rotation
      // correctly regardless of whether geometry is baked at the origin.
      for (const tracked of this._trackedMeshes) {
        tracked.origParent = tracked.obj.parent;
        this._pivot.attach(tracked.obj);
      }
      this._rotateAttached = true;
    }
  }

  private _onObjectChange(): void {
    if (!this._controls?.dragging) return;
    const mode = this._controls.getMode();
    if (mode === "translate") {
      // Rotate is handled by the pivot-attach hierarchy — no manual orbit needed.
      const pivotPos = this._pivot.position;
      for (const { obj, offset } of this._trackedMeshes) {
        obj.position.copy(pivotPos).add(offset);
      }
    } else if (mode === "scale" && this._selType === "object") {
      const ps = this._pivot.scale;
      for (const { obj } of this._trackedMeshes) {
        obj.scale.set(
          this._objInitialScale.x * ps.x,
          this._objInitialScale.y * ps.y,
          this._objInitialScale.z * ps.z,
        );
      }
    }
  }

  private _onDragEnd(): void {
    if (this._groupMode) {
      this._worldState.transaction(`move ${this._groupRefs.length} items`, () => this._commitGroupTranslate());
      return;
    }
    // Spawn is world-level (zoneId is ""), so don't require _selZoneId for it —
    // otherwise the falsy empty-string zoneId skips the commit and the move is lost.
    if (!this._selId || !this._selType) return;
    if (this._selType !== "spawn" && !this._selZoneId) return;
    const mode = this._controls?.getMode() ?? "translate";

    // One undo step per gesture — covers multi-entity commits (wall-run nodes, copy-to-floor).
    this._worldState.transaction(`${mode} ${this._selType}`, () => {
      if (mode === "translate") {
        this._commitTranslate();
      } else if (mode === "rotate") {
        this._commitRotate();
      } else if (mode === "scale") {
        this._commitScale();
      }
    });
  }

  private _commitTranslate(): void {
    const delta = this._pivot.position.clone().sub(this._pivotStart);

    switch (this._selType) {
      case "platform": {
        if (delta.lengthSq() < 1e-6) break;
        const plat = this._getPlatform();
        if (!plat) break;
        // For node-linked polygon platforms: shift nodes FIRST so the rebuild triggered by
        // platform:updated below reads the correct (already-moved) node positions.
        // ZoneManager._rebuildPlatform overrides platform.points with node positions, so
        // moving nodes is required — shifting points alone is not enough.
        // Mutate directly (no updateNode events) — polygon platform nodes are never shared
        // with walls, so skipping node:updated is safe and avoids an extra rebuild cycle.
        if (plat.nodeIds?.length) {
          const zone = this._worldState.zones.get(this._selZoneId!);
          if (zone) {
            for (const nodeId of plat.nodeIds) {
              const node = zone.nodes.find(n => n.id === nodeId);
              if (node) {
                node.x += delta.x;
                node.z += delta.z;
              }
            }
          }
        }
        const platChanges: Partial<PlatformDef> = {
          position: {
            x: plat.position.x + delta.x,
            y: plat.position.y + delta.y,
            z: plat.position.z + delta.z,
          },
        };
        // Keep points in sync for both pure-points and node-backed polygon platforms.
        if (plat.points && plat.points.length >= 3) {
          platChanges.points = plat.points.map(pt => ({ x: pt.x + delta.x, z: pt.z + delta.z }));
        }
        this._worldState.updatePlatform(this._selZoneId!, this._selId!, platChanges);
        break;
      }
      case "stair": {
        if (delta.lengthSq() < 1e-6) break;
        const stair = this._getStair();
        if (!stair) break;
        this._worldState.updateStair(this._selZoneId!, this._selId!, {
          start: { x: stair.start.x + delta.x, y: stair.start.y + delta.y, z: stair.start.z + delta.z },
          end:   { x: stair.end.x   + delta.x, y: stair.end.y   + delta.y, z: stair.end.z   + delta.z },
        });
        break;
      }
      case "object": {
        if (delta.lengthSq() < 1e-6) break;
        const obj = this._getObject();
        if (!obj) break;
        this._worldState.updateObject(this._selZoneId!, this._selId!, {
          position: {
            x: obj.position.x + delta.x,
            y: obj.position.y + delta.y,
            z: obj.position.z + delta.z,
          },
        });
        break;
      }
      case "shape": {
        if (delta.lengthSq() < 1e-6) break;
        const shape = this._getShape();
        if (!shape) break;
        this._worldState.updateShape(this._selZoneId!, this._selId!, {
          position: {
            x: shape.position.x + delta.x,
            y: shape.position.y + delta.y,
            z: shape.position.z + delta.z,
          },
        });
        break;
      }
      case "spawn": {
        if (delta.lengthSq() < 1e-6) break;
        const spawn = this._worldState.world?.defaultSpawn;
        if (!spawn) break;
        const position = {
          x: spawn.position.x + delta.x,
          y: spawn.position.y + delta.y,
          z: spawn.position.z + delta.z,
        };
        this._worldState.setDefaultSpawn({ ...spawn, position });
        this._bus.emit("spawn:updated", { position });
        break;
      }
      case "checkpoint": {
        if (delta.lengthSq() < 1e-6) break;
        const cp = this._worldState.zones.get(this._selZoneId!)?.checkpoints?.find(c => c.id === this._selId);
        if (!cp) break;
        this._worldState.updateCheckpoint(this._selZoneId!, this._selId!, {
          position: { x: cp.position.x + delta.x, y: cp.position.y + delta.y, z: cp.position.z + delta.z },
        });
        break;
      }
      case "floor": {
        if (delta.lengthSq() < 1e-6) break;
        const floor = this._getFloor();
        if (!floor) break;
        if (Math.abs(delta.x) >= 1e-4 || Math.abs(delta.z) >= 1e-4) {
          const fm = floor.floorMesh;
          if (fm.nodeIds?.length) {
            const zone = this._worldState.zones.get(this._selZoneId!);
            for (const nodeId of fm.nodeIds) {
              const node = zone?.nodes.find(n => n.id === nodeId);
              if (node) {
                this._worldState.updateNode(this._selZoneId!, nodeId, {
                  x: node.x + delta.x,
                  z: node.z + delta.z,
                });
              }
            }
          } else if (fm.points?.length) {
            this._worldState.updateFloor(this._selZoneId!, this._selId!, {
              floorMesh: { ...fm, points: fm.points.map(p => ({ x: p.x + delta.x, z: p.z + delta.z })) },
            });
          }
        }
        if (Math.abs(delta.y) >= 1e-4) {
          this._worldState.updateFloor(this._selZoneId!, this._selId!, {
            elevation: floor.elevation + delta.y,
          });
        }
        break;
      }
      case "wall": {
        if (Math.abs(delta.x) < 1e-4 && Math.abs(delta.z) < 1e-4 && Math.abs(delta.y) < 1e-4) break;
        const zone = this._worldState.zones.get(this._selZoneId!);
        if (!zone) break;
        if (Math.abs(delta.x) >= 1e-4 || Math.abs(delta.z) >= 1e-4) {
          for (const nodeId of this._wallNodeIds) {
            const node = zone.nodes.find(n => n.id === nodeId) as WallNode | undefined;
            if (node) {
              this._worldState.updateNode(this._selZoneId!, nodeId, {
                x: node.x + delta.x,
                z: node.z + delta.z,
              });
            }
          }
        }
        if (Math.abs(delta.y) >= 1e-4) {
          for (const wallId of this._wallRunIds) {
            const wall = zone.walls.find(w => w.id === wallId) as WallDef | undefined;
            if (wall) {
              this._worldState.updateWall(this._selZoneId!, wallId, {
                elevation: (wall.elevation ?? 0) + delta.y,
              });
            }
          }
          // Elevate any floors whose nodes are entirely within the moved node set
          const movedNodes = new Set(this._wallNodeIds);
          for (const floor of zone.floors) {
            const fIds = floor.floorMesh.nodeIds;
            if (!fIds?.length) continue;
            if (fIds.every(id => movedNodes.has(id))) {
              this._worldState.updateFloor(this._selZoneId!, floor.id, {
                elevation: floor.elevation + delta.y,
              });
            }
          }
        }
        break;
      }
      case "trigger-volume": {
        if (delta.lengthSq() < 1e-6) break;
        const zone = this._worldState.zones.get(this._selZoneId!);
        const vol  = zone?.triggerVolumes?.find(v => v.id === this._selId) as TriggerVolume | undefined;
        if (!vol) break;
        this._worldState.updateTriggerVolume(this._selZoneId!, this._selId!, {
          position: {
            x: vol.position.x + delta.x,
            y: vol.position.y + delta.y,
            z: vol.position.z + delta.z,
          },
        });
        break;
      }
      case "decal": {
        if (delta.lengthSq() < 1e-6) break;
        const dec = this._worldState.zones.get(this._selZoneId!)?.decals?.find(d => d.id === this._selId);
        if (!dec) break;
        this._worldState.updateDecal(this._selZoneId!, this._selId!, {
          position: {
            x: dec.position.x + delta.x,
            y: dec.position.y + delta.y,
            z: dec.position.z + delta.z,
          },
        });
        break;
      }
    }

    this._pivotStart.copy(this._pivot.position);
  }

  private _commitRotate(): void {
    this._detachFromPivot();
    const deltaAngle = this._pivotYaw() - this._rotateStartAngle;

    switch (this._selType) {
      case "platform": {
        const plat = this._getPlatform();
        if (!plat) break;
        if (Math.abs(deltaAngle) < 0.0001) { this._resetLiveRotate(); break; }

        if (plat.nodeIds?.length) {
          // Polygon platform: bake this drag's delta into node positions using the same
          // snapshot + makeRotationY approach as stairs — reads pre-drag positions so
          // any mid-drag async rebuild never corrupts the bake.
          const snap = this._polyPlatDragSnapshot;
          if (!snap) break;
          const rotMat = new THREE.Matrix4().makeRotationY(deltaAngle);
          const zone = this._worldState.zones.get(this._selZoneId!);
          if (zone) {
            for (const sn of snap.nodes) {
              const node = zone.nodes.find(n => n.id === sn.id);
              if (node) {
                const v = new THREE.Vector3(sn.x - snap.cx, 0, sn.z - snap.cz).applyMatrix4(rotMat);
                node.x = snap.cx + v.x;
                node.z = snap.cz + v.z;
              }
            }
          }
          const newPoints = snap.points
            ? snap.points.map(pt => {
                const v = new THREE.Vector3(pt.x - snap.cx, 0, pt.z - snap.cz).applyMatrix4(rotMat);
                return { x: snap.cx + v.x, z: snap.cz + v.z };
              })
            : undefined;
          this._worldState.updatePlatform(this._selZoneId!, this._selId!, {
            rotation: { x: 0, y: 0, z: 0 },
            ...(newPoints ? { points: newPoints } : {}),
          });
        } else {
          // Rect platform: store rotation.y as a mesh transform (applied by PlatformBuilder).
          const rotY = THREE.MathUtils.radToDeg(this._pivotYaw());
          this._worldState.updatePlatform(this._selZoneId!, this._selId!, {
            rotation: { x: 0, y: rotY, z: 0 },
          });
        }
        break;
      }
      case "stair": {
        const snap = this._stairDragSnapshot;
        if (!snap || Math.abs(deltaAngle) < 0.0001) { this._resetLiveRotate(); break; }
        // Use Three.js's own rotation matrix so the committed positions are
        // guaranteed to match the live pivot-attach preview.
        const rotMat = new THREE.Matrix4().makeRotationY(deltaAngle);
        const pivot2d = new THREE.Vector3(this._pivot.position.x, 0, this._pivot.position.z);
        const ns = new THREE.Vector3(snap.start.x, 0, snap.start.z)
          .sub(pivot2d).applyMatrix4(rotMat).add(pivot2d);
        const ne = new THREE.Vector3(snap.end.x, 0, snap.end.z)
          .sub(pivot2d).applyMatrix4(rotMat).add(pivot2d);
        this._worldState.updateStair(this._selZoneId!, this._selId!, {
          start: { x: ns.x, y: snap.start.y, z: ns.z },
          end:   { x: ne.x, y: snap.end.y,   z: ne.z },
        });
        break;
      }
      case "wall": {
        const snap = this._wallDragSnapshot;
        if (!snap || Math.abs(deltaAngle) < 0.0001) { this._resetLiveRotate(); break; }
        const rotMat = new THREE.Matrix4().makeRotationY(deltaAngle);
        const pivot2d = new THREE.Vector3(this._pivot.position.x, 0, this._pivot.position.z);
        const zone = this._worldState.zones.get(this._selZoneId!);
        if (zone) {
          for (const sn of snap) {
            const node = zone.nodes.find(n => n.id === sn.id);
            if (node) {
              const v = new THREE.Vector3(sn.x, 0, sn.z)
                .sub(pivot2d).applyMatrix4(rotMat).add(pivot2d);
              this._worldState.updateNode(this._selZoneId!, sn.id, { x: v.x, z: v.z });
            }
          }
        }
        break;
      }
      case "object": {
        if (Math.abs(deltaAngle) < 0.0001 && !this._rotateAttached) { this._resetLiveRotate(); break; }
        const mesh = this._trackedMeshes[0]?.obj;
        if (!mesh) break;
        const DEG = THREE.MathUtils.radToDeg;
        this._worldState.updateObject(this._selZoneId!, this._selId!, {
          rotation: {
            x: DEG(mesh.rotation.x),
            y: DEG(mesh.rotation.y),
            z: DEG(mesh.rotation.z),
          },
        });
        break;
      }
      case "trigger-volume": {
        if (Math.abs(deltaAngle) < 0.0001) { this._resetLiveRotate(); break; }
        // Store absolute yaw (degrees) — applied by ZoneManager's wireframe + the Rapier sensor.
        const rotY = THREE.MathUtils.radToDeg(this._pivotYaw());
        this._worldState.updateTriggerVolume(this._selZoneId!, this._selId!, {
          rotation: { x: 0, y: rotY, z: 0 },
        });
        break;
      }
      case "shape": {
        if (Math.abs(deltaAngle) < 0.0001) { this._resetLiveRotate(); break; }
        const shape = this._getShape();
        if (!shape) break;
        // Absolute yaw from the pivot; X/Z tilt is panel-only — preserve it.
        const rotY = THREE.MathUtils.radToDeg(this._pivotYaw());
        this._worldState.updateShape(this._selZoneId!, this._selId!, {
          rotation: { x: shape.rotation.x, y: rotY, z: shape.rotation.z },
        });
        break;
      }
      case "spawn": {
        if (Math.abs(deltaAngle) < 0.0001) { this._resetLiveRotate(); break; }
        const spawn = this._worldState.world?.defaultSpawn;
        if (!spawn) break;
        // Pivot yaw maps directly to facingDeg (0° = -Z, matching CharacterController).
        const facingDeg = THREE.MathUtils.radToDeg(this._pivotYaw());
        this._worldState.setDefaultSpawn({ ...spawn, facingDeg });
        this._bus.emit("spawn:updated", { position: spawn.position });
        break;
      }
      case "checkpoint": {
        if (Math.abs(deltaAngle) < 0.0001) { this._resetLiveRotate(); break; }
        const facingDeg = THREE.MathUtils.radToDeg(this._pivotYaw());
        this._worldState.updateCheckpoint(this._selZoneId!, this._selId!, { facingDeg });
        break;
      }
    }

    this._stairDragSnapshot    = null;
    this._wallDragSnapshot     = null;
    this._polyPlatDragSnapshot = null;
  }

  private _commitScale(): void {
    if (this._selType !== "object") return;
    const mesh = this._trackedMeshes[0]?.obj;
    if (!mesh) return;
    this._worldState.updateObject(this._selZoneId!, this._selId!, {
      scale: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z },
    });
    // Reset pivot scale so the next drag starts clean
    this._pivot.scale.set(1, 1, 1);
    this._objInitialScale.copy(mesh.scale);
  }

  private _detachFromPivot(): void {
    if (!this._rotateAttached) return;
    for (const tracked of this._trackedMeshes) {
      const parent = tracked.origParent ?? this._scene;
      parent.attach(tracked.obj); // restores to original parent while preserving world transform
    }
    this._rotateAttached = false;
  }

  private _resetLiveRotate(): void {
    this._detachFromPivot();
    // Snap back to the exact local transform at selection time
    for (const { obj, origLocalPos, origLocalRot } of this._trackedMeshes) {
      obj.position.copy(origLocalPos);
      obj.rotation.copy(origLocalRot);
    }
  }

  /**
   * Gimbal-safe yaw (Y rotation) of the pivot, extracted from its quaternion.
   * TransformControls rotates the pivot's quaternion; reading `pivot.rotation.y`
   * (Euler, XYZ order) flips past ±90° (e.g. a 135° drag reads as 45°, a 180°
   * drag reads as 0°), which is what made rotate commits snap back on release.
   */
  private _pivotYaw(): number {
    const q = this._pivot.quaternion;
    return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
  }

  // ─── Axis visibility ──────────────────────────────────────────────────────

  private _syncAxisVisibility(): void {
    if (!this._controls) return;
    // All axes are always live — hiding any one breaks the rotate ring geometry,
    // and translate now supports full X/Y/Z movement for every gizmo type.
    this._controls.showX = true;
    this._controls.showY = true;
    this._controls.showZ = true;
  }

  // ─── Wall-run helpers ─────────────────────────────────────────────────────

  private _collectWallNodeIds(payload: SelectedObjectPayload): string[] {
    const walls = payload.runWalls ?? (payload.data ? [payload.data as WallDef] : []);
    const nodeSet = new Set<string>();
    for (const w of walls) { nodeSet.add(w.startNodeId); nodeSet.add(w.endNodeId); }
    return [...nodeSet];
  }

  private _collectWallRunIds(payload: SelectedObjectPayload): string[] {
    const walls = payload.runWalls ?? (payload.data ? [payload.data as WallDef] : []);
    return walls.map(w => w.id);
  }

  private _wallRunCenter(payload: SelectedObjectPayload): { x: number; z: number } {
    const zone  = this._worldState.zones.get(payload.zoneId);
    const ids   = this._collectWallNodeIds(payload);
    if (!zone || !ids.length) return { x: payload.position.x, z: payload.position.z };
    const nodes = ids.map(id => zone.nodes.find(n => n.id === id)).filter(Boolean) as WallNode[];
    if (!nodes.length) return { x: payload.position.x, z: payload.position.z };
    return {
      x: nodes.reduce((s, n) => s + n.x, 0) / nodes.length,
      z: nodes.reduce((s, n) => s + n.z, 0) / nodes.length,
    };
  }

  // ─── World-state lookups ──────────────────────────────────────────────────

  private _getPlatform(): PlatformDef | undefined {
    return this._worldState.zones.get(this._selZoneId ?? "")
      ?.platforms.find(p => p.id === this._selId);
  }

  private _getStair(): StairDef | undefined {
    return this._worldState.zones.get(this._selZoneId ?? "")
      ?.stairs.find(s => s.id === this._selId);
  }

  private _getFloor(): FloorDef | undefined {
    return this._worldState.zones.get(this._selZoneId ?? "")
      ?.floors.find(f => f.id === this._selId);
  }

  private _getObject(): WorldObject | undefined {
    return this._worldState.zones.get(this._selZoneId ?? "")
      ?.objects.find(o => o.id === this._selId);
  }

  private _getShape(): ShapeDef | undefined {
    return this._worldState.zones.get(this._selZoneId ?? "")
      ?.shapes?.find(s => s.id === this._selId);
  }

  /** World Y of a shape's top face (pivot sits just above it). */
  private _shapeTopY(shape: ShapeDef): number {
    const p = resolveShapeParams(shape);
    const h = shape.kind === "wedge" ? Math.max(p.heightLow, p.heightHigh) : p.height;
    return shape.position.y + h;
  }
}
