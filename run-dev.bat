@echo off
echo ========================================================
echo.
echo Starting Aether Hot-Reload Development Mode...
echo.
echo [Features]
echo 1. No need to restart when UI code is modified!
echo 2. The UI will refresh instantly.
echo 3. Press Ctrl + C to stop.
echo.
echo ========================================================
echo.

rem Setup temporary environment variables for Go compiler
set PATH=c:\Users\Angus\Desktop\Antigravity\SSH\Source_Codes\Aether-Source\go\bin;%PATH%

rem Start Wails dev server
wails dev

pause
