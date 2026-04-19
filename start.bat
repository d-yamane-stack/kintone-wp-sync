@echo off
chcp 65001 > nul
echo コンテンツ自動運用システムを起動中...

start "■ server.js (port 3000)" cmd /k "cd /d "%~dp0" && echo [server] 起動中... && node server.js || (echo. && echo [ERROR] server.js の起動に失敗しました && pause)"
timeout /t 3 /nobreak > nul

start "■ worker.js" cmd /k "cd /d "%~dp0" && echo [worker] 起動中... && node worker.js || (echo. && echo [ERROR] worker.js の起動に失敗しました && pause)"
timeout /t 3 /nobreak > nul

start "■ webapp (Next.js)" cmd /k "cd /d "%~dp0webapp" && echo [webapp] 起動中... && npm run dev || (echo. && echo [ERROR] webapp の起動に失敗しました && pause)"
timeout /t 5 /nobreak > nul

start "" "http://localhost:3001"

echo 起動完了。
