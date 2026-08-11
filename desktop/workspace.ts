// Workspace: where the desktop app keeps content (games/, assets/) and state
// (settings, autosave, backups, trash, exports).
//
// Dev mode (repo checkout): content = <repo>/public — the same tree Vite
// serves, so the existing git-safety convention for public/games/** continues
// unchanged. State goes to <repo>/.worldbuilder (gitignored) so nothing
// non-content pollutes public/ (vite copies public/* into dist).
//
// Prod (compiled app): content = ~/WorldBuilder (user-visible, backupable),
// state = ~/WorldBuilder/.state. Override root via WORLDBUILDER_WORKSPACE.

export interface Workspace {
  contentDir: string; // holds games/ and assets/
  stateDir: string;   // holds settings.json, autosave/, backups/, trash/, exports/
  dev: boolean;
}

async function exists(p: string): Promise<boolean> {
  try {
    await Deno.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function resolveWorkspace(): Promise<Workspace> {
  const override = Deno.env.get("WORLDBUILDER_WORKSPACE");
  if (override) {
    const ws = { contentDir: override, stateDir: `${override}/.state`, dev: false };
    await ensureLayout(ws);
    return ws;
  }
  if (await exists(`${Deno.cwd()}/public/games`)) {
    const ws = { contentDir: `${Deno.cwd()}/public`, stateDir: `${Deno.cwd()}/.worldbuilder`, dev: true };
    await ensureLayout(ws);
    return ws;
  }
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? ".";
  const root = `${home}/WorldBuilder`;
  const ws = { contentDir: root, stateDir: `${root}/.state`, dev: false };
  await ensureLayout(ws);
  return ws;
}

async function ensureLayout(ws: Workspace): Promise<void> {
  await Deno.mkdir(`${ws.contentDir}/games`, { recursive: true });
  for (const d of ["autosave", "backups", "trash", "exports"]) {
    await Deno.mkdir(`${ws.stateDir}/${d}`, { recursive: true });
  }
}

/** ids used in paths (project ids, scene ids, export names) — no traversal. */
export function assertSafeId(id: string): void {
  if (!/^[a-zA-Z0-9 _.-]+$/.test(id) || id.includes("..")) {
    throw new Error(`unsafe path segment: ${JSON.stringify(id)}`);
  }
}

/** Atomic write: tmp file in the same dir, then rename over the target. */
export async function atomicWriteText(path: string, text: string): Promise<void> {
  const dir = path.slice(0, path.lastIndexOf("/"));
  await Deno.mkdir(dir, { recursive: true });
  const tmp = `${path}.tmp-${crypto.randomUUID().slice(0, 8)}`;
  await Deno.writeTextFile(tmp, text);
  await Deno.rename(tmp, path);
}

const BACKUPS_KEPT = 10;

/** If `path` exists, copy it into stateDir/backups/<key>/<ts>.json and prune
 *  to the newest BACKUPS_KEPT. Returns the backup path or null. */
export async function backupExisting(ws: Workspace, key: string, path: string): Promise<string | null> {
  if (!(await exists(path))) return null;
  const dir = `${ws.stateDir}/backups/${key}`;
  await Deno.mkdir(dir, { recursive: true });
  // uuid suffix: two saves in the same millisecond must not share a name
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = `${dir}/${stamp}-${crypto.randomUUID().slice(0, 4)}.json`;
  await Deno.copyFile(path, dest);
  const entries: string[] = [];
  for await (const e of Deno.readDir(dir)) if (e.isFile) entries.push(e.name);
  entries.sort();
  for (const name of entries.slice(0, Math.max(0, entries.length - BACKUPS_KEPT))) {
    await Deno.remove(`${dir}/${name}`).catch(() => {});
  }
  return dest;
}

/** Move a file into stateDir/trash/ instead of deleting it. */
export async function trashFile(ws: Workspace, path: string): Promise<void> {
  if (!(await exists(path))) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = path.slice(path.lastIndexOf("/") + 1);
  await Deno.rename(path, `${ws.stateDir}/trash/${stamp}-${base}`);
}

// ── settings.json (prefs + last session) ────────────────────────────────────

interface Settings {
  lastSession?: { projectId: string; sceneId: string } | null;
  prefs?: Record<string, string>;
}

async function readSettings(ws: Workspace): Promise<Settings> {
  try {
    return JSON.parse(await Deno.readTextFile(`${ws.stateDir}/settings.json`)) as Settings;
  } catch {
    return {};
  }
}

async function writeSettings(ws: Workspace, s: Settings): Promise<void> {
  await atomicWriteText(`${ws.stateDir}/settings.json`, JSON.stringify(s, null, 2));
}

export async function getLastSession(ws: Workspace): Promise<{ projectId: string; sceneId: string } | null> {
  return (await readSettings(ws)).lastSession ?? null;
}

export async function setLastSession(ws: Workspace, session: { projectId: string; sceneId: string } | null): Promise<void> {
  const s = await readSettings(ws);
  s.lastSession = session;
  await writeSettings(ws, s);
}

export async function getPref(ws: Workspace, key: string): Promise<string | null> {
  return (await readSettings(ws)).prefs?.[key] ?? null;
}

export async function setPref(ws: Workspace, key: string, value: string | null): Promise<void> {
  const s = await readSettings(ws);
  s.prefs ??= {};
  if (value === null) delete s.prefs[key];
  else s.prefs[key] = value;
  await writeSettings(ws, s);
}
