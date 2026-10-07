import puppeteer from 'puppeteer-core';
const [,, url, out, wStr, hStr, waitStr, actions] = process.argv;
const W = +(wStr||390), H = +(hStr||844);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--hide-scrollbars'] });
const page = await browser.newPage();
const msgs = [];
page.on('console', m => { if (m.type()==='error') msgs.push('console: '+m.text().slice(0,160)); else if (/\[rv\]/.test(m.text())) msgs.push(m.text().slice(0,300)); });
page.on('pageerror', e => msgs.push('pageerror: '+String(e).slice(0,200)));
await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: W < 700, hasTouch: W < 700 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 }).catch(e=>msgs.push('goto: '+e.message));
await new Promise(r => setTimeout(r, +(waitStr||2500)));
if (actions) { const fn = new Function('page', 'return (async()=>{' + actions + '})()'); await fn(page); }
await page.screenshot({ path: out });
console.log(msgs.slice(0, 25).join('\n'));
await browser.close();
