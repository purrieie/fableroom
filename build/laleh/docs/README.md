# Shopify drop-in: "See it in your room" for the Laleh rug

This adds a photo-based rug visualiser to the Laleh Hand-tufted Wool Persian Rug
page. A shopper picks a sample room, or takes or uploads a photo of their own
room, and the rug is drawn on the floor **at true size**. They can switch between
140×200, 160×230 and 200×290 cm, move and turn the rug, measure the floor, and
save the picture. The add-on also has a **"Which size?"** finder (sofa, UK bed
size or dining table in, a to-scale plan out) and a **"Good to know"** panel with
the questions UK buyers ask (pile height, door clearance, underfloor heating,
underlay, pets, shedding, delivery, returns).

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
| `fableroom-room-view.js` | — | %%APP_KB%% KB compressed (%%APP_RAW%% KB raw) |
| Room photo (only the one being viewed) | — | 75–177 KB |
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
| `room-living.webp`, `room-lounge.webp`, `room-bedroom.webp` (+ `-thumb`) | Sample rooms. **Placeholders** from Unsplash (free licence), see *Sample rooms*. |

## Install (duplicate theme first)

1. **Assets:** upload `fableroom-room-view.js` and the nine `.webp` files to the
   theme's `assets/`.
2. **Snippet:** add `snippets/fableroom-room-view.liquid` with the contents of the file.
3. **Placement:** in the theme editor, product template, add a **Custom Liquid**
   block directly **under the variant picker** (Dimensions) with:

   ```liquid
   {% if product.handle == 'laleh-hand-tufted-wool-rug' %}{% render 'fableroom-room-view' %}{% endif %}
   ```

   The handle check matters: the rug images are Laleh's. If the Enterprise
   template has no Custom Liquid block there, paste the same line into
   `main-product` right after `</variant-picker>`.

That is all. The snippet also adds a **"See it in your room"** pill to the top-right
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

Each photo is treated as a camera: a height above the floor, a downward tilt and a
focal length. Those three fix the floor plane, so a 200 × 290 cm rug is drawn at
exactly 200 × 290 cm on that floor, with correct perspective, a 12 mm edge, a soft
contact shadow and the room's light falling across it.

- **Sample rooms** carry measured values (camera height checked against furniture
  of standard size, e.g. the wing chair's ~82 cm width). Furniture that
  stands on the rug (sofa legs, the bed, the pouf) is masked, so the rug slides
  underneath it.
- **The shopper's own photo:** focal length comes from the photo's EXIF where
  present (iPhones and most Androids write it); the tilt is worked out from the
  photo's vertical lines (door frames, wall corners, furniture legs converge
  when the phone points down). They then see a 50 cm floor grid with two sliders
  (floor angle, phone height) and a tape measure: drag it across something they
  know, tap the reading, type the real length, and the whole scene rescales.
- **Privacy:** the photo never leaves the device. It is decoded and drawn locally,
  nothing is uploaded or stored.

## Tracking

`window.dataLayer.push`, keys prefixed `frrv_` (same pattern as the 3D hero's `fr3d_`).

| Event | `frrv_action` |
|---|---|
| `pdp_room_view` | `open` (frrv_item = tab, frrv_source = `entry`/`gallery`), `scene_ready` (frrv_ms = load time), `scene_failed`, `own_photo_failed`, `unsupported`, `close` (frrv_ms = time open) |
| `pdp_room_interaction` | `scene`, `size`, `move`, `rotate`, `dims_on/off`, `tape_on/off`, `tape_drag`, `tape_correct`, `compare`, `save`, `own_photo_sheet`, `own_photo` (frrv_item = `exif_26` / `no_exif`), `adjust_angle`, `adjust_height`, `tab`, `unit`, `finder_room/sofa/layout/bed/table`, `finder_result` (frrv_item = `bedroom:200x290 cm`), `door_check`, `add_to_basket` |

Continuous gestures (move, drag, rotate) are sent once per page view; at most 60
events per page view. GTM: Custom Event trigger on regex `^pdp_room_`, then a GA4
event tag mapping the `frrv_*` variables, exactly as for `pdp_3d_*`.

## Sample rooms — to replace

The three rooms are free-licence Unsplash photos used as stand-ins. FableRoom's
own room photography or renders should replace them. What makes a good one:

- landscape, 1800 px+ wide, **plenty of open floor in the lower half**, shot from
  ~1.2–1.5 m with the camera tilted slightly down (more floor = better on phones);
- a sofa, bed or table the rug can sit under;
- for a render: note camera height, vertical tilt and focal length — those three
  numbers make calibration exact (`h`, `hz`, `f` in the scene entry).

A scene entry: `{ id, label, img, thumb, f (focal ÷ image width), hz (horizon ÷ image
height), h (camera height, m), place [x, y] (rug centre, image fractions), yaw
(degrees), size (default variant index), ref [w, h], occl [polygons in ref pixels] }`.

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

%%PERF%%
