"""Kokoro voice from a script file. One synthesis per scene (no choppy sentence gluing).

Usage: python3 -I tts.py script.txt out_dir [--voice af_heart] [--speed 1.22] [--energy] [--lang en-us]
Script line format:  scene_name | text with {display|spoken} numbers
"""
import argparse, json, os, re, subprocess
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

ap = argparse.ArgumentParser()
ap.add_argument("script"); ap.add_argument("out")
ap.add_argument("--voice", default="af_heart", help="voice name, or a blend like 'af_heart:0.65,af_bella:0.35'")
ap.add_argument("--speed", type=float, default=1.22)
ap.add_argument("--lang", default="en-us")
ap.add_argument("--energy", action="store_true", help="brighter, denser, slightly lifted sound")
ap.add_argument("--gap", type=float, default=0.12, help="pause between scenes in seconds")
a = ap.parse_args()

EARS = os.environ.get("EARS_DIR", "/opt/ears")
k = Kokoro(f"{EARS}/kokoro-v1.0.onnx", f"{EARS}/voices-v1.0.bin")
if ":" in a.voice:
    style = sum(k.get_voice_style(n) * float(w) for n, w in (p.split(":") for p in a.voice.split(",")))
else:
    style = a.voice

def tokens(text):
    out = []
    for m in re.finditer(r"\{([^|}]+)\|([^}]+)\}(\S*)|(\S+)", text):
        if m.group(4): out.append({"d": m.group(4), "s": m.group(4), "num": False})
        else: out.append({"d": m.group(1) + (m.group(3) or ""), "s": m.group(2) + (m.group(3) or ""), "num": True})
    return out

def syllables(w):  # rough weight for word timing inside a scene
    w = re.sub(r"[^a-zäöüß]", "", w.lower())
    return max(1, len(re.findall(r"[aeiouyäöü]+", w))) + 0.15 * len(w) + 0.0

os.makedirs(a.out, exist_ok=True)
scenes = [l.split("|", 1) for l in open(a.script, encoding="utf-8") if l.strip() and not l.startswith("#")]
timeline, parts, t = [], [], 0.0
for i, (name, text) in enumerate(scenes):
    toks = tokens(text.strip()); spoken = " ".join(x["s"] for x in toks)
    audio, sr = k.create(spoken, voice=style, speed=a.speed, lang=a.lang)
    # trim only true silence
    env = np.convolve(np.abs(audio), np.ones(256) / 256, mode="same"); idx = np.where(env > 0.002)[0]
    audio = audio[max(0, idx[0] - int(.02 * sr)): idx[-1] + int(.08 * sr)]
    raw = f"{a.out}/scene_{i:02d}_raw.wav"; fn = f"{a.out}/scene_{i:02d}.wav"; sf.write(raw, audio, sr)
    if a.energy:
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", raw, "-af",
            f"asetrate={sr}*1.035,aresample={sr},atempo=1/1.035,highpass=f=90,equalizer=f=3000:t=q:w=1.2:g=3.5,"
            "equalizer=f=200:t=q:w=1:g=-2,acompressor=threshold=-22dB:ratio=3.5:attack=4:release=60:makeup=3", fn], check=True)
        audio, sr = sf.read(fn)
    else:
        os.replace(raw, fn)
    if os.path.exists(raw): os.remove(raw)
    dur = len(audio) / sr
    # word timing: proportional to syllable weight, punctuation adds a small pause weight
    wts = [syllables(x["s"]) + (0.8 if re.search(r"[.!?]$", x["d"]) else 0.35 if re.search(r"[,;:]$", x["d"]) else 0) for x in toks]
    tot = sum(wts); acc = 0; lead, usable = 0.03, dur - 0.1; words = []; sent = 0
    for x, w in zip(toks, wts):
        t0 = lead + usable * acc / tot; acc += w; t1 = lead + usable * acc / tot
        words.append({"d": x["d"], "s": x["s"], "num": x["num"], "t0": round(t0, 3), "t1": round(t1, 3), "sent": sent})
        if re.search(r"[.!?]$", x["d"]): sent += 1
    timeline.append({"scene": name.strip(), "file": os.path.basename(fn), "start": round(t, 3), "end": round(t + dur + a.gap, 3),
                     "text": " ".join(x["d"] for x in toks), "spoken": spoken, "words": words})
    parts += [audio, np.zeros(int(a.gap * sr))]; t += dur + a.gap
    print(f"[{i:02d}] {name.strip():12s} {dur:5.2f}s  {spoken[:70]}")

sf.write(f"{a.out}/voice.wav", np.concatenate(parts), sr)
json.dump({"total": round(t, 3), "voice": a.voice, "speed": a.speed, "energy": a.energy, "beats": timeline},
          open(f"{a.out}/timeline.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"FERTIG: {len(scenes)} Szenen, {t:.1f}s -> {a.out}/voice.wav, timeline.json")
