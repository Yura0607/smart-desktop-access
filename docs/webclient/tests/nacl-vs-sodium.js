const nacl=require('tweetnacl'); const _s=require('libsodium-wrappers');
(async()=>{ await _s.ready; const s=_s; let ok=true;
 for(let i=0;i<200;i++){ const key=nacl.randomBytes(32); const n=new Uint8Array(24); let v=i*7919+1; for(let j=0;j<24&&v>0;j++){const b=v&255;n[j]=b;v=(v-b)/256;}
  const m=nacl.randomBytes(1+i%64); const a=nacl.secretbox(m,n,key); const b=s.crypto_secretbox_easy(m,n,key);
  if(Buffer.compare(Buffer.from(a),Buffer.from(b))!==0) ok=false; }
 console.log(ok?'PASS tweetnacl secretbox == libsodium crypto_secretbox_easy (200 random cases)':'FAIL mismatch');
})();
