@echo off
setlocal
title Cortexia TV - Kurulum
cd /d "%~dp0"
echo.
echo   ========================================
echo      Cortexia TV - Kurulum
echo   ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   [HATA] Node.js bulunamadi.
  echo   https://nodejs.org adresinden LTS surumu kur, sonra bu dosyayi tekrar calistir.
  echo.
  pause
  exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODEV=%%v
echo   Node.js %NODEV% bulundu.
echo.

if not exist public\channels.json (
  echo   [BILGI] Kanal katalogu yok. Kanallari-Yenile.bat calistirilmali (~40 dk).
  echo.
)

echo   Masaustu kisayolu olusturuluyor...
powershell -NoProfile -Command "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Cortexia TV.lnk')); $s.TargetPath='%~dp0Baslat.bat'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='%SystemRoot%\System32\shell32.dll,130'; $s.Description='Cortexia TV'; $s.Save()"
echo   Tamam.
echo.

set /p AUTO=  Sunucu her acilista kendiliginden baslasin mi? (E/H): 
if /i "%AUTO%"=="E" (
  call Otomatik-Baslatma-Ac.bat
) else (
  echo   Atlandi. Sonra Otomatik-Baslatma-Ac.bat ile acabilirsin.
)
echo.
echo   Kurulum bitti. Simdi baslatiliyor...
timeout /t 2 >nul
start "" Baslat.bat
exit /b 0
