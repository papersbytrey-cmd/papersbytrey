# papersbytrey promo videos

Five vertical (1080×1920, 30fps) TikTok/Reels/Shorts promos for the 2026 past papers,
in the style of the "POV: you turn the page" exam-hall explainer. Each one has a 3D exam
hall, word-by-word captions, a British male narrator, a music bed with sound effects, and
an end card that says **Comment "2026"**.

| File | Storyline | Length |
|---|---|---|
| `videos/papersbytrey-01-turn-the-page.mp4` | POV: you flip the paper and get a probability question that turns out to be algebra. It solves the question step by step, then pitches the 2026 papers. | ~58s |
| `videos/papersbytrey-02-same-hours.mp4` | Two students revise for the same number of hours. One rereads notes, the other does real papers, and they get different results. | ~51s |
| `videos/papersbytrey-03-3am.mp4` | It's 3am and you've done everything except the newest papers. | ~37s |
| `videos/papersbytrey-04-the-pattern.mp4` | A detective board: the same question types keep coming back. | ~37s |
| `videos/papersbytrey-05-mock-season.mp4` | Mocks are weeks away, so practise under timed conditions with the most recent exam. | ~37s |

## Editing

- The words, captions, camera shots and on-screen cards are all in `scripts.py`.
- The look (hall, props, captions, cards, mascot, end card) is in `scene.js`.
- To change the call to action, edit the last beat of each video in `scripts.py`. The
  end-card text is set by `drawEnd` in `scene.js`.

## Rebuilding

```bash
npm install                     # three.js
pip install kokoro-onnx soundfile librosa scipy
# Kokoro model files (kokoro-v1.0.onnx, voices-v1.0.bin) from
# https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
KOKORO_DIR=/path/to/kokoro ./run_all.sh          # all videos
KOKORO_DIR=/path/to/kokoro python3 build.py 03-3am   # one video (needs the http server from run_all.sh)
```

The voice is set by the `VOICE` and `SPEED` environment variables. The default is
`bm_fable` at speed 1.08.
