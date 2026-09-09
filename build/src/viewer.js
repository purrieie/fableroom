import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Box3, Vector3, Vector2, Spherical,
  ACESFilmicToneMapping, PMREMGenerator, DirectionalLight, AmbientLight, MathUtils,
  Mesh, PlaneGeometry, MeshBasicMaterial, CanvasTexture,
  SRGBColorSpace, DoubleSide, EquirectangularReflectionMapping,
  BufferGeometry, LineBasicMaterial, LineSegments, Float32BufferAttribute,
  CylinderGeometry, MeshStandardMaterial, Color, Shape, ExtrudeGeometry
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/* ---------------------------------------------------------------------------
   Orbit controls tuned for a product page.
   Desktop : drag = orbit, wheel = dolly.
   Touch   : one finger horizontal = spin (vertical drag scrolls the page, the
             model-viewer convention), two fingers = pinch dolly + free orbit.
             In immersive mode one finger orbits freely.
--------------------------------------------------------------------------- */
class ProductOrbit {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.target = new Vector3(0, 0, 0);
    this.sph = new Spherical(2.15, MathUtils.degToRad(74), MathUtils.degToRad(28));
    this.goal = this.sph.clone();
    this.minR = 0.95; this.maxR = 4.2; this.homeRadius = 2.15;
    this.minPhi = MathUtils.degToRad(14);
    this.maxPhi = MathUtils.degToRad(96);
    this.damping = 0.2;
    this.autoRotate = true;
    this.autoSpeed = 0.16;          // rad / s
    this.idleDelay = 3200;
    this.freeTouch = false;         // true in immersive mode
    this._lastUser = 0;
    this._pointers = new Map();
    this._pinch = null;
    this._axisLock = null;          // 'x' | 'y' | null (touch intent)
    this._startPt = null;
    this._dragging = false;
    this.onFirstInput = null;
    // Pinch zooms toward the point between your fingers, not always toward
    // the object's centre — this is a small ADDITIVE offset to the camera's
    // look-at point, layered on top of `target` rather than replacing it, so
    // orbiting, reset, and every hotspot's flyTo all keep working against the
    // real centre untouched. It grows while you pinch in and eases back to
    // zero the moment you let go — "zoom toward where you point" without
    // leaving the view permanently off-centre once you release.
    this.targetOffset = new Vector3(0, 0, 0);
    this._targetOffsetGoal = new Vector3(0, 0, 0);
    this._pinchAnchorDir = null;    // world-space direction for the current pinch's midpoint
    this._pinchStartRadius = null;
    this._bind();
    this.apply();
  }

  _bind() {
    const d = this.dom;
    d.addEventListener('pointerdown', this._down = (e) => {
      if (e.pointerType === 'touch') return;         // touch handled separately
      d.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this._dragging = true; this._mark();
      d.style.cursor = 'grabbing';
    });
    d.addEventListener('pointermove', this._move = (e) => {
      if (e.pointerType === 'touch') return;
      const p = this._pointers.get(e.pointerId); if (!p) return;
      this._orbitBy((e.clientX - p.x), (e.clientY - p.y));
      p.x = e.clientX; p.y = e.clientY; this._mark();
    });
    const up = (e) => {
      if (e.pointerType === 'touch') return;
      this._pointers.delete(e.pointerId);
      this._dragging = this._pointers.size > 0;
      d.style.cursor = 'grab';
    };
    d.addEventListener('pointerup', up);
    d.addEventListener('pointercancel', up);
    d.addEventListener('pointerleave', up);

    d.addEventListener('wheel', this._wheel = (e) => {
      e.preventDefault();
      // Trackpads emit huge deltas; clamp so one flick can't cross the whole range.
      const dy = Math.max(-90, Math.min(90, e.deltaY));
      this._dolly(Math.pow(0.95, -dy * 0.012));
      this._mark();
    }, { passive: false });

    d.addEventListener('touchstart', this._ts = (e) => {
      this._axisLock = null;
      if (e.touches.length === 1) {
        this._startPt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        if (this.freeTouch) { this._axisLock = 'x'; e.preventDefault(); }
      } else if (e.touches.length >= 2) {
        this._axisLock = 'x';
        const span = this._pinchDist(e);
        // Anchor the gesture: radius is derived from the *total* finger span
        // rather than accumulated per-event ratios, so nothing drifts or steps.
        this._pinch = { span: Math.max(span, 1), smooth: span, radius: this.goal.radius };
        this._startPt = this._pinchMid(e);
        this._pinchStartRadius = this.goal.radius;
        this._pinchAnchorDir = this._screenToTargetOffset(this._startPt.x, this._startPt.y);
        e.preventDefault();
      }
      this._mark();
    }, { passive: false });

    d.addEventListener('touchmove', this._tm = (e) => {
      // A move can arrive without the matching start (gesture began on another
      // element, or a third finger landed and lifted). Re-anchor rather than
      // dereferencing a stale point and throwing out of the handler.
      if (!this._startPt) {
        const t0 = e.touches[0];
        if (t0) this._startPt = { x: t0.clientX, y: t0.clientY };
        return;
      }
      if (e.touches.length === 1) {
        const t = e.touches[0];
        const dx = t.clientX - this._startPt.x, dy = t.clientY - this._startPt.y;
        if (this._axisLock === null) {
          if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
            // Horizontal intent captures the gesture; vertical is left to the page.
            this._axisLock = Math.abs(dx) > Math.abs(dy) * 1.1 ? 'x' : 'y';
          } else return;
        }
        if (this._axisLock === 'y') return;          // page scrolls
        e.preventDefault();
        this._orbitBy(dx, this.freeTouch ? dy : 0);
        this._startPt = { x: t.clientX, y: t.clientY };
        this._mark();
      } else if (e.touches.length >= 2) {
        e.preventDefault();
        const p = this._pinch;
        if (!p) return;
        const mid = this._pinchMid(e);
        // Low-pass the measured span: finger tracking is noisy at ~120 Hz and
        // that noise is what reads as stepping once it reaches the camera.
        p.smooth += (this._pinchDist(e) - p.smooth) * 0.22;
        this.goal.radius = MathUtils.clamp(p.radius * (p.span / Math.max(p.smooth, 1)),
                                           this.minR, this.maxR);
        // Two fingers are the only way to look down at the top on a phone,
        // since one finger has to stay available for scrolling the page. Give
        // the vertical axis full authority; horizontal stays gentle so a pinch
        // does not spin the piece as a side effect.
        this._orbitBy((mid.x - this._startPt.x) * 0.45, (mid.y - this._startPt.y) * 1.35);
        this._startPt = mid;
        this._mark();

        // Zooming in only, and only up to a fraction of the way there — this
        // is a lean towards the pinch point, not a full re-centre on it,
        // which would swing the model further than a pinch should.
        if (this._pinchAnchorDir && this._pinchStartRadius) {
          const zoomedIn = MathUtils.clamp(1 - this.goal.radius / this._pinchStartRadius, 0, 1);
          this._targetOffsetGoal.copy(this._pinchAnchorDir).multiplyScalar(zoomedIn * 0.6);
        }
      }
    }, { passive: false });

    const endTouch = (e) => {
      if (e.touches.length < 2) {
        this._pinch = null;
        // Ease back to centred the moment the pinch ends — update() blends
        // targetOffset toward this goal every frame, same damping as
        // everything else, so this is a smooth settle, not a jump cut.
        this._targetOffsetGoal.set(0, 0, 0);
        this._pinchAnchorDir = null;
      }
      // Lifting one finger mid-pinch hands the gesture to the other, so re-anchor
      // instead of jumping by the leftover delta.
      if (e.touches.length === 1) {
        this._startPt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      if (e.touches.length === 0) { this._axisLock = null; this._startPt = null; }
    };
    d.addEventListener('touchend', this._te = endTouch);
    // Android fires touchcancel when the browser takes the gesture (scroll
    // handoff, notification shade). Without this the controls stay half-armed.
    d.addEventListener('touchcancel', endTouch);
  }

  _pinchDist(e) {
    const a = e.touches[0], b = e.touches[1];
    if (!a || !b) return this._pinch ? this._pinch.smooth : 1;
    return Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY));
  }
  _pinchMid(e) {
    const a = e.touches[0], b = e.touches[1];
    if (!a) return this._startPt || { x: 0, y: 0 };
    if (!b) return { x: a.clientX, y: a.clientY };
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  }
  _mark() {
    this._lastUser = performance.now();
    if (this.onFirstInput) { this.onFirstInput(); this.onFirstInput = null; }
  }
  _orbitBy(dx, dy) {
    const w = this.dom.clientWidth || 1, h = this.dom.clientHeight || 1;
    this.goal.theta -= (dx / w) * Math.PI * 1.9;
    this.goal.phi = MathUtils.clamp(this.goal.phi - (dy / h) * Math.PI * 1.15, this.minPhi, this.maxPhi);
  }
  _dolly(scale) {
    this.goal.radius = MathUtils.clamp(this.goal.radius / scale, this.minR, this.maxR);
  }
  // The world-space point (relative to target) that a screen coordinate
  // corresponds to, at the target's own depth — a ray/plane projection using
  // the camera's current basis, not a raycast against the model. It costs a
  // handful of vector ops regardless of how many triangles the mesh has,
  // which matters here: a real raycast against a two-million-triangle scan
  // is exactly what froze the tab when it was tried for hotspot occlusion.
  _screenToTargetOffset(sx, sy) {
    const w = this.dom.clientWidth || 1, h = this.dom.clientHeight || 1;
    const nx = (sx / w) * 2 - 1, ny = -((sy / h) * 2 - 1);
    const m = this.camera.matrixWorld.elements;
    const right = new Vector3(m[0], m[1], m[2]);
    const up = new Vector3(m[4], m[5], m[6]);
    const dist = this.sph.radius;
    const halfH = Math.tan(MathUtils.degToRad(this.camera.fov) / 2) * dist;
    const halfW = halfH * this.camera.aspect;
    return right.multiplyScalar(nx * halfW).add(up.multiplyScalar(ny * halfH));
  }
  zoomBy(f) { this._dolly(f); this._mark(); }
  reset() {
    this.goal.set(this.homeRadius || this.goal.radius, MathUtils.degToRad(74), MathUtils.degToRad(28));
    this._lastUser = 0;
  }
  update(dt) {
    const idle = performance.now() - this._lastUser > this.idleDelay;
    if (this.autoRotate && idle && !this._dragging) this.goal.theta -= this.autoSpeed * dt;
    const k = 1 - Math.pow(1 - this.damping, dt * 60);
    this.sph.theta += (this.goal.theta - this.sph.theta) * k;
    this.sph.phi += (this.goal.phi - this.sph.phi) * k;
    // Interpolate distance geometrically — linear easing makes the last stretch
    // of a zoom crawl, which is the other half of what reads as choppy.
    this.sph.radius *= Math.pow(this.goal.radius / this.sph.radius, k);
    this.targetOffset.lerp(this._targetOffsetGoal, k);
    this.apply();
  }
  apply() {
    const lookAt = this.target.clone().add(this.targetOffset);
    const p = new Vector3().setFromSpherical(this.sph).add(lookAt);
    this.camera.position.copy(p);
    this.camera.lookAt(lookAt);
  }
  dispose() { /* page-lifetime viewer; nothing to tear down */ }
}

/* ---------------------------------------------------------------------------
   Contact shadow.
   A single soft disc directly under the piece, as if the key light sat straight
   overhead: perfectly circular, centred, no hard edge, and light enough that it
   grounds the table without announcing itself.
--------------------------------------------------------------------------- */
function groundBlob(radius) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);

  // Hold an even density across the footprint, then fall away smoothly at the
  // rim. A centre-weighted falloff would bury all the contrast under the
  // pedestal, where an eye-level camera can never see it.
  const PEAK = 0.27, PLATEAU = 0.55, STEPS = 48;
  for (let i = 0; i <= STEPS; i++) {
    const d = i / STEPS;
    const e = Math.min(1, Math.max(0, (d - PLATEAU) / (1 - PLATEAU)));
    const a = PEAK * Math.pow(1 - e * e, 2.2) + 0.09 * Math.pow(1 - d, 8);
    grd.addColorStop(d, `rgba(58,45,32,${a.toFixed(4)})`);
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const m = new Mesh(
    new PlaneGeometry(radius * 2.4, radius * 2.4),
    new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = -1;
  return m;
}

/* ---------------------------------------------------------------------------
   Lighting moods.

   Each is an environment to reflect, a key/fill pair, an exposure, and the
   backdrop the page should sit behind it — changed together, because a warm
   candle light over a cold grey page reads as a bug rather than a mood.
--------------------------------------------------------------------------- */
export const LIGHTING = {
  studio: {
    label: 'Studio', swatch: '#F2EBE0',
    exposure: 0.95, envIntensity: 1.00, matIntensity: 1.10,
    key: { color: 0xfff2e0, intensity: 1.18, pos: [1.5, 4.6, 1.8] },
    fill: { color: 0xd8e4ff, intensity: 0.20 },
    bg: ['#FDFBF8', '#F6F0E8', '#EDE4D8', '#E7DCCC'],
    sky: '#F6F1E8', ground: '#D8CDBC', glow: '#FFFFFF', glowStrength: 0.9
  },
  daylight: {
    label: 'Daylight', swatch: '#BBD5EE',
    exposure: 1.02, envIntensity: 1.28, matIntensity: 1.25,
    key: { color: 0xffffff, intensity: 1.35, pos: [2.2, 4.4, 1.2] },
    fill: { color: 0xbfd8ff, intensity: 0.45 },
    bg: ['#FCFDFF', '#EDF4FB', '#DCE9F5', '#CFE0F0'],
    sky: '#D9EAFA', ground: '#EDE7DB', glow: '#FFFFFF', glowStrength: 1.0
  },
  candle: {
    label: 'Candle', swatch: '#D8913F',
    exposure: 1.02, envIntensity: 1.10, matIntensity: 1.15,
    key: { color: 0xffb877, intensity: 1.55, pos: [1.3, 3.2, 2.2] },
    fill: { color: 0x8a5a30, intensity: 0.40 },
    bg: ['#FEF9F1', '#F9E8D0', '#EFD5AF', '#E4C598'],
    sky: '#E8B87A', ground: '#B98A52', glow: '#FFE0B0', glowStrength: 1.05
  },
  night: {
    label: 'Night', swatch: '#2C3A63',
    exposure: 0.98, envIntensity: 1.05, matIntensity: 1.30,
    key: { color: 0xd6e2ff, intensity: 1.25, pos: [-1.6, 4.0, 1.9] },
    fill: { color: 0x7f92c4, intensity: 0.50 },
    bg: ['#F6F8FC', '#E9EDF5', '#D8DFEC', '#C8D1E2'],
    sky: '#B9C7E6', ground: '#8F9BBA', glow: '#EDF2FF', glowStrength: 0.95
  }
};

/* An equirectangular gradient with a soft light source painted into it. Cheap
   to build, and unlike a bare gradient it gives the finish something with an
   edge to reflect. */
function envCanvas(preset) {
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, preset.sky);
  grd.addColorStop(0.5, preset.sky);
  grd.addColorStop(0.62, preset.ground);
  grd.addColorStop(1, preset.ground);
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);

  const gl = g.createRadialGradient(W * 0.32, H * 0.20, 2, W * 0.32, H * 0.20, H * 0.46);
  gl.addColorStop(0, preset.glow);
  gl.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = preset.glowStrength;
  g.fillStyle = gl;
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 1;
  return c;
}

/* ------------------------------- main viewer ------------------------------- */
export function initViewer(opts) {
  const host = document.getElementById(opts.hostId);
  const canvas = host.querySelector('canvas');
  const statusEl = document.getElementById(opts.statusId);
  const barEl = document.getElementById(opts.barId);

  let renderer;
  // A flagship phone and a budget Android both report `pointer: coarse`, so
  // that check on its own still hands the cheap device the flagship workload.
  // Core count and memory are the only tiering signals a browser exposes, and
  // both are absent on some engines - hence the optimistic defaults, which
  // keep a browser that reports nothing on the normal path rather than
  // silently degrading every unknown device.
  const lowEnd = (navigator.hardwareConcurrency || 8) <= 4
              || (navigator.deviceMemory || 8) <= 3;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: !lowEnd, alpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    host.classList.add('is-unsupported');
    return null;
  }
  if (!renderer.capabilities.isWebGL2 && !renderer.getContext()) {
    host.classList.add('is-unsupported');
    return null;
  }

  const isCoarse = matchMedia('(pointer: coarse)').matches;
  // Phones ship DPR 3+; rendering at full density triples the framebuffer for
  // no visible gain on a 6-inch screen, and it is what tips low-end GPUs into
  // dropping the context.
  const maxDpr = lowEnd ? 1.5 : (isCoarse ? 1.75 : 2);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, maxDpr));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const camera = new PerspectiveCamera(31, 1, 0.05, 60);

  const frameCbs = [];
  const lightCbs = [];

  const pmrem = new PMREMGenerator(renderer);
  const envCache = {};
  let envTexture = null;
  let lighting = 'studio';

  function envFor(name) {
    if (envCache[name]) return envCache[name];
    const tex = new CanvasTexture(envCanvas(LIGHTING[name]));
    tex.mapping = EquirectangularReflectionMapping;
    tex.colorSpace = SRGBColorSpace;
    const t = pmrem.fromEquirectangular(tex).texture;
    tex.dispose();
    return (envCache[name] = t);
  }

  // Key sits high and close to overhead so the modelling agrees with the
  // centred contact shadow below.
  const key = new DirectionalLight(0xfff2e0, 1.18);
  key.position.set(1.5, 4.6, 1.8);
  scene.add(key);

  const fill = new DirectionalLight(0xd8e4ff, 0.20);
  fill.position.set(-3, 1.6, -1.8);
  scene.add(fill);

  function applyLighting(name) {
    const L = LIGHTING[name];
    if (!L) return;
    lighting = name;
    envTexture = envFor(name);
    scene.environment = envTexture;
    scene.environmentIntensity = L.envIntensity;
    renderer.toneMappingExposure = L.exposure;
    key.color.setHex(L.key.color);
    key.intensity = L.key.intensity;
    key.position.set(L.key.pos[0], L.key.pos[1], L.key.pos[2]);
    fill.color.setHex(L.fill.color);
    fill.intensity = L.fill.intensity;
    if (model) {
      model.traverse((o) => {
        if (o.isMesh && o.material) o.material.envMapIntensity = L.matIntensity;
      });
    }
    for (const cb of lightCbs) cb(name, L);
  }
  

  const root = new Group();
  scene.add(root);

  const controls = new ProductOrbit(camera, canvas);

  let blob = null, model = null, ready = false;
  applyLighting('studio');
  let hRad = 0.5, vHalf = 0.6, fitDist = 2.15, modelTargetY = 0.3;

  function frameModel(obj) {
    const box = new Box3().setFromObject(obj);
    const size = new Vector3(); box.getSize(size);
    const center = new Vector3(); box.getCenter(center);
    // Normalise so the longest horizontal edge is 1 unit, then sit it on y = 0.
    const s = 1 / Math.max(size.x, size.z);
    obj.scale.setScalar(s);
    obj.position.sub(center.multiplyScalar(s));
    obj.position.y += (size.y * s) / 2;

    const r = Math.max(size.x, size.z) * s * 0.5;
    modelTargetY = size.y * s * 0.46;
    controls.target.set(0, modelTargetY, 0);
    // Treat the piece as an upright cylinder: its silhouette is the same from
    // every azimuth, so the fit distance stays stable while the user spins it.
    hRad = Math.max(size.x, size.z) * s * 0.5;
    const halfH = size.y * s * 0.5;
    vHalf = Math.hypot(halfH, hRad);   // worst case across the allowed tilt range

    blob = groundBlob(r);
    blob.position.y = 0.002;
    scene.add(blob);

    dimGroup = buildDimensions(new Vector3(size.x * s, size.y * s, size.z * s));
    dimGroup.visible = false;
    root.add(dimGroup);


  }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  function setProgress(p, label) {
    if (barEl) barEl.style.width = Math.round(p * 100) + '%';
    if (statusEl && label) statusEl.textContent = label;
  }

  setProgress(0.08, 'Preparing');

  // Decode off the critical path so the rest of the page paints first.
  const onLoaded = (gltf) => {
      model = gltf.scene;
      model.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = false;
          o.receiveShadow = false;
          o.frustumCulled = false;
          const m = o.material;
          if (m) {
            m.envMapIntensity = LIGHTING[lighting].matIntensity;
            m.side = DoubleSide;
            if (m.map) m.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          }
        }
      });
      root.add(model);
      frameModel(model);
      w = 0; h = 0; resize();
      controls.sph.radius = controls.goal.radius = fitDist;
      controls.apply();
      try { renderer.render(scene, camera); } catch (e) {}
      setProgress(1, 'Ready');
      ready = true;
      try { window.__belgraveReady = Math.round(performance.now()); } catch (e) {}
      setTimeout(() => host.classList.add('is-ready'), 30);
  };

  const onFailed = (err) => {
    console.error(err);
    host.classList.add('is-unsupported');
  };

  const start = () => {
    try { window.__belgraveStart = Math.round(performance.now()); } catch (e) {}
    if (opts.modelUrl) {
      // A large model is a real download; show its actual progress rather than
      // a made-up bar, because the wait is the honest part of the experience.
      setProgress(0.05, 'Loading model');
      loader.load(opts.modelUrl, onLoaded, (ev) => {
        if (!ev || !ev.loaded) return;
        // Content-Length reports the *compressed* size when the host gzips,
        // while ev.loaded counts decompressed bytes — which is how a progress
        // bar sails past 100%. Trust the real file size when we know it.
        let total = opts.modelBytes || 0;
        if (!total && ev.total && ev.total >= ev.loaded) total = ev.total;
        if (total) {
          const frac = Math.min(1, ev.loaded / total);
          setProgress(0.05 + frac * 0.8, 'Loading model ' + Math.round(frac * 100) + '%');
        } else {
          setProgress(0.4, 'Loading model ' + Math.round(ev.loaded / 1e6) + ' MB');
        }
      }, onFailed);
      return;
    }
    setProgress(0.25, 'Decoding model');
    let bytes;
    try { bytes = b64ToBytes(opts.model()); }
    catch (e) { host.classList.add('is-unsupported'); return; }
    setProgress(0.55, 'Building geometry');
    loader.parse(bytes.buffer, '', onLoaded, onFailed);
  };

  // The model is the first fold, so decode it as soon as the byte stream allows
  // rather than waiting for an idle slot behind the rest of the document.
  setTimeout(start, 0);

  /* --------------------------------- ambience --------------------------------- */
  // The hour changes the light *around* the piece, not the piece itself. The
  // walnut has one true colour and shifting it makes the product look wrong, so
  // exposure, key colour and environment strength all stay put; only the sun's
  // direction and the fill tint move, and the page paints the backdrop.
  let timeOfDay = 0.5;
  function applyTimeOfDay(t) {
    timeOfDay = Math.min(1, Math.max(0, t));
    const arc = Math.sin(Math.PI * timeOfDay);          // 0 at the ends, 1 at noon
    const warmth = 1 - arc;
    // The sun tracks across and drops at either end; this moves the highlights
    // over the fluting without touching the wood's colour.
    key.position.set(-2.9 + timeOfDay * 5.8, 1.4 + arc * 3.6, 2.0 - warmth * 0.5);
    key.color.setRGB(1, 0.985 - warmth * 0.045, 0.965 - warmth * 0.085);
    key.intensity = 1.06 + arc * 0.16;
    // Only the weak fill carries the hour's colour, so the shadow side picks up
    // dawn blue or dusk amber while the lit face stays true.
    const dusk = Math.abs(timeOfDay - 0.5) * 2;
    fill.color.setRGB(0.72 + timeOfDay * 0.28, 0.78, 1.0 - timeOfDay * 0.30);
    fill.intensity = 0.18 + dusk * 0.22;
    if (onAmbience) onAmbience(timeOfDay);
  }
  let onAmbience = null;

  /* --------------------------------- hotspots -------------------------------- */
  // Anchors live in the model's own normalised space (base on y = 0, one unit
  // across), so they survive any re-fit of the camera.
  let hotspots = [];
  const hsWorld = new Vector3();
  const hsScreen = new Vector3();
  const hsNormal = new Vector3();
  const hsToCam = new Vector3();
  const camPos = new Vector3();

  function setHotspots(list) {
    hotspots = (list || []).map((h) => ({
      id: h.id,
      anchor: new Vector3(h.at[0], h.at[1], h.at[2]),
      // The outward direction of the surface the marker sits on. Comparing it
      // against the view direction is how we decide the point has turned away.
      // Raycasting would be exact, but three has no BVH — on a two-million
      // triangle scan that is ten million triangle tests per frame, and it
      // locks the tab solid.
      normal: new Vector3(
        h.normal ? h.normal[0] : 0,
        h.normal ? h.normal[1] : 1,
        h.normal ? h.normal[2] : 0
      ).normalize(),
      // How far past grazing a marker survives; higher hides it sooner.
      bias: h.bias == null ? 0.12 : h.bias
    }));
  }

  function projectList(items, matrix) {
    const cw = host.clientWidth, ch = host.clientHeight;
    const m = matrix || root.matrixWorld;
    return items.map((it) => {
      hsWorld.set(it.at[0], it.at[1], it.at[2]).applyMatrix4(m);
      hsScreen.copy(hsWorld).project(camera);
      return { id: it.id, text: it.text,
               x: (hsScreen.x * 0.5 + 0.5) * cw,
               y: (-hsScreen.y * 0.5 + 0.5) * ch,
               visible: hsScreen.z <= 1 };
    });
  }

  function hotspotPositions() {
    if (!model || !hotspots.length) return [];
    camera.getWorldPosition(camPos);
    const cw = host.clientWidth, ch = host.clientHeight;
    const out = [];
    for (const h of hotspots) {
      hsWorld.copy(h.anchor).applyMatrix4(root.matrixWorld);
      hsScreen.copy(hsWorld).project(camera);
      hsNormal.copy(h.normal).transformDirection(root.matrixWorld);
      hsToCam.copy(camPos).sub(hsWorld).normalize();
      const facing = hsNormal.dot(hsToCam);
      out.push({
        id: h.id,
        x: (hsScreen.x * 0.5 + 0.5) * cw,
        y: (-hsScreen.y * 0.5 + 0.5) * ch,
        facing,
        visible: hsScreen.z <= 1 && facing > h.bias
      });
    }
    return out;
  }

  /* ----------------------------- dimensions ---------------------------------- */
  // The scan is normalised so its footprint is one unit across; the real table
  // is 120 cm across, which fixes the scale for everything placed beside it.
  const M_PER_UNIT = 1.20;
  const U = (metres) => metres / M_PER_UNIT;

  let dimGroup = null, dimLabels = [];
  function buildDimensions(size) {
    const g = new Group();
    const w = size.x, hgt = size.y, off = 0.10, tick = 0.035;
    const pts = [];
    const seg = (a, b) => { pts.push(a[0], a[1], a[2], b[0], b[1], b[2]); };

    // Width above the piece, the way the product photography draws it — below
    // the table it disappears behind the control panel.
    const z = 0, y0 = hgt + off * 1.4;
    seg([-w / 2, y0, z], [w / 2, y0, z]);
    seg([-w / 2, y0 - tick, z], [-w / 2, y0 + tick, z]);
    seg([w / 2, y0 - tick, z], [w / 2, y0 + tick, z]);
    // droppers down to the edges it is measuring
    seg([-w / 2, y0, z], [-w / 2, hgt - tick, z]);
    seg([w / 2, y0, z], [w / 2, hgt - tick, z]);
    // height, drawn to the side
    const x = w / 2 + off * 0.85;
    seg([x, 0, 0], [x, hgt, 0]);
    seg([x - tick, 0, 0], [x + tick, 0, 0]);
    seg([x - tick, hgt, 0], [x + tick, hgt, 0]);

    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pts, 3));
    g.add(new LineSegments(geo, new LineBasicMaterial({
      color: 0x2c2c2c, transparent: true, opacity: 0.55, depthTest: false })));
    g.renderOrder = 3;
    dimLabels = [
      { id: 'dim-w', at: [0, y0 + tick * 1.6, z], text: Math.round(w * M_PER_UNIT * 100) + ' cm' },
      { id: 'dim-h', at: [x, hgt / 2, 0], text: '76 cm' }
    ];
    return g;
  }

  /* ------------------------------ camera moves ------------------------------- */
  let fly = null;
  function flyTo(target, ms) {
    const from = {
      theta: controls.goal.theta, phi: controls.goal.phi,
      radius: controls.goal.radius, ty: controls.target.y
    };
    const to = {
      theta: target.theta != null ? target.theta : from.theta,
      phi: target.phi != null ? MathUtils.degToRad(target.phi) : from.phi,
      radius: target.dist != null ? fitDist * target.dist : from.radius,
      ty: target.ty != null ? target.ty : from.ty
    };
    // Take the shorter way round rather than unwinding the long way.
    while (to.theta - from.theta > Math.PI) to.theta -= Math.PI * 2;
    while (to.theta - from.theta < -Math.PI) to.theta += Math.PI * 2;
    fly = { from, to, t: 0, ms: ms || 900 };
    controls._lastUser = performance.now();
  }

  function stepFly(dt) {
    if (!fly) return false;
    fly.t = Math.min(1, fly.t + (dt * 1000) / fly.ms);
    const e = fly.t < 0.5 ? 4 * fly.t * fly.t * fly.t
                          : 1 - Math.pow(-2 * fly.t + 2, 3) / 2;   // ease in-out
    const f = fly.from, t = fly.to;
    controls.goal.theta = controls.sph.theta = f.theta + (t.theta - f.theta) * e;
    controls.goal.phi = controls.sph.phi = f.phi + (t.phi - f.phi) * e;
    controls.goal.radius = controls.sph.radius = f.radius * Math.pow(t.radius / f.radius, e);
    controls.target.y = f.ty + (t.ty - f.ty) * e;
    controls.apply();
    controls._lastUser = performance.now();
    if (fly.t >= 1) fly = null;
    return true;
  }

  /* --------------------------- render loop / sizing -------------------------- */
  let w = 0, h = 0, last = performance.now(), paused = false;
  // Whether the hero is on screen is the only reason we stop drawing.
  // document.hidden deliberately plays no part: a genuinely backgrounded tab
  // stops firing requestAnimationFrame by itself, and some embedded browsers
  // report hidden while plainly visible — which left the canvas permanently
  // blank with the model loaded and waiting.
  let inView = true, contextLost = false;

  function resize() {
    const nw = host.clientWidth, nh = host.clientHeight;
    if (nw === w && nh === h) return;
    w = nw; h = nh;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, maxDpr));
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    const a = camera.aspect;
    camera.fov = a < 0.75 ? 40 : a < 1.1 ? 34 : 30;
    camera.updateProjectionMatrix();
    applyFit();
  }

  // Distance at which the silhouette fits both axes, with breathing room.
  function applyFit() {
    const vFov = MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    // Enough air that the height label, which sits outside the silhouette,
    // still lands inside the frame at the default framing.
    const pad = camera.aspect < 0.8 ? 1.42 : 1.16;
    const d = Math.max(vHalf / Math.sin(vFov / 2), hRad / Math.sin(hFov / 2)) * pad;
    const changed = Math.abs(d - fitDist) > 1e-4;
    const wasDefault = Math.abs(controls.goal.radius - fitDist) < 1e-3;
    fitDist = d;
    controls.minR = d * 0.52;
    controls.maxR = d * 1.75;
    if (changed && (wasDefault || !ready)) {
      controls.goal.radius = d;
      controls.sph.radius = ready ? controls.sph.radius : d;
    }
    controls.homeRadius = d;
    controls.goal.radius = MathUtils.clamp(controls.goal.radius, controls.minR, controls.maxR);
  }

  // Budget phones drop the WebGL context under memory pressure. Without this
  // the canvas simply goes empty and never comes back.
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    contextLost = true;
    host.classList.add('is-stalled');
  }, false);
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    host.classList.remove('is-stalled');
    w = 0; h = 0;
    last = performance.now();
    resize();
  }, false);

  const io = new IntersectionObserver((es) => { inView = es[0].isIntersecting; }, { threshold: 0.01 });
  io.observe(host);
  const refresh = () => {
    // Returning from the background: the drawing buffer is undefined and the
    // size may have changed under us, so force a full repaint.
    last = performance.now();
    w = 0; h = 0;
  };
  document.addEventListener('visibilitychange', refresh);
  addEventListener('pageshow', refresh);
  addEventListener('focus', refresh);

  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (!inView || paused || contextLost) return;
    resize();
    if (!stepFly(dt)) controls.update(dt);
    camera.updateMatrixWorld();
    // Turn the dimension frame to follow the orbit: a width bar fixed to the
    // model's own axes swings edge-on and stops reading as a measurement.
    if (dimGroup && dimGroup.visible) dimGroup.rotation.y = controls.sph.theta;
    root.updateMatrixWorld();
    for (let i = 0; i < frameCbs.length; i++) frameCbs[i]();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(tick);
  addEventListener('resize', resize, { passive: true });
  addEventListener('orientationchange', () => setTimeout(resize, 250));

  return {
    controls,
    zoomIn: () => controls.zoomBy(1.28),
    zoomOut: () => controls.zoomBy(1 / 1.28),
    reset: () => controls.reset(),
    isReady: () => ready,
    getModel: () => model,

    // Swap in a heavier, higher-quality build of the same object on demand.
    // The camera is deliberately preserved across the swap — an HD upgrade
    // should sharpen the object where the customer already turned it to, not
    // re-frame the page out from under them. getState()'s distance is stored
    // as a ratio of fitDist, so it survives frameModel() recomputing the fit
    // for the new mesh; that is exactly why the round-trip is done through
    // the existing state API rather than by copying raw spherical values.
    upgradeModel: (url, bytes, onProgress) => new Promise((resolve, reject) => {
      if (!url) { reject(new Error('no url')); return; }
      const l = new GLTFLoader();
      l.setMeshoptDecoder(MeshoptDecoder);
      const t0 = performance.now();
      l.load(url, (gltf) => {
        const next = gltf.scene;
        next.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = false;
            o.receiveShadow = false;
            o.frustumCulled = false;
            const m = o.material;
            if (m) {
              m.envMapIntensity = LIGHTING[lighting].matIntensity;
              m.side = DoubleSide;
              if (m.map) m.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
            }
          }
        });
        const keep = {
          t: +controls.goal.theta.toFixed(3),
          p: +MathUtils.radToDeg(controls.goal.phi).toFixed(1),
          d: +(controls.goal.radius / (fitDist || 1)).toFixed(3)
        };
        if (model) {
          root.remove(model);
          // Free the old mesh's GPU memory explicitly. Dropping the JS
          // reference alone does not release buffers or textures, and the
          // whole point of this feature is that both models are large.
          model.traverse((o) => {
            if (!o.isMesh) return;
            if (o.geometry) o.geometry.dispose();
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => {
              if (!m) return;
              ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap']
                .forEach((k) => { if (m[k] && m[k].dispose) m[k].dispose(); });
              m.dispose();
            });
          });
        }
        model = next;
        root.add(model);
        frameModel(model);
        w = 0; h = 0; resize();
        flyTo({ theta: keep.t, phi: keep.p, dist: keep.d }, 10);
        try { renderer.render(scene, camera); } catch (e) {}
        resolve({ ms: Math.round(performance.now() - t0) });
      }, (ev) => {
        if (!onProgress || !ev || !ev.loaded) return;
        let total = bytes || 0;
        if (!total && ev.total && ev.total >= ev.loaded) total = ev.total;
        onProgress(total ? Math.min(1, ev.loaded / total) : 0, ev.loaded);
      }, reject);
    }),



    setTimeOfDay: applyTimeOfDay,
    timeOfDay: () => timeOfDay,
    onAmbience: (fn) => { onAmbience = fn; },

    setDimensions: (on) => { if (dimGroup) dimGroup.visible = !!on; },
    dimensionsOn: () => !!(dimGroup && dimGroup.visible),
    projectPoint: (at) => projectList([{ id: 'p', at: at }])[0],
    dimensionLabels: () => (dimGroup && dimGroup.visible)
      ? projectList(dimLabels, dimGroup.matrixWorld) : [],

    getState: () => ({
      t: +controls.goal.theta.toFixed(3),
      p: +MathUtils.radToDeg(controls.goal.phi).toFixed(1),
      d: +(controls.goal.radius / (fitDist || 1)).toFixed(3),
      h: +timeOfDay.toFixed(2),
      dim: (dimGroup && dimGroup.visible) ? 1 : 0
    }),
    applyState: (st) => {
      if (!st) return;
      if (st.h != null) applyTimeOfDay(+st.h);
      if (st.dim != null && dimGroup) dimGroup.visible = +st.dim === 1;
      if (st.t != null || st.p != null || st.d != null) {
        flyTo({ theta: st.t != null ? +st.t : undefined,
                phi: st.p != null ? +st.p : undefined,
                dist: st.d != null ? +st.d : undefined }, 10);
      }
    },
    lightingPreset: () => LIGHTING[lighting],
    onLighting: (fn) => { lightCbs.push(fn); },
    onFrame: (fn) => { frameCbs.push(fn); },
    setHotspots,
    hotspotPositions,
    flyTo,
    home: () => flyTo({ theta: MathUtils.degToRad(28), phi: 74, dist: 1,
                        ty: model ? modelTargetY : 0.3 }, 800),
    setAutoRotate: (v) => { controls.autoRotate = !!v; },
    autoRotate: () => controls.autoRotate,
    onFirstInput: (fn) => { controls.onFirstInput = fn; },
    renderer,
    canvas,
    env: envTexture,
    setPaused: (v) => {
      paused = !!v;
      if (!paused) { w = 0; h = 0; last = performance.now(); resize(); }
    }
  };
}

window.__initBelgraveViewer = initViewer;
