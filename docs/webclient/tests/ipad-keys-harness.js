const { webkit, chromium } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const INIT = `
Object.defineProperty(Navigator.prototype,'platform',{get(){return 'MacIntel'}});
Object.defineProperty(Navigator.prototype,'maxTouchPoints',{get(){return 5}});
window.__rec=[]; window.__sbn=[];
(function(){var cc;Object.defineProperty(window,'curConn',{configurable:true,get(){return cc},set(v){cc=v;
 if(v&&!v.__rec){v.__rec=1;['inputKey','inputString'].forEach(function(fn){var o=v[fn];v[fn]=function(){window.__rec.push(fn+':'+JSON.stringify([].slice.call(arguments,0,3)));try{return o.apply(v,arguments)}catch(e){}}})}}});})();
`;
async function boot(engine, opts={}) {
  const b = await (engine==='webkit'?webkit:chromium).launch(engine==='chrome'?{executablePath:'/usr/bin/google-chrome'}:{});
  const ctx = await b.newContext({ userAgent: opts.desktop ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' : UA, viewport:{width:1024,height:1366}, deviceScaleFactor:2, isMobile: (engine!=='webkit' && !opts.desktop), hasTouch:!opts.desktop });
  await ctx.addInitScript(opts.desktop ? INIT.replace("'MacIntel'","'Win32'").replace("return 5","return 0") : INIT);
  if (opts.local) {
    for (const f of opts.local) await ctx.route(new RegExp('/webclient/'+f.replace('.','\\.')+'(\\?|$)'), r => r.fulfill({ status:200, contentType: f.endsWith('.html')?'text/html':'application/javascript', body: fs.readFileSync(f) }));
    await ctx.route(/\/webclient\/(\?.*)?$/, r => r.fulfill({status:200, contentType:'text/html', body: fs.readFileSync('index.html')}));
  }
  const page = await ctx.newPage();
  page.on('console', m => { if(!/^gl: /.test(m.text())) console.log('C:', m.text().slice(0,160)); }); page.on('pageerror', e => console.log('PAGEERR', String(e).slice(0,150)));
  await page.goto('https://smartdesktopaccess.duckdns.org/webclient/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.setByName && !window.setByName.__sdaStub && document.querySelector('flt-glass-pane'), null, {timeout:60000});
  await page.waitForTimeout(4000);
  return {b, page};
}
async function openSession(page) {
  await page.evaluate(() => { const o = window.sdaSafeGlobalEvent; window.sdaSafeGlobalEvent = function(pl){ try { if (JSON.parse(pl).name==='msgbox') { console.log('DROP msgbox'); return; } } catch(e){} return o.apply(this, arguments); }; });
  await page.mouse.click(450, 107); await page.waitForTimeout(800);
  await page.keyboard.type('100000001', {delay:50}); await page.waitForTimeout(500);
  await page.mouse.click(765, 105);
  await page.waitForFunction(() => !!window.curConn, null, {timeout:20000});
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    const pi = { username:'test', hostname:'TEST', platform:'Windows', displays:[{x:0,y:0,width:1280,height:720}], current_display:0, sas_enabled:true, version:'1.4.0' };
    const t = {name:'peer_info'}; for (const k in pi) t[k]=JSON.stringify(pi[k]);
    window.sdaSafeGlobalEvent(JSON.stringify(t));
    const px = new Uint8Array(1280*720*4).fill(200);
    try { window.sdaSafeOnRgba(px); } catch(e) { console.log('rgba err '+e); }
  });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const c=document.createElement('canvas'); c.width=1280; c.height=720; c.getContext('2d').fillRect(0,0,10,10); window.__fakeCanvas=c; window.sdaBlitOverlay && window.sdaBlitOverlay(c,1280,720); });
  await page.waitForTimeout(1000);
  // wrap setByName at the outermost layer for logging
  await page.evaluate(() => { const o = window.setByName; const w = function(n,v){ if(/input|key/.test(n)) window.__sbn.push(n+':'+v); return o.apply(this, arguments); }; Object.assign(w,{__sdaStab:o.__sdaStab,__sdaStatus:o.__sdaStatus}); window.setByName = w; });
}
module.exports = { boot, openSession };
if (require.main === module) (async () => {
  const {b, page} = await boot(process.argv[2]||'webkit');
  await openSession(page);
  await page.screenshot({path:'s2.png'});
  console.log(await page.evaluate(() => ({ae: document.activeElement && document.activeElement.tagName, conn: !!curConn, rec: __rec, kb: !!document.getElementById('sda-kb-btn'), ta: document.querySelectorAll('textarea,input').length })));
  await b.close();
})();
