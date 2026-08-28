import { useEffect, useRef, useState } from "react";

interface SoundRecorderModalProps {
  onRecorded: (file: File) => void;   // the trimmed recording as a .wav File → import pipeline
  onClose:    () => void;
}

const OVERLAY: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 60,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "rgba(0,0,0,0.6)",
};
const CARD: React.CSSProperties = {
  background: "rgba(28,28,28,0.99)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8, padding: "20px 24px", width: 420,
  boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
  display: "flex", flexDirection: "column", gap: 14,
  color: "#c2cadb", fontFamily: "monospace",
};
const LABEL: React.CSSProperties = { color: "#8888a0", fontSize: 9, letterSpacing: 1 };
const NUM: React.CSSProperties = {
  width: 64, boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 4, background: "rgba(40,40,40,0.9)", color: "#c0c0c0",
  fontSize: 10, fontFamily: "monospace", padding: "3px 6px", outline: "none",
};
const BTN = (variant: "primary" | "ghost" | "danger" | "record" = "ghost", enabled = true): React.CSSProperties => ({
  padding: "6px 14px", borderRadius: 4, cursor: enabled ? "pointer" : "default",
  fontFamily: "monospace", fontSize: 11,
  background: !enabled ? "rgba(255,255,255,0.03)"
    : variant === "primary" ? "rgba(80,140,255,0.15)"
    : variant === "danger"  ? "rgba(200,60,60,0.15)"
    : variant === "record"  ? "rgba(200,60,60,0.2)" : "transparent",
  border: `1px solid ${!enabled ? "rgba(255,255,255,0.07)"
    : variant === "primary" ? "rgba(80,140,255,0.35)"
    : variant === "danger" || variant === "record" ? "rgba(200,60,60,0.4)" : "rgba(255,255,255,0.1)"}`,
  color: !enabled ? "#555"
    : variant === "primary" ? "#80aaff"
    : variant === "danger" || variant === "record" ? "#cc6666" : "#8b94a8",
});

/** AudioBuffer (trimmed) → 16-bit PCM WAV. WAV because MediaRecorder's webm/opus
 *  can't be re-encoded after trimming without a codec; PCM is trivial to write,
 *  decodes everywhere, and recordings are short. */
function bufferToWav(buf: AudioBuffer, startSec: number, endSec: number): Blob {
  const rate = buf.sampleRate;
  const from = Math.max(0, Math.floor(startSec * rate));
  const to   = Math.min(buf.length, Math.ceil((buf.duration - endSec) * rate));
  const len  = Math.max(1, to - from);
  const ch   = Math.min(2, buf.numberOfChannels);
  const bytes = 44 + len * ch * 2;
  const ab = new ArrayBuffer(bytes);
  const v = new DataView(ab);
  const wstr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  wstr(0, "RIFF"); v.setUint32(4, bytes - 8, true); wstr(8, "WAVE");
  wstr(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  wstr(36, "data"); v.setUint32(40, len * ch * 2, true);
  let o = 44;
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  for (let i = from; i < to; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c]![i] ?? 0));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

/** One recorded take. Trim fields are STRING state on text inputs
 *  (inputMode=decimal): commits on every keystroke so ▶ always plays the
 *  current trim, and typing "0.5" survives (a controlled type=number reports
 *  "" mid-decimal and eats the dot). Numeric values are derived per render. */
interface Take {
  id: number;
  buf: AudioBuffer;
  peaks: number[];       // 0..1 envelope, PEAK_N buckets — the row's waveform
  trimStartStr: string;
  trimEndStr: string;
}
const PEAK_N = 64;
function computePeaks(buf: AudioBuffer): number[] {
  const d = buf.getChannelData(0);
  const per = Math.max(1, Math.floor(d.length / PEAK_N));
  const out: number[] = [];
  let max = 0;
  for (let b = 0; b < PEAK_N; b++) {
    let m = 0;
    const from = b * per, to = Math.min(d.length, from + per);
    for (let i = from; i < to; i += 4) { const a = Math.abs(d[i]!); if (a > m) m = a; }
    out.push(m); if (m > max) max = m;
  }
  return max > 0 ? out.map(v => v / max) : out;   // normalize so quiet takes still read
}
/** Trim second-field: plain text input (typing/decimals untouched) plus ▲/▼
 *  buttons and ArrowUp/Down keys stepping the PARSED value by 0.1s. A native
 *  type=number spinner would bring back the mid-decimal "" bug. */
type StrUpdate = string | ((prev: string) => string);
function TrimField({ value, onChange }: { value: string; onChange: (v: StrUpdate) => void }) {
  // Functional update: rapid clicks / a held arrow key step from the LATEST
  // value, not the one captured at render.
  const step = (dir: 1 | -1) => onChange(prev => {
    const n = Math.max(0, (parseFloat(prev) || 0) + dir * 0.1);
    return (Math.round(n * 10) / 10).toString();
  });
  const arrow: React.CSSProperties = {
    width: 16, height: 11, padding: 0, lineHeight: "10px", fontSize: 8, cursor: "pointer",
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#98a2b8",
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "stretch", gap: 1 }}>
      <input inputMode="decimal" style={{ ...NUM, width: 48 }} value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === "ArrowUp")   { e.preventDefault(); step(1); }
          if (e.key === "ArrowDown") { e.preventDefault(); step(-1); }
        }} />
      <span style={{ display: "inline-flex", flexDirection: "column", gap: 1 }}>
        <button style={{ ...arrow, borderRadius: "3px 3px 0 0" }} title="+0.1s" tabIndex={-1}
          onClick={e => { e.stopPropagation(); step(1); }}>▲</button>
        <button style={{ ...arrow, borderRadius: "0 0 3px 3px" }} title="−0.1s" tabIndex={-1}
          onClick={e => { e.stopPropagation(); step(-1); }}>▼</button>
      </span>
    </span>
  );
}
const takeTrims = (t: Take) => {
  const trimStart = Math.max(0, parseFloat(t.trimStartStr) || 0);
  const trimEnd   = Math.max(0, parseFloat(t.trimEndStr) || 0);
  return { trimStart, trimEnd, trimmedDur: Math.max(0, t.buf.duration - trimStart - trimEnd) };
};

/**
 * Record sounds with the microphone — as many takes as you like. Each take is
 * previewable (trim-aware) with its own trim; pick one and hand it to the
 * normal audio import pipeline (metadata step + manifest write) as a .wav
 * file. Editor-only.
 */
export function SoundRecorderModal({ onRecorded, onClose }: SoundRecorderModalProps) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [name, setName] = useState("recording");
  const [takes, setTakes] = useState<Take[]>([]);
  const [selId, setSelId] = useState<number | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);

  const recRef    = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const ctxRef    = useRef<AudioContext | null>(null);
  const srcRef    = useRef<AudioBufferSourceNode | null>(null);
  const timerRef  = useRef<number | null>(null);
  const nextIdRef = useRef(1);

  const stopPlayback = () => {
    try { srcRef.current?.stop(); } catch { /* not started */ }
    srcRef.current = null;
    setPlayingId(null);
  };
  const releaseMic = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };
  const deadRef = useRef(false);
  useEffect(() => () => {   // unmount: stop everything
    deadRef.current = true;   // onstop fires async after this — it must not decode or mint a context
    if (timerRef.current != null) clearInterval(timerRef.current);
    try { recRef.current?.stop(); } catch { /* not recording */ }
    releaseMic();
    stopPlayback();
    void ctxRef.current?.close();
  }, []);

  const startRecording = async () => {
    setError(null);
    stopPlayback();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone unavailable — check the mic permission for this app/browser.");
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];
    const rec = new MediaRecorder(stream);
    recRef.current = rec;
    rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = async () => {
      releaseMic();
      if (deadRef.current) return;   // modal closed mid-recording
      if (timerRef.current != null) { clearInterval(timerRef.current); timerRef.current = null; }
      setRecording(false);
      try {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const ctx = (ctxRef.current ??= new AudioContext());
        const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
        const id = nextIdRef.current++;
        setTakes(t => [...t, { id, buf, peaks: computePeaks(buf), trimStartStr: "0", trimEndStr: "0" }]);
        setSelId(id);   // newest take starts picked
      } catch {
        setError("Recording could not be decoded — try again.");
      }
    };
    rec.start();
    setElapsed(0);
    const t0 = performance.now();
    timerRef.current = window.setInterval(() => setElapsed((performance.now() - t0) / 1000), 100);
    setRecording(true);
  };

  const stopRecording = () => { try { recRef.current?.stop(); } catch { /* not recording */ } };

  const playTake = (take: Take) => {
    const { trimStart, trimmedDur } = takeTrims(take);
    if (trimmedDur <= 0) return;
    stopPlayback();
    const ctx = (ctxRef.current ??= new AudioContext());
    if (ctx.state === "suspended") void ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = take.buf;
    src.connect(ctx.destination);
    src.onended = () => setPlayingId(p => (p === take.id ? null : p));
    src.start(0, trimStart, trimmedDur);   // preview exactly what would be saved
    srcRef.current = src;
    setPlayingId(take.id);
  };

  const patchTrim = (id: number, key: "trimStartStr" | "trimEndStr", v: StrUpdate) => {
    stopPlayback();
    setTakes(t => t.map(x => (x.id === id ? { ...x, [key]: typeof v === "function" ? v(x[key]) : v } : x)));
  };
  const deleteTake = (id: number) => {
    stopPlayback();
    setTakes(t => {
      const rest = t.filter(x => x.id !== id);
      if (selId === id) setSelId(rest.length ? rest[rest.length - 1]!.id : null);
      return rest;
    });
  };

  const selected = takes.find(t => t.id === selId) ?? null;
  const selTrims = selected ? takeTrims(selected) : null;

  const save = () => {
    if (!selected || !selTrims || selTrims.trimmedDur <= 0) return;
    stopPlayback();
    const wav = bufferToWav(selected.buf, selTrims.trimStart, selTrims.trimEnd);
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "recording";
    onRecorded(new File([wav], `${slug}.wav`, { type: "audio/wav" }));
  };

  const fmt = (s: number) => `${s.toFixed(1)}s`;

  return (
    <div style={OVERLAY}>
      <div style={CARD}>
        <div style={{ color: "#c0c0c0", fontSize: 13, letterSpacing: 1 }}>RECORD SOUND</div>

        {error && <div style={{ color: "#cc6666", fontSize: 11, lineHeight: 1.4 }}>{error}</div>}

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {recording ? (
            <>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#e05555", flexShrink: 0 }} />
              <span style={{ fontSize: 12 }}>{fmt(elapsed)}</span>
              <span style={{ flex: 1 }} />
              <button style={BTN("danger")} onClick={stopRecording}>■ Stop</button>
            </>
          ) : (
            <>
              <span style={{ color: "#8b94a8", fontSize: 11 }}>
                {takes.length === 0 ? "Ready — recording starts immediately." : `${takes.length} take${takes.length > 1 ? "s" : ""} — pick one to import.`}
              </span>
              <span style={{ flex: 1 }} />
              <button style={BTN("record")} onClick={() => void startRecording()}>
                {takes.length === 0 ? "● Record" : "● Record another"}
              </button>
            </>
          )}
        </div>

        {takes.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 260, overflowY: "auto" }}>
            {takes.map(t => {
              const { trimStart, trimEnd, trimmedDur } = takeTrims(t);
              const picked = t.id === selId;
              const dur = t.buf.duration;
              const cutL = dur > 0 ? Math.min(1, trimStart / dur) : 0;   // trimmed fractions, shaded on the waveform
              const cutR = dur > 0 ? Math.min(1, trimEnd / dur) : 0;
              const W = 120, H = 18;
              return (
                <div key={t.id}
                  onClick={() => { if (!picked) { stopPlayback(); setSelId(t.id); } }}
                  style={{
                    display: "flex", flexDirection: "column", gap: 4, padding: "5px 8px",
                    borderRadius: 4, cursor: picked ? "default" : "pointer",
                    background: picked ? "rgba(80,140,255,0.10)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${picked ? "rgba(80,140,255,0.35)" : "rgba(255,255,255,0.07)"}`,
                  }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: picked ? "#80aaff" : "#666e80", width: 12 }}>{picked ? "●" : "○"}</span>
                    <span style={{ fontSize: 11, color: picked ? "#dde3f0" : "#98a2b8", whiteSpace: "nowrap" }}>Take {t.id}</span>
                    <svg width={W} height={H} style={{ flexShrink: 0, background: "rgba(0,0,0,0.25)", borderRadius: 2 }}
                      aria-label="waveform">
                      {t.peaks.map((v, i) => {
                        const h = Math.max(1, v * (H - 2));
                        return <rect key={i} x={(i * W) / PEAK_N} y={(H - h) / 2} width={Math.max(1, W / PEAK_N - 0.5)} height={h}
                          fill={picked ? "#80aaff" : "#8b94a8"} />;
                      })}
                      {cutL > 0 && <rect x={0} y={0} width={cutL * W} height={H} fill="rgba(20,20,20,0.8)" />}
                      {cutR > 0 && <rect x={W - cutR * W} y={0} width={cutR * W} height={H} fill="rgba(20,20,20,0.8)" />}
                    </svg>
                    <span style={{ fontSize: 10, color: "#8a92a6", whiteSpace: "nowrap" }}>
                      {fmt(trimmedDur)}{trimStart || trimEnd ? ` (of ${fmt(dur)})` : ""}
                    </span>
                    <span style={{ flex: 1 }} />
                    <button style={{ ...BTN("ghost"), padding: "2px 8px" }} disabled={trimmedDur <= 0}
                      title={playingId === t.id ? "Stop" : "Preview this take (trim applied)"}
                      onClick={e => { e.stopPropagation(); playingId === t.id ? stopPlayback() : playTake(t); }}>
                      {playingId === t.id ? "⏹" : "▶"}
                    </button>
                    <button style={{ ...BTN("ghost"), padding: "2px 8px", color: "#cc6666" }}
                      title="Delete this take"
                      onClick={e => { e.stopPropagation(); deleteTake(t.id); }}>✕</button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 20 }}>
                    <span style={LABEL}>TRIM START (s)</span>
                    <TrimField value={t.trimStartStr} onChange={v => patchTrim(t.id, "trimStartStr", v)} />
                    <span style={{ ...LABEL, marginLeft: 6 }}>END (s)</span>
                    <TrimField value={t.trimEndStr} onChange={v => patchTrim(t.id, "trimEndStr", v)} />
                    {trimmedDur <= 0 && <span style={{ color: "#ccaa44", fontSize: 10, marginLeft: 6 }}>⚠ trim exceeds length</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selected && selTrims && (
          <>
            <div>
              <div style={{ ...LABEL, marginBottom: 3 }}>NAME</div>
              <input style={{ ...NUM, width: "100%" }} value={name}
                onChange={e => setName(e.target.value)} />
            </div>
            <div style={{ color: "#8a92a6", fontSize: 9, lineHeight: 1.4 }}>
              Each take has its own trim; ▶ previews that take exactly as it would be
              saved (shaded = trimmed off). Import sends the picked (●) take to the
              normal sound-import step (category, tags, attribution) as a .wav.
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button style={BTN("ghost")} onClick={onClose}>Cancel</button>
          <button style={BTN("primary", !!selTrims && selTrims.trimmedDur > 0 && !recording)}
            disabled={!selTrims || selTrims.trimmedDur <= 0 || recording}
            onClick={save}>Import →</button>
        </div>
      </div>
    </div>
  );
}
