@echo off
title Cortexia TV - Kanal listelerini yenile
cd /d "%~dp0"
echo.
echo   [1/7] Kaynak listeler indiriliyor...
curl -sSL -o data/iptvorg_us.m3u "https://iptv-org.github.io/iptv/countries/us.m3u"
curl -sSL -o data/iptvorg_es.m3u "https://iptv-org.github.io/iptv/countries/es.m3u"
curl -sSL -o data/iptvorg_gb.m3u "https://iptv-org.github.io/iptv/countries/uk.m3u"
curl -sSL -o data/iptvorg_mx.m3u "https://iptv-org.github.io/iptv/countries/mx.m3u"
curl -sSL -o data/iptvorg_ar.m3u "https://iptv-org.github.io/iptv/countries/ar.m3u"
curl -sSL -o data/iptvorg_tr.m3u "https://iptv-org.github.io/iptv/countries/tr.m3u"
curl -sSL -o data/api_streams.json "https://iptv-org.github.io/api/streams.json"
curl -sSL -o data/api_channels.json "https://iptv-org.github.io/api/channels.json"
call :fast plutotv_us
call :fast plutotv_es
call :fast plutotv_gb
call :fast plutotv_mx
call :fast plutotv_ar
call :fast samsungtvplus_us
call :fast samsungtvplus_es
call :fast samsungtvplus_gb
call :fast plex_us
call :fast plex_es
call :fast plex_gb
call :fast plex_mx
call :fast roku_all
call :fast tubi_all
call :free usa us
call :free spain es
call :free uk gb
call :free mexico mx
call :free argentina ar
call :free turkey tr
echo   [2/7] Aday listeler birlestiriliyor...
node -e "const fs=require('fs');for(const f of fs.readdirSync('data'))if(/^results_.*json$/.test(f))fs.unlinkSync('data/'+f)"
node merge-sources.mjs
echo   [3/7] Tum yayinlar test ediliyor (20-40 dk)...
for %%c in (us gb es mx ar tr) do (
  node test-streams.mjs data/cand_%%c.m3u data/results_%%c.json
  node retest.mjs data/results_%%c.json
)
echo   [4/7] Katalog + altyazi taramasi...
node build-catalog.mjs
node probe-cc.mjs
echo   [5/7] Yayin akisi (EPG) indiriliyor...
node build-epg.mjs
echo   [6/7] Radyo istasyonlari indiriliyor...
node fetch-radio.mjs
echo   [7/7] Radyo yayinlari test ediliyor (10-20 dk)...
for %%c in (us gb es mx ar tr) do node test-radio.mjs %%c
node build-radio.mjs
echo.
echo   Bitti. Baslat.bat ile izlemeye devam edebilirsin.
pause
exit /b

:fast
curl -sSL -o "data/src/%~1.m3u" "https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/%~1.m3u"
exit /b

:free
curl -sSL -o "data/src/freetv_%~2.m3u" "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_%~1.m3u8"
exit /b
