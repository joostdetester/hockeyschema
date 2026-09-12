@echo off
cd /d "%~dp0"
echo LISA API-proxy starten...
start "LISA API proxy (sluit dit venster om te stoppen)" cmd /k node lisa-api-proxy.js
timeout /t 2 /nobreak >nul
start "" "http://localhost:8787/lisa-api.html"
