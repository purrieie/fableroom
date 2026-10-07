/* Inline loader for the room view. Ships inside the snippet; costs no request.
   - Entry buttons are plain HTML in the snippet, so nothing shifts on load.
   - The app script is injected on the first sign of intent (pointer over / touch /
     keyboard focus on an entry), and a tap opens it as soon as it has arrived.
   - A "See it in your room" pill is added over the main gallery image once the
     DOM is ready; it is absolutely positioned, so it cannot move the layout. */
(function () {
  var W = window, D = document, C = W.FRRV_CONFIG || {};
  if (W.FRRV) return;
  var loading = false;
  W.FRRV = { q: [], open: function (tab, src) { W.FRRV.q.push([tab, src]); load(); } };
  function load() {
    if (loading) return; loading = true;
    var s = D.createElement('script'); s.src = C.appSrc; s.async = true; D.head.appendChild(s);
  }
  function hook(el) {
    if (el.__frrv) return; el.__frrv = 1;
    ['pointerenter', 'touchstart', 'focusin'].forEach(function (t) { el.addEventListener(t, load, { passive: true, once: true }); });
    el.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      W.FRRV.open(el.getAttribute('data-frrv-open') || 'room', el.getAttribute('data-frrv-src') || 'entry');
    });
  }
  function init() {
    var g = C.gallerySelector && D.querySelector(C.gallerySelector);
    if (g && !g.querySelector('.frrv-pill')) {
      var b = D.createElement('button');
      b.type = 'button'; b.className = 'frrv-pill';
      b.setAttribute('data-frrv-open', 'room'); b.setAttribute('data-frrv-src', 'gallery');
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 4l9 6.5V20H3z"/><path d="M7 20l2.2-5h5.6L17 20"/></svg>See it in your room';
      g.appendChild(b);
    }
    [].forEach.call(D.querySelectorAll('[data-frrv-open]'), hook);
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init); else init();
})();
