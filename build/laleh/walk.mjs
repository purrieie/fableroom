// Phone walkthrough: entry -> overlay -> scenes -> sizes -> tabs -> own photo -> adjust -> tape.
import puppeteer from 'puppeteer-core';
const [,, outDir, W = '390', H = '844'] = process.argv;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--hide-scrollbars'] });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => { const t = String(e); if (/frrv|room-view|FRRV/.test(e.stack || t)) errs.push('pageerror: ' + t.slice(0, 300)); });
page.on('console', m => { if (m.type() === 'error' && /room-view|rv\//.test(m.text())) errs.push(m.text().slice(0, 200)); });
const mobile = +W < 700;
await page.setViewport({ width: +W, height: +H, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
const reqs = []; page.on('request', r => { if (/\/laleh\/rv\//.test(r.url())) reqs.push({ t: Date.now(), u: r.url().split('/rv/')[1] }); });
await page.goto(process.env.URL || 'http://localhost:8812/laleh/index.html', { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise(r => setTimeout(r, 1500));
console.log('rv requests before any tap:', JSON.stringify(reqs.map(r => r.u)));
const wait = ms => new Promise(r => setTimeout(r, ms));
const shot = async n => { await page.screenshot({ path: `${outDir}/${n}.png` }); };
// gallery pill
await page.evaluate(() => window.scrollTo(0, 0)); await wait(300); await shot('w00-gallery');
await page.click(mobile ? '.frrv-pill' : '.frrv-entry__btn');
await page.waitForFunction(() => window.FRRV && window.FRRV._dbg && window.FRRV._dbg.S.cam, { timeout: 20000 });
await wait(1500); await shot('w01-open');
console.log('rv requests after open:', JSON.stringify(reqs.map(r => r.u)));
// sizes
const chipSel = '.frrv-sizelist .frrv-chip';
await page.$$eval(chipSel, b => b[0].click()); await wait(600); await shot('w02-size140');
// lounge
await page.click('.frrv-room[data-scene=lounge]'); await wait(1600); await shot('w03-lounge');
await page.$$eval(chipSel, b => b[1].click()); await wait(600); await shot('w04-lounge-160-soldout');
await page.click('.frrv-room[data-scene=bedroom]'); await wait(1600); await shot('w05-bedroom');
// rotate
await page.click('[data-tool=rot]'); await wait(500); await shot('w06-rotated');
// tape
await page.click('[data-tool=tape]'); await wait(400); await shot('w07-tape');
await page.click('[data-tool=tape]');
// tabs
await page.click('.frrv-tabs [data-t=size]'); await wait(500); await shot('w08-size-tab');
await page.click('.frrv-seg[data-k=room] [data-v=bedroom]'); await wait(300); await shot('w09-size-bedroom');
await page.click('.frrv-seg[data-k=room] [data-v=dining]'); await wait(300); await shot('w10-size-dining');
await page.click('.frrv-tabs [data-t=know]'); await wait(400); await shot('w11-know');
await page.evaluate(() => { const r = document.querySelector('#frrv-gap'); r.value = 6; r.dispatchEvent(new Event('input')); }); await wait(200);
await page.evaluate(() => document.querySelector('.frrv-door').scrollIntoView({ block: 'center' })); await wait(200); await shot('w12-door');
// own photo
await page.click('.frrv-tabs [data-t=room]'); await wait(500);
await page.click('.frrv-room[data-scene=own]'); await wait(400); await shot('w13-sheet');
const [chooser] = await Promise.all([page.waitForFileChooser(), page.click('.frrv-pick')]);
await chooser.accept([process.env.PHOTO]);
await wait(2500); await shot('w14-own-adjust');
await page.click('.frrv-done'); await wait(500); await shot('w15-own');
// close and confirm the page size picker followed the overlay
console.log('closing'); await page.click('.frrv-x'); await wait(500); console.log('closed');
const pageSize = await page.evaluate(() => { const r = [...document.querySelectorAll('input.js-option')].find(x => x.checked); return r && r.value; });
console.log('page size after close:', pageSize);
console.log('rv requests total:', JSON.stringify(reqs.map(r => r.u)));
console.log(errs.length ? errs.join('\n') : 'no room-view errors');
console.log('done'); await browser.close(); process.exit(0);
