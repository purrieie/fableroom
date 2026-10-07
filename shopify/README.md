# Shopify drop-in — 3D product hero

The two files a Shopify dev needs. Everything else (markup, CSS, wiring) is
injected at runtime — there is no CSS file and no build step.

| File | Size | What it is |
|---|---:|---|
| `belgrave-hero.bundle.js` | 632 KB (135 KB brotli) | The 3D engine. Built from `../build/src/viewer.js` with esbuild. Product-agnostic — do not edit. |
| `fableroom-3d-hero.js` | 32 KB | The drop-in: markup, styles, 3D/Photos toggle, hotspots, HD upgrade. All classes prefixed `fr3d-`. |

Models live in `../belgrave/` (`model.glb` 890 KB, `model-hd.glb` 2.5 MB).
Live reference: https://purrieie.github.io/fableroom/belgrave/

## Install

```liquid
<div id="fableroom-3d-hero"
     data-model-url="{{ 'model.glb' | asset_url }}"
     data-model-bytes="912332"
     data-real-size="1.20,0.76,1.20"
     data-gallery-selector=".product__media-wrapper"></div>

<script src="{{ 'belgrave-hero.bundle.js' | asset_url }}" defer></script>
<script src="{{ 'fableroom-3d-hero.js'   | asset_url }}" defer></script>
```

Load order matters — the engine bundle must come first.

## Options

| Attribute | Required | Default | Purpose |
|---|---|---|---|
| `data-model-url` | **yes** | — | URL of the `.glb` |
| `data-model-bytes` | no | `0` | Exact byte size, for an accurate progress bar |
| `data-real-size` | **yes for a new product** | `1.20,0.76,1.20` | Real `width,height,depth` in **metres**. Drives the Size overlay *and* the model's world scale. Wrong value = wrong centimetres on the page. |
| `data-gallery-selector` | strongly recommended | none | CSS selector of the theme's gallery wrapper. Without it the toggle has nothing to switch back to. |
| `data-hd-url` / `data-hd-bytes` | no | same as model | Heavier model for the "Load HD" button |
| `data-placeholder-url` | no | none | Image blurred behind the loading state |
| `data-default` | no | `3d` | `photos` to land on the gallery instead |

Or call `window.mountFableroom3DHero({ mount, modelUrl, realSize, hotspots, ... })` directly.

## Rebuilding the bundle

```bash
npm install esbuild three@0.185.1
npx esbuild build/src/viewer.js --bundle --format=iife --minify --target=es2019 \
  --outfile=shopify/belgrave-hero.bundle.js
```

## For a different product, change only

1. `model.glb` (and optionally `model-hd.glb`)
2. `data-real-size`
3. `DEFAULT_HOTSPOTS` in `fableroom-3d-hero.js` — copy **and** positions. `at` is in
   normalised model space and will not transfer between products.
4. `data-gallery-selector`, if the theme template differs.

## Notes

- The script creates a `div.fr3d-media` wrapper and moves the theme's gallery
  and its own root inside it. That is what lets one toggle serve both views.
  If the theme's JS holds a reference to the gallery's parent, check that first.
- Photos mode adds `.fr3d-hidden` (`display:none`) to the gallery. It never
  deletes or restyles it.
- No WebGL → the stage hides itself, the 3D button disables, the page stays on
  the gallery. Fails soft on purpose.
- AR and the companion-chair "Scale" feature were removed in Sept 2026 after a
  Lighthouse audit. Do not re-add. `build/src/ar.js` is kept as unwired source
  with a header explaining how to turn it back on.
