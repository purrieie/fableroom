import puppeteer from 'puppeteer-core';
const URL_ = process.argv[2] || 'http://localhost:8777/belgrave-3d.html';
// Chrome's fake capture device gives a real MediaStream, so getUserMedia,
// the <video> element and the compositing all run for real here.
const b = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:'new', args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--hide-scrollbars',
    '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
    '--unsafely-treat-insecure-origin-as-secure=http://localhost:8777']});
const p = await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,200)));
await p.setViewport({width:412,height:915,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.setUserAgent('Mozilla/5.0 (Linux; Android 13; Redmi Note 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36');
// A Redmi with no ARCore: navigator.xr absent entirely.
await p.evaluateOnNewDocument(()=>{ Object.defineProperty(navigator,'xr',{configurable:true,get:()=>undefined}); });
const ctxOverride = await p.browserContext();
await ctxOverride.overridePermissions('http://localhost:8777', ['camera']);
await p.goto(URL_,{waitUntil:'networkidle2',timeout:120000});
await p.evaluate(()=>new Promise(r=>setTimeout(r,5000)));

const out=[];
out.push('mode chosen: ' + JSON.stringify(await p.evaluate(()=>window.__arDiag && window.__arDiag().mode)));
out.push('diagnostics: ' + JSON.stringify(await p.evaluate(()=>{const d=window.__arDiag();
  return {camera:d.camera, secure:d.secure, hasXR:d.hasXR};})));

await p.evaluate(()=>document.querySelector('#arBtn').click());
await p.evaluate(()=>new Promise(r=>setTimeout(r,3500)));

const st = await p.evaluate(()=>{
  const o=document.querySelector('#xrOverlay'), v=document.querySelector('#xrCam');
  const c=document.querySelector('#xrStage canvas');
  return { overlayOn:o.classList.contains('on'), cameraMode:o.classList.contains('is-camera'),
           videoPlaying: !!(v.srcObject && v.readyState>=2 && !v.paused),
           videoSize:[v.videoWidth,v.videoHeight],
           canvasMovedIntoStage: !!c,
           canvasSize: c?[c.clientWidth,c.clientHeight]:null,
           hint:document.querySelector('#xrHint').textContent,
           size:document.querySelector('#xrSize').textContent.slice(0,40),
           locked:document.body.classList.contains('is-locked') };
});
out.push('camera session: ' + JSON.stringify(st, null, 0));
await p.screenshot({path:'shots/cam-live.png'});

// gestures: drag to move, pinch to resize
const before = await p.evaluate(()=>{const r=window.__camState&&window.__camState(); return r||null;});
await p.touchscreen.touchStart(200, 500);
for(let i=1;i<=8;i++){ await p.touchscreen.touchMove(200+i*12, 500-i*8); await new Promise(r=>setTimeout(r,16)); }
await p.touchscreen.touchEnd();
await p.evaluate(()=>new Promise(r=>setTimeout(r,400)));
await p.screenshot({path:'shots/cam-moved.png'});

await p.evaluate(()=>{
  const o=document.querySelector('#xrOverlay');
  const T=(id,x,y)=>new Touch({identifier:id,target:o,clientX:x,clientY:y});
  const fire=(t,pts)=>o.dispatchEvent(new TouchEvent(t,{bubbles:true,cancelable:true,touches:pts,targetTouches:pts,changedTouches:pts}));
  fire('touchstart',[T(1,150,500),T(2,250,500)]);
  for(let i=1;i<=6;i++){ const s=50+i*20; fire('touchmove',[T(1,200-s,500),T(2,200+s,500)]); }
  fire('touchend',[]);
});
await p.evaluate(()=>new Promise(r=>setTimeout(r,500)));
await p.screenshot({path:'shots/cam-pinched.png'});

await p.evaluate(()=>document.querySelector('#xrReset').click());
await p.evaluate(()=>new Promise(r=>setTimeout(r,400)));
await p.evaluate(()=>document.querySelector('#xrExit').click());
await p.evaluate(()=>new Promise(r=>setTimeout(r,900)));
const after = await p.evaluate(()=>{
  const o=document.querySelector('#xrOverlay');
  const heroCanvas=document.querySelector('#hero canvas');
  return { overlayOff:!o.classList.contains('on'), canvasBackInHero:!!heroCanvas,
           unlocked:!document.body.classList.contains('is-locked'),
           heroStillDrawing:null };
});
out.push('after Done: ' + JSON.stringify(after));
const fps = await p.evaluate(()=>new Promise(res=>{let n=0;const t0=performance.now();
  (function f(){n++;const t=performance.now(); if(t-t0<1500) requestAnimationFrame(f); else res(Math.round(n*1000/(t-t0)));})();}));
out.push('hero rendering again: ' + fps + ' fps');
out.push('page errors: ' + (errs.length?JSON.stringify(errs):'none'));
console.log(out.join('\n'));
await b.close();
