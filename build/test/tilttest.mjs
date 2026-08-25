import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:'new',protocolTimeout:180000,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--hide-scrollbars']});
const p=await b.newPage();
await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.goto(process.argv[2],{waitUntil:'networkidle2',timeout:300000});
await p.waitForFunction(()=>document.querySelector('#hero').classList.contains('is-ready'),{timeout:300000,polling:250});
await p.evaluate(()=>new Promise(r=>setTimeout(r,2000)));
const phi=()=>p.evaluate(()=>+(window.__belgraveViewerRef.controls.goal.phi*180/Math.PI).toFixed(1));
const scrollY=()=>p.evaluate(()=>window.scrollY);

const before={phi:await phi(), y:await scrollY()};
// two fingers dragged upward = look down onto the tabletop
await p.evaluate(()=>{
  const c=document.querySelector('#hero canvas');
  const r=c.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2;
  const T=(id,x,y)=>new Touch({identifier:id,target:c,clientX:x,clientY:y});
  const fire=(t,pts)=>c.dispatchEvent(new TouchEvent(t,{bubbles:true,cancelable:true,touches:pts,targetTouches:pts,changedTouches:pts}));
  fire('touchstart',[T(1,cx-45,cy),T(2,cx+45,cy)]);
  for(let i=1;i<=12;i++) fire('touchmove',[T(1,cx-45,cy+i*11),T(2,cx+45,cy+i*11)]);
  fire('touchend',[]);
});
await p.evaluate(()=>new Promise(r=>setTimeout(r,900)));
const after={phi:await phi(), y:await scrollY()};
console.log(`two-finger drag DOWN:  phi ${before.phi}deg -> ${after.phi}deg  (tilted ${(before.phi-after.phi).toFixed(1)}deg toward the tabletop)`);
console.log(`                     page scroll ${before.y} -> ${after.y}  (unchanged: ${before.y===after.y})`);

// one finger vertical must still scroll the page
const y0=await scrollY();
const bb=await (await p.$('#hero canvas')).boundingBox();
const cx=bb.x+bb.width/2, cy=bb.y+bb.height/2;
await p.touchscreen.touchStart(cx, cy+150);
for(let i=1;i<=8;i++){ await p.touchscreen.touchMove(cx, cy+150-i*24); await new Promise(r=>setTimeout(r,16)); }
await p.touchscreen.touchEnd();
await p.evaluate(()=>new Promise(r=>setTimeout(r,800)));
console.log(`one-finger drag up:  page scrolled ${y0} -> ${await scrollY()}`);
await p.screenshot({path:'shots/idx-tilt.png'});
await b.close();
