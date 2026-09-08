@echo off
title Cortexia TV - Otomatik baslatmayi ac
cd /d "%~dp0"
echo.
echo   Cortexia TV sunucusu her oturum acilisinda sessizce baslayacak.
echo.
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'Cortexia TV Sunucu.lnk')); $s.TargetPath='wscript.exe'; $s.Arguments='""%~dp0sessiz-baslat.vbs""'; $s.WorkingDirectory='%~dp0'; $s.Description='Cortexia TV yayin sunucusu'; $s.Save()"
echo   Eklendi. Simdi sunucuyu bir kez baslatiyorum...
start "" wscript.exe "%~dp0sessiz-baslat.vbs"
echo.
echo   Bitti. Cortexia > TV artik dogrudan calisir.
pause
