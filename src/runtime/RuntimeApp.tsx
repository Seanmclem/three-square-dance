import { useCallback, useEffect, useRef, useState } from "react";
import { EventBus } from "@/core/EventBus";
import { SceneManager } from "@/core/SceneManager";
import { assetManager } from "@/core/AssetManager";
import { physicsWorld } from "@/physics/PhysicsWorld";
import { WorldState } from "@/world/WorldState";
import { ZoneManager } from "@/world/ZoneManager";
import { ObjectPlacer } from "@/preview/ObjectPlacer";
import { PreviewController } from "@/preview/PreviewController";
import { ScriptEngine } from "@/scripting/ScriptEngine";
import { gameState } from "@/scripting/GameState";
import { PreviewHUD } from "@/ui/PreviewHUD";
import { DialogueOverlay, type DialogueOverlayProps } from "@/ui/DialogueOverlay";
import { PauseMenu } from "@/ui/PauseMenu";
import { TouchControlsOverlay } from "@/ui/TouchControlsOverlay";
import { FpsCounter } from "@/ui/FpsCounter";
import { FadeOverlay, type FadeRequest } from "@/preview/FadeOverlay";
import { loadManifest, type LoadedManifest } from "./manifest";
import { SceneRouter } from "./SceneRouter";
import { writeRuntimeSave, loadRuntimeSave, clearRuntimeSave, type RuntimeSave } from "./saveGame";
import { MainMenu } from "./ui/MainMenu";
import { LoadingScreen } from "./ui/LoadingScreen";
import { ErrorScreen } from "./ui/ErrorScreen";

type ShellState = "boot" | "menu" | "loading" | "playing" | "error";
type Scheme = "kbm" | "gamepad" | "touch";

/**
 * The runtime shell's composition root — the "small App.tsx". Constructs the
 * same engine classes as the editor (minus every tool), boots from a manifest
 * URL (?manifest=), and hosts the DOM menu + the preview overlay set.
 * Script lifecycle across scene loads is owned by SceneRouter, not here.
 */
export default function RuntimeApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const busRef     = useRef<EventBus>(new EventBus());
  const previewRef = useRef<PreviewController | null>(null);
  const routerRef  = useRef<SceneRouter | null>(null);
  const sceneRef   = useRef<SceneManager | null>(null);
  const dialogueOpenRef = useRef(false);
  const pauseOpenRef    = useRef(false);
  const manifestRef     = useRef<LoadedManifest | null>(null);
  const doSaveRef       = useRef<(() => void) | null>(null);

  const [shell, setShell]           = useState<ShellState>("boot");
  const [error, setError]           = useState<string>("");
  const [manifest, setManifest]     = useState<LoadedManifest | null>(null);
  const [previewScheme, setPreviewScheme] = useState<Scheme>("kbm");
  const [dialogueState, setDialogueState] = useState<DialogueOverlayProps["dialogue"]>(null);
  const [fadeState, setFadeState]   = useState<FadeRequest | null>(null);
  const [pauseOpen, setPauseOpen]   = useState(false);
  const [zoneName, setZoneName]     = useState<string | undefined>(undefined);
  const [hasSave, setHasSave]       = useState(false);

  const getRenderInfo = useCallback(() => {
    const r = sceneRef.current?.renderer;
    return r ? { calls: r.info.render.calls, triangles: r.info.render.triangles } : null;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bus = busRef.current;

    const scene = new SceneManager(canvas, bus, { mode: "game" });
    sceneRef.current = scene;
    assetManager.init(scene.renderer);

    const world        = new WorldState(bus);
    const objectPlacer = new ObjectPlacer(bus);
    const zones        = new ZoneManager(scene.scene, world, bus, objectPlacer);
    const preview      = new PreviewController(bus, world, scene, zones);
    previewRef.current = preview;
    const scriptEngine = new ScriptEngine(bus, world);
    gameState.attach(bus);
    zones.init();

    scene.onUpdate(dt => physicsWorld.step(dt));
    scene.onUpdate(dt => objectPlacer.update(dt));
    scene.onUpdate(dt => zones.updateVolumeVisuals(dt));

    // Runtime game save: pose is captured through the existing
    // character:save-position mechanism (foot-level, round-trips through
    // character:teleport). Written every 30s while playing, on exits, and on
    // each scene entry (so the saved sceneId is never stale).
    const POSE_KEY = "__runtime_pose";
    const doSave = () => {
      const m = manifestRef.current;
      const sceneId = routerRef.current?.currentSceneId;
      if (!m || !sceneId) return;
      if (previewRef.current?.isActive) bus.emit("character:save-position", { key: POSE_KEY });
      const pose = gameState.get(POSE_KEY) as RuntimeSave["pose"] | null;
      writeRuntimeSave(m.manifest.id, {
        sceneId,
        state: gameState.snapshot(),
        firedOneShots: scriptEngine.getFiredOneShots(),
        pose: pose ?? undefined,
      });
      setHasSave(true);
    };
    doSaveRef.current = doSave;
    let gameAutosaveTimer: ReturnType<typeof setInterval> | null = null;

    // Menu backdrop: unload the world on exit-to-menu. Nothing drives the
    // default camera in game mode, so a still-loaded level would render from
    // the origin — inside walls/volume fills. Unloading gives the same clean
    // sky as first boot; Start/Continue re-fetch and rebuild via the router.
    const unloadToMenu = () => {
      scriptEngine.deactivate(); // stop timers etc. — router re-activates on the next go()
      for (const id of [...world.zones.keys()]) zones.unloadZone(id);
    };

    const unsub = [
      // Script re-index/activation on scene entry is owned by SceneRouter —
      // this handler is UI state + save cadence only (unlike App.tsx's).
      bus.on("preview:start", () => {
        setZoneName(world.activeZoneId ? world.zones.get(world.activeZoneId)?.name : undefined);
        if (gameAutosaveTimer) clearInterval(gameAutosaveTimer);
        gameAutosaveTimer = setInterval(doSave, 30_000);
        doSave();
      }),
      bus.on("preview:stop", () => {
        pauseOpenRef.current = false;
        setPauseOpen(false);
        dialogueOpenRef.current = false;
        setDialogueState(null);
        if (gameAutosaveTimer) { clearInterval(gameAutosaveTimer); gameAutosaveTimer = null; }
        // During a router transition preview:stop is part of teardown — stay
        // in "loading" rather than flashing the menu (and don't save mid-swap:
        // currentSceneId still points at the scene being torn down).
        if (!routerRef.current?.transitioning) {
          doSave();
          unloadToMenu();
          setShell("menu");
        }
      }),
      bus.on("input:scheme-changed", ({ scheme }) => setPreviewScheme(scheme)),
      // Gamepad Start / kbm Enter / touch ⚙ → close dialogue, else toggle pause.
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
    ];

    // Esc = direct exit to menu (kbm), mirroring the editor's preview exit.
    // Save first — while active, doSave captures a fresh pose.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Escape" && previewRef.current?.isActive) {
        doSave();
        previewRef.current.exit();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    if (import.meta.env.DEV) {
      const g = window as unknown as Record<string, unknown>;
      // Classic globals so TESTING.md recipes work in the runtime tab too.
      g.__scene = scene.scene; g.__camera = scene.camera; g.__renderer = scene.renderer;
      g.__world = world; g.__zones = zones; g.__bus = bus;
      g.__scriptEngine = scriptEngine; g.__preview = preview; g.__gameState = gameState;
      g.__runtime = { bus, world, zones, preview, scriptEngine, gameState, physicsWorld, router: null, manifest: null };
      // Dynamic import: testHelpers statically imports @/editor/bakeShapes —
      // a lazy DEV-only chunk keeps editor code out of the runtime graph.
      void import("@/dev/testHelpers").then(({ installTestHelpers }) =>
        installTestHelpers({ bus, world, scriptEngine, preview, gameState }));
    }

    // active flag: StrictMode's first-mount IIFE bails after its first await
    // instead of racing the second mount on shared singletons (App.tsx pattern).
    let active = true;
    void (async () => {
      const param = new URLSearchParams(window.location.search).get("manifest");
      let loaded: LoadedManifest | null = null;
      if (param) {
        try {
          loaded = await loadManifest(param);
        } catch (err) {
          if (!active) return;
          setError(err instanceof Error ? err.message : String(err));
          setShell("error");
          // fall through to engine init so the sky backdrop still renders
        }
        if (!active) return;
        if (loaded) assetManager.setBaseUrl(loaded.assetsBaseUrl.href);
      }

      // Base URL must be set before any manifest fetch. verifyFiles:false —
      // cross-origin HEAD checks 405 on some hosts and would hide every asset.
      const materialsReady = assetManager.initMaterials({ verifyFiles: false })
        .catch(err => console.error("initMaterials failed:", err));
      assetManager.initAssets({ verifyFiles: false }).catch(err => console.error("initAssets failed:", err));
      assetManager.initDecals({ verifyFiles: false }).catch(err => console.error("initDecals failed:", err));

      await Promise.all([physicsWorld.init(), materialsReady]);
      if (!active) return;

      if (loaded) {
        const router = new SceneRouter({
          bus, world, zones, preview, scriptEngine, manifest: loaded,
          onLoading: () => setShell("loading"),
          onPlaying: () => setShell("playing"),
          onError:   msg => { setError(msg); setShell("error"); },
        });
        routerRef.current = router;
        manifestRef.current = loaded;
        setManifest(loaded);
        setHasSave(loadRuntimeSave(loaded.manifest.id) !== null);
        document.title = loaded.manifest.name;
        if (import.meta.env.DEV) {
          const rt = (window as unknown as Record<string, unknown>).__runtime as Record<string, unknown>;
          rt.router = router; rt.manifest = loaded;
        }
        setShell("menu");
      } else if (!param) {
        setShell("menu"); // no manifest param — menu shows the URL input
      }
    })();

    return () => {
      active = false;
      if (gameAutosaveTimer) clearInterval(gameAutosaveTimer);
      unsub.forEach(u => u());
      window.removeEventListener("keydown", onKeyDown);
      routerRef.current?.dispose();
      routerRef.current = null;
      doSaveRef.current = null;
      preview.exit();
      scene.dispose();
    };
  }, []);

  const handleStart = () => {
    const router = routerRef.current;
    const m = manifest;
    if (!router || !m) return;
    clearRuntimeSave(m.manifest.id);
    setHasSave(false);
    gameState.reset();
    void router.go(m.manifest.entryScene, { newGame: true });
  };

  const handleContinue = () => {
    const router = routerRef.current;
    const m = manifest;
    if (!router || !m) return;
    const save = loadRuntimeSave(m.manifest.id);
    if (!save) { handleStart(); return; }
    gameState.restore(save.state); // values persist through go() (no reset on resume)
    void router.go(save.sceneId, {
      resume: true,
      restore: { firedOneShots: save.firedOneShots, pose: save.pose },
    });
  };

  const input = previewRef.current?.input ?? null;

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0e16", position: "relative", overflow: "hidden" }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />

      {shell === "menu" && (
        <MainMenu
          manifest={manifest?.manifest ?? null}
          hasSave={hasSave}
          onStart={handleStart}
          onContinue={handleContinue}
        />
      )}
      {shell === "loading" && <LoadingScreen />}
      {shell === "error" && (
        <ErrorScreen
          message={error}
          onDismiss={() => { window.location.href = window.location.pathname; }}
        />
      )}

      {shell === "playing" && (
        <PreviewHUD bus={busRef.current} activeZoneName={zoneName} scheme={previewScheme} />
      )}

      {shell === "playing" && previewScheme === "touch" && input && (
        <TouchControlsOverlay
          shared={input.touch.shared}
          joystickRadius={input.bindings.touch.joystickRadius}
          layout={input.bindings.touch.layout}
        />
      )}

      {shell === "playing" && pauseOpen && (
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
            doSaveRef.current?.();      // fresh pose while still active
            previewRef.current?.exit(); // preview:stop handler routes to menu
          }}
        />
      )}

      {import.meta.env.DEV && shell === "playing" && <FpsCounter getInfo={getRenderInfo} />}

      <DialogueOverlay
        dialogue={dialogueState}
        bus={busRef.current}
        onClose={() => {
          dialogueOpenRef.current = false;
          setDialogueState(null);
          busRef.current.emit("dialogue:closed", {});
        }}
      />
      <FadeOverlay fade={fadeState} onComplete={() => setFadeState(null)} />
    </div>
  );
}
