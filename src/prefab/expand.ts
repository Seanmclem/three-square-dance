import type { WorldState } from "@/world/WorldState";
import type {
  EditorObjectType, LadderDef, PrefabDef, PrefabInstanceRecord, PrefabStamp,
  PrefabTemplateEntity, PrefabVarValue, ScriptDef, ShapeDef, StairDef,
  TriggerVolume, Vec3, WorldObject,
} from "@/types";
import { GENERATORS } from "@/prefab/generators";

// Prefab expansion pipeline (Phase 44). One path for both prefab kinds:
// expandPrefab() produces prefab-local template members; instantiatePrefab()
// transforms them by the instance origin, gives every member a fresh world id,
// remaps intra-prefab script references, stamps the members, and routes them
// through the normal WorldState mutators in a single transaction. Scenes store
// the expanded entities — the runtime never sees prefab code.

/** Entity types a prefab may contain (position-anchored; node-backed types are
 *  not capturable — wall/floor/platform diffing over shared nodes is deferred). */
export const PREFABABLE = new Set<EditorObjectType>(["object", "trigger-volume", "shape", "stair", "ladder"]);

const uuid8 = (): string => crypto.randomUUID().slice(0, 8);

function newMemberId(type: EditorObjectType): string {
  switch (type) {
    case "object":         return `obj_${uuid8()}`;
    case "trigger-volume": return `vol_${uuid8()}`;
    case "shape":          return `shape_${uuid8()}`;
    case "stair":          return `stair_${uuid8()}`;
    case "ladder":         return `ladder_${uuid8()}`;
    default:               return crypto.randomUUID();
  }
}

/** Template members for (prefab, vars): generator → expand(vars); snapshot → template clone. */
export function expandPrefab(prefab: PrefabDef, vars: Record<string, PrefabVarValue>): PrefabTemplateEntity[] {
  if (prefab.kind === "generator") {
    const gen = prefab.generatorId ? GENERATORS[prefab.generatorId] : undefined;
    if (!gen) {
      console.warn(`[prefabs] unknown generatorId "${prefab.generatorId}" on prefab "${prefab.name}"`);
      return [];
    }
    return gen.expand(vars);
  }
  return structuredClone(prefab.template ?? []);
}

/** Schema defaults, overlaid with any provided values. */
export function defaultVars(prefab: PrefabDef, overrides?: Record<string, PrefabVarValue>): Record<string, PrefabVarValue> {
  const vars: Record<string, PrefabVarValue> = {};
  for (const v of prefab.variables) vars[v.name] = v.default;
  return { ...vars, ...overrides };
}

/** All (zoneId, record) pairs for a prefab across the loaded world. */
export function findInstances(world: WorldState, prefabId: string): { zoneId: string; record: PrefabInstanceRecord }[] {
  const out: { zoneId: string; record: PrefabInstanceRecord }[] = [];
  for (const zone of world.zones.values()) {
    for (const record of zone.prefabInstances ?? []) {
      if (record.prefabId === prefabId) out.push({ zoneId: zone.id, record });
    }
  }
  return out;
}

// ── Transform helpers ────────────────────────────────────────────────────────

const DEG = Math.PI / 180;

/** Rotate a prefab-local point by yaw degrees about Y, then translate by origin. */
function toWorld(local: Vec3, origin: PrefabInstanceRecord["origin"]): Vec3 {
  const t = origin.rotationY * DEG;
  const cos = Math.cos(t), sin = Math.sin(t);
  return {
    x: origin.position.x + local.x * cos + local.z * sin,
    y: origin.position.y + local.y,
    z: origin.position.z - local.x * sin + local.z * cos,
  };
}

// ── Script reference remapping ───────────────────────────────────────────────

/** Clone scripts with fresh ids, retargeted zone, and every intra-prefab entity
 *  reference (trigger.targetId / actions[].targetId / conditions[].npcId)
 *  remapped through idMap. Ids not in the map (external entities, groups) pass
 *  through untouched. */
export function remapScripts(scripts: ScriptDef[] | undefined, idMap: Map<string, string>, zoneId: string): ScriptDef[] | undefined {
  if (!scripts) return undefined;
  const remap = (id: string | undefined): string | undefined =>
    id !== undefined ? (idMap.get(id) ?? id) : undefined;
  return scripts.map(s => {
    const c = structuredClone(s);
    c.id = `script_${uuid8()}`;
    c.zoneId = zoneId;
    c.trigger.targetId = remap(c.trigger.targetId);
    for (const a of c.actions)    a.targetId = remap(a.targetId);
    for (const cd of c.conditions) cd.npcId  = remap(cd.npcId);
    return c;
  });
}

// ── Instantiation ────────────────────────────────────────────────────────────

interface Materialized {
  type:      EditorObjectType;
  id:        string;
  memberKey: string;
  def:       unknown;
}

/** Transform template members to world space with fresh (or supplied) ids,
 *  remapped scripts, and prefab stamps. `existingIds` (memberKey → entity id)
 *  keeps ids stable across re-expansion. */
function materializeMembers(
  members: PrefabTemplateEntity[],
  record: PrefabInstanceRecord,
  zoneId: string,
  existingIds?: Map<string, string>,
): Materialized[] {
  // Pass 1 — assign ids so intra-prefab script refs can remap to any member.
  const idMap = new Map<string, string>();   // template-local id (== memberKey source id) → world id
  const assigned = members.map(m => {
    const id = existingIds?.get(m.memberKey) ?? newMemberId(m.type);
    idMap.set((m.def as { id: string }).id, id);
    return { member: m, id };
  });

  // Pass 2 — clone + transform + stamp.
  return assigned.map(({ member, id }) => {
    const stamp: PrefabStamp = { prefabId: record.prefabId, instanceId: record.id, memberKey: member.memberKey };
    const def = structuredClone(member.def);
    switch (member.type) {
      case "object": {
        const o = def as WorldObject;
        o.id = id; o.zoneId = zoneId; o.prefab = stamp;
        o.position = toWorld(o.position, record.origin);
        o.rotation = { ...o.rotation, y: o.rotation.y + record.origin.rotationY };
        o.scripts = remapScripts(o.scripts, idMap, zoneId);
        break;
      }
      case "trigger-volume": {
        const v = def as TriggerVolume;
        v.id = id; v.zoneId = zoneId; v.prefab = stamp;
        v.position = toWorld(v.position, record.origin);
        if (record.origin.rotationY !== 0 || v.rotation) {
          v.rotation = { x: v.rotation?.x ?? 0, y: (v.rotation?.y ?? 0) + record.origin.rotationY, z: v.rotation?.z ?? 0 };
        }
        v.scripts = remapScripts(v.scripts, idMap, zoneId);
        break;
      }
      case "shape": {
        const s = def as ShapeDef;
        s.id = id; s.prefab = stamp;
        s.position = toWorld(s.position, record.origin);
        s.rotation = { ...s.rotation, y: s.rotation.y + record.origin.rotationY };
        break;
      }
      case "stair": {
        const s = def as StairDef;
        s.id = id; s.prefab = stamp;
        s.start = toWorld(s.start, record.origin);
        s.end   = toWorld(s.end,   record.origin);
        break;
      }
      case "ladder": {
        const l = def as LadderDef;
        l.id = id; l.prefab = stamp;
        l.position  = toWorld(l.position, record.origin);
        l.rotationY = l.rotationY + record.origin.rotationY;
        break;
      }
    }
    return { type: member.type, id, memberKey: member.memberKey, def };
  });
}

function addMember(world: WorldState, zoneId: string, m: Materialized): void {
  switch (m.type) {
    case "object":         world.addObject(zoneId, m.def as WorldObject); break;
    case "trigger-volume": world.addTriggerVolume(zoneId, m.def as TriggerVolume); break;
    case "shape":          world.addShape(zoneId, m.def as ShapeDef); break;
    case "stair":          world.addStair(zoneId, m.def as StairDef); break;
    case "ladder":         world.addLadder(zoneId, m.def as LadderDef); break;
  }
}

function removeMember(world: WorldState, zoneId: string, type: EditorObjectType, id: string): void {
  switch (type) {
    case "object":         world.removeObject(zoneId, id); break;
    case "trigger-volume": world.removeTriggerVolume(zoneId, id); break;
    case "shape":          world.removeShape(zoneId, id); break;
    case "stair":          world.removeStair(zoneId, id); break;
    case "ladder":         world.removeLadder(zoneId, id); break;
  }
}

/** Current members of an instance, scanned from the zone's PREFABABLE collections. */
export function collectInstanceMembers(
  world: WorldState, zoneId: string, instanceId: string,
): Map<string, { type: EditorObjectType; id: string }> {
  const zone = world.zones.get(zoneId);
  const out = new Map<string, { type: EditorObjectType; id: string }>();
  if (!zone) return out;
  const scan = (type: EditorObjectType, arr: Array<{ id: string; prefab?: PrefabStamp }> | undefined): void => {
    for (const e of arr ?? []) {
      if (e.prefab?.instanceId === instanceId) out.set(e.prefab.memberKey, { type, id: e.id });
    }
  };
  scan("object", zone.objects);
  scan("trigger-volume", zone.triggerVolumes);
  scan("shape", zone.shapes);
  scan("stair", zone.stairs);
  scan("ladder", zone.ladders);
  return out;
}

/**
 * Place a new linked instance of a prefab. One undoable transaction: the
 * instance record plus every expanded member. Returns the record id and the
 * placed member refs (first = primary, for post-place selection).
 */
export function instantiatePrefab(
  world: WorldState,
  zoneId: string,
  prefab: PrefabDef,
  origin: { position: Vec3; rotationY: number },
  variables?: Record<string, PrefabVarValue>,
): { instanceId: string; refs: { type: EditorObjectType; id: string }[] } {
  const record: PrefabInstanceRecord = {
    id:        `pfi_${uuid8()}`,
    prefabId:  prefab.id,
    version:   prefab.version,
    variables: defaultVars(prefab, variables),
    origin,
  };
  const members = expandPrefab(prefab, record.variables).filter(m => PREFABABLE.has(m.type));
  const refs: { type: EditorObjectType; id: string }[] = [];
  world.transaction(`place prefab ${prefab.name}`, () => {
    world.addPrefabInstance(zoneId, record);
    for (const m of materializeMembers(members, record, zoneId)) {
      addMember(world, zoneId, m);
      refs.push({ type: m.type, id: m.id });
    }
  });
  return { instanceId: record.id, refs };
}

/**
 * Diff-apply the prefab (at the record's current variables/origin) to an
 * existing instance: members present in both keep their entity id (external
 * refs / group membership / selection survive) and are replaced exactly
 * (remove + re-add under the same id — a shallow update-merge couldn't drop
 * stale fields); new memberKeys are added; gone ones removed. One transaction
 * (joins the caller's if already open).
 */
export function reexpandInstance(world: WorldState, zoneId: string, prefab: PrefabDef, instanceId: string): void {
  const zone = world.zones.get(zoneId);
  const record = zone?.prefabInstances?.find(r => r.id === instanceId);
  if (!record) return;
  const desired  = expandPrefab(prefab, record.variables).filter(m => PREFABABLE.has(m.type));
  const existing = collectInstanceMembers(world, zoneId, instanceId);
  const existingIds = new Map([...existing].map(([key, e]) => [key, e.id]));
  const mats = materializeMembers(desired, record, zoneId, existingIds);
  world.transaction(`update prefab ${prefab.name}`, () => {
    const desiredKeys = new Set(mats.map(m => m.memberKey));
    for (const [key, e] of existing) {
      if (!desiredKeys.has(key)) removeMember(world, zoneId, e.type, e.id);
    }
    for (const m of mats) {
      const e = existing.get(m.memberKey);
      if (e) removeMember(world, zoneId, e.type, e.id);   // same id re-added below when types match
      addMember(world, zoneId, m);
    }
    world.updatePrefabInstance(zoneId, instanceId, { version: prefab.version });
  });
}

/** Strip prefab stamps from all members and remove the link record. */
export function unlinkInstance(world: WorldState, zoneId: string, instanceId: string): void {
  const members = collectInstanceMembers(world, zoneId, instanceId);
  world.transaction("unlink prefab instance", () => {
    for (const e of members.values()) {
      const changes = { prefab: undefined };
      switch (e.type) {
        case "object":         world.updateObject(zoneId, e.id, changes); break;
        case "trigger-volume": world.updateTriggerVolume(zoneId, e.id, changes); break;
        case "shape":          world.updateShape(zoneId, e.id, changes); break;
        case "stair":          world.updateStair(zoneId, e.id, changes); break;
        case "ladder":         world.updateLadder(zoneId, e.id, changes); break;
      }
    }
    world.removePrefabInstance(zoneId, instanceId);
  });
}

/** Delete the whole instance: every member plus the link record. */
export function deleteInstance(world: WorldState, zoneId: string, instanceId: string): void {
  const members = collectInstanceMembers(world, zoneId, instanceId);
  world.transaction("delete prefab instance", () => {
    for (const e of members.values()) removeMember(world, zoneId, e.type, e.id);
    world.removePrefabInstance(zoneId, instanceId);
  });
}

/** Remove a mixed-type set of entities (used when capture replaces the originals). */
export function removeEntities(world: WorldState, zoneId: string, refs: { type: EditorObjectType; id: string }[]): void {
  for (const r of refs) removeMember(world, zoneId, r.type, r.id);
}

// ── Snapshot capture (Phase 46) ──────────────────────────────────────────────

function anchorPoints(type: EditorObjectType, def: unknown): Vec3[] {
  const d = def as { position?: Vec3; start?: Vec3; end?: Vec3 };
  if (type === "stair") return [d.start!, d.end!];
  return d.position ? [d.position] : [];
}

function shiftAnchors(type: EditorObjectType, def: unknown, dx: number, dy: number, dz: number): void {
  const move = (p: Vec3): void => { p.x -= dx; p.y -= dy; p.z -= dz; };
  const d = def as { position?: Vec3; start?: Vec3; end?: Vec3 };
  if (type === "stair") { move(d.start!); move(d.end!); return; }
  if (d.position) move(d.position);
}

/**
 * Capture the selection as a snapshot prefab template. Template space: XZ pivot
 * at the anchors' centroid, y = 0 at the lowest anchor. memberKey = the source
 * entity id at capture time (also the key intra-prefab script refs remap
 * through on instantiation). Non-PREFABABLE refs are skipped and reported.
 * Does NOT touch the world — the caller decides whether to replace the
 * originals with a placed instance.
 */
export function captureSnapshotPrefab(
  world: WorldState, refs: { type: EditorObjectType; id: string; zoneId: string }[], name: string,
): { prefab: PrefabDef; origin: { position: Vec3; rotationY: number }; captured: { type: EditorObjectType; id: string }[]; skipped: EditorObjectType[] } | null {
  const usable = refs.filter(r => PREFABABLE.has(r.type));
  const skipped = [...new Set(refs.filter(r => !PREFABABLE.has(r.type)).map(r => r.type))];
  if (usable.length === 0) return null;
  const zone = world.zones.get(usable[0].zoneId);
  if (!zone) return null;

  const lookup = (type: EditorObjectType, id: string): unknown => {
    switch (type) {
      case "object":         return zone.objects.find(e => e.id === id);
      case "trigger-volume": return zone.triggerVolumes?.find(e => e.id === id);
      case "shape":          return zone.shapes?.find(e => e.id === id);
      case "stair":          return zone.stairs.find(e => e.id === id);
      case "ladder":         return zone.ladders?.find(e => e.id === id);
      default:               return undefined;
    }
  };

  const picked: { type: EditorObjectType; id: string; def: unknown }[] = [];
  for (const r of usable) {
    const src = lookup(r.type, r.id);
    if (src) picked.push({ type: r.type, id: r.id, def: structuredClone(src) });
  }
  if (picked.length === 0) return null;

  // Pivot: XZ centroid of all anchors, y at the lowest anchor.
  const anchors = picked.flatMap(p => anchorPoints(p.type, p.def));
  const px = anchors.reduce((s, a) => s + a.x, 0) / anchors.length;
  const pz = anchors.reduce((s, a) => s + a.z, 0) / anchors.length;
  const py = Math.min(...anchors.map(a => a.y));

  const template: PrefabTemplateEntity[] = picked.map(p => {
    shiftAnchors(p.type, p.def, px, py, pz);
    delete (p.def as { prefab?: unknown }).prefab;   // capturing another instance's member → fresh template
    return { memberKey: p.id, type: p.type, def: p.def };
  });

  const prefab: PrefabDef = {
    id:        `pfb_${uuid8()}`,
    name,
    kind:      "snapshot",
    version:   1,
    variables: [],
    template,
    dateAdded: new Date().toISOString().slice(0, 10),
  };
  return {
    prefab,
    origin:   { position: { x: px, y: py, z: pz }, rotationY: 0 },
    captured: picked.map(p => ({ type: p.type, id: p.id })),
    skipped,
  };
}
