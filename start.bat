@echo off
start "server.js" "%~dp0_run_server.bat"
timeout /t 3 /nobreak > nul
start "worker.js" "%~dp0_run_worker.bat"
timeout /t 3 /nobreak > nul
start "webapp" "%~dp0_run_webapp.bat"
timeout /t 10 /nobreak > nul
start "" "http://localhost:3001"
