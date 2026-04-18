@echo off
echo コンテンツ自動運用システムを起動中...

start "server" cmd /k "cd /d %~dp0 && node server.js"
timeout /t 2 /nobreak > nul

start "worker" cmd /k "cd /d %~dp0 && node worker.js"
timeout /t 2 /nobreak > nul

start "webapp" cmd /k "cd /d %~dp0webapp && npm run dev"

echo.
echo 起動完了！ブラウザで http://localhost:3000 (webapp は 3001 前後) を開いてください。
timeout /t 5
