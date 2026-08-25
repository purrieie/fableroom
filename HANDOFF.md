# Belgrave 3D PDP — handoff

A CRO pitch prototype: FableRoom's real Belgrave Wooden Dining Table product page
with the first fold replaced by an interactive 3D scan of the table. Everything
below the fold is the normal page. Built to be sent to the brand as a single
file that opens anywhere.

**Live:** https://purrieie.github.io/fableroom/
**Lab (experiments):** https://purrieie.github.io/fableroom/lab.html
**Repo:** https://github.com/purrieie/fableroom

---

## 1. What ships

| File | Size | What it is |
|---|---|---|
| `index.html` | 2.70 MB | The pitch page. Self-contained — CSS, JS, all imagery base64'd. |
| `lab.html` | 2.73 MB | Scratch build for trying features before they go into index. |
| `model.glb` | 10.81 MB | The table. Fetched at runtime, not inlined. |
| `chair.glb` | 1.65 MB | Keaton dining chair. Lazy — only loads when someone taps **Chairs**. |

`index.html` is self-contained apart from the two `.glb` files, which sit beside
it. That split is deliberate: inlining a 10 MB model as base64 would push the
HTML to ~17 MB and block first paint behind it. As it stands the page paints in
about 0.4 s and the model arrives after.

The footer shows a build id (the git short SHA) so you can tell at a glance which
version a phone is actually running — useful when someone says "I don't see the
change" and it's a cache.

## 2. Features in the first fold

- **Orbit / pinch-zoom / two-finger tilt.** Custom controls, not OrbitControls.
  Vertical swipe scrolls the page; horizontal spins the model. Two fingers tilt
  and zoom — on a phone that's the only way to look down at the tabletop.
- **View in your space** — AR. Three-tier fallback, see §6.
- **Hour rail** (left edge). Moves the light from 6am to 9pm. It tints the
  *backdrop*, not the table — exposure, key light and environment are locked so
  the walnut keeps one true colour. A product that changes colour under a slider
  reads as a rendering bug, not as lighting.
- **Studio bar** (bottom, centred): Pause · Studio · Size · Scale · Grain ·
  Details.
  - *Studio* — studio lighting, on by default.
  - *Size* — dimension overlay, billboards to face the camera.
  - *Scale* — four Keaton chairs around the table, correctly scaled with a gap.
    One carries its own dimensions. Tapping a chair links to its product page.
    Called *Scale*, not *Chairs* — the chairs are a size reference, not a variant
    to buy. The button id is still `#scaleBtn`.
  - *Grain* — texture close-up.
  - *Details* — five hotspots on the table; tap for a note about that detail.
- **3D / Photos toggle** — 3D shows only the model, Photos restores the original
  page gallery. Body-level `mode-3d` / `mode-2d` classes; neither duplicates the
  other's content.

## 3. Rebuilding

Sources are in `build/`. They were previously only in a temp directory — they're
committed now so this is reproducible.

```bash
cd build
npm install
python3 -m venv venv && ./venv/bin/pip install pillow numpy
./venv/bin/python fetch_assets.py     # re-downloads product imagery from Shopify
npx esbuild src/viewer.js --bundle --format=iife --minify --target=es2019 \
    --outfile=dist/viewer.min.js
./venv/bin/python build.py            # -> belgrave-3d.html
./venv/bin/python build_lab.py        # -> belgrave-lab.html
```

`build.py` does token substitution into `template.html`, converts images to WebP,
base64s them, and stamps the build id. Copy the output over `index.html` and push.

| Source | Role |
|---|---|
| `build/template.html` | Page markup + CSS. **Most edits belong here.** |
| `build/src/viewer.js` | three.js engine — framing, lighting, shadow, controls, hotspots, chairs, dimensions. Exposes `window.__initBelgraveViewer`. |
| `build/src/ar.js` | AR tier selection, WebXR session, USDZ export. |
| `build/src/camera-ar.js` | getUserMedia passthrough fallback. |
| `build/build.py` | Assembles index. |
| `build/test/*.mjs` | Puppeteer harnesses, see §7. |

The two source scans are **not** in the repo — they're ~60 MB each and come from
NJ. `fetch_assets.py` covers everything else.

## 4. The models

**Table** — 62.1 MB Hi3D export → 10.81 MB.

| | Source | Shipped |
|---|---|---|
| triangles | 1,987,058 | 1,987,058 — *unchanged* |
| base colour | 8192px | 4096px WebP, 883 KB |
| metallic-roughness | 8192px | 2048px WebP, 173 KB |
| compression | none | meshopt |

The mesh is untouched. The entire saving came from halving the textures and
meshopt-packing the geometry. Load went 33 s → 9.6 s on Fast 4G; GPU memory
772 MB → 235 MB.

**Chair** — 60.9 MB → 1.65 MB. This one *is* decimated (256,422 triangles, 2048px
colour) because four of them render at once and they're set dressing, not the
product being sold. Baked to real dimensions — 50 × 60 × 82 cm — with the base
on y = 0.

### The rule about the models

> **Never alter a supplied `.glb` on your own initiative.** No simplification, no
> texture downscaling, no re-encoding, no roughness/metalness edits.

This is NJ's standing instruction and it came from a real mistake: an earlier
pass remapped roughness and forced metalness to 0, which killed the reflections
and made a walnut table look like plastic. Use his file byte-for-byte unless he
explicitly asks for reduction — and when he does, show rendered comparisons at
several quality levels and let him pick. If a path genuinely can't take the full
mesh (iOS AR Quick Look), say so rather than quietly shipping a reduced copy.

## 5. The right gutter is contested

Three things want the right-hand side of the hero at mid-height: the zoom / reset
/ fullscreen column (`.hero__tools`, 42px), the height dimension label, and the
chair tag. On a 390px phone there is no camera framing that fits a dimension
label between the table and a 42px button column — the table would have to shrink
to about half the frame. So:

- The default framing pulls back a little (`pad` 1.42 portrait, 1.16 landscape,
  in `viewer.js`), which is what stops the labels being cut off at the edge.
- `.hero__tools` fades out under 768px while the hero has `is-dims`. The Size
  overlay is a transient inspection mode and pinch-zoom still works, so losing
  the buttons for its duration is cheap. Above 768px there's room and they stay.
- Both the dimension labels and the chair tag are clamped into the hero as a
  final safety net. The chair tag's pointer slides via a `--arrow` custom
  property so it keeps aiming at the chair after being nudged.

If you change `pad`, re-check the labels at 320px — that's the width that breaks
first.

## 6. Scale

`M_PER_UNIT = 1.20` in `viewer.js` — the table is 120 cm across, which fixes the
scale for the chairs and the dimension overlay.

**Known stand-in:** the height label is hard-coded to `76 cm` (the spec figure).
The scan itself measures 79.4 cm — photogrammetry drifts a few percent. Width is
read from the bounding box and comes out right. If the scan is ever re-exported
to true scale, drop the hard-coded string in `viewer.js:694`.

## 7. AR

Three tiers, tried in order (`ar.js`):

1. **iOS** → AR Quick Look. Needs an `<a rel="ar">` wrapping a *visible* `<img>`.
   USDZ is generated in-browser and handed over as a blob URL.
2. **Android with ARCore** → WebXR `immersive-ar` + hit-test + dom-overlay.
   If the user refuses once, `localStorage['ar:webxr-refused']` remembers and we
   skip straight to tier 3 next time.
3. **Anything else** → camera passthrough via `getUserMedia`. Not real tracking,
   but it works on every phone with a camera, which was the requirement.

Two traps worth knowing:

- **User activation.** `requestSession()` must be called *before* the model
  loads, not after. WebKit also drops activation after ~1 s of async work, which
  is why the USDZ is prepared ahead of the tap rather than on it.
- **USDZ size.** three's `USDZExporter` writes geometry as *text*, and USDZ has
  to be stored uncompressed. Size tracks vertex count almost linearly — the AR
  model has to stay small. Also set
  `material.map.userData.mimeType = 'image/jpeg'` or the exporter writes PNG and
  roughly triples the texture bytes.

**Untested:** AR has never been run on real hardware end-to-end from this
machine. The USDZ was validated against the format spec and the WebXR flow
against a mock session, but the final hop onto a physical iPhone or ARCore phone
is unproven. Say so when handing this over.

## 8. Testing

Don't judge this page through an in-app browser pane — it returns stale and blank
frames after scripted scrolling, and you'll spend an hour debugging a layout that
was fine. Drive real Chrome.

```bash
cd build && python3 -m http.server 8777 &
node test/idxtest.mjs        # index: layout, controls, no collisions
node test/stability.mjs      # backgrounded-tab behaviour
node test/tilttest.mjs       # two-finger gestures
node test/perf2.mjs          # time-to-interactive under throttling
```

## 9. Traps that cost time

These all caused visible bugs once. Leave them alone.

- **Never gate the render loop on `document.hidden`.** Some embedded browsers
  report `hidden === true` while perfectly visible, and the hero renders blank.
  The loop gates on `inView`, `paused` and `contextLost` only.
- **Never raycast for hotspot occlusion.** Five raycasts per frame against 2 M
  triangles freezes the browser. Occlusion is an O(1) surface-normal dot product.
- **No `transition: transform` on hotspot dots.** It makes them ease along behind
  the model as it spins, which reads as floating. Positions are computed before
  the render, not after.
- **Payload order is arrival order.** The model payload sits above the inlined
  gallery. Moving it there took time-to-interactive from 4.0 s to 2.4 s with no
  other change.
- **GitHub's web uploader caps at 25 MB; `git push` allows 100 MB.** Push the
  `.glb` files, don't drag them into the browser. Pages gzips `.glb` on the way
  out, so a progress bar that divides bytes-received by uncompressed size reads
  past 100% — the loader uses a clamped `modelBytes` figure instead.
- **`.dimlabel` CSS has to exist in both templates.** It once lived only in
  `template-lab.html`, so index rendered dimension labels in the top-left corner.
- **The hour rail needs `touch-action:none`.** The hero is `pan-y` so vertical
  swipes scroll the page. Without an explicit override the rail inherits that and
  the page scrolls away underneath your thumb while you're setting the hour. The
  cost is that a vertical swipe starting on the 44px rail no longer scrolls.
- **Measure an element only once it's visible.** `.chairtag` is `display:none`
  until `.on` lands, so measuring it first returns 0, the `|| fallback` fires and
  that wrong width caches forever — the tag's arrow then points at nothing.
  Toggle the class, *then* measure.
- **`opacity:0` does not remove a control from the tab order.** The tools column
  fades under `is-dims`; it also needs `visibility:hidden`, or four invisible
  buttons stay keyboard-focusable and Enter still fires them (one of them being
  fullscreen). Every other hide path in the page uses `display:none`, which is
  why this only bit the new rule.
- **Don't read `offsetWidth` in the per-frame loop.** The label and tag clamps
  need element widths; both cache them (`_w`) and invalidate on text change.
  Reading it every frame forces synchronous layout on every animation frame.

## 10. Not done

- AR on real hardware (§6).
- The `product-3d-hero` skill at `~/.claude/skills/` is ~60% built — it
  generalises this pipeline for the next brand. Missing `references/interaction.md`,
  `references/ar.md`, `references/page-structure.md` and evals.
- Discussed but not built: place-setting and rug toggles on the table.
