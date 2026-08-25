import puppeteer from 'puppeteer-core';
const CH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL=process.argv[2]||'http://localhost:8777/belgrave-3d.html';
const b=await puppeteer.launch({executablePath:CH,headless:'new',protocolTimeout:240000,
  args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--hide-scrollbars']});
const out=[];
for (const [w,h,tag] of [[320,780,'320'],[390,844,'390'],[430,932,'430'],[768,1024,'768'],[1280,860,'1280']]) {
  const p=await b.newPage(); const errs=[];
  p.on('pageerror',e=>errs.push(String(e).slice(0,160)));
  await p.setViewport({width:w,height:h,deviceScaleFactor:2,isMobile:w<700,hasTouch:w<700});
  await p.goto(URL,{waitUntil:'networkidle2',timeout:300000});
  await p.waitForFunction(()=>document.querySelector('#hero').classList.contains('is-ready'),{timeout:300000,polling:250});
  await p.evaluate(()=>new Promise(r=>setTimeout(r,1200)));

  // ---- 2. rail size + horizontal label ----
  const rail=await p.evaluate(()=>{
    const r=document.querySelector('#hourRail'), rd=document.querySelector('#todRead');
    const rb=r.getBoundingClientRect(), db=rd.getBoundingClientRect();
    return {w:+rb.width.toFixed(1),h:+rb.height.toFixed(1),
      touchAction:getComputedStyle(r).touchAction,
      sliderTouchAction:getComputedStyle(document.querySelector('#todRange')).touchAction,
      writingMode:getComputedStyle(rd).writingMode,
      labelClipped: db.width>rb.width+1};
  });

  // ---- 3. label ----
  const scaleLabel=await p.evaluate(()=>document.querySelector('#scaleBtn span').textContent);

  // ---- 4. dimensions inside the frame at DEFAULT framing ----
  await p.evaluate(()=>document.querySelector('#dimBtn').click());
  await p.evaluate(()=>new Promise(r=>setTimeout(r,1400)));
  const dims=await p.evaluate(()=>{
    const hero=document.querySelector('#hero').getBoundingClientRect();
    return [...document.querySelectorAll('.dimlabel')].map(d=>{
      const r=d.getBoundingClientRect();
      return {t:d.textContent, on:d.classList.contains('on'),
        insideL:+(r.left-hero.left).toFixed(1), insideR:+(hero.right-r.right).toFixed(1),
        fits: r.left>=hero.left-0.5 && r.right<=hero.right+0.5};
    });
  });
  await p.evaluate(()=>document.querySelector('#dimBtn').click());
  await p.evaluate(()=>new Promise(r=>setTimeout(r,500)));

  // ---- 1. slider drag must NOT scroll the page ----
  let slider={skipped:true};
  if (w<700){
    await p.evaluate(()=>window.scrollTo(0,0));
    await p.evaluate(()=>new Promise(r=>setTimeout(r,400)));
    const bb=await (await p.$('#todRange')).boundingBox();
    const cx=bb.x+bb.width/2, cy=bb.y+bb.height/2;
    const v0=await p.evaluate(()=>+document.querySelector('#todRange').value);
    const y0=await p.evaluate(()=>window.scrollY);
    await p.touchscreen.touchStart(cx,cy);
    for(let i=1;i<=10;i++){await p.touchscreen.touchMove(cx,cy-i*7);await new Promise(r=>setTimeout(r,18));}
    await p.touchscreen.touchEnd();
    await p.evaluate(()=>new Promise(r=>setTimeout(r,700)));
    const v1=await p.evaluate(()=>+document.querySelector('#todRange').value);
    const y1=await p.evaluate(()=>window.scrollY);
    slider={valueMoved:v1!==v0, from:v0, to:v1, pageScrolled:y1-y0};
  }

  // ---- regression: canvas gesture contract still intact ----
  let gest={skipped:true};
  if (w<700){
    await p.evaluate(()=>window.scrollTo(0,0));
    await p.evaluate(()=>new Promise(r=>setTimeout(r,500)));
    const cb=await (await p.$('#hero canvas')).boundingBox();
    const cx=cb.x+cb.width/2, cy=cb.y+cb.height/2;
    const y0=await p.evaluate(()=>window.scrollY);
    await p.touchscreen.touchStart(cx,cy+120);
    for(let i=1;i<=8;i++){await p.touchscreen.touchMove(cx,cy+120-i*22);await new Promise(r=>setTimeout(r,16));}
    await p.touchscreen.touchEnd();
    await p.evaluate(()=>new Promise(r=>setTimeout(r,700)));
    const vScroll=(await p.evaluate(()=>window.scrollY))-y0;
    await p.evaluate(()=>window.scrollTo(0,0));
    await p.evaluate(()=>new Promise(r=>setTimeout(r,600)));
    const t0=await p.evaluate(()=>(document.querySelector('.hsdot')||{style:{}}).style.transform||'-');
    const y2=await p.evaluate(()=>window.scrollY);
    await p.touchscreen.touchStart(cx-90,cy);
    for(let i=1;i<=10;i++){await p.touchscreen.touchMove(cx-90+i*18,cy);await new Promise(r=>setTimeout(r,16));}
    await p.touchscreen.touchEnd();
    await p.evaluate(()=>new Promise(r=>setTimeout(r,700)));
    const t1=await p.evaluate(()=>(document.querySelector('.hsdot')||{style:{}}).style.transform||'-');
    gest={vertScrolls:vScroll>40, horizSpins:t1!==t0,
          horizKeptScroll:(await p.evaluate(()=>window.scrollY))===y2};
  }

  const layout=await p.evaluate(()=>{
    const hero=document.querySelector('#hero').getBoundingClientRect();
    const st=document.querySelector('#studio').getBoundingClientRect();
    return {barCentred:Math.round((st.left+st.right)/2-(hero.left+hero.right)/2),
            foldFit:(document.querySelector('#hero').offsetTop+document.querySelector('#hero').offsetHeight)<=window.innerHeight+8};
  });
  await p.screenshot({path:`shots/fix-${tag}.png`});
  out.push({tag,rail,scaleLabel,dims,slider,gest,layout,errs});
  await p.close();
}
await b.close();
for(const r of out){
  console.log(`\n### ${r.tag}px`);
  console.log(' rail   ', JSON.stringify(r.rail));
  console.log(' label  ', r.scaleLabel);
  console.log(' dims   ', JSON.stringify(r.dims));
  console.log(' slider ', JSON.stringify(r.slider));
  console.log(' gesture', JSON.stringify(r.gest));
  console.log(' layout ', JSON.stringify(r.layout));
  console.log(' errors ', r.errs.length?JSON.stringify(r.errs):'none');
}
