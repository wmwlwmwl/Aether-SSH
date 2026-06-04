$wailsJson = Get-Content "wails.json" | ConvertFrom-Json
$version = $wailsJson.info.productVersion

Write-Host "开始执行迭代打包任务，当前 AetherSSH 版本: V$version" -ForegroundColor Cyan

$basePath = "C:\Users\Angus\Desktop\Antigravity\SSH"
$exePath = "$basePath\exe"
$portablePath = "$basePath\Portable"
$nsisPath = "$basePath\Packaging_Tools\nsis\nsis-3.08"
$goPath = "C:\Users\Angus\Desktop\Antigravity\SSH\Source_Codes\Aether-Source\go\bin"

if (!(Test-Path $exePath)) { New-Item -ItemType Directory -Path $exePath | Out-Null }
if (!(Test-Path $portablePath)) { New-Item -ItemType Directory -Path $portablePath | Out-Null }

# 临时注入必须的全局路径 (NSIS与Go环境)
$env:PATH = "$goPath;$nsisPath;" + $env:PATH

Write-Host "`n[1/2] 正在编译便携版 (Portable)..." -ForegroundColor Yellow
wails build -clean -upx
if ($LASTEXITCODE -ne 0) { Write-Error "便携版编译失败"; exit 1 }

$portableDest = "$portablePath\Aether_Portable_V$version.exe"
Write-Host "输出便携版到: $portableDest" -ForegroundColor Green
Copy-Item -Path "build\bin\Aether.exe" -Destination $portableDest

Write-Host "`n[2/2] 正在编译安装包版 (Setup)..." -ForegroundColor Yellow
wails build -clean -nsis -upx
if ($LASTEXITCODE -ne 0) { Write-Error "安装包版编译失败"; exit 1 }

$setupDest = "$exePath\Aether_Setup_V$version.exe"
Write-Host "输出安装包到: $setupDest" -ForegroundColor Green
Copy-Item -Path "build\bin\Aether-amd64-installer.exe" -Destination $setupDest

Write-Host "`n打包任务圆满完成！(版本迭代输出，不覆盖旧文件)" -ForegroundColor Cyan
