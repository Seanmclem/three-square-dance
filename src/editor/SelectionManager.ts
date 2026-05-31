import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type {
  IEditorModule, ToolId, EditorObjectType, ScreenPos,
  SelectedObjectPayload, WorldObject, WallDef,
} from "@/types";

const PRIORITY: EditorObjectType[] = ["opening", "object", "platform", "wall", "floor"];

const SELECT_EMISSIVE  = 0x3366ff;
const SELECT_INTENSITY = 0.25;
const HOVER_EMISSIVE   = 0x224488;
const HOVER_INTENSITY  = 0.12;

/**
 * Raycast-based picking. Listens for centralized input events, applies emissive
 * tint for hover/selection, resolves grouped (GLTF-style) meshes to their root,
 * and emits `object:selected` / `object:deselected` for the React UI.
 */
export class SelectionManager implements IEditorModule {
  private readonly _scene:      THREE.Scene;
  private readonly _camera:     THREE.PerspectiveCamera;
  private readonly _dom:        HTMLCanvasElement;
  private readonly _worldState: WorldState;
  private readonly _bus:        EventBus;

  private readonly _raycaster = new THREE.Raycaster();
  private readonly _mouse     = new THREE.Vector2();

  private _selected:          THREE.Object3D | null = null;
  private _hovered:           THREE.Object3D | null = null;
  private _activeTool:        ToolId = "select";
  private _suppressNextClick  = false;
  private _activeFloorLevel   = 0;
  private _unsub: Array<() => void> = [];

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    domElement: HTMLCanvasElement,
    worldState: WorldState,
    bus: EventBus,
  ) {
    this._scene      = scene;
    this._camera     = camera;
    this._dom        = domElement;
    this._worldState = worldState;
    this._bus        = bus;
  }

  init(): void {
    this._unsub.push(
      this._bus.on("input:click",     ({ screenPos }) => this._onClick(screenPos)),
      this._bus.on("input:mousemove", ({ screenPos }) => this._onMove(screenPos)),
      this._bus.on("tool:select",     ({ tool })      => { this._activeTool = tool; }),
      this._bus.on("floor:select",    ({ level })     => { this._activeFloorLevel = level; }),
      this._bus.on("object:updated",    ({ id, changes }) => this._onExternalUpdate(id, changes)),
      this._bus.on("wall:rebuilt",     ({ zoneId, wallId }) => this._onWallRebuilt(zoneId, wallId)),
      this._bus.on("platform:rebuilt", ({ zoneId, platformId }) => this._onPlatformRebuilt(zoneId, platformId)),
      this._bus.on("stair:rebuilt",    ({ zoneId, stairId })    => this._onStairRebuilt(zoneId, stairId)),
      this._bus.on("floor:rebuilt",    ({ zoneId, floorId })    => this._onFloorRebuilt(zoneId, floorId)),
      this._bus.on("tool:placed",      ({ id, zoneId }) => this._selectAfterPlace(id, zoneId)),
      this._bus.on("gizmo:dragging",  ({ isDragging }) => {
        if (!isDragging) this._suppressNextClick = true;
      }),
    );
  }

  update(_dt: number): void {}

  dispose(): void {
    this._unsub.forEach(u => u());
    this._unsub = [];
    if (this._hovered  && this._hovered !== this._selected) this._restore(this._hovered);
    if (this._selected) this._restore(this._selected);
    this._selected = null;
    this._hovered  = null;
  }

  // ─── Picking ────────────────────────────────────────────────────────────────

  private _onClick(screenPos: ScreenPos): void {
    if (this._suppressNextClick) { this._suppressNextClick = false; return; }
    if (this._activeTool !== "select") return;
    const selectable = this._cast(screenPos);
    if (selectable.length === 0) { this._deselect(); return; }
    this._select(this._resolveRoot(this._pickByPriority(selectable).object));
  }

  private _onMove(screenPos: ScreenPos): void {
    if (this._activeTool !== "select") return;
    const selectable = this._cast(screenPos);
    const hovered = selectable.length
      ? this._resolveRoot(this._pickByPriority(selectable).object)
      : null;
    if (hovered === this._hovered) return;
    if (this._hovered && this._hovered !== this._selected) this._restore(this._hovered);
    this._hovered = hovered;
    if (hovered && hovered !== this._selected) this._applyTint(hovered, HOVER_EMISSIVE, HOVER_INTENSITY);
  }

  private _cast(screenPos: ScreenPos): THREE.Intersection[] {
    const rect = this._dom.getBoundingClientRect();
    this._mouse.x =  ((screenPos.x - rect.left) / rect.width)  * 2 - 1;
    this._mouse.y = -((screenPos.y - rect.top)  / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._mouse, this._camera);
    return this._raycaster
      .intersectObjects(this._scene.children, true)
      .filter(h => {
        const ud = h.object.userData;
        if (!ud.selectable) return false;
        if (ud.editorType === "floor" && ud.floorLevel !== this._activeFloorLevel) return false;
        return true;
      });
  }

  private _pickByPriority(hits: THREE.Intersection[]): THREE.Intersection {
    const nearest = hits[0].distance;
    // Only use type priority as a tiebreaker among co-planar / nearly co-planar hits.
    // Anything clearly further back loses to the closest hit regardless of type.
    const coplanar = hits.filter(h => h.distance <= nearest + 0.05);
    for (const type of PRIORITY) {
      const hit = coplanar.find(h => h.object.userData.editorType === type);
      if (hit) return hit;
    }
    return hits[0];
  }

  /** Walk up from a child mesh to the group carrying the real editorId. */
  private _resolveRoot(obj: THREE.Object3D): THREE.Object3D {
    if (!obj.userData._parentId) return obj;
    let node: THREE.Object3D | null = obj;
    while (node && node.parent) {
      node = node.parent;
      if (node.userData.editorId && !node.userData._parentId) return node;
    }
    return obj;
  }

  // ─── Selection state ────────────────────────────────────────────────────────

  private _select(root: THREE.Object3D): void {
    if (this._selected === root) return;
    if (this._selected) this._restore(this._selected);
    this._selected = root;
    if (this._hovered === root) this._hovered = null;
    this._applyTint(root, SELECT_EMISSIVE, SELECT_INTENSITY);
    this._emitSelected(root);
  }

  private _emitSelected(root: THREE.Object3D): void {
    const ud = root.userData;
    this._bus.emit("object:selected", {
      id:       ud.editorId,
      type:     ud.editorType,
      zoneId:   ud.zoneId,
      parentId: ud.wallId,
      position: { x: root.position.x, y: root.position.y, z: root.position.z },
      rotation: {
        x: THREE.MathUtils.radToDeg(root.rotation.x),
        y: THREE.MathUtils.radToDeg(root.rotation.y),
        z: THREE.MathUtils.radToDeg(root.rotation.z),
      },
      scale:    { x: root.scale.x, y: root.scale.y, z: root.scale.z },
      data:     this._getDataRecord(root),
      runWalls: this._getRunWalls(root),
    });
  }

  private _getRunWalls(root: THREE.Object3D): WallDef[] | undefined {
    if (root.userData.editorType !== "wall") return undefined;
    const wallIds = root.userData.wallIds as string[] | undefined;
    if (!wallIds || wallIds.length <= 1) return undefined;
    const zone = this._worldState.zones.get(root.userData.zoneId as string);
    if (!zone) return undefined;
    return wallIds
      .map(id => zone.walls.find(w => w.id === id))
      .filter((w): w is WallDef => w !== undefined);
  }

  private _deselect(): void {
    if (!this._selected) return;
    this._restore(this._selected);
    this._selected = null;
    this._bus.emit("object:deselected", {});
  }

  /** Wall was rebuilt — re-apply selection tint to the new mesh and refresh panel. */
  private _onWallRebuilt(zoneId: string, wallId: string): void {
    if (!this._selected || this._selected.userData.zoneId !== zoneId) return;
    const ud = this._selected.userData;

    if (ud.editorType === "wall") {
      // Match if this wall IS the selected primary, or was a member of the selected run.
      // We check the OLD userData.wallIds (stale ref is fine — it captures pre-split membership).
      const inMyRun =
        ud.editorId === wallId ||
        (ud.wallIds as string[] | undefined)?.includes(wallId);
      if (!inMyRun) return;
      const newMesh = this._findMesh(ud.editorId as string, zoneId);
      if (!newMesh) { this._selected = null; return; }
      this._selected = newMesh;
      this._applyTint(newMesh, SELECT_EMISSIVE, SELECT_INTENSITY);
      // Re-emit whenever any wall in this run is rebuilt so openings on non-primary
      // segments (e.g. after a cross-wall drag) appear in the panel immediately.
      if (inMyRun) this._emitSelected(newMesh);
    } else if (ud.editorType === "opening" && ud.wallId === wallId) {
      const newMesh = this._findMesh(ud.editorId as string, zoneId);
      if (!newMesh) { this._deselect(); return; }
      this._selected = newMesh;
      this._applyTint(newMesh, SELECT_EMISSIVE, SELECT_INTENSITY);
      this._bus.emit("object:selected", {
        id:       newMesh.userData.editorId,
        type:     "opening",
        zoneId,
        parentId: wallId,
        position: { x: newMesh.position.x, y: newMesh.position.y, z: newMesh.position.z },
        rotation: { x: 0, y: THREE.MathUtils.radToDeg(newMesh.rotation.y), z: 0 },
        scale:    { x: 1, y: 1, z: 1 },
        data:     this._getDataRecord(newMesh),
      });
    }
  }

  private _onPlatformRebuilt(zoneId: string, platformId: string): void {
    if (!this._selected || this._selected.userData.zoneId !== zoneId) return;
    if (this._selected.userData.editorId !== platformId) return;
    const newMesh = this._findMesh(platformId, zoneId);
    if (!newMesh) { this._deselect(); return; }
    this._selected = newMesh;
    this._applyTint(newMesh, SELECT_EMISSIVE, SELECT_INTENSITY);
    this._emitSelected(newMesh);
  }

  private _onStairRebuilt(zoneId: string, stairId: string): void {
    if (!this._selected || this._selected.userData.zoneId !== zoneId) return;
    if (this._selected.userData.editorId !== stairId) return;
    const newMesh = this._findMesh(stairId, zoneId);
    if (!newMesh) { this._deselect(); return; }
    this._selected = newMesh;
    this._applyTint(newMesh, SELECT_EMISSIVE, SELECT_INTENSITY);
    this._emitSelected(newMesh);
  }

  private _onFloorRebuilt(zoneId: string, floorId: string): void {
    if (!this._selected || this._selected.userData.zoneId !== zoneId) return;
    if (this._selected.userData.editorId !== floorId) return;
    const newMesh = this._findMesh(floorId, zoneId);
    if (!newMesh) { this._deselect(); return; }
    this._selected = newMesh;
    this._applyTint(newMesh, SELECT_EMISSIVE, SELECT_INTENSITY);
    this._emitSelected(newMesh);
  }

  private _selectAfterPlace(id: string, zoneId: string, attempt = 0): void {
    const mesh = this._findMesh(id, zoneId);
    if (mesh) {
      this._select(this._resolveRoot(mesh));
    } else if (attempt < 15) {
      setTimeout(() => this._selectAfterPlace(id, zoneId, attempt + 1), 50);
    }
  }

  private _findMesh(editorId: string, zoneId: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null;
    this._scene.traverse(obj => {
      if (found) return;
      if (obj.userData.zoneId !== zoneId) return;
      if (obj.userData.editorId === editorId) { found = obj; return; }
      const wallIds = obj.userData.wallIds as string[] | undefined;
      if (wallIds?.includes(editorId)) found = obj;
    });
    return found;
  }

  /** React edited a transform field — apply it to the live mesh. */
  private _onExternalUpdate(id: string, changes: Partial<WorldObject>): void {
    if (!this._selected || this._selected.userData.editorId !== id) return;
    const { position, rotation, scale } = changes;
    if (position) this._selected.position.set(position.x, position.y, position.z);
    if (rotation) {
      this._selected.rotation.set(
        THREE.MathUtils.degToRad(rotation.x),
        THREE.MathUtils.degToRad(rotation.y),
        THREE.MathUtils.degToRad(rotation.z),
      );
    }
    if (scale) this._selected.scale.set(scale.x, scale.y, scale.z);
  }

  private _getDataRecord(root: THREE.Object3D): SelectedObjectPayload["data"] {
    const { editorType, editorId, zoneId, floorLevel } = root.userData;
    const zone = this._worldState.zones.get(zoneId);
    if (!zone) return null;
    switch (editorType as EditorObjectType) {
      case "wall":     return zone.walls.find(w => w.id === editorId) ?? null;
      case "floor":    return zone.floors.find(f => f.id === editorId) ?? null;
      case "platform": return zone.platforms.find(p => p.id === editorId) ?? null;
      case "stair":    return zone.stairs.find(s => s.id === editorId) ?? null;
      case "object":   return zone.objects.find(o => o.id === editorId) ?? null;
      case "opening": {
        const wall = zone.walls.find(w => w.id === root.userData.wallId);
        return wall?.openings.find(o => o.id === editorId) ?? null;
      }
      default:         return null;
    }
  }

  // ─── Emissive tinting ───────────────────────────────────────────────────────

  private _applyTint(root: THREE.Object3D, color: number, intensity: number): void {
    root.traverse(child => {
      const mat = this._ownMaterial(child);
      if (!mat) return;
      mat.emissive.setHex(color);
      mat.emissiveIntensity = intensity;
      if (child.userData._selectOpacity !== undefined) mat.opacity = child.userData._selectOpacity;
    });
  }

  private _restore(root: THREE.Object3D): void {
    root.traverse(child => {
      if (!(child instanceof THREE.Mesh) || !child.userData._ownsMaterial) return;
      const mat = child.material;
      if (Array.isArray(mat) || !(mat instanceof THREE.MeshStandardMaterial)) return;
      mat.emissive.setHex(child.userData._origEmissive ?? 0x000000);
      mat.emissiveIntensity = child.userData._origEmissiveIntensity ?? 0;
      if (child.userData._origOpacity !== undefined) mat.opacity = child.userData._origOpacity;
    });
  }

  /**
   * Clone the material on first touch so tinting never mutates a shared
   * material, and capture the pristine emissive once for later restore.
   */
  private _ownMaterial(child: THREE.Object3D): THREE.MeshStandardMaterial | null {
    if (!(child instanceof THREE.Mesh)) return null;
    let mat = child.material;
    if (Array.isArray(mat) || !(mat instanceof THREE.MeshStandardMaterial)) return null;
    if (!child.userData._ownsMaterial) {
      mat = mat.clone();
      child.material = mat;
      child.userData._ownsMaterial = true;
      child.userData._origEmissive = mat.emissive.getHex();
      child.userData._origEmissiveIntensity = mat.emissiveIntensity;
      if (mat.transparent) child.userData._origOpacity = mat.opacity;
    }
    return mat;
  }
}
