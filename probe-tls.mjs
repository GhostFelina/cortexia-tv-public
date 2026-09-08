import fs from 'node:fs';
import tls from 'node:tls';

/* -------------------------------------------------------------------------- *
 *  Sertifika gecerliligi taramasi.
 *
 *  Dogrulayicilar bozuk sertifika zincirlerini kasten hosgoruyor: yerel proxy
 *  uzerinden bu yayinlar sorunsuz calisir. Ama STATIK WEB surumu https"tir ve
 *  tarayici gecersiz sertifikali bir kaynagi oynatmaz. Bu yuzden her https
 *  adresi bir de DOGRULAMA ACIKKEN el sikismasindan gecirip `t` bayragini
 *  yaziyoruz; arayuz web modunda yalnizca t=1 olanlari listeler.
 * -------------------------------------------------------------------------- */

const CONC = 60;
const TIMEOUT = 8000;

/** Yalnizca TLS el sikismasi — veri indirilmez. */
function handshake(host, port) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (okFlag) => { if (!done) { done = true; try { s.destroy(); } catch {} resolve(okFlag); } };
    const s = tls.connect(
      { host, port, servername: host, rejectUnauthorized: true, ALPNProtocols: ['http/1.1'] },
      () => finish(true),
    );
    s.on('error', () => finish(false));
    s.setTimeout(TIMEOUT, () => finish(false));
  });
}

async function probeAll(items, label) {
  // ayni host:port"u bir kez dene
  const hosts = new Map();          // "host:port" -> [item, ...]
  for (const it of items) {
    let u;
    try { u = new URL(it.url); } catch { it.t = 0; continue; }
    if (u.protocol !== 'https:') { it.t = 1; continue; }   // http: TLS sorunu yok
    const key = u.hostname + ':' + (u.port || 443);
    if (!hosts.has(key)) hosts.set(key, []);
    hosts.get(key).push(it);
  }

  const keys = [...hosts.keys()];
  console.log(label + ': ' + keys.length + ' benzersiz https sunucusu');
  let i = 0, bad = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < keys.length) {
      const key = keys[i++];
      const [host, port] = key.split(':');
      const good = await handshake(host, Number(port));
      if (!good) bad++;
      for (const it of hosts.get(key)) it.t = good ? 1 : 0;
    }
  }));
  const n = items.filter((x) => x.t === 0).length;
  console.log('  gecersiz sertifikali sunucu: ' + bad + '  ->  etkilenen kayit: ' + n);
  return n;
}

/* ------------------------------------------------------------------ TV */
if (fs.existsSync('public/channels.json')) {
  const d = JSON.parse(fs.readFileSync('public/channels.json', 'utf8'));
  await probeAll(d.channels, 'TV');
  fs.writeFileSync('public/channels.json', JSON.stringify(d));
  const web = d.channels.filter((c) => c.d && c.t).length;
  console.log('  web surumunde oynayan kanal: ' + web + ' / ' + d.total + '\n');
}

/* --------------------------------------------------------------- Radyo */
if (fs.existsSync('public/radio.json')) {
  const d = JSON.parse(fs.readFileSync('public/radio.json', 'utf8'));
  await probeAll(d.stations, 'Radyo');
  fs.writeFileSync('public/radio.json', JSON.stringify(d));
  const web = d.stations.filter((s) => s.s && s.t && (!s.hls || s.d)).length;
  console.log('  web surumunde oynayan istasyon: ' + web + ' / ' + d.total);
}
