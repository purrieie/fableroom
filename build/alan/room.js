/* Room button (demo page): the chosen scene — FableRoom's 160 cm figure and
   the real FableRoom pieces — built and fetched on the first tap only. */
(function () {
  'use strict';
  var V = window.__belgraveViewerRef, F = window.__fr3dContext || {};
  var stage = document.getElementById('heroWrap'), btn = document.getElementById('roomBtn');
  if (!V || !btn || !F.figure_card || !F.real_set) return;
  var ctx = { viewer: V, U: function (m) { return m / V.metresPerUnit; }, assetBase: 'assets/',
    product: { w: 0.80, h: 0.35, d: 0.80 }, realModels: [],
    shadow: function (rm) { return V.contactShadow(rm / V.metresPerUnit); },
    productBlob: function () { return V.productBlob(); }, loadGLB: function (u) { return V.loadGLB(u); } };
  var scenes = null, on = false, busy = false;
  function union(a, b) { return { hRad: Math.max(a.hRad, b.hRad), vHalf: Math.max(a.vHalf, b.vHalf),
    ty: Math.max(a.ty, b.ty), phi: Math.min(a.phi || 90, b.phi || 90) }; }
  function apply() {
    scenes.forEach(function (s) { s.group.visible = on; });
    V.setSceneFrame(on ? union(scenes[0].frame, scenes[1].frame) : null);
    stage.classList.toggle('is-room', on);
    btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', String(on));
  }
  btn.addEventListener('click', function () {
    if (busy) return;
    if (scenes) { on = !on; apply(); return; }
    busy = true; btn.classList.add('busy');
    Promise.all([F.figure_card(ctx), F.real_set(ctx)]).then(function (r) {
      scenes = r; r.forEach(function (s) { V.addProp(s.group); });
      on = true; busy = false; btn.classList.remove('busy'); apply();
    }).catch(function (e) { busy = false; btn.classList.remove('busy'); console.warn('[room]', e); });
  });
})();
