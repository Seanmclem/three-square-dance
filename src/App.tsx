import { useCallback, useEffect, useRef, useState } from "react";

import { EventBus } from "@/core/EventBus";
import { SceneManager } from "@/core/SceneManager";
import { PreviewController } from "@/preview/PreviewController";
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
import { physicsWorld } from "@/physics/PhysicsWorld";
import { Toolbar } from "@/ui/Toolbar";
import { TopBar } from "@/ui/TopBar";
import { PreviewHUD } from "@/ui/PreviewHUD";
import { PropertiesPanel } from "@/ui/PropertiesPanel";
import { CoordinateDisplay } from "@/ui/CoordinateDisplay";
import { LeftPanel } from "@/ui/LeftPanel";
import { ModelImporterModal } from "@/ui/ModelImporterModal";
import { ZoneNamingDialog } from "@/ui/ZoneNamingDialog";
import { ScriptDetachDialog } from "@/ui/ScriptDetachDialog";
import type { ToolId, Vec2, Vec3, SelectedObjectPayload, WorldObject, ZoneDef, FloorDef, WallDef, Opening, MaterialDef, QualityScale, PlatformDef, StairDef, SceneFile, AssetDef, LeftPanelId, Bounds, ZoneType, PlayerSettings, ScriptDef, TriggerVolume } from "@/types";
import { HistoryManager } from "@/editor/HistoryManager";
import { migrateWallNodes } from "@/world/WorldLoader";
import { resolveRunNodeIds } from "@/utils/wallRuns";
import { idbGet, idbSet } from "@/lib/fileHandleStore";

const DEMO_ZONE_ID = "demo";

function createDemoZone(): ZoneDef {
  return {
    id: DEMO_ZONE_ID,
    name: "Demo Zone",
    type: "outdoor",
    bounds: { x: -50, z: -50, width: 100, depth: 100 },
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
  const [modelsDir,       setModelsDir]        = useState<FileSystemDirectoryHandle | null>(null);
  const [zones,           setZones]            = useState<ZoneDef[]>([]);
  const [activeZoneId,    setActiveZoneId]     = useState<string | null>(DEMO_ZONE_ID);
  const [pendingZone,     setPendingZone]      = useState<Bounds | null>(null);
  const [isDirty,         setIsDirty]          = useState(false);
  const [lastAutosaveAt,  setLastAutosaveAt]   = useState<number | null>(null);
  const [isPreview,       setIsPreview]        = useState(false);
  const [dialogueState,   setDialogueState]    = useState<{ speaker: string; lines: string[]; portrait?: string } | null>(null);
  const [worldScripts,    setWorldScripts]     = useState<ScriptDef[]>([]);
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
    const zones     = new ZoneManager(scene.scene, world, bus);
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

    const unsub = [
      bus.on("preview:start", () => {
        setIsPreview(true);
        scriptEngine.activate();
      }),
      bus.on("preview:stop",  () => {
        setIsPreview(false);
        scriptEngine.deactivate();
      }),
      bus.on("dialogue:show", payload => setDialogueState(payload)),
      bus.on("input:mousemove",   ({ worldPos }) => setCoords(worldPos)),
      bus.on("object:selected",   payload       => setSelected(payload)),
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
        setWorldScripts(world.world?.scripts ?? []);
        const z = world.activeZoneId ? world.zones.get(world.activeZoneId) : null;
        setZoneScripts(z?.scripts ?? []);
        setTriggerVolumes(z?.triggerVolumes ?? []);
      }),
      bus.on("triggervolume:added",   () => {
        const z = world.zones.get(world.activeZoneId ?? "");
        setTriggerVolumes(z?.triggerVolumes ?? []);
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
      bus.on("zonetool:awaiting-name", ({ bounds }) => setPendingZone(bounds)),
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
      // Z = toggle zones browser; cancel draw mode if it was active
      if (activeTool === "zone") {
        setActiveTool("select");
        busRef.current.emit("tool:select", { tool: "select" });
      }
      setLeftPanel(p => p === "zones" ? null : "zones");
      return;
    }
    setActiveTool(tool);
    busRef.current.emit("tool:select", { tool });
    if (tool === "object") setLeftPanel("assets");
    else if (tool === "trigger-volume") setLeftPanel("scripts");
    else setLeftPanel(null);
  };

  const handleStartZoneDraw = (): void => {
    setActiveTool("zone");
    busRef.current.emit("tool:select", { tool: "zone" });
    setLeftPanel("zones");
  };

  const handlePanelToggle = (panelId: LeftPanelId): void => {
    setLeftPanel(p => p === panelId ? null : panelId);
  };

  const handleEnterZone = (zoneId: string): void => {
    busRef.current.emit("zone:enter", { zoneId });
  };

  const handleZoneConfirm = (name: string, type: ZoneType): void => {
    const bounds = pendingZone;
    setPendingZone(null);
    if (!bounds) return;
    const world = worldRef.current;
    if (!world) return;
    const newZone: ZoneDef = {
      id:        crypto.randomUUID(),
      name,
      type,
      bounds,
      nodes:     [],
      floors:    [],
      walls:     [],
      platforms: [],
      stairs:    [],
      objects:   [],
    };
    historyRef.current?.record("add zone", () => {
      world.addZone(newZone);
      world.setActiveZone(newZone.id);
    });
    syncHistory();
    // Return to select tool, keep zones panel open so user sees the new zone
    setActiveTool("select");
    busRef.current.emit("tool:select", { tool: "select" });
    setLeftPanel("zones");
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
    } else {
      if (changes.properties !== undefined) {
        historyRef.current?.record("update object properties", () => {
          worldRef.current?.updateObject(selected.zoneId, selected.id, changes);
        });
        syncHistory();
      } else {
        busRef.current.emit("object:updated", { id: selected.id, zoneId: selected.zoneId, changes });
      }
    }
  };

  const handleWorldScriptsChange = (scripts: ScriptDef[]): void => {
    const world = worldRef.current;
    if (!world?.world) return;
    world.world.scripts = scripts;
    setWorldScripts(scripts);
    setIsDirty(true);
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
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
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
        onClose={() => setLeftPanel(null)}
        zones={zones}
        activeZoneId={activeZoneId}
        onEnterZone={handleEnterZone}
        onNewZone={handleStartZoneDraw}
        worldScripts={worldScripts}
        zoneScripts={zoneScripts}
        objectScripts={objectScripts}
        selectedObjectId={selectedObjectId}
        triggerVolumes={triggerVolumes}
        zoneObjects={zoneObjects}
        onWorldScriptsChange={handleWorldScriptsChange}
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
        onMaterialsReload={handleMaterialsReload}
        onQualityChange={handleQualityChange}
        onCopyRunToFloor={handleCopyRunToFloor}
        onFillRunWithFloor={isWallRunClosed() ? handleFillRunWithFloor : undefined}
        onDelete={selected ? handleDelete : undefined}
        onVolumeScriptsChange={selectedObjectId ? (scripts) => handleObjectScriptsChange(selectedObjectId, scripts) : undefined}
        zones={zones}
        activeZoneId={activeZoneId}
        playerSettings={worldRef.current?.world?.playerSettings}
        assets={assets}
        onPlayerSettingsChange={handlePlayerSettingsChange}
        onSpawnPositionChange={handleSpawnPositionChange}
      />
      <CoordinateDisplay coords={coords} />


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

      {pendingZone && (
        <ZoneNamingDialog
          onConfirm={handleZoneConfirm}
          onCancel={() => setPendingZone(null)}
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
    </div>
  );
}
