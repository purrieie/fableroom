// Render one scene definition and report how well the rug shows.
//   node test/scene_shot.mjs <scene.json> <outdir> [variantIndex=2]
// Writes: desk-grid.png (floor grid + occluder outlines), desk.png, phone.png, and prints JSON metrics:
//   phoneVisible / deskVisible = share of the rug's top-face area inside the stage (1 = whole rug on screen),
//   phoneArea = rug's on-screen area as a share of the phone stage, corners = rug corners in source-image px.
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const [,, sceneFile, out, vi = '2'] = process.argv;
const scene = JSON.parse(fs.readFileSync(sceneFile, 'utf8'));
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--hide-scrollbars'] });
const errs = [];
async function run(w, h, mobile, shots) {
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.setViewport({ width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await page.evaluateOnNewDocument(s => { window.__scenes = [s]; }, scene);
  await page.goto('http://localhost:8812/build/laleh/test/harness.html', { waitUntil: 'load' });
  await page.evaluate(v => { window.FRRV.open('room', 'test'); }, +vi);
  await page.waitForFunction(() => window.FRRV._dbg && window.FRRV._dbg.S.cam && document.querySelector('.frrv-stage.is-ready'), { timeout: 20000 });
  await page.evaluate(v => { const d = window.FRRV._dbg; d.S.userSized = true; d.setSize(v, null); }, +vi);
  await new Promise(r => setTimeout(r, 900));
  const metrics = await page.evaluate(() => {
    const d = window.FRRV._dbg, S = d.S, c = S.cam, disp = S.disp;
    const v = d.S.vi, VAR = [[140, 200], [160, 230], [200, 290]][v];
    const wM = VAR[0] / 100, lM = VAR[1] / 100, cy = Math.cos(S.rug.yaw), sy = Math.sin(S.rug.yaw);
    function proj(X, Z) {
      const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch), yc = c.h, zc = -Z;
      const y2 = cp * yc - sp * zc, z2 = sp * yc + cp * zc; if (z2 <= 1e-3) return null;
      const u = c.f * X / z2, vv = c.f * y2 / z2, cr = Math.cos(c.roll), sr = Math.sin(c.roll);
      return [c.cx + cr * u - sr * vv, c.cy + sr * u + cr * vv];
    }
    // sample the rug top face on a grid; count samples landing inside the stage
    let inside = 0, tot = 0;
    for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) {
      const lx = (i / 20 - 0.5) * wM, lz = (j / 20 - 0.5) * lM;
      const p = proj(S.rug.x + cy * lx + sy * lz, S.rug.z - sy * lx + cy * lz); tot++;
      if (!p) continue;
      const sx = disp.ox + p[0] * disp.s, sy2 = disp.oy + p[1] * disp.s;
      if (sx >= 0 && sx <= disp.w && sy2 >= 0 && sy2 <= disp.h) inside++;
    }
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(k => {
      const lx = k[0] * wM / 2, lz = k[1] * lM / 2, p = proj(S.rug.x + cy * lx + sy * lz, S.rug.z - sy * lx + cy * lz);
      return p ? p.map(Math.round) : null;
    });
    // on-screen polygon area of the rug (shoelace, clipped crudely to the stage)
    const scr = corners.map(p => p && [Math.min(Math.max(disp.ox + p[0] * disp.s, 0), disp.w), Math.min(Math.max(disp.oy + p[1] * disp.s, 0), disp.h)]);
    let area = 0; if (scr.every(Boolean)) for (let i = 0; i < 4; i++) { const a = scr[i], b = scr[(i + 1) % 4]; area += a[0] * b[1] - b[0] * a[1]; }
    return { visible: +(inside / tot).toFixed(3), area: +(Math.abs(area) / 2 / (disp.w * disp.h)).toFixed(3), corners,
      img: [c.iw, c.ih], horizonPx: Math.round(c.cy - c.f * Math.tan(c.pitch)), pitchDeg: +(c.pitch * 180 / Math.PI).toFixed(1) };
  });
  for (const s of shots) {
    if (s.grid) {
      await page.evaluate((sc) => {
        const d = window.FRRV._dbg; d.S.adjust = true; d.redraw();
        // outline occluder polygons in red
        const st = document.querySelector('.frrv-stage'), disp = d.S.disp, cv = document.createElement('canvas');
        cv.width = disp.w; cv.height = disp.h; cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:5;pointer-events:none';
        const g = cv.getContext('2d'); g.strokeStyle = 'red'; g.lineWidth = 2;
        const rw = sc.ref ? sc.ref[0] : 1, rh = sc.ref ? sc.ref[1] : 1;
        (sc.occl || []).forEach(poly => { g.beginPath(); poly.forEach((p, i) => { const u = p[0] / rw * d.S.cam.iw, v = p[1] / rh * d.S.cam.ih; g[i ? 'lineTo' : 'moveTo'](disp.ox + u * disp.s, disp.oy + v * disp.s); }); g.closePath(); g.stroke(); });
        st.appendChild(cv);
      }, scene);
      await new Promise(r => setTimeout(r, 400));
    }
    if (s.full) await page.screenshot({ path: `${out}/${s.name}.png` });
    else await (await page.$('.frrv-stage')).screenshot({ path: `${out}/${s.name}.png` });
  }
  await page.close();
  return metrics;
}
const desk = await run(1440, 900, false, [{ name: 'desk' }, { name: 'desk-grid', grid: true }]);
const phone = await run(390, 844, true, [{ name: 'phone', full: true }]);
console.log(JSON.stringify({ scene: scene.id, deskVisible: desk.visible, deskArea: desk.area, phoneVisible: phone.visible, phoneArea: phone.area,
  corners: desk.corners, img: desk.img, horizonPx: desk.horizonPx, pitchDeg: desk.pitchDeg, errors: errs.slice(0, 5) }));
await browser.close(); process.exit(0);
