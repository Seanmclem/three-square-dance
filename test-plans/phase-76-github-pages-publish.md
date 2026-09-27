# Phase 76 test plan: publish to GitHub Pages beside Netlify (executed 2026-09-26, v4.86.0)

Where it is: PROJ ▾ (or ⋯) → **Publish…**. First screen is now a host choice
(Netlify / GitHub Pages); a game that is already linked skips straight to its
host. **The dev shell must be restarted once** to get the new backend.

## Automated: `deno test -A desktop/github_test.ts` (7) + `desktop/netlify_test.ts` (9), all PASS

The GitHub fake keeps a real git object store (blobs, trees with base_tree +
deletions, commits, refs), refuses the git database on an empty repo like
GitHub does, and runs a Pages build queue.

- `gitBlobSha` equals `git hash-object` (`"hello\n"` and the empty blob).
- **First publish into an empty repo:** seeded through the contents API,
  every file pushed (identical files share one blob), Pages enabled from
  `main` at `/`, build polled to `built`, phases in order.
- **Republish:** one changed file → exactly one blob uploaded and a commit
  whose tree carries `sha: null` for a removed file; Pages not re-created; an
  unchanged publish makes no blob, no commit and no new build.
- **Retries:** 403 (`x-ratelimit-remaining: 0`), 429 (`retry-after`) and 502
  are consumed and the publish still succeeds; six 500s give up with
  "GitHub had a server problem".
- **Plain messages:** bad token, repo name taken, repo gone (checked up
  front, before any upload), Pages on a private repo (paid plan), failed
  build ("could not build the site: …").
- **Two hosts in `deploy.ts`:** GitHub token verified before storing and kept
  in its own `secrets.json` slot; a game linked to Netlify with no Netlify
  key says exactly that instead of falling back; full GitHub publish job over
  a real `exportGameBundle` (no `publish.json`, no `main-*` chunk, `.nojekyll`
  present in the pushed tree); last-publish record is per provider+target,
  so switching back to Netlify forgets GitHub's "last published".
- Netlify suite updated for the new check order and `.nojekyll`.

## UI pass in Chrome (all PASS)

Headless harness: real `projects` / `deploy` / `serve` code on a temp copy of
`platfrom-obby` **including its real `publish.json` (Netlify link)** and no
tokens, plus fake Netlify and fake GitHub. The dev shell was left alone.

1. Open Publish… on the Netlify-linked game with no key saved: opens on the
   Netlify token screen with the note "This game publishes to Netlify
   (platfrom-obby), but Netlify is not connected on this computer".
2. Connect (fake key) → linked screen with the NETLIFY badge, site, URL,
   "Publish to Netlify".
3. Change site… → host chooser: amber note naming the current host and that
   the existing site stays online; Netlify card marked "(current host)" with
   "Connected as Sean Test"; GitHub card "Not connected yet"; "← Keep Netlify
   · platfrom-obby".
4. GitHub Pages → token screen with the three steps and the link button; a
   wrong token shows "GitHub rejected the token" inline; the good one lands
   on the repo picker with "Moving from Netlify (platfrom-obby) to GitHub
   Pages. The Netlify site stays as it is." Footer now lists both hosts, each
   with its own Disconnect.
5. Create (name prefilled, public ticked, address preview
   `https://seanmclem.github.io/platfrom-obby/`) → linked screen with the
   GITHUB PAGES badge, `seanmclem/platfrom-obby · main`.
6. Publish to GitHub Pages: `Uploading… 84 / 106 files (11.7 / 21.9 MB)`
   with a bar → "Published. Uploaded 106 of 114 files (21.9 MB)…", Open ↗ /
   Copy, "Publish again".
7. Publish again → "Nothing had changed: all 114 files were already on GitHub
   Pages."
8. Reload the editor, reopen Publish…: GitHub Pages remembered (badge, repo,
   "Last published just now"). `publish.json` on disk = `{provider: "github",
   owner, repo, branch: "main", url}`.
9. Change site… → Netlify → "Moving from GitHub Pages (seanmclem/platfrom-obby)
   to Netlify" → pick the existing site → NETLIFY badge back, "Not published
   from this computer yet", `publish.json` back to the Netlify shape. Escape
   closes only the modal. The repo's `public/games/` stayed clean.

## Checks

`deno check desktop/*.ts` clean; `tsc --noEmit` clean; watcher build green.

## Manual (user): needs a real GitHub token

- [ ] Restart the dev shell, PROJ ▾ → Publish… → Change site… → GitHub Pages.
- [ ] Press the token link, generate the token (public_repo is prefilled),
      paste it. Expect "Connected as <login>" in the footer.
- [ ] Create a repository, Publish. Expect the build wait ("GitHub is
      building the site…"), then Open ↗ and play level 1 at
      `https://<you>.github.io/<repo>/`. If the modal says the build had not
      finished, wait a few minutes and retry the URL.
- [ ] Change something small, Publish again: a handful of files uploaded.
- [ ] Change site… back to Netlify and confirm the Netlify site still works.
- [ ] Commit `public/games/<game>/publish.json` after settling on a host.

## Known limits (deliberate)

No custom domains (CNAME), no Actions-workflow build type, only repos the
token's user owns, no rollback, no cancelling a running publish, the branch
is always `main`.
