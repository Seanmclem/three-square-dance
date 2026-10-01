# Test Plan: Phase 82, Brush Soft Falloff (v4.100.0)

[x] = verified 2026-10-01. Logic: scratch Node script over the real `brushOps`. UI:
headless Playwright (system Chrome) on the throwaway test harness
(`deno task test:harness`) with real mouse / keyboard input, on an 8-sided, 11-ring
column (rings 0.5 m apart) at y = 20; nothing reaches `public/games`.

## Math (`softDisplace`)

- [x] Scale the middle ring 1.6× with radius 2.5 rings, smooth: rings ±1 at 1.389, ±2 at
      1.062, ±3 untouched; exactly `1 + 0.6 · softWeight(d / R)`.
- [x] Linear and sharp give 1.360 / 1.120 and 1.216 / 1.024 for rings ±1 / ±2.
- [x] Radius 0: unchanged from today (only the ring moves).
- [x] Result still passes `validateMesh`.
- [x] Cloud brush (no faces): straight-line distance, same numbers on the column.

## UI (harness)

- [x] Vertex mode, O → the Geometry screen shows SOFT ON.
- [x] Corner set = the middle ring, S, drag the center box right: neighbors follow
      (1.078 / 1.25 / 1.422 / 1.5 …); 48 green dots shown during the drag.
- [x] ] mid-drag widens the reach live (radius 2 → 2.5).
- [x] Release: dots hidden; Cmd+Z restores every ring to 1.
- [x] Escape mid-drag restores every ring.
- [x] O again (SOFT OFF) + the same drag: only the ring moves.
- [x] Face mode, face loop of the middle band, PUSH +0.5 m with radius 2: band rings at
      1.541, neighbors 1.457 / 1.271 / 1.085; undo restores.
- [x] Vertex mode, free drag of one corner up 0.75: its ring-mates follow 0.50, the corner
      above 0.63, the far side of the ring stays.
- [ ] Edge-mode drag with SOFT.
- [ ] By hand in the shell window: the dots read clearly against the brush.
