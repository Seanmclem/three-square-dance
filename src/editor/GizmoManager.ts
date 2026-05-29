import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { IEditorModule, SelectedObjectPayload, PlatformDef } from "@/types";

export class GizmoManager implements IEditorModule {
  private readonly _scene:      THREE.Scene;
  private readonly _camera:     THREE.PerspectiveCamera;
  private readonly _dom:        HTMLCanvasElement;
  private readonly _worldState: WorldState;
  private readonly _bus:        EventBus;

  private _controls: TransformControls | null = null;
  private readonly _pivot = new THREE.Group();

  // Currently selected platform
  private _selId:     string | null = null;
  private _selZoneId: string | null = null;

  // Per-mesh offsets used for live translate preview
  private _trackedMeshes: Array<{ obj: THREE.Object3D; offset: THREE.Vector3 }> = [];
  private _pivotStart = new THREE.Vector3();

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
    this._controls.setSize(0.9);
    this._controls.setSpace("world");

    // Suppress camera movement while dragging
    this._controls.addEventListener("dragging-changed", e => {
      const isDragging = (e as unknown as { value: boolean }).value;
      this._bus.emit("gizmo:dragging", { isDragging });
      if (!isDragging) this._onDragEnd();
    });

    // Live visual update during translate drag
    this._controls.addEventListener("objectChange", () => this._onObjectChange());

    this._scene.add(this._controls);

    this._unsubs.push(
      this._bus.on("object:selected",  payload          => this._onSelect(payload)),
      this._bus.on("object:deselected", ()              => this._detach()),
      this._bus.on("platform:rebuilt", ({ zoneId, platformId }) => {
        if (platformId === this._selId && zoneId === this._selZoneId)
          this._reattachMeshes();
      }),
      this._bus.on("input:keydown", ({ code }) => {
        if (!this._controls || this._selId === null) return;
        if (code === "KeyT") this._controls.setMode("translate");
        if (code === "KeyR") this._controls.setMode("rotate");
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
    if (payload.type !== "platform") { this._detach(); return; }

    this._selId     = payload.id;
    this._selZoneId = payload.zoneId;

    // Sync pivot to stored platform rotation so rotate mode starts from current angle
    const plat = this._getPlatform();
    const rotY = plat?.rotation?.y ? THREE.MathUtils.degToRad(plat.rotation.y) : 0;
    this._pivot.position.set(payload.position.x, payload.position.y, payload.position.z);
    this._pivot.rotation.set(0, rotY, 0);
    this._pivotStart.copy(this._pivot.position);

    this._updateMeshOffsets();
    this._controls?.attach(this._pivot);
  }

  private _detach(): void {
    this._controls?.detach();
    this._selId      = null;
    this._selZoneId  = null;
    this._trackedMeshes = [];
  }

  // ─── Mesh tracking ────────────────────────────────────────────────────────

  private _updateMeshOffsets(): void {
    this._trackedMeshes = [];
    const pivotPos = this._pivot.position;
    this._scene.traverse(obj => {
      if (obj.userData["editorId"] !== this._selId) return;
      if (obj.userData["zoneId"]   !== this._selZoneId) return;
      // Skip CSG-cut cap meshes — their geometry is in world space, can't translate simply
      if ((obj.userData as { _hasCsgCuts?: boolean })._hasCsgCuts) return;
      this._trackedMeshes.push({
        obj,
        offset: obj.position.clone().sub(pivotPos),
      });
    });
  }

  private _reattachMeshes(): void {
    const plat = this._getPlatform();
    if (plat) {
      const rotY = plat.rotation?.y ? THREE.MathUtils.degToRad(plat.rotation.y) : 0;
      this._pivot.position.set(plat.position.x, plat.position.y + plat.thickness / 2, plat.position.z);
      this._pivot.rotation.set(0, rotY, 0);
      this._pivotStart.copy(this._pivot.position);
    }
    this._updateMeshOffsets();
    this._controls?.attach(this._pivot);
  }

  // ─── Drag handlers ────────────────────────────────────────────────────────

  private _onObjectChange(): void {
    if (!this._controls?.dragging) return;
    if (this._controls.getMode() !== "translate") return;
    const pivotPos = this._pivot.position;
    for (const { obj, offset } of this._trackedMeshes) {
      obj.position.copy(pivotPos).add(offset);
    }
  }

  private _onDragEnd(): void {
    if (!this._selId || !this._selZoneId) return;
    const plat = this._getPlatform();
    if (!plat) return;

    const mode = this._controls?.getMode() ?? "translate";

    if (mode === "translate") {
      const delta = this._pivot.position.clone().sub(this._pivotStart);
      if (delta.lengthSq() > 1e-6) {
        this._worldState.updatePlatform(this._selZoneId, this._selId, {
          position: {
            x: plat.position.x + delta.x,
            y: plat.position.y + delta.y,
            z: plat.position.z + delta.z,
          },
        });
      }
      this._pivotStart.copy(this._pivot.position);
    } else if (mode === "rotate") {
      const rotY = THREE.MathUtils.radToDeg(this._pivot.rotation.y);
      if (Math.abs(rotY - (plat.rotation?.y ?? 0)) > 0.01) {
        this._worldState.updatePlatform(this._selZoneId, this._selId, {
          rotation: { x: 0, y: rotY, z: 0 },
        });
      }
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private _getPlatform(): PlatformDef | undefined {
    const zone = this._worldState.zones.get(this._selZoneId ?? "");
    return zone?.platforms.find(p => p.id === this._selId);
  }
}
