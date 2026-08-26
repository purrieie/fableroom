import puppeteer from 'puppeteer-core';
const CH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL=process.argv[2]||'http://localhost:8777/belgrave-3d.html';
const b=await puppeteer.launch({executablePath:CH,headless:'new',protocolTimeout:400000,
 args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--hide-scrollbars']});
for(const [w,h] of [[320,780],[390,844],[430,932],[768,1024],[1280,860]]){
  const pg=await b.newPage(); const errs=[];
  pg.on('pageerror',e=>errs.push(String(e).slice(0,140)));
  pg.on('console',m=>{if(m.type()==='error')errs.push('con:'+m.text().slice(0,110));});
  await pg.setViewport({width:w,height:h,deviceScaleFactor:2,isMobile:w<700,hasTouch:w<700});
  await pg.goto(URL,{waitUntil:'networkidle2',timeout:400000});
  await pg.waitForFunction(()=>document.querySelector('#hero').classList.contains('is-ready'),{timeout:400000,polling:250});
  await pg.evaluate(()=>new Promise(r=>setTimeout(r,1000)));

  const bar=await pg.evaluate(()=>[...document.querySelectorAll('#studio .actbtn')].map(x=>x.id));
  const gone=await pg.evaluate(()=>['#arBtn','#xrOverlay','#arNote']
      .filter(s=>document.querySelector(s)));
  const spin=await pg.evaluate(()=>{const t=document.querySelector('#spinBtn'),hero=document.querySelector('#hero');
    if(!t)return null; const r=t.getBoundingClientRect(),hr=hero.getBoundingClientRect();
    return {inside:r.top>=hr.top-1&&r.bottom<=hr.bottom+1&&r.left>=hr.left-1,
            bg:getComputedStyle(t).backgroundColor};});

  // gesture contract, using canvas pixels to detect a spin
  let gest={skipped:true};
  if(w<700){
    const cb=await (await pg.$('#hero canvas')).boundingBox();
    const cx=cb.x+cb.width/2, cy=cb.y+cb.height/2;
    await pg.evaluate(()=>window.scrollTo(0,0));
    await pg.evaluate(()=>new Promise(r=>setTimeout(r,500)));
    const y0=await pg.evaluate(()=>window.scrollY);
    await pg.touchscreen.touchStart(cx,cy+120);
    for(let i=1;i<=8;i++){await pg.touchscreen.touchMove(cx,cy+120-i*22);await new Promise(r=>setTimeout(r,16));}
    await pg.touchscreen.touchEnd();
    await pg.evaluate(()=>new Promise(r=>setTimeout(r,700)));
    const vScroll=(await pg.evaluate(()=>window.scrollY))-y0;
    await pg.evaluate(()=>window.scrollTo(0,0));
    await pg.evaluate(()=>new Promise(r=>setTimeout(r,700)));
    const before=await pg.screenshot({clip:cb,encoding:'base64'});
    const y2=await pg.evaluate(()=>window.scrollY);
    await pg.touchscreen.touchStart(cx-90,cy);
    for(let i=1;i<=10;i++){await pg.touchscreen.touchMove(cx-90+i*18,cy);await new Promise(r=>setTimeout(r,16));}
    await pg.touchscreen.touchEnd();
    await pg.evaluate(()=>new Promise(r=>setTimeout(r,900)));
    const after=await pg.screenshot({clip:cb,encoding:'base64'});
    gest={vertScrolls:vScroll>40, horizSpins:before!==after,
          horizKeptScroll:(await pg.evaluate(()=>window.scrollY))===y2};
    // slider must not scroll the page
    await pg.evaluate(()=>window.scrollTo(0,0));
    const sb=await (await pg.$('#todRange')).boundingBox();
    const v0=await pg.evaluate(()=>+document.querySelector('#todRange').value);
    const sy=await pg.evaluate(()=>window.scrollY);
    await pg.touchscreen.touchStart(sb.x+sb.width/2,sb.y+sb.height/2);
    for(let i=1;i<=10;i++){await pg.touchscreen.touchMove(sb.x+sb.width/2,sb.y+sb.height/2-i*7);await new Promise(r=>setTimeout(r,18));}
    await pg.touchscreen.touchEnd();
    await pg.evaluate(()=>new Promise(r=>setTimeout(r,600)));
    gest.sliderMoves=(await pg.evaluate(()=>+document.querySelector('#todRange').value))!==v0;
    gest.sliderNoScroll=(await pg.evaluate(()=>window.scrollY))===sy;
  }

  // other controls still fine
  const ctl=await pg.evaluate(async()=>{
    const out={};
    for(const id of ['studioBtn','dimBtn','scaleBtn','grainBtn','detailsBtn']){
      const el=document.querySelector('#'+id); el.click();
      await new Promise(r=>setTimeout(r,400));
      out[id]=el.classList.contains('on');
      el.click(); await new Promise(r=>setTimeout(r,300));
    }
    return out;
  });
  console.log(`${w}px bar=[${bar}] leftovers=[${gone}] spinBg=${spin&&spin.bg} spinInside=${spin&&spin.inside}`);
  console.log(`      gestures=${JSON.stringify(gest)}`);
  console.log(`      controls=${JSON.stringify(ctl)} errors=${errs.length?JSON.stringify(errs.slice(0,3)):'none'}`);
  await pg.close();
}
await b.close();
