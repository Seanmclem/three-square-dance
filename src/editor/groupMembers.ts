import type { WorldState } from "@/world/WorldState";
import type { SelectedRef, EditorObjectType, ZoneDef } from "@/types";

/** A group member resolved to a selectable ref plus a display label. */
export interface GroupMember {
  ref:   SelectedRef;
  label: string;
}

/** Entity collection name on a zone, paired with its editor selection type. */
const COLLECTIONS: { type: EditorObjectType; key: keyof ZoneDef }[] = [
  { type: "floor",          key: "floors" },
  { type: "wall",           key: "walls" },
  { type: "platform",       key: "platforms" },
  { type: "stair",          key: "stairs" },
  { type: "object",         key: "objects" },
  { type: "trigger-volume", key: "triggerVolumes" },
  { type: "shape",          key: "shapes" },
];

type Grouped = { id: string; label?: string; groupIds?: string[] };

/**
 * One pass over every zone's grouped collections, building a
 * `groupId → members[]` map. O(entities) — call once, index by group.
 */
export function membersByGroup(world: WorldState): Map<string, GroupMember[]> {
  const byGroup = new Map<string, GroupMember[]>();
  for (const zone of world.zones.values()) {
    for (const { type, key } of COLLECTIONS) {
      const list = (zone[key] as Grouped[] | undefined) ?? [];
      for (const ent of list) {
        if (!ent.groupIds?.length) continue;
        const member: GroupMember = { ref: { id: ent.id, type, zoneId: zone.id }, label: ent.label ?? ent.id };
        for (const gid of ent.groupIds) {
          const arr = byGroup.get(gid);
          if (arr) arr.push(member);
          else byGroup.set(gid, [member]);
        }
      }
    }
  }
  return byGroup;
}

/** Current groupIds of the entity behind a ref (empty if not found). */
export function entityGroupIds(world: WorldState, ref: SelectedRef): string[] {
  const zone = world.zones.get(ref.zoneId);
  const key = COLLECTIONS.find(c => c.type === ref.type)?.key;
  if (!zone || !key) return [];
  const list = (zone[key] as Grouped[] | undefined) ?? [];
  return list.find(e => e.id === ref.id)?.groupIds ?? [];
}

/** Write groupIds onto the entity behind a ref via the type's WorldState mutator. */
export function writeGroupIds(world: WorldState, ref: SelectedRef, groupIds: string[]): void {
  switch (ref.type) {
    case "floor":          world.updateFloor(ref.zoneId, ref.id, { groupIds }); break;
    case "wall":           world.updateWall(ref.zoneId, ref.id, { groupIds }); break;
    case "platform":       world.updatePlatform(ref.zoneId, ref.id, { groupIds }); break;
    case "stair":          world.updateStair(ref.zoneId, ref.id, { groupIds }); break;
    case "object":         world.updateObject(ref.zoneId, ref.id, { groupIds }); break;
    case "trigger-volume": world.updateTriggerVolume(ref.zoneId, ref.id, { groupIds }); break;
    case "shape":          world.updateShape(ref.zoneId, ref.id, { groupIds }); break;
  }
}
