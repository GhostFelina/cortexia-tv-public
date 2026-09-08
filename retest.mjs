import fs from 'node:fs';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
// AbortSignal.timeout: govde okunurken de gecerli kalir (fetch + r.text() birlikte)
async function get(url, ms, range) {
  const h = { 'User-Agent': UA, 'Accept': '*/*', 'Origin': 'http://localhost', 'Referer': 'http://localhost/' };
  if (range) h['Range'] = range;
  return await fetch(url, { signal: AbortSignal.timeout(ms), headers: h, redirect: 'follow' });
}
const abs = (b, r) => { try { return new URL(r, b).href; } catch { return null; } };

async function tryUrl(url) {
  const r = await get(url, 14000);
  if (!r.ok) return { why: 'HTTP ' + r.status };
  const cors = !!r.headers.get('access-control-allow-origin');
  const finalUrl = r.url || url;
  const body = await r.text();
  if (!/#EXTM3U/.test(body)) return { why: 'm3u8-degil' };

  let cands = [{ url: finalUrl, media: body, rez: '' }];
  if (/#EXT-X-STREAM-INF/.test(body)) {
    const lines = body.split(/\r?\n/); const vs = [];
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
      const bw = parseInt((lines[i].match(/BANDWIDTH=(\d+)/) || [, '0'])[1], 10);
      const rez = (lines[i].match(/RESOLUTION=([0-9x]+)/) || [, ''])[1];
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j].trim(); if (!l || l.startsWith('#')) continue;
        const u = abs(finalUrl, l); if (u) vs.push({ bw, rez, url: u }); break;
      }
    }
    if (!vs.length) return { why: 'varyant-yok' };
    vs.sort((a, b) => b.bw - a.bw);
    cands = vs.slice(0, 6).map(v => ({ url: v.url, media: null, rez: v.rez }));
  }

  let lastWhy = 'bilinmiyor';
  for (const c of cands) {
    try {
      let media = c.media, murl = c.url;
      if (!media) { const r2 = await get(c.url, 14000); if (!r2.ok) { lastWhy = 'varyant HTTP ' + r2.status; continue; } murl = r2.url || c.url; media = await r2.text(); }
      if (!/#EXTINF/.test(media)) { lastWhy = 'segment-yok'; continue; }
      const segs = media.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
      if (!segs.length) { lastWhy = 'segment-bos'; continue; }
      let segOk = false;
      for (const s of segs.slice(0, 2)) {
        const su = abs(murl, s); if (!su) continue;
        try { const r3 = await get(su, 14000, 'bytes=0-4095'); if (r3.ok || r3.status === 416) { const b = await r3.arrayBuffer(); if (b.byteLength >= 100) { segOk = true; break; } } else lastWhy = 'seg HTTP ' + r3.status; } catch (e) { lastWhy = 'seg ' + (e.cause?.code || e.name); }
      }
      if (!segOk) continue;
      return { ok: true, why: 'OK', res: c.rez, cors, live: !/#EXT-X-ENDLIST/.test(media) };
    } catch (e) { lastWhy = (e.cause?.code || e.name || 'hata').toString().slice(0, 40); }
  }
  return { why: lastWhy };
}

async function check(ch) {
  const urls = [ch.url];
  if (/^https:/i.test(ch.url)) urls.push(ch.url.replace(/^https:/i, 'http:'));
  let last = { why: 'protokol' };
  for (const u of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { const r = await tryUrl(u); if (r.ok) return { ...ch, ...r, url: u }; last = r; }
      catch (e) { last = { why: (e.cause?.code || e.name || 'hata').toString().slice(0, 40) }; }
      if (/HTTP 40[134]|m3u8-degil/.test(last.why)) break;
    }
    if (/HTTP 40[13]/.test(last.why)) break;
  }
  return { ...ch, ok: false, ...last };
}

const all = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const targets = all.map((x, i) => ({ x, i })).filter(o => !o.x.ok);
console.error('Yeniden test: ' + targets.length);
let idx = 0, done = 0, gained = 0;
await Promise.all(Array.from({ length: 40 }, async () => {
  while (idx < targets.length) {
    const t = targets[idx++];
    const r = await check(t.x);
    if (r.ok) { all[t.i] = r; gained++; }
    done++;
    if (done % 100 === 0) console.error('  ' + done + '/' + targets.length + '  kurtarilan: ' + gained);
  }
}));
fs.writeFileSync(process.argv[2], JSON.stringify(all, null, 0));
console.error('Kurtarilan: ' + gained + ' | Toplam calisan: ' + all.filter(x => x.ok).length);
