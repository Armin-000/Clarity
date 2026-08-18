@echo off
setlocal
cd /d "%~dp0"
set "PORT=8768"

rem Ako na portu radi starija Clarity kopija, ugasi je prije pokretanja 3.5.2.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$u='http://127.0.0.1:%PORT%/clarity-health.json'; try { $h=Invoke-RestMethod -Uri $u -TimeoutSec 1; if ($h.app -eq 'Clarity Accessibility') { $c=Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 300 } } } catch {}" >nul 2>&1

start "Clarity 3.5.2 server" /min cmd /c "set CLARITY_PORT=%PORT%&& node server.mjs"
ping 127.0.0.1 -n 3 > nul
start "" "http://127.0.0.1:%PORT%/?v=3.5.2"
endlocal
