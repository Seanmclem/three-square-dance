# Publishing Guide — putting a game on a remote host

How to publish a world so anyone can play it in the standalone runtime
(Phase 25): what goes in the bundle, how to host it on S3 / Netlify /
GitHub Pages / Cloudflare Pages, and how to get CORS right. Added v4.20.0.

**Just want to play your own levels locally while you build them?** That's
§0, right below — no hosting, no CORS, no build step.

---

## 0. Local first — develop, save, and play on the dev server

> **The editor automates all of this now (Phase 33 — Projects).** TopBar →
> **PROJ ▾ → New Project…**, pick `<repo>/public/games` in the folder dialog,
> and you get the folder layout below with an auto-generated manifest, a shared
> `game.json` (cross-scene items + state defaults), a scene switcher, a
> dropdown-driven `load_scene` picker, and a **▶ Play** button that opens the
> runtime. **Publish…** (⋯ menu) copies the project's JSON to any folder you
> pick — note it copies *manifests and scenes only*, never `/assets/**` (see
> §"What goes in the bundle"). The manual steps below remain valid as the
> by-hand appendix and for understanding what the editor generates.

The dev server already serves everything the runtime needs. The whole loop is:
save your world **into `public/`**, add a small manifest next to it, open
`runtime.html`. No second server, no CORS, no `npm run build`.

### One-time setup (per game)

1. Make a folder in the repo: `public/my-game/scenes/`.
2. Author your level in the editor (`localhost:7373`) as usual. It needs a
   **spawn point** (Spawn tool) or the runtime spawns at the origin.
3. **Save the world directly into that folder**: Ctrl+S → in the file picker,
   navigate to `<repo>/public/my-game/scenes/` and save as `level_01.json`.
   (The editor's save output *is* the runtime scene format — nothing to
   convert.)
4. Create `public/my-game/manifest.json`:

```json
{
  "manifestVersion": 1,
  "id": "my-game-dev",
  "name": "My Game (dev)",
  "entryScene": "level_01",
  "scenes": { "level_01": "scenes/level_01.json" },
  "assetsBase": "/"
}
```

   `"assetsBase": "/"` points the asset tree at the dev server's own
   `/assets` — your imported models, materials, and decals all just work,
   exactly as they do in editor preview.

5. Open **`http://localhost:7373/runtime.html?manifest=/my-game/manifest.json`**
   → Start. That's your game in the real shell: manifest boot, main menu,
   saves, portals — everything a published copy would do.

### The iteration loop

- Edit in the editor tab → **Ctrl+S** (after the first save it re-saves
  in-place, no picker) → switch to the runtime tab → **reload the page** →
  Start. Files under `public/` are served statically — a browser refresh picks
  up the new JSON; there's no hot reload for them.
- The editor and runtime tabs coexist fine on the same origin: the runtime
  never touches the editor's autosave, and its own save lives under
  `runtime_gamesave:<manifest.id>`. Tip: while iterating on level layout, use
  **New Game** rather than Continue — a stale save can resume you at a spot
  that no longer exists in the re-saved level.
- Multi-level games: save each world as its own JSON in `scenes/`, list it in
  the manifest, and wire portals with `load_scene` trigger volumes (see
  HUMAN_TESTING.md's runtime workflow). Scene ids in the volumes must match
  the manifest keys.
- Committing: `public/my-game/` will ship inside `dist/` on the next build
  (like `public/demo/` does). Keep personal scratch levels out of git or out
  of `public/` if you don't want that.

When the game feels done, everything below is just "move that folder
somewhere public and add one header."

---

## The short version

A published game is **a folder of static files** — no server code:

```
my-game/
├── manifest.json              ← ~15 lines, hand-written (example below)
├── scenes/
│   ├── level_01.json          ← world JSONs, saved straight from the editor
│   └── level_02.json
└── assets/                    ← copy of public/assets (or the subset you use)
    ├── textures/manifest.json + texture folders
    ├── models/manifest.json   + .glb files (collider presets ride the manifest)
    └── decals/manifest.json   + .png files
```

Upload that folder anywhere that serves static files **with CORS enabled**,
then open:

```
https://<wherever-the-runtime-lives>/runtime.html?manifest=https://<your-host>/my-game/manifest.json
```

The runtime shell itself is hosted **once** (yours or anyone's); games are
just manifest URLs you feed it. Same shell, any number of games, any number
of hosts.

---

## 1. Two separately-hostable things

| Thing | What it is | Where it lives |
|---|---|---|
| **The runtime shell** | `npm run build` → the `dist/` output. `runtime.html` + its JS chunks (no editor code is referenced by it). | Deployed once. Any static host. No CORS needed on *this* host — pages don't need CORS to fetch *out*. |
| **A game bundle** | The folder above: manifest + scene JSONs + assets tree. | Anywhere. **This host needs CORS** if it isn't the same origin as the shell. |

Simplest possible setup: put both on the same host (deploy `dist/` and drop
game folders next to it) — then CORS never comes into play at all. The rest
of this guide is for the interesting case: games hosted elsewhere.

---

## 2. Authoring the game bundle

### Scene files

Save worlds normally in the editor (Ctrl+S / Save). Requirements per scene:

- A **spawn point** (`defaultSpawn`) — the runtime warns and spawns at the
  origin without one.
- The **first zone** in the file is the entry zone.
- Cross-scene portals: trigger volumes with a **`load_scene`** action whose
  Scene id matches a key in your manifest's `scenes` map. (The editor can't
  validate the id — a typo just logs an error in the runtime and stays put.)

### manifest.json

```jsonc
{
  "manifestVersion": 1,
  "id": "my-game",                 // unique slug — namespaces the player's save
  "name": "My Game",               // menu title
  "version": "1.0.0",
  "description": "Shown under the title.",
  "author": "you",
  "entryScene": "level_01",
  "scenes": {
    "level_01": "scenes/level_01.json",
    "level_02": "scenes/level_02.json"
  }
  // "assetsBase": "./"            // optional — see below
}
```

- **All relative URLs resolve against the manifest's own URL**, so the layout
  above needs no configuration. Scene URLs can also be absolute
  (`https://cdn.example.com/...`) if you want scenes elsewhere.
- **`assetsBase`** is the base for the whole `/assets/**` tree (the three
  asset manifests and every file they reference). Default = the manifest's
  directory, which matches the layout above. Point it elsewhere to share one
  assets tree between several games on the same host
  (`"assetsBase": "../shared/"`) or to a different origin entirely
  (`"assetsBase": "https://assets.example.com/"` — that origin needs CORS
  too). One base per game — per-asset URLs / multiple packs are future work.
- **`id` matters**: the player's save is stored as
  `runtime_gamesave:<id>` in their browser. Keep it stable across updates
  (saves survive) and unique among games you host (saves don't collide).

### Assets

Copy your project's `public/assets/` folder — or prune it to what your scenes
actually use. What must stay consistent:

- The three manifest files (`textures/models/decals` `manifest.json`) — the
  scene JSONs reference assets **by id**, and these map ids → files.
  Pruning = delete the files *and* their manifest entries.
- Imported/baked model collider presets live **inside**
  `models/manifest.json`, so physics ships automatically with the tree.
- Texture defs that use `{quality}` paths need the quality folders present
  (the runtime defaults to `high`).

The runtime never HEAD-probes remote files (unlike the editor), so hosts that
reject HEAD requests are fine — but a missing texture/model renders as the
magenta-checkerboard fallback, so eyeball the game once after upload.

---

## 3. CORS — the one thing that bites

When the shell (origin A) fetches your game (origin B), the browser requires
origin B to answer with an `Access-Control-Allow-Origin` header. Without it,
every fetch fails with a TypeError — the runtime's error screen calls this
out by name when it happens to the manifest.

Everything the runtime fetches from your host needs the header: the game
manifest, scene JSONs, the three asset manifests, textures, and GLBs. The
blanket rule (`* `) is appropriate here — this is public static content:

```
Access-Control-Allow-Origin: *
```

Only simple GETs are made (no custom headers), so you don't need
`Allow-Methods`/`Allow-Headers` or preflight handling.

---

## 4. Host recipes

### GitHub Pages — zero config ✅

GitHub Pages already serves `Access-Control-Allow-Origin: *` on everything.

1. Make a repo, put the game folder in it (or use `docs/`), enable Pages
   (Settings → Pages → deploy from branch).
2. Your manifest URL:
   `https://<user>.github.io/<repo>/my-game/manifest.json`

Nothing else to do. This is the easiest host for a first publish.

### Netlify — add a `_headers` file

Netlify sends no CORS headers by default. Add a file named `_headers` at the
deploy root:

```
/*
  Access-Control-Allow-Origin: *
```

Then drag-and-drop the folder onto the Netlify dashboard (or `netlify deploy`).
Manifest URL: `https://<site>.netlify.app/my-game/manifest.json`

### Cloudflare Pages — same `_headers` convention

Identical to Netlify: a `_headers` file at the root with the same two lines.

### Amazon S3 — bucket CORS configuration

1. Create a bucket, upload the folder, allow public read (bucket policy or
   "static website hosting").
2. Bucket → **Permissions → Cross-origin resource sharing (CORS)** → paste:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": ["*"],
    "MaxAgeSeconds": 3000
  }
]
```

3. Manifest URL: `https://<bucket>.s3.<region>.amazonaws.com/my-game/manifest.json`

Uploading with `aws s3 sync my-game/ s3://<bucket>/my-game/` sets sensible
Content-Types from file extensions. (The runtime doesn't actually care about
Content-Type — `.json` is parsed from text and `.glb` is fetched as bytes —
but correct types keep proxies and browser devtools happy.)

If you front the bucket with **CloudFront**, either forward the `Origin`
header / use a response headers policy with CORS enabled, or attach the
managed `CORS-With-Preflight` response policy — otherwise CloudFront can
cache responses *without* the header.

### Any other static host / your own nginx

Serve the folder and add the header, e.g. nginx:

```nginx
location /games/ {
  add_header Access-Control-Allow-Origin *;
}
```

---

## 5. Hosting the runtime shell itself

```bash
npm run build          # emits dist/ with BOTH entries
```

Deploy `dist/` to any static host and share links to
`/runtime.html?manifest=…`. Notes:

- The shell's host needs **no CORS setup** (it fetches out, not in).
- `dist/` also contains the editor (`index.html`) and the repo's own
  `public/` copy (demo + assets). That's fine — or prune `index.html` +
  unreferenced chunks if you want a runtime-only deploy (the chunk graphs are
  separate; `runtime.html` references only its own chunk + the shared engine
  chunk).
- Opening the shell with **no `?manifest=` param** shows a URL input — handy
  as a generic "player" page people can paste any game URL into.

---

## 6. Testing a "remote" game locally

Simulate the cross-origin setup before uploading anywhere — this is exactly
how phase 25.5 was verified:

```bash
# serve the game folder on a second origin, with CORS
cd my-game
python3 - <<'EOF'
from http.server import SimpleHTTPRequestHandler, test
class CORS(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()
test(CORS, port=8787, bind='127.0.0.1')
EOF
```

Then open:
`http://localhost:7373/runtime.html?manifest=http://localhost:8787/manifest.json`

Check the Network tab: every scene/asset request should hit `:8787`.

Quick header check without a browser:

```bash
curl -s -D - -o /dev/null https://your-host/my-game/manifest.json | grep -i access-control
```

---

## 7. Failure modes → what they look like

| Symptom | Cause |
|---|---|
| Error screen naming CORS on boot | Host isn't sending `Access-Control-Allow-Origin` (or CloudFront cached a header-less response) |
| Error screen: "not valid JSON … HTML fallback" | Wrong manifest URL — many hosts return an HTML 200 page for missing files |
| Menu loads, world is magenta checkerboard | Asset tree missing/mislocated — check `assetsBase` and that `assets/textures/manifest.json` resolves on your host |
| Models missing but floors/walls textured | `assets/models/` files or manifest entries pruned incorrectly |
| Spawns at origin + console warn | Scene saved without a spawn point |
| Portal does nothing, console error | `load_scene` Scene id doesn't match a manifest `scenes` key |
| Continue resumes somewhere weird | The autosave captured the player mid-fall/out of bounds — add floors/walls at edges (there's no kill-plane respawn yet) |

---

## 8. Publish checklist

- [ ] Every scene has a spawn point; first zone is the intended entry zone
- [ ] `manifest.json`: unique stable `id`, `entryScene` ∈ `scenes`, paths match the folder layout
- [ ] `load_scene` ids in trigger volumes match manifest scene keys
- [ ] `assets/` copied (with the three manifest files), pruned entries removed from manifests too
- [ ] Host serves `Access-Control-Allow-Origin` (curl check above)
- [ ] Play it once from the deployed URL: textures non-magenta, portals work, Continue works after a reload
