/**
 * probe-web.mjs — statik web surumunde GERCEKTEN oynayan kanallari isaretler.
 *
 * test-streams.mjs yayinin canli olup olmadigini yerel proxy uzerinden dogrular;
 * orada CORS ve protokol onemsizdir. Web surumunde ise tarayici uc ayri kurali
 * birden uygular, bu yuzden ayri bir tarama gerekir:
 *
 *   1. https zorunlu       — https sayfada http:// kaynak karisik icerik sayilir
 *   2. CORS degeri gecerli — basligin VARLIGI yetmez; Pluto/Samsung
 *                            "access-control-allow-origin: http://pluto.tv"
 *                            gonderir, bu bizim sayfamizi kapsamaz
 *   3. zincirin tamami     — hls.js manifesti, varyanti ve segmenti AYRI AYRI
 *                            fetch eder; varyant baska host'ta olabilir ve
 *                            cogu kaynak segmentte 400/403 verir
 *
 * Sonuc her kanala `w` olarak yazilir (1 = web surumunde acilir). Birincil adres
 * kalmazsa `alt` yedekleri denenir; calisan bir yedek bulunursa `wu` alanina
 * yazilir ve oynatici web modunda onu kullanir. `url` degismez — yerel surum
 * proxy uzerinden birincil adresi oynatmayi surdurur.
 */
import fs from 'node:fs';

const SITE = process.env.SITE || 'https://cortexia-tv.vercel.app';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const H = { 'User-Agent': UA, Accept: '*/*', Origin: SITE, Referer: SITE + '/' };
const TIMEOUT = 12000;

/** Tarayicinin kabul ettigi ACAO degeri: yildiz ya da tam origin eslesmesi. */
const corsOk = (v) => v === '*' || v === SITE;

async function grab(url, maxBytes) {
  const r = await fetch(url, { headers: H, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT) });
  const acao = r.headers.get('access-control-allow-origin');
  if (!r.ok) return { bad: 'HTTP ' + r.status };
  if (r.url.startsWith('http:')) return { bad: 'yonlendirme http' };   // https -> http dusus
  if (!corsOk(acao)) return { bad: 'CORS ' + (acao || 'yok') };
  if (!maxBytes) { r.body?.cancel(); return { url: r.url, text: '' }; }
  // segment icin tam govdeyi indirmeye gerek yok, ilk parca yeter
  const t = await r.text();
  return { url: r.url, text: t.slice(0, maxBytes) };
}

/** Bir adres uctan uca tarayicida oynar mi? Oynamazsa sebebini dondurur. */
async function playable(addr) {
  if (!addr || !addr.startsWith('https:')) return 'karisik icerik';
  try {
    const m = await grab(addr, 200000);
    if (m.bad) return 'manifest: ' + m.bad;
    if (!m.text.includes('#EXTM3U')) return 'm3u8 degil';

    const lines = m.text.split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
    if (!lines.length) return 'bos manifest';

    // ana manifest mi (varyant listesi) yoksa dogrudan medya listesi mi?
    const media = m.text.includes('#EXTINF');
    let segSrc = m;
    if (!media) {
      const v = await grab(new URL(lines[0], m.url).href, 200000);
      if (v.bad) return 'varyant: ' + v.bad;
      if (!v.text.includes('#EXTM3U')) return 'varyant m3u8 degil';
      segSrc = v;
    }

    const segs = segSrc.text.split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
    if (!segs.length) return media ? 'segmentsiz' : 'varyant bos';

    const s = await grab(new URL(segs[0], segSrc.url).href, 0);
    if (s.bad) return 'segment: ' + s.bad;
    return null;                                    // null = calisiyor
  } catch (e) {
    return 'hata: ' + String(e.message).slice(0, 30);
  }
}

const file = process.argv[2] || 'public/channels.json';
const cat = JSON.parse(fs.readFileSync(file, 'utf8'));
const chans = cat.channels;
console.error('Web oynatilabilirlik taramasi: ' + chans.length + ' kanal  (origin: ' + SITE + ')');

let i = 0, done = 0, ok = 0, viaAlt = 0;
const why = {};

await Promise.all(Array.from({ length: 40 }, async () => {
  while (i < chans.length) {
    const c = chans[i++];
    delete c.wu;
    let reason = await playable(c.url);
    if (reason) {
      // birincil adres web'de kullanilamiyor; dogrulanmis yedekleri dene
      for (const a of c.alt || []) {
        const r2 = await playable(a);
        if (!r2) { c.wu = a; reason = null; viaAlt++; break; }
      }
    }
    c.w = reason ? 0 : 1;
    if (reason) why[reason.replace(/[:(].*/, '').trim()] = (why[reason.replace(/[:(].*/, '').trim()] || 0) + 1;
    else ok++;
    if (++done % 250 === 0) console.error('  ' + done + '/' + chans.length + '  oynayan: ' + ok);
  }
}));

cat.web = ok;
fs.writeFileSync(file, JSON.stringify(cat));

console.error('\nBITTI. Web surumunde oynayan: ' + ok + ' / ' + chans.length +
  '  (%' + Math.round((ok / chans.length) * 100) + ')');
if (viaAlt) console.error('Bunlarin ' + viaAlt + ' tanesi yedek adres uzerinden.');
console.error('\nElenme sebepleri:');
Object.entries(why).sort((a, b) => b[1] - a[1])
  .forEach(([k, n]) => console.error('  ' + String(n).padStart(5) + '  ' + k));
