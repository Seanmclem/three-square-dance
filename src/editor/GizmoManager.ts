import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type {
  IEditorModule, SelectedObjectPayload,
  PlatformDef, StairDef, FloorDef, WallDef, WallNode, WorldObject, TriggerVolume,
} from "@/types";

type GizmoType = "platform" | "stair" | "floor" | "wall" | "object" | "spawn" | "trigger-volume";

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

      // Re-attach after async rebuild (SelectionManager also re-emits object:selected,
      // but _reattachMeshes runs first to avoid a one-frame pop of the old pivot)
      this._bus.on("platform:rebuilt", ({ zoneId, platformId }) => {
        if (platformId === this._selId && zoneId === this._selZoneId) this._reattachMeshes();
      }),
      this._bus.on("stair:rebuilt", ({ zoneId, stairId }) => {
        if (stairId === this._selId && zoneId === this._selZoneId) this._reattachMeshes();
      }),
      this._bus.on("floor:rebuilt", ({ zoneId, floorId }) => {
        if (floorId === this._selId && zoneId === this._selZoneId) this._reattachMeshes();
      }),
      this._bus.on("triggervolume:updated", ({ zoneId, id }) => {
        if (id === this._selId && zoneId === this._selZoneId) this._reattachMeshes();
      }),

      this._bus.on("input:keydown", ({ code }) => {
        if (!this._controls || this._selId === null) return;
        if (code === "KeyT") { this._controls.setMode("translate"); this._syncAxisVisibility(); }
        if (code === "KeyR" && (this._selType === "platform" || this._selType === "stair" || this._selType === "wall" || this._selType === "object" || this._selType === "trigger-volume")) {
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
    const type = payload.type as string;
    if (!["platform", "stair", "floor", "wall", "object", "spawn", "trigger-volume"].includes(type)) {
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
        const pts = floorDef.floorMesh.points;
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
    this._trackedMeshes = [];
    this._wallNodeIds   = [];
    this._wallRunIds    = [];
    this._stairDragSnapshot    = null;
    this._wallDragSnapshot     = null;
    this._polyPlatDragSnapshot = null;
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
    // Spawn is world-level (zoneId is ""), so don't require _selZoneId for it —
    // otherwise the falsy empty-string zoneId skips the commit and the move is lost.
    if (!this._selId || !this._selType) return;
    if (this._selType !== "spawn" && !this._selZoneId) return;
    const mode = this._controls?.getMode() ?? "translate";

    if (mode === "translate") {
      this._commitTranslate();
    } else if (mode === "rotate") {
      this._commitRotate();
    } else if (mode === "scale") {
      this._commitScale();
    }
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
      case "floor": {
        // Only Y is live — X/Z arrows are hidden
        if (Math.abs(delta.y) < 1e-4) break;
        const floor = this._getFloor();
        if (!floor) break;
        this._worldState.updateFloor(this._selZoneId!, this._selId!, {
          elevation: floor.elevation + delta.y,
        });
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
    if (this._controls.getMode() === "rotate") {
      // Keep all three rings — hiding any one breaks the ring geometry
      this._controls.showX = true;
      this._controls.showY = true;
      this._controls.showZ = true;
    } else {
      // Floors: elevation only (Y arrow); everything else: all
      this._controls.showX = this._selType !== "floor";
      this._controls.showY = true;
      this._controls.showZ = this._selType !== "floor";
    }
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
}
