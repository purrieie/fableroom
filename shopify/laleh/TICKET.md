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
