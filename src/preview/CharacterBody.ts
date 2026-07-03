import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { physicsWorld } from "@/physics/PhysicsWorld";

export class CharacterBody {
  readonly capsuleRadius:     number;
  readonly capsuleHalfHeight: number;

  private _body!:     RAPIER.RigidBody;
  private _collider!: RAPIER.Collider;
  private _kcc!:      RAPIER.KinematicCharacterController;

  constructor(private readonly _scale = 1) {
    this.capsuleRadius     = 0.3 * _scale;
    this.capsuleHalfHeight = 0.6 * _scale;
  }

  init(spawnPos: THREE.Vector3): void {
    const s = this._scale;
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z);
    this._body     = physicsWorld.world.createRigidBody(bodyDesc);
    this._collider = physicsWorld.world.createCollider(
      RAPIER.ColliderDesc.capsule(this.capsuleHalfHeight, this.capsuleRadius),
      this._body,
    );
    this._kcc = physicsWorld.world.createCharacterController(0.01);
    this._kcc.enableAutostep(0.5 * s, 0.2 * s, true);
    this._kcc.enableSnapToGround(0.3 * s);
    this._kcc.setSlideEnabled(true);
    this._kcc.setMaxSlopeClimbAngle(45 * Math.PI / 180);
  }

  move(desired: THREE.Vector3): void {
    this._kcc.computeColliderMovement(this._collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const mv  = this._kcc.computedMovement();
    const pos = this._body.translation();
    this._body.setNextKinematicTranslation({
      x: pos.x + mv.x,
      y: pos.y + mv.y,
      z: pos.z + mv.z,
    });
  }

  /** Hard-snap the capsule to a world position (script teleport / respawn). */
  teleport(pos: THREE.Vector3): void {
    this._body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
  }

  get position(): THREE.Vector3 {
    const t = this._body.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  get collider(): RAPIER.Collider { return this._collider; }
  get isGrounded(): boolean      { return this._kcc.computedGrounded(); }

  dispose(): void {
    physicsWorld.world.removeCharacterController(this._kcc);
    physicsWorld.removeCollider(this._collider);
    physicsWorld.removeRigidBody(this._body);
  }
}
