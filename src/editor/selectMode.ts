import type { ToolId } from "@/types";

/**
 * The Select tool's four modes (Phase 23/23b): object / face / vertex / edge. All
 * selection machinery (picking, node drag, handles, resizers, splitters…) treats every
 * mode exactly like plain "select" — the sub-modes only add behavior on shapes/brushes.
 */
export const isSelectMode = (t: ToolId): boolean =>
  t === "select" || t === "select-face" || t === "select-vertex" || t === "select-edge";
