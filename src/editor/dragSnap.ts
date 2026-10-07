import type { EventBus } from "@/core/EventBus";

/**
 * Drag snap for brush face / edge / corner drags and PUSH (v4.106.0): one step in meters
 * for every brush drag (0 = off), chosen in the panel's SNAP row and remembered in
 * localStorage. Alt held while dragging is still "free" for that drag. Corner sets keep
 * their own 15° rotate and 0.1 scale steps; this is the move step.
 * Since v4.122.0 the same step drives wall / floor / platform corner and edge drags
 * (NodeDragger), Wall tool placement and the wall gizmo move (was a fixed 0.5 m / none).
 */
export const SNAP_STEPS = [0, 0.05, 0.1, 0.25, 0.5, 1] as const;
const KEY = "brushDragSnap";

let step: number = (() => {
  try {
    const v = parseFloat(localStorage.getItem(KEY) ?? "");
    return (SNAP_STEPS as readonly number[]).includes(v) ? v : 0.25;
  } catch { return 0.25; }
})();

export function dragSnapStep(): number { return step; }

export function setDragSnapStep(bus: EventBus, v: number): void {
  step = v;
  try { localStorage.setItem(KEY, String(v)); } catch { /* storage blocked */ }
  bus.emit("brush:snap-changed", { step: v });
}

/** Round a value to the current step (unchanged when snap is off). Snapped values keep at
 *  most 2 decimals, so 0.1 steps store -21.2, not -21.200000000000003. */
export function snapToStep(v: number): number {
  return step > 0 ? round2(Math.round(v / step) * step) : v;
}

/** Two decimals: for sums of snapped values (start + snapped move), which pick up float noise. */
export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
