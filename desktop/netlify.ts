// Netlify API client (phase 75): just the calls the editor's Publish flow needs,
// hand-rolled on fetch — no CLI, no SDK. Deploys use Netlify's FILE-DIGEST
// method: send {path: sha1} for the whole bundle, upload only the hashes Netlify
// says it lacks. Republishing after a small edit therefore uploads a handful of
// files, not the whole game.
//
// API reference: https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/

const DEFAULT_API_BASE = "https://api.netlify.com/api/v1";
const USER_AGENT = "WorldBuilder (three-world-builder desktop)";
const UPLOAD_CONCURRENCY = 4;
const MAX_TRIES = 5;
const MAX_RATE_LIMIT_WAIT_S = 60;
const DEPLOY_TIMEOUT_MS = 5 * 60_000;

/** A failure with a message fit to show the user as-is. */
export class NetlifyError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export interface NetlifyUser { name: string; email: string }
export interface NetlifyAccount { slug: string; name: string }
export interface NetlifySite { id: string; name: string; url: string; accountSlug: string; updatedAt: string }

export interface DeployProgress {
  phase: "hashing" | "preparing" | "uploading" | "processing";
  done: number;        // files
  total: number;
  bytesDone: number;
  bytesTotal: number;
}

export interface DeployResult {
  deployId: string;
  url: string;          // the site's live URL
  deployUrl: string;    // permalink of this exact deploy
  fileCount: number;
  uploadedCount: number;
  uploadedBytes: number;
}

export interface NetlifyClientOptions {
  token: string;
  /** Tests point this at a fake server. */
  apiBase?: string;
  /** Backoff base + poll interval — tests shrink them. */
  retryBaseMs?: number;
  pollMs?: number;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// deno-lint-ignore no-explicit-any
type Json = any;

export function createNetlifyClient(opts: NetlifyClientOptions) {
  const apiBase = (opts.apiBase ?? DEFAULT_API_BASE).replace(/\/$/, "");
  const retryBaseMs = opts.retryBaseMs ?? 500;
  const pollMs = opts.pollMs ?? 1000;

  /**
   * One API call with retries. GET and PUT are idempotent (Netlify documents
   * file uploads as safe to repeat) so they retry on network errors, 429 and
   * 5xx; POST creates things, so it only retries a 429 (which did nothing).
   */
  async function request(method: string, path: string, body?: BodyInit, contentType?: string): Promise<Json> {
    const idempotent = method !== "POST";
    let lastError: Error = new NetlifyError("Netlify request failed");
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      if (attempt > 0) await sleep(retryBaseMs * 2 ** (attempt - 1));
      let res: Response;
      try {
        res = await fetch(`${apiBase}${path}`, {
          method,
          body,
          headers: {
            "Authorization": `Bearer ${opts.token}`,
            "User-Agent": USER_AGENT,
            ...(contentType ? { "Content-Type": contentType } : {}),
          },
          signal: AbortSignal.timeout(method === "PUT" ? DEPLOY_TIMEOUT_MS : 60_000),
        });
      } catch (e) {
        lastError = new NetlifyError(`Could not reach Netlify (${(e as Error).message})`);
        if (idempotent) continue;
        throw lastError;
      }

      if (res.ok) {
        const text = await res.text();
        return text ? JSON.parse(text) : null;
      }

      const detail = await errorDetail(res);
      if (res.status === 429) {
        const reset = Number(res.headers.get("x-ratelimit-reset"));
        const waitS = Number.isFinite(reset) && reset > 0 ? Math.max(0, Math.ceil(reset - Date.now() / 1000)) : 1;
        lastError = new NetlifyError(`Netlify rate limit reached, try again in ${waitS} s`, 429);
        if (waitS > MAX_RATE_LIMIT_WAIT_S) throw lastError;
        await sleep(waitS * 1000);
        continue;
      }
      if (res.status >= 500) {
        lastError = new NetlifyError(`Netlify had a server problem (HTTP ${res.status})`, res.status);
        if (idempotent) continue;
        throw lastError;
      }
      if (res.status === 401) throw new NetlifyError("Netlify rejected the API key", 401);
      throw new NetlifyError(detail ? `Netlify: ${detail}` : `Netlify request failed (HTTP ${res.status})`, res.status);
    }
    throw lastError;
  }

  async function errorDetail(res: Response): Promise<string> {
    try {
      const j = JSON.parse(await res.text()) as Json;
      if (typeof j?.message === "string") return j.message;
      if (j?.errors) return typeof j.errors === "string" ? j.errors : JSON.stringify(j.errors);
    } catch { /* not JSON */ }
    return "";
  }

  const toSite = (s: Json): NetlifySite => ({
    id: s.id,
    name: s.name,
    url: s.ssl_url || s.url || `https://${s.name}.netlify.app`,
    accountSlug: s.account_slug ?? "",
    updatedAt: s.updated_at ?? "",
  });

  return {
    async getUser(): Promise<NetlifyUser> {
      const u = await request("GET", "/user");
      return { name: u.full_name || u.email || "Netlify user", email: u.email ?? "" };
    },

    async listAccounts(): Promise<NetlifyAccount[]> {
      const list = await request("GET", "/accounts") as Json[];
      return list.map(a => ({ slug: a.slug, name: a.name || a.slug }));
    },

    /** Every site the key can see, newest first. Pages are 100; stop at the first short one. */
    async listSites(): Promise<NetlifySite[]> {
      const sites: NetlifySite[] = [];
      for (let page = 1; page <= 20; page++) {
        const batch = await request("GET", `/sites?filter=all&per_page=100&page=${page}`) as Json[];
        sites.push(...batch.map(toSite));
        if (batch.length < 100) break;
      }
      return sites.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async getSite(siteId: string): Promise<NetlifySite> {
      try {
        return toSite(await request("GET", `/sites/${encodeURIComponent(siteId)}`));
      } catch (e) {
        if ((e as NetlifyError).status === 404) throw new NetlifyError("The linked site no longer exists on Netlify", 404);
        throw e;
      }
    },

    /** `name` becomes <name>.netlify.app, so it is unique across ALL of Netlify. */
    async createSite(o: { name: string; accountSlug?: string }): Promise<NetlifySite> {
      const path = o.accountSlug ? `/${encodeURIComponent(o.accountSlug)}/sites` : "/sites";
      try {
        return toSite(await request("POST", path, JSON.stringify({ name: o.name }), "application/json"));
      } catch (e) {
        if ((e as NetlifyError).status === 422) {
          throw new NetlifyError(`The site name "${o.name}" is taken or not allowed (letters, numbers and hyphens only). Try another.`, 422);
        }
        throw e;
      }
    },

    async deployDir(siteId: string, dir: string, onProgress?: (p: DeployProgress) => void): Promise<DeployResult> {
      // 1. digest the bundle
      const rels = await walk(dir);
      const bad = rels.filter(r => /[#?]/.test(r));
      if (bad.length) throw new NetlifyError(`Netlify cannot host file names containing # or ?: ${bad.join(", ")}`);
      const files: Record<string, string> = {};
      const pathBySha = new Map<string, string>();
      const sizeBySha = new Map<string, number>();
      for (let i = 0; i < rels.length; i++) {
        const bytes = await Deno.readFile(`${dir}/${rels[i]}`);
        const sha = await sha1(bytes);
        files[`/${rels[i]}`] = sha;
        if (!pathBySha.has(sha)) { pathBySha.set(sha, rels[i]!); sizeBySha.set(sha, bytes.byteLength); }
        onProgress?.({ phase: "hashing", done: i + 1, total: rels.length, bytesDone: 0, bytesTotal: 0 });
      }

      // 2. create the deploy; async, so `required` arrives by polling
      const sid = encodeURIComponent(siteId);
      onProgress?.({ phase: "preparing", done: 0, total: 0, bytesDone: 0, bytesTotal: 0 });
      let deploy: Json;
      try {
        deploy = await request("POST", `/sites/${sid}/deploys`, JSON.stringify({ files, async: true }), "application/json");
      } catch (e) {
        if ((e as NetlifyError).status === 404) throw new NetlifyError("The linked site no longer exists on Netlify", 404);
        throw e;
      }
      const deployId = deploy.id as string;
      const deadline = Date.now() + DEPLOY_TIMEOUT_MS;
      const poll = async (): Promise<Json> => {
        if (Date.now() > deadline) throw new NetlifyError("Netlify took too long to process the deploy");
        await sleep(pollMs);
        return await request("GET", `/sites/${sid}/deploys/${encodeURIComponent(deployId)}`);
      };
      const failIfErrored = (d: Json): void => {
        if (d.state === "error") throw new NetlifyError(`Netlify could not finish the deploy: ${d.error_message || "unknown error"}`);
      };
      while (deploy.state === "preparing" || !Array.isArray(deploy.required)) {
        failIfErrored(deploy);
        if (deploy.state === "ready") break;
        deploy = await poll();
      }
      failIfErrored(deploy);

      // 3. upload what Netlify lacks — once per hash, even when several paths share it
      const required = [...new Set((deploy.required ?? []) as string[])];
      const unknown = required.filter(sha => !pathBySha.has(sha));
      if (unknown.length) throw new NetlifyError("Netlify asked for a file this bundle does not contain");
      const bytesTotal = required.reduce((n, sha) => n + sizeBySha.get(sha)!, 0);
      let done = 0, bytesDone = 0, next = 0;
      onProgress?.({ phase: "uploading", done, total: required.length, bytesDone, bytesTotal });
      const worker = async (): Promise<void> => {
        while (next < required.length) {
          const sha = required[next++]!;
          const rel = pathBySha.get(sha)!;
          const bytes = await Deno.readFile(`${dir}/${rel}`);
          const escaped = rel.split("/").map(encodeURIComponent).join("/");
          await request("PUT", `/deploys/${encodeURIComponent(deployId)}/files/${escaped}`, bytes, "application/octet-stream");
          done++;
          bytesDone += bytes.byteLength;
          onProgress?.({ phase: "uploading", done, total: required.length, bytesDone, bytesTotal });
        }
      };
      await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, required.length) }, worker));

      // 4. wait for it to go live
      onProgress?.({ phase: "processing", done, total: required.length, bytesDone, bytesTotal });
      while (deploy.state !== "ready") {
        deploy = await poll();
        failIfErrored(deploy);
      }

      return {
        deployId,
        url: deploy.ssl_url || deploy.url || "",
        deployUrl: deploy.deploy_ssl_url || deploy.deploy_url || "",
        fileCount: rels.length,
        uploadedCount: required.length,
        uploadedBytes: bytesTotal,
      };
    },
  };
}

export type NetlifyClient = ReturnType<typeof createNetlifyClient>;

/** Every file under `dir`, as sorted "/"-separated relative paths. */
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
