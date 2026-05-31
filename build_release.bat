@echo off
echo ==============================================
echo        Aether SSH Automated Builder
echo ==============================================

if "%~1"=="" (
    set /p VERSION="Enter release version (e.g. V1.0.1): "
) else (
    set "VERSION=%~1"
)

if "%VERSION%"=="" (
    echo [ERROR] Version cannot be empty!
    pause
    exit /b 1
)

echo [1/3] Configuring Go environment...
set "PATH=C:\Users\Angus\Desktop\Antigravity\SSH\Source_Codes\Aether-Source\go\bin;%PATH%"

echo [2/3] Building executable using Wails...
cd /d "%~dp0"
call wails build -clean -upx

if not exist "build\bin\Aether.exe" (
    echo [ERROR] Build failed, Aether.exe not found.
    if "%~1"=="" pause
    exit /b 1
)

echo [3/3] Archiving executable...
set "OUTPUT_DIR=C:\Users\Angus\Desktop\Antigravity\SSH\exe"
if not exist "%OUTPUT_DIR%" (
    mkdir "%OUTPUT_DIR%"
)

copy /y "build\bin\Aether.exe" "%OUTPUT_DIR%\Aether_%VERSION%.exe" >nul

echo.
echo ==============================================
echo   SUCCESS! 
echo   File saved to: %OUTPUT_DIR%\Aether_%VERSION%.exe
echo ==============================================
if "%~1"=="" pause
