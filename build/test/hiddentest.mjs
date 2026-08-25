import puppeteer from 'puppeteer-core';
// Reproduce the exact failure: a browser that claims document.hidden === true
// the whole time, while the page is genuinely on screen.
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:'new',protocolTimeout:180000,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--hide-scrollbars']});
const p=await b.newPage();
await p.setViewport({width:1440,height:900,deviceScaleFactor:1});
await p.evaluateOnNewDocument(()=>{
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
  Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});
});
await p.goto(process.argv[2],{waitUntil:'networkidle2',timeout:300000});
await p.waitForFunction(()=>document.querySelector('#hero').classList.contains('is-ready'),{timeout:300000,polling:300});
await p.evaluate(()=>new Promise(r=>setTimeout(r,2500)));
const r=await p.evaluate(()=>{
  const v=window.__belgraveViewerRef, ren=v.renderer;
  let n=0; const o=ren.render.bind(ren); ren.render=function(){n++;return o.apply(null,arguments);};
  return new Promise(res=>setTimeout(()=>res({
    documentHidden:document.hidden, drawsPerSec:n,
    trianglesLastFrame:ren.info.render.triangles,
    dotsVisible:[...document.querySelectorAll('.hsdot')].filter(d=>!d.classList.contains('is-hidden')).length
  }),1200));
});
console.log(JSON.stringify(r));
console.log(r.trianglesLastFrame > 100000 ? 'MODEL IS RENDERING' : 'MODEL BLANK');
await p.screenshot({path:'shots/hidden-fix.png'});
await b.close();
