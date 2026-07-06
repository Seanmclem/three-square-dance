import * as THREE from "three";
import { assetManager } from "@/core/AssetManager";
import { colliderWorldTransform, defaultColliderFromAABB } from "@/physics/attachedColliderMath";
import type { ObjectPlacer } from "@/preview/ObjectPlacer";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { IEditorModule, ToolId, WorldObject, AttachedCollider, ScreenPos, Vec3 } from "@/types";

const GRID = 0.5;
const MIN  = 0.1;    // smallest collider size along any axis
const HANDLE = 0.2;
const GAP  = 0.3;    // face handles sit this far OUTSIDE each face

const SOLID_COLOR  = 0x44ddff;   // cyan — blocks the player
const SENSOR_COLOR = 0xffaa33;   // amber — fires enter/exit scripts (matches trigger volumes)

type Face = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";
const FACES: Face[] = ["+x", "-x", "+y", "-y", "+z", "-z"];

const FACE_AXIS: Record<Face, THREE.Vector3> = {
  "+x": new THREE.Vector3(1, 0, 0),  "-x": new THREE.Vector3(-1, 0, 0),
  "+y": new THREE.Vector3(0, 1, 0),  "-y": new THREE.Vector3(0, -1, 0),
  "+z": new THREE.Vector3(0, 0, 1),  "-z": new THREE.Vector3(0, 0, -1),
};
const AXIS_COLOR: Record<Face, number> = {
  "+x": 0xff6b6b, "-x": 0xff6b6b,
  "+y": 0x6bff8a, "-y": 0x6bff8a,
  "+z": 0x6b8aff, "-z": 0x6b8aff,
};

function snap(v: number): number { return Math.round(v / GRID) * GRID; }

interface DragState {
  colliderId: string;
  face:       Face;
  origList:   AttachedCollider[];   // full array at drag start (restored on Escape)
  orig:       AttachedCollider;     // the dragged collider at drag start
  explicit:   boolean;              // false = dragging the implicit auto-box (materializes on first move)
}

/**
 * Wireframes + push/pull face handles for the selected object's attached colliders
 * (explicit colliders[] or the implicit auto-box). Modeled on TriggerVolumeResizer:
 * raycasts ONLY its own handle meshes, coexists with GizmoManager via the shared
 * `gizmo:dragging` mute, and writes through WorldState transactions (undo for free).
 * Box colliders get 6 face handles; sphere/capsule are wireframe-only (panel edits).
 */
export class ColliderEditor implements IEditorModule {
  private _activeTool:   ToolId = "select";
  private _activeZoneId  = "demo";
  private _selectedId:   string | null = null;
  private _previewing    = false;
  private _gizmoActive   = false;
  private _altDown       = false;

  private _wireframes: THREE.Object3D[] = [];
  private _handles:    THREE.Mesh[] = [];
  private _hoveredKey: string | null = null;   // `${colliderId}:${face}`

  private _state: "IDLE" | "DRAG" = "IDLE";
  private _drag: DragState | null = null;

  private readonly _raycaster = new THREE.Raycaster();
  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _scene:        THREE.Scene,
    private readonly _world:        WorldState,
    private readonly _bus:          EventBus,
    private readonly _camera:       THREE.Camera,
    private readonly _canvas:       HTMLCanvasElement,
    private readonly _objectPlacer: ObjectPlacer,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("tool:select", ({ tool }) => {
        this._activeTool = tool;
        if (tool !== "select" && this._state === "DRAG") this._cancelDrag();
        this._sync();
      }),
      this._bus.on("object:selected", payload => {
        this._selectedId = payload.type === "object" ? payload.id : null;
        if (payload.type === "object" && payload.zoneId) this._activeZoneId = payload.zoneId;
        this._sync();
      }),
      this._bus.on("object:deselected", () => { this._selectedId = null; this._sync(); }),
      this._bus.on("zone:activated", ({ zoneId }) => {
        this._activeZoneId = zoneId;
        this._selectedId = null;
        this._sync();
      }),
      this._bus.on("object:removed", ({ id }) => {
        if (id === this._selectedId) { this._selectedId = null; this._sync(); }
      }),
      // External change (panel edit, gizmo commit). Skip mid-drag — we rebuild inline.
      this._bus.on("object:updated", ({ id }) => {
        if (id === this._selectedId && this._state !== "DRAG") this._sync();
      }),
      this._bus.on("preview:start", () => { this._previewing = true;  this._sync(); }),
      this._bus.on("preview:stop",  () => { this._previewing = false; this._sync(); }),

      this._bus.on("gizmo:dragging", ({ isDragging }) => {
        this._gizmoActive = isDragging && this._state !== "DRAG";
      }),
      this._bus.on("input:mousemove", ({ screenPos }) => {
        if (this._state === "DRAG") { this._onDragMove(screenPos); return; }
        if (!this._shouldShow() || this._gizmoActive) return;
        this._onHover(screenPos);
      }),
      this._bus.on("input:mousedown", ({ button, screenPos }) => {
        if (button !== 0 || !this._shouldShow() || this._gizmoActive) return;
        this._onMouseDown(screenPos);
      }),
      this._bus.on("input:mouseup", ({ button }) => {
        if (button === 0 && this._state === "DRAG") this._commitDrag();
      }),
      this._bus.on("input:keydown", ({ code }) => {
        if (code === "AltLeft" || code === "AltRight") this._altDown = true;
        if (code === "Escape" && this._state === "DRAG") this._cancelDrag();
      }),
      this._bus.on("input:keyup", ({ code }) => {
        if (code === "AltLeft" || code === "AltRight") this._altDown = false;
      }),
    );
  }

  update(_dt: number): void {}

  dispose(): void {
    this._unsubs.forEach(u => u());
    this._unsubs.length = 0;
    this._clearVisuals();
  }

  // ── Data access ─────────────────────────────────────────────────────────────

  private _shouldShow(): boolean {
    return this._activeTool === "select" && this._selectedId !== null && !this._previewing;
  }

  private _selectedObject(): WorldObject | undefined {
    if (!this._selectedId) return undefined;
    return this._world.zones.get(this._activeZoneId)?.objects.find(o => o.id === this._selectedId);
  }

  /** Explicit colliders, or the implicit auto-box for collidable assets. */
  private _effectiveColliders(obj: WorldObject): { list: AttachedCollider[]; explicit: boolean } {
    if (obj.colliders !== undefined) return { list: obj.colliders, explicit: true };
    const def  = assetManager.getAssetDef(obj.assetId);
    const aabb = this._objectPlacer.getLocalAABB(obj.id);
    return def?.collidable && aabb
      ? { list: [defaultColliderFromAABB(aabb.center, aabb.size)], explicit: false }
      : { list: [], explicit: false };
  }

  // ── Visuals ─────────────────────────────────────────────────────────────────

  private _sync(): void {
    this._clearVisuals();
    if (!this._shouldShow()) return;
    const obj = this._selectedObject();
    if (!obj) return;
    const { list } = this._effectiveColliders(obj);
    for (const c of list) {
      this._buildWireframe(obj, c);
      if (c.shape === "box") this._buildHandles(c.id);
    }
    this._positionAll();
  }

  private _buildWireframe(obj: WorldObject, c: AttachedCollider): void {
    const color = c.isSensor ? SENSOR_COLOR : SOLID_COLOR;
    let wire: THREE.Object3D;
    if (c.shape === "box") {
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85, depthTest: false });
      wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), mat);
    } else {
      const geo = c.shape === "sphere"
        ? new THREE.SphereGeometry(1, 12, 8)
        : new THREE.CapsuleGeometry(1, 1, 3, 8);   // scaled per-frame in _positionAll
      const mat = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.4, depthTest: false });
      wire = new THREE.Mesh(geo, mat);
    }
    wire.renderOrder = 3;
    wire.userData = { selectable: false, hideInGame: true, colliderId: c.id, shape: c.shape };
    this._scene.add(wire);
    this._wireframes.push(wire);
  }

  private _buildHandles(colliderId: string): void {
    for (const face of FACES) {
      const geo = new THREE.BoxGeometry(HANDLE, HANDLE, HANDLE);
      const mat = new THREE.MeshBasicMaterial({
        color: AXIS_COLOR[face], depthTest: false, depthWrite: false, transparent: true, opacity: 0.6,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 4;
      mesh.userData = { selectable: false, hideInGame: true, colliderId, faceAxis: face };
      this._scene.add(mesh);
      this._handles.push(mesh);
    }
  }

  private _clearVisuals(): void {
    for (const o of [...this._wireframes, ...this._handles]) {
      this._scene.remove(o);
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material | undefined)?.dispose();
    }
    this._wireframes.length = 0;
    this._handles.length = 0;
    if (this._hoveredKey !== null) this._bus.emit("collider:handle-hover", { hovering: false });
    this._hoveredKey = null;
  }

  /** Reposition wireframes + handles from current data (no geometry rebuild). */
  private _positionAll(): void {
    const obj = this._selectedObject();
    if (!obj) return;
    const { list } = this._effectiveColliders(obj);
    const byId = new Map(list.map(c => [c.id, c]));

    for (const w of this._wireframes) {
      const c = byId.get(w.userData["colliderId"] as string);
      if (!c) { w.visible = false; continue; }
      const t = colliderWorldTransform(obj, c);
      w.position.set(t.pos.x, t.pos.y, t.pos.z);
      w.quaternion.set(t.quat.x, t.quat.y, t.quat.z, t.quat.w);
      if (c.shape === "box")         w.scale.set(t.halfExtents.x * 2, t.halfExtents.y * 2, t.halfExtents.z * 2);
      else if (c.shape === "sphere") w.scale.setScalar(t.halfExtents.x);
      else {
        // CapsuleGeometry(1, 1): radius 1, cylinder length 1 → scale radius on XZ; the
        // Y cylinder length scales with the same factor, so bake length via geometry Y.
        const r = t.halfExtents.x, halfH = t.halfExtents.y;
        w.scale.set(r, 1, r);
        const m = w as THREE.Mesh;
        m.geometry.dispose();
        m.geometry = new THREE.CapsuleGeometry(r, halfH * 2, 3, 8);
        w.scale.set(1, 1, 1);
      }
    }

    for (const h of this._handles) {
      const c = byId.get(h.userData["colliderId"] as string);
      if (!c || c.shape !== "box") { h.visible = false; continue; }
      const t = colliderWorldTransform(obj, c);
      const face = h.userData["faceAxis"] as Face;
      const axis = FACE_AXIS[face];
      const half = Math.abs(axis.x) ? t.halfExtents.x : Math.abs(axis.y) ? t.halfExtents.y : t.halfExtents.z;
      const q = new THREE.Quaternion(t.quat.x, t.quat.y, t.quat.z, t.quat.w);
      const p = axis.clone().multiplyScalar(half + GAP).applyQuaternion(q);
      h.position.set(t.pos.x + p.x, t.pos.y + p.y, t.pos.z + p.z);
      h.visible = true;
    }
  }

  // ── Picking ─────────────────────────────────────────────────────────────────

  private _castHandles(screenPos: ScreenPos): THREE.Mesh | null {
    const rect = this._canvas.getBoundingClientRect();
    const ndcX =  ((screenPos.x - rect.left) / rect.width)  * 2 - 1;
    const ndcY = -((screenPos.y - rect.top)  / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this._camera);
    const hit = this._raycaster.intersectObjects(this._handles.filter(h => h.visible), false)[0];
    return hit ? (hit.object as THREE.Mesh) : null;
  }

  private _onHover(screenPos: ScreenPos): void {
    const hit = this._castHandles(screenPos);
    const key = hit ? `${hit.userData["colliderId"]}:${hit.userData["faceAxis"]}` : null;
    if (key === this._hoveredKey) return;
    const wasHovering = this._hoveredKey !== null;
    this._hoveredKey = key;
    if ((key !== null) !== wasHovering) this._bus.emit("collider:handle-hover", { hovering: key !== null });
    for (const m of this._handles) {
      const mat = m.material as THREE.MeshBasicMaterial;
      const isHover = key !== null && `${m.userData["colliderId"]}:${m.userData["faceAxis"]}` === key;
      mat.color.setHex(isHover ? 0xffffff : AXIS_COLOR[m.userData["faceAxis"] as Face]);
      mat.opacity = isHover ? 1.0 : 0.6;
      m.scale.setScalar(isHover ? 1.4 : 1.0);
    }
  }

  // ── Dragging ────────────────────────────────────────────────────────────────

  private _onMouseDown(screenPos: ScreenPos): void {
    const hit = this._castHandles(screenPos);
    if (!hit) return;
    const obj = this._selectedObject();
    if (!obj) return;
    const { list, explicit } = this._effectiveColliders(obj);
    const colliderId = hit.userData["colliderId"] as string;
    const orig = list.find(c => c.id === colliderId);
    if (!orig) return;

    this._drag = {
      colliderId,
      face:     hit.userData["faceAxis"] as Face,
      origList: list.map(c => ({ ...c, offset: { ...c.offset }, size: { ...c.size } })),
      orig:     { ...orig, offset: { ...orig.offset }, size: { ...orig.size } },
      explicit,
    };
    // Set DRAG before emitting so our own gizmo:dragging doesn't mute us.
    this._state = "DRAG";
    this._world.beginTransaction("resize collider");
    this._bus.emit("gizmo:dragging", { isDragging: true });
  }

  private _onDragMove(screenPos: ScreenPos): void {
    const d = this._drag;
    const obj = this._selectedObject();
    if (!d || !obj || !this._selectedId) return;

    const rect = this._canvas.getBoundingClientRect();
    const ndcX =  ((screenPos.x - rect.left) / rect.width)  * 2 - 1;
    const ndcY = -((screenPos.y - rect.top)  / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this._camera);
    const ray = this._raycaster.ray;

    // Drag axis in world space: the signed outward direction of the dragged face,
    // rotated through the collider's full world orientation.
    const origWorld = colliderWorldTransform(obj, d.orig);
    const q = new THREE.Quaternion(origWorld.quat.x, origWorld.quat.y, origWorld.quat.z, origWorld.quat.w);
    const axisLocal = FACE_AXIS[d.face];   // signed, collider-local
    const axisWorld = axisLocal.clone().applyQuaternion(q).normalize();

    const axisKey: "x" | "y" | "z" = Math.abs(FACE_AXIS[d.face].x) ? "x" : Math.abs(FACE_AXIS[d.face].y) ? "y" : "z";
    const scaleComp = Math.abs(axisKey === "x" ? obj.scale.x : axisKey === "y" ? obj.scale.y : obj.scale.z) || 1;

    // Pinned (opposite) face center in world space.
    const halfWorld = origWorld.halfExtents[axisKey];
    const center = new THREE.Vector3(origWorld.pos.x, origWorld.pos.y, origWorld.pos.z);
    const pinned = center.clone().sub(axisWorld.clone().multiplyScalar(halfWorld));

    // Axis-constrained projection: plane through the pinned point containing the axis,
    // oriented toward the camera (TransformControls-style).
    const camDir = (this._camera as THREE.PerspectiveCamera).position.clone().sub(pinned);
    const planeNormal = axisWorld.clone().cross(camDir).cross(axisWorld);
    if (planeNormal.lengthSq() < 1e-8) return;  // looking straight down the axis
    planeNormal.normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, pinned);
    const hit = new THREE.Vector3();
    if (!ray.intersectPlane(plane, hit)) return;

    // New world size along the axis → local (pre-scale) units.
    let newSizeLocal = hit.clone().sub(pinned).dot(axisWorld) / scaleComp;
    newSizeLocal = Math.max(MIN, this._altDown ? newSizeLocal : snap(newSizeLocal));

    // Keep the opposite face pinned: shift the local offset by half the size delta
    // along the collider-local axis, rotated by the collider's local yaw into the
    // object frame (offset is stored in object space).
    const o = d.orig;
    const shift = axisLocal.clone().multiplyScalar((newSizeLocal - o.size[axisKey]) / 2);
    if (o.rotationY) shift.applyAxisAngle(new THREE.Vector3(0, 1, 0), o.rotationY * Math.PI / 180);
    const offset: Vec3 = { x: o.offset.x + shift.x, y: o.offset.y + shift.y, z: o.offset.z + shift.z };
    const size:   Vec3 = { ...o.size, [axisKey]: newSizeLocal };

    // Writing the full array materializes the implicit auto-box on first drag.
    const next = d.origList.map(c => c.id === d.colliderId ? { ...c, offset, size } : c);
    this._world.updateObject(this._activeZoneId, this._selectedId, { colliders: next });
    this._positionAll();
  }

  private _commitDrag(): void {
    this._world.commitTransaction();
    this._endDrag();
  }

  private _cancelDrag(): void {
    const d = this._drag;
    if (d && this._selectedId) {
      // Restore the pre-drag list (undefined stays undefined only if nothing was
      // written yet; once materialized, restore the explicit original values).
      this._world.updateObject(this._activeZoneId, this._selectedId, {
        colliders: d.explicit ? d.origList : undefined,
      } as Partial<WorldObject>);
    }
    this._world.abortTransaction();
    this._endDrag();
  }

  private _endDrag(): void {
    this._state = "IDLE";
    this._drag = null;
    this._bus.emit("gizmo:dragging", { isDragging: false });
    this._sync();
  }
}
