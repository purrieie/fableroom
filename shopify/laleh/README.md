# Shopify drop-in: "See it in your room" for the Laleh rug

This adds a RugLove/Floori-style rug visualiser to the Laleh Hand-tufted Wool Persian
Rug page. A shopper picks one of five rendered rooms seen from above (living room,
classic lounge, bedroom, dining room, reading corner), or takes/uploads a photo of
their own room, and the rug is drawn on the floor **at true size**, sliding under
the furniture and picking up the room's light and shadows. They can switch between
140×200, 160×230 and 200×290 cm, move it, turn it (rotation slider), zoom, compare
two sizes side by side, drag a before/after divider, go fullscreen, measure the
floor and save the picture. A **"Which size?"** tab fits on one phone screen: room
type, sofa/bed/table size, the best fit drawn to scale, all three sizes rated, and
a door-clearance check (pile height).

It sits on top of the existing theme. Nothing is replaced: the gallery, size
buttons and Add to Basket all stay as they are.

**Live reference:** https://purrieie.github.io/fableroom/laleh/ (a copy of the live
PDP with this snippet installed exactly as below; trackers stripped, so Add to
Basket shows a "demo" toast there).

## What it costs the page

| | Up front, on every page view | After a shopper taps |
|---|---:|---:|
| HTML + inline CSS/JS (the snippet) | **~1.8 KB** compressed | — |
| Requests | **0** | app JS + images |
| `fableroom-room-view.js` | — | 25 KB compressed (78 KB raw) |
| Room image + mask + light map (only the room being viewed, desktop or phone framing) | — | ~120–220 KB |
| Rug texture | — | 23 KB, then 122 KB; 477 KB only when the rug fills the screen or on Save |

The script is injected on the first sign of intent (pointer over, touch, or
keyboard focus on one of the buttons), so by the time the tap lands it is usually
already there. No WebGL context is created until the overlay opens.

Lighthouse (mobile, 3 runs each, same saved page with and without the snippet):
see **Performance** at the bottom.

## Files

| File | What it is |
|---|---|
| `fableroom-room-view.liquid` | The snippet: entry buttons, their CSS, the config and the inline loader. |
| `fableroom-room-view.js` | The app: overlay, WebGL renderer, size finder, buying checks. Every class/id is prefixed `frrv-`. |
| `laleh-rug-sm.webp` / `-md` / `-hd` | The rug, cropped from the top-down product shot (FRRU00175A_3), 256/512/1024 px wide. |
| `room-<id>.webp`, `room-<id>-p.webp` | The five rendered rooms, desktop (1800×1350) and phone (1350×1690) framings. |
| `room-<id>-mask.png`, `room-<id>-shade.webp` (+ `-p`) | Per room: what stands in front of the floor (so the rug goes under it) and the floor's light/shadow (multiplied into the rug). |
| `room-<id>-thumb.webp` | Room picker thumbnails. |

## Install (duplicate theme first)

1. **Assets:** upload `fableroom-room-view.js` and every `.webp` / `.png` file in
   this folder to the theme's `assets/` (the snippet's asset list is generated to match).
2. **Snippet:** add `snippets/fableroom-room-view.liquid` with the contents of the file.
3. **Placement:** in the theme editor, product template, add a **Custom Liquid**
   block directly **under the variant picker** (Dimensions) with:

   ```liquid
   {% if product.handle == 'laleh-hand-tufted-wool-rug' %}{% render 'fableroom-room-view' %}{% endif %}
   ```

   The handle check matters: the rug images are Laleh's. If the Enterprise
   template has no Custom Liquid block there, paste the same line into
   `main-product` right after `</variant-picker>`.

That is all. The snippet also adds a **"View in your room"** pill to the top-right
of the main gallery image (`.media-gallery__viewer`), positioned absolutely so it
can't shift the layout.

## How it talks to the theme

- **Size:** opening the overlay reads the page's checked Dimensions radio. Picking
  a size in the overlay clicks the matching `label[for]` on the page, so the
  theme updates price, URL and stock exactly as if the shopper had tapped it. It
  also listens for the theme's `on:variant:change` event.
- **Add to Basket:** selects the size on the page, closes the overlay and clicks
  the theme's own `form.js-product-form-main button[name="add"]`, so the cart
  drawer, upsells and existing add-to-cart tracking all fire unchanged. If that
  button can't be found it falls back to `/cart/add.js` and goes to `/cart`.
  Override the selector with `atcSelector` in the config.
- **Sold-out sizes** (160×230 today) can still be previewed; the overlay's button
  reads *Sold out* and is disabled.

## Config (`window.FRRV_CONFIG`, set in the snippet)

| Key | Laleh value | Purpose |
|---|---|---|
| `appSrc` | asset URL | The app script, loaded on intent |
| `product.variants` | from Liquid | id, title (`140x200 cm`), price, compare-at, available. Sizes are parsed from the title. |
| `badges` | `{"200x290 cm": "Most Popular"}` | Badge per size title, matching the page |
| `spec.thicknessMm` | `12` | Total thickness used for the rug's edge and the door check. **Estimate**, see below. |
| `spec.name` | `Laleh Rug` | Overlay title |
| `assets` | asset URLs | One per image file |
| `gallerySelector` | `.media-gallery__viewer` | Where the gallery pill goes; remove the key for no pill |
| `analytics` | `gtm` | `none` to switch tracking off |
| `atcSelector` | *(default)* | The theme's Add to Basket button |
| `syncPage` | *(true)* | `false` stops the overlay changing the page's size |
| `scenes`, `facts` | *(built in)* | Replace the sample rooms or the Good-to-know list |

`window.FRRV.open('room' | 'size' | 'know')` opens it from anywhere else (e.g. a
link in the size-guide modal), loading the app first if needed.

## How the rug is placed (why sizes are true)

Each room is a camera: a height above the floor, a downward tilt and a focal length.
Those three fix the floor plane, so a 200 × 290 cm rug is drawn at exactly that size,
with correct perspective, a 12 mm edge and a soft contact shadow.

- **Rendered rooms** (`build/laleh/render/`) are path-traced in three.js from a room
  description, so the camera is known exactly (checked: 0 px error between the
  renderer and the tool). Each render also writes a mask (anything that isn't
  floor, so the rug slides under sofa legs, tables and beds) and a light map of the
  floor alone (so furniture shadows and window light fall across the rug).
  Furniture: FableRoom's own Alan coffee table, Belgrave table and Keaton chairs,
  plus CC0 models/textures from Poly Haven. The renders shipped now are half size
  (1000 px) and landscape only; phones crop them until portrait framings (pulled back
  so a whole 200×290 rug fits the screen) are rendered.
- **The shopper's own photo:** focal length from EXIF where present; the tilt is read
  from the photo's vertical lines. A 50 cm floor grid, two sliders and a tape
  measure correct it. The photo never leaves the device.

## View controls (Floori-style bar)

Fullscreen (real fullscreen where the browser allows; on iPhone the stage takes over
the overlay) · Zoom (2×, centred on the rug) · Compare (two sizes split by a
draggable divider; tap a side's label to change its size) · Before/After (the room
without and with the rug) · Rotation slider (0–359°, plus two-finger twist and the
handle on the rug).

## Tracking

`window.dataLayer.push`, keys prefixed `frrv_` (same pattern as the 3D hero's `fr3d_`).

| Event | `frrv_action` |
|---|---|
| `pdp_room_view` | `open` (frrv_item = tab, frrv_source = `entry`/`gallery`), `scene_ready` (frrv_ms = load time), `scene_failed`, `own_photo_failed`, `unsupported`, `close` (frrv_ms = time open) |
| `pdp_room_interaction` | `scene`, `size`, `move`, `rotate` (handle / twist / slider), `fullscreen_on/off`, `zoom_in/out`, `compare`, `before_after`, `dims_on/off`, `tape_on/off`, `tape_drag`, `tape_correct`, `save`, `own_photo_sheet`, `own_photo` (frrv_item = `exif_26` / `no_exif`), `adjust_angle`, `adjust_height`, `tab`, `unit`, `finder_room`, `finder_item`, `finder_result` (frrv_item = `bedroom:double:200x290 cm`), `door_check`, `add_to_basket` |

Continuous gestures (move, drag, rotate) are sent once per page view; at most 60
events per page view. GTM: Custom Event trigger on regex `^pdp_room_`, then a GA4
event tag mapping the `frrv_*` variables, exactly as for `pdp_3d_*`.

## Rooms

Five rendered rooms ship by default (`scenes/rendered.json`, injected into the app at
build time). To add or change one: write `build/laleh/render/rooms/<id>.json` (field
reference at the top of `render/render.mjs`), preview with
`node render.mjs rooms/<id>.json --preview --scale 0.5`, make the phone framing with
`node portrait.mjs rooms/<id>.json`, render both (`render_all.sh`), list it in
`render/rooms.order.json`, then `node scenes_build.js && python3 build_laleh.py`.

## Things to confirm with FableRoom

1. **Pile height and total thickness.** The page gives the band *Medium pile
   0.6–1.2 cm*; there is no exact figure. 12 mm total is our estimate from the
   weight (9.25 kg for 2.8 m² ≈ 3.3 kg/m², typical of a ~1 cm hand-tufted loop pile
   plus backing). One measurement with a ruler fixes `spec.thicknessMm` and the
   door-check copy.
2. **Loop vs cut pile.** The bullets and photos say *loop pile*; the Buying Guide
   tab says *"the loops are sheared"* (cut pile). The pets advice assumes loop pile.
3. **Delivery box size** is stated for 140×200 only (143 × 18 × 18 cm, 10.1 kg).
4. **Tog rating** for underfloor heating isn't published; the copy avoids a number.

## Browser support

WebGL 1 or 2 (every current phone and desktop browser). Where WebGL is missing the
"In your room" tab is hidden and the size finder and Good-to-know still work.
Tested in Chrome (desktop and phone emulation, 390 × 844). **Not yet tested on a
real iPhone/Android device** — do that on the duplicate theme before going live,
especially the camera/upload path on iOS Safari.

## Rebuilding

Sources live in the repo at `build/laleh/` (`src/room-view.js`, `src/loader.js`,
`src/snippet.liquid`, `make_assets.js`, `build_laleh.py`).
`python3 build_laleh.py` rebuilds this folder and the demo.

## Performance

Lighthouse, mobile preset (simulated 4G, 4× CPU), median of 3 runs each, on the same saved copy of the live PDP served locally (third-party theme assets still load from fableroom.com, so run-to-run noise is large):

| Metric | Without | With snippet |
|---|---:|---:|
| Score | 55 | 54 |
| FCP | 8.23 s | 8.27 s |
| LCP | 16.10 s | 13.97 s |
| TBT | 125 ms | 140 ms |
| CLS | 0.062 | 0.062 |
| Speed Index | 8.72 s | 8.27 s |
| Page weight | 8230 KB | 7967 KB |
| Requests | 482 | 472 |
| Room-view requests during load | 0 | 0 |

The snippet adds ~1.8 KB of HTML and no requests; any difference above is noise from the theme's own third-party assets.
