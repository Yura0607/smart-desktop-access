const {boot, openSession} = require('./ipad-keys-harness');
const engine = process.argv[2] || 'chrome';
const local = process.argv[3] === 'local' ? ['sda-stability.js','sda-status.js'] : null;
const desktop = process.argv[4] === 'desktop';
// What the remote (legacy keyboard mode, src/server/connection.rs + input_service.rs) would type.
function remoteTyped(rec, mobile){
  let out='';
  for (const r of rec){
    const fn=r.slice(0,r.indexOf(':')); const a=JSON.parse(r.slice(r.indexOf(':')+1));
    if (fn==='inputString'){ out+=a[0]; continue; }
    let [name,down,press]=a; let ch;
    if (name.length===1) ch=name; else if (/^VK_[A-Z0-9]$/.test(name)) ch=name.slice(3).toLowerCase();
    else ch={VK_RETURN:'⏎',VK_ENTER:'⏎',VK_BACK:'⌫',VK_SPACE:'␣'}[name] || ('['+name.replace('VK_','')+']');
    if (/^\[(SHIFT|CONTROL|MENU)\]$/.test(ch)) continue;
    const unicode = ch.length===1 && mobile && !/^[a-z]$/.test(ch) && name.length===1;
    if (press || unicode || down) out+=ch;
  }
  return out;
}
let fails=0;
async function snap(page){ return page.evaluate(()=>({rec:window.__rec.splice(0), sbn:window.__sbn.splice(0)})); }
async function step(page, label, expect, fn){
  await snap(page); await fn(); await page.waitForTimeout(600);
  const r = await snap(page);
  const mobile = await page.evaluate(()=>window.isMobile());
  const got = remoteTyped(r.rec, mobile);
  const ok = got===expect; if(!ok) fails++;
  console.log(`${ok?'PASS':'FAIL'} [${label}] remote types "${got}" (expect "${expect}")\n     sends: ${r.rec.join(' | ')||'(none)'}`);
}
function iosSeq(key, code, respectPrevent){
  return (k,c,rp)=>{ const t=document.activeElement; const o={key:k,code:c,keyCode:k.length===1?k.toUpperCase().charCodeAt(0):(k==='Enter'?13:8),bubbles:true,cancelable:true,composed:true};
    const kd=new KeyboardEvent('keydown',o); t.dispatchEvent(kd);
    if (!(rp && kd.defaultPrevented) && t.tagName==='TEXTAREA'){
      const it = k==='Enter'?'insertLineBreak':(k==='Backspace'?'deleteContentBackward':'insertText');
      t.dispatchEvent(new InputEvent('beforeinput',{inputType:it,data:k.length===1?k:null,bubbles:true,cancelable:true}));
      if (k==='Backspace') t.value=t.value.slice(0,-1); else t.value+= (k==='Enter'?'\n':k);
      t.dispatchEvent(new InputEvent('input',{inputType:it,data:k.length===1?k:null,bubbles:true}));
    }
    t.dispatchEvent(new KeyboardEvent('keyup',o)); };
}
async function suite(page, tag, cdp, kb){
  await step(page, tag+' hw a', 'a', ()=>page.keyboard.press('a'));
  await step(page, tag+' hw Shift+B', 'B', ()=>page.keyboard.press('Shift+B'));
  await step(page, tag+' hw 7', '7', ()=>page.keyboard.press('7'));
  await step(page, tag+' hw ?', '?', ()=>page.keyboard.press('Shift+Slash'));
  await step(page, tag+' hw Space', '␣', ()=>page.keyboard.press('Space'));
  await step(page, tag+' hw Enter', '⏎', ()=>page.keyboard.press('Enter'));
  await step(page, tag+' hw Backspace', '⌫', ()=>page.keyboard.press('Backspace'));
  await step(page, tag+' hw ArrowLeft', '[LEFT]', ()=>page.keyboard.press('ArrowLeft'));
  await step(page, tag+' hw F5', '[F5]', ()=>page.keyboard.press('F5'));
  await step(page, tag+' hw Ctrl+C (hotkey)', 'c', ()=>page.keyboard.press('Control+c'));
  if (kb) {
    await page.evaluate('window.__iosSeq = ('+iosSeq.toString()+')()');
    for (const rp of [false,true]) {
      const v = rp ? 'iOS-OSK(prevent blocks insert)' : 'iOS-OSK(insert always)';
      for (const [k,c,exp] of [['d','KeyD','d'],['D','KeyD','D'],['ж','Semicolon','ж'],['5','Digit5','5'],['Enter','Enter','⏎'],['Backspace','Backspace','⌫']])
        await step(page, `${tag} ${v} ${k}`, exp, ()=>page.evaluate(([k,c,rp])=>window.__iosSeq(k,c,rp), [k,c,rp]));
    }
    await step(page, tag+' insertText c (predictive, no key events)', 'c', ()=>page.keyboard.insertText('c'));
    await step(page, tag+' insertText "hello" (suggestion)', 'hello', ()=>page.keyboard.insertText('hello'));
    if (cdp) await step(page, tag+' IME composition e -> é', 'é', async ()=>{ await cdp.send('Input.imeSetComposition',{text:'e',selectionStart:1,selectionEnd:1}); await cdp.send('Input.imeSetComposition',{text:'é',selectionStart:1,selectionEnd:1}); await cdp.send('Input.insertText',{text:'é'}); });
  }
}
(async()=>{
  const {b,page} = await boot(engine, {local, desktop});
  await openSession(page);
  const cdp = engine==='chrome' ? await page.context().newCDPSession(page) : null;
  console.log('engine', engine, 'scripts:', await page.evaluate(()=>[...document.scripts].map(s=>s.src).filter(s=>/sda-stab/.test(s)).join(' ')), 'isMobile:', await page.evaluate(()=>window.isMobile()));
  await page.mouse.click(500, 700); await page.waitForTimeout(500);
  await suite(page, 'S1 screen', cdp, false);
  if (await page.evaluate(()=>!!document.getElementById('sda-kb-btn'))) {
    await page.click('#sda-kb-btn'); await page.waitForTimeout(800);
    console.log('focus:', await page.evaluate(()=>document.activeElement.id));
    await suite(page, 'S2 Keyboard-btn', cdp, true);
  } else console.log('no Keyboard button (desktop)');
  console.log('stats', JSON.stringify(await page.evaluate(()=>[window.__sdaKeyGuard, window.__sdaKeyStats, window.__sdaKeyPress])));
  console.log(fails ? `RESULT: ${fails} FAIL` : 'RESULT: ALL PASS');
  await b.close();
})();
