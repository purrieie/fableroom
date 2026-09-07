# Deploying the Belgrave 3D hero on the real Shopify page

This packages the exact tested first-fold — canvas, spin/pause, hour rail,
studio bar (Studio/Size/Scale/Grain/Details), and the 3D/Photos toggle — as a
drop-in for the actual Shopify theme, rather than the full reconstructed pitch
page at purrieie.github.io/fableroom. It touches **only** the container div
you place it in; nothing else on the real page is created, replaced, or
restyled.

## Files

- `belgrave-hero.bundle.js` — the three.js engine (viewer + AR-capable code,
  though AR itself is dormant since it was pulled from this build; unused
  code, harmless). 668 KB minified. Built from the exact same source as the
  live pitch page — `github.com/purrieie/fableroom/build/src/`.
- `belgrave-hero-embed.js` — the markup, styles, and wiring, wrapped in
  `window.mountBelgrave3DHero(containerId, opts)`. Auto-mounts into
  `#belgrave-3d-hero` if that element exists — you don't have to call the
  function yourself for the normal case.

Both are plain JS, no build step needed to deploy them.

## 1. Upload the models to Shopify

Settings → Files → upload:
- `model.glb` (10.8 MB) — the table, unchanged from the pitch build.
- `chair.glb` (1.6 MB) — the Keaton chair, powers the Scale feature.

Copy each file's CDN URL from the Files list once uploaded.

## 2. Add the two scripts

Theme → Edit code → Assets → Add a new asset, upload both `.js` files there.
(Or upload them to Files too, like the models — either works; Assets is the
conventional place for theme JS.)

## 3. Place the container

Wherever the 3D hero should appear on the product page — replacing or sitting
above the main product image, most likely — add:

```html
<div id="belgrave-3d-hero"
     data-model-url="https://cdn.shopify.com/.../model.glb"
     data-model-bytes="10814800"
     data-chair-url="https://cdn.shopify.com/.../chair.glb"
     data-chair-href="https://fableroom.com/products/keaton-cream-upholstered-dining-chair?variant=51865281986897"
     data-chair-title="Keaton Cream Chair"
     data-chair-sub="50 x 60 x 82 cm &middot; £175"
     data-gallery-selector=""></div>

{{ 'belgrave-hero.bundle.js' | asset_url | script_tag }}
{{ 'belgrave-hero-embed.js' | asset_url | script_tag }}
```

If your theme supports a Custom Liquid section/block on the product template,
that's the easiest place to paste this — no code-editor access needed beyond
uploading the two files once. Otherwise it goes directly in the product
template file where you want the hero to sit.

## 4. The one value that's genuinely theme-specific: `data-gallery-selector`

Leave it blank and the 3D/Photos toggle just sits fixed in the hero's own
corner — this always works, on any theme.

Fill it in with a CSS selector for your theme's actual gallery container
(e.g. `.product-gallery`, `#product-images`, whatever your theme calls it) to
get the fancier behaviour from the pitch build: on phones, the toggle
reparents itself onto that gallery in Photos mode, so it keeps floating in
the same corner over whichever content is actually showing. This was tested
against a deliberately unrelated fake theme structure and it worked
correctly — but "correctly" here means "found the element and moved the
toggle onto it," not "knows your theme's exact layout," so look at it once
after deploying rather than assuming it's right blind.

**You also need one small CSS rule in your theme**, because this script does
not create or hide your gallery — that's your theme's own element:

```css
body.mode-3d .your-gallery-selector { display: none; }
```

Without this, "Photos" mode will correctly hide our 3D hero (verified — this
was the one real bug I caught while testing, see below) but your theme's
gallery will only reappear if it wasn't already visible beside/below the hero
to begin with.

## What was actually tested, not just written

I built a deliberately unrelated fake Shopify-style page — foreign CSS
variable names, a two-column grid, its own header/price/footer, a stand-in
"theme gallery" div — and ran the real `model.glb` / `chair.glb` through the
whole thing in headless Chrome:

- Hero reaches ready state with the real 10.8 MB model, zero page errors.
- The fake page's header, price, add-to-cart, and footer were provably
  untouched throughout — confirms the "only touches its container" claim
  rather than just asserting it.
- Studio, Size, Scale (real chair.glb load, 4 chairs placed and scaled
  correctly), Grain, and hotspot detail cards all fired correctly.
- 3D/Photos toggle correctly reparented itself onto the fake theme's gallery
  container purely from the `data-gallery-selector` value — proving the
  mechanism generalizes past FableRoom's own page structure.
- Fullscreen round-trip, no errors.

**One real bug found and fixed by this testing, not shipped blind:** the
first version hid the toggle's sub-controls in Photos mode but never actually
hid the 3D canvas itself, because the original page did that with a
page-level `body.mode-2d #hero{display:none}` rule that doesn't belong in a
portable embed. Fixed by tying it to the `.hero.is-photos` class this script
already controls directly.

## What's different from the pitch page on purpose

- No AR button — it was already pulled from the live build before this
  packaging work; the engine bundle still carries the dormant code (harmless)
  in case you want it back later.
- No page reconstruction (header, breadcrumbs, gallery, price, reviews, etc.)
  — that's your real Shopify theme now, not a stand-in.
- Hotspot copy, dimensions, and the chair pairing are still the exact
  Belgrave content from the pitch build. If this ever needs to become a
  reusable pattern for a different product, that content and the `--real-size`-
  equivalent numbers baked into the hotspot list would need pulling out into
  config too — flag it if that's the next ask, it's a bounded change, not a
  rewrite.
