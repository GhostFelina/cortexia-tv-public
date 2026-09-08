import fs from 'node:fs';
const cat = JSON.parse(fs.readFileSync('public/channels.json','utf8'));
const b64=(s)=>Buffer.from(s,'utf8').toString('base64url');
const names = ['NBC News NOW','CBS News 24/7','Fox News Channel','Bloomberg TV','Scripps News','Cheddar News','Newsmax TV','Reuters','Fox Weather','AccuWeather Now','Law & Crime','BBC Earth','ESPNU','Fox Sports 1','NFL Network','Comedy Central','AMC','Nickelodeon','PBS Kids','MTV'];
let withCC=0, tot=0;
for(const n of names){
  const c = cat.channels.find(x=>x.name===n) || cat.channels.find(x=>x.name.includes(n));
  if(!c){console.log('  ? bulunamadi: '+n);continue;}
  tot++;
  try{
    const r=await fetch('http://localhost:8787/p/'+b64(c.url),{signal:AbortSignal.timeout(20000)});
    const t=await r.text();
    const ccAttr = /CLOSED-CAPTIONS=(?!NONE)/.test(t);
    const ccMedia = /TYPE=CLOSED-CAPTIONS/.test(t);
    const subMedia = /TYPE=SUBTITLES/.test(t);
    const any = ccAttr||ccMedia||subMedia;
    if(any) withCC++;
    console.log((any?'  CC VAR   ':'  belirtilmemis ').padEnd(16)+c.name.padEnd(24)+
      [ccMedia&&'CEA-608/708', subMedia&&'WebVTT', ccAttr&&!ccMedia&&'CC-attr'].filter(Boolean).join(', '));
  }catch(e){console.log('  hata     '+c.name+' '+e.name);}
}
console.log('\nManifestinde altyazi bildirilen: '+withCC+'/'+tot);
console.log('(bildirilmeyenlerde de gomulu CEA-608 olabilir; oynaticinin CC dugmesi onlari da yakalar)');
