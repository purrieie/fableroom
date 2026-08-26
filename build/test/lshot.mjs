import puppeteer from 'puppeteer-core';
const CH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CH,headless:'new',protocolTimeout:300000,
 args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--hide-scrollbars']});
const pg=await b.newPage();
await pg.setViewport({width:700,height:700,deviceScaleFactor:1});
for(const spec of process.argv.slice(2)){
  const [name,qs]=spec.split('::');
  await pg.goto('http://localhost:8777/lightlab.html?'+qs,{waitUntil:'networkidle2',timeout:300000});
  try{ await pg.waitForFunction(()=>window.__ready||window.__err,{timeout:300000,polling:250}); }
  catch(e){ console.log(name,'TIMEOUT'); continue; }
  const err=await pg.evaluate(()=>window.__err);
  if(err){ console.log(name,'ERR',err); continue; }
  await pg.evaluate(()=>new Promise(r=>setTimeout(r,600)));
  await pg.screenshot({path:`shots/L_${name}.png`});
  console.log(name,'ok  maxAniso='+await pg.evaluate(()=>window.__maxAniso));
}
await b.close();
