import {
  Scene, Group, PerspectiveCamera, DirectionalLight, AmbientLight, Vector3
} from 'three';

/* ---------------------------------------------------------------------------
   Camera passthrough — the version that works on every phone.

   Real tracked AR needs ARCore or ARKit, and plenty of phones have neither.
   This does not track: the piece does not stay pinned to the floor when you
   walk. What it does do is open the rear camera, stand the product in front of
   it at true size, and let you drag, pinch and turn it until it sits where you
   want — which is the part people actually use, and it needs nothing beyond a
   camera and a browser.
--------------------------------------------------------------------------- */

export function createCameraAR({ renderer, canvas, env, ui, realSize, makeShadow }) {
  let stream = null, active = false, restore = null;

  const scene = new Scene();
  const camera = new PerspectiveCamera(58, 1, 0.05, 60);
  camera.position.set(0, 0, 0);

  const key = new DirectionalLight(0xffffff, 1.25);
  key.position.set(0.8, 3.0, 1.4);
  scene.add(key);
  scene.add(new AmbientLight(0xffffff, 0.55));

  const rig = new Group();       // holds the piece; we move this, not the camera
  scene.add(rig);

  const HOME = { dist: 2.8, x: 0, y: -1.15, rot: 0 };
  camera.rotation.x = -8 * Math.PI / 180;   // phones are held tipped down
  const state = Object.assign({}, HOME);

  function apply() {
    rig.position.set(state.x, state.y, -state.dist);
    rig.rotation.y = state.rot;
  }

  function setModel(obj) {
    while (rig.children.length) rig.remove(rig.children[0]);
    rig.add(obj);
    // Without a contact shadow the product reads as a sticker on the photo.
    if (makeShadow) rig.add(makeShadow(0.62));
    apply();
  }

  /* ------------------------------- gestures ------------------------------- */
  let one = null, two = null;

  function dist(t) {
    return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  }
  function angle(t) {
    return Math.atan2(t[1].clientY - t[0].clientY, t[1].clientX - t[0].clientX);
  }

  const onStart = (e) => {
    if (e.target.closest && e.target.closest('[data-ar-btn]')) return;
    const t = e.touches;
    if (t.length === 1) {
      one = { x: t[0].clientX, y: t[0].clientY, sx: state.x, sy: state.y };
      two = null;
    } else if (t.length >= 2) {
      two = { d: dist(t), a: angle(t), dist: state.dist, rot: state.rot };
      one = null;
    }
  };
  const onMove = (e) => {
    const t = e.touches;
    if (t.length === 1 && one) {
      // Move across the view plane. Scale by distance so the drag tracks the
      // finger no matter how far away the piece currently sits.
      const h = 2 * Math.tan((camera.fov * Math.PI / 180) / 2) * state.dist;
      const w = h * camera.aspect;
      state.x = one.sx + ((t[0].clientX - one.x) / window.innerWidth) * w;
      state.y = one.sy - ((t[0].clientY - one.y) / window.innerHeight) * h;
      apply();
    } else if (t.length >= 2 && two) {
      const scale = dist(t) / Math.max(two.d, 1);
      state.dist = Math.min(9, Math.max(0.9, two.dist / scale));
      state.rot = two.rot + (angle(t) - two.a);
      apply();
    }
  };
  const onEnd = (e) => {
    if (e.touches.length === 0) { one = null; two = null; }
    else if (e.touches.length === 1) {
      one = { x: e.touches[0].clientX, y: e.touches[0].clientY, sx: state.x, sy: state.y };
      two = null;
    }
  };

  function bind(el) {
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
  }
  function unbind(el) {
    el.removeEventListener('touchstart', onStart);
    el.removeEventListener('touchmove', onMove);
    el.removeEventListener('touchend', onEnd);
    el.removeEventListener('touchcancel', onEnd);
  }

  /* -------------------------------- session ------------------------------- */
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }

  async function start(model) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const e = new Error('This browser cannot open the camera.');
      e.name = 'NoCameraAPI';
      throw e;
    }
    // getUserMedia needs a secure context; opened from a file:// path it can
    // never succeed, and the browser's own error does not explain why.
    if (!window.isSecureContext) {
      const e = new Error('Open the page over https — browsers only allow camera access on secure pages.');
      e.name = 'InsecureContext';
      throw e;
    }

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' },
               width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });

    const video = ui.video;
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    video.muted = true;
    try { await video.play(); } catch (e) { /* autoplay of a muted stream is allowed */ }

    scene.environment = env || null;
    setModel(model);
    Object.assign(state, HOME);
    apply();

    // Reuse the hero's WebGL context by moving its canvas into the overlay —
    // a second context is memory the cheap phones do not have to spare.
    restore = { parent: canvas.parentNode, next: canvas.nextSibling, css: canvas.getAttribute('style') || '' };
    canvas.setAttribute('style',
      'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;z-index:1;');
    ui.stage.appendChild(canvas);

    renderer.setClearAlpha(0);
    active = true;
    resize();
    addEventListener('resize', resize, { passive: true });
    bind(ui.overlay);

    ui.onStart();
    renderer.setAnimationLoop(() => {
      if (!active) return;
      renderer.render(scene, camera);
    });
  }

  function stop() {
    if (!active) return;
    active = false;
    renderer.setAnimationLoop(null);
    removeEventListener('resize', resize);
    unbind(ui.overlay);
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    if (ui.video) { ui.video.srcObject = null; }
    if (restore) {
      canvas.setAttribute('style', restore.css);
      if (restore.next) restore.parent.insertBefore(canvas, restore.next);
      else restore.parent.appendChild(canvas);
      restore = null;
    }
    renderer.setClearAlpha(0);
    ui.onStop();
  }

  return {
    start, stop,
    state: () => Object.assign({}, state),
    isActive: () => active,
    reset() { Object.assign(state, HOME); apply(); },
    sizeLabel: () => realSize || '',
    supported: () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
  };
}
