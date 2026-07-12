import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { enablePaddedSkinnedCulling } from "./skinnedCulling";
import type { PlayerSettings, LocomotionState, LadderDef } from "@/types";
import type { EventBus } from "@/core/EventBus";
import type { ControlSchemeManager } from "@/input/ControlSchemeManager";
import { CharacterBody } from "./CharacterBody";
import { resolveLadderParams } from "@/builders/LadderBuilder";
import type { MoverSystem } from "@/world/MoverSystem";
import { physicsWorld } from "@/physics/PhysicsWorld";
import { assetManager } from "@/core/AssetManager";
import { gameState } from "@/scripting/GameState";

const MIN_DIST = 0.6;   // closest the spring-arm camera may sit to the pivot
const MAX_PITCH = Math.PI * 80 / 180;   // look-up/down clamp
const CAM_SKIN = 0.2;   // gap kept in front of an occluding wall
// Vertical camera smoothing — the capsule climbs/descends stairs in per-step pulses
// (bursts of ~0.1m/frame between flat frames); a rigidly-locked camera turns that into
// visible judder even at a perfect frame rate. Smooth the camera's Y toward the body:
// heavily while grounded (step snaps are artifacts), lightly while airborne (jumps and
// falls are real motion the camera must track), with a hard lag clamp as a safety net.
const CAM_Y_RATE_GROUND = 14;  // 1/s exp rate on the ground (~70ms time constant)
const CAM_Y_RATE_AIR    = 40;  // 1/s exp rate airborne (~25ms — near-rigid, still eats micro-falls)
const CAM_Y_MAX_LAG     = 0.4; // m — camera never trails the true height by more than this
// Spring-arm distance smoothing — applying the occlusion raycast distance instantly makes
// the camera teleport meters in one frame when the ray grazes a platform edge (measured
// 4.0m→0.6m→4.0m within frames on a platform jump). Pull in fast (so walls still can't
// clip), ease back out slowly.
const ARM_RATE_IN  = 30;  // 1/s when the target distance is closer than current
const ARM_RATE_OUT = 6;   // 1/s when releasing back out
const ZOOM_MIN = 1.5;   // scroll-zoom distance clamp
const ZOOM_MAX = 12;
const INTERACT_RANGE = 3;        // how far (m) an interactable is reachable
const INTERACT_MIN_DOT = 0.5;    // must be within ~120° front cone of where the player faces
const INTERACT_REBUILD_SEC = 0.25; // how often to re-scan the scene for interactables (cache TTL)
// Avatar GLBs vary in authored forward axis; this model faces +Z, our math assumes -Z.
const MODEL_FORWARD_OFFSET = Math.PI;
// The avatar is never an interact target — skip it from any raycast.
const NO_RAYCAST: THREE.Object3D["raycast"] = () => {};

// ── Ladder climbing (Phase 34) ────────────────────────────────────────────────
const CLIMB_MOUNT_DOT   = 0.5;   // must move at least this much toward the ladder to mount
const CLIMB_COOLDOWN    = 0.4;   // s after a jump-release before re-grab is allowed
const CLIMB_SNAP_RATE   = 12;    // 1/s exp lerp of X/Z onto the ladder line while climbing
const CLIMB_LINE_GAP    = 0.12;  // capsule surface ↔ ladder plane gap (line offset = gap + radius + slab/2)
const CLIMB_TOP_FRAC    = 0.5;   // top-zone mount requires feet above top − this (m)
// The top-lip sensor (def.promptRange onto the platform) is the PROMPT's range;
// walking-toward auto-mount arms only within def.autoGrabRange of the lip — otherwise
// any approach movement inside the sensor grabs you before the prompt is usable.
const CLIMB_ANIM_REF    = 1.2;   // climb clip plays at 1× at this speed (m/s) — default climbSpeed 2 → ~1.7×
// Ladders up to this width snap to the centerline (feels right on a normal ladder);
// wider ones (rock walls, vine walls) keep the mount-point lateral position and
// A/D shimmies sideways, clamped inside the span.
const CLIMB_FREE_X_WIDTH = 1.2;
const CLIMB_X_MARGIN     = 0.25; // lateral clamp inset from the ladder's edges

// ── Jump reliability (v4.28.14) ───────────────────────────────────────────────
const JUMP_BUFFER_SEC = 0.15;  // a press is remembered this long (fires on landing)
const COYOTE_SEC      = 0.12;  // recently-grounded still counts (ledge walk-offs, flag flicker)
const GROUND_STICK    = 0.5;   // m/s downward bias while grounded — keeps computedGrounded stable

/**
 * Character scale is per camera mode (Phase 34 follow-up): third-person uses
 * characterScale (avatar + capsule), FPS uses fpsCharacterScale (capsule/eye
 * height, default 1) — a small third-person avatar no longer shrinks the FPS
 * viewpoint. Mode is a per-world author setting, so collision is stable in play.
 */
export function effectiveCharacterScale(s: PlayerSettings): number {
  return s.cameraMode === "thirdperson" ? (s.characterScale ?? 1) : (s.fpsCharacterScale ?? 1);
}

// Reused scratch objects — the update() loop runs every frame, so it must not allocate
// (per-frame garbage triggers GC pauses = micro-stutters). All temps below are set fresh
// each use and never held across the yield back to the RAF loop.
const _tmpForward = new THREE.Vector3();
const _tmpEuler   = new THREE.Euler();
const _tmpEye     = new THREE.Vector3();
const _tmpWp      = new THREE.Vector3();
const _tmpDir     = new THREE.Vector3();
const _tmpPivot   = new THREE.Vector3();
const _tmpBack    = new THREE.Vector3();

export class CharacterController {
  private readonly _body: CharacterBody;   // built in the constructor (needs _settings scale)
  private _yaw     = 0;
  private _pitch   = 0;
  private _velY    = 0;
  // Edge-triggered jump: must release the jump input before it fires again (no auto-bounce on landing).
  private _jumpArmed = true;
  private _jumpBuffer = 0;   // s left on a buffered jump press
  private _coyote = 0;       // s since last grounded that still counts as grounded

  private readonly _interactSeen = new Set<string>();   // dedupe interactables when rebuilding the cache
  private readonly _ray = new RAPIER.Ray(new THREE.Vector3(), new THREE.Vector3()); // reused spring-arm ray
  // Interactables cache — the scene is scanned only a few times/sec, not every frame.
  private _interactCache: { id: string; label: string; obj: THREE.Object3D }[] = [];
  private _interactAge = INTERACT_REBUILD_SEC;          // force a rebuild on the first frame
  private _interactTargetId: string | null = null;

  private _modelRoot: THREE.Object3D | null = null;
  private _mixer:     THREE.AnimationMixer | null = null;
  private _modelAnimations: THREE.AnimationClip[] = [];
  private _currentClip = "";
  private _currentAction:  THREE.AnimationAction | null = null;
  private _currentClipObj: THREE.AnimationClip  | null = null;
  private _animPhase: "ground" | "jump" | "airidle" | "land" | "climb" = "ground";

  // ── Ladder climbing (Phase 34) ──────────────────────────────────────────────
  private _climbLadder: LadderDef | null = null;      // non-null = climbing
  private _interactLadder: LadderDef | null = null;   // top-zone "Climb down" prompt target
  // Mounted from the top while still holding "forward toward the ladder": that held key
  // means DESCEND until released once (otherwise W=up top-dismounts you right back off).
  private _climbHoldInvert = false;
  private _climbLocalX = 0;                           // lateral spot on a wide ladder (persistent — deriving from the
                                                      // body each frame makes the snap-lerp eat 90% of the shimmy speed)
  private _promptCooldown = 0;                        // s of "Climb down" prompt suppression after a climb exit
  private readonly _nearLadders = new Set<string>();  // sensor overlap (TriggerSystem events)
  private _climbCooldown = 0;                          // s until re-grab allowed
  private _offLadderExit:   (() => void) | null = null;
  private _offLadderEnter:  (() => void) | null = null;
  private _offLadderGone:   (() => void) | null = null;
  private _offLadderMoved:  (() => void) | null = null;
  private _modelYaw   = 0;                       // smoothed avatar facing (third-person)
  private _desiredDist: number;                  // scroll-zoom target distance
  private _camY    = Number.NaN;                 // smoothed camera height; NaN = snap next frame
  private _armDist = Number.NaN;                 // smoothed spring-arm distance; NaN = snap next frame

  readonly camera: THREE.PerspectiveCamera;

  private _offTeleport: (() => void) | null = null;
  private _offSavePos:  (() => void) | null = null;

  constructor(
    private readonly _settings: PlayerSettings,
    private readonly _scene: THREE.Scene,
    private readonly _bus: EventBus,
    private readonly _input: ControlSchemeManager,
    private readonly _movers: MoverSystem | null = null,
    private readonly _ladderLookup: (id: string) => LadderDef | null = () => null,
  ) {
    this.camera = new THREE.PerspectiveCamera(
      _settings.fov, window.innerWidth / window.innerHeight, 0.05, 500,
    );

    this._body = new CharacterBody(effectiveCharacterScale(_settings));
    this._desiredDist = _settings.thirdPersonDistance;
  }

  init(spawnPos: THREE.Vector3, facingDeg: number): void {
    this._yaw = THREE.MathUtils.degToRad(facingDeg);
    this._body.init(spawnPos);
    // Distance from the capsule CENTER (body origin) down to the feet. Stored positions
    // (checkpoints, saved poses, literal teleport coords) are all foot/floor level — where
    // a marker sits — so teleport adds this to land the FEET on the target, and save stores
    // the foot Y. Without it, the body center snaps to floor level and the feet sink below.
    const capsuleBottom = this._body.capsuleHalfHeight + this._body.capsuleRadius;
    // Script teleport_player → character:teleport. Snap position + kill vertical velocity so
    // the player doesn't inherit fall speed through the warp. Facing is left as-is for now
    // (teleport_player doesn't author a facing yet — always sends 0).
    this._offTeleport = this._bus.on("character:teleport", ({ position, facing }) => {
      this._exitClimb();   // never carry the climb lock through a warp (soft-lock guard)
      this._body.teleport(new THREE.Vector3(position.x, position.y + capsuleBottom, position.z));
      this._velY = 0;
      this._camY = this._armDist = Number.NaN;   // snap camera smoothing across the warp
      if (facing != null) {                          // set look direction (degrees); undefined = keep current
        this._yaw = THREE.MathUtils.degToRad(facing);
        this._modelYaw = this._yaw;                  // snap the third-person avatar too
      }
    });
    // Script store_position (player source) → stamp the player's current pose into a state key.
    // Store the FOOT Y (center − capsuleBottom) so it matches marker/foot-level positions and
    // round-trips through teleport (which re-adds capsuleBottom).
    this._offSavePos = this._bus.on("character:save-position", ({ key }) => {
      const p = this._body.position;
      gameState.set(key, { x: p.x, y: p.y - capsuleBottom, z: p.z, facing: THREE.MathUtils.radToDeg(this._yaw) });
    });
    // Ladder proximity + lifecycle (Phase 34). A rebuilt/deleted ladder force-exits
    // the climb — its colliders (and sensor handles) are gone.
    this._offLadderEnter = this._bus.on("ladder:zone-enter", ({ ladderId }) => this._nearLadders.add(ladderId));
    this._offLadderExit  = this._bus.on("ladder:zone-exit",  ({ ladderId }) => this._nearLadders.delete(ladderId));
    this._offLadderGone  = this._bus.on("ladder:removed", ({ id }) => {
      this._nearLadders.delete(id);
      if (this._climbLadder?.id === id) this._exitClimb();
    });
    this._offLadderMoved = this._bus.on("ladder:updated", ({ id }) => {
      if (this._climbLadder?.id === id) this._exitClimb();
    });
    void this._loadModel();
  }

  update(dt: number): void {
    const actions = this._input.state;   // merged per-frame input (kbm/gamepad/touch)

    this._yaw   -= actions.look.x;
    this._pitch -= actions.look.y;
    this._pitch  = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this._pitch));
    if (actions.zoomDelta !== 0) {
      this._desiredDist = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this._desiredDist + actions.zoomDelta));
    }
    if (actions.interactPressed) {
      if (this._interactLadder) this._mount(this._interactLadder, true);   // "Climb down" prompt (top mount)
      else if (this._interactTargetId) this._bus.emit("character:interact", { objectId: this._interactTargetId });
    }

    const speed = this._settings.moveSpeed;
    // move is unit-clamped; magnitude < 1 (analog stick/joystick) scales walk speed
    const dir   = _tmpDir.set(actions.move.x, 0, -actions.move.y);
    const isMoving = dir.lengthSq() > 0;
    if (isMoving) dir.multiplyScalar(speed * dt);
    dir.applyEuler(_tmpEuler.set(0, this._yaw, 0, "YXZ"));

    const jumpHeld = actions.jump;
    if (!jumpHeld) this._jumpArmed = true;   // re-arm on release

    // Ladder climbing (Phase 34) — mount check, then either the climb branch or
    // the normal gravity/KCC path. Never both in one frame.
    this._climbCooldown = Math.max(0, this._climbCooldown - dt);
    if (!this._climbLadder && this._climbCooldown <= 0 && this._nearLadders.size > 0 && isMoving) {
      this._tryMount(dir);
    }

    if (this._climbLadder) {
      this._updateClimb(dt, jumpHeld, actions.move.y, actions.move.x);
    } else {
      // Jump reliability (v4.28.14). `computedGrounded()` is only true when the KCC
      // move had a downward component, so plain walking flickers it false on most
      // frames and a raw grounded-gated jump eats ~80% of presses. Three layers:
      //  - press BUFFER: a tap is remembered briefly and fires on the next jumpable frame
      //  - COYOTE grace: recently-grounded counts as grounded (also covers walking off a ledge)
      //  - ground STICK below: while grounded, feed a small downward bias so the
      //    flag stays true during horizontal movement (also stabilizes mover carry)
      if (jumpHeld && this._jumpArmed) { this._jumpBuffer = JUMP_BUFFER_SEC; this._jumpArmed = false; }
      this._jumpBuffer = Math.max(0, this._jumpBuffer - dt);
      if (this._body.isGrounded) this._coyote = COYOTE_SEC;
      else this._coyote = Math.max(0, this._coyote - dt);

      if (this._jumpBuffer > 0 && this._coyote > 0) {
        this._velY = Math.sqrt(2 * 9.81 * this._settings.jumpHeight);
        this._jumpBuffer = 0;
        this._coyote = 0;
      } else if (this._body.isGrounded && this._velY <= 0) {
        this._velY = 0;
      } else {
        this._velY -= 20 * dt;
      }
      dir.y = this._velY * dt;
      if (this._body.isGrounded && this._velY === 0) dir.y = -GROUND_STICK * dt;

      // Moving geometry (Phase 31 / v4.25.1) — the whole block is gated on a mover
      // actually running this frame, so a world without live movers pays nothing
      // (no ground raycast, no contact scan).
      if (this._movers?.anyRunning()) {
        // Ride: standing on a mover's kinematic body adds its per-frame translation
        // delta to the desired move, so the KCC still collision-resolves the
        // combined motion. Translation only — spin doesn't rotate the player.
        if (this._body.isGrounded) {
          const h = this._body.groundBodyHandle();
          const carry = h !== null ? this._movers.carryDelta(h) : null;
          if (carry) dir.add(carry);
        }
        // Push: geometry that swept INTO the capsule since the last step shoves the
        // player out along the contact normal (depenetration read from the step's
        // contact manifolds). Routed through `dir` so walls still block the shove.
        const push = this._body.moverPush(this._movers.isMoverBody);
        if (push.lengthSq() > 0) dir.add(push);
      }

      this._body.move(dir);
    }
    const pos = this._body.position;

    // Camera — FPS or third-person orbit (yaw/pitch) with spring-arm collision.
    // Both modes derive their height from a smoothed body Y so stair steps don't judder.
    const camYRate = this._body.isGrounded ? CAM_Y_RATE_GROUND : CAM_Y_RATE_AIR;
    if (Number.isNaN(this._camY)) this._camY = pos.y;
    this._camY += (pos.y - this._camY) * Math.min(1, dt * camYRate);
    this._camY  = Math.max(pos.y - CAM_Y_MAX_LAG, Math.min(pos.y + CAM_Y_MAX_LAG, this._camY));
    if (this._settings.cameraMode === "thirdperson") {
      const pivot   = _tmpPivot.set(pos.x, this._camY + this._settings.thirdPersonHeight, pos.z);
      const forward = _tmpForward.set(0, 0, -1)
        .applyEuler(_tmpEuler.set(this._pitch, this._yaw, 0, "YXZ")); // camera look dir
      const back    = _tmpBack.copy(forward).negate();                 // pivot → camera
      let dist = this._desiredDist;
      this._ray.origin = pivot;
      this._ray.dir    = back;
      const hit = physicsWorld.world.castRay(
        this._ray, dist, true,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this._body.collider,
      );
      if (hit) dist = Math.max(MIN_DIST, hit.timeOfImpact - CAM_SKIN); // pull in on walls
      if (Number.isNaN(this._armDist)) this._armDist = dist;
      const armRate = dist < this._armDist ? ARM_RATE_IN : ARM_RATE_OUT;
      this._armDist += (dist - this._armDist) * Math.min(1, dt * armRate);
      this.camera.position.copy(pivot).addScaledVector(back, this._armDist);
      this.camera.lookAt(pivot);
    } else {
      // Eye height above the FEET: authored override, or derived from the capsule
      // (capsule top − 0.1) so it tracks Character Scale when unset.
      const capsuleBottom = this._body.capsuleHalfHeight + this._body.capsuleRadius;
      const eyeAboveFeet = this._settings.fpsEyeHeight ?? (capsuleBottom * 2 - 0.1);
      const eyeY = this._camY - capsuleBottom + eyeAboveFeet;
      this.camera.position.set(pos.x, eyeY, pos.z);
      this.camera.rotation.set(this._pitch, this._yaw, 0, "YXZ");
    }

    // Character model — face the movement direction (smoothed), hold facing when idle
    if (this._modelRoot) {
      const feetY = pos.y - (this._body.capsuleHalfHeight + this._body.capsuleRadius);
      this._modelRoot.position.set(pos.x, feetY, pos.z);
      // While climbing the avatar stays chest-to-the-ladder — the movement-facing
      // rule would spin it to face outward on the way down (input points away).
      if (isMoving && !this._climbLadder) {
        const targetYaw = Math.atan2(-dir.x, -dir.z);
        let delta = targetYaw - this._modelYaw;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));   // wrap to [-π, π]
        this._modelYaw += delta * Math.min(1, dt * 10);
      }
      this._modelRoot.rotation.y = this._modelYaw + MODEL_FORWARD_OFFSET;
      this._modelRoot.visible = (this._settings.cameraMode === "thirdperson");
      this._mixer?.update(dt);
      this._updateAnim(!this._body.isGrounded, isMoving);
    }

    // Interact — pick the nearest interactable within range that's roughly in front of the player.
    // The interactable list is rebuilt from the scene only a few times/sec; the per-frame cost is
    // just distance + facing over that small cached list (no per-frame scene traversal or raycast).
    this._interactAge += dt;
    if (this._interactAge >= INTERACT_REBUILD_SEC) { this._interactAge = 0; this._rebuildInteractCache(); }

    const forward = _tmpForward.set(0, 0, -1).applyEuler(_tmpEuler.set(0, this._yaw, 0, "YXZ"));
    const eyeY = pos.y + this._body.capsuleHalfHeight + this._body.capsuleRadius - 0.1;
    const eye  = _tmpEye.set(pos.x, eyeY, pos.z);
    let bestId: string | null = null, bestLabel = "Interact", bestDist = Infinity;
    for (const e of this._interactCache) {
      if (!e.obj.parent) continue;                   // removed from the scene since last rebuild
      const to = e.obj.getWorldPosition(_tmpWp).sub(eye); to.y = 0;
      const d = to.length();
      if (d < 1e-3 || d > INTERACT_RANGE) continue;
      if (forward.dot(to.divideScalar(d)) < INTERACT_MIN_DOT) continue;   // must be in front
      if (d < bestDist) { bestDist = d; bestId = e.id; bestLabel = e.label; }
    }

    // Ladder-top "Climb down" prompt (Phase 34) — the explicit alternative to the
    // auto back-toward-the-ladder mount, so descending never needs a blind walk.
    this._interactLadder = null;
    this._promptCooldown = Math.max(0, this._promptCooldown - dt);
    if (bestId === null && !this._climbLadder && this._promptCooldown <= 0 && this._nearLadders.size > 0) {
      const capsuleBottom = this._body.capsuleHalfHeight + this._body.capsuleRadius;
      const feetY = pos.y - capsuleBottom;
      for (const id of this._nearLadders) {
        const def = this._ladderLookup(id);
        if (!def) continue;
        const p = resolveLadderParams(def);
        const yawRad = THREE.MathUtils.degToRad(def.rotationY);
        const fx = Math.sin(yawRad), fz = Math.cos(yawRad);
        const localZ = (pos.x - def.position.x) * fx + (pos.z - def.position.z) * fz;
        if (localZ <= 0.05 && feetY > def.position.y + p.height - CLIMB_TOP_FRAC) {
          this._interactLadder = def;
          bestId = id; bestLabel = "Climb down";
          break;
        }
      }
    }
    if (bestId !== this._interactTargetId) {
      this._interactTargetId = bestId;
      this._bus.emit(
        "character:interact-range",
        bestId ? { objectId: bestId, label: bestLabel } : null,
      );
    }
  }

  get body(): CharacterBody { return this._body; }

  // ── Ladder climbing (Phase 34) ──────────────────────────────────────────────

  /** Mount if the player is moving toward a nearby ladder (survey: dot-product intent check). */
  private _tryMount(moveDir: THREE.Vector3): void {
    const mLen = Math.hypot(moveDir.x, moveDir.z);
    if (mLen < 1e-6) return;
    const pos = this._body.position;
    const capsuleBottom = this._body.capsuleHalfHeight + this._body.capsuleRadius;
    const feetY = pos.y - capsuleBottom;

    for (const id of this._nearLadders) {
      const def = this._ladderLookup(id);
      if (!def) continue;
      const p = resolveLadderParams(def);
      const yawRad = THREE.MathUtils.degToRad(def.rotationY);
      const fx = Math.sin(yawRad), fz = Math.cos(yawRad);   // climb-side normal (local +Z) in world
      const localZ = (pos.x - def.position.x) * fx + (pos.z - def.position.z) * fz;
      // Climb side (+Z): mount by moving INTO the ladder (−f). Platform side (−Z):
      // only the top-remount zone mounts, by moving toward the ladder (+f).
      let mountDot: number;
      let fromTop = false;
      if (localZ > 0.05) {
        mountDot = (moveDir.x * -fx + moveDir.z * -fz) / mLen;
      } else if (feetY > def.position.y + p.height - CLIMB_TOP_FRAC && localZ > -p.autoGrabRange) {
        mountDot = (moveDir.x * fx + moveDir.z * fz) / mLen;
        fromTop = true;
      } else {
        continue;
      }
      if (mountDot < CLIMB_MOUNT_DOT) continue;
      this._mount(def, fromTop);
      return;
    }
  }

  private _mount(def: LadderDef, fromTop = false): void {
    this._climbLadder = def;
    this._climbHoldInvert = fromTop;   // held forward = descend until released (see field comment)
    this._velY = 0;
    // Wide ladders keep the grab-point lateral position; narrow ones center.
    const p = resolveLadderParams(def);
    if (p.width > CLIMB_FREE_X_WIDTH) {
      const yawRad = THREE.MathUtils.degToRad(def.rotationY);
      const rx = Math.cos(yawRad), rz = -Math.sin(yawRad);
      const pos = this._body.position;
      const xMax = p.width / 2 - CLIMB_X_MARGIN;
      this._climbLocalX = Math.max(-xMax, Math.min(xMax,
        (pos.x - def.position.x) * rx + (pos.z - def.position.z) * rz));
    } else {
      this._climbLocalX = 0;
    }
    // Face the ladder: camera yaw and avatar both look at the climb face.
    const yawRad = THREE.MathUtils.degToRad(def.rotationY);
    this._yaw = yawRad;
    this._modelYaw = yawRad;
    this._play("climb", true);
    this._animPhase = "climb";
  }

  /**
   * Restore normal movement unconditionally — the single exit every path funnels
   * through (jump release, dismounts, teleport, ladder rebuild/delete, dispose),
   * so no transition can soft-lock the player.
   */
  private _exitClimb(withCooldown = false): void {
    if (!this._climbLadder) return;
    this._climbLadder = null;
    this._velY = 0;
    if (withCooldown) this._climbCooldown = CLIMB_COOLDOWN;
    this._climbHoldInvert = false;
    this._promptCooldown = 1.5;   // don't flash "Climb down" while stepping off the top
    if (this._animPhase === "climb") {
      this._animPhase = "ground";   // resolves to idle/walk/air next frame
      if (this._currentAction) this._currentAction.timeScale = 1;
    }
  }

  private _updateClimb(dt: number, jumpHeld: boolean, moveY: number, moveX: number): void {
    const def = this._climbLadder!;
    const p = resolveLadderParams(def);
    const capsuleBottom = this._body.capsuleHalfHeight + this._body.capsuleRadius;

    if (jumpHeld && this._jumpArmed) {     // jump = let go (remapped, not an actual jump)
      this._jumpArmed = false;
      this._exitClimb(true);
      return;
    }

    const yawRad = THREE.MathUtils.degToRad(def.rotationY);
    const fx = Math.sin(yawRad), fz = Math.cos(yawRad);
    const rx = Math.cos(yawRad), rz = -Math.sin(yawRad);   // ladder local +X in world
    const pos = this._body.position;

    const climbSpeed = this._settings.climbSpeed ?? 2;

    // Lateral position: narrow ladders snap to the centerline; wide ones (rock
    // walls) keep the mount-point X and A/D shimmies, clamped inside the span.
    // latSpeed is the APPLIED speed (0 when pinned at the edge) so the climb
    // clip animates for sideways movement too.
    let latSpeed = 0;
    if (p.width > CLIMB_FREE_X_WIDTH) {
      const prevX = this._climbLocalX;
      this._climbLocalX += moveX * climbSpeed * dt;
      const xMax = p.width / 2 - CLIMB_X_MARGIN;
      this._climbLocalX = Math.max(-xMax, Math.min(xMax, this._climbLocalX));
      latSpeed = Math.abs(this._climbLocalX - prevX) / dt;
    }
    const localX = this._climbLocalX;

    // Climb line: capsule center held just off the climb face at the lateral spot.
    const lineOff = 0.08 + this._body.capsuleRadius + CLIMB_LINE_GAP;
    const lineX = def.position.x + fx * lineOff + rx * localX;
    const lineZ = def.position.z + fz * lineOff + rz * localX;
    if (this._climbHoldInvert) {
      if (moveY > 0.05) moveY = -moveY;        // still holding the walk-on key → descend
      else this._climbHoldInvert = false;      // released once → normal W=up/S=down
    }
    const vy = moveY * climbSpeed;                              // W = up, S = down
    const minY = def.position.y + capsuleBottom;                // feet at the ladder foot
    const maxY = def.position.y + p.height + capsuleBottom;     // feet at the top edge
    let newY = pos.y + vy * dt;

    // Top dismount: pushing up at the top bound steps onto a FIXED stand marker
    // (never physics-derived), inward from the ladder top. Camera Y smoothing eats the step.
    if (vy > 0 && newY >= maxY) {
      this._exitClimb();
      // Stand marker keeps the lateral spot (matters on wide rock-wall ladders).
      this._body.teleport(_tmpEye.set(
        def.position.x - fx * p.topDismountOffset + rx * localX,
        def.position.y + p.height + capsuleBottom,
        def.position.z - fz * p.topDismountOffset + rz * localX,
      ));
      return;
    }
    if (newY > maxY) newY = maxY;
    if (newY < minY) newY = minY;
    // Bottom dismount: pushing down with feet at the foot → back to normal movement.
    if (vy < 0 && newY <= minY) { this._exitClimb(); return; }

    const k = Math.min(1, dt * CLIMB_SNAP_RATE);
    this._body.setClimbTranslation(_tmpEye.set(
      pos.x + (lineX - pos.x) * k,
      newY,
      pos.z + (lineZ - pos.z) * k,
    ));

    // Clip rate follows actual movement speed (vertical, lateral, or diagonal);
    // holding still = hanging (paused clip).
    if (this._currentClip === "climb" && this._currentAction) {
      this._currentAction.timeScale = Math.hypot(vy, latSpeed) / CLIMB_ANIM_REF;
    }
  }

  // Re-scan the scene for interactable objects (deduped by editorId; the root is visited first so
  // its world position ≈ the object). Called a few times/sec, not per frame.
  private _rebuildInteractCache(): void {
    this._interactCache.length = 0;
    const seen = this._interactSeen; seen.clear();
    this._scene.traverse(o => {
      const id = o.userData["editorId"] as string | undefined;
      if (!o.userData["interactable"] || !id || seen.has(id)) return;
      seen.add(id);
      this._interactCache.push({ id, label: (o.userData["interactLabel"] as string | undefined) ?? "Interact", obj: o });
    });
  }

  private async _loadModel(): Promise<void> {
    // No avatar asset chosen → show a plain capsule (the dropdown's "capsule only" option),
    // so third-person always has a visible body.
    if (!this._settings.modelAssetId) { this._buildCapsule(); return; }
    try {
      const gltf = await assetManager.loadGLTF(this._settings.modelAssetId) as {
        scene: THREE.Object3D; animations: THREE.AnimationClip[];
      };
      // SkeletonUtils.clone rebinds skinned meshes to the cloned skeleton (plain .clone() breaks it)
      const root = cloneSkinned(gltf.scene);
      enablePaddedSkinnedCulling(root);              // cull off-screen, padded so it doesn't pop
      root.traverse(c => { c.raycast = NO_RAYCAST; });
      this._modelAnimations = gltf.animations ?? [];
      this._modelRoot = root;
      this._mixer = new THREE.AnimationMixer(root);
      root.scale.setScalar(effectiveCharacterScale(this._settings));
      this._scene.add(root);
      this._modelYaw = this._yaw;
      this._play("idle", true);
    } catch (err) {
      console.warn("CharacterController: failed to load model", err);
    }
  }

  private _buildCapsule(): void {
    const r = this._body.capsuleRadius, h = this._body.capsuleHalfHeight;
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(r, h * 2, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x6b8cc4, roughness: 0.7 }),
    );
    mesh.position.y = h + r;                 // lift so the capsule's foot sits at the group origin
    mesh.raycast = NO_RAYCAST;
    const group = new THREE.Group();
    group.add(mesh);   // mesh already sized from the (scaled) body dims — no extra group scale
    this._modelRoot = group;
    this._scene.add(group);
    this._modelYaw = this._yaw;
  }

  private _byName(name: string): THREE.AnimationClip | null {
    return this._modelAnimations.find(c => c.name === name) ?? null;
  }

  // Resolve an intent ("idle"/"walk"/…) to an actual clip. A per-character override wins:
  // null = None (play nothing), a string = that exact clip. Undefined falls back to
  // case-insensitive name matching, so any model's capitalization ("Idle", "Walk", …) works.
  private _clipFor(intent: string): THREE.AnimationClip | null {
    const override = this._settings.animClips?.[intent as LocomotionState];
    if (override === null) return null;
    if (override) return this._byName(override);
    const lc = intent.toLowerCase();
    return this._modelAnimations.find(c => c.name.toLowerCase() === lc)
        ?? this._modelAnimations.find(c => c.name.toLowerCase().includes(lc))
        ?? null;
  }

  private _has(intent: string): boolean { return this._clipFor(intent) != null; }

  // Crossfade to a clip. `loop` false = one-shot that clamps on its last frame.
  // `speed` scales playback rate (used for the configurable jump-anim speed).
  private _play(intent: string, loop: boolean, speed = 1): void {
    if (intent === this._currentClip || !this._mixer) return;
    const clip = this._clipFor(intent);
    if (!clip) return;
    const next = this._mixer.clipAction(clip);
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.timeScale = speed;
    next.fadeIn(0.15).play();
    this._currentAction?.fadeOut(0.15);
    this._currentAction  = next;
    this._currentClipObj = clip;
    this._currentClip    = intent;
  }

  // Has the current one-shot reached its end? (Only meaningful for a clamped LoopOnce.)
  private _animDone(): boolean {
    const a = this._currentAction, c = this._currentClipObj;
    return !!a && !!c && a.time >= c.duration - 0.02;
  }

  // Locomotion state machine: ground (idle/walk) → jump takeoff → air-idle loop → land → ground.
  // Each stage falls back gracefully if the model lacks that clip.
  private _updateAnim(airborne: boolean, isMoving: boolean): void {
    if (!this._mixer) return;
    switch (this._animPhase) {
      case "ground":
        if (airborne) this._enterJump();
        else this._play(isMoving ? "walk" : "idle", true);
        break;
      case "jump":                                        // takeoff one-shot
        if (!airborne) this._enterLand();
        else if (this._animDone() && this._has("jump_idle")) {
          this._play("jump_idle", true, this._jumpSpeed()); // still airborne past takeoff → loop air pose
          this._animPhase = "airidle";
        }
        break;
      case "airidle":
        if (!airborne) this._enterLand();
        break;
      case "land":                                        // landing one-shot
        if (airborne) this._enterJump();                  // jumped again mid-landing
        else if (this._animDone()) {
          this._play(isMoving ? "walk" : "idle", true);
          this._animPhase = "ground";
        }
        break;
      case "climb":                                       // exits via _exitClimb
        this._play("climb", true);                        // no-op once playing; retries if the model loaded late
        break;
    }
  }

  private _jumpSpeed(): number { return this._settings.jumpAnimSpeed ?? 1; }

  private _enterJump(): void {
    const s = this._jumpSpeed();
    if      (this._has("jump"))      { this._play("jump", false, s);     this._animPhase = "jump"; }
    else if (this._has("jump_idle")) { this._play("jump_idle", true, s); this._animPhase = "airidle"; }
    else                             { this._animPhase = "airidle"; }   // no jump clips: keep current
  }

  private _enterLand(): void {
    if (this._has("jump_land")) { this._play("jump_land", false, this._jumpSpeed()); this._animPhase = "land"; }
    else                        { this._animPhase = "ground"; }         // resolves to walk/idle next frame
  }

  dispose(): void {
    this._exitClimb();
    this._offTeleport?.();    this._offTeleport   = null;
    this._offSavePos?.();     this._offSavePos    = null;
    this._offLadderEnter?.(); this._offLadderEnter = null;
    this._offLadderExit?.();  this._offLadderExit  = null;
    this._offLadderGone?.();  this._offLadderGone  = null;
    this._offLadderMoved?.(); this._offLadderMoved = null;
    if (this._modelRoot) this._scene.remove(this._modelRoot);
    this._mixer?.stopAllAction();
    if (this._interactTargetId) this._bus.emit("character:interact-range", null);
    this._body.dispose();
  }
}
