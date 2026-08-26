import puppeteer from 'puppeteer-core';
const CH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const alphas=process.argv.slice(2);
const b=await puppeteer.launch({executablePath:CH,headless:'new',protocolTimeout:240000,
 args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--hide-scrollbars']});
const pg=await b.newPage();
await pg.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await pg.goto('http://localhost:8777/belgrave-3d.html',{waitUntil:'networkidle2',timeout:300000});
await pg.waitForFunction(()=>document.querySelector('#hero').classList.contains('is-ready'),{timeout:300000,polling:250});
await pg.evaluate(()=>new Promise(r=>setTimeout(r,1200)));
// zoom in so the table genuinely sits behind the card - the worst case for legibility
await pg.evaluate(()=>{for(let i=0;i<3;i++)document.querySelector('#zoomIn').click();});
await pg.evaluate(()=>new Promise(r=>setTimeout(r,1500)));
await pg.evaluate(()=>document.querySelector('#detailsBtn').click());
await pg.evaluate(()=>new Promise(r=>setTimeout(r,800)));
await pg.evaluate(()=>document.querySelector('.hsdot').click());
await pg.evaluate(()=>new Promise(r=>setTimeout(r,900)));
const lum=(r,g,bb)=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};
  return 0.2126*f(r)+0.7152*f(g)+0.0722*f(bb)};
for(const a of alphas){
  await pg.evaluate((a)=>{const c=document.querySelector('#hsCard');
    c.style.background='rgba(255,255,255,'+a+')';},a);
  await pg.evaluate(()=>new Promise(r=>setTimeout(r,500)));
  const box=await pg.evaluate(()=>{const p=document.querySelector('#hsCard p').getBoundingClientRect();
    return {x:Math.round(p.x),y:Math.round(p.y),width:Math.round(p.width),height:Math.round(p.height)};});
  const buf=await pg.screenshot({clip:box});
  const {default:sharp}=await import('sharp');
  const {data,info}=await sharp(buf).raw().toBuffer({resolveWithObject:true});
  const ls=[];
  for(let i=0;i<data.length;i+=info.channels) ls.push(lum(data[i],data[i+1],data[i+2]));
  ls.sort((x,y)=>x-y);
  const ink=ls[Math.floor(ls.length*0.02)];      // darkest 2% = glyph cores
  const bg=ls[Math.floor(ls.length*0.90)];        // brightest 90th = paper
  const ratio=(bg+0.05)/(ink+0.05);
  console.log(`alpha ${a}  contrast ${ratio.toFixed(2)}:1  ${ratio>=4.5?'PASS AA':ratio>=3?'large-text only':'FAIL'}`);
  await pg.screenshot({path:`shots/card-a${a}.png`,clip:await pg.evaluate(()=>{const r=document.querySelector('#hero').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};})});
}
await b.close();
