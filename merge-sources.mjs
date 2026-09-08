import fs from 'node:fs';

/* -------------------------------------------------------------------------- *
 *  Bir ulkenin tum kaynaklarini tek aday listesine toplar.
 *  Zaten test edilmis URL'ler atlanir, boylece yalnizca yenileri test edilir.
 * -------------------------------------------------------------------------- */

function extinfName(info) {
  let q = false, last = -1;
  for (let i = 0; i < info.length; i++) {
    const ch = info[i];
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) last = i;
  }
  return last === -1 ? '' : info.slice(last + 1).trim();
}

function parseM3U(text) {
  const out = [], L = text.split(/\r?\n/);
  for (let i = 0; i < L.length; i++) {
    if (!L[i].startsWith('#EXTINF')) continue;
    const info = L[i];
    let url = '';
    for (let j = i + 1; j < L.length; j++) {
      const l = L[j].trim();
      if (!l || l.startsWith('#')) continue;
      url = l; break;
    }
    if (!url) continue;
    const g = (k) => (info.match(new RegExp(k + '="([^"]*)"')) || [, ''])[1];
    out.push({ name: extinfName(info), url, logo: g('tvg-logo'), group: g('group-title'), id: g('tvg-id') });
  }
  return out;
}

/** ulke -> [ [dosya, servis adi], ... ] */
const SOURCES = {
  us: [
    ['data/iptvorg_us.m3u', 'iptv-org'],
    ['data/src/plutotv_us.m3u', 'Pluto TV'],
    ['data/src/samsungtvplus_us.m3u', 'Samsung TV Plus'],
    ['data/src/plex_us.m3u', 'Plex'],
    ['data/src/roku_all.m3u', 'Roku Channel'],
    ['data/src/tubi_all.m3u', 'Tubi'],
    ['data/src/freetv_us.m3u', 'Free-TV'],
  ],
  es: [
    ['data/iptvorg_es.m3u', 'iptv-org'],
    ['data/src/plutotv_es.m3u', 'Pluto TV'],
    ['data/src/samsungtvplus_es.m3u', 'Samsung TV Plus'],
    ['data/src/plex_es.m3u', 'Plex'],
    ['data/src/freetv_es.m3u', 'Free-TV'],
  ],
  ar: [
    ['data/iptvorg_ar.m3u', 'iptv-org'],
    ['data/src/plutotv_ar.m3u', 'Pluto TV'],
    ['data/src/freetv_ar.m3u', 'Free-TV'],
  ],
  mx: [
    ['data/iptvorg_mx.m3u', 'iptv-org'],
    ['data/src/plutotv_mx.m3u', 'Pluto TV'],
    ['data/src/plex_mx.m3u', 'Plex'],
    ['data/src/freetv_mx.m3u', 'Free-TV'],
  ],
  gb: [
    ['data/iptvorg_gb.m3u', 'iptv-org'],
    ['data/src/plutotv_gb.m3u', 'Pluto TV'],
    ['data/src/samsungtvplus_gb.m3u', 'Samsung TV Plus'],
    ['data/src/plex_gb.m3u', 'Plex'],
    ['data/src/freetv_gb.m3u', 'Free-TV'],
  ],
  tr: [
    ['data/iptvorg_tr.m3u', 'iptv-org'],
    ['data/src/freetv_tr.m3u', 'Free-TV'],
  ],
};

const targets = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SOURCES);

// daha once test edilmis URL'ler (tekrar test edilmesin)
const known = new Set();
for (const f of fs.readdirSync('data')) {
  if (!/^results_.*\.json$/.test(f)) continue;
  try { JSON.parse(fs.readFileSync('data/' + f, 'utf8')).forEach((x) => known.add(x.url)); } catch {}
}
console.log('daha once test edilmis URL: ' + known.size + '\n');

// iptv-org API: ayni kanalin alternatif yayin adresleri
let api = null;
if (fs.existsSync('data/api_streams.json') && fs.existsSync('data/api_channels.json')) {
  const streams = JSON.parse(fs.readFileSync('data/api_streams.json', 'utf8'));
  const chMap = new Map(JSON.parse(fs.readFileSync('data/api_channels.json', 'utf8')).map((c) => [c.id, c]));
  api = { streams, chMap };
}

for (const co of targets) {
  const list = SOURCES[co];
  if (!list) { console.log('bilinmeyen ulke: ' + co); continue; }
  const add = new Map();
  console.log('=== ' + co.toUpperCase() + ' ===');

  for (const [file, svc] of list) {
    if (!fs.existsSync(file)) { console.log('  yok: ' + file); continue; }
    const items = parseM3U(fs.readFileSync(file, 'utf8'));
    let n = 0;
    for (const it of items) {
      if (!/^https?:/i.test(it.url) || known.has(it.url) || add.has(it.url)) continue;
      add.set(it.url, { ...it, group: it.group || 'Undefined' });
      n++;
    }
    console.log(`  ${svc.padEnd(16)} ${String(items.length).padStart(4)} girdi -> ${n} yeni`);
  }

  if (api) {
    let n = 0;
    for (const s of api.streams) {
      const ch = api.chMap.get(s.channel);
      if (!ch || (ch.country || '').toLowerCase() !== co) continue;
      if (!s.url || !/^https?:/i.test(s.url) || known.has(s.url) || add.has(s.url)) continue;
      const cats = (ch.categories || []).map((c) => c[0].toUpperCase() + c.slice(1)).join(';');
      add.set(s.url, {
        name: ch.name || s.name || s.channel, url: s.url,
        logo: ch.logo || '', group: cats || 'Undefined', id: s.channel,
      });
      n++;
    }
    console.log(`  ${'iptv-org alt'.padEnd(16)} ${''.padStart(4)}       -> ${n} yeni`);
  }

  const arr = [...add.values()];
  const m3u = ['#EXTM3U'];
  for (const c of arr) m3u.push(`#EXTINF:-1 tvg-id="${c.id || ''}" tvg-logo="${c.logo}" group-title="${c.group}",${c.name}`, c.url);
  fs.writeFileSync(`data/cand_${co}.m3u`, m3u.join('\n'));
  console.log(`  -> data/cand_${co}.m3u  ${arr.length} aday\n`);
}
