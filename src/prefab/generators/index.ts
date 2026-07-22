import type { PrefabTemplateEntity, PrefabVariableDef, PrefabVarValue } from "@/types";
import { tiledPlatform } from "@/prefab/generators/tiledPlatform";

/**
 * A code-registered prefab generator (Phase 44): params in, template members
 * out. `expand` must be pure and deterministic — memberKeys are the identity
 * re-expansion diffs against, and defs are in prefab-local space (the shared
 * expand.ts pipeline applies the instance origin). Generators never run in the
 * runtime — scenes store expanded entities.
 */
export interface PrefabGenerator {
  id:        string;
  label:     string;
  variables: PrefabVariableDef[];
  expand(vars: Record<string, PrefabVarValue>): PrefabTemplateEntity[];
}

export const GENERATORS: Record<string, PrefabGenerator> = {
  [tiledPlatform.id]: tiledPlatform,
};
