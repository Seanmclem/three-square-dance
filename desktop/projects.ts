// Project + autosave + export bindings. Primitives only: manifest/game-config
// semantics live in the frontend (src/project/ProjectStore.ts); this layer
// guarantees path safety, atomic writes, rotating backups, and trash.

import {
  assertSafeId,
  atomicWriteText,
  backupExisting,
  trashFile,
  type Workspace,
} from "./workspace.ts";

interface ProjectRow {
  id: string;
  name: string;
  entryScene: string;
  sceneIds: string[];
  updatedAt: string;
}

function gamesDir(ws: Workspace): string {
  return `${ws.contentDir}/games`;
}

export async function listProjects(ws: Workspace): Promise<ProjectRow[]> {
  const rows: ProjectRow[] = [];
  for await (const e of Deno.readDir(gamesDir(ws))) {
    if (!e.isDirectory) continue;
    try {
      const raw = await Deno.readTextFile(`${gamesDir(ws)}/${e.name}/manifest.json`);
      const m = JSON.parse(raw) as { manifestVersion?: number; id?: string; name?: string; entryScene?: string; scenes?: Record<string, string> };
      if (m.manifestVersion !== 1 || !m.id) continue;
      const stat = await Deno.stat(`${gamesDir(ws)}/${e.name}/manifest.json`);
      rows.push({
        id: m.id,
        name: m.name ?? m.id,
        entryScene: m.entryScene ?? "",
        sceneIds: Object.keys(m.scenes ?? {}),
        updatedAt: stat.mtime?.toISOString() ?? "",
      });
    } catch {
      // not a project folder — skip
    }
  }
  rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return rows;
}

export async function createProject(ws: Workspace, id: string): Promise<void> {
  assertSafeId(id);
  const dir = `${gamesDir(ws)}/${id}`;
  try {
    await Deno.stat(dir);
    throw new Error(`a project folder named "${id}" already exists`);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  await Deno.mkdir(`${dir}/scenes`, { recursive: true });
}

export async function saveScene(ws: Workspace, projectId: string, sceneId: string, json: string): Promise<{ backup: string | null }> {
  assertSafeId(projectId);
  assertSafeId(sceneId);
  JSON.parse(json); // refuse to write non-JSON — the truncation-adjacent failure mode
  const path = `${gamesDir(ws)}/${projectId}/scenes/${sceneId}.json`;
  const backup = await backupExisting(ws, `${projectId}/${sceneId}`, path);
  await atomicWriteText(path, json);
  return { backup };
}

export async function deleteScene(ws: Workspace, projectId: string, sceneId: string): Promise<void> {
  assertSafeId(projectId);
  assertSafeId(sceneId);
  await trashFile(ws, `${gamesDir(ws)}/${projectId}/scenes/${sceneId}.json`);
}

export async function writeGameFile(ws: Workspace, projectId: string, json: string): Promise<void> {
  assertSafeId(projectId);
  JSON.parse(json);
  const path = `${gamesDir(ws)}/${projectId}/game.json`;
  await backupExisting(ws, `${projectId}/game`, path);
  await atomicWriteText(path, json);
}

export async function writeProjectManifest(ws: Workspace, projectId: string, json: string): Promise<void> {
  assertSafeId(projectId);
  JSON.parse(json);
  const path = `${gamesDir(ws)}/${projectId}/manifest.json`;
  await backupExisting(ws, `${projectId}/manifest`, path);
  await atomicWriteText(path, json);
}

// ── autosave (replaces localStorage['worldeditor_autosave']) ────────────────

interface AutosaveMeta {
  projectId: string | null;
  sceneId: string | null;
  savedAt: string;
}

export async function writeAutosave(ws: Workspace, meta: { projectId: string | null; sceneId: string | null }, json: string): Promise<void> {
  JSON.parse(json);
  const full: AutosaveMeta = { ...meta, savedAt: new Date().toISOString() };
  await atomicWriteText(`${ws.stateDir}/autosave/latest.json`, json);
  await atomicWriteText(`${ws.stateDir}/autosave/latest.meta.json`, JSON.stringify(full, null, 2));
}

export async function readAutosave(ws: Workspace): Promise<{ meta: AutosaveMeta; json: string } | null> {
  try {
    const json = await Deno.readTextFile(`${ws.stateDir}/autosave/latest.json`);
    const meta = JSON.parse(await Deno.readTextFile(`${ws.stateDir}/autosave/latest.meta.json`)) as AutosaveMeta;
    return { meta, json };
  } catch {
    return null;
  }
}

export async function clearAutosave(ws: Workspace): Promise<void> {
  await Deno.remove(`${ws.stateDir}/autosave/latest.json`).catch(() => {});
  await Deno.remove(`${ws.stateDir}/autosave/latest.meta.json`).catch(() => {});
}

// ── single-file export (replaces showSaveFilePicker) ────────────────────────

export async function writeExportFile(ws: Workspace, name: string, text: string): Promise<{ path: string }> {
  assertSafeId(name);
  const path = `${ws.stateDir}/exports/${name}`;
  await backupExisting(ws, `exports/${name}`, path);
  await atomicWriteText(path, text);
  return { path };
}

