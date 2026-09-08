import fs from 'node:fs';
const picks = JSON.parse(fs.readFileSync('data/sample.json','utf8'));
const b64 = (s) => Buffer.from(s,'utf8').toString('base64url');
const BASE='http://localhost:8787';
async function chain(ch){
  let u=BASE+'/p/'+b64(ch.url), body='';
  for(let hop=0;hop<3;hop++){
    const r=await fetch(u,{signal:AbortSignal.timeout(20000)});
    if(!r.ok) return {ok:false,why:'manifest '+r.status};
    body=await r.text();
    if(!/#EXTM3U/.test(body)) return {ok:false,why:'m3u8 degil'};
    if(!/#EXT-X-STREAM-INF/.test(body)) break;
    const L=body.split('\n'); let nx=null;
    for(let i=0;i<L.length;i++){ if(L[i].startsWith('#EXT-X-STREAM-INF')){ for(let j=i+1;j<L.length;j++){const l=L[j].trim(); if(l&&!l.startsWith('#')){nx=l;break;}} break;} }
    if(!nx||!nx.startsWith('/p/')) return {ok:false,why:'rewrite hatasi'};
    u=BASE+nx;
  }
  const segs=body.split('\n').map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
  if(!segs.length||!segs[0].startsWith('/p/')) return {ok:false,why:'segment rewrite'};
  const r2=await fetch(BASE+segs[0],{signal:AbortSignal.timeout(25000)});
  if(!r2.ok) return {ok:false,why:'segment '+r2.status};
  const b=new Uint8Array(await r2.arrayBuffer());
  if(b.length<1000) return {ok:false,why:'kucuk '+b.length};
  const f=String.fromCharCode(...b.slice(4,8));
  return {ok:true,bytes:b.length,fmt:b[0]===0x47?'TS':(f==='ftyp'||f==='styp'?'fMP4':'?')};
}
let ok=0;
for(const c of picks){
  let r; try{r=await chain(c);}catch(e){r={ok:false,why:e.name};}
  if(r.ok)ok++;
  console.log((r.ok?' OK  ':'HATA ')+('['+c.cats[0]+']').padEnd(11)+c.name.slice(0,34).padEnd(35)+(r.ok?r.fmt+' '+(r.bytes/1024).toFixed(0)+'KB':r.why));
}
console.log('\nOrneklem sonucu: '+ok+'/'+picks.length);
