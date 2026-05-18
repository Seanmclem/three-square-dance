import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { EventBus } from "@/core/EventBus";
import { SceneManager } from "@/core/SceneManager";
import { Toolbar } from "@/ui/Toolbar";
import { TopBar } from "@/ui/TopBar";
import { PropertiesPanel } from "@/ui/PropertiesPanel";
import { CoordinateDisplay } from "@/ui/CoordinateDisplay";
import type { ToolId, Vec3 } from "@/types";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef  = useRef<SceneManager | null>(null);
  const busRef    = useRef<EventBus>(new EventBus());

  const [activeTool,  setActiveTool]  = useState<ToolId>("select");
  const [activeFloor, setActiveFloor] = useState<number>(0);
  const [coords,      setCoords]      = useState<Vec3>({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const sm = new SceneManager(canvas, busRef.current);
    sceneRef.current = sm;

    const raycaster   = new THREE.Raycaster();
    const mouse       = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target      = new THREE.Vector3();

    const onMouseMove = (e: MouseEvent): void => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, sm.camera);
      if (raycaster.ray.intersectPlane(groundPlane, target)) {
        setCoords({ x: target.x, y: target.y, z: target.z });
      }
    };

    canvas.addEventListener("mousemove", onMouseMove);
    return () => {
      canvas.removeEventListener("mousemove", onMouseMove);
      sm.dispose();
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

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0e16", position: "relative", overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />

      <Toolbar         activeTool={activeTool}   onToolSelect={handleToolSelect} />
      <TopBar          activeFloor={activeFloor} onFloorChange={handleFloorChange} />
      <PropertiesPanel activeTool={activeTool} />
      <CoordinateDisplay coords={coords} />

      <div style={{
        position: "absolute", bottom: 16, right: 296,
        color: "rgba(80,120,180,0.25)", fontSize: 10, fontFamily: "monospace", letterSpacing: 2,
      }}>
        PHASE 1 — SCENE FOUNDATION
      </div>
    </div>
  );
}
