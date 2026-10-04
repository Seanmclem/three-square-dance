import * as THREE from "three";

/** Which clip a move plays: null = none (the model has nothing for it). */
export type MoveResolver = (move: string) => THREE.AnimationClip | null;

/**
 * Phase 86: the one piece that plays a character's animations. Drivers (the player's
 * CharacterController, later EnemyAI and NPCs) decide WHICH move; this owns the mixer,
 * the crossfades and the script override, so every driver behaves the same.
 *
 * Moves are names ("idle", "walk", "jump_land" …) resolved to clips by `resolve` (the
 * player's animClips overrides + name match today; a character's moves list later).
 */
export class CharacterAnimator {
  readonly mixer: THREE.AnimationMixer;
  private _current = "";                                   // the playing move, "script:<clip>" for a script clip
  private _action: THREE.AnimationAction | null = null;
  private _clip:   THREE.AnimationClip  | null = null;
  // Script override (play_animation on this character): LOOPING clips cancel when the
  // character moves; one-shots and holds play through movement; a finished one-shot
  // (not hold) hands back to the driver.
  private _script: { name: string; loop: boolean; hold: boolean } | null = null;

  constructor(
    readonly root: THREE.Object3D,
    readonly clips: THREE.AnimationClip[],
    private readonly _resolve: MoveResolver,
    private readonly _label = "character",
  ) {
    this.mixer = new THREE.AnimationMixer(root);
  }

  /** The playing move ("" when nothing is). */
  get current(): string { return this._current; }
  get currentAction(): THREE.AnimationAction | null { return this._action; }

  clipFor(move: string): THREE.AnimationClip | null { return this._resolve(move); }
  has(move: string): boolean { return this._resolve(move) != null; }

  update(dt: number): void { this.mixer.update(dt); }

  /** Crossfade to a move. No-op when it's already the playing move, or it has no clip.
   *  `loop` false = a one-shot that clamps on its last frame; `speed` scales the rate. */
  play(move: string, loop: boolean, speed = 1): void {
    if (move === this._current) return;
    const clip = this._resolve(move);
    if (!clip) return;
    this._crossfadeTo(this.mixer.clipAction(clip), loop, speed);
    this._clip = clip;
    this._current = move;
  }

  /** Retime the playing move (only if it is `move`). */
  setSpeed(move: string, speed: number): void {
    if (this._action && this._current === move) this._action.timeScale = speed;
  }

  /** Has the current one-shot reached its end? (Only meaningful for a clamped LoopOnce.) */
  done(): boolean {
    const a = this._action, c = this._clip;
    return !!a && !!c && a.time >= c.duration - 0.02;
  }

  /**
   * Crossfade to `next`. `mixer.clipAction(clip)` returns ONE action per clip, so two
   * moves that resolve to the same clip share it (platfrom-obby maps WALK to the "Run"
   * clip, and RUN auto-matches "Run" too). Crossfading an action with ITSELF fades it in
   * and straight back out: weight 0, nothing playing, the skeleton drops to its bind pose
   * (user report, v4.81.1). Same action = keep it playing and only retime / reloop it
   * (restarting it if it was a finished one-shot).
   */
  private _crossfadeTo(next: THREE.AnimationAction, loop: boolean, speed: number): void {
    const same = next === this._action;
    if (!same || !next.isRunning()) next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.timeScale = speed;
    if (same) { next.play(); return; }
    next.fadeIn(0.15).play();
    this._action?.fadeOut(0.15);
    this._action = next;
  }

  // ── Script override ─────────────────────────────────────────────────────────

  get scripted(): boolean { return this._script !== null; }

  /** Play an exact clip by NAME for a script (exact, then case-insensitive, then "contains").
   *  False (and a console note listing the clips) when the model has no such clip. */
  playScript(name: string, loop: boolean, hold: boolean): boolean {
    const lc = name.toLowerCase();
    const clip = this.clips.find(c => c.name === name)
      ?? this.clips.find(c => c.name.toLowerCase() === lc)
      ?? this.clips.find(c => c.name.toLowerCase().includes(lc));
    if (!clip) {
      console.warn(`${this._label}: no clip "${name}" on the model — available: [${this.clips.map(c => c.name).join(", ")}]`);
      this._script = null;
      return false;
    }
    this._script = { name: clip.name, loop, hold };
    this._crossfadeTo(this.mixer.clipAction(clip), loop, 1);
    this._clip = clip;
    this._current = `script:${clip.name}`;   // never collides with a move name
    return true;
  }

  /** Drop the script override (the driver re-picks its move next frame). */
  clearScript(): void { this._script = null; }

  /**
   * Does a script clip still own the character this frame? Applies the rules: a looping
   * clip ends when the character moves, a finished one-shot (not hold) ends by itself.
   * Returns false (and clears it) once it has ended.
   */
  scriptOwns(isMoving: boolean): boolean {
    const s = this._script;
    if (!s) return false;
    if ((s.loop && isMoving) || (!s.loop && !s.hold && this.done())) { this._script = null; return false; }
    return true;
  }

  /**
   * Warp-time reset (respawn / teleport): stop every action and start `move` at FULL
   * weight, no crossfade. Blending out of a clamped death pose or the fall loop takes
   * 0.15 s+, which outlives the respawn fade and shows the avatar "getting up" / still
   * falling after the fade-in.
   */
  snapTo(move: string): void {
    this.mixer.stopAllAction();
    this._action = null;
    this._clip = null;
    this._current = "";
    const clip = this._resolve(move);
    if (!clip) return;
    const a = this.mixer.clipAction(clip);
    a.reset();
    a.setLoop(THREE.LoopRepeat, Infinity);
    a.timeScale = 1;
    a.setEffectiveWeight(1);
    a.play();
    this._action = a;
    this._clip = clip;
    this._current = move;
  }

  stopAll(): void { this.mixer.stopAllAction(); }
}
