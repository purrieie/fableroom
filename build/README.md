# Build sources

See [`../HANDOFF.md`](../HANDOFF.md) for the full picture. Quick version:

```bash
npm install
python3 -m venv venv && ./venv/bin/pip install pillow numpy
./venv/bin/python fetch_assets.py
npx esbuild src/viewer.js --bundle --format=iife --minify --target=es2019 \
    --outfile=dist/viewer.min.js
./venv/bin/python build.py        # -> belgrave-3d.html, copy over ../index.html
```

Edit `template.html` for markup and CSS, `src/viewer.js` for the 3D engine.

The two source scans (`table.glb`, `chair.glb`, ~60 MB each) are not committed —
they come from NJ. The shipped compressed versions are `../model.glb` and
`../chair.glb`.
