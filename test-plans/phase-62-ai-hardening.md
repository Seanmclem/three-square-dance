# Phase 62 — Enemy AI hardening (acceptance)

Verified 2026-08-18 against `plans/phase-62-ai-hardening.md`. Constraint for
the whole phase: **zero behavior change** — the browser pass re-runs the
phase-61 acceptance motions on the live crab (`obj_e043c8bb`, platfrom-obby)
and must reproduce them exactly.

## Headless — `deno task test:ai`

- [x] Runs with no browser, no three.js, no physics (~50ms); **35/35
      assertions pass**.
- [x] Detect gating: out-of-radius stays idle; vertical gap blocks detect;
      beyond-leash blocks detect; in-radius + dy-ok + inside-leash →
      chase + `on_player_detected`.
- [x] Hysteresis: distance between detect and give-up keeps chasing; past
      give-up → return + `on_player_lost`; dy-gap or leash break mid-chase →
      return.
- [x] Return: walks home until within `ARRIVE_EPS`, then settles idle.
- [x] Chase locomotion: approaches outside 0.9×range with orbit bias
      bounded by `ORBIT_MAX_RAD × variation`; in range on cooldown holds
      still and faces the player.
- [x] Attack window: starts in range off cooldown; no locomotion during the
      bite; damage moment fires **exactly once**; recovery re-arms the
      cooldown with jitter inside [1 − 0.4v, 1 + 0.4v].
- [x] Whiffs (window consumed, no landing): feint, beyond
      `attackRange × HIT_RANGE_SLACK`, player over top, vertical gap open.
- [x] Variation 0: no jitter, no orbit bias, never feints.
- [x] Feint distribution: 100 counter-seeded rolls ≈ `FEINT_CHANCE`
      (max same-outcome run < 15 — the clock-resonance bug stays dead);
      full-machine cadence over 60 attack cycles yields both feints and
      real bites.

## Browser — deterministic stepping (frozen shell tab, TESTING.md §3)

All via `__stepN` (movers → enemyAI → physics → objectPlacer, dt 1/60):

- [x] Detect + chase: player teleported 4m out → chase with `Walk` clip;
      approach closes 4.0 → 1.35m; `Bite_Front` attacks on cadence with
      `Idle` holds between cooldowns.
- [x] Bite lands: at reachable height the first non-feint attack takes
      Hearts 3 → 2.
- [x] Over-top whiff: player directly above the crab — 4 attacks, zero
      damage.
- [x] Leash return: player flees past give-up → return → idle **0.225m**
      from post (< ARRIVE_EPS 0.25).
- [x] Script-clip freeze (the dance-trigger path): `object:play-animation`
      Dance/hold → `hasScriptClip` true, `currentClip` nulled, **zero
      movement** for a sim-second, `__aiRises` empty (floating-crab
      tripwire silent); `__auto__` release → chase resumes with `Walk`
      and real displacement.

## Animation arbiter (no behavior change, new refusals enforced)

- [x] While a script clip holds the channel: `aiPlay` refused and
      `setAutoPlay` refused (previously setAutoPlay could stomp a held
      clip) — `hasScriptClip` stays true through both.
- [x] `preview:stop` clears all channels; per-object dispose clears its
      channel.

## Transform watchdog (dev shells only)

- [x] Silent through the entire normal verification run above.
- [x] Provocation: forcing the crab's dormant `aiDriven` mover entry
      `running = true` for 5 stepped frames produces **exactly one** warn —
      `[transformWatchdog] "obj_e043c8bb" transform written by both
      MoverSystem and EnemyAI in the same frame` — i.e. the v4.76.8
      floating-crab bug is now one console line on first occurrence.

## Regression guards

- [x] `npm run typecheck` clean after every stage.
- [x] `public/games/**` untouched by the verification session (git clean
      before and after).
