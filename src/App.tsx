import { useCallback, useEffect, useRef, useState } from "react";

import { EventBus } from "@/core/EventBus";
import { SceneManager } from "@/core/SceneManager";
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
import { physicsWorld } from "@/physics/PhysicsWorld";
import { Toolbar } from "@/ui/Toolbar";
import { TopBar } from "@/ui/TopBar";
import { PropertiesPanel } from "@/ui/PropertiesPanel";
import { CoordinateDisplay } from "@/ui/CoordinateDisplay";
import { LeftPanel } from "@/ui/LeftPanel";
import { ModelImporterModal } from "@/ui/ModelImporterModal";
import { ZoneNamingDialog } from "@/ui/ZoneNamingDialog";
import type { ToolId, Vec2, Vec3, SelectedObjectPayload, WorldObject, ZoneDef, FloorDef, WallDef, Opening, MaterialDef, QualityScale, PlatformDef, StairDef, SceneFile, AssetDef, LeftPanelId, Bounds, ZoneType } from "@/types";
import { HistoryManager } from "@/editor/HistoryManager";
import { migrateWallNodes } from "@/world/WorldLoader";
import { resolveRunNodeIds } from "@/utils/wallRuns";

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
  const busRef      = useRef<EventBus>(new EventBus());
  const worldRef    = useRef<WorldState | null>(null);
  const zonesRef    = useRef<ZoneManager | null>(null);
  const historyRef  = useRef<HistoryManager | null>(null);

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

  const syncHistory = useCallback((): void => {
    setCanUndo(historyRef.current?.canUndo ?? false);
    setCanRedo(historyRef.current?.canRedo  ?? false);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bus = busRef.current;

    const scene     = new SceneManager(canvas, bus);
    assetManager.init(scene.renderer);
    assetManager.initMaterials().then(mats => {
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
    const zoneTool       = new ZoneTool(scene.scene, bus);

    // Seed world with the demo zone
    world.addZone(createDemoZone());
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

    // Register the demo zone so ZoneManager can rebuild floors on placement
    zones.loadZone(DEMO_ZONE_ID);

    // Physics step after Three.js render
    scene.onUpdate(dt => physicsWorld.step(dt));

    const unsub = [
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
      bus.on("zone:activated",  ({ zoneId })     => setActiveZoneId(zoneId)),
      bus.on("world:loaded",    ()               => {
        setZones([...world.zones.values()]);
        setActiveZoneId(world.activeZoneId);
      }),
      bus.on("zonetool:awaiting-name", ({ bounds }) => setPendingZone(bounds)),
    ];

    // Init physics async — not blocking render
    physicsWorld.init().catch(err => console.error("PhysicsWorld init failed:", err));

    return () => {
      worldRef.current = null;
      zonesRef.current = null;
      unsub.forEach(u => u());
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
    setActiveTool(tool);
    busRef.current.emit("tool:select", { tool });
    if (tool === "object") setLeftPanel("assets");
    else if (tool === "zone") setLeftPanel("zones");
    else setLeftPanel(null);
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
    // Switch to select tool after creating zone
    handleToolSelect("select");
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

  const handleSave = useCallback((): void => {
    const world = worldRef.current;
    if (!world) return;
    const json = JSON.stringify(world.toJSON(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href:     url,
      download: 'world.json',
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleLoad = useCallback(async (json: unknown): Promise<void> => {
    const world = worldRef.current;
    const zones = zonesRef.current;
    if (!world || !zones) return;
    try {
      const file = json as SceneFile;
      migrateWallNodes(file.zones);
      await physicsWorld.init(); // no-op if already initialized; ensures colliders won't throw
      for (const zoneId of [...world.zones.keys()]) zones.unloadZone(zoneId);
      world.loadFromJSON(file);
      setSelected(null);
      setActiveFloor(0);
      const activeId = world.activeZoneId;
      if (activeId) await zones.loadZone(activeId);
    } catch (e) {
      console.error('Failed to load scene:', e);
    }
  }, []);

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
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyS') {
        e.preventDefault();
        handleSave();
      }
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.metaKey || e.ctrlKey) && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
      if (e.code === 'Escape') {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          busRef.current.emit('object:deselected', {});
        }
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
      world.removeObject(zoneId, id);
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
      busRef.current.emit("object:updated", { id: selected.id, zoneId: selected.zoneId, changes });
    }
  };

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0e16", position: "relative", overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />

      <Toolbar
        activeTool={activeTool}
        onToolSelect={handleToolSelect}
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
        onNewZone={() => handleToolSelect("zone")}
      />
      <TopBar
        activeFloor={activeFloor}
        onFloorChange={handleFloorChange}
        onCameraTopDown={() => busRef.current.emit("camera:topdown", {})}
        onSave={handleSave}
        onLoad={handleLoad}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
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
        zones={zones}
        activeZoneId={activeZoneId}
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
    </div>
  );
}
