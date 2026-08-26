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
- **Hour rail** (left edge). Moves the light from 6am to 9pm. It tints the
  *backdrop*, not the table — exposure, key light and environment are locked so
  the walnut keeps one true colour. A product that changes colour under a slider
  reads as a rendering bug, not as lighting.
- **Play/pause** — top-left of the canvas, chromeless. The glyph reads on its
  own and a pill around it would only take frame away from the model.
- **Studio bar** — bottom-**left** of the canvas: Studio · Size · Scale · Grain ·
  Details. It stays visible in fullscreen.
- **3D / Photos toggle** — bottom-**right** of the canvas, opposite the bar,
  where a thumb already is. It lives in `.heroWrap`, *not* inside `.hero`:
  Photos mode hides the hero, and a control that switches you back must not
  vanish with it. In Photos it returns to normal flow under the title.
  - *Studio* — studio lighting, on by default.
  - *Size* — dimension overlay, billboards to face the camera.
  - *Scale* — four Keaton chairs around the table, correctly scaled with a gap.
    One carries its own dimensions. Tapping a chair links to its product page.
    Called *Scale*, not *Chairs* — the chairs are a size reference, not a variant
    to buy. The button id is still `#scaleBtn`.
  - *Grain* — texture close-up.
  - *Details* — five hotspots on the table; tap for a note about that detail.
    The note panel is deliberately translucent (`rgba(255,255,255,.68)` over a
    10px backdrop blur) so the detail you just tapped stays visible behind it.
    Body copy is written to fit **three lines maximum** at 11.5px — verified at
    320px, which is the width that breaks first. If you lengthen a `body`
    string, re-check it there.
    If you change that alpha, keep body text above 4.5:1 contrast in the worst
    case — night backdrop, zoomed into the dark pedestal. It measures 6.75:1
    today, and the blur is what buys the headroom, not the alpha.
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

## 7. AR — removed

"View in your space" was pulled on 2026-08-26 to be picked up separately. The
button, the `arnote`, the `xrOverlay` and `initAR()` are gone from
`template.html`. `build/src/ar.js` and `build/src/camera-ar.js` are still in the
repo and still bundled by `viewer.js`, so restoring it means putting the markup
and the init call back — see commit `93217e2` for the last version that had it.

It was never verified on real hardware. The design was three-tier: iOS AR Quick
Look → Android WebXR → camera passthrough for everything else. Two traps worth
keeping if it comes back: `requestSession()` has to be called *before* the model
loads or you lose the user activation, and three's `USDZExporter` writes geometry
as text into an uncompressed container, so the AR model has to stay small.

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
- **`build/*.html` in `.gitignore` silently untracked the templates.** It was
  meant to ignore build output. For several commits `build/template.html` — the
  main source file — was never committed, so a `git revert` could not restore
  it and it had to be reconstructed. The ignore list now names the output files
  explicitly. Check `git ls-files build/` after touching it.
- **`justify-content:center` on an overflowing flex row hides its first item.**
  The action bar scrolls at 320px; centred, the leading button is clipped and
  cannot be scrolled back to. It uses `flex-start`.
- **The 3D/Photos toggle must not live inside `.hero`.** Photos mode hides the
  hero, which would take the only way back with it.
- **Don't read `offsetWidth` in the per-frame loop.** The label and tag clamps
  need element widths; both cache them (`_w`) and invalidate on text change.
  Reading it every frame forces synchronous layout on every animation frame.

## 10. Not done

- AR on real hardware (§6).
- The `product-3d-hero` skill at `~/.claude/skills/` is ~60% built — it
  generalises this pipeline for the next brand. Missing `references/interaction.md`,
  `references/ar.md`, `references/page-structure.md` and evals.
- Discussed but not built: place-setting and rug toggles on the table.
