# Phase 29 — Parametric Stair Landings + Switchback Stairwells

> **Status: IMPLEMENTED** — shipped 2026-07-09. Verified in-browser end-to-end;
> acceptance record in `test-plans/phase-29-stair-landings-switchbacks.md`.
> Notable deviations from plan:
> - No gooseneck logic was needed at slope→level rail corners — the tread-anchor
>   line passes through `(u = run, y = topY)` exactly, so sloped rails meet the
>   landing-level rails at the corner vertex natively.
> - `closed` underside on upper flights/landings downgrades to the diagonal
>   soffit (a to-ground column under flight k ≥ 2 would swallow the flight
>   directly below); only flight 0 / landing 0 reach the ground.
> - Panel puts VOID GAP and LANDING WIDTH in one shared slot (width is only
>   meaningful at flights = 1, gap only at flights > 1).

Origin: user request — "have a set of stairs have option to also add a
configurably sized platform on the end and have the rail follow accordingly,
and have a configurable number of automatically continuing flights of steps
and platforms in opposing u-shapes creating a squared spiral." Reference:
real stairwell photos + a hand-built two-flight switchback in
`worlds/stairs.json` (two 2.5 m flights opposed, lateral offset ≈ width + gap,
5.9×3 platform spanning both flights and the void). The key railing behavior,
drawn in red by the user: the **inner rail** (around the central void) turns
at the landing, runs level across the landing's void-side edge, and merges
continuously into the next flight's rail; the **outer rail** terminates into
the landing, whose outer perimeter edges get level rails.

## 1. Scope & decisions

**In scope**
- `landing` option on any stair: auto-generated flat platform at the top of
  the flight, rails wrapping its exposed edges (3-edge balcony wrap on a
  single flight).
- `flights: N` + `turn: "left" | "right"` + `gap`: N opposing flights joined
  by intermediate landings — a squared spiral, with the continuous inner rail
  and railed outer perimeters described above.
- PropertiesPanel "LANDING & FLIGHTS" section; colliders for landings.

**Decided (with user, do not relitigate)**
- **One parametric entity.** New optional fields on the existing `StairDef`;
  the whole stairwell regenerates on edit, moves/selects as a unit. Landings
  are geometry inside the stair entity, NOT separate `PlatformDef`s.
- Landing works standalone on a plain single flight.
- Placement stays with the existing two-click StairTool; new fields are
  edited in the panel afterward.

**Out of scope**
- Per-flight overrides (width/steps/material per flight), spiral (non-180°)
  turns, doors/openings in landings, rail colliders (rails have never had
  colliders), multi-storey CSG cutters (cutter stays anchored to flight 1's
  `end`), bbox-centered rotate pivot for multi-flight stairs (pivot remains
  flight 1's midpoint — noted as future polish).

## 2. Semantics

- `start`/`end` describe **flight 1 exactly as today**; `end.y` = top of
  flight 1; `numSteps` is per-flight. Every flight repeats flight 1's
  run/rise, rotated 180° alternately. Total top Y = `start.y + flights·rise`
  (read-only derived line in the panel). Landings add no rise.
- `landing` set ⇒ a landing at the top of **every** flight, including the
  last. The edge where a phantom flight N+1 would launch is left open — the
  storey exit. `flights: 1` + landing = balcony (3 exposed edges railed).
- Landing thickness is derived from the underside mode, never configured:
  `open` → stepRise; `diagonal` → `underside.thickness + stepRise`;
  `closed` → slab down to `start.y`.
- `flights > 1` requires a landing; the panel enforces it, the builder clamps
  defensively (hand-edited JSON never throws).

## 3. Schema (`src/types.ts`)

```ts
export type StairTurn = "left" | "right";
export interface StairLandingDef {
  depth:  number;   // meters along the flight's exit direction
  width?: number;   // lateral override — honored only when flights === 1
}
// StairDef additions (all optional — no migration needed):
landing?: StairLandingDef;
flights?: number;      // >= 1, default 1
turn?:    StairTurn;   // default "left"; meaningful only when flights > 1
gap?:     number;      // void width between opposed flights (m), default 0.2
```

Everything else derives: switchback landing span = `2·width + gap`, flight k
footprint, per-flight rise, landing thickness.

## 4. Layout math — new pure module `src/builders/stairLayout.ts`

Single source of truth consumed by both `StairBuilder` and `ColliderBuilder`
(prevents mesh/collider drift and an import cycle). Conventions match the
builder: `A = atan2(dz,dx)`, local +X = up-flight, local +Z = right of
travel. A stairwell frame at `start`: `u` along the flight direction, `v`
along the turn vector (left for `turn:"left"`).

- `computeStairLayout(stair)` → `{ flights: FlightSpec[], landings:
  LandingSpec[], frame }`. Flight k: lateral center `v = (k%2)·(width+gap)`,
  u alternates 0→run / run→0, `startY = start.y + k·rise`. Landing k:
  u-range `[run, run+D]` (k even) / `[−D, 0]` (k odd), v-range spans both
  flights + void (or `landing.width` when flights = 1).
- `computeRailPaths(layout, cfg)` → polylines (see §5).
- Degenerate case (`flights ≤ 1 && !landing`) returns `[{start,end}], []`.

## 5. Railing continuation — two continuous polylines

Vertices at walking-surface height (rail boxes render `height` above; posts
at every vertex). No rail ever crosses a flight entry/exit edge — paths turn
at those corners by construction.

- **Inner path** (around the void): up flight 0 at `v = w/2 − sideInset` →
  corner → level across the landing's void edge → up flight 1 (continuous)
  → … → free end after the top landing's void segment.
- **Outer path**: up flight 0's outer side → wrap the landing's three outer
  perimeter edges level (the last leg IS flight 1's outer rail line) → up
  flight 1 → … → terminate at the top landing's open exit edge.
- Joints: walking-surface-height vertices give an automatic gooseneck at
  slope→level transitions; corner posts hide miters; segment boxes overlap
  `+barThickness` at interior corners (occluded, backface-culled). `overhang`
  applies to free ends only. Balusters keep the per-step rhythm on slopes;
  level runs use `stepInterval × stepDepth` spacing.
- The legacy rail block in `StairBuilder` is kept verbatim for the degenerate
  case — zero regression on existing worlds.

## 6. Files

| File | Change |
|---|---|
| `src/types.ts` | `StairTurn`, `StairLandingDef`, 4 optional `StairDef` fields |
| `src/builders/stairLayout.ts` | NEW — `computeStairLayout`, `computeRailPaths` |
| `src/builders/StairBuilder.ts` | `emitFlight` extraction, `emitLanding`, `emitRailPath` |
| `src/physics/ColliderBuilder.ts` | `registerStairSteps` consumes the layout; landing cuboids |
| `src/ui/PropertiesPanel.tsx` | `StairGeoView` "LANDING & FLIGHTS" section |
| `WORLD_EDITOR_ARCHITECTURE.md` | changelog + StairBuilder/StairGeoView sections |

## 7. Verification

- Numeric: layout for `flights:2, turn:"left", gap:0.9, landing:{depth:3}` on
  `stair_25ad198c` reproduces the hand-built `stair_ae6bc166` +
  `plat_8af769a3` (worlds/stairs.json) within cm.
- Degenerate parity: legacy worlds produce identical vertex streams and
  collider descriptors before/after.
- Browser pass per TESTING.md §3 (autosave snapshot protocol): visual joint
  close-ups for flights=1+landing / flights=2,3 × left,right; panel
  interactions + single-step undo; gizmo move/rotate; save/load roundtrip;
  preview walk-up (colliders); runtime shell walkthrough; CSG cutter still
  cuts only overlapping floors.
- Acceptance record to follow in `test-plans/phase-29-stair-landings-switchbacks.md`.
