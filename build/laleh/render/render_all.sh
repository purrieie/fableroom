#!/bin/zsh
# Final renders: desktop (1800x1350) and phone (1350x1690) framings for every room.
cd "$(dirname "$0")"
for r in living bedroom dining lounge reading; do
  node render.mjs rooms/$r.json --scale 0.9 --samples 320 --shade-factor 0.45 2>&1 | tail -1 | cut -c1-160
  node render.mjs rooms/$r-p.json --samples 320 --shade-factor 0.45 2>&1 | tail -1 | cut -c1-160
done
echo ALL DONE
