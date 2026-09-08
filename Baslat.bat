@echo off
title Cortexia TV - 6 ulke, dogrulanmis canli kanallar
cd /d "%~dp0"
echo.
echo   ============================================
echo      Cortexia TV  -  3559 dogrulanmis canli kanal
echo      ABD . Ingiltere . Ispanya . Meksika . Arjantin . Turkiye
echo   ============================================
echo.
echo   Sunucu baslatiliyor...
start "" http://localhost:8787
node server.mjs
echo.
echo   Sunucu durdu. Kapatmak icin bir tusa bas.
pause >nul
