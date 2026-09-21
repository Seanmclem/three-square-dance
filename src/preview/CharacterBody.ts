import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { physicsWorld } from "@/physics/PhysicsWorld";

// Deepest allowed shove per frame — a wall sweeping ~cm/frame needs far less; the cap
// only guards against explosive ejection from a deep overlap (e.g. after a teleport).
const MAX_PUSH_PER_FRAME = 0.3;

const AUTOSTEP_GROUND = 0.5;    // × character scale — stairs the character can WALK up

export class CharacterBody {
  readonly capsuleRadius:     number;
  readonly capsuleHalfHeight: number;

  private _body!:     RAPIER.RigidBody;
  private _collider!: RAPIER.Collider;
  private _kcc!:      RAPIER.KinematicCharacterController;
  private _airborne = false;   // which autostep limit is currently configured (see setAirborne)
  private readonly _downRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

  // ── Moving-geometry push-out (v4.25.1) — persistent callbacks + scratch state so
  // the per-frame contact scan allocates nothing. Contacts only exist for pairs whose
  // AABBs touch (broad-phase gated), so the scan is O(overlapping movers), usually 0.
  private _pushIsMover: ((bodyHandle: number) => boolean) | null = null;
  private readonly _pushOut = new THREE.Vector3();
  private readonly _onPushManifold = (manifold: RAPIER.TempContactManifold, flipped: boolean) => {
    let deepest = 0;
    for (let i = 0; i < manifold.numContacts(); i++) {
      const d = manifold.contactDist(i);
      if (d < deepest) deepest = d;
    }
    if (deepest >= 0) return;
    // normal() points from the manifold's first shape to its second; `flipped` means
    // our capsule is the SECOND shape. Push the player AWAY from the mover.
    const n = manifold.normal();
    const s = flipped ? -deepest : deepest;   // capsule-first: normal points capsule→mover → push along −normal
    this._pushOut.x += n.x * s;
    this._pushOut.y += n.y * s;
    this._pushOut.z += n.z * s;
  };
  private readonly _onPushPair = (other: RAPIER.Collider) => {
    const parent = other.parent();
    if (!parent || !this._pushIsMover!(parent.handle)) return;
    physicsWorld.world.contactPair(this._collider, other, this._onPushManifold);
  };

  /**
   * Depenetration vector from any mover collider currently overlapping the capsule
   * (post-step contact manifolds). Returns a reused scratch vector — consume it
   * before the next call. Zero-length when nothing overlaps.
   */
  moverPush(isMoverBody: (bodyHandle: number) => boolean): THREE.Vector3 {
    this._pushOut.set(0, 0, 0);
    this._pushIsMover = isMoverBody;
    physicsWorld.world.contactPairsWith(this._collider, this._onPushPair);
    this._pushIsMover = null;
    const len = this._pushOut.length();
    if (len > MAX_PUSH_PER_FRAME) this._pushOut.multiplyScalar(MAX_PUSH_PER_FRAME / len);
    return this._pushOut;
  }

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
      // KINEMATIC_KINEMATIC: generate contact manifolds vs kinematic mover bodies
      // (moving-geometry push-out, v4.25.1). Mover colliders set the same flag.
      RAPIER.ColliderDesc.capsule(this.capsuleHalfHeight, this.capsuleRadius)
        .setActiveCollisionTypes(
          RAPIER.ActiveCollisionTypes.DEFAULT | RAPIER.ActiveCollisionTypes.KINEMATIC_KINEMATIC,
        ),
      this._body,
    );
    this._kcc = physicsWorld.world.createCharacterController(0.01);
    this._kcc.enableAutostep(AUTOSTEP_GROUND * s, 0.2 * s, true);
    this._kcc.enableSnapToGround(0.3 * s);
    this._kcc.setSlideEnabled(true);
    this._kcc.setMaxSlopeClimbAngle(45 * Math.PI / 180);
  }

  /**
   * Autostep is a WALKING feature (climb stairs up to AUTOSTEP_GROUND), but Rapier applies it
   * to any horizontal push into an obstacle — including mid-jump, where it lifted the player up
   * to 0.45m onto a ledge the jump itself could not reach (measured: a 1.75m jump peaking at
   * 2.03m against a 2.0m step; reach was jump + 0.45 = 2.2m). Off the ground it is now OFF.
   * A small lip assist remains on its own: the capsule's round bottom rides over a lip it
   * clips, worth ≈ 0.14m (measured reach 1.92m from a 1.78m jump). Sweeping an airborne
   * autostep of 0.03–0.12m only moved that to 1.95–1.97m, so the simple rule won: stair-stepping
   * is for walking. Only re-configures the KCC when the state actually changes.
   */
  setAirborne(airborne: boolean): void {
    if (airborne === this._airborne) return;
    this._airborne = airborne;
    const s = this._scale;
    if (airborne) this._kcc.disableAutostep();
    else this._kcc.enableAutostep(AUTOSTEP_GROUND * s, 0.2 * s, true);
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

  /**
   * Rigid-body handle of whatever is directly under the capsule (single short
   * downward ray, sensors + self excluded) — how the carry logic identifies a
   * moving platform (Phase 31). Null when airborne or over a parentless collider.
   */
  /**
   * Is there a surface directly under the capsule's CENTRE, within standing reach? Stricter
   * than `isGrounded`: that flag also turns true for a frame when the capsule's round bottom
   * grazes a ledge lip mid-jump, and stays true while it hangs on a lip by its edge — in both
   * cases the floor under the centre is a metre or more away. Same short ray as
   * groundBodyHandle (sensors + self excluded); used to decide which autostep limit applies.
   */
  hasGroundBelow(): boolean {
    const t = this._body.translation();
    this._downRay.origin.x = t.x; this._downRay.origin.y = t.y; this._downRay.origin.z = t.z;
    // Reach = the tallest step autostep can climb, plus a margin. Autostep lifts the capsule
    // GRADUALLY over several frames; with a shorter ray (0.35) the floor dropped out of reach at
    // 0.32m of lift, autostep switched off mid-climb and the character slid back (walking up
    // 0.44m broke). A ledge worth blocking has its floor ≥ 1m below, far beyond this.
    const maxToi = this.capsuleHalfHeight + this.capsuleRadius + (AUTOSTEP_GROUND + 0.1) * this._scale;
    return physicsWorld.world.castRay(
      this._downRay, maxToi, true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this._collider,
    ) !== null;
  }

  groundBodyHandle(): number | null {
    const t = this._body.translation();
    this._downRay.origin.x = t.x; this._downRay.origin.y = t.y; this._downRay.origin.z = t.z;
    const maxToi = this.capsuleHalfHeight + this.capsuleRadius + 0.35 * this._scale;
    const hit = physicsWorld.world.castRay(
      this._downRay, maxToi, true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this._collider,
    );
    return hit ? (hit.collider.parent()?.handle ?? null) : null;
  }

  /** Hard-snap the capsule to a world position (script teleport / respawn). */
  teleport(pos: THREE.Vector3): void {
    this._body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
  }

  /**
   * Climb-mode positioning (Phase 34): drive the kinematic body directly,
   * bypassing the KCC — its snap-to-ground and slope logic fight a wall climb.
   * The ladder line is kept clear of geometry by construction.
   */
  setClimbTranslation(pos: THREE.Vector3): void {
    this._body.setNextKinematicTranslation({ x: pos.x, y: pos.y, z: pos.z });
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
