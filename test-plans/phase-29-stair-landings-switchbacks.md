# Phase 29 — Stair Landings + Switchback Stairwells — Acceptance Record

Run 2026-07-09 against `localhost:7373` (Chrome extension session, TESTING.md §3
golden path; autosave snapshot/restore protocol followed — snapshot content
matches the committed `worlds/stairs.json`, which doubles as the recovery copy).

## Numeric layout validation (pre-mesh, node probe on the pure module)

Bundled `src/builders/stairLayout.ts` via esbuild and probed
`computeStairLayout` with the user's hand-built stairwell parameters
(`stair_25ad198c` + `flights: 2, turn: "left", gap: 0.9628, landing: {depth: 3}`):

| Generated | Hand-built (worlds/stairs.json) | Δ |
|---|---|---|
| flight 2 start (−7.963, 3.013, −3) | stair_ae6bc166 (−7.963, 2.846, −2.975) | ≤ 3 cm XZ (user placed 17 cm low in Y) |
| flight 2 end (−7.963, 5.873, 5) | (−7.963, 5.705, 5.025) | same |
| landing center (−6.231, −4.5), 3 × 5.96, top 3.013 | plat_8af769a3 (−6.151, −4.476), 3 × 5.9, top 3.036 | ≤ 8 cm |

Rail paths: inner = up flight 1 → level across the void edge (the user's
red-drawn segment) → up flight 2 → top-landing crossing; outer = up flight 1 →
3 landing perimeter edges → flight 2's outer line → top landing wrap ending at
the open exit-edge corner. Turn chirality verified against the manual build
(turn "left" ⇒ flight 2 at −X). ✅

## Degenerate parity (legacy stairs unchanged)

- Body mesh 232 positions (14 diagonal-underside steps + caps), riser 56,
  30 rail boxes (2×14 posts + 2 top rails) — exact pre-refactor formulas, on
  both plain stairs in the user's world. ✅
- `registerStairSteps`: flight 0 of a plain stair is literally `{start, end}`
  with the same `numSteps` formula ⇒ identical descriptors by construction. ✅
- No console errors on load. ✅

## In-editor build variants (via `__world.updateStair`, screenshots)

| Variant | Result |
|---|---|
| flights=2, turn=left, gap=0.9628, landing 3m | Reproduces the manual build; inner rail turns across the landing void edge and merges into flight 2; outer rail wraps 3 landing perimeter edges; top landing railed with open exit edge. Corner posts at every vertex, level runs get spaced posts, no z-fighting, no miter gaps. ✅ |
| flights=3, turn=right, gap=0.5 | Squared spiral stacks correctly; chirality mirrored. ✅ |
| flights=1, landing depth 2.5 × width 6 (balcony) | Both side rails continue onto the landing, lateral jog to the wider landing edges, far edge railed, entry edge open. ✅ |
| hasRailing=false + underside=closed | No rails anywhere; flight 1 + landing 1 solid to ground, flight 2 downgraded to diagonal soffit (would otherwise swallow flight 1), landing 2 slab. ✅ |
| Collider count (2 flights, 14 steps) | 30 = 28 step cuboids + 2 landing cuboids. ✅ |

## Panel (real UI clicks + controlled-input protocol)

- Select stair → Geometry → LANDING & FLIGHTS renders between UNDERSIDE and
  CUT BOX. Checkbox on → `landing: {depth: 2.5}` committed. FLIGHTS input → 2
  committed; VOID GAP + TURN Left/Right appear; derived line "Steps & rise are
  per flight · Top Y: 5.87 m · Total rise: 5.72 m". ✅
- Whole switchback selects/glows as one entity, gizmo attaches. ✅
- Undo: Cmd+Z ×1 reverts the flights edit, ×2 reverts the landing toggle —
  back to a pristine stair with **no residual keys** (`landing`/`flights`
  absent from JSON). One history step per panel commit. ✅
- Save/load roundtrip: `toJSON()` carries `flights/turn/gap/landing` verbatim
  (zones spread directly — no serializer changes needed). ✅

## Physics (preview mode, hidden-tab manual stepping)

`physicsWorld.step + controller.update` loop (TESTING.md §3), teleports:

- Mid flight 2 (x=−7.96, z=1): settles at body y 6.10 = expected tread 4.44 +
  capsule offset 1.66. ✅
- Landing top (−6.23, −4.5): settles at 4.70 = landing top 3.01 + 1.69. ✅
  (Offsets mutually consistent ⇒ both flight-2 step cuboids and the landing
  cuboid support the player at exactly the generated heights.)

Console clean except the known pre-existing `WrongDocumentError` pointer-lock
rejections from CDP-driven preview entry (documented in TESTING.md).

## Not separately run

- **Runtime shell walkthrough** — the runtime uses the same
  `StairBuilder`/`ColliderBuilder`/`stairLayout` code paths and the demo
  manifest contains no stairs; in-editor preview exercised the identical
  builder + collider pipeline. Revisit if a manifest with a switchback ships.
- **CSG cutter × multi-flight** — cutter targeting (floors/platforms only,
  anchored at flight 1's `end`) is untouched by this phase; landings live
  inside the stair entity and are never cut. Code-inspection only.
- **Gizmo move/rotate of a switchback** — move writes the same delta to
  start+end and rotate pivots both about their midpoint, then `_rebuildStair`
  regenerates everything from the def (same path the panel edits exercised
  repeatedly). Code-inspection + panel-driven rebuild evidence only.

## Addendum — v4.23.1 (rail toggles, user feedback)

- `landingPerimeter` (default OFF): 3-flight switchback rebuilt with default →
  outer rails terminate at each landing boundary (per-flight segments), no
  perimeter ring; ON restores the continuous 3-edge wrap. ✅
- `balustersInner`/`balustersOuter` (default to legacy `balusters`): perimeter
  ON + outer OFF → bare perimeter bars, posted inner rail (screenshot). ✅
- Both driven via `__world.updateStair`; legacy worlds unchanged (new fields
  absent ⇒ both sides = `balusters`). Typecheck clean.
