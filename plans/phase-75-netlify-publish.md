# Phase 75: publish a game to Netlify from the editor

> Follows phase 57 (self-contained export) and closes the "deploy providers"
> follow-up from phase 58. User: "It should probably just take an api key, and
> pick or setup a netlify project, that can be associated with a game once, or
> changed later, but continuously publish to the same game-project."

## Why

Publishing today is Export game… and then dragging the bundle onto the Netlify
dashboard by hand, every single time. The desktop backend can talk to
Netlify's API directly: no CLI, no new dependency. Exported bundles are
self-contained (`assetsBase: "./"`), so Netlify needs no `_headers` / CORS file.

## Decisions (made with the user)

- **Site link** lives in `public/games/<id>/publish.json`, committed with the
  game. The export never copies it, so players never see it.
- **API key** lives in `<stateDir>/secrets.json` (gitignored `.worldbuilder/`
  in dev, `~/WorldBuilder/.state` packaged), owner-only file mode. The frontend
  never gets the key back, only "connected as <name>".

## What ships

1. **`desktop/netlify.ts`**: hand-rolled client (`getUser`, `listAccounts`,
   `listSites`, `createSite`, `getSite`, `deployDir`). `deployDir` uses
   Netlify's file-digest deploy: SHA-1 every bundle file, create the deploy
   with `async: true`, upload only the hashes Netlify says it lacks (once per
   hash, 4 at a time, retrying 429/5xx/network), poll until `ready`. A
   republish after a small edit uploads a handful of files. `apiBase` is a
   parameter so tests can point it at a fake server.
2. **`desktop/deploy.ts`**: the unused provider stub becomes the publish job
   runner. `startPublish(projectId)` exports the bundle (reusing
   `exportGameBundle`), deploys it, and records the last publish in
   `<stateDir>/publish/<id>.json` (not in the committed `publish.json`, so a
   publish never dirties the game folder). The api transport
   has no progress channel, so jobs live in memory and the modal polls
   `getPublishStatus(jobId)`.
3. **Storage helpers**: `readSecret` / `writeSecret` (workspace.ts),
   `readPublishLink` / `writePublishLink` (projects.ts), both on
   `atomicWriteText` + `assertSafeId`.
4. **Api surface** (`desktop/main.ts` + `DesktopApi`): `netlifyStatus`,
   `netlifySetKey` (verifies before storing), `netlifyClearKey`,
   `netlifyListSites`, `netlifyCreateSite`, `getPublishLink`, `setPublishLink`,
   `startPublish`, `getPublishStatus`, `openExternal` (https only; `window.open`
   is a no-op in the webview).
5. **`src/ui/PublishModal.tsx`**: one modal, three states. No key: paste key,
   Connect. No site: searchable site list, or create one (team dropdown only
   when the key sees several teams). Linked: Publish with a progress bar, then
   the live URL with Open in browser / Copy link, plus "Change site…" and
   "Disconnect Netlify". Errors render inline, never `alert()`.
6. **Menu**: "Publish…" under "Export game…" in both PROJ menus, desktop only.
   Saves first, like export. Export game… is unchanged.

## Not included

Draft/preview deploys, custom domains, deploy history or rollback, other
hosts, a `_headers` cache policy, OS keychain storage.

## Verification

- `deno test desktop/netlify_test.ts` against a fake Netlify server: digest
  map correctness, only-required uploads (once per shared hash), second deploy
  uploads only the changed file, 429/500 retried, 401/422/deploy-error
  messages, `#`/`?` paths rejected before any request, spaces escaped.
- `deno check`, `tsc --noEmit`, build green; the modal stays out of the
  runtime chunks.
- Shell UI pass of the three modal states.
- Live publish with the user's key: connect, create a site, publish, play the
  URL, republish after an edit (few files uploaded, same URL), change site.
  `secrets.json` is mode 600 and gitignored; `publish.json` holds no key and is
  absent from the bundle.
