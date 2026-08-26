import {
  WebGLRenderer, Scene, PerspectiveCamera, Box3, Vector3, CanvasTexture,
  PMREMGenerator, ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping,
  SRGBColorSpace, LinearSRGBColorSpace, EquirectangularReflectionMapping,
  DirectionalLight, DoubleSide, Mesh, CircleGeometry, MeshBasicMaterial, PCFSoftShadowMap
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/* A studio, not a gradient. Big soft sources with edges are what put a sweep of
   highlight across a polished top; a two-band gradient cannot. */
function studioEnv(p) {
  const W = 1024, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');

  g.fillStyle = p.base; g.fillRect(0, 0, W, H);
  const floor = g.createLinearGradient(0, H * 0.52, 0, H);
  floor.addColorStop(0, p.horizon); floor.addColorStop(1, p.floor);
  g.fillStyle = floor; g.fillRect(0, H * 0.52, W, H * 0.48);

  // soft boxes: [u, v, halfW, halfH, brightness]
  const box = (u, v, rw, rh, val) => {
    const x = u * W, y = v * H, w = rw * W, h = rh * H;
    const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(w, h));
    gr.addColorStop(0, `rgba(255,255,255,${val})`);
    gr.addColorStop(0.55, `rgba(255,255,255,${val * 0.55})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.save(); g.beginPath(); g.ellipse(x, y, w, h, 0, 0, Math.PI * 2); g.clip();
    g.fillStyle = gr; g.fillRect(x - w, y - h, w * 2, h * 2); g.restore();
    // a soft spill beyond the box edge so it does not read as a hard disc
    const sp = g.createRadialGradient(x, y, 0, x, y, Math.max(w, h) * 1.9);
    sp.addColorStop(0, `rgba(255,255,255,${val * 0.30})`);
    sp.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sp; g.fillRect(0, 0, W, H);
  };
  (p.boxes || []).forEach(b => box(...b));
  return c;
}

const P = new URLSearchParams(location.search);
const num = (k, d) => (P.has(k) ? parseFloat(P.get(k)) : d);
const str = (k, d) => (P.has(k) ? P.get(k) : d);

const cfg = {
  model:    str('model', 'hq_default.glb'),
  exposure: num('exp', 1.0),
  envInt:   num('env', 1.0),
  matInt:   num('mat', 1.0),
  keyInt:   num('key', 1.2),
  keyPos:   str('keypos', '1.5,4.6,1.8').split(',').map(Number),
  rimInt:   num('rim', 0.0),
  rimPos:   str('rimpos', '-2.4,2.0,-2.6').split(',').map(Number),
  tone:     str('tone', 'aces'),
  base:     str('base', '#2a2724'),
  horizon:  str('horizon', '#4a443c'),
  floor:    str('floor', '#6d6458'),
  bg:       str('bg', '#E8E2CE'),
  boxes:    JSON.parse(decodeURIComponent(str('boxes',
              '[[0.30,0.16,0.20,0.20,1.0],[0.72,0.24,0.13,0.15,0.55]]'))),
  dist:     num('dist', 2.5),
  theta:    num('theta', 0.55),
  phi:      num('phi', 1.20),
  dpr:      num('dpr', 2),
};

const canvas = document.getElementById('c');
const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setClearColor(cfg.bg, 1);
renderer.setPixelRatio(cfg.dpr);
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.toneMapping = cfg.tone === 'agx' ? AgXToneMapping
                     : cfg.tone === 'neutral' ? NeutralToneMapping
                     : ACESFilmicToneMapping;
renderer.toneMappingExposure = cfg.exposure;
renderer.outputColorSpace = SRGBColorSpace;

const scene = new Scene();
const camera = new PerspectiveCamera(32, canvas.clientWidth / canvas.clientHeight, 0.01, 100);

const pmrem = new PMREMGenerator(renderer); pmrem.compileEquirectangularShader();
const envTex = new CanvasTexture(studioEnv(cfg));
envTex.mapping = EquirectangularReflectionMapping;
envTex.colorSpace = SRGBColorSpace;
const env = pmrem.fromEquirectangular(envTex).texture;
scene.environment = env;
scene.environmentIntensity = cfg.envInt;

/* One directional light with a shadow map gives a hard-edged cast shadow the
   product photograph does not have. A small dome of dimmer casters around the
   same direction overlaps their penumbrae, which reads as the soft contact
   darkening in the crevices instead of a single hard edge. All of them are
   static, so the maps are rendered once and reused. */
const SHADOW = num('shadow', 0);
const DOME = Math.max(1, num('dome', 1));
const SPREAD = num('spread', 0.42);
if (SHADOW > 0) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
}
const keyCol = parseInt(str('keycol','fff4e6'), 16);
const kp = new Vector3(...cfg.keyPos);
// an orthonormal pair across the key direction, to fan the dome out on
const up = Math.abs(kp.clone().normalize().y) > 0.9 ? new Vector3(1,0,0) : new Vector3(0,1,0);
const t1 = new Vector3().crossVectors(kp, up).normalize();
const t2 = new Vector3().crossVectors(kp, t1).normalize();
const lights = [];
for (let i = 0; i < DOME; i++) {
  const ang = (i / DOME) * Math.PI * 2;
  const r = i === 0 ? 0 : SPREAD;
  const pos = kp.clone()
    .addScaledVector(t1, Math.cos(ang) * r * kp.length())
    .addScaledVector(t2, Math.sin(ang) * r * kp.length());
  const l = new DirectionalLight(keyCol, cfg.keyInt / DOME);
  l.position.copy(pos);
  if (SHADOW > 0) {
    l.castShadow = true;
    l.shadow.mapSize.set(SHADOW, SHADOW);
    l.shadow.radius = num('shadowradius', 3);
    l.shadow.bias = num('shadowbias', -0.0009);
    l.shadow.normalBias = num('shadownormbias', 0.015);
    const c = l.shadow.camera;
    c.near = 0.1; c.far = 14; c.left = -1.1; c.right = 1.1; c.top = 1.1; c.bottom = -1.1;
    c.updateProjectionMatrix();
  }
  scene.add(l); lights.push(l);
}
if (cfg.rimInt > 0) {
  const rim = new DirectionalLight(0xdce7ff, cfg.rimInt);
  rim.position.set(...cfg.rimPos); scene.add(rim);
}

document.body.style.background = cfg.bg;

const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
loader.load(cfg.model, (gltf) => {
  const obj = gltf.scene;
  const box = new Box3().setFromObject(obj);
  const size = new Vector3(); box.getSize(size);
  const center = new Vector3(); box.getCenter(center);
  const s = 1 / Math.max(size.x, size.z);
  obj.scale.setScalar(s);
  obj.position.sub(center.multiplyScalar(s));
  obj.position.y += (size.y * s) / 2;
  obj.traverse((o) => {
    if (o.isMesh && o.material) {
      o.material.side = DoubleSide;
      if (SHADOW > 0) { o.castShadow = true; o.receiveShadow = true; }
      o.material.envMapIntensity = cfg.matInt;
      const mx = renderer.capabilities.getMaxAnisotropy();
      ['map', 'metalnessMap', 'roughnessMap'].forEach((k) => {
        if (o.material[k]) { o.material[k].anisotropy = mx; o.material[k].needsUpdate = true; }
      });
    }
  });
  scene.add(obj);

  const ty = size.y * s * 0.46;
  camera.position.set(
    cfg.dist * Math.sin(cfg.phi) * Math.sin(cfg.theta),
    ty + cfg.dist * Math.cos(cfg.phi),
    cfg.dist * Math.sin(cfg.phi) * Math.cos(cfg.theta));
  camera.lookAt(0, ty, 0);
  if (SHADOW > 0) renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
  window.__maxAniso = renderer.capabilities.getMaxAnisotropy();
  window.__ready = true;
}, undefined, (e) => { window.__err = String(e); });
