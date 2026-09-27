// GitHub API client (phase 76): the calls the editor's Publish flow needs to put
// a game on GitHub Pages, hand-rolled on fetch like netlify.ts. GitHub has no
// "here are my files" upload, so deployDir speaks git over the REST API: blobs,
// a tree, a commit, a branch pointer. Git blob hashes are computed locally and
// compared with the branch's current tree, so a republish uploads only the
// files that changed, the same as Netlify's digest deploy.
//
// API reference: https://docs.github.com/en/rest (git database, pages, repos)

const DEFAULT_API_BASE = "https://api.github.com";
const USER_AGENT = "WorldBuilder (three-world-builder desktop)";
/** GitHub's secondary rate limits punish bursts of content-creating requests. */
const UPLOAD_CONCURRENCY = 2;
const MAX_TRIES = 5;
const MAX_RATE_LIMIT_WAIT_S = 60;
const UPLOAD_TIMEOUT_MS = 5 * 60_000;
/** GitHub's own build timeout is 10 minutes. */
const BUILD_TIMEOUT_MS = 10 * 60_000;

/** A failure with a message fit to show the user as-is. */
export class GitHubError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export interface GitHubUser { login: string; name: string }
export interface GitHubRepo { owner: string; repo: string; fullName: string; isPrivate: boolean; defaultBranch: string; pushedAt: string; url: string }

export interface DeployProgress {
  phase: "hashing" | "preparing" | "uploading" | "processing" | "building";
  done: number;
  total: number;
  bytesDone: number;
  bytesTotal: number;
}

export interface DeployResult {
  commitSha: string;
  url: string;           // the Pages site URL
  fileCount: number;
  uploadedCount: number;
  uploadedBytes: number;
  /** The site was pushed but GitHub had not finished building it within the wait. */
  stillBuilding: boolean;
}

export interface GitHubClientOptions {
  token: string;
  /** Tests point this at a fake server. */
  apiBase?: string;
  retryBaseMs?: number;
  pollMs?: number;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// deno-lint-ignore no-explicit-any
type Json = any;

export function createGitHubClient(opts: GitHubClientOptions) {
  const apiBase = (opts.apiBase ?? DEFAULT_API_BASE).replace(/\/$/, "");
  const retryBaseMs = opts.retryBaseMs ?? 500;
  const pollMs = opts.pollMs ?? 3000;

  /**
   * One API call with retries. GET is retried on anything transient; POST/PUT/
   * PATCH create things, so they retry only rate limits (which did nothing).
   * Returns `{ status, body }` so callers can branch on 404 / 409 / 422.
   */
  async function raw(method: string, path: string, body?: unknown): Promise<{ status: number; body: Json; headers: Headers }> {
    const idempotent = method === "GET";
    let lastError: Error = new GitHubError("GitHub request failed");
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      if (attempt > 0) await sleep(retryBaseMs * 2 ** (attempt - 1));
      let res: Response;
      try {
        res = await fetch(`${apiBase}${path}`, {
          method,
          body: body === undefined ? undefined : JSON.stringify(body),
          headers: {
            "Authorization": `Bearer ${opts.token}`,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": USER_AGENT,
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          },
          signal: AbortSignal.timeout(method === "POST" ? UPLOAD_TIMEOUT_MS : 60_000),
        });
      } catch (e) {
        lastError = new GitHubError(`Could not reach GitHub (${(e as Error).message})`);
        if (idempotent) continue;
        throw lastError;
      }

      const text = await res.text();
      let json: Json = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = { message: text }; }

      // Primary limit: 403/429 with x-ratelimit-remaining 0; secondary: retry-after.
      const limited = res.status === 429 || (res.status === 403 && (res.headers.get("x-ratelimit-remaining") === "0" || res.headers.has("retry-after")));
      if (limited) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const reset = Number(res.headers.get("x-ratelimit-reset"));
        const waitS = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter
          : Number.isFinite(reset) && reset > 0 ? Math.max(1, Math.ceil(reset - Date.now() / 1000)) : 2;
        lastError = new GitHubError(`GitHub rate limit reached, try again in ${waitS} s`, res.status);
        if (waitS > MAX_RATE_LIMIT_WAIT_S) throw lastError;
        await sleep(waitS * 1000);
        continue;
      }
      if (res.status >= 500) {
        lastError = new GitHubError(`GitHub had a server problem (HTTP ${res.status})`, res.status);
        if (idempotent) continue;
        throw lastError;
      }
      if (res.status === 401) throw new GitHubError("GitHub rejected the token", 401);
      return { status: res.status, body: json, headers: res.headers };
    }
    throw lastError;
  }

  /** Like raw(), but any non-2xx is an error with GitHub's message. */
  async function request(method: string, path: string, body?: unknown): Promise<Json> {
    const r = await raw(method, path, body);
    if (r.status >= 200 && r.status < 300) return r.body;
    throw new GitHubError(detail(r.body) ? `GitHub: ${detail(r.body)}` : `GitHub request failed (HTTP ${r.status})`, r.status);
  }

  const detail = (b: Json): string => typeof b?.message === "string" ? b.message : "";
  const enc = (s: string) => encodeURIComponent(s);
  const repoPath = (owner: string, repo: string) => `/repos/${enc(owner)}/${enc(repo)}`;

  const toRepo = (r: Json): GitHubRepo => ({
    owner: r.owner?.login ?? "",
    repo: r.name,
    fullName: r.full_name ?? `${r.owner?.login}/${r.name}`,
    isPrivate: !!r.private,
    defaultBranch: r.default_branch ?? "main",
    pushedAt: r.pushed_at ?? "",
    url: r.html_url ?? "",
  });

  return {
    async getUser(): Promise<GitHubUser> {
      const u = await request("GET", "/user");
      return { login: u.login, name: u.name || u.login };
    },

    /** Repos the token's user owns, most recently pushed first. */
    async listRepos(): Promise<GitHubRepo[]> {
      const repos: GitHubRepo[] = [];
      for (let page = 1; page <= 20; page++) {
        const batch = await request("GET", `/user/repos?affiliation=owner&sort=pushed&direction=desc&per_page=100&page=${page}`) as Json[];
        repos.push(...batch.map(toRepo));
        if (batch.length < 100) break;
      }
      return repos;
    },

    async getRepo(owner: string, repo: string): Promise<GitHubRepo> {
      const r = await raw("GET", repoPath(owner, repo));
      if (r.status === 404) throw new GitHubError(`The repository ${owner}/${repo} no longer exists on GitHub (or the token cannot see it)`, 404);
      if (r.status >= 300) throw new GitHubError(`GitHub: ${detail(r.body) || r.status}`, r.status);
      return toRepo(r.body);
    },

    /** Repo names: letters, digits, `-`, `_`, `.`; unique per account. */
    async createRepo(o: { name: string; isPrivate: boolean; description?: string }): Promise<GitHubRepo> {
      const r = await raw("POST", "/user/repos", {
        name: o.name, private: o.isPrivate, auto_init: false,
        description: o.description ?? "Published with World Builder", has_issues: false, has_projects: false, has_wiki: false,
      });
      if (r.status === 422) throw new GitHubError(`A repository named "${o.name}" already exists on this account (or the name is not allowed). Pick it from the list, or try another name.`, 422);
      if (r.status === 403) throw new GitHubError(`GitHub refused to create the repository: ${detail(r.body) || "the token may lack the repo scope"}`, 403);
      if (r.status >= 300) throw new GitHubError(`GitHub: ${detail(r.body) || r.status}`, r.status);
      return toRepo(r.body);
    },

    /** The Pages site for a repo, or null when Pages is not enabled. */
    async getPages(owner: string, repo: string): Promise<{ url: string; status: string | null } | null> {
      const r = await raw("GET", `${repoPath(owner, repo)}/pages`);
      if (r.status === 404) return null;
      if (r.status >= 300) throw new GitHubError(`GitHub: ${detail(r.body) || r.status}`, r.status);
      return { url: r.body.html_url ?? "", status: r.body.status ?? null };
    },

    /** Enable Pages from `branch` at the root (or repoint it there). Returns the site URL. */
    async enablePages(owner: string, repo: string, branch: string): Promise<string> {
      const existing = await this.getPages(owner, repo);
      const source = { branch, path: "/" };
      if (!existing) {
        const r = await raw("POST", `${repoPath(owner, repo)}/pages`, { source, build_type: "legacy" });
        if (r.status === 409) { /* enabled by someone else meanwhile */ }
        else if (r.status >= 300) {
          throw new GitHubError(`GitHub would not enable Pages for ${owner}/${repo}: ${detail(r.body) || r.status}${r.status === 403 ? " (Pages on a private repository needs a paid GitHub plan)" : ""}`, r.status);
        }
      } else {
        // Always repoint: a repo the user picked may publish from another branch/folder.
        const r = await raw("PUT", `${repoPath(owner, repo)}/pages`, { source, build_type: "legacy" });
        if (r.status >= 300 && r.status !== 409) throw new GitHubError(`GitHub would not update the Pages source: ${detail(r.body) || r.status}`, r.status);
      }
      return (await this.getPages(owner, repo))?.url || `https://${owner}.github.io/${repo}/`;
    },

    async deployDir(owner: string, repo: string, branch: string, dir: string, onProgress?: (p: DeployProgress) => void): Promise<DeployResult> {
      const base = repoPath(owner, repo);
      await this.getRepo(owner, repo);   // a deleted / invisible repo fails here with a plain message, not mid-upload
      const progress = (phase: DeployProgress["phase"], done = 0, total = 0, bytesDone = 0, bytesTotal = 0) =>
        onProgress?.({ phase, done, total, bytesDone, bytesTotal });

      // 1. hash the bundle as git blobs
      const rels = await walk(dir);
      const local = new Map<string, { sha: string; size: number }>();
      const sizeBySha = new Map<string, number>();
      for (let i = 0; i < rels.length; i++) {
        const bytes = await Deno.readFile(`${dir}/${rels[i]}`);
        const sha = await gitBlobSha(bytes);
        local.set(rels[i]!, { sha, size: bytes.byteLength });
        sizeBySha.set(sha, bytes.byteLength);
        progress("hashing", i + 1, rels.length);
      }

      // 2. what the branch holds now
      progress("preparing");
      let parentSha: string | null = null;
      let baseTree: string | null = null;
      const remote = new Map<string, string>();
      const readBranch = async (): Promise<void> => {
        const ref = await raw("GET", `${base}/git/ref/heads/${enc(branch)}`);
        if (ref.status === 404) return;
        if (ref.status >= 300) throw new GitHubError(`GitHub: ${detail(ref.body) || ref.status}`, ref.status);
        parentSha = ref.body.object.sha;
        const commit = await request("GET", `${base}/git/commits/${parentSha}`);
        baseTree = commit.tree.sha;
        const tree = await request("GET", `${base}/git/trees/${baseTree}?recursive=1`);
        if (tree.truncated) throw new GitHubError("The repository has too many files for GitHub to list");
        for (const e of tree.tree ?? []) if (e.type === "blob") remote.set(e.path, e.sha);
      };
      await readBranch();

      // 3. upload the blobs GitHub lacks — once per hash (identical files share one blob)
      const wanted = new Map<string, string>();   // sha → one path that has it
      for (const [rel, f] of local) if (remote.get(rel) !== f.sha && !wanted.has(f.sha)) wanted.set(f.sha, rel);
      const uploads = [...wanted.entries()];
      const bytesTotal = uploads.reduce((n, [sha]) => n + sizeBySha.get(sha)!, 0);
      let done = 0, bytesDone = 0, next = 0;
      progress("uploading", done, uploads.length, bytesDone, bytesTotal);

      const uploadBlob = async (rel: string, sha: string): Promise<void> => {
        const bytes = await Deno.readFile(`${dir}/${rel}`);
        const r = await raw("POST", `${base}/git/blobs`, { content: toBase64(bytes), encoding: "base64" });
        if (r.status === 409 && /empty/i.test(detail(r.body))) {
          // A brand-new repository refuses the git database API until it has a
          // first commit. Seeding one file through the contents API gets it
          // going; the branch then exists and the normal flow continues.
          const seed = { message: "Enable GitHub Pages (World Builder)", content: "" };
          const first = await raw("PUT", `${base}/contents/.nojekyll`, { ...seed, branch });
          if (first.status >= 300) {
            // Some servers only accept the default branch on an empty repo: seed
            // that, then point our branch at the same commit.
            const dflt = await request("PUT", `${base}/contents/.nojekyll`, seed);
            const sha = dflt.commit?.sha as string;
            const ref = await raw("POST", `${base}/git/refs`, { ref: `refs/heads/${branch}`, sha });
            if (ref.status >= 300 && ref.status !== 422) throw new GitHubError(`GitHub: ${detail(ref.body) || ref.status}`, ref.status);
          }
          await readBranch();
          return uploadBlob(rel, sha);
        }
        if (r.status >= 300) throw new GitHubError(`GitHub would not accept ${rel}: ${detail(r.body) || r.status}`, r.status);
        if (r.body.sha !== sha) throw new GitHubError(`GitHub stored ${rel} under a different hash than expected`);
        bytesDone += bytes.byteLength;
      };
      // The empty-repo seed must happen before any concurrency, so do the first upload alone.
      if (uploads.length) { const [sha, rel] = uploads[0]!; await uploadBlob(rel, sha); done = 1; next = 1; progress("uploading", done, uploads.length, bytesDone, bytesTotal); }
      const worker = async (): Promise<void> => {
        while (next < uploads.length) {
          const [sha, rel] = uploads[next++]!;
          await uploadBlob(rel, sha);
          done++;
          progress("uploading", done, uploads.length, bytesDone, bytesTotal);
        }
      };
      await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, Math.max(0, uploads.length - 1)) }, worker));

      // 4. tree + commit + branch pointer (skipped when nothing changed)
      progress("processing", done, uploads.length, bytesDone, bytesTotal);
      const entries: Json[] = [];
      for (const [rel, f] of local) if (remote.get(rel) !== f.sha) entries.push({ path: rel, mode: "100644", type: "blob", sha: f.sha });
      for (const rel of remote.keys()) if (!local.has(rel)) entries.push({ path: rel, mode: "100644", type: "blob", sha: null });
      let commitSha: string | null = parentSha;
      if (entries.length > 0 || !parentSha) {
        const tree = await request("POST", `${base}/git/trees`, baseTree ? { base_tree: baseTree, tree: entries } : { tree: entries });
        const commit = await request("POST", `${base}/git/commits`, {
          message: `Publish ${new Date().toISOString().slice(0, 16).replace("T", " ")} (World Builder)`,
          tree: tree.sha, parents: parentSha ? [parentSha] : [],
        });
        commitSha = commit.sha as string;
        if (parentSha) await request("PATCH", `${base}/git/refs/heads/${enc(branch)}`, { sha: commitSha, force: false });
        else await request("POST", `${base}/git/refs`, { ref: `refs/heads/${branch}`, sha: commitSha });
      }

      // 5. Pages on, then wait for GitHub's build of THIS commit
      const url = await this.enablePages(owner, repo, branch);
      progress("building", done, uploads.length, bytesDone, bytesTotal);
      const deadline = Date.now() + BUILD_TIMEOUT_MS;
      let stillBuilding = true;
      while (Date.now() < deadline) {
        await sleep(pollMs);
        const b = await raw("GET", `${base}/pages/builds/latest`);
        if (b.status === 404 || b.status >= 300) continue;   // no build yet
        const { status, commit, error } = b.body as { status?: string; commit?: string; error?: { message?: string } };
        if (commit && commit !== commitSha) continue;          // an older build
        if (status === "errored") throw new GitHubError(`GitHub Pages could not build the site: ${error?.message || "unknown error"}`);
        if (status === "built") { stillBuilding = false; break; }
      }

      return { commitSha: commitSha!, url, fileCount: rels.length, uploadedCount: uploads.length, uploadedBytes: bytesTotal, stillBuilding };
    },
  };
}

export type GitHubClient = ReturnType<typeof createGitHubClient>;

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

/** `git hash-object`: sha1("blob <size>\0" + content). */
export async function gitBlobSha(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  const buf = new Uint8Array(header.byteLength + bytes.byteLength);
  buf.set(header, 0);
  buf.set(bytes, header.byteLength);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", buf));
  return [...digest].map(b => b.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}
