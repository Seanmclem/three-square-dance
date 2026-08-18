# Phase 62 — Enemy AI hardening (before the next AI feature)

> User concern (2026-08-18): "is this enemy/ai code pretty solid or kind of
> sloppy? … I worry it could continue to have more issues especially as I try
> to expand what it can do." Assessment agreed: the state machine's logic is
> solid (zero logic bugs); all five post-ship bugs lived at INTEGRATION
> SEAMS with implicit ownership conventions — mesh transforms (EnemyAI vs
> MoverSystem vs script freezes → the floating crab), the animation mixer
> (three writers coordinated by scattered booleans → death-anim override,
> post-dance drift), and physics-ray exclusions (→ the bounce-ride). This
> phase turns those conventions into enforced structure BEFORE new behaviors
> (patrol, flee, ranged) multiply the seam surface. No behavior changes.

## Changes

1. **Pure decision core — `src/preview/enemyBrain.ts` (new).** The state
   machine's decisions (transitions, movement intent, attack windows, feint
   roll, orbit bias) extracted as a self-contained pure module: plain data
   in (state, distances, params, clock, per-enemy seeds) → intents out
   ({nextState, fire?: trigger, move?: dir bias, attack?: {start/damage}}).
   NO three.js / physics / engine imports, so it runs headlessly under Deno.
   `EnemyAI` becomes the adapter: senses (rays, player position) in, intents
   executed (kinematic writes, clips, trigger fires) out.
2. **Per-state update methods.** `EnemyAI.update`'s ~100-line interleaved
   body splits into `_tickIdle/_tickChase/_tickAttack/_tickReturn` driven by
   the brain — new states become additive methods, not new branches woven
   through one function.
3. **Animation priority arbiter (ObjectPlacer).** Replace the flag pile
   (`_scriptClip` set + `_previewingId` interplay + aiPlay's refusal check)
   with one per-object channel: `{ priority: "script" > "aiOneShot" >
   "aiLoop" > "autoplay", clip }`. A play request below the current
   priority is refused; ending a level falls through to the next. Public
   API (`previewClip`/`stopPreview`/`aiPlay`/`hasScriptClip`/`setAutoPlay`)
   unchanged, reimplemented over the arbiter; the editor clip-preview UI
   keeps its global single-slot eviction semantics.
4. **Transform-ownership watchdog — `src/world/transformWatchdog.ts`
   (new, dev-gated).** Each system that writes an entity mesh transform
   reports `(entityId, writerName)` per frame; two DIFFERENT writers on one
   entity in one frame → `console.warn` once per (entity, pair). Reporters:
   `MoverSystem._applyPose`, `EnemyAI._applyPose`, ObjectPlacer's
   `object:updated` transform patch. The floating crab would have been one
   console line ("obj_e043c8bb written by MoverSystem+EnemyAI") on day one.
   Enabled exactly when the dev globals install (vite dev / dev shell).
5. **Headless brain tests — `scripts/test-enemy-brain.ts`** (deno run -A):
   asserts detect/hysteresis/leash transitions, attack cadence + cooldown
   jitter bounds, feint distribution over 100 attacks (no clock resonance),
   damage-window semantics (in-range + not-feint + not-over-top), and
   return-to-post arrival. Wire as `deno task test:ai`.

## Explicitly out of scope

New behaviors (patrol/flee/ranged), tuning changes, any observable behavior
change — the browser verification must show the crab acting identically.

## Files touched

`src/preview/enemyBrain.ts` (new), `src/preview/EnemyAI.ts`,
`src/preview/ObjectPlacer.ts`, `src/world/transformWatchdog.ts` (new),
`src/world/MoverSystem.ts`, `src/App.tsx` + `src/runtime/RuntimeApp.tsx`
(watchdog arming with dev globals), `deno.json` (test task).

## Verification

- `deno task test:ai` green headlessly (no browser).
- `npm run typecheck`; browser deterministic pass re-running the phase-61
  acceptance motions (chase curve, bite lands, on-top whiff, leash return,
  dance freeze + clean resume) — identical outcomes.
- Watchdog provocation: manually start the crab's mover entry while the AI
  runs → exactly one warn naming both writers; silent otherwise.
