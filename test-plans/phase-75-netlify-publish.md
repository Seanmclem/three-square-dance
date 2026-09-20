# Phase 75 test plan: publish to Netlify (executed 2026-09-20, v4.85.0)

Where it is: desktop app → PROJ ▾ (or ⋯) → **Publish…**, under Export game….
It needs a project open. **The dev shell must be restarted once** to get the new
backend (its hot reload covers the page, not the Deno side); until then the
menu item opens a modal that says "Restart the desktop app to enable
publishing".

## Automated: `deno test -A desktop/netlify_test.ts` (9 tests, all PASS)

A fake Netlify server (`Deno.serve` on a random port, passed as `apiBase`)
stands in for api.netlify.com; a temp workspace stands in for the real one.

- **Digest + uploads:** paths are sent with leading slashes and `async: true`;
  the client's SHA-1 matches an independent hasher (itself checked against the
  known `sha1("abc")`); only hashes the server lacks are uploaded, once each
  even when two paths share content; a path with a space is `%20`-escaped in
  the upload URL; progress phases arrive in order.
- **Republish:** after changing one file, exactly that file is uploaded; an
  unchanged publish uploads nothing and still goes live.
- **Retries:** 500 / 429 / 500 on uploads are retried to success; six 500s in a
  row give up with "Netlify had a server problem".
- **Early refusal:** a file name with `?` fails before any request is sent.
- **Plain messages:** bad key, taken site name, deleted site (404 on deploy),
  deploy that ends in `state: "error"`.
- **Sites:** 150 sites across two pages all listed, no duplicates; creating in
  a team posts to `/{account_slug}/sites`.
- **Key storage:** a rejected key is NOT saved; pasted whitespace is trimmed;
  `secrets.json` is mode 600; clearing the key disconnects.
- **Whole job:** `startPublish` refuses without a key, then without a link;
  runs a real `exportGameBundle` against the built `dist`; a second start joins
  the running job; ends `done` with the site URL; the upload contains
  `runtime.html`, the scene and the manifest, and contains **no `publish.json`
  and no `main-*` editor chunk**; `publish.json` holds no key; switching sites
  forgets the old site's "last published"; unlinking trashes the file.

## UI pass in Chrome (all PASS)

Run against a headless test server: the real `projects` / `deploy` / `serve`
code on a temp copy of `platfrom-obby`, plus the fake Netlify. (The dev shell
was left alone: no second shell, no restart of the user's window.)

1. PROJ ▾ shows **Publish…** under Export game….
2. No key: masked input, help link, Connect. A wrong key shows "Netlify
   rejected the API key" inline and saves nothing.
3. Good key → site picker: sites newest first, search field, create field
   prefilled from the game id with a live address preview, team dropdown
   (shown because the fake key sees two teams), "Connected as <name>" footer.
4. A taken name shows the inline "is taken or not allowed" message.
5. Create with "Seans Obby Game!" / "Obby Two!!" → cleaned to a valid name.
   **Bug found and fixed:** Create was sending the raw text (trailing hyphen)
   while the preview showed the cleaned name.
6. Publish: the editor saves first ("saved" chip updates), then
   `Uploading… 56 / 99 files (5.8 / 21.7 MB)` with a moving bar, then
   "Published" with the URL, Open ↗ and Copy. **Wording fixed:** the first
   publish said the 8 un-uploaded duplicates "were already on Netlify".
7. Publish again → "Nothing had changed: all 107 files were already on Netlify."
8. Open ↗ calls `openExternal` with the https site URL.
9. Escape closes the modal only. After a page reload the modal reopens
   straight into the linked state with "Last published 1 min ago".
10. Change site… lists sites with the current one marked, offers "← Keep", and
    picking/creating another site rewrites `publish.json` and resets "last
    published".
11. On disk: `publish.json` = `{provider, siteId, siteName, url}` only;
    `secrets.json` is `-rw-------`; the key string appears nowhere under the
    content folder or the exported bundle; the repo's `public/games/` stayed
    clean throughout.

## Checks

`deno check desktop/*.ts` clean; `tsc --noEmit` clean; watcher build green.

## Manual (user): the part that needs a real Netlify key

**Confirmed by the user 2026-09-20 ("it worked perfectly"):** real key, site
`platfrom-obby` (https://platfrom-obby.netlify.app), publish went live; the
record shows 13 of 107 files uploaded. On disk afterwards: `publish.json` holds
only provider / siteId / siteName / url, `secrets.json` is `-rw-------` and
gitignored. The republish-after-edit and Change site… steps below were not
reported on.

- [ ] Restart the dev shell, open a project, PROJ ▾ → Publish….
- [ ] Paste a Netlify personal access token (Netlify → User settings →
      Applications → Personal access tokens). Expect "Connected as <you>".
- [ ] Create a new site (or pick one), Publish, press Open ↗, play level 1 on
      the live URL.
- [ ] Change something small in a scene, Publish again: the summary should
      report only a few files uploaded, same URL.
- [ ] Change site… to a different site, publish there, then switch back.
- [ ] Commit the new `public/games/<game>/publish.json` (it holds no key).
- [ ] Windows/Linux builds: `openExternal` uses `rundll32` / `xdg-open`
      (untested here; macOS `open` path only).

## Known limits (deliberate)

Draft deploys, custom domains, deploy history/rollback, other hosts, OS
keychain storage, and cancelling a running publish are not included. Closing
the modal mid-publish lets it finish in the background; reopening shows the
linked state, not the running progress.
