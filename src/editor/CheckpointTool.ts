import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { CheckpointDef, ToolId } from "@/types";

// Checkpoint marker palette — a cool teal to read as distinct from the amber initial spawn.
const RING_COLOR = 0x33ddbb;
const CONE_COLOR = 0x22bbff;

/**
 * Places and renders per-zone checkpoint markers — inert position+facing markers that a
 * script turns into a respawn (via store_position). Placement is active only under the
 * Spawn tool while the "checkpoint" sub-mode is selected (SpawnPointTool handles the
 * "initial" sub-mode). Every checkpoint in the active zone is rendered as a spawn-style
 * marker tinted distinctly from the amber initial spawn; markers are selectable so the
 * standard SelectionManager → GizmoManager → PropertiesPanel path can move/rotate/edit them.
 */
export class CheckpointTool {
  private _active   = false;                 // Spawn tool is active
  private _mode: "initial" | "checkpoint" = "initial";
  private _activeZoneId = "demo";
  private _markers = new Map<string, THREE.Group>();  // checkpoint id → marker group
  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _scene: THREE.Scene,
    private readonly _world: WorldState,
    private readonly _bus:   EventBus,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("tool:select", ({ tool }) => { this._active = (tool as ToolId) === "spawnpoint"; }),
      this._bus.on("spawn:mode",  ({ mode }) => { this._mode = mode; }),
      this._bus.on("zone:activated", ({ zoneId }) => { this._activeZoneId = zoneId; this._rebuildAll(); }),
      this._bus.on("world:loaded", () => this._rebuildAll()),
      this._bus.on("scene:loaded", () => this._rebuildAll()),
      this._bus.on("zone:loaded",  () => this._rebuildAll()),

      this._bus.on("input:click", ({ worldPos, surfacePos, button }) => {
        if (!this._active || this._mode !== "checkpoint" || button !== 0) return;
        const p = surfacePos ?? worldPos;
        const cp: CheckpointDef = {
          id: `cp_${crypto.randomUUID().slice(0, 8)}`,
          label: "Checkpoint",
          position: { x: p.x, y: p.y, z: p.z },
          facingDeg: 0,
        };
        this._world.transaction("place checkpoint", () => this._world.addCheckpoint(this._activeZoneId, cp));
        // One checkpoint per placement — signal App to break out of placing mode
        // (switch to Select + auto-select) so the next click doesn't drop another.
        this._bus.emit("checkpoint:placed", { zoneId: this._activeZoneId, id: cp.id });
      }),

      this._bus.on("checkpoint:added",   ({ zoneId, checkpoint }) => { if (zoneId === this._activeZoneId) this._buildMarker(checkpoint); }),
      this._bus.on("checkpoint:updated", ({ zoneId, id })         => { if (zoneId === this._activeZoneId) this._rebuildOne(id); }),
      this._bus.on("checkpoint:removed", ({ zoneId, id })         => { if (zoneId === this._activeZoneId) this._removeMarker(id); }),

      // Hide markers in play mode (they're editor helpers), restore on exit.
      this._bus.on("preview:start", () => { for (const m of this._markers.values()) m.visible = false; }),
      this._bus.on("preview:stop",  () => { for (const m of this._markers.values()) m.visible = true; }),
    );
  }

  private _rebuildAll(): void {
    for (const id of [...this._markers.keys()]) this._removeMarker(id);
    const zone = this._world.zones.get(this._activeZoneId);
    for (const cp of zone?.checkpoints ?? []) this._buildMarker(cp);
  }

  private _rebuildOne(id: string): void {
    const cp = this._world.zones.get(this._activeZoneId)?.checkpoints?.find(c => c.id === id);
    if (cp) this._buildMarker(cp);   // _buildMarker removes any existing marker for this id first
  }

  private _buildMarker(cp: CheckpointDef): void {
    this._removeMarker(cp.id);

    // Parent group at the foot; rotation.y is the facing yaw (0° = -Z, matching the spawn marker).
    const group = new THREE.Group();
    group.position.set(cp.position.x, cp.position.y, cp.position.z);
    group.rotation.y = cp.facingDeg * Math.PI / 180;

    const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 1.8, RING_COLOR, 0.55, 0.28);
    group.add(arrow);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.38, 32),
      new THREE.MeshBasicMaterial({ color: RING_COLOR, side: THREE.DoubleSide, opacity: 0.6, transparent: true }),
    );
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.5, 16),
      new THREE.MeshBasicMaterial({ color: CONE_COLOR }),
    );
    cone.rotation.x = -Math.PI / 2;
    cone.position.set(0, 0.9, -0.45);
    group.add(cone);

    // Tag for selection; children carry _parentId so SelectionManager resolves to the group.
    group.userData = { editorOnly: true, editorId: cp.id, editorType: "checkpoint", selectable: true, zoneId: this._activeZoneId };
    group.traverse(child => {
      if (child === group) return;
      child.userData.editorOnly = true;
      child.userData.editorId   = cp.id;
      child.userData.editorType = "checkpoint";
      child.userData.selectable = true;
      child.userData.zoneId     = this._activeZoneId;
      child.userData._parentId  = cp.id;
    });

    this._scene.add(group);
    this._markers.set(cp.id, group);
  }

  private _removeMarker(id: string): void {
    const m = this._markers.get(id);
    if (!m) return;
    this._scene.remove(m);
    this._markers.delete(id);
  }

  dispose(): void {
    this._unsubs.forEach(u => u());
    this._unsubs.length = 0;
    for (const id of [...this._markers.keys()]) this._removeMarker(id);
  }
}
