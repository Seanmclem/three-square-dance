import { useEffect, useRef, useState } from "react";

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
import { StairTool } from "@/editor/StairTool";
import { NodeDragger } from "@/editor/NodeDragger";
import { OpeningDragHandler } from "@/editor/OpeningDragHandler";
import { physicsWorld } from "@/physics/PhysicsWorld";
import { Toolbar } from "@/ui/Toolbar";
import { TopBar } from "@/ui/TopBar";
import { PropertiesPanel } from "@/ui/PropertiesPanel";
import { CoordinateDisplay } from "@/ui/CoordinateDisplay";
import type { ToolId, Vec2, Vec3, SelectedObjectPayload, WorldObject, ZoneDef, FloorDef, WallDef, Opening, MaterialDef, QualityScale, PlatformDef, StairDef } from "@/types";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const busRef    = useRef<EventBus>(new EventBus());
  const worldRef  = useRef<WorldState | null>(null);

  const [activeTool,       setActiveTool]       = useState<ToolId>("select");
  const [activeFloor,      setActiveFloor]      = useState<number>(0);
  const [coords,           setCoords]           = useState<Vec3>({ x: 0, y: 0, z: 0 });
  const [selected,         setSelected]         = useState<SelectedObjectPayload | null>(null);
  const [materialList,     setMaterialList]     = useState<MaterialDef[]>([]);
  const [quality,          setQuality]          = useState<QualityScale>(
    () => (localStorage.getItem('editorQuality') as QualityScale) ?? 'high',
  );
  const [autoFloorPrompt, setAutoFloorPrompt] = useState<{ zoneId: string; level: number; points: Vec2[]; nodeIds: string[] } | null>(null);

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
    const world     = new WorldState(bus);
    worldRef.current = world;
    const input     = new InputManager(canvas, scene.camera, bus);
    const selection = new SelectionManager(scene.scene, scene.camera, canvas, world, bus);
    const zones     = new ZoneManager(scene.scene, world, bus);
    const floorTool    = new FloorTool(scene.scene, world, bus);
    const polyFloorTool = new PolygonFloorTool(scene.scene, world, bus);
    const wallTool     = new WallTool(scene.scene, world, bus);
    const platformTool   = new PlatformTool(scene.scene, world, bus);
    const stairTool      = new StairTool(scene.scene, world, bus);
    const nodeDragger    = new NodeDragger(scene.scene, world, bus);
    const openingDragger = new OpeningDragHandler(scene.scene, scene.camera, canvas, world, bus);

    // Seed world with the demo zone
    world.addZone(createDemoZone());

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
    stairTool.init();
    nodeDragger.init();
    openingDragger.init();

    // Register the demo zone so ZoneManager can rebuild floors on placement
    zones.loadZone(DEMO_ZONE_ID);

    // Physics step after Three.js render
    scene.onUpdate(dt => physicsWorld.step(dt));

    const unsub = [
      bus.on("input:mousemove",   ({ worldPos }) => setCoords(worldPos)),
      bus.on("object:selected",   payload       => setSelected(payload)),
      bus.on("object:deselected", ()            => setSelected(null)),
      bus.on("floortool:suggest-auto-floor", payload => setAutoFloorPrompt(payload)),
      bus.on("tool:placed", () => {
        setActiveTool("select");
        bus.emit("tool:select", { tool: "select" });
      }),
    ];

    // Init physics async — not blocking render
    physicsWorld.init().catch(err => console.error("PhysicsWorld init failed:", err));

    return () => {
      worldRef.current = null;
      unsub.forEach(u => u());
      openingDragger.dispose();
      nodeDragger.dispose();
      stairTool.dispose();
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

  const handleSegmentUpdate = (wallId: string, changes: Partial<WallDef>): void => {
    if (!selected) return;
    worldRef.current?.updateWallSegment(selected.zoneId, wallId, changes);
    setSelected(prev => {
      if (!prev?.runWalls) return prev;
      return {
        ...prev,
        runWalls: prev.runWalls.map(w => w.id === wallId ? { ...w, ...changes } : w),
      };
    });
  };

  const handleMaterialsReload = (): void => {
    assetManager.initMaterials().then(mats => setMaterialList(mats))
      .catch(err => console.error("materials reload failed:", err));
  };

  const handleObjectUpdate = (changes: Partial<WorldObject>): void => {
    if (!selected) return;
    if (selected.type === "opening") {
      const wallId = selected.parentId;
      if (!wallId) return;
      worldRef.current?.updateOpening(selected.zoneId, wallId, selected.id, changes as unknown as Partial<Opening>);
      setSelected(prev => prev ? { ...prev, data: { ...(prev.data as Opening), ...changes } } : null);
    } else if (selected.type === "wall") {
      const wallChanges = changes as Partial<WallDef>;
      worldRef.current?.updateWall(selected.zoneId, selected.id, wallChanges);
      setSelected(prev => {
        if (!prev) return null;
        // Mirror sync keys locally so segment rows update before the async rebuild arrives.
        const syncKeys = ["material", "exteriorMaterial", "height", "materialOverrides"] as const;
        const updRunWalls = prev.runWalls
          ? prev.runWalls.map(w => ({ ...w, ...Object.fromEntries(syncKeys.filter(k => k in wallChanges).map(k => [k, (wallChanges as Record<string, unknown>)[k]])) }))
          : prev.runWalls;
        return { ...prev, data: { ...(prev.data as WallDef), ...wallChanges }, runWalls: updRunWalls };
      });
    } else if (selected.type === "floor") {
      const floorDef = selected.data as FloorDef;
      worldRef.current?.updateFloor(selected.zoneId, floorDef.id, changes as unknown as Partial<FloorDef>);
      const floorChanges = changes as unknown as Partial<FloorDef>;
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
      worldRef.current?.updatePlatform(selected.zoneId, selected.id, platChanges);
      setSelected(prev => prev ? { ...prev, data: { ...(prev.data as PlatformDef), ...platChanges } } : null);
    } else if (selected.type === "stair") {
      const stairChanges = changes as unknown as Partial<StairDef>;
      worldRef.current?.updateStair(selected.zoneId, selected.id, stairChanges);
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

      <Toolbar         activeTool={activeTool}   onToolSelect={handleToolSelect} />
      <TopBar
        activeFloor={activeFloor}
        onFloorChange={handleFloorChange}
        onCameraTopDown={() => busRef.current.emit("camera:topdown", {})}
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
              const elevation = zone?.floors.find(f => f.level === level)?.elevation ?? 0;
              worldRef.current?.addFloor(zoneId, {
                id:            crypto.randomUUID(),
                level,
                elevation,
                ceilingHeight: null,
                floorMesh: { shape: "polygon", points, nodeIds, material: "concrete_01" },
              });
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
    </div>
  );
}
