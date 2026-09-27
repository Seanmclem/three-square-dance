// deno test -A desktop/vercel_test.ts
// Phase 76b: the Vercel client + publish job against a FAKE Vercel server.
// Nothing here touches api.vercel.com or the real workspace.

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createVercelClient } from "./vercel.ts";
import * as D from "./deploy.ts";
import type { Workspace } from "./workspace.ts";

interface Fake {
  apiBase: string;
  stored: Set<string>;                       // digests Vercel already has
  uploads: Array<{ sha: string; size: number; teamId: string | null }>;
  deployBodies: Json[];
  deployments: Map<string, { readyState: string; polls: number; alias: string[]; url: string }>;
  failNext: Array<{ match: RegExp; status: number; headers?: Record<string, string> }>;
  errorDeploys: boolean;
  requests: string[];
  close(): Promise<void>;
}
// deno-lint-ignore no-explicit-any
type Json = any;

async function sha1Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes));
  return [...d].map(b => b.toString(16).padStart(2, "0")).join("");
}

function fakeVercel(): Fake {
  const projects = new Map<string, { id: string; name: string; teamId: string | null }>();   // id → project
  const add = (name: string, teamId: string | null) => { const p = { id: `prj_${name}`, name, teamId }; projects.set(p.id, p); return p; };
  add("portfolio", null); add("team-thing", "team_1");
  const fake: Fake = {
    apiBase: "", stored: new Set(), uploads: [], deployBodies: [], deployments: new Map(), failNext: [], errorDeploys: false, requests: [],
    close: () => server.shutdown(),
  };
  let n = 0;
  const server = Deno.serve({ port: 0, onListen: () => {} }, async req => {
    const url = new URL(req.url);
    const path = url.pathname;
    const teamId = url.searchParams.get("teamId");
    fake.requests.push(`${req.method} ${path}${teamId ? `?team=${teamId}` : ""}`);
    const fail = fake.failNext.findIndex(f => f.match.test(`${req.method} ${path}`));
    if (fail >= 0) { const f = fake.failNext.splice(fail, 1)[0]!; return new Response(JSON.stringify({ error: { code: "x", message: "injected" } }), { status: f.status, headers: f.headers ?? {} }); }
    if (req.headers.get("authorization") !== "Bearer good") return Response.json({ error: { code: "forbidden", message: "Not authorized" } }, { status: 401 });
    let m: RegExpMatchArray | null;

    if (path === "/v2/user") return Response.json({ user: { username: "sean", name: "Sean V" } });
    if (path === "/v2/teams") return Response.json({ teams: [{ id: "team_1", slug: "acme", name: "Acme" }] });
    if (req.method === "GET" && path === "/v9/projects") {
      const list = [...projects.values()].filter(p => p.teamId === teamId).map(p => ({ id: p.id, name: p.name, updatedAt: 1700000000000, alias: [] }));
      return Response.json({ projects: list, pagination: { next: null } });
    }
    if (req.method === "POST" && path === "/v11/projects") {
      const body = await req.json();
      if ([...projects.values()].some(p => p.name === body.name && p.teamId === teamId)) return Response.json({ error: { code: "conflict", message: "Project already exists" } }, { status: 409 });
      const p = add(body.name, teamId);
      return Response.json({ id: p.id, name: p.name, updatedAt: Date.now(), alias: [] });
    }
    if (req.method === "GET" && (m = path.match(/^\/v9\/projects\/([^/]+)$/))) {
      const p = projects.get(m[1]!);
      return p ? Response.json({ id: p.id, name: p.name, alias: [] }) : Response.json({ error: { code: "not_found", message: "Project not found" } }, { status: 404 });
    }
    if (req.method === "POST" && path === "/v2/files") {
      const bytes = new Uint8Array(await req.arrayBuffer());
      const sha = await sha1Hex(bytes);
      if (sha !== req.headers.get("x-vercel-digest")) return Response.json({ error: { code: "bad_digest", message: "Digest is not valid" } }, { status: 400 });
      fake.stored.add(sha);
      fake.uploads.push({ sha, size: bytes.byteLength, teamId });
      return Response.json({});
    }
    if (req.method === "POST" && path === "/v13/deployments") {
      const body = await req.json();
      fake.deployBodies.push(body);
      if (!projects.has(body.project)) return Response.json({ error: { code: "not_found", message: "Project not found" } }, { status: 404 });
      const missing = [...new Set((body.files as Json[]).map(f => f.sha as string))].filter(s => !fake.stored.has(s));
      if (missing.length) return Response.json({ error: { code: "missing_files", message: "Missing files", missing } }, { status: 400 });
      const id = `dpl_${++n}`;
      const name = projects.get(body.project)!.name;
      fake.deployments.set(id, { readyState: "QUEUED", polls: 0, alias: [`${name}.vercel.app`, `${name}-git-main-sean.vercel.app`], url: `${name}-abc123.vercel.app` });
      return Response.json({ id, readyState: "QUEUED", url: `${name}-abc123.vercel.app` });
    }
    if (req.method === "GET" && (m = path.match(/^\/v13\/deployments\/([^/]+)$/))) {
      const d = fake.deployments.get(m[1]!)!;
      d.polls++;
      if (d.polls >= 2) d.readyState = fake.errorDeploys ? "ERROR" : "READY";
      return Response.json({ id: m[1], readyState: d.readyState, url: d.url, alias: d.readyState === "READY" ? d.alias : [], errorMessage: fake.errorDeploys ? "build exploded" : undefined });
    }
    return Response.json({ error: { code: "not_found", message: `unhandled ${req.method} ${path}` } }, { status: 404 });
  });
  fake.apiBase = `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}`;
  return fake;
}

const FAST = { retryBaseMs: 1, pollMs: 1 };
const PRJ = { id: "prj_portfolio", name: "portfolio", teamId: null };

async function makeBundle(files: Record<string, string>): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "wb-bundle-" });
  for (const [rel, text] of Object.entries(files)) {
    await Deno.mkdir(`${dir}/${rel}`.slice(0, `${dir}/${rel}`.lastIndexOf("/")), { recursive: true });
    await Deno.writeTextFile(`${dir}/${rel}`, text);
  }
  return dir;
}

Deno.test("deployDir: lists every file without a leading slash, uploads only the missing digests once each, waits for READY", async () => {
  const fake = fakeVercel();
  try {
    const dir = await makeBundle({ "index.html": "<html>", "scenes/level 1.json": "{}", "assets/a.js": "same", "assets/b.js": "same", "assets/old.js": "already there" });
    fake.stored.add(await sha1Hex(new TextEncoder().encode("already there")));
    const phases: string[] = [];
    const r = await createVercelClient({ token: "good", apiBase: fake.apiBase, ...FAST })
      .deployDir(PRJ, dir, p => { if (phases.at(-1) !== p.phase) phases.push(p.phase); });

    assertEquals(fake.deployBodies.length, 2, "first attempt refused with missing_files, second accepted");
    const files = fake.deployBodies[0].files as Array<{ file: string; sha: string; size: number }>;
    assertEquals(files.map(f => f.file), ["assets/a.js", "assets/b.js", "assets/old.js", "index.html", "scenes/level 1.json"]);
    assertEquals(files[3]!.sha, await sha1Hex(new TextEncoder().encode("<html>")));
    assertEquals(files[3]!.size, 6);
    assertEquals(fake.deployBodies[0].target, "production");
    assertEquals(fake.deployBodies[0].project, "prj_portfolio");
    assertEquals(fake.uploads.length, 3, "a/b share a digest; old.js was stored");
    assertEquals(r.uploadedCount, 3);
    assertEquals(r.fileCount, 5);
    assertEquals(r.url, "https://portfolio.vercel.app");
    assertEquals(r.deployUrl, "https://portfolio-abc123.vercel.app");
    assertEquals(phases, ["hashing", "preparing", "uploading", "processing"]);
  } finally { await fake.close(); }
});

Deno.test("deployDir: a republish uploads only the changed file; an unchanged one uploads nothing", async () => {
  const fake = fakeVercel();
  try {
    const dir = await makeBundle({ "index.html": "<html>", "scenes/a.json": "{\"v\":1}", "assets/big.bin": "x".repeat(5000) });
    const c = createVercelClient({ token: "good", apiBase: fake.apiBase, ...FAST });
    assertEquals((await c.deployDir(PRJ, dir)).uploadedCount, 3);
    await Deno.writeTextFile(`${dir}/scenes/a.json`, "{\"v\":2}");
    fake.uploads.length = 0;
    const second = await c.deployDir(PRJ, dir);
    assertEquals(second.uploadedCount, 1);
    assertEquals(fake.uploads.length, 1);
    fake.uploads.length = 0;
    const third = await c.deployDir(PRJ, dir);
    assertEquals(third.uploadedCount, 0);
    assertEquals(fake.uploads.length, 0);
    assertEquals(third.url, "https://portfolio.vercel.app");
  } finally { await fake.close(); }
});

Deno.test("deployDir: team projects send teamId on every call", async () => {
  const fake = fakeVercel();
  try {
    const dir = await makeBundle({ "index.html": "<html>" });
    await createVercelClient({ token: "good", apiBase: fake.apiBase, ...FAST }).deployDir({ id: "prj_team-thing", name: "team-thing", teamId: "team_1" }, dir);
    const calls = fake.requests.filter(q => q.includes("/v2/files") || q.includes("/v13/deployments"));
    assert(calls.length >= 3 && calls.every(q => q.endsWith("?team=team_1")), calls.join("\n"));
  } finally { await fake.close(); }
});

Deno.test("retries: 429 / 500 on uploads and polls are retried; a permanent failure has a plain message", async () => {
  const fake = fakeVercel();
  try {
    const dir = await makeBundle({ "index.html": "<html>", "a.js": "1" });
    const c = createVercelClient({ token: "good", apiBase: fake.apiBase, ...FAST });
    fake.failNext = [
      { match: /POST \/v2\/files/, status: 429, headers: { "retry-after": "1" } },
      { match: /POST \/v2\/files/, status: 503 },
      { match: /GET \/v13\/deployments\//, status: 502 },
    ];
    const r = await c.deployDir(PRJ, dir);
    assertEquals(r.uploadedCount, 2);
    assertEquals(fake.failNext.length, 0);
    fake.failNext = Array.from({ length: 6 }, () => ({ match: /POST \/v2\/files/, status: 500 }));
    const dir2 = await makeBundle({ "index.html": "<html2>" });
    await assertRejects(() => c.deployDir(PRJ, dir2), Error, "Vercel had a server problem");
  } finally { await fake.close(); }
});

Deno.test("plain messages: bad token, project taken, project gone, failed deployment", async () => {
  const fake = fakeVercel();
  try {
    const good = createVercelClient({ token: "good", apiBase: fake.apiBase, ...FAST });
    const dir = await makeBundle({ "index.html": "<html>" });
    await assertRejects(() => createVercelClient({ token: "typo", apiBase: fake.apiBase, ...FAST }).getUser(), Error, "Vercel rejected the token");
    await assertRejects(() => good.createProject({ name: "portfolio", teamId: null }), Error, "already exists on this account");
    await assertRejects(() => good.deployDir({ id: "prj_gone", name: "gone", teamId: null }, dir), Error, "no longer exists");
    fake.errorDeploys = true;
    await assertRejects(() => good.deployDir(PRJ, dir), Error, "could not finish the deployment: build exploded");
  } finally { await fake.close(); }
});

// ── deploy.ts: three hosts side by side ────────────────────────────────────

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

Deno.test("deploy.ts: Vercel token in its own slot; listing spans account + teams; publish end to end; link remembers the provider", async () => {
  const fake = fakeVercel();
  try {
    const ws = await tempWorkspace();
    const o: D.ClientOverrides = { vercel: { apiBase: fake.apiBase, ...FAST } };
    const distDir = new URL("../dist", import.meta.url).pathname;

    await assertRejects(() => D.vercelSetKey(ws, "typo", o), Error, "rejected the token");
    assertEquals((await D.vercelSetKey(ws, " good ", o)).user.username, "sean");
    assertEquals(JSON.parse(await Deno.readTextFile(`${ws.stateDir}/secrets.json`)), { vercelToken: "good" });

    const listed = await D.vercelListProjects(ws, o);
    assertEquals(listed.teams.map(t => t.slug), ["acme"]);
    assertEquals(listed.projects.map(p => `${p.name}@${p.teamId}`).sort(), ["portfolio@null", "team-thing@team_1"]);

    await D.setPublishLink(ws, "mini", { provider: "github", owner: "o", repo: "r", branch: "main", url: "https://o.github.io/r/" });
    await assertRejects(() => D.startPublish(ws, distDir, "mini", o), Error, "publishes to GitHub, but no GitHub token");

    const p = await D.vercelCreateProject(ws, { name: "mini-game", teamId: null }, o);
    await D.setPublishLink(ws, "mini", { provider: "vercel", projectId: p.id, projectName: p.name, teamId: null, url: p.url });
    assertEquals(JSON.parse(await Deno.readTextFile(`${ws.contentDir}/games/mini/publish.json`)), { provider: "vercel", projectId: "prj_mini-game", projectName: "mini-game", teamId: null, url: "https://mini-game.vercel.app" });

    const { jobId } = await D.startPublish(ws, distDir, "mini", o);
    let s = D.getPublishStatus(jobId);
    for (let i = 0; i < 4000 && s.phase !== "done" && s.phase !== "error"; i++) { await new Promise(r => setTimeout(r, 5)); s = D.getPublishStatus(jobId); }
    assertEquals(s.error, undefined);
    assertEquals(s.phase, "done");
    assertEquals(s.provider, "vercel");
    assertEquals(s.url, "https://mini-game.vercel.app");
    assert(s.uploadedCount! > 5 && s.uploadedCount === s.fileCount);
    const files = (fake.deployBodies.at(-1).files as Array<{ file: string }>).map(f => f.file);
    assert(files.includes("runtime.html") && files.includes(".nojekyll") && files.includes("scenes/s.json"));
    assert(!files.includes("publish.json") && !files.some(f => /assets\/main-/.test(f)));
    assertEquals((await D.getPublishLink(ws, "mini")).lastPublish?.target, "prj_mini-game");
  } finally { await fake.close(); }
});
