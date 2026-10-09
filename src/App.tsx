import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EventBus } from "@/core/EventBus";
import { SceneManager } from "@/core/SceneManager";
import { PreviewController } from "@/preview/PreviewController";
import { EnemyAI } from "@/preview/EnemyAI";
import { AudioSystem } from "@/audio/AudioSystem";
import { ObjectPlacer } from "@/preview/ObjectPlacer";
import { assetManager } from "@/core/AssetManager";
import { InputManager } from "@/core/InputManager";
import { WorldState } from "@/world/WorldState";
import { ZoneManager } from "@/world/ZoneManager";
import { levelElevation } from "@/world/levels";
import { MoverSystem } from "@/world/MoverSystem";
import { armTransformWatchdog } from "@/world/transformWatchdog";
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
import { BrushSetEditor } from "@/editor/BrushSetEditor";
import { SoftFalloffController } from "@/editor/softFalloff";
import { BrushRoundController } from "@/editor/BrushRoundController";
import { BrushHoleController } from "@/editor/BrushHoleController";
import { ObjectTool } from "@/editor/ObjectTool";
import { PrefabTool } from "@/editor/PrefabTool";
import { GENERATORS } from "@/prefab/generators";
import { loadSessionPrefabs, saveSessionPrefabs, promoteSessionPrefabs } from "@/prefab/library";
import { DEFAULT_PLAYER_SETTINGS, resolvePlayerSettings, type SettingsPage } from "@/shared/playerSettingsDefaults";
import { reexpandInstance, unlinkInstance, deleteInstance, captureSnapshotPrefab, captureInstanceToPrefab, removeEntities, instantiatePrefab, findInstances, collectInstanceMembers } from "@/prefab/expand";
import { PrefabEditSession } from "@/prefab/PrefabEditSession";
import { EditModeBar } from "@/ui/EditModeBar";
import { SelectModeBar } from "@/ui/SelectModeBar";
import { BrushEditSession, BRUSH_EDIT_ZONE } from "@/editor/BrushEditSession";
import { CharacterStage } from "@/characters/CharacterStage";
import { autoFillMoves } from "@/characters/autoFill";
import { legacyCharacter } from "@/characters/characterRuntime";
import { CharacterEditor } from "@/ui/CharacterEditor";
import { setUiCharacters, setUiCharacterActions } from "@/characters/uiCharacters";
import { effectiveCharacterScale } from "@/preview/CharacterController";
import { isBrush } from "@/builders/ShapeBuilder";
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
import { AiRangeRings } from "@/editor/AiRangeRings";
import { WallSplitter } from "@/editor/WallSplitter";
import { SegmentHighlighter } from "@/editor/SegmentHighlighter";
import { defaultColliderFromAABB } from "@/physics/attachedColliderMath";
import { StairCutterResizer } from "@/editor/StairCutterResizer";
import { ScriptEngine, setPlayerMotionProvider, setLivePositionProvider } from "@/scripting/ScriptEngine";
import { gameState, GAMESAVE_KEY, DEFAULT_STATE_SCHEMA } from "@/scripting/GameState";
import { DialogueOverlay } from "@/ui/DialogueOverlay";
import { FadeOverlay, type FadeRequest } from "@/preview/FadeOverlay";
import { FlashOverlay, type FlashRequest } from "@/preview/FlashOverlay";
import { installTestHelpers } from "@/dev/testHelpers";
import { physicsWorld } from "@/physics/PhysicsWorld";
import { Toolbar } from "@/ui/Toolbar";
import { TopBar, type FloorSummary } from "@/ui/TopBar";
import { PreviewHUD } from "@/ui/PreviewHUD";
import { TouchControlsOverlay } from "@/ui/TouchControlsOverlay";
import { PauseMenu } from "@/ui/PauseMenu";
import { BagOverlay } from "@/ui/BagOverlay";
import { GameGuiOverlay } from "@/ui/GameGuiOverlay";
import { interactDisplay, DEFAULT_BINDINGS, loadBindings, saveBindings, resetBindings } from "@/input/bindings";
import { effectiveBindings, loadPlayerControls, setUiGameButtons } from "@/input/gameControls";
import { PropertiesPanel } from "@/ui/PropertiesPanel";
import { CoordinateDisplay } from "@/ui/CoordinateDisplay";
import { FpsCounter } from "@/ui/FpsCounter";
import { JumpReadout } from "@/ui/JumpReadout";
import { ViewportContextMenu } from "@/ui/ViewportContextMenu";
import { LeftPanel } from "@/ui/LeftPanel";
import { ModelImporterModal } from "@/ui/ModelImporterModal";
import { MaterialImporterModal } from "@/ui/MaterialImporterModal";
import { AudioImporterModal } from "@/ui/AudioImporterModal";
import { SoundRecorderModal } from "@/ui/SoundRecorderModal";
import { GraphicsImporterModal } from "@/ui/GraphicsImporterModal";
import { SkyboxImporterModal } from "@/ui/SkyboxImporterModal";
import { ScriptDetachDialog } from "@/ui/ScriptDetachDialog";
import { PrefabInstancesDialog, type PrefabInstanceRow } from "@/ui/PrefabInstancesDialog";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
import { DeleteAssetDialog } from "@/ui/DeleteAssetDialog";
import { EditMetadataDialog, type EditPatch } from "@/ui/EditMetadataDialog";
import { ThumbnailStagerModal } from "@/ui/ThumbnailStagerModal";
import { ReoriginModal } from "@/ui/ReoriginModal";
import { applyGltfReorigin, instanceWorldShift } from "@/core/gltfReorigin";
import { dataURLtoArrayBuffer, renderModelThumbnail } from "@/editor/thumbnailRenderer";
import { bakeShapes, disposeBakeGroup } from "@/editor/bakeShapes";
import { writeAssetToLibrary, writeAssetFile, removeAssetFiles, removeEntries, updateEntries, upsertEntry } from "@/assets/assetLibrary";
import { BakeDialog } from "@/ui/BakeDialog";
import { PrintExportDialog } from "@/ui/PrintExportDialog";
import { MAT_CAT_ORDER } from "@/ui/materialCategories";
import type {
  GameConfig, ToolId, Vec2, Vec3, SelectedObjectPayload, SelectedRef, WorldObject, ZoneDef, FloorDef, WallDef, Opening, MaterialDef, QualityScale, PlatformDef, StairDef, LadderDef, ShapeDef, SceneFile, AssetDef, AttachedCollider, LeftPanelId, PlayerSettings, ScriptAction, ScriptDef, TriggerVolume, CheckpointDef, LightDef, GroupDef, Attribution, JsonValue, StateSchema, NodeLinks, DecalTexDef, DecalKind, DecalDef, PreviewMode, DialogueTreeDef, ItemDef, WorldAudio, SoundDef, SkyboxDef, GraphicDef, UiElementDef, PrefabDef, PrefabVarValue, BrushViewBackground, CharacterDef } from "@/types";
import { isGameplayMode, HIDDEN_CATEGORY, DEFAULT_BRUSH_BACKGROUND } from "@/types";

const ASSET_CATEGORIES = ["Furniture", "Props", "Structures", "Lights", "Characters", "Vegetation", "Other", HIDDEN_CATEGORY];

type PendingEdit = {
  ids:     string[];
  items:   { id: string; label: string }[];
  initial: { label: string; category: string; attribution: Attribution; tags?: string[] };
};
import { HistoryManager, type HistoryEntry } from "@/editor/HistoryManager";
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
import { PublishModal } from "@/ui/PublishModal";
import { resolveRunNodeIds } from "@/utils/wallRuns";

const DEMO_ZONE_ID = "demo";

// ── Autosave storage (phase 55): workspace file via the desktop shell when
// available (atomic, survives cache clears), localStorage in a plain browser.
// Undo history rides INSIDE the autosave payload (v4.99.4) under this key, so the
// two are always written together: undo entries are per-entity before/after diffs and
// are only valid against the exact world they were recorded on. On boot the history is
// restored only when this autosave is what got loaded (not the scene file, not an
// expired autosave). Bump the version if HistoryEntry's shape ever changes.
const HISTORY_KEY = "__editorHistory";
const BRUSH_BG_KEY = "brushViewBackground";
const HISTORY_VERSION = 1;
type StoredHistory = { v: number; undo: HistoryEntry[]; redo: HistoryEntry[] };

function storeAutosave(json: string, meta: { projectId: string | null; sceneId: string | null }, withHistory?: string): number {
  const ts = Date.now();
  const d = desktop();
  if (d) {
    // The desktop autosave is ONE file shared by every window and tab on the shell. An
    // automated test browser (Playwright etc. set navigator.webdriver) must never write it:
    // a headless test's 60 s tick once saved a throwaway test shape there, the user's
    // window restored it on the next shell start, and a Save put it in level_2 (v4.99.4).
    if (navigator.webdriver) return ts;
    void d.writeAutosave(meta, withHistory ?? json).catch(e => console.warn("autosave write failed:", e));
  } else {
    // localStorage has a small quota; a long history of brush edits can exceed it —
    // fall back to the world alone (history then simply doesn't survive the reload).
    try {
      localStorage.setItem("worldeditor_autosave", withHistory ?? json);
    } catch {
      localStorage.setItem("worldeditor_autosave", json);
    }
    localStorage.setItem("worldeditor_autosave_ts", ts.toString());
  }
  return ts;
}

/** Split a stored autosave into the world JSON and its undo history (if valid). */
function splitAutosave(text: string): { world: unknown; history: StoredHistory | null } {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  const h = parsed[HISTORY_KEY] as StoredHistory | undefined;
  delete parsed[HISTORY_KEY];
  const ok = !!h && h.v === HISTORY_VERSION && Array.isArray(h.undo) && Array.isArray(h.redo);
  return { world: parsed, history: ok ? h! : null };
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
  const activeToolRef = useRef<ToolId>("select");   // for memoized handlers (undo/redo)
  activeToolRef.current = activeTool;
  const [spawnMode,        setSpawnMode]        = useState<"initial" | "checkpoint">("initial");
  const [activeFloor,      setActiveFloor]      = useState<number>(0);
  // Top bar "All floors" (per-viewer convenience, remembered in this browser).
  const [showAllFloors,    setShowAllFloors]    = useState<boolean>(() => { try { return localStorage.getItem("editorShowAllFloors") === "1"; } catch { return false; } });
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
  const [showJumpStats,   setShowJumpStats]   = useState(() => localStorage.getItem('editorShowJumpStats') === '1');   // opt-in (Phase 70)
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
  const [soundRecorderOpen, setSoundRecorderOpen] = useState(false);
  // A recording handed to the importer — pre-fills its file list, straight to metadata.
  const [recordedFiles, setRecordedFiles] = useState<File[] | null>(null);
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
  const [printShapes,     setPrintShapes]      = useState<ShapeDef[] | null>(null);   // v4.107.0 3D print export
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
  const [gameInputRev,    setGameInputRev]     = useState(0);   // v4.79.78 — bumps when the per-game interact binding changes
  // Effective interact display for the active device — resolved once per
  // scheme/binding change, consumed by the HUD pill + {interact} label token.
  const interactName = useMemo(
    () => interactDisplay(previewScheme, effectiveBindings(worldRef.current?.gameInput, loadPlayerControls(worldRef.current?.gameId))),
    [previewScheme, gameInputRev, isPreview]);   // eslint-disable-line react-hooks/exhaustive-deps
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
  // First-hop snapshot of the LIVE editing scene (v4.79.67): unsaved edits + undo
  // stacks — the return path restores these instead of re-reading the disk file.
  const routeReturnSnapshotRef = useRef<{ snap: SceneFile; history: ReturnType<HistoryManager["capture"]> | null } | null>(null);
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
  const [characters,      setCharacters]       = useState<CharacterDef[]>([]);   // Phase 86: game.json characters
  setUiCharacters(characters);   // deep panels (player settings, enemy AI) read it during render
  const [prefabTick,      setPrefabTick]       = useState(0);   // bumps on instance add/remove → refreshes counts
  // Non-null = the "can't delete prefab yet" dialog is open, listing its instances.
  const [prefabDeleteBlocked, setPrefabDeleteBlocked] = useState<{ prefabId: string; rows: PrefabInstanceRow[] } | null>(null);
  // Pending confirmation for a destructive instance action (both the Prefab-section
  // buttons and the header ⋯ menu route through this).
  const [prefabConfirm, setPrefabConfirm] = useState<"reset" | "unlink" | "delete" | "push" | null>(null);
  // Isolated prefab edit mode (Phase 47). The ref gates autosave/save/play
  // synchronously (state is for rendering the bar + disabling UI).
  const [editingPrefab,   setEditingPrefab]    = useState<{ id: string; name: string } | null>(null);
  const editingPrefabRef = useRef(false);
  const editSessionRef   = useRef<PrefabEditSession | null>(null);
  // Isolated brush edit mode — same pattern, one shape. Both modes share the
  // save/autosave/play gates via inIsolatedEdit().
  const [editingBrush,    setEditingBrush]     = useState<{ name: string } | null>(null);
  const editingBrushRef  = useRef(false);
  // Phase 86 part B: the character editor (isolated, like Edit Brush). `saved` = the JSON
  // last written to game.json, for the unsaved-changes check.
  const [editingCharacter, setEditingCharacter] = useState<{ draft: CharacterDef; saved: string } | null>(null);
  const editingCharacterRef = useRef(false);
  const characterStageRef = useRef<CharacterStage | null>(null);
  const [characterConfirmClose, setCharacterConfirmClose] = useState(false);
  // TRY IT: the draft plays as the player in the level; Esc (preview:stop) reopens the editor.
  const [characterTrying, setCharacterTrying] = useState(false);
  const characterTryRef = useRef<CharacterDef | null>(null);
  const characterSaveRef = useRef<(() => void) | null>(null);
  const brushSessionRef  = useRef<BrushEditSession | null>(null);
  // v4.99.6/7: Edit Brush has no solid ground plane and a 30 m grid instead of the level's 100 m one.
  // v4.99.9: and its own background (Brush View screen), an editor pref kept in the workspace
  // settings on desktop (the shell's port changes per launch, so localStorage alone resets).
  const [brushBg, setBrushBg] = useState<BrushViewBackground>(() => {
    try { return JSON.parse(localStorage.getItem(BRUSH_BG_KEY) ?? "null") ?? DEFAULT_BRUSH_BACKGROUND; }
    catch { return DEFAULT_BRUSH_BACKGROUND; }
  });
  useEffect(() => {
    void detectDesktop().then(() => desktop()?.getPref(BRUSH_BG_KEY)).then(v => {
      if (v) try { setBrushBg(JSON.parse(v)); } catch { /* keep the default */ }
    });
  }, []);
  const handleBrushBgChange = (bg: BrushViewBackground): void => {
    setBrushBg(bg);
    const json = JSON.stringify(bg);
    try { localStorage.setItem(BRUSH_BG_KEY, json); } catch { /* storage blocked */ }
    void desktop()?.setPref(BRUSH_BG_KEY, json);
  };
  // v4.102.2: the level's spawn marker (and its right-click move) stay out of isolated edits.
  useEffect(() => { busRef.current.emit("spawn:suppress", { suppressed: !!editingBrush || !!editingPrefab || !!editingCharacter }); }, [editingBrush, editingPrefab, editingCharacter]);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setBrushBackground(brushBg);
    const isolatedView = !!editingBrush || !!editingCharacter;   // Phase 86: the character editor uses the same dark view
    scene.setBrushEditView(isolatedView);
    // v4.102.2: Edit Brush can orbit underneath the brush; back above ground on Close.
    const cam = scene.editorCamera;
    if (!cam) return;
    cam.allowBelow = isolatedView;
    if (!isolatedView) {
      const cap = Math.PI / 2 - 0.02;
      cam.targetSpherical.phi = Math.min(cam.targetSpherical.phi, cap);
      cam.spherical.phi = Math.min(cam.spherical.phi, cap);
    }
  }, [editingBrush, editingCharacter, brushBg]);
  // v4.99.1: Save stays in the session; the bar shows unsaved / saved, and Close asks
  // before dropping unsaved changes. Cmd+S saves the brush while the session is open.
  const [brushDirty,        setBrushDirty]        = useState(false);
  const [brushSaved,        setBrushSaved]        = useState(false);
  const [brushConfirmClose, setBrushConfirmClose] = useState(false);
  const brushSaveRef = useRef<(() => void) | null>(null);
  const inIsolatedEdit   = (): boolean => editingPrefabRef.current || editingBrushRef.current || editingCharacterRef.current;
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
  const [gameScripts,     setGameScripts]      = useState<ScriptDef[]>([]);   // Phase 77 — game.json scripts (project open)
  // Phase 33 — project (multi-scene game folder). null = classic single-scene editing.
  interface ProjectCtx { store: ProjectStore; sceneId: string; rev: number }
  const [project, setProject] = useState<ProjectCtx | null>(null);
  const projectRef = useRef<ProjectCtx | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [openProjectOpen, setOpenProjectOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
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
    objectPlacer.setCharacterLookup(id => world.gameCharacters?.find(c => c.id === id) ?? null);   // Phase 86
    const movers    = new MoverSystem(bus);
    const zones     = new ZoneManager(scene.scene, world, bus, objectPlacer, movers);
    zones.enableEditorGhosts();   // see-through editorGhost ceilings (editor shell only)
    zones.enableLevelDimming();   // translucent non-active floor levels (editor shell only)
    zones.setShowAllLevels(showAllFloors);
    zonesRef.current = zones;
    const history   = new HistoryManager(world, syncHistory);
    historyRef.current = history;
    world.setHistory(history);
    bus.on("world:loaded",  () => { history.clear(); syncHistory(); });
    bus.on("scene:loaded",  () => { history.clear(); syncHistory(); });

    const preview = new PreviewController(bus, world, scene, zones, movers);
    previewRef.current = preview;
    const audio = new AudioSystem(bus, world, scene);
    const input     = new InputManager(canvas, scene.camera, bus, scene.scene, level => {
      const zone = world.activeZoneId ? world.zones.get(world.activeZoneId) : null;
      return levelElevation(zone, level);
    });
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
    const brushSetEditor     = new BrushSetEditor(scene.scene, world, bus, scene.camera, canvas);
    const softFalloff        = new SoftFalloffController(scene.scene, bus);
    const brushRounds        = new BrushRoundController(world, bus);
    const brushHoles         = new BrushHoleController(scene.scene, world, bus, scene.camera, canvas);
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
    new AiRangeRings(scene.scene, bus, world);   // Enemy AI screen's SHOW RANGES viewport rings (Phase 63)
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
    // enemyAI is constructed AFTER the sync install call — the ref defers the read.
    const enemyAIRef: { current: EnemyAI | null } = { current: null };
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
      g.__physics = physicsWorld;         // raw Rapier world for harness ray/collider probes
      g.__buildStamp = __BUILD_STAMP__;   // which bundle is this window running?
      g.__enemyAI = enemyAIRef.current;   // Phase 61 (set below; read-only debugging)
      g.__audio = audio;
      g.__copyPaste = { copySelection, pasteClipboard };
      Object.defineProperty(g, "__characterStage", { configurable: true, get: () => characterStageRef.current });   // Phase 86 (dev)
      g.__bindings = { load: loadBindings, save: saveBindings, reset: resetBindings, defaults: DEFAULT_BINDINGS };
      armTransformWatchdog();   // Phase 62: warn when two systems co-drive one entity's transform
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
    brushSetEditor.init();
    softFalloff.init();
    brushRounds.init();
    brushHoles.init();
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
      if (inIsolatedEdit()) return;
      if (!worldRef.current || restoringRef.current) return;
      const json = JSON.stringify(worldRef.current.toJSON());
      // Only write when THIS tab changed the world since load (content-compared, so
      // console/test-driven mutations count too). A tab that never edited must never
      // write: a dormant tab's 60s tick / closing beforeunload would otherwise clobber
      // newer autosaves from other tabs with its stale state (lost real edits twice).
      if (json === autosaveBaselineRef.current) return;
      const proj = projectRef.current;
      // The world + its undo history in one payload (see HISTORY_KEY).
      const h = history.capture();
      const withHistory = h.undo.length || h.redo.length
        ? JSON.stringify({ ...JSON.parse(json), [HISTORY_KEY]: { v: HISTORY_VERSION, ...h } satisfies StoredHistory })
        : undefined;
      const ts = storeAutosave(json, { projectId: proj?.store.id ?? null, sceneId: proj?.sceneId ?? null }, withHistory);
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
      let restoredHistory: StoredHistory | null = null;

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
            const { world: savedWorld, history: savedHistory } = splitAutosave(saved.json);
            await handleLoadFromJSON(savedWorld);
            restored = true;
            restoredHistory = savedHistory;
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
          world.gameCharacters = store.game.characters;   // Phase 86
          setCharacters(store.game.characters ?? []);
          world.gameStateSchema = store.game.stateSchema;
          world.gameUiElements  = store.game.uiElements;
          world.gameScripts     = store.game.scripts;
          world.gameInput  = store.game.input;
          world.gameId     = store.id;
          setUiGameButtons(store.game.input);
          setWorldItems(store.game.items ?? []);
          setWorldUiElements(store.game.uiElements ?? []);
          setGameSchema(store.game.stateSchema ?? {});
          setGameScripts(store.game.scripts ?? []);
          if (promoteSessionPrefabs(store.game)) setIsDirty(true);
          world.prefabLibrary = store.game.prefabs;
          setPrefabs(store.game.prefabs ?? []);
          syncPrefabInstances();   // library is authoritative now — heal/refresh instances
          await seedAndApplyGameDefaults(store, sceneId);
        }
      } catch (e) { console.warn('Project restore failed:', e); }

      // Undo history survives a reload (v4.99.4): only when the world came from that
      // same autosave, and last, after every load path above has cleared history.
      if (restored && restoredHistory) {
        history.restore({ undo: restoredHistory.undo, redo: restoredHistory.redo });
        syncHistory();
      }
    })();

    // Movers BEFORE the physics step — setNextKinematicTranslation targets must
    // be fresh when the step consumes them (Phase 31)
    scene.onUpdate(dt => movers.update(dt));
    // Enemy AI between movers and the step for the same reason (Phase 61)
    const enemyAI = new EnemyAI(world, bus, movers, objectPlacer, preview, scriptEngine);
    enemyAI.init();
    setPlayerMotionProvider(() => preview.playerMotion);   // player_falling condition
    setLivePositionProvider(id => objectPlacer.getLivePosition(id));   // launch_player "away" frame
    enemyAIRef.current = enemyAI;
    // vite-DEV installed globals before this line existed — patch it in.
    const gAny = window as unknown as Record<string, unknown>;
    if (gAny["__world"]) gAny["__enemyAI"] = enemyAI;
    scene.onUpdate(dt => enemyAI.update(dt));
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
        scriptEngine.loadGame(world.gameScripts);   // Phase 77
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
        // v4.90.1 — the level-start trigger. The runtime's SceneRouter fires on_level_load on
        // every scene entry; the editor relied on `zone:enter`, which only the vestigial
        // multi-zone transition system emits (every scene has one zone), so in editor
        // preview on_level_load NEVER fired (user report: a GAME-scope "store checkpoint on
        // level start" script worked in the Play window and not in preview). Fired here,
        // after the player has spawned and the state schema is applied, so a
        // store_position(player) reads the spawn pose, exactly as in the runtime.
        if (world.activeZoneId) scriptEngine.fire("on_level_load", world.activeZoneId);
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
        const snapRec = routeReturnSnapshotRef.current;
        routeReturnSnapshotRef.current = null;
        // Restore when we hopped away — even back to the SAME scene id (a round
        // trip still reloaded from disk mid-route, so the snapshot is the truth).
        if (back && (snapRec || back !== projectRef.current?.sceneId)) {
          void (async () => {
            const proj = projectRef.current;
            if (!proj) return;
            try {
              // Prefer the first-hop snapshot (unsaved edits + history); the disk
              // file remains the fallback if the snapshot is somehow missing.
              const file = snapRec?.snap ?? await proj.store.loadScene(back);
              await handleLoadFromJSON(file);
              worldRef.current!.gameItems       = proj.store.game.items;
              worldRef.current!.gameCharacters = proj.store.game.characters;   // Phase 86
              setCharacters(proj.store.game.characters ?? []);
              worldRef.current!.gameStateSchema = proj.store.game.stateSchema;
              worldRef.current!.gameUiElements  = proj.store.game.uiElements;
              worldRef.current!.gameScripts     = proj.store.game.scripts;
              worldRef.current!.gameInput  = proj.store.game.input;
              worldRef.current!.gameId     = proj.store.id;
              setUiGameButtons(proj.store.game.input);
              const next = { ...proj, sceneId: back };
              projectRef.current = next; setProject(next);
              void persistLastProject(proj.store.id, back);
              if (snapRec) {
                // world:loaded (inside handleLoadFromJSON) cleared the stacks — put them back.
                if (snapRec.history) historyRef.current?.restore(snapRec.history);
                setIsDirty(true);   // the snapshot may carry unsaved edits — keep Save armed
              }
            } catch (e) { console.error("[preview] restore editing scene failed:", e); }
          })();
        }
      }),
      // load_scene during editor PREVIEW (project mode only): route to another of the
      // project's scenes the way the runtime shell does, but non-destructively. Outside
      // preview, or with no project open, this stays the deliberate no-op (runtime parity).
      bus.on("scene:load-request", ({ sceneId, fadeColor, fadeDuration }) => {
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
          // Snapshot the LIVE world + undo stacks on the first hop (v4.79.67):
          // returning must restore unsaved edits and history — the on-disk file
          // silently discarded both (user report 2026-09-02).
          if (!routeReturnSnapshotRef.current) {
            const snap = worldRef.current!.toJSON() as SceneFile;
            const pose = sceneRef.current?.editorCamera?.getPose();
            if (snap.metadata && pose) snap.metadata.editorCamera = pose;
            routeReturnSnapshotRef.current = { snap, history: historyRef.current?.capture() ?? null };
          }
          try {
            // Fade-through (v4.79.65) — same configurable fade as the runtime
            // SceneRouter; the fade-in HOLDS until the arrival fade-out below.
            // WAIT for it to complete before teardown (v4.79.66): the rebuild
            // blocks the main thread, so starting it immediately would swallow
            // the CSS transition and the hop would read as a hard cut.
            bus.emit("overlay:fade-in", { color: fadeColor ?? "#000000", duration: fadeDuration ?? 0.3 });
            await new Promise(r => setTimeout(r, (fadeDuration ?? 0.3) * 1000 + 50));
            const fired = scriptEngine.getFiredOneShots();     // survive the hop (don't re-fire cross-scene one-shots)
            preview.exit();                                    // remove character (fires the guarded preview:stop)
            const file = await proj.store.loadScene(sceneId);
            await handleLoadFromJSON(file);                    // teardown zones + rebuild world/physics (no save)
            const world = worldRef.current!;
            world.gameItems       = proj.store.game.items;
            world.gameCharacters = proj.store.game.characters;   // Phase 86
            setCharacters(proj.store.game.characters ?? []);
            world.gameStateSchema = proj.store.game.stateSchema;
            world.gameUiElements  = proj.store.game.uiElements;
      world.gameScripts     = proj.store.game.scripts;
            world.gameScripts     = proj.store.game.scripts;
            world.gameInput  = proj.store.game.input;
            world.gameId     = proj.store.id;
            setUiGameButtons(proj.store.game.input);
            // Keep proj.sceneId in lockstep with the loaded world so any save targets the right file.
            const next = { ...projectRef.current!, sceneId };
            projectRef.current = next; setProject(next);
            preview.enter(mode);                               // respawn at the new scene's defaultSpawn (fires preview:start → re-index + activate)
            scriptEngine.restoreFiredOneShots(fired);          // after activate(), which clears the set
            bus.emit("overlay:fade-out", { duration: fadeDuration ?? 0.3 });
          } catch (e) {
            console.error(`[preview] load_scene "${sceneId}" failed:`, e);
            bus.emit("overlay:fade-out", { duration: 0 });     // don't strand the black overlay
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
      // Phase 80: SELECT LOOP / SELECT RING → vertex mode with those corners selected.
      // tool:select first (it clears sub-selection), then the set.
      bus.on("shape:select-vertex-set", ({ zoneId, shapeId, verts }) => {
        setActiveTool("select-vertex");
        bus.emit("tool:select", { tool: "select-vertex" });
        bus.emit("shape:sub-select", { zoneId, shapeId, faceIndex: null, vertexIndex: verts[verts.length - 1] ?? null, vertexSet: verts });
      }),
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
        scriptEngine.loadGame(world.gameScripts);   // Phase 77
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
      brushSetEditor.dispose();
      softFalloff.dispose();
      brushRounds.dispose();
      brushHoles.dispose();
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

  /** The floor menu's rows: every level something sits on (plus G), with what's
   *  there and its height. Read when the menu opens, so it needs no live sync. */
  const getFloorSummaries = (): FloorSummary[] => {
    const world = worldRef.current;
    const zone = world?.activeZoneId ? world.zones.get(world.activeZoneId) : null;
    const counts = new Map<number, Map<string, number>>([[0, new Map()]]);
    const add = (level: number | undefined, kind: string): void => {
      const l = level ?? 0;
      if (!counts.has(l)) counts.set(l, new Map());
      const m = counts.get(l)!;
      m.set(kind, (m.get(kind) ?? 0) + 1);
    };
    for (const w of zone?.walls ?? [])     add(w.floor, "wall");
    for (const f of zone?.floors ?? [])    add(f.level, "floor");
    for (const p of zone?.platforms ?? []) add(p.floorLevel, "platform");
    for (const s of zone?.shapes ?? [])    add(s.floorLevel, "shape");
    for (const l of zone?.ladders ?? [])   add(l.floorLevel, "ladder");
    for (const o of zone?.objects ?? [])   add(o.floor, "object");
    return [...counts].map(([level, m]) => ({
      level,
      contents: [...m].map(([kind, n]) => `${n} ${kind}${n > 1 ? "s" : ""}`).join(" · "),
      elevation: levelElevation(zone, level),
    }));
  };

  const handleQualityChange = (q: QualityScale): void => {
    setQuality(q);
    localStorage.setItem('editorQuality', q);
    assetManager.setQuality(q);
    busRef.current.emit('quality:changed', { quality: q });
  };

  const handleTogglePerfCounter = (): void =>
    setShowPerfCounter(v => { localStorage.setItem('editorShowPerf', v ? '0' : '1'); return !v; });

  const handleToggleJumpStats = (): void =>
    setShowJumpStats(v => { localStorage.setItem('editorShowJumpStats', v ? '0' : '1'); return !v; });

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
        // Ghost sweep: a record whose members are ALL gone is dead weight — it
        // inflates the library's instance badge and blocks prefab deletion.
        // Live deletion prunes these since v4.79.25; this catches records that
        // predate the fix. Safe here: entities and records load from the same
        // scene parse, so an empty member set means genuinely deleted, not
        // not-yet-loaded (and restoringRef above guards the boot window).
        if (collectInstanceMembers(world, zone.id, rec.id).size === 0) {
          world.removePrefabInstance(zone.id, rec.id);
          setIsDirty(true);
          console.info(`[prefabs] swept empty instance record ${rec.id} (${rec.prefabId}) — members all deleted`);
          continue;
        }
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
    worldRef.current?.setGamePlayerSettings(undefined);   // Phase 68 — no project, no game layer
    worldRef.current?.setGameLighting(undefined);
    worldRef.current?.setGameAudioMix(undefined);
    if (inIsolatedEdit()) return;   // no project close under prefab/brush edit mode
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
      worldRef.current.gameScripts    = undefined;
      worldRef.current.gameInput = undefined;
      worldRef.current.gameId    = undefined;
      worldRef.current.prefabLibrary = loadSessionPrefabs();
      setPrefabs(worldRef.current.prefabLibrary);
      worldRef.current.gameCharacters = undefined;
    }
    setCharacters([]);
    setGameSchema({});
    setGameScripts([]);
    void clearLastProject();
  }, [canOverwriteScene]);

  const handleLoad = useCallback((json: unknown): void => {
    void closeProject().then(() => handleLoadFromJSON(json));
  }, [handleLoadFromJSON, closeProject]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (editingBrushRef.current) { brushSaveRef.current?.(); return; }   // Cmd+S = save the brush, stay in
    if (editingCharacterRef.current) { characterSaveRef.current?.(); return; }   // …or the character
    if (inIsolatedEdit()) return;   // prefab edit mode: Save lives in the amber bar
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
      // Phase 68 — a new scene INHERITS: empty settings-override layer, lighting from the game.
      playerSettings: {} as PlayerSettings,
      lightingFromGame: true,
      // v4.89.0 — a new scene registers NO state of its own: it inherits the game's shared
      // keys (STATE tab, GAME scope). Seeding DEFAULT_STATE_SCHEMA here planted an unused
      // `health` key in every new level while the game's real counter (`Hearts`) stayed
      // scene-local to level 1. The engine's preview/runtime fallback to DEFAULT_STATE_SCHEMA
      // still applies when a game has no shared keys either.
      stateSchema: {},
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
      worldRef.current.gameCharacters = store.game.characters;   // Phase 86
      setCharacters(store.game.characters ?? []);
      worldRef.current.gameStateSchema = store.game.stateSchema;
      worldRef.current.gameUiElements  = store.game.uiElements;
      worldRef.current.gameScripts     = store.game.scripts;
      worldRef.current.gameInput  = store.game.input;
      worldRef.current.gameId     = store.id;
      setUiGameButtons(store.game.input);
      worldRef.current.prefabLibrary   = store.game.prefabs;
    }
    // Phase 68 — seed game-wide player settings on first contact: the game
    // should keep feeling like its ENTRY scene, so that scene's settings
    // become the defaults (fetched if it isn't the one being adopted).
    void seedAndApplyGameDefaults(store, sceneId);
    setWorldItems(store.game.items ?? []);
    setWorldUiElements(store.game.uiElements ?? []);
    setGameSchema(store.game.stateSchema ?? {});
          setGameScripts(store.game.scripts ?? []);
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
    if (inIsolatedEdit()) return;   // no scene switches under prefab/brush edit mode
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
      world.gameCharacters = proj.store.game.characters;   // Phase 86
      setCharacters(proj.store.game.characters ?? []);
      world.gameStateSchema = proj.store.game.stateSchema;
      world.gameUiElements  = proj.store.game.uiElements;
      world.gameScripts     = proj.store.game.scripts;
      world.gameInput  = proj.store.game.input;
      world.gameId     = proj.store.id;
      setUiGameButtons(proj.store.game.input);
      world.setGamePlayerSettings(proj.store.game.playerSettings);
      world.setGameLighting(proj.store.game.lighting);
      world.setGameAudioMix(proj.store.game.audio?.mix);
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
    if (inIsolatedEdit()) return;
    previewRef.current?.enter("preview");
  }, []);

  const handleNewGame = useCallback((): void => {
    if (inIsolatedEdit()) return;
    previewRef.current?.enter("game", { resume: false });
    scriptEngineRef.current?.onGameStart();
  }, []);

  const handleContinue = useCallback((): void => {
    if (inIsolatedEdit()) return;
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
      // Phase 68 — scene-scope edits land in the scene's override layer and the
      // resolved view together (fresh object either way, so the panel updates).
      world.updateScenePlayerSettings(changes);
    });
    syncHistory();
    // syncHistory() no-ops once undo/dirty are already set, so force a re-render
    // for the spawn settings panel.
    setPlayerSettingsRev(v => v + 1);
  }, [syncHistory]);

  /** Phase 68 — first contact with a project seeds every missing game default
   *  from the ENTRY scene (the game should keep feeling like it), then hands
   *  the layers to the world. Shared by adopt + the boot-restore path. */
  const seedAndApplyGameDefaults = useCallback(async (store: ProjectStore, sceneId: string): Promise<void> => {
    const world = worldRef.current;
    try {
      let write = false;
      const entryWorld = async () => sceneId === store.entryScene
        ? world?.world
        : (await store.loadScene(store.entryScene)).world;
      if (!store.game.playerSettings) {
        store.game.playerSettings = { ...DEFAULT_PLAYER_SETTINGS, ...(await entryWorld())?.playerSettings };
        write = true;
      }
      if (!store.game.lighting) {
        const w = await entryWorld();
        if (w) {
          store.game.lighting = {
            ambientLight: { ...w.ambientLight }, sunLight: { ...w.sunLight },
            envIntensity: w.envIntensity, skybox: w.skybox, fogColor: w.fogColor, fogDensity: w.fogDensity,
          };
          write = true;
        }
      }
      if (!store.game.audio?.mix) {
        const w = await entryWorld();
        store.game.audio = { mix: { master: 1, music: 1, sfx: 1, ambient: 1, ...w?.audio?.mix } };
        write = true;
      }
      if (write) await store.writeGame();
    } catch (e) { console.warn("[settings] seeding game defaults failed:", e); }
    world?.setGamePlayerSettings(store.game.playerSettings);
    world?.setGameLighting(store.game.lighting);
    world?.setGameAudioMix(store.game.audio?.mix);
    setPlayerSettingsRev(v => v + 1);
  }, []);

  // Phase 68 Part 2 — lighting / mixer inherit + promote.
  const handleInheritLighting = useCallback((): void => {
    worldRef.current?.inheritLighting(); setIsDirty(true); setPlayerSettingsRev(v => v + 1);
  }, []);
  const handlePromoteLighting = useCallback((): void => {
    const world = worldRef.current, proj = projectRef.current;
    if (!world || !proj) return;
    proj.store.game.lighting = world.promoteLightingToGame();
    void proj.store.writeGame().catch(e => console.warn("[settings] game.json write failed:", e));
    setIsDirty(true); setPlayerSettingsRev(v => v + 1);
  }, []);
  const handleInheritAudioMix = useCallback((): void => {
    worldRef.current?.inheritAudioMix(); setIsDirty(true); setPlayerSettingsRev(v => v + 1);
  }, []);
  const handlePromoteAudioMix = useCallback((): void => {
    const world = worldRef.current, proj = projectRef.current;
    if (!world || !proj) return;
    proj.store.game.audio = { ...proj.store.game.audio, mix: world.promoteAudioMixToGame() };
    void proj.store.writeGame().catch(e => console.warn("[settings] game.json write failed:", e));
    setIsDirty(true); setPlayerSettingsRev(v => v + 1);
  }, []);

  // Phase 68 — game-scope settings edits (game.json defaults) + page overrides.
  const handleGamePlayerSettingsChange = useCallback((changes: Partial<PlayerSettings>): void => {
    const world = worldRef.current, proj = projectRef.current;
    if (!world || !proj) return;
    const next = { ...resolvePlayerSettings(world.gamePlayerSettings, {}), ...changes };
    proj.store.game.playerSettings = next;
    void proj.store.writeGame().catch(e => console.warn("[settings] game.json write failed:", e));
    world.setGamePlayerSettings(next);
    setPlayerSettingsRev(v => v + 1);
  }, []);

  const handleSettingsPageOverride = useCallback((page: SettingsPage, on: boolean): void => {
    const world = worldRef.current;
    if (!world) return;
    world.transaction(on ? "override player settings page" : "use game defaults", () => {
      world.setSettingsPageOverride(page, on);
    });
    syncHistory();
    setPlayerSettingsRev(v => v + 1);
  }, [syncHistory]);

  const handlePromoteSettingsToGame = useCallback((): void => {
    const world = worldRef.current, proj = projectRef.current;
    if (!world || !proj) return;
    const resolved = world.promoteSettingsToGame();
    proj.store.game.playerSettings = resolved;
    void proj.store.writeGame().catch(e => console.warn("[settings] game.json write failed:", e));
    setIsDirty(true);   // the scene's override layer changed too
    setPlayerSettingsRev(v => v + 1);
  }, []);

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
    // Glide to it (targets only, like handleInstanceGoTo), pulling in to 8 m so a light
    // inside a room isn't framed from outside its walls.
    const cam = sceneRef.current?.editorCamera;
    if (cam) {
      cam.targetFocus.set(l.position.x, l.position.y, l.position.z);
      cam.targetSpherical.radius = Math.min(cam.targetSpherical.radius, 8);
    }
  }, []);

  const handleWorldLightingChange = useCallback((changes: { ambient?: Partial<{ color: string; intensity: number }>; sun?: Partial<{ color: string; intensity: number }>; envIntensity?: number; quality?: "fancy" | "fast" }): void => {
    const world = worldRef.current;
    if (!world) return;
    // Emits world:lighting → SceneManager applies it and the bus listener syncs panel state.
    // One undo step per edit; repeats of the same field (a color drag, typed digits) merge.
    const fields = Object.entries(changes).flatMap(([k, v]) => v && typeof v === "object" ? Object.keys(v).map(f => `${k}.${f}`) : [k]);
    world.transaction("edit world light", () => world.updateWorldLighting(changes), `world-light:${fields.join(",")}`);
    setIsDirty(true);
    syncHistory();
  }, [syncHistory]);

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
      busRef.current.emit("selection:check-sub", {});   // v4.104.1: picks on a renumbered brush
    }
    // Leave a placement tool, but keep a select sub-mode (face/vertex/edge):
    // undoing brush edits must not kick the user back to object mode.
    if (!isSelectMode(activeToolRef.current)) {
      setActiveTool("select");
      busRef.current.emit("tool:select", { tool: "select" });
    }
    syncHistory();
  }, [syncHistory]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleRedo = useCallback((): void => {
    const ctx = undoInstanceCtxRef.current;
    if (ctx) {
      withInstanceReselect(ctx.zoneId, ctx.instanceId, ctx.primaryId, () => historyRef.current?.redo());
    } else {
      historyRef.current?.redo();
      busRef.current.emit("selection:check-sub", {});   // v4.104.1: picks on a renumbered brush
    }
    // Leave a placement tool, but keep a select sub-mode (face/vertex/edge):
    // undoing brush edits must not kick the user back to object mode.
    if (!isSelectMode(activeToolRef.current)) {
      setActiveTool("select");
      busRef.current.emit("tool:select", { tool: "select" });
    }
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

  // Prefab-instance stamps of the entities about to be removed, read BEFORE removal
  // (refs carry no data). zoneId → instanceIds, since records are per-zone.
  const collectInstanceStamps = (world: WorldState, refs: SelectedRef[]): Map<string, Set<string>> => {
    const stamps = new Map<string, Set<string>>();
    for (const ref of refs) {
      const zone = world.zones.get(ref.zoneId);
      if (!zone) continue;
      const ent =
        ref.type === "object"         ? zone.objects.find(e => e.id === ref.id) :
        ref.type === "trigger-volume" ? zone.triggerVolumes?.find(e => e.id === ref.id) :
        ref.type === "shape"          ? zone.shapes?.find(e => e.id === ref.id) :
        ref.type === "stair"          ? zone.stairs?.find(e => e.id === ref.id) :
        ref.type === "ladder"         ? zone.ladders?.find(e => e.id === ref.id) :
        ref.type === "checkpoint"     ? zone.checkpoints?.find(e => e.id === ref.id) :
        ref.type === "light"          ? zone.lights?.find(e => e.id === ref.id) : undefined;
      const instId = (ent as { prefab?: { instanceId?: string } } | undefined)?.prefab?.instanceId;
      if (!instId) continue;
      if (!stamps.has(ref.zoneId)) stamps.set(ref.zoneId, new Set());
      stamps.get(ref.zoneId)!.add(instId);
    }
    return stamps;
  };

  // After removal, still inside the SAME transaction (records are journaled, so one
  // undo restores members + record atomically): an instance whose last member just
  // died takes its record with it — otherwise a ghost record keeps counting toward
  // the prefab's instance badge forever and blocks deleting the prefab.
  const pruneEmptyInstances = (world: WorldState, stamps: Map<string, Set<string>>): void => {
    for (const [zoneId, instanceIds] of stamps) {
      for (const instanceId of instanceIds) {
        if (collectInstanceMembers(world, zoneId, instanceId).size === 0) {
          world.removePrefabInstance(zoneId, instanceId);
        }
      }
    }
  };

  // Delete an arbitrary ref set in one transaction (no per-entity script prompt).
  // Shared by multi-select delete and group "Delete all members".
  const deleteRefs = useCallback((refs: SelectedRef[]): void => {
    const world = worldRef.current;
    if (!world || refs.length === 0) return;
    const zoneId = refs[0].zoneId;
    const nodesToRemove = new Set<string>();
    world.transaction(`delete ${refs.length} item${refs.length > 1 ? "s" : ""}`, () => {
      const stamps = collectInstanceStamps(world, refs);
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
      pruneEmptyInstances(world, stamps);
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

  /** Copy the selected run onto each of `levels` (Actions page, COPY TO FLOORS) as
   *  one undo step. Every copy's corners join the source's link group. */
  const handleCopyRunToFloors = (levels: number[]): void => {
    const world = worldRef.current;
    if (!selected || selected.type !== "wall" || !world) return;
    const walls = selected.runWalls ?? (selected.data ? [selected.data as WallDef] : []);
    if (walls.length === 0) return;
    const zone = world.zones.get(selected.zoneId);
    if (!zone) return;
    const wallHeight = (selected.data as WallDef)?.height ?? 3.0;
    worldRef.current?.beginTransaction(levels.length > 1 ? `copy walls to ${levels.length} floors` : "copy walls to floor");
    for (const targetLevel of levels) {
      const targetElevation =
        zone.floors.find(f => f.level === targetLevel)?.elevation ?? targetLevel * wallHeight;
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
    // Read the prefab stamp before removal; prune the record before commit if this
    // was the instance's last member. (The script-prompt early-returns abort the
    // transaction and defer to handleDeleteConfirm, which prunes on its own.)
    const stamps = collectInstanceStamps(world, [{ id, type, zoneId } as SelectedRef]);
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
    pruneEmptyInstances(world, stamps);
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
      // v4.105.0: in edge mode with edges picked, Delete dissolves them (not the brush).
      const sel = selectedRef.current;
      const edges = sel?.type === "shape" ? (sel.edgeSet ?? (sel.edgeVerts ? [sel.edgeVerts] : [])) : [];
      if (activeToolRef.current === "select-edge" && sel && edges.length) {
        busRef.current.emit("shape:dissolve-edges", { zoneId: sel.zoneId, shapeId: sel.id, edges });
        return;
      }
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
        tags:        single ? (defs[0]!.tags ?? []) : [],
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
    // Same tag merge semantics as the model edit: single replaces, bulk unions in.
    const resolveTags = (m: MaterialDef): string[] =>
      patch.tagsAdd ? [...new Set([...(m.tags ?? []), ...patch.tagsAdd])]
                    : (patch.tags ?? m.tags ?? []);
    try {
      await updateEntries<MaterialDef>("textures", pending.ids, m => ({ ...patchEntry(m, patch), tags: resolveTags(m) }));
    } catch (err) { console.error("material edit failed:", err); return; }
    pending.ids.forEach(id => {
      const def = assetManager.getMaterialList().find(m => m.id === id);
      if (!def) return;
      const { tagsAdd: _drop, ...rest } = patch;
      assetManager.updateMaterial(id, { ...rest, tags: resolveTags(def) } as Partial<MaterialDef>);
    });
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

  // Phase 77 — game-wide scripts (LEVEL tab, GAME scope). Written through to game.json at
  // once like the other game-level registries; the script index picks them up at the next
  // preview start / scene switch (the same rebuild sites zone scripts use).
  const handleGameScriptsChange = (scripts: ScriptDef[]): void => {
    const proj = projectRef.current, world = worldRef.current;
    if (!proj || !world) return;
    const normalized = scripts.length ? scripts : undefined;
    proj.store.game.scripts = normalized;
    world.gameScripts = normalized;
    setGameScripts(scripts);
    void proj.store.writeGame().catch(e => console.warn("[scripts] game.json write failed:", e));
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
  /** v4.79.68 — one-click press-prompt: a "Press E" Label element + On Enter
   *  show_ui / On Exit hide_ui scripts on the entity; objects also get hide_ui
   *  prepended to their on_interact script so the prompt vanishes when used. */
  const handleAddPressPrompt = (target: { id: string; zoneId: string; kind: "volume" | "object" }): void => {
    const world = worldRef.current;
    const zone = world?.zones.get(target.zoneId);
    if (!world || !zone) return;
    const ent = target.kind === "volume"
      ? zone.triggerVolumes?.find(v => v.id === target.id)
      : zone.objects.find(o => o.id === target.id);
    if (!ent) return;
    const entLabel = (ent as { label?: string }).label || target.id.slice(0, 8);
    const el: UiElementDef = {
      id: `ui_${crypto.randomUUID().slice(0, 8)}`,
      label: `Prompt — ${entLabel}`,
      kind: "label", text: "Press {interact}",
      anchor: "bottom-center", backdrop: true,
    };
    handleUiElementsChange([...(worldUiElements ?? []), el]);
    const mk = (type: "on_player_enter" | "on_player_exit" | "on_interact", label: string, actions: ScriptAction[]): ScriptDef => ({
      id: `scr_${crypto.randomUUID().slice(0, 8)}`,
      label, zoneId: target.zoneId, enabled: true,
      trigger: { type }, conditions: [], actions, oneShot: false,
    });
    const scripts = (ent.scripts ?? []).map(sc => structuredClone(sc));
    if (target.kind === "object") {
      const it = scripts.find(sc => sc.trigger.type === "on_interact");
      if (it) it.actions = [{ type: "hide_ui", uiElementId: el.id } as ScriptAction, ...it.actions];
    }
    scripts.push(
      mk("on_player_enter", "Show Prompt", [{ type: "show_ui", uiElementId: el.id } as ScriptAction]),
      mk("on_player_exit",  "Hide Prompt", [{ type: "hide_ui", uiElementId: el.id } as ScriptAction]),
    );
    // v4.79.76 — volumes hear the interact press themselves now: the third script
    // IS "what press-E does" (seeded with hide-prompt; author adds the rest).
    if (target.kind === "volume") {
      scripts.push(mk("on_interact", "On Press (interact)", [{ type: "hide_ui", uiElementId: el.id } as ScriptAction]));
    }
    world.transaction("add press prompt", () => {
      if (target.kind === "volume") world.updateTriggerVolume(target.zoneId, target.id, { scripts });
      else world.updateObject(target.zoneId, target.id, { scripts });
    });
    syncHistory();
    setIsDirty(true);
  };

  /** v4.79.78 — per-game interact binding (GAME INPUT section). Immediate
   *  game.json write (registry precedent); a device/player rebind still wins. */
  const handleGameInputChange = (input: GameConfig["input"]): void => {
    const proj = projectRef.current;
    if (!proj) return;
    proj.store.game.input = input;
    void proj.store.writeGame().catch(e => console.warn("[input] game.json write failed:", e));
    if (worldRef.current) worldRef.current.gameInput = input;
    setUiGameButtons(input);
    setGameInputRev(v => v + 1);
    setIsDirty(true);
  };

  const handleUiElementsChange = (uiElements: UiElementDef[]): void => {
    const world = worldRef.current;
    const proj = projectRef.current;
    if (proj) {
      // Project mode needs no world.world — the old shared guard silently
      // swallowed registry writes when it was transiently null, leaving scripts
      // pointing at an element that was never stored (v4.79.70).
      proj.store.game.uiElements = uiElements;
      // Write game.json IMMEDIATELY (prefab-library precedent) — a dirty-only
      // registry evaporates on reload while the scene's scripts survive,
      // stranding show_ui actions on "(custom)" dangling ids.
      void proj.store.writeGame().catch(e => console.warn("[ui] game.json write failed:", e));
      if (world) world.gameUiElements = uiElements;
      setWorldUiElements(uiElements);
      setIsDirty(true);
      return;
    }
    if (!world?.world) return;
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

  // ── Phase 86: characters (game.json `characters`, like prefabs) ───────────────

  const applyCharacters = (next: CharacterDef[]): void => {
    const world = worldRef.current, proj = projectRef.current;
    if (proj) {
      proj.store.game.characters = next;
      // Written at once, like prefabs: the player / enemies refer to characters by id.
      void proj.store.writeGame().catch(e => console.warn("[characters] game.json write failed:", e));
    }
    if (world) world.gameCharacters = next;
    setCharacters(next);
  };
  const setPlayerCharacter = (id: string | null): void => {
    if (projectRef.current) handleGamePlayerSettingsChange({ characterId: id });
    else handlePlayerSettingsChange({ characterId: id });
  };
  const newCharacterId = (): string => `chr_${crypto.randomUUID().slice(0, 8)}`;
  const handleCharacterNew = (modelAssetId: string): void => {
    const a = assets.find(x => x.id === modelAssetId);
    const fill = autoFillMoves(a?.animations ?? []);
    const moves = Object.fromEntries(Object.entries(fill).filter(([, c]) => c).map(([m, c]) => [m, { clip: c }]));
    const def: CharacterDef = { id: newCharacterId(), name: a?.label ?? modelAssetId, modelAssetId, clipSources: [], moves };
    applyCharacters([...characters, def]);
    openCharacterEditor(def);
  };
  /** SAVE AS A CHARACTER (the player's Character page): the MODEL + ANIMATIONS settings on
   *  that page as a new character. Same clips, no KEEP IN PLACE, so it plays the same; the
   *  page then selects it in its CHARACTER menu (in its own game / scene scope). */
  const characterFromSettings = (settings: PlayerSettings): string | null => {
    if (!settings.modelAssetId) return null;
    const a = assets.find(x => x.id === settings.modelAssetId);
    const legacy = legacyCharacter(settings, a?.animations ?? []);
    const def: CharacterDef = { ...legacy, id: newCharacterId(), name: a?.label ?? "Player",
      moves: Object.fromEntries(Object.entries(legacy.moves).filter(([, m]) => m.clip)) };
    applyCharacters([...characters, def]);
    return def.id;
  };
  setUiCharacterActions({ fromSettings: characterFromSettings });
  /** PLACE: the object tool, armed with the character's model; clicks place it (Esc stops). */
  const handleCharacterPlace = (id: string): void => {
    const c = characters.find(x => x.id === id);
    if (!c || inIsolatedEdit() || isPreview) return;
    setActiveTool("object");
    busRef.current.emit("tool:select", { tool: "object" });
    busRef.current.emit("asset:selected", { assetId: c.modelAssetId, characterId: c.id });
  };
  const handleCharacterDuplicate = (id: string): void => {
    const c = characters.find(x => x.id === id);
    if (c) applyCharacters([...characters, { ...structuredClone(c), id: newCharacterId(), name: `${c.name} copy` }]);
  };
  const handleCharacterDelete = (id: string): void => {
    if (worldRef.current?.world?.playerSettings?.characterId === id) setPlayerCharacter(null);
    applyCharacters(characters.filter(x => x.id !== id));
  };

  const openCharacterEditor = (def: CharacterDef): void => {
    const scene = sceneRef.current, world = worldRef.current, zones = zonesRef.current;
    if (!scene || !world || !zones || inIsolatedEdit() || isPreview) return;
    editingCharacterRef.current = true;
    busRef.current.emit("object:deselected", {});
    setSelected(null);
    setLeftPanel(null);
    const stage = new CharacterStage(scene, world, zones, effectiveCharacterScale(world.world?.playerSettings ?? DEFAULT_PLAYER_SETTINGS));
    characterStageRef.current = stage;
    setCharacterConfirmClose(false);
    setEditingCharacter({ draft: structuredClone(def), saved: JSON.stringify(def) });
    void stage.enter(structuredClone(def));
  };
  const editingCharacterNow = useRef(editingCharacter);
  editingCharacterNow.current = editingCharacter;
  const handleCharacterDraft = (next: CharacterDef): void => {
    setEditingCharacter(e => e && { ...e, draft: next });
    void characterStageRef.current?.update(next);
  };
  const handleCharacterSave = (): void => {
    const e = editingCharacterNow.current;
    if (!e) return;
    const def = structuredClone(e.draft);
    applyCharacters(characters.some(c => c.id === def.id) ? characters.map(c => c.id === def.id ? def : c) : [...characters, def]);
    setEditingCharacter({ draft: e.draft, saved: JSON.stringify(e.draft) });
    setCharacterConfirmClose(false);
  };
  characterSaveRef.current = handleCharacterSave;
  const handleCharacterTryIt = (): void => {
    const e = editingCharacterNow.current;
    if (!e || characterTryRef.current) return;
    const stage = characterStageRef.current;
    characterStageRef.current = null;
    characterTryRef.current = structuredClone(e.draft);
    setCharacterTrying(true);
    void (async () => {
      await stage?.exit();                               // the level comes back
      previewRef.current?.enter("preview", { character: characterTryRef.current!, atSpawn: true });
    })();
  };
  // Back from TRY IT: the editor reopens on the same (still unsaved) draft.
  useEffect(() => busRef.current.on("preview:stop", () => {
    const draft = characterTryRef.current;
    if (!draft) return;
    characterTryRef.current = null;
    const scene = sceneRef.current, world = worldRef.current, zones = zonesRef.current;
    if (!scene || !world || !zones) return;
    window.setTimeout(() => {
      const stage = new CharacterStage(scene, world, zones, effectiveCharacterScale(world.world?.playerSettings ?? DEFAULT_PLAYER_SETTINGS));
      characterStageRef.current = stage;
      setCharacterTrying(false);
      void stage.enter(structuredClone(draft));
    }, 0);
  }), []);
  const handleCharacterClose = (discard = false): void => {
    const e = editingCharacterNow.current;
    if (!e) return;
    if (!discard && JSON.stringify(e.draft) !== e.saved) { setCharacterConfirmClose(true); return; }
    const stage = characterStageRef.current;
    characterStageRef.current = null;
    editingCharacterRef.current = false;
    setEditingCharacter(null);
    setCharacterConfirmClose(false);
    setLeftPanel("characters");
    void stage?.exit();
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

  // Rows for the "can't delete yet" dialog. Computed only on open / row-delete /
  // prefab-instance events — never per frame or per render.
  const buildPrefabInstanceRows = (prefabId: string): PrefabInstanceRow[] => {
    const world = worldRef.current;
    if (!world) return [];
    const rows: PrefabInstanceRow[] = [];
    for (const zone of world.zones.values()) {
      for (const rec of zone.prefabInstances ?? []) {
        if (rec.prefabId !== prefabId) continue;
        rows.push({
          recordId: rec.id, zoneId: zone.id, zoneName: zone.name, origin: rec.origin,
          memberCount: collectInstanceMembers(world, zone.id, rec.id).size,
        });
      }
    }
    return rows;
  };

  const handlePrefabDelete = (prefabId: string): void => {
    // Instances (including leftover empty records) block deletion — but instead of
    // a dead button, the × opens a dialog that lists them with Go to / Delete.
    if ((prefabInstanceCounts.get(prefabId) ?? 0) > 0) {
      setPrefabDeleteBlocked({ prefabId, rows: buildPrefabInstanceRows(prefabId) });
      return;
    }
    applyPrefabs(prefabs.filter(p => p.id !== prefabId));
  };

  const handleInstanceGoTo = (row: PrefabInstanceRow): void => {
    const world = worldRef.current;
    if (!world) return;
    // Selection resolves meshes in the ACTIVE zone — activate the row's zone first.
    if (world.activeZoneId !== row.zoneId) world.setActiveZone(row.zoneId);
    setActiveTool("select");
    busRef.current.emit("tool:select", { tool: "select" });
    const refs: SelectedRef[] = [...collectInstanceMembers(world, row.zoneId, row.recordId).values()]
      .map(m => ({ id: m.id, type: m.type, zoneId: row.zoneId } as SelectedRef));
    busRef.current.emit("selection:set", { refs });
    // targetFocus only — the orbit loop glides there (setting focus too would snap).
    sceneRef.current?.editorCamera?.targetFocus.set(
      row.origin.position.x, row.origin.position.y, row.origin.position.z);
    setPrefabDeleteBlocked(null);
  };

  const handleInstanceRowDelete = (row: PrefabInstanceRow): void => {
    const world = worldRef.current;
    if (!world) return;
    const wasSelected = selected?.zoneId === row.zoneId
      && (selected.data as { prefab?: { instanceId?: string } } | null)?.prefab?.instanceId === row.recordId;
    deleteInstance(world, row.zoneId, row.recordId);   // own transaction — one undo step
    syncHistory();
    if (wasSelected) { setSelected(null); busRef.current.emit("object:deselected", {}); }
    setPrefabDeleteBlocked(prev => prev && { ...prev, rows: buildPrefabInstanceRows(prev.prefabId) });
  };

  // Keep the dialog's rows honest while it sits open (undo/redo re-adds or removes
  // instances) — event-driven via prefabTick, so still zero per-frame work.
  useEffect(() => {
    setPrefabDeleteBlocked(prev => prev && { ...prev, rows: buildPrefabInstanceRows(prev.prefabId) });
  }, [prefabTick]);  // eslint-disable-line react-hooks/exhaustive-deps

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
      for (const arr of [zone.objects, zone.triggerVolumes ?? [], zone.shapes ?? [], zone.stairs, zone.ladders ?? [], zone.checkpoints ?? [], zone.lights ?? []]) {
        for (const e of arr as Array<{ id: string; prefab?: { instanceId: string } }>) {
          if (e.prefab?.instanceId === record.id) memberIds.add(e.id);
        }
      }
      if (multiSelected.length !== memberIds.size || !multiSelected.every(r => memberIds.has(r.id))) return null;
    }
    // prefab === null → orphaned instance (def missing from the library, e.g. a
    // game.json that predates the immediate-write fix). The section renders a
    // degraded view: Unlink / Delete instance still work, variables don't.
    // memberCount feeds the header's "all N" select-whole-instance affordance
    // (runs once per selection change, never per frame).
    const memberCount = collectInstanceMembers(worldRef.current!, selected.zoneId, record.id).size;
    return { prefab: prefabs.find(p => p.id === record.prefabId) ?? null, record, memberCount };
    // prefabTick keeps the record view fresh after variable/origin commits.
  }, [selected, multiSelected, prefabs, prefabTick]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Header "all N" affordance: re-select the ENTIRE instance from a single-piece
  // selection (the reverse of shift-click) so one gizmo moves object + trigger + rest.
  const handleSelectInstanceMembers = (): void => {
    const world = worldRef.current;
    if (!world || !selected || !selPrefabInfo) return;
    const refs: SelectedRef[] = [...collectInstanceMembers(world, selected.zoneId, selPrefabInfo.record.id).values()]
      .map(m => ({ id: m.id, type: m.type, zoneId: selected.zoneId } as SelectedRef));
    if (refs.length === 0) return;
    busRef.current.emit("selection:set", { refs });
  };

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
        prev.type === "ladder" ? zone?.ladders :
        prev.type === "checkpoint" ? zone?.checkpoints :
        prev.type === "light" ? zone?.lights : undefined;
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

  /** Save to prefab (v4.79.46) — the opposite of Reset: this instance's pieces
   *  become the prefab's template (version+1), persisted like an edit-session
   *  save, then EVERY placed instance re-expands in one undoable transaction
   *  (this one included — content no-op, brings its version stamp current).
   *  The definition write itself is not in the undo journal (same as Edit
   *  prefab → Save). */
  const handlePrefabPushToPrefab = (): void => {
    const world = worldRef.current;
    const info = selPrefabInfo;
    if (!world || !info?.prefab || !selected) return;
    const result = captureInstanceToPrefab(world, selected.zoneId, info.prefab, info.record.id);
    if (!result) return;
    const updated = result.prefab;
    applyPrefabs(prefabs.map(p => p.id === updated.id ? updated : p));
    const instances = findInstances(world, updated.id);
    withInstanceReselect(selected.zoneId, info.record.id, selected.id, () => {
      world.transaction(`save instance to prefab ${updated.name}`, () => {
        for (const { zoneId, record } of instances) reexpandInstance(world, zoneId, updated, record.id);
      });
    });
    syncHistory();
    setPrefabTick(t => t + 1);
  };

  // ── Isolated prefab edit mode (Phase 47) ───────────────────────────────────

  const handleEditPrefab = (prefabId: string): void => {
    const world = worldRef.current, zones = zonesRef.current, history = historyRef.current;
    const prefab = prefabs.find(p => p.id === prefabId);
    if (!world || !zones || !history || !prefab || prefab.kind !== "snapshot" || inIsolatedEdit()) return;
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
      // Whatever was selected inside the editor no longer exists out here.
      busRef.current.emit("object:deselected", {});
      setSelected(null);
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
      busRef.current.emit("object:deselected", {});
      setSelected(null);
    });
  };

  // ── Isolated brush edit mode ───────────────────────────────────────────────

  const handleEditBrush = (): void => {
    const world = worldRef.current, zones = zonesRef.current, history = historyRef.current;
    // v4.110.0: also from inside the prefab editor (Close returns there); never nested twice.
    if (!world || !zones || !history || !selected || selected.type !== "shape" || editingBrushRef.current) return;
    const shape = world.zones.get(selected.zoneId)?.shapes?.find(s => s.id === selected.id);
    if (!shape || !isBrush(shape)) return;
    brushSessionRef.current ??= new BrushEditSession(world, zones, history, () => sceneRef.current?.editorCamera ?? null);
    editingBrushRef.current = true;
    setEditingBrush({ name: shape.label ?? shape.id });
    busRef.current.emit("object:deselected", {});
    setSelected(null);
    setLeftPanel(null);
    void brushSessionRef.current.enter(selected.zoneId, shape, { keepHistory: editingPrefabRef.current }).then(() => {
      // Open straight into face mode on the staged clone.
      setActiveTool("select-face");
      busRef.current.emit("tool:select", { tool: "select-face" });
      busRef.current.emit("selection:set", { refs: [{ id: shape.id, type: "shape", zoneId: BRUSH_EDIT_ZONE }] });
    });
  };

  /** Save: snapshot the edited brush and stay in the session. */
  const handleBrushEditSave = (): void => {
    const session = brushSessionRef.current;
    if (!session?.active || !session.save()) return;
    setBrushDirty(false);
    setBrushSaved(true);
    setBrushConfirmClose(false);
  };
  brushSaveRef.current = handleBrushEditSave;

  /** Close: exit; the last Save (if any) lands on the original shape as one undo
   *  step. With unsaved changes, ask first (inline in the bar) unless `discard`. */
  const handleBrushEditClose = (discard = false): void => {
    const session = brushSessionRef.current;
    if (!session?.active) return;
    if (!discard && session.isDirty()) { setBrushConfirmClose(true); return; }
    void (async () => {
      const result = await session.close();
      editingBrushRef.current = false;
      setEditingBrush(null);
      setBrushDirty(false); setBrushSaved(false); setBrushConfirmClose(false);
      setActiveTool("select");
      busRef.current.emit("tool:select", { tool: "select" });
      const world = worldRef.current;
      if (!result || !world) return;
      world.transaction("edit brush", () => world.updateShape(result.zoneId, result.shapeId, result.changes));
      syncHistory();
      busRef.current.emit("selection:set", { refs: [{ id: result.shapeId, type: "shape", zoneId: result.zoneId }] });
    })();
  };

  // Track unsaved changes while the brush session is open (edits, undo/redo, delete).
  useEffect(() => {
    if (!editingBrush) return;
    const bus = busRef.current;
    const check = ({ zoneId }: { zoneId: string }) => {
      if (zoneId !== BRUSH_EDIT_ZONE) return;
      const dirty = brushSessionRef.current?.isDirty() ?? false;
      setBrushDirty(dirty);
      if (dirty) setBrushSaved(false);
    };
    const offs = [bus.on("shape:updated", check), bus.on("shape:removed", check), bus.on("shape:added", check)];
    return () => offs.forEach(off => off());
  }, [editingBrush]);

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
  const PREFABABLE_TYPES = ["object", "trigger-volume", "shape", "stair", "ladder", "checkpoint", "light"];
  const prefabSelectionRefs: SelectedRef[] =
    multiSelected.length > 1 ? multiSelected
    : selected && selected.id !== "__spawn__" ? [{ id: selected.id, type: selected.type, zoneId: selected.zoneId } as SelectedRef]
    : [];
  // Never inside the prefab / brush editor: it would capture their temporary staging copies.
  const prefabSelectionEligible =
    prefabSelectionRefs.some(r => PREFABABLE_TYPES.includes(r.type as string)) && !selPrefabInfo && !editingPrefab && !editingBrush;
  const prefabSelectionHint =
    editingPrefab || editingBrush ? "Leave the prefab or brush editor to make a prefab"
    : prefabSelectionRefs.length === 0 ? "Select an object, trigger volume, shape, stair, ladder, checkpoint, or light first"
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
      // prompt.type is the state-local "volume"/"object" pair, not a SelectedRef type.
      const stamps = collectInstanceStamps(world,
        [{ id, type: type === "volume" ? "trigger-volume" : "object", zoneId } as SelectedRef]);
      if (type === "volume") world.removeTriggerVolume(zoneId, id);
      else world.removeObject(zoneId, id);
      pruneEmptyInstances(world, stamps);
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
        onSoundRecord={() => setSoundRecorderOpen(true)}
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
        gameScripts={project ? gameScripts : undefined}
        onGameScriptsChange={project ? handleGameScriptsChange : undefined}
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
        characters={characters}
        playerCharacterId={worldRef.current?.world?.playerSettings?.characterId ?? null}
        onCharacterNew={handleCharacterNew}
        onCharacterEdit={id => { const c = characters.find(x => x.id === id); if (c) openCharacterEditor(c); }}
        onCharacterDuplicate={handleCharacterDuplicate}
        onCharacterPlace={handleCharacterPlace}
        onCharacterDelete={handleCharacterDelete}
        onCharacterUseAsPlayer={setPlayerCharacter}
        onPrefabRenameRequestHandled={() => setPrefabRenameRequest(null)}
      />
      {editingPrefab && !editingBrush && (
        <EditModeBar
          title="Editing Prefab"
          name={editingPrefab.name}
          hint="saving updates every placed instance"
          onSave={handlePrefabEditSave}
          onCancel={handlePrefabEditCancel}
        />
      )}
      {editingBrush && (
        // One-click select modes in the brush editor (same as the 1–4 keys).
        <SelectModeBar activeTool={activeTool}
          onSelect={tool => { setActiveTool(tool); busRef.current.emit("tool:select", { tool }); }} />
      )}
      {editingBrush && (
        <EditModeBar
          name={editingBrush.name}
          hint={editingPrefab ? `in prefab ${editingPrefab.name}: Close returns to it` : undefined}
          onSave={handleBrushEditSave}
          onCancel={() => handleBrushEditClose()}
          cancelLabel="Close"
          saveDisabled={!brushDirty}
          status={brushDirty ? { text: "unsaved changes", tone: "dirty" } : brushSaved ? { text: "saved", tone: "saved" } : null}
          confirm={brushConfirmClose ? {
            text: "Close without saving?", confirmLabel: "Discard changes",
            onConfirm: () => handleBrushEditClose(true), onDismiss: () => setBrushConfirmClose(false),
          } : null}
        />
      )}
      {editingCharacter && !characterTrying && characterStageRef.current && (
        <CharacterEditor draft={editingCharacter.draft} onChange={handleCharacterDraft} stage={characterStageRef.current} assets={assets} onTryIt={handleCharacterTryIt}
          playerSettings={worldRef.current?.world?.playerSettings ?? DEFAULT_PLAYER_SETTINGS} />
      )}
      {editingCharacter && !characterTrying && (
        <EditModeBar
          title="Character"
          name={editingCharacter.draft.name || "(no name)"}
          hint="saved in this game's characters"
          onSave={handleCharacterSave}
          onCancel={() => handleCharacterClose()}
          cancelLabel="Close"
          saveDisabled={JSON.stringify(editingCharacter.draft) === editingCharacter.saved}
          status={JSON.stringify(editingCharacter.draft) !== editingCharacter.saved ? { text: "unsaved changes", tone: "dirty" } : { text: "saved", tone: "saved" }}
          confirm={characterConfirmClose ? {
            text: "Close without saving?", confirmLabel: "Discard changes",
            onConfirm: () => handleCharacterClose(true), onDismiss: () => setCharacterConfirmClose(false),
          } : null}
        />
      )}
      <TopBar
        brushEditing={!!editingBrush}
        activeFloor={activeFloor}
        onFloorChange={handleFloorChange}
        getFloorSummaries={getFloorSummaries}
        showAllFloors={showAllFloors}
        onToggleShowAllFloors={() => {
          const on = !showAllFloors;
          setShowAllFloors(on);
          zonesRef.current?.setShowAllLevels(on);
          try { localStorage.setItem("editorShowAllFloors", on ? "1" : "0"); } catch { /* storage blocked */ }
        }}
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
        onProjectPublish={isDesktop() ? () => setPublishOpen(true) : undefined}
        onSceneSwitch={id => void handleProjectSceneSwitch(id)}
        onSceneAdd={() => void handleProjectSceneAdd()}
        onSceneDelete={id => void handleProjectSceneDelete(id)}
        onEntrySceneChange={id => void handleEntrySceneChange(id)}
      />
      {!editingCharacter && <PropertiesPanel
        activeTool={activeTool}
        selected={selected}
        materialList={materialList}
        quality={quality}
        showPerfCounter={showPerfCounter}
        onTogglePerfCounter={handleTogglePerfCounter}
        showJumpStats={showJumpStats}
        onToggleJumpStats={handleToggleJumpStats}
        showCrosshair={showCrosshair}
        onToggleCrosshair={handleToggleCrosshair}
        showGridFloor={showGridFloor}
        brushBackground={brushBg}
        onBrushBackgroundChange={handleBrushBgChange}
        skyboxes={skyboxes}
        gameInput={project ? projectRef.current?.store.game.input : undefined}
        onGameInputChange={project ? handleGameInputChange : undefined}
        onToggleGridFloor={handleToggleGridFloor}
        onObjectUpdate={handleObjectUpdate}
        onSegmentUpdate={handleSegmentUpdate}
        onFloorNodesUpdate={handleFloorNodesUpdate}
        getNodeLinks={getNodeLinks}
        onImportMaterial={openMaterialImporter}
        onQualityChange={handleQualityChange}
        onCopyRunToFloors={handleCopyRunToFloors}
        onFillRunWithFloor={isWallRunClosed() && !runHasFloorFill() ? handleFillRunWithFloor : undefined}
        onAddCeilingToRun={isWallRunClosed() && !findRunCeiling() ? handleAddCeilingToRun : undefined}
        onToggleCeilingGhost={findRunCeiling() ? handleToggleCeilingGhost : undefined}
        runCeilingGhosted={!!findRunCeiling()?.editorGhost}
        onUnlinkRunCorners={selected?.type === "wall" ? handleUnlinkRunCorners : undefined}
        onEditBrush={selected?.type === "shape" && !editingBrush ? handleEditBrush : undefined}
        runLinkedFloors={selected?.type === "wall" ? getRunLinkedFloors() : undefined}
        onDelete={selected || multiSelected.length > 1 ? handleDelete : undefined}
        multiSelected={multiSelected}
        onCopy={handleCopy}
        onDuplicate={handleDuplicate}
        onGroupSelected={handleGroupSelected}
        onSelectGroup={handleSelectGroupMembers}
        onBake={refs => setBakeRefs(refs)}
        onPrintExport={refs => {
          const shapes = refs.flatMap(r => worldRef.current?.zones.get(r.zoneId)?.shapes?.filter(s => s.id === r.id) ?? []);
          if (shapes.length) setPrintShapes(shapes.map(s => structuredClone(s)));
        }}
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
        gamePlayerSettings={project ? worldRef.current?.gamePlayerSettings : undefined}
        scenePlayerOverrides={worldRef.current?.scenePlayerOverrides}
        onGamePlayerSettingsChange={project ? handleGamePlayerSettingsChange : undefined}
        onSettingsPageOverride={project ? handleSettingsPageOverride : undefined}
        onPromoteSettingsToGame={project ? handlePromoteSettingsToGame : undefined}
        lightingOverridden={!worldRef.current?.world?.lightingFromGame}
        onInheritLighting={project ? handleInheritLighting : undefined}
        onPromoteLighting={project ? handlePromoteLighting : undefined}
        audioMixOverridden={!!worldRef.current?.sceneOwnsAudioMix}
        onInheritAudioMix={project ? handleInheritAudioMix : undefined}
        onPromoteAudioMix={project ? handlePromoteAudioMix : undefined}
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
        onEditPrefab={handleEditPrefab}
        onSelectInstance={handleSelectInstanceMembers}
        onPrefabVariablesChange={handlePrefabVariablesChange}
        onPrefabOriginChange={handlePrefabOriginChange}
        onPrefabReexpand={() => setPrefabConfirm("reset")}
        onPrefabPushToPrefab={() => setPrefabConfirm("push")}
        onPrefabUnlink={() => setPrefabConfirm("unlink")}
        onPrefabDeleteInstance={() => setPrefabConfirm("delete")}
        onCreatePrefab={editingPrefab || editingBrush ? undefined : handleCreatePrefab}
        onAddPressPrompt={handleAddPressPrompt}
      />}
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
          interactName={interactName}
          mode={previewMode ?? "game"}
          showCrosshair={showCrosshair}
        />
      )}

      {isPreview && worldRef.current && (
        <GameGuiOverlay bus={busRef.current} world={worldRef.current} interactName={interactName} />
      )}

      {isPreview && previewScheme === "touch" && previewRef.current?.input && (
        <TouchControlsOverlay
          shared={previewRef.current.input.touch.shared}
          joystickRadius={previewRef.current.input.bindings.touch.joystickRadius}
          layout={previewRef.current.input.bindings.touch.layout}
          spots={previewRef.current.input.bindings.touch.spots}
          buttons={previewRef.current.input.bindings.buttons}
        />
      )}

      {isPreview && pauseOpen && (
        <PauseMenu
          bus={busRef.current}
          game={worldRef.current?.gameInput}
          gameId={worldRef.current?.gameId}
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

      {publishOpen && projectRef.current && (
        <PublishModal
          projectId={projectRef.current.store.id}
          projectName={projectRef.current.store.name}
          onBeforePublish={handleSave}   // the export reads the game from disk — must see the latest
          onClose={() => setPublishOpen(false)}
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
      {isPreview && showJumpStats && <JumpReadout bus={busRef.current} />}
      <ViewportContextMenu bus={busRef.current} enabled={!isPreview && isSelectMode(activeTool) && !editingBrush && !editingPrefab}
        hasSpawn={!!worldRef.current?.world?.defaultSpawn} />

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
          existingCategories={materialList.map(m => m.category ?? "Other")}
          existingAttributions={[...materialList, ...assets, ...sounds].flatMap(a => a.attribution ? [a.attribution] : [])}
          existingTags={[...new Set(materialList.flatMap(m => m.tags ?? []))].sort()}
          onComplete={() => { setMaterialImporterOpen(false); handleMaterialsReload(); }}
          onClose={() => setMaterialImporterOpen(false)}
        />
      )}

      {audioImporterOpen && (
        <AudioImporterModal
          existingTags={[...new Set(sounds.flatMap(s => s.tags ?? []))].sort()}
          existingAttributions={[...sounds, ...assets].flatMap(s => s.attribution ? [s.attribution] : [])}
          existingCategories={[...new Set(sounds.map(s => s.category ?? "SFX"))]}
          initialFiles={recordedFiles ?? undefined}
          onComplete={() => { setAudioImporterOpen(false); setRecordedFiles(null); handleSoundsReload(); }}
          onClose={() => { setAudioImporterOpen(false); setRecordedFiles(null); }}
        />
      )}

      {soundRecorderOpen && (
        <SoundRecorderModal
          onRecorded={file => {
            setSoundRecorderOpen(false);
            setRecordedFiles([file]);
            setAudioImporterOpen(true);   // lands directly in the metadata step
          }}
          onClose={() => setSoundRecorderOpen(false)}
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

      {printShapes && <PrintExportDialog shapes={printShapes} onClose={() => setPrintShapes(null)} />}

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
          tagSuggestions={[...new Set(materialList.flatMap(m => m.tags ?? []))].sort()}
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
      {prefabConfirm && (() => {
        // Save-to-prefab body carries live counts: a dry run of the capture
        // (pure) for removed pieces, and the other-instance count.
        const push = prefabConfirm === "push" && worldRef.current && selPrefabInfo?.prefab && selected
          ? captureInstanceToPrefab(worldRef.current, selected.zoneId, selPrefabInfo.prefab, selPrefabInfo.record.id) : null;
        const others = push && worldRef.current ? findInstances(worldRef.current, push.prefab.id).length - 1 : 0;
        const pushBody = push
          ? `Overwrite prefab "${push.prefab.name}" (v${push.prefab.version - 1} → v${push.prefab.version}) with this instance's ${push.memberCount} piece${push.memberCount === 1 ? "" : "s"}, `
            + `and update ${others === 0 ? "no other placed instances" : others === 1 ? "the 1 other placed instance" : `all ${others} other placed instances`} to match?`
            + (push.removedKeys.length ? ` ${push.removedKeys.length} piece${push.removedKeys.length === 1 ? "" : "s"} you deleted here will be removed from the prefab and from every instance.` : "")
            + " Hand-edits on other instances are discarded. Re-expanding the instances is undoable; the prefab definition change is not."
          : "This instance can't be saved back (generator prefab, or no pieces).";
        return (
        <ConfirmDialog
          title={prefabConfirm === "reset" ? "RESET FROM PREFAB"
               : prefabConfirm === "push" ? "SAVE TO PREFAB"
               : prefabConfirm === "unlink" ? "UNLINK INSTANCE" : "DELETE INSTANCE"}
          body={prefabConfirm === "reset"
              ? "Rebuild every piece from the prefab recipe? Hand-edits to individual pieces are discarded — instance settings and position are kept. (Undoable.)"
              : prefabConfirm === "push" ? pushBody
              : prefabConfirm === "unlink"
              ? "Detach the pieces into plain, independent entities? Prefab updates will stop affecting them. (Undoable.)"
              : "Delete every piece of this instance? (Undoable.)"}
          confirmLabel={prefabConfirm === "reset" ? "Reset" : prefabConfirm === "push" ? "Save to prefab" : prefabConfirm === "unlink" ? "Unlink" : "Delete instance"}
          onCancel={() => setPrefabConfirm(null)}
          onConfirm={() => {
            const kind = prefabConfirm;
            setPrefabConfirm(null);
            if (kind === "reset") handlePrefabReexpand();
            else if (kind === "push") handlePrefabPushToPrefab();
            else if (kind === "unlink") handlePrefabUnlink();
            else handlePrefabDeleteInstance();
          }}
        />
        );
      })()}
      {prefabDeleteBlocked && (
        <PrefabInstancesDialog
          prefabName={prefabs.find(p => p.id === prefabDeleteBlocked.prefabId)?.name ?? prefabDeleteBlocked.prefabId}
          rows={prefabDeleteBlocked.rows}
          onGoTo={handleInstanceGoTo}
          onDeleteRow={handleInstanceRowDelete}
          onDeletePrefab={() => {
            if ((prefabInstanceCounts.get(prefabDeleteBlocked.prefabId) ?? 0) > 0) return;  // belt-and-braces
            applyPrefabs(prefabs.filter(p => p.id !== prefabDeleteBlocked.prefabId));
            setPrefabDeleteBlocked(null);
          }}
          onClose={() => setPrefabDeleteBlocked(null)}
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
