@echo off
chcp 65001 >nul
echo worker.js を停止します...

wmic process where "commandline like '%%worker.js%%'" get processid /value 2>nul | find "ProcessId=" > "%TEMP%\wpid.txt" 2>nul

set FOUND=0
for /f "tokens=2 delims==" %%a in (%TEMP%\wpid.txt) do (
    set PID=%%a
    set FOUND=1
)
del "%TEMP%\wpid.txt" 2>nul

if "%FOUND%"=="1" (
    taskkill /F /PID %PID% >nul 2>&1
    echo 停止しました（PID: %PID%）
) else (
    echo worker.js は起動していません
)
pause
