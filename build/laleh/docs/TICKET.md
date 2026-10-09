# Ticket — Laleh rug: "See it in your room" (duplicate theme first)

**Goal:** add the room visualiser, size finder and buying checks to
`/products/laleh-hand-tufted-wool-rug`, without changing anything the page does today.

**Reference:** https://purrieie.github.io/fableroom/laleh/ · full notes in `README.md`.

## Steps

1. Duplicate the live theme. Work only in the duplicate.
2. Upload to `assets/`: `fableroom-room-view.js` + every `.webp` / `.png` in the package.
3. Create `snippets/fableroom-room-view.liquid` from the supplied file.
4. Product template → Custom Liquid block directly under the variant picker:
   `{% if product.handle == 'laleh-hand-tufted-wool-rug' %}{% render 'fableroom-room-view' %}{% endif %}`
5. GTM: Custom Event trigger `^pdp_room_` (regex) → GA4 event tag, parameters from the
   `frrv_*` data-layer keys (same setup as `pdp_3d_*`).

## Check before publishing

- [ ] Page loads with **no** `fableroom-room-view.js` or `.webp` requests until a button is touched (DevTools → Network).
- [ ] "View in your room" pill shows top-right on the main gallery image and the outlined "VIEW IN YOUR ROOM" button sits under the sizes; nothing shifts as the page loads.
- [ ] Choosing a size in the overlay changes the page's Dimensions selection and price.
- [ ] Add to Basket in the overlay opens the theme's cart drawer with the right size.
- [ ] 160×230 shows *Sold out* while it is unavailable.
- [ ] Real iPhone (Safari) and Android (Chrome): open, switch rooms, Compare, Before/After, Rotation, Fullscreen, take a photo with the camera, upload from the library, Save image.
- [ ] `pdp_room_*` events arrive in GTM preview.
- [ ] Confirm the rug's real total thickness and set `spec.thicknessMm` in the snippet (currently an estimate of 12).

**Do not publish the theme.** Send the duplicate theme's preview link back on this ticket with the time log filled in.

## Known limitations — please don't raise these as bugs

These are deliberate stand-ins, already tracked on our side:

- **The sample rooms are stand-ins.** They're path-traced 3D renders, not photos of FableRoom rooms, and they're
  currently at **half size (1000 px wide)**, so they look a little soft on a large desktop screen. Full-size
  renders are still owed and will replace the `room-*.webp` / `-mask.png` / `-shade.webp` files with the same names.
- **No phone-portrait crops yet.** On a phone the rooms show a crop of the landscape render, so some of the room
  sits outside the frame. Portrait versions will be added later and will use the same file-naming pattern.
- **The 12 mm thickness is an estimate.** The product page only says *"medium pile 0.6–1.2 cm"*; there's no exact
  figure. This drives the rug's edge and the door-gap check (see the checklist item above).
- **Loop vs cut pile is inconsistent on the live page.** The bullets and photos say loop pile, but the Buying Guide tab
  says the loops are sheared (cut pile). The overlay follows the bullets. This is a content question for FableRoom,
  not a bug in the build.
- **Not yet tested on a real iPhone or Android.** It has been checked in desktop browsers and phone emulation only.
  Your device QA is the first real-device pass, so please do report anything that breaks there.

## Time log

Please log time against each stage. In **Notes**, say *what* conflicted while debugging (theme CSS, the variant
picker, the cart drawer, apps, GTM), not just how long it took. That's what sizes the next rollout.

| Stage | Time | Notes — what conflicted / what you had to change |
|---|---:|---|
| 1. Theme duplication + asset upload | | |
| 2. Snippet + template placement | | |
| 3. Wiring to the variant picker and cart | | |
| 4. GTM (trigger, tag, variables, GA4 check) | | |
| 5. QA: desktop + iOS + Android | | |
| **Total** | | |
