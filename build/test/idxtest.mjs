import puppeteer from 'puppeteer-core';
const URL_=process.argv[2]||'http://localhost:8777/belgrave-3d.html';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:'new',protocolTimeout:180000,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--hide-scrollbars']});
for (const [w,h,tag] of [[390,844,'mobile'],[1280,860,'desktop']]) {
  const p=await b.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,200)));
  p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text().slice(0,140));});
  await p.setViewport({width:w,height:h,deviceScaleFactor:2,isMobile:w<700,hasTouch:w<700});
  await p.goto(URL_,{waitUntil:'networkidle2',timeout:300000});
  await p.waitForFunction(()=>document.querySelector('#hero').classList.contains('is-ready'),{timeout:300000,polling:250});
  await p.evaluate(()=>new Promise(r=>setTimeout(r,1800)));
  const geo=await p.evaluate(()=>{
    const hero=document.querySelector('#hero').getBoundingClientRect();
    const st=document.querySelector('#studio').getBoundingClientRect();
    const rail=document.querySelector('#hourRail').getBoundingClientRect();
    const acts=document.querySelector('.studio__acts');
    return {heroH:Math.round(hero.height), panelH:Math.round(st.height),
            pct:Math.round(st.height/hero.height*100),
            railInside: rail.left>=hero.left-2 && rail.right<=hero.right+2,
            panelClearOfRail: st.left >= rail.right - 1,
            overflow:acts.scrollWidth-acts.clientWidth,
            buttons:[...document.querySelectorAll('.actbtn span')].map(e=>e.textContent),
            lightPresets:document.querySelectorAll('.lightbtn').length};
  });
  console.log(`${tag}: hero ${geo.heroH}px, panel ${geo.panelH}px (${geo.pct}%), railInsideHero=${geo.railInside}, panelClearOfRail=${geo.panelClearOfRail}, rowOverflow=${geo.overflow}px, lightPresets=${geo.lightPresets}`);
  console.log(`  buttons: ${geo.buttons.join(' / ')}`);
  // chairs
  await p.evaluate(()=>document.querySelector('#scaleBtn').click());
  await p.waitForFunction(()=>document.querySelector('#chairTag').classList.contains('on'),{timeout:120000,polling:250}).catch(()=>{});
  await p.evaluate(()=>new Promise(r=>setTimeout(r,2200)));
  const ch=await p.evaluate(()=>{
    const t=document.querySelector('#chairTag');
    return {tagOn:t.classList.contains('on'), href:t.getAttribute('href').slice(0,64),
            text:t.innerText.replace(/\n/g,' | ')};
  });
  console.log(`  chairs: tag=${ch.tagOn} "${ch.text}"`);
  console.log(`          -> ${ch.href}…`);
  await p.screenshot({path:`shots/idx-${tag}-chairs.png`});
  // hour rail
  await p.evaluate(()=>{const t=document.querySelector('#todRange');t.value=6;t.dispatchEvent(new Event('input'));});
  await p.evaluate(()=>new Promise(r=>setTimeout(r,700)));
  const dawn=await p.evaluate(()=>({hour:document.querySelector('#todRead').textContent,
    studioOn:document.querySelector('#studioBtn').classList.contains('on')}));
  await p.evaluate(()=>document.querySelector('#studioBtn').click());
  await p.evaluate(()=>new Promise(r=>setTimeout(r,700)));
  const back=await p.evaluate(()=>({hour:document.querySelector('#todRead').textContent,
    studioOn:document.querySelector('#studioBtn').classList.contains('on')}));
  console.log(`  hour: dawn=${dawn.hour} studioLit=${dawn.studioOn} -> tap Studio -> ${back.hour} studioLit=${back.studioOn}`);
  await p.evaluate(()=>document.querySelector('#dimBtn').click());
  await p.evaluate(()=>new Promise(r=>setTimeout(r,900)));
  await p.screenshot({path:`shots/idx-${tag}-all.png`});
  console.log(`  errors: ${errs.length?JSON.stringify(errs.slice(0,3)):'none'}`);
  await p.close();
}
await b.close();
