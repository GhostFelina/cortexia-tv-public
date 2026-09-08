import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/* -------------------------------------------------------------------------- *
 *  Depoyu herkese acmadan once calistirilacak denetim.
 *  Amac: kisisel veri veya sir sizintisi olmadigini ve sunucunun
 *  baskasinin makinesinde guvenli calistigini dogrulamak.
 * -------------------------------------------------------------------------- */

let fail = 0, warn = 0;
const ok   = (m) => console.log('  \x1b[32mGECTI\x1b[0m  ' + m);
const bad  = (m) => { fail++; console.log('  \x1b[31mKALDI\x1b[0m  ' + m); };
const note = (m) => { warn++; console.log('  \x1b[33mUYARI\x1b[0m  ' + m); };
const head = (m) => console.log('\n\x1b[1m' + m + '\x1b[0m');

/** repoya girecek dosyalar (.gitignore disindakiler) */
function tracked() {
  try {
    return execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    // henuz git yoksa: .gitignore mantigini kabaca uygula
    const skip = /^(data|node_modules|\.git|\.vercel)([/\\]|$)/;
    const out = [];
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const rel = path.relative('.', path.join(d, e.name)).replace(/\\/g, '/');
        if (skip.test(rel)) continue;
        if (e.isDirectory()) walk(path.join(d, e.name));
        else out.push(rel);
      }
    })('.');
    return out;
  }
}

const files = tracked();
const readable = files.filter((f) => {
  try { return fs.statSync(f).size < 40 * 1024 * 1024; } catch { return false; }
});

/* ---------------------------------------------------------------- 1. SIRLAR */
head('1. Sir ve kimlik bilgisi taramasi');
const SECRETS = [
  ['AWS erisim anahtari',    /AKIA[0-9A-Z]{16}/],
  ['GitHub token',           /gh[pousr]_[A-Za-z0-9]{30,}/],
  ['Slack token',            /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ['Google API anahtari',    /AIza[0-9A-Za-z_-]{35}/],
  ['OpenAI/Anthropic',       /sk-(ant-)?[A-Za-z0-9_-]{20,}/],
  ['Ozel anahtar blogu',     /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Vercel token',           /vercel_[A-Za-z0-9]{20,}/],
  ['sifre atamasi',          /(password|passwd|secret|api[_-]?key)\s*[:=]\s*['"][^'"]{8,}['"]/i],
];
let secretHit = 0;
for (const f of readable) {
  let s; try { s = fs.readFileSync(f, 'utf8'); } catch { continue; }
  for (const [name, re] of SECRETS) {
    const m = s.match(re);
    if (m) { bad(name + ' -> ' + f + '  (' + m[0].slice(0, 24) + '…)'); secretHit++; }
  }
}
if (!secretHit) ok('bilinen sir kaliplarindan hicbiri bulunmadi (' + readable.length + ' dosya)');

/* ------------------------------------------------------- 2. KISISEL BILGILER */
head('2. Kisisel bilgi taramasi');
const PERSONAL = [
  ['Windows kullanici yolu', /[A-Z]:[/\\]Users[/\\][A-Za-z0-9._-]+/],
  ['Unix ev dizini',         /\/(home|Users)\/[A-Za-z0-9._-]+\//],
  ['e-posta adresi',         /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ['ozel ag IP adresi',      /\b(?:192\.168|10)\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/],
  ['makine adi ipucu',       /\bDESKTOP-[A-Z0-9]{7}\b/],
];
let persHit = 0;
for (const f of readable) {
  let s; try { s = fs.readFileSync(f, 'utf8'); } catch { continue; }
  if (/^(README|LICENSE)/.test(f)) continue;   // telif adi ve ornek yollar kasitli
  // yayin/logo adresleri "/home/" ya da "@" icerebilir -> URL'leri disla
  const clean = s.replace(/https?:\/\/[^\s"'<>]+/g, ' ');
  for (const [name, re] of PERSONAL) {
    const m = clean.match(re);
    if (!m) continue;
    bad(name + ' -> ' + f + '  (' + m[0].slice(0, 48) + ')'); persHit++;
  }
}
if (!persHit) ok('kisisel yol / e-posta / ozel IP / makine adi bulunmadi');

/* ------------------------------------------ 3. UCUNCU TARAF TOKEN'LARI (veri) */
head('3. Yayin adreslerinde gomulu ucuncu taraf token"lari');
const TOKENS = [
  ['X-Plex-Token', /X-Plex-Token=([^&"\s]+)/gi],
  ['jwt/auth', /[?&](auth|jwt|sig|signature|hdnts)=([^&"\s]{16,})/gi],
];
let tokHit = 0;
for (const f of readable.filter((x) => /(channels|radio)\.json$|\.m3u$/.test(x))) {
  const s = fs.readFileSync(f, 'utf8');
  for (const [name, re] of TOKENS) {
    const m = s.match(re);
    if (m) { note(name + ' -> ' + f + ': ' + m.length + ' adres (kaynak listelerin herkese acik token"i, kullaniciya ait degil)'); tokHit++; }
  }
}
if (!tokHit) ok('yayin adreslerinde gomulu token yok');

/* ------------------------------------------------------- 4. SUNUCU GUVENLIGI */
head('4. Sunucu (server.mjs) guvenligi');
const srv = fs.readFileSync('server.mjs', 'utf8');

if (/server\.listen\(\s*PORT\s*,\s*'127\.0\.0\.1'/.test(srv))
  ok('yalnizca 127.0.0.1 dinliyor — yerel ag/internetten erisilemez');
else bad('sunucu tum arayuzleri dinliyor olabilir — proxy disaridan kullanilabilir');

if (/if \(!file\.startsWith\(PUB\)\)/.test(srv))
  ok('statik dosya sunumunda dizin asma (path traversal) korumasi var');
else bad('path traversal korumasi bulunamadi');

if (/NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*'0'/.test(srv))
  bad('NODE_TLS_REJECT_UNAUTHORIZED=0 — TLS dogrulamasi surec genelinde kapali');
else if (/new Agent\(\{ connect: \{ rejectUnauthorized: false \} \}\)/.test(srv))
  ok('TLS gevsetmesi yalnizca yayin proxy"sine sinirli (surec geneli dogrulamayi surduruyor)');
else ok('TLS dogrulamasi acik');

if (/^https?:\/\//.source && /if \(!\/\^https\?:\\\/\\\//.test(srv) || /\/\^https\?:/.test(srv))
  ok('proxy yalnizca http/https adreslerini kabul ediyor (file:, gopher: engelli)');
else note('proxy adres semasi kontrolu dogrulanamadi — elle bak');

/* ------------------------------------------------------------- 5. ARAYUZ XSS */
head('5. Arayuz (XSS) kontrolu');
const ui = fs.readFileSync('public/index.html', 'utf8');
const inner = [...ui.matchAll(/innerHTML\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
// yalnizca UZAK kaynakli degerler risklidir: kanal adlari, EPG program adlari,
// HLS manifestinden gelen ses/altyazi parca adlari. Sabit dizilerden (CATS,
// countries) gelen etiketler kod icinde tanimli, veri degil.
const REMOTE = /\b(c\.name|cur\.title|next\.title|t\.name|t\.lang)\b/;
const risky = inner.filter((x) => REMOTE.test(x) && !/esc\(/.test(x));
if (!risky.length) ok('uzak kaynakli metinler (kanal / program / parca adlari) esc() ile kacisliyor');
else risky.forEach((x) => bad('kacissiz innerHTML: ' + x.slice(0, 70)));

/* ------------------------------------------------------- 6. BAGIMLILIK / CDN */
head('6. Bagimlilik butunlugu');
if (fs.existsSync('public/hls.min.js')) {
  const size = fs.statSync('public/hls.min.js').size;
  ok('hls.js yerel olarak gomulu (' + (size / 1024 | 0) + ' KB) — calisma aninda CDN"e baglanmiyor');
} else bad('hls.min.js yok');
const ext = [...ui.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
if (!ext.length) ok('arayuzde disaridan yuklenen betik/stil yok');
else ext.forEach((u) => note('dis kaynak: ' + u));

/* ---------------------------------------------------------- 7. GIT GECMISI */
head('7. Git gecmisi');
try {
  const n = execSync('git rev-list --count HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  note(n + ' commit var — gecmiste sir kalmis olabilir, tarama gerekir');
} catch {
  ok('henuz commit yok — temiz baslangic, gecmiste sizinti riski sifir');
}

/* --------------------------------------------------------------- 8. IGNORE */
head('8. .gitignore kapsami');
const gi = fs.existsSync('.gitignore') ? fs.readFileSync('.gitignore', 'utf8') : '';
for (const p of ['data/', 'node_modules/', '.vercel/']) {
  if (gi.includes(p)) ok(p + ' yok sayiliyor');
  else bad(p + ' .gitignore"da yok');
}
if (files.some((f) => /^data\//.test(f))) bad('data/ altindan dosyalar repoya girmis');
else ok('ham test ciktilari ve API dokumleri repoya girmiyor');

/* ------------------------------------------------------------------- SONUC */
console.log('\n' + '─'.repeat(64));
console.log(fail === 0
  ? `\x1b[32mSONUC: paylasima uygun\x1b[0m  (${warn} uyari, 0 engel)`
  : `\x1b[31mSONUC: ${fail} engel var\x1b[0m  (${warn} uyari)`);
process.exit(fail ? 1 : 0);
