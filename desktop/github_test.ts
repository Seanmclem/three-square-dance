// deno test -A desktop/github_test.ts
// Phase 76: the GitHub client + publish job, against a FAKE GitHub server that
// keeps a real-enough git object store (blobs, trees, commits, refs) and a
// Pages build queue. Nothing here touches api.github.com or the real workspace.

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createGitHubClient, gitBlobSha } from "./github.ts";
import * as D from "./deploy.ts";
import type { Workspace } from "./workspace.ts";

// ── fake GitHub ─────────────────────────────────────────────────────────────

interface Repo {
  empty: boolean;
  blobs: Map<string, Uint8Array>;
  trees: Map<string, Array<{ path: string; sha: string }>>;   // flattened, full paths
  commits: Map<string, { tree: string; parents: string[] }>;
  refs: Map<string, string>;
  pages: { branch: string; path: string } | null;
  builds: Array<{ status: string; commit: string; polls: number }>;
  isPrivate: boolean;
}

interface Fake {
  apiBase: string;
  repos: Map<string, Repo>;                     // "owner/name"
  requests: string[];
  failNext: Array<{ match: RegExp; status: number; headers?: Record<string, string> }>;
  errorBuilds: boolean;
  close(): Promise<void>;
  newRepo(name: string, opts?: Partial<Repo>): Repo;
}

const OWNER = "octo";
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
let objCounter = 0;
const newSha = () => (++objCounter).toString(16).padStart(40, "0");

function fakeGitHub(): Fake {
  const fake: Fake = {
    apiBase: "", repos: new Map(), requests: [], failNext: [], errorBuilds: false,
    close: () => server.shutdown(),
    newRepo(name, opts) {
      const r: Repo = { empty: true, blobs: new Map(), trees: new Map(), commits: new Map(), refs: new Map(), pages: null, builds: [], isPrivate: false, ...opts };
      fake.repos.set(`${OWNER}/${name}`, r);
      return r;
    },
  };
  const repoJson = (name: string, r: Repo) => ({ name, full_name: `${OWNER}/${name}`, owner: { login: OWNER }, private: r.isPrivate, default_branch: "main", pushed_at: "2026-01-01T00:00:00Z", html_url: `https://github.com/${OWNER}/${name}` });

  const server = Deno.serve({ port: 0, onListen: () => {} }, async req => {
    const url = new URL(req.url);
    const path = url.pathname;
    fake.requests.push(`${req.method} ${path}`);
    const fail = fake.failNext.findIndex(f => f.match.test(`${req.method} ${path}`));
    if (fail >= 0) { const f = fake.failNext.splice(fail, 1)[0]!; return new Response(JSON.stringify({ message: "injected" }), { status: f.status, headers: f.headers ?? {} }); }
    if (req.headers.get("authorization") !== "Bearer good") return Response.json({ message: "Bad credentials" }, { status: 401 });
    const body = req.method === "GET" ? null : await req.json().catch(() => null);
    let m: RegExpMatchArray | null;

    if (req.method === "GET" && path === "/user") return Response.json({ login: OWNER, name: "Octo Cat" });
    if (req.method === "GET" && path === "/user/repos") {
      const page = Number(url.searchParams.get("page"));
      return Response.json(page === 1 ? [...fake.repos].map(([k, r]) => repoJson(k.split("/")[1]!, r)) : []);
    }
    if (req.method === "POST" && path === "/user/repos") {
      if (fake.repos.has(`${OWNER}/${body.name}`)) return Response.json({ message: "Repository creation failed.", errors: [{ message: "name already exists on this account" }] }, { status: 422 });
      const r = fake.newRepo(body.name, { isPrivate: !!body.private });
      return Response.json(repoJson(body.name, r), { status: 201 });
    }
    if (!(m = path.match(/^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/))) return Response.json({ message: "Not Found" }, { status: 404 });
    const repo = fake.repos.get(`${m[1]}/${m[2]}`);
    const name = m[2]!;
    const sub = m[3] ?? "";
    if (!repo) return Response.json({ message: "Not Found" }, { status: 404 });
    if (req.method === "GET" && sub === "") return Response.json(repoJson(name, repo));

    // ── git database ──
    const emptyRefusal = () => Response.json({ message: "Git Repository is empty." }, { status: 409 });
    if (sub.startsWith("/git/") && repo.empty && !(req.method === "GET" && sub.startsWith("/git/ref/"))) return emptyRefusal();
    if (req.method === "GET" && (m = sub.match(/^\/git\/ref\/heads\/(.+)$/))) {
      const sha = repo.refs.get(decodeURIComponent(m[1]!));
      return sha ? Response.json({ object: { sha } }) : Response.json({ message: "Not Found" }, { status: 404 });
    }
    if (req.method === "GET" && (m = sub.match(/^\/git\/commits\/(.+)$/))) {
      const c = repo.commits.get(m[1]!)!;
      return Response.json({ sha: m[1], tree: { sha: c.tree }, parents: c.parents.map(sha => ({ sha })) });
    }
    if (req.method === "GET" && (m = sub.match(/^\/git\/trees\/(.+)$/))) {
      const t = repo.trees.get(m[1]!)!;
      return Response.json({ sha: m[1], truncated: false, tree: t.map(e => ({ path: e.path, type: "blob", mode: "100644", sha: e.sha })) });
    }
    if (req.method === "POST" && sub === "/git/blobs") {
      const bytes = unb64(body.content);
      const sha = await gitBlobSha(bytes as Uint8Array<ArrayBuffer>);
      repo.blobs.set(sha, bytes);
      return Response.json({ sha }, { status: 201 });
    }
    if (req.method === "POST" && sub === "/git/trees") {
      const base = body.base_tree ? [...repo.trees.get(body.base_tree)!] : [];
      const out = new Map(base.map(e => [e.path, e.sha]));
      for (const e of body.tree) {
        if (e.sha === null) out.delete(e.path);
        else { if (!repo.blobs.has(e.sha)) return Response.json({ message: `tree references unknown blob ${e.sha}` }, { status: 422 }); out.set(e.path, e.sha); }
      }
      const sha = newSha();
      repo.trees.set(sha, [...out].map(([path, s]) => ({ path, sha: s })));
      return Response.json({ sha }, { status: 201 });
    }
    if (req.method === "POST" && sub === "/git/commits") {
      const sha = newSha();
      repo.commits.set(sha, { tree: body.tree, parents: body.parents });
      return Response.json({ sha }, { status: 201 });
    }
    if (req.method === "POST" && sub === "/git/refs") {
      const branch = (body.ref as string).replace("refs/heads/", "");
      if (repo.refs.has(branch)) return Response.json({ message: "Reference already exists" }, { status: 422 });
      repo.refs.set(branch, body.sha);
      repo.builds.push({ status: "building", commit: body.sha, polls: 0 });
      return Response.json({ ref: body.ref, object: { sha: body.sha } }, { status: 201 });
    }
    if (req.method === "PATCH" && (m = sub.match(/^\/git\/refs\/heads\/(.+)$/))) {
      const branch = decodeURIComponent(m[1]!);
      const c = repo.commits.get(body.sha)!;
      if (!body.force && !c.parents.includes(repo.refs.get(branch)!)) return Response.json({ message: "Update is not a fast forward" }, { status: 422 });
      repo.refs.set(branch, body.sha);
      repo.builds.push({ status: "building", commit: body.sha, polls: 0 });
      return Response.json({ object: { sha: body.sha } });
    }
    // ── contents (the empty-repo seed) ──
    if (req.method === "PUT" && (m = sub.match(/^\/contents\/(.+)$/))) {
      const bytes = unb64(body.content ?? "");
      const sha = await gitBlobSha(bytes as Uint8Array<ArrayBuffer>);
      repo.blobs.set(sha, bytes);
      const treeSha = newSha();
      repo.trees.set(treeSha, [{ path: m[1]!, sha }]);
      const commitSha = newSha();
      repo.commits.set(commitSha, { tree: treeSha, parents: [] });
      repo.refs.set(body.branch ?? "main", commitSha);
      repo.empty = false;
      return Response.json({ content: { sha }, commit: { sha: commitSha } }, { status: 201 });
    }
    // ── pages ──
    if (sub === "/pages") {
      if (req.method === "GET") return repo.pages ? Response.json({ html_url: `https://${OWNER}.github.io/${name}/`, status: "built", source: repo.pages }) : Response.json({ message: "Not Found" }, { status: 404 });
      if (req.method === "POST") {
        if (repo.pages) return Response.json({ message: "already exists" }, { status: 409 });
        if (repo.isPrivate) return Response.json({ message: "Upgrade to enable Pages on private repos" }, { status: 403 });
        repo.pages = body.source;
        return Response.json({ html_url: `https://${OWNER}.github.io/${name}/` }, { status: 201 });
      }
      if (req.method === "PUT") { repo.pages = body.source; return new Response(null, { status: 204 }); }
    }
    if (req.method === "GET" && sub === "/pages/builds/latest") {
      const b = repo.builds.at(-1);
      if (!b) return Response.json({ message: "Not Found" }, { status: 404 });
      b.polls++;
      if (b.polls >= 2) b.status = fake.errorBuilds ? "errored" : "built";
      return Response.json({ status: b.status, commit: b.commit, error: { message: fake.errorBuilds ? "Jekyll choked" : null } });
    }
    return Response.json({ message: `unhandled ${req.method} ${path}` }, { status: 404 });
  });
  fake.apiBase = `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}`;
  return fake;
}

const FAST = { retryBaseMs: 1, pollMs: 1 };

async function makeBundle(files: Record<string, string>): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "wb-bundle-" });
  for (const [rel, text] of Object.entries(files)) {
    await Deno.mkdir(`${dir}/${rel}`.slice(0, `${dir}/${rel}`.lastIndexOf("/")), { recursive: true });
    await Deno.writeTextFile(`${dir}/${rel}`, text);
  }
  return dir;
}

/** What the fake's branch currently holds, path → content. */
function branchFiles(repo: Repo, branch = "main"): Record<string, string> {
  const c = repo.commits.get(repo.refs.get(branch)!)!;
  const out: Record<string, string> = {};
  for (const e of repo.trees.get(c.tree)!) out[e.path] = new TextDecoder().decode(repo.blobs.get(e.sha)!);
  return out;
}

// ── client ──────────────────────────────────────────────────────────────────

Deno.test("gitBlobSha matches git hash-object", async () => {
  // `printf 'hello\n' | git hash-object --stdin` → ce013625030ba8dba906f756967f9e9ca394464a
  assertEquals(await gitBlobSha(new TextEncoder().encode("hello\n")), "ce013625030ba8dba906f756967f9e9ca394464a");
  // the empty blob (what .nojekyll is)
  assertEquals(await gitBlobSha(new Uint8Array(0)), "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
});

Deno.test("deployDir: first publish into a brand-new EMPTY repo seeds it, pushes everything, enables Pages, waits for the build", async () => {
  const fake = fakeGitHub();
  try {
    const repo = fake.newRepo("my-game");
    const dir = await makeBundle({ "index.html": "<html>", ".nojekyll": "", "scenes/level 1.json": "{}", "assets/a.js": "same", "assets/b.js": "same" });
    const phases: string[] = [];
    const r = await createGitHubClient({ token: "good", apiBase: fake.apiBase, ...FAST })
      .deployDir(OWNER, "my-game", "main", dir, p => { if (phases.at(-1) !== p.phase) phases.push(p.phase); });

    assertEquals(branchFiles(repo), { "index.html": "<html>", ".nojekyll": "", "scenes/level 1.json": "{}", "assets/a.js": "same", "assets/b.js": "same" });
    assertEquals(r.fileCount, 5);
    assertEquals(r.uploadedCount, 4, "a.js/b.js share one blob; .nojekyll was seeded, but the seed happens after hashing so it still counts");
    assertEquals(r.url, `https://${OWNER}.github.io/my-game/`);
    assertEquals(r.stillBuilding, false);
    assertEquals(repo.pages, { branch: "main", path: "/" });
    assertEquals(phases, ["hashing", "preparing", "uploading", "processing", "building"]);
    assert(fake.requests.includes("PUT /repos/octo/my-game/contents/.nojekyll"), "empty repo was seeded through the contents api");
    assertEquals(fake.requests.filter(q => q === "POST /repos/octo/my-game/git/blobs").length, 4 + 1, "one refused blob POST (empty repo) + 4 real ones");
  } finally { await fake.close(); }
});

Deno.test("deployDir: a republish uploads only the changed blob, deletes removed files, keeps Pages as is", async () => {
  const fake = fakeGitHub();
  try {
    const repo = fake.newRepo("my-game");
    const dir = await makeBundle({ "index.html": "<html>", "scenes/a.json": "{\"v\":1}", "assets/old.bin": "x".repeat(5000) });
    const c = createGitHubClient({ token: "good", apiBase: fake.apiBase, ...FAST });
    await c.deployDir(OWNER, "my-game", "main", dir);
    fake.requests.length = 0;

    await Deno.writeTextFile(`${dir}/scenes/a.json`, "{\"v\":2}");
    await Deno.remove(`${dir}/assets/old.bin`);
    const second = await c.deployDir(OWNER, "my-game", "main", dir);
    assertEquals(second.uploadedCount, 1);
    assertEquals(fake.requests.filter(q => q.endsWith("/git/blobs")).length, 1);
    // The branch mirrors the bundle exactly: old.bin gone, and the seed's .nojekyll too since this
    // test bundle lacks one (the real export always writes it, so it stays in practice).
    assertEquals(branchFiles(repo), { "index.html": "<html>", "scenes/a.json": "{\"v\":2}" });
    assert(!fake.requests.includes("POST /repos/octo/my-game/pages"), "Pages not re-created");

    // unchanged third publish: no blobs, no commit, no new build
    fake.requests.length = 0;
    const builds = repo.builds.length;
    const third = await c.deployDir(OWNER, "my-game", "main", dir);
    assertEquals(third.uploadedCount, 0);
    assertEquals(fake.requests.filter(q => q.endsWith("/git/commits") || q.endsWith("/git/blobs")).length, 0);
    assertEquals(repo.builds.length, builds);
    assertEquals(third.url, `https://${OWNER}.github.io/my-game/`);
  } finally { await fake.close(); }
});

Deno.test("deployDir: rate limits and server errors are retried; a permanent failure has a plain message", async () => {
  const fake = fakeGitHub();
  try {
    fake.newRepo("my-game", { empty: false });
    const dir = await makeBundle({ "index.html": "<html>" });
    const c = createGitHubClient({ token: "good", apiBase: fake.apiBase, ...FAST });
    fake.failNext = [
      { match: /POST .*\/git\/blobs/, status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000)) } },
      { match: /POST .*\/git\/blobs/, status: 429, headers: { "retry-after": "1" } },
      { match: /GET .*\/git\/ref\//, status: 502 },
    ];
    const r = await c.deployDir(OWNER, "my-game", "main", dir);
    assertEquals(r.uploadedCount, 1);
    assertEquals(fake.failNext.length, 0, "every injected failure was consumed");

    fake.failNext = Array.from({ length: 6 }, () => ({ match: /GET .*\/git\/ref\//, status: 500 }));
    await assertRejects(() => c.deployDir(OWNER, "my-game", "main", dir), Error, "GitHub had a server problem");
  } finally { await fake.close(); }
});

Deno.test("plain messages: bad token, repo taken, repo gone, private repo Pages, failed build", async () => {
  const fake = fakeGitHub();
  try {
    const good = createGitHubClient({ token: "good", apiBase: fake.apiBase, ...FAST });
    const dir = await makeBundle({ "index.html": "<html>" });
    await assertRejects(() => createGitHubClient({ token: "typo", apiBase: fake.apiBase, ...FAST }).getUser(), Error, "GitHub rejected the token");
    fake.newRepo("taken");
    await assertRejects(() => good.createRepo({ name: "taken", isPrivate: false }), Error, "already exists on this account");
    await assertRejects(() => good.deployDir(OWNER, "gone", "main", dir), Error, "no longer exists on GitHub");
    fake.newRepo("secret", { isPrivate: true });
    await assertRejects(() => good.deployDir(OWNER, "secret", "main", dir), Error, "paid GitHub plan");
    fake.newRepo("broken");
    fake.errorBuilds = true;
    await assertRejects(() => good.deployDir(OWNER, "broken", "main", dir), Error, "could not build the site: Jekyll choked");
  } finally { await fake.close(); }
});

Deno.test("createRepo + listRepos + getRepo round trip", async () => {
  const fake = fakeGitHub();
  try {
    const c = createGitHubClient({ token: "good", apiBase: fake.apiBase, ...FAST });
    const r = await c.createRepo({ name: "fresh-game", isPrivate: false });
    assertEquals(r.fullName, "octo/fresh-game");
    assertEquals((await c.listRepos()).map(x => x.repo), ["fresh-game"]);
    assertEquals((await c.getRepo(OWNER, "fresh-game")).defaultBranch, "main");
    assertEquals((await c.getPages(OWNER, "fresh-game")), null);
  } finally { await fake.close(); }
});

// ── deploy.ts: two providers side by side ───────────────────────────────────

async function tempWorkspace(): Promise<Workspace> {
  const root = await Deno.makeTempDir({ prefix: "wb-ws-" });
  const ws: Workspace = { contentDir: `${root}/content`, stateDir: `${root}/state`, dev: false };
  const game = `${ws.contentDir}/games/mini`;
  await Deno.mkdir(`${game}/scenes`, { recursive: true });
  for (const d of ["exports", "trash"]) await Deno.mkdir(`${ws.stateDir}/${d}`, { recursive: true });
  await Deno.writeTextFile(`${game}/manifest.json`, JSON.stringify({ manifestVersion: 1, id: "mini", name: "Mini", entryScene: "s", scenes: { s: "scenes/s.json" }, assetsBase: "/" }));
  await Deno.writeTextFile(`${game}/scenes/s.json`, JSON.stringify({ world: {}, zones: [] }));
  return ws;
}

async function waitJob(jobId: string): Promise<D.PublishStatus> {
  let s = D.getPublishStatus(jobId);
  for (let i = 0; i < 4000 && s.phase !== "done" && s.phase !== "error"; i++) { await new Promise(r => setTimeout(r, 5)); s = D.getPublishStatus(jobId); }
  return s;
}

Deno.test("deploy.ts: GitHub token is verified before storing, kept apart from the Netlify key; publish to GitHub end to end; the link remembers the provider", async () => {
  const fake = fakeGitHub();
  try {
    const ws = await tempWorkspace();
    const o: D.ClientOverrides = { github: { apiBase: fake.apiBase, ...FAST } };
    const distDir = new URL("../dist", import.meta.url).pathname;

    assertEquals(await D.githubStatus(ws, o), { connected: false });
    await assertRejects(() => D.githubSetKey(ws, "typo", o), Error, "rejected the token");
    assertEquals((await D.githubSetKey(ws, " good ", o)).user.login, "octo");
    const secrets = JSON.parse(await Deno.readTextFile(`${ws.stateDir}/secrets.json`));
    assertEquals(secrets, { githubToken: "good" });   // the Netlify slot untouched (absent)

    // a game linked to Netlify but with no Netlify key must say so, not fall back to GitHub
    await D.setPublishLink(ws, "mini", { provider: "netlify", siteId: "s1", siteName: "n", url: "https://n.netlify.app" });
    await assertRejects(() => D.startPublish(ws, distDir, "mini", o), Error, "publishes to Netlify, but no Netlify API key");

    const repo = await D.githubCreateRepo(ws, { name: "mini-game", isPrivate: false }, o);
    await D.setPublishLink(ws, "mini", { provider: "github", owner: repo.owner, repo: repo.repo, branch: "main", url: `https://octo.github.io/${repo.repo}/` });
    assertEquals(JSON.parse(await Deno.readTextFile(`${ws.contentDir}/games/mini/publish.json`)), { provider: "github", owner: "octo", repo: "mini-game", branch: "main", url: "https://octo.github.io/mini-game/" });

    const { jobId } = await D.startPublish(ws, distDir, "mini", o);
    const status = await waitJob(jobId);
    assertEquals(status.error, undefined);
    assertEquals(status.phase, "done");
    assertEquals(status.provider, "github");
    assertEquals(status.url, "https://octo.github.io/mini-game/");
    assert(status.deployUrl!.startsWith("https://github.com/octo/mini-game/commit/"));
    const files = branchFiles(fake.repos.get("octo/mini-game")!);
    assert("runtime.html" in files && "scenes/s.json" in files && ".nojekyll" in files);
    assert(!("publish.json" in files), "publish.json must not be pushed");
    assert(!Object.keys(files).some(p => /assets\/main-/.test(p)), "the editor chunk must not be pushed");

    const state = await D.getPublishLink(ws, "mini");
    assertEquals(state.lastPublish?.provider, "github");
    assertEquals(state.lastPublish?.target, "octo/mini-game@main");
    // switching back to Netlify forgets GitHub's "last published"
    await D.setPublishLink(ws, "mini", { provider: "netlify", siteId: "s1", siteName: "n", url: "https://n.netlify.app" });
    assertEquals((await D.getPublishLink(ws, "mini")).lastPublish, null);
  } finally { await fake.close(); }
});
