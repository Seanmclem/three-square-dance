import { useEffect, useRef, useState } from "react";
import { EventBus } from "@/core/EventBus";
import { SceneManager } from "@/core/SceneManager";
import { assetManager } from "@/core/AssetManager";
import { physicsWorld } from "@/physics/PhysicsWorld";

type ShellState = "boot" | "menu" | "loading" | "playing" | "error";

export default function RuntimeApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const busRef    = useRef<EventBus>(new EventBus());
  const [shell, setShell] = useState<ShellState>("boot");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bus = busRef.current;

    const scene = new SceneManager(canvas, bus, { mode: "game" });
    assetManager.init(scene.renderer);
    // Same race-avoidance as App.tsx: physics WASM init can beat the material
    // registry, so hold zone building until both settle.
    const materialsReady = assetManager.initMaterials()
      .catch(err => console.error("initMaterials failed:", err));
    assetManager.initAssets().catch(err => console.error("initAssets failed:", err));
    assetManager.initDecals().catch(err => console.error("initDecals failed:", err));

    if (import.meta.env.DEV) {
      const g = window as unknown as Record<string, unknown>;
      g.__runtime = { bus, scene: scene.scene, camera: scene.camera, renderer: scene.renderer };
    }

    // active flag: StrictMode's first-mount IIFE bails after its first await
    // instead of racing the second mount on shared singletons (App.tsx pattern).
    let active = true;
    void (async () => {
      await Promise.all([physicsWorld.init(), materialsReady]);
      if (!active) return;
      setShell("menu");
    })();

    return () => {
      active = false;
      scene.dispose();
    };
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0e16", position: "relative", overflow: "hidden" }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      {shell === "menu" && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center",
          justifyContent: "center", pointerEvents: "none",
        }}>
          <div style={{ color: "#dde", background: "rgba(10,14,22,0.7)", padding: "24px 40px", borderRadius: 8 }}>
            Runtime shell — menu placeholder
          </div>
        </div>
      )}
    </div>
  );
}
