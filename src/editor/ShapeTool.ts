import * as THREE from "three";
import { ShapeBuilder } from "@/builders/ShapeBuilder";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { HistoryManager } from "@/editor/HistoryManager";
import type { IEditorModule, ToolId, Vec3, ShapeDef, ShapeKind } from "@/types";

type ShapeToolState = "IDLE" | "PLACING";

const GRID       = 0.5;
const MIN_SIZE   = 0.5;   // wedge/box footprint minimum
const MIN_RADIUS = 0.25;  // cylinder minimum

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

const KIND_BY_TOOL: Partial<Record<ToolId, ShapeKind>> = {
  "shape-cylinder": "cylinder",
  "shape-wedge":    "wedge",
  "shape-box":      "box",
};

/**
 * Places parametric shapes (Phase 22). One tool class serves all three toolbar
 * variants; the active ToolId picks the kind. Placement UX:
 *  - cylinder: click the CENTER, move to set the radius, click to commit.
 *  - wedge/box: two-click footprint rect (PlatformTool pattern); heights come
 *    from defaults and are tuned in the panel afterwards.
 * The ghost preview is the real ShapeBuilder local geometry (true silhouette),
 * regenerated on mousemove. The base elevation comes from the first click's
 * surface hit, so shapes sit on whatever was clicked.
 */
export class ShapeTool implements IEditorModule {
  private _state: ShapeToolState = "IDLE";
  private _active = false;
  private _kind: ShapeKind = "cylinder";
  private _anchor: { x: number; z: number } | null = null;   // center (cylinder) or corner 1 (wedge/box)
  private _elevation = 0;
  private _preview: THREE.Mesh | null = null;
  private _previewMat: THREE.MeshBasicMaterial | null = null;
  private _activeZoneId = "demo";
  private _activeLevel  = 0;
  private _material     = "concrete_01";

  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _scene:   THREE.Scene,
    private readonly _world:   WorldState,
    private readonly _bus:     EventBus,
    private readonly _history: HistoryManager,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("tool:select", ({ tool }) => {
        const kind = KIND_BY_TOOL[tool];
        this._active = kind !== undefined;
        if (kind) this._kind = kind;
        if (!this._active) this._reset();
      }),
      this._bus.on("floor:select", ({ level }) => { this._activeLevel = level; }),
      this._bus.on("input:click", ({ worldPos, surfacePos, button }) => {
        if (!this._active) return;
        if (button !== 0) { this._reset(); return; }
        this._onLeftClick(worldPos, surfacePos);
      }),
      this._bus.on("input:mousemove", ({ worldPos }) => {
        if (this._active) this._onMouseMove(worldPos);
      }),
      this._bus.on("input:keydown", ({ code }) => {
        if (this._active && code === "Escape") this._reset();
      }),
    );
  }

  update(_dt: number): void {}

  dispose(): void {
    this._reset();
    this._unsubs.forEach(u => u());
  }

  /** Fallback base when the click hit nothing solid: the active level's floor top. */
  private _levelBase(): number {
    const zone = this._world.zones.get(this._activeZoneId);
    const floorsAtLevel = zone?.floors.filter(f => f.level === this._activeLevel) ?? [];
    return floorsAtLevel.length > 0
      ? Math.max(...floorsAtLevel.map(f => f.elevation))
      : Math.max(0, this._activeLevel * 3.0);
  }

  private _onLeftClick(worldPos: Vec3, surfacePos: Vec3 | null): void {
    const sx = snap(worldPos.x);
    const sz = snap(worldPos.z);

    if (this._state === "IDLE") {
      this._anchor    = { x: sx, z: sz };
      this._elevation = surfacePos?.y ?? this._levelBase();
      this._state     = "PLACING";
      this._makePreview();
      document.body.style.cursor = "crosshair";
    } else {
      this._commit(sx, sz);
    }
  }

  private _onMouseMove(worldPos: Vec3): void {
    if (this._state !== "PLACING" || !this._anchor) return;
    this._updatePreview(snap(worldPos.x), snap(worldPos.z));
  }

  /** The def the current drag would commit (also drives the ghost). */
  private _dragDef(ex: number, ez: number): ShapeDef {
    const a = this._anchor!;
    const base = {
      id: "__shape_preview__", kind: this._kind,
      rotation: { x: 0, y: 0, z: 0 }, material: this._material, floorLevel: this._activeLevel,
    };
    if (this._kind === "cylinder") {
      const r = Math.max(MIN_RADIUS, snap(Math.hypot(ex - a.x, ez - a.z)) || MIN_RADIUS);
      return {
        ...base,
        position: { x: a.x, y: this._elevation, z: a.z },
        radiusTop: r, radiusBottom: r, height: 2, radialSegments: 16,
      };
    }
    const w  = Math.abs(ex - a.x) || MIN_SIZE;
    const d  = Math.abs(ez - a.z) || MIN_SIZE;
    const cx = (a.x + ex) / 2, cz = (a.z + ez) / 2;
    const dims = this._kind === "wedge"
      ? { width: w, depth: d, heightLow: 0, heightHigh: 1.5 }
      : { width: w, depth: d, height: 2, taperX: 1, taperZ: 1, shearX: 0, shearZ: 0 };
    return { ...base, position: { x: cx, y: this._elevation, z: cz }, ...dims };
  }

  private _makePreview(): void {
    this._previewMat = new THREE.MeshBasicMaterial({
      color: 0x44aaff, transparent: true, opacity: 0.35,
      side: THREE.DoubleSide, depthWrite: false, depthTest: false,
    });
    this._preview = new THREE.Mesh(new THREE.BufferGeometry(), this._previewMat);
    this._preview.renderOrder = 1;
    this._preview.visible = false;
    this._scene.add(this._preview);
  }

  private _updatePreview(ex: number, ez: number): void {
    if (!this._preview || !this._anchor) return;
    const def = this._dragDef(ex, ez);
    const geo = ShapeBuilder.buildLocalGeometry(def, 1);
    this._preview.geometry.dispose();
    this._preview.geometry = geo;
    this._preview.position.set(def.position.x, def.position.y, def.position.z);
    this._preview.visible = true;
  }

  private _commit(ex: number, ez: number): void {
    if (!this._anchor) { this._reset(); return; }

    if (this._kind === "cylinder") {
      const r = snap(Math.hypot(ex - this._anchor.x, ez - this._anchor.z));
      if (r < MIN_RADIUS) { this._reset(); return; }
    } else {
      const w = Math.abs(ex - this._anchor.x);
      const d = Math.abs(ez - this._anchor.z);
      if (w < MIN_SIZE || d < MIN_SIZE) { this._reset(); return; }
    }

    const shape: ShapeDef = { ...this._dragDef(ex, ez), id: `shape_${crypto.randomUUID().slice(0, 8)}` };

    this._world.transaction("add shape", () => {
      this._world.addShape(this._activeZoneId, shape);
      this._bus.emit("tool:placed", { type: "shape", id: shape.id, zoneId: this._activeZoneId });
    });
    this._reset();
  }

  private _reset(): void {
    if (this._preview) {
      this._scene.remove(this._preview);
      this._preview.geometry.dispose();
      this._previewMat?.dispose();
      this._preview = null;
      this._previewMat = null;
    }
    this._anchor = null;
    this._state  = "IDLE";
    document.body.style.cursor = "";
  }
}
