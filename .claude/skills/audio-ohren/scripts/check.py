"""Objective hearing test for narration: per scene Whisper vs. script, pace, pitch movement, pauses, loudness.

Usage:
  python3 -I check.py --timeline timeline.json --audio voice.wav [--mix final.wav] [--lang en]
  python3 -I check.py --audio sample.wav --text "expected sentence" [--lang en]     (single file)
Exit code 1 if any scene fails the criteria.
"""
import argparse, json, os, re, subprocess, sys, tempfile
import numpy as np, librosa, sherpa_onnx

ap = argparse.ArgumentParser()
ap.add_argument("--timeline"); ap.add_argument("--audio", required=True); ap.add_argument("--mix")
ap.add_argument("--text"); ap.add_argument("--lang", default="en")
ap.add_argument("--max-cer", type=float, default=0.03); ap.add_argument("--max-cer-mix", type=float, default=0.05)
ap.add_argument("--wps", default="2.4-4.2", help="allowed words/second range (English default)")
a = ap.parse_args()
lo, hi = map(float, a.wps.split("-"))

EARS = os.environ.get("EARS_DIR", "/opt/ears"); M = f"{EARS}/sherpa-onnx-whisper-small/small-"
rec = sherpa_onnx.OfflineRecognizer.from_whisper(encoder=M + "encoder.int8.onnx", decoder=M + "decoder.int8.onnx",
                                                tokens=M + "tokens.txt", language=a.lang, task="transcribe", num_threads=4)

def load(fn):  # any format via ffmpeg -> 16 kHz mono
    tmp = tempfile.mktemp(suffix=".wav")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", fn, "-ac", "1", "-ar", "16000", tmp], check=True)
    y, _ = librosa.load(tmp, sr=16000); os.remove(tmp); return y

def transcribe(y):  # padding so Whisper does not drop the last word
    s = rec.create_stream(); s.accept_waveform(16000, np.concatenate([np.zeros(4000), y, np.zeros(9600)]).astype(np.float32))
    rec.decode_stream(s); return s.result.text.strip()

chars = lambda s: re.sub(r"[^a-z0-9äöüß]", "", s.lower())
def cer(ref, hyp):
    r, h = chars(ref), chars(hyp); prev = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        cur = [i] + [0] * len(h)
        for j in range(1, len(h) + 1): cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r[i - 1] != h[j - 1]))
        prev = cur
    return prev[-1] / max(1, len(r))

def prosody(y):
    f0, _, _ = librosa.pyin(y, fmin=65, fmax=500, sr=16000); f0 = f0[~np.isnan(f0)]
    st = 12 * np.log2(f0 / np.median(f0)) if len(f0) else np.array([0.0])
    rms = librosa.feature.rms(y=y, hop_length=160)[0]; voiced = rms > 0.06 * rms.max()
    idx = np.where(voiced)[0]; inner = ~voiced[idx[0]:idx[-1]] if len(idx) else np.array([])
    runs, run = [], 0
    for v in inner:
        if v: run += 1
        else:
            if run: runs.append(run * .01); run = 0
    longest = max(runs) if runs else 0.0
    return float(np.median(f0)) if len(f0) else 0.0, float(st.std()), longest

def lufs(y):
    tmp = tempfile.mktemp(suffix=".wav"); import soundfile as sf; sf.write(tmp, y, 16000)
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", tmp, "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    os.remove(tmp); m = re.findall(r"I:\s+(-?[\d.]+) LUFS", out); return float(m[-1]) if m else float("nan")

if a.timeline:
    tl = json.load(open(a.timeline, encoding="utf-8"))
    scenes = [(b["scene"], b["start"], b["end"], b.get("text") or " ".join(w["d"] for w in b["words"]),
               b.get("spoken") or " ".join(w.get("s", w["d"]) for w in b["words"])) for b in tl["beats"]]
else:
    y0 = load(a.audio); scenes = [("datei", 0, len(y0) / 16000, a.text or "", a.text or "")]

voice = load(a.audio); mix = load(a.mix) if a.mix else None
fails = 0
print(f"{'Szene':12s} {'Fehler':>6s} {'Mix':>6s} {'W/s':>5s} {'Hz':>4s} {'Bew.':>5s} {'Pause':>5s}  Whisper hört")
for name, s, e, shown, spoken in scenes:
    seg = voice[int(s * 16000): int(e * 16000)]
    hyp = transcribe(seg); err = min(cer(shown, hyp), cer(spoken, hyp)) if shown else 0.0
    f0, mov, pause = prosody(seg); nw = len(spoken.split()) or 1; wps = nw / max(.1, (e - s))   # spoken words ("seven and a half" = 4)
    merr = None
    if mix is not None:
        mh = transcribe(mix[int(s * 16000): int(e * 16000)]); merr = min(cer(shown, mh), cer(spoken, mh))
    bad = []
    if shown and err > a.max_cer: bad.append("Aussprache")
    if merr is not None and merr > a.max_cer_mix: bad.append("im Mix verdeckt")
    if shown and not (lo <= wps <= hi): bad.append("Tempo")
    if pause > 1.0: bad.append("Pause>1s")
    fails += bool(bad)
    print(f"{name[:12]:12s} {err*100:5.1f}% {('%5.1f%%' % (merr*100)) if merr is not None else '    -':>6s} {wps:5.2f} {f0:4.0f} {mov:5.2f} {pause:5.2f}  {hyp[:80]}"
          + (f"   <-- {', '.join(bad)}" if bad else ""))
print(f"\nLautheit Stimme: {lufs(voice):.1f} LUFS" + (f" | Mix: {lufs(mix):.1f} LUFS" if mix is not None else ""))
print("ERGEBNIS:", "BESTANDEN" if not fails else f"{fails} Szene(n) durchgefallen")
print("Hinweis: Messwerte erkennen keine 'Müdigkeit' – Stimmproben immer vom Nutzer anhören lassen.")
sys.exit(1 if fails else 0)
