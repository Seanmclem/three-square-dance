import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EventBus } from "@/core/EventBus";
import { SceneManager } from "@/core/SceneManager";
import { PreviewController } from "@/preview/PreviewController";
import { AudioSystem } from "@/audio/AudioSystem";
import { ObjectPlacer } from "@/preview/ObjectPlacer";
import { assetManager } from "@/core/AssetManager";
import { InputManager } from "@/core/InputManager";
import { WorldState } from "@/world/WorldState";
import { ZoneManager } from "@/world/ZoneManager";
import { MoverSystem } from "@/world/MoverSystem";
import { SelectionManager } from "@/editor/SelectionManager";
import { isSelectMode } from "@/editor/selectMode";
import { FloorTool } from "@/editor/FloorTool";
import { PolygonFloorTool } from "@/editor/PolygonFloorTool";
import { WallTool } from "@/editor/WallTool";
import { PlatformTool } from "@/editor/PlatformTool";
import { PolygonPlatformTool } from "@/editor/PolygonPlatformTool";
import { StairTool } from "@/editor/StairTool";
import { LadderTool } from "@/editor/LadderTool";
import { ShapeTool } from "@/editor/ShapeTool";
import { ShapeResizer } from "@/editor/ShapeResizer";
import { BrushVertexEditor } from "@/editor/BrushVertexEditor";
import { BrushFaceHighlighter } from "@/editor/BrushFaceHighlighter";
import { BrushFaceEditor } from "@/editor/BrushFaceEditor";
import { BrushEdgeEditor } from "@/editor/BrushEdgeEditor";
import { ObjectTool } from "@/editor/ObjectTool";
import { PrefabTool } from "@/editor/PrefabTool";
import { GENERATORS } from "@/prefab/generators";
import { loadSessionPrefabs, saveSessionPrefabs, promoteSessionPrefabs } from "@/prefab/library";
import { reexpandInstance, unlinkInstance, deleteInstance, captureSnapshotPrefab, removeEntities, instantiatePrefab, findInstances, collectInstanceMembers } from "@/prefab/expand";
import { PrefabEditSession } from "@/prefab/PrefabEditSession";
import { PrefabEditBar } from "@/ui/PrefabEditBar";
import { NodeDragger } from "@/editor/NodeDragger";
import { OpeningDragHandler } from "@/editor/OpeningDragHandler";
import { GizmoManager } from "@/editor/GizmoManager";
import { SpawnPointTool } from "@/editor/SpawnPointTool";
import { CheckpointTool } from "@/editor/CheckpointTool";
import { LightTool } from "@/editor/LightTool";
import { TriggerVolumeTool } from "@/editor/TriggerVolumeTool";
import { DecalTool } from "@/editor/DecalTool";
import { TriggerVolumeResizer } from "@/editor/TriggerVolumeResizer";
import { ColliderEditor } from "@/editor/ColliderEditor";
import { WallSplitter } from "@/editor/WallSplitter";
import { SegmentHighlighter } from "@/editor/SegmentHighlighter";
import { defaultColliderFromAABB } from "@/physics/attachedColliderMath";
import { StairCutterResizer } from "@/editor/StairCutterResizer";
import { ScriptEngine } from "@/scripting/ScriptEngine";
import { gameState, GAMESAVE_KEY, DEFAULT_STATE_SCHEMA } from "@/scripting/GameState";
import { DialogueOverlay } from "@/ui/DialogueOverlay";
import { FadeOverlay, type FadeRequest } from "@/preview/FadeOverlay";
import { FlashOverlay, type FlashRequest } from "@/preview/FlashOverlay";
import { installTestHelpers } from "@/dev/testHelpers";
import { physicsWorld } from "@/physics/PhysicsWorld";
import { Toolbar } from "@/ui/Toolbar";
import { TopBar } from "@/ui/TopBar";
import { PreviewHUD } from "@/ui/PreviewHUD";
import { TouchControlsOverlay } from "@/ui/TouchControlsOverlay";
import { PauseMenu } from "@/ui/PauseMenu";
import { BagOverlay } from "@/ui/BagOverlay";
import { GameGuiOverlay } from "@/ui/GameGuiOverlay";
import { DEFAULT_BINDINGS, loadBindings, saveBindings, resetBindings } from "@/input/bindings";
import { PropertiesPanel } from "@/ui/PropertiesPanel";
import { CoordinateDisplay } from "@/ui/CoordinateDisplay";
import { FpsCounter } from "@/ui/FpsCounter";
import { LeftPanel } from "@/ui/LeftPanel";
import { ModelImporterModal } from "@/ui/ModelImporterModal";
import { MaterialImporterModal } from "@/ui/MaterialImporterModal";
import { AudioImporterModal } from "@/ui/AudioImporterModal";
import { GraphicsImporterModal } from "@/ui/GraphicsImporterModal";
import { SkyboxImporterModal } from "@/ui/SkyboxImporterModal";
import { ScriptDetachDialog } from "@/ui/ScriptDetachDialog";
import { DeleteAssetDialog } from "@/ui/DeleteAssetDialog";
import { EditMetadataDialog, type EditPatch } from "@/ui/EditMetadataDialog";
import { ThumbnailStagerModal } from "@/ui/ThumbnailStagerModal";
import { ReoriginModal } from "@/ui/ReoriginModal";
import { applyGltfReorigin, instanceWorldShift } from "@/core/gltfReorigin";
import { dataURLtoArrayBuffer, renderModelThumbnail } from "@/editor/thumbnailRenderer";
import { bakeShapes, disposeBakeGroup } from "@/editor/bakeShapes";
import { writeAssetToLibrary, writeAssetFile, removeAssetFiles, removeEntries, updateEntries, upsertEntry } from "@/assets/assetLibrary";
import { BakeDialog } from "@/ui/BakeDialog";
import { MAT_CAT_ORDER } from "@/ui/materialCategories";
import type { ToolId, Vec2, Vec3, SelectedObjectPayload, SelectedRef, WorldObject, ZoneDef, FloorDef, WallDef, Opening, MaterialDef, QualityScale, PlatformDef, StairDef, LadderDef, ShapeDef, SceneFile, AssetDef, AttachedCollider, LeftPanelId, PlayerSettings, ScriptDef, TriggerVolume, CheckpointDef, LightDef, GroupDef, Attribution, JsonValue, StateSchema, NodeLinks, DecalTexDef, DecalKind, DecalDef, PreviewMode, DialogueTreeDef, ItemDef, WorldAudio, SoundDef, SkyboxDef, GraphicDef, UiElementDef, PrefabDef, PrefabVarValue } from "@/types";
import { isGameplayMode } from "@/types";

const ASSET_CATEGORIES = ["Furniture", "Props", "Structures", "Lights", "Characters", "Vegetation", "Other"];

type PendingEdit = {
  ids:     string[];
  items:   { id: string; label: string }[];
  initial: { label: string; category: string; attribution: Attribution; tags?: string[] };
};
import { HistoryManager } from "@/editor/HistoryManager";
import { copySelection, copySelectionMulti, pasteClipboard, type Clipboard } from "@/editor/copyPaste";
import { membersByGroup, entityGroupIds, writeGroupIds, type GroupMember } from "@/editor/groupMembers";
import { migrateWallNodes, pruneOrphanNodes, migrateUVs, migrateDialogues, migrateWorldLighting } from "@/world/WorldLoader";
import { seedStartingInventory } from "@/scripting/inventory";
import { registerEntityStateSchemas } from "@/scripting/entityState";
import { ProjectStore, uniqueSceneId, slugifyId, persistLastProject, clearLastProject, restoreLastProject } from "@/project/ProjectStore";
import { desktop, detectDesktop, isDesktop, isDesktopDev } from "@/shared/desktopApi";
import { startPerfReporter } from "@/dev/perfReporter";
import { NewProjectModal } from "@/ui/NewProjectModal";
import { OpenProjectModal } from "@/ui/OpenProjectModal";
import { resolveRunNodeIds } from "@/utils/wallRuns";

const DEMO_ZONE_ID = "demo";

// ── Autosave storage (phase 55): workspace file via the desktop shell when
// available (atomic, survives cache clears), localStorage in a plain browser.
function storeAutosave(json: string, meta: { projectId: string | null; sceneId: string | null }): number {
  const ts = Date.now();
  const d = desktop();
  if (d) {
    void d.writeAutosave(meta, json).catch(e => console.warn("autosave write failed:", e));
  } else {
    localStorage.setItem("worldeditor_autosave", json);
    localStorage.setItem("worldeditor_autosave_ts", ts.toString());
  }
  return ts;
}

function clearStoredAutosave(): void {
  void desktop()?.clearAutosave().catch(() => {});
  localStorage.removeItem("worldeditor_autosave");
  localStorage.removeItem("worldeditor_autosave_ts");
}

async function readStoredAutosave(): Promise<{ json: string; ts: number } | null> {
  const d = desktop();
  if (d) {
    const a = await d.readAutosave();
    return a ? { json: a.json, ts: Date.parse(a.meta.savedAt) } : null;
  }
  const json = localStorage.getItem("worldeditor_autosave");
  const ts = localStorage.getItem("worldeditor_autosave_ts");
  return json && ts ? { json, ts: parseInt(ts, 10) } : null;
}

/** Last-modified time of a project scene file on disk (ms epoch), or null when
 *  unknowable (no shell, 404, no header). Used to detect external edits. */
async function sceneFileMtime(projectId: string, sceneId: string): Promise<number | null> {
  try {
    const res = await fetch(`/games/${projectId}/scenes/${sceneId}.json`, { method: "HEAD", cache: "no-store" });
    if (!res.ok) return null;
    const lm = res.headers.get("last-modified");
    return lm ? Date.parse(lm) : null;
  } catch { return null; }
}

function createDemoZone(): ZoneDef {
  return {
    id: DEMO_ZONE_ID,
    name: "Demo Zone",
    type: "outdoor",
    bounds: { x: -250, z: -250, width: 500, depth: 500 },
    nodes:     [],
    floors:    [],
    walls:     [],
    platforms: [],
    stairs:    [],
    objects:   [],
  };
}

export default function App() {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const busRef           = useRef<EventBus>(new EventBus());
  const worldRef         = useRef<WorldState | null>(null);
  const zonesRef         = useRef<ZoneManager | null>(null);
  const historyRef       = useRef<HistoryManager | null>(null);
  const objectPlacerRef  = useRef<ObjectPlacer | null>(null);
  const sceneRef         = useRef<SceneManager | null>(null);
  const previewRef       = useRef<PreviewController | null>(null);
  const scriptEngineRef  = useRef<ScriptEngine | null>(null);

  const [activeTool,       setActiveTool]       = useState<ToolId>("select");
  const [spawnMode,        setSpawnMode]        = useState<"initial" | "checkpoint">("initial");
  const [activeFloor,      setActiveFloor]      = useState<number>(0);
  const [coords,           setCoords]           = useState<Vec3>({ x: 0, y: 0, z: 0 });
  const [selected,         setSelected]         = useState<SelectedObjectPayload | null>(null);
  // Mirror for bus handlers registered once (their `selected` closure is stale).
  const selectedRef = useRef<SelectedObjectPayload | null>(null);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  const [multiSelected,    setMultiSelected]    = useState<SelectedRef[]>([]);
  const [materialList,     setMaterialList]     = useState<MaterialDef[]>([]);
  const [quality,          setQuality]          = useState<QualityScale>(
    () => (localStorage.getItem('editorQuality') as QualityScale) ?? 'high',
  );
  // Global preview-overlay toggles (EDITOR section of the panel) — persisted like editorQuality.
  const [showPerfCounter, setShowPerfCounter] = useState(() => localStorage.getItem('editorShowPerf') !== '0');
  const [showCrosshair,   setShowCrosshair]   = useState(() => localStorage.getItem('editorShowCrosshair') !== '0');
  const [showGridFloor,   setShowGridFloor]   = useState(() => localStorage.getItem('editorShowGrid') !== '0');
  const [autoFloorPrompt, setAutoFloorPrompt] = useState<{ zoneId: string; level: number; points: Vec2[]; nodeIds: string[] } | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [leftPanel,       setLeftPanel]        = useState<LeftPanelId>(null);
  const [assets,          setAssets]           = useState<AssetDef[]>([]);
  const [selectedAssetId, setSelectedAssetId]  = useState<string | null>(null);
  const [decalTextures,   setDecalTextures]    = useState<DecalTexDef[]>([]);
  const [selectedDecalId, setSelectedDecalId]  = useState<string | null>(null);
  const [showImporter,    setShowImporter]     = useState(false);
  const [pendingAssetDelete, setPendingAssetDelete] = useState<
    { ids: string[]; labels: string[]; usage: { count: number; zones: string[] } } | null
  >(null);
  const [sounds,          setSounds]           = useState<SoundDef[]>([]);
  const [audioImporterOpen, setAudioImporterOpen] = useState(false);
  const [pendingSoundEdit, setPendingSoundEdit] = useState<PendingEdit | null>(null);
  const [skyboxes,        setSkyboxes]         = useState<SkyboxDef[]>([]);
  const [skyboxImporterOpen, setSkyboxImporterOpen] = useState(false);
  const [graphics,        setGraphics]         = useState<GraphicDef[]>([]);
  const [graphicsImporterOpen, setGraphicsImporterOpen] = useState(false);
  const [pendingGraphicDelete, setPendingGraphicDelete] = useState<
    { ids: string[]; labels: string[]; usage: { count: number; zones: string[] } } | null
  >(null);
  const [pendingGraphicEdit, setPendingGraphicEdit] = useState<PendingEdit | null>(null);
  const [pendingSkyboxEdit, setPendingSkyboxEdit] = useState<PendingEdit | null>(null);
  // Shapes queued for bake-to-GLB (Phase 26) — non-null renders the BakeDialog.
  const [bakeRefs,        setBakeRefs]         = useState<SelectedRef[] | null>(null);
  const [materialImporterOpen, setMaterialImporterOpen] = useState(false);
  const [pendingMaterialDelete, setPendingMaterialDelete] = useState<
    { ids: string[]; labels: string[]; usage: { count: number; zones: string[] } } | null
  >(null);
  const [pendingAssetEdit,    setPendingAssetEdit]    = useState<PendingEdit | null>(null);
  const [stagingAsset,        setStagingAsset]        = useState<AssetDef | null>(null);
  const [reoriginAsset,       setReoriginAsset]       = useState<AssetDef | null>(null);
  const [pendingMaterialEdit, setPendingMaterialEdit] = useState<PendingEdit | null>(null);
  const [zones,           setZones]            = useState<ZoneDef[]>([]);
  const [activeZoneId,    setActiveZoneId]     = useState<string | null>(DEMO_ZONE_ID);
  const [groups,          setGroups]           = useState<GroupDef[]>([]);
  const [hiddenGroups,    setHiddenGroups]      = useState<Set<string>>(new Set());
  const [membershipRev,   setMembershipRev]     = useState(0); // bumps when any entity's groupIds change
  const [isDirty,         setIsDirty]          = useState(false);
  const [lastAutosaveAt,  setLastAutosaveAt]   = useState<number | null>(null);
  const [isPreview,       setIsPreview]        = useState(false);
  const [previewScheme,   setPreviewScheme]    = useState<"kbm" | "gamepad" | "touch">("kbm");
  const dialogueOpenRef = useRef(false);   // bus handlers need the current value, not a stale closure
  const [pauseOpen, setPauseOpen] = useState(false);
  const pauseOpenRef = useRef(false);
  const [bagOpen, setBagOpen] = useState(false);
  const bagOpenRef = useRef(false);
  const [isGame,          setIsGame]           = useState(false);
  const [previewMode,     setPreviewMode]      = useState<PreviewMode | null>(null);
  const previewModeRef = useRef<PreviewMode | null>(null);   // preview:stop needs the session's mode (save gating)
  // load_scene fired during preview (project mode): mid-route teardown flag + the scene
  // the user launched preview from, restored on preview exit (non-destructive round-trip).
  const routingRef = useRef(false);
  const routeReturnSceneRef = useRef<string | null>(null);
  const [, setPlayerSettingsRev]               = useState(0);
  const [dialogueState,   setDialogueState]    = useState<{ speaker: string; lines: string[]; portrait?: string; options?: { text: string; hasNext: boolean }[] } | null>(null);
  const [fadeState,       setFadeState]        = useState<FadeRequest | null>(null);
  const [flashState,      setFlashState]       = useState<FlashRequest | null>(null);
  const [zoneScripts,     setZoneScripts]      = useState<ScriptDef[]>([]);
  const [zoneDialogues,   setZoneDialogues]    = useState<DialogueTreeDef[]>([]);
  const [stateSchema,     setStateSchema]      = useState<Record<string, StateSchema>>({});
  const [worldItems,      setWorldItems]       = useState<ItemDef[]>([]);
  const [worldUiElements, setWorldUiElements]  = useState<UiElementDef[]>([]);
  const [prefabs,         setPrefabs]          = useState<PrefabDef[]>([]);
  const [prefabTick,      setPrefabTick]       = useState(0);   // bumps on instance add/remove → refreshes counts
  // Isolated prefab edit mode (Phase 47). The ref gates autosave/save/play
  // synchronously (state is for rendering the bar + disabling UI).
  const [editingPrefab,   setEditingPrefab]    = useState<{ id: string; name: string } | null>(null);
  const editingPrefabRef = useRef(false);
  const editSessionRef   = useRef<PrefabEditSession | null>(null);
  // Swallow selection-teardown events while a prefab re-expansion is in flight
  // (members are removed + re-added; without this the panel unmounts mid-edit).
  const suppressSelRef   = useRef(false);
  // Undo/redo of an instance-affecting transaction replays the same remove/
  // re-add churn as a re-expansion — with a prefab instance selected, the
  // gizmo must detach first or it holds half-disposed tile meshes (the
  // v4.42.7 melt, reachable via Cmd+Z). The memoized undo/redo handlers read
  // the current instance-selection context through this ref.
  const undoInstanceCtxRef = useRef<{ zoneId: string; instanceId: string; primaryId: string } | null>(null);
  // Project-level (game.json) state schema — the STATE tab's GAME scope mirror.
  const [gameSchema,      setGameSchema]       = useState<Record<string, StateSchema>>({});
  // Phase 33 — project (multi-scene game folder). null = classic single-scene editing.
  interface ProjectCtx { store: ProjectStore; sceneId: string; rev: number }
  const [project, setProject] = useState<ProjectCtx | null>(null);
  const projectRef = useRef<ProjectCtx | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [openProjectOpen, setOpenProjectOpen] = useState(false);
  const [triggerVolumes,  setTriggerVolumes]   = useState<TriggerVolume[]>([]);
  const [checkpoints,     setCheckpoints]      = useState<CheckpointDef[]>([]);
  const [zoneLights,      setZoneLights]       = useState<LightDef[]>([]);
  // World-level ambient/sun (WorldConfig) — synced from the world:lighting bus event;
  // seeded with the visual-parity defaults so the panel works before any load/save.
  const [worldLighting,   setWorldLighting]    = useState<{ ambient: { color: string; intensity: number }; sun: { color: string; intensity: number }; envIntensity: number; quality?: "fancy" | "fast" }>({
    ambient: { color: "#aabbcc", intensity: 0.5 },
    sun:     { color: "#fff4e0", intensity: 2.0 },
    envIntensity: 1,
    quality: "fancy",
  });
  // Scene-level audio (WorldConfig.audio) — synced from the world:audio bus event (Phase 36).
  const [worldAudio, setWorldAudio] = useState<WorldAudio | undefined>(undefined);
  // Selected skybox (WorldConfig.skybox) — synced from the world:sky bus event (Phase 37).
  // "sky" = built-in procedural sky.
  const [worldSkybox, setWorldSkybox] = useState<string>("sky");
  const [deletePrompt,    setDeletePrompt]     = useState<{ type: "volume" | "object"; id: string; zoneId: string; scripts: ScriptDef[] } | null>(null);
  const restoringRef   = useRef(false);
  // Serialized world as loaded by THIS tab — writeAutosave's no-change gate.
  const autosaveBaselineRef = useRef<string | null>(null);
  const clipboardRef   = useRef<Clipboard | null>(null);
  const pasteCountRef  = useRef(0);

  const syncHistory = useCallback((): void => {
    const hu = historyRef.current?.canUndo ?? false;
    const hr = historyRef.current?.canRedo ?? false;
    setCanUndo(hu);
    setCanRedo(hr);
    if (hu) setIsDirty(true);
  }, []);

  // Last frame's draw calls + triangles for the FpsCounter readout (stable ref — the
  // counter samples it inside its own rAF loop, 2×/sec).
  const getRenderInfo = useCallback(() => {
    const r = sceneRef.current?.renderer;
    return r ? { calls: r.info.render.calls, triangles: r.info.render.triangles } : null;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bus = busRef.current;

    const scene     = new SceneManager(canvas, bus);
    sceneRef.current = scene;
    // Apply the persisted grid preference (read directly — this effect runs once,
    // before any toggle can change the state).
    if (localStorage.getItem('editorShowGrid') === '0') scene.setGridVisible(false);
    assetManager.init(scene.renderer);
    // Store the promise so the init IIFE can await it before building geometry.
    // initMaterials() races against physicsWorld.init() (WASM instantiation) and can
    // lose, leaving _materialRegistry empty when WallBuilder.build calls getMaterial().
    const materialsReady = assetManager.initMaterials().then(mats => {
      setMaterialList(mats);
      bus.emit("materials:loaded", { materials: mats });
    }).catch(err => console.error("initMaterials failed:", err));
    assetManager.initAssets().then(defs => {
      setAssets(defs);
      bus.emit("assets:loaded", { assets: defs });
    }).catch(err => console.error("initAssets failed:", err));
    assetManager.initDecals().then(defs => setDecalTextures(defs))
      .catch(err => console.error("initDecals failed:", err));
    assetManager.initAudio().then(defs => {
      setSounds(defs);
      bus.emit("sounds:loaded", { sounds: defs });
    }).catch(err => console.error("initAudio failed:", err));
    assetManager.initGraphics().then(defs => setGraphics(defs))
      .catch(err => console.error("initGraphics failed:", err));
    // Awaited before the scene load (below) so the registry is ready when the loaded
    // scene's world:sky fires — otherwise a saved image skybox would fail to _applySkybox
    // on cold load and silently fall back to the procedural sky.
    const skyboxesReady = assetManager.initSkyboxes().then(defs => {
      setSkyboxes(defs);
      bus.emit("skyboxes:loaded", { skyboxes: defs });
    }).catch(err => console.error("initSkyboxes failed:", err));
    const world     = new WorldState(bus);
    worldRef.current = world;
    const objectPlacer = new ObjectPlacer(bus);
    objectPlacerRef.current = objectPlacer;
    const movers    = new MoverSystem(bus);
    const zones     = new ZoneManager(scene.scene, world, bus, objectPlacer, movers);
    zones.enableEditorGhosts();   // see-through editorGhost ceilings (editor shell only)
    zones.enableLevelDimming();   // translucent non-active floor levels (editor shell only)
    zonesRef.current = zones;
    const history   = new HistoryManager(world, syncHistory);
    historyRef.current = history;
    world.setHistory(history);
    bus.on("world:loaded",  () => { history.clear(); syncHistory(); });
    bus.on("scene:loaded",  () => { history.clear(); syncHistory(); });

    const preview = new PreviewController(bus, world, scene, zones, movers);
    previewRef.current = preview;
    const audio = new AudioSystem(bus, world, scene);
    const input     = new InputManager(canvas, scene.camera, bus, scene.scene);
    const selection = new SelectionManager(scene.scene, scene.camera, canvas, world, bus);
    const floorTool    = new FloorTool(scene.scene, world, bus, history);
    const polyFloorTool = new PolygonFloorTool(scene.scene, world, bus, history);
    const wallTool     = new WallTool(scene.scene, world, bus, history);
    const platformTool       = new PlatformTool(scene.scene, world, bus, history);
    const polyPlatformTool   = new PolygonPlatformTool(scene.scene, world, bus, history);
    const stairTool          = new StairTool(scene.scene, world, bus, history);
    const ladderTool         = new LadderTool(world, bus);
    const shapeTool          = new ShapeTool(scene.scene, world, bus, history);
    const shapeResizer       = new ShapeResizer(scene.scene, world, bus, scene.camera, canvas);
    const brushVertexEditor  = new BrushVertexEditor(scene.scene, world, bus, scene.camera, canvas);
    const brushFaceHighlighter = new BrushFaceHighlighter(scene.scene, world, bus);
    const brushFaceEditor    = new BrushFaceEditor(scene.scene, world, bus, scene.camera, canvas);
    const brushEdgeEditor    = new BrushEdgeEditor(scene.scene, world, bus, scene.camera, canvas);
    const objectTool         = new ObjectTool(scene.scene, world, bus, history, assetManager);
    const prefabTool         = new PrefabTool(scene.scene, world, bus);
    const nodeDragger    = new NodeDragger(scene.scene, world, bus, scene.camera);
    const openingDragger = new OpeningDragHandler(scene.scene, scene.camera, canvas, world, bus, history);
    const gizmoManager   = new GizmoManager(scene.scene, scene.camera, canvas, world, bus);
    const spawnPointTool  = new SpawnPointTool(scene.scene, world, bus);
    const checkpointTool  = new CheckpointTool(scene.scene, world, bus);
    const lightTool       = new LightTool(world, bus);
    const triggerVolumeTool = new TriggerVolumeTool(scene.scene, world, bus, history, scene.camera, canvas);
    const decalTool         = new DecalTool(scene.scene, world, bus, scene.camera, canvas);
    const triggerVolumeResizer = new TriggerVolumeResizer(scene.scene, world, bus, scene.camera, canvas);
    const stairCutterResizer = new StairCutterResizer(scene.scene, world, bus, scene.camera, canvas);
    const colliderEditor  = new ColliderEditor(scene.scene, world, bus, scene.camera, canvas, objectPlacer);
    const wallSplitter    = new WallSplitter(scene.scene, scene.camera, canvas, world, bus);
    const segmentHighlighter = new SegmentHighlighter(scene.scene, world, bus);
    const scriptEngine    = new ScriptEngine(bus, world);
    scriptEngineRef.current = scriptEngine;

    // Generic gameplay-state store: wire the bus (so mutations emit state:changed →
    // on_state_changed). Registered schema is authored per-level (world.stateSchema) and
    // applied on preview:start; see DEFAULT_STATE_SCHEMA for the fallback.
    gameState.attach(bus);

    // Prefab library (Phase 44): with no project open, the library lives in
    // localStorage; a project open below (or later) replaces it from game.json.
    const sessionPrefabs = loadSessionPrefabs();
    world.prefabLibrary = sessionPrefabs;
    setPrefabs(sessionPrefabs);

    // Seed world with the demo zone and make it the active zone immediately
    world.addZone(createDemoZone());
    world.setActiveZone(DEMO_ZONE_ID);
    setZones([...world.zones.values()]);

    // Dev tooling (window.__* globals + __test): installed immediately under vite
    // dev; the shell serves the production dist (DEV false), so there it installs
    // after detectDesktop resolves, gated on the shell's own dev flag (see the
    // async IIFE below). Packaged builds (dev:false) never install.
    const installDevGlobals = () => {
      const g = window as unknown as Record<string, unknown>;
      g.__scene = scene.scene; g.__camera = scene.camera;
      g.__sceneManager = scene;   // activeRenderCamera / cullStats (Phase 28 assertions)
      g.__renderer = scene.renderer; g.__world = world; g.__zones = zones;
      g.__editorCamera = scene.editorCamera;
      g.__bus = bus; g.__scriptEngine = scriptEngine; g.__preview = preview;
      g.__objectPlacer = objectPlacer; g.__history = history;
      g.__gameState = gameState;
      g.__movers = movers;
      g.__audio = audio;
      g.__copyPaste = { copySelection, pasteClipboard };
      g.__bindings = { load: loadBindings, save: saveBindings, reset: resetBindings, defaults: DEFAULT_BINDINGS };
      installTestHelpers({ bus, world, scriptEngine, preview, gameState });
    };
    if (import.meta.env.DEV) installDevGlobals();


    input.init();
    selection.init();
    zones.init();
    floorTool.init();
    polyFloorTool.init();
    wallTool.init();
    platformTool.init();
    polyPlatformTool.init();
    stairTool.init();
    ladderTool.init();
    shapeTool.init();
    shapeResizer.init();
    brushVertexEditor.init();
    brushFaceHighlighter.init();
    brushFaceEditor.init();
    brushEdgeEditor.init();
    objectTool.init();
    prefabTool.init();
    nodeDragger.init();
    openingDragger.init();
    gizmoManager.init();
    spawnPointTool.init();
    checkpointTool.init();
    lightTool.init();
    triggerVolumeTool.init();
    decalTool.init();
    triggerVolumeResizer.init();
    stairCutterResizer.init();
    colliderEditor.init();
    wallSplitter.init();
    segmentHighlighter.init();

    const writeAutosave = () => {
      // NEVER persist while prefab edit mode holds the staging zone — the 60s
      // tick and beforeunload would write the user's world with its real zone
      // unloaded (the 2026-07-16 autosave-contamination class).
      if (editingPrefabRef.current) return;
      if (!worldRef.current || restoringRef.current) return;
      const json = JSON.stringify(worldRef.current.toJSON());
      // Only write when THIS tab changed the world since load (content-compared, so
      // console/test-driven mutations count too). A tab that never edited must never
      // write: a dormant tab's 60s tick / closing beforeunload would otherwise clobber
      // newer autosaves from other tabs with its stale state (lost real edits twice).
      if (json === autosaveBaselineRef.current) return;
      const proj = projectRef.current;
      const ts = storeAutosave(json, { projectId: proj?.store.id ?? null, sceneId: proj?.sceneId ?? null });
      autosaveBaselineRef.current = json;
      setLastAutosaveAt(ts);
    };

    // Autosave to localStorage every 60 seconds and on page unload
    const autosaveTimer = setInterval(writeAutosave, 60_000);
    window.addEventListener('beforeunload', writeAutosave);

    // ── Gameplay game-save (runtime state, separate from the scene autosave) ──
    // Persists gameState + fired one-shots so play progress survives a reload.
    const saveGame = () => {
      const blob = {
        version:       1,
        ts:            Date.now(),
        state:         gameState.snapshot(),
        firedOneShots: scriptEngine.getFiredOneShots(),
      };
      localStorage.setItem(GAMESAVE_KEY, JSON.stringify(blob));
    };
    const loadGame = (): boolean => {
      const raw = localStorage.getItem(GAMESAVE_KEY);
      if (!raw) return false;
      try {
        const blob = JSON.parse(raw) as { state?: Record<string, JsonValue>; firedOneShots?: string[] };
        gameState.restore(blob.state ?? {});
        scriptEngine.restoreFiredOneShots(blob.firedOneShots ?? []);
        return true;
      } catch { return false; }
    };
    let gameAutosaveTimer: ReturnType<typeof setInterval> | null = null;

    // active flag: set to false in cleanup so StrictMode's first-mount IIFE exits after
    // its first await rather than racing the second-mount IIFE on shared singletons.
    let active = true;

    // Sequenced init: restore autosave first; fall back to demo zone if nothing to restore.
    // Using an async IIFE so we never run both loadZone(DEMO) and handleLoadFromJSON concurrently
    // (concurrent loads hit a ZoneManager._loadedZones guard race that silently drops geometry).
    void (async () => {
      // Wait for physics (WASM) and material registry together. physicsWorld.init() wins the
      // race against initMaterials() on fast hardware, leaving _materialRegistry empty when
      // WallBuilder.build first calls getMaterial() — walls render gray. Awaiting both fixes it.
      // detectDesktop resolves the shell-vs-browser question before any
      // storage code runs — desktop() answers null until this completes.
      await Promise.all([physicsWorld.init(), materialsReady, skyboxesReady, detectDesktop()]);
      if (!active) return; // StrictMode first mount: cleanup already fired, bail out
      if (!import.meta.env.DEV && isDesktopDev()) installDevGlobals(); // dev shell serves prod dist
      if (isDesktop()) startPerfReporter();   // shell-window perf is only observable via self-report

      const saved = await readStoredAutosave().catch(() => null);
      // Read the project session up front: the autosave-vs-disk freshness check
      // needs the scene path, and the project restore below reuses it.
      const last = await restoreLastProject().catch(() => null);
      let restored = false;

      if (saved) {
        const ageMs = Date.now() - saved.ts;
        // External-edit guard: an autosave OLDER than the scene file on disk is
        // stale — the file changed after this window last wrote (an edit from
        // Claude, git, or another machine). Restoring it would shadow the disk
        // edit on every reload (and a later Save would silently revert it).
        // A dirty window still wins: beforeunload re-writes the autosave at
        // reload time, making it newer than any prior file edit.
        const mtime = last ? await sceneFileMtime(last.projectId, last.sceneId) : null;
        if (mtime != null && mtime > saved.ts) {
          console.info("[autosave] scene file on disk is newer than the autosave — loading from disk");
        } else if (ageMs < 24 * 60 * 60_000) {
          try {
            restoringRef.current = true;
            await handleLoadFromJSON(JSON.parse(saved.json));
            restored = true;
            // Surface the counter immediately — an existing autosave with no
            // visible signal reads as "autosave is gone".
            setLastAutosaveAt(saved.ts);
          } catch { /* corrupt autosave — fall through to demo zone */ } finally {
            restoringRef.current = false;
          }
        } else {
          clearStoredAutosave();
        }
      }

      if (!restored) await zones.loadZone(DEMO_ZONE_ID);

      // Baseline for the autosave no-change gate: the world as this tab loaded it.
      // (Not the raw savedJson string — restore may normalize fields.)
      autosaveBaselineRef.current = JSON.stringify(world.toJSON());

      // Project restore (Phase 33; phase 55: no permission dance — the shell
      // stores a plain {projectId, sceneId} and paths never go stale).
      try {
        if (last) {
          const store = await ProjectStore.open(last.projectId);
          const sceneId = store.sceneIds.includes(last.sceneId) ? last.sceneId : store.entryScene;
          // The autosave restore above stands in for the scene file only when it actually ran.
          // When it didn't (expired >24h / corrupt / cleared), the world is the bare demo-zone
          // fallback, and adopting the project over it would let the next write-through save
          // flush that empty world onto the scene file. Load the scene from disk instead.
          if (!restored) {
            try {
              restoringRef.current = true;
              await handleLoadFromJSON(await store.loadScene(sceneId));
              autosaveBaselineRef.current = JSON.stringify(world.toJSON());
            } finally {
              restoringRef.current = false;
            }
          }
          const ctx = { store, sceneId, rev: 0 };
          projectRef.current = ctx;
          setProject(ctx);
          world.gameItems       = store.game.items;
          world.gameStateSchema = store.game.stateSchema;
          world.gameUiElements  = store.game.uiElements;
          setWorldItems(store.game.items ?? []);
          setWorldUiElements(store.game.uiElements ?? []);
          setGameSchema(store.game.stateSchema ?? {});
          if (promoteSessionPrefabs(store.game)) setIsDirty(true);
          world.prefabLibrary = store.game.prefabs;
          setPrefabs(store.game.prefabs ?? []);
          syncPrefabInstances();   // library is authoritative now — heal/refresh instances
        }
      } catch (e) { console.warn('Project restore failed:', e); }
    })();

    // Movers BEFORE the physics step — setNextKinematicTranslation targets must
    // be fresh when the step consumes them (Phase 31)
    scene.onUpdate(dt => movers.update(dt));
    // Physics step after Three.js render
    scene.onUpdate(dt => physicsWorld.step(dt));
    // Advance object animation mixers every frame (editor + preview)
    scene.onUpdate(dt => objectPlacer.update(dt));
    // Advance animated trigger-volume fills (no-op when none are animated)
    scene.onUpdate(dt => zones.updateVolumeVisuals(dt));
    scene.onUpdate(dt => zones.updateLights(dt));
    scene.onUpdate(dt => audio.update(dt));

    const bumpMembership = () => setMembershipRev(v => v + 1);

    const unsub = [
      bus.on("preview:start", ({ mode, resume }) => {
        setIsPreview(true);
        setIsGame(isGameplayMode(mode));
        setPreviewMode(mode);
        previewModeRef.current = mode;
        // Re-index from current world state — zone:activated fires at startup before
        // any volumes/scripts exist in the editor, so the index is always stale by preview time.
        const activeZone = world.activeZoneId ? world.zones.get(world.activeZoneId) : null;
        scriptEngine.clearIndex();
        scriptEngine.loadWorld(world.world ?? {} as Parameters<typeof scriptEngine.loadWorld>[0]);
        if (activeZone) scriptEngine.loadZone(activeZone);
        scriptEngine.activate();
        // Apply this level's authored state schema (defaults + clamps) before reset/restore.
        // Project game.json defaults spread UNDER the scene's own (scene wins); the
        // classic DEFAULT only applies when neither exists (mirrors SceneRouter).
        {
          const gameSchema  = world.gameStateSchema;
          const sceneSchema = world.world?.stateSchema;
          gameState.configureSchema({
            ...(gameSchema ?? {}),
            ...(sceneSchema ?? (gameSchema ? {} : DEFAULT_STATE_SCHEMA)),
          });
          registerEntityStateSchemas(world);   // Phase 60 — configureSchema cleared the map
        }
        // Continue only when the launch explicitly asked to resume (Continue). New Game
        // and Preview always start fresh — no silent auto-continue. loadGame must run after
        // activate() (which clears fired one-shots) so a resumed save's progress survives.
        // A mid-route re-entry (load_scene in preview) must NOT reset game state —
        // cross-scene persistence is the point, mirroring SceneRouter.
        if (resume && loadGame()) { /* resumed */ } else if (!routingRef.current) {
          gameState.reset();
          seedStartingInventory(world);   // items' Starting count → inventory (New Game only)
        }
        // Occlusion-test runs are debug sessions — never let them clobber the Continue save.
        if (mode !== "occlusion") gameAutosaveTimer = setInterval(saveGame, 30_000);
      }),
      bus.on("preview:stop",  () => {
        // Clear the autosave timer first so a mid-route re-entry (below) starts a fresh
        // one instead of leaking a second interval each hop.
        if (gameAutosaveTimer) { clearInterval(gameAutosaveTimer); gameAutosaveTimer = null; }
        // Mid-route teardown (load_scene fired in preview): stay in preview at the React
        // level, just deactivate the old scene's engine — preview:start re-activates the new one.
        if (routingRef.current) { scriptEngine.deactivate(); return; }
        // A respawn/fade cancelled mid-sequence must not hold black over the editor.
        setFadeState(null);
        setIsPreview(false);
        setIsGame(false);
        setPreviewMode(null);
        pauseOpenRef.current = false;
        setPauseOpen(false);
        bagOpenRef.current = false;
        setBagOpen(false);
        if (previewModeRef.current !== "occlusion") saveGame();
        previewModeRef.current = null;
        scriptEngine.deactivate();
        // If preview routed us into another scene, return to the one we launched from —
        // non-destructively (nothing was saved to disk during preview).
        const back = routeReturnSceneRef.current;
        routeReturnSceneRef.current = null;
        if (back && back !== projectRef.current?.sceneId) {
          void (async () => {
            const proj = projectRef.current;
            if (!proj) return;
            try {
              const file = await proj.store.loadScene(back);
              await handleLoadFromJSON(file);
              worldRef.current!.gameItems       = proj.store.game.items;
              worldRef.current!.gameStateSchema = proj.store.game.stateSchema;
              worldRef.current!.gameUiElements  = proj.store.game.uiElements;
              const next = { ...proj, sceneId: back };
              projectRef.current = next; setProject(next);
              void persistLastProject(proj.store.id, back);
            } catch (e) { console.error("[preview] restore editing scene failed:", e); }
          })();
        }
      }),
      // load_scene during editor PREVIEW (project mode only): route to another of the
      // project's scenes the way the runtime shell does, but non-destructively. Outside
      // preview, or with no project open, this stays the deliberate no-op (runtime parity).
      bus.on("scene:load-request", ({ sceneId }) => {
        const proj = projectRef.current;
        if (!proj || !preview.isActive || preview.mode === "occlusion") return;
        if (routingRef.current) return;                        // a portal can fire twice before teardown
        if (!proj.store.sceneIds.includes(sceneId)) {
          console.warn(`[preview] load_scene: unknown scene "${sceneId}" — staying put`);
          return;
        }
        if (sceneId === proj.sceneId) return;                  // already here
        const mode = preview.mode ?? "preview";
        void (async () => {
          routingRef.current = true;
          routeReturnSceneRef.current ??= proj.sceneId;        // remember the origin (first hop only)
          try {
            const fired = scriptEngine.getFiredOneShots();     // survive the hop (don't re-fire cross-scene one-shots)
            preview.exit();                                    // remove character (fires the guarded preview:stop)
            const file = await proj.store.loadScene(sceneId);
            await handleLoadFromJSON(file);                    // teardown zones + rebuild world/physics (no save)
            const world = worldRef.current!;
            world.gameItems       = proj.store.game.items;
            world.gameStateSchema = proj.store.game.stateSchema;
            world.gameUiElements  = proj.store.game.uiElements;
            // Keep proj.sceneId in lockstep with the loaded world so any save targets the right file.
            const next = { ...projectRef.current!, sceneId };
            projectRef.current = next; setProject(next);
            preview.enter(mode);                               // respawn at the new scene's defaultSpawn (fires preview:start → re-index + activate)
            scriptEngine.restoreFiredOneShots(fired);          // after activate(), which clears the set
          } catch (e) {
            console.error(`[preview] load_scene "${sceneId}" failed:`, e);
          } finally {
            routingRef.current = false;
          }
        })();
      }),
      bus.on("input:scheme-changed", ({ scheme }) => setPreviewScheme(scheme)),
      // Gamepad Start / kbm Enter / touch ⚙ → close the dialogue if one is
      // open, else toggle the pause menu. (Esc still exits preview directly.)
      bus.on("action:cancel", () => {
        if (dialogueOpenRef.current) {
          dialogueOpenRef.current = false;
          setDialogueState(null);
          bus.emit("dialogue:closed", {});
        } else if (bagOpenRef.current) {
          bagOpenRef.current = false;
          setBagOpen(false);
          bus.emit("bag:closed", {});
        } else if (pauseOpenRef.current) {
          pauseOpenRef.current = false;
          setPauseOpen(false);
          bus.emit("pause:closed", {});
        } else if (previewRef.current?.isActive) {
          pauseOpenRef.current = true;
          setPauseOpen(true);
          bus.emit("pause:show", {});
        }
      }),
      bus.on("dialogue:show", payload => { dialogueOpenRef.current = true; setDialogueState(payload); }),
      // Bag toggle (I/Tab, gamepad Y, touch 🎒). Ignored while a dialogue or the
      // pause menu is up, and in occlusion mode (Tab switches vantage there).
      bus.on("bag:toggle", () => {
        if (dialogueOpenRef.current || pauseOpenRef.current) return;
        if (previewModeRef.current === "occlusion") return;
        if (!previewRef.current?.isActive) return;
        const open = !bagOpenRef.current;
        bagOpenRef.current = open;
        setBagOpen(open);
        bus.emit(open ? "bag:show" : "bag:closed", {});
      }),
      bus.on("overlay:flash", payload => setFlashState(payload)),
      bus.on("overlay:fade-in",  payload => setFadeState({ ...payload, direction: "in" })),
      // Fade-out reuses the held fade's color; ignore a fade-out with nothing up.
      bus.on("overlay:fade-out", ({ duration }) =>
        setFadeState(prev => prev ? { color: prev.color, duration, direction: "out" } : null)),
      bus.on("leftpanel:open", ({ panelId }) => setLeftPanel(panelId)),
      bus.on("input:mousemove",   ({ worldPos }) => setCoords(worldPos)),
      bus.on("object:selected", payload => {
        setSelected(payload);
        if (payload.type === "trigger-volume") setLeftPanel("scripts");
      }),
      // suppressSelRef: a prefab re-expansion removes + re-adds members, which
      // cascades object:deselected / shrinking selection:changed from
      // SelectionManager — swallowing them keeps the Prefab panel mounted (and
      // its focused input alive) until the instance is re-selected.
      bus.on("object:deselected", ()            => { if (!suppressSelRef.current) setSelected(null); }),
      bus.on("object:updated", ({ id, zoneId }) => {
        // Refresh selected.data with a fresh reference so the panel (e.g. ScriptEditor)
        // re-renders from current data. Without this, object script edits read a stale
        // snapshot and a later edit can revert an earlier one (mirrors triggervolume:updated).
        setSelected(prev => {
          if (prev?.type !== "object" || prev.id !== id) return prev;
          const obj = world.zones.get(zoneId)?.objects.find(o => o.id === id);
          return obj ? { ...prev, data: obj } : prev;
        });
      }),
      bus.on("selection:changed", ({ refs }) => { if (!suppressSelRef.current) setMultiSelected(refs); }),
      bus.on("floortool:suggest-auto-floor", payload => setAutoFloorPrompt(payload)),
      bus.on("tool:placed", ({ type }) => {
        if (type !== "object") {
          setActiveTool("select");
          bus.emit("tool:select", { tool: "select" });
        }
        syncHistory();
      }),
      bus.on("assets:loaded",   ({ assets: defs }) => setAssets(defs)),
      // ObjectTool disarmed itself — drop the panel highlight so it can't outlive the ghost.
      bus.on("objecttool:disarmed", () => setSelectedAssetId(null)),
      bus.on("zone:added",      ()               => setZones([...world.zones.values()])),
      bus.on("zone:activated",  ({ zoneId })     => {
        setActiveZoneId(zoneId);
        const z = world.zones.get(zoneId);
        setZoneScripts(z?.scripts ?? []);
        setZoneDialogues(z?.dialogues ?? []);
        setTriggerVolumes(z?.triggerVolumes ?? []);
        setCheckpoints(z?.checkpoints ?? []);
        setZoneLights(z?.lights ?? []);
        scriptEngine.clearIndex();
        scriptEngine.loadWorld(world.world ?? {} as Parameters<typeof scriptEngine.loadWorld>[0]);
        if (z) scriptEngine.loadZone(z);
      }),
      bus.on("world:loaded",    ()               => {
        setZones([...world.zones.values()]);
        setActiveZoneId(world.activeZoneId);
        setGroups([...world.groups]);
        setStateSchema(world.world?.stateSchema ?? {});
        // Project open → the ITEMS tab edits the game.json registry, not the scene's
        setWorldItems(projectRef.current
          ? (projectRef.current.store.game.items ?? [])
          : (world.world?.items ?? []));
        setWorldUiElements(projectRef.current
          ? (projectRef.current.store.game.uiElements ?? [])
          : (world.world?.uiElements ?? []));
        const z = world.activeZoneId ? world.zones.get(world.activeZoneId) : null;
        setZoneScripts(z?.scripts ?? []);
        setZoneDialogues(z?.dialogues ?? []);
        setTriggerVolumes(z?.triggerVolumes ?? []);
        setCheckpoints(z?.checkpoints ?? []);
        setZoneLights(z?.lights ?? []);
      }),
      bus.on("triggervolume:added",   () => {
        const z = world.zones.get(world.activeZoneId ?? "");
        setTriggerVolumes(z?.triggerVolumes ?? []);
      }),
      bus.on("triggervolume:placed", ({ vol }) => {
        // After drawing, switch back to select, auto-select the new volume, and open scripts panel
        setActiveTool("select");
        bus.emit("tool:select", { tool: "select" });
        bus.emit("triggervolume:select", { zoneId: vol.zoneId, id: vol.id });
        bus.emit("object:selected", {
          id:       vol.id,
          type:     "trigger-volume",
          zoneId:   vol.zoneId,
          position: vol.position,
          rotation: { x: 0, y: 0, z: 0 },
          scale:    { x: 1, y: 1, z: 1 },
          data:     vol,
        });
        setLeftPanel("scripts");
        syncHistory();
      }),
      bus.on("triggervolume:updated", ({ id }) => {
        const z = world.zones.get(world.activeZoneId ?? "");
        setTriggerVolumes(z?.triggerVolumes ?? []);
        // If this volume is selected, update selected.data so PropertiesPanel sees new scripts
        setSelected(prev => {
          if (prev?.type === "trigger-volume" && prev.id === id) {
            const vol = z?.triggerVolumes?.find(v => v.id === id);
            return vol ? { ...prev, data: vol } : prev;
          }
          return prev;
        });
      }),
      bus.on("triggervolume:removed", ({ id }) => {
        const z = world.zones.get(world.activeZoneId ?? "");
        setTriggerVolumes(z?.triggerVolumes ?? []);
        // Undo/redo can delete the volume out from under the selection — without
        // this the removed volume ghosts in PROPERTIES (stale panel + gizmo).
        if (selectedRef.current?.type === "trigger-volume" && selectedRef.current.id === id) {
          bus.emit("object:deselected", {});
        }
      }),
      bus.on("decal:updated", ({ id }) => {
        // Refresh selected.data (gizmo moves emit decal:updated, panel fields resync from data).
        setSelected(prev => {
          if (prev?.type === "decal" && prev.id === id) {
            const dec = world.zones.get(world.activeZoneId ?? "")?.decals?.find(d => d.id === id);
            return dec ? { ...prev, data: dec } : prev;
          }
          return prev;
        });
      }),
      // Keep the picker highlight in sync when the tool disarms itself (Escape).
      bus.on("decaltool:texture", ({ textureId }) => setSelectedDecalId(textureId)),
      bus.on("checkpoint:added",   () => setCheckpoints([...(world.zones.get(world.activeZoneId ?? "")?.checkpoints ?? [])])),
      bus.on("checkpoint:removed", () => {
        setCheckpoints([...(world.zones.get(world.activeZoneId ?? "")?.checkpoints ?? [])]);
      }),
      bus.on("checkpoint:updated", ({ id }) => {
        const z = world.zones.get(world.activeZoneId ?? "");
        setCheckpoints([...(z?.checkpoints ?? [])]);
        setSelected(prev => {
          if (prev?.type === "checkpoint" && prev.id === id) {
            const cp = z?.checkpoints?.find(c => c.id === id);
            return cp ? { ...prev, data: cp } : prev;
          }
          return prev;
        });
      }),
      bus.on("checkpoint:placed", ({ zoneId, id }) => {
        // Place one, then break out of checkpoint mode: switch to Select and auto-select
        // the new marker so it can be adjusted immediately (mirrors the trigger-volume flow).
        // Deferred a microtask so the tool switch lands AFTER the placement click finishes
        // dispatching (otherwise flipping the tool mid-click could let another tool's
        // click handler act on the same click).
        queueMicrotask(() => {
          setActiveTool("select");
          bus.emit("tool:select", { tool: "select" });
          const cp = world.zones.get(zoneId)?.checkpoints?.find(c => c.id === id);
          if (cp) bus.emit("object:selected", {
            id, type: "checkpoint", zoneId,
            position: cp.position, rotation: { x: 0, y: cp.facingDeg, z: 0 }, scale: { x: 1, y: 1, z: 1 },
            data: cp,
          });
        });
      }),
      bus.on("light:added",   () => setZoneLights([...(world.zones.get(world.activeZoneId ?? "")?.lights ?? [])])),
      bus.on("light:removed", () => setZoneLights([...(world.zones.get(world.activeZoneId ?? "")?.lights ?? [])])),
      bus.on("light:updated", ({ id }) => {
        const z = world.zones.get(world.activeZoneId ?? "");
        setZoneLights([...(z?.lights ?? [])]);
        // Refresh selected.data (gizmo moves emit light:updated; panel resyncs position).
        setSelected(prev => {
          if (prev?.type === "light" && prev.id === id) {
            const l = z?.lights?.find(l => l.id === id);
            return l ? { ...prev, data: l, position: { ...l.position } } : prev;
          }
          return prev;
        });
      }),
      bus.on("light:placed", ({ zoneId, id }) => {
        // Place one, then break out of placement (mirrors the checkpoint flow).
        queueMicrotask(() => {
          setActiveTool("select");
          bus.emit("tool:select", { tool: "select" });
          const l = world.zones.get(zoneId)?.lights?.find(l => l.id === id);
          if (l) bus.emit("object:selected", {
            id, type: "light", zoneId,
            position: l.position, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
            data: l,
          });
        });
      }),
      bus.on("world:lighting", ({ ambient, sun, envIntensity, quality }) => setWorldLighting({ ambient, sun, envIntensity: envIntensity ?? 1, quality: quality ?? "fancy" })),
      bus.on("world:audio", ({ audio }) => setWorldAudio(audio)),
      bus.on("world:sky", ({ skybox }) => setWorldSkybox(skybox)),
      bus.on("spawn:placed", () => {
        // The initial spawn is singular; break out of placing mode after setting it.
        queueMicrotask(() => {
          setActiveTool("select");
          bus.emit("tool:select", { tool: "select" });
        });
      }),
      bus.on("group:added",   () => setGroups([...world.groups])),
      bus.on("group:removed", () => { setGroups([...world.groups]); bumpMembership(); }),
      bus.on("group:updated", () => setGroups([...world.groups])),

      // Keep the per-group member lists live: bump on any groupIds edit or member deletion.
      bus.on("floor:updated",        ({ changes }) => { if (changes.groupIds !== undefined) bumpMembership(); }),
      bus.on("wall:updated",         ({ changes }) => { if (changes.groupIds !== undefined) bumpMembership(); }),
      bus.on("platform:updated",     ({ changes }) => { if (changes.groupIds !== undefined) bumpMembership(); }),
      bus.on("stair:updated",        ({ changes }) => { if (changes.groupIds !== undefined) bumpMembership(); }),
      bus.on("object:updated",       ({ changes }) => { if (changes.groupIds !== undefined) bumpMembership(); }),
      bus.on("triggervolume:updated",({ changes }) => { if (changes.groupIds !== undefined) bumpMembership(); }),
      bus.on("shape:updated",        ({ changes }) => { if (changes.groupIds !== undefined) bumpMembership(); }),
      bus.on("floor:removed",        bumpMembership),
      bus.on("wall:removed",         bumpMembership),
      bus.on("platform:removed",     bumpMembership),
      bus.on("stair:removed",        bumpMembership),
      bus.on("object:removed",       bumpMembership),
      bus.on("triggervolume:removed",bumpMembership),
      bus.on("shape:removed",        bumpMembership),
      // Pasted/duplicated entities arrive via *:added carrying their cloned groupIds.
      bus.on("floor:added",          ({ floor })    => { if (floor.groupIds?.length)    bumpMembership(); }),
      bus.on("wall:added",           ({ wall })     => { if (wall.groupIds?.length)     bumpMembership(); }),
      bus.on("platform:added",       ({ platform }) => { if (platform.groupIds?.length) bumpMembership(); }),
      bus.on("stair:added",          ({ stair })    => { if (stair.groupIds?.length)    bumpMembership(); }),
      bus.on("object:added",         ({ object })   => { if (object.groupIds?.length)   bumpMembership(); }),
      bus.on("triggervolume:added",  ({ volume })   => { if (volume.groupIds?.length)   bumpMembership(); }),
      bus.on("shape:added",          ({ shape })    => { if (shape.groupIds?.length)    bumpMembership(); }),
      // Prefab instance records changed (place/delete/undo) → refresh panel counts.
      bus.on("prefabinstance:added",   () => setPrefabTick(t => t + 1)),
      bus.on("prefabinstance:removed", () => setPrefabTick(t => t + 1)),
    ];

    return () => {
      active = false; // tell in-flight IIFE this mount is stale
      clearInterval(autosaveTimer);
      if (gameAutosaveTimer) clearInterval(gameAutosaveTimer);
      window.removeEventListener('beforeunload', writeAutosave);
      previewRef.current?.exit();
      previewRef.current  = null;
      audio.dispose();
      sceneRef.current    = null;
      worldRef.current    = null;
      zonesRef.current    = null;
      unsub.forEach(u => u());
      checkpointTool.dispose();
      lightTool.dispose();
      spawnPointTool.dispose();
      segmentHighlighter.dispose();
      wallSplitter.dispose();
      colliderEditor.dispose();
      stairCutterResizer.dispose();
      triggerVolumeResizer.dispose();
      triggerVolumeTool.dispose();
      decalTool.dispose();
      scriptEngineRef.current = null;
      gizmoManager.dispose();
      openingDragger.dispose();
      nodeDragger.dispose();
      objectTool.dispose();
      prefabTool.dispose();
      brushEdgeEditor.dispose();
      brushFaceEditor.dispose();
      brushFaceHighlighter.dispose();
      brushVertexEditor.dispose();
      shapeResizer.dispose();
      shapeTool.dispose();
      stairTool.dispose();
      ladderTool.dispose();
      polyPlatformTool.dispose();
      platformTool.dispose();
      wallTool.dispose();
      polyFloorTool.dispose();
      floorTool.dispose();
      zones.dispose();
      selection.dispose();
      input.dispose();
      scene.dispose();
      physicsWorld.dispose();
    };
  }, []);

  const handleToolSelect = (tool: ToolId): void => {
    if (tool === "groups") {
      // The "Groups" toolbar button just toggles the groups panel — it arms no tool.
      setLeftPanel(p => p === "groups" ? null : "groups");
      return;
    }
    setActiveTool(tool);
    busRef.current.emit("tool:select", { tool });
    if (tool === "object") setLeftPanel("assets");
    else if (tool === "decal") setLeftPanel("decals");   // pick a decal texture first
    // trigger-volume: no left panel auto-open; draw first, then select to see scripts
    else setLeftPanel(null);
  };

  const handlePanelToggle = (panelId: LeftPanelId): void => {
    setLeftPanel(p => p === panelId ? null : panelId);
  };

  // Decal picker tile clicked — arm (or disarm) the DecalTool and make it the active tool.
  const handleDecalSelect = (id: string | null, kind: DecalKind): void => {
    setSelectedDecalId(id);
    busRef.current.emit("decaltool:texture", { textureId: id, kind });
    if (id && activeTool !== "decal") {
      setActiveTool("decal");
      busRef.current.emit("tool:select", { tool: "decal" });
    }
  };

  const handleAddGroup = (): void => {
    const world = worldRef.current;
    if (!world) return;
    world.transaction("add group", () => world.addGroup({ id: crypto.randomUUID(), name: "New Group" }));
  };

  const handleRemoveGroup = (id: string): void => {
    setHiddenGroups(prev => {
      if (!prev.has(id)) return prev;
      busRef.current?.emit("group:visibility", { groupId: id, visible: true });
      const next = new Set(prev); next.delete(id); return next;
    });
    worldRef.current?.transaction("delete group", () => worldRef.current?.removeGroup(id));
  };

  const handleRenameGroup = (id: string, name: string): void => {
    worldRef.current?.transaction("rename group", () => worldRef.current?.updateGroup(id, name));
  };

  const handleToggleGroupVisibility = (id: string): void => {
    setHiddenGroups(prev => {
      const next = new Set(prev);
      const visible = next.has(id);   // currently hidden → make visible
      if (visible) next.delete(id); else next.add(id);
      busRef.current?.emit("group:visibility", { groupId: id, visible });
      return next;
    });
  };

  const handleFloorChange = (level: number): void => {
    setActiveFloor(level);
    busRef.current.emit("floor:select", { level });
  };

  const handleQualityChange = (q: QualityScale): void => {
    setQuality(q);
    localStorage.setItem('editorQuality', q);
    assetManager.setQuality(q);
    busRef.current.emit('quality:changed', { quality: q });
  };

  const handleTogglePerfCounter = (): void =>
    setShowPerfCounter(v => { localStorage.setItem('editorShowPerf', v ? '0' : '1'); return !v; });

  const handleToggleCrosshair = (): void =>
    setShowCrosshair(v => { localStorage.setItem('editorShowCrosshair', v ? '0' : '1'); return !v; });

  const handleToggleGridFloor = (): void =>
    setShowGridFloor(v => {
      localStorage.setItem('editorShowGrid', v ? '0' : '1');
      sceneRef.current?.setGridVisible(!v);
      return !v;
    });

  /** Stamp the current editor viewpoint into metadata so explicit saves carry it.
   *  Deliberately NOT called from the periodic autosave — a camera-only change must
   *  not defeat the v4.14.1 "unchanged tab never writes" gate. */
  const stampCameraPose = useCallback((): void => {
    const cam  = sceneRef.current?.editorCamera;
    const meta = worldRef.current?.metadata;
    if (cam && meta) meta.editorCamera = cam.getPose();
  }, []);

  /** Last line of defence for write-through saves onto an existing scene file.
   *  A world loaded from a scene always carries that scene's metadata; a null metadata means
   *  the world is the bare demo-zone fallback (WorldState.toJSON would fabricate an "Untitled"
   *  shell). Overwriting a real scene with that truncates it to an empty world — the v4.29.x
   *  data-loss bug. Refuse, and keep the file. Only guards overwrites: addScene creates a new
   *  file, so adopting a metadata-less world into a brand-new scene stays allowed. */
  const canOverwriteScene = useCallback((sceneId: string): boolean => {
    if (worldRef.current?.metadata != null) return true;
    console.warn(`[project] refusing to overwrite scene "${sceneId}" with an unloaded (empty) world`);
    return false;
  }, []);

  /**
   * Prefab instance sweep (Phase 45 + v4.42.2), run whenever the world OR the
   * library becomes authoritative (scene load, project open):
   * - Staleness: a record expanded against an older prefab version re-expands.
   * - Orphan auto-heal: a GENERATOR instance whose def is missing (created
   *   before defs wrote game.json immediately) is fully described by its record
   *   variables — infer the generator from the exact variable key set and
   *   relink to (or recreate) that generator's library def. Snapshot orphans
   *   stay orphans (their template is genuinely lost).
   * Skipped mid-boot-restore (restoringRef): the project library isn't loaded
   * yet, and healing against the empty session library would mint duplicate
   * defs — the project-open sites re-run the sweep once the library is real.
   */
  const syncPrefabInstances = useCallback((): void => {
    const world = worldRef.current;
    if (!world || restoringRef.current) return;
    for (const zone of world.zones.values()) {
      for (const rec of [...(zone.prefabInstances ?? [])]) {
        let def = world.prefabLibrary?.find(p => p.id === rec.prefabId);
        if (!def) {
          // Subset match, not exact: generators gain variables over time (e.g.
          // tiled-platform "height"), and old records only carry the keys that
          // existed when they were placed.
          const recKeys = Object.keys(rec.variables);
          const gen = Object.values(GENERATORS).find(g => {
            const names = new Set(g.variables.map(v => v.name));
            return recKeys.length > 0 && recKeys.every(k => names.has(k));
          });
          if (!gen) { console.warn(`[prefabs] instance ${rec.id} references missing prefab ${rec.prefabId} — left as expanded`); continue; }
          def = world.prefabLibrary?.find(p => p.kind === "generator" && p.generatorId === gen.id);
          if (!def) {
            def = {
              id: `pfb_${crypto.randomUUID().slice(0, 8)}`, name: gen.label, kind: "generator",
              version: 1, generatorId: gen.id, variables: structuredClone(gen.variables),
              dateAdded: new Date().toISOString().slice(0, 10),
            };
            const next = [...(world.prefabLibrary ?? []), def];
            world.prefabLibrary = next;
            const proj = projectRef.current;
            if (proj) {
              proj.store.game.prefabs = next;
              void proj.store.writeGame().catch(e => console.warn("[prefabs] game.json write failed:", e));
            } else {
              saveSessionPrefabs(next);
            }
            setPrefabs(next);
          }
          console.info(`[prefabs] relinked orphaned instance ${rec.id} to generator def ${def.id} (${gen.label})`);
          world.updatePrefabInstance(zone.id, rec.id, { prefabId: def.id, version: def.version });
          setIsDirty(true);
          continue;   // members are already expanded correctly — relink only
        }
        if (rec.version < def.version) {
          reexpandInstance(world, zone.id, def, rec.id);
          setIsDirty(true);
        }
      }
    }
    setPrefabTick(t => t + 1);
  }, []);

  const handleLoadFromJSON = useCallback(async (json: unknown): Promise<void> => {
    const world = worldRef.current;
    const zones = zonesRef.current;
    if (!world || !zones) return;
    try {
      const file = json as SceneFile;
      migrateWallNodes(file.zones);
      migrateUVs(file);  // Phase 10.8: reset legacy tileScale to 1.0 (pre-world-space-UV scenes)
      migrateDialogues(file);  // legacy inline show_dialogue lines[] → zone dialogue registry
      migrateWorldLighting(file);  // never-honored ambient/sun defaults → visual-parity values
      for (const zone of file.zones) pruneOrphanNodes(zone);  // reap orphaned polygon nodes from old saves
      await physicsWorld.init();
      for (const zoneId of [...world.zones.keys()]) zones.unloadZone(zoneId);
      world.loadFromJSON(file);
      setSelected(null);
      setActiveFloor(0);
      setIsDirty(false);
      const activeId = world.activeZoneId;
      if (activeId) await zones.loadZone(activeId);
      syncPrefabInstances();
      // Restore the scene's saved editor viewpoint (stamped on save; absent on old files)
      const pose = file.metadata?.editorCamera;
      if (pose) sceneRef.current?.editorCamera?.setPose(pose);
    } catch (e) {
      console.error('Failed to load scene:', e);
    }
  }, []);

  // Kept for TopBar's <input type="file"> fallback path
  /** Drop project context (saving the current scene first unless `skipSave`). */
  const closeProject = useCallback(async (opts?: { skipSave?: boolean }): Promise<void> => {
    if (editingPrefabRef.current) return;   // no project close under prefab edit mode
    const proj = projectRef.current;
    if (!proj) return;
    if (!opts?.skipSave && canOverwriteScene(proj.sceneId)) {
      stampCameraPose();
      try { await proj.store.saveScene(proj.sceneId, worldRef.current!.toJSON()); } catch (e) { console.warn('Scene save on project close failed:', e); }
    }
    projectRef.current = null;
    setProject(null);
    if (worldRef.current) {
      worldRef.current.gameItems = undefined;
      worldRef.current.gameStateSchema = undefined;
      worldRef.current.gameUiElements = undefined;
      worldRef.current.prefabLibrary = loadSessionPrefabs();
      setPrefabs(worldRef.current.prefabLibrary);
    }
    setGameSchema({});
    void clearLastProject();
  }, [canOverwriteScene]);

  const handleLoad = useCallback((json: unknown): void => {
    void closeProject().then(() => handleLoadFromJSON(json));
  }, [handleLoadFromJSON, closeProject]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (editingPrefabRef.current) return;   // prefab edit mode: Save lives in the amber bar
    const world = worldRef.current;
    if (!world) return;
    stampCameraPose();
    const json = JSON.stringify(world.toJSON(), null, 2);
    const name = world.toJSON().metadata?.name ?? 'world';

    // Project open → write-through to the project folder (scene + game + manifest);
    // the single-file picker path below is skipped entirely.
    const proj = projectRef.current;
    if (proj) {
      if (!canOverwriteScene(proj.sceneId)) return;
      try {
        await proj.store.saveScene(proj.sceneId, world.toJSON());
        await proj.store.writeGame();
        await proj.store.writeManifest();
        void persistLastProject(proj.store.id, proj.sceneId);
      } catch (e) {
        console.error('Project save failed:', e);
        return;
      }
      setLastAutosaveAt(storeAutosave(json, { projectId: proj.store.id, sceneId: proj.sceneId }));
      setIsDirty(false);
      return;
    }

    // No project: standalone scene file. Desktop shell → workspace exports dir
    // (revealed in the file manager); plain browser → blob download.
    try {
      const d = desktop();
      if (d) {
        const { path } = await d.writeExportFile(`${slugifyId(name)}.json`, json);
        void d.revealPath(path);
      } else {
        const blob = new Blob([json], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        Object.assign(document.createElement('a'), { href: url, download: `${name}.json` }).click();
        URL.revokeObjectURL(url);
      }
    } catch (e: unknown) {
      console.error('Save failed:', e);
      return;
    }

    setLastAutosaveAt(storeAutosave(json, { projectId: null, sceneId: null }));
    setIsDirty(false);
  }, []);

  const makeFreshScene = (name: string): SceneFile => ({
    metadata: { name, version: "1.0", author: "", created: new Date().toISOString(), lastModified: new Date().toISOString() },
    world: {
      size: { width: 200, depth: 200 },
      ambientLight: { color: "#aabbcc", intensity: 0.5 },
      sunLight: { color: "#fff4e0", intensity: 2.0, position: { x: 30, y: 50, z: 20 } },
      skybox: "sky", fogColor: "#1a1f2e", fogDensity: 0.012,
      playerSettings: { cameraMode: "fps", moveSpeed: 6, jumpHeight: 1.2, fov: 75, thirdPersonDistance: 4, thirdPersonHeight: 2 },
      stateSchema: DEFAULT_STATE_SCHEMA,
    },
    terrain: null,
    zones: [createDemoZone()],
    transitions: [],
  });

  const handleNew = useCallback((): void => {
    void closeProject();   // New leaves the project (current scene saved first)
    clearStoredAutosave();
    void handleLoadFromJSON(makeFreshScene("New World"));
  }, [handleLoadFromJSON, closeProject]);

  // ── Projects (Phase 33) ─────────────────────────────────────────────────────

  /** Adopt an opened/created store as the active project context. */
  const adoptProject = useCallback((store: ProjectStore, sceneId: string): void => {
    const ctx = { store, sceneId, rev: 0 };
    projectRef.current = ctx;
    setProject(ctx);
    if (promoteSessionPrefabs(store.game)) setIsDirty(true);
    if (worldRef.current) {
      worldRef.current.gameItems       = store.game.items;
      worldRef.current.gameStateSchema = store.game.stateSchema;
      worldRef.current.gameUiElements  = store.game.uiElements;
      worldRef.current.prefabLibrary   = store.game.prefabs;
    }
    setWorldItems(store.game.items ?? []);
    setWorldUiElements(store.game.uiElements ?? []);
    setGameSchema(store.game.stateSchema ?? {});
    setPrefabs(store.game.prefabs ?? []);
    syncPrefabInstances();   // library is authoritative now — heal/refresh instances
    void persistLastProject(store.id, sceneId);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const bumpProject = (): void => {
    const p = projectRef.current;
    if (!p) return;
    const next = { ...p, rev: p.rev + 1 };
    projectRef.current = next;
    setProject(next);
  };

  /** PROJ ▾ → New Project… opens the modal (name only — the workspace owns
   *  the location, no folder picker since phase 55). */
  const handleProjectNew = useCallback((): void => setNewProjectOpen(true), []);

  const handleProjectCreate = useCallback(async (name: string, startBlank: boolean, sceneId: string): Promise<void> => {
    setNewProjectOpen(false);
    try {
      await closeProject();
      const store = await ProjectStore.create(name);
      if (startBlank) {
        // Fresh scene 1 (the "New" semantics) — replaces the current world in the editor
        const fresh = makeFreshScene("Scene 1");
        await store.addScene(sceneId, fresh);
        await handleLoadFromJSON(fresh);
      } else {
        // Adopt the current world as scene 1 (single-scene → project migration)
        stampCameraPose();
        const file = worldRef.current!.toJSON();
        await store.addScene(sceneId, file);
        // The world IS this scene now — take the metadata toJSON() just synthesized. A world
        // built from the demo-zone fallback still has a null metadata, and leaving it null
        // would make canOverwriteScene refuse every later save of the scene we just created.
        worldRef.current!.metadata = file.metadata;
      }
      adoptProject(store, sceneId);
      setIsDirty(false);
    } catch (e: unknown) {
      console.error('New project failed:', e);
      window.alert(`New project failed: ${(e as Error).message}`);
    }
  }, [closeProject, adoptProject, handleLoadFromJSON]);

  /** PROJ ▾ → Open Project… lists the workspace's projects (phase 55 modal). */
  const handleProjectOpen = useCallback((): void => setOpenProjectOpen(true), []);

  const handleProjectOpenPick = useCallback(async (projectId: string): Promise<void> => {
    setOpenProjectOpen(false);
    try {
      const store = await ProjectStore.open(projectId);
      await closeProject();
      const sceneId = store.entryScene;
      const file = await store.loadScene(sceneId);
      await handleLoadFromJSON(file);
      adoptProject(store, sceneId);
    } catch (e: unknown) {
      console.error('Open project failed:', e);
      window.alert(`Open project failed: ${(e as Error).message}`);
    }
  }, [closeProject, adoptProject, handleLoadFromJSON]);

  const handleProjectSceneSwitch = useCallback(async (target: string): Promise<void> => {
    if (editingPrefabRef.current) return;   // no scene switches under prefab edit mode
    const proj = projectRef.current;
    if (!proj || target === proj.sceneId) return;
    try {
      if (canOverwriteScene(proj.sceneId)) {
        stampCameraPose();
        await proj.store.saveScene(proj.sceneId, worldRef.current!.toJSON());  // write-through, no prompt
      }
      const file = await proj.store.loadScene(target);
      await handleLoadFromJSON(file);
      const world = worldRef.current!;
      world.gameItems       = proj.store.game.items;
      world.gameStateSchema = proj.store.game.stateSchema;
      world.gameUiElements  = proj.store.game.uiElements;
      const next = { ...proj, sceneId: target };
      projectRef.current = next;
      setProject(next);
      void persistLastProject(proj.store.id, target);
    } catch (e) {
      console.error('Scene switch failed:', e);
    }
  }, [handleLoadFromJSON]);

  const handleProjectSceneAdd = useCallback(async (): Promise<void> => {
    const proj = projectRef.current;
    if (!proj) return;
    const name = window.prompt("New scene name?");
    if (!name?.trim()) return;
    try {
      if (canOverwriteScene(proj.sceneId)) {
        stampCameraPose();
        await proj.store.saveScene(proj.sceneId, worldRef.current!.toJSON());
      }
      const id = uniqueSceneId(slugifyId(name.trim()), proj.store.sceneIds);
      await proj.store.addScene(id, makeFreshScene(name.trim()));
      await handleProjectSceneSwitch(id);
      bumpProject();
    } catch (e) {
      console.error('Add scene failed:', e);
    }
  }, [handleProjectSceneSwitch]);

  const handleProjectSceneDelete = useCallback(async (id: string): Promise<void> => {
    const proj = projectRef.current;
    if (!proj) return;
    if (id === proj.store.entryScene || proj.store.sceneIds.length <= 1) return;  // UI also blocks
    if (!window.confirm(`Delete scene "${id}" from the project? The file is removed.`)) return;
    try {
      if (id === proj.sceneId) await handleProjectSceneSwitch(proj.store.entryScene);
      await proj.store.removeScene(id);
      bumpProject();
    } catch (e) {
      console.error('Delete scene failed:', e);
    }
  }, [handleProjectSceneSwitch]);

  const handleEntrySceneChange = useCallback(async (id: string): Promise<void> => {
    const proj = projectRef.current;
    if (!proj) return;
    proj.store.setEntryScene(id);
    await proj.store.writeManifest();
    bumpProject();
  }, []);

  /** Play: projects live in the served workspace, so this is deterministic —
   *  no HTTP probe (phase 55). Desktop shell opens a native runtime window
   *  (window.open is a no-op in the webview); plain browser opens a tab. */
  const handleProjectPlay = useCallback(async (): Promise<void> => {
    const proj = projectRef.current;
    if (!proj) return;
    await handleSave();   // runtime must see the latest
    const url = `/games/${proj.store.id}/manifest.json`;
    const d = desktop();
    if (d) void d.openRuntimeWindow({ manifestUrl: url, title: `${proj.store.name} — Runtime` });
    else window.open(`/runtime.html?manifest=${encodeURIComponent(url)}`, '_blank');
  }, [handleSave]);

  // Publish (folder-to-folder copy via pickers) is gone with FSA — replaced by
  // the desktop shell's self-contained bundle export (runtime + referenced assets).
  const handleProjectExport = useCallback(async (): Promise<void> => {
    const proj = projectRef.current;
    const d = desktop();
    if (!proj || !d) return;
    await handleSave();   // the export reads from disk — must see the latest
    try {
      const r = await d.exportGameBundle({ projectId: proj.store.id });
      const mb = (r.totalBytes / (1024 * 1024)).toFixed(1);
      window.alert(
        `Exported ${r.fileCount} files (${mb} MB) to:\n${r.outputPath}` +
        (r.missing.length ? `\n\nMissing (referenced but not found):\n${r.missing.join('\n')}` : ''),
      );
      void d.revealPath(r.outputPath);
    } catch (e) {
      window.alert(`Export failed: ${(e as Error).message}`);
    }
  }, [handleSave]);

  const handleProjectClose = useCallback(async (): Promise<void> => {
    await closeProject();
  }, [closeProject]);


  const handlePreviewEnter = useCallback((): void => {
    if (editingPrefabRef.current) return;
    previewRef.current?.enter("preview");
  }, []);

  const handleNewGame = useCallback((): void => {
    if (editingPrefabRef.current) return;
    previewRef.current?.enter("game", { resume: false });
    scriptEngineRef.current?.onGameStart();
  }, []);

  const handleContinue = useCallback((): void => {
    if (editingPrefabRef.current) return;
    previewRef.current?.enter("game", { resume: true });
    scriptEngineRef.current?.onGameStart();
  }, []);

  // Phase 28 — New Game watched from a detached editor-camera vantage.
  const handleOcclusionTest = useCallback((): void => {
    previewRef.current?.enter("occlusion", { resume: false });
    scriptEngineRef.current?.onGameStart();
  }, []);

  // Fresh check each call (menu-open) — reflects saves written since last render.
  const hasGameSave = useCallback((): boolean => {
    try { return localStorage.getItem(GAMESAVE_KEY) !== null; } catch { return false; }
  }, []);

  const handlePlayerSettingsChange = useCallback((changes: Partial<PlayerSettings>): void => {
    const world = worldRef.current;
    if (!world?.world) return;
    worldRef.current?.transaction("update player settings", () => {
      // Assign a fresh object (new reference) so the panel reflects the change.
      world.world!.playerSettings = { ...world.world!.playerSettings, ...changes };
    });
    syncHistory();
    // syncHistory() no-ops once undo/dirty are already set, so force a re-render
    // for the spawn settings panel.
    setPlayerSettingsRev(v => v + 1);
  }, [syncHistory]);

  const handleSelectLight = useCallback((id: string): void => {
    const world = worldRef.current;
    const zoneId = world?.activeZoneId;
    const l = zoneId ? world?.zones.get(zoneId)?.lights?.find(l => l.id === id) : undefined;
    if (!l || !zoneId) return;
    // Leave the placement tool so the next canvas click doesn't drop another light.
    setActiveTool("select");
    busRef.current.emit("tool:select", { tool: "select" });
    busRef.current.emit("object:selected", {
      id, type: "light", zoneId,
      position: l.position, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
      data: l,
    });
  }, []);

  const handleWorldLightingChange = useCallback((changes: { ambient?: Partial<{ color: string; intensity: number }>; sun?: Partial<{ color: string; intensity: number }>; envIntensity?: number; quality?: "fancy" | "fast" }): void => {
    const world = worldRef.current;
    if (!world) return;
    // Emits world:lighting → SceneManager applies it and the bus listener syncs panel state.
    world.updateWorldLighting(changes);
    setIsDirty(true);
  }, []);

  const handleWorldAudioChange = useCallback((changes: Partial<WorldAudio>): void => {
    const world = worldRef.current;
    if (!world) return;
    // Emits world:audio → AudioSystem reconciles live; the bus listener syncs panel state.
    world.updateWorldAudio(changes);
    setIsDirty(true);
  }, []);

  const handleWorldSkyChange = useCallback((skybox: string): void => {
    const world = worldRef.current;
    if (!world) return;
    // Emits world:sky → SceneManager swaps background/environment; bus listener syncs panel.
    world.updateWorldSky(skybox);
    setIsDirty(true);
  }, []);

  const handleSpawnPositionChange = useCallback((pos: Vec3): void => {
    const world = worldRef.current;
    if (!world?.world?.defaultSpawn) return;
    const spawn = world.world.defaultSpawn;
    worldRef.current?.transaction("move spawn point", () => {
      world.setDefaultSpawn({ ...spawn, position: pos });
    });
    busRef.current.emit("spawn:updated", { position: pos });
    syncHistory();
  }, [syncHistory]);

  const handleUndo = useCallback((): void => {
    const ctx = undoInstanceCtxRef.current;
    if (ctx) {
      // withInstanceReselect closes over stable refs/setters only — safe here.
      withInstanceReselect(ctx.zoneId, ctx.instanceId, ctx.primaryId, () => historyRef.current?.undo());
    } else {
      historyRef.current?.undo();
    }
    setActiveTool("select");
    busRef.current.emit("tool:select", { tool: "select" });
    syncHistory();
  }, [syncHistory]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleRedo = useCallback((): void => {
    const ctx = undoInstanceCtxRef.current;
    if (ctx) {
      withInstanceReselect(ctx.zoneId, ctx.instanceId, ctx.primaryId, () => historyRef.current?.redo());
    } else {
      historyRef.current?.redo();
    }
    setActiveTool("select");
    busRef.current.emit("tool:select", { tool: "select" });
    syncHistory();
  }, [syncHistory]);  // eslint-disable-line react-hooks/exhaustive-deps

  const captureClipboard = useCallback((): Clipboard | null => {
    const world = worldRef.current;
    if (!world) return null;
    return multiSelected.length > 1
      ? copySelectionMulti(world, multiSelected)
      : copySelection(world, selected);
  }, [selected, multiSelected]);

  const handleCopy = useCallback((): void => {
    const clip = captureClipboard();
    if (clip) { clipboardRef.current = clip; pasteCountRef.current = 0; }
  }, [captureClipboard]);

  // Paste the clipboard (or, for Duplicate, a fresh clone of the current selection) into the
  // active zone with a cascading offset, then select the (primary) new entity.
  const pasteClip = useCallback((clip: Clipboard | null): void => {
    const world = worldRef.current;
    const zoneId = activeZoneId ?? clip?.zoneId;
    if (!world || !clip || !zoneId) return;
    const n = (pasteCountRef.current += 1);
    const result = pasteClipboard(world, clip, zoneId, { x: n, z: n });
    if (result.length > 0) busRef.current.emit("tool:placed", { type: result[0].type, id: result[0].id, zoneId });
    syncHistory();
  }, [activeZoneId, syncHistory]);

  const handlePaste = useCallback((): void => { pasteClip(clipboardRef.current); }, [pasteClip]);

  const handleDuplicate = useCallback((): void => {
    const clip = captureClipboard();
    if (clip) { clipboardRef.current = clip; pasteCountRef.current = 0; pasteClip(clip); }
  }, [captureClipboard, pasteClip]);

  // Duplicate an arbitrary ref set (group "Duplicate all members"). Reuses the multi clipboard
  // + paste path; non-copyable refs are dropped by copySelectionMulti.
  const duplicateRefs = useCallback((refs: SelectedRef[]): void => {
    const world = worldRef.current;
    if (!world || refs.length === 0) return;
    const clip = copySelectionMulti(world, refs);
    if (!clip) return;
    clipboardRef.current = clip; pasteCountRef.current = 0;
    pasteClip(clip);
  }, [pasteClip]);

  // Delete an arbitrary ref set in one transaction (no per-entity script prompt).
  // Shared by multi-select delete and group "Delete all members".
  const deleteRefs = useCallback((refs: SelectedRef[]): void => {
    const world = worldRef.current;
    if (!world || refs.length === 0) return;
    const zoneId = refs[0].zoneId;
    const nodesToRemove = new Set<string>();
    world.transaction(`delete ${refs.length} item${refs.length > 1 ? "s" : ""}`, () => {
      for (const ref of refs) {
        const zone = world.zones.get(ref.zoneId);
        switch (ref.type) {
          case "wall": {
            const ids = ref.memberIds?.length ? ref.memberIds : [ref.id];
            for (const wid of ids) {
              const w = zone?.walls.find(ww => ww.id === wid);
              if (w) { nodesToRemove.add(w.startNodeId); nodesToRemove.add(w.endNodeId); }
              world.removeWall(ref.zoneId, wid);
            }
            break;
          }
          case "floor":          world.removeFloor(ref.zoneId, ref.id); break;
          case "platform":       world.removePlatform(ref.zoneId, ref.id); break;
          case "stair":          world.removeStair(ref.zoneId, ref.id); break;
          case "ladder":         world.removeLadder(ref.zoneId, ref.id); break;
          case "object":         world.removeObject(ref.zoneId, ref.id); break;
          case "trigger-volume": world.removeTriggerVolume(ref.zoneId, ref.id); break;
          case "decal":          world.removeDecal(ref.zoneId, ref.id); break;
          case "shape":          world.removeShape(ref.zoneId, ref.id); break;
          case "light":          world.removeLight(ref.zoneId, ref.id); break;
        }
      }
      for (const nid of nodesToRemove) world.removeNode(zoneId, nid);
    });
    syncHistory();
    setSelected(null);
    busRef.current.emit("object:deselected", {});
  }, [syncHistory]);

  // ── Group bulk operations ───────────────────────────────────────────────────
  // groupId → members, rebuilt only when membership or the group list changes.
  const groupMembers = useMemo<Map<string, GroupMember[]>>(
    () => (worldRef.current ? membersByGroup(worldRef.current) : new Map()),
    [membershipRev, groups], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleAddSelectedToGroup = useCallback((groupId: string): void => {
    const world = worldRef.current;
    if (!world || multiSelected.length === 0) return;
    world.transaction(`add ${multiSelected.length} to group`, () => {
      for (const ref of multiSelected) {
        const current = entityGroupIds(world, ref);
        if (current.includes(groupId)) continue;
        writeGroupIds(world, ref, [...current, groupId]);
      }
    });
    syncHistory();
  }, [multiSelected, syncHistory]);

  // Cmd/Ctrl+G and the multi-select panel's "Group Selected": mint a group and
  // put the whole selection in it, one undo step. The group is created inside
  // the transaction so undo removes it along with the memberships.
  const handleGroupSelected = useCallback((): void => {
    const world = worldRef.current;
    if (!world || multiSelected.length === 0) return;
    const groupId = crypto.randomUUID();
    world.transaction(`group ${multiSelected.length} item${multiSelected.length > 1 ? "s" : ""}`, () => {
      world.addGroup({ id: groupId, name: "New Group" });
      for (const ref of multiSelected) {
        const current = entityGroupIds(world, ref);
        if (current.includes(groupId)) continue;
        writeGroupIds(world, ref, [...current, groupId]);
      }
    });
    syncHistory();
    setLeftPanel("groups");   // so the new group is visible to rename
  }, [multiSelected, syncHistory]);

  const handleRemoveGroupMember = useCallback((groupId: string, ref: SelectedRef): void => {
    const world = worldRef.current;
    if (!world) return;
    const current = entityGroupIds(world, ref);
    if (!current.includes(groupId)) return;
    world.transaction("remove from group", () => {
      writeGroupIds(world, ref, current.filter(g => g !== groupId));
    });
    syncHistory();
  }, [syncHistory]);

  const handleSelectGroupMembers = useCallback((groupId: string): void => {
    const refs = (groupMembers.get(groupId) ?? []).map(m => m.ref);
    busRef.current.emit("selection:set", { refs });
  }, [groupMembers]);

  const handleDeleteGroupMembers = useCallback((groupId: string): void => {
    const refs = (groupMembers.get(groupId) ?? []).map(m => m.ref);
    if (refs.length > 0) deleteRefs(refs);
  }, [groupMembers, deleteRefs]);

  const handleDuplicateGroupMembers = useCallback((groupId: string): void => {
    const refs = (groupMembers.get(groupId) ?? []).map(m => m.ref);
    if (refs.length > 0) duplicateRefs(refs);
  }, [groupMembers, duplicateRefs]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        if (previewRef.current?.isActive) {
          previewRef.current.exit();
          return;
        }
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          // Any armed placement tool bails back to Select (tools cancel their own
          // in-progress ghost via the bus keydown; this exits the mode entirely).
          if (!isSelectMode(activeTool)) {
            setActiveTool('select');
            busRef.current.emit('tool:select', { tool: 'select' });
          }
          busRef.current.emit('object:deselected', {});
        }
        return;
      }
      if (previewRef.current?.isActive) return;
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyS') {
        e.preventDefault();
        void handleSave();
      }
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.metaKey || e.ctrlKey) && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
      // Copy / paste / duplicate — but never hijack normal text copy/paste in fields.
      const tag = (e.target as HTMLElement).tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((e.metaKey || e.ctrlKey) && !typing) {
        if (e.code === 'KeyC')      { e.preventDefault(); handleCopy(); }
        else if (e.code === 'KeyV') { e.preventDefault(); handlePaste(); }
        else if (e.code === 'KeyD') { e.preventDefault(); handleDuplicate(); }
        else if (e.code === 'KeyG') { e.preventDefault(); handleGroupSelected(); }
      }
      // Blender-style select-mode hotkeys (Phase 23): 1 = object, 2 = face, 3 = vertex.
      if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        const mode = e.code === 'Digit1' ? 'select' : e.code === 'Digit2' ? 'select-face' : e.code === 'Digit3' ? 'select-vertex' : e.code === 'Digit4' ? 'select-edge' : null;
        if (mode) {
          setActiveTool(mode);
          busRef.current.emit('tool:select', { tool: mode });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSave, handleUndo, handleRedo, handleCopy, handlePaste, handleDuplicate, handleGroupSelected, activeTool]);

  const handleSegmentUpdate = (wallId: string, changes: Partial<WallDef>): void => {
    if (!selected) return;
    worldRef.current?.transaction("update wall segment", () => {
      worldRef.current?.updateWallSegment(selected.zoneId, wallId, changes);
    });
    syncHistory();
    setSelected(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        data: (prev.data as WallDef | null)?.id === wallId
          ? { ...(prev.data as WallDef), ...changes }
          : prev.data,
        runWalls: prev.runWalls
          ? prev.runWalls.map(w => w.id === wallId ? { ...w, ...changes } : w)
          : prev.runWalls,
      };
    });
  };

  // Batched so a rect POSITION/SIZE commit (4 nodes) is one undo step. No setSelected
  // patch needed: node positions aren't in the payload — floor:rebuilt re-emits selection.
  const handleFloorNodesUpdate = (updates: Array<{ nodeId: string; x: number; z: number }>, label = "move floor vertex"): void => {
    if (!selected || updates.length === 0) return;
    worldRef.current?.transaction(label, () => {
      for (const u of updates) worldRef.current?.updateNode(selected.zoneId, u.nodeId, { x: u.x, z: u.z });
    });
    syncHistory();
  };

  const getNodeLinks = (zoneId: string, nodeId: string): NodeLinks =>
    worldRef.current?.getNodeLinks(zoneId, nodeId) ?? { wallIds: [], floorIds: [], platformIds: [] };

  const handleCopyRunToFloor = (targetLevel: number): void => {
    const world = worldRef.current;
    if (!selected || selected.type !== "wall" || !world) return;
    const walls = selected.runWalls ?? (selected.data ? [selected.data as WallDef] : []);
    if (walls.length === 0) return;
    const zone = world.zones.get(selected.zoneId);
    if (!zone) return;
    const wallHeight = (selected.data as WallDef)?.height ?? 3.0;
    const targetElevation =
      zone.floors.find(f => f.level === targetLevel)?.elevation ?? targetLevel * wallHeight;
    worldRef.current?.beginTransaction("copy walls to floor");
    const nodeMap = new Map<string, string>();
    for (const w of walls) {
      for (const oldId of [w.startNodeId, w.endNodeId]) {
        if (nodeMap.has(oldId)) continue;
        const oldNode = zone.nodes.find(n => n.id === oldId);
        if (!oldNode) continue;
        // Link the copy to its source so dragging either corner moves both
        // floors. The source adopts a linkId on its first copy (existing nodes
        // have none), and later copies of the same run join that same group.
        const linkId = oldNode.linkId ?? crypto.randomUUID();
        if (!oldNode.linkId) world.setNodeLink(selected.zoneId, oldId, linkId);
        const newNode = { id: crypto.randomUUID(), x: oldNode.x, z: oldNode.z, linkId };
        world.addNode(selected.zoneId, newNode);
        nodeMap.set(oldId, newNode.id);
      }
    }
    for (const w of walls) {
      world.addWall(selected.zoneId, {
        ...w,
        id: `wall_${crypto.randomUUID().slice(0, 8)}`,
        startNodeId: nodeMap.get(w.startNodeId) ?? w.startNodeId,
        endNodeId:   nodeMap.get(w.endNodeId)   ?? w.endNodeId,
        floor:       targetLevel,
        elevation:   targetElevation,
        openings:    [],
      });
    }
    worldRef.current?.commitTransaction();
    syncHistory();
  };

  const handleFillRunWithFloor = (): void => {
    const world = worldRef.current;
    if (!selected || selected.type !== "wall" || !world) return;
    const walls = selected.runWalls ?? (selected.data ? [selected.data as WallDef] : []);
    if (walls.length < 3) return;
    const nodeIds = resolveRunNodeIds(walls);
    if (!nodeIds || nodeIds[0] !== nodeIds[nodeIds.length - 1]) return;
    const zone = world.zones.get(selected.zoneId);
    if (!zone) return;
    const wallData = selected.data as WallDef;
    const level = wallData?.floor ?? 0;
    const wallHeight = wallData?.height ?? 3.0;
    const elevation = zone.floors.find(f => f.level === level)?.elevation ?? level * wallHeight;
    const coreNodeIds = nodeIds.slice(0, -1);
    const points = coreNodeIds.map(id => {
      const n = zone.nodes.find(nn => nn.id === id);
      return n ? { x: n.x, z: n.z } : { x: 0, z: 0 };
    });
    worldRef.current?.transaction("fill run with floor", () => {
      world.addFloor(selected.zoneId, {
        id:            crypto.randomUUID(),
        level,
        elevation,
        ceilingHeight: null,
        floorMesh:     { shape: "polygon", points, nodeIds: coreNodeIds, material: "concrete_01" },
      });
    });
    syncHistory();
    setSelected(s => (s ? { ...s } : s));   // recompute loop-fill button gating
  };

  const handleAddCeilingToRun = (): void => {
    const world = worldRef.current;
    if (!selected || selected.type !== "wall" || !world) return;
    const walls = selected.runWalls ?? (selected.data ? [selected.data as WallDef] : []);
    if (walls.length < 3) return;
    const nodeIds = resolveRunNodeIds(walls);
    if (!nodeIds || nodeIds[0] !== nodeIds[nodeIds.length - 1]) return;
    const zone = world.zones.get(selected.zoneId);
    if (!zone) return;
    const wallData = selected.data as WallDef;
    const coreNodeIds = nodeIds.slice(0, -1);
    const points = coreNodeIds.map(id => {
      const n = zone.nodes.find(nn => nn.id === id);
      return n ? { x: n.x, z: n.z } : { x: 0, z: 0 };
    });
    const xs = points.map(pt => pt.x);
    const zs = points.map(pt => pt.z);
    const cx = points.reduce((s, pt) => s + pt.x, 0) / points.length;
    const cz = points.reduce((s, pt) => s + pt.z, 0) / points.length;
    // Slab bottom flush with the wall top — the lid sits ON the walls
    // (PlatformBuilder places the slab from position.y up to y + thickness).
    const elevY = (wallData?.elevation ?? 0) + (wallData?.height ?? 3.0);
    worldRef.current?.transaction("add ceiling", () => {
      world.addPlatform(selected.zoneId, {
        id:            `plat_${crypto.randomUUID().slice(0, 8)}`,
        position:      { x: cx, y: elevY, z: cz },
        size:          { width: Math.max(Math.max(...xs) - Math.min(...xs), 0.5),
                         depth: Math.max(Math.max(...zs) - Math.min(...zs), 0.5) },
        thickness:     0.2,
        material:      "concrete_01",
        hasRailing:    false,
        railingHeight: 1.0,
        floorLevel:    wallData?.floor ?? 0,
        points,
        nodeIds:       coreNodeIds,
      });
    });
    syncHistory();
    setSelected(s => (s ? { ...s } : s));   // recompute loop-fill button gating
  };

  const isWallRunClosed = (): boolean => {
    if (!selected || selected.type !== "wall") return false;
    const walls = selected.runWalls ?? (selected.data ? [selected.data as WallDef] : []);
    if (walls.length < 3) return false;
    const nodeIds = resolveRunNodeIds(walls);
    return nodeIds !== null && nodeIds.length > 1 && nodeIds[0] === nodeIds[nodeIds.length - 1];
  };

  // Loop-fill detection: the selected closed run's core node ids (loop order, no
  // duplicate closer), or null when the selection isn't a closed wall loop.
  const getRunLoopNodeIds = (): string[] | null => {
    if (!selected || selected.type !== "wall") return null;
    const walls = selected.runWalls ?? (selected.data ? [selected.data as WallDef] : []);
    if (walls.length < 3) return null;
    const nodeIds = resolveRunNodeIds(walls);
    if (!nodeIds || nodeIds.length < 2 || nodeIds[0] !== nodeIds[nodeIds.length - 1]) return null;
    return nodeIds.slice(0, -1);
  };

  const sameNodeSet = (a: string[] | null | undefined, b: string[]): boolean =>
    !!a && a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

  /** The ceiling platform capping the selected run's loop (matched by node set), if any. */
  const findRunCeiling = (): PlatformDef | null => {
    const core = getRunLoopNodeIds();
    if (!core || !selected) return null;
    const zone = worldRef.current?.zones.get(selected.zoneId);
    return zone?.platforms.find(p => sameNodeSet(p.nodeIds, core)) ?? null;
  };

  /** Whether the selected run's loop already has a fill floor at the run's level. */
  const runHasFloorFill = (): boolean => {
    const core = getRunLoopNodeIds();
    if (!core || !selected) return false;
    const zone = worldRef.current?.zones.get(selected.zoneId);
    const level = (selected.data as WallDef | null)?.floor ?? 0;
    return !!zone?.floors.some(f => f.level === level && sameNodeSet(f.floorMesh.nodeIds, core));
  };

  /** The selected run's own nodes (deduped), for the cross-floor corner link. */
  const getRunNodeIds = (): string[] => {
    if (!selected || selected.type !== "wall") return [];
    const walls = selected.runWalls ?? (selected.data ? [selected.data as WallDef] : []);
    return [...new Set(walls.flatMap(w => [w.startNodeId, w.endNodeId]))];
  };

  /** Floor levels this run's corners are linked to, excluding its own — drives the
   *  "Corners linked to: G, 1" readout. A link-mate's level comes from the walls
   *  that reference it (a node carries no level of its own). */
  const getRunLinkedFloors = (): number[] => {
    const world = worldRef.current;
    if (!world || !selected || selected.type !== "wall") return [];
    const zone = world.zones.get(selected.zoneId);
    if (!zone) return [];
    const ownIds  = new Set(getRunNodeIds());
    const linkIds = new Set(
      [...ownIds].map(id => zone.nodes.find(n => n.id === id)?.linkId).filter((l): l is string => !!l),
    );
    if (linkIds.size === 0) return [];
    const ownLevel = (selected.data as WallDef | null)?.floor ?? 0;
    const levels = new Set<number>();
    for (const node of zone.nodes) {
      if (ownIds.has(node.id) || !node.linkId || !linkIds.has(node.linkId)) continue;
      for (const w of zone.walls) {
        if (w.startNodeId !== node.id && w.endNodeId !== node.id) continue;
        if ((w.floor ?? 0) !== ownLevel) levels.add(w.floor ?? 0);
      }
    }
    return [...levels].sort((a, b) => a - b);
  };

  const handleUnlinkRunCorners = (): void => {
    const world = worldRef.current;
    const nodeIds = getRunNodeIds();
    if (!world || !selected || nodeIds.length === 0) return;
    world.transaction("unlink run corners", () => {
      world.unlinkNodes(selected.zoneId, nodeIds);
    });
    syncHistory();
    setSelected(s => (s ? { ...s } : s));   // drop the "Corners linked to" readout
  };

  const handleToggleCeilingGhost = (): void => {
    const world = worldRef.current;
    const ceiling = findRunCeiling();
    if (!world || !selected || !ceiling) return;
    world.transaction("toggle ceiling ghost", () => {
      world.updatePlatform(selected.zoneId, ceiling.id, { editorGhost: !ceiling.editorGhost });
    });
    syncHistory();
    setSelected(s => (s ? { ...s } : s));   // refresh the Hide/Show ceiling label
  };

  const handleDelete = useCallback((): void => {
    const world = worldRef.current;

    // Multi-select: delete the whole set in one transaction (no per-entity script prompt).
    if (multiSelected.length > 1 && world) { deleteRefs(multiSelected); return; }

    if (!selected || !world) return;
    const { type, id, zoneId } = selected;

    worldRef.current?.beginTransaction(`delete ${type}`);
    if (type === "wall") {
      const walls = selected.runWalls ?? (selected.data ? [selected.data as WallDef] : []);
      const nodeIds = new Set(walls.flatMap(w => [w.startNodeId, w.endNodeId]));
      for (const w of walls) world.removeWall(zoneId, w.id);
      for (const nodeId of nodeIds) world.removeNode(zoneId, nodeId);
    } else if (type === "floor") {
      world.removeFloor(zoneId, id);
    } else if (type === "platform") {
      world.removePlatform(zoneId, id);
    } else if (type === "stair") {
      world.removeStair(zoneId, id);
    } else if (type === "ladder") {
      world.removeLadder(zoneId, id);
    } else if (type === "object") {
      const obj = world.zones.get(zoneId)?.objects.find(o => o.id === id);
      if (obj?.scripts?.length) {
        setDeletePrompt({ type: "object", id, zoneId, scripts: obj.scripts });
        worldRef.current?.abortTransaction();
        return;
      }
      world.removeObject(zoneId, id);
    } else if (type === "trigger-volume") {
      const vol = world.zones.get(zoneId)?.triggerVolumes?.find(v => v.id === id);
      if (vol?.scripts?.length) {
        setDeletePrompt({ type: "volume", id, zoneId, scripts: vol.scripts });
        worldRef.current?.abortTransaction();
        return;
      }
      world.removeTriggerVolume(zoneId, id);
    } else if (type === "checkpoint") {
      world.removeCheckpoint(zoneId, id);
    } else if (type === "light") {
      world.removeLight(zoneId, id);
    } else if (type === "decal") {
      world.removeDecal(zoneId, id);
    } else if (type === "shape") {
      world.removeShape(zoneId, id);
    } else if (type === "opening") {
      const wallId = selected.parentId!;
      const zone = world.zones.get(zoneId);
      const wall = zone?.walls.find(w => w.id === wallId);
      if (!wall) { worldRef.current?.abortTransaction(); return; }
      world.updateWall(zoneId, wallId, { openings: wall.openings.filter(o => o.id !== id) });
    }
    worldRef.current?.commitTransaction();
    syncHistory();
    setSelected(null);
    busRef.current.emit("object:deselected", {});
  }, [selected, multiSelected, syncHistory, deleteRefs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      handleDelete();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleDelete]);

  const handleMaterialsReload = (): void => {
    assetManager.initMaterials().then(mats => setMaterialList(mats))
      .catch(err => console.error("materials reload failed:", err));
  };

  const handleAssetsReload = (): void => {
    assetManager.initAssets().then(defs => {
      setAssets(defs);
      busRef.current.emit("assets:loaded", { assets: defs });
    }).catch(err => console.error("assets reload failed:", err));
  };

  const handleSoundsReload = (): void => {
    assetManager.initAudio().then(defs => {
      setSounds(defs);
      busRef.current.emit("sounds:loaded", { sounds: defs });
    }).catch(err => console.error("sounds reload failed:", err));
  };

  // Delete sounds: drop from the audio manifest + remove the file, then evict from the registry.
  const handleDeleteSounds = async (ids: string[]): Promise<void> => {
    if (!ids.length) return;
    try {
      const removed = await removeEntries<SoundDef>("audio", ids);
      const rels = removed.map(s => s.path.split("/").pop()).filter((f): f is string => !!f);
      try { await removeAssetFiles("audio", rels); } catch { /* missing — ignore */ }
    } catch (err) {
      console.error("sound delete failed:", err);
      return;
    }
    assetManager.removeSounds(ids);
    setSounds(prev => prev.filter(s => !ids.includes(s.id)));
  };

  // Open the sound metadata editor (label / category / attribution) for one or more sounds.
  const handleRequestSoundEdit = (ids: string[]): void => {
    const defs = ids.map(id => sounds.find(s => s.id === id)).filter(Boolean) as SoundDef[];
    if (!defs.length) return;
    const single = defs.length === 1;
    setPendingSoundEdit({
      ids, items: defs.map(d => ({ id: d.id, label: d.label })),
      initial: {
        label:       single ? defs[0]!.label : "",
        category:    single ? (defs[0]!.category ?? "SFX") : commonOr(defs.map(d => d.category ?? "SFX")),
        attribution: single ? (defs[0]!.attribution ?? {}) : {},
        tags:        single ? (defs[0]!.tags ?? []) : [],
      },
    });
  };

  const handleConfirmSoundEdit = async (patch: EditPatch): Promise<void> => {
    const pending = pendingSoundEdit;
    setPendingSoundEdit(null);
    if (!pending) return;
    // Same tag merge semantics as the model edit: single replaces, bulk unions in.
    const resolveTags = (s: SoundDef): string[] =>
      patch.tagsAdd ? [...new Set([...(s.tags ?? []), ...patch.tagsAdd])]
                    : (patch.tags ?? s.tags ?? []);
    try {
      await updateEntries<SoundDef>("audio", pending.ids, s => ({ ...patchEntry(s, patch), tags: resolveTags(s) }));
    } catch (err) { console.error("sound edit failed:", err); return; }
    pending.ids.forEach(id => {
      const def = assetManager.getSoundList().find(s => s.id === id);
      if (!def) return;
      const { tagsAdd: _drop, ...rest } = patch;
      assetManager.updateSound(id, { ...rest, tags: resolveTags(def) } as Partial<SoundDef>);
    });
    setSounds(assetManager.getSoundList());
  };

  const handleGraphicsReload = (): void => {
    assetManager.initGraphics().then(defs => setGraphics(defs))
      .catch(err => console.error("graphics reload failed:", err));
  };

  // Open the delete-confirm dialog, counting references to the graphics.
  // Graphics are referenced two ways: ItemDef.icon stores the PATH, UI elements store the id.
  const handleRequestGraphicDelete = (ids: string[]): void => {
    if (!ids.length) return;
    const idSet  = new Set(ids);
    const labels = ids.map(id => graphics.find(g => g.id === id)?.label ?? id);
    const paths  = new Set(ids.map(id => graphics.find(g => g.id === id)?.path).filter(Boolean));
    const iconHits = worldItems.filter(it => it.icon && paths.has(it.icon)).length;
    const world = worldRef.current;
    const uiHits = [...(world?.world?.uiElements ?? []), ...(world?.gameUiElements ?? [])]
      .filter(el => {
        const gid = (el as { graphicId?: string }).graphicId;
        return gid !== undefined && idSet.has(gid);
      }).length;
    const contexts: string[] = [];
    if (iconHits) contexts.push("item icons");
    if (uiHits)   contexts.push("game UI");
    setPendingGraphicDelete({ ids, labels, usage: { count: iconHits + uiHits, zones: contexts } });
  };

  // Delete graphics: drop from the manifest (+ optionally the image files), evict from the registry.
  const handleConfirmGraphicDelete = async (deleteFiles: boolean): Promise<void> => {
    const pending = pendingGraphicDelete;
    setPendingGraphicDelete(null);
    if (!pending) return;
    const ids = pending.ids;
    try {
      const removed = await removeEntries<GraphicDef>("graphics", ids);
      if (deleteFiles) {
        const rels = removed.map(g => g.path.split("/").pop()).filter((f): f is string => !!f);
        try { await removeAssetFiles("graphics", rels); } catch { /* missing — ignore */ }
      }
    } catch (err) {
      console.error("graphic delete failed:", err);
      return;
    }
    assetManager.removeGraphics(ids);
    setGraphics(prev => prev.filter(g => !ids.includes(g.id)));
  };

  // Open the graphic metadata editor (label / category / attribution) for one or more graphics.
  const handleRequestGraphicEdit = (ids: string[]): void => {
    const defs = ids.map(id => graphics.find(g => g.id === id)).filter(Boolean) as GraphicDef[];
    if (!defs.length) return;
    const single = defs.length === 1;
    setPendingGraphicEdit({
      ids, items: defs.map(d => ({ id: d.id, label: d.label })),
      initial: {
        label:       single ? defs[0]!.label : "",
        category:    single ? (defs[0]!.category ?? "Icons") : commonOr(defs.map(d => d.category ?? "Icons")),
        attribution: single ? (defs[0]!.attribution ?? {}) : {},
      },
    });
  };

  const handleConfirmGraphicEdit = async (patch: EditPatch): Promise<void> => {
    const pending = pendingGraphicEdit;
    setPendingGraphicEdit(null);
    if (!pending) return;
    try {
      await updateEntries<GraphicDef>("graphics", pending.ids, g => patchEntry(g, patch));
    } catch (err) { console.error("graphic edit failed:", err); return; }
    pending.ids.forEach(id => assetManager.updateGraphic(id, patch as Partial<GraphicDef>));
    setGraphics(assetManager.getGraphicList());
  };

  const handleSkyboxesReload = (): void => {
    assetManager.initSkyboxes().then(defs => {
      setSkyboxes(defs);
      busRef.current.emit("skyboxes:loaded", { skyboxes: defs });
    }).catch(err => console.error("skyboxes reload failed:", err));
  };

  // Delete skyboxes: drop from the manifest + remove the image, then evict from the registry.
  const handleDeleteSkyboxes = async (ids: string[]): Promise<void> => {
    if (!ids.length) return;
    try {
      const removed = await removeEntries<SkyboxDef>("skyboxes", ids);
      const rels = removed.map(s => s.path.split("/").pop()).filter((f): f is string => !!f);
      try { await removeAssetFiles("skyboxes", rels); } catch { /* missing — ignore */ }
    } catch (err) {
      console.error("skybox delete failed:", err);
      return;
    }
    assetManager.removeSkyboxes(ids);
    setSkyboxes(prev => prev.filter(s => !ids.includes(s.id)));
    // If the deleted skybox was active, fall back to the procedural sky.
    if (ids.includes(worldSkybox)) handleWorldSkyChange("sky");
  };

  // Open the skybox metadata editor (label / category / attribution) for one or more skyboxes.
  const handleRequestSkyboxEdit = (ids: string[]): void => {
    const defs = ids.map(id => skyboxes.find(s => s.id === id)).filter(Boolean) as SkyboxDef[];
    if (!defs.length) return;
    const single = defs.length === 1;
    setPendingSkyboxEdit({
      ids, items: defs.map(d => ({ id: d.id, label: d.label })),
      initial: {
        label:       single ? defs[0]!.label : "",
        category:    single ? (defs[0]!.category ?? "Day") : commonOr(defs.map(d => d.category ?? "Day")),
        attribution: single ? (defs[0]!.attribution ?? {}) : {},
      },
    });
  };

  const handleConfirmSkyboxEdit = async (patch: EditPatch): Promise<void> => {
    const pending = pendingSkyboxEdit;
    setPendingSkyboxEdit(null);
    if (!pending) return;
    try {
      await updateEntries<SkyboxDef>("skyboxes", pending.ids, s => patchEntry(s, patch));
    } catch (err) { console.error("skybox edit failed:", err); return; }
    pending.ids.forEach(id => assetManager.updateSkybox(id, patch as Partial<SkyboxDef>));
    setSkyboxes(assetManager.getSkyboxList());
  };

  // Picking an asset arms the ObjectTool. It must re-arm the tool first: ObjectTool ignores
  // `asset:selected` unless it is the active tool, so after anything that switched tools
  // (Escape, right-click, placing then selecting) the click would otherwise do nothing at
  // all. Mirrors handleDecalSelect, which has always re-armed its tool this way.
  const handleAssetSelect = (id: string | null): void => {
    setSelectedAssetId(id);
    if (!id) return;
    if (activeTool !== "object") {
      setActiveTool("object");
      busRef.current.emit("tool:select", { tool: "object" });   // before asset:selected — order matters
    }
    busRef.current.emit("asset:selected", { assetId: id });
  };

  // Open the delete-confirm dialog, computing how many placed objects use the assets.
  const handleRequestAssetDelete = (ids: string[]): void => {
    if (!ids.length) return;
    const idSet  = new Set(ids);
    const labels = ids.map(id => assets.find(a => a.id === id)?.label ?? id);
    let count = 0;
    const zones = new Set<string>();
    const world = worldRef.current;
    if (world) {
      for (const zone of world.zones.values()) {
        for (const obj of zone.objects) {
          if (idSet.has(obj.assetId)) { count++; zones.add(zone.name); }
        }
      }
    }
    setPendingAssetDelete({ ids, labels, usage: { count, zones: [...zones] } });
  };

  const handleConfirmAssetDelete = async (deleteFiles: boolean): Promise<void> => {
    const pending = pendingAssetDelete;
    setPendingAssetDelete(null);
    if (!pending) return;
    const ids = pending.ids;

    try {
      const removed = await removeEntries<AssetDef>("models", ids);
      if (deleteFiles) {
        const base = (p?: string) => p?.split("/").pop();
        const rels = removed.flatMap(a => [base(a.path), base(a.thumbnail), base(a.mtlPath)])
          .filter((f): f is string => !!f);
        try { await removeAssetFiles("models", rels); } catch { /* missing — ignore */ }
      }
    } catch (err) {
      console.error("asset delete failed:", err);
      return;
    }

    assetManager.removeAssets(ids);
    setAssets(prev => prev.filter(a => !ids.includes(a.id)));
    busRef.current.emit("assets:loaded", { assets: assetManager.getAssetList() });
    if (selectedAssetId && ids.includes(selectedAssetId)) handleAssetSelect(null);
  };

  const openMaterialImporter = (): void => {
    if (!desktop()) {
      console.warn("Material importer needs the desktop app.");
      return;
    }
    setMaterialImporterOpen(true);
  };

  // Open the delete-confirm dialog, counting how many surfaces use the materials.
  const handleRequestMaterialDelete = (ids: string[]): void => {
    if (!ids.length) return;
    const idSet  = new Set(ids);
    const labels = ids.map(id => materialList.find(m => m.id === id)?.label ?? id);
    let count = 0;
    const zones = new Set<string>();
    const world = worldRef.current;
    if (world) {
      for (const zone of world.zones.values()) {
        const hits = [
          ...zone.walls.map(w => w.material),
          ...zone.floors.map(f => f.floorMesh.material),
          ...zone.platforms.flatMap(p => [p.material, p.sideMaterial, p.bottomMaterial]),
          ...zone.stairs.flatMap(s => [s.material, s.riserMaterial, s.landingMaterial, s.railingMaterial]),
        ].filter(m => m && idSet.has(m));
        if (hits.length) { count += hits.length; zones.add(zone.name); }
      }
    }
    setPendingMaterialDelete({ ids, labels, usage: { count, zones: [...zones] } });
  };

  const handleConfirmMaterialDelete = async (deleteFiles: boolean): Promise<void> => {
    const pending = pendingMaterialDelete;
    setPendingMaterialDelete(null);
    if (!pending) return;
    const ids = pending.ids;

    try {
      await removeEntries<MaterialDef>("textures", ids);
      if (deleteFiles) {
        // Each material is a folder (<id>/{low,medium,high}) — trashed whole.
        try { await removeAssetFiles("textures", ids); } catch { /* folder missing — ignore */ }
      }
    } catch (err) {
      console.error("material delete failed:", err);
      return;
    }

    assetManager.removeMaterials(ids);
    setMaterialList(prev => prev.filter(m => !ids.includes(m.id)));
  };

  // ── Metadata editing (label / category / attribution) ─────────────────────
  const commonOr = (vals: string[]): string => (vals.every(v => v === vals[0]) ? vals[0] ?? "" : "");

  const handleRequestAssetEdit = (ids: string[]): void => {
    const defs = ids.map(id => assets.find(a => a.id === id)).filter(Boolean) as AssetDef[];
    if (!defs.length) return;
    const single = defs.length === 1;
    setPendingAssetEdit({
      ids, items: defs.map(d => ({ id: d.id, label: d.label })),
      initial: {
        label:       single ? defs[0]!.label : "",
        category:    single ? defs[0]!.category : commonOr(defs.map(d => d.category)),
        attribution: single ? (defs[0]!.attribution ?? {}) : {},
        tags:        single ? [...defs[0]!.tags] : [],
      },
    });
  };

  const handleRequestMaterialEdit = (ids: string[]): void => {
    const defs = ids.map(id => materialList.find(m => m.id === id)).filter(Boolean) as MaterialDef[];
    if (!defs.length) return;
    const single = defs.length === 1;
    setPendingMaterialEdit({
      ids, items: defs.map(d => ({ id: d.id, label: d.label })),
      initial: {
        label:       single ? defs[0]!.label : "",
        category:    single ? (defs[0]!.category ?? "Other") : commonOr(defs.map(d => d.category ?? "Other")),
        attribution: single ? (defs[0]!.attribution ?? {}) : {},
      },
    });
  };

  // Apply an edit patch to a manifest entry (label/category set if present; attribution merged).
  const patchEntry = <T extends { label: string; attribution?: Attribution }>(entry: T, patch: EditPatch): T => ({
    ...entry,
    ...(patch.label !== undefined    ? { label: patch.label } : {}),
    ...(patch.category !== undefined ? { category: patch.category } : {}),
    ...(patch.attribution            ? { attribution: { ...entry.attribution, ...patch.attribution } } : {}),
  });

  const handleConfirmAssetEdit = async (patch: EditPatch): Promise<void> => {
    const pending = pendingAssetEdit;
    setPendingAssetEdit(null);
    if (!pending) return;
    // Tags are an array, so they need explicit merge semantics the generic shallow
    // `patchEntry` can't express: a single edit replaces the list, a bulk edit only
    // unions in (tags the dialog never showed must not be silently dropped).
    const resolveTags = (a: AssetDef): string[] =>
      patch.tagsAdd ? [...new Set([...a.tags, ...patch.tagsAdd])]
                    : (patch.tags ?? a.tags);
    try {
      await updateEntries<AssetDef>("models", pending.ids, a => ({ ...patchEntry(a, patch), tags: resolveTags(a) }));
    } catch (err) { console.error("asset edit failed:", err); return; }
    pending.ids.forEach(id => {
      const def = assetManager.getAssetDef(id);
      if (!def) return;
      // `tagsAdd` is not an AssetDef field — resolve it away before it reaches the registry.
      const { tagsAdd: _drop, ...rest } = patch;
      assetManager.updateAsset(id, { ...rest, tags: resolveTags(def) } as Partial<AssetDef>);
    });
    setAssets(assetManager.getAssetList());
    busRef.current.emit("assets:loaded", { assets: assetManager.getAssetList() });
  };

  /** Save a placed object's collider set into its asset's manifest entry as the
   *  model-level default (placement resolves obj.colliders ?? def.colliders ?? auto
   *  box). The source object's own override is cleared so it tracks the default from
   *  now on (undoable — undo restores the override, not the manifest), and sibling
   *  placements without overrides rebuild against the new set. */
  const handleSaveCollidersToAsset = async (objectId: string, assetId: string, colliders: AttachedCollider[]): Promise<void> => {
    const zoneId = selected?.id === objectId ? selected.zoneId : activeZoneId;
    if (!zoneId) return;
    const saved = structuredClone(colliders);
    try {
      await updateEntries<AssetDef>("models", [assetId], a => ({ ...a, colliders: saved }));
    } catch (err) { console.error("save colliders to asset failed:", err); return; }
    assetManager.updateAsset(assetId, { colliders: saved });
    setAssets(assetManager.getAssetList());
    busRef.current.emit("assets:loaded", { assets: assetManager.getAssetList() });
    worldRef.current?.transaction("save colliders to asset", () => {
      worldRef.current?.updateObject(zoneId, objectId, { colliders: undefined });
    });
    syncHistory();
    setSelected(prev => prev && prev.id === objectId ? { ...prev, data: { ...(prev.data as WorldObject), colliders: undefined } } : prev);
    // Sibling placements with no override: data is already correct (undefined), they
    // just need a collider rebuild against the new default — bus only, no journal.
    for (const o of worldRef.current?.zones.get(zoneId)?.objects ?? []) {
      if (o.assetId === assetId && o.id !== objectId && o.colliders === undefined)
        busRef.current.emit("object:updated", { id: o.id, zoneId, changes: { colliders: undefined } });
    }
  };

  // Write a re-staged thumbnail PNG next to the model + point the manifest at it.
  const handleSaveThumbnail = async (asset: AssetDef, dataUrl: string): Promise<void> => {
    setStagingAsset(null);
    const fileName =
      asset.thumbnail?.split("/").pop()?.split("?")[0] ||
      `${(asset.path.split("/").pop() ?? asset.id).replace(/\.[^.]+$/, "")}_thumb.png`;
    const cleanPath = `/assets/models/${fileName}`;
    try {
      await writeAssetFile("models", fileName, dataURLtoArrayBuffer(dataUrl));
      await updateEntries<AssetDef>("models", [asset.id], a => ({ ...a, thumbnail: cleanPath }));
    } catch (err) { console.error("thumbnail save failed:", err); return; }
    // ?v= busts the <img> cache in-session; the manifest keeps the clean path.
    assetManager.updateAsset(asset.id, { thumbnail: `${cleanPath}?v=${Date.now()}` });
    setAssets(assetManager.getAssetList());
    busRef.current.emit("assets:loaded", { assets: assetManager.getAssetList() });
  };

  // Re-origin a model (Phase 50): rewrite the GLTF/GLB in place so its geometry
  // sits on/around the origin, optionally shifting placed copies to compensate.
  const handleApplyReorigin = async (asset: AssetDef, delta: Vec3, compensate: boolean): Promise<void> => {
    const fileName = asset.path.split("/").pop();
    if (!fileName) return;
    try {
      const res = await fetch(`/assets/models/${fileName}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`model fetch → HTTP ${res.status}`);
      const bytes = await res.arrayBuffer();
      const out   = applyGltfReorigin(bytes, fileName, delta);
      await writeAssetFile("models", fileName, out);
    } catch (err) { console.error("re-origin failed:", err); return; }
    setReoriginAsset(null);
    assetManager.evictModel(asset.id);
    const world = worldRef.current;
    if (compensate && world) {
      world.transaction("re-origin placed copies", () => {
        for (const [zoneId, zone] of world.zones) {
          for (const o of zone.objects) {
            if (o.assetId !== asset.id) continue;
            const s = instanceWorldShift(delta, o.rotation, o.scale);
            world.updateObject(zoneId, o.id, {
              position: { x: o.position.x - s.x, y: o.position.y - s.y, z: o.position.z - s.z },
            });
          }
        }
      });
      syncHistory();
    }
    // A selected copy's mesh is about to be torn down — drop the selection so the
    // gizmo isn't left attached to a dead Object3D.
    setSelected(prev => {
      if (prev && prev.type === "object" && (prev.data as WorldObject | null)?.assetId === asset.id) {
        busRef.current.emit("object:deselected", {});
        return null;
      }
      return prev;
    });
    busRef.current.emit("asset:model-updated", { assetId: asset.id });
  };

  // Save a transparent icon render of a model into the graphics library (Phase 48).
  const handleSaveIcon = async (asset: AssetDef, dataUrl: string): Promise<void> => {
    setStagingAsset(null);
    const fileName = `${asset.id}_icon.png`;
    try {
      await writeAssetFile("graphics", fileName, dataURLtoArrayBuffer(dataUrl));
      const graphic: GraphicDef = {
        id: `${asset.id}_icon`, label: `${asset.label} icon`, category: "Icons",
        path: `/assets/graphics/${fileName}`, width: 256, height: 256,
        ...(asset.attribution ? { attribution: asset.attribution } : {}),
      };
      await upsertEntry("graphics", graphic, { version: "1.0", graphics: [] });
    } catch (err) { console.error("icon save failed:", err); return; }
    handleGraphicsReload();
  };

  // ── Bake shapes → GLB (Phase 26) ──────────────────────────────────────────
  // The bake itself never mutates the world (sources stay editable); outputs are
  // independent so a failed local save doesn't kill the library write.
  const handleBakeConfirm = async (opts: { name: string; toLibrary: boolean; toFile: boolean }): Promise<void> => {
    const refs = bakeRefs;
    setBakeRefs(null);
    const world = worldRef.current;
    if (!refs || !world) return;
    try {
      const { glb, group, colliders } = await bakeShapes(world, refs);
      try {
        if (opts.toFile) {
          const url = URL.createObjectURL(new Blob([glb], { type: "model/gltf-binary" }));
          Object.assign(document.createElement("a"), { href: url, download: `${opts.name}.glb` }).click();
          URL.revokeObjectURL(url);
        }
        if (opts.toLibrary) {
          const thumbUrl = renderModelThumbnail(group);
          const asset: AssetDef = {
            id:           opts.name,
            label:        opts.name,
            category:     "Baked",
            path:         `/assets/models/${opts.name}.glb`,
            ...(thumbUrl ? { thumbnail: `/assets/models/${opts.name}_thumb.png` } : {}),
            collidable:   true,
            colliderType: "box",
            tags:         ["baked"],
            dateAdded:    new Date().toISOString(),
            colliders,
          };
          await writeAssetToLibrary({
            glbName: `${opts.name}.glb`,
            glb,
            ...(thumbUrl ? { thumbName: `${opts.name}_thumb.png`, thumbPng: dataURLtoArrayBuffer(thumbUrl) } : {}),
          }, asset);
          handleAssetsReload();
        }
      } finally {
        disposeBakeGroup(group);
      }
    } catch (err) {
      console.error("bake failed:", err);
    }
  };

  const handleConfirmMaterialEdit = async (patch: EditPatch): Promise<void> => {
    const pending = pendingMaterialEdit;
    setPendingMaterialEdit(null);
    if (!pending) return;
    try {
      await updateEntries<MaterialDef>("textures", pending.ids, m => patchEntry(m, patch));
    } catch (err) { console.error("material edit failed:", err); return; }
    pending.ids.forEach(id => assetManager.updateMaterial(id, patch as Partial<MaterialDef>));
    setMaterialList(assetManager.getMaterialList());
  };

  const handleObjectUpdate = (changes: Partial<WorldObject>): void => {
    if (!selected) return;
    const history = historyRef.current;
    if (selected.type === "opening") {
      const wallId = selected.parentId;
      if (!wallId) return;
      const openingChanges = changes as unknown as Partial<Opening>;
      let extra: Partial<Opening> = {};
      if (openingChanges.type && openingChanges.type !== (selected.data as Opening | null)?.type) {
        if (openingChanges.type === "window" || openingChanges.type === "passage") {
          extra = { height: 1.0, elevation: 1.0 };
        } else {
          extra = { height: 2.1, elevation: 0 };
        }
      }
      const fullChanges = { ...openingChanges, ...extra };
      worldRef.current?.transaction("update opening", () => {
        worldRef.current?.updateOpening(selected.zoneId, wallId, selected.id, fullChanges);
      });
      syncHistory();
      setSelected(prev => prev ? { ...prev, data: { ...(prev.data as Opening), ...fullChanges } } : null);
    } else if (selected.type === "wall") {
      const wallChanges = changes as Partial<WallDef> & { position?: Vec3; rotation?: { x: number; y: number; z: number } };
      if (wallChanges.position || wallChanges.rotation) {
        // Walls are node-backed — "position"/"rotation" aren't real WallDef fields, so
        // translate this into the same node-move / node-rotate-around-centroid the gizmo
        // does: XZ delta moves shared nodes, Y delta adjusts elevation on every run member.
        const runWalls = selected.runWalls ?? (selected.data ? [selected.data as WallDef] : []);
        const nodeIds  = [...new Set(runWalls.flatMap(w => [w.startNodeId, w.endNodeId]))];
        const zone     = worldRef.current?.zones.get(selected.zoneId);
        worldRef.current?.transaction("move wall", () => {
          if (wallChanges.position) {
            const cx = selected.wallRunCenter?.x ?? 0;
            const cz = selected.wallRunCenter?.z ?? 0;
            const dx = wallChanges.position.x - cx;
            const dz = wallChanges.position.z - cz;
            const dy = wallChanges.position.y - selected.position.y;
            if (dx || dz) {
              for (const nodeId of nodeIds) {
                const node = zone?.nodes.find(n => n.id === nodeId);
                if (node) worldRef.current?.updateNode(selected.zoneId, nodeId, { x: node.x + dx, z: node.z + dz });
              }
            }
            if (dy) {
              for (const w of runWalls) worldRef.current?.updateWall(selected.zoneId, w.id, { elevation: (w.elevation ?? 0) + dy });
            }
          }
          if (wallChanges.rotation) {
            const deltaDeg = wallChanges.rotation.y - (selected.wallRunAngleDeg ?? 0);
            if (Math.abs(deltaDeg) > 1e-6) {
              const rad = deltaDeg * Math.PI / 180;
              const cos = Math.cos(rad), sin = Math.sin(rad);
              const cx = selected.wallRunCenter?.x ?? 0;
              const cz = selected.wallRunCenter?.z ?? 0;
              for (const nodeId of nodeIds) {
                const node = zone?.nodes.find(n => n.id === nodeId);
                if (!node) continue;
                const ox = node.x - cx, oz = node.z - cz;
                worldRef.current?.updateNode(selected.zoneId, nodeId, {
                  x: cx + ox * cos - oz * sin,
                  z: cz + ox * sin + oz * cos,
                });
              }
            }
          }
        });
        syncHistory();
        return;
      }
      if (wallChanges.floor !== undefined) {
        // Floor level applies to every wall in the run.
        const runWalls = selected.runWalls ?? (selected.data ? [selected.data as WallDef] : []);
        worldRef.current?.beginTransaction("update wall floor");
        runWalls.forEach(w => {
          worldRef.current?.updateWall(selected.zoneId, w.id, { floor: wallChanges.floor });
        });
        worldRef.current?.commitTransaction();
      } else {
        worldRef.current?.transaction("update wall", () => {
          worldRef.current?.updateWall(selected.zoneId, selected.id, wallChanges);
        });
      }
      syncHistory();
      setSelected(prev => {
        if (!prev) return null;
        // Mirror sync keys locally so segment rows update before the async rebuild arrives.
        const syncKeys = ["material", "exteriorMaterial", "height", "materialOverrides", "floor"] as const;
        const updRunWalls = prev.runWalls
          ? prev.runWalls.map(w => ({ ...w, ...Object.fromEntries(syncKeys.filter(k => k in wallChanges).map(k => [k, (wallChanges as Record<string, unknown>)[k]])) }))
          : prev.runWalls;
        return { ...prev, data: { ...(prev.data as WallDef), ...wallChanges }, runWalls: updRunWalls };
      });
    } else if (selected.type === "floor") {
      const floorDef = selected.data as FloorDef;
      const floorChanges = changes as unknown as Partial<FloorDef>;
      worldRef.current?.transaction("update floor", () => {
        worldRef.current?.updateFloor(selected.zoneId, floorDef.id, floorChanges);
      });
      syncHistory();
      setSelected(prev => {
        if (!prev) return null;
        const current = prev.data as FloorDef;
        return {
          ...prev,
          data: {
            ...current,
            ...floorChanges,
            floorMesh: floorChanges.floorMesh
              ? { ...current.floorMesh, ...floorChanges.floorMesh }
              : current.floorMesh,
          },
        };
      });
    } else if (selected.type === "platform") {
      const platChanges = changes as unknown as Partial<PlatformDef>;
      worldRef.current?.transaction("update platform", () => {
        worldRef.current?.updatePlatform(selected.zoneId, selected.id, platChanges);
      });
      syncHistory();
      setSelected(prev => prev ? { ...prev, data: { ...(prev.data as PlatformDef), ...platChanges } } : null);
    } else if (selected.type === "stair") {
      const stairChanges = changes as unknown as Partial<StairDef>;
      worldRef.current?.transaction("update stair", () => {
        worldRef.current?.updateStair(selected.zoneId, selected.id, stairChanges);
      });
      syncHistory();
      setSelected(prev => prev ? { ...prev, data: { ...(prev.data as StairDef), ...stairChanges } } : null);
    } else if (selected.type === "ladder") {
      const ladderChanges = changes as unknown as Partial<LadderDef>;
      worldRef.current?.transaction("update ladder", () => {
        worldRef.current?.updateLadder(selected.zoneId, selected.id, ladderChanges);
      });
      syncHistory();
      setSelected(prev => prev ? { ...prev, data: { ...(prev.data as LadderDef), ...ladderChanges } } : null);
    } else if (selected.type === "trigger-volume") {
      const volChanges = changes as unknown as Partial<TriggerVolume>;
      worldRef.current?.transaction("update trigger volume", () => {
        worldRef.current?.updateTriggerVolume(selected.zoneId, selected.id, volChanges);
      });
      syncHistory();
    } else if (selected.type === "checkpoint") {
      const cpChanges = changes as unknown as Partial<CheckpointDef>;
      worldRef.current?.transaction("update checkpoint", () => {
        worldRef.current?.updateCheckpoint(selected.zoneId, selected.id, cpChanges);
      });
      syncHistory();
    } else if (selected.type === "light") {
      const lightChanges = changes as unknown as Partial<LightDef>;
      worldRef.current?.transaction("update light", () => {
        worldRef.current?.updateLight(selected.zoneId, selected.id, lightChanges);
      });
      syncHistory();
      setSelected(prev => prev ? { ...prev, data: { ...(prev.data as LightDef), ...lightChanges } } : null);
    } else if (selected.type === "decal") {
      const decChanges = changes as unknown as Partial<DecalDef>;
      worldRef.current?.transaction("update decal", () => {
        worldRef.current?.updateDecal(selected.zoneId, selected.id, decChanges);
      });
      syncHistory();
      setSelected(prev => prev ? { ...prev, data: { ...(prev.data as DecalDef), ...decChanges } } : null);
    } else if (selected.type === "shape") {
      const shapeChanges = changes as unknown as Partial<ShapeDef>;
      worldRef.current?.transaction("update shape", () => {
        worldRef.current?.updateShape(selected.zoneId, selected.id, shapeChanges);
      });
      syncHistory();
      setSelected(prev => prev ? { ...prev, data: { ...(prev.data as ShapeDef), ...shapeChanges } } : null);
    } else {
      const action = changes.properties !== undefined ? "update object properties" : "update object transform";
      worldRef.current?.transaction(action, () => {
        worldRef.current?.updateObject(selected.zoneId, selected.id, changes);
      });
      syncHistory();
      // Mirror into the selection payload so panel screens (e.g. Colliders) see edits live.
      setSelected(prev => prev ? { ...prev, data: { ...(prev.data as WorldObject), ...changes } } : null);
    }
  };

  const handleZoneScriptsChange = (scripts: ScriptDef[]): void => {
    const world = worldRef.current;
    if (!activeZoneId || !world) return;
    const zone = world.zones.get(activeZoneId);
    if (!zone) return;
    zone.scripts = scripts;
    setZoneScripts(scripts);
    setIsDirty(true);
  };

  const handleZoneDialoguesChange = (dialogues: DialogueTreeDef[]): void => {
    const world = worldRef.current;
    if (!activeZoneId || !world) return;
    const zone = world.zones.get(activeZoneId);
    if (!zone) return;
    zone.dialogues = dialogues;
    setZoneDialogues(dialogues);
    setIsDirty(true);
  };

  const handleStateSchemaChange = (schema: Record<string, StateSchema>): void => {
    const world = worldRef.current;
    if (!world?.world) return;
    world.transaction("edit state schema", () => { world.world!.stateSchema = schema; });
    setStateSchema(schema);
    syncHistory();
    setIsDirty(true);
  };

  /** STATE tab GAME scope (project open) — edits game.json's shared schema.
   *  Empty schema normalizes to undefined so the merge fallback semantics and
   *  the serialized game.json stay clean. Persisted on Save (writeGame); like
   *  the game item registry, it sits outside the scene's undo journal. */
  const handleGameSchemaChange = (schema: Record<string, StateSchema>): void => {
    const proj = projectRef.current;
    const world = worldRef.current;
    if (!proj || !world) return;
    const normalized = Object.keys(schema).length ? schema : undefined;
    proj.store.game.stateSchema = normalized;
    world.gameStateSchema = normalized;
    setGameSchema(schema);
    setIsDirty(true);
  };

  const handleWorldItemsChange = (items: ItemDef[]): void => {
    const world = worldRef.current;
    if (!world?.world) return;
    // Project open → the ITEMS tab edits the shared game.json registry (written on
    // Save; not undoable — game config sits outside the scene's undo journal).
    const proj = projectRef.current;
    if (proj) {
      proj.store.game.items = items;
      world.gameItems = items;
      setWorldItems(items);
      setIsDirty(true);
      return;
    }
    world.transaction("edit items", () => { world.world!.items = items; });
    setWorldItems(items);
    syncHistory();
    setIsDirty(true);
  };

  // Custom GUI registry (Phase 49) — the UI tab. Same scoping as items: project
  // open → the shared game.json registry (written on Save; not undoable), else
  // the scene's own WorldConfig.uiElements.
  const handleUiElementsChange = (uiElements: UiElementDef[]): void => {
    const world = worldRef.current;
    if (!world?.world) return;
    const proj = projectRef.current;
    if (proj) {
      proj.store.game.uiElements = uiElements;
      world.gameUiElements = uiElements;
      setWorldUiElements(uiElements);
      setIsDirty(true);
      return;
    }
    world.transaction("edit ui", () => { world.world!.uiElements = uiElements; });
    setWorldUiElements(uiElements);
    syncHistory();
    setIsDirty(true);
  };

  // ── Prefab library (Phase 44) ───────────────────────────────────────────────
  // Library edits persist to the project's game.json (written on Save) or, with
  // no project open, to the localStorage session library. Not undoable (items/
  // stateSchema precedent — game config sits outside the scene's undo journal).

  const applyPrefabs = (next: PrefabDef[]): void => {
    const world = worldRef.current;
    const proj  = projectRef.current;
    if (proj) {
      proj.store.game.prefabs = next;
      // Write game.json IMMEDIATELY (asset-import precedent: manifest.json writes on
      // import, not on Save). Otherwise a placed instance dangles — its def exists
      // only in this tab's memory and every other/fresh session sees an instance
      // with no definition (no variables panel, no re-expansion).
      void proj.store.writeGame().catch(e => console.warn("[prefabs] game.json write failed:", e));
    } else {
      saveSessionPrefabs(next);
    }
    if (world) world.prefabLibrary = next;
    setPrefabs(next);
  };

  const armPrefabPlacement = (prefab: PrefabDef): void => {
    setActiveTool("prefab");
    busRef.current.emit("tool:select", { tool: "prefab" });
    busRef.current.emit("prefab:selected", { prefab });
  };

  const handlePlacePrefab = (prefabId: string): void => {
    const prefab = prefabs.find(p => p.id === prefabId);
    if (prefab) armPrefabPlacement(prefab);
  };

  /** First placement of a built-in generator creates its library entry. */
  const handlePlaceGenerator = (generatorId: string): void => {
    const gen = GENERATORS[generatorId];
    if (!gen) return;
    const existing = prefabs.find(p => p.kind === "generator" && p.generatorId === generatorId);
    if (existing) { armPrefabPlacement(existing); return; }
    const prefab: PrefabDef = {
      id:          `pfb_${crypto.randomUUID().slice(0, 8)}`,
      name:        gen.label,
      kind:        "generator",
      version:     1,
      generatorId: gen.id,
      variables:   structuredClone(gen.variables),
      dateAdded:   new Date().toISOString().slice(0, 10),
    };
    applyPrefabs([...prefabs, prefab]);
    armPrefabPlacement(prefab);
  };

  const handlePrefabRename = (prefabId: string, name: string): void => {
    applyPrefabs(prefabs.map(p => p.id === prefabId ? { ...p, name } : p));
  };

  const handlePrefabDelete = (prefabId: string): void => {
    if ((prefabInstanceCounts.get(prefabId) ?? 0) > 0) return;  // panel disables, belt-and-braces
    applyPrefabs(prefabs.filter(p => p.id !== prefabId));
  };

  const prefabInstanceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const world = worldRef.current;
    if (world) {
      for (const zone of world.zones.values()) {
        for (const rec of zone.prefabInstances ?? []) {
          counts.set(rec.prefabId, (counts.get(rec.prefabId) ?? 0) + 1);
        }
      }
    }
    return counts;
    // prefabTick bumps on prefabinstance:added/removed; zones covers scene loads.
  }, [prefabTick, zones, prefabs]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Selected entity is a prefab-instance member → resolve its record + def for
  // the PropertiesPanel Prefab section. For a multi-selection (click-on-member
  // expands to the whole instance, Phase 47.1) the section only shows when the
  // selection is EXACTLY that one instance's full member set — a mixed or
  // partial selection keeps the plain multi view (its generic Delete etc.).
  const selPrefabInfo = useMemo(() => {
    const stamp = (selected?.data as { prefab?: { instanceId: string } } | null | undefined)?.prefab;
    if (!selected || !stamp) return null;
    const zone   = worldRef.current?.zones.get(selected.zoneId);
    const record = zone?.prefabInstances?.find(r => r.id === stamp.instanceId);
    if (!record || !zone) return null;
    if (multiSelected.length > 1) {
      const memberIds = new Set<string>();
      for (const arr of [zone.objects, zone.triggerVolumes ?? [], zone.shapes ?? [], zone.stairs, zone.ladders ?? []]) {
        for (const e of arr as Array<{ id: string; prefab?: { instanceId: string } }>) {
          if (e.prefab?.instanceId === record.id) memberIds.add(e.id);
        }
      }
      if (multiSelected.length !== memberIds.size || !multiSelected.every(r => memberIds.has(r.id))) return null;
    }
    // prefab === null → orphaned instance (def missing from the library, e.g. a
    // game.json that predates the immediate-write fix). The section renders a
    // degraded view: Unlink / Delete instance still work, variables don't.
    return { prefab: prefabs.find(p => p.id === record.prefabId) ?? null, record };
    // prefabTick keeps the record view fresh after variable/origin commits.
  }, [selected, multiSelected, prefabs, prefabTick]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Mirror the instance-selection context for the memoized undo/redo handlers.
  useEffect(() => {
    undoInstanceCtxRef.current = selPrefabInfo && selected
      ? { zoneId: selected.zoneId, instanceId: selPrefabInfo.record.id, primaryId: selected.id }
      : null;
  }, [selPrefabInfo, selected]);

  /** After a re-expansion, the selected member's def was replaced (same id) or
   *  removed — refresh or drop the selection so the panel shows live data. */
  const refreshSelectionAfterReexpand = (): void => {
    const world = worldRef.current;
    setSelected(prev => {
      if (!prev) return prev;
      const zone = world?.zones.get(prev.zoneId);
      const arr: Array<{ id: string }> | undefined =
        prev.type === "object" ? zone?.objects :
        prev.type === "trigger-volume" ? zone?.triggerVolumes :
        prev.type === "shape" ? zone?.shapes :
        prev.type === "stair" ? zone?.stairs :
        prev.type === "ladder" ? zone?.ladders : undefined;
      const data = arr?.find(e => e.id === prev.id);
      if (!data) { busRef.current.emit("object:deselected", {}); return null; }
      return { ...prev, data: data as SelectedObjectPayload["data"] };
    });
    setPrefabTick(t => t + 1);
  };

  /**
   * Re-expansion removes + re-adds members, so SelectionManager drops the whole
   * selection (and the panel would unmount — jarring mid-edit). Instead:
   * suppress the teardown events, let the transaction run, then re-select the
   * instance's (possibly changed) member set once its meshes have rebuilt.
   * The React panel state never clears, so a focused variables input survives.
   */
  const withInstanceReselect = (zoneId: string, instanceId: string, primaryId: string | undefined, fn: () => void): void => {
    suppressSelRef.current = true;
    // Cleanly detach the 3D-side systems (SelectionManager tints, GizmoManager
    // group tracking, TransformControls) BEFORE the rebuild — otherwise the
    // gizmo re-tracks meshes on every shrinking selection:changed while those
    // meshes are being disposed/rebuilt async, and can end up holding half-dead
    // geometry (renders as melted/stretched tiles). App's React listeners are
    // suppressed, so the panel stays mounted throughout.
    busRef.current.emit("object:deselected", {});
    try { fn(); } finally {
      window.setTimeout(() => {
        suppressSelRef.current = false;
        const world = worldRef.current;
        const members = world ? collectInstanceMembers(world, zoneId, instanceId) : new Map();
        if (members.size === 0) { busRef.current.emit("object:deselected", {}); setSelected(null); setPrefabTick(t => t + 1); return; }
        const refs: SelectedRef[] = [...members.values()].map(e => ({ id: e.id, type: e.type, zoneId }));
        if (primaryId) {
          const i = refs.findIndex(r => r.id === primaryId);
          if (i > 0) refs.unshift(refs.splice(i, 1)[0]);
        }
        busRef.current.emit("selection:set", { refs });
        setPrefabTick(t => t + 1);
      }, 150);   // member meshes rebuild async (cached models — well under this)
    }
  };

  const handlePrefabVariablesChange = (vars: Record<string, PrefabVarValue>): void => {
    const world = worldRef.current;
    const info = selPrefabInfo;
    if (!world || !info?.prefab || !selected) return;
    const prefab = info.prefab;
    withInstanceReselect(selected.zoneId, info.record.id, selected.id, () => {
      world.transaction(`edit ${prefab.name} variables`, () => {
        world.updatePrefabInstance(selected.zoneId, info.record.id, { variables: { ...info.record.variables, ...vars } });
        reexpandInstance(world, selected.zoneId, prefab, info.record.id);
      });
    });
    syncHistory();
  };

  const handlePrefabOriginChange = (origin: { position: Vec3; rotationY: number }): void => {
    const world = worldRef.current;
    const info = selPrefabInfo;
    if (!world || !info?.prefab || !selected) return;
    const prefab = info.prefab;
    withInstanceReselect(selected.zoneId, info.record.id, selected.id, () => {
      world.transaction(`move ${prefab.name} instance`, () => {
        world.updatePrefabInstance(selected.zoneId, info.record.id, { origin });
        reexpandInstance(world, selected.zoneId, prefab, info.record.id);
      });
    });
    syncHistory();
  };

  const handlePrefabReexpand = (): void => {
    const world = worldRef.current;
    const info = selPrefabInfo;
    if (!world || !info?.prefab || !selected) return;
    const prefab = info.prefab;
    withInstanceReselect(selected.zoneId, info.record.id, selected.id, () => {
      reexpandInstance(world, selected.zoneId, prefab, info.record.id);
    });
    syncHistory();
  };

  const handlePrefabUnlink = (): void => {
    const world = worldRef.current;
    const info = selPrefabInfo;
    if (!world || !info || !selected) return;
    unlinkInstance(world, selected.zoneId, info.record.id);
    syncHistory();
    refreshSelectionAfterReexpand();
  };

  // ── Isolated prefab edit mode (Phase 47) ───────────────────────────────────

  const handleEditPrefab = (prefabId: string): void => {
    const world = worldRef.current, zones = zonesRef.current, history = historyRef.current;
    const prefab = prefabs.find(p => p.id === prefabId);
    if (!world || !zones || !history || !prefab || prefab.kind !== "snapshot" || editingPrefabRef.current) return;
    editSessionRef.current ??= new PrefabEditSession(world, zones, history, () => sceneRef.current?.editorCamera ?? null);
    editingPrefabRef.current = true;
    setEditingPrefab({ id: prefab.id, name: prefab.name });
    busRef.current.emit("object:deselected", {});
    setSelected(null);
    setLeftPanel(null);
    void editSessionRef.current.enter(prefab);
  };

  const handlePrefabEditSave = (): void => {
    const session = editSessionRef.current;
    if (!session?.active) return;
    void (async () => {
      const updated = await session.saveAndExit();
      editingPrefabRef.current = false;
      setEditingPrefab(null);
      if (!updated) return;
      applyPrefabs(prefabs.map(p => p.id === updated.id ? updated : p));
      // Propagate: re-expand every open-scene instance in ONE undoable transaction.
      const world = worldRef.current;
      if (world) {
        const instances = findInstances(world, updated.id);
        if (instances.length > 0) {
          world.transaction(`update prefab ${updated.name} instances`, () => {
            for (const { zoneId, record } of instances) reexpandInstance(world, zoneId, updated, record.id);
          });
          syncHistory();
        }
      }
      setPrefabTick(t => t + 1);
    })();
  };

  const handlePrefabEditCancel = (): void => {
    const session = editSessionRef.current;
    if (!session?.active) return;
    void session.cancel().then(() => {
      editingPrefabRef.current = false;
      setEditingPrefab(null);
    });
  };

  // Just-created prefab id → the PrefabPanel opens its row in rename mode.
  const [prefabRenameRequest, setPrefabRenameRequest] = useState<string | null>(null);

  /** Capture the multi-selection as a snapshot prefab; the originals are
   *  replaced (in one undo step) by the prefab's first linked instance. */
  const handleCreatePrefab = (refs: SelectedRef[]): void => {
    const world = worldRef.current;
    if (!world || refs.length === 0) return;
    const zoneId = refs[0].zoneId;
    const name = `Prefab ${prefabs.length + 1}`;
    const cap = captureSnapshotPrefab(world, refs, name);
    if (!cap) return;
    if (cap.skipped.length > 0) {
      console.warn(`[prefabs] skipped non-capturable selection types: ${cap.skipped.join(", ")} (walls/floors/platforms are node-backed — not capturable v1)`);
    }
    applyPrefabs([...prefabs, cap.prefab]);   // library write (not undoable, items precedent)
    world.transaction(`create prefab ${name}`, () => {
      removeEntities(world, zoneId, cap.captured);
      instantiatePrefab(world, zoneId, cap.prefab, cap.origin);   // joins this transaction
    });
    syncHistory();
    busRef.current.emit("object:deselected", {});
    setSelected(null);
    setPrefabTick(t => t + 1);
    setLeftPanel("prefabs");                 // show the new prefab…
    setPrefabRenameRequest(cap.prefab.id);   // …with its name ready to type over
  };

  // Prefabs panel "Create from selection": handler present only when the current
  // selection can be captured; otherwise the hint explains why the button is off.
  const PREFABABLE_TYPES = ["object", "trigger-volume", "shape", "stair", "ladder"];
  const prefabSelectionRefs: SelectedRef[] =
    multiSelected.length > 1 ? multiSelected
    : selected && selected.id !== "__spawn__" ? [{ id: selected.id, type: selected.type, zoneId: selected.zoneId } as SelectedRef]
    : [];
  const prefabSelectionEligible =
    prefabSelectionRefs.some(r => PREFABABLE_TYPES.includes(r.type as string)) && !selPrefabInfo;
  const prefabSelectionHint =
    prefabSelectionRefs.length === 0 ? "Select an object, trigger volume, shape, stair, or ladder first"
    : selPrefabInfo ? "Prefab members can't be re-captured — unlink the instance first"
    : "Selection has no capturable entities (walls/floors/platforms are node-backed)";
  const prefabCreateFromSelection = prefabSelectionEligible
    ? () => handleCreatePrefab(prefabSelectionRefs)
    : undefined;

  const handlePrefabDeleteInstance = (): void => {
    const world = worldRef.current;
    const info = selPrefabInfo;
    if (!world || !info || !selected) return;
    deleteInstance(world, selected.zoneId, info.record.id);
    syncHistory();
    busRef.current.emit("object:deselected", {});
    setSelected(null);
    setPrefabTick(t => t + 1);
  };

  // Properties-panel script row click → open that script in the Scripts panel.
  const [scriptEditRequest, setScriptEditRequest] = useState<{ scriptId: string; n: number } | null>(null);
  const handleEditScriptRow = (scriptId: string): void => {
    setLeftPanel("scripts");
    setScriptEditRequest({ scriptId, n: Date.now() });   // nonce: re-click re-opens
  };

  const handleObjectScriptsChange = (objectId: string, scripts: ScriptDef[]): void => {
    if (!selected) return;
    if (selected.type === "trigger-volume") {
      worldRef.current?.transaction("update volume scripts", () => {
        worldRef.current?.updateTriggerVolume(selected.zoneId, objectId, { scripts });
      });
    } else {
      worldRef.current?.transaction("update object scripts", () => {
        worldRef.current?.updateObject(selected.zoneId, objectId, { scripts });
      });
    }
    syncHistory();
  };

  const handleDeleteConfirm = (keepScripts: boolean): void => {
    const prompt = deletePrompt;
    setDeletePrompt(null);
    if (!prompt) return;
    const { type, id, zoneId, scripts } = prompt;
    const world = worldRef.current;
    if (!world) return;
    worldRef.current?.transaction(`delete ${type}`, () => {
      if (keepScripts) {
        const zone = world.zones.get(zoneId)!;
        zone.scripts = [...(zone.scripts ?? []), ...scripts];
        setZoneScripts([...(zone.scripts)]);
      }
      if (type === "volume") world.removeTriggerVolume(zoneId, id);
      else world.removeObject(zoneId, id);
    });
    syncHistory();
    setSelected(null);
    busRef.current.emit("object:deselected", {});
  };

  const activeZone = zones.find(z => z.id === activeZoneId);
  const zoneObjects = activeZone?.objects ?? [];
  const zonePlatforms = activeZone?.platforms ?? [];
  const zoneShapes = activeZone?.shapes ?? [];
  const zoneStairs = activeZone?.stairs ?? [];
  const zoneWalls = activeZone?.walls ?? [];
  const zoneFloors = activeZone?.floors ?? [];
  const objectScripts =
    selected?.type === "object"         ? ((selected.data as WorldObject)?.scripts     ?? [])
    : selected?.type === "trigger-volume" ? ((selected.data as TriggerVolume)?.scripts ?? [])
    : null;
  const selectedObjectId =
    selected?.type === "object"          ? selected.id
    : selected?.type === "trigger-volume" ? selected.id
    : null;

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0e16", position: "relative", overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
                 cursor: activeTool === "trigger-volume" ? "crosshair" : "default" }}
      />


      {!isGame && <>
      <Toolbar
        activeTool={activeTool}
        openPanel={leftPanel}
        onToolSelect={handleToolSelect}
        onPanelToggle={handlePanelToggle}
        onPreview={handlePreviewEnter}
        onNewGame={handleNewGame}
        onContinue={handleContinue}
        onOcclusionTest={handleOcclusionTest}
        hasGameSave={hasGameSave}
        isPreview={isPreview}
        spawnMode={spawnMode}
        onSpawnMode={m => { setSpawnMode(m); busRef.current.emit("spawn:mode", { mode: m }); }}
      />
      <LeftPanel
        panelId={leftPanel}
        assets={assets}
        selectedAssetId={selectedAssetId}
        onAssetSelect={handleAssetSelect}
        onImport={() => setShowImporter(true)}
        onDeleteAssets={handleRequestAssetDelete}
        onEditAssets={handleRequestAssetEdit}
        onRestageAsset={id => { const a = assets.find(x => x.id === id); if (a) setStagingAsset(a); }}
        onReoriginAsset={id => { const a = assets.find(x => x.id === id); if (a) setReoriginAsset(a); }}
        materials={materialList}
        onMaterialImport={openMaterialImporter}
        onDeleteMaterials={handleRequestMaterialDelete}
        onEditMaterials={handleRequestMaterialEdit}
        sounds={sounds}
        onSoundImport={() => setAudioImporterOpen(true)}
        onDeleteSounds={handleDeleteSounds}
        onEditSounds={handleRequestSoundEdit}
        skyboxes={skyboxes}
        selectedSkybox={worldSkybox}
        onSkyboxSelect={handleWorldSkyChange}
        onSkyboxImport={() => setSkyboxImporterOpen(true)}
        onDeleteSkyboxes={handleDeleteSkyboxes}
        onEditSkyboxes={handleRequestSkyboxEdit}
        graphics={graphics}
        onGraphicsImport={() => setGraphicsImporterOpen(true)}
        onDeleteGraphics={handleRequestGraphicDelete}
        onEditGraphics={handleRequestGraphicEdit}
        playerModelAssetId={worldRef.current?.world?.playerSettings?.modelAssetId ?? undefined}
        onClose={() => setLeftPanel(null)}
        groups={groups}
        hiddenGroupIds={hiddenGroups}
        onGroupAdd={handleAddGroup}
        onGroupRemove={handleRemoveGroup}
        onGroupRename={handleRenameGroup}
        onGroupToggleVisibility={handleToggleGroupVisibility}
        groupMembers={groupMembers}
        multiSelectedCount={multiSelected.length}
        onAddSelectedToGroup={handleAddSelectedToGroup}
        onRemoveGroupMember={handleRemoveGroupMember}
        onSelectGroupMembers={handleSelectGroupMembers}
        onDeleteGroupMembers={handleDeleteGroupMembers}
        onDuplicateGroupMembers={handleDuplicateGroupMembers}
        activeZoneId={activeZoneId}
        zoneScripts={zoneScripts}
        zoneDialogues={zoneDialogues}
        objectScripts={objectScripts}
        selectedObjectId={selectedObjectId}
        triggerVolumes={triggerVolumes}
        zoneObjects={zoneObjects}
        zonePlatforms={zonePlatforms}
        zoneShapes={zoneShapes}
        zoneLights={zoneLights}
        zoneStairs={zoneStairs}
        zoneWalls={zoneWalls}
        zoneFloors={zoneFloors}
        zoneCheckpoints={checkpoints}
        onZoneScriptsChange={handleZoneScriptsChange}
        onZoneDialoguesChange={handleZoneDialoguesChange}
        onObjectScriptsChange={handleObjectScriptsChange}
        stateSchema={stateSchema}
        onStateSchemaChange={handleStateSchemaChange}
        gameStateSchema={project ? gameSchema : undefined}
        onGameStateSchemaChange={project ? handleGameSchemaChange : undefined}
        isPreviewing={isPreview}
        scriptEditRequest={scriptEditRequest}
        worldItems={worldItems}
        onWorldItemsChange={handleWorldItemsChange}
        projectSceneIds={project ? project.store.sceneIds : undefined}
        uiElements={worldUiElements}
        onUiElementsChange={handleUiElementsChange}
        decalTextures={decalTextures}
        selectedDecalId={selectedDecalId}
        onDecalSelect={handleDecalSelect}
        prefabs={prefabs}
        prefabInstanceCounts={prefabInstanceCounts}
        onPlacePrefab={handlePlacePrefab}
        onPlaceGenerator={handlePlaceGenerator}
        onPrefabRename={handlePrefabRename}
        onPrefabDelete={handlePrefabDelete}
        onPrefabEdit={handleEditPrefab}
        onPrefabCreateFromSelection={prefabCreateFromSelection}
        prefabSelectionHint={prefabSelectionHint}
        prefabRenameRequestId={prefabRenameRequest}
        onPrefabRenameRequestHandled={() => setPrefabRenameRequest(null)}
      />
      {editingPrefab && (
        <PrefabEditBar
          prefabName={editingPrefab.name}
          onSave={handlePrefabEditSave}
          onCancel={handlePrefabEditCancel}
        />
      )}
      <TopBar
        activeFloor={activeFloor}
        onFloorChange={handleFloorChange}
        onCameraTopDown={() => busRef.current.emit("camera:topdown", {})}
        onSave={handleSave}
        onLoad={handleLoad}
        onNew={handleNew}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        isDirty={isDirty}
        lastAutosaveAt={lastAutosaveAt}
        project={project ? {
          name: project.store.name,
          sceneIds: project.store.sceneIds,
          currentSceneId: project.sceneId,
          entryScene: project.store.entryScene,
        } : null}
        onProjectNew={handleProjectNew}
        onProjectOpen={handleProjectOpen}
        onProjectClose={() => void handleProjectClose()}
        onProjectPlay={() => void handleProjectPlay()}
        onProjectExport={isDesktop() ? () => void handleProjectExport() : undefined}
        onSceneSwitch={id => void handleProjectSceneSwitch(id)}
        onSceneAdd={() => void handleProjectSceneAdd()}
        onSceneDelete={id => void handleProjectSceneDelete(id)}
        onEntrySceneChange={id => void handleEntrySceneChange(id)}
      />
      <PropertiesPanel
        activeTool={activeTool}
        selected={selected}
        materialList={materialList}
        quality={quality}
        showPerfCounter={showPerfCounter}
        onTogglePerfCounter={handleTogglePerfCounter}
        showCrosshair={showCrosshair}
        onToggleCrosshair={handleToggleCrosshair}
        showGridFloor={showGridFloor}
        onToggleGridFloor={handleToggleGridFloor}
        onObjectUpdate={handleObjectUpdate}
        onSegmentUpdate={handleSegmentUpdate}
        onFloorNodesUpdate={handleFloorNodesUpdate}
        getNodeLinks={getNodeLinks}
        onImportMaterial={openMaterialImporter}
        onQualityChange={handleQualityChange}
        onCopyRunToFloor={handleCopyRunToFloor}
        onFillRunWithFloor={isWallRunClosed() && !runHasFloorFill() ? handleFillRunWithFloor : undefined}
        onAddCeilingToRun={isWallRunClosed() && !findRunCeiling() ? handleAddCeilingToRun : undefined}
        onToggleCeilingGhost={findRunCeiling() ? handleToggleCeilingGhost : undefined}
        runCeilingGhosted={!!findRunCeiling()?.editorGhost}
        onUnlinkRunCorners={selected?.type === "wall" ? handleUnlinkRunCorners : undefined}
        runLinkedFloors={selected?.type === "wall" ? getRunLinkedFloors() : undefined}
        onDelete={selected || multiSelected.length > 1 ? handleDelete : undefined}
        multiSelected={multiSelected}
        onCopy={handleCopy}
        onDuplicate={handleDuplicate}
        onGroupSelected={handleGroupSelected}
        onSelectGroup={handleSelectGroupMembers}
        onBake={refs => setBakeRefs(refs)}
        decalTextures={decalTextures}
        onVolumeScriptsChange={selectedObjectId ? (scripts) => handleObjectScriptsChange(selectedObjectId, scripts) : undefined}
        onEditScript={handleEditScriptRow}
        zones={zones}
        groups={groups}
        activeZoneId={activeZoneId}
        playerSettings={worldRef.current?.world?.playerSettings}
        assets={assets}
        sounds={sounds}
        onPlayerSettingsChange={handlePlayerSettingsChange}
        onSpawnPositionChange={handleSpawnPositionChange}
        worldLighting={worldLighting}
        onWorldLightingChange={handleWorldLightingChange}
        worldAudio={worldAudio}
        onWorldAudioChange={handleWorldAudioChange}
        zoneLights={zoneLights}
        onSelectLight={handleSelectLight}
        bus={busRef.current}
        onPreviewClip={(objectId, clipName) => objectPlacerRef.current?.previewClip(objectId, clipName)}
        onStopPreview={(objectId) => objectPlacerRef.current?.stopPreview(objectId)}
        onAutoPlayChange={(objectId, clipName) => {
          objectPlacerRef.current?.setAutoPlay(objectId, clipName);
          if (selected) worldRef.current?.updateObject(selected.zoneId, objectId, { autoPlayAnimation: clipName });
        }}
        defaultColliderFor={objectId => {
          const aabb = objectPlacerRef.current?.getLocalAABB(objectId);
          return aabb ? defaultColliderFromAABB(aabb.center, aabb.size) : null;
        }}
        onSaveCollidersToAsset={(objectId, assetId, colliders) => void handleSaveCollidersToAsset(objectId, assetId, colliders)}
        hullPointsFor={objectId => objectPlacerRef.current?.getLocalHullPoints(objectId) ?? null}
        prefabInfo={selPrefabInfo}
        onPrefabVariablesChange={handlePrefabVariablesChange}
        onPrefabOriginChange={handlePrefabOriginChange}
        onPrefabReexpand={handlePrefabReexpand}
        onPrefabUnlink={handlePrefabUnlink}
        onPrefabDeleteInstance={handlePrefabDeleteInstance}
        onCreatePrefab={handleCreatePrefab}
      />
      <CoordinateDisplay coords={coords} />
      </>}

      {activeTool === "trigger-volume" && !isPreview && (
        <div style={{
          position: "absolute", bottom: 64, left: "50%", transform: "translateX(-50%)",
          background: "rgba(10,14,22,0.92)", border: "1px solid rgba(0,255,200,0.3)",
          borderRadius: 8, padding: "7px 16px", zIndex: 30, pointerEvents: "none",
          color: "#44ccaa", fontSize: 11, fontFamily: "monospace", whiteSpace: "nowrap",
        }}>
          Click &amp; drag on floor to place trigger volume · Scroll to adjust height
        </div>
      )}

      {autoFloorPrompt && (
        <div style={{
          position: "absolute", bottom: 56, left: "50%", transform: "translateX(-50%)",
          background: "rgba(10,14,22,0.97)", border: "1px solid rgba(80,180,120,0.4)",
          borderRadius: 8, padding: "10px 16px", zIndex: 30,
          display: "flex", alignItems: "center", gap: 12,
          boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        }}>
          <span style={{ color: "#7acca0", fontSize: 11 }}>
            Fill closed loop with floor?
          </span>
          <button
            onClick={() => {
              const { zoneId, level, points, nodeIds } = autoFloorPrompt;
              const zone = worldRef.current?.zones.get(zoneId);
              const elevation = zone?.floors.find(f => f.level === level)?.elevation ?? level * 3.0;
              worldRef.current?.transaction("auto-fill floor", () => {
                worldRef.current?.addFloor(zoneId, {
                  id:            crypto.randomUUID(),
                  level,
                  elevation,
                  ceilingHeight: null,
                  floorMesh: { shape: "polygon", points, nodeIds, material: "concrete_01" },
                });
              });
              syncHistory();
              setAutoFloorPrompt(null);
            }}
            style={{
              background: "rgba(80,180,120,0.2)", border: "1px solid rgba(80,180,120,0.5)",
              borderRadius: 4, color: "#7acca0", fontSize: 10, cursor: "pointer",
              padding: "3px 10px", fontFamily: "monospace",
            }}
          >Yes</button>
          <button
            onClick={() => setAutoFloorPrompt(null)}
            style={{
              background: "transparent", border: "1px solid rgba(80,120,180,0.3)",
              borderRadius: 4, color: "#4a6a8a", fontSize: 10, cursor: "pointer",
              padding: "3px 10px", fontFamily: "monospace",
            }}
          >No</button>
        </div>
      )}

      {isPreview && (
        <PreviewHUD
          bus={busRef.current}
          activeZoneName={zones.find(z => z.id === activeZoneId)?.name}
          scheme={previewScheme}
          mode={previewMode ?? "game"}
          showCrosshair={showCrosshair}
        />
      )}

      {isPreview && worldRef.current && (
        <GameGuiOverlay bus={busRef.current} world={worldRef.current} />
      )}

      {isPreview && previewScheme === "touch" && previewRef.current?.input && (
        <TouchControlsOverlay
          shared={previewRef.current.input.touch.shared}
          joystickRadius={previewRef.current.input.bindings.touch.joystickRadius}
          layout={previewRef.current.input.bindings.touch.layout}
        />
      )}

      {isPreview && pauseOpen && (
        <PauseMenu
          bus={busRef.current}
          onResume={() => {
            pauseOpenRef.current = false;
            setPauseOpen(false);
            busRef.current.emit("pause:closed", {});
          }}
          onExit={() => {
            pauseOpenRef.current = false;
            setPauseOpen(false);
            busRef.current.emit("pause:closed", {});
            previewRef.current?.exit();
          }}
        />
      )}

      {newProjectOpen && (
        <NewProjectModal
          defaultSceneId={slugifyId(worldRef.current?.metadata?.name ?? "") || "scene_01"}
          onCancel={() => setNewProjectOpen(false)}
          onConfirm={(name, startBlank, sceneId) => void handleProjectCreate(name, startBlank, sceneId)}
        />
      )}

      {openProjectOpen && (
        <OpenProjectModal
          onCancel={() => setOpenProjectOpen(false)}
          onConfirm={id => void handleProjectOpenPick(id)}
        />
      )}

      {isPreview && bagOpen && worldRef.current && (
        <BagOverlay
          bus={busRef.current}
          world={worldRef.current}
          onClose={() => {
            bagOpenRef.current = false;
            setBagOpen(false);
            busRef.current.emit("bag:closed", {});
          }}
        />
      )}

      {isPreview && showPerfCounter && <FpsCounter getInfo={getRenderInfo} />}

      {!isGame && (
        <div style={{
          position: "absolute", bottom: 16, right: 296,
          color: "rgba(80,120,180,0.25)", fontSize: 10, fontFamily: "monospace", letterSpacing: 2,
        }}>
SquareDance
        </div>
      )}

      {showImporter && (
        <ModelImporterModal
          existingTags={[...new Set(assets.flatMap(a => a.tags))].sort()}
          existingAttributions={assets.flatMap(a => a.attribution ? [a.attribution] : [])}
          onComplete={imported => {
            handleAssetsReload();
            setShowImporter(false);
            if (imported.length === 1) handleAssetSelect(imported[0]!.id);
          }}
          onClose={() => setShowImporter(false)}
        />
      )}

      {pendingAssetDelete && (
        <DeleteAssetDialog
          labels={pendingAssetDelete.labels}
          usage={pendingAssetDelete.usage}
          onCancel={() => setPendingAssetDelete(null)}
          onConfirm={deleteFiles => void handleConfirmAssetDelete(deleteFiles)}
        />
      )}

      {materialImporterOpen && (
        <MaterialImporterModal
          onComplete={() => { setMaterialImporterOpen(false); handleMaterialsReload(); }}
          onClose={() => setMaterialImporterOpen(false)}
        />
      )}

      {audioImporterOpen && (
        <AudioImporterModal
          existingTags={[...new Set(sounds.flatMap(s => s.tags ?? []))].sort()}
          existingAttributions={[...sounds, ...assets].flatMap(s => s.attribution ? [s.attribution] : [])}
          existingCategories={[...new Set(sounds.map(s => s.category ?? "SFX"))]}
          onComplete={() => { setAudioImporterOpen(false); handleSoundsReload(); }}
          onClose={() => setAudioImporterOpen(false)}
        />
      )}

      {graphicsImporterOpen && (
        <GraphicsImporterModal
          onComplete={() => { setGraphicsImporterOpen(false); handleGraphicsReload(); }}
          onClose={() => setGraphicsImporterOpen(false)}
        />
      )}

      {pendingGraphicDelete && (
        <DeleteAssetDialog
          labels={pendingGraphicDelete.labels}
          usage={pendingGraphicDelete.usage}
          noun="graphic"
          usageNoun="reference"
          usageEffect="Those item icons and UI elements will show blank until reassigned."
          onCancel={() => setPendingGraphicDelete(null)}
          onConfirm={deleteFiles => void handleConfirmGraphicDelete(deleteFiles)}
        />
      )}

      {pendingGraphicEdit && (
        <EditMetadataDialog
          items={pendingGraphicEdit.items}
          noun="graphic"
          categoryOptions={[...new Set(["Icons", "HUD", ...graphics.map(g => g.category ?? "Icons")])]}
          initial={pendingGraphicEdit.initial}
          onCancel={() => setPendingGraphicEdit(null)}
          onSave={patch => void handleConfirmGraphicEdit(patch)}
        />
      )}

      {skyboxImporterOpen && (
        <SkyboxImporterModal
          onComplete={() => { setSkyboxImporterOpen(false); handleSkyboxesReload(); }}
          onClose={() => setSkyboxImporterOpen(false)}
        />
      )}

      {pendingMaterialDelete && (
        <DeleteAssetDialog
          labels={pendingMaterialDelete.labels}
          usage={pendingMaterialDelete.usage}
          noun="material"
          usageNoun="surface"
          usageEffect="Those surfaces will fall back to the default look until reassigned."
          onCancel={() => setPendingMaterialDelete(null)}
          onConfirm={deleteFiles => void handleConfirmMaterialDelete(deleteFiles)}
        />
      )}

      {pendingAssetEdit && (
        <EditMetadataDialog
          items={pendingAssetEdit.items}
          noun="model"
          categoryOptions={ASSET_CATEGORIES}
          initial={pendingAssetEdit.initial}
          tagSuggestions={[...new Set(assets.flatMap(a => a.tags))].sort()}
          onCancel={() => setPendingAssetEdit(null)}
          onSave={patch => void handleConfirmAssetEdit(patch)}
        />
      )}

      {stagingAsset && (
        <ThumbnailStagerModal
          asset={stagingAsset}
          onCancel={() => setStagingAsset(null)}
          onSave={dataUrl => void handleSaveThumbnail(stagingAsset, dataUrl)}
          onSaveIcon={dataUrl => void handleSaveIcon(stagingAsset, dataUrl)}
        />
      )}

      {reoriginAsset && (
        <ReoriginModal
          asset={reoriginAsset}
          placedCount={[...(worldRef.current?.zones.values() ?? [])]
            .reduce((n, z) => n + z.objects.filter(o => o.assetId === reoriginAsset.id).length, 0)}
          onCancel={() => setReoriginAsset(null)}
          onApply={(delta, compensate) => void handleApplyReorigin(reoriginAsset, delta, compensate)}
        />
      )}

      {bakeRefs && (
        <BakeDialog
          shapeCount={bakeRefs.length}
          onConfirm={opts => void handleBakeConfirm(opts)}
          onCancel={() => setBakeRefs(null)}
        />
      )}

      {pendingMaterialEdit && (
        <EditMetadataDialog
          items={pendingMaterialEdit.items}
          noun="material"
          categoryOptions={MAT_CAT_ORDER}
          initial={pendingMaterialEdit.initial}
          onCancel={() => setPendingMaterialEdit(null)}
          onSave={patch => void handleConfirmMaterialEdit(patch)}
        />
      )}

      {pendingSoundEdit && (
        <EditMetadataDialog
          items={pendingSoundEdit.items}
          noun="sound"
          categoryOptions={[...new Set(["SFX", "Music", "Ambient", ...sounds.map(s => s.category ?? "SFX")])]}
          initial={pendingSoundEdit.initial}
          tagSuggestions={[...new Set(sounds.flatMap(s => s.tags ?? []))].sort()}
          onCancel={() => setPendingSoundEdit(null)}
          onSave={patch => void handleConfirmSoundEdit(patch)}
        />
      )}

      {pendingSkyboxEdit && (
        <EditMetadataDialog
          items={pendingSkyboxEdit.items}
          noun="skybox"
          categoryOptions={["Day", "Sunset", "Night", "Space", "Studio", "Other"]}
          initial={pendingSkyboxEdit.initial}
          onCancel={() => setPendingSkyboxEdit(null)}
          onSave={patch => void handleConfirmSkyboxEdit(patch)}
        />
      )}

      {deletePrompt && (
        <ScriptDetachDialog
          scriptCount={deletePrompt.scripts.length}
          entityLabel={deletePrompt.type === "volume" ? "trigger volume" : "object"}
          onDeleteAll={() => handleDeleteConfirm(false)}
          onKeepScripts={() => handleDeleteConfirm(true)}
          onCancel={() => setDeletePrompt(null)}
        />
      )}
      <DialogueOverlay
        dialogue={dialogueState}
        bus={busRef.current}
        onClose={() => {
          dialogueOpenRef.current = false;
          setDialogueState(null);
          busRef.current.emit("dialogue:closed", {});
        }}
      />
      <FadeOverlay
        fade={fadeState}
        onComplete={() => setFadeState(null)}
      />
      <FlashOverlay
        flash={flashState}
        onComplete={() => setFlashState(null)}
      />
    </div>
  );
}
