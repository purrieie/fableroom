import puppeteer from 'puppeteer-core';
const [,, url, outPrefix, wStr, hStr, dprStr, fullStr] = process.argv;
const W = +(wStr||390), H = +(hStr||844), DPR = +(dprStr||2), FULL = fullStr === 'full';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--font-render-hinting=none','--hide-scrollbars']
});
const page = await browser.newPage();
const msgs = [];
page.on('console', m => { if (m.type()==='error'||m.type()==='warning') msgs.push(m.type()+': '+m.text().slice(0,200)); });
page.on('pageerror', e => msgs.push('pageerror: '+String(e).slice(0,300)));
page.on('requestfailed', r => msgs.push('reqfail: '+r.url().slice(0,120)));
await page.setViewport({ width: W, height: H, deviceScaleFactor: DPR, isMobile: W < 700, hasTouch: W < 700 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
await page.evaluate(() => new Promise(r => setTimeout(r, 3500)));
const info = await page.evaluate(() => ({
  docH: document.documentElement.scrollHeight,
  heroCls: document.querySelector('#hero').className,
  heroH: document.querySelector('#hero').offsetHeight,
  heroTop: document.querySelector('#hero').offsetTop,
  webgl: (()=>{try{const c=document.createElement('canvas');return !!(c.getContext('webgl2')||c.getContext('webgl'));}catch(e){return false}})()
}));
console.log(JSON.stringify(info));
if (msgs.length) console.log('CONSOLE:', JSON.stringify(msgs.slice(0,12), null, 1));
if (FULL) {
  // stitch viewport-sized shots so lazy content and sticky bars behave
  const pages = Math.ceil(info.docH / H);
  for (let i = 0; i < Math.min(pages, 14); i++) {
    await page.evaluate(y => window.scrollTo(0, y), i * H);
    await page.evaluate(() => new Promise(r => setTimeout(r, 550)));
    await page.screenshot({ path: `${outPrefix}-${String(i).padStart(2,'0')}.png` });
  }
} else {
  await page.screenshot({ path: `${outPrefix}.png` });
}
await browser.close();
