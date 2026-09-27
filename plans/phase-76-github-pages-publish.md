# Phase 76: publish a game to GitHub Pages

> Built 2026-09-26 (v4.86.0). What shipped matches Part A + Part B below with
> these decisions: branch `main`; public repo by default (private allowed,
> with the paid-plan note); classic token with `public_repo` recommended and
> prefilled on the token page the modal opens; ONE host per game, switching
> is explicit ("Change site…" → host chooser with a warning) and the old
> site is left alone. Empty-repo spike result: the git database API does
> refuse a brand-new repo, so the client seeds `.nojekyll` through the
> contents API and continues. Test plan: `test-plans/phase-76-github-pages-publish.md`.

> Follows phase 75 (Netlify publish). User: "begin planning github static
> sites method instructions, then api option. no code changes yet."
> Two parts, shippable separately: **Part A** is documentation only (the
> by-hand recipe), **Part B** adds GitHub as a second provider behind the
> same Publish… modal.

## Facts checked against GitHub's docs (2026-09-26)

- Project sites live at `https://<owner>.github.io/<repo>/`; a repo named
  `<owner>.github.io` publishes at the root. The exported bundle already uses
  relative paths (`assetsBase: "./"`, `./assets/` script refs), so a subpath
  works with no changes. GitHub Pages already sends
  `Access-Control-Allow-Origin: *`, so no header file is needed.
- Browser upload is capped at **100 files per upload** and 25 MiB per file.
  `platfrom-obby` is 107 files, so the drag-and-drop route needs two uploads
  or a folder drop; the API route has no such cap. Single files over 100 MiB
  are refused everywhere (our largest is 3.4 MB).
- Limits: site up to 1 GB, soft 100 GB/month bandwidth, soft 10 builds/hour,
  10 minute build timeout. Pages on a **private** repo needs a paid plan
  (from memory of the docs, re-check before writing the guide text); the
  default in both parts is a public repo, since the game is public anyway.
- "Deploy from a branch" runs Jekyll, which silently drops files or folders
  starting with `_`, `.` or `#` and ending in `~`. Today's bundle and the
  whole asset library contain none, but an imported asset could. A
  **`.nojekyll` file at the publishing root turns Jekyll off**; the export
  should always write one (harmless on Netlify).
- Pages REST: `POST /repos/{o}/{r}/pages` with `{source: {branch, path},
  build_type: "legacy"}` enables the site; `GET /repos/{o}/{r}/pages` gives
  `html_url` and `status` (`built` / `building` / `errored`);
  `GET /repos/{o}/{r}/pages/builds/latest` reports the build; `PUT` updates
  the source. Needs a classic token with `repo`, or a fine-grained token with
  "Pages: write" plus "Contents: write" (and "Administration: write" to
  create the repo; the docs do not state a fine-grained permission for
  `POST /user/repos`, so the guide will recommend a classic token with
  `public_repo`, or `repo` for private).
- Git Data REST: `POST /git/blobs` (base64 content), `POST /git/trees` with
  `base_tree` (entries override, `sha: null` deletes), `POST /git/commits`,
  `PATCH /git/refs/heads/<branch>`. `GET /git/trees/<sha>?recursive=1` lists
  every blob with its SHA (limit 100,000 entries / 7 MB). Git blob SHAs are
  `sha1("blob <bytes>\0" + content)`, computable locally, which gives the same
  "upload only what changed" behaviour as Netlify's digest deploy.

## Part A: the by-hand recipe (docs only, first)

Rewrite `PUBLISHING_GUIDE.md` §4 "GitHub Pages" from its current two lines
into a real walkthrough, and point `DESKTOP_GUIDE.md`'s release note at it:

1. PROJ ▾ → Export game… (the folder opens in Finder).
2. Create a new **public** repo on github.com (no README, no .gitignore).
3. Get the files in, three options ordered by ease:
   - **GitHub Desktop:** add the exported folder as a repo, commit, publish.
   - **Browser upload:** "uploading an existing file", drag the *contents* of
     the bundle (not the folder itself so `index.html` is at the root); do it
     in two drops if the bundle has more than 100 files.
   - **git CLI:** `git init && git add -A && git commit -m "publish" &&
     git branch -M main && git remote add origin … && git push -u origin main`.
4. Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)` →
   Save. The first build takes one to a few minutes; the page 404s until
   then.
5. Play at `https://<owner>.github.io/<repo>/`. Updating = export again and
   push again (GitHub Desktop shows exactly which files changed).
6. Notes: add an empty `.nojekyll` at the root if any file name starts with
   `_` (the export will do this once Part B lands); private repos need a paid
   plan; the `manifest.json` URL for the standalone-runtime case is
   `https://<owner>.github.io/<repo>/manifest.json`.

Also fix the stale lines in `HUMAN_TESTING.md:466` and `TESTING.md:981` that
still describe the FSA-era "Publish… copies JSON to a folder".

## Part B: GitHub as a second provider in Publish…

Same shape as phase 75, so the modal, the key store and the job runner are
reused rather than duplicated.

1. **`desktop/github.ts`**, a hand-rolled client like `netlify.ts`:
   `getUser`, `listRepos` (`GET /user/repos?affiliation=owner&sort=pushed&
   per_page=100`, paged), `createRepo({name, private})`, `getPages`,
   `enablePages(branch)`, `latestBuild`, and `deployDir(repo, branch, dir,
   onProgress)`:
   - read the branch's current tree recursively (none on a fresh repo);
   - hash every bundle file as a git blob locally; upload blobs only for
     paths whose SHA differs or is new, 4 at a time, retrying 5xx/network
     and honouring `X-RateLimit-Reset` on 403/429;
   - create one tree with `base_tree` = old tree, changed entries by SHA,
     `sha: null` for files no longer in the bundle; one commit; update the
     ref (create it on first publish);
   - enable Pages if not enabled, else leave it; then poll
     `pages/builds/latest` until `built` (or `errored`, or a 10 minute cap).
   - **Spike first:** the Git Data API on a brand-new empty repo. If
     creating a root commit + ref fails with "repository is empty", seed the
     branch with one Contents-API `PUT` of `.nojekyll` (that call does work on
     empty repos), then continue with the tree flow.
2. **`desktop/deploy.ts`**: `PublishLink.provider` becomes
   `"netlify" | "github"`, with `github: {owner, repo, branch}` fields;
   `startPublish` branches on the provider; the status phases gain
   `"building"` (GitHub's build wait is the slow part, unlike Netlify's
   near-instant processing). Second key `githubToken` in `secrets.json`,
   same verify-before-store rule (`GET /user`).
3. **`desktop/export.ts`**: always write an empty `.nojekyll` at the bundle
   root (one line; Netlify ignores it). Also lands the phase-57 note that
   the crawl-pruned chunk copy must keep working with it.
4. **`src/ui/PublishModal.tsx`**: a provider switch on the link step
   (Netlify / GitHub Pages). GitHub's states: no key → paste a classic token
   (link to github.com → Settings → Developer settings → Personal access
   tokens, scopes `public_repo`, or `repo` for private); no repo → pick an
   existing repo or create one (name prefilled from the game id, "Public"
   checkbox on by default with the paid-plan note when off); linked → Publish
   with phases, then the `html_url`. First publish shows "GitHub is building
   the site (usually 1 to 3 minutes)" rather than a bar.
5. Api methods mirror Netlify's: `githubStatus`, `githubSetKey`,
   `githubClearKey`, `githubListRepos`, `githubCreateRepo`. The publish/link
   methods are shared and read the provider from the link.

## Decisions to confirm before Part B starts

- Branch name for the published files: `main` (simplest, matches the recipe)
  or `gh-pages` (keeps `main` free if the user later adds a README). Plan
  assumes `main`.
- Public by default, with private allowed when the account supports it.
- Token type: recommend classic `public_repo` in the UI text (fine-grained
  needs three separate permissions and the repo-creation permission is
  undocumented). Both should work for an existing repo.
- Whether a game may hold links to BOTH hosts at once (publish to Netlify
  and GitHub from one game) or exactly one provider per game. Plan assumes
  one, matching "Change site…".

## Not included

Custom domains (`CNAME`), the Actions-workflow build type, deleting the
Pages site, org repos beyond what `affiliation=owner` lists, and Git LFS.

## Verification (when built)

- `deno test` against a fake GitHub server: blob SHA matches `git hash-object`;
  a republish after one edit uploads one blob and the tree carries
  `sha: null` for a removed file; empty-repo first publish; 403 rate limit
  retried; Pages enabled once, not re-created; build polled to `built`.
- Headless harness UI pass of the three states, then a real publish with the
  user's token: first publish, edit + republish (one blob), play at the
  `github.io` URL, `.nojekyll` present, `publish.json` holds no token.
