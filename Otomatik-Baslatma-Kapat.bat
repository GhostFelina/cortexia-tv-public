@echo off
title Cortexia TV - Otomatik baslatmayi kapat
powershell -NoProfile -Command "Remove-Item (Join-Path ([Environment]::GetFolderPath('Startup')) 'Cortexia TV Sunucu.lnk') -ErrorAction SilentlyContinue"
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
echo.
echo   Otomatik baslatma kapatildi ve calisan sunucu durduruldu.
pause
