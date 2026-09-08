import fs from 'node:fs';

/* -------------------------------------------------------------------------- *
 *  Radyo istasyonlarini Radio Browser"dan ceker.
 *  Acik, ucretsiz ve toplulukca surdurulen dizin: https://radio-browser.info
 *  Kendi saglik kontrolleri (lastcheckok) bir ipucu; asil dogrulamayi
 *  test-radio.mjs yapar.
 * -------------------------------------------------------------------------- */

const UA = 'CortexiaTV/1.0';
const API = 'https://de1.api.radio-browser.info';
const COUNTRIES = ['US', 'GB', 'ES', 'MX', 'AR', 'TR'];
const PER_COUNTRY = 600;

fs.mkdirSync('data/src', { recursive: true });

for (const cc of COUNTRIES) {
  const url = `${API}/json/stations/bycountrycodeexact/${cc}` +
    `?limit=${PER_COUNTRY}&order=clickcount&reverse=true&hidebroken=true`;
  let list;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(90000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    list = await r.json();
  } catch (e) {
    console.log(cc + ': HATA ' + e.message);
    continue;
  }

  // yalnizca calisir isaretli ve adresi olanlar
  const clean = list
    .filter((s) => s.lastcheckok === 1 && (s.url_resolved || s.url))
    .map((s) => ({
      name: (s.name || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      url: (s.url_resolved || s.url).trim(),
      home: s.homepage || '',
      logo: s.favicon || '',
      tags: (s.tags || '').toLowerCase(),
      lang: s.languagecodes || s.language || '',
      codec: s.codec || '',
      bitrate: s.bitrate || 0,
      hls: s.hls ? 1 : 0,
      votes: s.votes || 0,
      clicks: s.clickcount || 0,
      uuid: s.stationuuid,
    }))
    .filter((s) => s.name && /^https?:\/\//i.test(s.url));

  // ayni adresi tekrar etme
  const seen = new Set();
  const out = clean.filter((s) => !seen.has(s.url) && seen.add(s.url));

  fs.writeFileSync(`data/src/radio_${cc.toLowerCase()}.json`, JSON.stringify(out));
  const https = out.filter((s) => s.url.startsWith('https://')).length;
  console.log(`${cc}: ${out.length} istasyon  (https ${https}, hls ${out.filter(s => s.hls).length})`);
}
