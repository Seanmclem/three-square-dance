// Asset-reference collection for game export (phase D). Walks a project's
// scene JSONs + game.json and gathers every asset id the runtime can load, per
// kind, then resolves those ids to concrete files via the asset manifests.
//
// Plain TS, no DOM — imported by both the frontend and desktop/export.ts.

import type {
  SceneFile, GameConfig, ZoneDef, ScriptDef, ScriptAction, ScriptCondition,
  UiElementDef, ItemDef, DialogueTreeDef, PlayerSettings, WorldObject,
  PlatformDef, ShapeDef, StairDef, LadderDef, FloorDef, WallDef, TriggerVolume,
  AttachedSound, AssetManifest, MaterialManifest, SoundManifest, SkyboxManifest,
  GraphicsManifest, DecalManifest, MaterialDef, PrefabTemplateEntity,
} from "../types.ts";

export type AssetKind = "models" | "textures" | "audio" | "skyboxes" | "graphics" | "decals";

export interface AssetRefs {
  models:   Set<string>;   // AssetDef ids
  textures: Set<string>;   // MaterialDef ids
  audio:    Set<string>;   // SoundDef ids
  skyboxes: Set<string>;   // SkyboxDef ids ("sky" = built-in procedural, never collected)
  graphics: Set<string>;   // GraphicDef ids (uiElement graphicId fields)
  decals:   Set<string>;   // DecalTexDef ids
  /** Raw /assets/** paths used directly as <img src> (item icons, dialogue
   *  portraits) — matched back to manifest entries by path at resolve time. */
  rawPaths: Set<string>;
}

function newRefs(): AssetRefs {
  return {
    models: new Set(), textures: new Set(), audio: new Set(),
    skyboxes: new Set(), graphics: new Set(), decals: new Set(),
    rawPaths: new Set(),
  };
}

const add = (set: Set<string>, id: string | null | undefined): void => {
  if (id) set.add(id);
};

// ── per-shape collectors ─────────────────────────────────────────────────────

function collectActions(refs: AssetRefs, actions: ScriptAction[] | undefined): void {
  for (const a of actions ?? []) {
    add(refs.audio, a.sound);            // play_sound / stop_sound / set_footstep: SoundDef id
    add(refs.audio, a.music);            // play_music: SoundDef id
    add(refs.textures, a.material);      // change_material: MaterialDef id
    add(refs.rawPaths, a.dialogue?.portrait);  // legacy inline dialogue portrait (<img src> path)
  }
}

function collectConditions(_refs: AssetRefs, _conds: ScriptCondition[] | undefined): void {
  // Conditions reference state keys / item ids / npc ids — no asset files.
}

function collectScripts(refs: AssetRefs, scripts: ScriptDef[] | undefined): void {
  for (const s of scripts ?? []) {
    collectActions(refs, s.actions);
    collectConditions(refs, s.conditions);
  }
}

function collectAttachedSound(refs: AssetRefs, sound: AttachedSound | undefined): void {
  add(refs.audio, sound?.soundId);       // attached spatial emitter (object/platform/shape)
}

function collectUiElements(refs: AssetRefs, els: UiElementDef[] | undefined): void {
  for (const el of els ?? []) {
    switch (el.kind) {
      case "bar":     add(refs.graphics, el.graphicId); break;               // bar icon
      case "counter": add(refs.graphics, el.graphicId); break;               // counter icon
      case "icons":                                                          // repeated-icon meter
        add(refs.graphics, el.fullGraphicId);
        add(refs.graphics, el.halfGraphicId);
        add(refs.graphics, el.emptyGraphicId);
        break;
      case "image":   add(refs.graphics, el.graphicId); break;               // HUD image
      case "menu":                                                           // menu options run script actions
        for (const opt of el.options ?? []) {
          collectActions(refs, opt.actions);
          collectConditions(refs, opt.conditions);
        }
        break;
      case "label": break;   // text only
    }
  }
}

function collectItems(refs: AssetRefs, items: ItemDef[] | undefined): void {
  for (const it of items ?? []) add(refs.rawPaths, it.icon);   // item icon: bare <img src> path
}

function collectDialogues(refs: AssetRefs, trees: DialogueTreeDef[] | undefined): void {
  for (const t of trees ?? []) {
    add(refs.rawPaths, t.portrait);            // tree-level portrait (<img src> path)
    for (const n of t.nodes ?? []) {
      add(refs.rawPaths, n.portrait);          // per-node portrait override
      for (const opt of n.options ?? []) {
        collectActions(refs, opt.actions);     // option actions run through ScriptEngine
        collectConditions(refs, opt.conditions);
      }
    }
  }
}

function collectObject(refs: AssetRefs, o: WorldObject): void {
  add(refs.models, o.assetId);               // placed model
  add(refs.textures, o.material);            // per-object material override (change_material target state)
  collectAttachedSound(refs, o.sound);
  collectScripts(refs, o.scripts);
}

function collectPlatform(refs: AssetRefs, p: PlatformDef): void {
  add(refs.textures, p.material);            // top face
  add(refs.textures, p.sideMaterial);        // side faces
  add(refs.textures, p.bottomMaterial);      // bottom cap (ceilings)
  collectAttachedSound(refs, p.sound);
}

function collectShape(refs: AssetRefs, s: ShapeDef): void {
  add(refs.textures, s.material);            // caps
  add(refs.textures, s.sideMaterial);        // sides
  for (const f of s.mesh?.faces ?? []) add(refs.textures, f.material);  // per-face brush materials
  collectAttachedSound(refs, s.sound);
}

function collectStair(refs: AssetRefs, s: StairDef): void {
  add(refs.textures, s.material);            // body / treads
  add(refs.textures, s.riserMaterial);
  add(refs.textures, s.landingMaterial);
  add(refs.textures, s.railingMaterial);
}

function collectLadder(refs: AssetRefs, l: LadderDef): void {
  add(refs.textures, l.material);            // rails + rungs
}

function collectFloor(refs: AssetRefs, f: FloorDef): void {
  add(refs.textures, f.floorMesh?.material); // floor slab
}

function collectWall(refs: AssetRefs, w: WallDef): void {
  add(refs.textures, w.material);            // interior face
  add(refs.textures, w.exteriorMaterial);    // exterior face
}

function collectTriggerVolume(refs: AssetRefs, v: TriggerVolume): void {
  collectScripts(refs, v.scripts);           // visual fill is a shader gradient — no textures
}

/** Prefab template members are full entity defs — route by declared type. */
function collectPrefabTemplate(refs: AssetRefs, template: PrefabTemplateEntity[] | undefined): void {
  for (const m of template ?? []) {
    switch (m.type) {
      case "object":         collectObject(refs, m.def as WorldObject); break;
      case "shape":          collectShape(refs, m.def as ShapeDef); break;
      case "stair":          collectStair(refs, m.def as StairDef); break;
      case "ladder":         collectLadder(refs, m.def as LadderDef); break;
      case "platform":       collectPlatform(refs, m.def as PlatformDef); break;
      case "trigger-volume": collectTriggerVolume(refs, m.def as TriggerVolume); break;
      default: break;   // walls/floors/etc. can't be prefab members today
    }
  }
}

function collectPlayerSettings(refs: AssetRefs, ps: PlayerSettings | undefined): void {
  if (!ps) return;
  add(refs.models, ps.modelAssetId);         // third-person avatar model
  add(refs.audio, ps.jumpSound);             // locomotion one-shots
  add(refs.audio, ps.landSound);
  add(refs.audio, ps.footstepSound);
}

function collectZone(refs: AssetRefs, z: ZoneDef): void {
  for (const f of z.floors ?? [])          collectFloor(refs, f);
  for (const w of z.walls ?? [])           collectWall(refs, w);
  for (const p of z.platforms ?? [])       collectPlatform(refs, p);
  for (const s of z.stairs ?? [])          collectStair(refs, s);
  for (const l of z.ladders ?? [])         collectLadder(refs, l);
  for (const o of z.objects ?? [])         collectObject(refs, o);
  for (const v of z.triggerVolumes ?? [])  collectTriggerVolume(refs, v);
  for (const d of z.decals ?? [])          add(refs.decals, d.textureId);  // decal texture
  for (const s of z.shapes ?? [])          collectShape(refs, s);
  collectScripts(refs, z.scripts);           // zone-level scripts
  collectDialogues(refs, z.dialogues);       // dialogue trees (portraits + option actions)
  // checkpoints, lights, nodes, prefabInstances: no asset references
}

// ── public API ───────────────────────────────────────────────────────────────

/** Walk every scene + the shared game config and collect referenced asset ids. */
export function collectAssetRefs(scenes: SceneFile[], game: GameConfig | null): AssetRefs {
  const refs = newRefs();

  for (const scene of scenes) {
    const w = scene.world;
    if (w) {
      if (w.skybox && w.skybox !== "sky") add(refs.skyboxes, w.skybox);  // "sky" = built-in procedural
      collectPlayerSettings(refs, w.playerSettings);
      add(refs.audio, w.audio?.music?.soundId);    // scene music track
      add(refs.audio, w.audio?.ambient?.soundId);  // scene ambient loop
      collectScripts(refs, w.scripts);             // world-level scripts
      collectItems(refs, w.items);                 // scene item registry (icons)
      collectUiElements(refs, w.uiElements);       // scene GUI registry
    }
    // terrain.layerMaterials is vestigial (no consumer anywhere in src/) — skipped.
    for (const z of scene.zones ?? []) collectZone(refs, z);
  }

  if (game) {
    collectItems(refs, game.items);                // game-wide item registry (icons)
    collectUiElements(refs, game.uiElements);      // game-wide GUI registry
    for (const p of game.prefabs ?? []) collectPrefabTemplate(refs, p.template);  // prefab library templates
  }

  return refs;
}

export interface ResolvedFiles {
  files: Array<{ kind: AssetKind; rel: string }>;
  /** Same JSON shape as the source manifests, entries filtered to referenced ids. */
  prunedManifests: Record<AssetKind, unknown>;
  /** Referenced ids/paths with no manifest entry (or malformed paths) — reported, never thrown. */
  missing: string[];
}

export interface ManifestSet {
  models?:   AssetManifest;
  textures?: MaterialManifest;
  audio?:    SoundManifest;
  skyboxes?: SkyboxManifest;
  graphics?: GraphicsManifest;
  decals?:   DecalManifest;
}

const QUALITY_TIERS = ["low", "medium", "high"] as const;

/** Map referenced ids to concrete files under assets/<kind>/, and prune each
 *  manifest down to the referenced entries. Unknown ids land in `missing`. */
export function resolveAssetFiles(refs: AssetRefs, manifests: ManifestSet): ResolvedFiles {
  const missing: string[] = [];
  const files = new Map<string, { kind: AssetKind; rel: string }>();

  // Manifest paths look like "/assets/<kind>/<rel>". Register the file, or
  // report a path that doesn't live under the kind's tree.
  const addPath = (kind: AssetKind, path: string | undefined): void => {
    if (!path) return;
    const prefix = `/assets/${kind}/`;
    if (!path.startsWith(prefix) || path.includes("..")) {
      missing.push(`${kind}: unresolvable path "${path}"`);
      return;
    }
    const rel = path.slice(prefix.length);
    files.set(`${kind}/${rel}`, { kind, rel });
  };

  // Texture map paths carry a {quality} token — expand to all three tiers
  // (the player can switch quality at runtime).
  const addTexturePath = (path: string): void => {
    if (path.includes("{quality}")) {
      for (const q of QUALITY_TIERS) addPath("textures", path.replace("{quality}", q));
    } else {
      addPath("textures", path);
    }
  };

  // models — file + OBJ companion .mtl. Thumbnails are editor-only (the runtime
  // never fetches them), so thumbnail files are excluded and the field dropped.
  const modelEntries = (manifests.models?.assets ?? []).filter(a => refs.models.has(a.id));
  for (const id of refs.models) if (!modelEntries.some(a => a.id === id)) missing.push(`models: ${id}`);
  for (const a of modelEntries) { addPath("models", a.path); addPath("models", a.mtlPath); }

  // textures — every map slot ships (overrides can re-enable disabled maps), all quality tiers.
  const materialEntries = (manifests.textures?.materials ?? []).filter(m => refs.textures.has(m.id));
  for (const id of refs.textures) if (!materialEntries.some(m => m.id === id)) missing.push(`textures: ${id}`);
  for (const m of materialEntries) {
    for (const key of Object.keys(m.maps) as Array<keyof MaterialDef["maps"]>) {
      addTexturePath(m.maps[key].path);
    }
  }

  // audio
  const soundEntries = (manifests.audio?.sounds ?? []).filter(s => refs.audio.has(s.id));
  for (const id of refs.audio) if (!soundEntries.some(s => s.id === id)) missing.push(`audio: ${id}`);
  for (const s of soundEntries) addPath("audio", s.path);

  // skyboxes — path only; thumbnails are editor-only (see models).
  const skyboxEntries = (manifests.skyboxes?.skyboxes ?? []).filter(s => refs.skyboxes.has(s.id));
  for (const id of refs.skyboxes) if (!skyboxEntries.some(s => s.id === id)) missing.push(`skyboxes: ${id}`);
  for (const s of skyboxEntries) addPath("skyboxes", s.path);

  // graphics — referenced by id (uiElements) and by raw path (item icons,
  // dialogue portraits). Raw paths match back to entries by path so the pruned
  // manifest stays consistent; unmatched /assets/graphics/ paths still ship.
  const allGraphics = manifests.graphics?.graphics ?? [];
  const graphicIds = new Set(refs.graphics);
  for (const p of refs.rawPaths) {
    const byPath = allGraphics.find(g => g.path === p);
    if (byPath) graphicIds.add(byPath.id);
    else if (p.startsWith("/assets/graphics/")) addPath("graphics", p);
    else missing.push(`graphics: unresolvable path "${p}"`);
  }
  const graphicEntries = allGraphics.filter(g => graphicIds.has(g.id));
  for (const id of refs.graphics) if (!allGraphics.some(g => g.id === id)) missing.push(`graphics: ${id}`);
  for (const g of graphicEntries) addPath("graphics", g.path);

  // decals — albedo + optional PBR maps (overlay kind loads normal/roughness).
  const decalEntries = (manifests.decals?.decals ?? []).filter(d => refs.decals.has(d.id));
  for (const id of refs.decals) if (!decalEntries.some(d => d.id === id)) missing.push(`decals: ${id}`);
  for (const d of decalEntries) {
    addPath("decals", d.path);
    addPath("decals", d.maps?.normal);
    addPath("decals", d.maps?.roughness);
  }

  const prunedManifests: Record<AssetKind, unknown> = {
    models:   { ...(manifests.models ?? { version: "1.0" }), assets: modelEntries.map(({ thumbnail: _t, ...rest }) => rest) },
    textures: { ...(manifests.textures ?? { version: "1.0" }), materials: materialEntries },
    audio:    { ...(manifests.audio ?? { version: "1.0" }), sounds: soundEntries },
    skyboxes: { ...(manifests.skyboxes ?? { version: "1.0" }), skyboxes: skyboxEntries.map(({ thumbnail: _t, ...rest }) => rest) },
    graphics: { ...(manifests.graphics ?? { version: "1.0" }), graphics: graphicEntries },
    decals:   { ...(manifests.decals ?? { version: "1.0" }), decals: decalEntries },
  };

  return { files: [...files.values()], prunedManifests, missing };
}
