/**
 * Phase 62 — headless tests for the enemy AI's pure decision core.
 * Run: `deno task test:ai` (no browser, no three.js, no physics).
 *
 * Covers the invariants the shipped crab depends on: detect gating
 * (radius + vertical gap + leash), give-up hysteresis, return-to-post
 * arrival, attack cadence with bounded cooldown jitter, damage-window
 * semantics (in-range ∧ not-feint ∧ not-over-top ∧ dy-ok, exactly once),
 * and the counter-seeded feint distribution (the clock-resonance bug —
 * every bite feinting — stays dead).
 */

import {
  tick, feintRoll, cooldownJitter, orbitBias,
  ARRIVE_EPS, FEINT_CHANCE, HIT_RANGE_SLACK, ORBIT_MAX_RAD,
  type BrainMem, type BrainParams, type BrainSenses,
} from "../src/preview/enemyBrain.ts";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) { passed++; return; }
  failed++;
  console.error(`  ✗ ${msg}`);
}

// Crab-flavored params (EnemyAI's resolution defaults are in this ballpark).
const P: BrainParams = {
  detectRadius: 6, giveUpRadius: 9, attackRange: 1.6,
  attackCooldown: 1.2, damageMoment: 0.4, variation: 1, leashRadius: 12,
};

function freshMem(): BrainMem {
  return {
    state: "idle", cooldownUntil: 0, attackAt: 0, attackDur: 0,
    feinting: false, damageDone: false, attackNum: 0,
    orbitDir: 1, orbitPhase: 0.7,
  };
}

function senses(over: Partial<BrainSenses>): BrainSenses {
  return {
    distXZ: 3, dyOk: true, overTop: false, fromPost: 1, homeDist: 1,
    clock: 0, attackClipDur: 0.8, ...over,
  };
}

// ── detect gating ──
{
  let m = freshMem();
  let out = tick(m, P, senses({ distXZ: 7 }));
  assert(out.state === "idle" && !out.fire, "out of radius: stays idle");

  m = freshMem();
  out = tick(m, P, senses({ distXZ: 4, dyOk: false }));
  assert(out.state === "idle" && !out.fire, "vertical gap too large: stays idle");

  m = freshMem();
  out = tick(m, P, senses({ distXZ: 4, fromPost: 13 }));
  assert(out.state === "idle" && !out.fire, "beyond leash: no detect");

  m = freshMem();
  out = tick(m, P, senses({ distXZ: 4 }));
  assert(out.state === "chase" && out.fire === "on_player_detected",
    "in radius + dy ok + inside leash: chase + on_player_detected");
}

// ── give-up hysteresis + leash ──
{
  const m = freshMem();
  tick(m, P, senses({ distXZ: 4 }));                       // → chase
  let out = tick(m, P, senses({ distXZ: 7.5 }));           // between detect and give-up
  assert(out.state === "chase" && !out.fire, "hysteresis band: keeps chasing");
  out = tick(m, P, senses({ distXZ: 9.5 }));
  assert(out.state === "return" && out.fire === "on_player_lost",
    "past give-up radius: return + on_player_lost");

  const m2 = freshMem();
  tick(m2, P, senses({ distXZ: 4 }));
  out = tick(m2, P, senses({ distXZ: 4, dyOk: false }));
  assert(out.state === "return", "vertical gap opens mid-chase: return");

  const m3 = freshMem();
  tick(m3, P, senses({ distXZ: 4 }));
  out = tick(m3, P, senses({ distXZ: 4, fromPost: 12.5 }));
  assert(out.state === "return", "dragged past leash: return");
}

// ── return-to-post arrival ──
{
  const m = freshMem();
  m.state = "return";
  let out = tick(m, P, senses({ distXZ: 20, homeDist: 3 }));
  assert(out.state === "return" && out.move === "home", "far from post: walks home");
  out = tick(m, P, senses({ distXZ: 20, homeDist: ARRIVE_EPS - 0.01 }));
  assert(out.state === "idle" && out.move === "none", "within ARRIVE_EPS: settles idle");
}

// ── chase locomotion intent ──
{
  const m = freshMem();
  tick(m, P, senses({ distXZ: 4 }));
  m.cooldownUntil = 999;                                    // keep it out of attack
  let out = tick(m, P, senses({ distXZ: 4, clock: 1 }));
  assert(out.move === "approach", "outside 0.9×range: approaches");
  assert(Math.abs(out.orbitBias) <= ORBIT_MAX_RAD * P.variation + 1e-9,
    "orbit bias bounded by ORBIT_MAX_RAD × variation");
  out = tick(m, P, senses({ distXZ: 1.0, clock: 1 }));
  assert(out.move === "none" && out.facePlayer,
    "in range on cooldown: holds and faces the player");
}

// ── attack window: start, single damage moment, no locomotion, recovery ──
{
  const m = freshMem();
  tick(m, P, senses({ distXZ: 4 }));                       // → chase
  let out = tick(m, P, senses({ distXZ: 1.0, clock: 0.1 }));
  assert(out.state === "attack" && out.attackStart === true, "in range off cooldown: attack starts");
  m.feinting = false;                                       // pin the roll for the window test

  out = tick(m, P, senses({ distXZ: 1.0, clock: 0.1 + P.damageMoment - 0.05 }));
  assert(!out.attackLanded && out.move === "none" && out.facePlayer,
    "before damage moment: no landing, no locomotion, faces player");

  out = tick(m, P, senses({ distXZ: 1.0, clock: 0.1 + P.damageMoment + 0.02 }));
  assert(out.attackLanded === true, "damage moment passes in range: attack lands");
  out = tick(m, P, senses({ distXZ: 1.0, clock: 0.1 + P.damageMoment + 0.04 }));
  assert(!out.attackLanded, "damage applies exactly once per attack");

  out = tick(m, P, senses({ distXZ: 1.0, clock: 0.1 + m.attackDur + 0.01 }));
  assert(out.state === "chase", "attack duration elapses: back to chase");
  const jitterMul = (m.cooldownUntil - (0.1 + m.attackDur + 0.01)) / P.attackCooldown;
  assert(jitterMul >= 1 - 0.4 * P.variation - 1e-9 && jitterMul <= 1 + 0.4 * P.variation + 1e-9,
    `cooldown jitter within [1−0.4v, 1+0.4v] (got ${jitterMul.toFixed(3)})`);
}

// ── damage-window whiffs: feint / range / over-top / vertical gap ──
{
  const cases: Array<[string, Partial<BrainSenses>, boolean]> = [
    ["feinting", {}, true],
    ["out of slack range", { distXZ: P.attackRange * HIT_RANGE_SLACK + 0.05 }, false],
    ["player over top", { overTop: true }, false],
    ["vertical gap open", { dyOk: false }, false],
  ];
  for (const [name, sOver, forceFeint] of cases) {
    const m = freshMem();
    tick(m, P, senses({ distXZ: 4 }));
    tick(m, P, senses({ distXZ: 1.0, clock: 0.1 }));        // attack starts
    m.feinting = forceFeint;
    const out = tick(m, P, senses({ distXZ: 1.0, clock: 0.1 + P.damageMoment + 0.02, ...sOver }));
    assert(!out.attackLanded, `${name}: bite whiffs`);
    assert(m.damageDone, `${name}: damage window still consumed`);
  }
}

// ── cooldown jitter bounds + variation 0 ──
{
  let ok = true;
  for (let c = 0; c < 200; c++) {
    const j = cooldownJitter(c * 0.137, 0.7, 1);
    if (j < 0.6 - 1e-9 || j > 1.4 + 1e-9) ok = false;
  }
  assert(ok, "cooldownJitter bounded over 200 samples at variation 1");
  assert(cooldownJitter(3.7, 0.7, 0) === 1, "variation 0: no jitter");
  assert(orbitBias(1.3, { orbitDir: 1, orbitPhase: 0.7 }, 0) === 0, "variation 0: no orbit bias");
  assert(!feintRoll(0.7, 5, 0), "variation 0: never feints");
}

// ── feint distribution over 100 attacks (no cadence resonance) ──
{
  const N = 100;
  const rolls: boolean[] = [];
  for (let i = 1; i <= N; i++) rolls.push(feintRoll(0.7, i, 1));
  const frac = rolls.filter(Boolean).length / N;
  assert(frac > FEINT_CHANCE - 0.15 && frac < FEINT_CHANCE + 0.15,
    `feint fraction ≈ FEINT_CHANCE (got ${frac.toFixed(2)})`);
  let maxRun = 0, run = 0;
  let prev: boolean | null = null;
  for (const r of rolls) {
    run = r === prev ? run + 1 : 1;
    prev = r;
    maxRun = Math.max(maxRun, run);
  }
  assert(maxRun < 15, `no resonance: longest same-outcome run ${maxRun} < 15`);

  // Full-machine version of the same check: repeated attack cycles at a
  // realistic cadence must not feint (or not-feint) forever.
  const m = freshMem();
  tick(m, P, senses({ distXZ: 4 }));
  const feints: boolean[] = [];
  let clock = 0;
  const dt = 1 / 60;
  while (feints.length < 60 && clock < 600) {
    clock += dt;
    const out = tick(m, P, senses({ distXZ: 1.0, clock }));
    if (out.attackStart) feints.push(m.feinting);
  }
  assert(feints.length === 60, "60 attack cycles complete inside the sim budget");
  assert(feints.some(f => f) && feints.some(f => !f),
    "in-machine cadence: both feints and real bites occur");
}

if (failed === 0) {
  console.log(`enemyBrain: all ${passed} assertions passed`);
} else {
  console.error(`enemyBrain: ${failed} FAILED, ${passed} passed`);
  Deno.exit(1);
}
