import { useCallback, useEffect, useRef, useState } from "react";

import { EventBus } from "@/core/EventBus";
import { SceneManager } from "@/core/SceneManager";
import { PreviewController } from "@/preview/PreviewController";
import { ObjectPlacer } from "@/preview/ObjectPlacer";
import { assetManager } from "@/core/AssetManager";
import { InputManager } from "@/core/InputManager";
import { WorldState } from "@/world/WorldState";
import { ZoneManager } from "@/world/ZoneManager";
import { SelectionManager } from "@/editor/SelectionManager";
import { FloorTool } from "@/editor/FloorTool";
import { PolygonFloorTool } from "@/editor/PolygonFloorTool";
import { WallTool } from "@/editor/WallTool";
import { PlatformTool } from "@/editor/PlatformTool";
import { PolygonPlatformTool } from "@/editor/PolygonPlatformTool";
import { StairTool } from "@/editor/StairTool";
import { ObjectTool } from "@/editor/ObjectTool";
import { NodeDragger } from "@/editor/NodeDragger";
import { OpeningDragHandler } from "@/editor/OpeningDragHandler";
import { GizmoManager } from "@/editor/GizmoManager";
import { ZoneTool } from "@/editor/ZoneTool";
import { SpawnPointTool } from "@/editor/SpawnPointTool";
import { TriggerVolumeTool } from "@/editor/TriggerVolumeTool";
import { ScriptEngine } from "@/scripting/ScriptEngine";
import { DialogueOverlay } from "@/ui/DialogueOverlay";
import { FadeOverlay, type FadeRequest } from "@/preview/FadeOverlay";
import { installTestHelpers } from "@/dev/testHelpers";
import { physicsWorld } from "@/physics/PhysicsWorld";
import { Toolbar } from "@/ui/Toolbar";
import { TopBar } from "@/ui/TopBar";
import { PreviewHUD } from "@/ui/PreviewHUD";
import { PropertiesPanel } from "@/ui/PropertiesPanel";
import { CoordinateDisplay } from "@/ui/CoordinateDisplay";
import { LeftPanel } from "@/ui/LeftPanel";
import { ModelImporterModal } from "@/ui/ModelImporterModal";
import { MaterialImporterModal } from "@/ui/MaterialImporterModal";
import { ScriptDetachDialog } from "@/ui/ScriptDetachDialog";
import { DeleteAssetDialog } from "@/ui/DeleteAssetDialog";
import { EditMetadataDialog, type EditPatch } from "@/ui/EditMetadataDialog";
import { MAT_CAT_ORDER } from "@/ui/materialCategories";
import type { ToolId, Vec2, Vec3, SelectedObjectPayload, WorldObject, ZoneDef, FloorDef, WallDef, Opening, MaterialDef, QualityScale, PlatformDef, StairDef, SceneFile, AssetDef, LeftPanelId, PlayerSettings, ScriptDef, TriggerVolume, GroupDef, Attribution } from "@/types";

const ASSET_CATEGORIES = ["Furniture", "Props", "Structures", "Lights", "Characters", "Vegetation", "Other"];

type PendingEdit = {
  ids:     string[];
  items:   { id: string; label: string }[];
  initial: { label: string; category: string; attribution: Attribution };
};
import { HistoryManager } from "@/editor/HistoryManager";
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
  const [activeFloor,      setActiveFloor]      = useState<number>(0);
  const [coords,           setCoords]           = useState<Vec3>({ x: 0, y: 0, z: 0 });
  const [selected,         setSelected]         = useState<SelectedObjectPayload | null>(null);
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
  const [showImporter,    setShowImporter]     = useState(false);
  const [pendingAssetDelete, setPendingAssetDelete] = useState<
    { ids: string[]; labels: string[]; usage: { count: number; zones: string[] } } | null
  >(null);
  const [modelsDir,       setModelsDir]        = useState<FileSystemDirectoryHandle | null>(null);
  const [texturesDir,     setTexturesDir]      = useState<FileSystemDirectoryHandle | null>(null);
  const [materialImporterOpen, setMaterialImporterOpen] = useState(false);
  const [pendingMaterialDelete, setPendingMaterialDelete] = useState<
    { ids: string[]; labels: string[]; usage: { count: number; zones: string[] } } | null
  >(null);
  const [pendingAssetEdit,    setPendingAssetEdit]    = useState<PendingEdit | null>(null);
  const [pendingMaterialEdit, setPendingMaterialEdit] = useState<PendingEdit | null>(null);
  const [zones,           setZones]            = useState<ZoneDef[]>([]);
  const [activeZoneId,    setActiveZoneId]     = useState<string | null>(DEMO_ZONE_ID);
  const [groups,          setGroups]           = useState<GroupDef[]>([]);
  const [hiddenGroups,    setHiddenGroups]      = useState<Set<string>>(new Set());
  const [isDirty,         setIsDirty]          = useState(false);
  const [lastAutosaveAt,  setLastAutosaveAt]   = useState<number | null>(null);
  const [isPreview,       setIsPreview]        = useState(false);
  const [dialogueState,   setDialogueState]    = useState<{ speaker: string; lines: string[]; portrait?: string } | null>(null);
  const [fadeState,       setFadeState]        = useState<FadeRequest | null>(null);
  const [zoneScripts,     setZoneScripts]      = useState<ScriptDef[]>([]);
  const [triggerVolumes,  setTriggerVolumes]   = useState<TriggerVolume[]>([]);
  const [deletePrompt,    setDeletePrompt]     = useState<{ type: "volume" | "object"; id: string; zoneId: string; scripts: ScriptDef[] } | null>(null);
  const fileHandleRef  = useRef<FileSystemFileHandle | null>(null);
  const restoringRef   = useRef(false);

  const syncHistory = useCallback((): void => {
    const hu = historyRef.current?.canUndo ?? false;
    const hr = historyRef.current?.canRedo ?? false;
    setCanUndo(hu);
    setCanRedo(hr);
    if (hu) setIsDirty(true);
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
    const world     = new WorldState(bus);
    worldRef.current = world;
    const objectPlacer = new ObjectPlacer(bus);
    objectPlacerRef.current = objectPlacer;
    const zones     = new ZoneManager(scene.scene, world, bus, objectPlacer);
    zonesRef.current = zones;
    const history   = new HistoryManager(world, bus);
    historyRef.current = history;
    bus.on("world:loaded",  () => { history.clear(); syncHistory(); });
    bus.on("scene:loaded",  () => { history.clear(); syncHistory(); });

    const preview = new PreviewController(bus, world, scene, zones);
    previewRef.current = preview;
    const input     = new InputManager(canvas, scene.camera, bus);
    const selection = new SelectionManager(scene.scene, scene.camera, canvas, world, bus);
    const floorTool    = new FloorTool(scene.scene, world, bus, history);
    const polyFloorTool = new PolygonFloorTool(scene.scene, world, bus, history);
    const wallTool     = new WallTool(scene.scene, world, bus, history);
    const platformTool       = new PlatformTool(scene.scene, world, bus, history);
    const polyPlatformTool   = new PolygonPlatformTool(scene.scene, world, bus, history);
    const stairTool          = new StairTool(scene.scene, world, bus, history);
    const objectTool         = new ObjectTool(scene.scene, world, bus, history, assetManager);
    const nodeDragger    = new NodeDragger(scene.scene, world, bus, scene.camera);
    const openingDragger = new OpeningDragHandler(scene.scene, scene.camera, canvas, world, bus, history);
    const gizmoManager   = new GizmoManager(scene.scene, scene.camera, canvas, world, bus);
    const zoneTool        = new ZoneTool(scene.scene, bus);
    const spawnPointTool  = new SpawnPointTool(scene.scene, world, bus);
    const triggerVolumeTool = new TriggerVolumeTool(scene.scene, world, bus, history, scene.camera, canvas);
    const scriptEngine    = new ScriptEngine(bus, world);
    scriptEngineRef.current = scriptEngine;

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
      installTestHelpers({ bus, world, scriptEngine, preview });
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
    objectTool.init();
    nodeDragger.init();
    openingDragger.init();
    gizmoManager.init();
    zoneTool.init();
    spawnPointTool.init();
    triggerVolumeTool.init();

    const writeAutosave = () => {
      if (!worldRef.current || restoringRef.current) return;
      const json = JSON.stringify(worldRef.current.toJSON());
      const ts = Date.now();
      localStorage.setItem('worldeditor_autosave', json);
      localStorage.setItem('worldeditor_autosave_ts', ts.toString());
      setLastAutosaveAt(ts);
    };

    // Autosave to localStorage every 60 seconds and on page unload
    const autosaveTimer = setInterval(writeAutosave, 60_000);
    window.addEventListener('beforeunload', writeAutosave);

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

    const unsub = [
      bus.on("preview:start", () => {
        setIsPreview(true);
        // Re-index from current world state — zone:activated fires at startup before
        // any volumes/scripts exist in the editor, so the index is always stale by preview time.
        const activeZone = world.activeZoneId ? world.zones.get(world.activeZoneId) : null;
        scriptEngine.clearIndex();
        scriptEngine.loadWorld(world.world ?? {} as Parameters<typeof scriptEngine.loadWorld>[0]);
        if (activeZone) scriptEngine.loadZone(activeZone);
        scriptEngine.activate();
      }),
      bus.on("preview:stop",  () => {
        setIsPreview(false);
        scriptEngine.deactivate();
      }),
      bus.on("dialogue:show", payload => setDialogueState(payload)),
      bus.on("overlay:fade-in", payload => setFadeState(payload)),
      bus.on("leftpanel:open", ({ panelId }) => setLeftPanel(panelId)),
      bus.on("input:mousemove",   ({ worldPos }) => setCoords(worldPos)),
      bus.on("object:selected", payload => {
        setSelected(payload);
        if (payload.type === "trigger-volume") setLeftPanel("scripts");
      }),
      bus.on("object:deselected", ()            => setSelected(null)),
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
        scriptEngine.clearIndex();
        scriptEngine.loadWorld(world.world ?? {} as Parameters<typeof scriptEngine.loadWorld>[0]);
        if (z) scriptEngine.loadZone(z);
      }),
      bus.on("world:loaded",    ()               => {
        setZones([...world.zones.values()]);
        setActiveZoneId(world.activeZoneId);
        setGroups([...world.groups]);
        const z = world.activeZoneId ? world.zones.get(world.activeZoneId) : null;
        setZoneScripts(z?.scripts ?? []);
        setTriggerVolumes(z?.triggerVolumes ?? []);
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
      bus.on("group:added",   () => setGroups([...world.groups])),
      bus.on("group:removed", () => setGroups([...world.groups])),
      bus.on("group:updated", () => setGroups([...world.groups])),
    ];

    return () => {
      active = false; // tell in-flight IIFE this mount is stale
      clearInterval(autosaveTimer);
      window.removeEventListener('beforeunload', writeAutosave);
      previewRef.current?.exit();
      previewRef.current  = null;
      sceneRef.current    = null;
      worldRef.current    = null;
      zonesRef.current    = null;
      unsub.forEach(u => u());
      spawnPointTool.dispose();
      triggerVolumeTool.dispose();
      scriptEngineRef.current = null;
      zoneTool.dispose();
      gizmoManager.dispose();
      openingDragger.dispose();
      nodeDragger.dispose();
      objectTool.dispose();
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
    // trigger-volume: no left panel auto-open; draw first, then select to see scripts
    else setLeftPanel(null);
  };

  const handlePanelToggle = (panelId: LeftPanelId): void => {
    setLeftPanel(p => p === panelId ? null : panelId);
  };

  const handleAddGroup = (): void => {
    const world = worldRef.current;
    if (!world) return;
    world.addGroup({ id: crypto.randomUUID(), name: "New Group" });
  };

  const handleRemoveGroup = (id: string): void => {
    setHiddenGroups(prev => {
      if (!prev.has(id)) return prev;
      busRef.current?.emit("group:visibility", { groupId: id, visible: true });
      const next = new Set(prev); next.delete(id); return next;
    });
    worldRef.current?.removeGroup(id);
  };

  const handleRenameGroup = (id: string, name: string): void => {
    worldRef.current?.updateGroup(id, name);
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

  const handleStartGame = useCallback((): void => {
    previewRef.current?.enter("game");
    scriptEngineRef.current?.onGameStart();
  }, []);

  const handlePlayerSettingsChange = useCallback((changes: Partial<PlayerSettings>): void => {
    const world = worldRef.current;
    if (!world?.world) return;
    historyRef.current?.record("update player settings", () => {
      Object.assign(world.world!.playerSettings, changes);
    });
    syncHistory();
  }, [syncHistory]);

  const handleSpawnPositionChange = useCallback((pos: Vec3): void => {
    const world = worldRef.current;
    if (!world?.world?.defaultSpawn) return;
    const spawn = world.world.defaultSpawn;
    historyRef.current?.record("move spawn point", () => {
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        if (previewRef.current?.isActive) {
          previewRef.current.exit();
          return;
        }
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
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
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSave, handleUndo, handleRedo]);

  const handleSegmentUpdate = (wallId: string, changes: Partial<WallDef>): void => {
    if (!selected) return;
    historyRef.current?.record("update wall segment", () => {
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
    historyRef.current?.beginBatch("copy walls to floor");
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
    historyRef.current?.commitBatch();
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
    historyRef.current?.record("fill run with floor", () => {
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
    const world   = worldRef.current;
    const history = historyRef.current;
    if (!selected || !world) return;
    const { type, id, zoneId } = selected;

    history?.beginBatch(`delete ${type}`);
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
        history?.cancelBatch();
        return;
      }
      world.removeObject(zoneId, id);
    } else if (type === "trigger-volume") {
      const vol = world.zones.get(zoneId)?.triggerVolumes?.find(v => v.id === id);
      if (vol?.scripts?.length) {
        setDeletePrompt({ type: "volume", id, zoneId, scripts: vol.scripts });
        history?.cancelBatch();
        return;
      }
      world.removeTriggerVolume(zoneId, id);
    } else if (type === "opening") {
      const wallId = selected.parentId!;
      const zone = world.zones.get(zoneId);
      const wall = zone?.walls.find(w => w.id === wallId);
      if (!wall) { history?.cancelBatch(); return; }
      world.updateWall(zoneId, wallId, { openings: wall.openings.filter(o => o.id !== id) });
    }
    history?.commitBatch();
    syncHistory();
    setSelected(null);
    busRef.current.emit("object:deselected", {});
  }, [selected, syncHistory]);

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
      history?.record("update opening", () => {
        worldRef.current?.updateOpening(selected.zoneId, wallId, selected.id, fullChanges);
      });
      syncHistory();
      setSelected(prev => prev ? { ...prev, data: { ...(prev.data as Opening), ...fullChanges } } : null);
    } else if (selected.type === "wall") {
      const wallChanges = changes as Partial<WallDef>;
      if (wallChanges.floor !== undefined) {
        // Floor level applies to every wall in the run.
        const runWalls = selected.runWalls ?? (selected.data ? [selected.data as WallDef] : []);
        history?.beginBatch("update wall floor");
        runWalls.forEach(w => {
          worldRef.current?.updateWall(selected.zoneId, w.id, { floor: wallChanges.floor });
        });
        history?.commitBatch();
      } else {
        history?.record("update wall", () => {
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
      history?.record("update floor", () => {
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
      history?.record("update platform", () => {
        worldRef.current?.updatePlatform(selected.zoneId, selected.id, platChanges);
      });
      syncHistory();
      setSelected(prev => prev ? { ...prev, data: { ...(prev.data as PlatformDef), ...platChanges } } : null);
    } else if (selected.type === "stair") {
      const stairChanges = changes as unknown as Partial<StairDef>;
      history?.record("update stair", () => {
        worldRef.current?.updateStair(selected.zoneId, selected.id, stairChanges);
      });
      syncHistory();
      setSelected(prev => prev ? { ...prev, data: { ...(prev.data as StairDef), ...stairChanges } } : null);
    } else if (selected.type === "trigger-volume") {
      const volChanges = changes as unknown as Partial<TriggerVolume>;
      history?.record("update trigger volume", () => {
        worldRef.current?.updateTriggerVolume(selected.zoneId, selected.id, volChanges);
      });
      syncHistory();
    } else {
      const action = changes.properties !== undefined ? "update object properties" : "update object transform";
      historyRef.current?.record(action, () => {
        worldRef.current?.updateObject(selected.zoneId, selected.id, changes);
      });
      syncHistory();
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

  const handleObjectScriptsChange = (objectId: string, scripts: ScriptDef[]): void => {
    if (!selected) return;
    if (selected.type === "trigger-volume") {
      historyRef.current?.record("update volume scripts", () => {
        worldRef.current?.updateTriggerVolume(selected.zoneId, objectId, { scripts });
      });
    } else {
      historyRef.current?.record("update object scripts", () => {
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
    historyRef.current?.record(`delete ${type}`, () => {
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

  const zoneObjects = zones.find(z => z.id === activeZoneId)?.objects ?? [];
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

      <Toolbar
        activeTool={activeTool}
        openPanel={leftPanel}
        onToolSelect={handleToolSelect}
        onPanelToggle={handlePanelToggle}
        onPreview={handlePreviewEnter}
        onStartGame={handleStartGame}
        isPreview={isPreview}
      />
      <LeftPanel
        panelId={leftPanel}
        assets={assets}
        selectedAssetId={selectedAssetId}
        onAssetSelect={handleAssetSelect}
        onImport={() => setShowImporter(true)}
        onDeleteAssets={handleRequestAssetDelete}
        onEditAssets={handleRequestAssetEdit}
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
        activeZoneId={activeZoneId}
        zoneScripts={zoneScripts}
        objectScripts={objectScripts}
        selectedObjectId={selectedObjectId}
        triggerVolumes={triggerVolumes}
        zoneObjects={zoneObjects}
        onZoneScriptsChange={handleZoneScriptsChange}
        onObjectScriptsChange={handleObjectScriptsChange}
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
        onImportMaterial={openMaterialImporter}
        onQualityChange={handleQualityChange}
        onCopyRunToFloor={handleCopyRunToFloor}
        onFillRunWithFloor={isWallRunClosed() ? handleFillRunWithFloor : undefined}
        onDelete={selected ? handleDelete : undefined}
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
      />
      <CoordinateDisplay coords={coords} />

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
              historyRef.current?.record("auto-fill floor", () => {
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
        />
      )}

      <div style={{
        position: "absolute", bottom: 16, right: 296,
        color: "rgba(80,120,180,0.25)", fontSize: 10, fontFamily: "monospace", letterSpacing: 2,
      }}>
SquareDance
      </div>

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
        onClose={() => setDialogueState(null)}
      />
      <FadeOverlay
        fade={fadeState}
        onComplete={() => setFadeState(null)}
      />
    </div>
  );
}
