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

# where a close-up should land on each photo
PHOTO_CLOSE = {"hall": (0.5, 0.78), "desk": (0.62, 0.6), "clock": (0.5, 0.2), "night": (0.62, 0.62),
               "results": (0.55, 0.66), "celebrate": (0.6, 0.42), "stressed": (0.55, 0.52), "notes": (0.42, 0.3),
               "timed": (0.5, 0.28), "invig": (0.5, 0.5), "board": (0.45, 0.35), "stack": (0.55, 0.5),
               "paper": (0.55, 0.42), "empty": (0.5, 0.65)}
# related b-roll a cut may switch to, so the visuals don't sit on one photo
PHOTO_ALT = {"hall": "invig", "invig": "hall", "empty": "hall", "desk": "paper", "paper": "desk",
             "stack": "paper", "timed": "stack", "clock": "stressed", "board": "paper"}
HI_RES = {"paper", "notes", "timed", "celebrate", "stack", "stressed"}
CUT_EVERY = 1.5


def framing(img, k):
    fx, fy = PHOTO_FOCUS.get(img, (0.5, 0.5))
    cx, cy = PHOTO_CLOSE.get(img, (fx, fy))
    close = 1.48 if img in HI_RES else 1.32
    v = k % 3
    if v == 0:   # wide, gentle push in
        return {"z": [1.02, 1.10], "x": [fx, fx], "y": [fy, fy - 0.01]}
    if v == 1:   # close-up on the detail
        return {"z": [close, close + 0.06], "x": [cx - 0.01, cx + 0.01], "y": [cy, cy]}
    d = 0.04 if k % 2 else -0.04  # medium, sideways drift
    return {"z": [1.22, 1.26], "x": [(fx + cx) / 2 - d, (fx + cx) / 2 + d], "y": [(fy + cy) / 2, (fy + cy) / 2]}


def split_cuts(beats):
    """Break each photo beat into ~1.5s cuts alternating wide / close / b-roll framings."""
    out, cut = [], 0
    for b in beats:
        if not b.get("img"):
            out.append(b); continue
        dur = b["end"] - b["start"]
        nseg = max(1, round(dur / CUT_EVERY))
        for k in range(nseg):
            c = dict(b)
            c["start"] = b["start"] + k * dur / nseg
            c["end"] = b["end"] if k == nseg - 1 else b["start"] + (k + 1) * dur / nseg
            img = b["img"]
            if k % 3 == 2 and img in PHOTO_ALT:
                img = PHOTO_ALT[img]
            cut += 1
            c["img"], c["shotKey"], c["kb"] = img, f"{img}-cut{cut}", framing(img, cut)
            if "mascot" in b:
                c["mascot"] = {**b["mascot"], "t0": b["start"]}
            out.append(c)
    return out


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
    """Upbeat, bright underscore: bouncy marimba, bass, soft kick and bells in C major. No noise sources."""
    n = int(dur * SR)
    out = np.zeros(n)
    bpm = 116; beat = 60 / bpm; bar = beat * 4
    prog = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]  # C G Am F

    def put(x, s0, gain):
        if s0 >= n: return
        e = min(n, s0 + len(x)); out[s0:e] += x[: e - s0] * gain

    def marimba(f, ln=0.5):
        t2 = np.arange(int(ln * SR)) / SR
        e = np.minimum(1, t2 / 0.004) * np.exp(-t2 * 9)
        return e * (np.sin(2 * np.pi * f * t2) + 0.3 * np.exp(-t2 * 20) * np.sin(2 * np.pi * 4 * f * t2))

    def bell(f):
        t2 = np.arange(int(1.2 * SR)) / SR
        e = np.minimum(1, t2 / 0.003) * np.exp(-t2 * 4)
        return e * (np.sin(2 * np.pi * f * t2) + 0.4 * np.sin(2 * np.pi * 2.76 * f * t2) * np.exp(-t2 * 8))

    def kick():
        t2 = np.arange(int(0.25 * SR)) / SR
        return np.sin(2 * np.pi * (50 + 90 * np.exp(-t2 * 35)) * t2) * np.exp(-t2 * 14)

    def bass(f, ln):
        t2 = np.arange(int(ln * SR)) / SR
        e = np.minimum(1, t2 / 0.01) * np.minimum(1, (ln - t2) / 0.05) * np.exp(-t2 * 1.5)
        return e * (np.sin(2 * np.pi * f * t2) + 0.2 * np.sin(2 * np.pi * 2 * f * t2))

    pattern = [0, 1, 2, 1, 0, 2, 1, 2]  # bouncy 8th-note marimba
    for bi in range(int(dur / bar) + 1):
        ch = prog[bi % 4]
        s0 = int(bi * bar * SR)
        if s0 >= n: break
        for k in range(8):
            m = ch[pattern[k]] + 12 + (12 if k in (3, 7) else 0)
            put(marimba(note(m)), s0 + int(k * beat / 2 * SR), 0.09 if k % 2 == 0 else 0.06)
        # bass: root on 1, fifth on the "and" of 2, root on 3
        root = ch[0] - 24
        put(bass(note(root), beat * 1.4), s0, 0.18)
        put(bass(note(root + 7), beat * 0.45), s0 + int(1.5 * beat * SR), 0.14)
        put(bass(note(root), beat * 1.4), s0 + int(2 * beat * SR), 0.18)
        if bi >= 1:
            for k in range(4):
                put(kick(), s0 + int(k * beat * SR), 0.22)
        if bi % 2 == 0:
            put(bell(note(ch[2] + 24)), s0, 0.05)
    ir_t = np.arange(int(1.2 * SR)) / SR
    ir = np.random.default_rng(seed).standard_normal(len(ir_t)) * np.exp(-ir_t * 5)
    ir = lowpass(ir, 3500); ir /= np.abs(ir).sum() / 5
    from scipy.signal import fftconvolve
    wet = fftconvolve(out, ir)[:n]
    return out * 0.85 + wet * 0.25


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
    vis = split_cuts(beats)
    photos = sorted({x["img"] for x in vis if x.get("img")})
    tl = {"photos": photos, "fps": FPS, "duration": duration, "beats": vis,
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
