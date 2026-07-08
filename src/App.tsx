import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EventBus } from "@/core/EventBus";
import { SceneManager } from "@/core/SceneManager";
import { PreviewController } from "@/preview/PreviewController";
import { ObjectPlacer } from "@/preview/ObjectPlacer";
import { assetManager } from "@/core/AssetManager";
import { InputManager } from "@/core/InputManager";
import { WorldState } from "@/world/WorldState";
import { ZoneManager } from "@/world/ZoneManager";
import { SelectionManager } from "@/editor/SelectionManager";
import { isSelectMode } from "@/editor/selectMode";
import { FloorTool } from "@/editor/FloorTool";
import { PolygonFloorTool } from "@/editor/PolygonFloorTool";
import { WallTool } from "@/editor/WallTool";
import { PlatformTool } from "@/editor/PlatformTool";
import { PolygonPlatformTool } from "@/editor/PolygonPlatformTool";
import { StairTool } from "@/editor/StairTool";
import { ShapeTool } from "@/editor/ShapeTool";
import { ShapeResizer } from "@/editor/ShapeResizer";
import { BrushVertexEditor } from "@/editor/BrushVertexEditor";
import { BrushFaceHighlighter } from "@/editor/BrushFaceHighlighter";
import { BrushFaceEditor } from "@/editor/BrushFaceEditor";
import { BrushEdgeEditor } from "@/editor/BrushEdgeEditor";
import { ObjectTool } from "@/editor/ObjectTool";
import { NodeDragger } from "@/editor/NodeDragger";
import { OpeningDragHandler } from "@/editor/OpeningDragHandler";
import { GizmoManager } from "@/editor/GizmoManager";
import { ZoneTool } from "@/editor/ZoneTool";
import { SpawnPointTool } from "@/editor/SpawnPointTool";
import { CheckpointTool } from "@/editor/CheckpointTool";
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
import { installTestHelpers } from "@/dev/testHelpers";
import { physicsWorld } from "@/physics/PhysicsWorld";
import { Toolbar } from "@/ui/Toolbar";
import { TopBar } from "@/ui/TopBar";
import { PreviewHUD } from "@/ui/PreviewHUD";
import { TouchControlsOverlay } from "@/ui/TouchControlsOverlay";
import { PauseMenu } from "@/ui/PauseMenu";
import { DEFAULT_BINDINGS, loadBindings, saveBindings, resetBindings } from "@/input/bindings";
import { PropertiesPanel } from "@/ui/PropertiesPanel";
import { CoordinateDisplay } from "@/ui/CoordinateDisplay";
import { FpsCounter } from "@/ui/FpsCounter";
import { LeftPanel } from "@/ui/LeftPanel";
import { ModelImporterModal } from "@/ui/ModelImporterModal";
import { MaterialImporterModal } from "@/ui/MaterialImporterModal";
import { ScriptDetachDialog } from "@/ui/ScriptDetachDialog";
import { DeleteAssetDialog } from "@/ui/DeleteAssetDialog";
import { EditMetadataDialog, type EditPatch } from "@/ui/EditMetadataDialog";
import { ThumbnailStagerModal } from "@/ui/ThumbnailStagerModal";
import { dataURLtoArrayBuffer, renderModelThumbnail } from "@/editor/thumbnailRenderer";
import { bakeShapes, disposeBakeGroup } from "@/editor/bakeShapes";
import { writeAssetToLibrary } from "@/core/assetLibraryWriter";
import { BakeDialog } from "@/ui/BakeDialog";
import { MAT_CAT_ORDER } from "@/ui/materialCategories";
import type { ToolId, Vec2, Vec3, SelectedObjectPayload, SelectedRef, WorldObject, ZoneDef, FloorDef, WallDef, Opening, MaterialDef, QualityScale, PlatformDef, StairDef, ShapeDef, SceneFile, AssetDef, LeftPanelId, PlayerSettings, ScriptDef, TriggerVolume, CheckpointDef, GroupDef, Attribution, JsonValue, StateSchema, NodeLinks, DecalTexDef, DecalKind, DecalDef } from "@/types";

const ASSET_CATEGORIES = ["Furniture", "Props", "Structures", "Lights", "Characters", "Vegetation", "Other"];

type PendingEdit = {
  ids:     string[];
  items:   { id: string; label: string }[];
  initial: { label: string; category: string; attribution: Attribution };
};
import { HistoryManager } from "@/editor/HistoryManager";
import { copySelection, copySelectionMulti, pasteClipboard, type Clipboard } from "@/editor/copyPaste";
import { membersByGroup, entityGroupIds, writeGroupIds, type GroupMember } from "@/editor/groupMembers";
import { migrateWallNodes, pruneOrphanNodes, migrateUVs } from "@/world/WorldLoader";
import { resolveRunNodeIds } from "@/utils/wallRuns";
import { idbGet, idbSet } from "@/lib/fileHandleStore";

const DEMO_ZONE_ID = "demo";

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
  const [multiSelected,    setMultiSelected]    = useState<SelectedRef[]>([]);
  const [materialList,     setMaterialList]     = useState<MaterialDef[]>([]);
  const [quality,          setQuality]          = useState<QualityScale>(
    () => (localStorage.getItem('editorQuality') as QualityScale) ?? 'high',
  );
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
  const [modelsDir,       setModelsDir]        = useState<FileSystemDirectoryHandle | null>(null);
  const [texturesDir,     setTexturesDir]      = useState<FileSystemDirectoryHandle | null>(null);
  // Shapes queued for bake-to-GLB (Phase 26) — non-null renders the BakeDialog.
  const [bakeRefs,        setBakeRefs]         = useState<SelectedRef[] | null>(null);
  const [materialImporterOpen, setMaterialImporterOpen] = useState(false);
  const [pendingMaterialDelete, setPendingMaterialDelete] = useState<
    { ids: string[]; labels: string[]; usage: { count: number; zones: string[] } } | null
  >(null);
  const [pendingAssetEdit,    setPendingAssetEdit]    = useState<PendingEdit | null>(null);
  const [stagingAsset,        setStagingAsset]        = useState<AssetDef | null>(null);
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
  const [isGame,          setIsGame]           = useState(false);
  const [, setPlayerSettingsRev]               = useState(0);
  const [dialogueState,   setDialogueState]    = useState<{ speaker: string; lines: string[]; portrait?: string } | null>(null);
  const [fadeState,       setFadeState]        = useState<FadeRequest | null>(null);
  const [zoneScripts,     setZoneScripts]      = useState<ScriptDef[]>([]);
  const [stateSchema,     setStateSchema]      = useState<Record<string, StateSchema>>({});
  const [triggerVolumes,  setTriggerVolumes]   = useState<TriggerVolume[]>([]);
  const [checkpoints,     setCheckpoints]      = useState<CheckpointDef[]>([]);
  const [deletePrompt,    setDeletePrompt]     = useState<{ type: "volume" | "object"; id: string; zoneId: string; scripts: ScriptDef[] } | null>(null);
  const fileHandleRef  = useRef<FileSystemFileHandle | null>(null);
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
    const world     = new WorldState(bus);
    worldRef.current = world;
    const objectPlacer = new ObjectPlacer(bus);
    objectPlacerRef.current = objectPlacer;
    const zones     = new ZoneManager(scene.scene, world, bus, objectPlacer);
    zonesRef.current = zones;
    const history   = new HistoryManager(world, syncHistory);
    historyRef.current = history;
    world.setHistory(history);
    bus.on("world:loaded",  () => { history.clear(); syncHistory(); });
    bus.on("scene:loaded",  () => { history.clear(); syncHistory(); });

    const preview = new PreviewController(bus, world, scene, zones);
    previewRef.current = preview;
    const input     = new InputManager(canvas, scene.camera, bus, scene.scene);
    const selection = new SelectionManager(scene.scene, scene.camera, canvas, world, bus);
    const floorTool    = new FloorTool(scene.scene, world, bus, history);
    const polyFloorTool = new PolygonFloorTool(scene.scene, world, bus, history);
    const wallTool     = new WallTool(scene.scene, world, bus, history);
    const platformTool       = new PlatformTool(scene.scene, world, bus, history);
    const polyPlatformTool   = new PolygonPlatformTool(scene.scene, world, bus, history);
    const stairTool          = new StairTool(scene.scene, world, bus, history);
    const shapeTool          = new ShapeTool(scene.scene, world, bus, history);
    const shapeResizer       = new ShapeResizer(scene.scene, world, bus, scene.camera, canvas);
    const brushVertexEditor  = new BrushVertexEditor(scene.scene, world, bus, scene.camera, canvas);
    const brushFaceHighlighter = new BrushFaceHighlighter(scene.scene, world, bus);
    const brushFaceEditor    = new BrushFaceEditor(scene.scene, world, bus, scene.camera, canvas);
    const brushEdgeEditor    = new BrushEdgeEditor(scene.scene, world, bus, scene.camera, canvas);
    const objectTool         = new ObjectTool(scene.scene, world, bus, history, assetManager);
    const nodeDragger    = new NodeDragger(scene.scene, world, bus, scene.camera);
    const openingDragger = new OpeningDragHandler(scene.scene, scene.camera, canvas, world, bus, history);
    const gizmoManager   = new GizmoManager(scene.scene, scene.camera, canvas, world, bus);
    const zoneTool        = new ZoneTool(scene.scene, bus);
    const spawnPointTool  = new SpawnPointTool(scene.scene, world, bus);
    const checkpointTool  = new CheckpointTool(scene.scene, world, bus);
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

    // Seed world with the demo zone and make it the active zone immediately
    world.addZone(createDemoZone());
    world.setActiveZone(DEMO_ZONE_ID);
    setZones([...world.zones.values()]);

    if (import.meta.env.DEV) {
      const g = window as unknown as Record<string, unknown>;
      g.__scene = scene.scene; g.__camera = scene.camera;
      g.__renderer = scene.renderer; g.__world = world; g.__zones = zones;
      g.__editorCamera = scene.editorCamera;
      g.__bus = bus; g.__scriptEngine = scriptEngine; g.__preview = preview;
      g.__objectPlacer = objectPlacer; g.__history = history;
      g.__gameState = gameState;
      g.__copyPaste = { copySelection, pasteClipboard };
      g.__bindings = { load: loadBindings, save: saveBindings, reset: resetBindings, defaults: DEFAULT_BINDINGS };
      installTestHelpers({ bus, world, scriptEngine, preview, gameState });
    }


    input.init();
    selection.init();
    zones.init();
    floorTool.init();
    polyFloorTool.init();
    wallTool.init();
    platformTool.init();
    polyPlatformTool.init();
    stairTool.init();
    shapeTool.init();
    shapeResizer.init();
    brushVertexEditor.init();
    brushFaceHighlighter.init();
    brushFaceEditor.init();
    brushEdgeEditor.init();
    objectTool.init();
    nodeDragger.init();
    openingDragger.init();
    gizmoManager.init();
    zoneTool.init();
    spawnPointTool.init();
    checkpointTool.init();
    triggerVolumeTool.init();
    decalTool.init();
    triggerVolumeResizer.init();
    stairCutterResizer.init();
    colliderEditor.init();
    wallSplitter.init();
    segmentHighlighter.init();

    const writeAutosave = () => {
      if (!worldRef.current || restoringRef.current) return;
      const json = JSON.stringify(worldRef.current.toJSON());
      // Only write when THIS tab changed the world since load (content-compared, so
      // console/test-driven mutations count too). A tab that never edited must never
      // write: a dormant tab's 60s tick / closing beforeunload would otherwise clobber
      // newer autosaves from other tabs with its stale state (lost real edits twice).
      if (json === autosaveBaselineRef.current) return;
      const ts = Date.now();
      localStorage.setItem('worldeditor_autosave', json);
      localStorage.setItem('worldeditor_autosave_ts', ts.toString());
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
      await Promise.all([physicsWorld.init(), materialsReady]);
      if (!active) return; // StrictMode first mount: cleanup already fired, bail out

      const savedJson = localStorage.getItem('worldeditor_autosave');
      const savedTs   = localStorage.getItem('worldeditor_autosave_ts');
      let restored = false;

      if (savedJson && savedTs) {
        const ageMs = Date.now() - parseInt(savedTs, 10);
        if (ageMs < 24 * 60 * 60_000) {
          try {
            restoringRef.current = true;
            await handleLoadFromJSON(JSON.parse(savedJson));
            restored = true;
          } catch { /* corrupt autosave — fall through to demo zone */ } finally {
            restoringRef.current = false;
          }
        } else {
          localStorage.removeItem('worldeditor_autosave');
          localStorage.removeItem('worldeditor_autosave_ts');
        }
      }

      if (!restored) await zones.loadZone(DEMO_ZONE_ID);

      // Baseline for the autosave no-change gate: the world as this tab loaded it.
      // (Not the raw savedJson string — restore may normalize fields.)
      autosaveBaselineRef.current = JSON.stringify(world.toJSON());

      // After loading, try to recover the last file handle so Ctrl+S saves in-place
      try {
        const storedHandle = await idbGet<FileSystemFileHandle>('lastFileHandle');
        if (storedHandle && fileHandleRef.current === null) {
          const perm = await (storedHandle as FileSystemFileHandle & { queryPermission(d: { mode: string }): Promise<PermissionState> }).queryPermission({ mode: 'readwrite' });
          if (perm === 'granted') fileHandleRef.current = storedHandle;
        }
      } catch { /* IDB or FSA not available */ }
    })();

    // Physics step after Three.js render
    scene.onUpdate(dt => physicsWorld.step(dt));
    // Advance object animation mixers every frame (editor + preview)
    scene.onUpdate(dt => objectPlacer.update(dt));
    // Advance animated trigger-volume fills (no-op when none are animated)
    scene.onUpdate(dt => zones.updateVolumeVisuals(dt));

    const bumpMembership = () => setMembershipRev(v => v + 1);

    const unsub = [
      bus.on("preview:start", ({ mode, resume }) => {
        setIsPreview(true);
        setIsGame(mode === "game");
        // Re-index from current world state — zone:activated fires at startup before
        // any volumes/scripts exist in the editor, so the index is always stale by preview time.
        const activeZone = world.activeZoneId ? world.zones.get(world.activeZoneId) : null;
        scriptEngine.clearIndex();
        scriptEngine.loadWorld(world.world ?? {} as Parameters<typeof scriptEngine.loadWorld>[0]);
        if (activeZone) scriptEngine.loadZone(activeZone);
        scriptEngine.activate();
        // Apply this level's authored state schema (defaults + clamps) before reset/restore.
        gameState.configureSchema(world.world?.stateSchema ?? DEFAULT_STATE_SCHEMA);
        // Continue only when the launch explicitly asked to resume (Continue). New Game
        // and Preview always start fresh — no silent auto-continue. loadGame must run after
        // activate() (which clears fired one-shots) so a resumed save's progress survives.
        if (resume && loadGame()) { /* resumed */ } else { gameState.reset(); }
        gameAutosaveTimer = setInterval(saveGame, 30_000);
      }),
      bus.on("preview:stop",  () => {
        setIsPreview(false);
        setIsGame(false);
        pauseOpenRef.current = false;
        setPauseOpen(false);
        if (gameAutosaveTimer) { clearInterval(gameAutosaveTimer); gameAutosaveTimer = null; }
        saveGame();
        scriptEngine.deactivate();
      }),
      bus.on("input:scheme-changed", ({ scheme }) => setPreviewScheme(scheme)),
      // Gamepad Start / kbm Enter / touch ⚙ → close the dialogue if one is
      // open, else toggle the pause menu. (Esc still exits preview directly.)
      bus.on("action:cancel", () => {
        if (dialogueOpenRef.current) {
          dialogueOpenRef.current = false;
          setDialogueState(null);
          bus.emit("dialogue:closed", {});
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
      bus.on("overlay:fade-in", payload => setFadeState(payload)),
      bus.on("leftpanel:open", ({ panelId }) => setLeftPanel(panelId)),
      bus.on("input:mousemove",   ({ worldPos }) => setCoords(worldPos)),
      bus.on("object:selected", payload => {
        setSelected(payload);
        if (payload.type === "trigger-volume") setLeftPanel("scripts");
      }),
      bus.on("object:deselected", ()            => setSelected(null)),
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
      bus.on("selection:changed", ({ refs }) => setMultiSelected(refs)),
      bus.on("floortool:suggest-auto-floor", payload => setAutoFloorPrompt(payload)),
      bus.on("tool:placed", ({ type }) => {
        if (type !== "object") {
          setActiveTool("select");
          bus.emit("tool:select", { tool: "select" });
        }
        syncHistory();
      }),
      bus.on("assets:loaded",   ({ assets: defs }) => setAssets(defs)),
      bus.on("zone:added",      ()               => setZones([...world.zones.values()])),
      bus.on("zone:activated",  ({ zoneId })     => {
        setActiveZoneId(zoneId);
        const z = world.zones.get(zoneId);
        setZoneScripts(z?.scripts ?? []);
        setTriggerVolumes(z?.triggerVolumes ?? []);
        setCheckpoints(z?.checkpoints ?? []);
        scriptEngine.clearIndex();
        scriptEngine.loadWorld(world.world ?? {} as Parameters<typeof scriptEngine.loadWorld>[0]);
        if (z) scriptEngine.loadZone(z);
      }),
      bus.on("world:loaded",    ()               => {
        setZones([...world.zones.values()]);
        setActiveZoneId(world.activeZoneId);
        setGroups([...world.groups]);
        setStateSchema(world.world?.stateSchema ?? {});
        const z = world.activeZoneId ? world.zones.get(world.activeZoneId) : null;
        setZoneScripts(z?.scripts ?? []);
        setTriggerVolumes(z?.triggerVolumes ?? []);
        setCheckpoints(z?.checkpoints ?? []);
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
      bus.on("triggervolume:removed", () => {
        const z = world.zones.get(world.activeZoneId ?? "");
        setTriggerVolumes(z?.triggerVolumes ?? []);
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
    ];

    return () => {
      active = false; // tell in-flight IIFE this mount is stale
      clearInterval(autosaveTimer);
      if (gameAutosaveTimer) clearInterval(gameAutosaveTimer);
      window.removeEventListener('beforeunload', writeAutosave);
      previewRef.current?.exit();
      previewRef.current  = null;
      sceneRef.current    = null;
      worldRef.current    = null;
      zonesRef.current    = null;
      unsub.forEach(u => u());
      checkpointTool.dispose();
      spawnPointTool.dispose();
      segmentHighlighter.dispose();
      wallSplitter.dispose();
      colliderEditor.dispose();
      stairCutterResizer.dispose();
      triggerVolumeResizer.dispose();
      triggerVolumeTool.dispose();
      decalTool.dispose();
      scriptEngineRef.current = null;
      zoneTool.dispose();
      gizmoManager.dispose();
      openingDragger.dispose();
      nodeDragger.dispose();
      objectTool.dispose();
      brushEdgeEditor.dispose();
      brushFaceEditor.dispose();
      brushFaceHighlighter.dispose();
      brushVertexEditor.dispose();
      shapeResizer.dispose();
      shapeTool.dispose();
      stairTool.dispose();
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
    if (tool === "zone") {
      // Z key = toggle groups panel
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

  const handleLoadFromJSON = useCallback(async (json: unknown): Promise<void> => {
    const world = worldRef.current;
    const zones = zonesRef.current;
    if (!world || !zones) return;
    try {
      const file = json as SceneFile;
      migrateWallNodes(file.zones);
      migrateUVs(file);  // Phase 10.8: reset legacy tileScale to 1.0 (pre-world-space-UV scenes)
      for (const zone of file.zones) pruneOrphanNodes(zone);  // reap orphaned polygon nodes from old saves
      await physicsWorld.init();
      for (const zoneId of [...world.zones.keys()]) zones.unloadZone(zoneId);
      world.loadFromJSON(file);
      setSelected(null);
      setActiveFloor(0);
      fileHandleRef.current = null; // loaded file replaces any existing handle association
      setIsDirty(false);
      const activeId = world.activeZoneId;
      if (activeId) await zones.loadZone(activeId);
    } catch (e) {
      console.error('Failed to load scene:', e);
    }
  }, []);

  // Kept for TopBar's <input type="file"> fallback path
  const handleLoad = useCallback((json: unknown): void => {
    void handleLoadFromJSON(json);
  }, [handleLoadFromJSON]);

  const handleLoadFSA = useCallback(async (): Promise<void> => {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'World JSON', accept: { 'application/json': ['.json'] } }],
      });
      fileHandleRef.current = handle;
      const file = await handle.getFile();
      const text = await file.text();
      await handleLoadFromJSON(JSON.parse(text));
    } catch (e: unknown) {
      if ((e as DOMException).name !== 'AbortError') console.error('Load failed:', e);
    }
  }, [handleLoadFromJSON]);

  const handleSave = useCallback(async (): Promise<void> => {
    const world = worldRef.current;
    if (!world) return;
    const json = JSON.stringify(world.toJSON(), null, 2);
    const name = world.toJSON().metadata?.name ?? 'world';

    try {
      if (!fileHandleRef.current && 'showSaveFilePicker' in window) {
        fileHandleRef.current = await window.showSaveFilePicker({
          suggestedName: `${name}.json`,
          types: [{ description: 'World JSON', accept: { 'application/json': ['.json'] } }],
        });
      }

      if (fileHandleRef.current) {
        const writable = await fileHandleRef.current.createWritable();
        await writable.write(json);
        await writable.close();
      } else {
        // FSA not available — blob download fallback
        const blob = new Blob([json], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        Object.assign(document.createElement('a'), { href: url, download: `${name}.json` }).click();
        URL.revokeObjectURL(url);
      }
    } catch (e: unknown) {
      if ((e as DOMException).name !== 'AbortError') console.error('Save failed:', e);
      return; // user cancelled picker — don't update state
    }

    if (fileHandleRef.current) void idbSet('lastFileHandle', fileHandleRef.current);

    const ts = Date.now();
    localStorage.setItem('worldeditor_autosave', json);
    localStorage.setItem('worldeditor_autosave_ts', ts.toString());
    setLastAutosaveAt(ts);
    setIsDirty(false);
  }, []);

  const handleNew = useCallback((): void => {
    localStorage.removeItem('worldeditor_autosave');
    localStorage.removeItem('worldeditor_autosave_ts');
    const freshScene: SceneFile = {
      metadata: { name: "New World", version: "1.0", author: "", created: new Date().toISOString(), lastModified: new Date().toISOString() },
      world: {
        size: { width: 200, depth: 200 },
        ambientLight: { color: "#aabbcc", intensity: 1.2 },
        sunLight: { color: "#fff4e0", intensity: 3.0, position: { x: 30, y: 50, z: 20 } },
        skybox: "sky", fogColor: "#1a1f2e", fogDensity: 0.012,
        playerSettings: { cameraMode: "fps", moveSpeed: 6, jumpHeight: 1.2, fov: 75, thirdPersonDistance: 4, thirdPersonHeight: 2 },
        stateSchema: DEFAULT_STATE_SCHEMA,
      },
      terrain: null,
      zones: [createDemoZone()],
      transitions: [],
    };
    void handleLoadFromJSON(freshScene);
  }, [handleLoadFromJSON]);


  const handlePreviewEnter = useCallback((): void => {
    previewRef.current?.enter("preview");
  }, []);

  const handleNewGame = useCallback((): void => {
    previewRef.current?.enter("game", { resume: false });
    scriptEngineRef.current?.onGameStart();
  }, []);

  const handleContinue = useCallback((): void => {
    previewRef.current?.enter("game", { resume: true });
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
    historyRef.current?.undo();
    setActiveTool("select");
    busRef.current.emit("tool:select", { tool: "select" });
    syncHistory();
  }, [syncHistory]);

  const handleRedo = useCallback((): void => {
    historyRef.current?.redo();
    setActiveTool("select");
    busRef.current.emit("tool:select", { tool: "select" });
    syncHistory();
  }, [syncHistory]);

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
          case "object":         world.removeObject(ref.zoneId, ref.id); break;
          case "trigger-volume": world.removeTriggerVolume(ref.zoneId, ref.id); break;
          case "decal":          world.removeDecal(ref.zoneId, ref.id); break;
          case "shape":          world.removeShape(ref.zoneId, ref.id); break;
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
  }, [handleSave, handleUndo, handleRedo, handleCopy, handlePaste, handleDuplicate, activeTool]);

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
        const newNode = { id: crypto.randomUUID(), x: oldNode.x, z: oldNode.z };
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
  };

  const isWallRunClosed = (): boolean => {
    if (!selected || selected.type !== "wall") return false;
    const walls = selected.runWalls ?? (selected.data ? [selected.data as WallDef] : []);
    if (walls.length < 3) return false;
    const nodeIds = resolveRunNodeIds(walls);
    return nodeIds !== null && nodeIds.length > 1 && nodeIds[0] === nodeIds[nodeIds.length - 1];
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

  const handleAssetSelect = (id: string | null): void => {
    setSelectedAssetId(id);
    if (id) busRef.current.emit("asset:selected", { assetId: id });
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

    // Manifest write + file removal need a read/write directory handle.
    let dir = modelsDir;
    if (!dir) {
      try {
        dir = await (window as unknown as { showDirectoryPicker: (o: unknown) => Promise<FileSystemDirectoryHandle> })
          .showDirectoryPicker({ mode: "readwrite" });
        setModelsDir(dir);
      } catch { return; } // cancelled — abort without changing anything
    }

    try {
      const mh   = await dir.getFileHandle("manifest.json");
      const data = JSON.parse(await (await mh.getFile()).text()) as { version: string; assets: AssetDef[] };
      const removed = data.assets.filter(a => ids.includes(a.id));
      data.assets   = data.assets.filter(a => !ids.includes(a.id));
      const w = await mh.createWritable();
      await w.write(JSON.stringify(data, null, 2));
      await w.close();

      if (deleteFiles) {
        const base = (p?: string) => p?.split("/").pop();
        for (const a of removed) {
          for (const f of [base(a.path), base(a.thumbnail), base(a.mtlPath)]) {
            if (f) { try { await dir.removeEntry(f); } catch { /* missing — ignore */ } }
          }
        }
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
    if (!("showDirectoryPicker" in window)) {
      console.warn("Material importer requires Chrome or Edge.");
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
          ...zone.platforms.flatMap(p => [p.material, p.sideMaterial]),
          ...zone.stairs.flatMap(s => [s.material, s.riserMaterial]),
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

    let dir = texturesDir;
    if (!dir) {
      try {
        dir = await (window as unknown as { showDirectoryPicker: (o: unknown) => Promise<FileSystemDirectoryHandle> })
          .showDirectoryPicker({ mode: "readwrite" });
        setTexturesDir(dir);
      } catch { return; } // cancelled — abort without changing anything
    }

    try {
      const mh   = await dir.getFileHandle("manifest.json");
      const data = JSON.parse(await (await mh.getFile()).text()) as { version: string; materials: MaterialDef[] };
      data.materials = data.materials.filter(m => !ids.includes(m.id));
      const w = await mh.createWritable();
      await w.write(JSON.stringify(data, null, 2));
      await w.close();

      if (deleteFiles) {
        for (const id of ids) {
          try { await (dir as unknown as { removeEntry: (n: string, o?: unknown) => Promise<void> }).removeEntry(id, { recursive: true }); }
          catch { /* folder missing — ignore */ }
        }
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

  const ensureDir = async (
    cur: FileSystemDirectoryHandle | null,
    setCur: (d: FileSystemDirectoryHandle) => void,
  ): Promise<FileSystemDirectoryHandle | null> => {
    if (cur) return cur;
    try {
      const d = await (window as unknown as { showDirectoryPicker: (o: unknown) => Promise<FileSystemDirectoryHandle> })
        .showDirectoryPicker({ mode: "readwrite" });
      setCur(d);
      return d;
    } catch { return null; }
  };

  const handleConfirmAssetEdit = async (patch: EditPatch): Promise<void> => {
    const pending = pendingAssetEdit;
    setPendingAssetEdit(null);
    if (!pending) return;
    const dir = await ensureDir(modelsDir, setModelsDir);
    if (!dir) return;
    try {
      const mh   = await dir.getFileHandle("manifest.json");
      const data = JSON.parse(await (await mh.getFile()).text()) as { version: string; assets: AssetDef[] };
      data.assets = data.assets.map(a => pending.ids.includes(a.id) ? patchEntry(a, patch) : a);
      const w = await mh.createWritable();
      await w.write(JSON.stringify(data, null, 2));
      await w.close();
    } catch (err) { console.error("asset edit failed:", err); return; }
    pending.ids.forEach(id => assetManager.updateAsset(id, patch as Partial<AssetDef>));
    setAssets(assetManager.getAssetList());
    busRef.current.emit("assets:loaded", { assets: assetManager.getAssetList() });
  };

  // Write a re-staged thumbnail PNG next to the model + point the manifest at it.
  const handleSaveThumbnail = async (asset: AssetDef, dataUrl: string): Promise<void> => {
    setStagingAsset(null);
    const dir = await ensureDir(modelsDir, setModelsDir);
    if (!dir) return;
    const fileName =
      asset.thumbnail?.split("/").pop()?.split("?")[0] ||
      `${(asset.path.split("/").pop() ?? asset.id).replace(/\.[^.]+$/, "")}_thumb.png`;
    const cleanPath = `/assets/models/${fileName}`;
    try {
      const fh = await dir.getFileHandle(fileName, { create: true });
      const fw = await fh.createWritable();
      await fw.write(dataURLtoArrayBuffer(dataUrl));
      await fw.close();

      const mh   = await dir.getFileHandle("manifest.json");
      const data = JSON.parse(await (await mh.getFile()).text()) as { version: string; assets: AssetDef[] };
      data.assets = data.assets.map(a => a.id === asset.id ? { ...a, thumbnail: cleanPath } : a);
      const mw = await mh.createWritable();
      await mw.write(JSON.stringify(data, null, 2));
      await mw.close();
    } catch (err) { console.error("thumbnail save failed:", err); return; }
    // ?v= busts the <img> cache in-session; the manifest keeps the clean path.
    assetManager.updateAsset(asset.id, { thumbnail: `${cleanPath}?v=${Date.now()}` });
    setAssets(assetManager.getAssetList());
    busRef.current.emit("assets:loaded", { assets: assetManager.getAssetList() });
  };

  // ── Bake shapes → GLB (Phase 26) ──────────────────────────────────────────
  // The bake itself never mutates the world (sources stay editable); outputs are
  // independent so a cancelled save-picker doesn't kill the library write.
  const handleBakeConfirm = async (opts: { name: string; toLibrary: boolean; toFile: boolean }): Promise<void> => {
    const refs = bakeRefs;
    setBakeRefs(null);
    const world = worldRef.current;
    if (!refs || !world) return;
    try {
      const { glb, group, colliders } = await bakeShapes(world, refs);
      try {
        if (opts.toFile) {
          try {
            if ("showSaveFilePicker" in window) {
              const handle = await window.showSaveFilePicker({
                suggestedName: `${opts.name}.glb`,
                types: [{ description: "glTF Binary", accept: { "model/gltf-binary": [".glb"] } }],
              });
              const w = await handle.createWritable();
              await w.write(glb);
              await w.close();
            } else {
              const url = URL.createObjectURL(new Blob([glb], { type: "model/gltf-binary" }));
              Object.assign(document.createElement("a"), { href: url, download: `${opts.name}.glb` }).click();
              URL.revokeObjectURL(url);
            }
          } catch (e) {
            if ((e as DOMException).name !== "AbortError") throw e;   // picker cancel → skip file only
          }
        }
        if (opts.toLibrary) {
          const dir = await ensureDir(modelsDir, setModelsDir);
          if (dir) {
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
            await writeAssetToLibrary(dir, {
              glbName: `${opts.name}.glb`,
              glb,
              ...(thumbUrl ? { thumbName: `${opts.name}_thumb.png`, thumbPng: dataURLtoArrayBuffer(thumbUrl) } : {}),
            }, asset);
            handleAssetsReload();
          }
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
    const dir = await ensureDir(texturesDir, setTexturesDir);
    if (!dir) return;
    try {
      const mh   = await dir.getFileHandle("manifest.json");
      const data = JSON.parse(await (await mh.getFile()).text()) as { version: string; materials: MaterialDef[] };
      data.materials = data.materials.map(m => pending.ids.includes(m.id) ? patchEntry(m, patch) : m);
      const w = await mh.createWritable();
      await w.write(JSON.stringify(data, null, 2));
      await w.close();
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

  const handleStateSchemaChange = (schema: Record<string, StateSchema>): void => {
    const world = worldRef.current;
    if (!world?.world) return;
    world.transaction("edit state schema", () => { world.world!.stateSchema = schema; });
    setStateSchema(schema);
    syncHistory();
    setIsDirty(true);
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
        materials={materialList}
        onMaterialImport={openMaterialImporter}
        onDeleteMaterials={handleRequestMaterialDelete}
        onEditMaterials={handleRequestMaterialEdit}
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
        objectScripts={objectScripts}
        selectedObjectId={selectedObjectId}
        triggerVolumes={triggerVolumes}
        zoneObjects={zoneObjects}
        zonePlatforms={zonePlatforms}
        zoneStairs={zoneStairs}
        zoneWalls={zoneWalls}
        zoneFloors={zoneFloors}
        zoneCheckpoints={checkpoints}
        onZoneScriptsChange={handleZoneScriptsChange}
        onObjectScriptsChange={handleObjectScriptsChange}
        stateSchema={stateSchema}
        onStateSchemaChange={handleStateSchemaChange}
        decalTextures={decalTextures}
        selectedDecalId={selectedDecalId}
        onDecalSelect={handleDecalSelect}
      />
      <TopBar
        activeFloor={activeFloor}
        onFloorChange={handleFloorChange}
        onCameraTopDown={() => busRef.current.emit("camera:topdown", {})}
        onSave={handleSave}
        onLoad={handleLoad}
        onLoadFSA={handleLoadFSA}
        onNew={handleNew}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        isDirty={isDirty}
        lastAutosaveAt={lastAutosaveAt}
      />
      <PropertiesPanel
        activeTool={activeTool}
        selected={selected}
        materialList={materialList}
        quality={quality}
        onObjectUpdate={handleObjectUpdate}
        onSegmentUpdate={handleSegmentUpdate}
        onFloorNodesUpdate={handleFloorNodesUpdate}
        getNodeLinks={getNodeLinks}
        onImportMaterial={openMaterialImporter}
        onQualityChange={handleQualityChange}
        onCopyRunToFloor={handleCopyRunToFloor}
        onFillRunWithFloor={isWallRunClosed() ? handleFillRunWithFloor : undefined}
        onDelete={selected || multiSelected.length > 1 ? handleDelete : undefined}
        multiSelected={multiSelected}
        onCopy={handleCopy}
        onDuplicate={handleDuplicate}
        onBake={refs => setBakeRefs(refs)}
        decalTextures={decalTextures}
        onVolumeScriptsChange={selectedObjectId ? (scripts) => handleObjectScriptsChange(selectedObjectId, scripts) : undefined}
        zones={zones}
        groups={groups}
        activeZoneId={activeZoneId}
        playerSettings={worldRef.current?.world?.playerSettings}
        assets={assets}
        onPlayerSettingsChange={handlePlayerSettingsChange}
        onSpawnPositionChange={handleSpawnPositionChange}
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
        />
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

      {isPreview && <FpsCounter getInfo={getRenderInfo} />}

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
          modelsDir={modelsDir}
          onModelsDirSet={dir => setModelsDir(dir)}
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
          needsFolderGrant={!modelsDir}
          onCancel={() => setPendingAssetDelete(null)}
          onConfirm={deleteFiles => void handleConfirmAssetDelete(deleteFiles)}
        />
      )}

      {materialImporterOpen && (
        <MaterialImporterModal
          texturesDir={texturesDir}
          onTextureDirSet={setTexturesDir}
          onComplete={() => { setMaterialImporterOpen(false); handleMaterialsReload(); }}
          onClose={() => setMaterialImporterOpen(false)}
        />
      )}

      {pendingMaterialDelete && (
        <DeleteAssetDialog
          labels={pendingMaterialDelete.labels}
          usage={pendingMaterialDelete.usage}
          needsFolderGrant={!texturesDir}
          noun="material"
          usageNoun="surface"
          usageEffect="Those surfaces will fall back to the default look until reassigned."
          folderHint="public/assets/textures"
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
          needsFolderGrant={!modelsDir}
          folderHint="public/assets/models"
          onCancel={() => setPendingAssetEdit(null)}
          onSave={patch => void handleConfirmAssetEdit(patch)}
        />
      )}

      {stagingAsset && (
        <ThumbnailStagerModal
          asset={stagingAsset}
          needsFolderGrant={!modelsDir}
          onCancel={() => setStagingAsset(null)}
          onSave={dataUrl => void handleSaveThumbnail(stagingAsset, dataUrl)}
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
          needsFolderGrant={!texturesDir}
          folderHint="public/assets/textures"
          onCancel={() => setPendingMaterialEdit(null)}
          onSave={patch => void handleConfirmMaterialEdit(patch)}
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
    </div>
  );
}
