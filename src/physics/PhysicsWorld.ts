import RAPIER from "@dimforge/rapier3d-compat";

export class PhysicsWorld {
  private _world!: RAPIER.World;
  private _initialized = false;
  public debugDraw = false;

  async init(): Promise<void> {
    await RAPIER.init();
    this._world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this._initialized = true;
  }

  get world(): RAPIER.World { return this._world; }
  get initialized(): boolean { return this._initialized; }

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
  removeRigidBody(body: RAPIER.RigidBody): void { this._world.removeRigidBody(body); }

  dispose(): void {
    if (this._initialized) this._world.free();
  }
}

export const physicsWorld = new PhysicsWorld();
