import fs from 'node:fs';
import path from 'node:path';

/* Kaynak dosyalarda kazara olusmus kontrol karakteri arar.
 * "\b" gibi kacislar duzenleme sirasinda gercek kontrol karakterine
 * donuserek regex"leri sessizce bozabiliyor — bu tarama onu yakalar. */

const CTRL = [['backspace', 8], ['bell', 7], ['dikey-tab', 11], ['form-feed', 12], ['escape', 27]];
const SKIP = /^(node_modules|\.git|data|\.vercel)$/;
const EXT = /\.(mjs|js|html|json|md|yml|yaml|bat|vbs|css)$/;

const bad = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.test(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!EXT.test(e.name)) continue;
    let s;
    try { s = fs.readFileSync(p, 'utf8'); } catch { continue; }
    const hits = CTRL.filter(([, c]) => s.includes(String.fromCharCode(c))).map(([n]) => n);
    if (hits.length) {
      const line = s.split('\n').findIndex((l) => CTRL.some(([, c]) => l.includes(String.fromCharCode(c)))) + 1;
      bad.push(`${p.split(path.sep).join('/')}:${line}  ->  ${hits.join(', ')}`);
    }
  }
})('.');

if (bad.length) {
  console.log('BOZUK KONTROL KARAKTERI:\n  ' + bad.join('\n  '));
  process.exit(1);
}
console.log('temiz: kaynak dosyalarda bozuk kontrol karakteri yok');
