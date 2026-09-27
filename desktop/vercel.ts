// Vercel API client (phase 76b): the calls the editor's Publish flow needs,
// hand-rolled on fetch like netlify.ts. Deploys are digest-based here too: the
// deployment lists every file as {file, sha1, size}; Vercel answers
// `missing_files` for the hashes it does not already store, those get uploaded
// to /v2/files, and the deployment is created again. A republish after a small
// edit uploads a handful of files. Static files need no build, so a deployment
// is usually READY within seconds.
//
// API reference: https://vercel.com/docs/rest-api (deployments, files, projects)

const DEFAULT_API_BASE = "https://api.vercel.com";
const USER_AGENT = "WorldBuilder (three-world-builder desktop)";
const UPLOAD_CONCURRENCY = 4;
const MAX_TRIES = 5;
const MAX_RATE_LIMIT_WAIT_S = 60;
const DEPLOY_TIMEOUT_MS = 5 * 60_000;

/** A failure with a message fit to show the user as-is. */
export class VercelError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string, readonly missing?: string[]) {
    super(message);
  }
}

export interface VercelUser { username: string; name: string }
export interface VercelTeam { id: string; slug: string; name: string }
export interface VercelProject { id: string; name: string; url: string; teamId: string | null; updatedAt: string }

export interface DeployProgress {
  phase: "hashing" | "preparing" | "uploading" | "processing";
  done: number;
  total: number;
  bytesDone: number;
  bytesTotal: number;
}

export interface DeployResult {
  deployId: string;
  url: string;          // the project's production URL
  deployUrl: string;    // permalink of this exact deployment
  fileCount: number;
  uploadedCount: number;
  uploadedBytes: number;
}

export interface VercelClientOptions {
  token: string;
  /** Tests point this at a fake server. */
  apiBase?: string;
  retryBaseMs?: number;
  pollMs?: number;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// deno-lint-ignore no-explicit-any
type Json = any;

export function createVercelClient(opts: VercelClientOptions) {
  const apiBase = (opts.apiBase ?? DEFAULT_API_BASE).replace(/\/$/, "");
  const retryBaseMs = opts.retryBaseMs ?? 500;
  const pollMs = opts.pollMs ?? 1000;

  const team = (teamId: string | null | undefined, sep = "?") => teamId ? `${sep}teamId=${encodeURIComponent(teamId)}` : "";

  /**
   * One API call with retries. GET and the file upload are safe to repeat
   * (uploads are keyed by digest), so they retry network errors, 429 and 5xx;
   * other POSTs create things and retry only a 429 (which did nothing).
   */
  async function request(method: string, path: string, body?: BodyInit, headers?: Record<string, string>, idempotent = method === "GET"): Promise<Json> {
    let lastError: Error = new VercelError("Vercel request failed");
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      if (attempt > 0) await sleep(retryBaseMs * 2 ** (attempt - 1));
      let res: Response;
      try {
        res = await fetch(`${apiBase}${path}`, {
          method, body,
          headers: { "Authorization": `Bearer ${opts.token}`, "User-Agent": USER_AGENT, ...(headers ?? {}) },
          signal: AbortSignal.timeout(DEPLOY_TIMEOUT_MS),
        });
      } catch (e) {
        lastError = new VercelError(`Could not reach Vercel (${(e as Error).message})`);
        if (idempotent) continue;
        throw lastError;
      }
      const text = await res.text();
      let json: Json = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = { error: { message: text } }; }
      if (res.ok) return json;

      const err = json?.error ?? {};
      if (res.status === 429) {
        const reset = Number(res.headers.get("x-ratelimit-reset"));
        const retryAfter = Number(res.headers.get("retry-after"));
        const waitS = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter
          : Number.isFinite(reset) && reset > 0 ? Math.max(1, Math.ceil(reset - Date.now() / 1000)) : 2;
        lastError = new VercelError(`Vercel rate limit reached, try again in ${waitS} s`, 429);
        if (waitS > MAX_RATE_LIMIT_WAIT_S) throw lastError;
        await sleep(waitS * 1000);
        continue;
      }
      if (res.status >= 500) {
        lastError = new VercelError(`Vercel had a server problem (HTTP ${res.status})`, res.status);
        if (idempotent) continue;
        throw lastError;
      }
      if (res.status === 401 || res.status === 403 && err.code === "forbidden" && /token/i.test(err.message ?? "")) throw new VercelError("Vercel rejected the token", 401);
      throw new VercelError(err.message ? `Vercel: ${err.message}` : `Vercel request failed (HTTP ${res.status})`, res.status, err.code, err.missing);
    }
    throw lastError;
  }

  const json = (method: string, path: string, body: unknown, idempotent = false) =>
    request(method, path, JSON.stringify(body), { "Content-Type": "application/json" }, idempotent);

  const toProject = (p: Json, teamId: string | null): VercelProject => {
    // Production domain: a project's `alias`/`targets` carry it once deployed; before that it is <name>.vercel.app.
    const prod = (p.alias ?? []).find((a: Json) => a?.environment === "production" || a?.target === "PRODUCTION")?.domain
      ?? p.targets?.production?.alias?.find((a: string) => a.endsWith(".vercel.app"))
      ?? `${p.name}.vercel.app`;
    return { id: p.id, name: p.name, url: `https://${prod}`, teamId, updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : "" };
  };

  return {
    async getUser(): Promise<VercelUser> {
      const r = await request("GET", "/v2/user");
      const u = r.user ?? r;
      return { username: u.username ?? "", name: u.name || u.username || u.email || "Vercel user" };
    },

    async listTeams(): Promise<VercelTeam[]> {
      const r = await request("GET", "/v2/teams?limit=100");
      return (r.teams ?? []).map((t: Json) => ({ id: t.id, slug: t.slug, name: t.name || t.slug }));
    },

    /** Projects of the personal account (teamId null) or of one team, newest first. */
    async listProjects(teamId: string | null): Promise<VercelProject[]> {
      const out: VercelProject[] = [];
      let until: number | null = null;
      for (let page = 0; page < 20; page++) {
        const r = await request("GET", `/v9/projects?limit=100${team(teamId, "&")}${until ? `&until=${until}` : ""}`);
        out.push(...(r.projects ?? []).map((p: Json) => toProject(p, teamId)));
        until = r.pagination?.next ?? null;
        if (!until || (r.projects ?? []).length < 100) break;
      }
      return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    /** `name` becomes <name>.vercel.app when free (Vercel adds a suffix otherwise); unique per account. */
    async createProject(o: { name: string; teamId: string | null }): Promise<VercelProject> {
      try {
        return toProject(await json("POST", `/v11/projects${team(o.teamId)}`, { name: o.name, framework: null }), o.teamId);
      } catch (e) {
        const err = e as VercelError;
        if (err.status === 409 || err.status === 400 && /exist|taken|conflict/i.test(err.message)) {
          throw new VercelError(`A project named "${o.name}" already exists on this account. Pick it from the list, or try another name.`, err.status);
        }
        throw e;
      }
    },

    async getProject(id: string, teamId: string | null): Promise<VercelProject> {
      try {
        return toProject(await request("GET", `/v9/projects/${encodeURIComponent(id)}${team(teamId)}`), teamId);
      } catch (e) {
        if ((e as VercelError).status === 404) throw new VercelError("The linked Vercel project no longer exists (or the token cannot see it)", 404);
        throw e;
      }
    },

    async deployDir(project: { id: string; name: string; teamId: string | null }, dir: string, onProgress?: (p: DeployProgress) => void): Promise<DeployResult> {
      // 1. digest the bundle
      const rels = await walk(dir);
      const entries: Array<{ file: string; sha: string; size: number }> = [];
      const relBySha = new Map<string, string>();
      const sizeBySha = new Map<string, number>();
      for (let i = 0; i < rels.length; i++) {
        const bytes = await Deno.readFile(`${dir}/${rels[i]}`);
        const sha = await sha1(bytes);
        entries.push({ file: rels[i]!, sha, size: bytes.byteLength });
        if (!relBySha.has(sha)) { relBySha.set(sha, rels[i]!); sizeBySha.set(sha, bytes.byteLength); }
        onProgress?.({ phase: "hashing", done: i + 1, total: rels.length, bytesDone: 0, bytesTotal: 0 });
      }

      // 2. try to create the deployment; Vercel names the hashes it lacks
      onProgress?.({ phase: "preparing", done: 0, total: 0, bytesDone: 0, bytesTotal: 0 });
      const body = { name: project.name, project: project.id, files: entries, target: "production", projectSettings: { framework: null } };
      const create = (): Promise<Json> => json("POST", `/v13/deployments${team(project.teamId)}`, body);
      let deploy: Json;
      let required: string[] = [];
      try {
        deploy = await create();
      } catch (e) {
        const err = e as VercelError;
        if (err.code !== "missing_files" || !err.missing) {
          if (err.status === 404) throw new VercelError("The linked Vercel project no longer exists (or the token cannot see it)", 404);
          throw e;
        }
        required = [...new Set(err.missing)];
        const unknown = required.filter(sha => !relBySha.has(sha));
        if (unknown.length) throw new VercelError("Vercel asked for a file this bundle does not contain");

        // 3. upload what Vercel lacks — once per hash, even when several paths share it
        const bytesTotal = required.reduce((n, sha) => n + sizeBySha.get(sha)!, 0);
        let done = 0, bytesDone = 0, next = 0;
        onProgress?.({ phase: "uploading", done, total: required.length, bytesDone, bytesTotal });
        const worker = async (): Promise<void> => {
          while (next < required.length) {
            const sha = required[next++]!;
            const bytes = await Deno.readFile(`${dir}/${relBySha.get(sha)!}`);
            await request("POST", `/v2/files${team(project.teamId)}`, bytes, {
              "Content-Type": "application/octet-stream", "x-vercel-digest": sha, "Content-Length": String(bytes.byteLength),
            }, true);
            done++;
            bytesDone += bytes.byteLength;
            onProgress?.({ phase: "uploading", done, total: required.length, bytesDone, bytesTotal });
          }
        };
        await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, required.length) }, worker));
        deploy = await create();
      }

      // 4. wait for it to go live
      onProgress?.({ phase: "processing", done: required.length, total: required.length, bytesDone: 0, bytesTotal: 0 });
      const deadline = Date.now() + DEPLOY_TIMEOUT_MS;
      const id = deploy.id as string;
      while (deploy.readyState !== "READY") {
        if (deploy.readyState === "ERROR" || deploy.readyState === "CANCELED") {
          throw new VercelError(`Vercel could not finish the deployment: ${deploy.errorMessage || deploy.readyState}`);
        }
        if (Date.now() > deadline) throw new VercelError("Vercel took too long to process the deployment");
        await sleep(pollMs);
        deploy = await request("GET", `/v13/deployments/${encodeURIComponent(id)}${team(project.teamId)}`);
      }
      const aliases: string[] = (deploy.alias ?? []).map((a: Json) => typeof a === "string" ? a : a?.domain).filter(Boolean);
      const prod = aliases.find(a => a === `${project.name}.vercel.app`) ?? aliases.find(a => a.endsWith(".vercel.app")) ?? aliases[0];
      return {
        deployId: id,
        url: prod ? `https://${prod}` : "",
        deployUrl: deploy.url ? `https://${deploy.url}` : "",
        fileCount: rels.length,
        uploadedCount: required.length,
        uploadedBytes: required.reduce((n, sha) => n + sizeBySha.get(sha)!, 0),
      };
    },
  };
}

export type VercelClient = ReturnType<typeof createVercelClient>;

/** Every file under `dir`, as sorted "/"-separated relative paths (no leading slash: Vercel's convention). */
async function walk(dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for await (const e of Deno.readDir(prefix ? `${dir}/${prefix}` : dir)) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory) out.push(...await walk(dir, rel));
    else if (e.isFile) out.push(rel);
  }
  return out.sort();
}

async function sha1(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes));
  return [...digest].map(b => b.toString(16).padStart(2, "0")).join("");
}
