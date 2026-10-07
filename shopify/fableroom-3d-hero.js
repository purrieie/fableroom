/* =============================================================================
   FableRoom — 3D product hero (Shopify drop-in)
   Reference build: https://purrieie.github.io/fableroom/belgrave/

   Adds an interactive 3D stage beside the theme's existing product gallery,
   with a 3D / Photos toggle that swaps between them. It does NOT replace or
   restyle anything else on the product page.

   Usage (see TICKET.md for the full integration steps):

     <div id="fableroom-3d-hero"
          data-model-url="{{ 'model.glb' | asset_url }}"
          data-model-bytes="912332"
          data-real-size="1.20,0.76,1.20"
          data-gallery-selector=".product__media-wrapper"></div>

     <script src="{{ 'belgrave-hero.bundle.js' | asset_url }}" defer></script>
     <script src="{{ 'fableroom-3d-hero.js'   | asset_url }}" defer></script>

   Every class and id this file creates is prefixed `fr3d-`, and its CSS custom
   properties are scoped to its own elements, so nothing here can collide with
   or leak into the theme's stylesheet.
   ========================================================================== */
(function () {
  'use strict';

  var CSS = [
    /* Tokens live on these two elements rather than :root, so the theme's own
       variables are neither read nor overwritten. Both are needed: the view
       toggle is appended to .fr3d-media, which is the PARENT of .fr3d-root and
       therefore inherits nothing scoped to the root alone. With only the root
       declaring them, the pressed button's background var() resolved to
       nothing while its literal white text still applied — white-on-white. */
    '.fr3d-media,.fr3d-root{--fr3d-ink:#2c2c2c;--fr3d-ink-2:#505050;--fr3d-ink-3:#736c58;',
    '  --fr3d-bronze:#b77e45;--fr3d-line:#ece6da;--fr3d-radius:6px;',
    '  --fr3d-ease:cubic-bezier(.22,1,.28,1);',
    '  --fr3d-safe-b:env(safe-area-inset-bottom,0px);',
    '  --fr3d-font:"HKGrotesk",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
    '  --fr3d-serif:"IvyPrestoDisplay",Georgia,serif;',
    /* vh first, svh second: supporting browsers take svh, so the stage does
       not resize when the mobile toolbar collapses mid-drag. */
    '  --fr3d-stage-h:min(70vh,552px);--fr3d-stage-h:min(70svh,552px)}',

    /* The wrapper this script creates around the theme gallery + the stage.
       Both views live in one positioned box so the toggle can sit in it once
       and stay put across the switch. */
    '.fr3d-media{position:relative}',
    '.fr3d-hidden{display:none!important}',

    '.fr3d-root{display:none;position:relative;font-family:var(--fr3d-font)}',
    '.fr3d-media.fr3d-on .fr3d-root{display:block}',
    '.fr3d-stage{position:relative;width:100%;height:var(--fr3d-stage-h);',
    '  border-radius:var(--fr3d-radius);overflow:hidden;',
    '  background:radial-gradient(112% 74% at 50% 8%,#FDFBF8 0%,#F6F0E8 42%,#EDE4D8 78%,#E7DCCC 100%);',
    '  transition:background .35s linear;touch-action:none;',
    '  -webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}',
    '.fr3d-stage canvas{width:100%;height:100%;display:block;cursor:grab;opacity:0;',
    '  transform:scale(1.015);transition:opacity .7s ease,transform 1.1s var(--fr3d-ease)}',
    '.fr3d-stage.is-ready canvas{opacity:1;transform:scale(1)}',
    '.fr3d-stage.is-unsupported canvas{display:none}',

    '.fr3d-ph{position:absolute;inset:0;display:grid;place-items:center;',
    '  pointer-events:none;transition:opacity .6s ease}',
    '.fr3d-stage.is-ready .fr3d-ph{opacity:0}',
    '.fr3d-ph img{width:min(58%,260px);filter:blur(18px) saturate(.85);opacity:.42}',

    '.fr3d-load{position:absolute;left:50%;bottom:24%;transform:translateX(-50%);',
    '  display:flex;flex-direction:column;align-items:center;gap:9px;',
    '  pointer-events:none;transition:opacity .4s ease}',
    '.fr3d-stage.is-ready .fr3d-load{opacity:0}',
    '.fr3d-track{width:118px;height:2px;background:rgba(44,44,44,.13);border-radius:2px;overflow:hidden}',
    '.fr3d-bar{height:100%;width:6%;background:var(--fr3d-bronze);border-radius:2px;transition:width .35s ease}',
    '.fr3d-status{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--fr3d-ink-3)}',

    /* One light sweep on ready and on re-entering 3D. Pure CSS overlay, so it
       cannot delay or stall the first rendered frame. */
    '.fr3d-sheen{position:absolute;inset:0;pointer-events:none;z-index:4;opacity:0;overflow:hidden}',
    '.fr3d-sheen::after{content:"";position:absolute;top:-60%;bottom:-60%;width:38%;left:-45%;',
    '  background:linear-gradient(100deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.8) 50%,rgba(255,255,255,0) 100%);',
    '  transform:rotate(9deg);filter:blur(6px)}',
    '.fr3d-sheen.run{animation:fr3dFade 1.35s ease-out forwards}',
    '.fr3d-sheen.run::after{animation:fr3dSweep 1.15s var(--fr3d-ease) forwards}',
    '@keyframes fr3dSweep{from{left:-45%}to{left:112%}}',
    '@keyframes fr3dFade{0%,72%{opacity:1}100%{opacity:0}}',

    '.fr3d-hint{position:absolute;left:50%;top:64px;transform:translateX(-50%);z-index:5;',
    '  display:flex;align-items:center;gap:7px;padding:6px 12px;border-radius:100px;',
    '  background:rgba(44,44,44,.74);color:#fff;font-size:11px;white-space:nowrap;',
    '  opacity:0;transition:opacity .5s ease .3s;pointer-events:none}',
    '.fr3d-stage.is-ready .fr3d-hint{opacity:1}',
    '.fr3d-stage.is-touched .fr3d-hint{opacity:0;transition-delay:0s}',
    '.fr3d-hint svg{width:14px;height:14px;stroke:#fff;fill:none;stroke-width:1.7;',
    '  stroke-linecap:round;stroke-linejoin:round}',

    '.fr3d-hd{position:absolute;left:10px;top:10px;z-index:8;display:none;align-items:center;',
    '  gap:6px;min-height:44px;border:1px solid rgba(44,44,44,.10);border-radius:100px;',
    '  padding:7px 13px;cursor:pointer;background:rgba(255,255,255,.90);',
    '  backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);',
    '  font-family:var(--fr3d-font);font-weight:700;font-size:9.5px;line-height:1;',
    '  letter-spacing:.09em;text-transform:uppercase;color:var(--fr3d-ink-3);',
    '  box-shadow:0 2px 9px rgba(44,30,15,.14);transition:color .2s,border-color .2s}',
    '.fr3d-stage.is-ready .fr3d-hd{display:inline-flex}',
    '.fr3d-hd:hover{color:var(--fr3d-ink)}',
    '.fr3d-hd[disabled]{cursor:default;opacity:.78}',
    '.fr3d-hd.done{color:var(--fr3d-bronze);border-color:rgba(183,126,69,.34);cursor:default}',
    '.fr3d-hd svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:1.8;',
    '  stroke-linecap:round;stroke-linejoin:round}',

    '.fr3d-hs{position:absolute;inset:0;pointer-events:none;z-index:5}',
    '.fr3d-hs.is-off{display:none}',
    /* 44px touch box, 26px painted pin. The active state lives on ::before
       because the script writes an inline transform to position each pin, and
       an inline transform beats anything the stylesheet says. */
    '.fr3d-dot{position:absolute;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;',
    '  border:0;background:none;padding:0;cursor:pointer;pointer-events:auto;transition:opacity .3s ease}',
    '.fr3d-dot::before{content:"";position:absolute;left:50%;top:50%;width:26px;height:26px;',
    '  margin:-13px 0 0 -13px;border-radius:50%;border:1.5px solid #fff;',
    '  background:rgba(44,44,44,.42);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);',
    '  box-shadow:0 1px 6px rgba(0,0,0,.22);transition:background .2s,transform .2s var(--fr3d-ease)}',
    '.fr3d-dot::after{content:"";position:absolute;left:50%;top:50%;width:6px;height:6px;',
    '  margin:-3px 0 0 -3px;border-radius:50%;background:#fff}',
    '.fr3d-dot.is-hidden{opacity:0;pointer-events:none}',
    '.fr3d-dot.is-active::before{background:var(--fr3d-bronze);transform:scale(1.14)}',

    '.fr3d-dimlabel{position:absolute;left:0;top:0;padding:3px 7px;border-radius:4px;',
    '  background:rgba(44,44,44,.8);color:#fff;font-size:10.5px;white-space:nowrap;',
    '  opacity:0;transition:opacity .25s ease;pointer-events:none}',
    '.fr3d-dimlabel.on{opacity:1}',

    '.fr3d-card{position:absolute;left:10px;right:10px;bottom:64px;z-index:9;',
    '  background:rgba(255,255,255,.96);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);',
    '  border:1px solid var(--fr3d-line);border-radius:8px;padding:13px 46px 14px 14px;',
    '  box-shadow:0 6px 22px rgba(44,30,15,.15);opacity:0;transform:translateY(8px);',
    '  pointer-events:none;transition:opacity .3s ease,transform .3s var(--fr3d-ease)}',
    '.fr3d-card.on{opacity:1;transform:translateY(0);pointer-events:auto}',
    '.fr3d-card-no{font-size:10px;font-weight:700;letter-spacing:.12em;',
    '  text-transform:uppercase;color:var(--fr3d-bronze)}',
    '.fr3d-card h4{font-family:var(--fr3d-serif);font-size:17px;font-weight:400;margin:3px 0 4px;color:var(--fr3d-ink)}',
    '.fr3d-card p{margin:0;font-size:12.5px;line-height:1.5;color:var(--fr3d-ink-2)}',
    '.fr3d-card-x{position:absolute;right:2px;top:2px;width:44px;height:44px;border:0;',
    '  background:none;cursor:pointer;display:grid;place-items:center;border-radius:50%}',
    '.fr3d-card-x svg{width:14px;height:14px;stroke:var(--fr3d-ink-2);stroke-width:1.7;fill:none;stroke-linecap:round}',

    /* Every round control is a 44px touch box with a 34px disc painted by
       ::before — the visual stays as designed and the tap area still meets
       the 44px minimum. */
    '.fr3d-spin,.fr3d-tool{width:44px;height:44px;border:0;background:none;padding:0;',
    '  cursor:pointer;display:grid;place-items:center;position:relative}',
    '.fr3d-spin{position:absolute;right:5px;bottom:5px;z-index:7}',
    '.fr3d-spin::before,.fr3d-tool::before{content:"";position:absolute;left:50%;top:50%;',
    '  width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;',
    '  background:rgba(255,255,255,.88);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);',
    '  border:1px solid rgba(44,44,44,.09);box-shadow:0 2px 9px rgba(44,30,15,.13)}',
    '.fr3d-spin svg,.fr3d-tool svg{position:relative;z-index:1;stroke:var(--fr3d-ink);fill:none;',
    '  stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}',
    '.fr3d-spin svg{width:14px;height:14px}.fr3d-tool svg{width:15px;height:15px}',
    /* Size overlay owns the right gutter while on: a wide, low product's height
       label lands on the zoom column otherwise. visibility as well as opacity,
       or the hidden buttons stay keyboard-focusable. */
    '.fr3d-stage.is-dims .fr3d-tools{opacity:0;visibility:hidden}',
    '.fr3d-tools{position:absolute;right:5px;top:50%;transform:translateY(-50%);z-index:3;',
    '  display:flex;flex-direction:column;gap:0}',

    '.fr3d-rail{position:absolute;left:10px;top:50%;transform:translateY(-50%);z-index:3;',
    '  display:flex;flex-direction:column;align-items:center;gap:7px;padding:9px 6px;',
    '  border-radius:100px;background:rgba(255,255,255,.86);backdrop-filter:blur(9px);',
    '  -webkit-backdrop-filter:blur(9px);border:1px solid rgba(44,44,44,.08);',
    '  box-shadow:0 2px 9px rgba(44,30,15,.13)}',
    '.fr3d-rail>svg{width:14px;height:14px;stroke:var(--fr3d-ink-3);fill:none;stroke-width:1.5;stroke-linecap:round}',
    '.fr3d-slot{position:relative;height:92px;width:44px}',
    /* The input is a horizontal range rotated 90deg, so its layout box is
       92x44 — wider than the 44px slot. Grid centring cannot be used for
       that: an overflowing grid item falls back to start alignment, which
       parks the slider (92-44)/2 = 24px off-centre. Centring it inside the
       same transform is deterministic. */
    '.fr3d-slot input{position:absolute;left:50%;top:50%;width:92px;height:44px;margin:0;',
    '  transform:translate(-50%,-50%) rotate(90deg);transform-origin:center;',
    '  accent-color:var(--fr3d-bronze)}',
    '.fr3d-hourread{font-size:10px;color:var(--fr3d-ink-3);white-space:nowrap}',

    '.fr3d-panel{position:absolute;left:8px;bottom:8px;z-index:6;',
    '  max-width:calc(100% - 16px - 92px);background:rgba(255,255,255,.90);',
    '  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);',
    '  border:1px solid rgba(44,44,44,.08);border-radius:100px;padding:4px;',
    '  box-shadow:0 2px 10px rgba(44,30,15,.14);padding-bottom:max(4px,var(--fr3d-safe-b))}',
    '.fr3d-acts{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none;touch-action:pan-x}',
    '.fr3d-acts::-webkit-scrollbar{display:none}',
    '.fr3d-act{display:inline-flex;flex-direction:column;align-items:center;gap:2px;',
    '  min-width:54px;min-height:44px;justify-content:center;border:0;background:none;',
    '  cursor:pointer;border-radius:100px;padding:5px 8px;font-family:var(--fr3d-font);',
    '  font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;',
    '  color:var(--fr3d-ink-3);white-space:nowrap;transition:background .2s,color .2s}',
    '.fr3d-act svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.6;',
    '  stroke-linecap:round;stroke-linejoin:round}',
    '.fr3d-act.on{background:var(--fr3d-ink);color:#fff}',

    /* Top-right of the shared box, so it is inside the first fold in BOTH
       views. Bottom-anchoring buries it: the theme's photo gallery is
       thousands of pixels tall on desktop. */
    '.fr3d-toggle{position:absolute;right:10px;top:10px;z-index:9;display:inline-flex;',
    '  background:rgba(255,255,255,.94);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);',
    '  border:1px solid rgba(44,44,44,.12);border-radius:100px;padding:3px;',
    '  box-shadow:0 4px 16px rgba(44,30,15,.18)}',
    '.fr3d-toggle button{display:inline-flex;align-items:center;gap:6px;border:0;background:none;',
    '  cursor:pointer;border-radius:100px;padding:8px 15px;min-height:38px;',
    '  font-family:var(--fr3d-font);font-size:10.5px;font-weight:700;letter-spacing:.08em;',
    '  text-transform:uppercase;color:var(--fr3d-ink-3);transition:background .2s,color .2s;white-space:nowrap}',
    '.fr3d-toggle button[aria-pressed="true"]{background:var(--fr3d-ink);color:#fff}',
    '.fr3d-toggle button svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:1.7;',
    '  stroke-linejoin:round;stroke-linecap:round}',
    '@keyframes fr3dPulse{0%{box-shadow:0 0 0 0 rgba(183,126,69,.5)}',
    '  70%{box-shadow:0 0 0 9px rgba(183,126,69,0)}100%{box-shadow:0 0 0 0 rgba(183,126,69,0)}}',
    '.fr3d-media:not(.fr3d-on) .fr3d-toggle .fr3d-m3{animation:fr3dPulse 2.6s ease-out 3}',

    '.fr3d-stage.is-unsupported .fr3d-tools,.fr3d-stage.is-unsupported .fr3d-rail,',
    '.fr3d-stage.is-unsupported .fr3d-panel,.fr3d-stage.is-unsupported .fr3d-spin,',
    '.fr3d-stage.is-unsupported .fr3d-hint,.fr3d-stage.is-unsupported .fr3d-hd{display:none}',

    '@media(min-width:1000px){',
    /* Cap the stage so the canvas, the toggle and Add to Basket all land in
       the first fold. Uncapped, a 3/4 stage on a 660px column is 880px tall
       and runs past the bottom of a 900px screen. */
    '  .fr3d-root{--fr3d-stage-h:clamp(430px,calc(100svh - 220px),760px)}',
    '  .fr3d-toggle{right:14px;top:14px}.fr3d-hd{left:14px;top:14px}}',

    /* Reduced motion is handled per mechanic, not with one global kill: the
       sweep and the pulse go, the settle becomes instant, and the boot code
       separately never starts auto-rotate. */
    '@media(prefers-reduced-motion:reduce){',
    '  .fr3d-sheen{display:none}',
    '  .fr3d-media:not(.fr3d-on) .fr3d-toggle .fr3d-m3{animation:none}',
    '  .fr3d-stage canvas{transform:none;transition:opacity .7s ease}',
    '  .fr3d-dot,.fr3d-card{transition:none}}'
  ].join('\n');

  var ICON_CUBE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6Z"/><path d="M4 7.6 12 12l8-4.4M12 12v8.8"/></svg>';

  function markup(o, ids) {
    return '' +
    '<div class="fr3d-stage" id="' + ids.stage + '">' +
      '<canvas aria-hidden="true"></canvas>' +
      (o.placeholderUrl ? '<div class="fr3d-ph"><img alt="" src="' + o.placeholderUrl + '" width="600" height="800"></div>' : '') +
      '<div class="fr3d-sheen" aria-hidden="true"></div>' +
      '<div class="fr3d-load"><div class="fr3d-track"><div class="fr3d-bar" id="' + ids.bar + '"></div></div>' +
        '<div class="fr3d-status" id="' + ids.status + '" role="status" aria-live="polite">Loading model</div></div>' +
      '<button class="fr3d-hd" type="button">' + ICON_CUBE + '<span>Load HD</span></button>' +
      '<div class="fr3d-hint"><svg viewBox="0 0 24 24"><path d="M4 12h16"/><path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/></svg>' +
        '<span>Drag to spin &middot; Pinch to zoom</span></div>' +
      '<div class="fr3d-hs fr3d-hotspots"></div>' +
      '<div class="fr3d-hs fr3d-dims"></div>' +
      '<div class="fr3d-card" role="dialog" aria-live="polite">' +
        '<button class="fr3d-card-x" aria-label="Close detail"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
        '<div class="fr3d-card-no"></div><h4></h4><p></p></div>' +
      '<button class="fr3d-spin" aria-pressed="true" aria-label="Pause rotation">' +
        '<svg viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg></button>' +
      '<div class="fr3d-rail">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/></svg>' +
        '<span class="fr3d-slot"><input type="range" min="0" max="100" value="50" aria-label="Time of day"></span>' +
        '<span class="fr3d-hourread">1:30pm</span></div>' +
      '<div class="fr3d-tools">' +
        '<button class="fr3d-tool fr3d-zin" aria-label="Zoom in"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>' +
        '<button class="fr3d-tool fr3d-zout" aria-label="Zoom out"><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>' +
        '<button class="fr3d-tool fr3d-reset" aria-label="Reset view"><svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 2.6-6.4"/><path d="M3 4.5V10h5.5"/></svg></button>' +
      '</div>' +
      '<div class="fr3d-panel"><div class="fr3d-acts">' +
        '<button class="fr3d-act on fr3d-studio" aria-pressed="true"><svg viewBox="0 0 24 24"><path d="M12 4.5a5.5 5.5 0 0 1 3.2 10c-.5.4-.7.9-.7 1.5v.5h-5v-.5c0-.6-.2-1.1-.7-1.5A5.5 5.5 0 0 1 12 4.5Z"/><path d="M10 19h4M10.5 21h3"/></svg><span>Studio</span></button>' +
        '<button class="fr3d-act fr3d-dim"><svg viewBox="0 0 24 24"><path d="M3 8h18M3 8v8M21 8v8M7 11v2M12 11v2M17 11v2"/></svg><span>Size</span></button>' +
        '<button class="fr3d-act on fr3d-details" aria-pressed="true"><svg viewBox="0 0 24 24"><path d="M12 3.5 13.9 9l5.6.2-4.4 3.5 1.6 5.4L12 15l-4.7 3.1 1.6-5.4L4.5 9.2 10.1 9 12 3.5Z"/></svg><span>Hide</span></button>' +
      '</div></div>' +
    '</div>';
  }

  /* Belgrave-specific. A different product needs its own copy AND its own
     positions — `at` is in normalised model space and will not transfer. */
  var DEFAULT_HOTSPOTS = [
    { id:'top',   at:[0.17,0.663,0.10], normal:[0,1,0],    bias:0.18, no:'Detail 01', title:'The Mango Wood Top',
      body:'A single slab of solid mango wood, hand-sanded flat and finished in American walnut.',
      view:{theta:0.45,phi:42,dist:0.72,ty:0.60} },
    { id:'edge',  at:[0.0,0.640,0.495], normal:[0,0.25,1], bias:0.22, no:'Detail 02', title:'The Softened Edge',
      body:'The rim is eased rather than cut square, catching light all the way round.',
      view:{theta:0.1,phi:78,dist:0.55,ty:0.60} },
    { id:'flute', at:[0.0,0.500,0.315], normal:[0,0.15,1], bias:0.25, no:'Detail 03', title:'The Fluted Tiers',
      body:'Three stacked tiers, cut with vertical flutes and stepped outward as they rise.',
      view:{theta:0.35,phi:82,dist:0.44,ty:0.46} },
    { id:'mid',   at:[0.0,0.330,0.335], normal:[0,0.1,1],  bias:0.25, no:'Detail 04', title:'The Pedestal Form',
      body:'One central column instead of four legs, so chairs tuck in anywhere.',
      view:{theta:0.9,phi:80,dist:0.62,ty:0.36} },
    { id:'foot',  at:[0.0,0.055,0.275], normal:[0,0.1,1],  bias:0.25, no:'Detail 05', title:'The Footing',
      body:'The base flares widest at the floor, which is what stops it rocking.',
      view:{theta:0.2,phi:88,dist:0.58,ty:0.16} }
  ];

  var AMBIENCE = [
    ['#EDF1F7','#E4EBF4','#D6E0EC','#C9D5E4'], ['#FDFAF4','#F7EFE1','#EDE0CB','#E2D2B8'],
    ['#FDFBF8','#F6F0E8','#EDE4D8','#E7DCCC'], ['#FEF7EC','#FAE7CC','#F0D2A8','#E3BE8B'],
    ['#E6ECF6','#D2DDEE','#B2C2DC','#94A8C8']
  ];
  function mixHex(a, b, t) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    var r = Math.round((pa >> 16) + ((pb >> 16) - (pa >> 16)) * t),
        g = Math.round(((pa >> 8) & 255) + ((((pb >> 8) & 255)) - ((pa >> 8) & 255)) * t),
        bl = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }
  function ambienceStops(v) {
    var f = v * (AMBIENCE.length - 1), i = Math.min(AMBIENCE.length - 2, Math.floor(f)), t = f - i;
    return AMBIENCE[i].map(function (c, k) { return mixHex(c, AMBIENCE[i + 1][k], t); });
  }

  var seq = 0;

  function mount(opts) {
    var o = opts || {};
    var host = typeof o.mount === 'string' ? document.querySelector(o.mount) : o.mount;
    if (!host) { console.warn('[fr3d] mount element not found'); return null; }
    if (host.__fr3dMounted) return host.__fr3dViewer || null;
    host.__fr3dMounted = true;

    if (!document.getElementById('fr3d-style')) {
      var st = document.createElement('style');
      st.id = 'fr3d-style'; st.textContent = CSS;
      document.head.appendChild(st);
    }

    var n = ++seq;
    var ids = { stage: 'fr3d-stage-' + n, bar: 'fr3d-bar-' + n, status: 'fr3d-status-' + n };

    host.classList.add('fr3d-root');
    host.innerHTML = markup(o, ids);

    /* Wrap the theme's gallery and this stage in one positioned box so the
       toggle sits over whichever view is showing, without being moved. */
    var gallery = o.gallerySelector ? document.querySelector(o.gallerySelector) : null;
    var media = document.createElement('div');
    media.className = 'fr3d-media';
    var anchor = gallery || host;
    anchor.parentNode.insertBefore(media, anchor);
    if (gallery) media.appendChild(gallery);
    media.appendChild(host);

    var toggle = document.createElement('div');
    toggle.className = 'fr3d-toggle';
    toggle.setAttribute('role', 'group');
    toggle.setAttribute('aria-label', 'View mode');
    toggle.innerHTML =
      '<button class="fr3d-m3" aria-pressed="true">' + ICON_CUBE + '3D</button>' +
      '<button class="fr3d-m2" aria-pressed="false">Photos</button>';
    media.appendChild(toggle);

    var stage = document.getElementById(ids.stage);
    var canvas = stage.querySelector('canvas');
    var q = function (s) { return host.querySelector(s); };
    var b3 = toggle.querySelector('.fr3d-m3'), b2 = toggle.querySelector('.fr3d-m2');

    function toPhotos() {
      media.classList.remove('fr3d-on');
      if (gallery) gallery.classList.remove('fr3d-hidden');
      b3.setAttribute('aria-pressed', 'false');
      b2.setAttribute('aria-pressed', 'true');
    }

    var ok = (function () {
      try { var c = document.createElement('canvas');
        return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
      } catch (e) { return false; }
    })();
    if (!ok || typeof window.__initBelgraveViewer !== 'function') {
      console.warn('[fr3d] WebGL or the engine bundle is unavailable; staying on photos.');
      stage.classList.add('is-unsupported');
      b3.disabled = true; toPhotos();
      return null;
    }

    var viewer = window.__initBelgraveViewer({
      hostId: ids.stage, statusId: ids.status, barId: ids.bar,
      modelUrl: o.modelUrl, modelBytes: o.modelBytes || 0,
      realSize: o.realSize || [1.20, 0.76, 1.20],
      framePad: o.framePad || 1
    });
    if (!viewer) { stage.classList.add('is-unsupported'); b3.disabled = true; toPhotos(); return null; }
    host.__fr3dViewer = viewer;

    var REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    viewer.onFirstInput(function () { stage.classList.add('is-touched'); });
    if (REDUCED) { viewer.controls.autoRotate = false; stage.classList.add('is-touched'); }

    q('.fr3d-zin').addEventListener('click', function () { viewer.zoomIn(); stage.classList.add('is-touched'); });
    q('.fr3d-zout').addEventListener('click', function () { viewer.zoomOut(); stage.classList.add('is-touched'); });
    q('.fr3d-reset').addEventListener('click', function () { viewer.reset(); });

    /* iOS Safari drops the WebGL context under memory pressure; without
       preventDefault() it never comes back and the stage stays blank. */
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); }, false);
    document.addEventListener('visibilitychange', function () {
      viewer.setPaused(document.hidden || !media.classList.contains('fr3d-on'));
    });

    function paint(stops) {
      stage.style.background = 'radial-gradient(112% 74% at 50% 8%,' + stops[0] + ' 0%,' +
        stops[1] + ' 42%,' + stops[2] + ' 78%,' + stops[3] + ' 100%)';
    }
    viewer.onAmbience(function (v) { paint(ambienceStops(v)); });
    viewer.onLighting(function (name, L) { paint(L.bg); });
    paint(viewer.lightingPreset().bg);

    var tod = q('.fr3d-slot input'), todRead = q('.fr3d-hourread'), studioBtn = q('.fr3d-studio');
    function hourLabel(v) {
      var h = 6 + v * 15, hh = Math.floor(h), mm = Math.round((h - hh) * 4) * 15;
      if (mm === 60) { hh += 1; mm = 0; }
      var ap = hh >= 12 ? 'pm' : 'am', d = hh % 12; if (d === 0) d = 12;
      return d + (mm ? ':' + (mm < 10 ? '0' : '') + mm : '') + ap;
    }
    function setHour(v, fromStudio) {
      viewer.setTimeOfDay(v); todRead.textContent = hourLabel(v);
      var neutral = Math.abs(v - 0.5) < 0.02;
      studioBtn.classList.toggle('on', neutral);
      studioBtn.setAttribute('aria-pressed', String(neutral));
      if (!fromStudio) tod.value = Math.round(v * 100);
    }
    tod.addEventListener('input', function () { setHour(+tod.value / 100); });
    studioBtn.addEventListener('click', function () { setHour(0.5, false); });

    var spinBtn = q('.fr3d-spin'), spinIcon = spinBtn.querySelector('svg');
    var PAUSE = '<path d="M9 6v12M15 6v12"/>', PLAY = '<path d="M8 5.5 19 12 8 18.5V5.5Z"/>';
    function setSpin(on) {
      viewer.setAutoRotate(on);
      spinBtn.setAttribute('aria-pressed', String(on));
      spinIcon.innerHTML = on ? PAUSE : PLAY;
      spinBtn.setAttribute('aria-label', on ? 'Pause rotation' : 'Resume rotation');
    }
    spinBtn.addEventListener('click', function () { setSpin(!viewer.autoRotate()); });
    if (REDUCED) setSpin(false);

    var HOT = o.hotspots || DEFAULT_HOTSPOTS;
    var hsLayer = q('.fr3d-hotspots'), card = q('.fr3d-card'), dots = {}, activeId = null, detailsOn = true;
    viewer.setHotspots(HOT.map(function (h) { return { id: h.id, at: h.at, normal: h.normal, bias: h.bias }; }));
    HOT.forEach(function (h) {
      var b = document.createElement('button');
      b.className = 'fr3d-dot is-hidden';
      b.setAttribute('aria-label', h.title);
      b.addEventListener('click', function (e) { e.stopPropagation(); openCard(h.id); });
      hsLayer.appendChild(b); dots[h.id] = b;
    });
    function openCard(id) {
      var h = HOT.filter(function (x) { return x.id === id; })[0]; if (!h) return;
      if (activeId === id) { closeCard(); return; }
      activeId = id;
      card.querySelector('.fr3d-card-no').textContent = h.no;
      card.querySelector('h4').textContent = h.title;
      card.querySelector('p').textContent = h.body;
      card.classList.add('on');
      Object.keys(dots).forEach(function (k) { dots[k].classList.toggle('is-active', k === id); });
      setSpin(false); viewer.flyTo(h.view, REDUCED ? 10 : 900);
    }
    function closeCard() {
      activeId = null; card.classList.remove('on');
      Object.keys(dots).forEach(function (k) { dots[k].classList.remove('is-active'); });
    }
    card.querySelector('.fr3d-card-x').addEventListener('click', function () {
      closeCard();
      // Only the explicit X pulls the camera back out. closeCard() also runs
      // when Details is switched off and when leaving 3D, and neither of
      // those should move the camera.
      viewer.home();
    });
    var detailsBtn = q('.fr3d-details'), detailsLabel = detailsBtn.querySelector('span');
    detailsBtn.addEventListener('click', function () {
      detailsOn = !detailsOn;
      hsLayer.classList.toggle('is-off', !detailsOn);
      detailsBtn.classList.toggle('on', detailsOn);
      detailsBtn.setAttribute('aria-pressed', String(detailsOn));
      detailsLabel.textContent = detailsOn ? 'Hide' : 'Details';
      if (!detailsOn) closeCard();
    });

    var dimLayer = q('.fr3d-dims'), dimEls = {};
    ['dim-w', 'dim-h'].forEach(function (id) {
      var el = document.createElement('div'); el.className = 'fr3d-dimlabel';
      dimLayer.appendChild(el); dimEls[id] = el;
    });
    var dimBtn = q('.fr3d-dim');
    dimBtn.addEventListener('click', function () {
      var on = !viewer.dimensionsOn();
      viewer.setDimensions(on); dimBtn.classList.toggle('on', on);
      stage.classList.toggle('is-dims', on);   // frees the right gutter for the height label
      if (!on) Object.keys(dimEls).forEach(function (k) { dimEls[k].classList.remove('on'); });
    });

    viewer.onFrame(function () {
      var labels = viewer.dimensionLabels();
      for (var k = 0; k < labels.length; k++) {
        var dl = dimEls[labels[k].id]; if (!dl) continue;
        if (dl.textContent !== labels[k].text) { dl.textContent = labels[k].text; dl._w = 0; }
        if (!dl._w) dl._w = dl.offsetWidth || 40;
        var half = dl._w / 2 + 3, lim = stage.clientWidth - half;
        var lx = labels[k].x < half ? half : (labels[k].x > lim ? lim : labels[k].x);
        dl.style.transform = 'translate(' + lx + 'px,' + labels[k].y + 'px) translate(-50%,-50%)';
        dl.classList.toggle('on', labels[k].visible);
      }
      if (!detailsOn) return;
      var pts = viewer.hotspotPositions();
      for (var i = 0; i < pts.length; i++) {
        var d = dots[pts[i].id]; if (!d) continue;
        d.style.transform = 'translate(' + pts[i].x + 'px,' + pts[i].y + 'px)';
        d.classList.toggle('is-hidden', !pts[i].visible);
      }
    });

    /* Re-triggered by removing the class, forcing a reflow, then re-adding
       it — without the reflow the browser coalesces both mutations and the
       animation never restarts on a second run. */
    var sheenEl = q('.fr3d-sheen');
    function sheen() {
      if (!sheenEl || REDUCED) return;
      sheenEl.classList.remove('run'); void sheenEl.offsetWidth; sheenEl.classList.add('run');
    }
    var wait = setInterval(function () {
      if (!stage.classList.contains('is-ready')) return;
      clearInterval(wait); sheen();
    }, 200);

    /* The heavier file is fetched only on click, so default page weight is
       unchanged and the button doubles as a real read on download speed. */
    var hdBtn = q('.fr3d-hd'), hdLabel = hdBtn.querySelector('span');
    var hdUrl = o.hdUrl || o.modelUrl, hdBytes = o.hdBytes || o.modelBytes || 0, hdDone = false;
    // No data-hd-url means there is nothing better to load: drop the button
    // rather than ship one that silently re-downloads the same model.
    if (!o.hdUrl) hdBtn.parentNode.removeChild(hdBtn);
    hdBtn.addEventListener('click', function () {
      if (hdDone || hdBtn.disabled) return;
      hdBtn.disabled = true; hdLabel.textContent = 'Loading 0%';
      viewer.upgradeModel(hdUrl, hdBytes, function (frac) {
        hdLabel.textContent = 'Loading ' + Math.round(frac * 100) + '%';
      }).then(function (r) {
        hdDone = true; hdBtn.classList.add('done');
        hdLabel.textContent = 'HD · ' + (hdBytes / 1048576).toFixed(1) +
          ' MB in ' + (r.ms / 1000).toFixed(1) + 's';
        sheen();
      }).catch(function (err) {
        console.warn('[fr3d] HD upgrade failed', err);
        hdBtn.disabled = false; hdLabel.textContent = 'Load HD';
      });
    });

    function setMode(threeD) {
      media.classList.toggle('fr3d-on', threeD);
      if (gallery) gallery.classList.toggle('fr3d-hidden', threeD);
      b3.setAttribute('aria-pressed', String(threeD));
      b2.setAttribute('aria-pressed', String(!threeD));
      viewer.setPaused(!threeD);
      if (!threeD) closeCard();
      else if (stage.classList.contains('is-ready')) sheen();
    }
    b3.addEventListener('click', function () { setMode(true); });
    b2.addEventListener('click', function () { setMode(false); });
    setMode(o.default2d ? false : true);

    return viewer;
  }

  window.mountFableroom3DHero = mount;

  function auto() {
    var el = document.getElementById('fableroom-3d-hero');
    if (!el) return;
    var rs = (el.getAttribute('data-real-size') || '').split(',').map(parseFloat);
    mount({
      mount: el,
      modelUrl: el.getAttribute('data-model-url'),
      modelBytes: +(el.getAttribute('data-model-bytes') || 0),
      hdUrl: el.getAttribute('data-hd-url') || null,
      hdBytes: +(el.getAttribute('data-hd-bytes') || 0),
      realSize: (rs.length >= 2 && rs.every(function (x) { return !isNaN(x); })) ? rs : null,
      framePad: parseFloat(el.getAttribute('data-frame-pad')) || null,
      placeholderUrl: el.getAttribute('data-placeholder-url') || null,
      gallerySelector: el.getAttribute('data-gallery-selector') || null,
      default2d: el.getAttribute('data-default') === 'photos'
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto);
  else auto();
})();
