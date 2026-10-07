// Render a room for the rug visualiser.
//   node render.mjs rooms/<id>.json [--preview] [--samples 400] [--scale 0.5] [--beauty-only]
// Writes out/<id>/: beauty.png (or preview.png), shade.png, mask.png, scene.json (the tool's camera
// config + rug placement), layout.json (furniture bounding boxes), and prints timing + projection error.
//
// Room JSON (metres, degrees). The camera is always at (0, height, 0) looking down -Z; build the room around it.
// {
//   "id": "living", "output": { "width": 2000, "height": 1500 },
//   "camera": { "height": 2.7, "pitchDeg": 50, "vfovDeg": 50 },
//   "rug": { "x": 0, "z": -3, "yawDeg": 90 },                      // centre of a 200x290 rug in the tool
//   "room": {
//     "floor": { "x": [-3, 3], "z": [-5.5, 0.6] }, "wallHeight": 2.7, "wallThickness": 0.12,
//     "walls": ["back", "left", "right"], "ceiling": false,
//     "floorMaterial": { "texture": "plank_flooring_02", "res": "2k", "tileMetres": 2, "rotationDeg": 90, "roughness": 0.5 },
//     "wallMaterial": { "color": "#f1efea", "roughness": 0.92 }, "skirting": { "height": 0.09 },
//     "openings": [ { "wall": "back", "type": "window", "center": 1.2, "width": 1.6, "sill": 0.6, "height": 1.5, "glass": false,
//                     "portal": { "intensity": 4 } }, { "wall": "left", "type": "door", "center": -2, "width": 0.84, "height": 2.05 } ]
//   },
//   "lighting": { "hdri": "kloofendal_48d_partly_cloudy_puresky", "intensity": 1, "rotationDeg": 0,
//                 "sun": { ... }, "areaLights": [ { "position": [x,y,z], "lookAt": [x,y,z], "width": 2, "height": 2, "intensity": 3 } ] },
//   "render": { "toneMapping": "agx" | "aces" | "neutral", "exposure": 1 },
//   "furniture": [
//     { "name": "sofa", "source": "polyhaven", "id": "sofa_02", "res": "1k", "size": { "w": 2.1 }, "position": [0, -4.6], "rotationYDeg": 0 },
//     { "name": "table", "source": "fableroom", "file": "alan/model.glb", "size": { "w": 0.8 }, "position": [0, -3.2] },
//     { "name": "bed", "source": "procedural", "kind": "bed", "params": { "width": 1.6 }, "materials": { "frame": {...}, "duvet": {...} }, "position": [...] },
//     { "name": "vase", "source": "polyhaven", "id": "ceramic_vase_01", "on": "table", "position": [0.1, -3.2], "size": { "h": 0.25 } }
//   ]
// }
// size: scales uniformly to match the given w (X) / h (Y) / d (Z) in metres (averaged); "stretch": true scales per axis.
// Models face +Z by default in their own file; rotationYDeg turns them. position = [x, z] of the footprint centre.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolveRoom, ROOT } from './lib/assets.mjs';
import { sceneConfig } from './web/camera.js';

const require = createRequire(import.meta.url);
const puppeteer = require('../../node_modules/puppeteer-core');
const REPO = path.resolve(ROOT, '../../..');           // fableroom-repo
const ESBUILD = path.resolve(ROOT, '../../node_modules/.bin/esbuild');

const args = process.argv.slice(2);
const roomFile = args.find(a => a.endsWith('.json'));
const flag = n => args.includes('--' + n);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
if (!roomFile) { console.error('usage: node render.mjs rooms/<id>.json [--preview] [--samples N] [--scale s]'); process.exit(1); }
const room = JSON.parse(fs.readFileSync(roomFile, 'utf8'));
const scale = +opt('scale', 1);
if (scale !== 1) { room.output = { width: Math.round(room.output.width * scale), height: Math.round(room.output.height * scale) }; }
const preview = flag('preview'), samples = +opt('samples', room.render?.samples || 400);
const out = path.join(ROOT, 'out', room.id + (opt('suffix', '') ? '-' + opt('suffix') : ''));
fs.mkdirSync(out, { recursive: true });

const T0 = Date.now();
const manifest = await resolveRoom(room);

// bundle the page script
const bundle = path.join(ROOT, 'out', '.bundle.js');
execFileSync(ESBUILD, [path.join(ROOT, 'web/main.js'), '--bundle', '--format=esm', '--outfile=' + bundle, '--log-level=warning'], { stdio: 'inherit' });

const TYPES = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  let file = null;
  if (u === '/' ) { res.setHeader('content-type', 'text/html'); return res.end('<!doctype html><html><body style="margin:0;background:#000"><script type="module" src="/bundle.js"></script></body></html>'); }
  if (u === '/bundle.js') file = bundle;
  else if (u.startsWith('/r/')) file = path.join(ROOT, u.slice(3));
  else if (u.startsWith('/repo/')) file = path.join(REPO, u.slice(6));
  if (!file || !file.startsWith(u.startsWith('/repo/') ? REPO : ROOT) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('nf ' + u); }
  res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal', '--ignore-gpu-blocklist', '--disable-gpu-watchdog', '--disable-features=CalculateNativeWinOcclusion'],
  protocolTimeout: 30 * 60e3,
});
const page = await browser.newPage();
page.on('console', m => { const t = m.text(); if (/\[render\]|error|Error|warn/.test(t)) console.log('  page:', t.slice(0, 300)); });
page.on('pageerror', e => console.log('  pageerror:', String(e).slice(0, 400)));
await page.setViewport({ width: 400, height: 300 });
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready, { timeout: 30000 });
const res = await page.evaluate((room, manifest, o) => window.renderRoom(room, manifest, o), room, manifest,
  { preview, samples, beautyOnly: flag('beauty-only'), shadeFactor: +opt('shade-factor', 0.5) });
await browser.close(); server.close();

const save = (name, dataUrl) => dataUrl && fs.writeFileSync(path.join(out, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
save(preview ? 'preview.png' : 'beauty.png', res.beauty);
if (!flag('beauty-only')) { save(preview ? 'preview-shade.png' : 'shade.png', res.shade); save(preview ? 'preview-mask.png' : 'mask.png', res.mask); }
fs.writeFileSync(path.join(out, 'scene.json'), JSON.stringify(sceneConfig(room), null, 1));
fs.writeFileSync(path.join(out, 'layout.json'), JSON.stringify(res.info, null, 1));
console.log(JSON.stringify({ id: room.id, out: path.relative(ROOT, out), size: [room.output.width, room.output.height], preview, samples: preview ? 0 : samples,
  beautyMs: res.beautyMs, shadeMs: res.shadeMs, totalS: Math.round((Date.now() - T0) / 1000), projErrPx: res.projErrPx, rugCornersPx: res.rugCornersPx }));
process.exit(0);
