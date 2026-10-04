/**
 * Character animation regression recorder (Phase 86 §9). Plays a fixed set of real
 * keyboard inputs on the obby, on THROWAWAY test harnesses (never the user's app), with
 * the game loop driven by a fixed 1/60 s clock and seeded Math.random, and records every
 * frame: the player's position, its locomotion intent and the clips playing at what
 * weight, and each enemy's state, clip and position.
 *
 *   node scripts/regression/character-anim.mjs record <out.json>
 *   node scripts/regression/character-anim.mjs compare <baseline.json> <new.json>
 *
 * Needs `playwright-core` (system Chrome) importable; set PLAYWRIGHT_CORE to its path
 * if it isn't installed here. The harness serves dist/ (note: the desktop dev watcher
 * rebuilds it on every save); DIST=<dir> records against another build instead, e.g. a
 * baseline built from the last commit in a git worktree with `vite build --outDir`.
 * Used before and after refactoring the player and enemy code (not every change).
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const [mode, a, b] = process.argv.slice(2);

const INIT = `(() => {
  const realRaf = window.requestAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  let manual = false, queue = [], vt = 0, seed = 1;
  window.requestAnimationFrame = cb => { if (manual) { queue.push(cb); return 0; } return realRaf(cb); };
  performance.now = () => manual ? vt : realNow();
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  window.__reg = {
    manual() { manual = true; vt = realNow(); },
    seed(s) { seed = s >>> 0; Math.random = rand; },
    step(n, sample) {
      const out = [];
      for (let i = 0; i < n; i++) {
        vt += 1000 / 60;
        const q = queue; queue = [];
        for (const cb of q) cb(vt);
        if (sample) out.push(window.__reg.sample());
      }
      return out;
    },
    sample() {
      const r4 = v => Math.round(v * 1e4) / 1e4;
      const c = window.__preview?._controller;
      const acts = m => (m?._actions ?? []).filter(x => x.isRunning() && x.getEffectiveWeight() > 0.001)
        .map(x => [x.getClip().name, Math.round(x.getEffectiveWeight() * 1000) / 1000]).sort();
      // Before Phase 86 the controller held the mixer itself; after, the shared CharacterAnimator does.
      const player = c ? { p: [r4(c._body.position.x), r4(c._body.position.y), r4(c._body.position.z)],
        intent: c._anim ? c._anim.current : c._currentClip, acts: acts(c._anim ? c._anim.mixer : c._mixer) } : null;
      const ai = window.__enemyAI;
      const enemies = [];
      for (const rec of ai?._recs?.values?.() ?? []) {
        let o = null;
        window.__scene.traverse(n => { if (!o && n.userData?.editorId === rec.id && n.userData?.editorType === "object") o = n; });
        enemies.push({ id: rec.id, state: rec.state, clip: rec.currentClip,
          p: o ? [r4(o.position.x), r4(o.position.y), r4(o.position.z)] : null,
          acts: acts(window.__objectPlacer?._anims?.get(rec.id)?.mixer ?? window.__objectPlacer?._mixers?.get(rec.id)) });   // Phase 86 C: animator per object
      }
      return { player, enemies };
    },
  };
})();`;

async function harness(scene, port) {
  // DIST=<dir>: record against another build (a baseline built from an older commit).
  const env = { ...process.env, ...(process.env.DIST ? { HARNESS_DIST: process.env.DIST } : {}) };
  // `deno run` directly (not `deno task`): killing a task wrapper leaves its server
  // running on the port, and the next recording then talks to the old one.
  const proc = spawn("deno", ["run", "-A", "scripts/test-harness.ts", "platfrom-obby", scene, String(port)], { cwd: REPO, env, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("harness didn't start")), 30000);
    proc.stdout.on("data", d => { if (String(d).includes("harness:")) { clearTimeout(t); setTimeout(res, 500); } });
  });
  return proc;
}

async function scenario(browser, scene, port, steps) {
  const proc = await harness(scene, port);
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(INIT);
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => !!window.__world && !!window.__test && !!window.__preview, null, { timeout: 90000 });
    await page.waitForTimeout(3000);
    // The fixed clock starts BEFORE the game does, so the whole session is frame-exact
    // (starting it later made the start depend on load timing). No frame runs while
    // the avatar loads.
    await page.evaluate(() => { window.__reg.manual(); window.__reg.seed(42); });
    await page.waitForTimeout(300);                       // stray real frames drain into the queue
    await page.evaluate(() => window.__test.enterGame());
    await page.waitForFunction(() => { const c = window.__preview?._controller; return !!(c?._anim || c?._mixer); }, null, { timeout: 30000, polling: 100 });   // avatar loaded (timer polling: rAF is held by the fixed clock)
    await page.waitForTimeout(500);
    await page.mouse.move(640, 400);
    const frames = [];
    const run = async n => { frames.push(...await page.evaluate(n => window.__reg.step(n, true), n)); };
    const mark = label => frames.push({ mark: label });
    await steps({ page, run, mark });
    await page.close();
    return { scene, frames, errors };
  } finally {
    proc.kill("SIGTERM");
    await new Promise(r => proc.once("exit", r));
  }
}

async function record(out) {
  const pw = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
  const chromium = pw.chromium ?? pw.default?.chromium;   // ESM build or CommonJS default export
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const key = async (page, k, down) => down ? page.keyboard.down(k) : page.keyboard.up(k);
  const act = (page, action) => page.evaluate(a => window.__test.runAction(a), action);
  const runs = [];
  try {
    // Jump Lab: locomotion, jumps, run, a scripted clip, respawn, the crab.
    runs.push(await scenario(browser, "level_3", 7431, async ({ page, run, mark }) => {
      mark("settle"); await run(30);
      mark("idle"); await run(90);
      mark("walk"); await key(page, "KeyD", true); await run(60); await key(page, "KeyD", false); await run(60);
      mark("tap jump"); await key(page, "Space", true); await run(2); await key(page, "Space", false); await run(90);
      mark("hold jump"); await key(page, "Space", true); await run(40); await key(page, "Space", false); await run(90);
      mark("run"); await key(page, "ShiftLeft", true); await key(page, "KeyA", true); await run(60);
      await key(page, "KeyA", false); await key(page, "ShiftLeft", false); await run(60);
      mark("walk + jump"); await key(page, "KeyD", true); await run(20); await key(page, "Space", true); await run(30); await key(page, "Space", false); await run(40); await key(page, "KeyD", false); await run(60);
      mark("script clip"); await page.evaluate(() => window.__bus.emit("character:play-animation", { clipName: "Duck", loop: false, hold: false })); await run(90);
      await page.evaluate(() => window.__bus.emit("character:play-animation", { clipName: "__auto__" })); await run(30);
      mark("respawn"); await act(page, { type: "respawn_player" }); await run(150);
      mark("approach crab"); await key(page, "KeyW", true); await run(45); await key(page, "KeyW", false);
      mark("crab chase + bite"); await run(360);
      mark("stomp"); await page.evaluate(() => {
        const rec = [...window.__enemyAI._recs.values()][0];
        let o = null; window.__scene.traverse(n => { if (!o && n.userData?.editorId === rec.id && n.userData?.editorType === "object") o = n; });
        window.__test.runAction({ type: "teleport_player", position: { x: o.position.x, y: o.position.y + 3, z: o.position.z } });
      }); await run(150);
    }));
    // Level 1: the ladder.
    runs.push(await scenario(browser, "level_1", 7432, async ({ page, run, mark }) => {
      mark("to ladder"); await act(page, { type: "teleport_player", position: { x: -40.364, y: 7.45, z: -24.4 }, facingSource: "literal", facing: 0 }); await run(60);
      mark("climb"); await key(page, "KeyW", true); await run(30); await key(page, "KeyE", true); await run(2); await key(page, "KeyE", false); await run(120); await key(page, "KeyW", false); await run(60);
    }));
  } finally { await browser.close(); }
  writeFileSync(out, JSON.stringify({ recordedAt: new Date().toISOString(), runs }));
  for (const r of runs) {
    const fr = r.frames.filter(f => !f.mark);
    const intents = [...new Set(fr.map(f => f.player?.intent))];
    const clips = [...new Set(fr.flatMap(f => (f.player?.acts ?? []).map(x => x[0])))];
    const eclips = [...new Set(fr.flatMap(f => f.enemies.map(e => `${e.state}/${e.clip}`)))];
    console.log(`${r.scene}: ${fr.length} frames · intents ${intents.join(",")} · clips ${clips.join(",")} · enemies ${eclips.join(",") || "none"} · errors ${r.errors.length}`);
  }
}

function compare(fa, fb) {
  const A = JSON.parse(readFileSync(fa, "utf8")), B = JSON.parse(readFileSync(fb, "utf8"));
  let bad = 0;
  for (let i = 0; i < A.runs.length; i++) {
    const ra = A.runs[i], rb = B.runs[i];
    let section = "", maxP = 0, maxE = 0, maxW = 0, firstClip = null, firstIntent = null, firstEnemy = null, n = 0;
    const len = Math.max(ra.frames.length, rb.frames.length);
    for (let k = 0; k < len; k++) {
      const x = ra.frames[k], y = rb.frames[k];
      if (!x || !y) { bad++; console.log(`${ra.scene}: frame count differs (${ra.frames.length} vs ${rb.frames.length})`); break; }
      if (x.mark) { section = x.mark; continue; }
      n++;
      const where = `${section} +${k}`;
      if (x.player && y.player) {
        maxP = Math.max(maxP, ...x.player.p.map((v, j) => Math.abs(v - y.player.p[j])));
        if (x.player.intent !== y.player.intent && !firstIntent) firstIntent = `${where}: ${x.player.intent} → ${y.player.intent}`;
        const na = x.player.acts.map(c => c[0]).join(","), nb = y.player.acts.map(c => c[0]).join(",");
        if (na !== nb && !firstClip) firstClip = `${where}: [${na}] → [${nb}]`;
        if (na === nb) x.player.acts.forEach((c, j) => { maxW = Math.max(maxW, Math.abs(c[1] - y.player.acts[j][1])); });
      }
      x.enemies.forEach((e, j) => {
        const f = y.enemies[j];
        if (!f || e.state !== f.state || e.clip !== f.clip) { if (!firstEnemy) firstEnemy = `${where}: ${e.state}/${e.clip} → ${f?.state}/${f?.clip}`; return; }
        if (e.p && f.p) maxE = Math.max(maxE, ...e.p.map((v, q) => Math.abs(v - f.p[q])));
      });
    }
    const ok = maxP <= 0.01 && maxE <= 0.01 && !firstClip && !firstIntent && !firstEnemy && maxW <= 0.02;
    if (!ok) bad++;
    console.log(`${ok ? "SAME" : "DIFF"} ${ra.scene} (${n} frames): player Δpos ${maxP.toFixed(4)} m, Δweight ${maxW.toFixed(3)}, enemy Δpos ${maxE.toFixed(4)} m`
      + (firstIntent ? `\n  first intent change ${firstIntent}` : "") + (firstClip ? `\n  first clip change ${firstClip}` : "") + (firstEnemy ? `\n  first enemy change ${firstEnemy}` : ""));
  }
  process.exit(bad ? 1 : 0);
}

if (mode === "record" && a) await record(a);
else if (mode === "compare" && a && b) compare(a, b);
else { console.log("usage: record <out.json> | compare <baseline.json> <new.json>"); process.exit(2); }
