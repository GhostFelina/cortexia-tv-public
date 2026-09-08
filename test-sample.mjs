import fs from 'node:fs';
import { execSync } from 'node:child_process';
const cat = JSON.parse(fs.readFileSync('public/channels.json','utf8'));
const cats = ['haber','spor','belgesel','dizi','film','cocuk','eglence'];
const pick = [];
for (const k of cats) {
  const l = cat.channels.filter(c => c.cats[0] === k);
  for (let i = 0; i < 6 && l.length; i++) pick.push(l[Math.floor(Math.random()*l.length)]);
}
fs.writeFileSync('data/sample.json', JSON.stringify(pick));
console.log('Ornek: ' + pick.length + ' kanal (kategori basina 6)');
