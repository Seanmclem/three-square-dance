import RAPIER from "@dimforge/rapier3d-compat";

export class PhysicsWorld {
  private _world!:       RAPIER.World;
  private _initialized = false;
  private _initPromise: Promise<void> | null = null;
  public  debugDraw    = false;

  async init(): Promise<void> {
    if (this._initialized) return;
    // Return the in-flight Promise so concurrent callers (React StrictMode double-mount)
    // wait for the real WASM load rather than continuing with a null _world.
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      // Pass empty object to satisfy rapier 0.19 new init() signature (no-arg form is deprecated)
      await (RAPIER.init as (opts?: object) => Promise<void>)({});
      this._world       = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      this._initialized = true;
    })();
    return this._initPromise;
  }

  get world(): RAPIER.World     { return this._world; }
  get initialized(): boolean    { return this._initialized; }

  step(dt: number): void {
    if (!this._initialized) return;
    this._world.timestep = Math.min(dt, 0.05);
    this._world.step();
  }

  createStaticCollider(desc: RAPIER.ColliderDesc): RAPIER.Collider {
    const body = this._world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    return this._world.createCollider(desc, body);
  }

  createSensorCollider(desc: RAPIER.ColliderDesc): RAPIER.Collider {
    desc.setSensor(true)
      .setActiveCollisionTypes(
        RAPIER.ActiveCollisionTypes.DEFAULT | RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED,
      );
    const body = this._world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    return this._world.createCollider(desc, body);
  }

  /**
   * One kinematic body per mover entity, carrying the entity's full rest pose;
   * its colliders attach body-relative via createColliderOn so MoverSystem can
   * drive the body exactly like the mesh.
   */
  createKinematicBody(
    pos: { x: number; y: number; z: number },
    rot?: { x: number; y: number; z: number; w: number },
  ): RAPIER.RigidBody {
    const desc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z);
    if (rot) desc.setRotation(rot);
    return this._world.createRigidBody(desc);
  }

  /**
   * Attach a collider to an existing body (desc translation/rotation are body-relative).
   * Only movers use this path, so mover colliders also enable KINEMATIC_KINEMATIC
   * contacts here — the kinematic player capsule needs real contact manifolds with
   * moving geometry for push-out (v4.25.1). Pairs stay broad-phase gated: no narrow-
   * phase work happens until the AABBs actually touch.
   */
  createColliderOn(desc: RAPIER.ColliderDesc, body: RAPIER.RigidBody): RAPIER.Collider {
    desc.setActiveCollisionTypes(
      RAPIER.ActiveCollisionTypes.DEFAULT | RAPIER.ActiveCollisionTypes.KINEMATIC_KINEMATIC,
    );
    return this._world.createCollider(desc, body);
  }

  removeCollider(collider: RAPIER.Collider): void {
    const parent = collider.parent();
    this._world.removeCollider(collider, true);
    // createStaticCollider/createSensorCollider allocate a dedicated fixed
    // body per collider — remove it once empty, or every zone unload leaks
    // one body per collider (compounds per runtime scene transition).
    if (parent && parent.numColliders() === 0) this._world.removeRigidBody(parent);
  }
  removeRigidBody(body: RAPIER.RigidBody): void {
    // Idempotent: the body may already be gone via removeCollider's empty-
    // parent cleanup (e.g. CharacterBody.dispose removes collider then body).
    if (body.isValid()) this._world.removeRigidBody(body);
  }

  dispose(): void {
    if (this._initialized) {
      this._world.free();
      this._initialized = false;
      this._initPromise = null;  // allow re-init after a real dispose
    }
    // If init is still in-flight (_initPromise set but _initialized still false),
    // leave _initPromise alone so the next mount's init() awaits the same Promise.
  }
}

export const physicsWorld = new PhysicsWorld();
