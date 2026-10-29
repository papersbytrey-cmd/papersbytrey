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
    rng = np.random.default_rng(seed)
    n = int(dur * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    bpm = 96; beat = 60 / bpm; bar = beat * 4
    prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]  # Am F C G
    if dark:
        prog = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]]  # Am F Dm E
    # pad
    for bi in range(int(dur / bar) + 1):
        ch = prog[bi % 4]
        s0, s1 = int(bi * bar * SR), min(n, int((bi + 1) * bar * SR + 0.3 * SR))
        if s0 >= n: break
        tt = np.arange(s1 - s0) / SR
        env = np.minimum(1, tt / 0.6) * np.minimum(1, (s1 - s0 - np.arange(s1 - s0)) / SR / 0.4)
        sig = np.zeros(s1 - s0)
        for m in ch + [ch[0] - 12]:
            for det in (-0.08, 0.08):
                f = note(m + det)
                sig += 2 * ((tt * f) % 1) - 1
        out[s0:s1] += lowpass(sig, 900) * env * 0.05
        # plucked arpeggio, 8ths
        arp = ch + [ch[1] + 12, ch[2] + 12]
        for k in range(8):
            ps = s0 + int(k * beat / 2 * SR)
            if ps >= n: break
            m = arp[[0, 2, 1, 3, 2, 4, 3, 2][k]] + 12
            ln = min(int(0.45 * SR), n - ps)
            tt2 = np.arange(ln) / SR
            out[ps:ps + ln] += np.sin(2 * np.pi * note(m) * tt2) * np.exp(-tt2 * 9) * 0.07
    # sub pulse + hats (enter after 2 bars)
    for bt in range(int(dur / beat) + 1):
        ps = int(bt * beat * SR)
        if ps >= n: break
        if bt >= 8 and bt % 2 == 0:
            ln = min(int(0.35 * SR), n - ps); tt2 = np.arange(ln) / SR
            out[ps:ps + ln] += np.sin(2 * np.pi * (45 + 60 * np.exp(-tt2 * 30)) * tt2) * np.exp(-tt2 * 8) * 0.22
        if bt >= 8:
            for off in (0, 0.5):
                hs = ps + int(off * beat * SR); ln = min(int(0.05 * SR), n - hs)
                if ln <= 0: continue
                hn = rng.standard_normal(ln); hn = hn - lowpass(hn, 7000)
                out[hs:hs + ln] += hn * np.exp(-np.arange(ln) / SR * 80) * (0.03 if off else 0.045)
    return out

def whoosh(rng, dur=0.45):
    n = int(dur * SR); x = rng.standard_normal(n)
    tt = np.arange(n) / n
    env = np.sin(np.pi * tt) ** 2
    y = np.zeros(n); cut = 300 + 4000 * tt
    for i in range(0, n, 512):  # sweep a one-pole low-pass
        y[i:i + 512] = lowpass(x[i:i + 512], cut[i])
    return y * env * 0.5

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
        if b["shot"] != prev_shot or b.get("cut"):
            key += 1
        prev_shot = b["shot"]
        st = dict(b.get("state", {}))
        if st.get("flip") == "beat":
            st["flip"] = [start + 0.15, start + 1.0]
        if st.get("envelope") == "beat":
            st["envelope"] = [start + 0.6, start + 1.8]
        beat = {"start": start, "end": end, "shot": b["shot"], "shotKey": f"{b['shot']}-{key}",
                "mode": b.get("mode", "day"), "state": st,
                "words": word_times(b.get("cap", b["say"]), audio, start)}
        if "card" in b: beat["card"] = b["card"]
        if "mascot" in b: beat["mascot"] = b["mascot"]
        beats.append(beat); voice_clips.append((start, audio))
        t = end
    for a, b2 in zip(beats, beats[1:]):  # no gaps in the visual timeline
        a["end"] = b2["start"]
    beats[0]["start"] = 0.0
    duration = beats[-1]["end"]
    hook_until = min(beats[0]["end"], 3.2) if spec.get("hook") else 0
    tl = {"fps": FPS, "duration": duration, "beats": beats,
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
    mix = vo + mus * duck * fade * 0.55 + sfx
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)
    wav = os.path.join(BUILD, f"{name}.wav")
    sf.write(wav, np.stack([mix, mix], 1).astype(np.float32), SR)
    print(f"{name}: {duration:.1f}s, {len(beats)} beats", flush=True)
    if not render:
        return
    silent = os.path.join(BUILD, f"{name}.video.mp4")
    subprocess.run(["node", os.path.join(HERE, "render.mjs"), tl_path, silent], check=True)
    final = os.path.join(HERE, "videos", f"papersbytrey-{name}.mp4")
    os.makedirs(os.path.dirname(final), exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", silent, "-i", wav, "-c:v", "copy", "-af", "loudnorm=I=-14:TP=-1.5:LRA=9", "-ar", "48000", "-c:a", "aac", "-b:a", "192k",
                    "-shortest", "-movflags", "+faststart", final], check=True)
    print("wrote", final, flush=True)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    names = args or list(VIDEOS)
    for nm in names:
        build(nm, VIDEOS[nm], render="--no-render" not in sys.argv)
