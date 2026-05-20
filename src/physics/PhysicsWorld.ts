import RAPIER from "@dimforge/rapier3d-compat";

export class PhysicsWorld {
  private _world!: RAPIER.World;
  private _initialized  = false;
  private _initializing = false;
  public  debugDraw     = false;

  async init(): Promise<void> {
    // If already initialized or init is in-flight (Strict Mode double-call), skip.
    // The in-flight init will complete and leave _initialized = true for the active RAF.
    if (this._initialized || this._initializing) return;
    this._initializing = true;
    // Pass empty object to satisfy rapier 0.19 new init() signature (no-arg form is deprecated)
    await (RAPIER.init as (opts?: object) => Promise<void>)({});
    this._world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this._initialized  = true;
    this._initializing = false;
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
    desc.setSensor(true);
    const body = this._world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    return this._world.createCollider(desc, body);
  }

  removeCollider(collider: RAPIER.Collider): void { this._world.removeCollider(collider, true); }
  removeRigidBody(body: RAPIER.RigidBody):   void { this._world.removeRigidBody(body); }

  dispose(): void {
    if (this._initialized) {
      this._world.free();
      this._initialized  = false;
      // Leave _initializing alone — if a concurrent init() is in flight, let it finish
      // (it will find _initialized = false and re-create the world for the next mount).
    }
  }
}

export const physicsWorld = new PhysicsWorld();
