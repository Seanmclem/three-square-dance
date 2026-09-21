import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { enablePaddedSkinnedCulling } from "./skinnedCulling";
import type { PlayerSettings, LocomotionState, LadderDef } from "@/types";
import type { EventBus } from "@/core/EventBus";
import type { ControlSchemeManager } from "@/input/ControlSchemeManager";
import { RUN_STICK_THRESHOLD } from "@/input/actions";
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
const FOOTSTEP_WOBBLE = 0.06;  // ± playback-rate spread of the footstep pitch wobble (≈ ±1 semitone)
const GROUND_STICK    = 0.5;   // m/s downward bias while grounded — keeps computedGrounded stable (SUPPRESSED on movers, see below)

// ── Character feel (Phase 70) ─────────────────────────────────────────────────
// Rule: fixed rules, lively presentation. Everything below either leaves the
// landing point alone (shadow, squash, lean) or is tuned so existing levels stay
// valid (the jump reshape keeps the legacy PEAK and AIR TIME).
const LEGACY_GRAVITY = 20;      // m/s² — launches + walk-off falls (every existing spring keeps its arc)
// A JUMP rises under lighter gravity and falls under heavier. With rise fraction
// `a` of the legacy air time, gRise = g/(4a²) and gFall = g/(4(1-a)²) reproduce
// the legacy peak and total air time for ANY jumpHeight (a = 0.5 → 20/20).
const JUMP_RISE_FRAC = 0.56;
const GRAVITY_RISE   = LEGACY_GRAVITY / (4 * JUMP_RISE_FRAC ** 2);         // ≈ 15.9
const GRAVITY_FALL   = LEGACY_GRAVITY / (4 * (1 - JUMP_RISE_FRAC) ** 2);   // ≈ 25.8
const JUMP_CUT_MULT  = 3;       // × GRAVITY_RISE once jump is released while still rising (hold for height)
// Horizontal ramps as TIMES (so they scale with moveSpeed): seconds from rest to
// full speed / full speed to rest. Air stays strongly steerable — landing
// precision needs it — but can no longer reverse in a single frame.
const GROUND_ACCEL_SEC = 0.08;
const GROUND_DECEL_SEC = 0.08;  // ≈ 0.25m stop slide at speed 6
const AIR_ACCEL_SEC    = 0.2;
// Run skid (v4.87.0): reversing direction while RUNNING brakes over this long instead of
// GROUND_DECEL_SEC, so there is time for a skid to read (a 0.16s reversal is over before any
// pose can). Only reachable above walk speed, i.e. only in games that turned run on — walking
// physics, and every level built around them, are untouched.
const RUN_SKID_SEC     = 0.22;  // run speed → 0 (≈ 0.9m of slide at 8.4 m/s; was ≈ 0.34m)
const RUN_SKID_MIN     = 1.15;  // × moveSpeed — faster than this when the reversal starts = a skid
const SKID_LEAN        = -0.25; // rad — lean BACK against the slide (≈ 14°)
// A reversal is never frame-perfect: keys overlap or gap by 25–100ms and an analog stick passes
// through centre, and in that moment the normal brake (75 m/s²) drops the speed below
// RUN_SKID_MIN before the opposing input registers. So eligibility REMEMBERS a recent run.
const RUN_SKID_MEMORY  = 0.15;  // s a faster-than-RUN_SKID_MIN speed still counts
const RUN_SKID_FLOOR   = 0.3;   // × moveSpeed — below this there is nothing left to skid with
// Landing shadow — a soft disc straight under the player (the "where will I land" cue).
const SHADOW_MAX_DROP = 40;     // m — ray length; no ground within this = no disc
const SHADOW_LIFT     = 0.03;   // m above the hit surface (z-fight guard, with polygonOffset)
// The disc shrinks + fades as the player rises — the height cue (a blob-shadow convention,
// not physics: a sun shadow would not shrink). Both bottom out at a floor so the disc still
// marks the landing spot on a long fall. v4.81.0 shrank only 35% over 6m (≈10% at the top of
// a 1.75m jump — invisible); now ≈26% smaller at that peak.
const SHADOW_SHRINK        = 0.45;  // fraction of the radius lost at SHADOW_SHRINK_HEIGHT and above
const SHADOW_SHRINK_HEIGHT = 3;     // m of feet-above-surface over which it shrinks
const SHADOW_OPACITY       = 0.55;  // on the ground
const SHADOW_FADE          = 0.45;  // fraction of the opacity lost at SHADOW_FADE_HEIGHT and above
const SHADOW_FADE_HEIGHT   = 6;     // m
// Squash & stretch — a damped spring on the avatar root's Y scale (1 = rest).
const SQUASH_STIFFNESS = 180;   // 1/s²
const SQUASH_DAMPING   = 14;    // 1/s (ζ ≈ 0.52 — one visible overshoot, then settles)
const SQUASH_TAKEOFF   = 3;     // spring velocity kick toward stretch at takeoff/launch
const SQUASH_LAND_GAIN = 0.35;  // kick toward squash per m/s of impact speed…
const SQUASH_LAND_MAX  = 4.5;   // …capped
const LEAN_FORWARD = 0.10;      // rad of forward tilt at full speed (≈ 6°)
const LEAN_ROLL    = 0.04;      // rad of roll per rad/s of avatar turn rate…
const LEAN_ROLL_MAX = 0.2;      // …capped (≈ 11°)
const LEAN_RATE    = 10;        // 1/s exp smoothing of both
// Acceleration lean (v4.87.0): tilt along the avatar's own forward axis by how hard it is
// speeding up (+, leans in) or braking (−, leans back). On a full reversal at a run the avatar
// is still facing the OLD way while the velocity is being thrown into reverse, so it leans
// BACK against the slide, swings round, then leans INTO the new direction — a skid turn, with
// no change to where the player goes. Also gives starts and stops a little weight.
const LEAN_ACCEL     = 0.0025;  // rad per m/s² of forward acceleration
const LEAN_ACCEL_MAX = 0.3;     // rad cap on that term (≈ 17°)

/**
 * Character scale is per camera mode (Phase 34 follow-up): third-person uses
 * characterScale (avatar + capsule), FPS uses fpsCharacterScale (capsule/eye
 * height, default 1) — a small third-person avatar no longer shrinks the FPS
 * viewpoint. Mode is a per-world author setting, so collision is stable in play.
 */
/** [sound, ...variants] with blanks and duplicates dropped (Phase 73 footstep variation). */
function footstepPool(sound: string | undefined, variants: string[] | undefined): string[] {
  const out: string[] = [];
  for (const s of [sound, ...(variants ?? [])]) if (s && !out.includes(s)) out.push(s);
  return out;
}

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
const _tmpNormal  = new THREE.Vector3();
const _AXIS_Z      = new THREE.Vector3(0, 0, 1);   // CircleGeometry's facing — rotated onto the ground normal

export class CharacterController {
  private readonly _body: CharacterBody;   // built in the constructor (needs _settings scale)
  private _yaw     = 0;
  private _pitch   = 0;
  private _velY    = 0;
  // Horizontal launch/knockback channel (v4.62.0) — additive to input movement,
  // decays fast on ground, slowly in air. Zero when inactive.
  private _extVelX = 0;
  private _extVelZ = 0;
  // Edge-triggered jump: must release the jump input before it fires again (no auto-bounce on landing).
  private _jumpArmed = true;
  private _jumpBuffer = 0;   // s left on a buffered jump press
  private _coyote = 0;       // s since last grounded that still counts as grounded
  // Phase 70 — horizontal velocity, ramped toward input × moveSpeed (see *_SEC above).
  private _velX = 0;
  private _velZ = 0;
  // True from a JUMP takeoff until landing: selects the reshaped rise/fall gravity
  // (launches and walk-off falls stay on LEGACY_GRAVITY).
  private _jumpArc = false;
  private _lastAirVelY = 0;   // vertical speed on the last airborne frame (landing impact)
  // Squash & stretch spring + lean — presentation only, never touches the capsule.
  private _squash = 1;
  private _squashVel = 0;
  private _modelBaseScale = 1;
  private _leanPitch = 0;
  private _leanRoll = 0;
  private _prevModelYaw = 0;
  private _prevVelX = 0;   // last frame's held velocity — the acceleration lean differences it
  private _prevVelZ = 0;
  private _skidding = false;   // run-reversal skid in progress: slow brake, facing held, lean back
  private _ranRecently = 0;    // s left in which a reversal still counts as "from a run"
  // Landing shadow disc (third person).
  private _shadow: THREE.Mesh | null = null;
  private readonly _shadowRay = new RAPIER.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  // Jump readout — measured over each airborne stretch, emitted on landing.
  private _airStartX = 0;
  private _airStartY = 0;
  private _airStartZ = 0;
  private _airPeakY = 0;
  // A landing's stats wait a few frames for the capsule to settle before they are emitted (see the landing block).
  private _statsPending: { height: number; distance: number; airTime: number; startY: number; frames: number } | null = null;
  // Mover body under the player (carry target) — cached across grounded-flicker
  // frames via the coyote window (v4.29.9).
  private _moverGroundHandle: number | null = null;

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

  // ── Locomotion audio (Phase 36 follow-up) — footstep stride accumulator ──────
  private _stepAccum = 0;    // metres of horizontal ground travel since the last footstep
  private _stepPrevX = 0;
  private _stepPrevZ = 0;
  private _airTime   = 0;    // seconds airborne — a real fall vs grounded-flicker (land sound gate)
  // Footstep POOLS (Phase 73): [sound, ...variants]. One is picked per step, plain random with
  // equal chance — the user's spec (v4.83.0 shipped a "never twice in a row" rule they had not
  // asked for; removed in v4.83.1).
  private _footstepOverride: string[] | null = null;   // runtime surface swap (set_footstep action); null = authored default
  private readonly _footstepDefault: string[];         // from PlayerSettings, fixed for the session
  private _offFootstep: (() => void) | null = null;

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
  private _offLaunch:   (() => void) | null = null;
  private _offScriptAnim: (() => void) | null = null;
  private _offFlash:    (() => void) | null = null;
  // Damage flash (flash_player). `_flashMats` is captured on the FIRST flash: the
  // avatar comes from SkeletonUtils.clone, which SHARES materials with the source
  // asset, so tinting in place would also tint any NPC/prop using the same model.
  // We clone the avatar's materials once and only ever touch those copies.
  private _flash: { t: number; dur: number; color: THREE.Color } | null = null;
  private _flashMats: { mat: THREE.Material; emissive: THREE.Color | null; intensity: number }[] | null = null;
  // Script-driven avatar clip (play_animation target "player") — overrides the
  // locomotion state machine until it ends / is cleared / the player moves.
  private _scriptAnim: { name: string; loop: boolean; hold: boolean } | null = null;

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
    this._footstepDefault = footstepPool(_settings.footstepSound, _settings.footstepVariants);
    this._desiredDist = _settings.thirdPersonDistance;
    // Authored starting tilt: degrees down → negative pitch (looking down raises
    // the spring-arm camera above the pivot and aims it down at the character).
    if (_settings.cameraMode === "thirdperson") {
      const deg = _settings.thirdPersonPitch ?? 0;
      this._pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, -THREE.MathUtils.degToRad(deg)));
    }
  }

  init(spawnPos: THREE.Vector3, facingDeg: number): void {
    this._yaw = THREE.MathUtils.degToRad(facingDeg);
    this._body.init(spawnPos);
    this._stepPrevX = spawnPos.x; this._stepPrevZ = spawnPos.z;   // seed footstep travel
    this._buildShadow();
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
      this._velX = this._velZ = 0;         // …nor run momentum (Phase 70)
      this._jumpArc = false;
      this._airPeakY = Number.NaN;         // a warp is not a jump — no readout for this stretch
      this._statsPending = null;
      this._extVelX = this._extVelZ = 0;   // don't carry a launch shove through a warp
      this._clearScriptAnim();             // a warp (e.g. respawn) ends a scripted pose
      this._snapAnimToIdle();              // …and HARD-resets the pose: no crossfade out of
                                           // a death pose / fall loop visible after the fade
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
    // Script launch_player → spring/bouncer impulse: write the jump channel
    // directly. Works while grounded — the grounded clamp only zeroes velY <= 0,
    // so a positive velocity lifts off next frame. max() lets a spring cancel a
    // fast fall without ever slowing an even faster existing rise; coyote/jump
    // buffer are cleared so a buffered press can't double-boost the launch.
    this._offLaunch = this._bus.on("character:launch", ({ speed, hSpeed, dirDeg, relativeToPlayer, awayFrom }) => {
      this._exitClimb();
      this._velY = Math.max(this._velY, speed);
      this._jumpArc = false;               // a launch flies on LEGACY_GRAVITY — springs keep their authored arc
      this._squashVel += SQUASH_TAKEOFF;   // stretch off the pad
      // Optional horizontal shove — dirDeg uses the spawn-facing compass (0 = -Z),
      // replacing (not stacking) any prior shove so repeat pads feel consistent.
      if (hSpeed) {
        // Player-relative: the engine can't know the look yaw, so it sends a flag and
        // we add it here. Same compass — `(0,0,-1)` rotated by _yaw IS (-sin, -cos),
        // so 0 = the way they're looking and 180 = knocked backwards.
        let base = relativeToPlayer ? THREE.MathUtils.radToDeg(this._yaw) : 0;
        // "away" frame: 0 = straight away from the attacker. A compass angle θ points
        // along (-sin θ, -cos θ), so the angle of vector v is atan2(-v.x, -v.z). Directly
        // on top of it (no horizontal direction) falls back to "backwards from the look".
        if (awayFrom) {
          const p = this._body.position, vx = p.x - awayFrom.x, vz = p.z - awayFrom.z;
          base = Math.hypot(vx, vz) > 0.05 ? THREE.MathUtils.radToDeg(Math.atan2(-vx, -vz))
                                           : THREE.MathUtils.radToDeg(this._yaw) + 180;
        }
        const rad = THREE.MathUtils.degToRad((dirDeg ?? 0) + base);
        this._extVelX = -Math.sin(rad) * hSpeed;
        this._extVelZ = -Math.cos(rad) * hSpeed;
      }
      this._coyote = 0;
      this._jumpBuffer = 0;
    });
    // Script play_animation targeting the player: "__auto__" clears the override
    // back to locomotion; anything else plays that clip on the avatar.
    this._offScriptAnim = this._bus.on("character:play-animation", ({ clipName, loop, hold }) => {
      if (clipName === "__auto__") { this._clearScriptAnim(); return; }
      this._scriptAnim = { name: clipName, loop: !!loop, hold: !!hold };
      this._playByName(clipName, !!loop);
    });
    // Damage flash. In FPS the avatar is hidden (see the visible= line in update),
    // so there is nothing to tint — hand it to the screen overlay instead.
    this._offFlash = this._bus.on("character:flash", ({ color, duration }) => {
      if (this._settings.cameraMode !== "thirdperson") {
        this._bus.emit("overlay:flash", { color, duration, peak: 0.32 });
        return;
      }
      this._captureFlashMaterials();
      this._flash = { t: 0, dur: Math.max(0.05, duration), color: new THREE.Color(color) };
    });
    // Runtime footstep surface swap (set_footstep action). Empty = revert to authored default.
    this._offFootstep = this._bus.on("character:set-footstep", ({ sound, variants }) => {
      const pool = footstepPool(sound, variants);
      this._footstepOverride = pool.length ? pool : null;
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
      // v4.79.76 — volumes hear every interact press (TriggerSystem fans out to
      // the volumes the player is inside); device-neutral (E / LB / touch).
      this._bus.emit("character:interact-pressed", {});
      if (this._interactLadder) this._mount(this._interactLadder, true);   // "Climb down" prompt (top mount)
      else if (this._interactTargetId) this._bus.emit("character:interact", { objectId: this._interactTargetId });
    }

    // move is unit-clamped; magnitude < 1 (analog stick/joystick) scales walk speed
    const dir   = _tmpDir.set(actions.move.x, 0, -actions.move.y);
    const mag = dir.length();
    const isMoving = mag > 0;
    // Run (Phase 71): opt-in per game (runMultiplier > 1). Held Shift, or the move
    // stick pushed to RUN_STICK_THRESHOLD. With run enabled the stick's 0..threshold
    // span maps onto 0..full WALK speed (full walk is reached where run takes over);
    // keyboard input is magnitude 1 and is unaffected. With run disabled: as always.
    const runMult = this._settings.runMultiplier ?? 1;
    const running = runMult > 1 && actions.run && isMoving;
    const speed = this._settings.moveSpeed * (running ? runMult : 1);
    if (isMoving) {
      const k = runMult > 1 ? (running ? 1 : Math.min(1, mag / RUN_STICK_THRESHOLD)) : mag;
      dir.multiplyScalar(speed * k / mag);   // the WANTED velocity (m/s), world-space after the yaw below
    }
    dir.applyEuler(_tmpEuler.set(0, this._yaw, 0, "YXZ"));
    // Avatar facing uses the INPUT direction only — captured here, before gravity /
    // launch shove / mover carry join `dir`. Aiming at the full displacement made
    // the model wobble while a launch tail decayed (worst moving backwards, where
    // the shortest-turn side flips at 180°).
    const faceX = dir.x, faceZ = dir.z;

    // Phase 70 — ramp the held velocity toward the wanted one at a limited rate
    // (was: wanted × dt straight into the move = full speed on frame one, dead
    // stop on release, instant mid-air reversal). `_coyote > 0` is the stable
    // "on the ground" read — raw isGrounded flickers while walking.
    // Run skid: starts when the wanted direction opposes a faster-than-walk velocity on the
    // ground; lasts until the old motion is spent (or the player lets go / leaves the ground).
    const vLen = Math.hypot(this._velX, this._velZ);
    const against = isMoving && vLen > 0.01 && (this._velX * dir.x + this._velZ * dir.z) < -0.5 * vLen * Math.hypot(dir.x, dir.z);
    if (vLen > this._settings.moveSpeed * RUN_SKID_MIN) this._ranRecently = RUN_SKID_MEMORY;
    else this._ranRecently = Math.max(0, this._ranRecently - dt);
    if (!this._skidding && against && this._coyote > 0 && this._ranRecently > 0
        && vLen > this._settings.moveSpeed * RUN_SKID_FLOOR) this._skidding = true;
    else if (this._skidding && (!against || this._coyote <= 0)) this._skidding = false;
    const rampSec = this._skidding ? RUN_SKID_SEC
      : this._coyote > 0 ? (isMoving ? GROUND_ACCEL_SEC : GROUND_DECEL_SEC) : AIR_ACCEL_SEC;
    const maxStep = speed / rampSec * dt;
    const dvx = dir.x - this._velX, dvz = dir.z - this._velZ;
    const dLen = Math.hypot(dvx, dvz);
    if (dLen <= maxStep) { this._velX = dir.x; this._velZ = dir.z; }
    else { this._velX += dvx / dLen * maxStep; this._velZ += dvz / dLen * maxStep; }
    dir.set(this._velX * dt, 0, this._velZ * dt);

    const jumpHeld = actions.jump;
    if (!jumpHeld) this._jumpArmed = true;   // re-arm on release

    // Ladder climbing (Phase 34) — mount check, then either the climb branch or
    // the normal gravity/KCC path. Never both in one frame.
    this._climbCooldown = Math.max(0, this._climbCooldown - dt);
    if (!this._climbLadder && this._climbCooldown <= 0 && this._nearLadders.size > 0 && isMoving) {
      this._tryMount(dir);
    }

    if (this._climbLadder) {
      this._velX = this._velZ = 0;
      this._airPeakY = Number.NaN;   // a climb is not a jump — no readout for this airborne stretch
      this._updateClimb(dt, jumpHeld, actions.move.y, actions.move.x);
    } else {
      // Jump reliability (v4.28.14). `computedGrounded()` is only true when the KCC
      // move had a downward component, so plain walking flickers it false on most
      // frames and a raw grounded-gated jump eats ~80% of presses. Three layers:
      //  - press BUFFER: a tap is remembered briefly and fires on the next jumpable frame
      //  - COYOTE grace: recently-grounded counts as grounded (also covers walking off a ledge)
      //  - ground STICK below: while grounded, feed a small downward bias so the
      //    flag stays true during horizontal movement (STATIC ground only — on a
      //    moving platform the stick corrupts the KCC solve, see the mover block)
      if (jumpHeld && this._jumpArmed) { this._jumpBuffer = JUMP_BUFFER_SEC; this._jumpArmed = false; }
      this._jumpBuffer = Math.max(0, this._jumpBuffer - dt);
      if (this._body.isGrounded) this._coyote = COYOTE_SEC;
      else this._coyote = Math.max(0, this._coyote - dt);

      // player_falling grace record — BEFORE the landing clamp zeroes velY. A
      // thin/flush stomp zone's enter can coincide with the grounding frame,
      // so the condition also accepts "was falling fast a moment ago". The
      // -2.5 m/s floor keeps slope-walking micro-falls from counting.
      if (!this._body.isGrounded && this._velY < -2.5) this._fellAt = performance.now();

      if (this._jumpBuffer > 0 && this._coyote > 0) {
        // Legacy mapping kept on purpose: peak = jumpHeight × 9.81/20 (the label
        // mismatch is a known, deferred item — fixing it would resize every jump).
        const peak = this._settings.jumpHeight * 9.81 / LEGACY_GRAVITY;
        this._velY = Math.sqrt(2 * GRAVITY_RISE * peak);
        this._jumpArc = true;
        this._squashVel += SQUASH_TAKEOFF;   // stretch off the ground
        this._jumpBuffer = 0;
        this._coyote = 0;
        this._emitSound(this._settings.jumpSound, this._settings.jumpVolume);   // jump takeoff
      } else if (this._body.isGrounded && this._velY <= 0) {
        this._velY = 0;
        this._jumpArc = false;
      } else {
        // A JUMP rises light and falls heavy (same peak + air time as the legacy
        // 20/20 arc); releasing jump while still rising cuts the rise short (hold
        // for height). Launches and walk-off falls stay on LEGACY_GRAVITY.
        let g = LEGACY_GRAVITY;
        if (this._jumpArc) {
          if (this._velY <= 0) g = GRAVITY_FALL;
          else g = (jumpHeld || this._settings.variableJump === false) ? GRAVITY_RISE : GRAVITY_RISE * JUMP_CUT_MULT;
        }
        this._velY -= g * dt;
      }
      dir.y = this._velY * dt;

      // Horizontal launch channel: additive to the input move (walls still block via
      // the KCC solve). Exponential decay — strong on ground so landings kill the
      // slide, gentle in air so an arc carries. Snaps to zero below ~0.2 m/s.
      if (this._extVelX !== 0 || this._extVelZ !== 0) {
        dir.x += this._extVelX * dt;
        dir.z += this._extVelZ * dt;
        const damp = Math.exp((this._body.isGrounded && this._velY <= 0 ? -8 : -1.2) * dt);
        this._extVelX *= damp;
        this._extVelZ *= damp;
        if (this._extVelX * this._extVelX + this._extVelZ * this._extVelZ < 0.04) {
          this._extVelX = this._extVelZ = 0;
        }
      }

      // Moving geometry (Phase 31 / v4.25.1 / v4.29.9) — gated on a mover actually
      // running this frame, so a world without live movers pays nothing.
      let onMover = false;
      if (this._movers?.anyRunning()) {
        // Track which mover (if any) is under the player. Grounded frames refresh
        // it; brief computedGrounded flicker while walking keeps the cached handle
        // alive through the coyote window so the carry never drops a frame.
        if (this._body.isGrounded) {
          const h = this._body.groundBodyHandle();
          this._moverGroundHandle = h !== null && this._movers.carryDelta(h) ? h : null;
        } else if (this._coyote <= 0) {
          this._moverGroundHandle = null;
        }
        // Ride: add the mover's per-frame translation delta to the desired move —
        // the KCC still collision-resolves the combined motion. Translation only.
        if (this._moverGroundHandle !== null) {
          const carry = this._movers.carryDelta(this._moverGroundHandle);
          if (carry) { dir.add(carry); onMover = true; }
        }
        // Push: geometry that swept INTO the capsule since the last step shoves the
        // player out along the contact normal (depenetration read from the step's
        // contact manifolds). Routed through `dir` so walls still block the shove.
        const push = this._body.moverPush(this._movers.isMoverBody);
        if (push.lengthSq() > 0) dir.add(push);
      } else {
        this._moverGroundHandle = null;
      }

      // Ground stick — NEVER while riding a mover: pressing the capsule into a
      // MOVING kinematic ground makes the KCC inject the platform's own motion
      // into its resolve (0×/2× oscillation = stutter + drift, v4.29.9). On a
      // mover, grounded-flicker robustness comes from the coyote window instead.
      if (this._body.isGrounded && this._velY === 0 && !onMover) dir.y = -GROUND_STICK * dt;

      // Stair-stepping is for WALKING; otherwise it is off (see CharacterBody.setAirborne — the
      // round capsule still gives ≈ 0.14m of lip forgiveness). "Walking" is decided physically:
      // real ground under the centre AND not moving upward. NOT from isGrounded/_coyote — both
      // were tried and both lie here: pressing into a ledge face mid-jump grazes its lip and
      // flickers isGrounded TRUE (a 1.75m jump still climbed 2.0m), while pushing into a tall
      // stair drops it FALSE long enough to expire coyote (walking up 0.44m stopped working).
      this._body.setAirborne(this._velY > 0 || !this._body.hasGroundBelow());
      this._body.move(dir);
    }
    const pos = this._body.position;
    this._updateShadow(pos);

    // Land sound (Phase 36 follow-up) — physics-based so it works without an animated
    // model. Gate on air TIME (> COYOTE) so brief grounded-flicker while walking on the
    // ground-stick doesn't count as a landing.
    const feetY = pos.y - (this._body.capsuleHalfHeight + this._body.capsuleRadius);
    // `_velY <= 0`: rising past a ledge, the capsule's round bottom grazes the lip and
    // isGrounded flickers true for a frame (measured twice on one 1m step-up). That is
    // not a landing — without the gate it reset the air timer and the takeoff point mid-jump.
    if (this._body.isGrounded && this._velY <= 0) {
      if (this._airTime > COYOTE_SEC) {
        this._emitSound(this._settings.landSound, this._settings.landVolume);
        // Phase 70 — squash on impact, and report the airborne stretch that just ended.
        this._squashVel -= Math.min(SQUASH_LAND_MAX, -this._lastAirVelY * SQUASH_LAND_GAIN);
        // `drop` is NOT read here: isGrounded turns true ~2 frames before the capsule
        // finishes settling (≈0.1m high after a full jump), and on a ledge lip it
        // turns true before the player is even over the higher surface. The feet
        // are read a few frames later, below.
        if (!Number.isNaN(this._airPeakY)) {
          this._statsPending = {
            height:   this._airPeakY - (pos.y - feetY) - this._airStartY,
            distance: Math.hypot(pos.x - this._airStartX, pos.z - this._airStartZ),
            airTime:  this._airTime,
            startY:   this._airStartY,
            frames:   6,
          };
        }
      }
      this._airTime = 0;
      this._lastAirVelY = 0;
      const pend = this._statsPending;
      if (pend && --pend.frames <= 0) {
        this._bus.emit("character:jump-stats", { height: pend.height, distance: pend.distance, airTime: pend.airTime, drop: feetY - pend.startY });
        this._statsPending = null;
      }
      // Last grounded spot = the takeoff point (FEET height — settled while standing/running).
      this._airStartX = pos.x; this._airStartZ = pos.z; this._airStartY = feetY;
      this._airPeakY = pos.y;
    } else {
      if (this._statsPending) {
        const pend = this._statsPending;
        this._bus.emit("character:jump-stats", { height: pend.height, distance: pend.distance, airTime: pend.airTime, drop: this._airStartY - pend.startY });
        this._statsPending = null;
      }
      this._airTime += dt;
      this._lastAirVelY = this._velY;
      this._airPeakY = Math.max(this._airPeakY, pos.y);   // stays NaN if this stretch was invalidated
    }

    // Footsteps (Phase 36 follow-up) — emit every footstepDistance metres of ACTUAL
    // horizontal travel while grounded and moving (so a treadmill/wall makes no steps).
    // The override (set_footstep action) wins over the authored default — surface swaps.
    const steps = this._footstepOverride ?? this._footstepDefault;
    if (steps.length && this._body.isGrounded && isMoving && !this._climbLadder) {
      const dx = pos.x - this._stepPrevX, dz = pos.z - this._stepPrevZ;
      this._stepAccum += Math.sqrt(dx * dx + dz * dz);
      if (this._stepAccum >= (this._settings.footstepDistance ?? 1.8)) {
        this._stepAccum = 0;
        const id = steps.length > 1 ? steps[Math.floor(Math.random() * steps.length)] : steps[0];
        // Pitch wobble (opt-in): ±FOOTSTEP_WOBBLE of playback rate, so even ONE sample stops
        // sounding like a loop. Applies to surface overrides too (same path).
        const rate = this._settings.footstepPitchWobble ? 1 + (Math.random() * 2 - 1) * FOOTSTEP_WOBBLE : undefined;
        this._emitSound(id, this._settings.footstepVolume, rate);
      }
    } else {
      this._stepAccum = 0;   // reset when stopped/airborne so the next step isn't instant
    }
    this._stepPrevX = pos.x; this._stepPrevZ = pos.z;

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
      if (isMoving && !this._climbLadder && !this._skidding) {   // a skid holds the old facing, then whips round
        const targetYaw = Math.atan2(-faceX, -faceZ);
        let delta = targetYaw - this._modelYaw;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));   // wrap to [-π, π]
        this._modelYaw += delta * Math.min(1, dt * 10);
      }
      this._updatePresentation(dt);   // yaw + lean + squash on the root
      this._modelRoot.visible = (this._settings.cameraMode === "thirdperson");
      this._mixer?.update(dt);
      this._updateAnim(!this._body.isGrounded, isMoving, running);
      if (this._flash) this._updateFlash(dt);
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

  /** Vertical velocity m/s (negative = falling) — the player_falling condition's read. */
  get verticalVelocity(): number { return this._velY; }
  private _fellAt = -Infinity;
  /** ms since the player was last falling faster than 2.5 m/s (Infinity = never). */
  get msSinceFalling(): number { return performance.now() - this._fellAt; }

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
    this._velX = this._velZ = 0;
    this._jumpArc = false;
    this._extVelX = this._extVelZ = 0;   // grabbing a ladder kills launch momentum
    this._scriptAnim = null;             // climb owns the animation from here
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
      this._modelBaseScale = effectiveCharacterScale(this._settings);   // squash multiplies this
      root.scale.setScalar(this._modelBaseScale);
      this._scene.add(root);
      this._modelYaw = this._yaw;
      this._play("idle", true);
    } catch (err) {
      console.warn("CharacterController: failed to load model", err);
    }
  }

  /**
   * Clone every material under the avatar so the flash can tint them safely, and
   * remember each one's resting emissive. Runs once — later flashes reuse the clones.
   * Materials without an `emissive` (MeshBasicMaterial and friends) are skipped
   * rather than special-cased: they'd need their base color mutated, which loses
   * the original tint on any model that reuses one material across body parts.
   */
  private _captureFlashMaterials(): void {
    if (this._flashMats || !this._modelRoot) return;
    const captured: { mat: THREE.Material; emissive: THREE.Color | null; intensity: number }[] = [];
    this._modelRoot.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const cloned = mats.map((m) => {
        const c = m.clone();                       // never mutate the shared source-asset material
        const em = (c as THREE.MeshStandardMaterial).emissive;
        captured.push({
          mat: c,
          emissive: em ? em.clone() : null,
          intensity: (c as THREE.MeshStandardMaterial).emissiveIntensity ?? 1,
        });
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
    });
    this._flashMats = captured;
  }

  /** Pulse the avatar's emissive toward the flash color, then restore on the last frame. */
  private _updateFlash(dt: number): void {
    const f = this._flash;
    if (!f || !this._flashMats) return;
    f.t += dt;
    const done = f.t >= f.dur;
    // Two full pulses over the duration, eased out so the last one is faintest.
    const k = done ? 0
      : Math.abs(Math.sin((f.t / f.dur) * Math.PI * 2)) * (1 - f.t / f.dur);
    for (const e of this._flashMats) {
      if (!e.emissive) continue;
      const em = (e.mat as THREE.MeshStandardMaterial).emissive;
      em.copy(e.emissive).lerp(f.color, k);
      (e.mat as THREE.MeshStandardMaterial).emissiveIntensity = e.intensity + k * 2;
    }
    if (done) this._flash = null;
  }

  /**
   * Phase 70 — avatar yaw + lean + squash, all on the model ROOT. Presentation
   * only: the capsule, the camera and the landing point never see any of it.
   * The root's origin is at the feet, so squash anchors to the ground.
   */
  private _updatePresentation(dt: number): void {
    const root = this._modelRoot!;
    const h = Math.min(dt, 1 / 30);   // spring stability across a frame hitch
    // Squash & stretch: damped spring back to 1, kicked at takeoff / launch / landing.
    this._squashVel += (-SQUASH_STIFFNESS * (this._squash - 1) - SQUASH_DAMPING * this._squashVel) * h;
    this._squash = Math.max(0.6, Math.min(1.35, this._squash + this._squashVel * h));
    const sy = this._squash, sxz = 1 / Math.sqrt(sy);   // volume-preserving
    root.scale.set(this._modelBaseScale * sxz, this._modelBaseScale * sy, this._modelBaseScale * sxz);

    // Lean: forward with speed, roll into the turn (from the avatar's own turn rate).
    let pitch = 0, roll = 0;
    if (!this._climbLadder && dt > 0) {
      const leanMax = Math.max(1, this._settings.runMultiplier ?? 1);   // a little more lean while running
      const speedK = Math.min(leanMax, Math.hypot(this._velX, this._velZ) / (this._settings.moveSpeed || 1));
      pitch = speedK * LEAN_FORWARD;
      // Acceleration along the avatar's forward. The avatar faces the compass angle _modelYaw,
      // i.e. along (−sin, −cos) — the same convention the launch handler uses.
      const ax = (this._velX - this._prevVelX) / dt, az = (this._velZ - this._prevVelZ) / dt;
      const fwdAccel = ax * -Math.sin(this._modelYaw) + az * -Math.cos(this._modelYaw);
      pitch += Math.max(-LEAN_ACCEL_MAX, Math.min(LEAN_ACCEL_MAX, fwdAccel * LEAN_ACCEL));
      if (this._skidding) pitch = SKID_LEAN;   // planted, leaning back against the slide
      let dYaw = this._modelYaw - this._prevModelYaw;
      dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
      if (Math.abs(dYaw) > 1) dYaw = 0;   // a snap (teleport facing, ladder mount), not a turn
      // The model faces +Z, so its right hand is −X and a positive Z-roll tips it
      // RIGHT; turning right is a DEcreasing yaw → negate.
      // Turning at a run leans more than the same turn at a walk (roll ∝ turn rate × speed).
      const rollMax = LEAN_ROLL_MAX * Math.max(1, speedK);
      roll = Math.max(-rollMax, Math.min(rollMax, -(dYaw / dt) * LEAN_ROLL * Math.max(0.5, speedK)));
    }
    this._prevModelYaw = this._modelYaw;
    this._prevVelX = this._velX; this._prevVelZ = this._velZ;
    const k = Math.min(1, dt * LEAN_RATE);
    this._leanPitch += (pitch - this._leanPitch) * k;
    this._leanRoll  += (roll  - this._leanRoll)  * k;
    root.rotation.set(this._leanPitch, this._modelYaw + MODEL_FORWARD_OFFSET, this._leanRoll, "YXZ");
  }

  /** Phase 70 — the landing shadow: a soft dark disc, built once per controller. */
  private _buildShadow(): void {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0,   "rgba(0,0,0,1)");
    grad.addColorStop(0.6, "rgba(0,0,0,0.7)");
    grad.addColorStop(1,   "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),   // unit radius — scaled per frame
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }),
    );
    mesh.raycast = NO_RAYCAST;
    mesh.visible = false;
    this._shadow = mesh;
    this._scene.add(mesh);
  }

  /**
   * Lay the disc on whatever is straight under the player: ONE Rapier ray per
   * frame (not a scene raycast — see PROFILING.md), sensors and the player's own
   * capsule excluded. Enemies are solid colliders, so over a crab the disc sits
   * on its back — the stomp aiming cue. Shrinks + fades with height (see SHADOW_* above).
   */
  private _updateShadow(pos: THREE.Vector3): void {
    const sh = this._shadow;
    if (!sh) return;
    if (this._settings.cameraMode !== "thirdperson") { sh.visible = false; return; }
    this._shadowRay.origin = pos;
    const hit = physicsWorld.world.castRayAndGetNormal(
      this._shadowRay, SHADOW_MAX_DROP, true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this._body.collider,
    );
    if (!hit) { sh.visible = false; return; }
    const n = _tmpNormal.set(hit.normal.x, hit.normal.y, hit.normal.z);
    if (n.lengthSq() < 0.5) n.set(0, 1, 0);   // ray began inside a collider — no usable normal
    const drop = hit.timeOfImpact;
    sh.position.set(pos.x + n.x * SHADOW_LIFT, pos.y - drop + n.y * SHADOW_LIFT, pos.z + n.z * SHADOW_LIFT);
    sh.quaternion.setFromUnitVectors(_AXIS_Z, n);
    const feetUp = Math.max(0, drop - (this._body.capsuleHalfHeight + this._body.capsuleRadius));
    const r = this._body.capsuleRadius * 1.7 * (1 - SHADOW_SHRINK * Math.min(1, feetUp / SHADOW_SHRINK_HEIGHT));
    sh.scale.set(r, r, 1);
    (sh.material as THREE.MeshBasicMaterial).opacity = SHADOW_OPACITY * (1 - SHADOW_FADE * Math.min(1, feetUp / SHADOW_FADE_HEIGHT));
    sh.visible = true;
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
    this._crossfadeTo(this._mixer.clipAction(clip), loop, speed);
    this._currentClipObj = clip;
    this._currentClip    = intent;
  }

  /**
   * Crossfade the avatar to `next`. `mixer.clipAction(clip)` returns ONE action per
   * clip, so two intents that resolve to the same clip share it (platfrom-obby maps
   * WALK to the "Run" clip, and RUN auto-matches "Run" too). Crossfading an action
   * with ITSELF fades it in and straight back out: weight 0, nothing playing, the
   * skeleton drops to its bind pose (user report, v4.81.1). Same action = keep it
   * playing and only retime/reloop it (restarting it if it was a finished one-shot).
   */
  private _crossfadeTo(next: THREE.AnimationAction, loop: boolean, speed: number): void {
    const same = next === this._currentAction;
    if (!same || !next.isRunning()) next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.timeScale = speed;
    if (same) { next.play(); return; }
    next.fadeIn(0.15).play();
    this._currentAction?.fadeOut(0.15);
    this._currentAction = next;
  }

  // Has the current one-shot reached its end? (Only meaningful for a clamped LoopOnce.)
  private _animDone(): boolean {
    const a = this._currentAction, c = this._currentClipObj;
    return !!a && !!c && a.time >= c.duration - 0.02;
  }

  // Play an exact clip by NAME (script override) — unlike _play's intent lookup.
  private _playByName(name: string, loop: boolean): void {
    if (!this._mixer) return;
    const lc = name.toLowerCase();
    const clip = this._modelAnimations.find(c => c.name === name)
      ?? this._modelAnimations.find(c => c.name.toLowerCase() === lc)
      ?? this._modelAnimations.find(c => c.name.toLowerCase().includes(lc));
    if (!clip) {
      console.warn(`CharacterController: no clip "${name}" on the avatar — available: [${this._modelAnimations.map(c => c.name).join(", ")}]`);
      this._scriptAnim = null;
      return;
    }
    this._crossfadeTo(this._mixer.clipAction(clip), loop, 1);
    this._currentClipObj = clip;
    this._currentClip    = `script:${clip.name}`;   // never collides with locomotion intents
  }

  private _clearScriptAnim(): void {
    if (!this._scriptAnim) return;
    this._scriptAnim = null;
    if (this._climbLadder) return;   // the climb branch owns the animation
    this._animPhase = "ground";      // locomotion re-resolves (idle/walk/air) next frame
  }

  /**
   * Warp-time animation reset (respawn/teleport): stop every action and start
   * idle at FULL weight — no crossfade. Blending out of a clamped death pose
   * or the fall loop takes 0.15s+, which outlives the respawn fade and shows
   * the avatar "getting up" / still falling after the fade-in. The locomotion
   * machine takes over normally from idle next frame.
   */
  private _snapAnimToIdle(): void {
    if (!this._mixer) return;
    this._mixer.stopAllAction();
    this._currentAction = null;
    this._currentClipObj = null;
    this._currentClip = "";
    this._animPhase = "ground";
    const clip = this._clipFor("idle");
    if (!clip) return;
    const a = this._mixer.clipAction(clip);
    a.reset();
    a.setLoop(THREE.LoopRepeat, Infinity);
    a.timeScale = 1;
    a.setEffectiveWeight(1);
    a.play();
    this._currentAction  = a;
    this._currentClipObj = clip;
    this._currentClip    = "idle";
  }

  // Locomotion state machine: ground (idle/walk) → jump takeoff → air-idle loop → land → ground.
  // Each stage falls back gracefully if the model lacks that clip.
  private _updateAnim(airborne: boolean, isMoving: boolean, running = false): void {
    if (!this._mixer) return;
    // Script override. LOOPING clips (ambient emotes) cancel the moment the player
    // moves — no moonwalking. One-shots and holds play through movement: they're
    // deliberate beats (death pose, hit react) usually fired WHILE a key is held,
    // and a move-cancel would kill them the next frame. A finished one-shot (not
    // hold) returns to locomotion; "__auto__"/warp/climb clear everything.
    if (this._scriptAnim) {
      if (this._scriptAnim.loop && isMoving) this._clearScriptAnim();
      else if (!this._scriptAnim.loop && !this._scriptAnim.hold && this._animDone()) this._clearScriptAnim();
      else return;
    }
    switch (this._animPhase) {
      case "ground":
        if (airborne) this._enterJump();
        else this._playGround(isMoving, running);
        break;
      case "jump":                                        // takeoff one-shot
        if (!airborne) this._enterLand(isMoving, running);
        else if (this._animDone() && this._has("jump_idle")) {
          this._play("jump_idle", true, this._jumpSpeed()); // still airborne past takeoff → loop air pose
          this._animPhase = "airidle";
        }
        break;
      case "airidle":
        if (!airborne) this._enterLand(isMoving, running);
        break;
      case "land":                                        // landing one-shot
        if (airborne) this._enterJump();                  // jumped again mid-landing
        else if (isMoving || this._animDone()) {            // moving cuts the landing short (see _enterLand)
          this._playGround(isMoving, running);
          this._animPhase = "ground";
        }
        break;
      case "climb":                                       // exits via _exitClimb
        this._play("climb", true);                        // no-op once playing; retries if the model loaded late
        break;
    }
  }

  /** Ground locomotion intent — `run` only when the model actually has a run clip (else walk). */
  private _groundClip(isMoving: boolean, running: boolean): string {
    return !isMoving ? "idle" : running && this._has("run") ? "run" : "walk";
  }

  /** Play idle/walk/run. When RUN resolves to the very clip WALK uses (an author's WALK
   *  override, or a model with no run clip), play it faster by the run multiplier so
   *  running still reads as running. */
  private _playGround(isMoving: boolean, running: boolean): void {
    const intent = this._groundClip(isMoving, running);
    const sameAsWalk = running && this._clipFor(intent) === this._clipFor("walk");
    const speed = sameAsWalk ? (this._settings.runMultiplier ?? 1) : 1;
    this._play(intent, true, speed);
    // _play no-ops when the intent is unchanged (a model with no run clip stays on "walk"
    // through a walk → run change), so retime the live loop here.
    if (this._currentAction && this._currentClip === intent) this._currentAction.timeScale = speed;
  }

  private _jumpSpeed(): number { return this._settings.jumpAnimSpeed ?? 1; }

  /** Fire a locomotion one-shot (jump/land/footstep) — a non-positional SFX-bus sound. */
  private _emitSound(id?: string, volume?: number, rate?: number): void {
    if (id) this._bus.emit("audio:play", { id, volume, rate });
  }

  private _enterJump(): void {
    const s = this._jumpSpeed();
    if      (this._has("jump"))      { this._play("jump", false, s);     this._animPhase = "jump"; }
    else if (this._has("jump_idle")) { this._play("jump_idle", true, s); this._animPhase = "airidle"; }
    else                             { this._animPhase = "airidle"; }   // no jump clips: keep current
  }

  private _enterLand(isMoving: boolean, running: boolean): void {
    // Land SOUND is driven physics-side in update() (mixer-independent), not here.
    // The landing one-shot is for STANDING landings only. Landing with a direction held
    // used to play it to the end first — 0.37s of frozen legs while travelling 2.2m at
    // walk speed (user report, v4.81.3). Moving = straight back to walk/run; the Phase 70
    // squash still marks the impact.
    if (!isMoving && this._has("jump_land")) { this._play("jump_land", false, this._jumpSpeed()); this._animPhase = "land"; }
    else                                     { this._playGround(isMoving, running); this._animPhase = "ground"; }
  }

  dispose(): void {
    this._exitClimb();
    this._offTeleport?.();    this._offTeleport   = null;
    this._offSavePos?.();     this._offSavePos    = null;
    this._offLaunch?.();      this._offLaunch     = null;
    this._offScriptAnim?.();  this._offScriptAnim = null;
    this._offFlash?.();       this._offFlash      = null;
    this._offFootstep?.();    this._offFootstep   = null;
    // The flash clones are ours alone (the source asset's materials were never touched).
    for (const e of this._flashMats ?? []) e.mat.dispose();
    this._flashMats = null; this._flash = null;
    this._offLadderEnter?.(); this._offLadderEnter = null;
    this._offLadderExit?.();  this._offLadderExit  = null;
    this._offLadderGone?.();  this._offLadderGone  = null;
    this._offLadderMoved?.(); this._offLadderMoved = null;
    if (this._modelRoot) this._scene.remove(this._modelRoot);
    if (this._shadow) {
      this._scene.remove(this._shadow);
      const m = this._shadow.material as THREE.MeshBasicMaterial;
      m.map?.dispose(); m.dispose(); this._shadow.geometry.dispose();
      this._shadow = null;
    }
    this._mixer?.stopAllAction();
    if (this._interactTargetId) this._bus.emit("character:interact-range", null);
    this._body.dispose();
  }
}
