// Publish a game to a hosted site (phases 75 + 76). Backend of the editor's
// Publish modal: the API keys (one per host), the game ↔ site link, and the
// publish job itself (exportGameBundle → the host's upload). Hosts: Netlify
// (file-digest deploy), GitHub Pages (git over REST) and Vercel (digest
// deploy). A game links to ONE host at a time; switching replaces the link
// and leaves the old site alone.
//
// The api transport is one blocking POST per call with no progress channel, so
// a publish runs as an in-memory JOB the modal polls (`getPublishStatus`).

import { exportGameBundle } from "./export.ts";
import { createNetlifyClient, type NetlifyAccount, type NetlifyClient, type NetlifySite, type NetlifyUser } from "./netlify.ts";
import { createGitHubClient, type GitHubClient, type GitHubRepo, type GitHubUser } from "./github.ts";
import { createVercelClient, type VercelClient, type VercelProject, type VercelTeam, type VercelUser } from "./vercel.ts";
import { type PublishLink, readPublishLink, writePublishLink } from "./projects.ts";
import { assertSafeId, atomicWriteText, readSecret, type Workspace, writeSecret } from "./workspace.ts";

export type Provider = "netlify" | "github" | "vercel";
const KEY: Record<Provider, string> = { netlify: "netlifyToken", github: "githubToken", vercel: "vercelToken" };
const LABEL: Record<Provider, string> = { netlify: "Netlify", github: "GitHub", vercel: "Vercel" };

/** Tests pass fake servers + fast timings; the app passes nothing. */
interface Timing { apiBase?: string; retryBaseMs?: number; pollMs?: number }
export interface ClientOverrides extends Timing { github?: Timing; vercel?: Timing }

async function client(ws: Workspace, o?: ClientOverrides): Promise<NetlifyClient> {
  const token = await readSecret(ws, KEY.netlify);
  if (!token) throw new Error("No Netlify API key saved yet");
  const { github: _g, vercel: _v, ...rest } = o ?? {};
  return createNetlifyClient({ token, ...rest });
}

async function vcClient(ws: Workspace, o?: ClientOverrides): Promise<VercelClient> {
  const token = await readSecret(ws, KEY.vercel);
  if (!token) throw new Error("No Vercel token saved yet");
  return createVercelClient({ token, ...(o?.vercel ?? {}) });
}

async function ghClient(ws: Workspace, o?: ClientOverrides): Promise<GitHubClient> {
  const token = await readSecret(ws, KEY.github);
  if (!token) throw new Error("No GitHub token saved yet");
  return createGitHubClient({ token, ...(o?.github ?? {}) });
}

// ── API key ─────────────────────────────────────────────────────────────────
// The key goes IN through netlifySetKey and never comes back out: the frontend
// only ever learns whether one is saved and whose account it is.

export async function netlifyStatus(ws: Workspace, o?: ClientOverrides): Promise<{ connected: boolean; user?: NetlifyUser; error?: string }> {
  if (!(await readSecret(ws, KEY.netlify))) return { connected: false };
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
  const { github: _g, vercel: _v, ...rest } = o ?? {};
  const user = await createNetlifyClient({ token, ...rest }).getUser();
  await writeSecret(ws, KEY.netlify, token);
  return { user };
}

export async function netlifyClearKey(ws: Workspace): Promise<void> {
  await writeSecret(ws, KEY.netlify, null);
}

// ── GitHub token (same rules as the Netlify key) ────────────────────────────

export async function githubStatus(ws: Workspace, o?: ClientOverrides): Promise<{ connected: boolean; user?: GitHubUser; error?: string }> {
  if (!(await readSecret(ws, KEY.github))) return { connected: false };
  try {
    return { connected: true, user: await (await ghClient(ws, o)).getUser() };
  } catch (e) {
    const rejected = (e as { status?: number }).status === 401;
    return { connected: !rejected, error: (e as Error).message };
  }
}

export async function githubSetKey(ws: Workspace, key: string, o?: ClientOverrides): Promise<{ user: GitHubUser }> {
  const token = key.trim();
  if (!token) throw new Error("Paste a GitHub token first");
  const user = await createGitHubClient({ token, ...(o?.github ?? {}) }).getUser();
  await writeSecret(ws, KEY.github, token);
  return { user };
}

export async function githubClearKey(ws: Workspace): Promise<void> {
  await writeSecret(ws, KEY.github, null);
}

export async function githubListRepos(ws: Workspace, o?: ClientOverrides): Promise<{ repos: GitHubRepo[]; user: GitHubUser }> {
  const c = await ghClient(ws, o);
  const [repos, user] = await Promise.all([c.listRepos(), c.getUser()]);
  return { repos, user };
}

export async function githubCreateRepo(ws: Workspace, opts: { name: string; isPrivate: boolean }, o?: ClientOverrides): Promise<GitHubRepo> {
  return (await ghClient(ws, o)).createRepo(opts);
}

// ── Vercel token (same rules) ───────────────────────────────────────────────

export async function vercelStatus(ws: Workspace, o?: ClientOverrides): Promise<{ connected: boolean; user?: VercelUser; error?: string }> {
  if (!(await readSecret(ws, KEY.vercel))) return { connected: false };
  try {
    return { connected: true, user: await (await vcClient(ws, o)).getUser() };
  } catch (e) {
    const rejected = (e as { status?: number }).status === 401;
    return { connected: !rejected, error: (e as Error).message };
  }
}

export async function vercelSetKey(ws: Workspace, key: string, o?: ClientOverrides): Promise<{ user: VercelUser }> {
  const token = key.trim();
  if (!token) throw new Error("Paste a Vercel token first");
  const user = await createVercelClient({ token, ...(o?.vercel ?? {}) }).getUser();
  await writeSecret(ws, KEY.vercel, token);
  return { user };
}

export async function vercelClearKey(ws: Workspace): Promise<void> {
  await writeSecret(ws, KEY.vercel, null);
}

/** Projects across the personal account and every team the token can see. */
export async function vercelListProjects(ws: Workspace, o?: ClientOverrides): Promise<{ projects: VercelProject[]; teams: VercelTeam[]; user: VercelUser }> {
  const c = await vcClient(ws, o);
  const [teams, user] = await Promise.all([c.listTeams(), c.getUser()]);
  const lists = await Promise.all([c.listProjects(null), ...teams.map(t => c.listProjects(t.id))]);
  return { projects: lists.flat(), teams, user };
}

export async function vercelCreateProject(ws: Workspace, opts: { name: string; teamId: string | null }, o?: ClientOverrides): Promise<VercelProject> {
  return (await vcClient(ws, o)).createProject(opts);
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

/** `target` identifies the site the record belongs to: Netlify site id, or GitHub "owner/repo@branch". */
export interface LastPublish { at: string; provider: Provider; target: string; deployId: string; url: string; deployUrl: string; fileCount: number; uploadedCount: number }

const targetOf = (link: PublishLink): string =>
  link.provider === "netlify" ? link.siteId : link.provider === "github" ? `${link.owner}/${link.repo}@${link.branch}` : link.projectId;

const lastPublishPath = (ws: Workspace, projectId: string) => `${ws.stateDir}/publish/${projectId}.json`;

async function readLastPublish(ws: Workspace, projectId: string): Promise<LastPublish | null> {
  try {
    const raw = JSON.parse(await Deno.readTextFile(lastPublishPath(ws, projectId))) as LastPublish & { siteId?: string };
    // phase-75 records predate `provider`/`target`
    if (!raw.provider && raw.siteId) return { ...raw, provider: "netlify", target: raw.siteId };
    return raw;
  } catch {
    return null;
  }
}

/** What the modal needs to draw a game's publish state. `lastPublish` only counts for the CURRENT site. */
export async function getPublishLink(ws: Workspace, projectId: string): Promise<{ link: PublishLink | null; lastPublish: LastPublish | null }> {
  const link = await readPublishLink(ws, projectId);
  const last = await readLastPublish(ws, projectId);
  return { link, lastPublish: link && last?.provider === link.provider && last?.target === targetOf(link) ? last : null };
}

export async function setPublishLink(ws: Workspace, projectId: string, link: PublishLink | null): Promise<void> {
  await writePublishLink(ws, projectId, link);
}

// ── publish job ─────────────────────────────────────────────────────────────

export interface PublishStatus {
  phase: "exporting" | "hashing" | "preparing" | "uploading" | "processing" | "building" | "done" | "error";
  provider: Provider;
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
  /** GitHub only: pushed, but GitHub had not finished building within the wait. */
  stillBuilding?: boolean;
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

  // Fail fast, before a job exists, on the two things the user must fix first:
  // a link, then a key for THAT link's host.
  const link = await readPublishLink(ws, projectId);
  if (!link) throw new Error("This game is not linked to a site yet");
  if (!(await readSecret(ws, KEY[link.provider]))) throw new Error(`This game publishes to ${LABEL[link.provider]}, but no ${LABEL[link.provider]} ${link.provider === "github" ? "token" : "API key"} is saved. Connect ${LABEL[link.provider]} first.`);

  const jobId = crypto.randomUUID().slice(0, 8);
  const blank = { done: 0, total: 0, bytesDone: 0, bytesTotal: 0 };
  const job: Job = { projectId, startedAt: Date.now(), status: { phase: "exporting", provider: link.provider, ...blank } };
  jobs.set(jobId, job);

  void (async () => {
    try {
      const bundle = await exportGameBundle(ws, distDir, { projectId });
      let result: { deployId: string; url: string; deployUrl: string; fileCount: number; uploadedCount: number; uploadedBytes: number; stillBuilding?: boolean };
      if (link.provider === "netlify") {
        const c = await client(ws, o);
        const r = await c.deployDir(link.siteId, bundle.outputPath, p => { job.status = { ...p, provider: "netlify" }; });
        result = { ...r, url: r.url || link.url };
      } else if (link.provider === "github") {
        const c = await ghClient(ws, o);
        const r = await c.deployDir(link.owner, link.repo, link.branch, bundle.outputPath, p => { job.status = { ...p, provider: "github" }; });
        result = { deployId: r.commitSha, url: r.url || link.url, deployUrl: `https://github.com/${link.owner}/${link.repo}/commit/${r.commitSha}`, fileCount: r.fileCount, uploadedCount: r.uploadedCount, uploadedBytes: r.uploadedBytes, stillBuilding: r.stillBuilding };
      } else {
        const c = await vcClient(ws, o);
        const r = await c.deployDir({ id: link.projectId, name: link.projectName, teamId: link.teamId }, bundle.outputPath, p => { job.status = { ...p, provider: "vercel" }; });
        result = { ...r, url: r.url || link.url };
      }
      const last: LastPublish = {
        at: new Date().toISOString(), provider: link.provider, target: targetOf(link), deployId: result.deployId,
        url: result.url, deployUrl: result.deployUrl, fileCount: result.fileCount, uploadedCount: result.uploadedCount,
      };
      await atomicWriteText(lastPublishPath(ws, projectId), JSON.stringify(last, null, 2));
      job.status = {
        ...job.status, phase: "done", url: result.url, deployUrl: result.deployUrl, fileCount: result.fileCount,
        uploadedCount: result.uploadedCount, uploadedBytes: result.uploadedBytes, missing: bundle.missing, stillBuilding: result.stillBuilding,
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
