/* FableRoom "See it in your room" — rug visualiser, size finder, buying checks.
 *
 * Nothing in this file runs on page load. The snippet's inline loader injects it
 * only when a shopper shows intent (pointer/touch/focus on an entry button), and
 * every image it uses is fetched only after the overlay opens.
 *
 * The rug is drawn with a real camera model, not a free-form warp: a photo is a
 * pinhole camera at height h, tilted down by `pitch`, so the floor plane — and the
 * rug's true size on it — is fixed by (focal length, horizon line, camera height).
 * Sample rooms ship with those three numbers; for a shopper's own photo they come
 * from EXIF (focal length) and two sliders (floor angle, phone height), with a
 * tape measure to check the result against something of known length.
 *
 * Every class and id it creates is prefixed frrv-.
 */
(function () {
  'use strict';
  var W = window, D = document;
  if (W.FRRV && W.FRRV.ready) return;
  var CFG = W.FRRV_CONFIG || {};
  var pending = (W.FRRV && W.FRRV.q) || [];

  /* ------------------------------------------------------------------ config */
  var PRODUCT = CFG.product || {};
  var VARIANTS = (PRODUCT.variants || []).map(function (v) {
    var m = /(\d+)\s*[x×]\s*(\d+)/.exec(v.title || '');
    return { id: v.id, title: v.title, w: m ? +m[1] : 140, l: m ? +m[2] : 200, price: v.price,
             compare: v.compare_at_price || 0, available: v.available !== false,
             badge: v.badge || (CFG.badges && CFG.badges[v.title]) || '' };
  });
  var SPEC = Object.assign({
    name: 'Laleh Rug',
    thicknessMm: 12,         // total, pile + backing — estimate, see README
    pileBand: 'Medium pile (0.6–1.2 cm)',
    pileType: 'loop',
    edgeRGB: [194, 181, 164] // sampled from the rug's border (make_assets.js)
  }, CFG.spec || {});
  function asset(name) { return (CFG.assets && CFG.assets[name]) || ((CFG.assetBase || '') + name); }

  /* Sample rooms. f = focal length as a fraction of image width, hz = horizon as a
     fraction of image height, h = camera height in metres. place = where the rug's
     centre starts, as image fractions; yaw = the room's axis in degrees. occl = image-
     space polygons (fractions) of furniture that stands in front of the rug. */
  var SCENES = CFG.scenes || [
    { id: 'living', label: 'Living room', img: 'room-living.webp', thumb: 'room-living-thumb.webp',
      f: 0.78, hz: 0.5, h: 0.72, place: [0.56, 0.75], yaw: 58, focus: [0.56, 0.7], size: 2, ref: [2000, 1333],
      occl: [
        [[798, 640], [1560, 595], [1610, 690], [1612, 900], [1405, 918], [1405, 937], [1388, 937], [1380, 912], [1070, 862], [800, 854]],  // sofa
        [[418, 560], [650, 560], [772, 700], [772, 855], [750, 892], [733, 892], [733, 862], [614, 872], [614, 922], [596, 922], [596, 880], [507, 860], [505, 897], [488, 897], [474, 842], [420, 700]], // armchair
        [[12, 888], [212, 884], [207, 968], [222, 996], [182, 1014], [38, 1017], [26, 1000], [28, 958]]  // plant pot
      ] },
    { id: 'lounge', label: 'Lounge', img: 'room-lounge.webp', thumb: 'room-lounge-thumb.webp',
      f: 0.92, hz: 0.5, h: 1.08, place: [0.4425, 0.92], yaw: 90, focus: [0.45, 0.8], size: 2, ref: [2000, 1333],
      occl: [
        [[440, 760], [1350, 760], [1350, 1067], [440, 1069]],                       // sofa body
        [[466, 1060], [497, 1060], [494, 1144], [470, 1144]],                       // legs
        [[891, 1060], [915, 1060], [913, 1120], [893, 1120]],
        [[1301, 1060], [1329, 1060], [1326, 1138], [1304, 1138]],
        [[538, 1060], [558, 1060], [557, 1083], [540, 1083]],
        [[1263, 1060], [1282, 1060], [1281, 1079], [1265, 1079]],
        [[320, 975], [345, 961], [432, 961], [466, 976], [468, 1090], [440, 1104], [350, 1104], [322, 1090]], // pouf
        [[1338, 896], [1477, 896], [1477, 1080], [1456, 1095], [1360, 1095], [1338, 1080]]   // side table
      ] },
    { id: 'bedroom', label: 'Bedroom', img: 'room-bedroom.webp', thumb: 'room-bedroom-thumb.webp',
      f: 0.68, hz: 0.495, h: 1.1, place: [0.513, 0.857], yaw: 90, focus: [0.5, 0.8], size: 2, ref: [2000, 1333],
      occl: [
        [[457, 1177], [593, 1177], [593, 1191], [1430, 1191], [1430, 1177], [1596, 1177], [1596, 1082], [1480, 955], [1250, 940], [1250, 790], [700, 790], [700, 940], [580, 955], [457, 1082]], // bed
        [[215, 830], [470, 830], [478, 935], [215, 940]],                           // chair seat
        [[262, 925], [278, 925], [233, 1066], [218, 1066]],                         // chair legs
        [[372, 928], [386, 928], [431, 1064], [417, 1064]],
        [[296, 925], [309, 925], [311, 1027], [299, 1027]],
        [[405, 920], [418, 920], [492, 1030], [480, 1030]]
      ] }
  ];

  /* --------------------------------------------------------------- analytics */
  var sentOnce = {}, sentCount = 0;
  function track(evt, action, item, source, ms, once) {
    if (CFG.analytics === 'none') return;
    if (once) { if (sentOnce[action]) return; sentOnce[action] = 1; }
    if (++sentCount > 60) return;
    try {
      (W.dataLayer = W.dataLayer || []).push({ event: evt, frrv_action: action, frrv_item: item == null ? null : String(item),
        frrv_source: source || null, frrv_sku: CFG.sku || null, frrv_ms: ms == null ? null : Math.round(ms) });
    } catch (e) {}
  }
  var T0 = (W.performance && performance.now()) || 0;

  /* ----------------------------------------------------------------- helpers */
  function $(sel, root) { return (root || D).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || D).querySelectorAll(sel)); }
  function h(tag, attrs, html) {
    var e = D.createElement(tag);
    for (var k in attrs || {}) { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (html != null) e.innerHTML = html;
    return e;
  }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function money(p) { return '£' + (p % 100 ? (p / 100).toFixed(2) : String(p / 100)); }
  function ftin(cm) {
    var inch = Math.round(cm / 2.54), ft = Math.floor(inch / 12), i = inch - ft * 12;
    return ft + '′' + i + '″';
  }
  function len(cm) { return S.unit === 'ft' ? ftin(cm) : Math.round(cm) + ' cm'; }
  function sizeLabel(v) {
    return S.unit === 'ft' ? ftin(v.w) + ' × ' + ftin(v.l) : v.w + ' × ' + v.l + ' cm';
  }
  function now() { return (W.performance && performance.now()) || Date.now(); }
  function loadImg(url) {
    return new Promise(function (res, rej) {
      var im = new Image(); im.crossOrigin = 'anonymous'; im.decoding = 'async';
      im.onload = function () { res(im); }; im.onerror = function () { rej(new Error('img ' + url)); };
      im.src = url;
    });
  }

  /* ------------------------------------------------------------------- state */
  var S = {
    open: false, tab: 'room', unit: 'cm', vi: Math.max(0, VARIANTS.length - 1),
    scene: null, cam: null, img: null, rug: { x: 0, z: -3, yaw: 0 }, anim: null,
    dims: true, tape: false, compare: false, adjust: false, finder: { room: 'living' },
    own: null // { img, cam } for the shopper's own photo
  };

  /* --------------------------------------------------------------------- CSS */
  var CSS = [
    '.frrv{position:fixed;inset:0;z-index:2147483000;display:none;font-family:"HKGrotesk-Regular",var(--body-font-family,system-ui),system-ui,sans-serif;color:#2c2c2c;-webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent}',
    '.frrv.is-open{display:block}',
    '.frrv *{box-sizing:border-box}',
    '.frrv button::before,.frrv button::after{content:none !important;display:none !important}',
    '.frrv button{font:inherit;color:inherit;background:none;border:0;padding:0;margin:0;cursor:pointer;letter-spacing:normal;text-transform:none;min-height:0;box-shadow:none}',
    '.frrv button:focus-visible,.frrv input:focus-visible,.frrv select:focus-visible{outline:2px solid #B77E45;outline-offset:2px}',
    '.frrv-scrim{position:absolute;inset:0;background:rgba(30,20,14,.55);opacity:0;transition:opacity .25s}',
    '.frrv.is-in .frrv-scrim{opacity:1}',
    '.frrv-box{position:absolute;inset:0;background:#fff;display:flex;flex-direction:column;transform:translateY(12px);opacity:0;transition:transform .28s cubic-bezier(.2,.8,.2,1),opacity .2s}',
    '.frrv.is-in .frrv-box{transform:none;opacity:1}',
    '.frrv-hd{flex:none;display:flex;align-items:center;gap:8px;height:52px;padding:0 8px 0 4px;border-bottom:1px solid #EFE9E1}',
    '.frrv-x{width:44px;height:44px;display:grid;place-items:center;border-radius:50%}',
    '.frrv-x svg{width:20px;height:20px}',
    '.frrv-ttl{flex:1;min-width:0;line-height:1.15}',
    '.frrv-ttl b{display:block;font-family:"IvyPrestoDisplay-Regular",Georgia,serif;font-weight:400;font-size:19px;color:#433122;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.frrv-ttl span{font-size:12px;color:#7a6a5c}',
    '.frrv-units{display:flex;border:1px solid #B77E45;border-radius:99px;padding:2px}',
    '.frrv-units button{font-size:12px;padding:4px 10px;border-radius:99px;color:#B77E45;min-width:36px}',
    '.frrv-units button.on{background:#B77E45;color:#fff}',
    '.frrv-tabs{flex:none;display:flex;gap:4px;padding:6px 10px;border-bottom:1px solid #EFE9E1;overflow-x:auto;scrollbar-width:none}',
    '.frrv-tabs::-webkit-scrollbar{display:none}',
    '.frrv-tabs button{flex:1;white-space:nowrap;font-size:13.5px;padding:8px 10px;border-radius:99px;color:#5b4a3c}',
    '.frrv-tabs button.on{background:#F4EDE3;color:#2c2c2c;font-family:"HKGrotesk-Bold","HKGrotesk-Regular",sans-serif;font-weight:600}',
    '.frrv-body{flex:1;min-height:0;display:flex;flex-direction:column}',
    '.frrv-stagewrap{flex:1;min-height:0;position:relative;background:#EDE7DF}',
    '.frrv[data-tab=size] .frrv-stagewrap,.frrv[data-tab=know] .frrv-stagewrap{display:none}',
    '.frrv-stage{position:absolute;inset:0;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab}',
    '.frrv-stage.is-drag{cursor:grabbing}',
    '.frrv-stage canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block}',
    '.frrv-load{position:absolute;inset:0;display:grid;place-items:center;background:rgba(237,231,223,.6);transition:opacity .3s;pointer-events:none}',
    '.frrv-load i{width:28px;height:28px;border-radius:50%;border:2.5px solid rgba(67,49,34,.18);border-top-color:#433122;animation:frrv-spin .8s linear infinite}',
    '.frrv-stage.is-ready .frrv-load{opacity:0}',
    '@keyframes frrv-spin{to{transform:rotate(360deg)}}',
    '.frrv-tools{position:absolute;right:10px;top:10px;display:flex;flex-direction:column;gap:7px;z-index:3}',
    '.frrv-tool{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.86);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:0 1px 4px rgba(0,0,0,.16);color:#2c2c2c;position:relative}',
    '.frrv-tool svg{width:20px;height:20px}',
    '.frrv-tool.on{background:#433122;color:#fff}',
    '.frrv-tool[hidden]{display:none}',
    '.frrv-tool .frrv-tip{position:absolute;right:50px;top:50%;transform:translateY(-50%);background:#2c2c2c;color:#fff;font-size:12px;padding:4px 8px;border-radius:6px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .15s}',
    '@media (hover:hover){.frrv-tool:hover .frrv-tip{opacity:1}}',
    '.frrv-hint{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);background:rgba(44,44,44,.78);color:#fff;font-size:12.5px;padding:7px 12px;border-radius:99px;white-space:nowrap;pointer-events:none;transition:opacity .4s;z-index:2}',
    '.frrv-hint.is-gone{opacity:0}',
    '.frrv-chip{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:flex-start;padding:7px 10px;border-radius:10px;background:#fff;border:1.5px solid #E6DED2;line-height:1.2;text-align:left;position:relative}',
    '.frrv-chip b{font-family:"HKGrotesk-Bold","HKGrotesk-Regular",sans-serif;font-weight:600;font-size:13px;white-space:nowrap}',
    '.frrv-chip small{font-size:11.5px;color:#6b5b4d;white-space:nowrap}',
    '.frrv-chip.on{border-color:#B77E45;background:#FBF6EF}',
    '.frrv-chip.is-out small{color:#9b3b2a}',
    '.frrv-rotor{position:absolute;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.25);display:grid;place-items:center;z-index:2;touch-action:none;cursor:grab;color:#433122}',
    '.frrv-rotor svg{width:20px;height:20px}',
    '.frrv-rotor[hidden],.frrv-pin[hidden]{display:none}',
    '.frrv-pin{position:absolute;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;background:rgba(183,126,69,.25);border:2px solid #fff;box-shadow:0 0 0 1.5px #B77E45,0 2px 6px rgba(0,0,0,.25);z-index:2;touch-action:none;cursor:move}',
    '.frrv-pin::after{content:"";position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#B77E45}',
    '.frrv-adjust{position:absolute;left:10px;right:62px;top:10px;background:rgba(255,255,255,.94);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-radius:14px;padding:12px 14px;box-shadow:0 2px 12px rgba(0,0,0,.18);z-index:4;font-size:13px;max-width:380px}',
    '.frrv-adjust[hidden]{display:none}',
    '.frrv-adjust h4{margin:0 0 2px;font-size:14.5px;font-family:"HKGrotesk-Bold","HKGrotesk-Regular",sans-serif;font-weight:600;color:#2c2c2c;letter-spacing:0;text-transform:none}',
    '.frrv-adjust p{margin:0 0 10px;color:#5b4a3c;line-height:1.35;font-size:12.5px}',
    '.frrv-adjust label{display:block;font-size:12px;color:#5b4a3c;margin:8px 0 2px}',
    '.frrv-adjust input[type=range]{width:100%;accent-color:#B77E45;margin:0;height:28px}',
    '.frrv-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}',
    '.frrv-seg{display:inline-flex;background:#F4EDE3;border-radius:99px;padding:3px;gap:2px;flex-wrap:wrap}',
    '.frrv-seg button{font-size:12.5px;padding:6px 11px;border-radius:99px;color:#5b4a3c;white-space:nowrap}',
    '.frrv-seg button.on{background:#fff;color:#2c2c2c;box-shadow:0 1px 3px rgba(0,0,0,.12)}',
    '.frrv-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:48px;padding:0 18px;border-radius:6px;background:#B77E45 !important;color:#fff !important;font-family:"HKGrotesk-Bold","HKGrotesk-Regular",sans-serif !important;font-weight:600;font-size:15px;letter-spacing:.06em !important;width:100%}',
    '.frrv-btn:hover{background:#9c6a37 !important}',
    '.frrv-btn[disabled]{background:#cbbfb2 !important;cursor:not-allowed}',
    '.frrv-btn--ghost{background:#fff !important;color:#433122 !important;border:1.5px solid #433122 !important;letter-spacing:.02em !important}',
    '.frrv-btn--ghost:hover{background:#F4EDE3 !important}',
    '.frrv-btn--sm{height:38px;font-size:13.5px;width:auto;padding:0 14px}',
    '.frrv-side{flex:none;background:#fff;display:flex;flex-direction:column;min-height:0}',
    '.frrv[data-tab=size] .frrv-side,.frrv[data-tab=know] .frrv-side{flex:1}',
    '.frrv-pane{display:none;min-height:0}',
    '.frrv[data-tab=room] .frrv-pane[data-p=room],.frrv[data-tab=size] .frrv-pane[data-p=size],.frrv[data-tab=know] .frrv-pane[data-p=know]{display:block}',
    '.frrv-pane[data-p=size],.frrv-pane[data-p=know]{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:16px 16px 28px}',
    '.frrv-pane[data-p=room]{padding:12px 12px calc(10px + env(safe-area-inset-bottom))}',
    '.frrv-rooms{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:2px 0 8px}',
    '.frrv-rooms::-webkit-scrollbar{display:none}',
    '.frrv-room{flex:none;width:66px;text-align:center;font-size:11.5px;color:#5b4a3c;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.frrv-room i{display:block;width:66px;height:42px;border-radius:8px;background:#F4EDE3 center/cover no-repeat;margin-bottom:4px;border:2px solid transparent;position:relative}',
    '.frrv-room.on i{border-color:#B77E45}',
    '.frrv-room.on{color:#2c2c2c}',
    '.frrv-room--own i{display:grid;place-items:center;color:#B77E45;background-color:#FBF6EF;border:1.5px dashed #D9C3A6}',
    '.frrv-room--own.on i{border:2px solid #B77E45}',
    '.frrv-room--own i svg{width:22px;height:22px}',
    '.frrv-cta{display:flex;gap:10px;align-items:center}',
    '.frrv-cta .frrv-btn{flex:1}',
    '.frrv-price{flex:none;line-height:1.15}',
    '.frrv-price b{display:block;font-size:20px;color:#C8861E;font-family:"HKGrotesk-Bold","HKGrotesk-Regular",sans-serif;font-weight:600}',
    '.frrv-price s{font-size:12.5px;color:#8a7a6c}',
    '.frrv-note{font-size:12px;color:#6b5b4d;margin:8px 0 0;line-height:1.35}',
    '.frrv-sheet{position:absolute;inset:0;z-index:6;display:none;align-items:flex-end;justify-content:center;background:rgba(30,20,14,.45)}',
    '.frrv-sheet.is-open{display:flex}',
    '.frrv-sheet>div{background:#fff;width:100%;max-width:440px;border-radius:16px 16px 0 0;padding:20px 18px calc(18px + env(safe-area-inset-bottom));box-shadow:0 -4px 24px rgba(0,0,0,.2)}',
    '.frrv-sheet h3{margin:0 0 6px;font-family:"IvyPrestoDisplay-Regular",Georgia,serif;font-weight:400;font-size:22px;color:#433122;letter-spacing:0;text-transform:none}',
    '.frrv-sheet ol{margin:8px 0 14px;padding-left:20px;font-size:13.5px;line-height:1.45;color:#3d3d3d}',
    '.frrv-sheet .frrv-row{gap:8px}',
    '.frrv-sheet .frrv-btn{flex:1}',
    '.frrv-priv{display:flex;gap:8px;align-items:flex-start;font-size:12px;color:#5b4a3c;margin-top:12px;line-height:1.35}',
    '.frrv-priv svg{flex:none;width:16px;height:16px;margin-top:1px;color:#5f7d5a}',
    '.frrv-toast{position:absolute;left:50%;bottom:18px;transform:translate(-50%,20px);background:#2c2c2c;color:#fff;padding:10px 16px;border-radius:10px;font-size:13.5px;opacity:0;transition:all .25s;z-index:9;pointer-events:none;max-width:calc(100% - 32px);text-align:center}',
    '.frrv-toast.is-on{opacity:1;transform:translate(-50%,0)}',
    /* finder + facts */
    '.frrv h3.frrv-h{margin:0 0 4px;font-family:"IvyPrestoDisplay-Regular",Georgia,serif;font-weight:400;font-size:24px;color:#433122;letter-spacing:0;text-transform:none;line-height:1.15}',
    '.frrv p.frrv-sub{margin:0 0 14px;font-size:13.5px;color:#5b4a3c;line-height:1.4}',
    '.frrv-q{margin:14px 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#7a6a5c}',
    '.frrv-in{display:flex;align-items:center;gap:6px;font-size:13.5px}',
    '.frrv-in input{width:74px;height:38px;border:1px solid #D9CFC3;border-radius:6px;padding:0 8px;font:inherit;font-size:15px;background:#fff;color:#2c2c2c}',
    '.frrv-result{margin-top:16px;border:1px solid #EADFD2;border-radius:12px;overflow:hidden}',
    '.frrv-result-hd{padding:12px 14px;background:#FBF6EF}',
    '.frrv-result-hd small{display:block;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:#7a6a5c}',
    '.frrv-result-hd b{display:block;font-family:"IvyPrestoDisplay-Regular",Georgia,serif;font-weight:400;font-size:22px;color:#433122;margin:2px 0}',
    '.frrv-result-hd p{margin:0;font-size:13px;color:#4a3d32;line-height:1.4}',
    '.frrv-diag{display:block;width:100%;height:auto;background:#fff;border-top:1px solid #EADFD2;border-bottom:1px solid #EADFD2}',
    '.frrv-verdicts{list-style:none;margin:0;padding:6px 14px 4px}',
    '.frrv-verdicts li{display:flex;gap:10px;align-items:baseline;padding:7px 0;border-bottom:1px solid #F3ECE3;font-size:13px;line-height:1.35}',
    '.frrv-verdicts li:last-child{border-bottom:0}',
    '.frrv-verdicts b{flex:none;width:92px;font-family:"HKGrotesk-Bold","HKGrotesk-Regular",sans-serif;font-weight:600}',
    '.frrv-tag{flex:none;font-size:11px;padding:2px 7px;border-radius:99px;white-space:nowrap}',
    '.frrv-tag--great{background:#E5EFE1;color:#2f5a2a}',
    '.frrv-tag--ok{background:#F6EED9;color:#7a5a12}',
    '.frrv-tag--small,.frrv-tag--big{background:#F7E3DE;color:#8a2f1f}',
    '.frrv-result-ft{padding:10px 14px 14px;display:flex;gap:8px;flex-wrap:wrap}',
    '.frrv-facts{list-style:none;margin:0;padding:0}',
    '.frrv-facts>li{display:flex;gap:12px;padding:14px 0;border-bottom:1px solid #F0E9E0}',
    '.frrv-facts>li>i{flex:none;width:34px;height:34px;border-radius:50%;background:#F4EDE3;display:grid;place-items:center;color:#7C5723}',
    '.frrv-facts>li>i svg{width:18px;height:18px}',
    '.frrv-facts h4{margin:0 0 3px;font-size:14.5px;font-family:"HKGrotesk-Bold","HKGrotesk-Regular",sans-serif;font-weight:600;color:#2c2c2c;letter-spacing:0;text-transform:none}',
    '.frrv-facts p{margin:0;font-size:13px;line-height:1.45;color:#4a3d32}',
    '.frrv-est{font-size:11px;color:#8a7a6c}',
    '.frrv-door{margin-top:10px;background:#FBF6EF;border-radius:10px;padding:10px 12px}',
    '.frrv-door input[type=range]{width:100%;accent-color:#B77E45;height:28px;margin:0}',
    '.frrv-door-out{font-size:13px;line-height:1.4;margin-top:4px}',
    '.frrv-door-out b{font-family:"HKGrotesk-Bold","HKGrotesk-Regular",sans-serif;font-weight:600}',
    /* desktop: modal with the stage left and a sidebar right */
    '@media (min-width:900px){',
    ' .frrv-box{inset:auto;left:50%;top:50%;width:min(1340px,calc(100vw - 48px));height:min(780px,calc(100vh - 48px));transform:translate(-50%,calc(-50% + 12px));border-radius:14px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.35)}',
    ' .frrv.is-in .frrv-box{transform:translate(-50%,-50%)}',
    ' .frrv-hd{height:58px;padding:0 12px 0 20px}',
    ' .frrv-hd .frrv-x{order:3}',
    ' .frrv-ttl b{font-size:22px}',
    ' .frrv-body{flex-direction:row}',
    ' .frrv[data-tab=size] .frrv-stagewrap,.frrv[data-tab=know] .frrv-stagewrap{display:block}',
    ' .frrv-side{width:360px;border-left:1px solid #EFE9E1}',
    ' .frrv-side,.frrv[data-tab=size] .frrv-side,.frrv[data-tab=know] .frrv-side{flex:none}',
    ' .frrv-tabs{border-bottom:1px solid #EFE9E1;padding:10px 12px}',
    ' .frrv-pane[data-p=room]{flex:1;overflow-y:auto;padding:16px 18px 20px}',
    ' .frrv-pane[data-p=size],.frrv-pane[data-p=know]{padding:18px 20px 28px}',
    ' .frrv-rooms{flex-wrap:wrap;overflow:visible}',
    ' .frrv-room{width:calc(50% - 4px);text-align:left;font-size:12.5px}',
    ' .frrv-room i{width:100%;height:96px}',
    ' .frrv-sizelist{flex-direction:column;gap:8px;margin:6px 0 16px}',
    ' .frrv-sizelist .frrv-chip{flex:none;width:100%;flex-direction:row;justify-content:space-between;align-items:center;padding:11px 14px}',
    ' .frrv-sizelist .frrv-chip b{font-size:14.5px}',
    ' .frrv-sizelist .frrv-chip small{font-size:13px}',
    ' .frrv-cta-note{display:block}',
    ' .frrv-hint{bottom:16px}',
    '}',
    '.frrv-desk{display:none}',
    '@media (min-width:900px){.frrv-desk{display:block}}',
    '.frrv-sizelist{display:flex;gap:6px;margin:0 0 10px}',
    '.frrv-badge{font-size:10.5px;letter-spacing:.04em;background:#3D1A1E;color:#fff;padding:2px 6px;border-radius:4px;margin-left:6px;vertical-align:2px}',
    '@media (max-width:899px){.frrv-badge{position:absolute;top:-8px;right:6px;margin:0;font-size:9.5px;padding:1px 5px}.frrv-cta-note{display:none}}',
    '.frrv-h4{margin:4px 0 8px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#7a6a5c;font-weight:400}',
    '@media (prefers-reduced-motion:reduce){.frrv-box,.frrv-scrim,.frrv-hint,.frrv-toast{transition:none}}',
    '.frrv-btn svg{width:20px;height:20px;flex:none}'
  ].join('\n').replace(/(^|[{},]|\n\s*)\.frrv-/g, '$1.frrv .frrv-');

  /* ------------------------------------------------------------------- icons */
  var I = {
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    rot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4.5h-4.5"/></svg>',
    dims: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/></svg>',
    tape: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="17" r="2.2"/><circle cx="19" cy="7" r="2.2"/><path d="M7 16l10-8" stroke-dasharray="2.5 2.5"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    adj: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
    cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    door: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V4h10v17M3 21h18M13 12h.01"/></svg>',
    heat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M7 4c-2 2 2 4 0 6M12 4c-2 2 2 4 0 6M17 4c-2 2 2 4 0 6M3 15h18M3 19h18"/></svg>',
    layer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 4l9 5-9 5-9-5z"/><path d="M3 14l9 5 9-5"/></svg>',
    paw: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="10" r="2"/><circle cx="10" cy="6" r="2"/><circle cx="14" cy="6" r="2"/><circle cx="18" cy="10" r="2"/><path d="M12 11c-3 0-6 4-6 6.5S8 20 12 20s6-.3 6-2.5S15 11 12 11z"/></svg>',
    leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19C5 10 10 5 20 4c0 10-5 15-14 15z"/><path d="M5 19l8-8"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14l-4-4 4-4"/><path d="M5 10h9a5 5 0 0 1 0 10h-2"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/></svg>'
  };

  /* -------------------------------------------------------------- camera math */
  // World: X right, Y up, Z toward the viewer; the floor is Y = 0. The camera sits at
  // (0, h, 0) looking down -Z, pitched down by `pitch`, rolled by `roll` in the image.
  function camFor(sc, iw, ih) {
    var f = sc.f * iw, cx = iw / 2, cy = ih / 2;
    return { f: f, cx: cx, cy: cy, iw: iw, ih: ih, h: sc.h,
             pitch: Math.atan((cy - sc.hz * ih) / f), roll: (sc.roll || 0) * Math.PI / 180 };
  }
  function proj(c, X, Y, Z) {
    var cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    var yc = c.h - Y, zc = -Z;
    var y2 = cp * yc - sp * zc, z2 = sp * yc + cp * zc;
    if (z2 <= 1e-3) return null;
    var u = c.f * X / z2, v = c.f * y2 / z2, cr = Math.cos(c.roll), sr = Math.sin(c.roll);
    return [c.cx + cr * u - sr * v, c.cy + sr * u + cr * v, z2];
  }
  function unproj(c, u, v) {
    var du = u - c.cx, dv = v - c.cy, cr = Math.cos(c.roll), sr = Math.sin(c.roll);
    var x2 = (cr * du + sr * dv) / c.f, y2 = (-sr * du + cr * dv) / c.f;
    var cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    var yc = cp * y2 + sp, zc = -sp * y2 + cp;
    if (yc <= 1e-4) return null;
    var t = c.h / yc;
    return [t * x2, -t * zc];
  }
  function horizonV(c) { return c.cy - c.f * Math.tan(c.pitch); }
  // world -> clip as a column-major mat4, folding in the image->stage "cover" mapping
  function clipMat(c, disp) {
    var cp = Math.cos(c.pitch), sp = Math.sin(c.pitch), cr = Math.cos(c.roll), sr = Math.sin(c.roll);
    var rx = [1, 0, 0, 0], ry = [0, -cp, sp, cp * c.h], rz = [0, -sp, -cp, sp * c.h];
    function lin(a, ra, b, rb, d, rd) { return [0, 1, 2, 3].map(function (i) { return a * ra[i] + b * rb[i] + d * rd[i]; }); }
    var U = lin(c.f * cr, rx, -c.f * sr, ry, c.cx, rz), V = lin(c.f * sr, rx, c.f * cr, ry, c.cy, rz);
    var k = 2 * disp.s / disp.w, m = 2 * disp.s / disp.h;
    var Xr = [0, 1, 2, 3].map(function (i) { return k * U[i] + (2 * disp.ox / disp.w - 1) * rz[i]; });
    var Yr = [0, 1, 2, 3].map(function (i) { return -m * V[i] + (1 - 2 * disp.oy / disp.h) * rz[i]; });
    // column-major: element (row r, col cIdx) at cIdx*4 + r
    var M = new Float32Array(16);
    for (var i = 0; i < 4; i++) { M[i * 4] = Xr[i]; M[i * 4 + 1] = Yr[i]; M[i * 4 + 2] = 0; M[i * 4 + 3] = rz[i]; }
    return M;
  }

  /* --------------------------------------------------------------- renderer */
  var VS_BG = 'attribute vec2 aP;attribute vec2 aT;varying vec2 vT;void main(){vT=aT;gl_Position=vec4(aP,0.,1.);}';
  var FS_BG = 'precision mediump float;varying vec2 vT;uniform sampler2D uTex;uniform sampler2D uMask;uniform float uM;' +
    'void main(){vec4 c=texture2D(uTex,vT);float a=uM>.5?texture2D(uMask,vT).a:1.;gl_FragColor=vec4(c.rgb*a,a);}';
  var VS_RUG = 'attribute vec3 aP;attribute vec2 aT;attribute vec2 aL;attribute float aS;uniform mat4 uMat;' +
    'varying vec2 vT;varying vec2 vL;varying float vS;void main(){vT=aT;vL=aL;vS=aS;gl_Position=uMat*vec4(aP,1.);}';
  var FS_RUG = 'precision mediump float;varying vec2 vT;varying vec2 vL;varying float vS;' +
    'uniform sampler2D uTex;uniform float uMode;uniform vec2 uHalf;uniform vec3 uTint;uniform vec4 uLight;uniform vec3 uEdge;' +
    'uniform float uShadow;uniform float uSoft;' +
    'float sdBox(vec2 p,vec2 b,float r){vec2 q=abs(p)-(b-r);return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}' +
    'void main(){float d=sdBox(vL,uHalf,.012);' +
    'float L=mix(mix(uLight.x,uLight.y,vT.x),mix(uLight.z,uLight.w,vT.x),vT.y);' +
    'if(uMode<.5){float a=1.-smoothstep(-.003,.0015,d);float ao=mix(.84,1.,smoothstep(0.,.035,-d));' +
    'vec3 c=texture2D(uTex,vT).rgb*uTint*L*ao;gl_FragColor=vec4(c*a,a);}' +
    'else if(uMode<1.5){gl_FragColor=vec4(uEdge*uTint*L*vS,1.);}' +
    'else{float a=uShadow*(1.-smoothstep(0.,uSoft,max(d,0.)));gl_FragColor=vec4(0.,0.,0.,a);}}';

  function Renderer(canvas) {
    var gl = null, gl2 = false;
    try { gl = canvas.getContext('webgl2', { antialias: true, alpha: false, premultipliedAlpha: true }); gl2 = !!gl; } catch (e) {}
    if (!gl) try { gl = canvas.getContext('webgl', { antialias: true, alpha: false }) || canvas.getContext('experimental-webgl'); } catch (e) {}
    if (!gl) throw new Error('no_webgl');
    this.gl = gl; this.gl2 = gl2; this.canvas = canvas;
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    this.bg = prog(gl, VS_BG, FS_BG, ['aP', 'aT'], ['uTex', 'uMask', 'uM']);
    this.rug = prog(gl, VS_RUG, FS_RUG, ['aP', 'aT', 'aL', 'aS'], ['uMat', 'uTex', 'uMode', 'uHalf', 'uTint', 'uLight', 'uEdge', 'uShadow', 'uSoft']);
    this.bgBuf = gl.createBuffer(); this.rugBuf = gl.createBuffer();
    this.photo = null; this.mask = null; this.rugTex = null; this.rugLevel = 0;
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  function prog(gl, vs, fs, attrs, unis) {
    function sh(t, src) { var s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s)); return s; }
    var p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    attrs.forEach(function (a, i) { gl.bindAttribLocation(p, i, a); });
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    var o = { p: p, a: {}, u: {} };
    attrs.forEach(function (a, i) { o.a[a] = i; });
    unis.forEach(function (u) { o.u[u] = gl.getUniformLocation(p, u); });
    return o;
  }
  function isPOT(n) { return (n & (n - 1)) === 0; }
  function potUp(n) { var p = 1; while (p < n) p *= 2; return Math.min(p, 2048); }
  // Upload an image/canvas. mip=true: mipmapped (WebGL1 needs power-of-two, so stretch).
  Renderer.prototype.tex = function (src, mip, old) {
    var gl = this.gl, w = src.naturalWidth || src.width, hh = src.naturalHeight || src.height;
    if (mip && !this.gl2 && !(isPOT(w) && isPOT(hh))) {
      var cv = D.createElement('canvas'); cv.width = potUp(w); cv.height = potUp(hh);
      cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height); src = cv;
    }
    var t = old || gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (mip) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT,
        Math.min(8, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    return t;
  };
  Renderer.prototype.resize = function (w, hh, dpr) {
    var c = this.canvas, W2 = Math.round(w * dpr), H2 = Math.round(hh * dpr);
    if (c.width !== W2 || c.height !== H2) { c.width = W2; c.height = H2; }
    this.gl.viewport(0, 0, W2, H2);
  };
  Renderer.prototype.draw = function (st) {
    var gl = this.gl, d = st.disp;
    gl.clearColor(0.93, 0.906, 0.875, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.photo) return;
    // photo quad, in clip space
    var x0 = 2 * d.ox / d.w - 1, x1 = 2 * (d.ox + st.cam.iw * d.s) / d.w - 1;
    var y0 = 1 - 2 * d.oy / d.h, y1 = 1 - 2 * (d.oy + st.cam.ih * d.s) / d.h;
    var q = new Float32Array([x0, y0, 0, 0, x1, y0, 1, 0, x0, y1, 0, 1, x1, y1, 1, 1]);
    this.useBg(q);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.photo);
    gl.uniform1i(this.bg.u.uTex, 0); gl.uniform1f(this.bg.u.uM, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (st.showRug && this.rugTex) {
      this.drawRug(st);
      if (this.mask) { // furniture that stands in front of the rug, redrawn on top
        this.useBg(q);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.photo);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.mask);
        gl.uniform1i(this.bg.u.uTex, 0); gl.uniform1i(this.bg.u.uMask, 1); gl.uniform1f(this.bg.u.uM, 1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.activeTexture(gl.TEXTURE0);
      }
    }
  };
  Renderer.prototype.useBg = function (q) {
    var gl = this.gl, b = this.bg;
    gl.useProgram(b.p); gl.bindBuffer(gl.ARRAY_BUFFER, this.bgBuf); gl.bufferData(gl.ARRAY_BUFFER, q, gl.DYNAMIC_DRAW);
    for (var i = 2; i < 4; i++) gl.disableVertexAttribArray(i);
    gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
  };
  Renderer.prototype.drawRug = function (st) {
    var gl = this.gl, r = this.rug, R = st.rugGeom;
    gl.useProgram(r.p); gl.bindBuffer(gl.ARRAY_BUFFER, this.rugBuf); gl.bufferData(gl.ARRAY_BUFFER, R.buf, gl.DYNAMIC_DRAW);
    for (var i = 0; i < 4; i++) gl.enableVertexAttribArray(i);
    var F = 8 * 4; // x y z u v lx lz shade
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, F, 0); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, F, 12);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, F, 20); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, F, 28);
    gl.uniformMatrix4fv(r.u.uMat, false, st.mat);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.rugTex); gl.uniform1i(r.u.uTex, 0);
    gl.uniform2f(r.u.uHalf, R.hw, R.hl);
    gl.uniform3fv(r.u.uTint, st.tint); gl.uniform4fv(r.u.uLight, st.light);
    gl.uniform3f(r.u.uEdge, SPEC.edgeRGB[0] / 255, SPEC.edgeRGB[1] / 255, SPEC.edgeRGB[2] / 255);
    gl.uniform1f(r.u.uShadow, 0.34); gl.uniform1f(r.u.uSoft, R.soft);
    gl.uniform1f(r.u.uMode, 2); gl.drawArrays(gl.TRIANGLE_STRIP, R.shadow[0], R.shadow[1]);
    gl.uniform1f(r.u.uMode, 1); for (var k = 0; k < 4; k++) gl.drawArrays(gl.TRIANGLE_STRIP, R.sides[0] + k * 4, 4);
    gl.uniform1f(r.u.uMode, 0); gl.drawArrays(gl.TRIANGLE_STRIP, R.top[0], R.top[1]);
  };

  // Rug geometry in world space: shadow quad, four side faces, top face.
  function rugGeometry(rug, wM, lM, tM) {
    var hw = wM / 2, hl = lM / 2, soft = 0.05, c = Math.cos(rug.yaw), s = Math.sin(rug.yaw), out = [];
    function wx(lx, lz) { return rug.x + c * lx + s * lz; }
    function wz(lx, lz) { return rug.z - s * lx + c * lz; }
    function v(lx, y, lz, shade) { out.push(wx(lx, lz), y, wz(lx, lz), (lx + hw) / wM, (lz + hl) / lM, lx, lz, shade); }
    var e = hw + soft, f = hl + soft;
    v(-e, 0.0005, -f, 1); v(e, 0.0005, -f, 1); v(-e, 0.0005, f, 1); v(e, 0.0005, f, 1);           // shadow 0..3
    var sides = [[-hw, -hl, hw, -hl, 0.80], [hw, -hl, hw, hl, 0.72], [hw, hl, -hw, hl, 0.80], [-hw, hl, -hw, -hl, 0.72]];
    sides.forEach(function (sd) {                                                                // sides 4..19
      v(sd[0], 0, sd[1], sd[4] * 0.82); v(sd[2], 0, sd[3], sd[4] * 0.82); v(sd[0], tM, sd[1], sd[4]); v(sd[2], tM, sd[3], sd[4]);
    });
    v(-hw, tM, -hl, 1); v(hw, tM, -hl, 1); v(-hw, tM, hl, 1); v(hw, tM, hl, 1);                 // top 20..23
    return { buf: new Float32Array(out), hw: hw, hl: hl, soft: soft, shadow: [0, 4], sides: [4], top: [20, 4] };
  }

  /* ------------------------------------------------------------ DOM: overlay */
  var root, stage, glc, c2d, ctx, R, toastT, hintEl, rotor, pinA, pinB, adjustEl, sheet, fileIn, fileInCam;
  var built = false;

  function build() {
    if (built) return; built = true;
    var st = h('style', { id: 'frrv-css' }); st.textContent = CSS; D.head.appendChild(st);
    root = h('div', { class: 'frrv', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'See the ' + SPEC.name + ' in your room', 'data-tab': 'room' });
    root.innerHTML =
      '<div class="frrv-scrim"></div>' +
      '<div class="frrv-box">' +
        '<header class="frrv-hd">' +
          '<button class="frrv-x" type="button" aria-label="Close">' + I.x + '</button>' +
          '<div class="frrv-ttl"><b>' + SPEC.name + '</b><span>See it in your room</span></div>' +
          '<div class="frrv-units" role="group" aria-label="Units"><button type="button" data-u="cm" class="on">cm</button><button type="button" data-u="ft">ft</button></div>' +
        '</header>' +
        '<div class="frrv-body">' +
          '<section class="frrv-stagewrap">' +
            '<div class="frrv-stage" aria-label="Your room with the rug placed on the floor. Drag to move it.">' +
              '<canvas class="frrv-gl"></canvas><canvas class="frrv-2d"></canvas>' +
              '<div class="frrv-load"><i></i></div>' +
              '<div class="frrv-tools">' +
                tool('rot', I.rot, 'Turn 90°') + tool('dims', I.dims, 'Rug size') + tool('tape', I.tape, 'Measure the floor') +
                tool('eye', I.eye, 'Hold to compare') + tool('save', I.save, 'Save image') + tool('adj', I.adj, 'Line up the floor', true) +
              '</div>' +
              '<div class="frrv-hint"></div>' +
              '<div class="frrv-rotor" aria-hidden="true">' + I.rot + '</div>' +
              '<div class="frrv-pin" data-pin="a" hidden></div><div class="frrv-pin" data-pin="b" hidden></div>' +
              '<div class="frrv-adjust" hidden></div>' +
            '</div>' +
          '</section>' +
          '<aside class="frrv-side">' +
            '<nav class="frrv-tabs" role="tablist">' +
              '<button type="button" role="tab" data-t="room" class="on">In your room</button>' +
              '<button type="button" role="tab" data-t="size">Which size?</button>' +
              '<button type="button" role="tab" data-t="know">Good to know</button>' +
            '</nav>' +
            '<div class="frrv-pane" data-p="room"></div>' +
            '<div class="frrv-pane" data-p="size"></div>' +
            '<div class="frrv-pane" data-p="know"></div>' +
          '</aside>' +
        '</div>' +
        '<div class="frrv-sheet" role="dialog" aria-label="Use a photo of your room"><div></div></div>' +
        '<div class="frrv-toast" role="status" aria-live="polite"></div>' +
      '</div>';
    D.body.appendChild(root);
    // mobile: tabs sit under the header; desktop: at the top of the sidebar
    var mq = W.matchMedia('(min-width:900px)');
    function placeTabs() {
      var tabs = $('.frrv-tabs', root);
      if (mq.matches) $('.frrv-side', root).insertBefore(tabs, $('.frrv-side', root).firstChild);
      else $('.frrv-box', root).insertBefore(tabs, $('.frrv-body', root));
    }
    placeTabs(); (mq.addEventListener ? mq.addEventListener('change', placeTabs) : mq.addListener(placeTabs));

    stage = $('.frrv-stage', root); glc = $('.frrv-gl', root); c2d = $('.frrv-2d', root); ctx = c2d.getContext('2d');
    hintEl = $('.frrv-hint', root);
    hintEl.textContent = W.matchMedia('(pointer:coarse)').matches ? 'Drag to move · twist with two fingers to turn' : 'Drag to move · drag the \u21bb handle to turn'; rotor = $('.frrv-rotor', root); adjustEl = $('.frrv-adjust', root);
    pinA = $('[data-pin=a]', root); pinB = $('[data-pin=b]', root); sheet = $('.frrv-sheet', root);
    fileIn = h('input', { type: 'file', accept: 'image/*', hidden: '' });
    fileInCam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: '' });
    root.appendChild(fileIn); root.appendChild(fileInCam);
    [fileIn, fileInCam].forEach(function (fi) { fi.addEventListener('change', function () { if (fi.files && fi.files[0]) useOwnPhoto(fi.files[0]); fi.value = ''; }); });

    $('.frrv-x', root).addEventListener('click', close);
    $('.frrv-scrim', root).addEventListener('click', close);
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { if (sheet.classList.contains('is-open')) closeSheet(); else close(); }
      if (e.key === 'Tab') trapFocus(e);
    });
    $$('.frrv-units button', root).forEach(function (b) { b.addEventListener('click', function () { setUnit(b.getAttribute('data-u')); }); });
    $$('.frrv-tabs button', root).forEach(function (b) { b.addEventListener('click', function () { setTab(b.getAttribute('data-t'), 'tab'); }); });

    // tools
    toolBtn('rot').addEventListener('click', function () { turn(Math.PI / 2); track('pdp_room_interaction', 'rotate', '90', 'button'); });
    toolBtn('dims').addEventListener('click', function () { S.dims = !S.dims; syncTools(); redraw(); track('pdp_room_interaction', S.dims ? 'dims_on' : 'dims_off', null, 'button'); });
    toolBtn('tape').addEventListener('click', function () { setTape(!S.tape); track('pdp_room_interaction', S.tape ? 'tape_on' : 'tape_off', null, 'button'); });
    var eye = toolBtn('eye');
    function cmp(on) { return function (e) { if (e.cancelable) e.preventDefault(); S.compare = on; syncTools(); redraw(); if (on) track('pdp_room_interaction', 'compare', null, 'button', null, true); }; }
    eye.addEventListener('pointerdown', cmp(true)); ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (t) { eye.addEventListener(t, cmp(false)); });
    eye.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') { S.compare = true; redraw(); } });
    eye.addEventListener('keyup', function () { S.compare = false; redraw(); });
    eye.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    toolBtn('save').addEventListener('click', saveImage);
    toolBtn('adj').addEventListener('click', function () { setAdjust(!S.adjust); });

    buildRoomPane(); buildFinder(); buildKnow();
    bindStage();
    W.addEventListener('resize', function () { if (S.open) layout(); });
  }
  function tool(id, icon, label, hidden) {
    return '<button type="button" class="frrv-tool" data-tool="' + id + '" aria-label="' + label + '"' + (hidden ? ' hidden' : '') + '>' + icon +
      '<span class="frrv-tip" aria-hidden="true">' + label + '</span></button>';
  }
  function toolBtn(id) { return $('[data-tool=' + id + ']', root); }
  function syncTools() {
    toolBtn('dims').classList.toggle('on', S.dims);
    toolBtn('tape').classList.toggle('on', S.tape);
    toolBtn('eye').classList.toggle('on', S.compare);
    var own = S.scene && S.scene.own;
    toolBtn('adj').hidden = !own; toolBtn('adj').classList.toggle('on', S.adjust);
  }
  function trapFocus(e) {
    var f = $$('button,input,select,a[href],[tabindex]:not([tabindex="-1"])', root).filter(function (x) { return x.offsetParent !== null && !x.disabled; });
    if (!f.length) return;
    var a = f[0], z = f[f.length - 1];
    if (e.shiftKey && D.activeElement === a) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && D.activeElement === z) { e.preventDefault(); a.focus(); }
  }
  function toast(msg, ms) {
    var t = $('.frrv-toast', root); t.textContent = msg; t.classList.add('is-on');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('is-on'); }, ms || 2600);
  }

  /* ----------------------------------------------------------- room pane UI */
  function buildRoomPane() {
    var pane = $('.frrv-pane[data-p=room]', root);
    var rooms = '<div class="frrv-rooms" role="group" aria-label="Choose a room">' +
      '<button type="button" class="frrv-room frrv-room--own" data-scene="own"><i>' + I.cam + '</i>Your room</button>' +
      SCENES.map(function (sc) {
        return '<button type="button" class="frrv-room" data-scene="' + sc.id + '"><i style="background-image:url(\'' + asset(sc.thumb) + '\')"></i>' + sc.label + '</button>';
      }).join('') + '</div>';
    pane.innerHTML =
      '<h4 class="frrv-h4 frrv-desk">Size</h4><div class="frrv-sizelist" role="group" aria-label="Rug size"></div>' +
      '<h4 class="frrv-h4 frrv-desk">Room</h4>' + rooms +
      '<div class="frrv-cta"><div class="frrv-price"></div><button type="button" class="frrv-btn frrv-add">Add to Basket</button></div>' +
      '<p class="frrv-note frrv-cta-note"></p>';
    $$('.frrv-room', pane).forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-scene');
        if (id === 'own') { if (S.own) setScene('own', 'tile'); else openSheet(); }
        else setScene(id, 'tile');
      });
    });
    $('.frrv-add', pane).addEventListener('click', addToBasket);
    renderSizes();
  }
  function renderSizes() {
    var html = VARIANTS.map(function (v, i) {
      var sub = v.available ? money(v.price) : 'Sold out · ' + money(v.price);
      return '<button type="button" class="frrv-chip' + (i === S.vi ? ' on' : '') + (v.available ? '' : ' is-out') + '" data-vi="' + i + '" aria-pressed="' + (i === S.vi) + '">' +
        '<b>' + sizeLabel(v) + (v.badge ? '<span class="frrv-badge">' + v.badge + '</span>' : '') + '</b><small>' + sub + '</small></button>';
    }).join('');
    ['.frrv-sizelist'].forEach(function (sel) {
      var box = $(sel, root); box.innerHTML = html;
      $$('.frrv-chip', box).forEach(function (b) { b.addEventListener('click', function () { S.userSized = true; setSize(+b.getAttribute('data-vi'), 'chip'); }); });
    });
    var v = VARIANTS[S.vi]; if (!v) return;
    $('.frrv-price', root).innerHTML = '<b>' + money(v.price) + '</b>' + (v.compare > v.price ? '<s>' + money(v.compare) + '</s>' : '');
    var add = $('.frrv-add', root);
    add.disabled = !v.available;
    add.textContent = v.available ? 'Add to Basket' : 'Sold out';
    $('.frrv-cta-note', root).textContent = v.available
      ? sizeLabel(v) + ' · Express delivery in 4 working days (mainland UK)'
      : 'This size is being made — pick another size, or check back soon.';
  }

  /* ------------------------------------------------------------ state setters */
  function setUnit(u) {
    S.unit = u;
    $$('.frrv-units button', root).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-u') === u); });
    renderSizes(); renderFinder(); renderDoor(); redraw();
    track('pdp_room_interaction', 'unit', u, 'toggle');
  }
  function setTab(t, src) {
    if (S.tab === t) return;
    S.tab = t; root.setAttribute('data-tab', t);
    $$('.frrv-tabs button', root).forEach(function (b) { var on = b.getAttribute('data-t') === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    if (t === 'room') layout();
    if (t === 'size') renderFinder();
    track('pdp_room_interaction', 'tab', t, src);
  }
  function setSize(i, src) {
    if (!VARIANTS[i]) return;
    var from = VARIANTS[S.vi]; S.vi = i; renderSizes();
    if (from && S.cam) {
      var t0 = now(), a = { w: from.w, l: from.l }, b = VARIANTS[i];
      S.anim = function (t) { var k = clamp((t - t0) / 260, 0, 1), e = 1 - Math.pow(1 - k, 3);
        S.wl = k < 1 ? [a.w + (b.w - a.w) * e, a.l + (b.l - a.l) * e] : null; return k < 1; };
      loop();
    } else redraw();
    syncPageVariant();
    if (src) track('pdp_room_interaction', 'size', VARIANTS[i].title, src);
    renderFinder();
  }
  function turn(by) {
    var y0 = S.rug.yaw, t0 = now();
    S.anim = function (t) { var k = clamp((t - t0) / 280, 0, 1), e = 1 - Math.pow(1 - k, 3); S.rug.yaw = y0 + by * e; return k < 1; };
    loop();
  }

  /* --------------------------------------------------------- scenes & photos */
  var sceneToken = 0;
  function setScene(id, src) {
    var sc = id === 'own' ? S.own && S.own.scene : SCENES.filter(function (s) { return s.id === id; })[0];
    if (!sc) return;
    var tok = ++sceneToken;
    S.scene = sc; S.adjust = false; adjustEl.hidden = true;
    $$('.frrv-room', root).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-scene') === id); });
    stage.classList.remove('is-ready');
    var p = sc.own ? Promise.resolve(S.own.img) : loadImg(asset(sc.img));
    var t0 = now();
    Promise.all([p, ensureRug()]).then(function (r) {
      if (tok !== sceneToken) return;
      var img = r[0];
      S.img = img;
      S.cam = camFor(sc, img.naturalWidth || img.width, img.naturalHeight || img.height);
      R.photo = R.tex(img, true, R.photo);
      R.mask = sc.occl ? R.tex(maskCanvas(sc, S.cam), false, R.mask) : null;
      sampleLight(img);
      placeRug(sc);
      var rc = proj(S.cam, S.rug.x, 0, S.rug.z);
      S.frameOn = rc ? [rc[0] / S.cam.iw, rc[1] / S.cam.ih] : null;  // frame the photo around the rug
      layout(true);
      stage.classList.add('is-ready');
      redraw();
      track('pdp_room_view', 'scene_ready', id, src, now() - t0);
      if (sc.own && !S.ownAdjusted) setAdjust(true);
    }).catch(function (e) {
      if (tok !== sceneToken) return;
      stage.classList.add('is-ready');
      toast('Sorry — that room didn’t load. Try another.');
      track('pdp_room_view', 'scene_failed', id, String(e && e.message || e).slice(0, 60));
    });
    syncTools();
    if (src) track('pdp_room_interaction', 'scene', id, src);
  }
  function placeRug(sc) {
    var c = S.cam, p = sc.place || [0.5, 0.78];
    var fl = unproj(c, p[0] * c.iw, p[1] * c.ih) || [0, -2.5];
    S.rug.x = fl[0]; S.rug.z = fl[1]; S.rug.yaw = (sc.yaw || 0) * Math.PI / 180;
    if (sc.size != null && !S.userSized && VARIANTS[sc.size]) { S.vi = sc.size; renderSizes(); }
    S.wl = null;
  }
  // Furniture that stands in front of the rug: polygons (image fractions) -> alpha mask.
  function maskCanvas(sc, c) {
    var k = Math.min(1, 1024 / Math.max(c.iw, c.ih)), cv = D.createElement('canvas');
    cv.width = Math.round(c.iw * k); cv.height = Math.round(c.ih * k);
    var g = cv.getContext('2d'); g.fillStyle = '#fff';
    sc.occl.forEach(function (poly) {
      var rw = sc.ref ? sc.ref[0] : 1, rh = sc.ref ? sc.ref[1] : 1;
      g.beginPath(); poly.forEach(function (p, i) { g[i ? 'lineTo' : 'moveTo'](p[0] / rw * cv.width, p[1] / rh * cv.height); }); g.closePath(); g.fill();
    });
    return cv;
  }
  // Rug texture: sm paints first, md replaces it, hd only when the rug fills the screen.
  var rugP = null, hdP = null;
  function ensureRug() {
    if (rugP) return rugP;
    rugP = loadImg(asset('laleh-rug-sm.webp')).then(function (im) {
      R.rugTex = R.tex(im, true); R.rugLevel = 1;
      loadImg(asset('laleh-rug-md.webp')).then(function (im2) { R.rugTex = R.tex(im2, true, R.rugTex); R.rugLevel = 2; redraw(); }).catch(function () {});
    });
    return rugP;
  }
  function ensureHD() {
    if (hdP) return hdP;
    hdP = loadImg(asset('laleh-rug-hd.webp')).then(function (im) { R.rugTex = R.tex(im, true, R.rugTex); R.rugLevel = 3; redraw(); }).catch(function () {});
    return hdP;
  }
  // Floor brightness under each rug corner, so the rug picks up the room's light fall-off.
  var lumGrid = null, lumMean = 0.5, tint = [1, 1, 1];
  function sampleLight(img) {
    var n = 48, cv = D.createElement('canvas'); cv.width = n; cv.height = n;
    var g = cv.getContext('2d'); g.drawImage(img, 0, 0, n, n);
    var d; try { d = g.getImageData(0, 0, n, n).data; } catch (e) { lumGrid = null; return; }
    lumGrid = new Float32Array(n * n); var sr = 0, sg = 0, sb = 0, sl = 0, cnt = 0;
    for (var i = 0; i < n * n; i++) {
      var r = d[i * 4] / 255, gg = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255, L = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
      lumGrid[i] = L;
      if (i >= n * n / 2) { sr += r; sg += gg; sb += b; sl += L; cnt++; } // lower half ≈ floor
    }
    lumMean = sl / cnt;
    var m = (sr + sg + sb) / 3 || 1;
    tint = [clamp(0.8 + 0.2 * sr / m, 0.9, 1.08), clamp(0.8 + 0.2 * sg / m, 0.9, 1.08), clamp(0.8 + 0.2 * sb / m, 0.9, 1.08)];
    lumGrid.n = n;
  }
  function lumAt(u, v) {
    if (!lumGrid) return lumMean;
    var n = lumGrid.n, x = clamp(Math.floor(u / S.cam.iw * n), 0, n - 1), y = clamp(Math.floor(v / S.cam.ih * n), 0, n - 1);
    return lumGrid[y * n + x];
  }

  /* ---------------------------------------------------------- own photo flow */
  function openSheet() {
    var touch = W.matchMedia('(pointer:coarse)').matches;
    $('div', sheet).innerHTML =
      '<h3>Use a photo of your room</h3>' +
      '<ol><li>Stand back in a doorway or corner.</li><li>Hold your phone upright at chest height.</li>' +
      '<li>Tilt it down so the floor fills the lower half.</li></ol>' +
      '<div class="frrv-row">' +
        (touch ? '<button type="button" class="frrv-btn frrv-take">' + I.cam + ' Take photo</button>' : '') +
        '<button type="button" class="frrv-btn ' + (touch ? 'frrv-btn--ghost ' : '') + 'frrv-pick">' + (touch ? 'Choose photo' : 'Upload a photo') + '</button>' +
      '</div>' +
      '<p class="frrv-priv">' + I.lock + '<span>Your photo stays on your device — it is never uploaded or saved by us.</span></p>' +
      '<button type="button" class="frrv-btn frrv-btn--ghost frrv-btn--sm frrv-cancel" style="margin-top:12px;width:100%">Not now</button>';
    sheet.classList.add('is-open');
    var take = $('.frrv-take', sheet);
    if (take) take.addEventListener('click', function () { fileInCam.click(); closeSheet(); });
    $('.frrv-pick', sheet).addEventListener('click', function () { fileIn.click(); closeSheet(); });
    $('.frrv-cancel', sheet).addEventListener('click', closeSheet);
    sheet.onclick = function (e) { if (e.target === sheet) closeSheet(); };
    ($('.frrv-take', sheet) || $('.frrv-pick', sheet)).focus();
    track('pdp_room_interaction', 'own_photo_sheet', null, 'tile');
  }
  function closeSheet() { sheet.classList.remove('is-open'); }

  function useOwnPhoto(file) {
    stage.classList.remove('is-ready');
    var url = URL.createObjectURL(file);
    Promise.all([loadImg(url), readFocal35(file)]).then(function (r) {
      var img = r[0], f35 = r[1];
      // keep the texture at most 2048 on the long side; the browser has already applied EXIF rotation
      var iw = img.naturalWidth, ih = img.naturalHeight, k = Math.min(1, 2048 / Math.max(iw, ih));
      var cv = D.createElement('canvas'); cv.width = Math.round(iw * k); cv.height = Math.round(ih * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      // focal length: 35mm-equivalent is defined on the diagonal (43.27 mm)
      var diag = Math.hypot(cv.width, cv.height), fpx = (f35 || 26) * diag / 43.27;
      var sc = { id: 'own', own: true, label: 'Your room', f: fpx / cv.width, h: 1.35, hz: 0, place: [0.5, 0.72], yaw: 0, focus: [0.5, 0.6], f35: f35 };
      // tilt: read it from the photo's verticals; else assume the usual ~25° (portrait) / 12° (landscape)
      var pitch = autoLevel(cv, fpx);
      sc.auto = pitch != null;
      if (pitch == null) pitch = (cv.height > cv.width ? 25 : 12) * Math.PI / 180;
      sc.hz = (cv.height / 2 - fpx * Math.tan(pitch)) / cv.height;
      // start the rug well below the horizon
      sc.place = [0.5, Math.max(0.72, Math.min(0.85, sc.hz + 0.32))];
      S.own = { img: cv, scene: sc }; S.ownAdjusted = false;
      var tile = $('.frrv-room--own i', root);
      try { tile.style.backgroundImage = 'url(' + cv.toDataURL('image/jpeg', 0.6) + ')'; tile.innerHTML = ''; tile.style.borderStyle = 'solid'; } catch (e) {}
      setScene('own', 'upload');
      track('pdp_room_interaction', 'own_photo', f35 ? 'exif_' + f35 : 'no_exif', 'upload');
    }).catch(function () {
      URL.revokeObjectURL(url); stage.classList.add('is-ready');
      toast('That photo couldn’t be opened. Please try a JPG or PNG.', 3600);
      track('pdp_room_view', 'own_photo_failed', file.type || 'unknown');
    });
  }
  // Camera tilt from the photo: walls, door frames and furniture legs are vertical in the room, and
  // when the phone points down they converge toward a point below the picture. Trace near-vertical
  // edge chains, fit a line to each, and take the length-weighted median of where they cross the
  // centre line. Returns pitch in radians (positive = looking down), or null if there's too little.
  function autoLevel(src, fpx) {
    try {
      var k = Math.min(1, 480 / Math.max(src.width, src.height)), w = Math.round(src.width * k), hh = Math.round(src.height * k);
      var c = D.createElement('canvas'); c.width = w; c.height = hh;
      var g = c.getContext('2d'); g.drawImage(src, 0, 0, w, hh);
      var d = g.getImageData(0, 0, w, hh).data, L = new Float32Array(w * hh), GX = new Float32Array(w * hh);
      for (var i = 0; i < w * hh; i++) L[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      var E = new Uint8Array(w * hh), x, y, p;
      for (y = 1; y < hh - 1; y++) for (x = 1; x < w - 1; x++) {
        p = y * w + x;
        var gx = L[p - w + 1] + 2 * L[p + 1] + L[p + w + 1] - L[p - w - 1] - 2 * L[p - 1] - L[p + w - 1];
        var gy = L[p + w - 1] + 2 * L[p + w] + L[p + w + 1] - L[p - w - 1] - 2 * L[p - w] - L[p - w + 1];
        GX[p] = gx;
        if (Math.abs(gx) > 70 && Math.abs(gx) > 2.4 * Math.abs(gy)) E[p] = 1;      // strong, within ~23° of vertical
      }
      for (p = 1; p < w * hh - 1; p++) if (E[p] && (Math.abs(GX[p]) < Math.abs(GX[p - 1]) || Math.abs(GX[p]) < Math.abs(GX[p + 1]))) E[p] = 2; // thin
      var segs = [], minLen = Math.max(18, hh * 0.08), f = fpx * k, cx = w / 2, cy = hh / 2;
      for (y = 1; y < hh - 1; y++) for (x = 1; x < w - 1; x++) {
        if (E[y * w + x] !== 1) continue;
        var pts = [], xx = x, yy = y, sign = GX[y * w + x] > 0;
        while (yy < hh - 1) {
          E[yy * w + xx] = 3; pts.push(xx, yy);
          var nx = -1;
          for (var dx = 0; dx <= 1 && nx < 0; dx++) [xx - dx, xx + dx].forEach(function (q) {
            if (nx < 0 && q > 0 && q < w - 1 && E[(yy + 1) * w + q] === 1 && (GX[(yy + 1) * w + q] > 0) === sign) nx = q;
          });
          if (nx < 0) break; xx = nx; yy++;
        }
        var n = pts.length / 2; if (n < minLen) continue;
        var sy = 0, sx = 0, syy = 0, sxy = 0;
        for (var j = 0; j < n; j++) { var X = pts[2 * j], Y = pts[2 * j + 1]; sy += Y; sx += X; syy += Y * Y; sxy += X * Y; }
        var b = (n * sxy - sx * sy) / (n * syy - sy * sy), a = (sx - b * sy) / n, err = 0;
        for (j = 0; j < n; j++) err += Math.pow(pts[2 * j] - (a + b * pts[2 * j + 1]), 2);
        if (Math.sqrt(err / n) > 1.1) continue;                                      // not straight
        var ym = sy / n, xm = a + b * ym, den = b * (ym - cy) + (cx - xm);
        if (Math.abs(den) < 1e-6) continue;
        segs.push([b / den, n]);                                                     // 1/(vanishing y - cy)
      }
      if (segs.length < 4) return null;
      segs.sort(function (u, v) { return u[0] - v[0]; });
      var tot = segs.reduce(function (t, s2) { return t + s2[1]; }, 0), acc = 0, med = 0;
      for (var m = 0; m < segs.length; m++) { acc += segs[m][1]; if (acc >= tot / 2) { med = segs[m][0]; break; } }
      if (tot < hh * 0.9) return null;                                               // too little evidence
      var pitch = Math.atan(med * f);
      return pitch > -0.17 && pitch < 1.05 ? pitch : null;                           // -10°..60°
    } catch (e) { return null; }
  }
  // EXIF FocalLengthIn35mmFilm (0xA405), if the photo carries it. JPEG only; null otherwise.
  function readFocal35(file) {
    return file.slice(0, 131072).arrayBuffer().then(function (buf) {
      var v = new DataView(buf);
      if (v.getUint16(0) !== 0xFFD8) return null;
      var o = 2;
      while (o + 4 < v.byteLength) {
        var mk = v.getUint16(o), sz = v.getUint16(o + 2);
        if (mk === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) { // 'Exif'
          var t = o + 10, le = v.getUint16(t) === 0x4949;
          var u16 = function (p) { return v.getUint16(p, le); }, u32 = function (p) { return v.getUint32(p, le); };
          var findTag = function (ifd, tag) {
            var n = u16(t + ifd);
            for (var i = 0; i < n; i++) { var e = t + ifd + 2 + i * 12; if (u16(e) === tag) return e; }
            return -1;
          };
          var ex = findTag(u32(t + 4), 0x8769); if (ex < 0) return null;
          var fe = findTag(u32(ex + 8), 0xA405); if (fe < 0) return null;
          var f = u16(fe + 8); return f > 8 && f < 300 ? f : null;
        }
        if ((mk & 0xFF00) !== 0xFF00) break;
        o += 2 + sz;
      }
      return null;
    }).catch(function () { return null; });
  }
  function setAdjust(on) {
    S.adjust = on; syncTools();
    if (!on) { adjustEl.hidden = true; S.ownAdjusted = true; redraw(); return; }
    var sc = S.scene;
    var hz = Math.round(sc.hz * 1000);
    adjustEl.innerHTML =
      '<h4>Line up the floor</h4><p>' + (sc.auto ? 'We\u2019ve levelled it from your photo. ' : '') + 'If the grid doesn\u2019t run the same way as your floorboards or skirting, nudge the sliders.</p>' +
      '<label for="frrv-hz">Floor angle</label><input id="frrv-hz" type="range" min="-600" max="600" step="1" value="' + hz + '">' +
      '<label>Photo taken</label><div class="frrv-seg" role="group"><button type="button" data-hh="1.0">Sitting</button><button type="button" data-hh="1.35">Standing</button></div>' +
      '<label for="frrv-hh">Phone height · <span class="frrv-hhv"></span></label><input id="frrv-hh" type="range" min="60" max="200" step="1" value="' + Math.round(sc.h * 100) + '">' +
      '<div class="frrv-row" style="margin-top:10px;justify-content:space-between"><button type="button" class="frrv-btn frrv-btn--ghost frrv-btn--sm frrv-chk">Check with a tape</button>' +
      '<button type="button" class="frrv-btn frrv-btn--sm frrv-done">Done</button></div>';
    adjustEl.hidden = false;
    var hzIn = $('#frrv-hz', adjustEl), hhIn = $('#frrv-hh', adjustEl);
    function sync() {
      $('.frrv-hhv', adjustEl).textContent = len(sc.h * 100);
      $$('[data-hh]', adjustEl).forEach(function (b) { b.classList.toggle('on', Math.abs(+b.getAttribute('data-hh') - sc.h) < 0.01); });
    }
    function apply() {
      var keep = S.rug && S.cam ? proj(S.cam, S.rug.x, 0, S.rug.z) : null;
      S.cam = camFor(sc, S.cam.iw, S.cam.ih);
      if (keep) { var fl = unproj(S.cam, keep[0], keep[1]); if (fl) { S.rug.x = fl[0]; S.rug.z = fl[1]; } }
      sync(); redraw();
    }
    hzIn.addEventListener('input', function () { sc.hz = +hzIn.value / 1000; apply(); track('pdp_room_interaction', 'adjust_angle', null, 'slider', null, true); });
    hhIn.addEventListener('input', function () { sc.h = +hhIn.value / 100; apply(); track('pdp_room_interaction', 'adjust_height', null, 'slider', null, true); });
    $$('[data-hh]', adjustEl).forEach(function (b) { b.addEventListener('click', function () { sc.h = +b.getAttribute('data-hh'); hhIn.value = Math.round(sc.h * 100); apply(); }); });
    $('.frrv-done', adjustEl).addEventListener('click', function () { setAdjust(false); });
    $('.frrv-chk', adjustEl).addEventListener('click', function () { setAdjust(false); setTape(true, true); });
    sync(); redraw();
  }

  /* ------------------------------------------------------------- tape measure */
  var tapePts = null; // floor points [x,z]
  function setTape(on, calibrate) {
    S.tape = on; syncTools();
    pinA.hidden = pinB.hidden = !on;
    if (on && S.cam) {
      var c = S.cam, d = S.disp;
      // start the pins across the lower middle of the visible photo
      var a = toImg(d.w * 0.3, d.h * 0.7), b = toImg(d.w * 0.7, d.h * 0.7);
      tapePts = [unproj(c, a[0], a[1]) || [-0.5, -2], unproj(c, b[0], b[1]) || [0.5, -2]];
      if (calibrate) toast('Drag the pins to the ends of something you know, then tap the measurement to correct it.', 5000);
    }
    redraw();
  }
  function tapeLen() { var a = tapePts[0], b = tapePts[1]; return Math.hypot(a[0] - b[0], a[1] - b[1]) * 100; }
  function correctTape() {
    var cur = Math.round(tapeLen());
    var ans = W.prompt('How long is it really? (' + (S.unit === 'ft' ? 'inches' : 'cm') + ')', S.unit === 'ft' ? Math.round(cur / 2.54) : cur);
    if (!ans) return;
    var real = parseFloat(ans) * (S.unit === 'ft' ? 2.54 : 1);
    if (!(real > 5 && real < 2000)) return;
    // floor distances scale linearly with camera height
    var k = real / cur, sc = S.scene;
    sc.h = clamp(sc.h * k, 0.3, 3);
    tapePts = tapePts.map(function (p) { return [p[0] * k, p[1] * k]; });
    S.rug.x *= k; S.rug.z *= k;
    S.cam = camFor(sc, S.cam.iw, S.cam.ih);
    S.ownAdjusted = true; redraw();
    toast('Scale corrected — the rug is now true to size.');
    track('pdp_room_interaction', 'tape_correct', Math.round(k * 100), 'prompt');
  }

  /* ---------------------------------------------------------------- layout */
  function layout(sceneChanged) {
    if (!S.open || !R) return;
    var w = stage.clientWidth, hh = stage.clientHeight;
    if (!w || !hh) return;
    var dpr = Math.min(W.devicePixelRatio || 1, 2);
    R.resize(w, hh, dpr);
    c2d.width = Math.round(w * dpr); c2d.height = Math.round(hh * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!S.cam) return;
    // "cover" the stage with the photo, centred on the scene's focus point
    var c = S.cam, s = Math.max(w / c.iw, hh / c.ih), f = (S.scene && S.scene.focus) || [0.5, 0.5], ay = 0.5;
    if (w / hh < 0.9 && c.iw > c.ih) {
      // a landscape room on a phone: zoom in a little and frame the rug, not the ceiling
      s *= (S.scene && S.scene.mzoom) || 1.18;
      if (S.frameOn) { f = S.frameOn; ay = 0.6; }
    }
    var ox = clamp(w / 2 - c.iw * f[0] * s, w - c.iw * s, 0), oy = clamp(hh * ay - c.ih * f[1] * s, hh - c.ih * s, 0);
    S.disp = { w: w, h: hh, s: s, ox: ox, oy: oy, dpr: dpr };
    redraw();
  }
  function toImg(px, py) { var d = S.disp; return [(px - d.ox) / d.s, (py - d.oy) / d.s]; }
  function toScr(u, v) { var d = S.disp; return [d.ox + u * d.s, d.oy + v * d.s]; }
  function floorAt(px, py) { var p = toImg(px, py); return unproj(S.cam, p[0], p[1]); }
  function scrOf(X, Y, Z) { var p = proj(S.cam, X, Y, Z); return p ? toScr(p[0], p[1]) : null; }

  /* ---------------------------------------------------------------- drawing */
  var raf = 0;
  function redraw() { if (!raf) raf = W.requestAnimationFrame(frame); }
  function loop() { redraw(); }
  function frame(t) {
    raf = 0;
    if (!S.open || !S.cam || !S.disp) return;
    var more = S.anim ? S.anim(t || now()) : false;
    if (!more) S.anim = null;
    var v = VARIANTS[S.vi], wl = S.wl || [v.w, v.l];
    var wM = wl[0] / 100, lM = wl[1] / 100, tM = SPEC.thicknessMm / 1000;
    var geom = rugGeometry(S.rug, wM, lM, tM);
    var st = { disp: S.disp, cam: S.cam, showRug: !S.compare, rugGeom: geom, mat: clipMat(S.cam, S.disp), tint: tint, light: cornerLight(wM, lM) };
    R.draw(st);
    overlay(wM, lM);
    // fetch the 1024px texture once the rug is big on screen
    if (R.rugLevel === 2 && !hdP && rugScreenSpan(wM, lM) * S.disp.dpr > 900) ensureHD();
    if (more) redraw();
  }
  function cornerLight(wM, lM) {
    var c = Math.cos(S.rug.yaw), s = Math.sin(S.rug.yaw), out = [];
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (k) {
      var lx = k[0] * wM / 2, lz = k[1] * lM / 2, p = proj(S.cam, S.rug.x + c * lx + s * lz, 0, S.rug.z - s * lx + c * lz);
      var L = p ? lumAt(p[0], p[1]) : lumMean;
      out.push(L);
    });
    var mean = (out[0] + out[1] + out[2] + out[3]) / 4 || lumMean;
    var expo = clamp(0.86 + 0.32 * (lumMean - 0.45), 0.8, 1.02);
    return out.map(function (L) { return expo * clamp(Math.pow(L / mean, 0.45), 0.82, 1.15); });
  }
  function rugCorners(wM, lM, y) {
    var c = Math.cos(S.rug.yaw), s = Math.sin(S.rug.yaw);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (k) {
      var lx = k[0] * wM / 2, lz = k[1] * lM / 2;
      return [S.rug.x + c * lx + s * lz, y || 0, S.rug.z - s * lx + c * lz];
    });
  }
  function rugScreenSpan(wM, lM) {
    var pts = rugCorners(wM, lM).map(function (p) { return scrOf(p[0], p[1], p[2]); }).filter(Boolean);
    if (pts.length < 4) return 9999;
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    return Math.max(Math.max.apply(0, xs) - Math.min.apply(0, xs), Math.max.apply(0, ys) - Math.min.apply(0, ys));
  }

  // 2D layer: floor grid (while adjusting), size callouts, tape, rotate handle.
  function overlay(wM, lM) {
    var d = S.disp; ctx.clearRect(0, 0, d.w, d.h);
    if (S.adjust) drawGrid();
    var corners = rugCorners(wM, lM, SPEC.thicknessMm / 1000).map(function (p) { return scrOf(p[0], p[1], p[2]); });
    var ok = corners.every(Boolean);
    if (S.dims && ok && !S.compare) drawDims(corners, wM, lM);
    if (S.tape && tapePts) drawTape();
    // rotate handle beside the rug's nearest corner
    if (ok && !S.compare && !S.tape) {
      var near = 0; corners.forEach(function (p, i) { if (p[1] > corners[near][1]) near = i; });
      var cen = scrOf(S.rug.x, 0, S.rug.z), p = corners[near];
      if (cen) {
        var dx = p[0] - cen[0], dy = p[1] - cen[1], L = Math.hypot(dx, dy) || 1;
        var hx = clamp(p[0] + dx / L * 30, 24, d.w - 24), hy = clamp(p[1] + dy / L * 30, 24, d.h - 24);
        rotor.style.left = hx + 'px'; rotor.style.top = hy + 'px'; rotor.hidden = false;
      }
    } else rotor.hidden = true;
  }
  function seg(a, b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  function pill(text, x, y) {
    ctx.font = '600 12.5px "HKGrotesk-Bold","HKGrotesk-Regular",system-ui,sans-serif';
    var w = ctx.measureText(text).width + 14, hh = 22;
    x = clamp(x, w / 2 + 4, S.disp.w - w / 2 - 4); y = clamp(y, hh / 2 + 4, S.disp.h - hh / 2 - 4);
    ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 4;
    var r = 11; ctx.beginPath();
    ctx.moveTo(x - w / 2 + r, y - hh / 2); ctx.arcTo(x + w / 2, y - hh / 2, x + w / 2, y + hh / 2, r); ctx.arcTo(x + w / 2, y + hh / 2, x - w / 2, y + hh / 2, r);
    ctx.arcTo(x - w / 2, y + hh / 2, x - w / 2, y - hh / 2, r); ctx.arcTo(x - w / 2, y - hh / 2, x + w / 2, y - hh / 2, r); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#2c2c2c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 0.5);
    return [x - w / 2, y - hh / 2, w, hh];
  }
  var tapeLabelBox = null;
  function drawDims(cs, wM, lM) {
    // label the two edges nearest the camera: one width edge, one length edge
    var edges = [[0, 1, wM], [1, 2, lM], [2, 3, wM], [3, 0, lM]].map(function (e) {
      var a = cs[e[0]], b = cs[e[1]]; return { a: a, b: b, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], len: e[2] };
    });
    var wE = edges[0].m[1] > edges[2].m[1] ? edges[0] : edges[2];
    var lE = edges[1].m[1] > edges[3].m[1] ? edges[1] : edges[3];
    var cen = [(cs[0][0] + cs[2][0]) / 2, (cs[0][1] + cs[2][1]) / 2];
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    [wE, lE].forEach(function (e) {
      var nx = e.m[0] - cen[0], ny = e.m[1] - cen[1], L = Math.hypot(nx, ny) || 1, off = 14;
      var a = [e.a[0] + nx / L * off, e.a[1] + ny / L * off], b = [e.b[0] + nx / L * off, e.b[1] + ny / L * off];
      seg(a, b);
      ctx.setLineDash([]); seg([a[0] - nx / L * 6, a[1] - ny / L * 6], [a[0] + nx / L * 4, a[1] + ny / L * 4]);
      seg([b[0] - nx / L * 6, b[1] - ny / L * 6], [b[0] + nx / L * 4, b[1] + ny / L * 4]); ctx.setLineDash([4, 3]);
      pill(len(e.len * 100), (a[0] + b[0]) / 2 + nx / L * 16, (a[1] + b[1]) / 2 + ny / L * 16);
    });
    ctx.setLineDash([]);
  }
  function drawTape() {
    var a = scrOf(tapePts[0][0], 0, tapePts[0][1]), b = scrOf(tapePts[1][0], 0, tapePts[1][1]);
    if (!a || !b) return;
    pinA.style.left = a[0] + 'px'; pinA.style.top = a[1] + 'px'; pinB.style.left = b[0] + 'px'; pinB.style.top = b[1] + 'px';
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 3; seg(a, b);
    ctx.shadowBlur = 0; ctx.strokeStyle = '#B77E45'; ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]); seg(a, b); ctx.setLineDash([]);
    tapeLabelBox = pill(len(tapeLen()) + (S.scene && S.scene.own ? '  ✎' : ''), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 18);
  }
  function drawGrid() {
    // 50 cm squares aligned with the rug, 4 m around it; segments clipped at the camera
    var c = Math.cos(S.rug.yaw), s = Math.sin(S.rug.yaw), N = 8, step = 0.5;
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.75)';
    function W2(lx, lz) { return [S.rug.x + c * lx + s * lz, S.rug.z - s * lx + c * lz]; }
    for (var i = -N; i <= N; i++) {
      [[W2(i * step, -N * step), W2(i * step, N * step)], [W2(-N * step, i * step), W2(N * step, i * step)]].forEach(function (ln) {
        var segs = clipFloorSeg(ln[0], ln[1]); if (!segs) return;
        ctx.strokeStyle = i === 0 ? 'rgba(183,126,69,.95)' : 'rgba(255,255,255,.7)';
        seg(segs[0], segs[1]);
      });
    }
    var hv = horizonV(S.cam), y = toScr(0, hv)[1];
    ctx.setLineDash([8, 6]); ctx.strokeStyle = 'rgba(183,126,69,.9)'; seg([0, y], [S.disp.w, y]); ctx.setLineDash([]);
  }
  function clipFloorSeg(a, b) {
    // keep the part of a floor segment that is in front of the camera (z' > 0.15 m)
    var c = S.cam, cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    function z2(p) { return sp * c.h + cp * -p[1]; }
    var za = z2(a), zb = z2(b), lim = 0.15;
    if (za < lim && zb < lim) return null;
    if (za < lim) { var t = (lim - za) / (zb - za); a = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    if (zb < lim) { var t2 = (lim - zb) / (za - zb); b = [b[0] + (a[0] - b[0]) * t2, b[1] + (a[1] - b[1]) * t2]; }
    var A = scrOf(a[0], 0, a[1]), B = scrOf(b[0], 0, b[1]);
    return A && B ? [A, B] : null;
  }

  /* ------------------------------------------------------------ interaction */
  function bindStage() {
    var pts = {}, mode = null, grab = null, start = null, moved = false;
    function local(e) { var r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    function ids() { return Object.keys(pts); }
    stage.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.frrv-tool,.frrv-adjust')) return;
      if (!S.cam) return;
      var p = local(e);
      // tape label: tap to correct the scale (own photo)
      if (S.tape && tapeLabelBox && S.scene && S.scene.own) {
        var b = tapeLabelBox;
        if (p[0] >= b[0] && p[0] <= b[0] + b[2] && p[1] >= b[1] && p[1] <= b[1] + b[3]) { correctTape(); return; }
      }
      stage.setPointerCapture && stage.setPointerCapture(e.pointerId);
      pts[e.pointerId] = p;
      var pin = e.target.closest('.frrv-pin'), rot = e.target.closest('.frrv-rotor');
      if (ids().length === 1) {
        if (pin) { mode = 'pin'; grab = pin.getAttribute('data-pin') === 'a' ? 0 : 1; }
        else if (rot) { mode = 'rotor'; var cen = scrOf(S.rug.x, 0, S.rug.z); grab = { cen: cen, a0: Math.atan2(p[1] - cen[1], p[0] - cen[0]), yaw: S.rug.yaw }; }
        else {
          var f = floorAt(p[0], p[1]);
          if (!f) { mode = null; return; }
          mode = 'move'; grab = { f: f, x: S.rug.x, z: S.rug.z };
        }
        start = p; moved = false; stage.classList.add('is-drag');
      } else if (ids().length === 2) {
        var k = ids(), a = pts[k[0]], b = pts[k[1]], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], fm = floorAt(m[0], m[1]);
        mode = 'two'; grab = { ang: Math.atan2(b[1] - a[1], b[0] - a[0]), yaw: S.rug.yaw, f: fm, x: S.rug.x, z: S.rug.z };
      }
      hideHint();
    });
    stage.addEventListener('pointermove', function (e) {
      if (!(e.pointerId in pts)) return;
      var p = local(e); pts[e.pointerId] = p;
      if (start && Math.hypot(p[0] - start[0], p[1] - start[1]) > 3) moved = true;
      if (mode === 'move') {
        var f = floorAt(p[0], p[1]); if (!f) return;
        setRugPos(grab.x + f[0] - grab.f[0], grab.z + f[1] - grab.f[1]);
        if (moved) track('pdp_room_interaction', 'move', null, e.pointerType, null, true);
      } else if (mode === 'pin') {
        var f2 = floorAt(p[0], p[1]); if (f2) { tapePts[grab] = f2; redraw(); }
        track('pdp_room_interaction', 'tape_drag', null, e.pointerType, null, true);
      } else if (mode === 'rotor') {
        var a1 = Math.atan2(p[1] - grab.cen[1], p[0] - grab.cen[0]);
        // screen angle → floor angle: close enough for a handle, and it feels direct
        S.rug.yaw = grab.yaw - (a1 - grab.a0); redraw();
        track('pdp_room_interaction', 'rotate', 'free', 'handle', null, true);
      } else if (mode === 'two' && ids().length === 2) {
        var k = ids(), a = pts[k[0]], b = pts[k[1]];
        var ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        S.rug.yaw = grab.yaw - (ang - grab.ang);
        var m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], fm = floorAt(m[0], m[1]);
        if (fm && grab.f) setRugPos(grab.x + fm[0] - grab.f[0], grab.z + fm[1] - grab.f[1]); else redraw();
        track('pdp_room_interaction', 'rotate', 'free', 'twist', null, true);
      }
    });
    function up(e) {
      if (!(e.pointerId in pts)) return;
      delete pts[e.pointerId];
      if (!ids().length) { mode = null; stage.classList.remove('is-drag'); }
      else if (mode === 'two') { // one finger lifted: carry on as a single-finger move
        var p = pts[ids()[0]], f = floorAt(p[0], p[1]);
        mode = f ? 'move' : null; grab = f ? { f: f, x: S.rug.x, z: S.rug.z } : null; start = p;
      }
    }
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    // keyboard: arrows move 10 cm, R turns
    stage.tabIndex = 0;
    stage.addEventListener('keydown', function (e) {
      var step = 0.1, c = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (c) { e.preventDefault(); setRugPos(S.rug.x + c[0], S.rug.z + c[1]); }
      if (e.key === 'r' || e.key === 'R') turn(Math.PI / 2);
    });
  }
  function setRugPos(x, z) {
    // keep the rug's centre on the visible floor, in front of the camera
    var c = S.cam, d = S.disp, p = proj(c, x, 0, z);
    if (!p || p[2] < 0.6) return;
    var s = toScr(p[0], p[1]), hv = toScr(0, horizonV(c))[1];
    if (s[0] < -d.w * 0.25 || s[0] > d.w * 1.25 || s[1] > d.h * 1.2 || s[1] < Math.max(hv + 20, -d.h)) return;
    S.rug.x = x; S.rug.z = z; redraw();
  }
  var hintGone = false;
  function hideHint() { if (hintGone) return; hintGone = true; hintEl.classList.add('is-gone'); }

  /* -------------------------------------------------------------- save image */
  function saveImage() {
    if (!S.cam) return;
    track('pdp_room_interaction', 'save', VARIANTS[S.vi].title, 'button');
    var go = function () {
      frame(now()); // draw synchronously so the WebGL buffer is still readable
      var d = S.disp, out = D.createElement('canvas'), bar = 44 * d.dpr;
      out.width = glc.width; out.height = glc.height + bar;
      var g = out.getContext('2d');
      g.drawImage(glc, 0, 0); g.drawImage(c2d, 0, 0);
      g.fillStyle = '#fff'; g.fillRect(0, glc.height, out.width, bar);
      g.fillStyle = '#433122'; g.font = (15 * d.dpr) + 'px "IvyPrestoDisplay-Regular",Georgia,serif'; g.textBaseline = 'middle';
      g.fillText('FABLEROOM', 14 * d.dpr, glc.height + bar / 2);
      g.font = (12.5 * d.dpr) + 'px "HKGrotesk-Regular",system-ui,sans-serif'; g.textAlign = 'right'; g.fillStyle = '#5b4a3c';
      var v = VARIANTS[S.vi]; g.fillText(SPEC.name + ' · ' + sizeLabel(v) + ' · ' + money(v.price), out.width - 14 * d.dpr, glc.height + bar / 2);
      out.toBlob(function (blob) {
        if (!blob) return toast('Couldn’t save the image on this browser.');
        var name = 'fableroom-laleh-' + v.w + 'x' + v.l + '.jpg', file;
        try { file = new File([blob], name, { type: 'image/jpeg' }); } catch (e) {}
        if (file && navigator.canShare && navigator.canShare({ files: [file] }) && W.matchMedia('(pointer:coarse)').matches) {
          navigator.share({ files: [file], title: SPEC.name + ' in my room' }).catch(function () {});
        } else {
          var a = h('a', { href: URL.createObjectURL(blob), download: name }); D.body.appendChild(a); a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
          toast('Saved to your downloads');
        }
      }, 'image/jpeg', 0.9);
    };
    if (R.rugLevel < 3) { toast('Preparing a sharp image…', 1500); ensureHD().then(go); } else go();
  }

  /* ---------------------------------------------------------- theme bridge */
  // Keep the page's own size picker in step, and use the theme's Add to Basket so its
  // cart drawer, analytics and upsells all fire exactly as they do today.
  function pageRadios() { return $$('input.js-option[data-optname="Dimensions"], variant-picker input[type=radio]'); }
  function readPageVariant() {
    var r = pageRadios().filter(function (x) { return x.checked; })[0];
    if (!r) return;
    var m = /(\d+)\s*[x×]\s*(\d+)/.exec(r.value || ''); if (!m) return;
    VARIANTS.forEach(function (v, i) { if (v.w === +m[1] && v.l === +m[2]) { S.vi = i; S.userSized = true; } });
  }
  function syncPageVariant() {
    if (CFG.syncPage === false) return;
    var v = VARIANTS[S.vi]; if (!v) return;
    pageRadios().forEach(function (r) {
      var m = /(\d+)\s*[x×]\s*(\d+)/.exec(r.value || '');
      if (m && +m[1] === v.w && +m[2] === v.l && !r.checked) {
        var lab = r.id && D.querySelector('label[for="' + r.id + '"]');
        if (lab) lab.click(); else { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
      }
    });
  }
  function addToBasket() {
    var v = VARIANTS[S.vi]; if (!v || !v.available) return;
    track('pdp_room_interaction', 'add_to_basket', v.title, S.scene ? S.scene.id : null);
    if (CFG.demo) { toast('Demo: ' + sizeLabel(v) + ' would go in the basket here.', 3000); return; }
    syncPageVariant();
    var btn = $(CFG.atcSelector || 'form.js-product-form-main button[name="add"], form[action*="/cart/add"] button[name="add"]');
    close();
    setTimeout(function () {
      if (btn && !btn.disabled) btn.click();
      else fetch((W.Shopify && Shopify.routes && Shopify.routes.root || '/') + 'cart/add.js', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: v.id, quantity: 1 })
      }).then(function () { W.location.href = '/cart'; });
    }, 120); // let the theme apply the variant first
  }

  /* -------------------------------------------------------------- size finder */
  var BEDS = [['single', 'Single', 90, 190], ['sdouble', 'Small double', 120, 190], ['double', 'Double', 135, 190], ['king', 'King', 150, 200], ['sking', 'Super king', 180, 200]];
  var SOFAS = [['2', '2-seater', 170], ['3', '3-seater', 210], ['corner', 'Corner', 250]];
  var TABLES = [['4', '4-seater', 120, 80, 'rect'], ['6', '6-seater', 180, 90, 'rect'], ['r4', 'Round, 4', 110, 110, 'round']];
  var lastPick = '';
  var F = { room: 'living', sofa: 210, layout: 'front', bed: 'double', table: '4', tl: 120, tw: 80, shape: 'rect', rw: '', rl: '' };
  function buildFinder() {
    var pane = $('.frrv-pane[data-p=size]', root);
    pane.innerHTML =
      '<h3 class="frrv-h">Which size do I need?</h3>' +
      '<p class="frrv-sub">Tell us what the rug goes with. We’ll check each size against the usual UK guidance and draw it to scale.</p>' +
      '<div class="frrv-q">Room</div><div class="frrv-seg" data-k="room"><button type="button" data-v="living">Living room</button><button type="button" data-v="bedroom">Bedroom</button><button type="button" data-v="dining">Dining</button></div>' +
      '<div class="frrv-fq" data-r="living">' +
        '<div class="frrv-q">Sofa</div><div class="frrv-seg" data-k="sofa">' + SOFAS.map(function (s) { return '<button type="button" data-v="' + s[2] + '">' + s[1] + '</button>'; }).join('') + '</div>' +
        '<div class="frrv-in" style="margin-top:8px">or width <input type="number" inputmode="numeric" data-in="sofa" min="80" max="400"> <span class="frrv-u">cm</span></div>' +
        '<div class="frrv-q">Layout</div><div class="frrv-seg" data-k="layout"><button type="button" data-v="front">Front legs on the rug</button><button type="button" data-v="float">Rug in front</button><button type="button" data-v="all">All legs on</button></div>' +
      '</div>' +
      '<div class="frrv-fq" data-r="bedroom">' +
        '<div class="frrv-q">Bed</div><div class="frrv-seg" data-k="bed">' + BEDS.map(function (b) { return '<button type="button" data-v="' + b[0] + '">' + b[1] + '</button>'; }).join('') + '</div>' +
        '<p class="frrv-note">Rug turned sideways under the lower two-thirds of the bed.</p>' +
      '</div>' +
      '<div class="frrv-fq" data-r="dining">' +
        '<div class="frrv-q">Table</div><div class="frrv-seg" data-k="table">' + TABLES.map(function (t) { return '<button type="button" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
        '<div class="frrv-in" style="margin-top:8px">or <input type="number" inputmode="numeric" data-in="tl" min="50" max="400"> × <input type="number" inputmode="numeric" data-in="tw" min="50" max="300"> <span class="frrv-u">cm</span></div>' +
      '</div>' +
      '<div class="frrv-q">Room size <span style="text-transform:none;letter-spacing:0">(optional)</span></div>' +
      '<div class="frrv-in"><input type="number" inputmode="numeric" data-in="rw" min="100" max="2000" placeholder="width"> × <input type="number" inputmode="numeric" data-in="rl" min="100" max="2000" placeholder="length"> <span class="frrv-u">cm</span></div>' +
      '<div class="frrv-result"></div>';
    $$('.frrv-seg[data-k]', pane).forEach(function (g) {
      var k = g.getAttribute('data-k');
      $$('button', g).forEach(function (b) {
        b.addEventListener('click', function () {
          var v = b.getAttribute('data-v');
          if (k === 'sofa') { F.sofa = +v; $('[data-in=sofa]', pane).value = ''; }
          else if (k === 'table') { var t = TABLES.filter(function (x) { return x[0] === v; })[0]; F.table = v; F.tl = t[2]; F.tw = t[3]; F.shape = t[4]; $('[data-in=tl]', pane).value = ''; $('[data-in=tw]', pane).value = ''; }
          else F[k] = v;
          renderFinder(); track('pdp_room_interaction', 'finder_' + k, v, 'button');
        });
      });
    });
    $$('input[data-in]', pane).forEach(function (inp) {
      inp.addEventListener('input', function () {
        var k = inp.getAttribute('data-in'), n = parseFloat(inp.value);
        if (S.unit === 'ft' && n) n = n * 2.54; // ft mode takes inches
        if (k === 'sofa') { if (n > 60) F.sofa = n; }
        else if (k === 'tl' || k === 'tw') { if (n > 40) { F[k] = n; F.table = ''; F.shape = 'rect'; } }
        else F[k] = n > 50 ? n : '';
        renderFinder();
      });
    });
  }
  function grade(v) {
    // returns { s: 'great'|'ok'|'small'|'big', t: reason } for variant v under the current answers
    var L = Math.max(v.w, v.l), Wd = Math.min(v.w, v.l), r;
    if (F.room === 'living') {
      if (F.layout === 'float') r = L >= F.sofa * 0.66 ? { s: 'great', t: 'At least two-thirds the sofa’s width — the usual rule for a rug in front.' } : { s: 'small', t: 'Less than two-thirds of the sofa’s width; it will look lost.' };
      else if (F.layout === 'all') r = (Wd >= 200 && L >= F.sofa + 20) ? { s: 'great', t: 'Room for the sofa and the furniture around it.' } : { s: 'small', t: 'Too small to hold every leg of the sofa and chairs.' };
      else {
        var over = (L - F.sofa) / 2;
        r = over >= 10 ? { s: 'great', t: (over >= 1 ? 'Runs ' + len(over) + ' past each end of the sofa.' : 'As wide as the sofa.') }
          : over >= -15 ? { s: 'ok', t: 'A little narrower than the sofa (' + len(-over) + ' short each end) — fine, but bigger looks more generous.' }
          : { s: 'small', t: 'Much narrower than the sofa; the front legs won’t all sit on it.' };
      }
    } else if (F.room === 'bedroom') {
      var bed = BEDS.filter(function (b) { return b[0] === F.bed; })[0], m = (L - bed[2]) / 2;
      r = m >= 45 ? { s: 'great', t: len(m) + ' of rug either side of the bed — room to step out onto.' }
        : m >= 30 ? { s: 'ok', t: len(m) + ' either side. Works; 45 cm+ feels more generous.' }
        : { s: 'small', t: 'Only ' + len(Math.max(m, 0)) + ' either side — too little to step onto.' };
    } else {
      var tl = Math.max(F.tl, F.tw), tw = Math.min(F.tl, F.tw), mm = Math.min((L - tl) / 2, (Wd - tw) / 2);
      r = mm >= 75 ? { s: 'great', t: len(mm) + ' round the table — chairs stay on the rug when pulled out.' }
        : mm >= 60 ? { s: 'ok', t: len(mm) + ' round the table — just enough for chairs to stay on.' }
        : { s: 'small', t: (mm > 0 ? 'Only ' + len(mm) + ' round the table' : 'Smaller than the table') + ' — chairs will catch the edge (60 cm+ needed).' };
    }
    if (F.rw && F.rl && r.s !== 'small') {
      var rL = Math.max(F.rw, F.rl), rW = Math.min(F.rw, F.rl), gap = Math.min((rL - L) / 2, (rW - Wd) / 2);
      if (gap < 0) r = { s: 'big', t: 'Bigger than the room.' };
      else if (gap < 20) r = { s: 'big', t: 'Leaves only ' + len(gap) + ' of floor at the walls — it will feel cramped.' };
    }
    return r;
  }
  function renderFinder() {
    var pane = root && $('.frrv-pane[data-p=size]', root); if (!pane) return;
    $$('.frrv-seg[data-k]', pane).forEach(function (g) {
      var k = g.getAttribute('data-k'), cur = k === 'sofa' ? String(F.sofa) : F[k];
      $$('button', g).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === cur); });
    });
    $$('.frrv-fq', pane).forEach(function (q) { q.style.display = q.getAttribute('data-r') === F.room ? '' : 'none'; });
    $$('.frrv-u', pane).forEach(function (u) { u.textContent = S.unit === 'ft' ? 'inches' : 'cm'; });
    var grades = VARIANTS.map(grade), rank = { great: 3, ok: 2, big: 1, small: 0 };
    // recommend: the smallest available 'great'; else the best-rated available
    var best = -1;
    VARIANTS.forEach(function (v, i) { if (best < 0 && v.available && grades[i].s === 'great') best = i; });
    if (best < 0) VARIANTS.forEach(function (v, i) { if (v.available && (best < 0 || rank[grades[i].s] > rank[grades[best].s])) best = i; });
    var bv = VARIANTS[best], bg = grades[best], none = bg.s === 'small' || bg.s === 'big';
    var greatOut = VARIANTS.filter(function (v, i) { return !v.available && grades[i].s === 'great' && (i < best || bg.s !== 'great'); })[0];
    var tagTxt = { great: 'Great fit', ok: 'Works', small: 'Too small', big: 'Too big' };
    var res = $('.frrv-result', pane);
    res.innerHTML =
      '<div class="frrv-result-hd"><small>' + (none ? 'Closest fit' : 'Our pick') + '</small><b>' + sizeLabel(bv) + ' · ' + money(bv.price) + '</b><p>' + bg.t +
        (greatOut ? ' ' + sizeLabel(greatOut) + ' would also be great but is sold out right now.' : '') + '</p></div>' +
      diagram(bv) +
      '<ul class="frrv-verdicts">' + VARIANTS.map(function (v, i) {
        return '<li><b>' + sizeLabel(v) + '</b><span class="frrv-tag frrv-tag--' + grades[i].s + '">' + tagTxt[grades[i].s] + '</span><span>' + grades[i].t + (v.available ? '' : ' <em>(sold out)</em>') + '</span></li>';
      }).join('') + '</ul>' +
      '<div class="frrv-result-ft"><button type="button" class="frrv-btn frrv-btn--sm frrv-see">See ' + sizeLabel(bv) + ' in a room</button></div>';
    $('.frrv-see', res).addEventListener('click', function () {
      S.userSized = true; setSize(best, 'finder');
      var want = F.room === 'bedroom' ? 'bedroom' : F.room === 'living' ? 'living' : null;
      setTab('room', 'finder');
      if (!(S.scene && S.scene.own) && want && (!S.scene || S.scene.id !== want)) setScene(want, 'finder');
    });
    var key = F.room + ':' + bv.title;
    if (S.open && S.tab === 'size' && key !== lastPick) { lastPick = key; track('pdp_room_interaction', 'finder_result', key, bg.s); }
  }
  // Top-down plan, to scale: furniture in grey, the rug with its own pattern.
  function diagram(v) {
    var L = Math.max(v.w, v.l), Wd = Math.min(v.w, v.l), items = [], rug, room = null;
    if (F.room === 'living') {
      var sd = 92, sofaY = F.layout === 'float' ? -Wd / 2 - sd - 10 : F.layout === 'all' ? -Wd / 2 + 15 : -Wd / 2 - sd + 22;
      items.push({ x: -F.sofa / 2, y: sofaY, w: F.sofa, h: sd, r: 10, label: 'Sofa ' + len(F.sofa) });
      items.push({ x: -55, y: sofaY + sd + 45, w: 110, h: 60, r: 4, label: 'Coffee table' });
      rug = { x: -L / 2, y: -Wd / 2, w: L, h: Wd };
    } else if (F.room === 'bedroom') {
      var bd = BEDS.filter(function (b) { return b[0] === F.bed; })[0];
      var by = -Wd / 2 - bd[3] / 3;
      items.push({ x: -bd[2] / 2 - 50, y: by, w: 45, h: 45, r: 4 }, { x: bd[2] / 2 + 5, y: by, w: 45, h: 45, r: 4 });
      items.push({ x: -bd[2] / 2, y: by, w: bd[2], h: bd[3], r: 6, label: bd[1] + ' bed' });
      rug = { x: -L / 2, y: -Wd / 2, w: L, h: Wd };
    } else {
      var tl = Math.max(F.tl, F.tw), tw = Math.min(F.tl, F.tw), round = F.shape === 'round';
      rug = { x: -L / 2, y: -Wd / 2, w: L, h: Wd };
      var n = round ? 4 : Math.max(2, Math.round(tl / 60)), cw = 45;
      for (var i = 0; i < n && !round; i++) {
        var cx = -tl / 2 + (i + 0.5) * tl / n - cw / 2;
        items.push({ x: cx, y: -tw / 2 - 60, w: cw, h: 45, r: 6 }, { x: cx, y: tw / 2 + 15, w: cw, h: 45, r: 6 });
      }
      if (round) [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(function (k) { items.push({ x: k[0] * (tl / 2 + 38) - cw / 2, y: k[1] * (tw / 2 + 38) - 22, w: cw, h: 45, r: 6 }); });
      items.push({ x: -tl / 2, y: -tw / 2, w: tl, h: tw, r: round ? tl / 2 : 4, label: 'Table ' + len(tl) + (round ? '' : ' × ' + len(tw)) });
    }
    if (F.rw && F.rl) { var rL = Math.max(F.rw, F.rl), rW = Math.min(F.rw, F.rl); room = { x: -rL / 2, y: -rW / 2, w: rL, h: rW }; }
    var all = items.concat([rug], room ? [room] : []);
    var x0 = Math.min.apply(0, all.map(function (b) { return b.x; })) - 30, y0 = Math.min.apply(0, all.map(function (b) { return b.y; })) - 30;
    var x1 = Math.max.apply(0, all.map(function (b) { return b.x + b.w; })) + 30, y1 = Math.max.apply(0, all.map(function (b) { return b.y + b.h; })) + 50;
    var vw = x1 - x0, vh = y1 - y0, fs = Math.max(vw, vh) / 26;
    function rect(b, fill, stroke, extra) { return '<rect x="' + b.x + '" y="' + b.y + '" width="' + b.w + '" height="' + b.h + '" rx="' + (b.r || 0) + '" fill="' + fill + '" stroke="' + stroke + '" ' + (extra || '') + '/>'; }
    // the rug image is portrait; rotate it 90° so its long side runs across
    var img = '<g transform="translate(' + rug.x + ',' + (rug.y + rug.h) + ') rotate(-90)"><image href="' + asset('laleh-rug-sm.webp') + '" width="' + rug.h + '" height="' + rug.w + '" preserveAspectRatio="none"/></g>';
    var svg = '<svg class="frrv-diag" viewBox="' + x0 + ' ' + y0 + ' ' + vw + ' ' + vh + '" role="img" aria-label="Plan view: ' + sizeLabel(v) + ' rug with your furniture, to scale">' +
      (room ? rect(room, '#FBF8F3', '#BFB3A5', 'stroke-width="' + fs / 6 + '" stroke-dasharray="' + fs / 2 + ' ' + fs / 3 + '"') : '') +
      img + rect(rug, 'none', '#B77E45', 'stroke-width="' + fs / 7 + '"') +
      items.map(function (b) {
        return rect(b, 'rgba(120,108,98,.78)', 'rgba(70,60,52,.9)', 'stroke-width="' + fs / 10 + '"') +
          (b.label ? '<text x="' + (b.x + b.w / 2) + '" y="' + (b.y + b.h / 2) + '" font-size="' + fs * 0.9 + '" fill="#fff" text-anchor="middle" dominant-baseline="middle" font-family="HKGrotesk-Regular,system-ui,sans-serif">' + b.label + '</text>' : '');
      }).join('') +
      '<text x="' + (rug.x + rug.w / 2) + '" y="' + (rug.y + rug.h + fs * 1.4) + '" font-size="' + fs + '" fill="#7C5723" text-anchor="middle" font-family="HKGrotesk-Regular,system-ui,sans-serif">' + sizeLabel(v) + ' rug</text>' +
      (room ? '<text x="' + (room.x + fs * 0.5) + '" y="' + (room.y + fs * 1.2) + '" font-size="' + fs * 0.85 + '" fill="#8a7a6c" font-family="HKGrotesk-Regular,system-ui,sans-serif">Room ' + len(room.w) + ' × ' + len(room.h) + '</text>' : '') +
      '</svg>';
    return svg;
  }

  /* ------------------------------------------------------------ good to know */
  function buildKnow() {
    var pane = $('.frrv-pane[data-p=know]', root), t = SPEC.thicknessMm;
    var facts = CFG.facts || [
      [I.door, 'How thick is it?', SPEC.pileBand + ', a dense ' + SPEC.pileType + ' pile — about ' + (t / 10).toFixed(1) + ' cm in all with the backing <span class="frrv-est">(estimate)</span>. Most UK internal doors are trimmed about 1 cm above the floor, so check before a door swings over it.', 'door'],
      [I.heat, 'Underfloor heating', 'Wool works over underfloor heating. A rug slows the heat coming through that patch, so pair it with a thin felt underlay rather than a thick rubber one.'],
      [I.layer, 'Wood, laminate or tiles', 'Use a non-slip underlay — it stops the rug creeping and keeps the corners flat.'],
      [I.paw, 'Pets', 'This is a loop pile, so a claw can catch a loop. Keep nails trimmed and snip — never pull — any loop that lifts.'],
      [I.leaf, 'The first few weeks', 'Some shedding is normal for the first few months and eases with low-suction vacuuming. A mild latex smell fades within 1–2 weeks of airing.'],
      [I.box, 'Delivery', 'Arrives rolled (the 140 × 200 cm box is 143 × 18 × 18 cm, 10.1 kg). Express delivery in 4 working days to mainland UK. Lay it flat for a day; roll it the other way briefly if a corner curls.'],
      [I.home, 'Where it works best', 'Bedrooms, living rooms and studies — low-to-medium traffic. Not the main rug in a busy hallway.'],
      [I.back, 'Get the size right first', 'Returns are within 14 days, and a collection fee applies unless the rug is faulty — so it’s worth checking the size in your room first. Handmade sizes can vary by 2–3%.']
    ];
    pane.innerHTML = '<h3 class="frrv-h">Good to know</h3><p class="frrv-sub">What people in the UK ask before buying a wool rug.</p>' +
      '<ul class="frrv-facts">' + facts.map(function (f) {
        return '<li><i>' + f[0] + '</i><div><h4>' + f[1] + '</h4><p>' + f[2] + '</p>' + (f[3] === 'door' ? doorWidget() : '') + '</div></li>';
      }).join('') + '</ul>';
    var inp = $('#frrv-gap', pane);
    if (inp) inp.addEventListener('input', function () { renderDoor(); track('pdp_room_interaction', 'door_check', inp.value, 'slider', null, true); });
    renderDoor();
  }
  function doorWidget() {
    return '<div class="frrv-door"><label for="frrv-gap" style="font-size:12.5px;color:#5b4a3c">Gap under your door: <b class="frrv-gapv"></b></label>' +
      '<input id="frrv-gap" type="range" min="2" max="30" step="1" value="10"><div class="frrv-door-out" aria-live="polite"></div>' +
      '<p class="frrv-note" style="margin-top:4px">Close the door and slide a ruler under it.</p></div>';
  }
  function renderDoor() {
    var inp = root && $('#frrv-gap', root); if (!inp) return;
    var g = +inp.value, t = SPEC.thicknessMm, mm = function (x) { return S.unit === 'ft' ? (x / 25.4).toFixed(2) + ' in' : x + ' mm'; };
    $('.frrv-gapv', root).textContent = mm(g);
    var out = $('.frrv-door-out', root);
    out.innerHTML = g >= t + 3 ? '<b style="color:#2f5a2a">Clears it.</b> A ' + mm(g) + ' gap gives the rug (~' + mm(t) + ') room to pass under.'
      : g >= t - 2 ? '<b style="color:#7a5a12">Tight.</b> The pile squashes a little, but the door may drag. Keep the rug just outside the door’s swing.'
      : '<b style="color:#8a2f1f">Won’t clear.</b> Place the rug so the door doesn’t open over it.';
  }

  /* ---------------------------------------------------------------- open/close */
  var lastFocus = null, scrollY = 0, openedAt = 0;
  function open(tab, src) {
    build();
    if (!R) {
      try { R = new Renderer(glc); }
      catch (e) {
        track('pdp_room_view', 'unsupported', String(e.message || e).slice(0, 40));
        R = null; tab = tab === 'room' ? 'size' : tab;
        $('.frrv-tabs [data-t=room]', root).style.display = 'none';
      }
    }
    lastFocus = D.activeElement;
    readPageVariant(); renderSizes(); renderFinder();
    S.open = true; openedAt = now();
    scrollY = W.scrollY; D.documentElement.style.overflow = 'hidden';
    root.classList.add('is-open'); root.setAttribute('data-tab', S.tab);
    requestAnimationFrame(function () { root.classList.add('is-in'); layout(); });
    S.tab = null; setTab(tab || 'room', src || 'open');
    if (R && !S.scene) setScene(SCENES[0].id, null);
    setTimeout(function () { var x = $('.frrv-x', root); x && x.focus({ preventScroll: true }); }, 60);
    track('pdp_room_view', 'open', tab || 'room', src, now() - T0);
  }
  function close() {
    if (!S.open) return;
    S.open = false; root.classList.remove('is-in');
    setTimeout(function () { if (!S.open) root.classList.remove('is-open'); }, 220);
    D.documentElement.style.overflow = ''; W.scrollTo(0, scrollY);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    track('pdp_room_view', 'close', S.tab, null, now() - openedAt);
  }

  // keep in step with the page's own size buttons
  D.addEventListener('on:variant:change', function (e) {
    var v = e.detail && e.detail.variant; if (!v || !S.open) return;
    VARIANTS.forEach(function (x, i) { if (x.id === v.id && i !== S.vi) { S.vi = i; renderSizes(); redraw(); } });
  });

  W.FRRV = { ready: true, version: '1.0.0', open: open, close: close,
    _dbg: { S: S, redraw: redraw, setScene: setScene, setSize: setSize, setTab: setTab, layout: layout, scenes: SCENES } };
  pending.forEach(function (a) { open(a[0], a[1]); });
})();
