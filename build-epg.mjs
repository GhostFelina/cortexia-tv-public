import fs from 'node:fs';
import zlib from 'node:zlib';

/* -------------------------------------------------------------------------- *
 *  Yayin akisi (EPG).
 *  Kaynak: i.mjh.nz — Pluto TV / Samsung TV Plus / Plex icin ulke bazli XMLTV.
 *  Kanallar isimle eslesir (saglayici id'leri katalogla ortusmuyor).
 *  Cikti: public/epg.json — kanal basina onumuzdeki ~14 saatin programlari.
 * -------------------------------------------------------------------------- */

const SOURCES = [
  ['us', 'https://i.mjh.nz/PlutoTV/us.xml.gz'],
  ['us', 'https://i.mjh.nz/SamsungTVPlus/us.xml.gz'],
  ['us', 'https://i.mjh.nz/Plex/us.xml.gz'],
  ['gb', 'https://i.mjh.nz/PlutoTV/gb.xml.gz'],
  ['gb', 'https://i.mjh.nz/SamsungTVPlus/gb.xml.gz'],
  ['gb', 'https://i.mjh.nz/Plex/gb.xml.gz'],
  ['es', 'https://i.mjh.nz/PlutoTV/es.xml.gz'],
  ['es', 'https://i.mjh.nz/SamsungTVPlus/es.xml.gz'],
  ['es', 'https://i.mjh.nz/Plex/es.xml.gz'],
  ['mx', 'https://i.mjh.nz/PlutoTV/mx.xml.gz'],
  ['mx', 'https://i.mjh.nz/Plex/mx.xml.gz'],
  ['ar', 'https://i.mjh.nz/PlutoTV/ar.xml.gz'],
];

const norm = (s) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .replace(/&amp;/g, '&');

/** XMLTV zamani: "20260908143000 +0000" -> epoch dakika */
function xmlTime(s) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/.exec(s);
  if (!m) return null;
  const [, Y, M, D, h, mi, sec, tz] = m;
  let t = Date.UTC(+Y, +M - 1, +D, +h, +mi, +sec);
  if (tz) {
    const sign = tz[0] === '-' ? 1 : -1;
    t += sign * ((+tz.slice(1, 3)) * 60 + (+tz.slice(3, 5))) * 60000;
  }
  return Math.round(t / 60000);
}

async function grab(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  return (url.endsWith('.gz') ? zlib.gunzipSync(buf) : buf).toString('utf8');
}

const cat = JSON.parse(fs.readFileSync('public/channels.json', 'utf8'));
/** ulke -> normalize isim -> kanal indeksi */
const index = {};
for (const c of cat.channels) {
  (index[c.co] ||= new Map()).set(norm(c.name), c.i);
}

const now = Math.round(Date.now() / 60000);
const until = now + 14 * 60;
const out = {};           // kanal indeksi -> [[baslangicDk, sureDk, baslik], ...]
let matched = new Set();

for (const [co, url] of SOURCES) {
  let xml;
  try { xml = await grab(url); }
  catch (e) { console.log('  atlandi ' + url.split('/').slice(-2).join('/') + ' (' + e.message + ')'); continue; }

  // id -> katalog indeksi (isimle)
  const idToCh = new Map();
  const reCh = /<channel id="([^"]+)"[^>]*>\s*<display-name[^>]*>([^<]*)</g;
  let m;
  while ((m = reCh.exec(xml))) {
    const ch = index[co]?.get(norm(decode(m[2])));
    if (ch !== undefined) idToCh.set(m[1], ch);
  }

  // oznitelik sirasi kaynaga gore degisiyor -> sirasiz oku
  const reP = /<programme([^>]*)>([\s\S]*?)<\/programme>/g;
  const attr = (s, k) => (new RegExp(k + '="([^"]*)"').exec(s) || [, ''])[1];
  let n = 0;
  while ((m = reP.exec(xml))) {
    const ch = idToCh.get(attr(m[1], 'channel'));
    if (ch === undefined) continue;
    const st = xmlTime(attr(m[1], 'start')), sp = xmlTime(attr(m[1], 'stop'));
    if (st === null || sp === null || sp <= now || st > until) continue;
    const t = /<title[^>]*>([^<]*)</.exec(m[2]);
    if (!t || !t[1].trim()) continue;
    (out[ch] ||= []).push([st, Math.max(1, sp - st), decode(t[1]).slice(0, 70)]);
    matched.add(ch); n++;
  }
  console.log('  ' + url.split('/').slice(-2).join('/').padEnd(26) +
    idToCh.size + ' kanal eslesti, ' + n + ' program');
}

for (const k of Object.keys(out)) {
  out[k].sort((a, b) => a[0] - b[0]);
  out[k] = out[k].slice(0, 10);
}

fs.writeFileSync('public/epg.json', JSON.stringify({ built: now, ch: out }));
const kb = (fs.statSync('public/epg.json').size / 1024).toFixed(0);
console.log('\npublic/epg.json -> ' + matched.size + ' kanalda yayin akisi, ' + kb + ' KB');
