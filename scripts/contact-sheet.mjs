// Kontaktbogen: rendert alle SVG-Texturen in ein Raster und speichert einen Screenshot.
// Prüft außerdem, ob eine Grafik über ihre viewBox hinausragen würde (wird abgeschnitten) und meldet das.
// Aufruf: node scripts/contact-sheet.mjs <ausgabe.png> [filter]  (braucht playwright-core, PW_PATH = Pfad zu node_modules)
// filter: nur Keys, die mit diesem Präfix beginnen (z. B. "boss" oder "bg_")
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const out = process.argv[2] || 'build/contact-sheet.png';
const filter = process.argv[3] || '';
const require = createRequire(join(process.env.PW_PATH || '.', 'x.js'));
const pw = require('playwright-core');
const browserType = process.env.BROWSER === 'chromium' ? pw.chromium : pw.firefox;
const res = await build({ entryPoints: ['src/assets/sprites.ts'], bundle: true, format: 'iife', globalName: 'S', write: false });
const js = res.outputFiles[0].text;
const html = `<html><body style="margin:0;background:#151829;font:11px sans-serif;color:#9ab">
<div id="g" style="display:flex;flex-wrap:wrap;gap:6px;padding:8px;align-items:flex-start"></div>
<script>${js};
const filter=${JSON.stringify(filter)};
const s=S.allSvgs();
const url=(v)=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(v);
const load=(v)=>new Promise((r)=>{const im=new Image();im.onload=()=>r(im);im.onerror=()=>r(null);im.src=url(v);});
/** rendert die Grafik mit vergrößerter viewBox und zählt Pixel außerhalb der eigentlichen Fläche */
async function overflow(v){
  const m=/viewBox="0 0 ([\\d.]+) ([\\d.]+)"/.exec(v);if(!m)return 0;
  const w=+m[1],h=+m[2],P=8;
  const big=v.replace(/width="[\\d.]+" height="[\\d.]+" viewBox="0 0 [\\d.]+ [\\d.]+"/,
    'width="'+(w+2*P)*2+'" height="'+(h+2*P)*2+'" viewBox="'+(-P)+' '+(-P)+' '+(w+2*P)+' '+(h+2*P)+'"');
  const im=await load(big);if(!im)return -1;
  const c=document.createElement('canvas');c.width=(w+2*P)*2;c.height=(h+2*P)*2;
  const g=c.getContext('2d');g.drawImage(im,0,0);
  const d=g.getImageData(0,0,c.width,c.height).data;let n=0;
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
    const inside=x>=P*2&&x<(P+w)*2&&y>=P*2&&y<(P+h)*2;
    if(!inside&&d[(y*c.width+x)*4+3]>24)n++;
  }
  return n;
}
window.report=(async()=>{
  const bad=[];
  for(const [k,v] of Object.entries(s)){
    if(filter&&!k.startsWith(filter))continue;
    const d=document.createElement('div');
    d.style.cssText='display:flex;flex-direction:column;align-items:center;background:#0a0c18;padding:4px;outline:1px dashed #333';
    let w=+/width="([\\d.]+)"/.exec(v)[1]/2,h=+/height="([\\d.]+)"/.exec(v)[1]/2;
    const k2=w<60?2:w>200||h>200?0.6:1;
    const im=new Image();im.src=url(v);im.width=w*k2;im.height=h*k2;im.style.outline='1px solid #3a3f60';
    d.append(im);const t=document.createElement('span');t.textContent=k;d.append(t);g.append(d);
    const o=await overflow(v);
    if(o!==0){bad.push(k+' ('+o+' px)');d.style.outline='2px solid #ff3d6e';t.style.color='#ff3d6e';}
  }
  return bad;
})();
</script></body></html>`;
const browser = await browserType.launch(process.env.BROWSER_EXE ? { executablePath: process.env.BROWSER_EXE } : {});
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
await page.setContent(html);
const bad = await page.evaluate(() => window.report);
await page.waitForTimeout(300);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('gespeichert:', out);
console.log(bad.length ? `ragt über die viewBox hinaus: ${bad.join(', ')}` : 'viewBox-Prüfung: alles innerhalb');
