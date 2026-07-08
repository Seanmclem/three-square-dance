import type { ToolId } from "@/types";

/**
 * The Select tool's three modes (Phase 23): object / face / vertex. All selection
 * machinery (picking, node drag, handles, resizers, splitters…) treats every mode
 * exactly like plain "select" — face/vertex only add behavior on shapes/brushes.
 */
export const isSelectMode = (t: ToolId): boolean =>
  t === "select" || t === "select-face" || t === "select-vertex";
