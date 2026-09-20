// deno test -A desktop/netlify_test.ts
// Phase 75: the Netlify client + publish job, against a FAKE Netlify server —
// nothing here touches api.netlify.com or the real workspace.

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createNetlifyClient } from "./netlify.ts";
import * as D from "./deploy.ts";
import { readPublishLink } from "./projects.ts";
import type { Workspace } from "./workspace.ts";

// ── fake Netlify ────────────────────────────────────────────────────────────

interface Fake {
  apiBase: string;
  known: Set<string>;                 // hashes "Netlify" already stores
  puts: Array<{ rawPath: string; path: string; sha: string }>;
  deployBodies: Array<{ files: Record<string, string>; async?: boolean }>;
  failPuts: number[];                 // statuses to answer the next PUTs with, in order
  errorDeploys: boolean;              // deploys end in state "error"
  requests: string[];
  close(): Promise<void>;
}

async function sha1Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes));
  return [...d].map(b => b.toString(16).padStart(2, "0")).join("");
}

function fakeNetlify(): Fake {
  const deploys = new Map<string, { required: string[]; files: Record<string, string>; polls: number }>();
  const fake: Fake = {
    apiBase: "", known: new Set(), puts: [], deployBodies: [], failPuts: [], errorDeploys: false, requests: [],
    close: () => server.shutdown(),
  };
  const server = Deno.serve({ port: 0, onListen: () => {} }, async req => {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api\/v1/, "");
    fake.requests.push(`${req.method} ${path}`);
    if (req.headers.get("authorization") !== "Bearer good") {
      return Response.json({ code: 401, message: "Access Denied" }, { status: 401 });
    }
    let m: RegExpMatchArray | null;

    if (req.method === "GET" && path === "/user") return Response.json({ full_name: "Test User", email: "t@example.com" });
    if (req.method === "GET" && path === "/accounts") return Response.json([{ slug: "team-a", name: "Team A" }]);
    if (req.method === "GET" && path === "/sites") {
      const page = Number(url.searchParams.get("page"));
      const count = page === 1 ? 100 : page === 2 ? 50 : 0;   // 150 sites over two pages
      return Response.json(Array.from({ length: count }, (_, i) => {
        const n = (page - 1) * 100 + i;
        return { id: `site-${n}`, name: `game-${n}`, ssl_url: `https://game-${n}.netlify.app`, account_slug: "team-a", updated_at: `2026-01-01T00:00:${String(n % 60).padStart(2, "0")}Z` };
      }));
    }
    if (req.method === "POST" && (path === "/sites" || path === "/team-a/sites")) {
      const { name } = await req.json();
      if (name === "taken") return Response.json({ errors: { subdomain: ["must be unique"] } }, { status: 422 });
      return Response.json({ id: "new-site", name, ssl_url: `https://${name}.netlify.app`, account_slug: path === "/sites" ? "" : "team-a" }, { status: 201 });
    }
    if (req.method === "POST" && (m = path.match(/^\/sites\/([^/]+)\/deploys$/))) {
      if (m[1] === "gone") return Response.json({ message: "Not Found" }, { status: 404 });
      const body = await req.json();
      fake.deployBodies.push(body);
      const id = `dep-${fake.deployBodies.length}`;
      const required = [...new Set(Object.values(body.files as Record<string, string>))].filter(s => !fake.known.has(s));
      deploys.set(id, { required, files: body.files, polls: 0 });
      return Response.json({ id, state: "preparing" });   // async: no `required` yet
    }
    if (req.method === "GET" && (m = path.match(/^\/sites\/[^/]+\/deploys\/([^/]+)$/))) {
      const d = deploys.get(m[1]!)!;
      d.polls++;
      if (d.polls === 1) return Response.json({ id: m[1], state: "preparing" });
      if (fake.errorDeploys) return Response.json({ id: m[1], state: "error", error_message: "boom" });
      const waiting = d.required.filter(s => !fake.known.has(s));
      return Response.json({
        id: m[1], required: d.required, state: waiting.length ? "uploading" : "ready",
        ssl_url: "https://my-game.netlify.app", deploy_ssl_url: `https://${m[1]}--my-game.netlify.app`,
      });
    }
    if (req.method === "PUT" && (m = path.match(/^\/deploys\/([^/]+)\/files\/(.+)$/))) {
      const bytes = new Uint8Array(await req.arrayBuffer());
      const fail = fake.failPuts.shift();
      if (fail) return new Response("nope", { status: fail, headers: fail === 429 ? { "x-ratelimit-reset": String(Math.floor(Date.now() / 1000)) } : {} });
      const sha = await sha1Hex(bytes);
      const rawPath = req.url.slice(req.url.indexOf("/files/") + "/files".length);
      fake.puts.push({ rawPath, path: "/" + decodeURIComponent(m[2]!), sha });
      fake.known.add(sha);
      return Response.json({ sha });
    }
    return Response.json({ message: `unhandled ${req.method} ${path}` }, { status: 404 });
  });
  fake.apiBase = `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}/api/v1`;
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

// ── client ──────────────────────────────────────────────────────────────────

Deno.test("deployDir: digests the bundle, uploads only what is required, once per hash", async () => {
  const fake = fakeNetlify();
  try {
    const dir = await makeBundle({
      "index.html": "<html>",
      "scenes/level 1.json": "{}",             // a space: must be escaped in the PUT url
      "assets/models/a.gltf": "same bytes",
      "assets/models/b.gltf": "same bytes",    // same content as a.gltf → one upload
      "assets/old.js": "already hosted",
    });
    fake.known.add(await sha1Hex(new TextEncoder().encode("already hosted")));
    const phases: string[] = [];
    const r = await createNetlifyClient({ token: "good", apiBase: fake.apiBase, ...FAST })
      .deployDir("site-1", dir, p => { if (phases.at(-1) !== p.phase) phases.push(p.phase); });

    const sent = fake.deployBodies[0]!;
    assertEquals(sent.async, true);
    assertEquals(Object.keys(sent.files).sort(), ["/assets/models/a.gltf", "/assets/models/b.gltf", "/assets/old.js", "/index.html", "/scenes/level 1.json"]);
    // known-answer check of the test's own hasher (sha1("abc")), then the client's digest against it
    assertEquals(await sha1Hex(new TextEncoder().encode("abc")), "a9993e364706816aba3e25717850c26c9cd0d89d");
    assertEquals(sent.files["/index.html"], await sha1Hex(new TextEncoder().encode("<html>")));
    assertEquals(sent.files["/assets/models/a.gltf"], sent.files["/assets/models/b.gltf"]);

    assertEquals(fake.puts.map(p => p.path).sort(), ["/assets/models/a.gltf", "/index.html", "/scenes/level 1.json"]);
    assert(fake.puts.some(p => p.rawPath === "/scenes/level%201.json"), "space escaped in the upload url");
    assertEquals(r.fileCount, 5);
    assertEquals(r.uploadedCount, 3);
    assertEquals(r.url, "https://my-game.netlify.app");
    assertEquals(r.deployUrl, "https://dep-1--my-game.netlify.app");
    assertEquals(phases, ["hashing", "preparing", "uploading", "processing"]);
  } finally { await fake.close(); }
});

Deno.test("deployDir: a republish uploads only the file that changed", async () => {
  const fake = fakeNetlify();
  try {
    const dir = await makeBundle({ "index.html": "<html>", "scenes/a.json": "{\"v\":1}", "assets/big.bin": "x".repeat(5000) });
    const c = createNetlifyClient({ token: "good", apiBase: fake.apiBase, ...FAST });
    assertEquals((await c.deployDir("site-1", dir)).uploadedCount, 3);
    await Deno.writeTextFile(`${dir}/scenes/a.json`, "{\"v\":2}");
    fake.puts.length = 0;
    const second = await c.deployDir("site-1", dir);
    assertEquals(second.uploadedCount, 1);
    assertEquals(fake.puts.map(p => p.path), ["/scenes/a.json"]);
    // and an unchanged third publish uploads nothing, yet still goes live
    fake.puts.length = 0;
    const third = await c.deployDir("site-1", dir);
    assertEquals(third.uploadedCount, 0);
    assertEquals(fake.puts.length, 0);
    assertEquals(third.url, "https://my-game.netlify.app");
  } finally { await fake.close(); }
});

Deno.test("deployDir: 500 and 429 on uploads are retried", async () => {
  const fake = fakeNetlify();
  try {
    const dir = await makeBundle({ "index.html": "<html>", "a.js": "1" });
    fake.failPuts = [500, 429, 500];
    const r = await createNetlifyClient({ token: "good", apiBase: fake.apiBase, ...FAST }).deployDir("site-1", dir);
    assertEquals(r.uploadedCount, 2);
    assertEquals(fake.puts.length, 2);
    assertEquals(fake.requests.filter(q => q.startsWith("PUT")).length, 5);   // 2 successes + 3 failures
  } finally { await fake.close(); }
});

Deno.test("deployDir: an upload that keeps failing gives up with a plain message", async () => {
  const fake = fakeNetlify();
  try {
    const dir = await makeBundle({ "index.html": "<html>" });
    fake.failPuts = [500, 500, 500, 500, 500, 500];
    await assertRejects(
      () => createNetlifyClient({ token: "good", apiBase: fake.apiBase, ...FAST }).deployDir("site-1", dir),
      Error, "Netlify had a server problem",
    );
  } finally { await fake.close(); }
});

Deno.test("deployDir: # or ? in a file name fails before any request", async () => {
  const fake = fakeNetlify();
  try {
    const dir = await makeBundle({ "index.html": "<html>", "assets/what?.png": "x" });
    await assertRejects(
      () => createNetlifyClient({ token: "good", apiBase: fake.apiBase, ...FAST }).deployDir("site-1", dir),
      Error, "assets/what?.png",
    );
    assertEquals(fake.requests.length, 0);
  } finally { await fake.close(); }
});

Deno.test("plain messages: bad key, taken name, deleted site, failed deploy", async () => {
  const fake = fakeNetlify();
  try {
    const good = createNetlifyClient({ token: "good", apiBase: fake.apiBase, ...FAST });
    const dir = await makeBundle({ "index.html": "<html>" });
    await assertRejects(() => createNetlifyClient({ token: "typo", apiBase: fake.apiBase, ...FAST }).getUser(), Error, "Netlify rejected the API key");
    await assertRejects(() => good.createSite({ name: "taken" }), Error, "is taken or not allowed");
    await assertRejects(() => good.deployDir("gone", dir), Error, "no longer exists on Netlify");
    fake.errorDeploys = true;
    await assertRejects(() => good.deployDir("site-1", dir), Error, "could not finish the deploy: boom");
  } finally { await fake.close(); }
});

Deno.test("listSites pages through everything; createSite targets a team when asked", async () => {
  const fake = fakeNetlify();
  try {
    const c = createNetlifyClient({ token: "good", apiBase: fake.apiBase, ...FAST });
    const sites = await c.listSites();
    assertEquals(sites.length, 150);
    assertEquals(new Set(sites.map(s => s.id)).size, 150);
    assertEquals((await c.listAccounts())[0], { slug: "team-a", name: "Team A" });
    assertEquals((await c.createSite({ name: "my-game" })).url, "https://my-game.netlify.app");
    await c.createSite({ name: "my-game", accountSlug: "team-a" });
    assert(fake.requests.includes("POST /team-a/sites"));
  } finally { await fake.close(); }
});

// ── key storage + publish job (deploy.ts) ───────────────────────────────────

async function tempWorkspace(): Promise<Workspace> {
  const root = await Deno.makeTempDir({ prefix: "wb-ws-" });
  const ws: Workspace = { contentDir: `${root}/content`, stateDir: `${root}/state`, dev: false };
  const game = `${ws.contentDir}/games/mini`;
  await Deno.mkdir(`${game}/scenes`, { recursive: true });
  await Deno.mkdir(`${ws.stateDir}/exports`, { recursive: true });
  await Deno.mkdir(`${ws.stateDir}/trash`, { recursive: true });
  await Deno.writeTextFile(`${game}/manifest.json`, JSON.stringify({
    manifestVersion: 1, id: "mini", name: "Mini", entryScene: "s", scenes: { s: "scenes/s.json" }, assetsBase: "/",
  }));
  await Deno.writeTextFile(`${game}/scenes/s.json`, JSON.stringify({ world: {}, zones: [] }));
  return ws;
}

Deno.test("the key is verified before it is stored, stored owner-only, and never in the game folder", async () => {
  const fake = fakeNetlify();
  try {
    const ws = await tempWorkspace();
    const o = { apiBase: fake.apiBase, ...FAST };
    assertEquals(await D.netlifyStatus(ws, o), { connected: false });
    await assertRejects(() => D.netlifySetKey(ws, "typo", o), Error, "rejected the API key");
    assertEquals(await D.netlifyStatus(ws, o), { connected: false });           // the typo was NOT saved

    assertEquals((await D.netlifySetKey(ws, "  good\n", o)).user.name, "Test User");   // pasted whitespace trimmed
    assertEquals((await D.netlifyStatus(ws, o)).user?.email, "t@example.com");
    const secrets = `${ws.stateDir}/secrets.json`;
    assertEquals(JSON.parse(await Deno.readTextFile(secrets)).netlifyToken, "good");
    if (Deno.build.os !== "windows") assertEquals((await Deno.stat(secrets)).mode! & 0o777, 0o600);

    await D.netlifyClearKey(ws);
    assertEquals(await D.netlifyStatus(ws, o), { connected: false });
  } finally { await fake.close(); }
});

Deno.test("startPublish: exports, deploys, reports progress to done; the link file holds no key and is not in the bundle", async () => {
  const fake = fakeNetlify();
  try {
    const ws = await tempWorkspace();
    const o = { apiBase: fake.apiBase, ...FAST };
    const distDir = new URL("../dist", import.meta.url).pathname;   // real built runtime (read-only)

    await assertRejects(() => D.startPublish(ws, distDir, "mini", o), Error, "No Netlify API key");
    await D.netlifySetKey(ws, "good", o);
    await assertRejects(() => D.startPublish(ws, distDir, "mini", o), Error, "not linked to a Netlify site");

    await D.setPublishLink(ws, "mini", { provider: "netlify", siteId: "site-1", siteName: "my-game", url: "https://my-game.netlify.app" });
    const { jobId } = await D.startPublish(ws, distDir, "mini", o);
    assertEquals((await D.startPublish(ws, distDir, "mini", o)).jobId, jobId);   // double click joins the running job

    let status = D.getPublishStatus(jobId);
    for (let i = 0; i < 2000 && status.phase !== "done" && status.phase !== "error"; i++) {
      await new Promise(r => setTimeout(r, 5));
      status = D.getPublishStatus(jobId);
    }
    assertEquals(status.error, undefined);
    assertEquals(status.phase, "done");
    assertEquals(status.url, "https://my-game.netlify.app");
    assert(status.fileCount! > 5 && status.uploadedCount === status.fileCount, "first publish uploads every file");

    const paths = fake.puts.map(p => p.path);
    assert(paths.includes("/runtime.html") && paths.includes("/scenes/s.json") && paths.includes("/manifest.json"));
    assert(!paths.some(p => p.includes("publish.json")), "publish.json must not ship");
    assert(!paths.some(p => /\/assets\/main-/.test(p)), "the editor chunk must not ship");

    const linkText = await Deno.readTextFile(`${ws.contentDir}/games/mini/publish.json`);
    assert(!linkText.includes("good"), "no key in the committed link file");
    assertEquals(await readPublishLink(ws, "mini"), { provider: "netlify", siteId: "site-1", siteName: "my-game", url: "https://my-game.netlify.app" });
    const state = await D.getPublishLink(ws, "mini");
    assertEquals(state.lastPublish?.deployId, "dep-1");

    // switching sites forgets the old site's "last published"; unlinking trashes the file
    await D.setPublishLink(ws, "mini", { provider: "netlify", siteId: "site-2", siteName: "other", url: "https://other.netlify.app" });
    assertEquals((await D.getPublishLink(ws, "mini")).lastPublish, null);
    await D.setPublishLink(ws, "mini", null);
    assertEquals((await D.getPublishLink(ws, "mini")).link, null);
  } finally { await fake.close(); }
});
