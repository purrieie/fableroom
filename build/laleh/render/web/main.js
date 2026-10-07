// In-browser renderer: room JSON + asset manifest -> beauty / mask / shade PNGs (data URLs).
// Driven by render.mjs through puppeteer (see the renderRoom function at the bottom).
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { buildScene } from './scene.js';
import { sceneConfig, rugCorners, DEG } from './camera.js';

RectAreaLightUniformsLib.init();

function makeCamera(room) {
  const W = room.output.width, H = room.output.height, c = room.camera;
  const cam = new THREE.PerspectiveCamera(c.vfovDeg, W / H, 0.05, 200);
  cam.position.set(0, c.height, 0);
  cam.rotation.set(-c.pitchDeg * DEG, 0, 0, 'YXZ');   // pitched down, looking along -Z
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  return cam;
}
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

// The tool's pinhole projection (src/room-view.js proj) for the projection check.
function toolProj(cfg, X, Y, Z) {
  const [W, H] = cfg.ref, f = cfg.f * W, cx = W / 2, cy = H / 2;
  const pitch = Math.atan((cy - cfg.hz * H) / f), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const yc = cfg.h - Y, zc = -Z, y2 = cp * yc - sp * zc, z2 = sp * yc + cp * zc;
  return [cx + f * X / z2, cy + f * y2 / z2];
}

function makeTracer(renderer, scene, camera) {
  const pt = new WebGLPathTracer(renderer);
  pt.renderDelay = 0; pt.fadeDuration = 0; pt.minSamples = 1; pt.dynamicLowRes = false;
  pt.bounces = 5; pt.transmissiveBounces = 4; pt.filterGlossyFactor = 0.5;
  const n = Math.max(2, Math.ceil(renderer.getSize(new THREE.Vector2()).x / 450));   // ~450 px tiles
  pt.tiles.set(n, n);          // keep each GPU dispatch short (a whole 2k frame at once can drop the context)
  pt.setScene(scene, camera);
  return pt;
}
async function pathTrace(pt, renderer, samples, log) {
  pt.reset();
  const t0 = performance.now(), px = new Float32Array(4);
  let done = -1;
  while (pt.samples < samples) {
    pt.renderSample();
    // wait for the GPU after each whole sample: queuing thousands of tile dispatches at once
    // floods the GPU and loses the context
    const k = Math.floor(pt.samples);
    if (k !== done) {
      done = k;
      try { renderer.readRenderTargetPixels(pt.target, 0, 0, 1, 1, px); } catch (e) {}
      if (k % 8 === 0) await new Promise(r => setTimeout(r, 0));
    }
    if (performance.now() - t0 > 15 * 60e3) { log('path trace timed out at ' + pt.samples + ' samples'); break; }
  }
  renderer.setRenderTarget(null);
  pt.renderSample();          // blit the accumulated image to the canvas
  renderer.setRenderTarget(null); renderer.setScissorTest(false);
  const sz = renderer.getSize(new THREE.Vector2()); renderer.setViewport(0, 0, sz.x, sz.y);
  log('traced ' + Math.round(pt.samples) + ' samples in ' + Math.round(performance.now() - t0) + ' ms');
  return performance.now() - t0;
}

function newRenderer(room) {
  const W = room.output.width, H = room.output.height;
  const canvas = document.createElement('canvas'); document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = room.render?.toneMapping === 'aces' ? THREE.ACESFilmicToneMapping : room.render?.toneMapping === 'neutral' ? THREE.NeutralToneMapping : THREE.AgXToneMapping;
  renderer.toneMappingExposure = room.render?.exposure ?? 1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}
function grab(renderer) {
  const url = renderer.domElement.toDataURL('image/png');
  renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
  return url;
}

window.renderRoom = async function (room, manifest, opts) {
  const logs = [], log = s => { logs.push(s); console.log('[render] ' + s); };
  const W = room.output.width, H = room.output.height;
  const t0 = performance.now();
  const { scene, floor, info } = await buildScene(room, manifest);
  const camera = makeCamera(room);
  log('scene built in ' + Math.round(performance.now() - t0) + ' ms');
  const out = { info, logs };

  // projection check: the tool's camera vs three.js, at the rug's corners
  const cfg = sceneConfig(room);
  let maxErr = 0;
  for (const [x, z] of rugCorners(room.rug)) {
    const v = new THREE.Vector3(x, 0, z).project(camera);
    const px = [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H], tp = toolProj(cfg, x, 0, z);
    maxErr = Math.max(maxErr, Math.hypot(px[0] - tp[0], px[1] - tp[1]));
  }
  out.projErrPx = +maxErr.toFixed(4);
  out.rugCornersPx = rugCorners(room.rug).map(([x, z]) => toolProj(cfg, x, 0, z).map(Math.round));

  // 1) beauty
  let r = newRenderer(room);
  if (opts.preview) r.render(scene, camera);
  else out.beautyMs = Math.round(await pathTrace(makeTracer(r, scene, camera), r, opts.samples, log));
  out.beauty = grab(r);
  if (opts.beautyOnly) return out;

  // 2) shade: same scene, floor swapped for plain white diffuse
  const floorMat = floor.material;
  floor.material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 });
  r = newRenderer(room);
  if (opts.preview) r.render(scene, camera);
  else out.shadeMs = Math.round(await pathTrace(makeTracer(r, scene, camera), r, Math.max(64, Math.round(opts.samples * (opts.shadeFactor ?? 0.5))), log));
  out.shade = grab(r);
  floor.material = floorMat;

  // 3) mask: floor black, everything else white (anything that isn't floor stands in front of a rug)
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 }), white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  scene.traverse(o => { if (o.isMesh) o.material = o === floor ? black : white; });
  scene.background = new THREE.Color(0xffffff); scene.environment = null;
  r = newRenderer(room); r.toneMapping = THREE.NoToneMapping;
  r.render(scene, camera);
  out.mask = grab(r);
  return out;
};
window.__ready = true;
