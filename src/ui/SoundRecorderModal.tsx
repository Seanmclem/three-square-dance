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
  borderRadius: 8, padding: "20px 24px", width: 360,
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

/**
 * Record a sound with the microphone, preview it (trim-aware), trim silence off
 * either end, and hand the result to the normal audio import pipeline (metadata
 * step + manifest write) as a .wav file. Editor-only.
 */
export function SoundRecorderModal({ onRecorded, onClose }: SoundRecorderModalProps) {
  const [phase, setPhase] = useState<"idle" | "recording" | "recorded">("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [name, setName] = useState("recording");
  // Trim fields are STRING state on text inputs (inputMode=decimal): commits on
  // every keystroke so ▶ always plays the current trim (blur-commit made Play
  // read stale values), and typing "0.5" survives (a controlled type=number
  // reports "" mid-decimal and eats the dot — the original v4.79.36 bug).
  const [trimStartStr, setTrimStartStr] = useState("0");
  const [trimEndStr, setTrimEndStr] = useState("0");
  const trimStart = Math.max(0, parseFloat(trimStartStr) || 0);
  const trimEnd   = Math.max(0, parseFloat(trimEndStr) || 0);
  const [playing, setPlaying] = useState(false);

  const recRef    = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const bufRef    = useRef<AudioBuffer | null>(null);
  const ctxRef    = useRef<AudioContext | null>(null);
  const srcRef    = useRef<AudioBufferSourceNode | null>(null);
  const timerRef  = useRef<number | null>(null);

  const stopPlayback = () => {
    try { srcRef.current?.stop(); } catch { /* not started */ }
    srcRef.current = null;
    setPlaying(false);
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
      try {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const ctx = (ctxRef.current ??= new AudioContext());
        bufRef.current = await ctx.decodeAudioData(await blob.arrayBuffer());
        setTrimStartStr("0"); setTrimEndStr("0");
        setPhase("recorded");
      } catch {
        setError("Recording could not be decoded — try again.");
        setPhase("idle");
      }
    };
    rec.start();
    setElapsed(0);
    const t0 = performance.now();
    timerRef.current = window.setInterval(() => setElapsed((performance.now() - t0) / 1000), 100);
    setPhase("recording");
  };

  const stopRecording = () => { try { recRef.current?.stop(); } catch { /* not recording */ } };

  const dur = bufRef.current?.duration ?? 0;
  const trimmedDur = Math.max(0, dur - trimStart - trimEnd);

  const playPreview = () => {
    const buf = bufRef.current;
    if (!buf || trimmedDur <= 0) return;
    stopPlayback();
    const ctx = (ctxRef.current ??= new AudioContext());
    if (ctx.state === "suspended") void ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = () => setPlaying(false);
    src.start(0, trimStart, trimmedDur);   // preview exactly what will be saved
    srcRef.current = src;
    setPlaying(true);
  };

  const save = () => {
    const buf = bufRef.current;
    if (!buf || trimmedDur <= 0) return;
    stopPlayback();
    const wav = bufferToWav(buf, trimStart, trimEnd);
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "recording";
    onRecorded(new File([wav], `${slug}.wav`, { type: "audio/wav" }));
  };

  const fmt = (s: number) => `${s.toFixed(1)}s`;

  return (
    <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={CARD}>
        <div style={{ color: "#c0c0c0", fontSize: 13, letterSpacing: 1 }}>RECORD SOUND</div>

        {error && <div style={{ color: "#cc6666", fontSize: 11, lineHeight: 1.4 }}>{error}</div>}

        {phase !== "recorded" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {phase === "recording" ? (
              <>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#e05555", flexShrink: 0 }} />
                <span style={{ fontSize: 12 }}>{fmt(elapsed)}</span>
                <span style={{ flex: 1 }} />
                <button style={BTN("danger")} onClick={stopRecording}>■ Stop</button>
              </>
            ) : (
              <>
                <span style={{ color: "#8b94a8", fontSize: 11 }}>Ready — recording starts immediately.</span>
                <span style={{ flex: 1 }} />
                <button style={BTN("record")} onClick={() => void startRecording()}>● Record</button>
              </>
            )}
          </div>
        )}

        {phase === "recorded" && bufRef.current && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button style={BTN("primary")} onClick={() => playing ? stopPlayback() : playPreview()}>
                {playing ? "⏹ Stop" : "▶ Play"}
              </button>
              <span style={{ fontSize: 11, color: "#98a2b8" }}>
                {fmt(trimmedDur)}{trimStart || trimEnd ? ` (of ${fmt(dur)})` : ""}
              </span>
              <span style={{ flex: 1 }} />
              <button style={BTN("record")} title="Discard this take and record a new one"
                onClick={() => void startRecording()}>● Re-record</button>
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
              <div>
                <div style={{ ...LABEL, marginBottom: 3 }}>TRIM START (s)</div>
                <input inputMode="decimal" style={NUM} value={trimStartStr}
                  onChange={e => { setTrimStartStr(e.target.value); stopPlayback(); }} />
              </div>
              <div>
                <div style={{ ...LABEL, marginBottom: 3 }}>TRIM END (s)</div>
                <input inputMode="decimal" style={NUM} value={trimEndStr}
                  onChange={e => { setTrimEndStr(e.target.value); stopPlayback(); }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...LABEL, marginBottom: 3 }}>NAME</div>
                <input style={{ ...NUM, width: "100%" }} value={name}
                  onChange={e => setName(e.target.value)} />
              </div>
            </div>
            {trimmedDur <= 0 && (
              <div style={{ color: "#ccaa44", fontSize: 10 }}>⚠ Trim exceeds the recording length.</div>
            )}
            <div style={{ color: "#8a92a6", fontSize: 9, lineHeight: 1.4 }}>
              ▶ Play previews exactly what will be saved. Import opens the normal
              sound-import step (category, tags, attribution) with this recording
              as a .wav file.
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button style={BTN("ghost")} onClick={onClose}>Cancel</button>
          <button style={BTN("primary", phase === "recorded" && trimmedDur > 0)}
            disabled={phase !== "recorded" || trimmedDur <= 0}
            onClick={save}>Import →</button>
        </div>
      </div>
    </div>
  );
}
