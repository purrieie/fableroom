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

## The Lustre model and its lighting

```bash
./venv/bin/python build_hq.py 8192 4096 pre_hq.glb
npx gltf-transform meshopt pre_hq.glb ../model-hq.glb --level high
```

`build_hq.py` needs `tex0.jpg` / `tex1.jpg` — the scan's own 8192 textures,
extracted from the source .glb — and `w.glb`, the welded full mesh. Neither is
committed; both come from the Hi3D export.

To retune the rig, sweep candidates in the harness and score them against the
product photo rather than by eye:

```bash
python3 -m http.server 8777 &
node test/lshot.mjs "try1::model=../model-hq.glb&key=4.6&env=1.15&exp=0.88&shadow=1024&dome=5"
./venv/bin/python test/woodstat.py try1
```

`woodstat.py` masks each render to the wood and reports mean CIELAB plus
luminance spread against `img/p01`. The shipped numbers are in `../HANDOFF.md` §7.
