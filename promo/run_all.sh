#!/bin/bash
# Renders every video (2 at a time). Expects KOKORO_DIR set.
cd "$(dirname "$0")"
(python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 &)
sleep 1
for v in 01-turn-the-page 02-same-hours 03-3am 04-the-pattern 05-mock-season; do
  python3 build.py "$v" > "build/$v.log" 2>&1 &
  while [ "$(jobs -rp | wc -l)" -ge 2 ]; do sleep 5; done
done
wait
