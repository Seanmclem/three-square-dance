import * as THREE from "three";
import { assetManager } from "@/core/AssetManager";
import { decalOrientation } from "@/world/decals/DecalBuilder";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { DecalDef, DecalKind, ToolId, ScreenPos } from "@/types";

// Click-to-stamp decal placement. Armed by the DecalBrowser panel via
// `decaltool:texture`; shows a cheap quad ghost on the surface under the cursor
// (the real DecalGeometry projection is built by ZoneManager on commit — per-move
// regen would clip a merged run's full index buffer every frame). Scroll = size,
// shift+scroll = rotate, [ / ] = rotate ±15°, click = stamp (stays armed),
// Escape = disarm. Locks EditorCamera wheel-zoom while the ghost is on a surface.

const TARGET_TYPES = new Set(["wall", "floor", "platform", "stair"]);
const ZOOM_LOCK_SOURCE = "decal-tool";
const MIN_SIZE = 0.1, MAX_SIZE = 8;

export class DecalTool {
  private _active  = false;
  private _toolId: ToolId = "select";
  private _textureId: string | null = null;
  private _kind: DecalKind = "overlay";
  private _size = { width: 1, height: 1 };
  private _roll = 0;
  private _opacity = 1;
  private _activeZoneId = "demo";
  private _ghost: THREE.Mesh | null = null;
  private _hover: { point: THREE.Vector3; normal: THREE.Vector3 } | null = null;
  private _zoomLocked = false;
  private _lastScreenPos: ScreenPos = { x: 0, y: 0 };
  // Surface-kind decals have no mesh to raycast — this tool picks them analytically
  // (ray vs projector rectangle) and shows a wireframe rectangle while one is selected.
  private _selectedSurfaceId: string | null = null;
  private _outline: THREE.LineLoop | null = null;
  private readonly _raycaster = new THREE.Raycaster();
  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _scene:  THREE.Scene,
    private readonly _world:  WorldState,
    private readonly _bus:    EventBus,
    private readonly _camera: THREE.PerspectiveCamera,
    private readonly _canvas: HTMLCanvasElement,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("tool:select", ({ tool }) => {
        this._toolId = tool;
        this._active = tool === "decal";
        if (!this._active) this._hideGhost();
      }),
      this._bus.on("zone:activated", ({ zoneId }) => { this._activeZoneId = zoneId; }),

      this._bus.on("decaltool:texture", ({ textureId, kind }) => {
        this._textureId = textureId;
        this._kind      = kind;
        if (!textureId) { this._hideGhost(); return; }
        void this._applyGhostTexture(textureId);
      }),

      this._bus.on("input:mousemove", ({ screenPos }) => {
        this._lastScreenPos = screenPos;
        if (!this._active || !this._textureId) return;
        this._hover = this._pickSurface(screenPos);
        this._refreshGhost();
      }),

      // Surface-decal selection (Select tool, or Decal tool while disarmed). Runs after
      // SelectionManager's click handler (registered earlier), so emitting here overrides
      // its wall/floor pick — the TriggerVolumeTool pattern.
      this._bus.on("input:click", ({ button }) => {
        if (button !== 0) return;
        if (this._toolId !== "select" && this._toolId !== "decal") return;
        if (this._toolId === "decal" && this._textureId) return;   // armed = stamping, not selecting
        const dec = this._findSurfaceDecalAt(this._lastScreenPos);
        if (!dec) return;
        this._bus.emit("object:deselected", {});
        this._selectSurfaceDecal(dec);
      }),
      this._bus.on("object:deselected", () => this._clearSurfaceSelection()),
      this._bus.on("object:selected", ({ type, id }) => {
        if (type !== "decal" || id !== this._selectedSurfaceId) this._clearSurfaceSelection();
      }),
      this._bus.on("decal:removed", ({ id }) => {
        if (id === this._selectedSurfaceId) this._clearSurfaceSelection();
      }),
      this._bus.on("decal:updated", ({ id }) => {
        if (id !== this._selectedSurfaceId) return;
        const dec = this._world.zones.get(this._activeZoneId)?.decals?.find(d => d.id === id);
        if (dec) this._positionOutline(dec);
      }),

      this._bus.on("input:wheel", ({ delta, shift }) => {
        if (!this._active || !this._hover || !this._textureId) return;
        if (shift) {
          this._roll = (this._roll - delta * 0.1) % 360;
        } else {
          const f = Math.exp(-delta * 0.001);
          this._size.width  = Math.min(MAX_SIZE, Math.max(MIN_SIZE, this._size.width  * f));
          this._size.height = Math.min(MAX_SIZE, Math.max(MIN_SIZE, this._size.height * f));
        }
        this._refreshGhost();
      }),

      this._bus.on("input:keydown", ({ code }) => {
        if (!this._active) return;
        if (code === "Escape") {
          // Disarm — also tells the DecalBrowser to clear its tile highlight.
          this._bus.emit("decaltool:texture", { textureId: null, kind: this._kind });
          return;
        }
        if (code === "BracketLeft")  { this._roll = (this._roll - 15) % 360; this._refreshGhost(); }
        if (code === "BracketRight") { this._roll = (this._roll + 15) % 360; this._refreshGhost(); }
      }),

      this._bus.on("input:click", ({ button }) => {
        if (button !== 0 || !this._active || this._toolId !== "decal") return;
        if (!this._textureId || !this._hover) return;
        this._commit();
      }),
    );
  }

  private _setRayFrom(screenPos: ScreenPos): void {
    const rect = this._canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((screenPos.x - rect.left) / rect.width) * 2 - 1,
      -((screenPos.y - rect.top) / rect.height) * 2 + 1,
    );
    this._raycaster.setFromCamera(ndc, this._camera);
  }

  /** Analytic pick: ray vs each surface decal's projector rectangle (they have no mesh). */
  private _findSurfaceDecalAt(screenPos: ScreenPos): DecalDef | null {
    const decals = this._world.zones.get(this._activeZoneId)?.decals?.filter(d => d.kind === "surface");
    if (!decals?.length) return null;
    this._setRayFrom(screenPos);
    const ray = this._raycaster.ray;
    let best: { dec: DecalDef; t: number } | null = null;
    for (const d of decals) {
      const q = new THREE.Quaternion().setFromEuler(decalOrientation(d.normal, d.rotation));
      const n = new THREE.Vector3(d.normal.x, d.normal.y, d.normal.z);
      const anchor = new THREE.Vector3(d.position.x, d.position.y, d.position.z);
      const denom = ray.direction.dot(n);
      if (Math.abs(denom) < 1e-6) continue;
      const t = anchor.clone().sub(ray.origin).dot(n) / denom;
      if (t < 0) continue;
      const p = ray.origin.clone().addScaledVector(ray.direction, t);
      const local = p.sub(anchor).applyQuaternion(q.clone().invert());
      if (Math.abs(local.x) > d.size.width / 2 || Math.abs(local.y) > d.size.height / 2) continue;
      if (!best || t < best.t) best = { dec: d, t };
    }
    if (!best) return null;
    // Anything genuinely in FRONT of the decal plane blocks the pick (the decal's own
    // surface sits at ~the same distance, so allow a small epsilon).
    const occluder = this._raycaster
      .intersectObjects(this._scene.children, true)
      .find(h => {
        const u = h.object.userData as { editorType?: string; selectable?: boolean; ghostPick?: boolean };
        return h.object.visible && !!u.selectable && !u.ghostPick && !!u.editorType;
      });
    if (occluder && occluder.distance < best.t - 0.05) return null;
    return best.dec;
  }

  private _selectSurfaceDecal(dec: DecalDef): void {
    this._selectedSurfaceId = dec.id;
    this._positionOutline(dec);
    this._bus.emit("object:selected", {
      id:       dec.id,
      type:     "decal",
      zoneId:   this._activeZoneId,
      position: dec.position,
      rotation: { x: 0, y: 0, z: 0 },
      scale:    { x: 1, y: 1, z: 1 },
      data:     dec,
    });
  }

  private _positionOutline(dec: DecalDef): void {
    if (!this._outline) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.5, -0.5, 0), new THREE.Vector3(0.5, -0.5, 0),
        new THREE.Vector3(0.5, 0.5, 0),   new THREE.Vector3(-0.5, 0.5, 0),
      ]);
      const mat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.9 });
      this._outline = new THREE.LineLoop(geo, mat);
      this._outline.userData = { editorOnly: true, selectable: false };
      this._scene.add(this._outline);
    }
    const n = new THREE.Vector3(dec.normal.x, dec.normal.y, dec.normal.z);
    this._outline.position.set(dec.position.x, dec.position.y, dec.position.z).addScaledVector(n, 0.02);
    this._outline.quaternion.setFromEuler(decalOrientation(dec.normal, dec.rotation));
    this._outline.scale.set(dec.size.width, dec.size.height, 1);
    this._outline.visible = true;
  }

  private _clearSurfaceSelection(): void {
    this._selectedSurfaceId = null;
    if (this._outline) this._outline.visible = false;
  }

  /** Raycast buildable static geometry under the cursor; returns hit point + world normal. */
  private _pickSurface(screenPos: ScreenPos): { point: THREE.Vector3; normal: THREE.Vector3 } | null {
    this._setRayFrom(screenPos);
    const hit = this._raycaster
      .intersectObjects(this._scene.children, true)
      .find(h => {
        const u = h.object.userData as { editorType?: string; selectable?: boolean; ghostPick?: boolean };
        return h.object.visible && !!u.selectable && !u.ghostPick && !!u.editorType && TARGET_TYPES.has(u.editorType) && !!h.face;
      });
    if (!hit || !hit.face) return null;
    const normal = hit.face.normal.clone()
      .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
      .normalize();
    return { point: hit.point.clone(), normal };
  }

  private _ensureGhost(): THREE.Mesh {
    if (this._ghost) return this._ghost;
    const mat = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    const ghost = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    ghost.renderOrder = 50;
    ghost.visible = false;
    ghost.userData = { editorOnly: true, selectable: false };
    this._scene.add(ghost);
    this._ghost = ghost;
    return ghost;
  }

  private async _applyGhostTexture(textureId: string): Promise<void> {
    const def = assetManager.getDecalDef(textureId);
    if (!def) return;
    const tex = await assetManager.loadTexture(def.path);
    if (this._textureId !== textureId) return;   // picker moved on while loading
    const ghost = this._ensureGhost();
    const mat = ghost.material as THREE.MeshBasicMaterial;
    mat.map = tex;
    mat.needsUpdate = true;
  }

  private _refreshGhost(): void {
    const ghost = this._ensureGhost();
    if (!this._hover || !this._textureId) { this._hideGhost(); return; }
    const { point, normal } = this._hover;
    ghost.position.copy(point).addScaledVector(normal, 0.01);
    ghost.quaternion.setFromEuler(decalOrientation({ x: normal.x, y: normal.y, z: normal.z }, this._roll));
    ghost.scale.set(this._size.width, this._size.height, 1);
    ghost.visible = true;
    this._setZoomLock(true);
  }

  private _hideGhost(): void {
    if (this._ghost) this._ghost.visible = false;
    this._hover = null;
    this._setZoomLock(false);
  }

  private _setZoomLock(locked: boolean): void {
    if (this._zoomLocked === locked) return;
    this._zoomLocked = locked;
    this._bus.emit("camera:zoom-lock", { source: ZOOM_LOCK_SOURCE, locked });
  }

  private _commit(): void {
    const { point, normal } = this._hover!;
    const decal: DecalDef = {
      id:        `dec_${crypto.randomUUID().slice(0, 8)}`,
      label:     assetManager.getDecalDef(this._textureId!)?.label ?? "Decal",
      kind:      this._kind,
      textureId: this._textureId!,
      position:  { x: point.x, y: point.y, z: point.z },
      normal:    { x: normal.x, y: normal.y, z: normal.z },
      rotation:  this._roll,
      size:      { ...this._size },
      opacity:   this._opacity,
    };
    this._world.transaction("place decal", () => {
      this._world.addDecal(this._activeZoneId, decal);
    });
    this._bus.emit("decal:placed", { zoneId: this._activeZoneId, id: decal.id });
    // Stay armed — repeat stamping is the expected workflow.
  }

  dispose(): void {
    this._unsubs.forEach(u => u());
    this._setZoomLock(false);
    if (this._ghost) {
      this._scene.remove(this._ghost);
      this._ghost.geometry.dispose();
      (this._ghost.material as THREE.Material).dispose();
      this._ghost = null;
    }
    if (this._outline) {
      this._scene.remove(this._outline);
      this._outline.geometry.dispose();
      (this._outline.material as THREE.Material).dispose();
      this._outline = null;
    }
  }
}
