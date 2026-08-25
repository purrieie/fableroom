import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--hide-scrollbars']});
for (const [label,cpu,dl,lat] of [['Fast 4G (12 Mbps, 4x CPU)',4,12,70],['Slow 4G (4 Mbps, 4x CPU)',4,4,150]]) {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setCacheEnabled(false);
  await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const c = await p.createCDPSession();
  await c.send('Network.enable');
  await c.send('Network.emulateNetworkConditions',{offline:false,downloadThroughput:dl*1024*1024/8,uploadThroughput:1024*1024/8,latency:lat});
  await c.send('Emulation.setCPUThrottlingRate',{rate:cpu});
  const t0=Date.now();
  await p.goto(process.argv[2],{waitUntil:'domcontentloaded',timeout:180000});
  const dom=Date.now()-t0;
  await p.waitForFunction(()=>document.querySelector('#hero').classList.contains('is-ready'),{timeout:180000,polling:100});
  const ready=Date.now()-t0;
  const d=await p.evaluate(()=>({fcp:(performance.getEntriesByName('first-contentful-paint')[0]||{}).startTime, s:window.__belgraveStart, r:window.__belgraveReady}));
  console.log(`${label}: FCP ${Math.round(d.fcp)}ms | model script reached ${d.s}ms | 3D ready ${d.r}ms | DOMContentLoaded ${dom}ms`);
  await ctx.close();
}
await b.close();
