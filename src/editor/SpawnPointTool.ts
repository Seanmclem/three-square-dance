import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";

export class SpawnPointTool {
  private _marker:  THREE.Object3D | null = null;
  private _active   = false;
  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _scene: THREE.Scene,
    private readonly _world: WorldState,
    private readonly _bus:   EventBus,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("tool:select", ({ tool }) => {
        this._active = (tool === "spawnpoint");
      }),
      this._bus.on("input:click", ({ worldPos, surfacePos, button }) => {
        if (!this._active || button !== 0) return;
        // Prefer the real surface hit so the marker lands on top of a floor/platform
        // instead of falling through to the y=0 ground plane underneath it.
        const p = surfacePos ?? worldPos;
        this._placeMarker(p.x, p.y, p.z);
      }),
      this._bus.on("preview:start", () => {
        if (this._marker) this._marker.visible = false;
      }),
      this._bus.on("preview:stop", () => {
        if (this._marker) this._marker.visible = true;
      }),
      this._bus.on("world:loaded",   () => this._restoreFromWorld()),
      this._bus.on("scene:loaded",   () => this._restoreFromWorld()),
      this._bus.on("spawn:updated",  () => {
        // Rebuild the marker fresh from world state (authoritative) for both position AND
        // facing. Rebuilding (vs mutating in place) mirrors how ZoneManager rebuilds the
        // trigger-volume wireframe on commit, so the gizmo re-tracks a clean mesh each time
        // instead of a persistent marker that accumulates stale transform state across rotations.
        const s = this._world.world?.defaultSpawn;
        if (s) this._placeMarker(s.position.x, s.position.y, s.position.z, false, s.facingDeg ?? 0);
      }),
    );
  }

  private _restoreFromWorld(): void {
    const spawn = this._world.world?.defaultSpawn;
    if (spawn) this._placeMarker(spawn.position.x, spawn.position.y, spawn.position.z, false, spawn.facingDeg ?? 0);
    else this._removeMarker();
  }

  private _placeMarker(x: number, y: number, z: number, persist = true, facingDeg = 0): void {
    this._removeMarker();

    // Parent group at the spawn foot; rotation.y is the facing yaw (0° = looking toward -Z,
    // matching CharacterController). Children live in local space so they rotate together.
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = facingDeg * Math.PI / 180;

    // Vertical post (selection handle / "you spawn here" stick).
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 1.8, 0xffcc44, 0.55, 0.28);
    group.add(arrow);

    // Ground ring.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.38, 32),
      new THREE.MeshBasicMaterial({ color: 0xffcc44, side: THREE.DoubleSide, opacity: 0.6, transparent: true }),
    );
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    // Facing cone — midway up, pointing in the start-facing direction (local -Z).
    // Cone's default axis is +Y; rotX(-90°) aims it down -Z.
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.5, 16),
      new THREE.MeshBasicMaterial({ color: 0xff8844 }),
    );
    cone.rotation.x = -Math.PI / 2;
    cone.position.set(0, 0.9, -0.45);
    group.add(cone);

    // Tag the whole marker for selection; children carry _parentId so SelectionManager
    // resolves clicks to the group root (and the gizmo tracks the group, not each child).
    group.userData = { editorOnly: true, editorId: "__spawn__", editorType: "spawn", selectable: true, zoneId: "" };
    group.traverse(child => {
      if (child === group) return;
      child.userData.editorOnly  = true;
      child.userData.editorId    = "__spawn__";
      child.userData.editorType  = "spawn";
      child.userData.selectable  = true;
      child.userData.zoneId      = "";
      child.userData._parentId   = "__spawn__";
    });

    this._scene.add(group);
    this._marker = group;

    if (persist) {
      this._world.transaction("place spawn point", () => {
        this._world.setDefaultSpawn({ position: { x, y, z }, facingDeg });
      });
    }
  }

  private _removeMarker(): void {
    if (this._marker) {
      this._scene.remove(this._marker);
      this._marker = null;
    }
  }

  dispose(): void {
    this._unsubs.forEach(u => u());
    this._removeMarker();
  }
}
