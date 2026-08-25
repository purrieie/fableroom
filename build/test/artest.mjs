import puppeteer from 'puppeteer-core';
const URL_='http://localhost:8777/belgrave-3d.html';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--hide-scrollbars']});
const out=[];

/* ---------- 1. desktop: no AR, button explains itself ---------- */
{
  const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,160)));
  await p.setViewport({width:1440,height:900,deviceScaleFactor:1});
  await p.goto(URL_,{waitUntil:'networkidle2',timeout:120000});
  await p.evaluate(()=>new Promise(r=>setTimeout(r,4500)));
  const before=await p.evaluate(()=>document.querySelector('#arNote').classList.contains('on'));
  await p.click('#arBtn');
  await p.evaluate(()=>new Promise(r=>setTimeout(r,600)));
  const after=await p.evaluate(()=>({on:document.querySelector('#arNote').classList.contains('on'),
                                     msg:document.querySelector('#arNoteBody').textContent.slice(0,60),
                                     label:document.querySelector('#arLabel').textContent}));
  out.push('desktop: noteHiddenInitially='+(!before)+' noteShownOnClick='+after.on+' label="'+after.label+'" msg="'+after.msg+'…"');
  if(errs.length) out.push('  desktop errors: '+JSON.stringify(errs));
  await p.close();
}

/* ---------- 2. iOS Safari emulation: Quick Look path ---------- */
{
  const ctx=await b.createBrowserContext(); const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,200)));
  await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1');
  await p.evaluateOnNewDocument(()=>{
    Object.defineProperty(navigator,'platform',{get:()=>'iPhone'});
    delete navigator.xr;
    Object.defineProperty(navigator,'xr',{get:()=>undefined,configurable:true});
    const rl=HTMLAnchorElement.prototype;             // make relList report AR support
    const orig=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'relList')
            || Object.getOwnPropertyDescriptor(HTMLAnchorElement.prototype,'relList');
    Object.defineProperty(rl,'relList',{get:function(){
      const l=orig.get.call(this); const s=l.supports.bind(l);
      l.supports=(t)=> t==='ar' ? true : s(t); return l; },configurable:true});
    window.__arClicks=[];
    const oc=HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click=function(){
      if(this.rel==='ar'){ window.__arClicks.push({href:this.href.slice(0,24), hasImg:!!this.querySelector('img')}); return; }
      return oc.apply(this,arguments);
    };
  });
  await p.goto(URL_,{waitUntil:'networkidle2',timeout:120000});
  // the anchor should arm itself without any tap
  await p.waitForFunction(()=>{const a=document.querySelector('#arBtn');return a.rel==='ar'&&a.href.indexOf('blob:')===0;},{timeout:90000,polling:250});
  const armed=await p.evaluate(()=>{const a=document.querySelector('#arBtn');
    return {mode:window.__arMode, rel:a.rel, href:a.href.slice(0,12), tag:a.tagName,
            hasImg:!!a.querySelector('img'), imgVisible:(function(i){const r=i.getBoundingClientRect();return r.width>0&&r.height>0;})(a.querySelector('img'))};});
  out.push('iOS: mode='+armed.mode+' anchor='+armed.tag+' rel="'+armed.rel+'" href="'+armed.href+'…" imgChild='+armed.hasImg+' imgVisible='+armed.imgVisible);
  // a tap on an armed link must NOT be intercepted by our handler
  const prevented=await p.evaluate(()=>{const a=document.querySelector('#arBtn');
    const ev=new MouseEvent('click',{bubbles:true,cancelable:true}); a.dispatchEvent(ev); return ev.defaultPrevented;});
  out.push('  armed tap passed through to WebKit (not preventDefault): '+(!prevented));
  if(errs.length) out.push('  iOS errors: '+JSON.stringify(errs));
  await ctx.close();
}

/* ---------- 3. Android WebXR emulation: detection + session request ---------- */
{
  const ctx=await b.createBrowserContext(); const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,200)));
  await p.setViewport({width:412,height:915,deviceScaleFactor:2.6,isMobile:true,hasTouch:true});
  await p.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36');
  await p.evaluateOnNewDocument(()=>{
    window.__xrRequests=[];
    Object.defineProperty(navigator,'xr',{configurable:true,get:()=>({
      isSessionSupported:(m)=>Promise.resolve(m==='immersive-ar'),
      requestSession:(m,opts)=>{ window.__xrRequests.push({mode:m,
        required:opts.requiredFeatures, optional:opts.optionalFeatures,
        overlay:opts.domOverlay && opts.domOverlay.root && opts.domOverlay.root.id});
        return Promise.reject(new DOMException('NotAllowedError: test stub','NotAllowedError')); }
    })});
  });
  await p.goto(URL_,{waitUntil:'networkidle2',timeout:120000});
  await p.evaluate(()=>new Promise(r=>setTimeout(r,5000)));
  await p.click('#arBtn');
  await p.evaluate(()=>new Promise(r=>setTimeout(r,2500)));
  const r=await p.evaluate(()=>({req:window.__xrRequests,
    label:document.querySelector('#arLabel').textContent,
    note:document.querySelector('#arNote').classList.contains('on'),
    noteMsg:document.querySelector('#arNoteBody').textContent.slice(0,55),
    overlayOn:document.querySelector('#xrOverlay').classList.contains('on'),
    locked:document.body.classList.contains('is-locked')}));
  out.push('Android: sessionRequested='+JSON.stringify(r.req));
  out.push('  afterDenial: label="'+r.label+'" noteShown='+r.note+' overlayCleanedUp='+(!r.overlayOn)+' bodyUnlocked='+(!r.locked));
  out.push('  msg="'+r.noteMsg+'…"');
  if(errs.length) out.push('  Android errors: '+JSON.stringify(errs));
  await ctx.close();
}

console.log(out.join('\n'));
await b.close();
