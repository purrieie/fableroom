import {
  Scene, Group, PerspectiveCamera, DirectionalLight, AmbientLight,
  Mesh, RingGeometry, MeshBasicMaterial, PlaneGeometry, CanvasTexture,
  Matrix4, Vector3, DoubleSide, SRGBColorSpace
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import { createCameraAR } from './camera-ar.js';

/* ---------------------------------------------------------------------------
   "View in your space".

   Tracked AR needs ARCore or ARKit, and a large share of Android phones have
   neither. So there is a floor underneath everything:

     · iOS / WebKit  → AR Quick Look. ARKit is on every supported iPhone, so
                       this is dependable. Needs a USDZ, built from the glTF.
     · Android       → WebXR immersive-ar where the phone really supports it.
     · everywhere    → camera passthrough. No ARCore, no ARKit, no install:
                       just the rear camera with the product composited over
                       it at true size. Not tracked, but it never fails.

   The tracked paths are attempted first and fall through to passthrough on any
   failure, so a tap always ends in something rather than an apology.
--------------------------------------------------------------------------- */

const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);   // iPadOS
const ANDROID = /Android/i.test(navigator.userAgent);
// Passthrough is for phones. Flipping on a laptop webcam because someone
// clicked a button on a product page would be startling, not useful.
const TOUCH = (window.matchMedia && matchMedia('(pointer: coarse)').matches) ||
  (navigator.maxTouchPoints || 0) > 0;

function quickLookSupported() {
  const a = document.createElement('a');
  return !!(a.relList && a.relList.supports && a.relList.supports('ar')) && IOS;
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// A phone can advertise WebXR and then refuse the session — usually ARCore
// missing or the model unsupported. Remember that, so return visits skip the
// prompt and go straight to the path that works here.
const FAILED_KEY = 'ar:webxr-refused';
function webxrRefusedBefore() {
  try { return localStorage.getItem(FAILED_KEY) === '1'; } catch (e) { return false; }
}
function rememberWebxrRefused() {
  try { localStorage.setItem(FAILED_KEY, '1'); } catch (e) { /* private mode */ }
}

function describe(err) {
  if (!err) return 'unknown error';
  const name = err.name || '';
  const msg = String(err.message || err);
  return name && msg.indexOf(name) !== 0 ? name + ': ' + msg : msg;
}

/* --------------------------- shadow under the piece ------------------------ */
function arShadow(radius) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  for (let i = 0; i <= 32; i++) {
    const d = i / 32;
    const e = Math.min(1, Math.max(0, (d - 0.5) / 0.5));
    const a = 0.38 * Math.pow(1 - e * e, 2.0);
    grd.addColorStop(d, `rgba(0,0,0,${a.toFixed(4)})`);
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const m = new Mesh(
    new PlaneGeometry(radius * 2.5, radius * 2.5),
    new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.004;
  return m;
}

export function createAR(opts) {
  const { renderer, env, getModel, ui, canvas } = opts;
  const title = opts.title || document.title || 'Product';
  // Where a hosted copy of the AR model would live, if one has been uploaded
  // next to the page. Only meaningful over http(s).
  let modelPromise = null;
  let usdzUrl = null;
  let session = null;

  function loadModel() {
    if (modelPromise) return modelPromise;
    if (typeof opts.getLoadedModel === 'function') {
      const already = opts.getLoadedModel();
      if (already) {
        modelPromise = Promise.resolve(already);
        return modelPromise;
      }
    }
    if (typeof getModel !== 'function') {
      return Promise.reject(new Error('no AR model available'));
    }
    modelPromise = new Promise((resolve, reject) => {
      let bytes;
      try { bytes = b64ToBytes(getModel()); }
      catch (e) { reject(e); return; }
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      loader.parse(bytes.buffer, '', (gltf) => {
        gltf.scene.traverse((o) => {
          if (o.isMesh && o.material) {
            o.material.side = DoubleSide;
            o.material.envMapIntensity = 1.0;
            // Tells USDZExporter to re-encode as JPEG rather than PNG, which
            // is the difference between a ~3 MB and a ~9 MB Quick Look file.
            if (o.material.map) o.material.map.userData.mimeType = 'image/jpeg';
          }
        });
        resolve(gltf.scene);
      }, reject);
    });
    return modelPromise;
  }

  /* ============================ iOS: AR Quick Look ========================= */
  let usdzPromise = null;
  function buildUSDZ() {
    if (usdzUrl) return Promise.resolve(usdzUrl);
    if (usdzPromise) return usdzPromise;
    usdzPromise = (async () => {
      const model = await loadModel();
      const scene = new Scene();
      const holder = new Group();
      holder.add(model.clone(true));
      scene.add(holder);
      const bytes = await new USDZExporter().parseAsync(scene, { maxTextureSize: 1024 });
      usdzUrl = URL.createObjectURL(new Blob([bytes], { type: 'model/vnd.usdz+zip' }));
      return usdzUrl;
    })();
    usdzPromise.catch(() => { usdzPromise = null; });
    return usdzPromise;
  }

  /* ============================ Android: WebXR ============================= */
  async function requestARSession() {
    // Ask for the session while the tap is still fresh. Chrome requires
    // transient user activation here, and anything slow in front of it — model
    // decoding, scene building — risks spending that activation before we ask.
    const base = { requiredFeatures: ['hit-test'] };
    const withOverlay = ui.overlay
      ? Object.assign({}, base, { optionalFeatures: ['dom-overlay'],
                                  domOverlay: { root: ui.overlay } })
      : base;
    try {
      return await navigator.xr.requestSession('immersive-ar', withOverlay);
    } catch (err) {
      if (withOverlay === base) throw err;
      // Some builds reject the whole descriptor over the overlay rather than
      // just skipping the optional feature. Losing the overlay costs us the
      // on-screen hints, which beats losing AR.
      return await navigator.xr.requestSession('immersive-ar', base);
    }
  }

  async function launchWebXR() {
    session = await requestARSession();
    // Show the overlay and bind its gestures whenever we have one. Whether the
    // compositor actually paints it is the browser's call, and guessing wrong
    // used to cost us both the on-screen controls and the ability to place.
    const usingOverlay = !!ui.overlay;

    let model;
    try {
      model = await loadModel();
    } catch (err) {
      try { session.end(); } catch (e) {}
      session = null;
      throw err;
    }

    const scene = new Scene();
    scene.environment = env || null;

    const key = new DirectionalLight(0xffffff, 1.4);
    key.position.set(0.6, 3.2, 1.1);
    scene.add(key);
    scene.add(new AmbientLight(0xffffff, 0.5));

    const piece = new Group();
    piece.add(model);
    piece.add(arShadow(0.6));
    piece.visible = false;
    scene.add(piece);

    const reticle = new Mesh(
      new RingGeometry(0.10, 0.125, 48).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 })
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    const camera = new PerspectiveCamera();

    ui.onSessionStart(usingOverlay);
    renderer.xr.enabled = true;
    await renderer.xr.setSession(session);

    const localSpace = await session.requestReferenceSpace('local');
    const viewerSpace = await session.requestReferenceSpace('viewer');
    let hitSource = await session.requestHitTestSource({ space: viewerSpace });

    let placed = false;
    let lastHit = null;
    const tmp = new Matrix4();
    const pos = new Vector3();

    function placeAtReticle() {
      if (!lastHit) return;
      pos.setFromMatrixPosition(lastHit);
      piece.position.copy(pos);
      if (!placed) {
        // Face the piece towards wherever the viewer is standing.
        const cam = renderer.xr.getCamera();
        const camPos = new Vector3().setFromMatrixPosition(cam.matrixWorld);
        piece.rotation.y = Math.atan2(camPos.x - pos.x, camPos.z - pos.z);
      }
      piece.visible = true;
      placed = true;
      ui.onPlaced();
    }

    /* --- gestures on the DOM overlay: tap to place, drag to spin --- */
    let touchStart = null, startRot = 0, moved = false;
    const onDown = (e) => {
      if (e.target.closest && e.target.closest('[data-ar-btn]')) return;
      const t = e.touches ? e.touches[0] : e;
      touchStart = { x: t.clientX, y: t.clientY, t: Date.now() };
      startRot = piece.rotation.y;
      moved = false;
    };
    const onMove = (e) => {
      if (!touchStart) return;
      const t = e.touches ? e.touches[0] : e;
      const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
      if (!moved && Math.hypot(dx, dy) < 10) return;
      moved = true;
      if (placed) piece.rotation.y = startRot + (dx / Math.max(window.innerWidth, 1)) * Math.PI * 2;
    };
    const onUp = () => {
      if (touchStart && !moved && Date.now() - touchStart.t < 600) placeAtReticle();
      touchStart = null;
    };
    if (ui.overlay) {
      ui.overlay.addEventListener('touchstart', onDown, { passive: true });
      ui.overlay.addEventListener('touchmove', onMove, { passive: true });
      ui.overlay.addEventListener('touchend', onUp);
      ui.overlay.addEventListener('touchcancel', onUp);
    }
    // Without an overlay this is the only way in, and it also covers taps that
    // the overlay never sees.
    session.addEventListener('select', () => placeAtReticle());

    renderer.setAnimationLoop((time, frame) => {
      if (!frame) return;
      const results = frame.getHitTestResults(hitSource);
      if (results.length) {
        const pose = results[0].getPose(localSpace);
        if (pose) {
          tmp.fromArray(pose.transform.matrix);
          lastHit = tmp.clone();
          reticle.matrix.copy(tmp);
          reticle.visible = !placed;
          ui.onSurfaceFound();
        }
      } else {
        reticle.visible = false;
      }
      renderer.render(scene, camera);
    });

    const cleanup = () => {
      if (ui.overlay) {
        ui.overlay.removeEventListener('touchstart', onDown);
        ui.overlay.removeEventListener('touchmove', onMove);
        ui.overlay.removeEventListener('touchend', onUp);
      }
      if (hitSource) { try { hitSource.cancel(); } catch (e) {} hitSource = null; }
      renderer.setAnimationLoop(null);
      renderer.xr.enabled = false;
      session = null;
      ui.onSessionEnd();
    };
    session.addEventListener('end', cleanup);
    return { end: () => session && session.end() };
  }

  /* ================================ capability ============================= */
  const cam = createCameraAR({ renderer, canvas, env, ui,
                               realSize: opts.realSize || '',
                               makeShadow: arShadow });

  let mode = null;              // 'quicklook' | 'webxr' | 'camera' | 'none'
  let webxrSupported = false;

  const ready = (async () => {
    if (navigator.xr && navigator.xr.isSessionSupported) {
      try { webxrSupported = await navigator.xr.isSessionSupported('immersive-ar'); }
      catch (e) { webxrSupported = false; }
    }
    if (IOS && quickLookSupported()) return (mode = 'quicklook');
    if (ANDROID && webxrSupported && !webxrRefusedBefore()) return (mode = 'webxr');
    if (cameraUsable()) return (mode = 'camera');
    if (webxrSupported) return (mode = 'webxr');
    return (mode = 'none');
  })();

  function cameraUsable() {
    return TOUCH && cam.supported() && window.isSecureContext;
  }

  /* ---- the floor: camera passthrough, used directly or as the fallback ---- */
  async function launchCamera() {
    const model = await loadModel();
    await cam.start(model.clone(true));
  }

  return {
    ready,
    mode: () => mode,
    isSupported: () => mode !== null && mode !== 'none',
    diagnostics: () => ({
      mode, ios: IOS, android: ANDROID,
      hasXR: !!navigator.xr, webxrSupported,
      protocol: location.protocol, webxrRefusedBefore: webxrRefusedBefore(),
      camera: cam.supported(), secure: window.isSecureContext, touch: TOUCH,
      quickLook: quickLookSupported()
    }),
    buildUSDZ,
    // The armed-link href for whichever platform can use one, so a tap can go
    // straight to the OS without JavaScript in the middle.
    armedHref: async () => {
      await ready;
      if (mode === 'quicklook') return buildUSDZ();
      return null;
    },
    async start() {
      await ready;
      if (mode === 'quicklook') {
        try {
          return await buildUSDZ();
        } catch (err) {
          if (cameraUsable()) { ui.onFellBack && ui.onFellBack(); return await launchCamera(); }
          throw err;
        }
      }
      if (mode === 'webxr') {
        try {
          return await launchWebXR();
        } catch (err) {
          // The phone claimed WebXR and then refused. Rather than telling the
          // user their device is unsupported, drop to the path that always
          // works. Only a declined camera should ever surface as an error.
          if (/denied|NotAllowed|permission/i.test(describe(err))) throw err;
          rememberWebxrRefused();
          if (cameraUsable()) {
            ui.onFellBack && ui.onFellBack();
            return await launchCamera();
          }
          throw err;
        }
      }
      if (mode === 'camera') return launchCamera();
      const e = new Error('AR is not available on this device');
      e.name = 'ARUnsupported';
      throw e;
    },
    stopCamera: () => cam.stop(),
    resetCamera: () => cam.reset(),
    cameraState: () => cam.state(),
    cameraActive: () => cam.isActive(),
    cameraSupported: cameraUsable,
    // Why AR is unavailable, in the user's terms rather than the platform's.
    unavailableReason: () => {
      if (!window.isSecureContext) return 'insecure';
      if (!TOUCH) return 'desktop';
      if (!cam.supported()) return 'nocamera';
      return 'unknown';
    },
    describeError: describe,
    prefetch() { if (mode !== 'none') loadModel().catch(() => {}); },
    endSession() { if (session) { try { session.end(); } catch (e) {} } }
  };
}
