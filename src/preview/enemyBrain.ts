/**
 * Phase 62 — the enemy AI's PURE decision core. Plain data in → intents out.
 *
 * Deliberately self-contained: no three.js, no physics, no engine imports —
 * it must run headlessly under Deno (`deno task test:ai`). EnemyAI is the
 * adapter that feeds it senses (distances from rays/player position) and
 * executes its intents (kinematic writes, clips, trigger fires).
 *
 * Behavior is the shipped phase-61 machine, verbatim: detect with a vertical
 * gap, give-up hysteresis + leash with walk-home, attack windows with a
 * damage moment, cooldown jitter, counter-seeded feints, orbit-biased
 * approach. Numbers live here so tests and the adapter share one source.
 */

export const MAX_VERTICAL_GAP = 3.5;  // m between player center and enemy feet
export const ORBIT_MAX_RAD    = 1.1;  // ~63° max orbit bias at variation 1
export const ORBIT_PERIOD_SEC = 3.2;
export const FEINT_CHANCE     = 0.3;  // × variation, per attack
export const ARRIVE_EPS       = 0.25; // "back at post" distance
export const HIT_RANGE_SLACK  = 1.3;  // bite lands within attackRange × this
export const OVER_TOP_SLACK   = 0.35; // player above height+this = out of lunge reach

export type BrainState = "idle" | "chase" | "attack" | "return";

/** Resolved numeric params (defaults applied by the adapter). */
export interface BrainParams {
  detectRadius: number; giveUpRadius: number; attackRange: number;
  attackCooldown: number; damageMoment: number; variation: number;
  leashRadius: number;
}

/** Mutable per-enemy decision state (owned by the adapter's rec). */
export interface BrainMem {
  state: BrainState;
  cooldownUntil: number;
  attackAt: number;
  attackDur: number;
  feinting: boolean;
  damageDone: boolean;
  attackNum: number;
  orbitDir: 1 | -1;
  orbitPhase: number;
}

/** Senses for one tick, precomputed by the adapter. */
export interface BrainSenses {
  distXZ: number;      // horizontal enemy→player distance
  dyOk: boolean;       // vertical gap within MAX_VERTICAL_GAP
  overTop: boolean;    // player above the enemy's body (lunge can't reach)
  fromPost: number;    // horizontal distance from the authored post
  homeDist: number;    // distance to post (return steering)
  clock: number;       // adapter's AI clock, seconds
  attackClipDur: number | null;  // duration of the attack clip if known
}

export interface BrainIntent {
  state: BrainState;
  fire?: "on_player_detected" | "on_player_lost";
  /** Start the attack performance this tick (play clip, face player). */
  attackStart?: boolean;
  /** The damage moment passed this tick: apply damage + on_enemy_attack IF hit. */
  attackLanded?: boolean;
  /** Movement intent: none | toward player (with orbit bias) | toward post. */
  move: "none" | "approach" | "home";
  /** Radians of orbit bias to apply to the approach direction (0 = beeline). */
  orbitBias: number;
  /** Face the player this tick (attack + in-range waiting). */
  facePlayer: boolean;
}

/** Deterministic per-attack feint roll — counter-seeded, never the clock
 *  (a clock-seeded sin resonates with the attack cadence; caught live). */
export function feintRoll(orbitPhase: number, attackNum: number, variation: number): boolean {
  const roll = Math.abs(Math.sin((orbitPhase + attackNum) * 43758.5453)) % 1;
  return variation > 0 && roll < FEINT_CHANCE * variation;
}

/** Cooldown jitter multiplier (packs shouldn't metronome). Bounded [1-0.4v, 1+0.4v]. */
export function cooldownJitter(clock: number, orbitPhase: number, variation: number): number {
  return 1 + variation * 0.4 * Math.sin(clock * 7.77 + orbitPhase);
}

/** The orbit bias angle for an approach at `clock`. */
export function orbitBias(clock: number, mem: Pick<BrainMem, "orbitDir" | "orbitPhase">, variation: number): number {
  return Math.sin(clock * (Math.PI * 2 / ORBIT_PERIOD_SEC) + mem.orbitPhase)
    * variation * ORBIT_MAX_RAD * mem.orbitDir;
}

/**
 * One decision tick. Mutates `mem` (state/attack bookkeeping) and returns the
 * intent for the adapter to execute. Pure w.r.t. everything else.
 */
export function tick(mem: BrainMem, p: BrainParams, s: BrainSenses): BrainIntent {
  const out: BrainIntent = { state: mem.state, move: "none", orbitBias: 0, facePlayer: false };

  // ── transitions ──
  if (mem.state === "idle" || mem.state === "return") {
    if (s.distXZ <= p.detectRadius && s.dyOk && s.fromPost <= p.leashRadius) {
      mem.state = "chase";
      out.fire = "on_player_detected";
    }
  }
  if (mem.state === "chase") {
    if (s.distXZ > p.giveUpRadius || !s.dyOk || s.fromPost > p.leashRadius) {
      mem.state = "return";
      out.fire = "on_player_lost";
    } else if (s.distXZ <= p.attackRange && s.clock >= mem.cooldownUntil) {
      mem.state = "attack";
      mem.attackAt = s.clock;
      mem.damageDone = false;
      mem.attackNum++;
      mem.feinting = feintRoll(mem.orbitPhase, mem.attackNum, p.variation);
      mem.attackDur = s.attackClipDur || 0.8;
      out.attackStart = true;
    }
  }

  // ── attack performance ──
  if (mem.state === "attack") {
    out.facePlayer = true;
    if (!mem.damageDone && s.clock >= mem.attackAt + p.damageMoment) {
      mem.damageDone = true;
      if (!mem.feinting && s.distXZ <= p.attackRange * HIT_RANGE_SLACK && s.dyOk && !s.overTop) {
        out.attackLanded = true;
      }
    }
    if (s.clock >= mem.attackAt + mem.attackDur) {
      mem.state = "chase";
      mem.cooldownUntil = s.clock + p.attackCooldown * cooldownJitter(s.clock, mem.orbitPhase, p.variation);
    }
    out.state = mem.state;
    return out;   // no locomotion during the bite
  }

  // ── locomotion intent ──
  if (mem.state === "chase") {
    if (s.distXZ > p.attackRange * 0.9) {
      out.move = "approach";
      out.orbitBias = orbitBias(s.clock, mem, p.variation);
    } else {
      out.facePlayer = true;   // in range, waiting on cooldown
    }
  } else if (mem.state === "return") {
    if (s.homeDist <= ARRIVE_EPS) mem.state = "idle";
    else out.move = "home";
  }

  out.state = mem.state;
  return out;
}
