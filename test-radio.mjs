import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';

/* -------------------------------------------------------------------------- *
 *  Radyo yayini dogrulayici.
 *  TV"den farki: cogu istasyon bitmeyen bir ICY/Icecast akisi. Bu yuzden
 *  "indirip bitirmek" yok — birkac KB ses verisi geldigi an baglanti kapatilir.
 *  Ele alinan bicimler:
 *    - dogrudan akis (MP3 / AAC / OGG, ICY basliklariyla)
 *    - HLS (.m3u8)  -> manifest + ilk segment
 *    - .pls / .m3u sarmalayici -> icindeki ilk adres cozulur
 * -------------------------------------------------------------------------- */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const agentHttps = new https.Agent({ rejectUnauthorized: false, keepAlive: false });

/** Istek at, yaniti dondur (yonlendirmeleri izler). */
function req(url, { headers = {}, depth = 0, timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    if (depth > 4) return reject(new Error('cok fazla yonlendirme'));
    let u;
    try { u = new URL(url); } catch { return reject(new Error('gecersiz adres')); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return reject(new Error('sema'));
    const mod = u.protocol === 'https:' ? https : http;
    const r = mod.request(u, {
      headers: { 'User-Agent': UA, 'Accept': '*/*', 'Icy-MetaData': '1', 'Origin': 'https://localhost', ...headers },
      ...(u.protocol === 'https:' ? { agent: agentHttps } : {}),
    }, (res) => {
      const loc = res.headers.location;
      if (res.statusCode >= 300 && res.statusCode < 400 && loc) {
        res.destroy();
        return resolve(req(new URL(loc, u).href, { headers, depth: depth + 1, timeout }));
      }
      res.finalUrl = u.href;
      resolve(res);
    });
    r.on('error', reject);
    r.setTimeout(timeout, () => r.destroy(new Error('timeout')));
    r.end();
  });
}

/** Yanittan en fazla `max` bayt oku, sonra baglantiyi kes. */
function sip(res, max = 16384, ms = 10000) {
  return new Promise((resolve) => {
    const chunks = []; let n = 0, done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(t); res.destroy(); resolve(Buffer.concat(chunks)); };
    const t = setTimeout(finish, ms);
    res.on('data', (c) => { chunks.push(c); n += c.length; if (n >= max) finish(); });
    res.on('end', finish);
    res.on('error', finish);
  });
}

const abs = (b, r) => { try { return new URL(r, b).href; } catch { return null; } };

/** .pls / .m3u sarmalayicidan ilk gercek adresi cikar */
function unwrap(text) {
  const pls = /^\s*File\d+\s*=\s*(\S+)/im.exec(text);
  if (pls) return pls[1].trim();
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim();
    if (l && !l.startsWith('#') && /^https?:\/\//i.test(l)) return l;
  }
  return null;
}

const AUDIO_CT = /audio|ogg|mpegurl|octet-stream|aacp|application\/x-mpegURL/i;

async function check(st, depth = 0) {
  const out = { ...st, ok: false, why: '', cors: false, ct: '', icy: '', ms: 0 };
  const t0 = Date.now();
  try {
    const res = await req(out.url);
    const status = res.statusCode || 0;
    out.cors = !!res.headers['access-control-allow-origin'];
    out.ct = String(res.headers['content-type'] || '').split(';')[0].toLowerCase();
    if (res.headers['icy-name']) out.icy = String(res.headers['icy-name']).slice(0, 60);
    if (res.headers['icy-br'] && !out.bitrate) out.bitrate = parseInt(res.headers['icy-br'], 10) || 0;

    if (status !== 200 && status !== 206) { res.destroy(); out.why = 'HTTP ' + status; return out; }

    const buf = await sip(res);
    if (!buf.length) { out.why = 'bos yanit'; return out; }
    const head = buf.slice(0, 800).toString('utf8');

    // --- HLS ---
    if (/#EXTM3U/.test(head) && /#EXT-X|#EXTINF/.test(head)) {
      const body = buf.toString('utf8');
      let media = body, murl = res.finalUrl;
      if (/#EXT-X-STREAM-INF/.test(body)) {
        const lines = body.split(/\r?\n/);
        let v = null;
        for (let i = 0; i < lines.length; i++) {
          if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
          for (let j = i + 1; j < lines.length; j++) {
            const l = lines[j].trim();
            if (l && !l.startsWith('#')) { v = abs(murl, l); break; }
          }
          if (v) break;
        }
        if (!v) { out.why = 'varyant yok'; return out; }
        const r2 = await req(v);
        if (r2.statusCode !== 200) { r2.destroy(); out.why = 'varyant HTTP ' + r2.statusCode; return out; }
        murl = r2.finalUrl;
        media = (await sip(r2, 32768)).toString('utf8');
      }
      const segs = media.split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
      if (!segs.length) { out.why = 'segment yok'; return out; }
      const r3 = await req(abs(murl, segs[0]));
      if (r3.statusCode !== 200 && r3.statusCode !== 206) { r3.destroy(); out.why = 'seg HTTP ' + r3.statusCode; return out; }
      const sb = await sip(r3, 8192);
      if (sb.length < 200) { out.why = 'seg bos'; return out; }
      out.hls = 1; out.ok = true; out.why = 'OK';
      return out;
    }

    // --- .pls / .m3u sarmalayici ---
    if (/^\[playlist\]/im.test(head) || (/^\s*File\d+\s*=/im.test(head)) ||
        (/^#EXTM3U/.test(head) && !/#EXT-X|#EXTINF/.test(head))) {
      if (depth > 1) { out.why = 'ic ice sarmalayici'; return out; }
      const inner = unwrap(buf.toString('utf8'));
      if (!inner) { out.why = 'sarmalayici bos'; return out; }
      const r = await check({ ...st, url: inner }, depth + 1);
      return { ...r, ms: Date.now() - t0 };
    }

    // --- dogrudan ses akisi ---
    if (!AUDIO_CT.test(out.ct) && out.ct) { out.why = 'ses degil (' + out.ct + ')'; return out; }
    if (buf.length < 1024) { out.why = 'cok az veri'; return out; }
    // MP3 cerceve / ADTS AAC / OGG / ID3 imzasi ara — yoksa da ct guveniyorsak kabul
    const b = buf;
    const sig = b.slice(0, 3).toString('ascii') === 'ID3'
      || b.slice(0, 4).toString('ascii') === 'OggS'
      || b.slice(0, 4).toString('ascii') === 'fLaC'
      || [...b.slice(0, 4096)].some((x, i, a) => i + 1 < a.length && x === 0xff && (a[i + 1] & 0xe0) === 0xe0);
    if (!sig && !AUDIO_CT.test(out.ct)) { out.why = 'ses imzasi yok'; return out; }
    out.ok = true; out.why = 'OK';
  } catch (e) {
    out.why = (e.code || e.message || 'hata').toString().slice(0, 40);
  } finally {
    out.ms = Date.now() - t0;
  }
  return out;
}

/* ------------------------------------------------------------------ calistir */
const co = process.argv[2];
const src = `data/src/radio_${co}.json`;
const dst = `data/radio_${co}.json`;
const list = JSON.parse(fs.readFileSync(src, 'utf8'));
console.error(co.toUpperCase() + ': ' + list.length + ' istasyon test ediliyor');

const CONC = 40;
const results = new Array(list.length);
let idx = 0, done = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (idx < list.length) {
    const my = idx++;
    results[my] = await check(list[my]);
    if (++done % 100 === 0) {
      console.error('  ' + done + '/' + list.length + '  calisan: ' + results.filter((x) => x && x.ok).length);
    }
  }
}));

fs.writeFileSync(dst, JSON.stringify(results));
const ok = results.filter((x) => x.ok);
console.error('BITTI. Calisan: ' + ok.length + ' / ' + list.length +
  '  (https ' + ok.filter((x) => x.url.startsWith('https://')).length +
  ', hls ' + ok.filter((x) => x.hls).length + ')');
