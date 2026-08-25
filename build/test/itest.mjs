import puppeteer from 'puppeteer-core';
const url = process.argv[2];
const b = await puppeteer.launch({
  executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:'new',
  args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--hide-scrollbars']
});
const p = await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,200)));
await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.goto(url,{waitUntil:'networkidle2',timeout:90000});
await p.evaluate(()=>new Promise(r=>setTimeout(r,4000)));
const R=[];
const log=(k,v)=>{R.push(k+': '+JSON.stringify(v));};

// --- shot helper
let n=0; const shot=async(t)=>{await p.screenshot({path:`shots/i-${String(n++).padStart(2,'0')}-${t}.png`});};

await shot('initial');

// --- touch: vertical swipe over the canvas should scroll the page
const cvs = await p.$('#hero canvas');
const bb = await cvs.boundingBox();
const cx = bb.x + bb.width/2, cy = bb.y + bb.height/2;
const y0 = await p.evaluate(()=>window.scrollY);
await p.touchscreen.touchStart(cx, cy+140);
for(let i=1;i<=8;i++){ await p.touchscreen.touchMove(cx, cy+140-i*22); await new Promise(r=>setTimeout(r,16)); }
await p.touchscreen.touchEnd();
await p.evaluate(()=>new Promise(r=>setTimeout(r,700)));
const y1 = await p.evaluate(()=>window.scrollY);
log('vertical swipe scrolled page', {from:y0,to:y1,scrolled:y1>y0+40});

await p.evaluate(()=>window.scrollTo(0,0));
await p.evaluate(()=>new Promise(r=>setTimeout(r,800)));

// --- touch: horizontal swipe should rotate, not scroll
const y2 = await p.evaluate(()=>window.scrollY);
await p.touchscreen.touchStart(cx-90, cy);
for(let i=1;i<=10;i++){ await p.touchscreen.touchMove(cx-90+i*18, cy); await new Promise(r=>setTimeout(r,16)); }
await p.touchscreen.touchEnd();
await p.evaluate(()=>new Promise(r=>setTimeout(r,900)));
const y3 = await p.evaluate(()=>window.scrollY);
const touched = await p.evaluate(()=>document.querySelector('#hero').classList.contains('is-touched'));
log('horizontal swipe', {scrollBefore:y2, scrollAfter:y3, pageStayed:y3===y2, heroMarkedTouched:touched});
await shot('after-hswipe');

// --- pinch (two-finger) — verify no page zoom / no crash
await p.evaluate((x,y)=>{
  const c=document.querySelector('#hero canvas');
  function T(id,cx,cy){return new Touch({identifier:id,target:c,clientX:cx,clientY:cy});}
  function fire(type,pts){c.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:pts,targetTouches:pts,changedTouches:pts}));}
  const a=[T(1,x-40,y),T(2,x+40,y)]; fire('touchstart',a);
  for(let i=1;i<=6;i++){const s=40+i*14;const m=[T(1,x-s,y),T(2,x+s,y)];fire('touchmove',m);}
  fire('touchend',[]);
}, cx, cy);
await p.evaluate(()=>new Promise(r=>setTimeout(r,800)));
await shot('after-pinch');

// --- buttons
await p.click('#zoomIn'); await p.click('#zoomIn');
await p.evaluate(()=>new Promise(r=>setTimeout(r,900)));
await shot('zoomed-in');
await p.click('#resetView');
await p.evaluate(()=>new Promise(r=>setTimeout(r,900)));
await shot('reset');

// --- immersive
await p.click('#expandView');
await p.evaluate(()=>new Promise(r=>setTimeout(r,900)));
const im = await p.evaluate(()=>({cls:document.querySelector('#hero').className, locked:document.body.classList.contains('is-locked'), rect:document.querySelector('#hero').getBoundingClientRect().toJSON()}));
log('immersive', {isImmersive: im.cls.includes('is-immersive'), locked: im.locked, w: Math.round(im.rect.width), h: Math.round(im.rect.height)});
await shot('immersive');
await p.click('#closeView');
await p.evaluate(()=>new Promise(r=>setTimeout(r,700)));
log('closed immersive', await p.evaluate(()=>({cls:document.querySelector('#hero').className, locked:document.body.classList.contains('is-locked')})));

// --- fps while spinning
const fps = await p.evaluate(()=>new Promise(res=>{
  let n=0; const t0=performance.now();
  (function f(){n++; const t=performance.now(); if(t-t0<3000) requestAnimationFrame(f); else res(Math.round(n*1000/(t-t0)));})();
}));
log('fps (swiftshader software GL)', fps);

// --- other UI
await p.evaluate(()=>document.querySelector('.fbt__item:nth-child(2) .fbt__cb').click());
await p.evaluate(()=>new Promise(r=>setTimeout(r,200)));
log('fbt after untick', await p.evaluate(()=>({label:document.querySelector('#fbtLabel').textContent, was:document.querySelector('#fbtWas').textContent, now:document.querySelector('#fbtNow').textContent})));
await p.evaluate(()=>document.querySelector('#menuBtn').click());
await p.evaluate(()=>new Promise(r=>setTimeout(r,500)));
await shot('drawer');
await p.evaluate(()=>document.querySelector('#drawer .drawer__x').click());

// gallery dots
await p.evaluate(()=>document.querySelector('#mode2d').click());
 await p.evaluate(()=>new Promise(r=>setTimeout(r,700)));
 await p.evaluate(()=>{const s=document.querySelector('#galStrip'); s.scrollLeft = s.clientWidth*3;});
await p.evaluate(()=>new Promise(r=>setTimeout(r,600)));
log('gallery dot index', await p.evaluate(()=>[...document.querySelectorAll('.gal__dot')].findIndex(d=>d.classList.contains('on'))));

console.log(R.join('\n'));
if(errs.length) console.log('PAGE ERRORS:', errs);
await b.close();
