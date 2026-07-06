import * as THREE from "three";
import { castObjectBoxes } from "@/editor/objectPicking";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type {
  IEditorModule, ToolId, EditorObjectType, ScreenPos,
  SelectedObjectPayload, SelectedRef, WorldObject, WallDef, WallNode,
} from "@/types";

const PRIORITY: EditorObjectType[] = ["opening", "object", "checkpoint", "spawn", "platform", "wall", "floor"];

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
  // Additional selected entities beyond the primary (stored as refs so they survive mesh
  // rebuilds; re-tinted via _retintExtras on the rebuilt events).
  private _extraRefs:         SelectedRef[] = [];
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
      this._bus.on("input:click",     ({ screenPos, shift, meta, ctrl }) => this._onClick(screenPos, shift || meta || ctrl)),
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
      this._bus.on("wall:removed",     ({ wallId })  => this._removeFromSelection(wallId)),
      this._bus.on("floor:removed",    ({ floorId }) => this._removeFromSelection(floorId)),
      this._bus.on("platform:removed", ({ id })      => this._removeFromSelection(id)),
      this._bus.on("stair:removed",    ({ id })      => this._removeFromSelection(id)),
      this._bus.on("object:removed",   ({ id })      => this._removeFromSelection(id)),
      this._bus.on("object:deselected", ()           => {
        if (this._selected) { this._restore(this._selected); this._selected = null; }
        this._clearExtras();
        this._emitSelectionChanged();
      }),
      this._bus.on("selection:set",     ({ refs })     => this._setSelection(refs)),
    );
  }

  update(_dt: number): void {}

  dispose(): void {
    this._unsub.forEach(u => u());
    this._unsub = [];
    if (this._hovered  && this._hovered !== this._selected) this._restore(this._hovered);
    if (this._selected) this._restore(this._selected);
    this._clearExtras();
    this._selected = null;
    this._hovered  = null;
  }

  // ─── Picking ────────────────────────────────────────────────────────────────

  private _onClick(screenPos: ScreenPos, additive = false): void {
    if (this._suppressNextClick) { this._suppressNextClick = false; return; }
    if (this._activeTool !== "select") return;
    const selectable = this._cast(screenPos);
    if (selectable.length === 0) { if (!additive) this._deselect(); return; }
    const root = this._resolveRoot(this._pickByPriority(selectable).object);
    if (additive) this._toggleInSelection(root);
    else          this._select(root);
  }

  /** Shift/Cmd-click: add an unselected entity to the set, or remove an already-selected one. */
  private _toggleInSelection(root: THREE.Object3D): void {
    const id = root.userData.editorId as string;
    if (!id) return;
    if (this._selected && this._selected.userData.editorId === id) {
      // Toggling the primary: only meaningful as "clear" when it's the sole selection.
      if (this._extraRefs.length === 0) this._deselect();
      return;
    }
    const extraIdx = this._extraRefs.findIndex(r => r.id === id);
    if (extraIdx >= 0) {                       // remove an extra
      this._restore(root);
      this._extraRefs.splice(extraIdx, 1);
      this._emitSelectionChanged();
      return;
    }
    if (!this._selected) { this._select(root); return; }   // nothing yet → make it primary
    this._extraRefs.push(this._refOf(root));   // add as extra
    this._applyTint(root, SELECT_EMISSIVE, SELECT_INTENSITY);
    this._emitSelectionChanged();
  }

  /**
   * Replace the whole selection from a ref list (e.g. "select all in group").
   * First resolvable ref becomes primary, the rest become extras. Refs whose mesh
   * isn't in the live scene are skipped; duplicate roots (walls sharing a run mesh)
   * are deduped. Empty result clears the selection.
   */
  private _setSelection(refs: SelectedRef[]): void {
    const resolved: THREE.Object3D[] = [];
    const seen = new Set<string>();
    for (const ref of refs) {
      const mesh = this._findMesh(ref.id, ref.zoneId);
      if (!mesh) continue;
      const root = this._resolveRoot(mesh);
      if (seen.has(root.uuid)) continue;
      seen.add(root.uuid);
      resolved.push(root);
    }

    // Drop the current selection/hover tints before applying the new set.
    if (this._selected) { this._restore(this._selected); this._selected = null; }
    this._clearExtras();
    if (this._hovered) { this._restore(this._hovered); this._hovered = null; }

    if (resolved.length === 0) { this._bus.emit("object:deselected", {}); return; }

    const [primary, ...rest] = resolved;
    this._selected = primary;
    this._applyTint(primary, SELECT_EMISSIVE, SELECT_INTENSITY);
    for (const root of rest) {
      this._extraRefs.push(this._refOf(root));
      this._applyTint(root, SELECT_EMISSIVE, SELECT_INTENSITY);
    }
    this._emitSelected(primary);
    this._emitSelectionChanged();
  }

  private _refOf(root: THREE.Object3D): SelectedRef {
    const ud = root.userData;
    const memberIds = ud.editorType === "wall" ? (ud.wallIds as string[] | undefined) : undefined;
    return { id: ud.editorId, type: ud.editorType, zoneId: ud.zoneId, memberIds };
  }

  private _clearExtras(): void {
    for (const ref of this._extraRefs) {
      const mesh = this._findMesh(ref.id, ref.zoneId);
      if (mesh) this._restore(mesh);
    }
    this._extraRefs = [];
  }

  /** Re-apply the selection tint to all extra refs (after a mesh rebuild). */
  private _retintExtras(): void {
    for (const ref of this._extraRefs) {
      const mesh = this._findMesh(ref.id, ref.zoneId);
      if (mesh) this._applyTint(mesh, SELECT_EMISSIVE, SELECT_INTENSITY);
    }
  }

  private _selectionRefs(): SelectedRef[] {
    const refs = [...this._extraRefs];
    if (this._selected) refs.unshift(this._refOf(this._selected));
    return refs;
  }

  private _emitSelectionChanged(): void {
    this._bus.emit("selection:changed", { refs: this._selectionRefs() });
  }

  private _onMove(screenPos: ScreenPos): void {
    if (this._activeTool !== "select") return;
    const selectable = this._cast(screenPos);
    const hovered = selectable.length
      ? this._resolveRoot(this._pickByPriority(selectable).object)
      : null;
    if (hovered === this._hovered) return;
    // Don't strip the selection tint off the primary OR any extra when hover leaves it.
    if (this._hovered && !this._isSelected(this._hovered)) this._restore(this._hovered);
    this._hovered = hovered;
    if (hovered && !this._isSelected(hovered)) this._applyTint(hovered, HOVER_EMISSIVE, HOVER_INTENSITY);
  }

  /** Is this root the primary selection or one of the extras? */
  private _isSelected(root: THREE.Object3D): boolean {
    const id = root.userData.editorId as string;
    if (this._selected && this._selected.userData.editorId === id) return true;
    return this._extraRefs.some(r => r.id === id);
  }

  private _cast(screenPos: ScreenPos): THREE.Intersection[] {
    const rect = this._dom.getBoundingClientRect();
    this._mouse.x =  ((screenPos.x - rect.left) / rect.width)  * 2 - 1;
    this._mouse.y = -((screenPos.y - rect.top)  / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._mouse, this._camera);
    const hits = this._raycaster
      .intersectObjects(this._scene.children, true)
      .filter(h => {
        const ud = h.object.userData;
        if (!ud.selectable) return false;
        if (ud.editorType === "floor" && ud.floorLevel !== this._activeFloorLevel) return false;
        return true;
      });
    // Generous object picking: low-poly props are full of gaps, so a click "on" an
    // object often threads through to whatever's behind. Also test each object's
    // cached model AABB — entering the box counts as hitting the object, and the
    // normal nearest-distance sort still lets anything genuinely closer win.
    for (const b of castObjectBoxes(this._raycaster.ray, this._scene)) {
      hits.push({ distance: b.distance, point: b.point, object: b.root } as THREE.Intersection);
    }
    hits.sort((a, b) => a.distance - b.distance);
    // Hidden-wall ghosts never occlude real geometry: pick them only when nothing
    // solid is under the cursor (so a dollhouse-hidden wall stays click-through,
    // but a fully hidden run is still selectable on empty space).
    const solid = hits.filter(h => !h.object.userData.ghostPick);
    return solid.length > 0 ? solid : hits;
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
    if (this._selected === root && this._extraRefs.length === 0) return;
    this._clearExtras();
    if (this._selected && this._selected !== root) this._restore(this._selected);
    this._selected = root;
    if (this._hovered === root) this._hovered = null;
    this._applyTint(root, SELECT_EMISSIVE, SELECT_INTENSITY);
    this._emitSelected(root);
    this._emitSelectionChanged();
  }

  private _emitSelected(root: THREE.Object3D): void {
    const ud = root.userData;
    const wallTransform = ud.editorType === "wall" ? this._wallRunTransform(root) : undefined;
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
      wallRunCenter:   wallTransform?.center,
      wallRunAngleDeg: wallTransform?.angleDeg,
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

  /**
   * WallDef has no stored position/rotation (it's node-backed) — derive the run's XZ
   * centroid (from every shared node) and orientation (anchor wall's start→end vector)
   * from live node positions so the panel can show/edit them like any other type.
   */
  private _wallRunTransform(root: THREE.Object3D): { center: { x: number; z: number }; angleDeg: number } | undefined {
    const zone = this._worldState.zones.get(root.userData.zoneId as string);
    if (!zone) return undefined;
    const wallIds = (root.userData.wallIds as string[] | undefined) ?? [root.userData.editorId as string];
    const walls = wallIds.map(id => zone.walls.find(w => w.id === id)).filter((w): w is WallDef => !!w);
    if (!walls.length) return undefined;
    const nodeIds = [...new Set(walls.flatMap(w => [w.startNodeId, w.endNodeId]))];
    const nodes = nodeIds.map(id => zone.nodes.find(n => n.id === id)).filter((n): n is WallNode => !!n);
    if (!nodes.length) return undefined;
    const center = {
      x: nodes.reduce((s, n) => s + n.x, 0) / nodes.length,
      z: nodes.reduce((s, n) => s + n.z, 0) / nodes.length,
    };
    const anchor = walls[0]!;
    const start  = zone.nodes.find(n => n.id === anchor.startNodeId);
    const end    = zone.nodes.find(n => n.id === anchor.endNodeId);
    const angleDeg = (start && end) ? THREE.MathUtils.radToDeg(Math.atan2(end.z - start.z, end.x - start.x)) : 0;
    return { center, angleDeg };
  }

  private _deselect(): void {
    if (!this._selected && this._extraRefs.length === 0) return;
    // The object:deselected listener does the actual clearing (primary + extras) + event.
    this._bus.emit("object:deselected", {});
  }

  /** Remove one entity from the selection (e.g. it was deleted). */
  private _removeFromSelection(id: string): void {
    if (this._selected?.userData.editorId === id) { this._deselect(); return; }
    const i = this._extraRefs.findIndex(r => r.id === id);
    if (i < 0) return;
    const mesh = this._findMesh(this._extraRefs[i].id, this._extraRefs[i].zoneId);
    if (mesh) this._restore(mesh);
    this._extraRefs.splice(i, 1);
    this._emitSelectionChanged();
  }

  /** Wall was rebuilt — re-apply selection tint to the new mesh and refresh panel. */
  private _onWallRebuilt(zoneId: string, wallId: string): void {
    if (this._extraRefs.length) this._retintExtras();
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
      // But NOT during a multi-selection — object:selected would drop the group gizmo
      // back to single-select on the primary (the extras stay tinted but untracked).
      if (inMyRun && this._extraRefs.length === 0) this._emitSelected(newMesh);
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
    if (this._extraRefs.length) this._retintExtras();
    if (!this._selected || this._selected.userData.zoneId !== zoneId) return;
    if (this._selected.userData.editorId !== platformId) return;
    const newMesh = this._findMesh(platformId, zoneId);
    if (!newMesh) { this._deselect(); return; }
    this._selected = newMesh;
    this._applyTint(newMesh, SELECT_EMISSIVE, SELECT_INTENSITY);
    if (this._extraRefs.length === 0) this._emitSelected(newMesh);
  }

  private _onStairRebuilt(zoneId: string, stairId: string): void {
    if (this._extraRefs.length) this._retintExtras();
    if (!this._selected || this._selected.userData.zoneId !== zoneId) return;
    if (this._selected.userData.editorId !== stairId) return;
    const newMesh = this._findMesh(stairId, zoneId);
    if (!newMesh) { this._deselect(); return; }
    this._selected = newMesh;
    this._applyTint(newMesh, SELECT_EMISSIVE, SELECT_INTENSITY);
    if (this._extraRefs.length === 0) this._emitSelected(newMesh);
  }

  private _onFloorRebuilt(zoneId: string, floorId: string): void {
    if (this._extraRefs.length) this._retintExtras();
    if (!this._selected || this._selected.userData.zoneId !== zoneId) return;
    if (this._selected.userData.editorId !== floorId) return;
    const newMesh = this._findMesh(floorId, zoneId);
    if (!newMesh) { this._deselect(); return; }
    this._selected = newMesh;
    this._applyTint(newMesh, SELECT_EMISSIVE, SELECT_INTENSITY);
    if (this._extraRefs.length === 0) this._emitSelected(newMesh);
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
      case "checkpoint": return zone.checkpoints?.find(c => c.id === editorId) ?? null;
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
