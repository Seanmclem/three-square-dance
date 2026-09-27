import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  desktop, type GitHubRepo, type GitHubUser, type LastPublish, type NetlifyAccount, type NetlifySite, type NetlifyUser,
  type PublishLink, type PublishProvider, type PublishStatus, type VercelProject, type VercelTeam, type VercelUser,
} from "@/shared/desktopApi";
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
  borderRadius: 8, width: 460, maxHeight: "85vh", display: "flex", flexDirection: "column",
  color: "#c2cadb", fontFamily: "monospace", fontSize: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
};
const BODY: React.CSSProperties = { padding: 16, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" };
const LABEL: React.CSSProperties = { color: "#8b94a8", fontSize: 10, letterSpacing: 1, textTransform: "uppercase" };
const HINT: React.CSSProperties = { color: "#98a2b8", fontSize: 11, lineHeight: 1.5 };
const ERROR: React.CSSProperties = { color: "#e08585", fontSize: 11, lineHeight: 1.5, whiteSpace: "pre-wrap" };
const NOTE: React.CSSProperties = {
  color: "#c2cadb", fontSize: 11, lineHeight: 1.5, padding: "8px 12px", borderRadius: 4,
  background: "rgba(255,190,80,0.08)", border: "1px solid rgba(255,190,80,0.35)",
};
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
/** Small provider badge so the host is always visible next to a site name. */
const TAG: React.CSSProperties = {
  display: "inline-block", padding: "1px 6px", borderRadius: 3, fontSize: 10, letterSpacing: 1,
  background: "rgba(255,255,255,0.08)", color: "#c2cadb", marginRight: 8, verticalAlign: "middle",
};

const PROVIDER_LABEL: Record<PublishProvider, string> = { netlify: "Netlify", github: "GitHub Pages", vercel: "Vercel" };
const PHASE_LABEL: Record<PublishStatus["phase"], string> = {
  exporting:  "Building the game bundle…",
  hashing:    "Checking files…",
  preparing:  "Asking the host what changed…",
  uploading:  "Uploading…",
  processing: "Putting it live…",
  building:   "GitHub is building the site (usually 1 to 3 minutes)…",
  done:       "Published",
  error:      "Publish failed",
};

const NETLIFY_TOKEN_PAGE = "https://app.netlify.com/user/applications#personal-access-tokens";
/** GitHub prefills the classic-token form from the query string: one scope, a name. */
const GITHUB_TOKEN_PAGE = "https://github.com/settings/tokens/new?description=World%20Builder%20publishing&scopes=public_repo";
const VERCEL_TOKEN_PAGE = "https://vercel.com/account/settings/tokens";

/** Netlify site names are subdomains: lowercase letters, digits, hyphens. */
const toSiteName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
/** GitHub repo names: letters, digits, `-` `_` `.`. */
const toRepoName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 100);
/** Vercel project names: lowercase letters, digits, hyphens (they double as the <name>.vercel.app subdomain). */
const toProjectName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);

function ago(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 60 * 24) return `${Math.floor(min / 60)} h ago`;
  return new Date(iso).toLocaleDateString();
}
const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
const linkName = (l: PublishLink) => l.provider === "netlify" ? l.siteName : l.provider === "github" ? `${l.owner}/${l.repo}` : l.projectName;

/**
 * Publish a game to Netlify, GitHub Pages or Vercel (phases 75 + 76). A game is linked
 * to ONE host + site; the link (publish.json) remembers which, so reopening the
 * modal lands straight on "Publish" for that site. Views: choose a host → paste
 * that host's token → pick or create a site → linked (Publish). Tokens only ever
 * travel INTO the backend; this component never sees them again.
 */
export function PublishModal({ projectId, projectName, onBeforePublish, onClose }: Props) {
  useEscapeClose(onClose);
  const api = desktop();

  const [loading, setLoading] = useState(true);
  const [netlify, setNetlify] = useState<{ connected: boolean; user: NetlifyUser | null }>({ connected: false, user: null });
  const [github, setGithub]   = useState<{ connected: boolean; user: GitHubUser | null }>({ connected: false, user: null });
  const [vercel, setVercel]   = useState<{ connected: boolean; user: VercelUser | null }>({ connected: false, user: null });
  const [link, setLink] = useState<PublishLink | null>(null);
  const [lastPublish, setLastPublish] = useState<LastPublish | null>(null);
  const [changing, setChanging] = useState(false);            // "Change site…" pressed
  const [chosen, setChosen] = useState<PublishProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [keyText, setKeyText] = useState("");

  // Netlify picker
  const [sites, setSites] = useState<NetlifySite[] | null>(null);
  const [accounts, setAccounts] = useState<NetlifyAccount[]>([]);
  const [siteSearch, setSiteSearch] = useState("");
  const [newSite, setNewSite] = useState(() => toSiteName(projectId));
  const [accountSlug, setAccountSlug] = useState("");
  // GitHub picker
  const [repos, setRepos] = useState<GitHubRepo[] | null>(null);
  const [repoSearch, setRepoSearch] = useState("");
  const [newRepo, setNewRepo] = useState(() => toRepoName(projectId));
  const [repoPrivate, setRepoPrivate] = useState(false);
  // Vercel picker
  const [vProjects, setVProjects] = useState<VercelProject[] | null>(null);
  const [vTeams, setVTeams] = useState<VercelTeam[]>([]);
  const [vSearch, setVSearch] = useState("");
  const [newProject, setNewProject] = useState(() => toProjectName(projectId));
  const [vTeamId, setVTeamId] = useState<string>("");   // "" = personal account

  const [status, setStatus] = useState<PublishStatus | null>(null);
  const [copied, setCopied] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

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
        const [n, g, v, l] = await Promise.all([api.netlifyStatus(), api.githubStatus(), api.vercelStatus(), api.getPublishLink(projectId)]);
        if (!alive.current) return;
        setNetlify({ connected: n.connected, user: n.user ?? null });
        setGithub({ connected: g.connected, user: g.user ?? null });
        setVercel({ connected: v.connected, user: v.user ?? null });
        const problems = [n.error, g.error, v.error].filter(Boolean);
        if (problems.length) setError(problems.join("\n"));
        setLink(l.link);
        setLastPublish(l.lastPublish);
      } catch (e) {
        // Dev only: the page hot-reloads but the shell's Deno backend does not, so an
        // older backend answers these methods with a non-JSON 404.
        if (alive.current) setError(e instanceof SyntaxError
          ? "Restart the desktop app to enable publishing (its backend is older than this editor build)."
          : (e as Error).message);
      } finally {
        if (alive.current) setLoading(false);
      }
    })();
  }, [api, projectId]);

  const conn = (p: PublishProvider) => p === "netlify" ? netlify : p === "github" ? github : vercel;
  const connected = (p: PublishProvider) => conn(p).connected;
  // Which host the current screen is about.
  const active: PublishProvider | null = link && !changing ? link.provider : chosen;
  const view: "choose" | "key" | "target" | "linked" =
    !active ? "choose"
    : !connected(active) ? "key"
    : link && !changing ? "linked"
    : "target";
  /** The user is moving a linked game somewhere else (other site or other host). */
  const moving = !!link && changing;

  // Load the picker list whenever it is showing.
  useEffect(() => {
    if (!api || view !== "target") return;
    if (active === "netlify" && sites === null) {
      void run(async () => {
        const r = await api.netlifyListSites();
        if (!alive.current) return;
        setSites(r.sites); setAccounts(r.accounts); setAccountSlug(r.accounts[0]?.slug ?? "");
      });
    }
    if (active === "github" && repos === null) {
      void run(async () => {
        const r = await api.githubListRepos();
        if (!alive.current) return;
        setRepos(r.repos);
        setGithub(g => ({ ...g, user: r.user }));
      });
    }
    if (active === "vercel" && vProjects === null) {
      void run(async () => {
        const r = await api.vercelListProjects();
        if (!alive.current) return;
        setVProjects(r.projects);
        setVTeams(r.teams);
        setVercel(v => ({ ...v, user: r.user }));
      });
    }
  }, [api, view, active, sites, repos, vProjects, run]);

  const filteredSites = useMemo(() => {
    const q = siteSearch.trim().toLowerCase();
    return (sites ?? []).filter(s => !q || s.name.toLowerCase().includes(q));
  }, [sites, siteSearch]);
  const filteredRepos = useMemo(() => {
    const q = repoSearch.trim().toLowerCase();
    return (repos ?? []).filter(r => !q || r.repo.toLowerCase().includes(q));
  }, [repos, repoSearch]);
  const filteredProjects = useMemo(() => {
    const q = vSearch.trim().toLowerCase();
    return (vProjects ?? []).filter(p => !q || p.name.toLowerCase().includes(q));
  }, [vProjects, vSearch]);
  const teamName = (id: string | null) => id ? (vTeams.find(t => t.id === id)?.name ?? "team") : "personal";

  const connect = () => run(async () => {
    if (active === "netlify") {
      const r = await api!.netlifySetKey(keyText);
      if (!alive.current) return;
      setNetlify({ connected: true, user: r.user });
    } else if (active === "github") {
      const r = await api!.githubSetKey(keyText);
      if (!alive.current) return;
      setGithub({ connected: true, user: r.user });
    } else {
      const r = await api!.vercelSetKey(keyText);
      if (!alive.current) return;
      setVercel({ connected: true, user: r.user });
    }
    setKeyText("");   // never keep a token in component state once the backend has it
  });

  const disconnect = (p: PublishProvider) => run(async () => {
    if (p === "netlify") { await api!.netlifyClearKey(); if (alive.current) { setNetlify({ connected: false, user: null }); setSites(null); } }
    else if (p === "github") { await api!.githubClearKey(); if (alive.current) { setGithub({ connected: false, user: null }); setRepos(null); } }
    else { await api!.vercelClearKey(); if (alive.current) { setVercel({ connected: false, user: null }); setVProjects(null); } }
    if (alive.current) setStatus(null);
  });

  const applyLink = async (next: PublishLink): Promise<void> => {
    await api!.setPublishLink(projectId, next);
    if (!alive.current) return;
    setLink(next);
    setLastPublish(null);
    setStatus(null);
    setChanging(false);
    setChosen(null);
  };
  const pickSite = (s: NetlifySite) => run(() => applyLink({ provider: "netlify", siteId: s.id, siteName: s.name, url: s.url }));
  const createSite = () => run(async () => {
    const site = await api!.netlifyCreateSite({ name: toSiteName(newSite), accountSlug: accounts.length > 1 ? accountSlug : undefined });
    setSites(null);
    await applyLink({ provider: "netlify", siteId: site.id, siteName: site.name, url: site.url });
  });
  const pickRepo = (r: GitHubRepo) => run(() => applyLink({ provider: "github", owner: r.owner, repo: r.repo, branch: "main", url: `https://${r.owner}.github.io/${r.repo}/` }));
  const createRepo = () => run(async () => {
    const r = await api!.githubCreateRepo({ name: toRepoName(newRepo), isPrivate: repoPrivate });
    setRepos(null);
    await applyLink({ provider: "github", owner: r.owner, repo: r.repo, branch: "main", url: `https://${r.owner}.github.io/${r.repo}/` });
  });
  const pickProject = (p: VercelProject) => run(() => applyLink({ provider: "vercel", projectId: p.id, projectName: p.name, teamId: p.teamId, url: p.url }));
  const createProject = () => run(async () => {
    const p = await api!.vercelCreateProject({ name: toProjectName(newProject), teamId: vTeamId || null });
    setVProjects(null);
    await applyLink({ provider: "vercel", projectId: p.id, projectName: p.name, teamId: p.teamId, url: p.url });
  });

  const publishing = status !== null && status.phase !== "done" && status.phase !== "error";

  const publish = async () => {
    if (!link) return;
    setError(null);
    setCopied(false);
    setStatus({ phase: "exporting", provider: link.provider, done: 0, total: 0, bytesDone: 0, bytesTotal: 0 });
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
      if (alive.current) setStatus({ phase: "error", provider: link.provider, done: 0, total: 0, bytesDone: 0, bytesTotal: 0, error: (e as Error).message });
    }
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); }
    catch { /* the URL field is selectable as the fallback */ }
  };

  const liveUrl = status?.phase === "done" ? (status.url || link?.url || "") : (link?.url ?? "");
  const pct = status?.phase === "uploading" && status.bytesTotal > 0 ? Math.round(100 * status.bytesDone / status.bytesTotal)
    : status?.phase === "processing" || status?.phase === "building" || status?.phase === "done" ? 100 : 0;
  const ghLogin = github.user?.login ?? "<you>";

  const providerCard = (p: PublishProvider, blurb: string) => {
    const c = conn(p);
    const who = p === "netlify" ? netlify.user?.name : p === "github" ? github.user?.login : vercel.user?.username;
    const isCurrent = link?.provider === p;
    return (
      <button key={p} style={ROW(isCurrent)} disabled={busy} onClick={() => { setChosen(p); setError(null); }}>
        <span style={{ color: "#dde3f0", fontSize: 12 }}>{PROVIDER_LABEL[p]}{isCurrent ? "  (current host)" : ""}</span>
        <span style={{ color: "#98a2b8", fontSize: 10 }}>{blurb}</span>
        <span style={{ color: c.connected ? "#8fd19e" : "#98a2b8", fontSize: 10 }}>{c.connected ? `Connected as ${who}` : "Not connected yet: you will paste a token next"}</span>
      </button>
    );
  };

  const keepButton = link && (
    <button style={GHOST} onClick={() => { setChanging(false); setChosen(null); setError(null); }}>← Keep {PROVIDER_LABEL[link.provider]} · {linkName(link)}</button>
  );

  return (
    <div style={OVERLAY} onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={MODAL}>
        <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ color: "#dde3f0", fontSize: 12, letterSpacing: 1, flex: 1 }}>PUBLISH “{projectName}”</span>
          <button onClick={onClose} title="Close" style={{ background: "none", border: "none", color: "#8b94a8", fontSize: 16, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        <div style={BODY}>
          {loading && <div style={HINT}>Checking your hosting connections…</div>}

          {/* ── choose a host ────────────────────────────────────────────── */}
          {!loading && view === "choose" && (
            <>
              {moving && link && (
                <div style={NOTE}>
                  This game currently publishes to <b>{PROVIDER_LABEL[link.provider]}</b> ({linkName(link)}).
                  Picking another site or host moves future publishes there. The existing site stays online until you delete it on {PROVIDER_LABEL[link.provider]}.
                </div>
              )}
              <div style={HINT}>{moving ? "Where should this game publish from now on?" : "Where should this game live? You choose once; every later Publish goes to the same place."}</div>
              {providerCard("netlify", "Free tier fine for commercial games. Uploads only the files that changed; live in seconds.")}
              {providerCard("github", "Free on a public repository. Site at <you>.github.io/<repo>/; GitHub takes a minute or two to build each publish.")}
              {providerCard("vercel", "Free Hobby plan for personal, non-commercial games (100 MB per game). Live in seconds at <project>.vercel.app.")}
              {moving && keepButton}
            </>
          )}

          {/* ── paste a token for the active host ───────────────────────── */}
          {!loading && view === "key" && active && (
            <>
              {link && !changing && (
                <div style={NOTE}>
                  This game publishes to <b>{PROVIDER_LABEL[link.provider]}</b> ({linkName(link)}), but {PROVIDER_LABEL[link.provider]} is not connected on this computer. Connect it to publish, or change the site below.
                </div>
              )}
              {active === "vercel" && (
                <>
                  <div style={HINT}>
                    Vercel needs an access token so the app can create the project and upload the game. It is checked with Vercel, then stored on this computer only.
                  </div>
                  <div style={{ ...HINT, color: "#c2cadb" }}>
                    1. Open the tokens page below and press <span style={{ color: "#dde3f0" }}>Create</span>.<br />
                    2. Name it (say, World Builder), set Scope to your account or team, pick an expiry.<br />
                    3. Copy the token (Vercel shows it once) and paste it here.
                  </div>
                  <button style={GHOST} onClick={() => void api?.openExternal(VERCEL_TOKEN_PAGE)}>
                    Open Vercel → Account settings → Tokens ↗
                  </button>
                  <div>
                    <div style={{ ...LABEL, marginBottom: 4 }}>Vercel token</div>
                    <input type="password" autoFocus value={keyText} placeholder="…" style={INPUT}
                      onChange={e => setKeyText(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && keyText.trim() && !busy) void connect(); }} />
                  </div>
                  <div style={HINT}>Vercel's free Hobby plan is for personal, non-commercial use; a game you sell or run ads on needs Pro.</div>
                </>
              )}
              {active === "netlify" && (
                <>
                  <div style={HINT}>
                    Paste a Netlify personal access token. It is checked with Netlify, then stored on this
                    computer only (never in the game folder or the published game).
                  </div>
                  <div>
                    <div style={{ ...LABEL, marginBottom: 4 }}>Netlify API key</div>
                    <input type="password" autoFocus value={keyText} placeholder="nfp_…" style={INPUT}
                      onChange={e => setKeyText(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && keyText.trim() && !busy) void connect(); }} />
                  </div>
                  <button style={GHOST} onClick={() => void api?.openExternal(NETLIFY_TOKEN_PAGE)}>
                    Get a key: Netlify → User settings → Applications → Personal access tokens ↗
                  </button>
                </>
              )}
              {active === "github" && (
                <>
                  <div style={HINT}>
                    GitHub Pages needs a personal access token so the app can create the repository, push the game and switch Pages on. It is checked with GitHub, then stored on this computer only.
                  </div>
                  <div style={{ ...HINT, color: "#c2cadb" }}>
                    1. Open the token page below (GitHub prefills the one box it needs, <span style={{ color: "#dde3f0" }}>public_repo</span>).<br />
                    2. Pick an expiry and press <span style={{ color: "#dde3f0" }}>Generate token</span>.<br />
                    3. Copy it right away (GitHub shows it once) and paste it here.
                  </div>
                  <button style={GHOST} onClick={() => void api?.openExternal(GITHUB_TOKEN_PAGE)}>
                    Open GitHub → Settings → Developer settings → Personal access tokens (classic) ↗
                  </button>
                  <div>
                    <div style={{ ...LABEL, marginBottom: 4 }}>GitHub token</div>
                    <input type="password" autoFocus value={keyText} placeholder="ghp_…" style={INPUT}
                      onChange={e => setKeyText(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && keyText.trim() && !busy) void connect(); }} />
                  </div>
                  <div style={HINT}>Want a private repository instead? Tick <span style={{ color: "#c2cadb" }}>repo</span> rather than public_repo. Pages on a private repository needs a paid GitHub plan.</div>
                </>
              )}
              <div style={{ display: "flex", alignItems: "center" }}>
                {(!link || changing) && <button style={GHOST} onClick={() => { setChosen(null); setKeyText(""); setError(null); }}>← Other host</button>}
                {link && !changing && <button style={GHOST} onClick={() => { setChanging(true); setChosen(null); setKeyText(""); setError(null); }}>Change site…</button>}
                <span style={{ flex: 1 }} />
                <button style={PRIMARY(!!keyText.trim() && !busy)} disabled={!keyText.trim() || busy} onClick={() => void connect()}>
                  {busy ? "Checking…" : "Connect"}
                </button>
              </div>
            </>
          )}

          {/* ── pick or create a site / repo ─────────────────────────────── */}
          {!loading && view === "target" && active === "netlify" && (
            <>
              {moving && link && link.provider !== "netlify" && (
                <div style={NOTE}>Moving from <b>{PROVIDER_LABEL[link.provider]}</b> ({linkName(link)}) to Netlify. The {PROVIDER_LABEL[link.provider]} site stays as it is.</div>
              )}
              <div style={HINT}>Choose the Netlify site this game publishes to. Every publish goes to the same site until you change it.</div>
              <div>
                <div style={{ ...LABEL, marginBottom: 4 }}>Create a new site</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={newSite} style={INPUT} spellCheck={false}
                    onChange={e => setNewSite(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                    onKeyDown={e => { if (e.key === "Enter" && toSiteName(newSite) && !busy) void createSite(); }} />
                  <button style={{ ...PRIMARY(!!toSiteName(newSite) && !busy), whiteSpace: "nowrap" }} disabled={!toSiteName(newSite) || busy} onClick={() => void createSite()}>Create</button>
                </div>
                <div style={{ ...HINT, marginTop: 4 }}>
                  Address: <span style={{ color: "#c2cadb" }}>https://{toSiteName(newSite) || "…"}.netlify.app</span> (names are shared by all of Netlify, so common ones are taken)
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
                <input value={siteSearch} placeholder="Search your sites…" style={INPUT} onChange={e => setSiteSearch(e.target.value)} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
                {sites === null && !error && <div style={HINT}>Loading your sites…</div>}
                {sites !== null && filteredSites.length === 0 && <div style={HINT}>{sites.length === 0 ? "This Netlify account has no sites yet. Create one above." : "No site matches that search."}</div>}
                {filteredSites.map(s => {
                  const cur = link?.provider === "netlify" && s.id === link.siteId;
                  return (
                    <button key={s.id} style={ROW(cur)} disabled={busy} onClick={() => void pickSite(s)}>
                      <span style={{ color: "#dde3f0", fontSize: 12 }}>{s.name}{cur ? "  (current)" : ""}</span>
                      <span style={{ color: "#98a2b8", fontSize: 10 }}>{s.url}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                <button style={GHOST} onClick={() => { setChosen(null); setError(null); }}>← Other host</button>
                {keepButton}
              </div>
            </>
          )}

          {!loading && view === "target" && active === "github" && (
            <>
              {moving && link && link.provider !== "github" && (
                <div style={NOTE}>Moving from <b>{PROVIDER_LABEL[link.provider]}</b> ({linkName(link)}) to GitHub Pages. The {PROVIDER_LABEL[link.provider]} site stays as it is.</div>
              )}
              <div style={HINT}>Choose the GitHub repository this game publishes to. The app pushes the game to its <span style={{ color: "#c2cadb" }}>main</span> branch and switches Pages on; every publish goes to the same repository until you change it.</div>
              <div>
                <div style={{ ...LABEL, marginBottom: 4 }}>Create a new repository</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={newRepo} style={INPUT} spellCheck={false}
                    onChange={e => setNewRepo(e.target.value.replace(/[^A-Za-z0-9._-]/g, "-"))}
                    onKeyDown={e => { if (e.key === "Enter" && toRepoName(newRepo) && !busy) void createRepo(); }} />
                  <button style={{ ...PRIMARY(!!toRepoName(newRepo) && !busy), whiteSpace: "nowrap" }} disabled={!toRepoName(newRepo) || busy} onClick={() => void createRepo()}>Create</button>
                </div>
                <div style={{ ...HINT, marginTop: 4 }}>
                  Address: <span style={{ color: "#c2cadb" }}>https://{ghLogin}.github.io/{toRepoName(newRepo) || "…"}/</span>
                </div>
                <label style={{ ...HINT, display: "flex", alignItems: "center", gap: 6, marginTop: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={!repoPrivate} onChange={e => setRepoPrivate(!e.target.checked)} />
                  Public repository (anyone can see the game files, which a published game shows anyway)
                </label>
                {repoPrivate && <div style={{ ...HINT, marginTop: 4 }}>Pages on a private repository needs a paid GitHub plan and a token with the <span style={{ color: "#c2cadb" }}>repo</span> scope.</div>}
              </div>
              <div>
                <div style={{ ...LABEL, marginBottom: 4 }}>Or use an existing repository</div>
                <input value={repoSearch} placeholder="Search your repositories…" style={INPUT} onChange={e => setRepoSearch(e.target.value)} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
                {repos === null && !error && <div style={HINT}>Loading your repositories…</div>}
                {repos !== null && filteredRepos.length === 0 && <div style={HINT}>{repos.length === 0 ? "This GitHub account has no repositories yet. Create one above." : "No repository matches that search."}</div>}
                {filteredRepos.map(r => {
                  const cur = link?.provider === "github" && r.owner === link.owner && r.repo === link.repo;
                  return (
                    <button key={r.fullName} style={ROW(cur)} disabled={busy} onClick={() => void pickRepo(r)}>
                      <span style={{ color: "#dde3f0", fontSize: 12 }}>{r.fullName}{r.isPrivate ? "  (private)" : ""}{cur ? "  (current)" : ""}</span>
                      <span style={{ color: "#98a2b8", fontSize: 10 }}>https://{r.owner}.github.io/{r.repo}/  ·  the game replaces whatever is on its main branch</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                <button style={GHOST} onClick={() => { setChosen(null); setError(null); }}>← Other host</button>
                {keepButton}
              </div>
            </>
          )}

          {!loading && view === "target" && active === "vercel" && (
            <>
              {moving && link && link.provider !== "vercel" && (
                <div style={NOTE}>Moving from <b>{PROVIDER_LABEL[link.provider]}</b> ({linkName(link)}) to Vercel. The {PROVIDER_LABEL[link.provider]} site stays as it is.</div>
              )}
              <div style={HINT}>Choose the Vercel project this game publishes to. Every publish goes to the same project until you change it.</div>
              <div>
                <div style={{ ...LABEL, marginBottom: 4 }}>Create a new project</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={newProject} style={INPUT} spellCheck={false}
                    onChange={e => setNewProject(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                    onKeyDown={e => { if (e.key === "Enter" && toProjectName(newProject) && !busy) void createProject(); }} />
                  <button style={{ ...PRIMARY(!!toProjectName(newProject) && !busy), whiteSpace: "nowrap" }} disabled={!toProjectName(newProject) || busy} onClick={() => void createProject()}>Create</button>
                </div>
                <div style={{ ...HINT, marginTop: 4 }}>
                  Address: <span style={{ color: "#c2cadb" }}>https://{toProjectName(newProject) || "…"}.vercel.app</span> (Vercel adds a suffix if that name is taken elsewhere)
                </div>
                {vTeams.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <span style={LABEL}>Scope</span>
                    <select value={vTeamId} onChange={e => setVTeamId(e.target.value)} style={{ ...INPUT, width: "auto", padding: "4px 8px" }}>
                      <option value="">Personal account{vercel.user ? ` (${vercel.user.username})` : ""}</option>
                      {vTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div>
                <div style={{ ...LABEL, marginBottom: 4 }}>Or use an existing project</div>
                <input value={vSearch} placeholder="Search your projects…" style={INPUT} onChange={e => setVSearch(e.target.value)} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
                {vProjects === null && !error && <div style={HINT}>Loading your projects…</div>}
                {vProjects !== null && filteredProjects.length === 0 && <div style={HINT}>{vProjects.length === 0 ? "This Vercel account has no projects yet. Create one above." : "No project matches that search."}</div>}
                {filteredProjects.map(p => {
                  const cur = link?.provider === "vercel" && p.id === link.projectId;
                  return (
                    <button key={p.id} style={ROW(cur)} disabled={busy} onClick={() => void pickProject(p)}>
                      <span style={{ color: "#dde3f0", fontSize: 12 }}>{p.name}{p.teamId ? `  (${teamName(p.teamId)})` : ""}{cur ? "  (current)" : ""}</span>
                      <span style={{ color: "#98a2b8", fontSize: 10 }}>{p.url}  ·  the game replaces the project's production deployment</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                <button style={GHOST} onClick={() => { setChosen(null); setError(null); }}>← Other host</button>
                {keepButton}
              </div>
            </>
          )}

          {/* ── linked: publish ──────────────────────────────────────────── */}
          {!loading && view === "linked" && link && (
            <>
              <div style={{ ...ROW(false), cursor: "default" }}>
                <span style={{ color: "#dde3f0", fontSize: 12 }}><span style={TAG}>{PROVIDER_LABEL[link.provider].toUpperCase()}</span>{linkName(link)}{link.provider === "github" ? `  ·  ${link.branch}` : link.provider === "vercel" && link.teamId ? `  ·  ${teamName(link.teamId)}` : ""}</span>
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
                  {status.phase !== "error" && status.phase !== "building" && (
                    <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: status.phase === "done" ? "#66cc88" : "#80aaff", transition: "width 0.3s" }} />
                    </div>
                  )}
                  {status.phase === "error" && <div style={ERROR}>{status.error}</div>}
                  {status.phase === "done" && (
                    <>
                      <div style={HINT}>
                        {status.uploadedCount === 0
                          ? `Nothing had changed: all ${status.fileCount} files were already on ${PROVIDER_LABEL[link.provider]}.`
                          : `Uploaded ${status.uploadedCount} of ${status.fileCount} files (${mb(status.uploadedBytes ?? 0)} MB). The others did not need uploading: ${PROVIDER_LABEL[link.provider]} already had identical files.`}
                      </div>
                      {status.stillBuilding && <div style={NOTE}>The files are on GitHub, but its build had not finished yet. Give the link a few minutes; a 404 in the meantime is normal.</div>}
                      {!!status.missing?.length && <div style={ERROR}>Referenced by the game but not found, so not published:{"\n"}{status.missing.join("\n")}</div>}
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
                <button style={GHOST} disabled={publishing} onClick={() => { setChanging(true); setChosen(null); setError(null); }}>Change site…</button>
                <span style={{ flex: 1 }} />
                <button style={PRIMARY(!publishing)} disabled={publishing} onClick={() => void publish()}>
                  {publishing ? "Publishing…" : status?.phase === "done" ? "Publish again" : `Publish to ${PROVIDER_LABEL[link.provider]}`}
                </button>
              </div>
              {publishing && <div style={HINT}>You can close this window; the publish keeps going.</div>}
            </>
          )}

          {error && <div style={ERROR}>{error}</div>}
        </div>

        {!loading && (netlify.connected || github.connected || vercel.connected) && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", borderTop: "1px solid rgba(255,255,255,0.08)", flexWrap: "wrap" }}>
            {netlify.connected && (
              <span style={HINT}>Netlify: {netlify.user?.name ?? "connected"} <button style={{ ...GHOST, padding: 0, marginLeft: 6 }} disabled={publishing || busy} onClick={() => void disconnect("netlify")}>Disconnect</button></span>
            )}
            {github.connected && (
              <span style={HINT}>GitHub: {github.user?.login ?? "connected"} <button style={{ ...GHOST, padding: 0, marginLeft: 6 }} disabled={publishing || busy} onClick={() => void disconnect("github")}>Disconnect</button></span>
            )}
            {vercel.connected && (
              <span style={HINT}>Vercel: {vercel.user?.username ?? "connected"} <button style={{ ...GHOST, padding: 0, marginLeft: 6 }} disabled={publishing || busy} onClick={() => void disconnect("vercel")}>Disconnect</button></span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
