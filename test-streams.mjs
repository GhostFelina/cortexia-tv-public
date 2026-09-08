import fs from 'node:fs';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const M3U = fs.readFileSync(process.argv[2], 'utf8');

// #EXTINF satirinda kanal adi: tirnak disindaki SON virgulden sonrasi.
// (http-user-agent="... (KHTML, like Gecko) ..." gibi degerler virgul icerir)
function extinfName(info) {
  let q = false, last = -1;
  for (let i = 0; i < info.length; i++) {
    const ch = info[i];
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) last = i;
  }
  return last === -1 ? '' : info.slice(last + 1).trim();
}

function parse(m3u) {
  const out = []; const lines = m3u.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXTINF')) continue;
    const info = lines[i];
    let url = ''; 
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j].trim();
      if (!l) continue;
      if (l.startsWith('#')) continue;
      url = l; break;
    }
    if (!url) continue;
    const name = extinfName(info);
    const g = (s) => (info.match(new RegExp(s + '="([^"]*)"')) || [, ''])[1];
    out.push({ name, url, id: g('tvg-id'), logo: g('tvg-logo'), group: g('group-title') });
  }
  return out;
}

// AbortSignal.timeout: govde okunurken de gecerli kalir (fetch + r.text() birlikte)

async function get(url, ms, range) {
  const h = { 'User-Agent': UA, 'Accept': '*/*', 'Origin': 'http://localhost', 'Referer': 'http://localhost/' };
  if (range) h['Range'] = range;
  return await fetch(url, { signal: AbortSignal.timeout(ms), headers: h, redirect: 'follow' });
}

const abs = (base, rel) => { try { return new URL(rel, base).href; } catch { return null; } };

async function check(ch) {
  const res = { ...ch, ok: false, why: '', res: '', cors: false, live: null, ms: 0 };
  const t0 = Date.now();
  try {
    if (!/^https?:/i.test(ch.url)) { res.why = 'protokol'; return res; }
    if (!/\.m3u8(\?|$)/i.test(ch.url) && !/jmp2\.uk|\/playlist|\/master|\/index/i.test(ch.url)) { res.why = 'hls-degil'; return res; }

    let r = await get(ch.url, 12000);
    if (!r.ok) { res.why = 'HTTP ' + r.status; return res; }
    res.cors = !!r.headers.get('access-control-allow-origin');
    const finalUrl = r.url || ch.url;
    let body = await r.text();
    if (!/#EXTM3U/.test(body)) { res.why = 'm3u8-degil'; return res; }

    let mediaUrl = finalUrl, media = body;
    if (/#EXT-X-STREAM-INF/.test(body)) {
      const lines = body.split(/\r?\n/);
      let best = null, bestBw = -1;
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
        const bw = parseInt((lines[i].match(/BANDWIDTH=(\d+)/) || [, '0'])[1], 10);
        const rez = (lines[i].match(/RESOLUTION=([0-9x]+)/) || [, ''])[1];
        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j].trim();
          if (!l || l.startsWith('#')) continue;
          if (bw > bestBw) { bestBw = bw; best = { url: abs(finalUrl, l), rez }; }
          break;
        }
      }
      if (!best || !best.url) { res.why = 'varyant-yok'; return res; }
      res.res = best.rez;
      const r2 = await get(best.url, 12000);
      if (!r2.ok) { res.why = 'varyant HTTP ' + r2.status; return res; }
      mediaUrl = r2.url || best.url;
      media = await r2.text();
    }

    if (!/#EXTINF/.test(media)) { res.why = 'segment-yok'; return res; }
    res.live = !/#EXT-X-ENDLIST/.test(media);

    const segLines = media.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
    if (!segLines.length) { res.why = 'segment-bos'; return res; }
    const segUrl = abs(mediaUrl, segLines[0]);
    const r3 = await get(segUrl, 12000, 'bytes=0-4095');
    if (!r3.ok && r3.status !== 416) { res.why = 'seg HTTP ' + r3.status; return res; }
    const buf = await r3.arrayBuffer();
    if (buf.byteLength < 100) { res.why = 'seg-bos'; return res; }

    res.ok = true; res.why = 'OK';
  } catch (e) {
    res.why = (e.name === 'AbortError' ? 'timeout' : (e.cause?.code || e.message || 'hata')).toString().slice(0, 40);
  } finally { res.ms = Date.now() - t0; }
  return res;
}

const chans = parse(M3U);
console.error('Test edilecek kanal: ' + chans.length);
const CONC = 45;
const out = [];
let idx = 0, done = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (idx < chans.length) {
    const my = idx++;
    const r = await check(chans[my]);
    out[my] = r; done++;
    if (done % 100 === 0) console.error('  ilerleme ' + done + '/' + chans.length + '  calisan: ' + out.filter(x => x && x.ok).length);
  }
}));
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 0));
const ok = out.filter(x => x.ok);
console.error('BITTI. Calisan: ' + ok.length + ' / ' + chans.length);
