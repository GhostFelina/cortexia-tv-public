# 📺 Cortexia TV

Doğrulanmış canlı TV kanalları — **6 ülke, 3559 kanal**.
Her yayın adresi `manifest → varyant → gerçek segment baytı` düzeyinde test edilir;
yalnızca gerçekten çalışanlar listeye girer. Dil pratiği için altyazı (CC) desteği,
yayın akışı (EPG) ve yedek adres devri ile.

| Ülke | Kanal | HD | Altyazılı | Yayın akışı |
|---|---:|---:|---:|---:|
| 🇺🇸 ABD | 1936 | 1191 | 1209 | ✓ |
| 🇬🇧 İngiltere | 425 | 230 | 289 | ✓ |
| 🇪🇸 İspanya | 411 | 211 | 214 | ✓ |
| 🇲🇽 Meksika | 314 | 96 | 190 | ✓ |
| 🇦🇷 Arjantin | 321 | 62 | 186 | ✓ |
| 🇹🇷 Türkiye | 152 | 122 | 1 | — |

---

## İki çalışma biçimi

**Yerel (tam sürüm)** — Node sunucu, kanalların **%100'ü** oynar.
Sunucu HLS manifestlerini kendi proxy'sine yeniden yazarak tarayıcının CORS
engelini aşar; hotlink koruması olan logoları da o taşır.

**Web (statik sürüm)** — sunucusuz, doğrudan oynatma. Kanalların
**%98'i (3501)** kendi CORS başlığını gönderdiği için tarayıcıda proxy olmadan
açılır. Video hiçbir zaman siteden geçmez, doğrudan yayıncıdan gelir.
Oynatıcı hangi ortamda olduğunu `/__local` uç noktasıyla kendi anlar.

## Kurulum (başka bir bilgisayara)

1. [Node.js](https://nodejs.org) 20+ kur
2. Bu depoyu indir (`Code → Download ZIP` ya da `git clone`)
3. **`Kurulum.bat`** dosyasına çift tıkla — masaüstü kısayolunu oluşturur,
   istersen oturum açılışına ekler ve başlatır

Kanal kataloğu ve yayın akışı depoyla birlikte gelir; ilk çalıştırmada
beklemen gerekmez. Liste eskidiyse `Kanallari-Yenile.bat`.

> **Güvenlik:** Sunucu yalnızca `127.0.0.1` dinler — yerel ağdan veya
> internetten erişilemez. Depoda kişisel veri yoktur; `node guvenlik-denetimi.mjs`
> ile kendin doğrulayabilirsin (sır taraması, kişisel bilgi, XSS, proxy ve
> TLS ayarları, .gitignore kapsamı).

## Çalıştırma

Sunucu her oturum açılışında pencere açmadan başlar. Masaüstündeki
**Cortexia TV** kısayolu ya da <http://localhost:8787>.

```
Baslat.bat                  görünür pencerede başlat
Otomatik-Baslatma-Ac.bat    oturum açılışına ekle
Otomatik-Baslatma-Kapat.bat kaldır ve sunucuyu durdur
Kanallari-Yenile.bat        her şeyi baştan indir, test et, kataloğu üret (~40 dk)
```

## Kısayollar

| Tuş | | Tuş | |
|---|---|---|---|
| `Boşluk` | oynat / duraklat | `↑` `↓` | kanal değiştir |
| `F` | tam ekran | `←` `→` | ses |
| `M` | sessiz | `/` | arama |
| `C` | **altyazı** | `Esc` | kapat |

## Dil pratiği

`CC` rozetli kanallarda altyazı doğrulanmıştır — **2090 kanal**. Sol alttaki
"Sadece altyazılı" kutusu listeyi bunlara indirir, "Altyazıyı otomatik aç"
işaretliyken kanal açılır açılmaz devreye girer.

Oynatıcı hem manifestte tanımlı altyazıları hem yayına gömülü **CEA-608/708**
closed caption'ları yakalar — ABD ve İngiltere haber kanallarının standardı budur.
Çift dilli yayınlarda ses dili seçici ile dil sabitlenir.

## Nasıl çalışıyor

```
Kanallari-Yenile.bat
  ├── merge-sources.mjs    tüm kaynakları tek aday listesinde toplar
  ├── test-streams.mjs     manifest → varyant → gerçek segment baytı
  ├── retest.mjs           başarısızları protokol/varyant değiştirerek yeniden dener
  ├── build-catalog.mjs    kategori, popülerlik, yedek adres, CORS bayrağı
  ├── probe-cc.mjs         altyazı taraması
  └── build-epg.mjs        yayın akışı (XMLTV → kompakt JSON)

server.mjs (yerel)
  ├── public/index.html    arayüz + hls.js (yerel, CDN'e bağımlı değil)
  ├── /p/<base64url>       HLS proxy — manifestteki tüm adresleri kendine yazar
  ├── /img?u=              logo proxy
  └── /__local             oynatıcı bu uç noktayla ortamı anlar
```

### Kaynaklar

Hepsi reklam destekli ücretsiz servisler ve yayıncıların kendi açık akışları:

- [iptv-org/iptv](https://github.com/iptv-org/iptv) — ülke listeleri
- [iptv-org/api](https://github.com/iptv-org/api) — aynı kanalın alternatif adresleri (yedek devri buradan)
- [BuddyChewChew/app-m3u-generator](https://github.com/BuddyChewChew/app-m3u-generator) — Pluto TV, Samsung TV Plus, Plex, Roku Channel, Tubi
- [Free-TV/IPTV](https://github.com/Free-TV/IPTV) — az ama seçilmiş kanallar
- [i.mjh.nz](https://i.mjh.nz) — yayın akışı (XMLTV)

Bir kanalın birden fazla adresi varsa hepsi test edilir; çalışan ve en yüksek
çözünürlüklü olan birincil, kalanlar yedek olur. Birincil düşerse oynatıcı
kendiliğinden yedeğe geçer (**545 kanalda yedek var**).

## Ülke eklemek

1. `merge-sources.mjs` → `SOURCES` içine ülke ve kaynak dosyaları
2. `build-catalog.mjs` → `SOURCES` (bayrak, etiket) ve `TOP` (popüler kanallar)
3. `Kanallari-Yenile.bat` → indirme satırları

Arayüzün ülke seçicisi katalogdan üretilir, elle iş yoktur.

## Sorun giderme

**Kanal açılmıyor** → Yedeği varsa oynatıcı kendi geçer. "Sonraki kanal" ya da
"Tekrar dene". Çok sayıda kanal açılmıyorsa `Kanallari-Yenile.bat`.

**Ses yok** → Tarayıcı otomatik oynatmayı sessize alır, 🔊 düğmesine bas.

**Port dolu** → `set PORT=9000 && node server.mjs`

**Web sürümünde daha az kanal** → Doğru; proxy olmadan yalnızca kendi CORS
başlığını gönderen yayınlar açılabilir. Tamamı için yerel sunucuyu çalıştır.

## Lisans

MIT. Bu depo hiçbir video içeriği barındırmaz veya yeniden yayınlamaz —
yalnızca herkese açık kaynaklardan derlenen adresleri doğrular ve listeler.
