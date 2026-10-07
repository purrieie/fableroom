// Calibration view: open the overlay on a scene at a large desktop size, grid on.
import puppeteer from 'puppeteer-core';
const [,, scene, out, extra] = process.argv;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--hide-scrollbars'] });
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0,200)));
page.on('console', m => { if (/frrv|room-view/i.test(m.text())) errs.push(m.text().slice(0,200)); });
await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
await page.goto('http://localhost:8812/laleh/index.html', { waitUntil: 'networkidle2', timeout: 90000 });
await page.evaluate(() => window.FRRV.open('room', 'test'));
await page.waitForFunction(() => window.FRRV && window.FRRV._dbg && window.FRRV._dbg.S.cam, { timeout: 20000 });
await page.evaluate(async (scene, extra) => {
  const d = window.FRRV._dbg;
  if (extra) Object.assign(d.scenes.find(s => s.id === scene), JSON.parse(extra));
  d.setScene(scene, null);
  await new Promise(r => setTimeout(r, 1500));
  d.S.adjust = true; d.S.dims = true; d.redraw();
}, scene, extra || '');
await new Promise(r => setTimeout(r, 1200));
const stage = await page.$('.frrv-stage');
await stage.screenshot({ path: out });
console.log(errs.join('\n'));
await browser.close();
