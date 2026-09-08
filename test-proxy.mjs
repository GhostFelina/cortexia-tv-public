import fs from 'node:fs';
const cat = JSON.parse(fs.readFileSync('public/channels.json','utf8'));
const b64 = (s) => Buffer.from(s,'utf8').toString('base64url');
const BASE = 'http://localhost:8787';

async function chain(ch){
  const t0=Date.now();
  let u = BASE + '/p/' + b64(ch.url);
  let body='';
  for (let hop=0; hop<3; hop++){
    const r = await fetch(u,{signal:AbortSignal.timeout(20000)});
    if(!r.ok) return {ok:false,why:'manifest HTTP '+r.status};
    if(!(r.headers.get('access-control-allow-origin')==='*')) return {ok:false,why:'CORS yok'};
    body = await r.text();
    if(!/#EXTM3U/.test(body)) return {ok:false,why:'m3u8 degil'};
    if(!/#EXT-X-STREAM-INF/.test(body)) break;
    const lines=body.split('\n');
    let next=null;
    for(let i=0;i<lines.length;i++){ if(lines[i].startsWith('#EXT-X-STREAM-INF')){ for(let j=i+1;j<lines.length;j++){const l=lines[j].trim(); if(l&&!l.startsWith('#')){next=l;break;} } break; } }
    if(!next) return {ok:false,why:'varyant yok'};
    if(!next.startsWith('/p/')) return {ok:false,why:'REWRITE BASARISIZ: '+next.slice(0,50)};
    u = BASE + next;
  }
  const segs = body.split('\n').map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
  if(!segs.length) return {ok:false,why:'segment yok'};
  if(!segs[0].startsWith('/p/')) return {ok:false,why:'SEGMENT REWRITE BASARISIZ'};
  const r2 = await fetch(BASE+segs[0],{signal:AbortSignal.timeout(25000)});
  if(!r2.ok) return {ok:false,why:'segment HTTP '+r2.status};
  const buf = await r2.arrayBuffer();
  if(buf.byteLength<1000) return {ok:false,why:'segment cok kucuk ('+buf.byteLength+'B)'};
  const b=new Uint8Array(buf);
  const ts = b[0]===0x47;                       // MPEG-TS sync byte
  const mp4 = String.fromCharCode(...b.slice(4,8))==='ftyp' || String.fromCharCode(...b.slice(4,8))==='styp';
  return {ok:true, bytes:buf.byteLength, fmt: ts?'MPEG-TS':(mp4?'fMP4':'?'), ms:Date.now()-t0};
}

const names = process.argv.slice(2);
const picks = names.length ? names.map(n=>cat.channels.find(c=>c.name.toLowerCase().includes(n.toLowerCase()))).filter(Boolean)
                          : cat.channels.slice(0,20);
for (const c of picks){
  let r; try{ r = await chain(c);}catch(e){ r={ok:false,why:e.name+': '+(e.message||'').slice(0,40)}; }
  console.log((r.ok?'  OK  ':' HATA ') + c.name.padEnd(30).slice(0,30) + ' ' +
    (r.ok ? (r.fmt+' '+(r.bytes/1024).toFixed(0)+'KB '+r.ms+'ms') : r.why));
}
