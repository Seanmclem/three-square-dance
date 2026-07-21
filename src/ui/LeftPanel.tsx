import { useState } from "react";
import type { LeftPanelId, AssetDef, MaterialDef, GroupDef, ScriptDef, TriggerVolume, WorldObject, PlatformDef, ShapeDef, StairDef, WallDef, FloorDef, CheckpointDef, LightDef, SelectedRef, StateSchema, DecalTexDef, DecalKind, DialogueTreeDef, ItemDef, SoundDef, SkyboxDef } from "@/types";
import type { GroupMember } from "@/editor/groupMembers";
import { AssetBrowser } from "@/ui/AssetBrowser";
import { MaterialBrowser } from "@/ui/MaterialBrowser";
import { AudioBrowser } from "@/ui/AudioBrowser";
import { SkyboxBrowser } from "@/ui/SkyboxBrowser";
import { DecalBrowser } from "@/ui/DecalBrowser";
import { GroupPanel } from "@/ui/GroupPanel";
import { ScriptPanel } from "@/ui/ScriptPanel";

interface LeftPanelProps {
  panelId:         LeftPanelId;
  assets:          AssetDef[];
  selectedAssetId: string | null;
  onAssetSelect:   (id: string | null) => void;
  onImport:        () => void;
  onDeleteAssets:  (ids: string[]) => void;
  onEditAssets:    (ids: string[]) => void;
  onRestageAsset:  (id: string) => void;
  materials:        MaterialDef[];
  onMaterialImport: () => void;
  onDeleteMaterials:(ids: string[]) => void;
  onEditMaterials:  (ids: string[]) => void;
  sounds:           SoundDef[];
  onSoundImport:    () => void;
  onDeleteSounds:   (ids: string[]) => void;
  onEditSounds:     (ids: string[]) => void;
  skyboxes:         SkyboxDef[];
  selectedSkybox:   string;
  onSkyboxSelect:   (id: string) => void;
  onSkyboxImport:   () => void;
  onDeleteSkyboxes: (ids: string[]) => void;
  onEditSkyboxes:   (ids: string[]) => void;
  onClose:         () => void;
  groups:          GroupDef[];
  hiddenGroupIds:  Set<string>;
  onGroupAdd:      () => void;
  onGroupRemove:   (id: string) => void;
  onGroupRename:   (id: string, name: string) => void;
  onGroupToggleVisibility: (id: string) => void;
  groupMembers:    Map<string, GroupMember[]>;
  multiSelectedCount: number;
  onAddSelectedToGroup:    (groupId: string) => void;
  onRemoveGroupMember:     (groupId: string, ref: SelectedRef) => void;
  onSelectGroupMembers:    (groupId: string) => void;
  onDeleteGroupMembers:    (groupId: string) => void;
  onDuplicateGroupMembers: (groupId: string) => void;
  activeZoneId:    string | null;
  // scripts panel
  zoneScripts:          ScriptDef[];
  zoneDialogues:        DialogueTreeDef[];
  objectScripts:        ScriptDef[] | null;
  selectedObjectId:     string | null;
  triggerVolumes:       TriggerVolume[];
  zoneObjects:          WorldObject[];
  zonePlatforms:        PlatformDef[];
  zoneShapes:           ShapeDef[];
  zoneLights:           LightDef[];
  zoneStairs:           StairDef[];
  zoneWalls:            WallDef[];
  zoneFloors:           FloorDef[];
  zoneCheckpoints:      CheckpointDef[];
  onZoneScriptsChange:  (scripts: ScriptDef[]) => void;
  onZoneDialoguesChange:(dialogues: DialogueTreeDef[]) => void;
  onObjectScriptsChange:(objectId: string, scripts: ScriptDef[]) => void;
  stateSchema:          Record<string, StateSchema>;
  onStateSchemaChange:  (schema: Record<string, StateSchema>) => void;
  gameStateSchema?:     Record<string, StateSchema>;
  onGameStateSchemaChange?: (schema: Record<string, StateSchema>) => void;
  isPreviewing?:        boolean;
  worldItems:           ItemDef[];
  projectSceneIds?:     string[];
  onWorldItemsChange:   (items: ItemDef[]) => void;
  // decals panel
  decalTextures:   DecalTexDef[];
  selectedDecalId: string | null;
  onDecalSelect:   (id: string | null, kind: DecalKind) => void;
}

export function LeftPanel({
  panelId, assets, selectedAssetId, onAssetSelect, onImport, onDeleteAssets, onEditAssets, onRestageAsset, onClose,
  materials, onMaterialImport, onDeleteMaterials, onEditMaterials,
  sounds, onSoundImport, onDeleteSounds, onEditSounds,
  skyboxes, selectedSkybox, onSkyboxSelect, onSkyboxImport, onDeleteSkyboxes, onEditSkyboxes,
  groups, hiddenGroupIds, onGroupAdd, onGroupRemove, onGroupRename, onGroupToggleVisibility,
  groupMembers, multiSelectedCount, onAddSelectedToGroup, onRemoveGroupMember,
  onSelectGroupMembers, onDeleteGroupMembers, onDuplicateGroupMembers,
  zoneScripts, zoneDialogues, objectScripts, selectedObjectId,
  activeZoneId, triggerVolumes, zoneObjects, zonePlatforms, zoneShapes, zoneLights, zoneStairs, zoneWalls, zoneFloors, zoneCheckpoints,
  onZoneScriptsChange, onZoneDialoguesChange, onObjectScriptsChange,
  stateSchema, onStateSchemaChange, gameStateSchema, onGameStateSchemaChange, isPreviewing,
  worldItems, onWorldItemsChange, projectSceneIds,
  decalTextures, selectedDecalId, onDecalSelect,
}: LeftPanelProps) {
  const open = panelId !== null;

  // Resizable width — drag the right edge. Persisted across sessions.
  const [width, setWidth] = useState<number>(() =>
    Math.min(600, Math.max(280, Number(localStorage.getItem("wb_leftpanel_w")) || 320)),
  );
  const [resizing, setResizing] = useState(false);

  function onResizeDown(e: React.PointerEvent<HTMLDivElement>): void {
    e.preventDefault();
    (e.target as HTMLDivElement).setPointerCapture(e.pointerId);
    setResizing(true);
  }
  function onResizeMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (!resizing) return;
    setWidth(Math.min(600, Math.max(280, e.clientX - 64)));
  }
  function onResizeUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (!resizing) return;
    (e.target as HTMLDivElement).releasePointerCapture(e.pointerId);
    setResizing(false);
    setWidth((w) => {
      localStorage.setItem("wb_leftpanel_w", String(w));
      return w;
    });
  }

  return (
    <div id="wb-leftpanel" style={{
      position: "absolute",
      left: 64,
      top: 48,
      bottom: 0,
      width: open ? width : 0,
      overflow: "hidden",
      transition: resizing ? "none" : "width 0.2s ease",
      background: "rgba(28,28,28,0.97)",
      borderRight: open ? "1px solid rgba(255,255,255,0.08)" : "none",
      zIndex: 9,
      display: "flex",
      flexDirection: "column",
    }}>
      {open && (
        <>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 8px 6px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 11, color: "#808080", letterSpacing: 1, fontFamily: "monospace", textTransform: "uppercase" }}>
              {panelId}
            </span>
            <button
              onClick={onClose}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#585870", fontSize: 14, padding: "0 2px", lineHeight: 1,
              }}
              title="Close panel"
            >
              ✕
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {panelId === "assets" && (
              <AssetBrowser
                assets={assets}
                selectedAssetId={selectedAssetId}
                onSelect={onAssetSelect}
                onImport={onImport}
                onDeleteAssets={onDeleteAssets}
                onEdit={onEditAssets}
                onRestage={onRestageAsset}
              />
            )}
            {panelId === "materials" && (
              <MaterialBrowser
                materials={materials}
                onImport={onMaterialImport}
                onDeleteMaterials={onDeleteMaterials}
                onEdit={onEditMaterials}
              />
            )}
            {panelId === "audio" && (
              <AudioBrowser
                sounds={sounds}
                onImport={onSoundImport}
                onDeleteSounds={onDeleteSounds}
                onEdit={onEditSounds}
              />
            )}
            {panelId === "skybox" && (
              <SkyboxBrowser
                skyboxes={skyboxes}
                selectedId={selectedSkybox}
                onSelect={onSkyboxSelect}
                onImport={onSkyboxImport}
                onDeleteSkyboxes={onDeleteSkyboxes}
                onEdit={onEditSkyboxes}
              />
            )}
            {panelId === "decals" && (
              <DecalBrowser
                decals={decalTextures}
                selectedId={selectedDecalId}
                onSelect={onDecalSelect}
              />
            )}
            {panelId === "groups" && (
              <GroupPanel
                groups={groups}
                hiddenGroupIds={hiddenGroupIds}
                groupMembers={groupMembers}
                multiSelectedCount={multiSelectedCount}
                onAdd={onGroupAdd}
                onRemove={onGroupRemove}
                onRename={onGroupRename}
                onToggleVisibility={onGroupToggleVisibility}
                onAddSelected={onAddSelectedToGroup}
                onRemoveMember={onRemoveGroupMember}
                onSelectMembers={onSelectGroupMembers}
                onDeleteMembers={onDeleteGroupMembers}
                onDuplicateMembers={onDuplicateGroupMembers}
              />
            )}
            {panelId === "scripts" && (
              <ScriptPanel
                zoneScripts={zoneScripts}
                zoneDialogues={zoneDialogues}
                objectScripts={objectScripts}
                selectedObjectId={selectedObjectId}
                activeZoneId={activeZoneId}
                triggerVolumes={triggerVolumes}
                zoneObjects={zoneObjects}
                zonePlatforms={zonePlatforms}
                zoneShapes={zoneShapes}
                zoneLights={zoneLights}
                zoneStairs={zoneStairs}
                zoneWalls={zoneWalls}
                zoneFloors={zoneFloors}
                zoneCheckpoints={zoneCheckpoints}
                groups={groups}
                assets={assets}
                onZoneScriptsChange={onZoneScriptsChange}
                onZoneDialoguesChange={onZoneDialoguesChange}
                onObjectScriptsChange={onObjectScriptsChange}
                stateSchema={stateSchema}
                onStateSchemaChange={onStateSchemaChange}
                gameStateSchema={gameStateSchema}
                onGameStateSchemaChange={onGameStateSchemaChange}
                isPreviewing={isPreviewing}
                worldItems={worldItems}
                projectSceneIds={projectSceneIds}
                onWorldItemsChange={onWorldItemsChange}
              />
            )}
          </div>

          {/* Drag the right edge to resize the panel */}
          <div
            title="Drag to resize the panel"
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: 6,
              cursor: "col-resize",
              zIndex: 10,
              background: resizing ? "rgba(128,170,255,0.25)" : "transparent",
            }}
            onPointerEnter={(e) => { if (!resizing) (e.target as HTMLDivElement).style.background = "rgba(128,170,255,0.12)"; }}
            onPointerLeave={(e) => { if (!resizing) (e.target as HTMLDivElement).style.background = "transparent"; }}
          />
        </>
      )}
    </div>
  );
}
