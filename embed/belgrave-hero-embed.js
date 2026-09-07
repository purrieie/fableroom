/*!
 * Belgrave 3D hero — Shopify embed
 *
 * Drop-in for the FableRoom Belgrave Wooden Dining Table PDP. This replaces
 * only the product's main image slot with the interactive 3D model; nothing
 * else on the real page is touched.
 *
 * REQUIRES belgrave-hero.bundle.js (the three.js engine) loaded BEFORE this
 * file — it exposes window.__initBelgraveViewer, which this script calls.
 *
 * USAGE
 * -----
 * 1. Upload model.glb and chair.glb to Shopify (Settings -> Files) and copy
 *    their CDN URLs.
 * 2. Somewhere on the product page — a Custom Liquid block, or directly in
 *    the product template — place an empty container with the config on it
 *    as data attributes:
 *
 *      <div id="belgrave-3d-hero"
 *           data-model-url="https://cdn.shopify.com/.../model.glb"
 *           data-model-bytes="10814800"
 *           data-chair-url="https://cdn.shopify.com/.../chair.glb"
 *           data-chair-href="https://fableroom.com/products/keaton-cream-upholstered-dining-chair"
 *           data-gallery-selector=""></div>
 *      <script src="{{ 'belgrave-hero.bundle.js' | asset_url }}" defer></script>
 *      <script src="{{ 'belgrave-hero-embed.js' | asset_url }}" defer></script>
 *
 *    This script finds that div on DOMContentLoaded and mounts itself into
 *    it automatically — nothing else to wire up.
 *
 * `data-gallery-selector` is optional. Leave it blank and the 3D/Photos
 * toggle just sits fixed in the hero's own corner. If you want it to float
 * over your theme's actual photo gallery once someone switches to Photos —
 * matching the pitch-page behaviour — set it to a CSS selector for your
 * theme's real gallery container and see the note in placeToggle() below;
 * this is the one piece that is genuinely theme-specific and worth checking
 * against your real page rather than trusting a guessed default.
 *
 * "Photos" mode toggles body classes (mode-3d / mode-2d) and hides #hero;
 * your theme's own product gallery is expected to already be on the page
 * and is NOT created by this script — wire its visibility to `body.mode-2d`
 * / `body.mode-3d` in your theme's own CSS if you want the switch to hide it
 * while 3D is showing (see the note further down).
 */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------
   * Scoped styles. Values below (--ink, --tan, --serif, etc.) are the exact
   * ones from the original build; they're declared here on .heroWrap rather
   * than assumed to already exist as theme globals, so this drops into any
   * theme without silently inheriting the wrong colour or losing a font.
   * Override any of them by setting the same custom property higher up the
   * DOM (e.g. on <body>) if you want the widget to pick up the shop's own
   * brand colours instead.
   * ------------------------------------------------------------------- */
  var CSS = ''
    + '.heroWrap{position:relative;--ink:#2C2C2C;--ink-2:#555;--ink-3:#7A7570;'
    + '--tan:#B77E45;--tan-d:#A06C36;--line:#E6E2DB;'
    + "--serif:'Playfair Display',Georgia,'Times New Roman',serif;"
    + "--sans:'Hanken Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"
    + '--maxw:1280px;--pad:16px;max-width:var(--maxw);margin:0 auto;font-family:var(--sans)}'
    + '@media(min-width:900px){.heroWrap{padding:0 var(--pad)}}'
    + '.hero{position:relative;width:100%;height:calc(100vh - var(--hero-offset,262px));'
    + 'min-height:340px;max-height:820px;overflow:hidden;isolation:isolate;'
    + 'border-top:1px solid var(--line);border-bottom:1px solid var(--line);'
    + 'touch-action:pan-y;transition:background .35s linear}'
    + '@supports(height:100svh){.hero{height:calc(100svh - var(--hero-offset,262px))}}'
    + '@media(min-width:900px){.hero{height:min(74vh,660px);border-radius:10px;border:1px solid var(--line)}}'
    + '.hero canvas{width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab;opacity:0;transition:opacity .7s ease}'
    + '.hero.is-ready canvas{opacity:1}'
    + '.hero__ph{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;transition:opacity .6s ease}'
    + '.hero.is-ready .hero__ph{opacity:0}'
    + '.hero__ph img{width:min(58%,340px);height:auto;filter:blur(18px) saturate(.85);opacity:.42}'
    + '.hero__load{position:absolute;left:50%;bottom:26%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:9px;pointer-events:none;transition:opacity .4s ease}'
    + '.hero.is-ready .hero__load{opacity:0}'
    + '.hero__track{width:132px;height:2px;background:rgba(44,44,44,.13);border-radius:2px;overflow:hidden}'
    + '.hero__bar{height:100%;width:6%;background:var(--tan);border-radius:2px;transition:width .35s ease}'
    + '.hero__status{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}'
    + '.hero__hint{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;white-space:nowrap;'
    + 'background:rgba(44,44,44,.76);color:#fff;border-radius:100px;padding:7px 15px;font-size:12px;pointer-events:none;opacity:0;'
    + 'transition:opacity .5s ease .3s;z-index:3}'
    + '.hero.is-ready .hero__hint{opacity:1}.hero.is-touched .hero__hint{opacity:0;transition-delay:0s}'
    + '.hero__hint svg{width:15px;height:15px;stroke:#fff;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}'
    + '.hero__tools{position:absolute;right:12px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:8px;z-index:3;'
    + 'transition:opacity .25s ease,visibility 0s}'
    + '@media(max-width:767px){.hero.is-dims .hero__tools{opacity:0;pointer-events:none;visibility:hidden;transition:opacity .25s ease,visibility 0s linear .25s}}'
    + '.tool{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.9);'
    + 'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(44,44,44,.09);'
    + 'box-shadow:0 2px 10px rgba(44,30,15,.10);transition:transform .18s ease,background .18s ease}'
    + '.tool:active{transform:scale(.92);background:#fff}'
    + '.tool svg{width:19px;height:19px;stroke:var(--ink);fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}'
    + '.hero.is-immersive{position:fixed;inset:0;z-index:200;height:100vh;max-height:none;border-radius:0;border:0;touch-action:none}'
    + '@supports(height:100svh){.hero.is-immersive{height:100svh}}'
    + '.hero.is-immersive canvas{touch-action:none}'
    + '.hero__close{position:absolute;top:14px;right:14px;width:42px;height:42px;border-radius:50%;display:none;place-items:center;'
    + 'background:rgba(255,255,255,.92);border:0;cursor:pointer;z-index:4}'
    + '.hero.is-immersive .hero__close{display:grid}'
    + '.hero__close svg{width:19px;height:19px;stroke:var(--ink);stroke-width:1.8;fill:none;stroke-linecap:round}'
    + '.hero.is-unsupported canvas,.hero.is-unsupported .hero__tools,.hero.is-unsupported .hero__hint,'
    + '.hero.is-unsupported .hero__load,.hero.is-unsupported .studio,.hero.is-unsupported .vmode,'
    + '.hero.is-unsupported .hourrail,.hero.is-unsupported .spintog{display:none}'
    + '.hero.is-unsupported .hero__ph img{filter:none;opacity:1;width:min(78%,420px)}'
    + '.dimlabel{position:absolute;left:0;top:0;z-index:5;pointer-events:none;background:rgba(255,255,255,.92);'
    + 'border:1px solid rgba(44,44,44,.12);border-radius:100px;padding:3px 9px;font-size:10px;font-weight:700;'
    + 'letter-spacing:.06em;color:var(--ink);white-space:nowrap;opacity:0;transition:opacity .2s}'
    + '.dimlabel.on{opacity:1}'
    + '.hourrail{position:absolute;left:8px;top:50%;transform:translateY(-50%);z-index:6;display:flex;flex-direction:column;'
    + 'align-items:center;gap:7px;background:rgba(255,255,255,.8);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);'
    + 'border:1px solid rgba(44,44,44,.08);border-radius:22px;padding:8px 6px 6px;min-width:44px;'
    + 'box-shadow:0 4px 18px rgba(44,30,15,.10);touch-action:none}'
    + '.hero.is-immersive .hourrail,.hero.is-unsupported .hourrail,.hero.is-photos .hourrail{display:none}'
    + '.hourrail__sun{width:11px;height:11px;stroke:var(--ink-3);fill:none;stroke-width:1.9;stroke-linecap:round}'
    + '.hourrail__slot{position:relative;width:14px;height:104px;flex:0 0 auto;display:block}'
    + '@media(min-width:900px){.hourrail__slot{height:140px}}'
    + '.hourrail .tod{-webkit-appearance:none;appearance:none;position:absolute;touch-action:none;left:50%;top:50%;'
    + 'width:104px;height:3px;border-radius:3px;outline:none;padding:0;margin:0;transform:translate(-50%,-50%) rotate(-90deg);'
    + 'transform-origin:center;background:linear-gradient(90deg,#6B7C9E,#E8C79A,#FFF6E6,#E8C79A,#4E5F86)}'
    + '@media(min-width:900px){.hourrail .tod{width:140px}}'
    + '.hourrail .tod::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:#fff;'
    + 'border:1.5px solid rgba(44,44,44,.25);cursor:pointer}'
    + '.hourrail .tod::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#fff;border:1.5px solid rgba(44,44,44,.25);cursor:pointer}'
    + '.hourrail__read{font-size:8.5px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:var(--ink-3);white-space:nowrap;text-align:center}'
    + '.chairtag{position:absolute;z-index:6;display:none;flex-direction:column;gap:1px;transform:translate(-50%,-50%);'
    + 'text-decoration:none;cursor:pointer;background:rgba(255,255,255,.93);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);'
    + 'border:1px solid rgba(44,44,44,.10);border-radius:9px;padding:6px 10px;box-shadow:0 3px 14px rgba(44,30,15,.16);white-space:nowrap}'
    + '.chairtag.on{display:flex}'
    + '.chairtag b{font-size:10.5px;font-weight:700;color:var(--ink);letter-spacing:.01em}'
    + '.chairtag span{font-size:9px;color:var(--ink-3);letter-spacing:.04em}'
    + '.chairtag::after{content:"";position:absolute;left:var(--arrow,50%);bottom:-5px;width:9px;height:9px;margin-left:-4.5px;'
    + 'background:inherit;border-right:1px solid rgba(44,44,44,.10);border-bottom:1px solid rgba(44,44,44,.10);transform:rotate(45deg)}'
    + '.vmode{position:absolute;right:12px;bottom:12px;z-index:7;display:inline-flex;margin:0;background:rgba(255,255,255,.86);'
    + 'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(44,44,44,.09);border-radius:100px;padding:2px;'
    + 'box-shadow:0 2px 10px rgba(44,30,15,.12)}'
    + '.vmode button{border:0;background:none;cursor:pointer;border-radius:100px;padding:5px 10px;font-size:10px;font-weight:700;'
    + 'letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3);transition:background .2s,color .2s;white-space:nowrap}'
    + '@media(min-width:560px){.vmode button{padding:6px 13px;font-size:11px;letter-spacing:.1em}}'
    + '@media(min-width:900px){.vmode{right:calc(var(--pad) + 12px)}}'
    + '[data-belgrave-gallery]>.vmode{position:absolute;right:12px;bottom:34px;z-index:5;margin:0}'
    + '.vmode button[aria-pressed="true"]{background:var(--ink);color:#fff}'
    + '.spintog{position:absolute;top:10px;left:10px;z-index:5;border:0;background:none;padding:7px;cursor:pointer;line-height:0;'
    + 'opacity:.55;transition:opacity .2s ease,transform .18s ease}'
    + '.spintog:hover{opacity:.9}.spintog:active{transform:scale(.92)}'
    + '.spintog svg{width:19px;height:19px;stroke:var(--ink);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;'
    + 'filter:drop-shadow(0 1px 2px rgba(255,255,255,.85))}'
    + '.hero.is-photos .spintog{display:none}'
    + '.studio{position:absolute;left:12px;bottom:12px;z-index:6;width:fit-content;max-width:calc(100% - 24px - 116px);'
    + 'background:rgba(255,255,255,.86);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(44,44,44,.08);'
    + 'border-radius:14px;padding:7px 10px 6px;box-shadow:0 6px 22px rgba(44,30,15,.10);transition:opacity .3s ease,transform .3s ease}'
    + '@media(min-width:560px){.studio{max-width:calc(100% - 24px - 140px)}}'
    + '@media(min-width:760px){.studio{max-width:560px}}'
    + '.hero.is-unsupported .studio{display:none}'
    + '.hero.is-immersive .studio{left:50%;transform:translateX(-50%);max-width:calc(100% - 24px)}'
    + '.studio.is-hidden{opacity:0;transform:translateY(10px);pointer-events:none}'
    + '.hero.is-immersive .studio.is-hidden{transform:translateX(-50%) translateY(10px)}'
    + '.hero.is-photos .studio,.hero.is-photos .hero__tools,.hero.is-photos .hero__hint,.hero.is-photos .hs,.hero.is-photos .hero__tag{display:none}'
    // The original build hid this via a page-level `body.mode-2d #hero`
    // rule; scoping it to the class this embed already toggles is more
    // robust here since a Shopify theme's own body classes are outside our
    // control and shouldn't be relied on for something this load-bearing.
    + '.hero.is-photos{display:none}'
    + '.hero.is-unsupported .vmode{display:none}'
    + '.studio__acts{display:flex;align-items:center;justify-content:flex-start;gap:2px;overflow-x:auto;scrollbar-width:none}'
    + '.studio__acts::-webkit-scrollbar{display:none}'
    + '.actbtn{display:inline-flex;flex-direction:column;align-items:center;gap:3px;border:0;background:none;cursor:pointer;'
    + 'padding:4px 4px;border-radius:9px;flex:1 0 auto;font-size:8.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;'
    + 'color:var(--ink-2);transition:background .2s,color .2s;white-space:nowrap}'
    + '@media(min-width:560px){.actbtn{flex-direction:row;gap:6px;font-size:10px;letter-spacing:.08em;padding:6px 9px}}'
    + '.actbtn:hover{background:rgba(44,44,44,.05)}'
    + '.actbtn svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}'
    + '.actbtn.on{color:var(--tan-d)}'
    + '.hs{position:absolute;inset:0;pointer-events:none;z-index:5}.hs.is-off{display:none}'
    + '.hsdot{position:absolute;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;border:0;padding:0;cursor:pointer;'
    + 'pointer-events:auto;background:none;will-change:transform;transition:opacity .2s ease}'
    + '.hsdot::before{content:"";position:absolute;inset:6px;border-radius:50%;background:var(--tan);'
    + 'box-shadow:0 0 0 2px rgba(255,255,255,.55),0 0 9px 2px rgba(183,126,69,.55)}'
    + '.hsdot::after{content:"";position:absolute;inset:1px;border-radius:50%;border:1px solid rgba(183,126,69,.45);opacity:.8}'
    + '.hsdot.is-hidden{opacity:0;pointer-events:none}'
    + '.hsdot.is-active::before{background:#7C4E1E;box-shadow:0 0 0 2px rgba(255,255,255,.8),0 0 12px 3px rgba(183,126,69,.8)}'
    + '.hsdot.is-active::after{border-color:#7C4E1E;opacity:1}'
    + '.hscard{position:absolute;left:14px;right:14px;max-width:318px;top:54px;z-index:7;background:rgba(255,255,255,.68);'
    + 'backdrop-filter:blur(10px) saturate(130%);-webkit-backdrop-filter:blur(10px) saturate(130%);border:1px solid rgba(255,255,255,.55);'
    + 'border-radius:12px;padding:11px 13px 10px;box-shadow:0 16px 40px rgba(44,30,15,.20);opacity:0;transform:translateY(-8px);'
    + 'pointer-events:none;transition:opacity .25s,transform .25s}'
    + '@media(min-width:760px){.hscard{left:auto;right:16px;width:272px}}'
    + '.hscard.on{opacity:1;transform:none;pointer-events:auto}'
    + '@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.hscard{background:rgba(255,255,255,.94);border-color:var(--line)}}'
    + '.hscard__no{font-size:8.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--tan-d)}'
    + '.hscard h4{font-family:var(--serif);font-size:15px;font-weight:500;margin:3px 0 5px;line-height:1.2;color:var(--ink)}'
    + '.hscard p{margin:0;font-size:11.5px;line-height:1.5;color:var(--ink-2)}'
    + '.hscard__x{position:absolute;top:6px;right:6px;width:24px;height:24px;border:0;background:none;cursor:pointer;'
    + 'display:grid;place-items:center;border-radius:50%;color:var(--ink-3)}'
    + '.hscard__x svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round}'
    + '.belgrave-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(8px);z-index:9999;'
    + 'background:rgba(20,16,12,.9);color:#fff;padding:10px 18px;border-radius:100px;font-size:13px;opacity:0;'
    + 'pointer-events:none;transition:opacity .25s ease,transform .25s ease}'
    + '.belgrave-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}'
    + '@media(prefers-reduced-motion:reduce){.hero *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}';

  /* ---------------------------------------------------------------------
   * Markup. Same structure as the pitch build's hero — see HANDOFF.md in
   * the fableroom repo if you need to cross-reference against the original.
   * ------------------------------------------------------------------- */
  var HTML = ''
    + '<div class="heroWrap" data-belgrave-heroWrap>'
    + '  <div class="vmode" role="group" aria-label="View mode">'
    + '    <button data-b-mode3d aria-pressed="true">3D</button>'
    + '    <button data-b-mode2d aria-pressed="false">Photos</button>'
    + '  </div>'
    + '  <section class="hero" data-b-hero aria-label="Interactive 3D model of the Belgrave Wooden Dining Table">'
    + '    <canvas aria-hidden="true"></canvas>'
    + '    <div class="hero__ph"><img data-b-placeholder alt="Belgrave Wooden Dining Table" width="760" height="544"></div>'
    + '    <div class="hero__load"><div class="hero__track"><div class="hero__bar" data-b-bar></div></div>'
    + '      <div class="hero__status" data-b-status>Loading model</div></div>'
    + '    <div class="hero__hint"><svg viewBox="0 0 24 24"><path d="M4 12h16"/><path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/></svg>'
    + '      <span data-b-hint>Drag to spin &middot; Pinch to zoom</span></div>'
    + '    <div class="hs" data-b-hotspots aria-hidden="false"></div>'
    + '    <div class="hscard" data-b-hscard role="dialog" aria-live="polite">'
    + '      <button class="hscard__x" data-b-hsclose aria-label="Close detail"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>'
    + '      <div class="hscard__no" data-b-hsno>Detail 01</div><h4 data-b-hstitle></h4><p data-b-hsbody></p>'
    + '    </div>'
    + '    <button class="spintog" data-b-spin aria-pressed="true" aria-label="Pause rotation">'
    + '      <svg data-b-spinicon viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg></button>'
    + '    <div class="studio" data-b-studio><div class="studio__acts">'
    + '      <button class="actbtn on" data-b-studiobtn aria-pressed="true">'
    + '        <svg viewBox="0 0 24 24"><path d="M12 4.5a5.5 5.5 0 0 1 3.2 10c-.5.4-.7.9-.7 1.5v.5h-5v-.5c0-.6-.2-1.1-.7-1.5A5.5 5.5 0 0 1 12 4.5Z"/><path d="M10 19h4M10.5 21h3"/></svg><span>Studio</span></button>'
    + '      <button class="actbtn" data-b-dimbtn><svg viewBox="0 0 24 24"><path d="M3 8h18M3 8v8M21 8v8M7 11v2M12 11v2M17 11v2"/></svg><span>Size</span></button>'
    + '      <button class="actbtn" data-b-scalebtn><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.4"/><path d="M12 7.5v7M8 10h8M9.5 21 12 14.5 14.5 21"/></svg><span>Scale</span></button>'
    + '      <button class="actbtn" data-b-grainbtn><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6M8.5 11h5M11 8.5v5"/></svg><span>Grain</span></button>'
    + '      <button class="actbtn on" data-b-detailsbtn aria-pressed="true"><svg viewBox="0 0 24 24"><path d="M12 3.5 13.9 9l5.6.2-4.4 3.5 1.6 5.4L12 15l-4.7 3.1 1.6-5.4L4.5 9.2 10.1 9 12 3.5Z"/></svg><span data-b-detailslabel>Details</span></button>'
    + '    </div></div>'
    + '    <div class="hourrail" data-b-hourrail>'
    + '      <svg class="hourrail__sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/></svg>'
    + '      <span class="hourrail__slot"><input type="range" data-b-tod class="tod" min="0" max="100" value="50" aria-label="Time of day"></span>'
    + '      <span class="hourrail__read" data-b-todread>1:30pm</span>'
    + '    </div>'
    + '    <a class="chairtag" data-b-chairtag target="_blank" rel="noopener"><b data-b-chairtitle></b><span data-b-chairsub></span></a>'
    + '    <div class="hero__tools">'
    + '      <button class="tool" data-b-zoomin aria-label="Zoom in"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>'
    + '      <button class="tool" data-b-zoomout aria-label="Zoom out"><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>'
    + '      <button class="tool" data-b-reset aria-label="Reset view"><svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 2.6-6.4"/><path d="M3 4.5V10h5.5"/></svg></button>'
    + '      <button class="tool" data-b-expand aria-label="View full screen"><svg viewBox="0 0 24 24"><path d="M9 4H4v5M20 9V4h-5M15 20h5v-5M4 15v5h5"/></svg></button>'
    + '    </div>'
    + '    <button class="hero__close" data-b-close aria-label="Exit full screen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>'
    + '  </section>'
    + '</div>';

  var HOTSPOTS = [
    { id: 'top', at: [0.17, 0.663, 0.10], normal: [0, 1, 0], bias: 0.18, no: 'Detail 01',
      title: 'The Mango Wood Top',
      body: 'A single slab of solid mango wood, hand-sanded flat and finished in American walnut. No two tops carry the same figure.',
      view: { theta: 0.45, phi: 42, dist: 0.72, ty: 0.60 } },
    { id: 'edge', at: [0.0, 0.640, 0.495], normal: [0, 0.25, 1], bias: 0.22, no: 'Detail 02',
      title: 'The Softened Edge',
      body: 'The rim is eased rather than cut square, so it catches light all the way round and softens a large surface.',
      view: { theta: 0.1, phi: 78, dist: 0.55, ty: 0.60 } },
    { id: 'flute', at: [0.0, 0.500, 0.315], normal: [0, 0.15, 1], bias: 0.25, no: 'Detail 03',
      title: 'The Fluted Tiers',
      body: 'Three stacked tiers, cut with vertical flutes and stepped outward as they rise. The ridges are what give the base its shadow play.',
      view: { theta: 0.35, phi: 82, dist: 0.44, ty: 0.46 } },
    { id: 'mid', at: [0.0, 0.330, 0.335], normal: [0, 0.1, 1], bias: 0.25, no: 'Detail 04',
      title: 'The Pedestal Form',
      body: 'One central column instead of four legs: chairs tuck in anywhere, and legroom is the same at every seat.',
      view: { theta: 0.9, phi: 80, dist: 0.62, ty: 0.36 } },
    { id: 'foot', at: [0.0, 0.055, 0.275], normal: [0, 0.1, 1], bias: 0.25, no: 'Detail 05',
      title: 'The Footing',
      body: 'The base flares widest at the floor, putting the weight out at the perimeter. That is what stops it rocking.',
      view: { theta: 0.2, phi: 88, dist: 0.58, ty: 0.16 } }
  ];
  var GRAIN_VIEW = { theta: 0.6, phi: 62, dist: 0.30, ty: 0.62 };

  function toast(msg) {
    var el = document.querySelector('.belgrave-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'belgrave-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('on'); }, 3200);
  }

  /* ----------------------------------------------------------------------
   * mountBelgrave3DHero(containerId, opts)
   *
   * opts:
   *   modelUrl          (required) CDN URL for model.glb
   *   modelBytes         exact decompressed byte size — see viewer.js for
   *                      why this matters (the host may gzip the response)
   *   chairUrl           CDN URL for chair.glb (Scale button); omit to hide
   *                      the Scale feature entirely
   *   chairHref          product link the chair tag opens
   *   chairTitle          e.g. "Keaton Cream Chair"
   *   chairSub            e.g. "50 x 60 x 82 cm · £175"
   *   placeholderUrl      a still image shown before the model loads
   *   gallerySelector      CSS selector for your theme's real photo gallery
   *                      container — optional, see the file header comment
   * ------------------------------------------------------------------- */
  window.mountBelgrave3DHero = function (containerId, opts) {
    opts = opts || {};
    var container = document.getElementById(containerId);
    if (!container) { console.error('[belgrave-hero] no element #' + containerId + ' found'); return; }
    if (!opts.modelUrl) { console.error('[belgrave-hero] opts.modelUrl is required'); return; }
    if (typeof window.__initBelgraveViewer !== 'function') {
      console.error('[belgrave-hero] belgrave-hero.bundle.js must be loaded first');
      return;
    }

    if (!document.getElementById('belgrave-hero-styles')) {
      var styleEl = document.createElement('style');
      styleEl.id = 'belgrave-hero-styles';
      styleEl.textContent = CSS;
      document.head.appendChild(styleEl);
    }

    container.innerHTML = HTML;
    var root = container.querySelector('[data-belgrave-heroWrap]');
    var hero = container.querySelector('[data-b-hero]');
    var $ = function (sel) { return container.querySelector(sel); };

    // viewer.js resolves its host by document.getElementById and immediately
    // calls host.querySelector('canvas') with no null guard — an id that
    // fails to resolve throws here, not somewhere easier to diagnose. Give
    // the injected hero a real, namespaced id rather than passing null.
    var idPrefix = 'belgrave-' + containerId;
    hero.id = idPrefix + '-hero';
    $('[data-b-status]').id = idPrefix + '-status';
    $('[data-b-bar]').id = idPrefix + '-bar';

    if (opts.placeholderUrl) $('.hero__ph img').src = opts.placeholderUrl;
    else $('.hero__ph').style.display = 'none';

    if (opts.gallerySelector) {
      var galHost = document.querySelector(opts.gallerySelector);
      if (galHost) galHost.setAttribute('data-belgrave-gallery', '');
    }

    var supported = (function () {
      try {
        var c = document.createElement('canvas');
        return !!(window.WebGLRenderingContext &&
          (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')));
      } catch (e) { return false; }
    })();
    if (!supported) { hero.classList.add('is-unsupported'); return; }

    var viewer = window.__initBelgraveViewer({
      hostId: hero.id, statusId: $('[data-b-status]').id, barId: $('[data-b-bar]').id,
      modelUrl: opts.modelUrl,
      modelBytes: opts.modelBytes || 0
    });
    if (!viewer) { hero.classList.add('is-unsupported'); return; }
    window.__belgraveViewerRef = viewer;

    viewer.onFirstInput(function () { hero.classList.add('is-touched'); });
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      viewer.controls.autoRotate = false;
      hero.classList.add('is-touched');
    }

    $('[data-b-zoomin]').addEventListener('click', function () { viewer.zoomIn(); hero.classList.add('is-touched'); });
    $('[data-b-zoomout]').addEventListener('click', function () { viewer.zoomOut(); hero.classList.add('is-touched'); });
    $('[data-b-reset]').addEventListener('click', function () { viewer.reset(); });

    var immersive = false;
    function setImmersive(on) {
      immersive = on;
      hero.classList.toggle('is-immersive', on);
      document.body.classList.toggle('is-locked', on);
      viewer.setImmersive(on);
      $('[data-b-hint]').textContent = on ? 'Drag to orbit · Pinch to zoom' : 'Drag to spin · Pinch to zoom';
      if (on) {
        hero.classList.remove('is-touched');
        setTimeout(function () { hero.classList.add('is-touched'); }, 2600);
      }
    }
    $('[data-b-expand]').addEventListener('click', function () { setImmersive(true); });
    $('[data-b-close]').addEventListener('click', function () { setImmersive(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && immersive) setImmersive(false); });

    var hsLayer = $('[data-b-hotspots]'), card = $('[data-b-hscard]');
    var AMBIENCE = [
      ['#EDF1F7', '#E4EBF4', '#D6E0EC', '#C9D5E4'],
      ['#FDFAF4', '#F7EFE1', '#EDE0CB', '#E2D2B8'],
      ['#FDFBF8', '#F6F0E8', '#EDE4D8', '#E7DCCC'],
      ['#FEF7EC', '#FAE7CC', '#F0D2A8', '#E3BE8B'],
      ['#E6ECF6', '#D2DDEE', '#B2C2DC', '#94A8C8']
    ];
    function mixHex(a, b, t) {
      var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
      var r = Math.round((pa >> 16) + ((pb >> 16) - (pa >> 16)) * t);
      var g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t);
      var bl = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * t);
      return 'rgb(' + r + ',' + g + ',' + bl + ')';
    }
    function ambienceStops(v) {
      var f = v * (AMBIENCE.length - 1);
      var i = Math.min(AMBIENCE.length - 2, Math.floor(f)), t = f - i;
      return AMBIENCE[i].map(function (c, k) { return mixHex(c, AMBIENCE[i + 1][k], t); });
    }
    function paintBackdrop(stops) {
      hero.style.background = 'radial-gradient(112% 74% at 50% 8%,' +
        stops[0] + ' 0%,' + stops[1] + ' 42%,' + stops[2] + ' 78%,' + stops[3] + ' 100%)';
    }
    hero.style.transition = 'background .35s linear';
    viewer.onAmbience(function (v) { paintBackdrop(ambienceStops(v)); });

    var tod = $('[data-b-tod]'), todRead = $('[data-b-todread]'), studioBtn = $('[data-b-studiobtn]');
    function hourLabel(v) {
      var h = 6 + v * 15;
      var hh = Math.floor(h), mm = Math.round((h - hh) * 4) * 15;
      if (mm === 60) { hh += 1; mm = 0; }
      var ampm = hh >= 12 ? 'pm' : 'am';
      var d = hh % 12; if (d === 0) d = 12;
      return d + (mm ? ':' + (mm < 10 ? '0' : '') + mm : '') + ampm;
    }
    function setHour(v, fromStudio) {
      viewer.setTimeOfDay(v);
      todRead.textContent = hourLabel(v);
      var neutral = Math.abs(v - 0.5) < 0.02;
      studioBtn.classList.toggle('on', neutral);
      studioBtn.setAttribute('aria-pressed', String(neutral));
      if (!fromStudio) tod.value = Math.round(v * 100);
    }
    tod.addEventListener('input', function () { setHour(+tod.value / 100); });
    studioBtn.addEventListener('click', function () { setHour(0.5, false); });

    var spinBtn = $('[data-b-spin]'), spinIcon = $('[data-b-spinicon]');
    var PAUSE_ICON = '<path d="M9 6v12M15 6v12"/>';
    var PLAY_ICON = '<path d="M8 5.5 19 12 8 18.5V5.5Z"/>';
    function setSpin(on) {
      viewer.setAutoRotate(on);
      spinBtn.setAttribute('aria-pressed', String(on));
      spinIcon.innerHTML = on ? PAUSE_ICON : PLAY_ICON;
      spinBtn.setAttribute('aria-label', on ? 'Pause rotation' : 'Resume rotation');
    }
    spinBtn.addEventListener('click', function () { setSpin(!viewer.autoRotate()); });

    var dots = {}, activeId = null, detailsOn = true;
    viewer.setHotspots(HOTSPOTS.map(function (h) { return { id: h.id, at: h.at, normal: h.normal, bias: h.bias }; }));
    HOTSPOTS.forEach(function (h) {
      var b = document.createElement('button');
      b.className = 'hsdot is-hidden';
      b.setAttribute('aria-label', h.title);
      b.addEventListener('click', function (e) { e.stopPropagation(); openCard(h.id); });
      hsLayer.appendChild(b);
      dots[h.id] = b;
    });
    function openCard(id) {
      var h = HOTSPOTS.filter(function (x) { return x.id === id; })[0];
      if (!h) return;
      if (activeId === id) { closeCard(); return; }
      activeId = id;
      $('[data-b-hsno]').textContent = h.no;
      $('[data-b-hstitle]').textContent = h.title;
      $('[data-b-hsbody]').textContent = h.body;
      card.classList.add('on');
      Object.keys(dots).forEach(function (k) { dots[k].classList.toggle('is-active', k === id); });
      setSpin(false);
      viewer.flyTo(h.view, 900);
    }
    function closeCard() {
      activeId = null;
      card.classList.remove('on');
      Object.keys(dots).forEach(function (k) { dots[k].classList.remove('is-active'); });
    }
    $('[data-b-hsclose]').addEventListener('click', closeCard);

    var detailsBtn = $('[data-b-detailsbtn]'), detailsLabel = $('[data-b-detailslabel]');
    detailsBtn.addEventListener('click', function () {
      detailsOn = !detailsOn;
      hsLayer.classList.toggle('is-off', !detailsOn);
      detailsBtn.classList.toggle('on', detailsOn);
      detailsBtn.setAttribute('aria-pressed', String(detailsOn));
      detailsLabel.textContent = detailsOn ? 'Hide details' : 'Show details';
      if (!detailsOn) closeCard();
    });

    var grainBtn = $('[data-b-grainbtn]'), grainOn = false;
    grainBtn.addEventListener('click', function () {
      grainOn = !grainOn;
      grainBtn.classList.toggle('on', grainOn);
      closeCard();
      setSpin(false);
      if (grainOn) viewer.flyTo(GRAIN_VIEW, 1000);
      else viewer.home();
    });

    var dimLayer = document.createElement('div');
    dimLayer.className = 'hs';
    hero.appendChild(dimLayer);
    var dimEls = {};
    ['dim-w', 'dim-h'].forEach(function (id) {
      var el = document.createElement('div');
      el.className = 'dimlabel';
      dimLayer.appendChild(el);
      dimEls[id] = el;
    });
    var dimBtn = $('[data-b-dimbtn]');
    dimBtn.addEventListener('click', function () {
      var on = !viewer.dimensionsOn();
      viewer.setDimensions(on);
      dimBtn.classList.toggle('on', on);
      hero.classList.toggle('is-dims', on);
      if (!on) Object.keys(dimEls).forEach(function (k) { dimEls[k].classList.remove('on'); });
    });

    var scaleBtn = $('[data-b-scalebtn]'), chairTag = $('[data-b-chairtag]');
    var chairsOn = false, chairsBusy = false;
    var toolsEl = container.querySelector('.hero__tools'), toolsW = 0;
    if (opts.chairHref) chairTag.href = opts.chairHref;
    if (opts.chairTitle) $('[data-b-chairtitle]').textContent = opts.chairTitle;
    if (opts.chairSub) $('[data-b-chairsub]').textContent = opts.chairSub;
    if (!opts.chairUrl) scaleBtn.style.display = 'none';
    scaleBtn.addEventListener('click', function () {
      if (chairsBusy || !opts.chairUrl) return;
      chairsOn = !chairsOn;
      scaleBtn.classList.toggle('on', chairsOn);
      if (chairsOn) {
        chairsBusy = true;
        scaleBtn.querySelector('span').textContent = 'Loading';
        Promise.resolve(viewer.setCompanions(true, opts.chairUrl)).then(function () {
          chairsBusy = false;
          scaleBtn.querySelector('span').textContent = 'Scale';
        }).catch(function () {
          chairsBusy = false; chairsOn = false;
          scaleBtn.classList.remove('on');
          scaleBtn.querySelector('span').textContent = 'Scale';
          toast('The chairs could not load');
        });
      } else {
        viewer.setCompanions(false);
        chairTag.classList.remove('on');
      }
    });

    viewer.onFrame(function () {
      var labels = viewer.dimensionLabels();
      for (var k = 0; k < labels.length; k++) {
        var dl = dimEls[labels[k].id];
        if (!dl) continue;
        if (dl.textContent !== labels[k].text) { dl.textContent = labels[k].text; dl._w = 0; }
        if (!dl._w) dl._w = dl.offsetWidth || 44;
        var half = dl._w / 2 + 4, lim = hero.clientWidth - half;
        var lx = labels[k].x < half ? half : (labels[k].x > lim ? lim : labels[k].x);
        dl.style.transform = 'translate(' + lx + 'px,' + labels[k].y + 'px) translate(-50%,-50%)';
        dl.classList.toggle('on', labels[k].visible);
      }
      if (chairsOn && !chairsBusy) {
        var a = viewer.chairAnchor();
        if (a) {
          var pt = viewer.projectPoint(a);
          chairTag.classList.toggle('on', pt.visible);
          if (pt.visible) {
            if (!chairTag._w) chairTag._w = chairTag.offsetWidth || 0;
            if (!toolsW && toolsEl) toolsW = toolsEl.offsetWidth || 0;
            var toolsUp = toolsEl && (hero.clientWidth >= 768 || !hero.classList.contains('is-dims'));
            var guard = toolsUp ? toolsW + 18 : 8;
            var cW = chairTag._w || 122, cHalf = cW / 2;
            var lo = cHalf + 8, hi = hero.clientWidth - guard - cHalf;
            var cx = hi < lo ? (lo + hi) / 2 : (pt.x < lo ? lo : (pt.x > hi ? hi : pt.x));
            var arrow = 50 + (pt.x - cx) / cW * 100;
            chairTag.style.left = cx + 'px';
            chairTag.style.top = (pt.y - 26) + 'px';
            chairTag.style.setProperty('--arrow', (arrow < 14 ? 14 : arrow > 86 ? 86 : arrow) + '%');
          }
        }
      }
      if (!detailsOn) return;
      var pts = viewer.hotspotPositions();
      for (var i = 0; i < pts.length; i++) {
        var d = dots[pts[i].id];
        if (!d) continue;
        d.style.transform = 'translate(' + pts[i].x + 'px,' + pts[i].y + 'px)';
        d.classList.toggle('is-hidden', !pts[i].visible);
      }
    });

    /* ---- 3D / Photos ----
     * "Photos" here means: hide our 3D canvas and let your theme's own
     * product gallery show through underneath. This script does NOT create
     * or control that gallery — it only toggles body.mode-3d / body.mode-2d
     * and hides #hero's own container. If your theme's gallery is not
     * already visible behind/beside the hero by default, add CSS in your
     * theme along the lines of:
     *   body.mode-3d .your-gallery-selector { display:none }
     * so the two don't show at the same time.
     */
    var b3 = $('[data-b-mode3d]'), b2 = $('[data-b-mode2d]');
    var vmodeEl = container.querySelector('.vmode');
    var vmodeHome = vmodeEl.parentNode, vmodeAnchor = vmodeEl.nextSibling;
    function placeToggle(threeD) {
      var galEl = opts.gallerySelector ? document.querySelector(opts.gallerySelector) : null;
      var wantGallery = !threeD && galEl && window.innerWidth < 900;
      var inGallery = vmodeEl.parentNode === galEl;
      if (wantGallery && !inGallery) galEl.appendChild(vmodeEl);
      else if (!wantGallery && inGallery) vmodeHome.insertBefore(vmodeEl, vmodeAnchor);
    }
    function setMode(threeD) {
      document.body.classList.toggle('mode-3d', threeD);
      document.body.classList.toggle('mode-2d', !threeD);
      hero.classList.toggle('is-photos', !threeD);
      b3.setAttribute('aria-pressed', String(threeD));
      b2.setAttribute('aria-pressed', String(!threeD));
      viewer.setPaused(!threeD);
      if (!threeD) closeCard();
      if (window.__belgraveSizeHero) setTimeout(window.__belgraveSizeHero, 60);
      placeToggle(threeD);
    }
    b3.addEventListener('click', function () { setMode(true); });
    b2.addEventListener('click', function () { setMode(false); });
    setMode(true);
    window.addEventListener('resize', function () {
      if (!document.body.classList.contains('mode-3d')) placeToggle(false);
    });

    viewer.onLighting(function (name, L) { paintBackdrop(L.bg); });
    paintBackdrop(viewer.lightingPreset().bg);

    /* keep the hero exactly one fold tall on mobile */
    var docRoot = document.documentElement;
    function sizeHero() {
      if (hero.classList.contains('is-immersive')) return;
      docRoot.style.removeProperty('--hero-offset');
      var top = hero.getBoundingClientRect().top + (window.pageYOffset || 0);
      docRoot.style.setProperty('--hero-offset', Math.max(0, Math.round(top)) + 'px');
    }
    window.__belgraveSizeHero = sizeHero;
    sizeHero();
    addEventListener('resize', sizeHero, { passive: true });
    addEventListener('orientationchange', function () { setTimeout(sizeHero, 260); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { setTimeout(sizeHero, 30); });
  };

  /* Auto-mount: looks for #belgrave-3d-hero and reads its data-* attributes.
   * If you'd rather call it yourself, skip adding that id and call
   * window.mountBelgrave3DHero('your-id', {...}) directly instead — both
   * work, this just saves writing the call yourself for the common case. */
  document.addEventListener('DOMContentLoaded', function () {
    var el = document.getElementById('belgrave-3d-hero');
    if (!el || el.dataset.belgraveMounted) return;
    el.dataset.belgraveMounted = '1';
    window.mountBelgrave3DHero('belgrave-3d-hero', {
      modelUrl: el.dataset.modelUrl,
      modelBytes: +el.dataset.modelBytes || 0,
      chairUrl: el.dataset.chairUrl || '',
      chairHref: el.dataset.chairHref || '',
      chairTitle: el.dataset.chairTitle || 'Keaton Cream Chair',
      chairSub: el.dataset.chairSub || '50 x 60 x 82 cm',
      placeholderUrl: el.dataset.placeholderUrl || '',
      gallerySelector: el.dataset.gallerySelector || ''
    });
  });

  /* NOTE on multiple instances: each mount gets its own namespaced hostId
   * (`belgrave-<containerId>-hero`, etc.), so viewer.js's internal
   * getElementById lookups won't collide between two mounts. What WOULD
   * still collide is this embed's own page-global state: window.__belgrave-
   * ViewerRef / __belgraveSizeHero point at whichever instance mounted
   * last, and the .belgrave-toast element is shared. Fine for the normal
   * case (one hero per product page). If you ever need two on the same
   * page — a collection grid with 3D previews, say — those three globals
   * need to move onto the container instead; flag it, it's a small change.
   */
})();
