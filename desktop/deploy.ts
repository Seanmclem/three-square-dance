// Publish a game to a hosted site (phase 75). Backend of the editor's Publish
// modal: the API key, the game ↔ site link, and the publish job itself
// (exportGameBundle → Netlify file-digest deploy). Netlify is the only host;
// the phase-57 provider registry that sat here had no second consumer, so it
// is gone rather than generalised.
//
// The api transport is one blocking POST per call with no progress channel, so
// a publish runs as an in-memory JOB the modal polls (`getPublishStatus`).

import { exportGameBundle } from "./export.ts";
import { createNetlifyClient, type NetlifyAccount, type NetlifyClient, type NetlifySite, type NetlifyUser } from "./netlify.ts";
import { type PublishLink, readPublishLink, writePublishLink } from "./projects.ts";
import { assertSafeId, atomicWriteText, readSecret, type Workspace, writeSecret } from "./workspace.ts";

const KEY = "netlifyToken";

/** Tests pass a fake server + fast timings; the app passes nothing. */
export interface ClientOverrides { apiBase?: string; retryBaseMs?: number; pollMs?: number }

async function client(ws: Workspace, o?: ClientOverrides): Promise<NetlifyClient> {
  const token = await readSecret(ws, KEY);
  if (!token) throw new Error("No Netlify API key saved yet");
  return createNetlifyClient({ token, ...o });
}

// ── API key ─────────────────────────────────────────────────────────────────
// The key goes IN through netlifySetKey and never comes back out: the frontend
// only ever learns whether one is saved and whose account it is.

export async function netlifyStatus(ws: Workspace, o?: ClientOverrides): Promise<{ connected: boolean; user?: NetlifyUser; error?: string }> {
  if (!(await readSecret(ws, KEY))) return { connected: false };
  try {
    return { connected: true, user: await (await client(ws, o)).getUser() };
  } catch (e) {
    // A rejected key is "not connected"; a network hiccup is not the key's fault.
    const rejected = (e as { status?: number }).status === 401;
    return { connected: !rejected, error: (e as Error).message };
  }
}

/** Verifies the key against Netlify BEFORE saving it — a typo never gets stored. */
export async function netlifySetKey(ws: Workspace, key: string, o?: ClientOverrides): Promise<{ user: NetlifyUser }> {
  const token = key.trim();
  if (!token) throw new Error("Paste a Netlify API key first");
  const user = await createNetlifyClient({ token, ...o }).getUser();
  await writeSecret(ws, KEY, token);
  return { user };
}

export async function netlifyClearKey(ws: Workspace): Promise<void> {
  await writeSecret(ws, KEY, null);
}

// ── sites ───────────────────────────────────────────────────────────────────

export async function netlifyListSites(ws: Workspace, o?: ClientOverrides): Promise<{ sites: NetlifySite[]; accounts: NetlifyAccount[] }> {
  const c = await client(ws, o);
  const [sites, accounts] = await Promise.all([c.listSites(), c.listAccounts()]);
  return { sites, accounts };
}

export async function netlifyCreateSite(ws: Workspace, opts: { name: string; accountSlug?: string }, o?: ClientOverrides): Promise<NetlifySite> {
  return (await client(ws, o)).createSite(opts);
}

// ── last-publish record (local; the committed publish.json stays stable) ────

export interface LastPublish { at: string; siteId: string; deployId: string; url: string; deployUrl: string; fileCount: number; uploadedCount: number }

const lastPublishPath = (ws: Workspace, projectId: string) => `${ws.stateDir}/publish/${projectId}.json`;

async function readLastPublish(ws: Workspace, projectId: string): Promise<LastPublish | null> {
  try {
    return JSON.parse(await Deno.readTextFile(lastPublishPath(ws, projectId))) as LastPublish;
  } catch {
    return null;
  }
}

/** What the modal needs to draw a game's publish state. `lastPublish` only counts for the CURRENT site. */
export async function getPublishLink(ws: Workspace, projectId: string): Promise<{ link: PublishLink | null; lastPublish: LastPublish | null }> {
  const link = await readPublishLink(ws, projectId);
  const last = await readLastPublish(ws, projectId);
  return { link, lastPublish: link && last?.siteId === link.siteId ? last : null };
}

export async function setPublishLink(ws: Workspace, projectId: string, link: PublishLink | null): Promise<void> {
  await writePublishLink(ws, projectId, link);
}

// ── publish job ─────────────────────────────────────────────────────────────

export interface PublishStatus {
  phase: "exporting" | "hashing" | "preparing" | "uploading" | "processing" | "done" | "error";
  done: number;
  total: number;
  bytesDone: number;
  bytesTotal: number;
  /** done */
  url?: string;
  deployUrl?: string;
  fileCount?: number;
  uploadedCount?: number;
  uploadedBytes?: number;
  missing?: string[];
  /** error */
  error?: string;
}

interface Job { projectId: string; startedAt: number; status: PublishStatus }

const jobs = new Map<string, Job>();
const running = (j: Job) => j.status.phase !== "done" && j.status.phase !== "error";

export async function startPublish(ws: Workspace, distDir: string, projectId: string, o?: ClientOverrides): Promise<{ jobId: string }> {
  assertSafeId(projectId);
  // One publish per game at a time — a double click joins the running job.
  for (const [id, j] of jobs) if (j.projectId === projectId && running(j)) return { jobId: id };
  for (const [id, j] of jobs) if (!running(j) && Date.now() - j.startedAt > 3_600_000) jobs.delete(id);

  // Fail fast, before a job exists, on the two things the user must fix first.
  const c = await client(ws, o);
  const link = await readPublishLink(ws, projectId);
  if (!link) throw new Error("This game is not linked to a Netlify site yet");

  const jobId = crypto.randomUUID().slice(0, 8);
  const job: Job = { projectId, startedAt: Date.now(), status: { phase: "exporting", done: 0, total: 0, bytesDone: 0, bytesTotal: 0 } };
  jobs.set(jobId, job);

  void (async () => {
    try {
      const bundle = await exportGameBundle(ws, distDir, { projectId });
      const r = await c.deployDir(link.siteId, bundle.outputPath, p => { job.status = { ...p }; });
      const url = r.url || link.url;
      const last: LastPublish = {
        at: new Date().toISOString(), siteId: link.siteId, deployId: r.deployId,
        url, deployUrl: r.deployUrl, fileCount: r.fileCount, uploadedCount: r.uploadedCount,
      };
      await atomicWriteText(lastPublishPath(ws, projectId), JSON.stringify(last, null, 2));
      job.status = {
        ...job.status, phase: "done", url, deployUrl: r.deployUrl, fileCount: r.fileCount,
        uploadedCount: r.uploadedCount, uploadedBytes: r.uploadedBytes, missing: bundle.missing,
      };
    } catch (e) {
      console.error(`[publish] ${projectId} failed:`, (e as Error).message);
      job.status = { ...job.status, phase: "error", error: (e as Error).message };
    }
  })();

  return { jobId };
}

export function getPublishStatus(jobId: string): PublishStatus {
  const job = jobs.get(jobId);
  if (!job) throw new Error("Unknown publish job (the app may have restarted)");
  return job.status;
}
