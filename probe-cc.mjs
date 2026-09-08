import fs from 'node:fs';
process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const cat=JSON.parse(fs.readFileSync('public/channels.json','utf8'));
const chans=cat.channels;
console.error('Altyazi taramasi: '+chans.length+' kanal');
let i=0,done=0,found=0;
async function probe(c){
  try{
    const r=await fetch(c.url,{headers:{'User-Agent':UA},redirect:'follow',signal:AbortSignal.timeout(12000)});
    if(!r.ok) return false;
    const t=await r.text();
    return /TYPE=CLOSED-CAPTIONS/.test(t) || /TYPE=SUBTITLES/.test(t) || /CLOSED-CAPTIONS=(?!NONE)"/.test(t);
  }catch{return false;}
}
await Promise.all(Array.from({length:40},async()=>{
  while(i<chans.length){
    const c=chans[i++];
    c.cc = await probe(c) ? 1 : 0;
    if(c.cc) found++;
    if(++done%200===0) console.error('  '+done+'/'+chans.length+'  altyazili: '+found);
  }
}));
fs.writeFileSync('public/channels.json',JSON.stringify(cat));
console.error('BITTI. Altyazili kanal: '+found+' / '+chans.length);
const top=chans.filter(c=>c.cc).slice(0,25).map(c=>c.name);
console.error('\nAltyazili populer kanallar:\n  '+top.join(' · '));
