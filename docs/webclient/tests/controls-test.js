// Fake-session test for SDA Controls. Never talks to a real computer: the
// session is to the nonexistent ID 100000001 and its socket is replaced by a
// recorder before any button is pressed.
const {boot, openSession} = require('./ipad-keys-harness');
const nacl = require('tweetnacl');
const engine = process.argv[2] || 'webkit';
const desktop = process.argv[3] === 'desktop';
let fails = 0;
function ok(c, label, info){ if(!c) fails++; console.log((c?'PASS ':'FAIL ')+label+(info?'  '+info:'')); }
function rdVar(b, i){ let r=0, m=1, x; do { x=b[i++]; r+= (x&127)*m; m*=128; } while(x&128); return [r,i]; }
function parse(b){ const out=[]; let i=0; while(i<b.length){ let t; [t,i]=rdVar(b,i); const f=Math.floor(t/8), w=t&7; if(w===0){let v;[v,i]=rdVar(b,i); out.push({f,v});} else if(w===2){let l;[l,i]=rdVar(b,i); out.push({f,bytes:b.slice(i,i+l)}); i+=l;} else if(w===5){out.push({f,v:b.slice(i,i+4)});i+=4;} else if(w===1){i+=8;} else throw new Error('wire '+w);} return out; }
function describe(plain){
  const top=parse(plain); const parts=[];
  for(const t of top){
    if(t.f===15){ const k=parse(t.bytes); const o={}; k.forEach(x=>{ if(x.f===8){ (o.mods=o.mods||[]); if(x.bytes) x.bytes.forEach(v=>o.mods.push(v)); else o.mods.push(x.v);} else o[x.f]=x.bytes?Buffer.from(x.bytes).toString():x.v; }); parts.push('key_event'+JSON.stringify(o)); }
    else if(t.f===19){ const m=parse(t.bytes); m.forEach(x=>{ if(x.f===7){ const op=parse(x.bytes); parts.push('misc.option'+JSON.stringify(Object.fromEntries(op.map(y=>[y.f,y.v])))); } else if(x.f===5){ const sd=parse(x.bytes); parts.push('misc.switch_display'+JSON.stringify(Object.fromEntries(sd.map(y=>[y.f,y.v])))); } else parts.push('misc.'+x.f+'='+(x.bytes?'['+x.bytes.length+'b]':x.v)); }); }
    else if(t.f===10){ const mm=parse(t.bytes); const o=Object.fromEntries(mm.map(y=>[y.f,y.v])); parts.push('mouse'+(o[1]?('[mask'+o[1]+']'):'[move]')); }
    else parts.push('msg.'+t.f);
  }
  return parts.join(',');
}
(async()=>{
  const {b,page} = await boot(engine, {local:['sda-stability.js','sda-status.js','sda-controls.js'], desktop});
  await openSession(page);
  const key = Array.from(nacl.randomBytes(32));
  await page.evaluate((key)=>{
    curConn._peerInfo = { username:'test', hostname:'TEST', platform:'Windows', displays:[{x:0,y:0,width:1280,height:720},{x:1280,y:0,width:1920,height:1080}], current_display:0, sas_enabled:true, version:'1.4.0' };
    window.__out=[]; window.__calls=[];
    const ws=curConn._ws; window.__realWs=ws._websocket;
    ws._websocket={readyState:1, send(d){ window.__out.push({n:ws._secretKey?ws._secretKey[1]:-1, d:Array.from(d)}); }, close(){}};
    ws._secretKey=undefined; window.__key=new Uint8Array(key);
    const o=window.setByName; const w=function(n,v){ if(!/mouse/.test(n)) window.__calls.push(n+':'+v); return o.apply(this,arguments)}; Object.assign(w,{__sdaStab:o.__sdaStab,__sdaStatus:o.__sdaStatus}); window.setByName=w;
  }, key);
  await page.waitForTimeout(1200);
  console.log('engine',engine,desktop?'desktop':'ipad','ctl ver',await page.evaluate(()=>window.__sdaCtl&&window.__sdaCtl.ver));
  const openBtn = desktop ? '#sda-ctl-fab' : '#sda-ctl-btn';
  ok(await page.$(openBtn)!==null, 'Controls button present '+openBtn);
  if(!desktop) ok(await page.$('#sda-cad-btn')!==null, 'Ctrl+Alt+Del quick button present');
  await page.screenshot({path:`ct-${engine}-${desktop?'desk':'ipad'}-bar.png`});
  async function drain(){ await page.waitForTimeout(400); const r=await page.evaluate(()=>({out:window.__out.splice(0), calls:window.__calls.splice(0), stab:window.__sdaKeyGuard})); return {calls:r.calls, msgs:r.out.map(x=>{ const pl= x.n<0 ? Uint8Array.from(x.d) : nacl.secretbox.open(Uint8Array.from(x.d), nonce(x.n), Uint8Array.from(key)); return pl?describe(pl):'DECRYPT-FAIL'; })}; }
  function nonce(v){ const b=new Uint8Array(24); for(let i=0;i<24&&v>0;i++){const by=v&255;b[i]=by;v=(v-by)/256;} return b; }
  async function act(sel){ if(!(await page.$('#sda-ctl-panel'))) await page.click(openBtn); await page.waitForTimeout(300); await page.click(`#sda-ctl-panel [data-act="${sel}"]`); }
  await drain();
  // 1 CAD
  await act('cad'); let r=await drain(); ok(r.msgs.join()==='key_event{"1":1,"3":100,"mods":[]}', 'Ctrl+Alt+Del -> KeyEvent control_key=CtrlAltDel(100) down', JSON.stringify(r));
  if(!desktop){ await page.click('#sda-cad-btn'); r=await drain(); ok(r.msgs.join()==='key_event{"1":1,"3":100,"mods":[]}', 'bar Ctrl+Alt+Del button', JSON.stringify(r)); }
  await act('lock'); r=await drain(); ok(r.msgs.join()==='key_event{"1":1,"3":101,"mods":[]}', 'Lock -> control_key=LockScreen(101)', JSON.stringify(r));
  await act('refresh'); r=await drain(); ok(r.msgs.join()==='misc.10=1', 'Refresh -> Misc.refresh_video', JSON.stringify(r));
  // restart: cancel first
  await act('restart'); await page.waitForTimeout(300);
  await page.screenshot({path:`ct-${engine}-${desktop?'desk':'ipad'}-restart.png`});
  await page.click('#sda-ctl-panel [data-act="cancel"]'); r=await drain(); ok(r.msgs.length===0 && r.calls.length===0, 'Restart Cancel sends nothing', JSON.stringify(r));
  await act('restart'); await page.waitForTimeout(300); await page.click('#sda-ctl-panel [data-act="confirm"]'); r=await drain(); ok(r.msgs.join()==='misc.14=1', 'Restart confirm -> Misc.restart_remote_device=true (decrypts with session key, shared nonce counter)', JSON.stringify(r));
  await page.evaluate(()=>{ curConn._ws._secretKey=[window.__key,41,0]; });
  await act('restart'); await page.waitForTimeout(300); await page.click('#sda-ctl-panel [data-act="confirm"]'); r=await drain();
  const ctr=await page.evaluate(()=>{ const k=curConn._ws._secretKey[1]; curConn._ws._secretKey=undefined; return k; });
  ok(r.msgs.join()==='misc.14=1' && ctr>=42, 'Restart on an encrypted session: secretbox with the session key, nonce counter continues from 41 (same as the bundle)', JSON.stringify(r)+' ctr='+ctr);
  await act('refresh'); r=await drain(); ok(r.msgs.join()==='misc.10=1', 'bundle message after raw one still decrypts (counter in step)', JSON.stringify(r));
  await act('block'); r=await drain(); ok(r.msgs.join()==='misc.option{"5":2}', 'Block input -> OptionMessage.block_input=Yes', JSON.stringify(r));
  await act('block'); r=await drain(); ok(r.msgs.join()==='misc.option{"5":1}', 'Unblock input -> block_input=No', JSON.stringify(r));
  await act('privacy'); r=await drain(); ok(r.msgs.join()==='misc.option{"4":2}', 'Privacy on -> privacy_mode=Yes', JSON.stringify(r));
  ok(await page.evaluate(()=>{ const p=JSON.parse(localStorage.getItem('peers')||'{}'); return !(p['100000001']||{})['privacy-mode']; }), 'privacy mode not saved for next connection');
  await act('privacy'); r=await drain(); ok(r.msgs.join()==='misc.option{"4":1}', 'Privacy off -> privacy_mode=No', JSON.stringify(r));
  await act('display1'); r=await drain(); ok(r.msgs.join()==='misc.switch_display{"1":1}', 'Monitor 2 -> SwitchDisplay display=1', JSON.stringify(r));
  await act('display0'); r=await drain(); ok(/misc.switch_display/.test(r.msgs.join()), 'Monitor 1 -> SwitchDisplay display=0', JSON.stringify(r));
  // type text: keys typed in the dialog must not be sent
  await act('type'); await page.waitForTimeout(300);
  await page.click('#sda-ctl-text'); await page.keyboard.type('Hi ж5', {delay:30}); await page.keyboard.press('Enter'); await page.keyboard.type('x');
  r=await drain(); ok(r.msgs.length===0 && !r.calls.some(c=>/input/.test(c)), 'typing in the dialog sends no keys', JSON.stringify(r));
  await page.waitForTimeout(500);
  await page.click('#sda-ctl-panel [data-act="send"]'); r=await drain(); ok(r.msgs.join()==='key_event{"6":"Hi ж5\\nx","mods":[]}', 'Type it -> one KeyEvent seq with the text', JSON.stringify(r));
  // Escape closes panel without sending
  await page.click(openBtn); await page.waitForTimeout(300); await page.click('#sda-ctl-panel .sda-ctl-x'); r=await drain();
  ok(!(await page.$('#sda-ctl-panel')) && r.msgs.length===0, 'Close (x) closes the menu, nothing sent', JSON.stringify(r));
  // screenshots of the menu
  await page.click(openBtn); await page.waitForTimeout(400); await page.screenshot({path:`ct-${engine}-${desktop?'desk':'ipad'}-menu.png`});
  await page.click('#sda-ctl-panel .sda-ctl-x'); await page.waitForTimeout(200);
  // normal keyboard still works afterwards (key fix intact)
  if(!desktop){
    await page.mouse.click(500,700); await page.waitForTimeout(400); await drain();
    await page.keyboard.press('a'); r=await drain(); ok(r.msgs.length>=1 && r.msgs.every(m=>/key_event/.test(m)), 'hardware key after menu still reaches session', JSON.stringify(r));
  }
  if(!desktop){
    const map = async (fx,fy)=>page.evaluate(([fx,fy])=>{ const i=window.sdaOverlayInfo(); const r=i.rect; const p=window.sdaScreenToRemote(r.left+r.width*fx, r.top+r.height*fy); return {p,i}; },[fx,fy]);
    async function checkMap(label){ const a=await map(0.25,0.75); const exp={x:Math.round(0.25*1280), y:Math.round(0.75*720)}; const okk=Math.abs(a.p.x-exp.x)<=2&&Math.abs(a.p.y-exp.y)<=2; ok(okk, label+' maps a tap at 25%/75% of the picture to remote ('+exp.x+','+exp.y+')', JSON.stringify(a.p)+' rect='+JSON.stringify(a.i.rect)+' mode='+a.i.mode+' scale='+a.i.scale); return a.i; }
    let i=await checkMap('fit');
    ok(Math.abs(i.rect.width-1024)<1, 'fit: picture is screen-wide in portrait', JSON.stringify(i.rect));
    await act('original'); i=await checkMap('original 100%'); ok(Math.abs(i.rect.width-1280)<1 && Math.abs(i.rect.height-720)<1, 'original: 1280x720 CSS px', JSON.stringify(i.rect));
    await page.screenshot({path:'ct-ipad-original.png'});
    await act('stretch'); i=await checkMap('stretch'); ok(Math.abs(i.rect.width-1024)<1 && Math.abs(i.rect.height-1366)<2, 'stretch fills the screen', JSON.stringify(i.rect));
    await act('fit'); await act('zoomin'); i=await checkMap('zoom in'); ok(Math.abs(i.scale-1.25)<0.01, 'zoom in -> 125%', ''+i.scale);
    await act('zoomin'); await act('zoomout'); i=await checkMap('zoom in+out'); ok(Math.abs(i.scale-1.25)<0.01, 'zoom out -> back to 125%', ''+i.scale);
    await act('window'); i=await checkMap('window view'); ok(i.windowView && i.rect.width<800, 'window view shrinks the picture', JSON.stringify(i.rect));
    await page.screenshot({path:'ct-ipad-window.png'});
    await act('window'); i=await checkMap('restore view'); ok(!i.windowView, 'restore view', '');
    await act('fit');
    await page.click('#sda-ctl-panel .sda-ctl-x');
    // rotation to landscape and back
    await page.setViewportSize({width:1366,height:1024}); await page.evaluate(()=>window.dispatchEvent(new Event('orientationchange'))); await page.waitForTimeout(900);
    i=await checkMap('landscape fit'); ok(Math.abs(i.rect.height-768.4)<2 || Math.abs(i.rect.width-1366)<2, 'landscape fit uses the new size', JSON.stringify(i.rect));
    await act('original'); i=await checkMap('landscape original');
    await act('stretch'); i=await checkMap('landscape stretch'); ok(Math.abs(i.rect.width-1366)<1 && Math.abs(i.rect.height-1024)<1, 'landscape stretch fills', JSON.stringify(i.rect));
    await page.screenshot({path:'ct-ipad-landscape-stretch.png'});
    await act('fit'); await page.click('#sda-ctl-panel .sda-ctl-x');
    await page.setViewportSize({width:1024,height:1366}); await page.evaluate(()=>window.dispatchEvent(new Event('orientationchange'))); await page.waitForTimeout(900);
    i=await checkMap('back to portrait');
    // a real tap goes to the mapped point
    await drain(); const t=await map(0.5,0.5); await page.touchscreen.tap(t.i.rect.left+t.i.rect.width*0.5, t.i.rect.top+t.i.rect.height*0.5); await page.waitForTimeout(600);
    const last=await page.evaluate(()=>window.__sdaLastInput||null); ok(!!last, 'tap reaches the session', JSON.stringify(last));
  }
  // fullscreen toggle
  await act('fullscreen'); await page.waitForTimeout(600); const fs1=await page.evaluate(()=>!!(document.fullscreenElement||document.webkitFullscreenElement));
  await act('fullscreen'); await page.waitForTimeout(600); const fs2=await page.evaluate(()=>!!(document.fullscreenElement||document.webkitFullscreenElement));
  ok(fs1!==fs2, 'Full screen button toggles full screen', fs1+'->'+fs2);
  r=await drain(); ok(r.msgs.length===0 || r.msgs.every(m=>!/misc.14|"3":10[01]/.test(m)), 'view buttons send no control messages', JSON.stringify(r.msgs));
  console.log(fails?`RESULT: ${fails} FAIL`:'RESULT: ALL PASS');
  await b.close();
})();
