import type { EventBus } from "@/core/EventBus";
import type { SceneMetadata, WorldConfig, TerrainDef, ZoneDef, TransitionDef } from "@/types";

/**
 * In-memory mirror of the SceneFile JSON. Tools mutate WorldState; builders and
 * managers listen for change events and rebuild geometry. Nothing writes
 * directly to Three.js objects.
 *
 * Phase 2: data container only — SelectionManager reads `zones` to resolve the
 * data record for a selected mesh. Entity mutation methods land in Phase 3.
 */
export class WorldState {
  metadata: SceneMetadata | null = null;
  world:    WorldConfig   | null = null;
  terrain:  TerrainDef    | null = null;

  readonly zones       = new Map<string, ZoneDef>();
  readonly transitions = new Map<string, TransitionDef>();
  activeZoneId: string | null = null;

  constructor(private readonly _bus: EventBus) {}
}
