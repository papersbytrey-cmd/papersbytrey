"""Build papersbytrey promo videos: narration (Kokoro TTS) + music/SFX + 3D render.

usage: python3 build.py [video-name ...]   (default: all)
Needs: kokoro-onnx model files in $KOKORO_DIR, `python3 -m http.server 8765` running in
this folder (render.mjs loads index.html from it), ffmpeg, node + playwright.
"""
import json, os, re, subprocess, sys
import numpy as np
import soundfile as sf
import librosa
from scripts import VIDEOS, Q_PARAS

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")
KOKORO_DIR = os.environ.get("KOKORO_DIR", os.path.join(HERE, "kokoro"))
VOICE, SPEED = os.environ.get("VOICE", "bm_fable"), float(os.environ.get("SPEED", "1.08"))
SR, FPS = 48000, 30
LEAD, GAP, TAIL = 0.35, 0.18, 1.6

# focus point (x, y as fractions of the photo) the camera drifts around
PHOTO_FOCUS = {"clock": (0.5, 0.3), "board": (0.45, 0.4), "night": (0.6, 0.55), "results": (0.5, 0.55),
               "invig": (0.5, 0.55), "stressed": (0.55, 0.45), "celebrate": (0.55, 0.45), "paper": (0.45, 0.4)}

_kokoro = None
def tts(text):
    global _kokoro
    if _kokoro is None:
        from kokoro_onnx import Kokoro
        _kokoro = Kokoro(os.path.join(KOKORO_DIR, "kokoro-v1.0.onnx"), os.path.join(KOKORO_DIR, "voices-v1.0.bin"))
    y, sr = _kokoro.create(text, voice=VOICE, speed=SPEED, lang="en-gb")
    y = librosa.resample(np.asarray(y, dtype=np.float32), orig_sr=sr, target_sr=SR)
    yt, idx = librosa.effects.trim(y, top_db=40)
    return yt


def word_times(cap, audio, t0):
    """Spread caption words over the speech, aligning phrases to pauses where possible."""
    words = cap.split()
    iv = librosa.effects.split(audio, top_db=32, frame_length=1024, hop_length=256)
    # merge tiny gaps so only real pauses split phrases
    merged = []
    for a, b in iv:
        if merged and a - merged[-1][1] < 0.12 * SR:
            merged[-1][1] = b
        else:
            merged.append([a, b])
    phrases, cur = [], []
    for w in words:
        cur.append(w)
        if re.search(r"[.,?!…:]$", w):
            phrases.append(cur); cur = []
    if cur:
        phrases.append(cur)
    if len(phrases) != len(merged):
        phrases, merged = [words], [[merged[0][0], merged[-1][1]]] if merged else [[0, len(audio)]]
    out = []
    for ph, (a, b) in zip(phrases, merged):
        weights = np.array([len(w.strip(".,?!…:\"“”")) + 2 for w in ph], float)
        edges = np.concatenate([[0], np.cumsum(weights) / weights.sum()])
        s, e = a / SR, b / SR
        for i, w in enumerate(ph):
            out.append({"w": w, "t0": t0 + s + edges[i] * (e - s), "t1": t0 + s + edges[i + 1] * (e - s)})
    return out


# ---------------- music + sfx ----------------
def note(m):
    return 440.0 * 2 ** ((m - 69) / 12)

def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    from scipy.signal import lfilter
    return lfilter([1 - a], [1, -a], x)

def music(dur, seed=0, dark=False):
    """Clean underscore: soft pad + felt-piano arpeggio + low pulse, light reverb. No noise sources."""
    n = int(dur * SR)
    out = np.zeros(n)
    bpm = 84; beat = 60 / bpm; bar = beat * 4
    prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]  # Am F C G
    if dark:
        prog = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]]  # Am F Dm E
    for bi in range(int(dur / bar) + 1):
        ch = prog[bi % 4]
        s0 = int(bi * bar * SR)
        if s0 >= n: break
        ln = min(n - s0, int((bar + 1.0) * SR)); tt = np.arange(ln) / SR
        env = np.minimum(1, tt / 1.2) * np.clip((bar + 1.0 - tt) / 1.0, 0, 1)
        pad = np.zeros(ln)
        for m in [ch[0] - 12] + ch:
            f = note(m)
            pad += np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(2 * np.pi * 2 * f * tt + 0.3)
        out[s0:s0 + ln] += pad * env * 0.035
        # felt piano: quarter-note arpeggio an octave up, soft attack
        arp = [ch[0], ch[2], ch[1] + 12, ch[2]]
        for k in range(4):
            ps = s0 + int(k * beat * SR)
            if ps >= n: break
            m = arp[k] + 12; f = note(m)
            pl = min(int(1.6 * SR), n - ps); t2 = np.arange(pl) / SR
            e = np.minimum(1, t2 / 0.008) * np.exp(-t2 * 2.8)
            tone = np.sin(2 * np.pi * f * t2) + 0.35 * np.exp(-t2 * 3) * np.sin(2 * np.pi * 2 * f * t2) + 0.1 * np.exp(-t2 * 6) * np.sin(2 * np.pi * 3 * f * t2)
            out[ps:ps + pl] += tone * e * (0.07 if k == 0 else 0.05)
        # low pulse from bar 3 on
        if bi >= 2:
            for k in (0, 2):
                ps = s0 + int(k * beat * SR)
                if ps >= n: continue
                pl = min(int(0.6 * SR), n - ps); t2 = np.arange(pl) / SR
                out[ps:ps + pl] += np.sin(2 * np.pi * 55 * t2) * np.minimum(1, t2 / 0.02) * np.exp(-t2 * 6) * 0.12
    # small smooth reverb
    ir_t = np.arange(int(1.8 * SR)) / SR
    ir = np.random.default_rng(seed).standard_normal(len(ir_t)) * np.exp(-ir_t * 3.5)
    ir = lowpass(ir, 3000); ir /= np.abs(ir).sum() / 6
    from scipy.signal import fftconvolve
    wet = fftconvolve(out, ir)[:n]
    return out * 0.8 + wet * 0.35


def whoosh(rng, dur=0.45):
    n = int(dur * SR); x = rng.standard_normal(n)
    tt = np.arange(n) / n
    env = np.sin(np.pi * tt) ** 2
    y = np.zeros(n); cut = 300 + 4000 * tt
    for i in range(0, n, 512):  # sweep a one-pole low-pass
        y[i:i + 512] = lowpass(x[i:i + 512], cut[i])
    return lowpass(y, 2500) * env * 0.35

def pop():
    n = int(0.12 * SR); tt = np.arange(n) / SR
    return np.sin(2 * np.pi * (500 + 900 * np.exp(-tt * 40)) * tt) * np.exp(-tt * 35) * 0.25

def flip_sfx(rng):
    n = int(0.35 * SR); x = rng.standard_normal(n)
    tt = np.arange(n) / SR
    env = np.exp(-((tt - 0.12) / 0.07) ** 2) + 0.4 * np.exp(-((tt - 0.25) / 0.03) ** 2)
    return (x - lowpass(x, 1500)) * env * 0.25

def tick():
    n = int(0.03 * SR); tt = np.arange(n) / SR
    return np.sin(2 * np.pi * 2400 * tt) * np.exp(-tt * 300) * 0.25

def ding():
    n = int(1.6 * SR); tt = np.arange(n) / SR
    return (np.sin(2 * np.pi * 1318.5 * tt) + 0.5 * np.sin(2 * np.pi * 1975.5 * tt)) * np.exp(-tt * 3) * 0.16

def add(buf, x, t):
    s = int(t * SR)
    if s >= len(buf): return
    e = min(len(buf), s + len(x)); buf[s:e] += x[: e - s]


def build(name, spec, render=True):
    os.makedirs(BUILD, exist_ok=True)
    rng = np.random.default_rng(abs(hash(name)) % 2**32)
    t = LEAD
    beats, voice_clips = [], []
    prev_shot = None; key = 0
    for i, b in enumerate(spec["beats"]):
        audio = tts(b["say"])
        d = len(audio) / SR
        start = t
        end = start + d + (TAIL if b["shot"] == "end" else GAP)
        shot_id = b.get("img") or b["shot"]
        if shot_id != prev_shot or b.get("cut"):
            key += 1
        prev_shot = shot_id
        st = dict(b.get("state", {}))
        if st.get("flip") == "beat":
            st["flip"] = [start + 0.15, start + 1.0]
        if st.get("envelope") == "beat":
            st["envelope"] = [start + 0.6, start + 1.8]
        beat = {"start": start, "end": end, "shot": b["shot"], "shotKey": f"{b['shot']}-{key}",
                "mode": b.get("mode", "day"), "state": st,
                "words": word_times(b.get("cap", b["say"]), audio, start)}
        if b.get("img"):
            beat["img"] = b["img"]
            beat["shotKey"] = f"{b['img']}-{key}"
            fx, fy = PHOTO_FOCUS.get(b["img"], (0.5, 0.5))
            zin = key % 2 == 1
            beat["kb"] = {"z": [1.03, 1.16] if zin else [1.16, 1.04], "x": [fx, fx + (0.03 if zin else -0.03)], "y": [fy, fy - 0.02]}
        if "card" in b: beat["card"] = b["card"]
        if "mascot" in b: beat["mascot"] = b["mascot"]
        beats.append(beat); voice_clips.append((start, audio))
        t = end
    for a, b2 in zip(beats, beats[1:]):  # no gaps in the visual timeline
        a["end"] = b2["start"]
    beats[0]["start"] = 0.0
    duration = beats[-1]["end"]
    hook_until = min(beats[0]["end"], 3.2) if spec.get("hook") else 0
    photos = sorted({x["img"] for x in beats if x.get("img")})
    tl = {"photos": photos, "fps": FPS, "duration": duration, "beats": beats,
          "hook": {"text": spec["hook"], "until": hook_until} if spec.get("hook") else None,
          "paper": spec.get("paper", {"qnum": "14", "lines": Q_PARAS}),
          "grade": spec.get("grade", 8), "end": spec.get("end", {})}
    tl_path = os.path.join(BUILD, f"{name}.json")
    json.dump(tl, open(tl_path, "w"), indent=1)

    # ---- audio mix ----
    n = int((duration + 0.1) * SR)
    vo = np.zeros(n)
    for s, a in voice_clips: add(vo, a, s)
    vo /= max(1e-6, np.abs(vo).max()); vo *= 0.89
    dark = any(b.get("mode") == "night" for b in spec["beats"])
    mus = music(duration + 0.1, seed=len(name), dark=dark)[:n]
    # duck music under the voice
    env = np.abs(vo); env = lowpass(env, 4) * 6
    duck = 1 - 0.55 * np.clip(env, 0, 1)
    fade = np.minimum(1, np.arange(n) / SR / 0.4) * np.minimum(1, (n - np.arange(n)) / SR / 1.2)
    sfx = np.zeros(n)
    for i, b in enumerate(beats):
        if i and b["shotKey"] != beats[i - 1]["shotKey"]: add(sfx, whoosh(rng), max(0, b["start"] - 0.2))
        if "card" in b and (i == 0 or beats[i - 1].get("card", {}).get("id") != b["card"]["id"]): add(sfx, pop(), b["start"])
        elif "card" in b and b["card"].get("type") == "math": add(sfx, pop() * 0.6, b["start"])
        if isinstance(b["state"].get("flip"), list): add(sfx, flip_sfx(rng), b["state"]["flip"][0] + 0.1)
        if isinstance(b["state"].get("envelope"), list): add(sfx, flip_sfx(rng) * 0.8, b["state"]["envelope"][0])
        if b["shot"] == "clock":
            k = b["start"]
            while k < b["end"]: add(sfx, tick(), k); k += 0.5
        if b["shot"] == "end": add(sfx, ding(), b["start"] + 0.05)
    mix = vo + mus * duck * fade * 0.5 + sfx
    mix *= 0.95 / max(1e-6, np.abs(mix).max())
    wav = os.path.join(BUILD, f"{name}.wav")
    sf.write(wav, np.stack([mix, mix], 1).astype(np.float32), SR)
    print(f"{name}: {duration:.1f}s, {len(beats)} beats", flush=True)
    if not render:
        return
    silent = os.path.join(BUILD, f"{name}.video.mp4")
    subprocess.run(["node", os.path.join(HERE, "render.mjs"), tl_path, silent], check=True)
    final = os.path.join(HERE, "videos", f"papersbytrey-{name}.mp4")
    os.makedirs(os.path.dirname(final), exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", silent, "-i", wav, "-c:v", "copy", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.89", "-ar", "48000", "-c:a", "aac", "-b:a", "192k",
                    "-shortest", "-movflags", "+faststart", final], check=True)
    print("wrote", final, flush=True)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    names = args or list(VIDEOS)
    for nm in names:
        build(nm, VIDEOS[nm], render="--no-render" not in sys.argv)
