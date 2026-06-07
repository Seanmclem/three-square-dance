import * as THREE from "three";
import type { PlayerSettings } from "@/types";
import { CharacterBody } from "./CharacterBody";

export class CharacterController {
  private readonly _body = new CharacterBody();
  private _yaw     = 0;
  private _pitch   = 0;
  private _velY    = 0;
  private readonly _keys = new Set<string>();

  readonly camera: THREE.PerspectiveCamera;

  private readonly _onMouseMove: (e: MouseEvent) => void;
  private readonly _onKeyDown:   (e: KeyboardEvent) => void;
  private readonly _onKeyUp:     (e: KeyboardEvent) => void;

  constructor(private readonly _settings: PlayerSettings) {
    this.camera = new THREE.PerspectiveCamera(
      _settings.fov, window.innerWidth / window.innerHeight, 0.05, 500,
    );

    this._onMouseMove = (e: MouseEvent) => {
      this._yaw   -= e.movementX * 0.002;
      this._pitch -= e.movementY * 0.002;
      this._pitch  = Math.max(-Math.PI * 80 / 180, Math.min(Math.PI * 80 / 180, this._pitch));
    };
    this._onKeyDown = (e: KeyboardEvent) => this._keys.add(e.code);
    this._onKeyUp   = (e: KeyboardEvent) => this._keys.delete(e.code);
  }

  init(spawnPos: THREE.Vector3, facingDeg: number): void {
    this._yaw = THREE.MathUtils.degToRad(facingDeg);
    this._body.init(spawnPos);
    document.addEventListener("mousemove", this._onMouseMove);
    document.addEventListener("keydown",   this._onKeyDown);
    document.addEventListener("keyup",     this._onKeyUp);
  }

  update(dt: number): void {
    const speed = this._settings.moveSpeed;
    const dir   = new THREE.Vector3();

    if (this._keys.has("KeyW") || this._keys.has("ArrowUp"))    dir.z -= 1;
    if (this._keys.has("KeyS") || this._keys.has("ArrowDown"))  dir.z += 1;
    if (this._keys.has("KeyA") || this._keys.has("ArrowLeft"))  dir.x -= 1;
    if (this._keys.has("KeyD") || this._keys.has("ArrowRight")) dir.x += 1;
    if (dir.lengthSq() > 0) dir.normalize().multiplyScalar(speed * dt);
    dir.applyEuler(new THREE.Euler(0, this._yaw, 0, "YXZ"));

    if (this._body.isGrounded) {
      this._velY = this._keys.has("Space")
        ? Math.sqrt(2 * 9.81 * this._settings.jumpHeight)
        : 0;
    } else {
      this._velY -= 20 * dt;
    }
    dir.y = this._velY * dt;

    this._body.move(dir);

    // Camera — eye level is top of capsule minus a small margin
    const pos = this._body.position;
    const eyeY = pos.y + this._body.capsuleHalfHeight + this._body.capsuleRadius - 0.1;
    this.camera.position.set(pos.x, eyeY, pos.z);
    this.camera.rotation.set(this._pitch, this._yaw, 0, "YXZ");
  }

  get body(): CharacterBody { return this._body; }

  dispose(): void {
    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("keydown",   this._onKeyDown);
    document.removeEventListener("keyup",     this._onKeyUp);
    this._body.dispose();
    this._keys.clear();
  }
}
