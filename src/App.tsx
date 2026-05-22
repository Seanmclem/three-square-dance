import { useEffect, useRef, useState } from "react";

import { EventBus } from "@/core/EventBus";
import { SceneManager } from "@/core/SceneManager";
import { assetManager } from "@/core/AssetManager";
import { InputManager } from "@/core/InputManager";
import { WorldState } from "@/world/WorldState";
import { ZoneManager } from "@/world/ZoneManager";
import { SelectionManager } from "@/editor/SelectionManager";
import { FloorTool } from "@/editor/FloorTool";
import { WallTool } from "@/editor/WallTool";
import { NodeDragger } from "@/editor/NodeDragger";
import { physicsWorld } from "@/physics/PhysicsWorld";
import { Toolbar } from "@/ui/Toolbar";
import { TopBar } from "@/ui/TopBar";
import { PropertiesPanel } from "@/ui/PropertiesPanel";
import { CoordinateDisplay } from "@/ui/CoordinateDisplay";
import type { ToolId, Vec3, SelectedObjectPayload, WorldObject, ZoneDef, FloorDef, WallDef, MaterialDef, QualityScale } from "@/types";

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

  const [activeTool,   setActiveTool]   = useState<ToolId>("select");
  const [activeFloor,  setActiveFloor]  = useState<number>(0);
  const [coords,       setCoords]       = useState<Vec3>({ x: 0, y: 0, z: 0 });
  const [selected,     setSelected]     = useState<SelectedObjectPayload | null>(null);
  const [materialList, setMaterialList] = useState<MaterialDef[]>([]);
  const [quality,      setQuality]      = useState<QualityScale>(
    () => (localStorage.getItem('editorQuality') as QualityScale) ?? 'high',
  );

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
    const floorTool  = new FloorTool(scene.scene, world, bus);
    const wallTool   = new WallTool(scene.scene, world, bus);
    const nodeDragger = new NodeDragger(scene.scene, world, bus);

    // Seed world with the demo zone
    world.addZone(createDemoZone());

    if (import.meta.env.DEV) {
      const g = window as unknown as Record<string, unknown>;
      g.__scene = scene.scene; g.__camera = scene.camera;
      g.__renderer = scene.renderer; g.__world = world; g.__zones = zones;
    }


    input.init();
    selection.init();
    zones.init();
    floorTool.init();
    wallTool.init();
    nodeDragger.init();

    // Register the demo zone so ZoneManager can rebuild floors on placement
    zones.loadZone(DEMO_ZONE_ID);

    // Physics step after Three.js render
    scene.onUpdate(dt => physicsWorld.step(dt));

    const unsub = [
      bus.on("input:mousemove",   ({ worldPos }) => setCoords(worldPos)),
      bus.on("object:selected",   payload       => setSelected(payload)),
      bus.on("object:deselected", ()            => setSelected(null)),
    ];

    // Init physics async — not blocking render
    physicsWorld.init().catch(err => console.error("PhysicsWorld init failed:", err));

    return () => {
      worldRef.current = null;
      unsub.forEach(u => u());
      nodeDragger.dispose();
      wallTool.dispose();
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

  const handleMaterialsReload = (): void => {
    assetManager.initMaterials().then(mats => setMaterialList(mats))
      .catch(err => console.error("materials reload failed:", err));
  };

  const handleObjectUpdate = (changes: Partial<WorldObject>): void => {
    if (!selected) return;
    if (selected.type === "wall") {
      worldRef.current?.updateWall(selected.zoneId, selected.id, changes as Partial<WallDef>);
      setSelected(prev => prev ? { ...prev, data: { ...(prev.data as WallDef), ...changes } } : null);
    } else if (selected.type === "floor") {
      const floorDef = selected.data as FloorDef;
      worldRef.current?.updateFloor(selected.zoneId, floorDef.level, changes as unknown as Partial<FloorDef>);
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
        onMaterialsReload={handleMaterialsReload}
        onQualityChange={handleQualityChange}
      />
      <CoordinateDisplay coords={coords} />

      <div style={{
        position: "absolute", bottom: 16, right: 296,
        color: "rgba(80,120,180,0.25)", fontSize: 10, fontFamily: "monospace", letterSpacing: 2,
      }}>
        WORLD BUILDER
      </div>
    </div>
  );
}
