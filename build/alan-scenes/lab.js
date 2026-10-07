/* Scene lab controller (internal test page).
   One scene per row (Person / Room / Backdrop), combinable across rows.
   Nothing is built or fetched until a chip is chosen; the first use of each
   option reports what it actually downloaded and how long it took. */
(function () {
  'use strict';
  var V = window.__belgraveViewerRef, CTXF = window.__fr3dContext || {};
  var stage = document.getElementById('heroWrap'), bdrop = document.getElementById('bdrop');
  var info = document.getElementById('labInfo'), roomBtn = document.getElementById('roomBtn');
  if (!V || !stage) return;

  /* Measured at build time (see build/alan-scenes/measure.mjs). */
  var META = {"a1": {"label": "A1 · FableRoom's own 160 cm figure", "what": "The woman from FableRoom's size diagram, 1.60 m tall beside the table, always turned to face you.", "weight": "13.9 KB image + 5 KB code (shared with A2) · 6 triangles", "notes": "She fades out whenever she would block the table."}, "a2": {"label": "A2 · Clay figure, 160 cm", "what": "A 3D clay mannequin at true height in a relaxed pose — no image, built in code.", "weight": "0 files · 5 KB code · 6.7k triangles", "notes": "Fades out whenever she would block the table."}, "b": {"label": "B · Clay living room", "what": "Sofa 210 × 92 × 80 cm (seat 43 cm), rug 160 × 230 cm, side table and lamp — all true size, in clay so the table is the only real-coloured thing.", "weight": "0 files · 3.9 KB code · 20k triangles", "notes": ""}, "c": {"label": "C · Real FableRoom pieces", "what": "The Natalie rug from its real product photo at 120 × 180 cm, with the Ryan armchair and Solace side table at true size.", "weight": "55 KB rug image + 3.7 KB code · 5.5k triangles", "notes": "Ryan and Solace are stand-ins until the Blender models arrive (real-ryan.glb / real-solace.glb, ≤150 KB each, also loaded only on tap)."}, "d": {"label": "D · Real room photo", "what": "FableRoom's own Alan lifestyle photo (sofa, window, wall hanging) behind the 3D table, sharp.", "weight": "35 KB image · no code", "notes": "The photo stays still when you spin the table, so it reads best near the front view."}};

  var OPT = {
    a1: { builder: 'figure_card' }, a2: { builder: 'figure_clay' },
    b: { builder: 'room_clay' }, c: { builder: 'real_set' },
    // The photo's sofa is ~2 m across: pull the camera back and lower it so the
    // table reads at its true size standing in front of it (tuned by eye on
    // desktop and phone renders).
    d: { backdrop: 'assets/backdrop-room.webp', frame: { hRad: 0.9, vHalf: 0.5, ty: 0.62, phi: 86 } }
  };
  var ctx = {
    viewer: V, U: function (m) { return m / V.metresPerUnit; }, assetBase: 'assets/',
    product: { w: 0.80, h: 0.35, d: 0.80 },
    shadow: function (rm) { return V.contactShadow(rm / V.metresPerUnit); },
    productBlob: function () { return V.productBlob(); },
    loadGLB: function (u) { return V.loadGLB(u); },
    // Blender models present in assets/ (C swaps its stand-ins for these).
    realModels: []
  };
  var built = {}, live = { figure: '', room: '', backdrop: '' }, measured = {}, roomOn = false;

  function kb(n) { return n < 1024 ? n + ' B' : (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB'; }
  function assetsSince(t0) {
    var bytes = 0, files = [];
    performance.getEntriesByType('resource').forEach(function (e) {
      if (e.startTime >= t0 - 1 && /\/assets\//.test(e.name)) {
        bytes += e.transferSize || e.encodedBodySize || 0; files.push(e.name.split('/').pop().split('?')[0]);
      }
    });
    return { bytes: bytes, files: files };
  }

  function render() {
    var keys = [live.figure, live.room, live.backdrop].filter(Boolean);
    info.innerHTML = keys.length ? '' : '<div class="lab__card"><b>Studio (today)</b><span class="n">The product on its own. Pick an option above, or tap <em>Room</em> in the 3D bar.</span></div>';
    keys.forEach(function (k) {
      var m = META[k] || {}, r = measured[k];
      var el = document.createElement('div'); el.className = 'lab__card';
      el.innerHTML = '<b>' + (m.label || k) + '</b>' +
        (m.what ? '<span class="n">' + m.what + '</span><br>' : '') +
        (m.weight ? 'Adds: <span class="m">' + m.weight + '</span><br>' : '') +
        (r ? 'This visit: downloaded <span class="m">' + kb(r.bytes) + '</span>' + (r.files.length ? ' (' + r.files.join(', ') + ')' : ' (code only, no files)') + ', on screen in <span class="m">' + r.ms + ' ms</span><br>' : '') +
        (m.notes ? '<span class="n">' + m.notes + '</span>' : '');
      info.appendChild(el);
    });
  }

  function frameFor() {
    var f = null;
    // A backdrop only frames the shot when no 3D scene is showing.
    if (live.backdrop && !live.figure && !live.room) return OPT[live.backdrop].frame;
    ['figure', 'room'].forEach(function (g) {
      var s = live[g] && built[live[g]]; if (!s || !s.frame) return;
      f = f ? { hRad: Math.max(f.hRad, s.frame.hRad), vHalf: Math.max(f.vHalf, s.frame.vHalf),
                ty: Math.max(f.ty, s.frame.ty), phi: Math.min(f.phi || 90, s.frame.phi || 90) } : s.frame;
    });
    return f;
  }

  function ensure(key) {
    if (built[key]) return Promise.resolve(built[key]);
    var o = OPT[key], t0 = performance.now();
    if (o.backdrop) {
      return new Promise(function (res) {
        var img = new Image();
        img.onload = img.onerror = function () {
          bdrop.style.backgroundImage = 'url(' + o.backdrop + ')';
          built[key] = { backdrop: true };
          requestAnimationFrame(function () { requestAnimationFrame(function () {
            var a = assetsSince(t0); measured[key] = { bytes: a.bytes, files: a.files, ms: Math.round(performance.now() - t0) }; res(built[key]);
          }); });
        };
        img.src = o.backdrop;
      });
    }
    var f = CTXF[o.builder];
    if (!f) return Promise.reject(new Error('builder missing: ' + o.builder));
    return Promise.resolve(f(ctx)).then(function (s) {
      built[key] = s;
      return new Promise(function (res) {
        V.addProp(s.group); s.group.visible = false;
        requestAnimationFrame(function () { requestAnimationFrame(function () {
          var a = assetsSince(t0);
          measured[key] = { bytes: a.bytes, files: a.files, ms: Math.round(performance.now() - t0) };
          res(s);
        }); });
      });
    });
  }

  function apply() {
    Object.keys(built).forEach(function (k) {
      var s = built[k], on = roomOn && (live.figure === k || live.room === k);
      if (s.group) s.group.visible = on;
    });
    stage.classList.toggle('is-backdrop', roomOn && live.backdrop === 'd');
    // Five pins on a table a third of its usual size read as clutter: hide them
    // while a room is showing (the Details button still works in Studio).
    stage.classList.toggle('is-room', roomOn && !!(live.figure || live.room || live.backdrop));
    V.setSceneFrame(roomOn ? frameFor() : null);
    var any = live.figure || live.room || live.backdrop;
    roomBtn.classList.toggle('on', roomOn && !!any);
    roomBtn.setAttribute('aria-pressed', String(roomOn && !!any));
    render();
  }

  function choose(group, key, btn) {
    var row = btn.parentNode;
    [].forEach.call(row.querySelectorAll('.chip'), function (c) { c.classList.toggle('on', c === btn); });
    live[group] = key;
    if (!key) { roomOn = !!(live.figure || live.room || live.backdrop) && roomOn; apply(); return; }
    btn.classList.add('busy');
    ensure(key).then(function () { btn.classList.remove('busy'); roomOn = true; apply(); })
      .catch(function (e) { btn.classList.remove('busy'); console.warn('[lab]', e); });
  }

  [].forEach.call(document.querySelectorAll('.lab__row'), function (row) {
    var g = row.getAttribute('data-group');
    [].forEach.call(row.querySelectorAll('.chip'), function (btn) {
      btn.addEventListener('click', function () { choose(g, btn.getAttribute('data-opt'), btn); });
    });
  });

  // The production-style control: one "Room" button in the 3D bar toggles
  // whatever the lab rows have selected (defaults to the clay room).
  roomBtn.addEventListener('click', function () {
    if (!(live.figure || live.room || live.backdrop)) {
      var b = document.querySelector('.lab__row[data-group="room"] .chip[data-opt="b"]');
      choose('room', 'b', b); return;
    }
    roomOn = !roomOn; apply();
  });

  // Deep links for sharing a specific combination: #a1,b,d
  var pre = (location.hash || '').slice(1).split(',').filter(function (k) { return OPT[k]; });
  if (pre.length) {
    var wait = setInterval(function () {
      if (!stage.classList.contains('is-ready')) return;
      clearInterval(wait);
      pre.forEach(function (k) {
        var g = k === 'd' ? 'backdrop' : (k === 'a1' || k === 'a2' ? 'figure' : 'room');
        choose(g, k, document.querySelector('.lab__row[data-group="' + g + '"] .chip[data-opt="' + k + '"]'));
      });
    }, 200);
  }
  render();
  window.__lab = { live: live, built: built, measured: measured };
})();
