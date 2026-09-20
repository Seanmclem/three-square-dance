import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { desktop, type LastPublish, type NetlifyAccount, type NetlifySite, type NetlifyUser, type PublishLink, type PublishStatus } from "@/shared/desktopApi";
import { useEscapeClose } from "./useEscapeClose";

interface Props {
  projectId:   string;
  projectName: string;
  /** Runs right before a publish starts — the export reads the game from disk. */
  onBeforePublish: () => Promise<void>;
  onClose: () => void;
}

const OVERLAY: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center",
};
const MODAL: React.CSSProperties = {
  background: "rgba(28,28,28,0.98)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8, width: 440, maxHeight: "85vh", display: "flex", flexDirection: "column",
  color: "#c2cadb", fontFamily: "monospace", fontSize: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
};
const BODY: React.CSSProperties = { padding: 16, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" };
const LABEL: React.CSSProperties = { color: "#8b94a8", fontSize: 10, letterSpacing: 1, textTransform: "uppercase" };
const HINT: React.CSSProperties = { color: "#98a2b8", fontSize: 11, lineHeight: 1.5 };
const ERROR: React.CSSProperties = { color: "#e08585", fontSize: 11, lineHeight: 1.5 };
const INPUT: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4,
  color: "#dde3f0", fontFamily: "monospace", fontSize: 12, padding: "8px", outline: "none",
  boxSizing: "border-box", width: "100%",
};
const PRIMARY = (enabled: boolean): React.CSSProperties => ({
  padding: "8px 16px", borderRadius: 4, fontFamily: "monospace", fontSize: 12,
  cursor: enabled ? "pointer" : "default",
  background: enabled ? "rgba(80,140,255,0.2)" : "rgba(46,46,46,0.5)",
  border: `1px solid ${enabled ? "rgba(80,140,255,0.4)" : "rgba(255,255,255,0.06)"}`,
  color: enabled ? "#9dbdff" : "#8b93a5",
});
const GHOST: React.CSSProperties = {
  padding: "4px 0", background: "none", border: "none", cursor: "pointer",
  color: "#9dbdff", fontFamily: "monospace", fontSize: 11, textAlign: "left",
};
const ROW = (selected: boolean): React.CSSProperties => ({
  textAlign: "left", padding: "8px 12px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace",
  background: selected ? "rgba(80,140,255,0.12)" : "rgba(255,255,255,0.04)",
  border: `1px solid ${selected ? "rgba(80,140,255,0.45)" : "rgba(255,255,255,0.08)"}`,
  display: "flex", flexDirection: "column", gap: 4,
});

const PHASE_LABEL: Record<PublishStatus["phase"], string> = {
  exporting:  "Building the game bundle…",
  hashing:    "Checking files…",
  preparing:  "Asking Netlify what changed…",
  uploading:  "Uploading…",
  processing: "Netlify is putting it live…",
  done:       "Published",
  error:      "Publish failed",
};

const TOKEN_PAGE = "https://app.netlify.com/user/applications#personal-access-tokens";

/** Netlify site names are subdomains: lowercase letters, digits, hyphens. */
function toSiteName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function ago(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 60 * 24) return `${Math.floor(min / 60)} h ago`;
  return new Date(iso).toLocaleDateString();
}

const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

/**
 * Publish a game to Netlify (phase 75). One modal, three states:
 * no API key → paste one; no site linked → pick or create one; linked → Publish.
 * The key only ever travels INTO the backend; this component never sees it again.
 */
export function PublishModal({ projectId, projectName, onBeforePublish, onClose }: Props) {
  useEscapeClose(onClose);
  const api = desktop();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<NetlifyUser | null>(null);
  const [connected, setConnected] = useState(false);
  const [link, setLink] = useState<PublishLink | null>(null);
  const [lastPublish, setLastPublish] = useState<LastPublish | null>(null);
  const [choosingSite, setChoosingSite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // key state
  const [keyText, setKeyText] = useState("");

  // site state
  const [sites, setSites] = useState<NetlifySite[] | null>(null);
  const [accounts, setAccounts] = useState<NetlifyAccount[]>([]);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState(() => toSiteName(projectId));
  const [accountSlug, setAccountSlug] = useState("");

  // publish state
  const [status, setStatus] = useState<PublishStatus | null>(null);
  const [copied, setCopied] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  /** Run an api call with the shared busy/error handling. */
  const run = useCallback(async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try { await fn(); }
    catch (e) { if (alive.current) setError((e as Error).message); }
    finally { if (alive.current) setBusy(false); }
  }, []);

  useEffect(() => {
    if (!api) return;
    void (async () => {
      try {
        const [s, l] = await Promise.all([api.netlifyStatus(), api.getPublishLink(projectId)]);
        if (!alive.current) return;
        setConnected(s.connected);
        setUser(s.user ?? null);
        if (s.error) setError(s.error);
        setLink(l.link);
        setLastPublish(l.lastPublish);
      } catch (e) {
        // Dev only: the page hot-reloads but the shell's Deno backend does not, so an
        // older backend answers these new methods with a non-JSON 404.
        if (alive.current) setError(e instanceof SyntaxError
          ? "Restart the desktop app to enable publishing (its backend is older than this editor build)."
          : (e as Error).message);
      } finally {
        if (alive.current) setLoading(false);
      }
    })();
  }, [api, projectId]);

  const view: "key" | "sites" | "linked" = !connected ? "key" : (!link || choosingSite) ? "sites" : "linked";

  // Load the site list whenever the picker is showing.
  useEffect(() => {
    if (!api || view !== "sites" || sites !== null) return;
    void run(async () => {
      const r = await api.netlifyListSites();
      if (!alive.current) return;
      setSites(r.sites);
      setAccounts(r.accounts);
      setAccountSlug(r.accounts[0]?.slug ?? "");
    });
  }, [api, view, sites, run]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (sites ?? []).filter(s => !q || s.name.toLowerCase().includes(q));
  }, [sites, search]);

  const connect = () => run(async () => {
    const r = await api!.netlifySetKey(keyText);
    if (!alive.current) return;
    setKeyText("");   // don't keep the key in component state once the backend has it
    setUser(r.user);
    setConnected(true);
  });

  const disconnect = () => run(async () => {
    await api!.netlifyClearKey();
    if (!alive.current) return;
    setConnected(false);
    setUser(null);
    setSites(null);
    setStatus(null);
  });

  const pickSite = (s: NetlifySite) => run(async () => {
    const next: PublishLink = { provider: "netlify", siteId: s.id, siteName: s.name, url: s.url };
    await api!.setPublishLink(projectId, next);
    if (!alive.current) return;
    setLink(next);
    setLastPublish(null);
    setStatus(null);
    setChoosingSite(false);
  });

  const createSite = () => run(async () => {
    const site = await api!.netlifyCreateSite({ name: toSiteName(newName), accountSlug: accounts.length > 1 ? accountSlug : undefined });
    const next: PublishLink = { provider: "netlify", siteId: site.id, siteName: site.name, url: site.url };
    await api!.setPublishLink(projectId, next);
    if (!alive.current) return;
    setSites(null);   // refetch next time — it now includes the new site
    setLink(next);
    setLastPublish(null);
    setStatus(null);
    setChoosingSite(false);
  });

  const publishing = status !== null && status.phase !== "done" && status.phase !== "error";

  const publish = async () => {
    setError(null);
    setCopied(false);
    setStatus({ phase: "exporting", done: 0, total: 0, bytesDone: 0, bytesTotal: 0 });
    try {
      await onBeforePublish();
      const { jobId } = await api!.startPublish(projectId);
      for (;;) {
        const s = await api!.getPublishStatus(jobId);
        if (!alive.current) return;
        setStatus(s);
        if (s.phase === "done" || s.phase === "error") break;
        await new Promise(r => setTimeout(r, 500));
      }
      const l = await api!.getPublishLink(projectId);
      if (alive.current) setLastPublish(l.lastPublish);
    } catch (e) {
      if (alive.current) setStatus({ phase: "error", done: 0, total: 0, bytesDone: 0, bytesTotal: 0, error: (e as Error).message });
    }
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); }
    catch { /* the URL field below is selectable as the fallback */ }
  };

  const liveUrl = status?.phase === "done" ? (status.url || link?.url || "") : (link?.url ?? "");
  const pct = status?.phase === "uploading" && status.bytesTotal > 0 ? Math.round(100 * status.bytesDone / status.bytesTotal)
    : status?.phase === "processing" || status?.phase === "done" ? 100 : 0;

  return (
    <div style={OVERLAY} onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={MODAL}>
        <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ color: "#dde3f0", fontSize: 12, letterSpacing: 1, flex: 1 }}>PUBLISH “{projectName}” TO NETLIFY</span>
          <button onClick={onClose} title="Close" style={{ background: "none", border: "none", color: "#8b94a8", fontSize: 16, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        <div style={BODY}>
          {loading && <div style={HINT}>Checking your Netlify connection…</div>}

          {/* ── 1. no key ───────────────────────────────────────────────── */}
          {!loading && view === "key" && (
            <>
              <div style={HINT}>
                Paste a Netlify personal access token. It is checked with Netlify, then stored on this
                computer only (never in the game folder or the published game).
              </div>
              <div>
                <div style={{ ...LABEL, marginBottom: 4 }}>Netlify API key</div>
                <input
                  type="password" autoFocus value={keyText} placeholder="nfp_…" style={INPUT}
                  onChange={e => setKeyText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && keyText.trim() && !busy) void connect(); }}
                />
              </div>
              <button style={GHOST} onClick={() => void api?.openExternal(TOKEN_PAGE)}>
                Get a key: Netlify → User settings → Applications → Personal access tokens ↗
              </button>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button style={PRIMARY(!!keyText.trim() && !busy)} disabled={!keyText.trim() || busy} onClick={() => void connect()}>
                  {busy ? "Checking…" : "Connect"}
                </button>
              </div>
            </>
          )}

          {/* ── 2. pick or create a site ────────────────────────────────── */}
          {!loading && view === "sites" && (
            <>
              <div style={HINT}>
                Choose the Netlify site this game publishes to. Every publish goes to the same site until you change it.
              </div>

              <div>
                <div style={{ ...LABEL, marginBottom: 4 }}>Create a new site</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={newName} style={INPUT} spellCheck={false}
                    onChange={e => setNewName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                    onKeyDown={e => { if (e.key === "Enter" && toSiteName(newName) && !busy) void createSite(); }} />
                  <button style={{ ...PRIMARY(!!toSiteName(newName) && !busy), whiteSpace: "nowrap" }} disabled={!toSiteName(newName) || busy} onClick={() => void createSite()}>
                    Create
                  </button>
                </div>
                <div style={{ ...HINT, marginTop: 4 }}>
                  Address: <span style={{ color: "#c2cadb" }}>https://{toSiteName(newName) || "…"}.netlify.app</span> (names are shared by all of Netlify, so common ones are taken)
                </div>
                {accounts.length > 1 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <span style={LABEL}>Team</span>
                    <select value={accountSlug} onChange={e => setAccountSlug(e.target.value)} style={{ ...INPUT, width: "auto", padding: "4px 8px" }}>
                      {accounts.map(a => <option key={a.slug} value={a.slug}>{a.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <div style={{ ...LABEL, marginBottom: 4 }}>Or use an existing site</div>
                <input value={search} placeholder="Search your sites…" style={INPUT} onChange={e => setSearch(e.target.value)} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" }}>
                {sites === null && !error && <div style={HINT}>Loading your sites…</div>}
                {sites !== null && filtered.length === 0 && (
                  <div style={HINT}>{sites.length === 0 ? "This Netlify account has no sites yet. Create one above." : "No site matches that search."}</div>
                )}
                {filtered.map(s => (
                  <button key={s.id} style={ROW(s.id === link?.siteId)} disabled={busy} onClick={() => void pickSite(s)}>
                    <span style={{ color: "#dde3f0", fontSize: 12 }}>{s.name}{s.id === link?.siteId ? "  (current)" : ""}</span>
                    <span style={{ color: "#98a2b8", fontSize: 10 }}>{s.url}</span>
                  </button>
                ))}
              </div>
              {link && <button style={GHOST} onClick={() => { setChoosingSite(false); setError(null); }}>← Keep “{link.siteName}”</button>}
            </>
          )}

          {/* ── 3. linked: publish ──────────────────────────────────────── */}
          {!loading && view === "linked" && link && (
            <>
              <div style={{ ...ROW(false), cursor: "default" }}>
                <span style={{ color: "#dde3f0", fontSize: 12 }}>{link.siteName}</span>
                <span style={{ color: "#98a2b8", fontSize: 11 }}>{link.url}</span>
                <span style={{ color: "#98a2b8", fontSize: 10 }}>
                  {lastPublish ? `Last published ${ago(lastPublish.at)}` : "Not published from this computer yet"}
                </span>
              </div>

              {status && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ color: status.phase === "error" ? "#e08585" : status.phase === "done" ? "#66cc88" : "#dde3f0", fontSize: 12 }}>
                    {PHASE_LABEL[status.phase]}
                    {status.phase === "uploading" && `  ${status.done} / ${status.total} files  (${mb(status.bytesDone)} / ${mb(status.bytesTotal)} MB)`}
                    {status.phase === "hashing" && status.total > 0 && `  ${status.done} / ${status.total}`}
                  </div>
                  {status.phase !== "error" && (
                    <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: status.phase === "done" ? "#66cc88" : "#80aaff", transition: "width 0.3s" }} />
                    </div>
                  )}
                  {status.phase === "error" && <div style={ERROR}>{status.error}</div>}
                  {status.phase === "done" && (
                    <>
                      <div style={HINT}>
                        {status.uploadedCount === 0
                          ? `Nothing had changed: all ${status.fileCount} files were already on Netlify.`
                          : `Uploaded ${status.uploadedCount} of ${status.fileCount} files (${mb(status.uploadedBytes ?? 0)} MB). The others did not need uploading: Netlify already had identical files.`}
                      </div>
                      {!!status.missing?.length && (
                        <div style={{ ...ERROR, whiteSpace: "pre-wrap" }}>Referenced by the game but not found, so not published:{"\n"}{status.missing.join("\n")}</div>
                      )}
                    </>
                  )}
                </div>
              )}

              {liveUrl && (status?.phase === "done" || lastPublish) && (
                <div style={{ display: "flex", gap: 8 }}>
                  <input readOnly value={liveUrl} style={INPUT} onFocus={e => e.currentTarget.select()} />
                  <button style={{ ...PRIMARY(true), whiteSpace: "nowrap" }} onClick={() => void api?.openExternal(liveUrl)}>Open ↗</button>
                  <button style={{ ...PRIMARY(true), whiteSpace: "nowrap" }} onClick={() => void copy(liveUrl)}>{copied ? "Copied" : "Copy"}</button>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <button style={GHOST} disabled={publishing} onClick={() => { setChoosingSite(true); setError(null); }}>Change site…</button>
                <span style={{ flex: 1 }} />
                <button style={PRIMARY(!publishing)} disabled={publishing} onClick={() => void publish()}>
                  {publishing ? "Publishing…" : status?.phase === "done" ? "Publish again" : "Publish"}
                </button>
              </div>
              {publishing && <div style={HINT}>You can close this window; the publish keeps going.</div>}
            </>
          )}

          {error && <div style={{ ...ERROR, whiteSpace: "pre-wrap" }}>{error}</div>}
        </div>

        {!loading && connected && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ ...HINT, flex: 1 }}>Connected{user ? ` as ${user.name}` : ""}</span>
            <button style={GHOST} disabled={publishing || busy} onClick={() => void disconnect()}>Disconnect Netlify</button>
          </div>
        )}
      </div>
    </div>
  );
}
