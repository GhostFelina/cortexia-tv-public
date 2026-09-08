import fs from 'node:fs';

/* -------------------------------------------------------------------------- */
/*  Ulkeler                                                                    */
/* -------------------------------------------------------------------------- */
const SOURCES = [
  { co: 'us', flag: '🇺🇸', label: 'ABD',       files: ['data/results_us.json'] },
  { co: 'gb', flag: '🇬🇧', label: 'İngiltere', files: ['data/results_gb.json'] },
  { co: 'es', flag: '🇪🇸', label: 'İspanya',   files: ['data/results_es.json'] },
  { co: 'mx', flag: '🇲🇽', label: 'Meksika',   files: ['data/results_mx.json'] },
  { co: 'ar', flag: '🇦🇷', label: 'Arjantin',  files: ['data/results_ar.json'] },
  { co: 'tr', flag: '🇹🇷', label: 'Türkiye',   files: ['data/results_tr.json'] },
];

/* -------------------------------------------------------------------------- */
/*  Isim temizligi                                                             */
/* -------------------------------------------------------------------------- */
const clean = (n) => n
  .replace(/\s*\((?:\d{3,4}p|SD|HD|FHD)\)\s*/gi, ' ')
  .replace(/\s*\[(?:Geo-blocked|Not 24\/7)\]\s*/gi, ' ')
  .replace(/\s+/g, ' ').trim();

/* -------------------------------------------------------------------------- */
/*  Kategori eslemesi                                                          */
/* -------------------------------------------------------------------------- */
const CAT = {
  News: 'haber', Business: 'haber', Weather: 'haber',
  Sports: 'spor', Auto: 'spor',
  Series: 'dizi', Classic: 'dizi', Comedy: 'dizi', Family: 'dizi',
  Movies: 'film',
  Documentary: 'belgesel', Science: 'belgesel', Culture: 'belgesel',
  Travel: 'belgesel', Outdoor: 'belgesel', Education: 'belgesel',
  Kids: 'cocuk', Animation: 'cocuk',
  Entertainment: 'eglence', General: 'eglence', Lifestyle: 'eglence',
  Music: 'eglence', Cooking: 'eglence', Relax: 'eglence',
  Legislative: 'diger', Religious: 'diger', Shop: 'diger', Undefined: 'eglence',
  Public: null,   // "General;Public" gibi -> yalnizca General sayilsin
};
const PRIORITY = ['haber', 'spor', 'belgesel', 'dizi', 'film', 'cocuk', 'eglence', 'diger'];

// yerel kamu erisim / belediye / meclis / okul kanallari -> "diger"
const LOCAL_GOV = new RegExp([
  // ABD
  'public access', 'government (channel|access)', 'city of ', 'county ', 'municipal',
  'community media', 'educational channel', 'school district', 'city council',
  'board of (education|supervisors)', String.raw`\bpeg\b`, 'town of ', 'village of ', 'township',
  // Ispanya
  'ayuntamiento', 'diputaci', 'canal parlamento', 'parlament de', 'corts valencianes',
  'televisi[oó]n municipal', 'concello',
  // Turkiye
  'belediye', 'b[uü]y[uü]k[sş]ehir', 'tbmm', 'meclis tv', 'valilik',
  // Latin Amerika
  'canal del congreso', 'c[aá]mara de diputados', 'senado tv',
  // Birlesik Krallik
  'parliament(ary)? (tv|channel)', 'council (tv|channel)',
].join('|'), 'i');

const LOCAL_STATION = /\b[KW][A-Z]{2,3}(-(TV|DT\d?|CD|LD))?\b/;

function categorize(groupStr, name) {
  const n = name.toLowerCase();
  const cats = new Set();
  (groupStr || 'Undefined').split(';').forEach((g) => {
    const c = CAT[g.trim()];
    if (c) cats.add(c);
  });

  // isimden cikarim (iki dil)
  if (/\bnews\b|noticias|informativ|newsmax|bloomberg|reuters|cheddar|weather|meteo|c-span|cspan|24 horas|haber|gündem|gundem/.test(n)) cats.add('haber');
  if (/\bespn|\bnfl\b|\bnba\b|\bmlb\b|\bnhl\b|fox sports|bein|stadium|fifa|golf|wwe|ufc|nascar|racing|soccer|football|basketball|baseball|hockey|tennis|boxing|wrestling|deporte|futbol|fútbol|baloncesto|real madrid|bar[çc]a|toros|spor|sky sports|premier league|tyc sports/.test(n)) cats.add('spor');
  if (/documentar|history|nature|smithsonian|nat geo|national geo|\bscience\b|discovery|bbc earth|planet|wildlife|curiosity|magellan|historia|natura|odisea|belgesel|documental/.test(n)) cats.add('belgesel');
  if (/\bkids\b|\bjr\.?\b|junior|cartoon|\bnick\b|\bbaby\b|toon|preschool|pbs kids|infantil|çocuk|cocuk|minika|cbeebies|cbbc|caricaturas|\bclan\b|boing/.test(n)) {
    cats.add('cocuk');
    cats.delete('belgesel');
    cats.delete('haber');
  }
  if (LOCAL_GOV.test(name)) { cats.clear(); cats.add('diger'); }

  if (!cats.size) cats.add('eglence');
  return [...cats].sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
}

/* -------------------------------------------------------------------------- */
/*  Populerlik: ulke basina taninmis markalar (sirali)                         */
/* -------------------------------------------------------------------------- */
const TOP = {
  us: [
    'ABC News Live','NBC News NOW','CBS News 24/7','Fox News Channel','Bloomberg TV','Reuters','Scripps News',
    'Cheddar News','Newsmax TV','Fox Weather','AccuWeather Now','NASA','C-SPAN','Law & Crime','Fox Business',
    'ESPNU','ESPNews','Fox Sports 1','Fox Sports 2','NFL Network','NBA TV','NHL Network','MLB Strike Zone',
    'beIN SPORTS XTRA','Stadium','FIFA+ United States','NBC Sports NOW','Fox Sports Racing','World Poker Tour',
    'BBC Earth','History Hit','Smithsonian Channel Selects','Crime + Investigation','Curiosity','Real Wild',
    'MotorTrend','Magellan TV','Love Nature','Autentic History','BritBox','TED','Journey',
    'AMC','Comedy Central','MTV','Nickelodeon','BBC America','Bounce','Starz','FX Movie Channel','Paramount',
    'Star Trek','CSI','Law & Order','48 Hours','Survivor','Deal or No Deal','Top Gear','Ink Master',
    'Baywatch','Perry Mason','Doctor Who','TV Land','Pluto TV','Tubi','PBS Kids','Nick Jr.','LEGO',
  ],
  es: [
    // ulusal genel
    'La 1','La 2','Antena 3','Cuatro','Telecinco','laSexta','La Sexta','Atreseries','Neox','Nova','Mega',
    'Energy','Divinity','FDF','Be Mad','Ten','Trece','DMAX','DKISS','Paramount Network','Gol Play',
    // haber
    'Canal 24 Horas','24 Horas','RTVE Noticias','Antena 3 Noticias','Telecinco Noticias','Negocios TV',
    'RT en Espa','Euronews','France 24','DW Espa',
    // spor
    'Teledeporte','Real Madrid TV','Barça TV','LaLiga','Eurosport','Toros',
    // belgesel / kultur
    'Odisea','Historia','Natura','Caza y Pesca','Canal Cocina','Decasa','Hollywood',
    // cocuk
    'Clan','Boing','Nickelodeon','Disney','Baby TV',
    // bolgesel kamu
    'TV3','324','Canal Sur','Telemadrid','ETB','Aragón TV','À Punt','IB3','TVG','CMM','7RM','La 8','TPA','Canal Extremadura',
  ],
  gb: [
    'BBC One','BBC Two','BBC News','BBC Four','BBC Three','BBC Earth','BBC World News','BBC Parliament',
    'ITV1','ITV2','ITV3','ITV4','ITVBe','ITVX','STV',
    'Channel 4','E4','Film4','More4','4seven','Channel 5','5USA','5STAR','5ACTION',
    'Sky News','Sky Arts','Sky Sports','GB News','TalkTV','Times Radio',
    'Dave','Really','Yesterday','Drama','Quest','Blaze','PBS America',
    'CBeebies','CBBC','Pop','Tiny Pop',
    'S4C','BBC Alba','Euronews','Al Jazeera English','France 24 English','DW English',
    'Rakuten','Pluto TV','Samsung TV Plus','Plex',
  ],
  mx: [
    'Las Estrellas','Canal 5','Nu9ve','Azteca Uno','Azteca 7','Imagen Televisión','Imagen TV',
    'Milenio','Foro TV','ADN 40','adn40','El Financiero','Excélsior','Canal Once','Canal 22','TV UNAM',
    'Multimedios','Telemax','Capital 21','Heraldo','TV Azteca','Azteca Deportes','Azteca Noticias',
    'Televisa','TUDN','Claro Sports','Pluto TV','Plex',
  ],
  ar: [
    'Telefe','El Trece','eltrece','América TV','America TV','Canal 9','El Nueve','TV Pública',
    'C5N','Todo Noticias','LN+','A24','Crónica TV','Cronica TV','Net TV','Bravo TV','IP Noticias',
    'DeporTV','TyC Sports','Encuentro','Paka Paka','Canal de la Ciudad','Canal 26','Pluto TV',
  ],
  tr: [
    'TRT 1','TRT 2','TRT Haber','TRT Spor','TRT Belgesel','TRT Çocuk','TRT World','TRT Müzik','TRT Avaz','TRT EBA',
    'ATV','Show TV','Star TV','Kanal D','NOW TV','TV8','teve2','Kanal 7','Beyaz TV',
    'NTV','Habertürk','CNN Türk','A Haber','24 TV','TGRT Haber','Halk TV','TELE1','Tele 1','Sözcü TV',
    'TV100','Ülke TV','Bloomberg HT','Ekotürk','A Spor','Haber Global','Kanal 24',
    'Minika','Cartoon Network','Nickelodeon','Dmax','TLC',
  ],
};

const scoreOf = (name, co) => {
  const n = name.toLowerCase();
  const list = TOP[co] || [];
  let best = 0;
  list.forEach((t, i) => { if (n.includes(t.toLowerCase())) best = Math.max(best, list.length - i); });
  return best;
};

function rankPenalty(name, cats, co) {
  let p = 0;
  if (LOCAL_GOV.test(name)) p -= 40;
  if (co === 'us' && LOCAL_STATION.test(name)) p -= 20;
  if (cats[0] === 'diger') p -= 30;
  // ana dilin disindaki yayinlar geri sirada
  if (co === 'us' && /en espa|espanol|español|latino|latin america|brasil|portugu|\bkorea|\bchina|\bindia|arabic|russia|turk/i.test(name)) p -= 15;
  if (co === 'es' && /\bin english\b|arabic|rumano|chino/i.test(name)) p -= 15;
  if (co === 'gb' && /arabic|urdu|hindi|punjabi|polski|romanian/i.test(name)) p -= 15;
  if ((co === 'mx' || co === 'ar') && /english|chino|arabic/i.test(name)) p -= 15;
  if (co === 'tr' && /arabic|kurdi|english|deutsch|azerbaycan/i.test(name)) p -= 10;
  return p;
}

/* -------------------------------------------------------------------------- */
/*  Olustur                                                                    */
/* -------------------------------------------------------------------------- */
const seen = new Map();
const perCountry = {};

for (const src of SOURCES) {
  const raw = [];
  for (const f of src.files) {
    if (!fs.existsSync(f)) { console.log('atlandi (dosya yok): ' + f); continue; }
    raw.push(...JSON.parse(fs.readFileSync(f, 'utf8')).filter((x) => x.ok));
  }
  let n = 0;
  for (const c of raw) {
    const name = clean(c.name);
    if (!name) continue;
    const key = src.co + '|' + name.toLowerCase();
    const h = parseInt((c.res || '0x0').split('x')[1] || '0', 10);
    const cats = categorize(c.group, name);
    const item = {
      name, url: c.url, logo: c.logo || '', cats, co: src.co,
      res: c.res || '', h,
      d: c.cors ? 1 : 0,            // 1 = CORS gonderiyor, proxy olmadan da oynar
      id: c.id || '',
      pop: scoreOf(name, src.co) + rankPenalty(name, cats, src.co),
      ms: c.ms || 0,
      alt: [],                      // yedek adresler (birincisi olurse denenir)
    };
    const prev = seen.get(key);
    if (!prev) { seen.set(key, item); continue; }
    // daha iyiyse birincil yap, digerini yedege al
    const better = item.h > prev.h || (item.h === prev.h && item.ms < prev.ms);
    if (better) { item.alt = [prev.url, ...prev.alt].slice(0, 3); seen.set(key, item); }
    else if (prev.alt.length < 3) prev.alt.push(item.url);
  }
  n = [...seen.values()].filter((x) => x.co === src.co).length;
  perCountry[src.co] = n;
}

let list = [...seen.values()];
const ORDER = Object.fromEntries(SOURCES.map((s, i) => [s.co, i]));
list.sort((a, b) =>
  (ORDER[a.co] - ORDER[b.co]) ||
  (b.pop - a.pop) || (b.h - a.h) || a.name.localeCompare(b.name, 'en'));
list.forEach((c, i) => { c.i = i; });

// mevcut CC bayraklarini koru (probe-cc.mjs sonradan gunceller)
try {
  const old = JSON.parse(fs.readFileSync('public/channels.json', 'utf8'));
  const keep = new Map(old.channels.map((c) => [(c.co || 'us') + '|' + c.name, { cc: c.cc, t: c.t }]));
  list.forEach((c) => {
    const v = keep.get(c.co + '|' + c.name);
    if (!v) return;
    if (v.cc !== undefined) c.cc = v.cc;
    if (v.t !== undefined) c.t = v.t;
  });
} catch { /* ilk calistirma */ }

const counts = {};
for (const src of SOURCES) {
  counts[src.co] = {};
  list.filter((c) => c.co === src.co)
    .forEach((c) => c.cats.forEach((k) => { counts[src.co][k] = (counts[src.co][k] || 0) + 1; }));
}

fs.writeFileSync('public/channels.json', JSON.stringify({
  built: new Date().toISOString(),
  total: list.length,
  countries: SOURCES.map((s) => ({
    co: s.co, flag: s.flag, label: s.label,
    total: list.filter((c) => c.co === s.co).length,
  })),
  counts,
  channels: list,
}));

// Harici oynatici icin M3U: birlesik + ulke basina
const toM3U = (arr) => ['#EXTM3U', ...arr.flatMap((c) => [
  `#EXTINF:-1 tvg-logo="${c.logo}" group-title="${c.co.toUpperCase()} · ${c.cats[0]}",${c.name}`, c.url,
])].join('\n');
fs.writeFileSync('public/TV.m3u', toM3U(list));
for (const s of SOURCES) fs.writeFileSync(`public/TV-${s.co}.m3u`, toM3U(list.filter((c) => c.co === s.co)));

/* -------------------------------------------------------------------------- */
console.log('Toplam calisan kanal: ' + list.length);
for (const s of SOURCES) {
  const l = list.filter((c) => c.co === s.co);
  if (!l.length) continue;
  console.log(`\n${s.flag} ${s.label}: ${l.length} kanal · HD ${l.filter((c) => c.h >= 720).length}`);
  console.log('   ' + JSON.stringify(counts[s.co]));
  for (const k of PRIORITY) {
    const t = l.filter((c) => c.cats.includes(k)).slice(0, 8);
    if (t.length) console.log('   [' + k + '] ' + t.map((c) => c.name).join(' · '));
  }
}
