import puppeteer from 'puppeteer-core';
const URL_ = process.argv[2] || 'http://localhost:8777/belgrave-3d.html';
const b = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:'new', args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--hide-scrollbars']});
const p = await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,200)));
await p.setViewport({width:412,height:915,deviceScaleFactor:2,isMobile:true,hasTouch:true});
const cdp = await p.createCDPSession();
await p.goto(URL_,{waitUntil:'networkidle2',timeout:120000});
await p.evaluate(()=>new Promise(r=>setTimeout(r,4500)));

// count real draws by wrapping the renderer's render call
await p.evaluate(()=>{
  const v=window.__belgraveViewerRef; window.__draws=0;
  const r=v.renderer, orig=r.render.bind(r);
  r.render=function(){ window.__draws++; return orig.apply(null,arguments); };
});
const draws = async () => p.evaluate(()=>{ const n=window.__draws; window.__draws=0;
  return new Promise(res=>setTimeout(()=>res(window.__draws),1000)); });

const out=[];
out.push('baseline drawing:            ' + await draws() + ' frames/s');

// --- the exact thing that killed it: genuinely background the tab, then return.
// A second tab in the foreground is what really flips document.hidden; the CDP
// visibility override no longer exists, and dispatching a synthetic
// visibilitychange leaves document.hidden false, which reproduces nothing.
const other = await b.newPage();
await other.goto('about:blank');
async function background(ms){
  await other.bringToFront();
  await new Promise(r=>setTimeout(r,ms));
}
async function foreground(ms){
  await p.bringToFront();
  await new Promise(r=>setTimeout(r,ms));
}
await background(1200);
const hiddenSeen = await p.evaluate(()=>document.hidden);
await foreground(900);
out.push('document.hidden actually went true while backgrounded: ' + hiddenSeen);
out.push('after app-switch and return: ' + await draws() + ' frames/s   (0 = frozen)');

// --- do it three more times; a latch would show up by now ---
for (let i=0;i<3;i++){ await background(400); await foreground(400); }
out.push('after 3 more switches:       ' + await draws() + ' frames/s');

// --- scroll the hero out of view and back ---
await p.evaluate(()=>window.scrollTo(0,3000));
await p.evaluate(()=>new Promise(r=>setTimeout(r,900)));
const offscreen = await draws();
await p.evaluate(()=>window.scrollTo(0,0));
await p.evaluate(()=>new Promise(r=>setTimeout(r,900)));
out.push(`scrolled away: ${offscreen} f/s (paused, as intended) -> back: ` + await draws() + ' f/s');

// --- controls still live? spin, then zoom ---
const before = await p.evaluate(()=>{const c=window.__belgraveViewerRef.controls;
  return {th:c.goal.theta, r:c.goal.radius};});
const cv = await p.$('#hero canvas'); const bb = await cv.boundingBox();
const cx=bb.x+bb.width/2, cy=bb.y+bb.height/2;
await p.touchscreen.touchStart(cx-80, cy);
for(let i=1;i<=8;i++){ await p.touchscreen.touchMove(cx-80+i*20, cy); await new Promise(r=>setTimeout(r,16)); }
await p.touchscreen.touchEnd();
await p.evaluate(()=>document.querySelector('#zoomIn').click());
await p.evaluate(()=>new Promise(r=>setTimeout(r,700)));
const after = await p.evaluate(()=>{const c=window.__belgraveViewerRef.controls;
  return {th:c.goal.theta, r:c.goal.radius};});
out.push(`controls after all that: rotated=${Math.abs(after.th-before.th)>0.05} zoomed=${after.r<before.r-0.01}`);

// --- simulate a lost GL context, then restore it ---
const lost = await p.evaluate(()=>{
  const c=document.querySelector('#hero canvas');
  const ext=c.getContext('webgl2')||c.getContext('webgl');
  const lose = ext && ext.getExtension('WEBGL_lose_context');
  if(!lose) return 'extension unavailable';
  lose.loseContext();
  return new Promise(res=>setTimeout(()=>{ lose.restoreContext();
    setTimeout(()=>res(document.querySelector('#hero').className),900); },400));
});
out.push('after GL context loss+restore: hero class="' + lost + '"');
out.push('recovered drawing:           ' + await draws() + ' frames/s');

out.push('page errors: ' + (errs.length?JSON.stringify(errs):'none'));
console.log(out.join('\n'));
await b.close();
