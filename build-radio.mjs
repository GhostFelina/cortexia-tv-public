import fs from 'node:fs';

/* -------------------------------------------------------------------------- *
 *  Radyo katalogu. TV katalogundan bagimsiz ama ayni sekli tasir, boylece
 *  arayuz tek kod yoluyla ikisini de gosterir.
 * -------------------------------------------------------------------------- */

const SOURCES = [
  { co: 'us', flag: '🇺🇸', label: 'ABD' },
  { co: 'gb', flag: '🇬🇧', label: 'İngiltere' },
  { co: 'es', flag: '🇪🇸', label: 'İspanya' },
  { co: 'mx', flag: '🇲🇽', label: 'Meksika' },
  { co: 'ar', flag: '🇦🇷', label: 'Arjantin' },
  { co: 'tr', flag: '🇹🇷', label: 'Türkiye' },
];

/* --------------------------------------------------------- tur siniflandirma */
const PRIORITY = ['haber', 'spor', 'pop', 'rock', 'klasik', 'caz', 'elektronik',
                  'yerel', 'kultur', 'dini', 'muzik'];

const RULES = [
  ['haber',      /\bnews\b|noticias|talk|informativ|actualidad|haber|gündem|current affairs|politic/],
  ['spor',       /\bsport|deporte|futbol|fútbol|soccer|espn|radio marca|spor\b/],
  ['klasik',     /classic(al)?|klasik|clásica|opera|symphon|barok|baroque|sanat müzi/],
  ['caz',        /\bjazz\b|blues|\bcaz\b|soul\b|funk/],
  ['elektronik', /electro|techno|house|trance|\bedm\b|dance|club|dubstep|drum ?(&|and) ?bass/],
  ['rock',       /\brock\b|metal|punk|grunge|alternative|indie|hard ?rock/],
  ['pop',        /\bpop\b|top ?40|hits|chart|contemporary|hot ?ac|40 principales|dance ?pop/],
  ['dini',       /religio|christian|gospel|catholic|islam|kuran|kur.an|ilahi|dini|cristian|católic|worship/],
  ['kultur',     /culture|kultur|kültür|book|literat|educat|university|üniversite|documentar|poetry|theatre/],
  ['yerel',      /local|community|regional|municipal|yerel|comunitaria|vecinal/],
];

function categorize(tags, name) {
  const t = (tags + ' ' + name).toLowerCase();
  const cats = new Set();
  for (const [k, re] of RULES) if (re.test(t)) cats.add(k);
  if (!cats.size) cats.add('muzik');
  return [...cats].sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b)).slice(0, 3);
}

/* --------------------------------------------------------------- olustur */
const all = [];
const seenName = new Map();

for (const src of SOURCES) {
  const f = `data/radio_${src.co}.json`;
  if (!fs.existsSync(f)) { console.log('atlandi (yok): ' + f); continue; }
  const rows = JSON.parse(fs.readFileSync(f, 'utf8')).filter((x) => x.ok);

  for (const s of rows) {
    const name = s.name.replace(/\s+/g, ' ').trim();
    if (!name) continue;
    const key = src.co + '|' + name.toLowerCase();
    const item = {
      name,
      url: s.url,
      logo: s.logo || '',
      home: s.home || '',
      co: src.co,
      cats: categorize(s.tags || '', name),
      br: s.bitrate || 0,
      codec: (s.codec || '').toUpperCase().replace('MP3', 'MP3'),
      hls: s.hls ? 1 : 0,
      s: s.url.startsWith('https://') ? 1 : 0,      // https ise web surumunde de calisir
      d: s.cors ? 1 : 0,                            // CORS gonderiyor (HLS icin gerekli)
      pop: (s.clicks || 0) + (s.votes || 0) * 3,
      ms: s.ms || 0,
    };
    const prev = seenName.get(key);
    // ayni isim: daha yuksek bit hizli / https olani tut
    if (!prev) { seenName.set(key, item); continue; }
    const better = (item.s - prev.s) || (item.br - prev.br) || (prev.ms - item.ms);
    if (better > 0) seenName.set(key, item);
  }
}

const ORDER = Object.fromEntries(SOURCES.map((s, i) => [s.co, i]));
const list = [...seenName.values()].sort((a, b) =>
  (ORDER[a.co] - ORDER[b.co]) || (b.pop - a.pop) || a.name.localeCompare(b.name, 'tr'));
list.forEach((s, i) => { s.i = i; });

const counts = {};
for (const src of SOURCES) {
  counts[src.co] = {};
  list.filter((x) => x.co === src.co)
    .forEach((x) => x.cats.forEach((k) => { counts[src.co][k] = (counts[src.co][k] || 0) + 1; }));
}

fs.writeFileSync('public/radio.json', JSON.stringify({
  built: new Date().toISOString(),
  total: list.length,
  countries: SOURCES
    .map((s) => ({ ...s, total: list.filter((x) => x.co === s.co).length }))
    .filter((s) => s.total > 0),
  counts,
  stations: list,
}));

console.log('Toplam calisan radyo: ' + list.length);
for (const s of SOURCES) {
  const l = list.filter((x) => x.co === s.co);
  if (!l.length) continue;
  const web = l.filter((x) => x.s && (!x.hls || x.d)).length;
  console.log(`\n${s.flag} ${s.label}: ${l.length} istasyon  (web surumunde ${web})`);
  console.log('   ' + JSON.stringify(counts[s.co]));
  console.log('   en populer: ' + l.slice(0, 8).map((x) => x.name).join(' · '));
}
