#!/bin/sh
# Rebuild the scene lab: bundle (engine + scene options) -> alan-scenes/index.html
set -e
cd "$(dirname "$0")/.."
npx esbuild alan-scenes/entry-lab.js --bundle --format=iife --minify --target=es2019 --outfile=alan-scenes/lab.bundle.js
FR3D_LAB=1 python3 alan/build_alan.py
