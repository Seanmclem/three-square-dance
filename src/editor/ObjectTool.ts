import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { HistoryManager } from "@/editor/HistoryManager";
import type { AssetManager } from "@/core/AssetManager";
import type { IEditorModule, Vec3, WorldObject } from "@/types";

type ObjectToolState = "IDLE" | "PLACING";

const GRID = 0.5;

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function makeGhostMesh(): THREE.Mesh {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x4488ff, transparent: true, opacity: 0.5,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}

export class ObjectTool implements IEditorModule {
  private _state: ObjectToolState = "IDLE";
  private _active    = false;
  private _assetId:  string | null = null;
  private _ghost:    THREE.Object3D | null = null;
  private _ghostBox: THREE.Mesh | null = null;
  private _activeZoneId = "demo";
  private _activeLevel  = 0;
  private _lastWorldPos: Vec3 | null = null;

  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _scene:        THREE.Scene,
    private readonly _world:        WorldState,
    private readonly _bus:          EventBus,
    private readonly _history:      HistoryManager,
    private readonly _assetManager: AssetManager,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("tool:select", ({ tool }) => {
        this._active = tool === "object";
        if (!this._active) this._reset();
      }),
      this._bus.on("floor:select", ({ level }) => { this._activeLevel = level; }),
      this._bus.on("asset:selected", ({ assetId }) => {
        if (!this._active) return;
        this._assetId = assetId;
        void this._beginPlacing(assetId);
      }),
      this._bus.on("input:mousemove", ({ worldPos }) => {
        this._lastWorldPos = worldPos;
        if (this._active && this._state === "PLACING") this._onMouseMove(worldPos);
      }),
      this._bus.on("input:click", ({ worldPos, button }) => {
        if (!this._active) return;
        if (button !== 0) { this._reset(); return; }
        if (this._state === "PLACING") this._commit(worldPos);
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

  private async _beginPlacing(assetId: string): Promise<void> {
    this._clearGhost();
    try {
      this._ghost = await this._assetManager.loadModel(assetId);
      this._ghost.traverse(child => {
        if (child instanceof THREE.Mesh) {
          const mat = (child.material as THREE.Material).clone() as THREE.MeshStandardMaterial;
          mat.transparent = true;
          mat.opacity     = 0.5;
          mat.depthWrite  = false;
          child.material  = mat;
        }
      });
      this._ghost.visible = false;
      this._scene.add(this._ghost);
    } catch {
      // Fallback: simple box ghost
      this._ghostBox = makeGhostMesh();
      this._ghostBox.visible = false;
      this._scene.add(this._ghostBox);
    }
    this._state = "PLACING";
    document.body.style.cursor = "crosshair";
    if (this._lastWorldPos) this._onMouseMove(this._lastWorldPos);
  }

  private _onMouseMove(worldPos: Vec3): void {
    const x = snap(worldPos.x);
    const z = snap(worldPos.z);
    const y = this._getElevation();
    const target = this._ghost ?? this._ghostBox;
    if (target) {
      target.position.set(x, y, z);
      target.visible = true;
    }
  }

  private _getElevation(): number {
    const zone = this._world.zones.get(this._activeZoneId);
    const floors = zone?.floors.filter(f => f.level === this._activeLevel) ?? [];
    if (floors.length > 0) return Math.max(...floors.map(f => f.elevation));
    return this._activeLevel * 3.0;
  }

  private _commit(worldPos: Vec3): void {
    if (!this._assetId) { this._reset(); return; }

    const x = snap(worldPos.x);
    const z = snap(worldPos.z);
    const y = this._getElevation();

    const obj: WorldObject = {
      id:       `obj_${crypto.randomUUID().slice(0, 8)}`,
      assetId:  this._assetId,
      position: { x, y, z },
      rotation: { x: 0, y: 0, z: 0 },
      scale:    { x: 1, y: 1, z: 1 },
      floor:    this._activeLevel,
      zoneId:   this._activeZoneId,
      properties: {
        interactable:   false,
        npcSpawn:       false,
        lootTableId:    null,
        triggerEventId: null,
      },
    };

    this._history.record("add object", () => {
      this._world.addObject(this._activeZoneId, obj);
      this._bus.emit("tool:placed", { type: "object", id: obj.id, zoneId: this._activeZoneId });
    });

    // Keep ghost for continuous placement; user presses Escape to stop
  }

  private _clearGhost(): void {
    if (this._ghost) {
      this._scene.remove(this._ghost);
      this._ghost.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
      this._ghost = null;
    }
    if (this._ghostBox) {
      this._scene.remove(this._ghostBox);
      this._ghostBox.geometry.dispose();
      (this._ghostBox.material as THREE.Material).dispose();
      this._ghostBox = null;
    }
  }

  private _reset(): void {
    this._clearGhost();
    this._state   = "IDLE";
    this._assetId = null;
    document.body.style.cursor = "";
  }
}
