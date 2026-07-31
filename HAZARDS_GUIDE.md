# Hazards, Death & Respawn — a builder's guide

How to hurt the player, and what happens when you succeed. Everything here
ships as of Phase 53 (v4.56.0): the `on_state_equals` trigger, the
`respawn_player` action, and trigger volumes that can **attach to moving
things**. If you already built kill floors by hand out of `store_position` +
`teleport_player`, they still work — this guide shows the shorter road.

> Companion reading: `STATE_ITEMS_GUIDE.md` (what state keys are),
> `GAMEPLAY_STATE.md` (the machinery underneath).

---

## The one script every game wants: a central death handler

Health is a built-in state key (starts at 100, clamped 0–100 unless you
change it in the STATE tab). Give every hazard one job — *subtract health* —
and put death itself in a single script:

- **Trigger:** `on_state_equals`, state key `health`, equals value `0`
- **Action:** `respawn_player`

![on_state_equals — state key "health", equals value 0](docs/images/on-state-equals-trigger.png)

![respawn_player — destination, fade, and health restore in one action](docs/images/respawn-player-action.png)

`on_state_equals` fires when the key **becomes** that value — not every frame
it stays there. Taking more hits while already at 0 does nothing (health is
clamped and unchanged values never re-fire), and after a respawn restores
health, reaching 0 again fires it again. Exactly the rhythm a death handler
wants. (`on_health_zero` in the trigger list is shorthand for this exact
health case — same behavior, no fields to fill.)

`respawn_player` runs the whole death sequence in order: fade to a color
(default black, 0.4s), then **while the screen is covered** teleport the
player, optionally restore health to its default, and fade back in. Its
destination tries three things in order:

1. **Stored position key** — your classic checkpoint convention: checkpoint
   volumes run `store_position` (player) into a key like `checkpoint`, and
   respawn reads it. Most-recent checkpoint wins automatically.
2. **A specific checkpoint** — pick one from the dropdown; uses its position
   and facing.
3. **World default spawn** — the fallback that always exists. This is also
   why dying *before* the first checkpoint no longer strands you: pick
   "stored position key" and the empty key just falls through to spawn.

> Check **Restore health to its default** on the action — otherwise the player
> respawns at 0 health and instantly dies again.

## Recipe: the kill floor

1. Trigger tool → drag a volume across the pit, tall enough to catch a fall.
2. On the volume, add an `on_player_enter` script with one action:
   `set_state health = 0` (or `adjust_number health -100`).
3. The central death handler does the rest.

That's the whole thing. The volume never teleports anyone itself — it just
kills, and death is handled in one place no matter what caused it.

## Recipe: the crusher (a trigger that RIDES a moving platform)

![A crusher: mover platform with a red kill-glow volume attached beneath it](docs/images/crusher-attached-volume.png)

1. Build the crusher block (a platform with a **mover** — e.g. slide on Y,
   distance 4, loop).
2. Trigger tool → drag a volume covering the space *under* the block's rest
   position.
3. Select the volume → **ATTACHED TO** → pick the platform.

![The ATTACHED TO dropdown on a trigger volume](docs/images/attached-to-dropdown.png)

4. Give the volume the same `on_player_enter → set_state health = 0` script
   as a kill floor.

The volume's sensor — and its wireframe and gradient glow, if you enabled the
Visual section — now ride the platform's motion in preview and game. The
trigger system checks overlap every frame regardless of who moved, so **the
volume descending onto a standing player fires exactly like a player walking
into a parked one.** That's the crush.

Worth knowing:

- The POSITION on the panel stays the volume's **rest pose** (where it sits
  before the mover runs). Move/resize it exactly like any volume.
- Anything mover-enabled can be a host: platforms, shapes, and placed
  objects. If the host is deleted or its mover is turned off, the volume
  quietly falls back to a normal static trigger at its authored spot.
- Copy a host and its attached volume together and the copy stays attached to
  the copied host. Same for prefabs.

## Recipe: the enemy sight-cone

For a placed **object** (an enemy model), you don't even need a trigger
volume: add a second collider to the object (Colliders screen), size it as
the vision box in front, tick **Sensor**, and put `on_player_enter` /
`on_player_exit` scripts on the object. Sensors on an object always follow
its mover — position *and* rotation — so a patrolling enemy's cone sweeps
with it. (A sensor is shape overlap, not line-of-sight: it sees through
walls.)

Use an attached trigger volume instead when the moving thing is a platform or
shape, or when you want the visible gradient glow.

## Recipe: damage over hazards, not instant death

Spikes that hurt but don't kill: `on_player_enter → adjust_number health -25`.
The UI bar (SCRIPTS → UI tab, bar bound to `health`) shows it dropping, and
the same central death handler fires only when it actually reaches 0. This is
the payoff of routing everything through health: floors, crushers, enemies
and poison all *stack* into one death.

## The fine print

- `on_state_equals` works for any key, not just health — `coins == 10` →
  open the door, `boss_phase == 2` → change the music.
- It fires on the **transition** to the value. A key *starting* at the value
  (seeded by a STATE-tab default) doesn't fire it on load.
- `fade_screen` (the standalone action) now releases the player when the fade
  ends — before Phase 53 it left input frozen forever. Scene transitions in
  published games also fade back in properly now.
- Exiting preview mid-death-sequence cancels the pending teleport and clears
  the overlay — nothing leaks into the editor.
