// Disconnect / Add computer / Sessions test. Fake IDs only (100000001 + 100000002);
// the computer list is a fake list served by the test; sockets replaced by recorders.
const {boot, openSession} = require('./ipad-keys-harness');
const engine = process.argv[2] || 'webkit';
const desktop = process.argv[3] === 'desktop';
const local = process.argv[4] === 'live' ? null : ['sda-stability.js','sda-status.js','sda-controls.js'];
let fails = 0;
function ok(c, label, info){ if(!c) fails++; console.log((c?'PASS ':'FAIL ')+label+(info?'  '+info:'')); }
const FAKE = { devices: [ {id:'100000001', alias:'TEST ONE', online:true}, {id:'100000002', alias:'TEST TWO', online:true}, {id:'100000003', alias:'TEST OFF', online:false} ] };
const DROP_MSGBOX = `(function(){var t=setInterval(function(){var o=window.sdaSafeGlobalEvent; if(typeof o==='function' && !o.__drop){ var w=function(pl){ try{ if(JSON.parse(pl).name==='msgbox') return; }catch(e){} return o.apply(this,arguments); }; w.__drop=1; window.sdaSafeGlobalEvent=w; } },50); setTimeout(function(){clearInterval(t)},60000);})();`;
async function fakeSock(page, id, name){
  await page.evaluate(([id,name])=>{
    curConn._peerInfo = { username:'test', hostname:name, platform:'Windows', displays:[{x:0,y:0,width:1280,height:720}], current_display:0, sas_enabled:true, version:'1.4.0' };
    window.__out=[]; const ws=curConn._ws; window.__realWs=ws._websocket;
    ws._websocket={readyState:1, send(d){ window.__out.push(Array.from(d)); }, close(){ window.__out.push('CLOSE'); }}; ws._secretKey=undefined;
    if(!window.__fakeCanvas){ const c=document.createElement('canvas'); c.width=1280; c.height=720; c.getContext('2d').fillRect(0,0,10,10); window.__fakeCanvas=c; } window.sdaBlitOverlay && window.sdaBlitOverlay(window.__fakeCanvas,1280,720);
  }, [id,name]);
}
const nonMouse = (out)=>out.filter(d=>d==='CLOSE' || d[0]!==0x52);
(async()=>{
  const {b,page} = await boot(engine, {local, desktop});
  const ctx = page.context();
  await ctx.route(/\/companion\/api\/v1\/web-status/, r=>r.fulfill({status:200, contentType:'application/json', body: JSON.stringify(FAKE)}));
  await ctx.addInitScript(DROP_MSGBOX);
  // fake account endpoints so the fake token is accepted; no real login
  await ctx.route(/\/api\/server-config/, r=>r.fulfill({status:200, contentType:'application/json', body: JSON.stringify({code:0, data:{}})}));
  await ctx.route(/\/api\/currentUser/, r=>r.fulfill({status:200, contentType:'application/json', body: JSON.stringify({name:'sdatest', email:'', note:'', status:1, is_admin:false})}));
  await openSession(page);
  await fakeSock(page, '100000001', 'TEST ONE');
  await page.evaluate(()=>localStorage.setItem('access_token','sda-test-fake-token'));
  await page.waitForTimeout(3500);
  console.log('engine', engine, desktop?'desktop':'ipad', 'ver', await page.evaluate(()=>window.__sdaCtl.ver));
  const P = desktop ? {add:'#sda-add-btn2', disc:'#sda-disc-btn2', sess:'#sda-sess-btn2'} : {add:'#sda-add-btn', disc:'#sda-disc-btn', sess:'#sda-sess-btn'};
  for (const k of Object.keys(P)) ok(await page.$(P[k])!==null, 'quick button '+P[k]);
  ok(await page.$eval(P.sess, e=>getComputedStyle(e).display==='none'), 'sessions button hidden with one session');
  ok((await page.title()).startsWith('SDA · TEST ONE'), 'tab title names the computer', await page.title());
  await page.screenshot({path:`mt-${engine}-${desktop?'desk':'ipad'}-bar.png`});
  // picker
  await page.click(P.add); await page.waitForTimeout(800);
  const rows = await page.$$eval('#sda-ctl-pick .sda-ctl-pc', rs=>rs.map(r=>({tag:r.tagName, id:r.dataset.id, href:r.getAttribute('href'), target:r.getAttribute('target'), rel:r.getAttribute('rel'), txt:r.textContent})));
  console.log(JSON.stringify(rows));
  ok(rows.length===3, 'picker lists the 3 computers with status');
  ok(rows.find(r=>r.id==='100000001').tag==='DIV' && /this tab/.test(rows.find(r=>r.id==='100000001').txt), 'current computer marked "open in this tab", not clickable');
  ok(rows.find(r=>r.id==='100000003').tag==='DIV' && /Offline/.test(rows.find(r=>r.id==='100000003').txt), 'offline computer not clickable');
  const r2 = rows.find(r=>r.id==='100000002');
  ok(r2.tag==='A' && r2.target==='_blank' && r2.rel==='noopener' && /#\/\?id=100000002$/.test(r2.href), 'online computer is a plain new-tab link with ?id', JSON.stringify(r2));
  await page.screenshot({path:`mt-${engine}-${desktop?'desk':'ipad'}-picker.png`});
  const urlA = page.url();
  const [pageB] = await Promise.all([ ctx.waitForEvent('page', {timeout:20000}), page.click('#sda-ctl-pick a[data-id="100000002"]') ]);
  pageB.on('pageerror', e=>console.log('B PAGEERR', String(e).slice(0,150)));
  await pageB.waitForLoadState('load');
  console.log('B url', pageB.url());
  ok(page.url()===urlA, 'first tab did not navigate', page.url());
  let bid=null;
  try { await pageB.waitForFunction(()=>window.curConn && window.curConn._id, null, {timeout:60000}); bid = await pageB.evaluate(()=>window.curConn._id); } catch(e) {}
  ok(bid==='100000002', 'new tab auto-connected to 100000002 with no extra tap', ''+bid);
  const a1 = await page.evaluate(()=>({id: curConn && curConn._id, closed: !!(curConn && curConn._userClosed), out: window.__out.splice(0)}));
  ok(a1.id==='100000001' && !a1.closed, 'first session still open', JSON.stringify({id:a1.id, closed:a1.closed}));
  ok(nonMouse(a1.out).length===0, 'first session got no messages from opening the tab', JSON.stringify(nonMouse(a1.out)).slice(0,200));
  if (bid) {
    await pageB.waitForTimeout(3000);
    await fakeSock(pageB, '100000002', 'TEST TWO');
    await pageB.waitForTimeout(4000); await page.waitForTimeout(500);
    const txt = await page.$eval(P.sess, e=>({d:getComputedStyle(e).display, t:e.textContent}));
    ok(txt.d!=='none' && /2 open/.test(txt.t), 'first tab shows "⇄ 2 open"', JSON.stringify(txt));
    await page.click(P.sess); await page.waitForTimeout(500);
    const sess = await page.$$eval('#sda-ctl-panel [data-act^="sess-"]', bs=>bs.map(x=>x.textContent));
    ok(sess.length===2 && sess.some(t=>/TEST ONE.*this tab/.test(t)) && sess.some(t=>/TEST TWO/.test(t)), 'sessions switcher lists both', JSON.stringify(sess));
    await page.screenshot({path:`mt-${engine}-${desktop?'desk':'ipad'}-sessions.png`});
    await page.click('#sda-ctl-panel [data-act="sess-100000002"]'); await pageB.waitForTimeout(700);
    ok(/^▶ |^SDA/.test(await pageB.title()) && (await pageB.evaluate(()=>!!document.title)), 'switch request reached the other tab', await pageB.title());
    // disconnect in B: cancel first
    const PB = P;
    await pageB.click(PB.disc); await pageB.waitForTimeout(400);
    await pageB.screenshot({path:`mt-${engine}-${desktop?'desk':'ipad'}-disconnect.png`});
    await pageB.click('#sda-ctl-panel [data-act="cancel"]'); await pageB.waitForTimeout(500);
    let bo = await pageB.evaluate(()=>({id: curConn && curConn._id, out: window.__out.splice(0)}));
    ok(bo.id==='100000002' && nonMouse(bo.out).length===0, 'Disconnect Cancel keeps the session, sends nothing', JSON.stringify(nonMouse(bo.out)));
    await pageB.click(PB.disc); await pageB.waitForTimeout(400);
    await pageB.evaluate(()=>{ window.__keepOut = window.__out; });
    const nav = pageB.waitForNavigation({timeout:15000}).catch(()=>null);
    await pageB.click('#sda-ctl-panel [data-act="confirm"]');
    await nav; await pageB.waitForLoadState('load'); await pageB.waitForTimeout(4000);
    const after = await pageB.evaluate(()=>({url: location.href, conn: !!window.curConn, list: !!document.getElementById('sda-peer-list'), bar: !!document.getElementById('sda-session-tools')||!!document.getElementById('sda-ctl-dbar')}));
    ok(!after.conn && !/id=/.test(after.url) && !after.bar, 'after Disconnect the tab is back on the computer list, no session', JSON.stringify(after));
    await page.waitForTimeout(3500);
    const a2 = await page.evaluate(()=>({id: curConn && curConn._id, closed: !!(curConn && curConn._userClosed), out: window.__out.splice(0), n: window.sdaOpenSessions().length}));
    ok(a2.id==='100000001' && !a2.closed && nonMouse(a2.out).length===0, 'first session untouched by the other tab disconnecting', JSON.stringify({id:a2.id,closed:a2.closed}));
    ok(a2.n===1, 'sessions back to 1', ''+a2.n);
  }
  // keyboard still works in A
  if (!desktop) { await page.bringToFront(); await page.mouse.click(500,700); await page.waitForTimeout(400); }
  await page.evaluate(()=>window.__out.splice(0));
  await page.keyboard.press('a'); await page.waitForTimeout(500);
  const ko = await page.evaluate(()=>window.__out.splice(0));
  ok(ko.some(d=>d!=='CLOSE' && d[0]===0x7a), 'keyboard still reaches the first session', 'frames '+ko.length);
  // disconnect A itself (direct)
  await page.click(P.disc); await page.waitForTimeout(400);
  const navA = page.waitForNavigation({timeout:15000}).catch(()=>null);
  await page.click('#sda-ctl-panel [data-act="confirm"]'); await navA; await page.waitForTimeout(3000);
  const aa = await page.evaluate(()=>({conn: !!window.curConn, url: location.href}));
  ok(!aa.conn, 'Disconnect in the first tab returns to the list', JSON.stringify(aa));
  console.log(fails?`RESULT: ${fails} FAIL`:'RESULT: ALL PASS');
  await b.close();
})();
