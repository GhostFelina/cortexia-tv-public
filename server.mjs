import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import zlib from 'node:zlib';

// Bazi yayin sunuculari eksik/hatali sertifika zinciri sunuyor. Dogrulamayi
// SUREC GENELINDE kapatmak yerine yalnizca yayin isteklerine ozel bir
// https.Agent"te gevsetiyoruz; sunucunun geri kalani dogrulamayi surdurur.
const streamAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

/** Yayin kaynagina istek. Yonlendirmeleri izler, yanit akisini dondurur. */
function streamRequest(target, headers, signal, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 5) return reject(new Error('cok fazla yonlendirme'));
    let u;
    try { u = new URL(target); } catch { return reject(new Error('gecersiz adres')); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return reject(new Error('desteklenmeyen sema'));
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(u, {
      headers,
      ...(u.protocol === 'https:' ? { agent: streamAgent } : {}),
    }, (res) => {
      const loc = res.headers.location;
      if (res.statusCode >= 300 && res.statusCode < 400 && loc) {
        res.resume();
        return resolve(streamRequest(new URL(loc, u).href, headers, signal, depth + 1));
      }
      res.finalUrl = u.href;
      resolve(res);
    });
    req.on('error', reject);
    if (signal) signal.addEventListener('abort', () => req.destroy(new Error('iptal')), { once: true });
    req.end();
  });
}
const DIR = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(DIR, 'public');
const PORT = Number(process.env.PORT || 8787);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Sikistirilmasi anlamli metin turleri (video/ses zaten sikistirilmis gelir)
const COMPRESSIBLE = /^(text|application\/(json|javascript|xml)|image\/svg|audio\/x-mpegurl)/;
const COMPRESS_MIN = 1024;

// Sikistirilmis ciktiyi bellekte tut: katalog dosyalari her istekte yeniden
// sikistirilmasin. Anahtar dosya yolu + degisiklik zamani, boylece katalog
// yenilendiginde onbellek kendiliginden gecersizlesir.
const zcache = new Map();
function compressed(file, mtime, enc, data) {
  const key = enc + '|' + file + '|' + mtime;
  const hit = zcache.get(key);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const cb = (e, out) => {
      const buf = e ? null : out;
      if (buf) {
        if (zcache.size > 64) zcache.clear();
        zcache.set(key, buf);
      }
      resolve(buf);
    };
    if (enc === 'br') zlib.brotliCompress(data, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }, cb);
    else zlib.gzip(data, { level: 6 }, cb);
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.m3u': 'audio/x-mpegurl' };

const enc = (u) => Buffer.from(u, 'utf8').toString('base64url');
const dec = (s) => Buffer.from(s, 'base64url').toString('utf8');

// ---- HLS manifest rewriting: every URI is routed back through this proxy ----
function rewriteManifest(text, baseUrl) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw;
    if (line.startsWith('#')) {
      // rewrite URI="..." attributes (KEY, MEDIA, I-FRAME-STREAM-INF, MAP, ...)
      line = line.replace(/URI="([^"]+)"/g, (m, u) => {
        try { return 'URI="/p/' + enc(new URL(u, baseUrl).href) + '"'; } catch { return m; }
      });
      out.push(line);
    } else if (line.trim() === '') {
      out.push(line);
    } else {
      try { out.push('/p/' + enc(new URL(line.trim(), baseUrl).href)); }
      catch { out.push(line); }
    }
  }
  return out.join('\n');
}

async function proxy(req, res, target) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  req.on('close', () => ctrl.abort());
  try {
    const headers = { 'User-Agent': UA, 'Accept': '*/*' };
    try { const o = new URL(target).origin; headers['Referer'] = o + '/'; headers['Origin'] = o; } catch {}
    if (req.headers.range) headers['Range'] = req.headers.range;

    const r = await streamRequest(target, headers, ctrl.signal);
    const status = r.statusCode || 502;
    const ct = String(r.headers['content-type'] || '').toLowerCase();
    const fu = new URL(r.finalUrl);
    const isManifest = /mpegurl|m3u8/.test(ct) || /\.m3u8$/i.test(fu.pathname);

    if (isManifest) {
      let body = '';
      for await (const chunk of r) body += chunk;
      if (/#EXTM3U/.test(body)) {
        res.writeHead(status, {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        });
        return res.end(rewriteManifest(body, r.finalUrl));
      }
      res.writeHead(status, { 'Content-Type': ct || 'text/plain', 'Access-Control-Allow-Origin': '*' });
      return res.end(body);
    }

    const h = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
    for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      if (r.headers[k]) h[k === 'content-type' ? 'Content-Type' : k] = r.headers[k];
    }
    res.writeHead(status, h);
    r.pipe(res);
    await new Promise((done) => { r.on('end', done); r.on('error', done); res.on('close', done); });
  } catch (e) {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end('proxy error: ' + (e?.message || e));
  } finally { clearTimeout(timer); }
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS' });
    return res.end();
  }

  if (u.pathname.startsWith('/p/')) {
    let target;
    try { target = dec(u.pathname.slice(3)); } catch { res.writeHead(400); return res.end('bad target'); }
    if (!/^https?:\/\//i.test(target)) { res.writeHead(400); return res.end('bad scheme'); }
    return proxy(req, res, target);
  }

  // oynatici bu ucnoktayla yerel sunucunun (proxy) varligini anlar
  if (u.pathname === '/__local') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ proxy: true, name: 'Cortexia TV' }));
  }

  // image proxy for logos (some block hotlinking / lack CORS)
  if (u.pathname === '/img') {
    const t = u.searchParams.get('u');
    if (!t || !/^https?:\/\//i.test(t)) { res.writeHead(404); return res.end(); }
    return proxy(req, res, t);
  }

  let p = u.pathname === '/' ? '/index.html' : u.pathname;
  const SEP = String.fromCharCode(92);
  let rel = path.normalize(p);
  while (rel.startsWith('/') || rel.startsWith(SEP)) rel = rel.slice(1);
  const file = path.join(PUB, rel);
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end('forbidden'); }
  fs.stat(file, (statErr, st) => {
  if (statErr) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('bulunamadi: ' + p); }
  fs.readFile(file, async (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('bulunamadi: ' + p); }
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';

    // hls.js surumle birlikte degisir -> uzun onbellek; veri dosyalari tazelenmeli
    const cache = ext === '.js' ? 'public, max-age=604800'
                : ext === '.json' || ext === '.m3u' ? 'no-cache'
                : 'no-store';

    const head = {
      'Content-Type': type,
      'Cache-Control': cache,
      'Access-Control-Allow-Origin': '*',   // Cortexia (localhost:5173) durum/katalog okuyabilsin
      'Vary': 'Accept-Encoding',
    };

    // Accept-Encoding'i regex yerine ayristirarak oku
    const accept = new Set(
      String(req.headers['accept-encoding'] || '')
        .split(',').map((x) => x.split(';')[0].trim().toLowerCase()),
    );
    const enc = data.length >= COMPRESS_MIN && COMPRESSIBLE.test(type)
      ? (accept.has('br') ? 'br' : accept.has('gzip') ? 'gzip' : null)
      : null;

    if (enc) {
      const out = await compressed(file, st.mtimeMs, enc, data);
      if (out) {
        head['Content-Encoding'] = enc;
        res.writeHead(200, head);
        return res.end(out);
      }
    }
    res.writeHead(200, head);
    res.end(data);
  });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('\n  Cortexia TV  ->  http://localhost:' + PORT + '\n  (kapatmak icin bu pencerede Ctrl+C)\n');
});
