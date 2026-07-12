import type {
  ZoneDef, WallNode, SceneFile, MaterialOverrides, ScriptAction, DialogueTreeDef,
} from "@/types";

/**
 * Remove nodes not referenced by any wall, floor, or platform. Returns count pruned.
 *
 * Polygon platforms/floors are node-backed (corners live in `zone.nodes`), but
 * `removePlatform`/`removeFloor` only drop the entity — their nodes are orphaned and
 * `NodeDragger` keeps drawing a dot + edge line for each. This reaps those orphans;
 * shared nodes (still referenced elsewhere) are kept.
 */
export function pruneOrphanNodes(zone: ZoneDef): number {
  if (!zone.nodes?.length) return 0;
  const ref = new Set<string>();
  for (const w of zone.walls)     { ref.add(w.startNodeId); ref.add(w.endNodeId); }
  for (const f of zone.floors)    f.floorMesh.nodeIds?.forEach(id => ref.add(id));
  for (const p of zone.platforms) p.nodeIds?.forEach(id => ref.add(id));
  const before = zone.nodes.length;
  zone.nodes = zone.nodes.filter(n => ref.has(n.id));
  return before - zone.nodes.length;
}

/**
 * Phase 10.8 world-space UV migration. Scenes authored before 10.8 tuned `tileScale`
 * to compensate for the old inverted (× / ÷) per-builder convention; under the unified
 * ÷ convention those values now read differently, so reset them to the neutral 1.0 for
 * any file missing `uvVersion: 1`. At 1.0 the old and new math agree, so a scene that
 * never customised tiling looks identical. Mutates `file` in place.
 */
export function migrateUVs(file: SceneFile): void {
  if (file.metadata?.uvVersion === 1) return;

  const reset = (ovr: MaterialOverrides | undefined) => {
    if (!ovr) return;
    if (ovr.tileScale !== undefined)  ovr.tileScale  = 1.0;
    if (ovr.tileScaleX !== undefined) ovr.tileScaleX = 1.0;
    if (ovr.tileScaleY !== undefined) ovr.tileScaleY = 1.0;
  };

  for (const zone of file.zones) {
    for (const w of zone.walls)     reset(w.materialOverrides);
    for (const f of zone.floors)    reset(f.materialOverrides);
    for (const p of zone.platforms) { reset(p.materialOverrides); reset(p.sideMaterialOverrides); }
    for (const s of zone.stairs)    { reset(s.materialOverrides); reset(s.riserMaterialOverrides); }
  }

  if (file.metadata) file.metadata.uvVersion = 1;
}

/**
 * Migrates legacy inline `show_dialogue` dialogue ({ speaker, lines }) into the zone-level
 * DialogueTreeDef registry: one single-node tree per action, action gains `dialogueId` and
 * loses `dialogue`. Shape-guarded per action (no version bump). World-level scripts park
 * their trees in the first zone (runtime resolution scans all zones). Mutates in place.
 */
export function migrateDialogues(file: SceneFile): void {
  const intoZone = (zone: ZoneDef, action: ScriptAction): void => {
    if (action.type !== "show_dialogue" || !action.dialogue || action.dialogueId) return;
    const d = action.dialogue;
    const tree: DialogueTreeDef = {
      id: `dlg_${crypto.randomUUID().slice(0, 8)}`,
      label: d.speaker || "Dialogue",
      speaker: d.speaker,
      ...(d.portrait ? { portrait: d.portrait } : {}),
      startNode: "n1",
      nodes: [{ id: "n1", lines: d.lines, options: [] }],
    };
    (zone.dialogues ??= []).push(tree);
    action.dialogueId = tree.id;
    delete action.dialogue;
  };

  for (const zone of file.zones) {
    for (const s of zone.scripts ?? []) s.actions.forEach(a => intoZone(zone, a));
    for (const o of zone.objects) for (const s of o.scripts ?? []) s.actions.forEach(a => intoZone(zone, a));
    for (const v of zone.triggerVolumes ?? []) for (const s of v.scripts ?? []) s.actions.forEach(a => intoZone(zone, a));
  }
  if (file.zones[0])
    for (const s of file.world?.scripts ?? []) s.actions.forEach(a => intoZone(file.zones[0], a));
}

/**
 * Phase 35: WorldConfig.ambientLight/sunLight existed since day one but were never
 * applied — every scene rendered with SceneManager's hardcoded ambient 0.5 / sun 2.0.
 * Old saves therefore carry the never-honored serialization defaults (1.2 / 3.0);
 * applying those verbatim would visibly brighten every existing world. Rewrite
 * exactly those untouched defaults to the values that match how the scene always
 * looked. Hand-edited values are left alone. Mutates in place.
 */
export function migrateWorldLighting(file: SceneFile): void {
  const w = file.world;
  if (!w) return;
  if (w.ambientLight?.color === "#aabbcc" && w.ambientLight.intensity === 1.2)
    w.ambientLight.intensity = 0.5;
  if (w.sunLight?.color === "#fff4e0" && w.sunLight.intensity === 3.0)
    w.sunLight.intensity = 2.0;
}

/** Migrates a parsed scene JSON from old `start`/`end` wall format to node-based. */
export function migrateWallNodes(zones: ZoneDef[]): void {
  for (const zone of zones) {
    if (!zone.nodes) zone.nodes = [];

    for (const wall of zone.walls) {
      const legacy = wall as unknown as Record<string, unknown>;
      if (!("startNodeId" in wall) && "start" in legacy && "end" in legacy) {
        const s = legacy["start"] as { x: number; z: number };
        const e = legacy["end"]   as { x: number; z: number };

        const findOrCreate = (x: number, z: number): WallNode => {
          const existing = zone.nodes.find(
            n => Math.abs(n.x - x) < 0.001 && Math.abs(n.z - z) < 0.001,
          );
          if (existing) return existing;
          const node: WallNode = { id: crypto.randomUUID(), x, z };
          zone.nodes.push(node);
          return node;
        };

        const startNode = findOrCreate(s.x, s.z);
        const endNode   = findOrCreate(e.x, e.z);

        (wall as unknown as Record<string, unknown>)["startNodeId"] = startNode.id;
        (wall as unknown as Record<string, unknown>)["endNodeId"]   = endNode.id;
        delete legacy["start"];
        delete legacy["end"];
      }
    }
  }
}
